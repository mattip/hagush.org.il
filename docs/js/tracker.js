// tracker.js — privacy-minimal client telemetry for hagush.org.il
// Firestore-only, no external dependencies, no PII
// Auto-wiring via data attributes: <button data-track="event_name">

import { generateUuid } from "./utils/id-gen.js";
import { getIsoWeekKey } from "./utils/format.js";
import {
  isDoNotTrackEnabled,
  hasOptedOut,
  getOrCreateSessionId,
  getOrCreateDailyId,
} from "./utils/privacy.js";
import { buildBasePayload, trackPageView, track } from "./utils/tracking.js";
import {
  getPageName,
  getDeviceClass,
  isBot,
  getMedium,
  getChannel,
} from "./utils/page-context.js";
import { captureFormSubmission } from "./utils/form-capture.js";
import { instrument } from "./utils/instrumentation.js";
import { initTracker } from "./utils/init.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_KEY = "hagush_sid";
const DAILY_KEY = "hagush_daily";
const OPTOUT_KEY = "hagush_optout";

// ─────────────────────────────────────────────────────────────────────────────
// ID generation with privacy awareness
// ─────────────────────────────────────────────────────────────────────────────

const getSessionId = () => getOrCreateSessionId(SESSION_KEY, generateUuid);

const getDailyId = () =>
  getOrCreateDailyId(DAILY_KEY, generateUuid, getSessionId, isDoNotTrackEnabled);

// ─────────────────────────────────────────────────────────────────────────────
// Factory functions (closures bind context)
// ─────────────────────────────────────────────────────────────────────────────

const createBasePayload = () =>
  buildBasePayload(getSessionId, getDailyId, getPageName);

const createTrackPageView = () => {
  return () => {
    const payload = createBasePayload();
    trackPageView(payload, getMedium, getChannel, getDeviceClass, isBot);
  };
};

const createTrack = () => {
  return (type, detail) => {
    const payload = createBasePayload();
    track(type, detail, payload);
  };
};

const createCaptureFormSubmission = () => {
  return (fields) =>
    captureFormSubmission(fields, OPTOUT_KEY, getSessionId, getDailyId, getPageName);
};

const createGetIds = () => {
  return () => ({
    sessionId: getSessionId(),
    dailyId: getDailyId(),
  });
};

const createInstrument = (trackFn) => {
  return () => {
    instrument(document, trackFn);
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Initialize tracker
// ─────────────────────────────────────────────────────────────────────────────

const trackPageViewFn = createTrackPageView();
const trackFn = createTrack();
const captureFormSubmissionFn = createCaptureFormSubmission();
const getIdsFn = createGetIds();

const api = initTracker({
  trackPageView: trackPageViewFn,
  track: trackFn,
  captureFormSubmission: captureFormSubmissionFn,
  getIds: getIdsFn,
  optoutKey: OPTOUT_KEY,
});

// Instrument manual event tracking (if user calls programmatically)
instrument(document, trackFn);

// Export for module use
export const HagushTracker = api;

// Expose on window for inline scripts (backward compatibility)
// Allows inline script forms to access: window.hagushIds() and window.hagushFormSubmit()
window.hagushIds = () => api.getIds();
window.hagushFormSubmit = (fields) => api.captureFormSubmission(fields);
