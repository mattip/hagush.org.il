// Auto-instrumentation — wiring up event listeners for tracking
// All DOM references injected; no global dependencies

import { hasIntersectionObserver } from "./browser.js";

/**
 * Wire up join form focus/submit tracking.
 * @param {HTMLDocument} doc - Document reference
 * @param {Function} track - Tracking function
 */
const wireJoinFormTracking = (doc, track) => {
  const form = doc.getElementById("joinForm");
  if (!form) return;

  let formStarted = false;
  form.addEventListener(
    "focusin",
    () => {
      if (!formStarted) {
        formStarted = true;
        track("form_started");
      }
    },
    { once: false }
  );

  form.addEventListener("submit", () => track("submit_attempt"), { capture: true });
};

/**
 * Wire up scroll tracking (trigger when signup form enters viewport).
 * @param {HTMLDocument} doc - Document reference
 * @param {Function} track - Tracking function
 */
const wireFormAnchorTracking = (doc, track) => {
  const form = doc.getElementById("joinForm");
  const anchor = doc.getElementById("signup") || form;

  if (!anchor || !hasIntersectionObserver()) return;

  let seen = false;
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !seen) {
          seen = true;
          track("scroll_reached_form");
          observer.disconnect();
        }
      });
    },
    { threshold: 0.4 }
  );

  observer.observe(anchor);
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

      if (href.indexOf("wa.me") >= 0 || href.indexOf("whatsapp") >= 0) {
        track("whatsapp");
      } else if (/רשומ|לבדוק|סטטוס|בדיק/.test(text)) {
        track("status_check");
      } else if (href.indexOf("democrats.org.il") >= 0 || /התפקד/.test(text)) {
        track("cta_party");
      } else if (href.indexOf("#signup") >= 0) {
        track("cta_join");
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
const instrument = (doc, track) => {
  wireJoinFormTracking(doc, track);
  wireFormAnchorTracking(doc, track);
  wireLinkTracking(doc, track);
};

export { wireJoinFormTracking, wireFormAnchorTracking, wireLinkTracking, instrument };
