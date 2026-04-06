"""
candidates_lib.py — shared logic for parse_candidates.py and the Streamlit app.

Provides:
  - Column name constants
  - Name normalization (honorifics, geresh)
  - Fuzzy name matching
  - Link extraction from CSV rows
  - Verification (links + text fields)
  - Fill / add logic (returns data, no I/O or printing)
  - Photo discovery
  - JSON load/save
  - Image conversion via ImageMagick
"""

import csv
import difflib
import io
import json
import re
import subprocess
from pathlib import Path


# ── CSV column constants ──────────────────────────────────────────────────────

COL_NAME        = "שם"
COL_EMAIL       = "Email address"
COL_AGE         = "גיל"
COL_HOME        = "עיר/ישוב"
COL_ACTIVITIES  = "תאור/תואר"
COL_RATIONALE   = "פסקה קצרה שמציגה אותך לציבור."
COL_RECOMMEND   = "מילה טובה"
COL_MINISTER    = "איזה שר.ה תרצה.י להיות?"
COL_FACEBOOK    = "פייסבוק"
COL_INSTAGRAM   = "אינסטאגראם"
COL_X           = "X / טוויטר"
COL_LINKEDIN    = "לינקדאין"
COL_TIKTOK      = "טיקטוק"
COL_HOMEPAGE    = "אתר אישי"

LINK_COLUMNS = {
    "facebook":  (COL_FACEBOOK,  r"facebook\.com|fb\.com|tinyurl"),
    "instagram": (COL_INSTAGRAM, r"instagram\.com"),
    "x":         (COL_X,         r"x\.com|twitter\.com|t\.co"),
    "linkedin":  (COL_LINKEDIN,  r"linkedin\.com"),
    "tiktok":    (COL_TIKTOK,    r"tiktok\.com"),
    "homepage":  (COL_HOMEPAGE,  None),
}

SOCIAL_PATTERNS = {
    "facebook":  r"(facebook\.com|fb\.com|tinyurl\.com)",
    "instagram": r"instagram\.com",
    "x":         r"(x\.com|twitter\.com|t\.co)",
    "linkedin":  r"linkedin\.com",
    "tiktok":    r"tiktok\.com",
    "telegram":  r"(t\.me|telegram)",
    "youtube":   r"youtube\.com",
}

TEXT_FIELDS = ["activities", "rationale", "recommendation", "minister"]

FILL_FIELDS = {
    "activities":     COL_ACTIVITIES,
    "rationale":      COL_RATIONALE,
    "recommendation": COL_RECOMMEND,
    "minister":       COL_MINISTER,
}

CORE_FIELDS = {"age": COL_AGE, "home": COL_HOME}


# ── Name normalization ────────────────────────────────────────────────────────

_HONORIFIC_LIST = [
    "\u05d3\u05f4\u05e8", '\u05d3"\u05e8',
    "\u05d3\u05e8\u05f3", "\u05d3'\u05e8",
    "\u05e4\u05e8\u05d5\u05e4\u05f3", "\u05e4\u05e8\u05d5\u05e4'",
    "\u05e4\u05e8\u05d5\u05e4\u05e1\u05d5\u05e8",
    "\u05d4\u05e8\u05d1", "\u05d4\u05e9\u05e8",
    "\u05d7\u05f4\u05db", '\u05d7"\u05db',
    "\u05e2\u05d5\u05f4\u05d3", '\u05e2\u05d5"\u05d3',
]
_HONORIFICS = re.compile(
    r"^(" + "|".join(re.escape(h) for h in _HONORIFIC_LIST) + r")\s+",
    re.UNICODE
)
_GERESH_MAP = str.maketrans("\u05f3\u05f4", "'\"")


def clean(s):
    return (s or "").strip()


def normalize_name(s):
    s = " ".join(clean(s).split())
    s = s.translate(_GERESH_MAP)
    s = _HONORIFICS.sub("", s)
    return s


