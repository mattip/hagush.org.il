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

// (Alternative: to use one spreadsheet with two tabs instead of two
//  spreadsheets, set QUESTIONS_SHEET_ID = JOIN_SHEET_ID and change
//  getActiveSheet() below to getSheetByName('שאלות') for the questions.)

// ── Column headers ────────────────────────────────────────────────
const JOIN_COLUMNS = [
  'Timestamp', 'איך הגעת', 'שם פרטי', 'שם משפחה',
  'טלפון', 'התפקדות', 'יישוב', 'תעודת זהות',
];
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

// ── Join form (first spreadsheet) ─────────────────────────────────
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
  ]);

  return respond(true, 'תודה! הפרטים התקבלו בהצלחה');
}

// ── Questions form (second spreadsheet) ───────────────────────────
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
    registered: 'yes', city: 'תל אביב', idNumber: '',
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
