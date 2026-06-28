// Shared utilities for referrer management.

// Pre-migration fallback seed data.
// Run seedReferrers(db) once to migrate these into Firestore, then delete or
// keep this list only for local tests.

export const SEED_ENTRIES = [
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

/** @returns {Map<string, Referrer>} */
export const buildSeedMap = () =>
  new Map(
    SEED_ENTRIES.map(({ id, name }) => [
      id,
      { code: id, name, active: true, type: "individual", groupId: null },
    ])
  );

/**
 * Builds a stable, human-ish group ID of the form `slug-hash`, e.g. "tzfi-h3k".
 * The slug is an ASCII-only reduction of the name (empty for Hebrew-only names,
 * in which case we fall back to "grp"); the 3-char suffix guarantees uniqueness
 * even when two groups share a name.
 *
 * @param {string} name
 * @returns {string}
 */
export const buildGroupId = (name) => {
  const slug = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const hash = Math.random().toString(36).slice(2, 5);
  return `${slug || "grp"}-${hash}`;
};
