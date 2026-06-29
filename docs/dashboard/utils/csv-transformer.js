// Transform CSV rows to registration documents for Firestore

const parseDate = (dateStr) => {
  if (!dateStr) return null;
  try {
    // Seconds are optional (some exports use HH:MM only).
    const parts = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!parts) return null;
    const [, day, month, year, hours, minutes, seconds] = parts;
    return new Date(year, month - 1, day, hours, minutes, seconds || 0);
  } catch {
    return null;
  }
};

// Split a single full-name field into first / rest-as-last.
const splitName = (full) => {
  const parts = (full || '').trim().split(/\s+/).filter(Boolean);
  return { firstName: parts.shift() || '', lastName: parts.join(' ') };
};

const normalizePhone = (phone) => {
  if (!phone) return '';
  let digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  // Convert international Israeli prefix (972...) to local format (0...)
  if (digits.startsWith('972')) digits = '0' + digits.slice(3);
  // Restore the leading zero stripped by spreadsheets (Israeli numbers are 10 digits, "0..")
  else if (digits[0] !== '0') digits = '0' + digits;
  return digits;
};

export const transformCSVRowToRegistration = (row, resolvedReferrer) => {
  // Support two export layouts: the original (Timestamp / split name / התפקדות)
  // and the newer one (תאריך / single שם / התפקדות למפלגה).
  const ts = parseDate(row['Timestamp'] || row['תאריך']);
  const phone = normalizePhone(row['טלפון'] || '');
  const email = (row['email'] || row['אימייל'] || '').trim();
  const idNumber = (row['תעודת זהות'] || '').toString().trim();

  let firstName = row['שם פרטי'] || '';
  let lastName = row['שם משפחה'] || '';
  if (!firstName && !lastName && row['שם']) {
    ({ firstName, lastName } = splitName(row['שם']));
  }

  const registeredVal = row['התפקדות'] || row['התפקדות למפלגה'] || '';

  const reg = {
    city: row['יישוב'] || '',
    firstName: firstName,
    lastName: lastName,
    phone: phone,
    referrer: resolvedReferrer || row['referrer'] || '', // Matched referrer code
    registered: registeredVal.includes('התפקד'), // "התפקד/ה" or "כבר התפקד/ה"
    source: row['איך הגעת'] || row['מקור'] || '', // Free-text origin answer
    ts: ts,
    importedAt: null, // Will be set to serverTimestamp() on write
    _rowIndex: row._rowIndex,
  };

  // Only include optional PII fields when actually present
  if (email) reg.email = email;
  if (idNumber) reg.idNumber = idNumber;

  return reg;
};

export const validateRegistration = (reg) => {
  const errors = [];
  if (!reg.firstName?.trim()) errors.push('Missing name');
  if (!reg.ts) errors.push('Invalid timestamp');
  return errors;
};
