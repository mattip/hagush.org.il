// Referrer dimension — Firestore fetch + pure aggregation.
// No DOM access. All transformation functions are pure.

import {
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { SEED_ENTRIES, buildSeedMap, buildGroupId } from "./utils.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types (JSDoc)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single referrer (person). The Firestore doc ID equals `code`.
 *
 * @typedef {Object} Referrer
 * @property {string}               code     - Stable referrer code ("18", "clm-123"). Also the doc ID.
 * @property {string}               name     - Display name.
 * @property {boolean}              active
 * @property {'individual'|'organizer'} type - 'organizer' = person who also leads a group.
 * @property {string|null}          groupId  - FK to referrer_groups/{groupId}, or null.
 */

/**
 * A named group that owns multiple individual referrers.
 *
 * @typedef {Object} ReferrerGroup
 * @property {string}  id     - Firestore doc ID (stable slug or auto-ID).
 * @property {string}  name   - Display name.
 * @property {boolean} active
 */

/**
 * One row in the per-referrer table, ready for rendering.
 *
 * @typedef {Object} ReferrerAggregateRow
 * @property {string}      code
 * @property {string}      name
 * @property {number}      count
 * @property {string|null} groupId
 * @property {string|null} groupName
 * @property {'individual'|'organizer'} type
 * @property {boolean}     isKnown  - false when referrer code has no dimension entry.
 */

/**
 * One row in the per-group summary table.
 *
 * @typedef {Object} GroupAggregateRow
 * @property {string}                 groupId
 * @property {string}                 groupName
 * @property {number}                 totalCount
 * @property {ReferrerAggregateRow[]} members    - Individual rows that belong to this group.
 */

/**
 * Full result of aggregateRegistrationsByReferrer — everything the renderer needs.
 *
 * @typedef {Object} ReferrerAggregation
 * @property {ReferrerAggregateRow[]} individualRows - All referrers (known + unknown), sorted by count desc.
 * @property {GroupAggregateRow[]}    groupRows      - Per-group rollup rows, sorted by totalCount desc.
 * @property {number}                 directCount    - Registrations with no referrer code (direct traffic).
 * @property {number}                 unknownCount   - Registrations with a code not found in the dimension.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Firestore data layer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Loads all referrers from Firestore.
 * Falls back to SEED_ENTRIES if the collection is empty (pre-migration) or unreadable.
 *
 * @param {import("firebase/firestore").Firestore} db
 * @returns {Promise<Map<string, Referrer>>}
 */
export const fetchReferrers = async (db) => {
  try {
    const snap = await getDocs(collection(db, "referrers"));
    if (snap.empty) return buildSeedMap();

    const map = new Map();
    snap.forEach((d) => {
      const data = d.data();
      map.set(d.id, {
        code:    d.id,
        name:    data.name    || d.id,
        active:  data.active  !== false,
        type:    data.type    || "individual",
        groupId: data.groupId || null,
      });
    });
    return map;
  } catch (e) {
    console.warn("referrers read skipped — using seed data", e?.code || e);
    return buildSeedMap();
  }
};

/**
 * Loads all referrer groups from Firestore.
 * Returns an empty map (graceful) if the collection doesn't exist yet.
 *
 * @param {import("firebase/firestore").Firestore} db
 * @returns {Promise<Map<string, ReferrerGroup>>}
 */
export const fetchReferrerGroups = async (db) => {
  try {
    const snap = await getDocs(collection(db, "referrer_groups"));
    const map = new Map();
    snap.forEach((d) => {
      const data = d.data();
      map.set(d.id, {
        id:     d.id,
        name:   data.name   || d.id,
        active: data.active !== false,
      });
    });
    return map;
  } catch (e) {
    console.warn("referrer_groups read skipped", e?.code || e);
    return new Map();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Pure aggregation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aggregates registrations against the referrer dimension.
 * Pure function — no I/O, no side effects.
 *
 * @param {{
 *   registrations: import('./data.js').Registration[],
 *   referrers:     Map<string, Referrer>,
 *   groups:        Map<string, ReferrerGroup>,
 * }} params
 * @returns {ReferrerAggregation}
 */
export const aggregateRegistrationsByReferrer = ({ registrations, referrers, groups }) => {
  // 1. Count per raw code
  const countByCode = new Map();
  for (const reg of registrations) {
    const code = reg.referrer || "";
    countByCode.set(code, (countByCode.get(code) || 0) + 1);
  }

  // 2. Join against dimension
  let directCount  = 0; // no code provided at all (direct / organic traffic)
  let unknownCount = 0; // code present but not in dimension (data quality issue)
  const individualRows = [];
  const groupTotals    = new Map(); // groupId → GroupAggregateRow (partial, built incrementally)

  for (const [code, count] of countByCode) {
    if (code === "") {
      directCount += count;
      continue; // direct traffic: skip the table entirely, surfaced separately
    }

    const ref   = referrers.get(code);
    const group = ref?.groupId ? groups.get(ref.groupId) : null;

    const row = ref
      ? {
          code,
          name:      ref.name,
          count,
          groupId:   ref.groupId || null,
          groupName: group?.name || null,
          type:      ref.type || "individual",
          isKnown:   true,
        }
      : {
          code,
          name:      code, // show raw code so an admin can spot and fix the bad code
          count,
          groupId:   null,
          groupName: null,
          type:      "individual",
          isKnown:   false,
        };

    individualRows.push(row);
    if (!ref) { unknownCount += count; continue; }

    if (ref.groupId) {
      if (!groupTotals.has(ref.groupId)) {
        groupTotals.set(ref.groupId, {
          groupId:    ref.groupId,
          groupName:  group?.name || ref.groupId,
          totalCount: 0,
          members:    [],
        });
      }
      const g = groupTotals.get(ref.groupId);
      g.members.push(row);
      g.totalCount += count;
    }
  }

  // 3. Sort
  individualRows.sort((a, b) => b.count - a.count);
  const groupRows = [...groupTotals.values()].sort((a, b) => b.totalCount - a.totalCount);

  return { individualRows, groupRows, directCount, unknownCount };
};

// ─────────────────────────────────────────────────────────────────────────────
// Writes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates or overwrites a referrer document. Admin-only (enforced by Firestore rules).
 * The document ID is the referrer code — same value join_form.referrer carries.
 *
 * @param {import("firebase/firestore").Firestore} db
 * @param {{ code: string, name: string, groupId: string|null, type?: 'individual'|'organizer' }} referrer
 * @returns {Promise<void>}
 */
export const saveReferrer = async (db, { code, name, groupId, type = "individual" }) => {
  const { doc, setDoc, serverTimestamp } = await import(
    "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
  );
  await setDoc(doc(db, "referrers", code), {
    name,
    active:    true,
    type,
    groupId:   groupId || null,
    createdAt: serverTimestamp(),
  });
};

/**
 * Creates a new referrer group and returns its generated ID. Admin-only.
 *
 * @param {import("firebase/firestore").Firestore} db
 * @param {{ name: string }} group
 * @returns {Promise<string>} the new groupId
 */
export const saveGroup = async (db, { name }) => {
  const { doc, setDoc, serverTimestamp } = await import(
    "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
  );
  const groupId = buildGroupId(name);
  await setDoc(doc(db, "referrer_groups", groupId), {
    name,
    active:    true,
    createdAt: serverTimestamp(),
  });
  return groupId;
};

export const deleteReferrer = async (db, code) => {
  const { doc, deleteDoc } = await import(
    "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
  );
  await deleteDoc(doc(db, "referrers", code));
};

export const deleteGroup = async (db, groupId) => {
  const { doc, deleteDoc } = await import(
    "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
  );
  await deleteDoc(doc(db, "referrer_groups", groupId));
};

// ─────────────────────────────────────────────────────────────────────────────
// Migration helper (run once from the browser console as admin)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Writes SEED_ENTRIES into Firestore referrers collection.
 * Safe to call repeatedly — uses setDoc which overwrites existing docs.
 * Only call this once to seed production; delete or guard with a flag afterward.
 *
 * @param {import("firebase/firestore").Firestore} db
 */
export const seedReferrers = async (db) => {
  const { doc, setDoc, serverTimestamp } = await import(
    "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
  );
  await Promise.all(
    SEED_ENTRIES.map(({ id, name }) =>
      setDoc(doc(db, "referrers", id), {
        name,
        active:    true,
        type:      "individual",
        groupId:   null,
        createdAt: serverTimestamp(),
      })
    )
  );
  console.log(`Seeded ${SEED_ENTRIES.length} referrers.`);
};

