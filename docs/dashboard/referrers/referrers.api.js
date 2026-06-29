// Firestore API layer for referrers and groups.
// No DOM access, no business logic.

import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { buildGroupId } from "./utils.js";

/** @param {import("firebase/firestore").Firestore} db */
export const fetchReferrers = async (db) => {
  const snap = await getDocs(collection(db, "referrers"));
  const map = new Map();
  snap.forEach((d) => {
    const data = d.data();
    map.set(d.id, {
      code: d.id,
      name: data.name || d.id,
      active: data.active !== false,
      type: data.type || "individual",
      groupId: data.groupId || null,
    });
  });
  return map;
};

/** @param {import("firebase/firestore").Firestore} db */
export const fetchReferrerGroups = async (db) => {
  try {
    const snap = await getDocs(collection(db, "referrer_groups"));
    const map = new Map();
    snap.forEach((d) => {
      const data = d.data();
      map.set(d.id, {
        id: d.id,
        name: data.name || d.id,
        active: data.active !== false,
      });
    });
    return map;
  } catch (e) {
    console.warn("referrer_groups read skipped", e?.code || e);
    return new Map();
  }
};

/** @param {import("firebase/firestore").Firestore} db */
export const saveReferrer = async (db, { code, name, groupId, type = "individual", isNew = false }) => {
  const data = { name, active: true, type, groupId: groupId || null };
  if (isNew) data.createdAt = serverTimestamp();
  await setDoc(doc(db, "referrers", code), data, { merge: true });
};

/** @param {import("firebase/firestore").Firestore} db */
export const saveGroup = async (db, { name }) => {
  const groupId = buildGroupId(name);
  await setDoc(doc(db, "referrer_groups", groupId), {
    name,
    active: true,
    createdAt: serverTimestamp(),
  });
  return groupId;
};

/** @param {import("firebase/firestore").Firestore} db */
export const deleteReferrer = async (db, code) => {
  await deleteDoc(doc(db, "referrers", code));
};

/** @param {import("firebase/firestore").Firestore} db */
export const deleteGroup = async (db, groupId) => {
  await deleteDoc(doc(db, "referrer_groups", groupId));
};
