// Initialization — setup tracking with declarative data attributes
// No external dependencies, privacy-first, Firestore only

import {
  wireDeclarativeTracking,
  wireFormTracking,
  wirePageViewTracking,
} from "./declarative-tracking.js";

/**
 * Initialize tracker with dependency injection
 * @param {Object} deps - Dependency injection
 *   - trackPageView: function
 *   - track: function(type, detail)
 *   - captureFormSubmission: function(fields)
 *   - getIds: function
 *   - optoutKey: string
 * @returns {Object} Public API { track, captureFormSubmission, getIds }
 */
const initTracker = (deps) => {
  const {
    trackPageView,
    track,
    captureFormSubmission,
    getIds,
  } = deps;

  // Public API object
  const api = {
    track,
    captureFormSubmission,
    getIds,
  };

  // Wire up declarative tracking (data attributes)
  if (typeof document !== "undefined") {
    wireDeclarativeTracking(document, track);
    wireFormTracking(document, captureFormSubmission);
    wirePageViewTracking(document, trackPageView);
  }

  return api;
};

export { initTracker };
