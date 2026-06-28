// Shared auth + role gate for dashboard pages.
// Owns Firebase init, Google sign-in, the login / no-access / dashboard screen
// switching, role resolution, and login auditing — everything that is identical
// across dashboard pages. Page-specific chrome and data loading live in each
// page's own entry module and run via the onReady callback.

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
import { FIREBASE_CONFIG } from "../../js/utils/firebase-config.js";
import { getById, show, hide } from "../../js/utils/dom.js";
import { SEL } from "../dashboard-selectors.js";

export const ROLE_LABELS = {
  admin: "מנהל·ת",
  manager: "מנהל·ת תוכן",
  referrer: "מפנה",
  groupLeader: "מנהל·ת קבוצה",
};

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

/**
 * @typedef {Object} UserIdentity
 * @property {string}      email
 * @property {string}      role
 * @property {string}      scope
 * @property {string|null} groupId
 * @property {string|null} referrerId
 */

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

/**
 * Wires the shared login / no-access / dashboard chrome and resolves the signed-in
 * user's role. Calls `onReady({ db, auth, userIdentity })` exactly once — the first
 * time an authorized user is present — so the page can initialize and load data.
 *
 * Expects these element IDs to exist: login, noaccess, dash, login-btn, login-err,
 * na-email, na-logout, logout-btn. Optionally sets role-badge / user-email if present.
 *
 * @param {{ onReady: (ctx: { db: import("firebase/firestore").Firestore, auth: import("firebase/auth").Auth, userIdentity: UserIdentity }) => void }} params
 */
export const initAuthGate = ({ onReady }) => {
  let ready = false;

  getById(SEL.dashboard.loginBtn)?.addEventListener("click", async () => {
    const btn = getById(SEL.dashboard.loginBtn);
    if (btn.disabled) return;
    btn.disabled = true;
    getById(SEL.dashboard.loginErr).textContent = "";
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      if (err?.code !== "auth/cancelled-popup-request") {
        console.error(err);
        getById(SEL.dashboard.loginErr).textContent = "שגיאה בכניסה: " + (err?.code || err);
      }
    } finally {
      btn.disabled = false;
    }
  });

  getById(SEL.dashboard.logoutBtn)?.addEventListener("click", () => signOut(auth));
  getById(SEL.dashboard.naLogout)?.addEventListener("click", () => signOut(auth));

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      hide(getById(SEL.dashboard.dash));
      hide(getById(SEL.dashboard.noaccess));
      show(getById(SEL.dashboard.login));
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
      getById(SEL.dashboard.naEmail).textContent = user.email;
      hide(getById(SEL.dashboard.login));
      hide(getById(SEL.dashboard.dash));
      show(getById(SEL.dashboard.noaccess));
      return;
    }

    await auditLogin(user.email, "success");

    const userIdentity = {
      email: user.email,
      role: roleData.role,
      scope: roleData.scope || "full",
      groupId: roleData.groupId || null,
      referrerId: roleData.referrerId || null,
    };

    getById(SEL.dashboard.roleBadge) && (getById(SEL.dashboard.roleBadge).textContent = ROLE_LABELS[userIdentity.role] || userIdentity.role);
    getById(SEL.dashboard.userEmail) && (getById(SEL.dashboard.userEmail).textContent = userIdentity.email);

    hide(getById(SEL.dashboard.login));
    hide(getById(SEL.dashboard.noaccess));
    show(getById(SEL.dashboard.dash));

    if (ready) return; // one-time page init; subsequent auth events only toggle screens
    ready = true;
    onReady({ db, auth, userIdentity });
  });
};
