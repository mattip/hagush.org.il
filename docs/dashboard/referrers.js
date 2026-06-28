// Static referrer map — Firestore-backed support to be added in a future PR.
// Map<code, { name, active }>

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

export const REFERRERS_MAP = new Map(
  SEED_DATA.map(({ id, name }) => [id, { name, active: true }])
);
