// To update: go to https://script.google.com/home/project
//

// ── Configuration ────────────────────────────────────────────────
const SECRET_TOKEN    = 'NachshavBaot2026';   // change if you like
const RATE_LIMIT_MAX  = 20;   // max submissions per window
const RATE_LIMIT_SECS = 3600; // 1 hour

// Join form
const JOIN_SHEET_ID      = '1aqY3Mi045S0oD6cCuPaPhto5kWWZd_MM6mnCb6lvwbQ';
// Questions form
const QUESTIONS_SHEET_ID = '1USJ73gtWzgZm5tXczp0S-EFn34mbxIoS8AfbKd7XX6k';


// ── Column headers ────────────────────────────────────────────────
const JOIN_COLUMNS = [
  'Timestamp', 'איך הגעת', 'first_name', 'family_name',
  'tel', 'registered', 'home', 'id_num', 'referrer', 'email',
];

// referrer index (?referrer=N, 1-based) -> name. Edit/extend this list as needed.
const REFERRERS = [
  'נופר בן צור',          //  1
  'פולה קויש',            //  2
  'דורית זמיר',           //  3
  'ציון רקנטי',           //  4
  'אורלי באר שגב',        //  5
  'צור משעל',             //  6
  'רותי בן יקר',          //  7
  'אילון ורטהיים',        //  8
  'עידית אלכסנדרוביץ',    //  9
  'עמוס דורון',           // 10
  'צפי שומר',             // 11
  'דורי סלע',             // 12
  'שבתאי גבאי',           // 13
  'ראובן קוסט',           // 14
  'נגה בר-און',           // 15
  'אוסנת נויה פריש',      // 16
  'טל קורנט',             // 17
  'ליאור צ’רבינסקי',      // 18
  'לילך אברמוביץ',        // 19
  'יפתח שטיין',           // 20
  'גיא אדוט',             // 21
  'בשמת אילת בן יעקב',    // 22
  'דפנה מילר',            // 23
  'נורית מלניק',          // 24
  'הילה גולן',            // 25
];

function editDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({length: m + 1}, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1]
                 : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function referrerName(idx, source) {
  const n = parseInt(idx, 10);
  if (n >= 1 && n <= REFERRERS.length) return REFERRERS[n - 1];

  // idx is invalid — try fuzzy-matching source against the REFERRERS list
  const candidate = (source || idx || '').trim();
  if (candidate) {
    let best = null, bestDist = 3;   // accept only ≤ 2 edits
    for (const name of REFERRERS) {
      const d = editDistance(candidate, name);
      if (d < bestDist) { bestDist = d; best = name; }
    }
    if (best) return best;
  }

  return candidate;   // no close match: keep raw value so nothing is lost
}
const QUESTION_COLUMNS = [
  'Timestamp', 'מועמד.ת', 'שם', 'טלפון', 'יישוב', 'התפקדות', 'שאלה',
];

// ── Rate limiting via PropertiesService ──────────────────────────
function checkRateLimit() {
  const props = PropertiesService.getScriptProperties();
  const now   = Math.floor(Date.now() / 1000);

  let window = parseInt(props.getProperty('rl_window') || '0');
  let count  = parseInt(props.getProperty('rl_count')  || '0');

  if (now - window > RATE_LIMIT_SECS) {
    window = now;
    count  = 0;
  }

  count++;
  props.setProperties({ rl_window: String(window), rl_count: String(count) });

  return count <= RATE_LIMIT_MAX;
}

// ── Helper: append a row, creating a bold header row if empty ─────
function appendRow(sheetId, columns, values) {
  const sheet = SpreadsheetApp.openById(sheetId).getActiveSheet();
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(columns);
    sheet.getRange(1, 1, 1, columns.length).setFontWeight('bold');
  }
  sheet.appendRow(values);
}

// ── Main POST handler ─────────────────────────────────────────────
function doPost(e) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  function respond(ok, message) {
    output.setContent(JSON.stringify({ ok, message }));
    return output;
  }

  // Parse body
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (_) {
    return respond(false, 'invalid request');
  }

  // 1. Token check
  if (data._token !== SECRET_TOKEN) {
    return respond(false, 'forbidden');
  }

  // 2. Honeypot — field named "website" should be empty (filled by bots)
  if (data.website) {
    return respond(true, 'received');  // silently accept
  }

  // 3. Rate limit
  if (!checkRateLimit()) {
    return respond(false, 'too many requests');
  }

  // 4. Route by form type
  const type = data.formType || 'join';
  try {
    if (type === 'question') {
      return handleQuestion(data, respond);
    }
    return handleJoin(data, respond);
  } catch (err) {
    Logger.log('Sheet error: ' + err.toString());
    return respond(false, 'sheet error');
  }
}

// ── Join form 
function handleJoin(data, respond) {
  const required = ['firstName', 'lastName', 'phone', 'registered', 'source'];
  for (const field of required) {
    if (!data[field] || String(data[field]).trim() === '') {
      return respond(false, `missing field: ${field}`);
    }
  }

  appendRow(JOIN_SHEET_ID, JOIN_COLUMNS, [
    new Date(),
    data.source      || '',
    data.firstName   || '',
    data.lastName    || '',
    data.phone       || '',
    data.registered === 'yes' ? 'התפקד/ה' : 'לא התפקד/ה',
    data.city        || '',
    data.idNumber    || '',
    referrerName(data.referrer, data.source),
    data.email       || '',
  ]);

  return respond(true, 'תודה! הפרטים התקבלו בהצלחה');
}

// ── Questions form 
function handleQuestion(data, respond) {
  const required = ['name', 'phone', 'question'];
  for (const field of required) {
    if (!data[field] || String(data[field]).trim() === '') {
      return respond(false, `missing field: ${field}`);
    }
  }

  appendRow(QUESTIONS_SHEET_ID, QUESTION_COLUMNS, [
    new Date(),
    data.candidate   || '',
    data.name        || '',
    data.phone       || '',
    data.city        || '',
    data.registered === 'yes' ? 'התפקד/ה' : 'לא התפקד/ה',
    data.question    || '',
  ]);

  return respond(true, 'תודה! השאלה התקבלה');
}

// ── Verify endpoint is live ───────────────────────────────────────
function doGet() {
  return ContentService
    .createTextOutput('Form endpoint is live.')
    .setMimeType(ContentService.MimeType.TEXT);
}

// ── Manual tests ──────────────────────────────────────────────────
function test_join() {
  const fakeEvent = { postData: { contents: JSON.stringify({
    _token: SECRET_TOKEN, website: '', source: 'whatsapp',
    firstName: 'ישראל', lastName: 'ישראלי', phone: '050-0000000',
    registered: 'yes', city: 'תל אביב', idNumber: '', email: 'test@example.com',
  }) } };
  Logger.log(doPost(fakeEvent).getContent());
}

function test_question() {
  const fakeEvent = { postData: { contents: JSON.stringify({
    _token: SECRET_TOKEN, formType: 'question', website: '',
    candidate: 'נעמה לזימי', name: 'ישראל ישראלי', phone: '050-0000000',
    city: 'תל אביב', registered: 'no', question: 'מה עמדתך בנושא הדיור?',
  }) } };
  Logger.log(doPost(fakeEvent).getContent());
}
