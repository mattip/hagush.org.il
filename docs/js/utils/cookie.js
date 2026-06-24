// Cookie management utilities

/**
 * Escape regex meta-characters in a string.
 * @param {string} s
 * @returns {string}
 */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Set a cookie with optional max-age.
 * @param {string} name - Cookie name
 * @param {string} value - Cookie value
 * @param {number} maxAge - Max age in seconds (0 to delete immediately)
 */
const setCookie = (name, value, maxAge) => {
  document.cookie = `${name}=${encodeURIComponent(value)};max-age=${maxAge};path=/;SameSite=Lax`;
};

/**
 * Get a cookie by name.
 * @param {string} name - Cookie name
 * @returns {string|null} Cookie value or null if not found
 */
const getCookie = (name) => {
  const m = document.cookie.match("(?:^|; )" + escapeRe(name) + "=([^;]*)");
  return m ? decodeURIComponent(m[1]) : null;
};

export { setCookie, getCookie };
