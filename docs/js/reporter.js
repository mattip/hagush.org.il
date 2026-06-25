// reporter.js — entry point for client telemetry.
// Reports form submissions. All logic lives in utils/.

import { captureFormSubmission } from "./utils/tracking/form-capture.js";

// ── Config ────────────────────────────────────────────────────────────────────

const IDLE_TIMEOUT   = 3000;
const FALLBACK_DELAY = 1200;

// ── Tracking API ──────────────────────────────────────────────────────────────

const formCapture = (fields) => captureFormSubmission(fields);

// ── Entry point ───────────────────────────────────────────────────────────────

const start = () => {
  window.hagushFormSubmit = formCapture;
};

// ── Bootstrap ─────────────────────────────────────────────────────────────────

if ("requestIdleCallback" in window) requestIdleCallback(start, { timeout: IDLE_TIMEOUT });
else setTimeout(start, FALLBACK_DELAY);
