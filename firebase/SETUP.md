# Firebase setup for the hagush.org.il dashboard

> ⚠️ The old scaffold instructions (a permissive `/events` rule, `tracker.js`,
> `dashboard.html`) are **obsolete**. The live data model is `registrations`,
> `questions`, `page_views`, `interactions`, `roles`, `groups`, `influencers`,
> `aggregates`, `login_events` — and the real, locked-down rules live in
> [`../firestore.rules`](../firestore.rules). **Do not** paste any rules from
> memory; paste that file verbatim.

The full, ordered runbook is **[`STAGE_A_CHECKLIST.md`](./STAGE_A_CHECKLIST.md)**.
Quick reference:

## 1. Project & Firestore
- Project `hagush-org-il`, Firestore location `europe-west1`, Spark (free) tier.

## 2. Authentication
- **Authentication → Sign-in method → enable Google.**
- **Authentication → Settings → Authorized domains:** add `hagush.org.il` (and `localhost` for local testing).

## 3. Security Rules
- **Firestore → Rules →** paste the contents of [`../firestore.rules`](../firestore.rules) and Publish.
- Re-publish whenever that file changes (it is NOT auto-deployed by a git merge).

## 4. TTL
- **Firestore → TTL →** add a policy on `page_views` (field `ts`) and on `interactions` (field `ts`), 30 days.

## 5. Service account (for the Apps Script mirror + nightly aggregation)
- **Project Settings → Service accounts → Generate new private key.**
- Put `client_email` / `private_key` into the Apps Script **Script properties**
  (`FIRESTORE_CLIENT_EMAIL`, `FIRESTORE_PRIVATE_KEY`, plus `FIRESTORE_PROJECT_ID`,
  `PHONE_SALT`, `DEFAULT_GROUP_ID`). Never commit the JSON.

## 6. Web config
- The public `firebaseConfig` is inlined in `docs/dashboard/app.js` (it's safe to
  expose — security comes from Rules + Auth). Nothing to paste here.

See `STAGE_A_CHECKLIST.md` for seeding roles/influencers, running the backfill,
redeploying the Apps Script web app, and the verification steps.
