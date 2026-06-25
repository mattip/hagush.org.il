// Form submission capture to Firestore

import { writeToFirestore } from "./firebase.js";

/**
 * Capture join form submission to Firestore.
 * Writes on every submit, regardless of backend success.
 * @param {Object} fields - Form fields to capture
 */
export const captureFormSubmission = async (fields) => {
  const MAX_STR = 500;
  const safeFields = Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [k, typeof v === "string" ? v.slice(0, MAX_STR) : v])
  );

  await writeToFirestore("join_form", safeFields);
};
