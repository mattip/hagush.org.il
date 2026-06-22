// ─────────────────────────────────────────────────────────────────────────
// seed_and_backfill.gs — one-time setup, run from the Apps Script editor.
//
// Replaces the local Node/npm tooling: everything runs inside Apps Script,
// reusing the exact phoneCanon_/phoneLast3_/resolveReferrer_/weekKey_ helpers
// from firestore_mirror.gs — so historical and live data canonicalize
// IDENTICALLY (no reimplementation, parity guaranteed). Zero npm anywhere.
//
// Idempotent: deterministic doc ids + updateDocument upsert → re-running is safe.
// Resumable: backfill stores progress in Script Properties to respect the
// 6-minute execution limit; just run the same function again to continue.
//
// Run order (once):
//   1) seedReferenceData()          → default group, 25 influencers, 2 admins
//   2) backfillJoins()              → JOIN sheet  → registrations  (resume-safe)
//   3) backfillQuestions()          → QUESTIONS   → questions
//   4) backfillEvents()             → EVENTS      → interactions
//   5) verifyCounts()               → logs Firestore vs Sheet counts
// ─────────────────────────────────────────────────────────────────────────

const BACKFILL_BATCH = 300;   // rows per run; stays well under the 6-min limit

// ── 1. Seed reference data ────────────────────────────────────────────────
function seedReferenceData() {
  const fs  = getFirestore_();
  const now = new Date();
  const gid = defaultGroupId_();

  fs.updateDocument('groups/' + gid, {
    id: gid, name: 'כללי (ברירת מחדל)', referrerCode: null, active: true, createdAt: now
  });

  REFERRERS.forEach(function (name, i) {
    const id = 'infl_' + (i + 1);
    fs.updateDocument('influencers/' + id, {
      id: id, name: name, referrerCode: String(i + 1),
      groupId: gid, active: true, createdAt: now
    });
  });

  ['fromlior@gmail.com', 'matti.picus@gmail.com'].forEach(function (email) {
    fs.updateDocument('roles/' + email, {
      role: 'admin', scope: 'full', groupId: null, influencerId: null, active: true
    });
  });

  // refresh the resolver cache so the new docs are visible immediately
  CacheService.getScriptCache().remove('refmap_v1');
  Logger.log('seeded: 1 group, ' + REFERRERS.length + ' influencers, 2 admins');
}

// ── Sheet → rows-as-objects (header-mapped) ───────────────────────────────
function readSheet_(sheetId) {
  const values = SpreadsheetApp.openById(sheetId).getActiveSheet().getDataRange().getValues();
  if (values.length < 2) return { header: [], rows: [] };
  const header = values[0].map(function (h) { return String(h).trim(); });
  return { header: header, rows: values.slice(1) };
}
function cell_(header, row, name) {
  const i = header.indexOf(name);
  return i < 0 ? '' : row[i];
}

// Resolve the Sheet's referrer NAME (output of referrerName) → influencer/group.
function getNameMap_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('namemap_v1');
  if (cached) return JSON.parse(cached);
  const fs = getFirestore_();
  const map = {};
  function id(d) { return String(d.name).split('/').pop(); }
  try {
    fs.getDocuments('groups').forEach(function (d) {
      const o = d.obj || d.fields || {}; if (o.name) map[o.name] = { influencerId: null, groupId: id(d) };
    });
  } catch (e) { Logger.log('namemap groups: ' + e); }
  try {
    fs.getDocuments('influencers').forEach(function (d) {
      const o = d.obj || d.fields || {};
      if (o.name) map[o.name] = { influencerId: id(d), groupId: o.groupId || defaultGroupId_() };
    });
  } catch (e) { Logger.log('namemap influencers: ' + e); }
  cache.put('namemap_v1', JSON.stringify(map), 3600);
  return map;
}
function resolveByName_(name) {
  const v = String(name == null ? '' : name).trim();
  if (v) { const hit = getNameMap_()[v]; if (hit) return hit; }
  return { influencerId: null, groupId: defaultGroupId_() };
}

