// tracker.js — privacy-minimal client telemetry for hagush.org.il
// Writes anonymous, rules-validated `page_views` + `interactions` to Firestore.
// NO PII ever. Two ids:
//   sessionId — sessionStorage, per visit/tab.
//   dailyId   — localStorage, rotates every calendar day (unique-visitor/day).
// Privacy: DNT → session-only (dailyId = sessionId, nothing persisted).
//          opt-out (localStorage hagush_optout=1) → fully off, no writes.
// Firebase is loaded lazily (after the page is idle) so it never blocks render.
//
// Public client config — safe to expose; security is Firestore Rules + the
// validated anonymous-create rules for page_views/interactions.
const firebaseConfig = {
  apiKey: "AIzaSyC7hQs04G8U0BMs9UXrHEurQnxgxN7jmLw",
  authDomain: "hagush-org-il.firebaseapp.com",
  projectId: "hagush-org-il",
  storageBucket: "hagush-org-il.firebasestorage.app",
  messagingSenderId: "674306617225",
  appId: "1:674306617225:web:7f84e8f09bc35222e77b58",
};

const SID_KEY = "hagush_sid", DAILY_KEY = "hagush_daily", OPTOUT_KEY = "hagush_optout";
const ua = navigator.userAgent || "";
const params = new URLSearchParams(location.search);

function dnt() {
  return navigator.doNotTrack === "1" || window.doNotTrack === "1" || navigator.msDoNotTrack === "1";
}
function optedOut() { try { return localStorage.getItem(OPTOUT_KEY) === "1"; } catch (e) { return false; } }
function uuid() {
  try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
  return "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
function sessionId() {
  try { let s = sessionStorage.getItem(SID_KEY); if (!s) { s = uuid(); sessionStorage.setItem(SID_KEY, s); } return s; }
  catch (e) { return uuid(); }
}
function dailyId() {
  if (dnt()) return sessionId();   // DNT → session-only, nothing persisted
  try {
    const today = new Date().toISOString().slice(0, 10);
    const raw = localStorage.getItem(DAILY_KEY);
    let obj = raw ? JSON.parse(raw) : null;
    if (!obj || obj.date !== today) { obj = { id: uuid(), date: today }; localStorage.setItem(DAILY_KEY, JSON.stringify(obj)); }
    return obj.id;
  } catch (e) { return sessionId(); }
}

// Expose ids so the join form / candidate popup can stitch records to the visit.
window.hagushIds = () => ({ sessionId: sessionId(), dailyId: dailyId() });

function pageName() { return (location.pathname.replace(/index\.html$/, "") || "/"); }
function deviceClass() { return /Mobi|Android|iPhone|iPad|iPod/i.test(ua) ? "Mobile" : "Desktop"; }
function isBot() { return /bot|crawl|spider|slurp|headless|preview|facebookexternalhit/i.test(ua); }
function medium() {
  const m = (params.get("m") || params.get("utm_medium") || "").toLowerCase();
  return m === "qr" ? "qr" : "web";
}
function channel() {
  const utm = params.get("utm_source");
  if (utm) return utm.slice(0, 200);
  try { return document.referrer ? new URL(document.referrer).hostname.slice(0, 200) : "direct"; }
  catch (e) { return "direct"; }
}
function weekKey(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const ys = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const wk = Math.ceil((((t - ys) / 86400000) + 1) / 7);
  return t.getUTCFullYear() + "-W" + String(wk).padStart(2, "0");
}

// ── Lazy Firestore ────────────────────────────────────────────────────────
let _fsP = null;
function getFs() {
  if (_fsP) return _fsP;
  _fsP = (async () => {
    const [appMod, fsMod] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"),
    ]);
    const app = appMod.initializeApp(firebaseConfig);
    return { db: fsMod.getFirestore(app), collection: fsMod.collection, addDoc: fsMod.addDoc, serverTimestamp: fsMod.serverTimestamp };
  })();
  return _fsP;
}

async function write(coll, fields) {
  if (optedOut()) return;                 // hard opt-out → no telemetry at all
  try {
    const fs = await getFs();
    await fs.addDoc(fs.collection(fs.db, coll), { ...fields, ts: fs.serverTimestamp() });
  } catch (e) { /* telemetry must never break the page */ }
}

const now = new Date();
const base = () => ({ sessionId: sessionId(), dailyId: dailyId(), page: pageName(), weekKey: weekKey(now) });

function trackPageView() {
  write("page_views", { ...base(), medium: medium(), channel: channel(), deviceClass: deviceClass(), isBot: isBot() });
}
// Public: window.hagushTrack('form_started', { field: 'phone' })
function track(type, detail) {
  const allowed = ["candidate_open","form_started","field_dropoff","validation_error",
    "submit_attempt","cta_join","cta_party","whatsapp","status_check","scroll_reached_form","dwell"];
  if (allowed.indexOf(type) < 0) return;
  const doc = { ...base(), type };
  if (detail && typeof detail === "object") doc.detail = detail;
  write("interactions", doc);
}
window.hagushTrack = track;

// ── Auto-instrumentation (guarded; all selectors null-safe) ────────────────
function instrument() {
  const form = document.getElementById("joinForm");
  if (form) {
    let started = false;
    form.addEventListener("focusin", () => { if (!started) { started = true; track("form_started"); } }, { once: false });
    form.addEventListener("submit", () => track("submit_attempt"), { capture: true });
  }
  // scroll_reached_form (once)
  const anchor = document.getElementById("signup") || form;
  if (anchor && "IntersectionObserver" in window) {
    let seen = false;
    const io = new IntersectionObserver((ents) => {
      ents.forEach((en) => { if (en.isIntersecting && !seen) { seen = true; track("scroll_reached_form"); io.disconnect(); } });
    }, { threshold: 0.4 });
    io.observe(anchor);
  }
  // CTA / WhatsApp / status-check clicks (delegated).
  // Explicit data-track="..." wins; otherwise heuristics. status_check is
  // checked BEFORE cta_party because the "check you're registered" link shares
  // the democrats.org.il host with the party-registration link.
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("a,button,[data-track]");
    if (!a) return;
    const explicit = a.getAttribute("data-track");
    if (explicit) { track(explicit); return; }
    const href = (a.getAttribute("href") || "").toLowerCase();
    const txt = (a.textContent || "").trim();
    if (href.indexOf("wa.me") >= 0 || href.indexOf("whatsapp") >= 0) track("whatsapp");
    else if (/רשומ|לבדוק|סטטוס|בדיק/.test(txt)) track("status_check");
    else if (href.indexOf("democrats.org.il") >= 0 || /התפקד/.test(txt)) track("cta_party");
    else if (href.indexOf("#signup") >= 0) track("cta_join");
  }, { capture: true });
}

// Defer everything until idle so render is never blocked.
function start() {
  if (optedOut()) return;
  trackPageView();
  instrument();
}
if ("requestIdleCallback" in window) requestIdleCallback(start, { timeout: 3000 });
else setTimeout(start, 1200);
