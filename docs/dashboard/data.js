// Data fetching and transformation.
// No DOM access. All functions are pure or take explicit dependencies.

/**
 * A registration record, transformed from a raw join_form submission.
 *
 * @typedef {Object} Registration
 * @property {string}           name
 * @property {string}           phoneMasked
 * @property {string}           email
 * @property {string}           referrer     - Raw referrer code from the form (e.g. "18", "clm-123").
 * @property {boolean|null}     partyRegistered
 * @property {*}                createdAt
 */

import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
const SUBMISSION_LIMIT = 2000;

export const transformSubmissionToRegistration = (submission) => {
  const fullName =
    ((submission.firstName || "") + " " + (submission.lastName || "")).trim();

  return {
    name: fullName || "—",
    phoneMasked: String(submission.phone || ""),
    email: submission.email || "",
    referrer: submission.referrer || "",
    partyRegistered:
      submission.registered === "yes"
        ? true
        : submission.registered === "no"
          ? false
          : null,
    createdAt: submission.ts,
  };
};

export const fetchJoinFormSubmissions = async (db) => {
  try {
    const snapshot = await getDocs(
      query(collection(db, "join_form"), orderBy("ts", "desc"), limit(SUBMISSION_LIMIT))
    );
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn("join_form read skipped", e?.code || e);
    return [];
  }
};