function toIso_(v) {
  const d = (v instanceof Date) ? v : new Date(v);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

// ── Generic resumable driver ──────────────────────────────────────────────
function runBackfill_(propKey, sheetId, mapRowToDoc) {
  const fs = getFirestore_();
  const props = PropertiesService.getScriptProperties();
  const start = parseInt(props.getProperty(propKey) || '0', 10);   // rows already done
  const { header, rows } = readSheet_(sheetId);
  const end = Math.min(start + BACKFILL_BATCH, rows.length);

  for (let i = start; i < end; i++) {
    const built = mapRowToDoc(header, rows[i]);
    if (built) fs.updateDocument(built.path, built.fields);   // upsert, idempotent
  }
  props.setProperty(propKey, String(end));
  Logger.log(propKey + ': wrote rows ' + start + '..' + (end - 1) + ' of ' + rows.length);
  if (end < rows.length) Logger.log('  → not done; run again to continue.');
  else Logger.log('  → COMPLETE (' + rows.length + ' rows).');
}

// ── 2/3/4. Backfills ──────────────────────────────────────────────────────
function backfillJoins() {
  runBackfill_('bf_join', JOIN_SHEET_ID, function (h, row) {
    const tsIso = toIso_(cell_(h, row, 'Timestamp'));
    const tel   = cell_(h, row, 'tel');
    const canon = phoneCanon_(tel);
    const source = cell_(h, row, 'איך הגעת');
    const ref = resolveByName_(cell_(h, row, 'referrer'));
    const id = 'sheets_' + sha256Hex_([tsIso, canon, source].join('|')).slice(0, 32);
    return { path: 'registrations/' + id, fields: {
      name: [cell_(h, row, 'first_name'), cell_(h, row, 'family_name')].filter(String).join(' ').trim(),
      phoneCanon: canon, phoneLast3: phoneLast3_(tel),
      email: cell_(h, row, 'email') || '', city: cell_(h, row, 'home') || '', source: source || '',
      influencerId: ref.influencerId, groupId: ref.groupId,
      sessionId: null, dailyId: null,
      partyRegistered: String(cell_(h, row, 'registered')).indexOf('התפקד') === 0,
      isTest: false, isDuplicate: false, isSuspicious: false,
      origin: 'sheets', sourceId: id, createdAt: new Date(tsIso || Date.now())
      // NOTE: id_num column is intentionally never read/written.
    }};
  });
}

function backfillQuestions() {
  runBackfill_('bf_question', QUESTIONS_SHEET_ID, function (h, row) {
    const tsIso = toIso_(cell_(h, row, 'Timestamp'));
    const tel   = cell_(h, row, 'טלפון');
    const q     = cell_(h, row, 'שאלה');
    const id = 'sheets_' + sha256Hex_([tsIso, phoneCanon_(tel), q].join('|')).slice(0, 32);
    return { path: 'questions/' + id, fields: {
      candidate: cell_(h, row, 'מועמד.ת') || '', name: cell_(h, row, 'שם') || '',
      phoneCanon: phoneCanon_(tel), phoneLast3: phoneLast3_(tel),
      email: cell_(h, row, 'אימייל') || '', city: cell_(h, row, 'יישוב') || '',
      partyRegistered: String(cell_(h, row, 'התפקדות')).indexOf('התפקד') === 0,
      question: q || '', origin: 'sheets', sourceId: id, createdAt: new Date(tsIso || Date.now())
    }};
  });
}

function backfillEvents() {
  runBackfill_('bf_event', EVENTS_SHEET_ID, function (h, row) {
    const tsIso = toIso_(cell_(h, row, 'server_time'));
    const cid   = cell_(h, row, 'candidateId');
    const cts   = cell_(h, row, 'client_ts');
    const id = 'sheets_' + sha256Hex_([tsIso, cid, cts].join('|')).slice(0, 32);
    const ts = new Date(tsIso || Date.now());
    return { path: 'interactions/' + id, fields: {
      type: 'candidate_open', sessionId: 'sheets', dailyId: 'sheets',
      page: 'candidates', ts: ts, weekKey: weekKey_(ts),
      detail: { candidateId: cid || '', candidateName: cell_(h, row, 'candidateName') || '', via: cell_(h, row, 'via') || '' },
      origin: 'sheets'
    }};
  });
}

// Reset progress to re-run a backfill from scratch (rows upsert, so safe).
function resetBackfillProgress() {
  const p = PropertiesService.getScriptProperties();
  ['bf_join', 'bf_question', 'bf_event'].forEach(function (k) { p.deleteProperty(k); });
  Logger.log('backfill progress reset.');
}

// ── 5. Verify ─────────────────────────────────────────────────────────────
function verifyCounts() {
  const join = readSheet_(JOIN_SHEET_ID).rows.length;
  const ques = readSheet_(QUESTIONS_SHEET_ID).rows.length;
  Logger.log('JOIN sheet rows: ' + join + ' | QUESTIONS sheet rows: ' + ques);
  Logger.log('Compare against Firestore registrations/questions counts in the console.');
}
