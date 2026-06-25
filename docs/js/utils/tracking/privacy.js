// Privacy and user preference utilities

import { getLocalStorage, getSessionStorage } from "../browser.js";

/**
 * Check if user has "Do Not Track" enabled (any variant).
 * @returns {boolean}
 */
export const isDoNotTrackEnabled = () =>
  navigator.doNotTrack === "1" ||
  window.doNotTrack === "1" ||
  navigator.msDoNotTrack === "1";

/**
 * Check if user has opted out via localStorage.
 * Gracefully handles localStorage errors (private mode, etc).
 * @param {string} optoutKey - LocalStorage key for opt-out flag
 * @returns {boolean}
 */
export const hasOptedOut = (optoutKey) => {
  const ls = getLocalStorage();
  if (!ls) return false;
  try {
    return ls.getItem(optoutKey) === "1";
  } catch (e) {
    return false;
  }
};

/**
 * Get or create session ID (per browser tab).
 * @param {string} sessionKey - SessionStorage key
 * @param {Function} generateId - Function to generate new IDs
 * @returns {string} Session ID
 */
export const getOrCreateSessionId = (sessionKey, generateId) => {
  const ss = getSessionStorage();
  if (!ss) return generateId();

  try {
    let id = ss.getItem(sessionKey);
    if (!id) {
      id = generateId();
      ss.setItem(sessionKey, id);
    }
    return id;
  } catch (e) {
    return generateId();
  }
};

/**
 * Get or create daily ID (rotates per calendar day, persistent).
 * Respects DNT: if enabled, returns session-only ID.
 * @param {string} dailyKey - LocalStorage key
 * @param {Function} generateId - Function to generate new IDs
 * @param {Function} getSessionId - Function to get current session ID
 * @param {Function} isDoNotTrack - Function to check DNT status
 * @returns {string} Daily ID
 */
export const getOrCreateDailyId = (
  dailyKey,
  generateId,
  getSessionId,
  isDoNotTrack
) => {
  if (isDoNotTrack()) return getSessionId(); // DNT → session-only, no persistence

  const ls = getLocalStorage();
  if (!ls) return getSessionId();

  try {
    const today = new Date().toISOString().slice(0, 10);
    const stored = ls.getItem(dailyKey);
    let obj = stored ? JSON.parse(stored) : null;

    if (!obj || obj.date !== today) {
      obj = { id: generateId(), date: today };
      ls.setItem(dailyKey, JSON.stringify(obj));
    }

    return obj.id;
  } catch (e) {
    return getSessionId();
  }
};
