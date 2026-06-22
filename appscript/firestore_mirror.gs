// ─────────────────────────────────────────────────────────────────────────
// firestore_mirror.gs — ADDITIVE Firestore mirror for the join-form backend.
//
// This file NEVER runs on its own and NEVER touches the Sheet writes. The
// existing handlers in join_form_appscript.js call the mirror* functions below
// AFTER their appendRow(), each wrapped in try/catch, so any Firestore failure
// is logged and swallowed — the Sheet write and the user response are unaffected.
//
// Requires the "FirestoreGoogleAppsScript" library (FirestoreApp), added via
//   Apps Script editor → Libraries →  1VUSl4b1r1eoNcRWotZM3e87ygkxvXltOgyDZhixqncz9lQ3MjfT1iKj
// and these Script Properties (Project Settings → Script properties):
//   FIRESTORE_PROJECT_ID   = hagush-org-il
//   FIRESTORE_CLIENT_EMAIL = <service-account>@hagush-org-il.iam.gserviceaccount.com
//   FIRESTORE_PRIVATE_KEY  = -----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
//   PHONE_SALT             = <long random string, SAME value used by the backfill>
//   DEFAULT_GROUP_ID       = <group doc id used until influencers are mapped>
// The service-account JSON is NEVER committed to git — it lives only here.
// ─────────────────────────────────────────────────────────────────────────

// ── Firestore client (lazy) ──────────────────────────────────────────────
function getFirestore_() {
  const p = PropertiesService.getScriptProperties();
  const email = p.getProperty('FIRESTORE_CLIENT_EMAIL');
  const key   = (p.getProperty('FIRESTORE_PRIVATE_KEY') || '').replace(/\\n/g, '\n');
  const proj  = p.getProperty('FIRESTORE_PROJECT_ID');
  if (!email || !key || !proj) throw new Error('Firestore mirror not configured');
  return FirestoreApp.getFirestore(email, key, proj);
}

function defaultGroupId_() {
  return PropertiesService.getScriptProperties().getProperty('DEFAULT_GROUP_ID') || 'default';
}

// ── Phone normalization / privacy ────────────────────────────────────────
function normalizePhone_(raw) {
  let s = String(raw || '').replace(/\D/g, '');
  if (!s) return '';
  if (s.indexOf('972') === 0)       { /* already international */ }
  else if (s.charAt(0) === '0')     { s = '972' + s.slice(1); }
  else if (s.length === 9)          { s = '972' + s; }   // missing leading 0
  return s;
}

function sha256Hex_(str) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

// Salted, one-way. Same salt + same algorithm as the backfill → dedup works
// across live and historical rows.
function phoneCanon_(raw) {
  const n = normalizePhone_(raw);
  if (!n) return '';
  const salt = PropertiesService.getScriptProperties().getProperty('PHONE_SALT') || '';
  return sha256Hex_(salt + ':' + n);
}
function phoneLast3_(raw) {
  const n = normalizePhone_(raw);
  return n ? n.slice(-3) : '';
}

// ── Referrer resolver (int OR string) ────────────────────────────────────
// Builds { codeString -> { influencerId, groupId } } from the influencers and
// groups collections; cached 1h to avoid a read on every submission.
function getReferrerMap_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('refmap_v1');
  if (cached) return JSON.parse(cached);

  const fs = getFirestore_();
  const map = {};
  function docId(d) { return String(d.name).split('/').pop(); }

  // groups: a group can own its own referrer link (influencerId null)
  try {
    fs.getDocuments('groups').forEach(function (d) {
      const o = d.obj || d.fields || {};
      if (o.referrerCode !== undefined && o.referrerCode !== null && o.active !== false) {
        map[String(o.referrerCode)] = { influencerId: null, groupId: docId(d) };
      }
    });
  } catch (e) { Logger.log('refmap groups: ' + e); }

  // influencers: link sets influencerId + its groupId (overrides a group code clash)
  try {
    fs.getDocuments('influencers').forEach(function (d) {
      const o = d.obj || d.fields || {};
      if (o.referrerCode !== undefined && o.referrerCode !== null && o.active !== false) {
        map[String(o.referrerCode)] = { influencerId: docId(d), groupId: o.groupId || defaultGroupId_() };
      }
    });
  } catch (e) { Logger.log('refmap influencers: ' + e); }

  cache.put('refmap_v1', JSON.stringify(map), 3600);
  return map;
}

