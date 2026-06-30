// Shared utilities for referrer management.

export const sortByCode = (a, b) => {
  const numA = parseInt(a, 10);
  const numB = parseInt(b, 10);
  if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
  if (!isNaN(numA)) return -1;
  if (!isNaN(numB)) return 1;
  return a.localeCompare(b, "he");
};

/**
 * Builds a stable, human-ish group ID of the form `slug-hash`, e.g. "tzfi-h3k".
 * The slug is an ASCII-only reduction of the name (empty for Hebrew-only names,
 * in which case we fall back to "grp"); the 3-char suffix guarantees uniqueness
 * even when two groups share a name.
 *
 * @param {string} name
 * @returns {string}
 */
export const buildGroupId = (name) => {
  const slug = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const hash = Math.random().toString(36).slice(2, 5);
  return `${slug || "grp"}-${hash}`;
};
