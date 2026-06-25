// hagush.org.il dashboard — no-build SPA (vanilla ES modules + Firebase CDN).
// Reads the Stage-A Firestore model; role-based views with PII masking.

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
  collection,
  getDocs,
  getDoc,
  doc,
  query,
  where,
  orderBy,
  limit,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { escapeHtml } from "../js/utils/html-escape.js";
import {
  formatPercentage,
  formatRelativeTime,
  toDate,
} from "../js/utils/format.js";
import { getById, show, hide, createHelpTooltip } from "../js/utils/dom.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC7hQs04G8U0BMs9UXrHEurQnxgxN7jmLw",
  authDomain: "hagush-org-il.firebaseapp.com",
  projectId: "hagush-org-il",
  storageBucket: "hagush-org-il.firebasestorage.app",
  messagingSenderId: "674306617225",
  appId: "1:674306617225:web:7f84e8f09bc35222e77b58",
};

const ROLE_LABELS = {
  admin: "מנהל·ת",
  manager: "מנהל·ת תוכן",
  influencer: "מוביל·ה",
};

const DEMO_MODE = new URLSearchParams(location.search).has("demo") ||
  location.hash === "#demo";

const SUBMISSION_LIMIT = 2000;
const DATE_RANGE_LIMIT = 2000;
const RECENT_ROWS_LIMIT = 50;

// ─────────────────────────────────────────────────────────────────────────────
// Firebase initialization
// ─────────────────────────────────────────────────────────────────────────────

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

// ─────────────────────────────────────────────────────────────────────────────
// Formatting utilities
// ─────────────────────────────────────────────────────────────────────────────

const NUMBER_FORMATTER = new Intl.NumberFormat("he-IL");

const createChevron = () =>
  '<svg class="chev" viewBox="0 0 20 20" fill="none"><path d="M6 8l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

let userIdentity = null; // { email, role, scope, groupId, influencerId }
let refreshTimer = null;
let lastFetchedData = null; // cached render input

// ─────────────────────────────────────────────────────────────────────────────
// Authentication flow
// ─────────────────────────────────────────────────────────────────────────────

