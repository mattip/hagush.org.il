// Pure formatting utilities (no side effects, no DOM)

/**
 * Convert Firestore Timestamp or Date to human-relative time string (Hebrew).
 * @param {Date|Timestamp|null} date - Date to format
 * @returns {string} Relative time (e.g., "לפני 5 דק׳") or "—"
 */
export const formatRelativeTime = (date) => {
  if (!date) return "—";
  const d = typeof date.toDate === "function" ? date.toDate() : date instanceof Date ? date : new Date(date);
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);

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
export const toDate = (value) =>
  value && typeof value.toDate === "function"
    ? value.toDate()
    : value
      ? new Date(value)
      : null;
