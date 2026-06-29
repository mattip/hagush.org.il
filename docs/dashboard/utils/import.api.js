// Firestore import operations

import {
  collection,
  writeBatch,
  doc,
  setDoc,
  query,
  where,
  getDocs,
  deleteDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export const generateBatchId = () => {
  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}--${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
};

// Build a deterministic, human-readable document id from the registration's ts
// and name: `YYYY-MM-DDTHH-MM-SS_firstName_lastName`. Deterministic (no random
// suffix) so re-importing the same row overwrites rather than duplicates.
const makeDocId = (reg) => {
  const pad = (n) => String(n).padStart(2, '0');
  const d = reg.ts instanceof Date ? reg.ts : (reg.ts ? new Date(reg.ts) : new Date());
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  const name = [reg.firstName, reg.lastName].filter(Boolean).join('_').replace(/\//g, '-') || 'unknown';
  return `${date}T${time}_${name}`;
};

// Keys the join_form security rules accept (for diffing on permission errors).
const ALLOWED_JOIN_FORM_KEYS = [
  'ts', 'firstName', 'lastName', 'phone', 'email', 'city',
  'idNumber', 'registered', 'referrer', 'source', 'importBatchId', 'importedAt',
];

const logWriteError = (err, docId, docData) => {
  const code = err?.code || '(no code)';
  console.group(`%c[import] write failed: ${code}`, 'color:#F44336;font-weight:bold');
  console.error('message:', err?.message || err);
  console.error('docId:', docId);
  console.error('document:', docData);
  console.error('document keys:', Object.keys(docData));
  if (code === 'permission-denied') {
    const extra = Object.keys(docData).filter(k => !ALLOWED_JOIN_FORM_KEYS.includes(k));
    if (extra.length) console.error('⚠ keys NOT allowed by rules:', extra);
    console.error('field types:', Object.fromEntries(
      Object.entries(docData).map(([k, v]) => [k, v === null ? 'null' : (v?.constructor?.name || typeof v)])
    ));
    console.error('hint: check firestore.rules join_form — types, string lengths, allowed keys, and that the user has an admin role.');
  }
  console.groupEnd();
};

// options: { dryRun, oneByOne, batchId, onProgress }
export const importRegistrations = async (db, registrations, options = {}) => {
  if (!registrations || registrations.length === 0) {
    throw new Error('No registrations to import');
  }

  const { dryRun = false, oneByOne = false, batchId, onProgress } = options;

  if (dryRun) {
    // Simulate without writing — return a preview report
    return {
      dryRun: true,
      count: registrations.length,
      batchId: null,
      sample: registrations.slice(0, 5),
    };
  }

  const collectionRef = collection(db, 'join_form');
  const total = registrations.length;

  if (oneByOne) {
    let done = 0;
    for (const reg of registrations) {
      const docData = { ...reg, importBatchId: batchId, importedAt: serverTimestamp() };
      delete docData._rowIndex;
      const docId = makeDocId(reg);
      try {
        await setDoc(doc(collectionRef, docId), docData);
      } catch (err) {
        logWriteError(err, docId, docData);
        throw err;
      }
      done++;
      onProgress?.(done, total);
    }
    return { dryRun: false, count: total, batchId };
  }

  // Batched (default) — Firestore limit is 500 ops per batch.
  // On a batch failure, the whole batch is rejected without telling us which
  // doc was at fault, so we replay that window one-by-one to pinpoint it.
  const commitBatch = async (batch, windowRegs) => {
    try {
      await batch.commit();
    } catch (err) {
      console.error(`[import] batch commit failed (${windowRegs.length} docs) — replaying to find the offending row...`);
      for (const reg of windowRegs) {
        const docData = { ...reg, importBatchId: batchId, importedAt: serverTimestamp() };
        delete docData._rowIndex;
        const docId = makeDocId(reg);
        try {
          await setDoc(doc(collectionRef, docId), docData);
        } catch (rowErr) {
          logWriteError(rowErr, docId, docData);
          console.error('[import] offending CSV row index:', reg._rowIndex);
          throw rowErr;
        }
      }
      throw err; // replay unexpectedly succeeded; surface the original error
    }
  };

  let batch = writeBatch(db);
  let windowRegs = [];
  let committed = 0;

  for (const reg of registrations) {
    const docData = { ...reg, importBatchId: batchId, importedAt: serverTimestamp() };
    delete docData._rowIndex;
    batch.set(doc(collectionRef, makeDocId(reg)), docData);
    windowRegs.push(reg);

    if (windowRegs.length === 500) {
      await commitBatch(batch, windowRegs);
      committed += windowRegs.length;
      onProgress?.(committed, total);
      batch = writeBatch(db);
      windowRegs = [];
    }
  }

  if (windowRegs.length > 0) {
    await commitBatch(batch, windowRegs);
    committed += windowRegs.length;
    onProgress?.(committed, total);
  }

  return { dryRun: false, count: committed, batchId };
};

export const revertImport = async (db, batchId) => {
  if (!batchId) throw new Error('No batchId provided');
  const collectionRef = collection(db, 'join_form');
  const q = query(collectionRef, where('importBatchId', '==', batchId));
  const snap = await getDocs(q);
  if (snap.empty) throw new Error('No records found for this import batch');

  let batch = writeBatch(db);
  let count = 0;
  let deleted = 0;

  for (const d of snap.docs) {
    batch.delete(d.ref);
    count++;
    if (count % 500 === 0) {
      await batch.commit();
      deleted += count;
      batch = writeBatch(db);
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
    deleted += count;
  }

  return deleted;
};

// Returns saved import history from localStorage
export const getImportHistory = () => {
  try {
    return JSON.parse(localStorage.getItem('importHistory') || '[]');
  } catch {
    return [];
  }
};

export const saveImportToHistory = (entry) => {
  const history = getImportHistory();
  history.unshift(entry); // newest first
  localStorage.setItem('importHistory', JSON.stringify(history.slice(0, 20)));
};

export const removeImportFromHistory = (batchId) => {
  const history = getImportHistory().filter(e => e.batchId !== batchId);
  localStorage.setItem('importHistory', JSON.stringify(history));
};