const auditLogin = async (email, status) => {
  try {
    // Readable, sortable doc ID: "2026-06-24T21-03-47_user@example.com"
    const now = new Date();
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jerusalem",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
    const ts = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}-${parts.minute}-${parts.second}`;
    const docId = `${ts}_${email}`;
    await setDoc(doc(db, "login_events", docId), {
      email,
      status,
      ts: serverTimestamp(),
    });
  } catch (e) {
    /* audit is best-effort */
  }
};

const handleAuth = async (user) => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }

  if (!user) {
    hide(getById("dash"));
    hide(getById("noaccess"));
    show(getById("login"));
    return;
  }

  // Resolve role from Firestore
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
    role: roleData.role, // admin | manager | influencer
    scope: roleData.scope || "full", // full | group
    groupId: roleData.groupId || null,
    influencerId: roleData.influencerId || null,
  };

  hide(getById("login"));
  hide(getById("noaccess"));
  show(getById("dash"));
  try {
    initializeChrome();
  } catch (e) {
    console.error("initializeChrome failed", e);
    getById("loading").innerHTML =
      '<div class="empty">שגיאת אתחול: ' + escapeHtml(e?.message || e) + "</div>";
    return;
  }
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

if (DEMO_MODE) {
  startDemoMode();
} else {
  onAuthStateChanged(auth, handleAuth);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sticky header shadow on scroll
// ─────────────────────────────────────────────────────────────────────────────

const band = document.querySelector(".band");
if (band) {
  window.addEventListener("scroll", () => {
    band.classList.toggle("is-scrolled", window.scrollY > 4);
  }, { passive: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// Header chrome / UI initialization
// ─────────────────────────────────────────────────────────────────────────────

const initializeChrome = () => {
  const roleLabel = ROLE_LABELS[userIdentity.role] || userIdentity.role;
  getById("role-badge").textContent = roleLabel;
  getById("user-email").textContent = userIdentity.email;

  const dashTitle = userIdentity.role === "influencer" ? "הדף שלי" : "לוח ניהול כללי";
  getById("dash-title").textContent = dashTitle;

  getById("filter-btn").onclick = () => loadData();


  const refreshToggle = getById("refresh-toggle");
  refreshToggle.onclick = () => {
    refreshToggle.classList.toggle("on");
    if (refreshToggle.classList.contains("on")) {
      refreshTimer = setInterval(loadData, 30000);
    } else if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Data transformation
// ─────────────────────────────────────────────────────────────────────────────

const resolveReferrerCode = (code) => {
  return { influencerId: null, groupId: code || "default" };
};

const transformSubmissionToRegistration = (submission) => {
  const referrer = resolveReferrerCode(submission.referrer);
  const fullName =
    ((submission.firstName || "") + " " + (submission.lastName || "")).trim();

  return {
    id: submission.id,
    name: fullName || "—",
    phoneLast3: String(submission.phone || "").replace(/\D/g, "").slice(-3),
    email: submission.email || "",
    city: submission.city || "",
    source: submission.source || "",
    influencerId: referrer.influencerId,
    groupId: referrer.groupId,
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

// ─────────────────────────────────────────────────────────────────────────────
// Data fetching
// ─────────────────────────────────────────────────────────────────────────────

const fetchJoinFormSubmissions = async () => {
  try {
    const snapshot = await getDocs(
      query(collection(db, "join_form"), orderBy("ts", "desc"), limit(SUBMISSION_LIMIT))
    );
    return snapshot.docs.map((docSnapshot) => ({
      id: docSnapshot.id,
      ...docSnapshot.data(),
    }));
  } catch (e) {
    console.warn("join_form read skipped", e?.code || e);
    return [];
  }
};


const getDateRange = () => {
  const fromDate = getById("from-date").value
    ? new Date(getById("from-date").value + "T00:00:00")
    : null;
  const toDate = getById("to-date").value
    ? new Date(getById("to-date").value + "T23:59:59")
    : null;
  return { fromDate, toDate };
};

const isInDateRange = (date, range) => {
  if (!date) return false;
  if (range.fromDate && date < range.fromDate) return false;
  if (range.toDate && date > range.toDate) return false;
  return true;
};

const fetchScopedData = async (collectionName, dateField) => {
  let queryObject;

  if (
    userIdentity.role === "influencer" &&
    userIdentity.influencerId
  ) {
    queryObject = query(
      collection(db, collectionName),
      where("influencerId", "==", userIdentity.influencerId),
      orderBy(dateField, "desc"),
      limit(DATE_RANGE_LIMIT)
    );
  } else if (
    userIdentity.role === "manager" &&
    userIdentity.scope === "group" &&
    userIdentity.groupId
  ) {
    queryObject = query(
      collection(db, collectionName),
      where("groupId", "==", userIdentity.groupId),
      orderBy(dateField, "desc"),
      limit(DATE_RANGE_LIMIT)
    );
  } else {
    queryObject = query(
      collection(db, collectionName),
      orderBy(dateField, "desc"),
      limit(DATE_RANGE_LIMIT)
    );
  }

  try {
    const snapshot = await getDocs(queryObject);
    return snapshot.docs.map((docSnapshot) => ({
      id: docSnapshot.id,
      ...docSnapshot.data(),
    }));
  } catch (e) {
    console.warn(`${collectionName} read skipped`, e?.code || e);
    return [];
  }
};

const loadData = async () => {
  if (!userIdentity) return;
  show(getById("loading"));
  hide(getById("content"));

  try {
    const dateRange = getDateRange();
    const [submissionsRaw, interactionsAll] = await Promise.all([
      fetchJoinFormSubmissions(),
      fetchScopedData("interactions", "ts"),
    ]);

    const allRegistrations = submissionsRaw.map(transformSubmissionToRegistration);

    // Apply date filter (client-side)
    const registrations = allRegistrations.filter((reg) =>
      isInDateRange(toDate(reg.createdAt), dateRange)
    );
    const interactions = interactionsAll.filter((interaction) =>
      isInDateRange(toDate(interaction.ts), dateRange)
    );

    lastFetchedData = { registrations, interactions };

    render(lastFetchedData);
    getById("updated").textContent =
      "עודכן " + formatRelativeTime(new Date());
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

// ─────────────────────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────────────────────

const shouldShowEmail = () => userIdentity.role === "admin";

const createStatCard = (label, value, accent, subtext, helpText) => {
  return `<div class="stat ${accent ? "accent" : ""}">
    <p class="label">${escapeHtml(label)} ${helpText ? createHelpTooltip(helpText) : ""}</p>
    <p class="value">${value}</p>
    ${subtext ? `<p class="sub">${subtext}</p>` : ""}
  </div>`;
};

const createPartyChips = (registration) => {
  const chips = [];

  if (registration.partyRegistered) {
    chips.push('<span class="chip green">סימנ/ה שכבר התפקד/ה</span>');
  } else if (registration.partyRegistered === false) {
    chips.push('<span class="chip amber">סימנ/ה שלא התפקד/ה</span>');
  }

  if (registration.status === "duplicate") {
    chips.push('<span class="chip rose">חשד לכפילות</span>');
  } else if (registration.status === "test") {
    chips.push('<span class="chip violet">בדיקה</span>');
  } else if (registration.status === "suspicious") {
    chips.push('<span class="chip amber">חשוד</span>');
  }

  return chips.join(" ") || '<span class="muted">—</span>';
};

const renderRecentSubmissionsSection = (registrations) => {
  const sortedRows = registrations
    .slice()
    .sort(
      (a, b) =>
        (toDate(b.createdAt) || 0) - (toDate(a.createdAt) || 0)
    )
    .slice(0, RECENT_ROWS_LIMIT);

  const tableBody = sortedRows.length
    ? sortedRows
        .map((reg) => {
          const emailColumn = shouldShowEmail()
            ? `<td class="muted">${escapeHtml(reg.email || "—")}</td>`
            : "";

          return `<tr>
          <td>${escapeHtml(reg.name || "—")}</td>
          <td class="num">…${escapeHtml(reg.phoneLast3 || "")}</td>
          ${emailColumn}
          <td>${createPartyChips(reg)}</td>
          <td class="muted">${formatRelativeTime(toDate(reg.createdAt))}</td>
        </tr>`;
        })
        .join("")
    : `<tr><td colspan="${shouldShowEmail() ? 5 : 4}"><div class="empty">אין הרשמות בטווח שנבחר</div></td></tr>`;

  const emailHeader = shouldShowEmail() ? "<th>אימייל</th>" : "";

  return `<details open>
    <summary>
      <span class="sum-title">הרשמות אחרונות</span>
      <span class="sum-meta">${NUMBER_FORMATTER.format(registrations.length)} סה״כ ${createChevron()}</span>
    </summary>
    <div class="panel">
      <table>
        <thead>
          <tr>
            <th>שם</th>
            <th>טלפון</th>
            ${emailHeader}
            <th>התפקדות למפלגה</th>
            <th>נרשם/ה</th>
          </tr>
        </thead>
        <tbody>${tableBody}</tbody>
      </table>
    </div>
  </details>`;
};



const render = (data) => {
  const { registrations, interactions } = data;

  const countedRegistrations = registrations;

  const partyRegisteredCount = countedRegistrations.filter(
    (reg) => reg.partyRegistered
  ).length;
  const notRegisteredCount = countedRegistrations.filter(
    (reg) => reg.partyRegistered === false
  ).length;

  const lastRegistration = countedRegistrations
    .map((reg) => toDate(reg.createdAt))
    .filter(Boolean)
    .sort((a, b) => b - a)[0];

  // KPI cards
  const kpiCards = [];

  kpiCards.push(
    createStatCard(
      "הרשמות",
      NUMBER_FORMATTER.format(countedRegistrations.length),
      false,
      `אחרון: ${lastRegistration ? formatRelativeTime(lastRegistration) : "—"}`,
      "סך ההרשמות שהתקבלו דרך הטופס."
    )
  );

  getById("kpi-row").innerHTML = kpiCards.join("");

  getById("sections").innerHTML = renderRecentSubmissionsSection(registrations);
};

// ─────────────────────────────────────────────────────────────────────────────
// Demo mode (no Firebase, sample data)
// ─────────────────────────────────────────────────────────────────────────────

const startDemoMode = () => {
  userIdentity = {
    email: "demo@hagush.org.il",
    role: "admin",
    scope: "full",
    groupId: null,
    influencerId: null,
  };

  hide(getById("login"));
  hide(getById("noaccess"));
  show(getById("dash"));
  initializeChrome();
  getById("role-badge").textContent = "מנהל·ת (תצוגה)";

  const names = ["צפי שומר", "נופר בן צור", "עמוס דורון", "טל קורנט", "דורית זמיר",
    "ראובן קוסט", "הילה גולן", "גיא אדוט", "דפנה מילר", "נורית מלניק"];
  const now = Date.now();
  const ago = (hours) => new Date(now - hours * 3600 * 1000);

  const registrations = [];
  for (let i = 0; i < 28; i++) {
    registrations.push({
      id: "r" + i,
      name: names[i % names.length].replace(/ .*/, " " + "אבגדהוזחטי"[i % 10]),
      phoneLast3: String(100 + ((i % 9) * 7)).slice(-3),
      email: "user" + i + "@example.com",
      phoneCanon: i < 2 ? "DUP_A" : i < 4 ? "DUP_B" : "p" + i,
      partyRegistered: i < 16 ? true : i < 20 ? false : null,
      status: i < 4 ? "duplicate" : i === 27 ? "test" : "clean",
      createdAt: ago(i * 5 + 1),
    });
  }

  try {
    lastFetchedData = { registrations, interactions: [] };

    render(lastFetchedData);
  } catch (e) {
    console.error("demo render failed", e);
    getById("content").innerHTML =
      '<div class="empty">שגיאת תצוגה: ' +
      escapeHtml(e?.message || e) +
      "</div>";
  } finally {
    hide(getById("loading"));
    show(getById("content")); // always reveal — never leave the spinner stuck
    getById("updated").textContent = "תצוגת דמו · נתונים לדוגמה";
  }
};
