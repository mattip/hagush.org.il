// Dashboard entry point.
// Initializes Firebase, handles auth, and orchestrates data loading and rendering.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  getDoc,
  doc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { FIREBASE_CONFIG } from "../js/utils/firebase-config.js";
import { escapeHtml } from "../js/utils/html-escape.js";
import { formatRelativeTime } from "../js/utils/format.js";
import { getById, show, hide } from "../js/utils/dom.js";
import {
  transformSubmissionToRegistration,
  fetchJoinFormSubmissions,
} from "./data.js";
import { render } from "./render.js";
import { fetchReferrers } from "./referrers/referrers.api.js";
import { ROLE_LABELS } from "./roles.js";
import { parseCSV } from "./utils/csv-parser.js";
import { renderImportModal } from "./referrers/sections/import-modal.render.js";
import { findReferrerMatches } from "./utils/referrer-matcher.js";
import { transformCSVRowToRegistration, validateRegistration } from "./utils/csv-transformer.js";
import { importRegistrations, revertImport, generateBatchId, saveImportToHistory, getImportHistory, removeImportFromHistory } from "./utils/import.api.js";

// ─────────────────────────────────────────────────────────────────────────────
// Firebase
// ─────────────────────────────────────────────────────────────────────────────

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

let userIdentity = null;

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

