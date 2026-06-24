// Pure DOM utilities (no business logic)

/**
 * Get element by ID (null-safe).
 * @param {string} id - Element ID
 * @returns {HTMLElement|null}
 */
const getById = (id) => document.getElementById(id);

/**
 * Show an element by removing "hidden" class.
 * @param {HTMLElement} element
 */
const show = (element) => element.classList.remove("hidden");

/**
 * Hide an element by adding "hidden" class.
 * @param {HTMLElement} element
 */
const hide = (element) => element.classList.add("hidden");

/**
 * Toggle class on element.
 * @param {HTMLElement} element
 * @param {string} className
 * @param {boolean} [force] - Force add (true) or remove (false)
 */
const toggleClass = (element, className, force) =>
  element.classList.toggle(className, force);

/**
 * Check if element has class.
 * @param {HTMLElement} element
 * @param {string} className
 * @returns {boolean}
 */
const hasClass = (element, className) => element.classList.contains(className);

/**
 * Create a help/info tooltip span with question mark.
 * @param {string} tooltipText - Help text to show on hover/focus
 * @returns {string} HTML string for tooltip element
 */
const createHelpTooltip = (tooltipText) => {
  // Note: escapeHtml must be available in parent scope or imported
  return (
    '<span class="help" tabindex="0">?' +
    '<span class="tip">' +
    escapeHtml(tooltipText) +
    "</span></span>"
  );
};

export {
  getById,
  show,
  hide,
  toggleClass,
  hasClass,
  createHelpTooltip,
};
