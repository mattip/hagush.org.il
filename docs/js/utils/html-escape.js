// HTML string utilities (escaping, manipulation)

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} str - String to escape
 * @returns {string} Escaped HTML-safe string
 */
const escapeHtml = (str) =>
  String(str ?? "").replace(/[&<>"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  }[char]));

/**
 * Strip honorific titles from person names (Dr., Prof., etc.).
 * @param {string} name - Full name with possible honorifics
 * @returns {string} Name without leading honorifics
 */
const stripHonorific = (name) =>
  String(name || "")
    .replace(/^(ד"ר|פרופ'?|ח"כ|עו"ד|רב\s+|ד"ר\s+)\s*/u, "")
    .trim();

/**
 * Create HTML recommendation text with linked candidate names.
 * Finds all candidate names in the text and converts them to links.
 * @param {string} text - Recommendation text
 * @param {Array<Object>} allPeople - Array of {id, name} objects
 * @returns {string} HTML with name links embedded
 */
const linkRecommendation = (text, allPeople) => {
  let result = escapeHtml(text);
  for (const person of allPeople) {
    const fullName = escapeHtml(person.name);
    const shortName = escapeHtml(stripHonorific(person.name));
    // Build list of name variants, longest first to avoid partial replacements
    const variants = [...new Set([fullName, shortName])]
      .sort((a, b) => b.length - a.length);
    for (const variant of variants) {
      if (!variant) continue;
      result = result.replace(
        new RegExp(variant, "g"),
        `<a href="#" class="pi-rec-link" data-person-id="${person.id}">${variant} <span class="pi-rec-show">הצג</span></a>`,
      );
    }
  }
  return result;
};

export { escapeHtml, stripHonorific, linkRecommendation };
