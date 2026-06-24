// Pure ID generation utilities (no side effects)

/**
 * Generate a cryptographically-sound UUID or fallback sequence.
 * @returns {string} UUID v4 or fallback ID
 */
const generateUuid = () => {
  try {
    if (crypto.randomUUID) return crypto.randomUUID();
  } catch (e) {
    /* fallback */
  }
  return "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
};

/**
 * Generate a request-unique ID for form submissions.
 * Format: prefix_timestamp_random
 * @param {string} prefix - ID prefix (e.g., "infl", "grp")
 * @returns {string}
 */
const generateRequestId = (prefix) =>
  prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export { generateUuid, generateRequestId };
