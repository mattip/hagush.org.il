# Referrers Management Module

This directory contains the referrer (motivator) management functionality for the dashboard.

## Directory Structure

```
referrers/
├── index.html              Static HTML page (entry point)
├── page.js                 Page entry point - handles auth, data loading, event listeners
├── referrers.js            Data layer - Firestore queries and pure aggregation functions
├── layout.component.js     HTML layout component for page structure
├── init.js                 Optional dynamic page initialization
└── README.md              This file
```

## Files

### `index.html`
Static HTML entry point. Includes:
- Auth screens (login, access denied)
- Page header and controls
- Content container for dynamic sections

Links to parent resources:
- `../styles.css` — Shared dashboard styles
- `page.js` — Entry module

### `page.js`
Main entry point for the referrers page. Responsibilities:
- Integrates with `initAuthGate` for auth + role checking
- Loads referrer, group, and registration data
- Renders page content using `renderReferrers()`
- Initializes event listeners:
  - Resolve/edit buttons for referrers and groups
  - Form submission and cancellation
  - Seed data import
  - Search filtering
  - Refresh button

### `referrers.js`
Pure data layer — no DOM dependencies. Exports:
- **Fetch functions:**
  - `fetchReferrers(db)` — Get all active referrers with names
  - `fetchReferrerGroups(db)` — Get all active groups
- **Aggregation:**
  - `aggregateRegistrationsByReferrer(registrations, referrers, groups)` — Count registrations by referrer
- **Save functions:**
  - `saveReferrer(db, { code, name, groupId, type })` — Create or update referrer
  - `saveGroup(db, { name })` — Create group
- **Type definitions:** JSDoc types for `Referrer`, `ReferrerGroup`, `ReferrerAggregation`

### `layout.component.js`
React-like component function that generates the page layout HTML:
- Page header with back link to dashboard
- Control buttons (refresh, updated timestamp, user email, logout)
- Loading spinner
- Content container

### `init.js`
Optional module for dynamic page generation (if you want to move away from static HTML):
- Generates page structure from components
- Injects script to load `page.js`

## Navigation

- **Back to Dashboard:** Click "← לוח ניהול" in the header, or use `../index.html`
- **From Dashboard:** Click "ניהול מפנים" button

## Related Files

- `../dashboard-selectors.js` — Centralized selectors for DOM queries
- `../dashboard.render.js` — Rendering functions (includes `renderReferrers()`)
- `../dashboard-layout.component.js` — Dashboard page layout
- `../auth-gate.js` — Shared auth + role gating
- `../data.js` — Shared data layer (registrations)
- `../seed-import.js` — Bulk seed data import utility
