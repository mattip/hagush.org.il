// NOTE: This is reference-only and is NOT used at runtime.
//
// The dashboard is a no-build SPA that loads Firebase from the CDN as ES modules
// and inlines the (public) firebaseConfig in `docs/dashboard/app.js`. It cannot
// import this file at runtime anyway — `firebase/` lives outside the published
// `docs/` root that GitHub Pages serves.
//
// The bare `import { initializeApp } from "firebase/app"` npm style does not work
// in the browser without a bundler, which we intentionally don't use.
//
// This file can be deleted; it's kept only as a record of the public config:
//
// const firebaseConfig = {
//   apiKey: "AIzaSyC7hQs04G8U0BMs9UXrHEurQnxgxN7jmLw",
//   authDomain: "hagush-org-il.firebaseapp.com",
//   projectId: "hagush-org-il",
//   storageBucket: "hagush-org-il.firebasestorage.app",
//   messagingSenderId: "674306617225",
//   appId: "1:674306617225:web:7f84e8f09bc35222e77b58",
// };
