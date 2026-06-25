// Data fetching and transformation.
// No DOM access. All functions are pure or take explicit dependencies.

import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
const SUBMISSION_LIMIT = 2000;
const DATE_RANGE_LIMIT = 2000;

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
    influencerId: null,
    groupId: submission.referrer || "default",
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

export const fetchScopedData = async (db, userIdentity, collectionName, dateField) => {
  let q;

  if (userIdentity.role === "influencer" && userIdentity.influencerId) {
    q = query(
      collection(db, collectionName),
      where("influencerId", "==", userIdentity.influencerId),
      orderBy(dateField, "desc"),
      limit(DATE_RANGE_LIMIT)
    );
  } else if (userIdentity.role === "manager" && userIdentity.scope === "group" && userIdentity.groupId) {
    q = query(
      collection(db, collectionName),
      where("groupId", "==", userIdentity.groupId),
      orderBy(dateField, "desc"),
      limit(DATE_RANGE_LIMIT)
    );
  } else {
    q = query(
      collection(db, collectionName),
      orderBy(dateField, "desc"),
      limit(DATE_RANGE_LIMIT)
    );
  }

  try {
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn(`${collectionName} read skipped`, e?.code || e);
    return [];
  }
};
