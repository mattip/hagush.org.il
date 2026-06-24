// Browser environment — navigator, location, storage, DOM

/**
 * Get current page's user agent string.
 * @returns {string}
 */
const getUserAgent = () => navigator.userAgent || "";

/**
 * Get URL search parameters from location.search.
 * @returns {URLSearchParams}
 */
const getUrlParams = () => new URLSearchParams(location.search);

/**
 * Get current page pathname.
 * @returns {string}
 */
const getPathname = () => location.pathname;

/**
 * Get document referrer (previous page URL).
 * @returns {string}
 */
const getReferrer = () => document.referrer;

/**
 * Get current timestamp.
 * @returns {number} Milliseconds since epoch
 */
const getCurrentTime = () => Date.now();

/**
 * Check if IntersectionObserver is available.
 * @returns {boolean}
 */
const hasIntersectionObserver = () => "IntersectionObserver" in window;

/**
 * Check if requestIdleCallback is available.
 * @returns {boolean}
 */
const hasRequestIdleCallback = () => "requestIdleCallback" in window;

/**
 * Schedule callback to run when browser is idle.
 * Falls back to setTimeout if requestIdleCallback unavailable.
 * @param {Function} callback
 * @param {Object} [options] - { timeout }
 */
const scheduleIdleCallback = (callback, options) => {
  if (hasRequestIdleCallback()) {
    requestIdleCallback(callback, options);
  } else {
    setTimeout(callback, 1200);
  }
};

/**
 * Try to access localStorage (gracefully handle private mode).
 * @returns {{ getItem, setItem, removeItem } | null}
 */
const getLocalStorage = () => {
  try {
    const test = "__test__";
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return localStorage;
  } catch (e) {
    return null;
  }
};

/**
 * Try to access sessionStorage (gracefully handle private mode).
 * @returns {{ getItem, setItem, removeItem } | null}
 */
const getSessionStorage = () => {
  try {
    const test = "__test__";
    sessionStorage.setItem(test, test);
    sessionStorage.removeItem(test);
    return sessionStorage;
  } catch (e) {
    return null;
  }
};

export {
  getUserAgent,
  getUrlParams,
  getPathname,
  getReferrer,
  getCurrentTime,
  hasIntersectionObserver,
  hasRequestIdleCallback,
  scheduleIdleCallback,
  getLocalStorage,
  getSessionStorage,
};
