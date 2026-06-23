// hagush.org.il dashboard — no-build SPA (vanilla ES modules + Firebase CDN).
// Reads the Stage-A Firestore model; role-based views with PII masking.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, getDocs, getDoc, doc, query, where, orderBy, limit,
  addDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { openBackoffice } from "./backoffice.js";

// Public client config (safe to expose; security is Rules + Auth).
const firebaseConfig = {
  apiKey: "AIzaSyC7hQs04G8U0BMs9UXrHEurQnxgxN7jmLw",
  authDomain: "hagush-org-il.firebaseapp.com",
  projectId: "hagush-org-il",
  storageBucket: "hagush-org-il.firebasestorage.app",
  messagingSenderId: "674306617225",
  appId: "1:674306617225:web:7f84e8f09bc35222e77b58",
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ── DOM helpers ───────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const show = (el) => el.classList.remove("hidden");
const hide = (el) => el.classList.add("hidden");
const nf = new Intl.NumberFormat("he-IL");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;" }[c]));
function pct(a, b) { return b > 0 ? Math.round((a / b) * 1000) / 10 + "%" : "0%"; }
function relTime(d) {
  if (!d) return "—";
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "לפני " + s + " שנ׳";
  if (s < 3600) return "לפני " + Math.floor(s / 60) + " דק׳";
  if (s < 86400) return "לפני " + Math.floor(s / 3600) + " שע׳";
  return "לפני " + Math.floor(s / 86400) + " ימים";
}
function tsToDate(v) { return v && typeof v.toDate === "function" ? v.toDate() : (v ? new Date(v) : null); }
function help(text) { return `<span class="help" tabindex="0">?<span class="tip">${esc(text)}</span></span>`; }

let identity = null;      // { email, role, scope, groupId, influencerId }
let refTimer = null;

// Demo mode: open with ?demo  → render the full UI with sample data, no login.
const DEMO = new URLSearchParams(location.search).has("demo") || location.hash === "#demo";

// ── Auth flow ─────────────────────────────────────────────────────────────
$("login-btn").addEventListener("click", async () => {
  $("login-err").textContent = "";
  try { await signInWithPopup(auth, new GoogleAuthProvider()); }
  catch (err) { console.error(err); $("login-err").textContent = "שגיאה בכניסה: " + (err?.code || err); }
});
$("logout-btn").addEventListener("click", () => signOut(auth));
$("na-logout").addEventListener("click", () => signOut(auth));

async function audit(email, status) {
  try { await addDoc(collection(db, "login_events"), { email, status, ts: serverTimestamp() }); }
  catch (e) { /* audit is best-effort */ }
}

async function handleAuth(user) {
  if (refTimer) { clearInterval(refTimer); refTimer = null; }
  if (!user) { hide($("dash")); hide($("noaccess")); show($("login")); return; }
  // Resolve role
  let roleData = null;
  try { const snap = await getDoc(doc(db, "roles", user.email)); if (snap.exists()) roleData = snap.data(); }
  catch (e) { console.error("role read failed", e); }

  if (!roleData || roleData.active !== true) {
    await audit(user.email, "forbidden");
    $("na-email").textContent = user.email;
    hide($("login")); hide($("dash")); show($("noaccess"));
    return;
  }
  await audit(user.email, "success");
  identity = {
    email: user.email,
    role: roleData.role,                 // admin | manager | influencer
    scope: roleData.scope || "full",     // full | group
    groupId: roleData.groupId || null,
    influencerId: roleData.influencerId || null,
  };
  hide($("login")); hide($("noaccess")); show($("dash"));
  initChrome();
  loadData();
}

if (DEMO) startDemo(); else onAuthStateChanged(auth, handleAuth);

// ── Header chrome ─────────────────────────────────────────────────────────
function initChrome() {
  const roleLabel = { admin: "מנהל·ת", manager: "מנהל·ת תוכן", influencer: "מוביל·ה" }[identity.role] || identity.role;
  $("role-badge").textContent = roleLabel;
  $("user-email").textContent = identity.email;
  $("dash-title").textContent = identity.role === "influencer" ? "הדף שלי" : "לוח ניהול כללי";
  if (identity.role === "admin") show($("manage-btn"));
  $("manage-btn").onclick = (e) => { e.preventDefault(); openBackoffice(db, DEMO); };
  $("filter-btn").onclick = () => loadData();
  const toggle = $("refresh-toggle");
  toggle.onclick = () => {
    toggle.classList.toggle("on");
    if (toggle.classList.contains("on")) { refTimer = setInterval(loadData, 30000); }
    else if (refTimer) { clearInterval(refTimer); refTimer = null; }
  };
}

// ── Submission source (UI-written, replaces the Apps Script mirror) ─────────
// The dashboard's registrations now come from `form_submissions` — the raw
// submission the public form writes to Firestore directly (tracker.js
// captureFormSubmission). The old `registrations` collection (populated by the
// Apps Script / Google Sheets mirror) is no longer read.
//
// NOTE: `form_submissions` reads are admin-only in firestore.rules and the docs
// carry no influencerId/groupId, so manager/influencer scoped views cannot be
// served from this collection without a rules + data rework. Scoping below is
// applied client-side (after referrer resolution) so it still works if the rules
// are later relaxed; today only the admin role can read this collection.

function normPhone_(raw) {
  let s = String(raw || "").replace(/\D/g, "");
  if (!s) return "";
  if (s.indexOf("972") === 0) { /* already international */ }
  else if (s.charAt(0) === "0") { s = "972" + s.slice(1); }
  else if (s.length === 9) { s = "972" + s; }   // missing leading 0
  return s;
}

// Build { referrerCode -> { influencerId, groupId } } from groups + influencers.
// Mirrors firestore_mirror.gs getReferrerMap_: a group may own a code; an
// influencer code overrides and also carries its groupId.
function buildReferrerMap(inflSnap, grpSnap) {
  const map = {};
  grpSnap.forEach((d) => {
    const o = d.data() || {};
    if (o.referrerCode != null && o.active !== false) map[String(o.referrerCode)] = { influencerId: null, groupId: d.id };
  });
  inflSnap.forEach((d) => {
    const o = d.data() || {};
    if (o.referrerCode != null && o.active !== false) map[String(o.referrerCode)] = { influencerId: d.id, groupId: o.groupId || "default" };
  });
  return map;
}
function resolveReferrer(code, map) {
  const c = String(code == null ? "" : code).trim();
  if (c && map[c]) return map[c];
  return { influencerId: null, groupId: "default" };   // default group
}

// Map a raw form_submissions doc to the shape render()/sections expect.
function mapSubmission(s, map) {
  const ref = resolveReferrer(s.referrer, map);
  const phone = normPhone_(s.phone);
  const name = ((s.firstName || "") + " " + (s.lastName || "")).trim();
  return {
    id: s.id,
    name: name || "—",
    phoneLast3: phone ? phone.slice(-3) : "",
    phoneCanon: phone || null,                 // client dedup key (normalized, unsalted)
    email: s.email || "",
    city: s.city || "",
    source: s.source || "",
    influencerId: ref.influencerId,
    groupId: ref.groupId,
    sessionId: s.sessionId || null,
    dailyId: s.dailyId || null,
    partyRegistered: s.registered === "yes" ? true : (s.registered === "no" ? false : null),
    isTest: false,                             // no server moderation flag on form_submissions
    isDuplicate: false,                        // computed in render() from phoneCanon
    createdAt: s.ts,
  };
}

// Read recent join submissions (ordered by ts; formType filtered client-side to
// avoid a composite index, matching the rest of the dashboard's query style).
async function fetchSubmissions() {
  const snap = await getDocs(query(collection(db, "form_submissions"), orderBy("ts", "desc"), limit(2000)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => (x.formType || "join") === "join");
}

// ── Data loading ──────────────────────────────────────────────────────────
// Scope a query: influencer → own influencerId; group-manager → own groupId;
// admin / full-manager → unfiltered (ordered + capped). Avoids composite indexes.
async function fetchScoped(name, dateField) {
  let q;
  if (identity.role === "influencer" && identity.influencerId) {
    q = query(collection(db, name), where("influencerId", "==", identity.influencerId), limit(2000));
  } else if (identity.role === "manager" && identity.scope === "group" && identity.groupId) {
    q = query(collection(db, name), where("groupId", "==", identity.groupId), limit(2000));
  } else {
    q = query(collection(db, name), orderBy(dateField, "desc"), limit(2000));
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function dateRange() {
  const f = $("from-date").value ? new Date($("from-date").value + "T00:00:00") : null;
  const t = $("to-date").value ? new Date($("to-date").value + "T23:59:59") : null;
  return { f, t };
}
function inRange(d, r) { if (!d) return false; if (r.f && d < r.f) return false; if (r.t && d > r.t) return false; return true; }

async function loadData() {
  show($("loading")); hide($("content"));
  try {
    const r = dateRange();
    const [subsRaw, pvAll, intAll, inflSnap, grpSnap] = await Promise.all([
      fetchSubmissions(),
      fetchScoped("page_views", "ts"),
      fetchScoped("interactions", "ts"),
      getDocs(collection(db, "influencers")),
      getDocs(collection(db, "groups")),
    ]);
    const inflName = {}, grpName = {};
    inflSnap.forEach((d) => (inflName[d.id] = d.data().name || d.id));
    grpSnap.forEach((d) => (grpName[d.id] = d.data().name || d.id));
    const influencersActive = inflSnap.docs.filter((d) => d.data().active !== false).length;

    // Map raw UI submissions → registration shape, resolving referrer codes.
    const refMap = buildReferrerMap(inflSnap, grpSnap);
    let regsAll = subsRaw.map((s) => mapSubmission(s, refMap));
    // Scope client-side (form_submissions carries no scope fields server-side).
    if (identity.role === "influencer" && identity.influencerId) {
      regsAll = regsAll.filter((x) => x.influencerId === identity.influencerId);
    } else if (identity.role === "manager" && identity.scope === "group" && identity.groupId) {
      regsAll = regsAll.filter((x) => x.groupId === identity.groupId);
    }

    // date filter (client-side)
    const regs = regsAll.filter((x) => inRange(tsToDate(x.createdAt), r));
    const pv = pvAll.filter((x) => inRange(tsToDate(x.ts), r));
    const inter = intAll.filter((x) => inRange(tsToDate(x.ts), r));

    render({ regs, pv, inter, inflName, grpName, influencersActive });
    $("updated").textContent = "עודכן " + relTime(new Date());
    hide($("loading")); show($("content"));
  } catch (e) {
    console.error(e);
    $("loading").innerHTML = '<div class="empty">שגיאה בטעינת הנתונים: ' + esc(e?.code || e?.message || e) + "</div>";
  }
}

// ── Rendering ─────────────────────────────────────────────────────────────
function render(d) {
  const { regs, pv: pvRaw, inter, inflName, grpName, influencersActive } = d;
  const pv = pvRaw.filter((x) => !x.isBot);   // exclude flagged bot traffic from all views
  const real = regs.filter((x) => !x.isTest);
  const uniques = new Set(pv.map((x) => x.dailyId).filter(Boolean)).size;
  const clicks = pv.filter((x) => x.influencerId).length;
  const byType = (t) => inter.filter((x) => x.type === t).length;

  // phoneCanon duplicates
  const phoneCount = {};
  real.forEach((x) => { if (x.phoneCanon) phoneCount[x.phoneCanon] = (phoneCount[x.phoneCanon] || 0) + 1; });
  const duplicates = Object.values(phoneCount).filter((n) => n > 1).length;
  // No server moderation flag on form_submissions → derive the per-row duplicate
  // chip from the phone counts above.
  real.forEach((x) => { if (x.phoneCanon && phoneCount[x.phoneCanon] > 1) x.isDuplicate = true; });

  const registeredParty = real.filter((x) => x.partyRegistered).length;
  const notRegistered = real.filter((x) => x.partyRegistered === false).length;
  const lastReg = real.map((x) => tsToDate(x.createdAt)).filter(Boolean).sort((a, b) => b - a)[0];
  const lastPv = pv.map((x) => tsToDate(x.ts)).filter(Boolean).sort((a, b) => b - a)[0];

  // KPI cards (influencer hides duplicates + leaders)
  const isInfl = identity.role === "influencer";
  const kpis = [];
  if (!isInfl) kpis.push(card("מובילים", nf.format(influencersActive), false, "", "מספר המובילים (משפיענים) הפעילים שמפיצים לינקים."));
  kpis.push(card("מבקרים ייחודיים", nf.format(uniques), true,
    `תנועה: ${nf.format(clicks)} קליקים · ${nf.format(pv.length)} צפיות<br>אחרון: ${lastPv ? "צפייה " + relTime(lastPv) : "—"}`,
    "מבקרים ייחודיים לפי dailyId — נספרים פעם ביום לכל מבקר."));
  kpis.push(card("הרשמות", nf.format(real.length), false,
    `${pct(real.length, uniques)} המרה<br>אחרון: ${lastReg ? relTime(lastReg) : "—"}`,
    "סך ההרשמות שהתקבלו דרך הטופס (לא כולל בדיקות)."));
  if (!isInfl) kpis.push(card("כפילויות", nf.format(duplicates), false, "", "מספרי טלפון שמופיעים ביותר מהרשמה אחת."));
  $("kpi-row").innerHTML = kpis.join("");

  // Party section
  $("party-row").innerHTML = [
    card("סימנו שכבר התפקדו למפלגה", nf.format(registeredParty), true, "", "נרשמים שדיווחו בעצמם שהם כבר חברי מפלגה. דיווח עצמי — לא מאומת."),
    card("בדקו התפקדות", nf.format(byType("status_check")), false, "", "מי שלחצו לבדוק את סטטוס ההתפקדות."),
    card("סימנו שלא התפקדו", nf.format(notRegistered), false, "", "נרשמים שדיווחו בעצמם שעדיין אינם חברי מפלגה."),
    card("לחצו על התפקדות למפלגה", nf.format(byType("cta_party")), true, "", "מי שלחצו על כפתור ההתפקדות למפלגה."),
  ].join("");

  // Sections
  const sections = [];
  sections.push(sectionRecent(real, grpName));
  if (!isInfl) sections.push(sectionLeaders(real, pv, inter, inflName));
  sections.push(sectionPageViews(pv, inflName));
  $("sections").innerHTML = sections.join("");
}

function card(label, value, accent, sub, info) {
  return `<div class="stat ${accent ? "accent" : ""}">
    <p class="label">${esc(label)} ${info ? help(info) : ""}</p>
    <p class="value">${value}</p>
    ${sub ? `<p class="sub">${sub}</p>` : ""}
  </div>`;
}
function chev() { return '<svg class="chev" viewBox="0 0 20 20" fill="none"><path d="M6 8l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
function maskEmail() { return identity.role === "admin"; } // only admin sees email

function partyChips(x) {
  const out = [];
  if (x.partyRegistered) out.push('<span class="chip green">סימנ/ה שכבר התפקד/ה</span>');
  else if (x.partyRegistered === false) out.push('<span class="chip amber">סימנ/ה שלא התפקד/ה</span>');
  if (x.isDuplicate) out.push('<span class="chip rose">חשד לכפילות</span>');
  if (x.isTest) out.push('<span class="chip violet">בדיקה</span>');
  return out.join(" ") || '<span class="muted">—</span>';
}

function sectionRecent(regs, grpName) {
  const rows = regs.slice().sort((a, b) => (tsToDate(b.createdAt) || 0) - (tsToDate(a.createdAt) || 0)).slice(0, 50);
  const body = rows.length ? rows.map((x) => `<tr>
      <td>${esc(x.name || "—")}</td>
      <td class="num">…${esc(x.phoneLast3 || "")}</td>
      ${maskEmail() ? `<td class="muted">${esc(x.email || "—")}</td>` : ""}
      <td>${esc(grpName[x.groupId] || "כללי")}</td>
      <td>${partyChips(x)}</td>
      <td class="muted">${relTime(tsToDate(x.createdAt))}</td>
    </tr>`).join("") : `<tr><td colspan="6"><div class="empty">אין הרשמות בטווח שנבחר</div></td></tr>`;
  return `<details open><summary><span class="sum-title">הרשמות אחרונות</span>
      <span class="sum-meta">${nf.format(regs.length)} סה״כ ${chev()}</span></summary>
    <div class="panel"><table><thead><tr>
      <th>שם</th><th>טלפון</th>${maskEmail() ? "<th>אימייל</th>" : ""}<th>קבוצה</th><th>התפקדות למפלגה</th><th>נרשם/ה</th>
    </tr></thead><tbody>${body}</tbody></table></div></details>`;
}

function sectionLeaders(regs, pv, inter, inflName) {
  const stats = {};
  const ensure = (id) => (stats[id] = stats[id] || { clicks: 0, forms: 0, party: 0, wa: 0 });
  pv.forEach((x) => { if (x.influencerId) ensure(x.influencerId).clicks++; });
  regs.forEach((x) => { if (x.influencerId) { const s = ensure(x.influencerId); s.forms++; if (x.partyRegistered) s.party++; } });
  inter.forEach((x) => { if (x.influencerId && x.type === "whatsapp") ensure(x.influencerId).wa++; });
  const ids = Object.keys(stats).sort((a, b) => stats[b].forms - stats[a].forms);
  const maxConv = Math.max(1, ...ids.map((id) => (stats[id].clicks ? stats[id].forms / stats[id].clicks : 0)));
  const body = ids.length ? ids.map((id) => {
    const s = stats[id]; const conv = s.clicks ? s.forms / s.clicks : 0;
    return `<tr><td>${esc(inflName[id] || id)}</td>
      <td class="num">${nf.format(s.clicks)}</td><td class="num">${nf.format(s.forms)}</td>
      <td class="num">${nf.format(s.party)}</td><td class="num">${nf.format(s.wa)}</td>
      <td><div class="bar-mini"><i style="width:${Math.round((conv / maxConv) * 100)}%"></i></div></td></tr>`;
  }).join("") : `<tr><td colspan="6"><div class="empty">אין נתוני מובילים בטווח</div></td></tr>`;
  return `<details><summary><span class="sum-title">סטטיסטיקות לפי מוביל כוח</span>
      <span class="sum-meta">קליקים · טופס · התפקדות · ווטסאפ ${chev()}</span></summary>
    <div class="panel"><table><thead><tr>
      <th>מוביל</th><th>קליקים</th><th>טופס</th><th>התפקדות</th><th>ווטסאפ</th><th>המרה</th>
    </tr></thead><tbody>${body}</tbody></table></div></details>`;
}

// ── Demo mode (no Firebase, sample data) ────────────────────────────────────
function startDemo() {
  identity = { email: "demo@hagush.org.il", role: "admin", scope: "full", groupId: null, influencerId: null };
  hide($("login")); hide($("noaccess")); show($("dash"));
  initChrome();
  $("role-badge").textContent = "מנהל·ת (תצוגה)";

  const leaders = ["צפי שומר", "נופר בן צור", "עמוס דורון", "טל קורנט", "דורית זמיר",
    "ראובן קוסט", "הילה גולן", "גיא אדוט", "דפנה מילר", "נורית מלניק"];
  const inflName = {}; leaders.forEach((n, i) => (inflName["infl_" + (i + 1)] = n));
  const grpName = { default: "כללי", g_tzipi: "צפי שומר" };
  const now = Date.now(); const ago = (h) => new Date(now - h * 3600 * 1000);

  // 28 registrations: 16 party-registered, 4 explicitly not, rest unknown; 2 dup phones
  const regs = [];
  for (let i = 0; i < 28; i++) {
    const party = i < 16 ? true : i < 20 ? false : null;
    regs.push({
      id: "r" + i, name: leaders[i % leaders.length].replace(/ .*/, " " + "אבגדהוזחטי"[i % 10]),
      phoneLast3: String(100 + (i % 9) * 7).slice(-3), email: "user" + i + "@example.com",
      phoneCanon: i < 2 ? "DUP_A" : i < 4 ? "DUP_B" : "p" + i,   // → 2 duplicate phones
      groupId: i % 6 === 0 ? "g_tzipi" : "default",
      influencerId: "infl_" + ((i % 5) + 1), partyRegistered: party,
      isDuplicate: i < 4, isTest: i === 27, createdAt: ago(i * 5 + 1),
    });
  }
  // 179 page views, 67 distinct dailyIds, 122 with an influencer (clicks)
  const pv = [];
  for (let i = 0; i < 179; i++) pv.push({
    id: "v" + i, dailyId: "d" + (i % 67), sessionId: "s" + i, page: i % 3 ? "/candidates" : "/",
    channel: ["WhatsApp", "ישיר", "QR", "Facebook"][i % 4], medium: i % 4 === 2 ? "qr" : "web",
    deviceClass: i % 2 ? "Mobile" : "Desktop",
    influencerId: i < 122 ? "infl_" + ((i % 5) + 1) : null, ts: ago(i % 72),
  });
  // interactions: 12 status_check, 4 cta_party, some whatsapp + candidate_open
  const inter = [];
  for (let i = 0; i < 12; i++) inter.push({ id: "sc" + i, type: "status_check", influencerId: "infl_" + ((i % 5) + 1), sessionId: "s" + i, dailyId: "d" + i, ts: ago(i) });
  for (let i = 0; i < 4; i++) inter.push({ id: "cp" + i, type: "cta_party", influencerId: "infl_" + ((i % 3) + 1), sessionId: "s" + i, dailyId: "d" + i, ts: ago(i) });
  for (let i = 0; i < 18; i++) inter.push({ id: "wa" + i, type: "whatsapp", influencerId: "infl_" + ((i % 5) + 1), sessionId: "s" + i, dailyId: "d" + i, ts: ago(i) });

  try {
    render({ regs, pv, inter, inflName, grpName, influencersActive: leaders.length });
  } catch (e) {
    console.error("demo render failed", e);
    $("content").innerHTML = '<div class="empty">שגיאת תצוגה: ' + esc(e?.message || e) + "</div>";
  } finally {
    hide($("loading")); show($("content"));   // always reveal — never leave the spinner stuck
    $("updated").textContent = "תצוגת דמו · נתונים לדוגמה";
  }
}

function sectionPageViews(pv, inflName) {
  const uniques = new Set(pv.map((x) => x.dailyId).filter(Boolean)).size;
  const rows = pv.slice().sort((a, b) => (tsToDate(b.ts) || 0) - (tsToDate(a.ts) || 0)).slice(0, 50);
  const body = rows.length ? rows.map((x) => `<tr>
      <td>${esc(x.page || "—")}</td><td class="muted">${esc(x.channel || x.medium || "ישיר")}</td>
      <td class="muted">${esc(x.deviceClass || "—")}</td><td>${esc(inflName[x.influencerId] || "—")}</td>
      <td class="muted">${relTime(tsToDate(x.ts))}</td></tr>`).join("")
    : `<tr><td colspan="5"><div class="empty">אין צפיות בטווח</div></td></tr>`;
  return `<details><summary><span class="sum-title">צפיות בעמוד</span>
      <span class="sum-meta">${nf.format(pv.length)} צפיות · ${nf.format(uniques)} מבקרים ייחודיים ${chev()}</span></summary>
    <div class="panel"><table><thead><tr>
      <th>עמוד</th><th>ערוץ</th><th>מכשיר</th><th>מוביל</th><th>זמן</th>
    </tr></thead><tbody>${body}</tbody></table></div></details>`;
}
