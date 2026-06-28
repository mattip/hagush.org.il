// HTML string utilities (escaping, manipulation)

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} str - String to escape
 * @returns {string} Escaped HTML-safe string
 */
export const escapeHtml = (str) =>
  String(str ?? "").replace(/[&<>"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  }[char]));
