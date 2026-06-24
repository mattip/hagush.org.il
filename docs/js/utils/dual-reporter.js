// Dual reporter — send events to both Firestore + PostHog simultaneously

/**
 * Create a dual reporter that sends events to both backends
 * @param {Function} trackerFn - Your tracker function (sends to Firestore)
 * @param {Object} posthog - PostHog instance (or null)
 * @returns {Function} Unified track function
 */
const createDualReporter = (trackerFn, posthog) => {
  return (type, detail) => {
    // Send to your tracker (Firestore) — always
    trackerFn(type, detail);

    // Also send to PostHog if available
    if (posthog && typeof posthog.capture === "function") {
      try {
        posthog.capture(`hagush_${type}`, detail || {});
      } catch (e) {
        // Silent fail — don't break Firestore tracking
      }
    }
  };
};

/**
 * Initialize PostHog (minimal, non-blocking)
 * @param {Object} config
 *   - projectKey: string (ph_...)
 *   - apiHost: string (https://...)
 * @returns {Object} PostHog instance or null
 */
const initPostHog = (config) => {
  if (!config || !config.projectKey) return null;

  if (typeof window === "undefined") return null;

  // If already loaded, return it
  if (window.posthog) return window.posthog;

  // Load PostHog asynchronously (non-blocking)
  const script = document.createElement("script");
  script.src = `${config.apiHost}/array.js`;
  script.async = true;
  document.body.appendChild(script);

  // Init queue (PostHog library pattern)
  window.posthog = window.posthog || [];
  window.posthog.methods = [
    "capture",
    "identify",
    "reset",
    "setPersonProperties",
  ];

  for (const method of window.posthog.methods) {
    window.posthog[method] = function (...args) {
      window.posthog.push([method, ...args]);
    };
  }

  // Minimal config
  window.posthog.push([
    "config",
    {
      token: config.projectKey,
      autocapture: false, // We handle tracking
    },
  ]);

  return window.posthog;
};

export { createDualReporter, initPostHog };
