// Form submission capture to Firestore

import { writeToFirestore } from "../firebase.js";

/**
 * Capture join form submission to Firestore.
 * Writes on every submit, regardless of backend success.
 * @param {Object} fields - Form fields to capture
 */
export const captureFormSubmission = async (fields) => {
  const now = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const il = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
  const ts = `${il.getFullYear()}-${p(il.getMonth()+1)}-${p(il.getDate())}T${p(il.getHours())}-${p(il.getMinutes())}-${p(il.getSeconds())}`;
  const phoneSuffix = String(fields.phone || "").replace(/\D/g, "").slice(-4) || "xxxx";
  const docId = `${ts}_${phoneSuffix}`;

  const MAX_STR = 500;
  const safeFields = Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [k, typeof v === "string" ? v.slice(0, MAX_STR) : v])
  );

  await writeToFirestore("join_form", safeFields, docId);
};
