// ── Configuration ────────────────────────────────────────────────
const SECRET_TOKEN    = 'NachshavBaot2026';   // change if you like
const SHEET_ID        = '1aqY3Mi045S0oD6cCuPaPhto5kWWZd_MM6mnCb6lvwbQ';
const RATE_LIMIT_MAX  = 20;   // max submissions per window
const RATE_LIMIT_SECS = 3600; // 1 hour

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

// ── Column headers ────────────────────────────────────────────────
const COLUMNS = [
  'Timestamp', 'איך הגעת', 'שם פרטי', 'שם משפחה',
  'טלפון', 'התפקדות', 'יישוב', 'תעודת זהות',
];

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

  // 4. Required field validation
  const required = ['firstName', 'lastName', 'phone', 'registered', 'source'];
  for (const field of required) {
    if (!data[field] || String(data[field]).trim() === '') {
      return respond(false, `missing field: ${field}`);
    }
  }

  // 5. Write to sheet
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();

    // Add header row if sheet is empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(COLUMNS);
      sheet.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold');
    }

    sheet.appendRow([
      new Date(),
      data.source      || '',
      data.firstName   || '',
      data.lastName    || '',
      data.phone       || '',
      data.registered === 'yes' ? 'התפקד/ה' : 'לא התפקד/ה',
      data.city        || '',
      data.idNumber    || '',
    ]);
  } catch (err) {
    Logger.log('Sheet error: ' + err.toString());
    return respond(false, 'sheet error');
  }

  return respond(true, 'תודה! הפרטים התקבלו בהצלחה');
}

// ── Verify endpoint is live ───────────────────────────────────────
function doGet() {
  return ContentService
    .createTextOutput('Join form endpoint is live.')
    .setMimeType(ContentService.MimeType.TEXT);
}

// ── Manual test ───────────────────────────────────────────────────
function test_post() {
  const fakeEvent = {
    postData: {
      contents: JSON.stringify({
        _token:     'NachshavBaot2026',
        website:    '',
        source:     'whatsapp',
        firstName:  'ישראל',
        lastName:   'ישראלי',
        phone:      '050-0000000',
        registered: 'yes',
        city:       'תל אביב',
        idNumber:   '',
      })
    }
  };
  const result = doPost(fakeEvent);
  Logger.log(result.getContent());
}
