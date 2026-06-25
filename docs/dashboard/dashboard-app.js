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
  normalizePhone,
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
let moderationFlags = {}; // { submissionId -> { isTest, isDuplicate } }
let lastFetchedData = null; // cached render input

// ─────────────────────────────────────────────────────────────────────────────
// Authentication flow
// ─────────────────────────────────────────────────────────────────────────────

const auditLogin = async (email, status) => {
  try {
    // Readable, sortable doc ID: "2026-06-24T21-03-47_user@example.com"
    const now = new Date();
    const ts = now.toISOString().replace(/:/g, "-").replace(/\.\d{3}Z$/, "Z");
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

if (DEMO_MODE) {
  startDemoMode();
} else {
  onAuthStateChanged(auth, handleAuth);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sticky header shadow on scroll
// ─────────────────────────────────────────────────────────────────────────────

const band = document.querySelector(".band");
window.addEventListener("scroll", () => {
  band.classList.toggle("is-scrolled", window.scrollY > 4);
}, { passive: true });

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

  // Moderation filters: re-render from cached data (no re-fetch). Default "on" = hide
  const reFilterFromCache = (button) => {
    button.classList.toggle("on");
    if (lastFetchedData) render(lastFetchedData);
  };

  getById("dup-toggle").onclick = (event) => reFilterFromCache(event.currentTarget);
  getById("test-toggle").onclick = (event) => reFilterFromCache(event.currentTarget);

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

const buildReferrerCodeMap = (influencerSnapshot, groupSnapshot) => {
  const map = {};

  groupSnapshot.forEach((docSnapshot) => {
    const data = docSnapshot.data() || {};
    if (data.referrerCode != null && data.active !== false) {
      map[String(data.referrerCode)] = {
        influencerId: null,
        groupId: docSnapshot.id,
      };
    }
  });

  influencerSnapshot.forEach((docSnapshot) => {
    const data = docSnapshot.data() || {};
    if (data.referrerCode != null && data.active !== false) {
      map[String(data.referrerCode)] = {
        influencerId: docSnapshot.id,
        groupId: data.groupId || "default",
      };
    }
  });

  return map;
};

const resolveReferrerCode = (code, referrerMap) => {
  const codeStr = String(code == null ? "" : code).trim();
  if (codeStr && referrerMap[codeStr]) return referrerMap[codeStr];
  return { influencerId: null, groupId: "default" };
};

const transformSubmissionToRegistration = (submission, referrerMap) => {
  const referrer = resolveReferrerCode(submission.referrer, referrerMap);
  const phone = normalizePhone(submission.phone);
  const fullName =
    ((submission.firstName || "") + " " + (submission.lastName || "")).trim();

  return {
    id: submission.id,
    name: fullName || "—",
    phoneLast3: phone ? phone.slice(-3) : "",
    phoneCanon: phone || null, // client dedup key (normalized, unsalted)
    email: submission.email || "",
    city: submission.city || "",
    source: submission.source || "",
    influencerId: referrer.influencerId,
    groupId: referrer.groupId,
    sessionId: submission.sessionId || null,
    dailyId: submission.dailyId || null,
    partyRegistered:
      submission.registered === "yes"
        ? true
        : submission.registered === "no"
          ? false
          : null,
    isTest: false, // no server moderation flag on join_form
    isDuplicate: false, // computed in render() from phoneCanon
    createdAt: submission.ts,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Data fetching
// ─────────────────────────────────────────────────────────────────────────────

const fetchJoinFormSubmissions = async () => {
  const toRows = (snapshot) =>
    snapshot.docs.map((docSnapshot) => ({
      id: docSnapshot.id,
      ...docSnapshot.data(),
    }));

  const [legacyResult, newResult] = await Promise.allSettled([
    getDocs(query(collection(db, "join_form"), orderBy("ts", "desc"), limit(SUBMISSION_LIMIT))),
    getDocs(query(collection(db, "form_submissions"), orderBy("ts", "desc"), limit(SUBMISSION_LIMIT))),
  ]);

  const legacy = legacyResult.status === "fulfilled" ? toRows(legacyResult.value) : [];
  const newSubs = newResult.status === "fulfilled" ? toRows(newResult.value) : [];

  if (legacyResult.status === "rejected") console.warn("join_form read skipped", legacyResult.reason?.code || legacyResult.reason);
  if (newResult.status === "rejected") console.warn("form_submissions read skipped", newResult.reason?.code || newResult.reason);

  // Merge and sort by ts descending; keep most recent SUBMISSION_LIMIT entries
  return [...legacy, ...newSubs]
    .sort((a, b) => (toDate(b.ts) || 0) - (toDate(a.ts) || 0))
    .slice(0, SUBMISSION_LIMIT);
};

const fetchModerationFlags = async () => {
  try {
    const snapshot = await getDocs(collection(db, "submission_flags"));
    const flagsMap = {};
    snapshot.forEach((docSnapshot) => {
      flagsMap[docSnapshot.id] = docSnapshot.data() || {};
    });
    return flagsMap;
  } catch (e) {
    console.warn("submission_flags read skipped", e?.code || e);
    return {};
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
  show(getById("loading"));
  hide(getById("content"));

  try {
    const dateRange = getDateRange();
    const isAdmin = userIdentity.role === "admin";
    const [
      submissionsRaw,
      flags,
      registrationsRaw,
      pageViewsAll,
      interactionsAll,
      influencerSnapshot,
      groupSnapshot,
    ] = await Promise.all([
      isAdmin ? fetchJoinFormSubmissions() : Promise.resolve([]),
      isAdmin ? fetchModerationFlags() : Promise.resolve({}),
      isAdmin ? Promise.resolve([]) : fetchScopedData("registrations", "createdAt"),
      fetchScopedData("page_views", "ts"),
      fetchScopedData("interactions", "ts"),
      getDocs(collection(db, "influencers")),
      getDocs(collection(db, "groups")),
    ]);

    moderationFlags = flags;

    const influencerNames = {};
    const groupNames = {};

    influencerSnapshot.forEach((docSnapshot) => {
      influencerNames[docSnapshot.id] =
        docSnapshot.data().name || docSnapshot.id;
    });

    groupSnapshot.forEach((docSnapshot) => {
      groupNames[docSnapshot.id] = docSnapshot.data().name || docSnapshot.id;
    });

    const activeInfluencersCount = influencerSnapshot.docs.filter(
      (d) => d.data().active !== false
    ).length;

    // Admins: transform join_form submissions (raw client captures, no scope fields).
    // Managers/influencers: use registrations (processed by Apps Script, already shaped + scoped server-side).
    let allRegistrations;
    if (isAdmin) {
      const referrerMap = buildReferrerCodeMap(influencerSnapshot, groupSnapshot);
      allRegistrations = submissionsRaw.map((submission) =>
        transformSubmissionToRegistration(submission, referrerMap)
      );
    } else {
      allRegistrations = registrationsRaw;
    }

    // Apply date filter (client-side)
    const registrations = allRegistrations.filter((reg) =>
      isInDateRange(toDate(reg.createdAt), dateRange)
    );
    const pageViews = pageViewsAll.filter((pv) =>
      isInDateRange(toDate(pv.ts), dateRange)
    );
    const interactions = interactionsAll.filter((interaction) =>
      isInDateRange(toDate(interaction.ts), dateRange)
    );

    lastFetchedData = {
      registrations,
      pageViews,
      interactions,
      influencerNames,
      groupNames,
      activeInfluencersCount,
    };

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

const shouldMaskEmail = () => userIdentity.role === "admin";

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

  if (registration.isDuplicate) {
    chips.push('<span class="chip rose">חשד לכפילות</span>');
  }

  if (registration.isTest) {
    chips.push('<span class="chip violet">בדיקה</span>');
  }

  return chips.join(" ") || '<span class="muted">—</span>';
};

const renderRecentSubmissionsSection = (registrations, groupNames) => {
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
          const emailColumn = shouldMaskEmail()
            ? `<td class="muted">${escapeHtml(reg.email || "—")}</td>`
            : "";

          return `<tr>
          <td>${escapeHtml(reg.name || "—")}</td>
          <td class="num">…${escapeHtml(reg.phoneLast3 || "")}</td>
          ${emailColumn}
          <td>${escapeHtml(groupNames[reg.groupId] || "כללי")}</td>
          <td>${createPartyChips(reg)}</td>
          <td class="muted">${formatRelativeTime(toDate(reg.createdAt))}</td>
        </tr>`;
        })
        .join("")
    : `<tr><td colspan="6"><div class="empty">אין הרשמות בטווח שנבחר</div></td></tr>`;

  const emailHeader = shouldMaskEmail() ? "<th>אימייל</th>" : "";

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
            <th>קבוצה</th>
            <th>התפקדות למפלגה</th>
            <th>נרשם/ה</th>
          </tr>
        </thead>
        <tbody>${tableBody}</tbody>
      </table>
    </div>
  </details>`;
};

const renderLeadersSection = (registrations, pageViews, interactions, influencerNames) => {
  const stats = {};

  const ensureInfluencerStats = (influencerId) => {
    if (!stats[influencerId]) {
      stats[influencerId] = { clicks: 0, forms: 0, party: 0, whatsapp: 0 };
    }
    return stats[influencerId];
  };

  pageViews.forEach((pv) => {
    if (pv.influencerId) {
      ensureInfluencerStats(pv.influencerId).clicks++;
    }
  });

  registrations.forEach((reg) => {
    if (reg.influencerId) {
      const influencerStats = ensureInfluencerStats(reg.influencerId);
      influencerStats.forms++;
      if (reg.partyRegistered) influencerStats.party++;
    }
  });

  interactions.forEach((interaction) => {
    if (interaction.influencerId && interaction.type === "whatsapp") {
      ensureInfluencerStats(interaction.influencerId).whatsapp++;
    }
  });

  const influencerIds = Object.keys(stats).sort(
    (a, b) => stats[b].forms - stats[a].forms
  );

  const maxConversion = Math.max(
    1,
    ...influencerIds.map((id) =>
      stats[id].clicks ? stats[id].forms / stats[id].clicks : 0
    )
  );

  const tableBody = influencerIds.length
    ? influencerIds
        .map((id) => {
          const influencerStats = stats[id];
          const conversion = influencerStats.clicks
            ? influencerStats.forms / influencerStats.clicks
            : 0;

          return `<tr>
          <td>${escapeHtml(influencerNames[id] || id)}</td>
          <td class="num">${NUMBER_FORMATTER.format(influencerStats.clicks)}</td>
          <td class="num">${NUMBER_FORMATTER.format(influencerStats.forms)}</td>
          <td class="num">${NUMBER_FORMATTER.format(influencerStats.party)}</td>
          <td class="num">${NUMBER_FORMATTER.format(influencerStats.whatsapp)}</td>
          <td>
            <div class="bar-mini">
              <i style="width:${Math.round((conversion / maxConversion) * 100)}%"></i>
            </div>
          </td>
        </tr>`;
        })
        .join("")
    : `<tr><td colspan="6"><div class="empty">אין נתוני מובילים בטווח</div></td></tr>`;

  return `<details>
    <summary>
      <span class="sum-title">סטטיסטיקות לפי מוביל כוח</span>
      <span class="sum-meta">קליקים · טופס · התפקדות · ווטסאפ ${createChevron()}</span>
    </summary>
    <div class="panel">
      <table>
        <thead>
          <tr>
            <th>מוביל</th>
            <th>קליקים</th>
            <th>טופס</th>
            <th>התפקדות</th>
            <th>ווטסאפ</th>
            <th>המרה</th>
          </tr>
        </thead>
        <tbody>${tableBody}</tbody>
      </table>
    </div>
  </details>`;
};

const renderPageViewsSection = (pageViews, influencerNames) => {
  const uniqueVisitors = new Set(
    pageViews.map((pv) => pv.dailyId).filter(Boolean)
  ).size;

  const sortedRows = pageViews
    .slice()
    .sort((a, b) => (toDate(b.ts) || 0) - (toDate(a.ts) || 0))
    .slice(0, RECENT_ROWS_LIMIT);

  const tableBody = sortedRows.length
    ? sortedRows
        .map((pv) => `<tr>
        <td>${escapeHtml(pv.page || "—")}</td>
        <td class="muted">${escapeHtml(pv.channel || "ישיר")}</td>
        <td class="muted">${escapeHtml(pv.deviceClass || "—")}</td>
        <td>${escapeHtml(influencerNames[pv.influencerId] || "—")}</td>
        <td class="muted">${formatRelativeTime(toDate(pv.ts))}</td>
      </tr>`)
        .join("")
    : `<tr><td colspan="5"><div class="empty">אין צפיות בטווח</div></td></tr>`;

  return `<details>
    <summary>
      <span class="sum-title">צפיות בעמוד</span>
      <span class="sum-meta">${NUMBER_FORMATTER.format(pageViews.length)} צפיות · ${NUMBER_FORMATTER.format(uniqueVisitors)} מבקרים ייחודיים ${createChevron()}</span>
    </summary>
    <div class="panel">
      <table>
        <thead>
          <tr>
            <th>עמוד</th>
            <th>ערוץ</th>
            <th>מכשיר</th>
            <th>מוביל</th>
            <th>זמן</th>
          </tr>
        </thead>
        <tbody>${tableBody}</tbody>
      </table>
    </div>
  </details>`;
};

const render = (data) => {
  const {
    registrations,
    pageViews: pageViewsRaw,
    interactions,
    influencerNames,
    groupNames,
    activeInfluencersCount,
  } = data;

  // Apply the admin moderation overlay (submission_flags) onto each submission.
  registrations.forEach((reg) => {
    const flags = moderationFlags[reg.id];
    if (flags) {
      if (flags.isTest) reg.isTest = true;
      if (flags.isDuplicate) reg.isDuplicate = true;
    }
  });

  // Filter state: "on" = hide that category (default).
  const hideDuplicates = !!getById("dup-toggle") &&
    getById("dup-toggle").classList.contains("on");
  const hideTests = !!getById("test-toggle") &&
    getById("test-toggle").classList.contains("on");

  const pageViews = pageViewsRaw.filter((pv) => !pv.isBot);
  const realRegistrations = registrations.filter((reg) => !reg.isTest);
  const uniqueVisitors = new Set(
    pageViews.map((pv) => pv.dailyId).filter(Boolean)
  ).size;
  const influencerClicks = pageViews.filter((pv) => pv.influencerId).length;
  const countByInteractionType = (type) =>
    interactions.filter((interaction) => interaction.type === type).length;

  // Phone duplicate detection
  const phoneCount = {};
  realRegistrations.forEach((reg) => {
    if (reg.phoneCanon) {
      phoneCount[reg.phoneCanon] = (phoneCount[reg.phoneCanon] || 0) + 1;
    }
  });

  const duplicatePhoneCount = Object.values(phoneCount).filter(
    (n) => n > 1
  ).length;

  realRegistrations.forEach((reg) => {
    if (reg.phoneCanon && phoneCount[reg.phoneCanon] > 1) {
      reg.isDuplicate = true;
    }
  });

  // Counted = real registrations that aren't filtered out by toggles
  const countedRegistrations = hideDuplicates
    ? realRegistrations.filter((reg) => !reg.isDuplicate)
    : realRegistrations;

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

  const lastPageView = pageViews
    .map((pv) => toDate(pv.ts))
    .filter(Boolean)
    .sort((a, b) => b - a)[0];

  // KPI cards
  const isInfluencer = userIdentity.role === "influencer";
  const kpiCards = [];

  if (!isInfluencer) {
    kpiCards.push(
      createStatCard(
        "מובילים",
        NUMBER_FORMATTER.format(activeInfluencersCount),
        false,
        "",
        "מספר המובילים (משפיענים) הפעילים שמפיצים לינקים."
      )
    );
  }

  kpiCards.push(
    createStatCard(
      "מבקרים ייחודיים",
      NUMBER_FORMATTER.format(uniqueVisitors),
      true,
      `תנועה: ${NUMBER_FORMATTER.format(influencerClicks)} קליקים · ${NUMBER_FORMATTER.format(pageViews.length)} צפיות<br>אחרון: ${lastPageView ? "צפייה " + formatRelativeTime(lastPageView) : "—"}`,
      "מבקרים ייחודיים לפי dailyId — נספרים פעם ביום לכל מבקר."
    )
  );

  kpiCards.push(
    createStatCard(
      "הרשמות",
      NUMBER_FORMATTER.format(countedRegistrations.length),
      false,
      `${formatPercentage(countedRegistrations.length, uniqueVisitors)} המרה<br>אחרון: ${lastRegistration ? formatRelativeTime(lastRegistration) : "—"}`,
      hideDuplicates
        ? "סך ההרשמות התקינות (לא כולל בדיקות וכפילויות)."
        : "סך ההרשמות שהתקבלו דרך הטופס (לא כולל בדיקות)."
    )
  );

  if (!isInfluencer) {
    kpiCards.push(
      createStatCard(
        "כפילויות",
        NUMBER_FORMATTER.format(duplicatePhoneCount),
        false,
        "",
        "מספרי טלפון שמופיעים ביותר מהרשמה אחת."
      )
    );
  }

  // Party section
  getById("party-row").innerHTML = [
    createStatCard(
      "סימנו שכבר התפקדו למפלגה",
      NUMBER_FORMATTER.format(partyRegisteredCount),
      true,
      "",
      "נרשמים שדיווחו בעצמם שהם כבר חברי מפלגה. דיווח עצמי — לא מאומת."
    ),
    createStatCard(
      "בדקו התפקדות",
      NUMBER_FORMATTER.format(countByInteractionType("status_check")),
      false,
      "",
      "מי שלחצו לבדוק את סטטוס ההתפקדות."
    ),
    createStatCard(
      "סימנו שלא התפקדו",
      NUMBER_FORMATTER.format(notRegisteredCount),
      false,
      "",
      "נרשמים שדיווחו בעצמם שעדיין אינם חברי מפלגה."
    ),
    createStatCard(
      "לחצו על התפקדות למפלגה",
      NUMBER_FORMATTER.format(countByInteractionType("cta_party")),
      true,
      "",
      "מי שלחצו על כפתור ההתפקדות למפלגה."
    ),
  ].join("");

  // Sections — the recent table shows every submission but drops the categories
  // hidden by the active toggles (tests / duplicates).
  const visibleRegistrations = registrations.filter(
    (reg) => !(hideTests && reg.isTest) && !(hideDuplicates && reg.isDuplicate)
  );

  const sections = [];
  sections.push(
    renderRecentSubmissionsSection(visibleRegistrations, groupNames)
  );

  if (!isInfluencer) {
    sections.push(
      renderLeadersSection(
        countedRegistrations,
        pageViews,
        interactions,
        influencerNames
      )
    );
  }

  sections.push(renderPageViewsSection(pageViews, influencerNames));
  getById("sections").innerHTML = sections.join("");
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

  const leaderNames = [
    "צפי שומר",
    "נופר בן צור",
    "עמוס דורון",
    "טל קורנט",
    "דורית זמיר",
    "ראובן קוסט",
    "הילה גולן",
    "גיא אדוט",
    "דפנה מילר",
    "נורית מלניק",
  ];

  const influencerNames = {};
  leaderNames.forEach((name, index) => {
    influencerNames["infl_" + (index + 1)] = name;
  });

  const groupNames = { default: "כללי", g_tzipi: "צפי שומר" };
  const now = Date.now();
  const ago = (hours) => new Date(now - hours * 3600 * 1000);

  // 28 registrations: 16 party-registered, 4 explicitly not, rest unknown; 2 dup phones
  const registrations = [];
  for (let i = 0; i < 28; i++) {
    const partyStatus =
      i < 16 ? true : i < 20 ? false : null;

    registrations.push({
      id: "r" + i,
      name:
        leaderNames[i % leaderNames.length].replace(/ .*/, " " + "אבגדהוזחטי"[i % 10]),
      phoneLast3: String(100 + ((i % 9) * 7)).slice(-3),
      email: "user" + i + "@example.com",
      phoneCanon: i < 2 ? "DUP_A" : i < 4 ? "DUP_B" : "p" + i, // → 2 duplicate phones
      groupId: i % 6 === 0 ? "g_tzipi" : "default",
      influencerId: "infl_" + ((i % 5) + 1),
      partyRegistered: partyStatus,
      isDuplicate: i < 4,
      isTest: i === 27,
      createdAt: ago(i * 5 + 1),
    });
  }

  // 179 page views, 67 distinct dailyIds, 122 with an influencer (clicks)
  const pageViews = [];
  for (let i = 0; i < 179; i++) {
    pageViews.push({
      id: "v" + i,
      dailyId: "d" + (i % 67),
      sessionId: "s" + i,
      page: i % 3 ? "/candidates" : "/",
      channel: ["WhatsApp", "ישיר", "QR", "Facebook"][i % 4],
      deviceClass: i % 2 ? "Mobile" : "Desktop",
      influencerId: i < 122 ? "infl_" + ((i % 5) + 1) : null,
      ts: ago(i % 72),
    });
  }

  // Interactions: 12 status_check, 4 cta_party, some whatsapp + candidate_open
  const interactions = [];
  for (let i = 0; i < 12; i++) {
    interactions.push({
      id: "sc" + i,
      type: "status_check",
      influencerId: "infl_" + ((i % 5) + 1),
      sessionId: "s" + i,
      dailyId: "d" + i,
      ts: ago(i),
    });
  }

  for (let i = 0; i < 4; i++) {
    interactions.push({
      id: "cp" + i,
      type: "cta_party",
      influencerId: "infl_" + ((i % 3) + 1),
      sessionId: "s" + i,
      dailyId: "d" + i,
      ts: ago(i),
    });
  }

  for (let i = 0; i < 18; i++) {
    interactions.push({
      id: "wa" + i,
      type: "whatsapp",
      influencerId: "infl_" + ((i % 5) + 1),
      sessionId: "s" + i,
      dailyId: "d" + i,
      ts: ago(i),
    });
  }

  try {
    lastFetchedData = {
      registrations,
      pageViews,
      interactions,
      influencerNames,
      groupNames,
      activeInfluencersCount: leaderNames.length,
    };

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
