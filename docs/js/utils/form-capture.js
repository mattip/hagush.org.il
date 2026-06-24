// Form submission capture to Firestore

import { writeToFirestore } from "./firebase.js";
import { getIsoWeekKey } from "./format.js";
import { hasOptedOut } from "./privacy.js";

/**
 * Capture form submission to Firestore (join form or candidate questions).
 * Writes on every submit, regardless of backend success.
 * Respects hard opt-out but ignores DNT (explicit user action).
 * @param {Object} fields - Form fields to capture
 * @param {string} fields.formType - "join" or "question"
 * @param {string} optoutKey - LocalStorage opt-out key
 * @param {Function} getSessionId
 * @param {Function} getDailyId
 * @param {Function} getPageName
 */
const captureFormSubmission = async (
  fields,
  optoutKey,
  getSessionId,
  getDailyId,
  getPageName
) => {
  if (hasOptedOut(optoutKey)) return; // honour hard opt-out

  const formType = (fields && fields.formType) || "join";
  const collectionName = "form_submissions";

  const payload = {
    ...fields,
    formType,
    sessionId: getSessionId(),
    dailyId: getDailyId(),
    page: getPageName(),
    weekKey: getIsoWeekKey(new Date()),
  };

  try {
    await writeToFirestore(collectionName, payload);
  } catch (e) {
    /* capture must never break the form */
  }
};

export { captureFormSubmission };
