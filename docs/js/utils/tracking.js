// Tracking API — event recording to Firestore

import { writeToFirestore } from "./firebase.js";
import { getIsoWeekKey } from "./format.js";

const ALLOWED_INTERACTIONS = [
  "candidate_open",
  "form_started",
  "field_dropoff",
  "validation_error",
  "submit_attempt",
  "cta_join",
  "cta_party",
  "whatsapp",
  "status_check",
  "scroll_reached_form",
  "dwell",
];

/**
 * Build base telemetry payload (session, daily, page, week).
 * @param {Function} getSessionId
 * @param {Function} getDailyId
 * @param {Function} getPageName
 * @returns {Object}
 */
const buildBasePayload = (getSessionId, getDailyId, getPageName) => ({
  sessionId: getSessionId(),
  dailyId: getDailyId(),
  page: getPageName(),
  weekKey: getIsoWeekKey(new Date()),
});

/**
 * Track a page view (passive telemetry).
 * @param {Object} basePayload
 * @param {Function} getMedium
 * @param {Function} getChannel
 * @param {Function} getDeviceClass
 * @param {Function} isBot
 */
const trackPageView = (basePayload, getMedium, getChannel, getDeviceClass, isBot) => {
  writeToFirestore("page_views", {
    ...basePayload,
    medium: getMedium(),
    channel: getChannel(),
    deviceClass: getDeviceClass(),
    isBot: isBot(),
  });
};

/**
 * Track an interaction (explicit user action).
 * Only allowed types are recorded; others silently rejected.
 * @param {string} type - Interaction type
 * @param {Object} [detail] - Optional detail object
 * @param {Object} basePayload
 */
const track = (type, detail, basePayload) => {
  if (ALLOWED_INTERACTIONS.indexOf(type) < 0) return;

  const payload = { ...basePayload, type };
  if (detail && typeof detail === "object") payload.detail = detail;

  writeToFirestore("interactions", payload);
};

export { ALLOWED_INTERACTIONS, buildBasePayload, trackPageView, track };
