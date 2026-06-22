// ─────────────────────────────────────────────────────────────────────────
// nightly_aggregation.gs — Spark-tier roll-up (NO Cloud Functions).
//
// A time-driven Apps Script trigger reads the PRIOR DAY's raw telemetry
// (page_views + interactions) and registrations, computes distinct-count
// metrics + the within-visit funnel + conversions, and writes them to the
// `aggregates` collection BEFORE the 30-day Firestore TTL deletes the raw rows.
//
// Set up once: run createNightlyTrigger_() from the editor (authorize it).
//   → runs runNightlyAggregation() every day ~03:15 Asia/Jerusalem.
// Re-runnable for any day: runAggregationForDay('2026-06-21').
//
// Uses the same FirestoreApp library + Script Properties as firestore_mirror.gs.
// ─────────────────────────────────────────────────────────────────────────

const AGG_TZ = 'Asia/Jerusalem';

function createNightlyTrigger_() {
  // Remove any existing trigger for this handler first (idempotent setup).
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'runNightlyAggregation') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runNightlyAggregation')
    .timeBased().everyDays(1).atHour(3).nearMinute(15).inTimezone(AGG_TZ).create();
}

function runNightlyAggregation() {
  const y = new Date(Date.now() - 24 * 3600 * 1000);
  runAggregationForDay(Utilities.formatDate(y, AGG_TZ, 'yyyy-MM-dd'));
}

function runAggregationForDay(dayKey) {
  const fs    = getFirestore_();                       // from firestore_mirror.gs
  const start = new Date(dayKey + 'T00:00:00' + tzOffset_(dayKey));
  const end   = new Date(start.getTime() + 24 * 3600 * 1000);

  const pageViews    = queryRange_(fs, 'page_views', start, end);
  const interactions = queryRange_(fs, 'interactions', start, end);
  const regs         = queryRange_(fs, 'registrations', start, end, 'createdAt');

  // Bucket helper: keyFn returns the scope key ('all' | influencerId | groupId)
  function buildBucket() {
    return { sessions: {}, uniques: {}, pageViews: 0, funnel: {}, signups: 0, partyRegs: 0 };
  }
  const buckets = { total: { all: buildBucket() }, influencer: {}, group: {} };
  function bucket(scope, key) {
    if (!key) return null;
    if (!buckets[scope][key]) buckets[scope][key] = buildBucket();
    return buckets[scope][key];
  }
  function touchPV(b, d) {
    if (!b) return;
    b.pageViews++;
    if (d.sessionId) b.sessions[d.sessionId] = 1;
    if (d.dailyId)   b.uniques[d.dailyId] = 1;
  }
  function touchFunnel(b, d) {
    if (!b) return;
    const t = d.type || 'unknown';
    b.funnel[t] = b.funnel[t] || {};
    if (d.sessionId) b.funnel[t][d.sessionId] = 1;   // distinct sessions per step
  }

  pageViews.forEach(function (doc) {
    const d = docData_(doc);
    touchPV(buckets.total.all, d);
    touchPV(bucket('influencer', d.influencerId), d);
    touchPV(bucket('group', d.groupId), d);
  });
  interactions.forEach(function (doc) {
    const d = docData_(doc);
    touchFunnel(buckets.total.all, d);
    touchFunnel(bucket('influencer', d.influencerId), d);
    touchFunnel(bucket('group', d.groupId), d);
  });
  regs.forEach(function (doc) {
    const d = docData_(doc);
    [buckets.total.all, bucket('influencer', d.influencerId), bucket('group', d.groupId)]
      .forEach(function (b) { if (b) { b.signups++; if (d.partyRegistered) b.partyRegs++; } });
  });

  // Flatten + write one aggregate doc per (scope,key). Deterministic id → idempotent.
  ['total', 'influencer', 'group'].forEach(function (scope) {
    Object.keys(buckets[scope]).forEach(function (key) {
      const b = buckets[scope][key];
      const uniques  = Object.keys(b.uniques).length;
      const sessions = Object.keys(b.sessions).length;
      const funnel = {};
      Object.keys(b.funnel).forEach(function (t) { funnel[t] = Object.keys(b.funnel[t]).length; });

      const fields = {
        day:       dayKey,
        scope:     scope,
        key:       key,
        pageViews: b.pageViews,
        sessions:  sessions,
        uniques:   uniques,
        sessionsPerVisitor: uniques ? sessions / uniques : 0,
        signups:   b.signups,
        partyRegs: b.partyRegs,
        convVisitorToSignup: uniques ? b.signups / uniques : 0,
        funnel:    funnel,
        computedAt: new Date()
      };
      fs.updateDocument('aggregates/' + dayKey + '_' + scope + '_' + key, fields);
    });
  });

  Logger.log('aggregated ' + dayKey + ': pv=' + pageViews.length +
             ' int=' + interactions.length + ' regs=' + regs.length);
}

// ── helpers ──────────────────────────────────────────────────────────────
// Range query on a timestamp field. Needs a single-field index (auto-created).
function queryRange_(fs, path, start, end, field) {
  field = field || 'ts';
  try {
    return fs.query(path).where(field, '>=', start).where(field, '<', end).execute();
  } catch (e) {
    Logger.log('queryRange ' + path + ': ' + e);
    return [];
  }
}
function docData_(doc) { return doc.obj || doc.fields || doc; }

// Israel offset: +03:00 during DST (roughly late-Mar..late-Oct), else +02:00.
// Good enough for day-bucketing; refine if exact DST edges matter.
function tzOffset_(dayKey) {
  const m = parseInt(dayKey.split('-')[1], 10);
  return (m >= 4 && m <= 10) ? '+03:00' : '+02:00';
}
