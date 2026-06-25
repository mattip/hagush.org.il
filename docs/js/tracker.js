// tracker.js — entry point for client telemetry.
// All logic lives in utils/; this file wires pieces together and bootstraps.
//
// Two anonymous IDs (no PII):
//   sessionId — sessionStorage, per visit/tab.
//   dailyId   — localStorage, rotates every calendar day.
// Privacy: DNT → session-only (dailyId = sessionId, nothing persisted).
//          opt-out (localStorage hagush_optout=1) → fully off, no writes.

import { generateUuid } from "./utils/id-gen.js";
import {
  isDoNotTrackEnabled, hasOptedOut,
  getOrCreateSessionId, getOrCreateDailyId,
} from "./utils/tracking/privacy.js";
import {
  getPageName, getDeviceClass, isBot, getChannel,
} from "./utils/tracking/page-context.js";
import { buildBasePayload, trackPageView as _trackPageView, track as _track } from "./utils/tracking/tracking.js";
import { captureFormSubmission } from "./utils/tracking/form-capture.js";
import { instrument } from "./utils/tracking/instrumentation.js";

// ── Config ────────────────────────────────────────────────────────────────────

const OPTOUT_KEY     = "hagush_optout";
const SID_KEY        = "hagush_sid";
const DAILY_KEY      = "hagush_daily";
const IDLE_TIMEOUT   = 3000;
const FALLBACK_DELAY = 1200;

// ── Identity ──────────────────────────────────────────────────────────────────

const getSessionId = () => getOrCreateSessionId(SID_KEY, generateUuid);
const getDailyId   = () => getOrCreateDailyId(DAILY_KEY, generateUuid, getSessionId, isDoNotTrackEnabled);

// ── Tracking API ──────────────────────────────────────────────────────────────

const base = () => buildBasePayload(getSessionId, getDailyId, getPageName);

const track        = (type, detail) => _track(type, detail, base());
const trackPageView = ()            => _trackPageView(base(), getChannel, getDeviceClass, isBot);
const formCapture   = (fields)      => captureFormSubmission(fields, OPTOUT_KEY, getSessionId, getDailyId, getPageName);

// ── Entry point ───────────────────────────────────────────────────────────────

const start = () => {
  if (hasOptedOut(OPTOUT_KEY)) return;
  window.hagushIds        = () => ({ sessionId: getSessionId(), dailyId: getDailyId() });
  window.hagushTrack      = track;
  window.hagushFormSubmit = formCapture;
  trackPageView();
  instrument(document, track);
};

// ── Bootstrap ─────────────────────────────────────────────────────────────────

if ("requestIdleCallback" in window) requestIdleCallback(start, { timeout: IDLE_TIMEOUT });
else setTimeout(start, FALLBACK_DELAY);
