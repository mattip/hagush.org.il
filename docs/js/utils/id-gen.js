// Pure ID generation utilities (no side effects)

/**
 * Generate a cryptographically-sound UUID or fallback sequence.
 * @returns {string} UUID v4 or fallback ID
 */
export const generateUuid = () => {
  try {
    if (crypto.randomUUID) return crypto.randomUUID();
  } catch (e) {
    /* fallback */
  }
  return "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
};

