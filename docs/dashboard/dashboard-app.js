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
import { escapeHtml } from "../js/utils/html-escape.js";
import { formatRelativeTime, toDate } from "../js/utils/format.js";
import { getById, show, hide } from "../js/utils/dom.js";
import {
  transformSubmissionToRegistration,
  isInDateRange,
  fetchJoinFormSubmissions,
  fetchScopedData,
} from "./data.js";
import { render } from "./render.js";

// ─────────────────────────────────────────────────────────────────────────────
// Config
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

// ─────────────────────────────────────────────────────────────────────────────
// Firebase
// ─────────────────────────────────────────────────────────────────────────────

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

let userIdentity = null; // { email, role, scope, groupId, influencerId }
let refreshTimer = null;

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
    scope: roleData.scope || "full",
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

onAuthStateChanged(auth, handleAuth);

// ─────────────────────────────────────────────────────────────────────────────
// UI
// ─────────────────────────────────────────────────────────────────────────────

const band = document.querySelector(".band");
if (band) {
  window.addEventListener("scroll", () => {
    band.classList.toggle("is-scrolled", window.scrollY > 4);
  }, { passive: true });
}

const initializeChrome = () => {
  getById("role-badge").textContent = ROLE_LABELS[userIdentity.role] || userIdentity.role;
  getById("user-email").textContent = userIdentity.email;
  getById("dash-title").textContent =
    userIdentity.role === "influencer" ? "הדף שלי" : "לוח ניהול כללי";

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
// Data loading
// ─────────────────────────────────────────────────────────────────────────────

const getDateRange = () => {
  const fromDate = getById("from-date").value
    ? new Date(getById("from-date").value + "T00:00:00")
    : null;
  const toDate = getById("to-date").value
    ? new Date(getById("to-date").value + "T23:59:59")
    : null;
  return { fromDate, toDate };
};

const loadData = async () => {
  if (!userIdentity) return;
  show(getById("loading"));
  hide(getById("content"));

  try {
    const dateRange = getDateRange();
    const [submissionsRaw, interactionsAll] = await Promise.all([
      fetchJoinFormSubmissions(db),
      fetchScopedData(db, userIdentity, "interactions", "ts"),
    ]);

    const registrations = submissionsRaw
      .map(transformSubmissionToRegistration)
      .filter((reg) => isInDateRange(toDate(reg.createdAt), dateRange));

    const interactions = interactionsAll
      .filter((i) => isInDateRange(toDate(i.ts), dateRange));

    render({ registrations, interactions, userRole: userIdentity.role });
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
