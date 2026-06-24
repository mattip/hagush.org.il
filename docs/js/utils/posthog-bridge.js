// PostHog bridge — optional secondary analytics
// Forwards events to PostHog IF enabled AND user hasn't opted out
// Use case: dashboard + session recording on top of core telemetry

/**
 * Initialize PostHog (optional)
 * @param {Object} config - PostHog config
 *   - projectKey: string (ph_...)
 *   - apiHost: string (https://...)
 *   - enabled: boolean (default: false)
 * @returns {Object} PostHog API or null if disabled
 */
const initPostHog = (config = {}) => {
  const { projectKey, apiHost, enabled = false } = config;

  if (!enabled || !projectKey) return null;

  // Load PostHog script dynamically
  if (typeof window !== "undefined" && !window.posthog) {
    const script = document.createElement("script");
    script.src = `${apiHost}/array.js`;
    script.async = true;
    document.head.appendChild(script);

    // Minimal inline init (avoids inline script)
    window.posthog = window.posthog || [];
    window.posthog.methods = [
      "capture",
      "identify",
      "reset",
      "setPersonProperties",
      "opt_in_capturing",
      "opt_out_capturing",
    ];

    for (const method of window.posthog.methods) {
      window.posthog[method] = function (...args) {
        window.posthog.push([method, ...args]);
      };
    }

    window.posthog.push([
      "config",
      {
        token: projectKey,
        autocapture: false, // We handle tracking ourselves
        capture_pageleave: false,
      },
    ]);
  }

  return window.posthog || null;
};

/**
 * Create a forwarding wrapper for your tracker
 * Sends events to both your tracker AND PostHog (if enabled)
 * @param {Function} trackFn - Your core track function
 * @param {Object} posthog - PostHog instance (or null)
 * @returns {Function} Wrapped track function
 */
const createPostHogBridge = (trackFn, posthog) => {
  return (type, detail) => {
    // Always send to core tracker (Firestore)
    trackFn(type, detail);

    // Optionally forward to PostHog
    if (posthog && typeof posthog.capture === "function") {
      try {
        posthog.capture(`hagush_${type}`, detail || {});
      } catch (e) {
        // Silently fail — don't break core tracking
      }
    }
  };
};

/**
 * Identify user in PostHog (optional, privacy-aware)
 * Only call if user has explicitly opted in
 * @param {Object} ids - { sessionId, dailyId }
 * @param {Object} posthog - PostHog instance
 */
const identifyInPostHog = (ids, posthog) => {
  if (!posthog || !ids) return;

  try {
    // Use anonymous IDs, never PII
    posthog.identify(ids.sessionId, {
      dailyId: ids.dailyId,
      identified_at: new Date().toISOString(),
    });
  } catch (e) {
    // Silently fail
  }
};

/**
 * Start session recording in PostHog (opt-in only)
 * User must have explicitly consented
 * @param {Object} posthog - PostHog instance
 */
const startSessionRecording = (posthog) => {
  if (!posthog) return;

  try {
    posthog.startSessionRecording();
  } catch (e) {
    // Silently fail
  }
};

export {
  initPostHog,
  createPostHogBridge,
  identifyInPostHog,
  startSessionRecording,
};