const auditLogin = async (email, status) => {
  try {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jerusalem",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
    const ts = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}-${parts.minute}-${parts.second}`;
    await setDoc(doc(db, "login_events", `${ts}_${email}`), {
      email,
      status,
      ts: serverTimestamp(),
    });
  } catch (e) {
    /* audit is best-effort */
  }
};

const handleAuth = async (user) => {
  if (!user) {
    hide(getById("dash"));
    hide(getById("noaccess"));
    show(getById("login"));
    return;
  }

  let roleData = null;
  try {
    const snapshot = await getDoc(doc(db, "roles", user.email));
    if (snapshot.exists()) roleData = snapshot.data();
  } catch (e) {
    console.error("role read failed", e);
  }

  if (!roleData || roleData.active !== true) {
    await auditLogin(user.email, "forbidden");
    getById("na-email").textContent = user.email;
    hide(getById("login"));
    hide(getById("dash"));
    show(getById("noaccess"));
    return;
  }

  await auditLogin(user.email, "success");

  userIdentity = {
    email: user.email,
    role: roleData.role,
  };

  hide(getById("login"));
  hide(getById("noaccess"));
  show(getById("dash"));
  initializeChrome();
  loadData();
};

getById("login-btn").addEventListener("click", async () => {
  const btn = getById("login-btn");
  if (btn.disabled) return;
  btn.disabled = true;
  getById("login-err").textContent = "";
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    if (err?.code !== "auth/cancelled-popup-request") {
      console.error(err);
      getById("login-err").textContent = "שגיאה בכניסה: " + (err?.code || err);
    }
  } finally {
    btn.disabled = false;
  }
});

getById("logout-btn").addEventListener("click", () => signOut(auth));
getById("na-logout").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, handleAuth);

// ─────────────────────────────────────────────────────────────────────────────
// UI
// ─────────────────────────────────────────────────────────────────────────────

const initializeChrome = () => {
  getById("role-badge").textContent = ROLE_LABELS[userIdentity.role] || userIdentity.role;
  getById("user-email").textContent = userIdentity.email;
};

// ─────────────────────────────────────────────────────────────────────────────
// Data loading
// ─────────────────────────────────────────────────────────────────────────────

const loadData = async () => {
  if (!userIdentity) return;
  show(getById("loading"));
  hide(getById("content"));

  try {
    const [submissionsRaw, referrers] = await Promise.all([
      fetchJoinFormSubmissions(db),
      fetchReferrers(db),
    ]);
    const registrations = submissionsRaw.map(transformSubmissionToRegistration);

    render({ registrations, referrers, userRole: userIdentity.role });
    getById("updated").textContent = "עודכן " + formatRelativeTime(new Date());
    hide(getById("loading"));
    show(getById("content"));
  } catch (e) {
    console.error(e);
    getById("loading").innerHTML =
      '<div class="empty">שגיאה בטעינת הנתונים: ' +
      escapeHtml(e?.code || e?.message || e) +
      "</div>";
  }
};

getById("refresh-btn").addEventListener("click", loadData);

// The referrer to match on, across export layouts: the structured "referrer"
// column, then the newer "קבוצה / מפקד" name column, then the free-text
// "איך הגעת" answer.
const effectiveReferrer = (row) =>
  (row.referrer?.trim() || row['קבוצה / מפקד']?.trim() || row['איך הגעת']?.trim() || '');

getById("import-csv-btn").addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".csv";
  input.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const { headers, rows } = parseCSV(text);

      if (rows.length === 0) {
        alert("הקובץ ריק או לא תקין");
        return;
      }

      let currentStep = 'preview';
      let currentPage = 1;
      let referrerMatches = null;
      let registrations = null;
      let pendingBatchId = null;
      let pendingOneByOne = false;

      const renderStep = (extraData = {}) => {
        const existing = document.getElementById("import-modal-container");
        if (existing) existing.remove();

        let stepData = {};
        if (currentStep === 'preview') {
          stepData = { headers, rows, pageNum: currentPage, referrers: userIdentity.referrers };
        } else if (currentStep === 'matching') {
          stepData = { referrerMatches, rowCount: rows.length };
        } else if (currentStep === 'confirm') {
          stepData = { registrations, rowCount: rows.length, referrers: userIdentity.referrers };
        } else if (currentStep === 'dryrun') {
          stepData = { report: extraData.report, rowCount: rows.length };
        } else if (currentStep === 'progress') {
          stepData = { done: extraData.done || 0, total: registrations.length, batchId: pendingBatchId };
        }

        const modalHtml = renderImportModal(currentStep, stepData);
        const newContainer = document.createElement("div");
        newContainer.id = "import-modal-container";
        newContainer.innerHTML = modalHtml;
        document.body.appendChild(newContainer);

        attachStepHandlers(newContainer);
      };

      const attachStepHandlers = (container) => {
        const closeBtn = container.querySelector("#import-modal-close");
        const cancelBtn = container.querySelector("#import-modal-cancel");
        const nextBtn = container.querySelector("#import-modal-next-step");
        const backBtn = container.querySelector("#import-modal-back-step");
        const prevPageBtn = container.querySelector("#import-modal-prev-page");
        const nextPageBtn = container.querySelector("#import-modal-next-page");
        const executeBtn = container.querySelector("#import-modal-execute");
        const overlay = container.querySelector("#import-modal-overlay");

        const cleanupModal = () => {
          container.remove();
        };

        closeBtn?.addEventListener("click", cleanupModal);
        cancelBtn?.addEventListener("click", cleanupModal);

        if (prevPageBtn) {
          prevPageBtn.addEventListener("click", () => {
            if (currentPage > 1) {
              currentPage--;
              renderStep();
            }
          });
        }

        if (nextPageBtn) {
          nextPageBtn.addEventListener("click", () => {
            const totalPages = Math.ceil(rows.length / 15);
            if (currentPage < totalPages) {
              currentPage++;
              renderStep();
            }
          });
        }

        if (nextBtn) {
          nextBtn.addEventListener("click", async () => {
            if (currentStep === 'preview') {
              // Move to matching step
              currentStep = 'matching';

              // Get unique referrers from CSV and find matches.
              // Fall back to the free-text "איך הגעת" answer when the structured
              // referrer column is empty (many respondents fill it there instead).
              const uniqueReferrers = new Set(rows.map(r => effectiveReferrer(r)));
              referrerMatches = Array.from(uniqueReferrers).map(csvRef => {
                const matchData = findReferrerMatches(csvRef, userIdentity.referrers);
                // Mark as exclusive only when the CSV value exactly matches an existing referrer name
                if (csvRef && Array.from(userIdentity.referrers.values()).some(r => r.name === csvRef)) {
                  matchData.isExclusive = true;
                }
                return matchData;
              });

              renderStep();
            } else if (currentStep === 'matching') {
              // Move to confirm step - transform registrations with resolved referrers
              const referrerMappings = new Map();
              const matches = container.querySelectorAll('.referrer-select');

              matches.forEach(select => {
                const csvRef = select.dataset.csvReferrer;
                const value = select.value;
                // Fall back to original CSV value if nothing selected
                referrerMappings.set(csvRef, value || csvRef);
              });

              // Handle text inputs for new referrer names
              const inputs = container.querySelectorAll('.new-referrer-input');
              inputs.forEach(input => {
                const csvRef = input.dataset.csvReferrer;
                referrerMappings.set(csvRef, input.value);
              });

              registrations = rows.map(row => {
                const csvRef = effectiveReferrer(row);
                const resolvedRef = referrerMappings.get(csvRef) || csvRef;
                return transformCSVRowToRegistration(row, resolvedRef);
              }).filter(reg => {
                const errors = validateRegistration(reg);
                return errors.length === 0;
              });

              currentStep = 'confirm';
              renderStep();
            }
          });
        }

        const dryRunBtn = container.querySelector("#import-modal-dryrun");

        if (backBtn) {
          backBtn.addEventListener("click", () => {
            if (currentStep === 'matching') {
              currentStep = 'preview';
              renderStep();
            } else if (currentStep === 'dryrun') {
              currentStep = 'confirm';
              renderStep();
            } else if (currentStep === 'confirm') {
              currentStep = 'matching';
              renderStep();
            }
          });
        }

        if (dryRunBtn) {
          dryRunBtn.addEventListener("click", async () => {
            dryRunBtn.disabled = true;
            dryRunBtn.textContent = "Running...";
            try {
              const report = await importRegistrations(db, registrations, { dryRun: true });
              currentStep = 'dryrun';
              renderStep({ report });
            } catch (err) {
              alert(`Error: ${err?.message || err}`);
              dryRunBtn.disabled = false;
              dryRunBtn.textContent = "Dry Run";
            }
          });
        }

        if (executeBtn) {
          executeBtn.addEventListener("click", async () => {
            executeBtn.disabled = true;
            executeBtn.textContent = "Importing...";
            const oneByOne = container.querySelector("#import-one-by-one")?.checked ?? pendingOneByOne;
            pendingOneByOne = oneByOne;
            pendingBatchId = generateBatchId();

            try {
              if (oneByOne) {
                currentStep = 'progress';
                renderStep({ done: 0 });

                const result = await importRegistrations(db, registrations, {
                  oneByOne: true,
                  batchId: pendingBatchId,
                  onProgress: (done, total) => {
                    renderStep({ done });
                  },
                });

                renderStep({ done: result.count });
              } else {
                const result = await importRegistrations(db, registrations, {
                  batchId: pendingBatchId,
                });
                saveImportToHistory({
                  batchId: pendingBatchId,
                  count: result.count,
                  importedAt: new Date().toISOString(),
                });
                alert(`✓ Successfully imported ${result.count} registrations\nBatch ID: ${pendingBatchId}`);
                cleanupModal();
                loadData();
              }

              if (oneByOne) {
                saveImportToHistory({
                  batchId: pendingBatchId,
                  count: registrations.length,
                  importedAt: new Date().toISOString(),
                });
                loadData();
              }
            } catch (err) {
              alert(`Error: ${err?.message || err}`);
              executeBtn.disabled = false;
              executeBtn.textContent = "Import Now";
            }
          });
        }

        overlay?.addEventListener("click", (e) => {
          if (e.target === overlay) cleanupModal();
        });
      };

      // Store referrers for matching
      userIdentity.referrers = new Map();
      const refData = await fetchReferrers(db);
      refData.forEach((ref, code) => {
        userIdentity.referrers.set(code, ref);
      });

      renderStep();
    } catch (err) {
      alert(`שגיאה בקריאת הקובץ: ${err?.message || err}`);
    }
  });
  input.click();
});

getById("import-history-btn").addEventListener("click", () => {
  const history = getImportHistory();

  const existing = document.getElementById("import-history-panel");
  if (existing) { existing.remove(); return; }

  const rows = history.length === 0
    ? `<tr><td colspan="4" style="text-align:center; color: var(--n400); padding: 16px;">אין ייבואים שמורים</td></tr>`
    : history.map(entry => {
        const date = new Date(entry.importedAt).toLocaleString('he-IL');
        return `
          <tr>
            <td style="font-size:11px; color: var(--n500); font-family: monospace;">${escapeHtml(entry.batchId)}</td>
            <td style="text-align:center;">${entry.count}</td>
            <td style="font-size:12px;">${escapeHtml(date)}</td>
            <td>
              <button class="btn revert-btn" data-batch="${escapeHtml(entry.batchId)}" style="font-size:12px; padding: 4px 10px; background:#F44336; color:#fff;">↩ בטל</button>
            </td>
          </tr>`;
      }).join('');

  const panel = document.createElement("div");
  panel.id = "import-history-panel";
  panel.style.cssText = "position:fixed; top:60px; left:50%; transform:translateX(-50%); z-index:9999; background:var(--surface); border:1px solid var(--n300); border-radius:var(--radius-lg); box-shadow:0 8px 32px rgba(0,0,0,0.18); min-width:600px; max-width:90vw; padding:20px; direction:rtl;";
  panel.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
      <h3 style="margin:0; font-size:15px;">ייבואים אחרונים</h3>
      <button id="import-history-close" style="background:none; border:none; font-size:18px; cursor:pointer; color:var(--n500);">✕</button>
    </div>
    <table style="width:100%; border-collapse:collapse; font-size:13px;">
      <thead>
        <tr style="border-bottom:1px solid var(--n200);">
          <th style="text-align:right; padding:6px 8px;">Batch ID</th>
          <th style="text-align:center; padding:6px 8px;">שורות</th>
          <th style="text-align:right; padding:6px 8px;">תאריך</th>
          <th style="padding:6px 8px;"></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  document.body.appendChild(panel);

  panel.querySelector("#import-history-close").addEventListener("click", () => panel.remove());

  panel.querySelectorAll(".revert-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const batchId = btn.dataset.batch;
      if (!confirm(`בטוח שרוצה לבטל את הייבוא?\nBatch: ${batchId}`)) return;
      btn.disabled = true;
      btn.textContent = "מוחק...";
      try {
        const deleted = await revertImport(db, batchId);
        removeImportFromHistory(batchId);
        alert(`✓ נמחקו ${deleted} רשומות`);
        panel.remove();
        loadData();
      } catch (err) {
        alert(`שגיאה: ${err?.message || err}`);
        btn.disabled = false;
        btn.textContent = "↩ בטל";
      }
    });
  });
});
