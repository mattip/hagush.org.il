"""
Candidates admin app — manage hagush.org.il candidates page.

Run locally:
    streamlit run app_streamlit.py -- --dev

Run in production (Cloud Run + IAP):
    streamlit run app_streamlit.py
"""

import base64
import copy
import json
import os
import sys
import tempfile
from pathlib import Path

import streamlit as st

# ── Dev mode flag ─────────────────────────────────────────────────────────────
# Pass `-- --dev` on the command line, or set DEV_MODE=1 in environment.
DEV_MODE = "--dev" in sys.argv or os.environ.get("DEV_MODE", "") == "1"


# ── Version ──────────────────────────────────────────────────────────────────
APP_VERSION = "1.0.0"

# ── i18n strings ──────────────────────────────────────────────────────────────
# Add a "lang" key to .streamlit/secrets.toml: lang = "he"  (or "en", default)

_STRINGS = {
    "en": {
        "app_title":         "Candidates admin",
        "dev_warning":       "DEV MODE - no real API calls",
        "tab_dashboard":     "Overview",
        "tab_import":        "Import new",
        "tab_fill":          "Fill fields",
        "tab_edit":          "Edit",
        "tab_deploy":        "Deploy",
        "dashboard_header":  "Current candidates",
        "btn_refresh":       "Refresh from GitHub",
        "btn_refresh_dev":   "Reload local JSON",
        "btn_verify":        "Run verification",
        "col_name":          "Name",
        "col_id":            "ID",
        "col_photos":        "Photos",
        "col_links":         "Links",
        "staged_notice":     "{n} candidate(s) staged - go to Deploy tab",
        "no_candidates":     "No candidates loaded.",
        "fill_header":       "Fill empty fields for existing candidates",
        "fill_explainer":    (
            "Form responses are retrieved and used to fill only empty text fields "
            "(activities, rationale, recommendation, minister) for candidates already "
            "in candidates.json. Existing text is never overwritten."
        ),
        "fill_no_api_hint":  (
            "Google Sheets API key not configured. "
            "Add sheet_id and google_service_account to secrets.toml to enable Retrieve."
        ),
        "fill_upload_label": "Upload CSV responses",
        "fill_btn_retrieve": "Retrieve",
        "fill_loaded":       "Retrieved {n} rows.",
        "fill_btn_preview":  "Preview",
        "fill_would_fill":   "Would fill:",
        "field_activities":  "activities",
        "field_rationale":   "rationale",
        "field_recommendation": "recommendation",
        "field_minister":    "minister",

        "fill_nothing":      "Nothing to fill - all fields already populated.",
        "fill_btn_apply":    "Apply",
        "fill_apply_note":   (
            "Changes will be applied to the current session. "
            "Review in the Edit tab before deploying."
        ),
        "fill_applied":      "Applied. Go to Deploy tab to commit.",
        "import_explainer":  (
            "New candidates are imported from Google Form responses matched to new portrait images. "
            "Each new candidate requires a unique ID and at least one portrait. "
            "Other fields are loaded from the form response into candidates.json. "
            "Nothing is committed until the Deploy tab."
        ),
        "edit_header":       "Edit candidate texts",
        "edit_select":       "Select candidate",
        "edit_no_changes":   "No unsaved changes.",
        "edit_btn_save":     "Save changes",
        "edit_btn_revert":   "Revert",
        "edit_saved":        "Saved. Go to Deploy to commit.",
        "deploy_header":     "Deploy",
        "deploy_new":        "{n} new candidate(s) to add:",
        "deploy_modified":   "{n} candidate(s) modified:",
        "deploy_diff":       "Show candidates.json diff",
        "deploy_fix_links":  "Fix link issues before deploying:",

        'tab_about': 'About',
        'about_header': 'About',
        'about_source': '**Source:** [github.com/mattip/hagush.org.il](https://github.com/mattip/hagush.org.il)',
        'about_flow_header': 'Data flow',
        'about_flow': '\n1. 📝 **New candidates** fill out the Google Form and upload portraits to Google Drive\n2. 🖼️ **Nina** edits and crops the images\n3. ➕ Use **Import New** to add the candidate to candidates.json with the edited images\n4. 🚀 Use **Deploy** to emit a Pull Request with the updated files\n5. ✅ **Matti or Elad** review and merge the Pull Request — the site updates automatically\n',
        'about_verify_header': 'Verification',
        'about_verify_text': 'Checks all candidates for broken social media links and text field issues.',
        'about_reset_header': 'Reset session',
        'about_reset_text': 'Clears all in-memory state. Nothing on disk or GitHub is affected.',
        'about_stats': '{n} candidates loaded · last loaded: {time}',
        'nothing_staged': 'Nothing staged. Import candidates, fill fields, or edit first.',
        'show_diff': 'Show diff',
        'link_issues': 'Link issues:',
        'all_links_ok': 'All links look correct.',
        'text_issues': 'Text field issues:',
        'all_texts_ok': 'All text fields look clean.',
        'no_cands_loaded': 'No candidates loaded.',
        'step1_header': 'Step 1 — Download portraits',
        'step1_caption': 'Download new portrait images from Google Drive.',
        'step1_btn': 'Download',
        'step1_btn_dev': 'Scan local images',
        'step1_no_creds': 'Google Drive credentials not configured.',
        'step2_header': 'Step 2 — Scan responses',
        'step2_caption': 'Retrieve new form responses not yet in candidates.json.',
        'step2_btn': 'Scan responses',
        'step2_btn_dev': 'Load local CSV',
        'step2_no_creds': 'Google Sheets credentials not configured.',
        'step2_new': '**{n} new** (not yet in candidates.json):',
        'step2_none_new': 'No new responses — all already in candidates.json.',
        'step2_no_images': 'No image groups found yet — run Step 1 first.',
        'step3_header': 'Step 3 — Scan images',
        'step3_available': '**{n} image group(s)** available:',
        'step4_header': 'Step 4 — Match',
        'step4_caption': 'Select the matching form response for each image group and confirm the JSON id.',
        'step4_minimal': 'Minimal mode (skip text fields for now)',
        'step4_response': 'Form response',
        'step4_id': 'JSON id',
        'step4_convert_btn': 'Convert images to WebP & stage',
    },
    "he": {
        "app_title":         "\u05e0\u05d9\u05d4\u05d5\u05dc \u05de\u05d5\u05e2\u05de\u05d3\u05d9\u05dd",
        "dev_warning":       "\u05de\u05e6\u05d1 \u05e4\u05d9\u05ea\u05d5\u05d7 - \u05d0\u05d9\u05df \u05e7\u05e8\u05d9\u05d0\u05d5\u05ea API \u05d0\u05de\u05d9\u05ea\u05d9\u05d5\u05ea",
        "tab_dashboard":     "מועמדים",
        "tab_import":        "\u05d9\u05d9\u05d1\u05d5\u05d0 \u05d7\u05d3\u05e9\u05d9\u05dd",
        "tab_fill":          "\u05de\u05d9\u05dc\u05d5\u05d9 \u05e9\u05d3\u05d5\u05ea",
        "tab_edit":          "\u05e2\u05e8\u05d9\u05db\u05d4",
        "tab_deploy":        "\u05e4\u05e8\u05e1\u05d5\u05dd",
        "dashboard_header":  "\u05de\u05d5\u05e2\u05de\u05d3\u05d9\u05dd \u05e0\u05d5\u05db\u05d7\u05d9\u05d9\u05dd",
        "btn_refresh":       "\u05e8\u05e2\u05e0\u05d5\u05df \u05de-GitHub",
        "btn_refresh_dev":   "\u05d8\u05e2\u05d9\u05e0\u05d4 \u05de\u05e7\u05d5\u05de\u05d9\u05ea",
        "btn_verify":        "\u05d1\u05d3\u05d9\u05e7\u05ea \u05ea\u05e7\u05d9\u05e0\u05d5\u05ea",
        "col_name":          "\u05e9\u05dd",
        "col_id":            "\u05de\u05d6\u05d4\u05d4",
        "col_photos":        "\u05ea\u05de\u05d5\u05e0\u05d5\u05ea",
        "col_links":         "\u05e7\u05d9\u05e9\u05d5\u05e8\u05d9\u05dd",
        "staged_notice":     "{n} \u05de\u05d5\u05e2\u05de\u05d3/\u05d9\u05dd \u05de\u05de\u05ea\u05d9\u05e0\u05d9\u05dd - \u05e2\u05d1\u05d5\u05e8/\u05d9 \u05dc\u05e4\u05e8\u05e1\u05d5\u05dd",
        "no_candidates":     "\u05dc\u05d0 \u05e0\u05d8\u05e2\u05e0\u05d5 \u05de\u05d5\u05e2\u05de\u05d3\u05d9\u05dd.",
        "fill_header":       "\u05de\u05d9\u05dc\u05d5\u05d9 \u05e9\u05d3\u05d5\u05ea \u05e8\u05d9\u05e7\u05d9\u05dd \u05dc\u05de\u05d5\u05e2\u05de\u05d3\u05d9\u05dd \u05e7\u05d9\u05d9\u05de\u05d9\u05dd",
        "fill_explainer":    (
            "\u05ea\u05d2\u05d5\u05d1\u05d5\u05ea \u05d4\u05d8\u05d5\u05e4\u05e1 \u05e0\u05e9\u05dc\u05e4\u05d5\u05ea \u05d5\u05de\u05e9\u05de\u05e9\u05d5\u05ea \u05dc\u05de\u05d9\u05dc\u05d5\u05d9 \u05e9\u05d3\u05d5\u05ea \u05e8\u05d9\u05e7\u05d9\u05dd \u05d1\u05dc\u05d1\u05d3 "
            "(\u05e4\u05e2\u05d9\u05dc\u05d5\u05d9\u05d5\u05ea, \u05e0\u05d9\u05de\u05d5\u05e7, \u05d4\u05de\u05dc\u05e6\u05d4, \u05e9\u05e8/\u05d4) \u05e2\u05d1\u05d5\u05e8 \u05de\u05d5\u05e2\u05de\u05d3\u05d9\u05dd \u05e7\u05d9\u05d9\u05de\u05d9\u05dd. "
            "\u05ea\u05d5\u05db\u05df \u05e7\u05d9\u05d9\u05dd \u05dc\u05d0 \u05d9\u05d5\u05d7\u05dc\u05e3 \u05dc\u05e2\u05d5\u05dc\u05dd."
        ),
        "fill_no_api_hint":  "\u05de\u05e4\u05ea\u05d7 Google Sheets \u05d0\u05d9\u05e0\u05d5 \u05de\u05d5\u05d2\u05d3\u05e8. \u05d4\u05d5\u05e1\u05e3 sheet_id \u05d5-google_service_account \u05dc-secrets.toml \u05db\u05d3\u05d9 \u05dc\u05d0\u05e4\u05e9\u05e8 \u05d0\u05d7\u05d6\u05d5\u05e8.",
        "fill_upload_label": "\u05d4\u05e2\u05dc\u05d0\u05ea \u05e7\u05d5\u05d1\u05e5 CSV",
        "fill_btn_retrieve": "\u05d0\u05d7\u05d6\u05d5\u05e8",
        "fill_loaded":       "\u05e0\u05d8\u05e2\u05e0\u05d5 {n} \u05e9\u05d5\u05e8\u05d5\u05ea.",
        "fill_btn_preview":  "\u05ea\u05e6\u05d5\u05d2\u05d4 \u05de\u05e7\u05d3\u05d9\u05de\u05d9\u05ea",
        "fill_would_fill":   "\u05d9\u05de\u05d5\u05dc\u05d0\u05d5:",
        "field_activities":  "\u05e4\u05e2\u05d9\u05dc\u05d5\u05d9\u05d5\u05ea",
        "field_rationale":   "\u05e0\u05d9\u05de\u05d5\u05e7",
        "field_recommendation": "\u05d4\u05de\u05dc\u05e6\u05d4",
        "field_minister":    "\u05e9\u05e8/\u05d4",

        "fill_nothing":      "\u05d0\u05d9\u05df \u05de\u05d4 \u05dc\u05de\u05dc\u05d0 - \u05db\u05dc \u05d4\u05e9\u05d3\u05d5\u05ea \u05de\u05d0\u05d5\u05db\u05dc\u05e1\u05d9\u05dd.",
        "fill_btn_apply":    "\u05d4\u05d7\u05dc",
        "fill_apply_note":   "\u05d4\u05e9\u05d9\u05e0\u05d5\u05d9\u05d9\u05dd \u05d9\u05d5\u05d7\u05dc\u05d5 \u05dc\u05e1\u05e9\u05e0\u05d4 \u05d4\u05e0\u05d5\u05db\u05d7\u05d9\u05ea. \u05e0\u05d9\u05ea\u05df \u05dc\u05e1\u05e7\u05d5\u05e8 \u05d1\u05e2\u05e8\u05d9\u05db\u05d4 \u05dc\u05e4\u05e0\u05d9 \u05e4\u05e8\u05e1\u05d5\u05dd.",
        "fill_applied":      "\u05d4\u05d5\u05d7\u05dc. \u05e2\u05d1\u05d5\u05e8/\u05d9 \u05dc\u05e4\u05e8\u05e1\u05d5\u05dd.",
        "import_explainer":  "\u05de\u05d5\u05e2\u05de\u05d3\u05d9\u05dd \u05d7\u05d3\u05e9\u05d9\u05dd \u05de\u05d9\u05d5\u05d1\u05d0\u05d9\u05dd \u05de\u05ea\u05d2\u05d5\u05d1\u05d5\u05ea \u05d4\u05d8\u05d5\u05e4\u05e1 \u05d4\u05ea\u05d5\u05d0\u05de\u05d5\u05ea \u05dc\u05ea\u05de\u05d5\u05e0\u05d5\u05ea. \u05db\u05dc \u05d0\u05d3\u05dd \u05d3\u05d5\u05e8\u05e9 \u05de\u05d6\u05d4\u05d4 \u05d9\u05d9\u05d7\u05d5\u05d3\u05d9 \u05d5\u05dc\u05e4\u05d7\u05d5\u05ea \u05ea\u05de\u05d5\u05e0\u05d4 \u05d0\u05d7\u05ea. \u05d0\u05d9\u05df \u05e4\u05e8\u05e1\u05d5\u05dd \u05e2\u05d3 \u05d8\u05d0\u05d1 \u05e4\u05e8\u05e1\u05d5\u05dd.",
        "edit_header":       "\u05e2\u05e8\u05d9\u05db\u05ea \u05d8\u05e7\u05e1\u05d8\u05d9\u05dd",
        "edit_select":       "\u05d1\u05d7\u05e8/\u05d9 \u05de\u05d5\u05e2\u05de\u05d3/\u05ea",
        "edit_no_changes":   "\u05d0\u05d9\u05df \u05e9\u05d9\u05e0\u05d5\u05d9\u05d9\u05dd \u05e9\u05dc\u05d0 \u05e0\u05e9\u05de\u05e8\u05d5.",
        "edit_btn_save":     "\u05e9\u05de\u05d5\u05e8 \u05e9\u05d9\u05e0\u05d5\u05d9\u05d9\u05dd",
        "edit_btn_revert":   "\u05d1\u05d8\u05dc \u05e9\u05d9\u05e0\u05d5\u05d9\u05d9\u05dd",
        "edit_saved":        "\u05e0\u05e9\u05de\u05e8. \u05e2\u05d1\u05d5\u05e8/\u05d9 \u05dc\u05e4\u05e8\u05e1\u05d5\u05dd.",
        "deploy_header":     "\u05e4\u05e8\u05e1\u05d5\u05dd",
        "deploy_new":        "{n} מועמד.ים חדש.ים להוספה:",
        "deploy_modified":   "{n} מועמד.ים שונ.ה:",
        "deploy_diff":       "הצג הבדלים ב-candidates.json",
        "deploy_fix_links":  "תקן בעיות קישורים לפני פרסום:",
        'tab_about': 'אודות',
        'about_header': 'אודות',
        'about_source': '**קוד מקור:** [github.com/mattip/hagush.org.il](https://github.com/mattip/hagush.org.il)',
        'about_flow_header': 'זרימת עבודה',
        'about_flow': '\n1. 📝 **מועמדים חדשים** ממלאים טופס ומעלים תמונות\n2. 🖼️ **נינה** עורכת את התמונות\n3. ➕ משתמשים ב-**ייבוא חדשים** כדי להוסיף את המועמד\n4. 🚀 משתמשים ב-**פרסום** כדי לשלוח Pull Request\n5. ✅ **מתי או אלד** אמרגים את ה-Pull Request\n',
        'about_verify_header': 'בדיקת תקינות',
        'about_verify_text': 'בודקת קישורים שבורים ובעיות בשדות הטקסט.',
        'about_reset_header': 'איפוס סשיאה',
        'about_reset_text': 'מנקה את כל הנתונים הזמניים. אין השפעה על דיסק או GitHub.',
        'about_stats': '{n} מועמדים · זמן טעינה: {time}',
        'nothing_staged': 'אין שינויים בהמתנה.',
        'show_diff': 'הצג הבדלים',
        'link_issues': 'בעיות קישורים:',
        'all_links_ok': 'כל הקישורים תקינים.',
        'text_issues': 'בעיות בשדות הטקסט:',
        'all_texts_ok': 'כל שדות הטקסט תקינים.',
        'no_cands_loaded': 'לא נטענו מועמדים.',
        'step1_header': 'שלב 1',
        'step1_caption': 'הורדת תמונות מ-Google Drive.',
        'step1_btn': 'הורדה',
        'step1_btn_dev': 'סריקת תמונות מקומיות',
        'step1_no_creds': 'פרטי גישה ל-Google Drive אינם מוגדרים.',
        'step2_header': 'שלב 2',
        'step2_caption': 'אחזור תגובות חדשות.',
        'step2_btn': 'סרוק תגובות',
        'step2_btn_dev': 'טעינת CSV מקומית',
        'step2_no_creds': 'פרטי גישה ל-Google Sheets אינם מוגדרים.',
        'step2_new': '**{n} חדשים**:',
        'step2_none_new': 'אין תגובות חדשות.',
        'step2_no_images': 'לא נמצאו תמונות.',
        'step3_header': 'שלב 3',
        'step3_available': '**{n} קבוצי תמונות**:',
        'step4_header': 'שלב 4',
        'step4_caption': 'בחר/י תגובת טופס מתאימה לכל קבוץ ואשר/י את המזהה.',
        'step4_minimal': 'מצב מינימלי',
        'step4_response': 'תגובת טופס',
        'step4_id': 'מזהה JSON',
        'step4_convert_btn': 'המר ל-WebP ושמור',
    },
}

