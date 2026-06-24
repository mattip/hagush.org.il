# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**hagush.org.il** is a candidate management system for an online political nomination process. The system has two main interfaces:
1. **Public site** (docs/) — static GitHub Pages site with candidate profiles and vote-booking forms
2. **Admin dashboard** (admin/) — Streamlit app for managing candidates, importing form responses, and monitoring telemetry

The project combines Python backend logic, static HTML/CSS/JS frontend, Google Sheets integration, Firestore, and Google Apps Script webhooks.

## Architecture

### Core Data Flow

1. **Google Form Responses** → CSV export → `parse_candidates.py` (CLI) → candidates.json
2. **candidates.json** → Admin UI edits → GitHub PR (via Streamlit app) → merged → deployed to static site
3. **Public Site** → User votes → Google Apps Script webhook → Firestore (registrations collection)
4. **Firestore Dashboard** → Authenticated managers/admins view aggregated voting data

### Key Components

- **candidates.json** (`docs/candidates.json`) — canonical source of truth. JSON array with candidate profiles (name, bio, photos, social links, interview schedule).
- **Firestore** — event log (registrations, interactions, page views); gated by security rules; read-only for public, managed by Apps Script + CLI backfill.
- **Image Assets** — portraits live in `docs/portraits/`; PNG→WEBP conversion done locally with ImageMagick or via admin UI.
- **Static HTML Generation** — `build_ask_page.py` pre-renders individual candidate voting pages (ask_<id>.html) with OG tags for social sharing.

### Directory Structure

```
.
├── admin/                    # Streamlit web app (Cloud Run + IAP)
│   ├── app_streamlit.py      # Main app UI + logic
│   ├── candidates_lib.py     # Shared validation/normalization logic
│   ├── requirements.txt       # Python dependencies
│   ├── deploy.sh             # Docker → Artifact Registry → Cloud Run
│   └── Dockerfile
├── appscript/                # Google Apps Script (webhook handler)
├── firebase/                 # Firestore config (empty stub)
├── docs/                     # GitHub Pages site
│   ├── index.html            # Landing page
│   ├── admin.html            # Redirect to Cloud Run app
│   ├── ask_*.html            # Pre-rendered voting pages (generated)
│   ├── candidates.json       # Canonical candidate data
│   ├── candidates/           # Backup candidate profiles (JSON)
│   ├── portraits/            # Candidate photos (WEBP + PNG)
│   ├── og/                   # OG image thumbs
│   ├── css/ js/              # Styling and interactive logic
│   └── dashboard/            # Authenticated dashboard (Firestore-based)
├── parse_candidates.py       # CLI to import Google Form CSV → candidates.json
├── build_candidate_stubs.py  # Generate initial stub profiles from CSV
├── build_ask_page.py         # Generate static ask_<id>.html pages
├── firestore.rules           # Firestore security rules
└── parse.ini                 # Config file for parse_candidates.py
```

## Common Development Tasks

### 1. Import New Candidates from Google Form

```bash
# Download responses.csv from Google Form, save to repo root
python3 parse_candidates.py --json docs/candidates.json --csv responses.csv --portraits docs/portraits
```

**Behavior:** adds new candidates with all fields filled; prompts to verify English-ID mappings (used to link photos).

**Flags:**
- `--minimal` — add new candidates but leave text fields empty
- `--fill` — only fill empty text fields for existing candidates, don't add new ones
- `--verify` — check social media URLs (slow; can combine with other flags)
- `--mapping mapping.txt` — bulk import with file

### 2. Generate Voting Pages for Weekly Interviews

When a new weekly interview goes live, pre-render the candidate's voting page:

```bash
python3 build_ask_page.py nava_r
python3 build_ask_page.py nava_r --day "חמישי, 25.6" --time "14:00"
```

Generates `ask_nava_r.html` with OG tags, portrait, name, and interview time baked into the HTML (so social scrapers see real data).

### 3. Convert PNG Portraits to WEBP

**Local (Mac):**
```bash
brew install imagemagick
cd docs/portraits
for f in *.png; do filename=${f%.*}; convert $f -quality 82 $filename.webp; done
```

**Or via Streamlit admin UI:** upload PNG → app converts → commit via PR.

### 4. Run Admin Dashboard Locally

```bash
cd admin/
pip install -r requirements.txt
cp secrets.toml .streamlit/secrets.toml   # edit with dev-mode defaults
streamlit run app_streamlit.py -- --dev
```

