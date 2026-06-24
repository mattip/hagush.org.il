// Element content and display manipulation

/**
 * Set text content of element by ID.
 * @param {string} id - Element ID
 * @param {string} txt - Text to set (coerced to string, null/undefined → "")
 */
const setText = (id, txt) => {
  const el = document.getElementById(id);
  if (el) el.textContent = txt ?? "";
};

/**
 * Set inner HTML of element by ID.
 * @param {string} id - Element ID
 * @param {string} html - HTML to set
 */
const setHtml = (id, html) => {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
};

/**
 * Show or hide element by ID (toggle display property).
 * @param {string} id - Element ID
 * @param {boolean} show - true to show, false to hide
 */
const rowShow = (id, show) => {
  const el = document.getElementById(id);
  if (el) el.style.display = show ? "" : "none";
};

/**
 * Check if device supports touch.
 * @returns {boolean}
 */
const isTouch = () => navigator.maxTouchPoints > 0;

/**
 * Check if device supports hover (non-touch).
 * @returns {boolean}
 */
const supportsHover = () => window.matchMedia("(hover: none)").matches === false;

export { setText, setHtml, rowShow, isTouch, supportsHover };
