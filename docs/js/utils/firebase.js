// Firebase initialization and operations (lazy-loaded, no side effects)

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC7hQs04G8U0BMs9UXrHEurQnxgxN7jmLw",
  authDomain: "hagush-org-il.firebaseapp.com",
  projectId: "hagush-org-il",
  storageBucket: "hagush-org-il.firebasestorage.app",
  messagingSenderId: "674306617225",
  appId: "1:674306617225:web:7f84e8f09bc35222e77b58",
};

let firebasePromise = null;

/**
 * Get or initialize Firebase lazily.
 * Deferred until first use so it never blocks page render.
 * @returns {Promise<Object>} Firebase utilities { db, collection, addDoc, serverTimestamp }
 */
const getFirebase = async () => {
  if (firebasePromise) return firebasePromise;

  firebasePromise = (async () => {
    const [appMod, fsMod] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"),
    ]);

    const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(FIREBASE_CONFIG);

    return {
      db: fsMod.getFirestore(app),
      collection: fsMod.collection,
      addDoc: fsMod.addDoc,
      setDoc: fsMod.setDoc,
      doc: fsMod.doc,
      serverTimestamp: fsMod.serverTimestamp,
    };
  })();

  return firebasePromise;
};

/**
 * Write a document to Firestore with automatic timestamp.
 * Silently fails — telemetry must never break the page.
 * @param {string} collectionName - Firestore collection name
 * @param {Object} fields - Fields to write (ts will be added automatically)
 * @returns {Promise<void>}
 */
export const writeToFirestore = async (collectionName, fields, docId) => {
  try {
    const fs = await getFirebase();
    const data = { ...fields, ts: fs.serverTimestamp() };
    if (docId) {
      await fs.setDoc(fs.doc(fs.db, collectionName, docId), data);
    } else {
      await fs.addDoc(fs.collection(fs.db, collectionName), data);
    }
  } catch (e) {
    const fieldList = Object.keys(fields).join(", ");
    console.error(
      `Firestore write failed for '${collectionName}':\n` +
      `  Error: ${e?.code} — ${e?.message}\n` +
      `  Attempted fields: ${fieldList}\n` +
      `  Doc ID: ${docId || "(auto-generated)"}\n` +
      `  Check firestore.rules for allowed fields and types.`
    );
  }
};