# ── Config / secrets ──────────────────────────────────────────────────────────

_KNOWN_LANGS = {"en", "he"}

def get_secret(key, default=None):
    """Read from st.secrets, falling back to env vars, then default.
    For the 'lang' key, only accept known language codes to avoid
    picking up system locale env vars like LANG=en_US.UTF-8.
    """
    try:
        val = st.secrets[key]
    except (KeyError, FileNotFoundError):
        # Cloud Run injects secrets as lowercase env vars; also check uppercase
        val = os.environ.get(key) or os.environ.get(key.upper())
    if val is None:
        return default
    if key == "lang" and val not in _KNOWN_LANGS:
        return default
    return val

def t(key: str, **kwargs) -> str:
    """Return localized string for key, formatted with kwargs."""
    lang = st.session_state.get("lang") or "he"
    strings = _STRINGS.get(lang, _STRINGS["en"])
    s = strings.get(key, _STRINGS["en"].get(key, key))
    return s.format(**kwargs) if kwargs else s

# ── Page config ───────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Candidates Admin" + (" [DEV]" if DEV_MODE else ""),
    page_icon="🗳️",
    layout="wide",
    initial_sidebar_state="collapsed",
)

import candidates_lib as lib  # noqa: E402 — after path setup


GITHUB_TOKEN   = get_secret("github_token")
GITHUB_REPO    = get_secret("github_repo", "your-org/your-repo")
GITHUB_BRANCH  = get_secret("github_branch", "main")
DRIVE_FOLDER_ID = get_secret("drive_folder_id")
SHEET_ID        = get_secret("sheet_id")