Opens at http://localhost:8501. Dev mode reads from `../docs/candidates.json` (no Google API calls).

### 5. Deploy Admin Dashboard to Cloud Run

```bash
cd admin/
./deploy.sh
```

Builds Docker image locally, pushes to Artifact Registry, deploys to Cloud Run. First deploy ~3 min; subsequent ~30 sec.

**Prerequisites:** GCP project `hagush-admin`, Google Cloud SDK authenticated, GitHub token in Secret Manager, service account JSON.

## Key Conventions & Patterns

### Candidate ID Format

- **English-ID** (CSV column "English-ID"): `nava_r`, `dani_e`, etc. — used as filename prefix for ask_*.html and portrait links.
- **Hebrew name** (CSV column "שם"): full Hebrew name.
- **JSON field `id`**: English-ID used as the candidates.json key.

### Photo Handling

- CLI (`parse_candidates.py`) looks for portrait files matching English-ID: `portraits/nava_r.png` or `.webp`.
- Streamlit app allows bulk upload + conversion to WEBP.
- Final HTML links use WEBP; PNG kept as fallback.

### Social Links

- Extracted from CSV; validated via URL regex (links must be well-formed).
- Stored in candidates.json as object: `{ "twitter": "https://...", "facebook": "https://..." }`.
- Invalid links are skipped with a warning.

### Firestore Security Model

- **Telemetry (page_views, interactions):** anonymous client writes (validated by rules).
- **PII (registrations, questions):** written only by Apps Script + CLI (Admin SDK bypass).
- **Management (roles, groups):** admin-only client writes.
- Role/scope-based row-level read scoping (admin / manager / influencer).

### Development Environment Defaults (Dev Mode)

Streamlit app with `--dev` flag:
- Reads candidates from `../docs/candidates.json`
- Reads portraits from `../edited/`
- Reads form responses from `../responses.csv`
- No GitHub or Google API calls

### Code Style & Linting (front-end only)

Front-end JS/CSS/HTML under `docs/` is linted and formatted with a dev-only Node setup (not shipped to GitHub Pages). Config lives at the repo root: `eslint.config.js`, `.stylelintrc.json`, `.prettierrc.json`, `.prettierignore`.

```bash
npm install        # one-time, installs dev deps into node_modules/ (gitignored)
npm run lint       # eslint (docs/**/*.js) + stylelint (docs/**/*.css)
npm run format     # prettier --write on js/css/html
npm run check      # format:check + lint, no writes (use in review)
```

Conventions: 2-space indent, double quotes, semicolons, 100-char width (Prettier owns formatting; ESLint owns correctness). `docs/js/app.js` is a classic `<script>` (global scope); `tracker.js` and `dashboard/*.js` are ES modules. `docs/candidates.json` and generated `ask_*.html` are excluded from linting/formatting.

## Known Issues & Notes

### Firestore TTL Gap

TTL on telemetry `ts` field cannot enforce 30-day retention correctly. Need to add explicit `expireAt` field for proper cleanup. See memory note: `hagush-firestore-ttl-gap.md`.

### Image Conversion Dependencies

- CLI scripts require ImageMagick (`convert` command) for PNG↔WEBP.
- Cloud Run Dockerfile installs ImageMagick; local dev requires `brew install imagemagick` (macOS) or `apt-get install imagemagick` (Linux).

### GitHub Token Permissions

Streamlit app uses GitHub token to open PRs. The token is restricted to:
- One repo only (hagush.org.il)
- Contents + Pull Requests scopes (no settings/admin access)
- Cannot merge — human review required

### Google Sheets / Drive Sharing

Service account email must be shared on both:
1. Google Drive folder containing portraits
2. Google Sheet with form responses

This is a one-time manual step during setup.

## Testing & Validation

- **Link validation:** `parse_candidates.py --verify` checks all social URLs (slow).
- **Candidate stubs:** `build_candidate_stubs.py` generates minimal profiles from CSV (useful for bulk imports).
- **Diff preview:** Streamlit app shows a diff of JSON changes before opening PR.

## Deployment Checklist

- [ ] Test imports locally with `--dev`
- [ ] Verify candidates.json format (valid JSON, no trailing commas)
- [ ] Run `--verify` if social links were edited
- [ ] Check that all portrait files exist in `docs/portraits/`
- [ ] Regenerate ask_*.html for any newly active candidates
- [ ] Merge PR and confirm GitHub Pages rebuild (check Actions tab)
- [ ] Verify Cloud Run dashboard reflects latest data (refresh from Firestore)