function resolveReferrer_(rawCode) {
  const code = String(rawCode == null ? '' : rawCode).trim();
  if (code) {
    const hit = getReferrerMap_()[code];
    if (hit) return hit;
  }
  return { influencerId: null, groupId: defaultGroupId_() };  // decision #9: default group
}

// ── Deterministic ids (idempotent retries) ───────────────────────────────
function regDocId_(tsIso, phoneCanon, source) {
  return 'live_' + sha256Hex_([tsIso, phoneCanon, source].join('|')).slice(0, 32);
}

// ── Mirror writers (called from join_form_appscript.js) ───────────────────
// Live JOIN submission → registrations  (no id_num, no raw phone)
function mirrorRegistration_(data, serverDate) {
  const fs    = getFirestore_();
  const tsIso = (serverDate || new Date()).toISOString();
  const ref   = resolveReferrer_(data.referrer);
  const canon = phoneCanon_(data.phone);
  const docId = regDocId_(tsIso, canon, data.source || '');

  const fields = {
    name:            ((data.firstName || '') + ' ' + (data.lastName || '')).trim(),
    phoneCanon:      canon,
    phoneLast3:      phoneLast3_(data.phone),
    email:           data.email || '',
    city:            data.city || '',
    source:          data.source || '',
    influencerId:    ref.influencerId,
    groupId:         ref.groupId,
    sessionId:       data.sessionId || null,
    dailyId:         data.dailyId || null,
    partyRegistered: data.registered === 'yes',
    isTest:          false,
    isDuplicate:     false,
    isSuspicious:    false,
    origin:          'appscript-live',
    sourceId:        docId,
    createdAt:       new Date()
  };
  // updateDocument with a deterministic id → upsert (idempotent on retry).
  fs.updateDocument('registrations/' + docId, fields);
}

// Live QUESTION submission → questions  (no id_num)
function mirrorQuestion_(data, serverDate) {
  const fs    = getFirestore_();
  const tsIso = (serverDate || new Date()).toISOString();
  const docId = 'live_' + sha256Hex_([tsIso, phoneCanon_(data.phone), data.question || ''].join('|')).slice(0, 32);
  const fields = {
    candidate:       data.candidate || '',
    name:            data.name || '',
    phoneCanon:      phoneCanon_(data.phone),
    phoneLast3:      phoneLast3_(data.phone),
    email:           data.email || '',
    city:            data.city || '',
    partyRegistered: data.registered === 'yes',
    question:        data.question || '',
    origin:          'appscript-live',
    sourceId:        docId,
    createdAt:       new Date()
  };
  fs.updateDocument('questions/' + docId, fields);
}

// Live candidate-popup open → interactions (type: candidate_open), anonymous
function mirrorCandidateOpen_(data, serverDate) {
  const fs   = getFirestore_();
  const now  = serverDate || new Date();
  const fields = {
    type:      'candidate_open',
    sessionId: data.sessionId || 'appscript',
    dailyId:   data.dailyId || 'appscript',
    page:      'candidates',
    ts:        now,
    weekKey:   weekKey_(now),
    detail:    { candidateId: data.candidateId || '', candidateName: data.candidateName || '', via: data.via || '' }
  };
  fs.createDocument('interactions', fields);   // auto id; append-only
}

// ISO week key e.g. "2026-W26" (matches the nightly aggregator)
function weekKey_(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return date.getUTCFullYear() + '-W' + ('0' + week).slice(-2);
}
