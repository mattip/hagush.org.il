// Declarative tracking — data attributes + event delegation
// No window pollution, HTML-driven, cleaner architecture

/**
 * Wire up declarative tracking via data attributes
 * Usage in HTML:
 *   <button data-track="candidate_open" data-track-detail='{"id":"nava_r"}'>
 *   <a href="#" data-track="cta_join">
 * @param {HTMLDocument} doc - Document reference
 * @param {Function} track - Track function
 */
const wireDeclarativeTracking = (doc, track) => {
  doc.addEventListener(
    "click",
    (event) => {
      const element = event.target.closest("[data-track]");
      if (!element) return;

      const eventType = element.getAttribute("data-track");
      const detailJson = element.getAttribute("data-track-detail");

      let detail = null;
      if (detailJson) {
        try {
          detail = JSON.parse(detailJson);
        } catch (e) {
          console.warn("Invalid data-track-detail JSON", detailJson);
        }
      }

      track(eventType, detail);
    },
    { capture: true }
  );
};

/**
 * Wire up form submission tracking via data attributes
 * Usage in HTML:
 *   <form data-track-form="join">
 * @param {HTMLDocument} doc - Document reference
 * @param {Function} captureFormSubmission - Form capture function
 */
const wireFormTracking = (doc, captureFormSubmission) => {
  doc.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-track-form]");
    if (!form) return;

    const formType = form.getAttribute("data-track-form");
    const formData = new FormData(form);
    const fields = Object.fromEntries(formData);

    captureFormSubmission({
      ...fields,
      formType,
    });
  });
};

/**
 * Auto-track page views on navigation
 * Usage: just call it, no HTML needed
 * @param {HTMLDocument} doc - Document reference
 * @param {Function} trackPageView - Page view tracker
 */
const wirePageViewTracking = (doc, trackPageView) => {
  // Track initial page view
  trackPageView();

  // Track on hash changes (SPA support)
  doc.addEventListener("hashchange", trackPageView);

  // Track on popstate (back/forward buttons)
  if (typeof window !== "undefined") {
    window.addEventListener("popstate", trackPageView);
  }
};

export {
  wireDeclarativeTracking,
  wireFormTracking,
  wirePageViewTracking,
};
