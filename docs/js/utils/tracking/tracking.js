// Tracking API — event recording to Firestore

import { writeToFirestore } from "../firebase.js";
import { getIsoWeekKey } from "../format.js";
import { INTERACTION_VALUES } from "./allowed-interactions.enum.js";

/**
 * Build base telemetry payload (session, daily, page, week).
 * @param {Function} getSessionId
 * @param {Function} getDailyId
 * @param {Function} getPageName
 * @returns {Object}
 */
export const buildBasePayload = (getSessionId, getDailyId, getPageName) => ({
  sessionId: getSessionId(),
  dailyId: getDailyId(),
  page: getPageName(),
  weekKey: getIsoWeekKey(new Date()),
});

/**
 * Track a page view (passive telemetry).
 * @param {Object} basePayload
 * @param {Function} getChannel
 * @param {Function} getDeviceClass
 * @param {Function} isBot
 */
export const trackPageView = (basePayload, getChannel, getDeviceClass, isBot) => {
  writeToFirestore("page_views", {
    ...basePayload,
    channel: getChannel(),
    deviceClass: getDeviceClass(),
    isBot: isBot(),
  });
};

/**
 * Track an interaction (explicit user action).
 * Only allowed types are recorded; others silently rejected.
 * @param {string} type - Interaction type (use INTERACTION.* constants)
 * @param {Object} [detail] - Optional detail object
 * @param {Object} basePayload
 */
export const track = (type, detail, basePayload) => {
  if (!INTERACTION_VALUES.includes(type)) return;

  const payload = { ...basePayload, type };
  if (detail && typeof detail === "object") payload.detail = detail;

  writeToFirestore("interactions", payload);
};
