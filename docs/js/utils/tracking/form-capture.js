// Form submission capture to Firestore

import { writeToFirestore } from "../firebase.js";
import { getIsoWeekKey } from "../format.js";
import { hasOptedOut } from "./privacy.js";

/**
 * Capture join form submission to Firestore.
 * Writes on every submit, regardless of backend success.
 * Respects hard opt-out but ignores DNT (explicit user action).
 * @param {Object} fields - Form fields to capture
 * @param {string} optoutKey - LocalStorage opt-out key
 * @param {Function} getSessionId
 * @param {Function} getDailyId
 * @param {Function} getPageName
 */
export const captureFormSubmission = async (
  fields,
  optoutKey,
  getSessionId,
  getDailyId,
  getPageName
) => {
  if (hasOptedOut(optoutKey)) return;

  const now = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const il = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
  const ts = `${il.getFullYear()}-${p(il.getMonth()+1)}-${p(il.getDate())}T${p(il.getHours())}-${p(il.getMinutes())}-${p(il.getSeconds())}`;
  const phoneSuffix = String(fields.phone || "").replace(/\D/g, "").slice(-4) || "xxxx";
  const docId = `${ts}_${phoneSuffix}`;

  await writeToFirestore("join_form", {
    ...fields,
    sessionId: getSessionId(),
    dailyId:   getDailyId(),
    page:      getPageName(),
    weekKey:   getIsoWeekKey(now),
  }, docId);
};
