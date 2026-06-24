// Clipboard utilities

/**
 * Copy text to clipboard with fallback for non-HTTPS/Safari.
 * @param {string} text - Text to copy
 * @returns {Promise<void>}
 */
const copyToClipboard = (text) => {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }

  // execCommand fallback for Safari / non-HTTPS
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText =
    "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand("copy");
  } catch (e) {
    /* fallback failed */
  }
  document.body.removeChild(ta);
  return Promise.resolve();
};

export { copyToClipboard };
