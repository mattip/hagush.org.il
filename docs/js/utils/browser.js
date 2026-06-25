// Browser environment — navigator, location, storage, DOM

/**
 * Get URL search parameters from location.search.
 * @returns {URLSearchParams}
 */
export const getUrlParams = () => new URLSearchParams(location.search);

/**
 * Get current page pathname.
 * @returns {string}
 */
export const getPathname = () => location.pathname;

/**
 * Try to access localStorage (gracefully handle private mode).
 * @returns {{ getItem, setItem, removeItem } | null}
 */
export const getLocalStorage = () => {
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
export const getSessionStorage = () => {
  try {
    const test = "__test__";
    sessionStorage.setItem(test, test);
    sessionStorage.removeItem(test);
    return sessionStorage;
  } catch (e) {
    return null;
  }
};
