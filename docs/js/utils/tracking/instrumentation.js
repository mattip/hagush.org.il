// Auto-instrumentation — wiring up event listeners for tracking
// All DOM references injected; no global dependencies

import { INTERACTION } from "./allowed-interactions.enum.js";

/**
 * Wire up join form focus/submit tracking.
 * @param {HTMLDocument} doc - Document reference
 * @param {Function} track - Tracking function
 */
const wireJoinFormTracking = (doc, track) => {
  const form = doc.getElementById("joinForm");
  if (!form) return;

  let formStarted = false;
  form.addEventListener("focusin", () => {
    if (!formStarted) {
      formStarted = true;
      track(INTERACTION.FORM_STARTED);
    }
  });

  form.addEventListener("submit", () => track(INTERACTION.SUBMIT_ATTEMPT), { capture: true });
};

/**
 * Wire up delegated link tracking.
 * Heuristics: explicit data-track attr, then WhatsApp/status-check/party-registration/CTA detection.
 * @param {HTMLDocument} doc - Document reference
 * @param {Function} track - Tracking function
 */
const wireLinkTracking = (doc, track) => {
  doc.addEventListener(
    "click",
    (event) => {
      const link = event.target.closest && event.target.closest("a,button,[data-track]");
      if (!link) return;

      const explicit = link.getAttribute("data-track");
      if (explicit) {
        track(explicit);
        return;
      }

      const href = (link.getAttribute("href") || "").toLowerCase();
      const text = (link.textContent || "").trim();

      if (href.includes("wa.me") || href.includes("whatsapp")) {
        track(INTERACTION.WHATSAPP);
      } else if (/רשומ|לבדוק|סטטוס|בדיק/.test(text)) {
        track(INTERACTION.STATUS_CHECK);
      } else if (href.includes("democrats.org.il") || /התפקד/.test(text)) {
        track(INTERACTION.CTA_PARTY);
      } else if (href.includes("#signup")) {
        track(INTERACTION.CTA_JOIN);
      }
    },
    { capture: true }
  );
};

/**
 * Instrument the page with all auto-tracking.
 * @param {HTMLDocument} doc - Document reference
 * @param {Function} track - Tracking function
 */
export const instrument = (doc, track) => {
  wireJoinFormTracking(doc, track);
  wireLinkTracking(doc, track);
};
