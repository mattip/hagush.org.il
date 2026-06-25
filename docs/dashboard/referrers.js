// Referrers collection — Firestore-backed source of truth.
// Doc ID = referrer code (numeric string "1"–"25").
// Fields: { name: string, active: boolean }
//
// Run seedReferrers(db) once from the browser console to populate:
//   import('./referrers.js').then(m => m.seedReferrers(db))

import {
  collection,
  doc,
  getDocs,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const COLLECTION = "referrers";

const SEED_DATA = [
  { id: "1",  name: "נופר בן צור" },
  { id: "2",  name: "פולה קויש" },
  { id: "3",  name: "דורית זמיר" },
  { id: "4",  name: "ציון רקנטי" },
  { id: "5",  name: "אורלי באר שגב" },
  { id: "6",  name: "צור משעל" },
  { id: "7",  name: "רותי בן יקר" },
  { id: "8",  name: "אילון ורטהיים" },
  { id: "9",  name: "עידית אלכסנדרוביץ" },
  { id: "10", name: "עמוס דורון" },
  { id: "11", name: "צפי שומר" },
  { id: "12", name: "דורי סלע" },
  { id: "13", name: "שבתאי גבאי" },
  { id: "14", name: "ראובן קוסט" },
  { id: "15", name: "נגה בר-און" },
  { id: "16", name: "אוסנת נויה פריש" },
  { id: "17", name: "טל קורנט" },
  { id: "18", name: "ליאור צ'רבינסקי" },
  { id: "19", name: "לילך אברמוביץ" },
  { id: "20", name: "יפתח שטיין" },
  { id: "21", name: "גיא אדוט" },
  { id: "22", name: "בשמת אילת בן יעקב" },
  { id: "23", name: "דפנה מילר" },
  { id: "24", name: "נורית מלניק" },
  { id: "25", name: "הילה גולן" },
];

// Static map built from SEED_DATA — Map<code, { name, active }>
export const REFERRERS_MAP = new Map(
  SEED_DATA.map(({ id, name }) => [id, { name, active: true }])
);

// Returns Map<code, { name, active }> — empty map on failure.
export const fetchReferrers = async (db) => {
  try {
    const snapshot = await getDocs(collection(db, COLLECTION));
    return new Map(snapshot.docs.map((d) => [d.id, d.data()]));
  } catch (e) {
    console.warn("referrers fetch skipped", e?.code || e);
    return new Map();
  }
};

// One-time seed — writes only if the collection is empty.
export const seedReferrers = async (db) => {
  const existing = await getDocs(collection(db, COLLECTION));
  if (!existing.empty) {
    console.log("referrers already seeded, skipping");
    return;
  }
  await Promise.all(
    SEED_DATA.map(({ id, name }) =>
      setDoc(doc(db, COLLECTION, id), { name, active: true })
    )
  );
  console.log("referrers seeded:", SEED_DATA.length, "docs");
};
