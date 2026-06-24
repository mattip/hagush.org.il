// Pure formatting utilities (no side effects, no DOM)

/**
 * Escape HTML special characters to prevent XSS.
 * @param {*} input - Value to escape (coerced to string)
 * @returns {string} Escaped HTML-safe string
 */
const escapeHtml = (input) =>
  String(input ?? "").replace(/[&<>"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  }[char]));

/**
 * Format a percentage from numerator/denominator.
 * @param {number} numerator - Dividend
 * @param {number} denominator - Divisor
 * @returns {string} Formatted percentage (e.g., "42.5%")
 */
const formatPercentage = (numerator, denominator) =>
  denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 + "%" : "0%";

/**
 * Convert Firestore Timestamp or Date to human-relative time string (Hebrew).
 * @param {Date|Timestamp|null} date - Date to format
 * @returns {string} Relative time (e.g., "לפני 5 דק׳") or "—"
 */
const formatRelativeTime = (date) => {
  if (!date) return "—";

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return "לפני " + seconds + " שנ׳";
  if (seconds < 3600) return "לפני " + Math.floor(seconds / 60) + " דק׳";
  if (seconds < 86400) return "לפני " + Math.floor(seconds / 3600) + " שע׳";
  return "לפני " + Math.floor(seconds / 86400) + " ימים";
};

/**
 * Convert Firestore Timestamp to Date object.
 * @param {Timestamp|Date|null} value - Firestore Timestamp or Date
 * @returns {Date|null}
 */
const toDate = (value) =>
  value && typeof value.toDate === "function"
    ? value.toDate()
    : value
      ? new Date(value)
      : null;

/**
 * Normalize phone number to international format (972...).
 * @param {string} rawPhone - Phone number in any format
 * @returns {string} Normalized phone (e.g., "972501234567") or ""
 */
const normalizePhone = (rawPhone) => {
  let digits = String(rawPhone || "").replace(/\D/g, "");

  if (!digits) return "";
  if (digits.indexOf("972") === 0) {
    /* already international */
  } else if (digits.charAt(0) === "0") {
    digits = "972" + digits.slice(1);
  } else if (digits.length === 9) {
    digits = "972" + digits;
  }

  return digits;
};

/**
 * Extract last 3 digits of normalized phone (for display masking).
 * @param {string} phone - Raw phone number
 * @returns {string} Last 3 digits (e.g., "567") or ""
 */
const getPhoneLast3 = (phone) => normalizePhone(phone).slice(-3);

/**
 * Calculate ISO week key for a date.
 * Format: "YYYY-Www" (e.g., "2026-W25")
 * @param {Date} date - Date to process
 * @returns {string} ISO week key
 */
const getIsoWeekKey = (date) => {
  const utcDate = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const dayOfWeek = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayOfWeek);

  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);

  return utcDate.getUTCFullYear() + "-W" + String(weekNumber).padStart(2, "0");
};

export {
  escapeHtml,
  formatPercentage,
  formatRelativeTime,
  toDate,
  normalizePhone,
  getPhoneLast3,
  getIsoWeekKey,
};