def fuzzy_match(name, candidates, threshold=0.7):
    """Return (best_match_normalized_name, ratio) if above threshold, else (None, 0)."""
    best_ratio, best_match = 0.0, None
    for c in candidates:
        norm = normalize_name(c["name"])
        ratio = difflib.SequenceMatcher(None, name, norm).ratio()
        if ratio > best_ratio:
            best_ratio, best_match = ratio, norm
    if best_ratio >= threshold:
        return best_match, best_ratio
    return None, 0.0


# ── JSON / CSV I/O ────────────────────────────────────────────────────────────

def load_json(path):
    """Load candidates.json. Raises ValueError on bad input."""
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"JSON file not found: {path}")
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise ValueError(f"Failed to parse JSON: {e}") from e
    if not isinstance(data, list):
        raise ValueError(f"JSON must be a list, got {type(data).__name__}")
    return data


def save_json(path, data):
    Path(path).write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )


def json_diff(before, after):
    """Return unified diff string between two candidate lists, or '' if identical."""
    a = json.dumps(before, ensure_ascii=False, indent=2).splitlines(keepends=True)
    b = json.dumps(after,  ensure_ascii=False, indent=2).splitlines(keepends=True)
    lines = list(difflib.unified_diff(
        a, b,
        fromfile="candidates.json (current)",
        tofile="candidates.json (new)",
    ))
    return "".join(lines)


def parse_csv_bytes(data: bytes) -> list[dict]:
    """Parse CSV from bytes (e.g. uploaded file). Raises ValueError on bad input."""
    text = data.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        raise ValueError("CSV file is empty")
    if COL_NAME not in rows[0]:
        raise ValueError(
            f"CSV missing expected name column '{COL_NAME}'. "
            f"Found: {list(rows[0].keys())}"
        )
    return rows


def parse_csv_path(path) -> list[dict]:
    """Parse CSV from a file path."""
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"CSV not found: {path}")
    return parse_csv_bytes(p.read_bytes())


def merge_duplicate_rows(rows: list[dict]) -> tuple[list[dict], list[str]]:
    """Merge duplicate submissions by email.

    Strategy: start with the first submission as the base, then overwrite all
    fields with the later submission unconditionally (the candidate's latest
    answers always win, even if they left a field blank the second time).

    Returns (merged_rows, warning_messages).
    Warns if the same name appears with different emails.
    """
    warnings = []
    # Pass 1: merge by email — first row is base, later rows overwrite entirely
    by_email: dict[str, dict] = {}
    no_email: list[dict] = []
    for row in rows:
        email = clean(row.get(COL_EMAIL, "")).lower()
        if not email:
            no_email.append(row)
            continue
        if email not in by_email:
            by_email[email] = dict(row)
        else:
            # Overwrite with non-empty values from the later row
            for k, v in row.items():
                if clean(v):
                    by_email[email][k] = v

    merged = list(by_email.values()) + no_email

    # Pass 2: warn on same name, different emails
    name_to_emails: dict[str, set] = {}
    for row in merged:
        name = normalize_name(row.get(COL_NAME, ""))
        email = clean(row.get(COL_EMAIL, "")).lower()
        if name:
            name_to_emails.setdefault(name, set()).add(email or "(no email)")
    for name, emails in name_to_emails.items():
        if len(emails) > 1:
            warnings.append(
                f"'{name}' appears with multiple emails: {', '.join(sorted(emails))}"
            )

    return merged, warnings


# ── Photo discovery ───────────────────────────────────────────────────────────

def find_photos(portraits_dir, candidate_id: str) -> list[str]:
    """Return sorted list of webp filenames starting with candidate_id (case-insensitive)."""
    p = Path(portraits_dir)
    if not p.is_dir():
        return []
    return sorted(
        f.name for f in p.iterdir()
        if f.name.lower().startswith(candidate_id.lower())
        and f.suffix.lower() == ".webp"
    )


def scan_image_groups(folder) -> dict[str, list[str]]:
    """Scan a folder for image files and group by prefix (everything before the last _NN part).

    e.g. Hadas_r_01.png, Hadas_r_02.png → {"hadas_r": ["Hadas_r_01.png", "Hadas_r_02.png"]}
    Returns dict of lowercase_prefix → sorted list of filenames.
    """
    groups: dict[str, list[str]] = {}
    p = Path(folder)
    if not p.is_dir():
        return groups
    for f in sorted(p.iterdir()):
        if f.suffix.lower() not in (".png", ".jpg", ".jpeg", ".webp"):
            continue
        # Strip trailing _NN or -NN suffix
        stem = re.sub(r"[_-][^\d_-]?\d+$", "", f.stem)
        key = stem.lower()
        groups.setdefault(key, []).append(f.name)
    return groups


