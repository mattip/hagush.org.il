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
