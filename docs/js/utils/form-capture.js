// Form submission capture to Firestore

import { writeToFirestore } from "./firebase.js";

/**
 * Capture join form submission to Firestore.
 * Writes on every submit, regardless of backend success.
 * @param {Object} fields - Form fields to capture
 */
const makeDocId = (fields) => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const name = [fields.firstName, fields.lastName].filter(Boolean).join("_") || "unknown";
  return `${date}T${time}_${name}`;
};

const STORED_KEYS = ["firstName", "lastName", "phone", "email", "city", "idNumber", "registered", "referrer", "source"];

export const captureFormSubmission = async (fields) => {
  const MAX_STR = 500;
  const safeFields = Object.fromEntries(
    STORED_KEYS
      .filter((k) => fields[k] !== undefined)
      .map((k) => [k, typeof fields[k] === "string" ? fields[k].slice(0, MAX_STR) : fields[k]])
  );

  await writeToFirestore("join_form", safeFields, makeDocId(fields));
};
