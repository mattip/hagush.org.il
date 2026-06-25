// Pure DOM utilities (no business logic)

import { escapeHtml } from "./html-escape.js";

/**
 * Get element by ID (null-safe).
 * @param {string} id - Element ID
 * @returns {HTMLElement|null}
 */
export const getById = (id) => document.getElementById(id);

/**
 * Show an element by removing "hidden" class.
 * @param {HTMLElement} element
 */
export const show = (element) => element && element.classList.remove("hidden");

/**
 * Hide an element by adding "hidden" class.
 * @param {HTMLElement} element
 */
export const hide = (element) => element && element.classList.add("hidden");

/**
 * Create a help/info tooltip span with question mark.
 * @param {string} tooltipText - Help text to show on hover/focus
 * @returns {string} HTML string for tooltip element
 */
export const createHelpTooltip = (tooltipText) => {
  return (
    '<span class="help" tabindex="0">?' +
    '<span class="tip">' +
    escapeHtml(tooltipText) +
    "</span></span>"
  );
};
