// tracker.js — Firestore visit/signup tracking for hagush.org.il
// Load AFTER the Firebase SDKs. Add these to your <head>:
//
//   <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
//   <script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js"></script>
//   <script src="tracker.js" defer></script>

// ── Replace with YOUR config from the Firebase console ──────────
const firebaseConfig = {
  apiKey:            "AIzaSyC7hQs04G8U0BMs9UXrHEurQnxgxN7jmLw",
  authDomain:        "hagush-org-il.firebaseapp.com",
  projectId:         "hagush-org-il",
  storageBucket:     "hagush-org-il.firebasestorage.app",
  messagingSenderId: "674306617225",
  appId:             "1:674306617225:web:7f84e8f09bc35222e77b58",
};
// ─────────────────────────────────────────────────────────────────

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const referrer = new URLSearchParams(location.search).get("referrer");

// ── 1. Log a "visit" event on page load if ?referrer= is present ──
if (referrer) {
  db.collection("events").add({
    type:      "visit",
    referrer:  referrer,
    url:       location.href,
    page:      location.pathname,
    userAgent: navigator.userAgent,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
  }).catch(() => {});  // analytics must never break the page
}

// ── 2. Log a "signup" event when the form is successfully submitted ──
// Call this from inside your existing submit handler, right after networkOk = true
window.logSignup = function (fields) {
  db.collection("events").add({
    type:      "signup",
    referrer:  fields.referrer || null,
    firstName: fields.firstName || null,
    lastName:  fields.lastName || null,
    phone:     fields.phone || null,
    email:     fields.email || null,
    url:       location.href,
    page:      location.pathname,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
  }).catch(() => {});
};