# ── Image conversion ──────────────────────────────────────────────────────────

def convert_images_to_webp(
    src_files: list[Path],
    out_dir: Path,
    max_width: int = 800,
    quality: int = 82,
) -> list[tuple[Path, Path, str]]:
    """Convert a list of image files to WebP using ImageMagick.

    Returns list of (src, dst, status) where status is 'ok' or an error message.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    results = []
    for src in src_files:
        dst = out_dir / (re.sub(r"\.[^.]+$", "", src.name) + ".webp")
        try:
            subprocess.run(
                ["magick", str(src), "-resize", f"{max_width}x>", "-quality", str(quality), str(dst)],
                check=True, capture_output=True
            )
            results.append((src, dst, "ok"))
        except subprocess.CalledProcessError as e:
            results.append((src, dst, e.stderr.decode(errors="replace")))
        except FileNotFoundError:
            results.append((src, dst, "ImageMagick 'magick' command not found"))
    return results


# ── Link extraction ───────────────────────────────────────────────────────────

def strip_utm(url: str) -> str:
    """Remove UTM tracking parameters from a URL."""
    from urllib.parse import urlparse, urlencode, parse_qsl, urlunparse
    try:
        p = urlparse(url)
        qs = [(k, v) for k, v in parse_qsl(p.query) if not k.lower().startswith("utm_")]
        return urlunparse(p._replace(query=urlencode(qs)))
    except Exception:
        return url


def csv_to_links(row: dict) -> dict[str, str]:
    links = {}
    for platform, (col, _) in LINK_COLUMNS.items():
        val = clean(row.get(col, ""))
        if val:
            if not re.match(r"https?://", val, re.I):
                val = "https://" + val
            links[platform] = strip_utm(val)
    return links


def row_to_candidate(row: dict, cid: str, photos: list[str], minimal: bool) -> dict:
    """Build a candidate dict from a CSV row."""
    return {
        "id":   cid,
        "name": normalize_name(row.get(COL_NAME, "")),
        "age":  clean(row.get(COL_AGE, "")),
        "home": clean(row.get(COL_HOME, "")),
        "activities":     "" if minimal else clean(row.get(COL_ACTIVITIES, "")),
        "rationale":      "" if minimal else clean(row.get(COL_RATIONALE, "")),
        "recommendation": "" if minimal else clean(row.get(COL_RECOMMEND, "")),
        "minister":       "" if minimal else clean(row.get(COL_MINISTER, "")),
        "links":  csv_to_links(row),
        "photos": photos,
    }


# ── Core operations (return data, no I/O) ────────────────────────────────────

def get_new_rows(candidates: list[dict], rows: list[dict]) -> list[dict]:
    """Return CSV rows whose names are not already in candidates."""
    existing = {normalize_name(c["name"]) for c in candidates}
    return [r for r in rows if normalize_name(r.get(COL_NAME, "")) not in existing]


def apply_fill(candidates: list[dict], rows: list[dict]) -> tuple[list[dict], list[str], list[str]]:
    """Fill empty text fields from CSV rows.

    Returns (updated_candidates, filled_messages, warning_messages).
    Does not mutate the input list — returns a deep copy.
    """
    import copy
    candidates = copy.deepcopy(candidates)
    name_map = {normalize_name(c["name"]): c for c in candidates}
    filled_msgs = []
    warning_msgs = []

    for row in rows:
        name = normalize_name(row.get(COL_NAME, ""))
        if not name or name not in name_map:
            match, ratio = fuzzy_match(name, candidates)
            if match:
                warning_msgs.append(
                    f"No exact match for '{name}' — closest: '{match}' ({ratio:.0%})"
                )
            continue
        c = name_map[name]
        for field, col in CORE_FIELDS.items():
            csv_val = clean(row.get(col, ""))
            json_val = clean(c.get(field, ""))
            if csv_val and json_val and csv_val != json_val:
                warning_msgs.append(
                    f"{name}: '{field}' differs — JSON='{json_val}' CSV='{csv_val}'"
                )
        for field, col in FILL_FIELDS.items():
            if not c.get(field):
                csv_val = clean(row.get(col, ""))
                if csv_val:
                    c[field] = csv_val
                    filled_msgs.append(f"{name}: filled '{field}'")

    return candidates, filled_msgs, warning_msgs


# ── Verification ─────────────────────────────────────────────────────────────

def verify_duplicates(candidates: list[dict]) -> list[str]:
    """Return list of error strings for duplicate IDs or names."""
    errors = []
    seen_ids   = {}
    seen_names = {}
    for i, c in enumerate(candidates):
        cid  = c.get("id", "")
        name = c.get("name", "")
        if cid in seen_ids:
            errors.append(f"Duplicate id '{cid}': entries {seen_ids[cid]} and {i}")
        else:
            seen_ids[cid] = i
        if name in seen_names:
            errors.append(f"Duplicate name '{name}': entries {seen_names[name]} and {i}")
        else:
            seen_names[name] = i
    return errors


def verify_links(candidates: list[dict]) -> list[str]:
    """Return list of error strings for bad/suspicious links (hard errors only)."""
    errors = []
    for c in candidates:
        for platform, url in (c.get("links") or {}).items():
            pattern = SOCIAL_PATTERNS.get(platform)
            if pattern and not re.search(pattern, url, re.I):
                errors.append(f"{c['name']} [{c['id']}]: '{platform}' URL looks wrong → {url}")
    return errors


def verify_links_warnings(candidates: list[dict]) -> list[str]:
    """Return list of warning strings for links with UTM parameters."""
    warnings = []
    for c in candidates:
        for platform, url in (c.get("links") or {}).items():
            if "utm_" in url.lower():
                warnings.append(f"{c['name']} [{c['id']}]: '{platform}' has UTM parameters → {url}")
    return warnings


def _find_bad_chars(text: str) -> list[tuple[str, int, str]]:
    issues = []
    for i, ch in enumerate(text):
        cp = ord(ch)
        if cp < 0x20 and cp not in (0x09, 0x0A):
            issues.append((ch, i, f"control character U+{cp:04X}"))
        elif 0xE000 <= cp <= 0xF8FF:
            issues.append((ch, i, f"private-use character U+{cp:04X}"))
        elif cp == 0xFFFD:
            issues.append((ch, i, "replacement character U+FFFD"))
        elif cp == 0x200B:
            issues.append((ch, i, "zero-width space U+200B"))
        elif cp == 0x200C:
            issues.append((ch, i, "zero-width non-joiner U+200C"))
        elif cp == 0xFEFF:
            issues.append((ch, i, "BOM U+FEFF"))
        elif cp == 0x200D:
            prev_cp = ord(text[i - 1]) if i > 0 else 0
            next_cp = ord(text[i + 1]) if i + 1 < len(text) else 0
            if not (prev_cp >= 0x1F000 or next_cp >= 0x1F000
                    or 0x2600 <= prev_cp <= 0x27BF or 0x2600 <= next_cp <= 0x27BF):
                issues.append((ch, i, "zero-width joiner U+200D (not between emoji)"))
    return issues


def verify_texts(candidates: list[dict]) -> list[str]:
    """Return list of warning strings for bad characters or escape sequences in text fields."""
    warnings = []
    for c in candidates:
        name = c.get("name", c.get("id", "?"))
        cid  = c.get("id", "?")
        for field in TEXT_FIELDS:
            text = c.get(field, "") or ""
            if not text:
                continue
            for _, pos, desc in _find_bad_chars(text):
                ctx = text[max(0, pos - 10):pos + 10]
                warnings.append(f"{name} [{cid}] '{field}': {desc} — context: {repr(ctx)}")
            if re.search(r"\\n", text):
                warnings.append(
                    f"{name} [{cid}] '{field}': literal \\n found "
                    f"(should be a real newline)"
                )
    return warnings
