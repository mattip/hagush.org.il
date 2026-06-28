// Data fetching and transformation.
// No DOM access. All functions are pure or take explicit dependencies.

/**
 * A registration record, transformed from a raw join_form submission.
 *
 * @typedef {Object} Registration
 * @property {string}           id
 * @property {string}           name
 * @property {string}           phoneMasked
 * @property {string}           email
 * @property {string}           city
 * @property {string}           source
 * @property {string}           referrer     - Raw referrer code from the form (e.g. "18", "clm-123").
 * @property {string}           referrerName - Resolved display name, enriched before render.
 * @property {string|null}      referrerId   - Referrer code for access control (same as referrer).
 * @property {string|null}      groupId      - Group ID, resolved from referrer dimension at load time.
 * @property {boolean|null}     partyRegistered
 * @property {'clean'|'duplicate'|'test'|'suspicious'} status
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
    id: submission.id,
    name: fullName || "—",
    phoneMasked: String(submission.phone || ""),
    email: submission.email || "",
    city: submission.city || "",
    source: submission.source || "",
    referrer:     submission.referrer || "",
    referrerName: "",   // enriched in dashboard-app.js after referrers are loaded
    referrerId:   submission.referrer || null,  // referrer code for access control
    groupId:      null, // resolved from referrer dimension at load time
    partyRegistered:
      submission.registered === "yes"
        ? true
        : submission.registered === "no"
          ? false
          : null,
    status: "clean",
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