# In dev mode, use local files instead of GitHub/Drive
# Paths are relative to the repo root (one level up from admin/)
_REPO_ROOT         = Path(__file__).parent.parent
DEV_JSON_PATH      = Path(get_secret("dev_json_path",  str(_REPO_ROOT / "docs/candidates.json")))
DEV_PORTRAITS_PATH = Path(get_secret("dev_portraits_path", str(_REPO_ROOT / "docs/portraits")))
DEV_IMAGES_PATH    = Path(get_secret("dev_images_path", str(_REPO_ROOT / "edited")))
DEV_CSV_PATH       = Path(get_secret("dev_csv_path",   str(_REPO_ROOT / "responses.csv")))


# ── GitHub API helpers ────────────────────────────────────────────────────────

def github_headers():
    return {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


@st.cache_data(ttl=30)
def fetch_candidates_from_github() -> tuple[list[dict], str]:
    """Fetch candidates.json from GitHub. Returns (candidates, sha)."""
    import requests
    url = f"https://api.github.com/repos/{GITHUB_REPO}/contents/docs/candidates.json"
    r = requests.get(url, headers=github_headers(), params={"ref": GITHUB_BRANCH})
    r.raise_for_status()
    data = r.json()
    content = base64.b64decode(data["content"]).decode("utf-8")
    return json.loads(content), data["sha"]


def create_pr(branch: str, title: str, body: str, commits: list[dict]) -> str:
    """Create a branch, commit files, open a PR. Returns PR URL.

    commits: list of {"path": str, "content": bytes, "message": str}
    """
    import requests

    headers = github_headers()
    base = f"https://api.github.com/repos/{GITHUB_REPO}"

    # Get base SHA
    r = requests.get(f"{base}/git/ref/heads/{GITHUB_BRANCH}", headers=headers)
    r.raise_for_status()
    base_sha = r.json()["object"]["sha"]

    # Create branch
    requests.post(f"{base}/git/refs", headers=headers, json={
        "ref": f"refs/heads/{branch}",
        "sha": base_sha,
    }).raise_for_status()

    # Commit each file
    for commit in commits:
        content_b64 = base64.b64encode(commit["content"]).decode()
        # Get existing SHA if file exists (needed for updates)
        existing_sha = None
        r = requests.get(f"{base}/contents/{commit['path']}",
                         headers=headers, params={"ref": branch})
        if r.status_code == 200:
            existing_sha = r.json()["sha"]
        payload = {
            "message": commit["message"],
            "content": content_b64,
            "branch":  branch,
        }
        if existing_sha:
            payload["sha"] = existing_sha
        requests.put(f"{base}/contents/{commit['path']}",
                     headers=headers, json=payload).raise_for_status()

    # Open PR
    r = requests.post(f"{base}/pulls", headers=headers, json={
        "title": title,
        "body":  body,
        "head":  branch,
        "base":  GITHUB_BRANCH,
    })
    r.raise_for_status()
    return r.json()["html_url"]


# ── Google Drive helpers ──────────────────────────────────────────────────────

@st.cache_resource
def get_drive_service():
    """Build Google Drive service from service account credentials."""
    if DEV_MODE:
        return None
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    creds_info = json.loads(get_secret("google_service_account", "{}"))
    creds = service_account.Credentials.from_service_account_info(
        creds_info,
        scopes=["https://www.googleapis.com/auth/drive.readonly",
                "https://www.googleapis.com/auth/spreadsheets.readonly"],
    )
    return build("drive", "v3", credentials=creds)


@st.cache_resource
def get_sheets_service():
    if DEV_MODE:
        return None
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    creds_info = json.loads(get_secret("google_service_account", "{}"))
    creds = service_account.Credentials.from_service_account_info(
        creds_info,
        scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"],
    )
    return build("sheets", "v4", credentials=creds)


def fetch_sheet_rows() -> list[dict]:
    """Fetch form responses from Google Sheet. In dev mode, reads local CSV."""
    if DEV_MODE:
        if DEV_CSV_PATH.exists():
            return lib.parse_csv_path(DEV_CSV_PATH)
        st.warning(f"Dev mode: CSV not found at {DEV_CSV_PATH}")
        return []
    svc = get_sheets_service()
    result = svc.spreadsheets().values().get(
        spreadsheetId=SHEET_ID, range="A:Z"
    ).execute()
    values = result.get("values", [])
    if not values:
        return []
    headers = values[0]
    return [dict(zip(headers, row)) for row in values[1:]]


def fetch_drive_image_groups() -> dict[str, list[str]]:
    """Scan Drive folder for image groups. In dev mode, scans local folder."""
    if DEV_MODE:
        return lib.scan_image_groups(DEV_IMAGES_PATH)
    svc = get_drive_service()
    results = svc.files().list(
        q=f"'{DRIVE_FOLDER_ID}' in parents and trashed=false",
        fields="files(id, name, mimeType)",
        pageSize=200,
    ).execute()
    files = results.get("files", [])
    # Group by prefix same as scan_image_groups
    import re
    groups: dict[str, list[str]] = {}
    for f in files:
        name = f["name"]
        ext = Path(name).suffix.lower()
        if ext not in (".png", ".jpg", ".jpeg", ".webp"):
            continue
        stem = re.sub(r"[_-]\d+$", "", Path(name).stem)
        key = stem.lower()
        groups.setdefault(key, []).append(name)
    return {k: sorted(v) for k, v in groups.items()}


def download_drive_images(file_names: list[str], out_dir: Path) -> list[Path]:
    """Download named files from Drive folder to out_dir. Dev mode: copies local files."""
    out_dir.mkdir(parents=True, exist_ok=True)
    if DEV_MODE:
        paths = []
        for name in file_names:
            src = DEV_IMAGES_PATH / name
            dst = out_dir / name
            if src.exists():
                dst.write_bytes(src.read_bytes())
                paths.append(dst)
        return paths
    svc = get_drive_service()
    from googleapiclient.http import MediaIoBaseDownload
    import io
    # Build name→id map
    results = svc.files().list(
        q=f"'{DRIVE_FOLDER_ID}' in parents and trashed=false",
        fields="files(id, name)",
        pageSize=200,
    ).execute()
    name_to_id = {f["name"]: f["id"] for f in results.get("files", [])}
    paths = []
    for name in file_names:
        fid = name_to_id.get(name)
        if not fid:
            continue
        buf = io.BytesIO()
        dl = MediaIoBaseDownload(buf, svc.files().get_media(fileId=fid))
        done = False
        while not done:
            _, done = dl.next_chunk()
        dst = out_dir / name
        dst.write_bytes(buf.getvalue())
        paths.append(dst)
    return paths


# ── Session state helpers ─────────────────────────────────────────────────────

def init_state():
    defaults = {
        "candidates":      None,   # list[dict] — current from GitHub/local
        "candidates_sha":  None,   # GitHub blob SHA for update
        "staged":          [],     # list[dict] — new candidates to add
        "sheet_rows":      None,   # list[dict] — cached sheet rows
        "_fill_rows":      None,   # retrieved rows for fill tab
        "_fill_preview":   None,   # (updated, filled, warnings) preview
        "image_groups":    None,   # dict[str, list[str]]
        "converted_images": {},    # prefix → list of local webp Paths
        "inline_edit":     None,   # id of candidate whose expander is open
        "lang":            get_secret("lang", "he") or "he",  # runtime language override
    }
    for k, v in defaults.items():
        if k not in st.session_state:
            st.session_state[k] = v


def load_candidates():
    if DEV_MODE:
        if DEV_JSON_PATH.exists():
            candidates = lib.load_json(DEV_JSON_PATH)
            st.session_state.candidates = candidates
            st.session_state.candidates_sha = None
        else:
            st.error(f"Dev mode: JSON not found at {DEV_JSON_PATH}")
            return
    else:
        with st.spinner("Fetching candidates from GitHub…"):
            candidates, sha = fetch_candidates_from_github()
            st.session_state.candidates = candidates
            st.session_state.candidates_sha = sha
    # Snapshot for deploy diff detection
    st.session_state["_original_candidates"] = copy.deepcopy(st.session_state.candidates)
    import datetime
    st.session_state["_loaded_time"] = datetime.datetime.now().strftime("%H:%M:%S")


# ── Tab renderers ─────────────────────────────────────────────────────────────

def _render_inline_edit(c, idx, candidates):
    """Render inline edit panel for a single candidate inside an expander."""
    cid = c["id"]

    # Portraits
    portraits_dir = DEV_PORTRAITS_PATH if DEV_MODE else None
    if portraits_dir and portraits_dir.is_dir() and c.get("photos"):
        pcols = st.columns(min(len(c["photos"]), 3))
        for pi, photo in enumerate(c["photos"]):
            img_path = portraits_dir / photo
            if img_path.exists():
                with pcols[pi % 3]:
                    st.image(str(img_path), width=120)

    st.caption(f"ID: `{cid}` | {c.get('age','')} | {c.get('home','')}")
    st.caption(f"Links: {', '.join(c.get('links', {}).keys()) or '—'}")

    st.divider()

    edited = copy.deepcopy(c)
    changed = False
    for field in lib.TEXT_FIELDS:
        current = c.get(field, "") or ""
        new_val = st.text_area(
            field, value=current, height=100,
            key=f"inline_{cid}_{field}",
            help=f"{len(current)} chars",
        )
        if new_val != current:
            edited[field] = new_val
            changed = True

    if changed:
        for e in lib.verify_links([edited]):
            st.error(f"⚠️ {e}")
        for w in lib.verify_texts([edited]):
            st.warning(f"⚠️ {w}")

    col1, col2 = st.columns(2)
    with col1:
        if st.button(t("edit_btn_save"), key=f"save_{cid}", disabled=not changed):
            candidates[idx] = edited
            st.session_state.candidates = candidates
            st.session_state["inline_edit"] = None
            st.success(t("edit_saved"))
            st.rerun()
    with col2:
        if st.button(t("edit_btn_revert"), key=f"revert_{cid}", disabled=not changed):
            st.rerun()
    if not changed:
        st.caption(t("edit_no_changes"))


def render_dashboard():
    st.header(t("dashboard_header"))

    if st.session_state.candidates is None:
        load_candidates()

    candidates = st.session_state.candidates
    if not candidates:
        st.info(t("no_candidates"))
        return

    if st.button(t("btn_refresh_dev") if DEV_MODE else t("btn_refresh")):
        st.cache_data.clear()
        load_candidates()
        st.rerun()

    if st.session_state.staged:
        st.info(t("staged_notice", n=len(st.session_state.staged)))

    st.divider()

    # One expander per candidate — name is the label, click to edit inline
    for i, c in enumerate(candidates):
        name  = c.get("name", "")
        cid   = c.get("id", "")
        # Show a dot indicator if this candidate has empty text fields
        empty = [f for f in lib.TEXT_FIELDS if not c.get(f)]
        label = name + (f"  ⚠️ {len(empty)} empty" if empty else "")

        with st.expander(label, expanded=(st.session_state.get("inline_edit") == cid)):
            _render_inline_edit(c, i, candidates)


def render_import():
    st.header(t("tab_import"))
    st.info(t("import_explainer"))

    if st.session_state.candidates is None:
        load_candidates()

    candidates = st.session_state.candidates or []
    existing_ids = {c["id"] for c in candidates}
    has_api = bool(SHEET_ID and get_secret("google_service_account"))

    # ── Step 1: Download portraits ────────────────────────────────────────────
    st.subheader(t("step1_header"))
    st.caption(
        t("step1_caption") if not DEV_MODE
        else f"Dev mode: {DEV_IMAGES_PATH}"
    )
    if st.button(
        f"⬇️ {t('step1_btn')}" if not DEV_MODE else f"⬇️ {t('step1_btn_dev')}",
        key="btn_download_portraits",
        disabled=not (DEV_MODE or has_api),
        help=None if (DEV_MODE or has_api) else t("step1_no_creds"),
    ):
        with st.spinner("…"):
            all_groups = fetch_drive_image_groups()
            # Filter to only groups not already in candidates.json
            new_groups = {k: v for k, v in all_groups.items() if k not in existing_ids}
            st.session_state.image_groups = new_groups
        st.success(f"{len(new_groups)} / {len(all_groups)}")

    groups = st.session_state.image_groups or {}
    if groups:
        for prefix, files in groups.items():
            st.caption(f"  • `{prefix}` — {', '.join(files)}")

    st.divider()

    # ── Step 2: Scan responses ────────────────────────────────────────────────
    st.subheader(t("step2_header"))
    st.caption(
        t("step2_caption") if not DEV_MODE
        else f"Dev mode: {DEV_CSV_PATH}"
    )
    if st.button(
        f"📊 {t('step2_btn')}" if not DEV_MODE else f"📊 {t('step2_btn_dev')}",
        key="btn_scan_responses",
        disabled=not (DEV_MODE or has_api),
        help=None if (DEV_MODE or has_api) else t("step2_no_creds"),
    ):
        with st.spinner("…"):
            st.session_state.sheet_rows = fetch_sheet_rows()
        st.success(f"{len(st.session_state.sheet_rows)}")

    rows = st.session_state.sheet_rows or []
    new_rows = lib.get_new_rows(candidates, rows) if rows else []

    if rows:
        if new_rows:
            st.write(t("step2_new", n=len(new_rows)))
            for r in new_rows:
                st.caption(f"  • {r.get(lib.COL_NAME, '?')}")
        else:
            st.info(t("step2_none_new"))

    st.divider()

    # ── Step 3: Scan images ───────────────────────────────────────────────────
    st.subheader(t("step3_header"))
    if groups:
        st.write(t("step3_available", n=len(groups)))
        for prefix, files in groups.items():
            st.caption(f"  • `{prefix}` — {len(files)} file(s): {', '.join(files)}")
    elif st.session_state.image_groups is not None:
        st.info(t("step2_no_images"))

    st.divider()

    # ── Step 4: Match ─────────────────────────────────────────────────────────
    st.subheader(t("step4_header"))

    have_both = bool(new_rows and groups)
    if not have_both:
        st.caption(t("step4_caption"))
        st.button(t("step4_convert_btn"), disabled=True)
        return

    st.caption(t("step4_caption"))
    minimal = st.checkbox(t("step4_minimal"), value=False)

    response_options = ["(skip)"] + [r.get(lib.COL_NAME, "?") for r in new_rows]
    matches = []

    for prefix, files in groups.items():
        st.markdown(f"**`{prefix}`** — {', '.join(files)}")
        c1, c2 = st.columns([3, 2])
        with c1:
            default_idx = 0
            for i, r in enumerate(new_rows, 1):
                name = lib.normalize_name(r.get(lib.COL_NAME, ""))
                ratio = __import__("difflib").SequenceMatcher(None, prefix, name).ratio()
                if ratio > 0.4:
                    default_idx = i
                    break
            selected_name = st.selectbox(
                t("step4_response"), response_options,
                index=default_idx,
                key=f"match_{prefix}",
            )
        with c2:
            cid = st.text_input(
                t("step4_id"), value=prefix.lower(),
                key=f"id_{prefix}",
            )
        if selected_name != "(skip)" and cid:
            row = next((r for r in new_rows if r.get(lib.COL_NAME) == selected_name), None)
            if row:
                matches.append((cid, row, files))

    staged_previews = []
    for cid, row, files in matches:
        entry = lib.row_to_candidate(row, cid, [], minimal)
        with st.expander(f"📋 {entry['name']} (`{cid}`)"):
            c1, c2 = st.columns(2)
            with c1:
                st.write(f"**Age:** {entry['age']}")
                st.write(f"**Home:** {entry['home']}")
                st.write(f"**Links:** {list(entry['links'].keys())}")
                st.write(f"**Images:** {files}")
            with c2:
                for field in lib.TEXT_FIELDS:
                    entry[field] = st.text_area(
                        field, value=entry[field],
                        key=f"text_{cid}_{field}", height=80
                    )
            for e in lib.verify_links([entry]):
                st.error(f"⚠️ {e}")
            for w in lib.verify_texts([entry]):
                st.warning(f"⚠️ {w}")
        staged_previews.append((cid, entry, files))

    st.divider()

    # Convert & stage
    if st.button(t("step4_convert_btn"), disabled=not staged_previews):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            all_files = [f for _, _, files in staged_previews for f in files]
            with st.spinner("Downloading images…"):
                downloaded = download_drive_images(all_files, tmp / "src")
            with st.spinner("Converting to WebP…"):
                results = lib.convert_images_to_webp(
                    downloaded, tmp / "webp", max_width=800, quality=82
                )
            converted: dict[str, list] = {}
            for src, dst, status in results:
                prefix = re.sub(r"[_-]\d+\.[^.]+$", "", src.name).lower()
                if status == "ok":
                    converted.setdefault(prefix, []).append(dst)
                    st.write(f"  ✓ {src.name} → {dst.name}")
                else:
                    st.error(f"  ✗ {src.name}: {status}")
            st.session_state.converted_images = {
                prefix: [(p.name, p.read_bytes()) for p in paths]
                for prefix, paths in converted.items()
            }

        for cid, entry, files in staged_previews:
            converted_names = [
                name for name, _ in st.session_state.converted_images.get(cid, [])
            ]
            entry["photos"] = sorted(converted_names) if converted_names else [
                f"{cid}-{str(i+1).zfill(2)}.webp" for i in range(len(files))
            ]
            if not any(s["id"] == cid for s in st.session_state.staged):
                st.session_state.staged.append(entry)
        st.success(f"Staged {len(staged_previews)} candidate(s). Go to Deploy tab.")


def render_fill():
    st.header(t("fill_header"))
    st.info(t("fill_explainer"))

    if st.session_state.candidates is None:
        load_candidates()

    candidates = st.session_state.candidates or []

    # ── Stage 1: Retrieve ─────────────────────────────────────────────────────
    has_api = bool(SHEET_ID and get_secret("google_service_account"))
    retrieve_help = None if has_api else t("fill_no_api_hint")

    if DEV_MODE and DEV_CSV_PATH.exists():
        # Dev mode: retrieve button reads local CSV
        if st.button(t("fill_btn_retrieve"), help="Dev mode: reads local CSV"):
            rows = lib.parse_csv_path(DEV_CSV_PATH)
            st.session_state["_fill_rows"] = rows
            st.caption(f"Dev: loaded from {DEV_CSV_PATH}")
    else:
        col1, col2 = st.columns([1, 3])
        with col1:
            if st.button(t("fill_btn_retrieve"),
                         disabled=not has_api,
                         help=retrieve_help):
                with st.spinner("Retrieving…"):
                    rows = fetch_sheet_rows()
                st.session_state["_fill_rows"] = rows
        with col2:
            if not has_api:
                st.caption(t("fill_no_api_hint"))

    rows = st.session_state.get("_fill_rows")
    if not rows:
        return

    st.write(t("fill_loaded", n=len(rows)))

    # ── Stage 2: Preview then Apply ───────────────────────────────────────────
    if st.button(t("fill_btn_preview")):
        updated, filled, warnings = lib.apply_fill(candidates, rows)
        st.session_state["_fill_preview"] = (updated, filled, warnings)

    preview = st.session_state.get("_fill_preview")
    if preview:
        updated, filled, warnings = preview
        for w in warnings:
            st.warning(w)
        if filled:
            st.write(f"**{t('fill_would_fill')}**")
            for f in filled:
                # Translate field names: "name: filled 'field'" -> localized
                for field in ["activities", "rationale", "recommendation", "minister"]:
                    f = f.replace(f"filled '{field}'", t(f"field_{field}"))
                st.write(f"  • {f}")
            diff = lib.json_diff(candidates, updated)
            with st.expander(t("show_diff")):
                st.code(diff, language="diff")
            st.divider()
            st.write(t("fill_apply_note"))
            if st.button(t("fill_btn_apply")):
                st.session_state.candidates = updated
                st.session_state["_fill_rows"]    = None
                st.session_state["_fill_preview"] = None
                st.success(t("fill_applied"))
                st.rerun()
        else:
            st.info(t("fill_nothing"))


def render_deploy():
    st.header(t("deploy_header"))

    candidates = st.session_state.candidates or []
    staged     = st.session_state.staged
    original   = st.session_state.get("_original_candidates") or []
    orig_by_id = {c["id"]: c for c in original}
    modified   = [c for c in candidates if c["id"] in orig_by_id and c != orig_by_id[c["id"]]]

    has_changes = bool(staged or modified)

    # ── Summary ───────────────────────────────────────────────────────────────
    if not has_changes:
        st.info(t("nothing_staged"))
    else:
        if staged:
            st.write(t("deploy_new", n=len(staged)))
            for c in staged:
                st.write(f"  • {c['name']} (`{c['id']}`)")
        if modified:
            st.write(t("deploy_modified", n=len(modified)))
            for c in modified:
                st.write(f"  • {c['name']} (`{c['id']}`)")

    final_candidates = copy.deepcopy(candidates) + staged
    diff = lib.json_diff(original or candidates, final_candidates)
    with st.expander(t("deploy_diff"), expanded=False):
        if diff:
            st.code(diff, language="diff")
        else:
            st.caption(t("nothing_staged"))

    # ── Verify ────────────────────────────────────────────────────────────────
    dup_errors  = lib.verify_duplicates(final_candidates) if has_changes else []
    link_errors = lib.verify_links(final_candidates) if has_changes else []
    text_warns  = lib.verify_texts(final_candidates) if has_changes else []
    has_errors  = bool(dup_errors or link_errors)

    if dup_errors:
        st.error(t("dup_issues"))
        for e in dup_errors:
            st.write(f"  • {e}")

    if link_errors:
        st.error(t("deploy_fix_links"))
        for e in link_errors:
            st.write(f"  • {e}")
    if text_warns:
        st.warning(t("text_issues"))
        for w in text_warns:
            st.write(f"  • {w}")

    st.divider()

    # ── PR details ────────────────────────────────────────────────────────────
    import re
    import datetime
    names = ", ".join(c["name"] for c in staged) if staged else t("fill_header")
    default_title = (f"Add candidates: {names}" if staged else t("fill_header"))
    pr_title = st.text_input("PR title", value=default_title, disabled=not has_changes)
    pr_body  = st.text_area("PR description", disabled=not has_changes, value=(
        "Automated PR from candidates admin app.\n\n"
        + "\n".join(f"- Add {c['name']}" for c in staged)
    ))
    branch_name = "candidates/" + re.sub(r"[^a-z0-9]+", "-",
                  datetime.datetime.now().strftime("%Y%m%d-%H%M"))

    # ── Action button ─────────────────────────────────────────────────────────
    can_deploy = has_changes and not has_errors
    if DEV_MODE:
        st.caption(f"Dev mode: branch `{branch_name}`")
        if st.button("💾 Save locally (dev)", disabled=not can_deploy):
            lib.save_json(DEV_JSON_PATH, final_candidates)
            for prefix, files in st.session_state.converted_images.items():
                for name, img_bytes in files:
                    (DEV_PORTRAITS_PATH / name).write_bytes(img_bytes)
            st.success(f"Saved to {DEV_JSON_PATH} and {DEV_PORTRAITS_PATH}")
    else:
        if not GITHUB_TOKEN:
            st.error("GitHub token not configured.")
        if st.button("🚀 Open PR on GitHub",
                     disabled=not (can_deploy and GITHUB_TOKEN)):
            commits = [{
                "path":    "docs/candidates.json",
                "content": json.dumps(final_candidates, ensure_ascii=False, indent=2).encode(),
                "message": f"Update candidates.json — {pr_title}",
            }]
            for prefix, files in st.session_state.converted_images.items():
                for name, img_bytes in files:
                    commits.append({
                        "path":    f"docs/portraits/{name}",
                        "content": img_bytes,
                        "message": f"Add portrait {name}",
                    })
            with st.spinner("Opening PR…"):
                pr_url = create_pr(branch_name, pr_title, pr_body, commits)
            st.success(f"PR opened: [{pr_url}]({pr_url})")
            st.session_state.staged = []
            st.session_state.converted_images = {}





# ── Main layout ───────────────────────────────────────────────────────────────

def render_about():
    """About tab: data flow, GitHub link, stats, verify, reset."""
    st.header(t("about_header"))

    candidates = st.session_state.candidates or []

    if DEV_MODE:
        st.warning(t("dev_warning"))

    if candidates:
        loaded_time = st.session_state.get("_loaded_time", "—")
        st.info(t("about_stats", n=len(candidates), time=loaded_time))

    st.markdown("---")
    st.markdown(t("about_source"))
    st.caption(f"v{APP_VERSION}")
    st.markdown("---")

    st.subheader(t("about_flow_header"))
    st.markdown(t("about_flow"))
    st.markdown("---")

    st.subheader(t("about_verify_header"))
    st.write(t("about_verify_text"))
    if st.button(t("btn_verify")):
        if candidates:
            dup_errors  = lib.verify_duplicates(candidates)
            link_errors = lib.verify_links(candidates)
            text_warns  = lib.verify_texts(candidates)
            if dup_errors:
                st.error(t("dup_issues"))
                for e in dup_errors:
                    st.write(f"  • {e}")
            else:
                st.success(t("all_no_dups"))
            if link_errors:
                st.error(t("link_issues"))
                for e in link_errors:
                    st.write(f"  • {e}")
            else:
                st.success(t("all_links_ok"))
            if text_warns:
                st.warning(t("text_issues"))
                for w in text_warns:
                    st.write(f"  • {w}")
            else:
                st.success(t("all_texts_ok"))
        else:
            st.warning(t("no_cands_loaded"))

    st.markdown("---")

    st.subheader(t("about_reset_header"))
    st.write(t("about_reset_text"))
    if st.button("🔄 " + t("about_reset_header")):
        for key in list(st.session_state.keys()):
            del st.session_state[key]
        st.rerun()


def main():
    init_state()

    # Hide Streamlit toolbar; language-aware direction
    lang = st.session_state.get("lang", "he")
    is_rtl = lang == "he"
    dir_val = "rtl" if is_rtl else "ltr"
    text_align = "right" if is_rtl else "left"
    tab_dir = "row-reverse" if is_rtl else "row"
    list_pr = "1.5em" if is_rtl else "0"
    list_pl = "0" if is_rtl else "1.5em"

    st.markdown(f"""
<style>
[data-testid="stToolbar"] {{ display: none; }}

/* Layout direction */
.stApp,
[data-testid="stAppViewContainer"],
[data-testid="stMain"],
[data-testid="stVerticalBlock"],
[data-testid="stHorizontalBlock"] {{ direction: {dir_val}; }}

/* Text alignment */
h1, h2, h3, h4, p, li, label, span,
[data-testid="stMarkdownContainer"],
[data-testid="stText"],
[data-testid="stCaption"],
[data-testid="stAlert"] {{ text-align: {text_align}; direction: {dir_val}; }}

/* Lists */
ol, ul {{ padding-right: {list_pr}; padding-left: {list_pl}; }}
li {{ text-align: {text_align}; }}

/* Text inputs — always RTL for Hebrew content */
textarea, input[type="text"] {{ direction: rtl; text-align: right; }}

/* Tabs */
[data-testid="stTabs"] > div:first-child {{ flex-direction: {tab_dir}; }}

/* Expanders */
[data-testid="stExpander"] {{ direction: {dir_val}; }}
[data-testid="stExpander"] summary {{ direction: {dir_val}; text-align: {text_align}; }}

/* Buttons */
button {{ direction: {dir_val}; }}

/* Selectbox */
[data-testid="stSelectbox"],
[data-testid="stTextInput"],
[data-testid="stTextArea"] {{ direction: {dir_val}; }}
</style>
""", unsafe_allow_html=True)

    # Language toggle in top-right
    lang_col, title_col = st.columns([1, 8])
    with lang_col:
        current_lang = st.session_state.get("lang", "he")
        other_lang   = "he" if current_lang == "en" else "en"
        if st.button(f"🌐 {other_lang.upper()}"):
            st.session_state["lang"] = other_lang
            st.rerun()
    with title_col:
        st.title(t("app_title"))

    if DEV_MODE:
        st.caption(t("dev_warning"))

    tab1, tab2, tab3, tab4, tab5 = st.tabs([
        t("tab_about"), t("tab_dashboard"), t("tab_import"),
        t("tab_fill"), t("tab_deploy"),
    ])

    with tab1:
        render_about()
    with tab2:
        render_dashboard()
    with tab3:
        render_import()
    with tab4:
        render_fill()
    with tab5:
        render_deploy()


if __name__ == "__main__":
    main()
