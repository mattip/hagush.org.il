#!/usr/bin/env python3
"""
parse_candidate_email.py
────────────────────────
Parses a returned candidate registration email (.eml file),
extracts text fields and images, saves images to portraits/,
and appends the new candidate to candidates.json.

Usage:
    python parse_candidate_email.py <email.eml> [--json candidates.json] [--portraits portraits/] [--dry-run]

Requirements:
    pip install beautifulsoup4 pillow
"""

import argparse
import email
import hashlib
import imaplib
import json
import os
import re
import sys
import unicodedata
from email import policy
from email.parser import BytesParser
from pathlib import Path

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

try:
    from PIL import Image
    import io as _io
except ImportError:
    Image = None

# ── Config ────────────────────────────────────────────────────────
MAX_IMAGE_BYTES = 1 * 1024 * 1024          # 1 MB hard limit
ALLOWED_MIME    = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_EXT     = {".jpg", ".jpeg", ".png", ".webp"}


# ── Helpers ───────────────────────────────────────────────────────

def slugify(text: str) -> str:
    """Convert Hebrew/mixed name to a safe ASCII slug for the candidate id."""
    # Transliteration table — Hebrew letters → rough Latin equivalents
    HE_MAP = {
        'א': 'a',  'ב': 'b',  'ג': 'g',  'ד': 'd',  'ה': 'h',
        'ו': 'v',  'ז': 'z',  'ח': 'kh', 'ט': 't',  'י': 'y',
        'כ': 'k',  'ך': 'k',  'ל': 'l',  'מ': 'm',  'ם': 'm',
        'נ': 'n',  'ן': 'n',  'ס': 's',  'ע': 'a',  'פ': 'p',
        'ף': 'p',  'צ': 'tz', 'ץ': 'tz', 'ק': 'k',  'ר': 'r',
        'ש': 'sh', 'ת': 't',
    }
    out = []
    for ch in text:
        if ch in HE_MAP:
            out.append(HE_MAP[ch])
        elif ch.isascii() and (ch.isalnum() or ch in '-_ '):
            out.append(ch.lower())
        # drop everything else (niqqud, punctuation, …)
    slug = re.sub(r'[\s_-]+', '', ''.join(out))
    return slug[:20] or 'candidate'


def unique_id(base: str, existing_ids: set) -> str:
    candidate = base
    n = 2
    while candidate in existing_ids:
        candidate = f"{base}{n}"
        n += 1
    return candidate


def extract_text_fields(body: str) -> dict:
    """
    Parse the plain-text or HTML body for filled-in form fields.
    Looks for patterns like:
        שם מלא: רחל כהן
        גיל: 42
    Works both with the HTML template (input value attributes after render)
    and with a plain-text reply where the user typed their answers inline.
    """
    fields = {}

    # Try HTML parsing first (better fidelity)
    if BeautifulSoup and ('<input' in body or '<textarea' in body):
        soup = BeautifulSoup(body, 'html.parser')
        for tag in soup.find_all(['input', 'textarea']):
            name = tag.get('name', '').strip()
            if not name:
                continue
            if tag.name == 'textarea':
                val = tag.get_text(separator='\n').strip()
            else:
                val = tag.get('value', '').strip()
            if val:
                fields[name] = val
        if fields:
            return fields

    # Fallback: plain-text label:value scanning
    label_map = {
        'שם מלא':        'name',
        'שם':            'name',
        'גיל':           'age',
        'עיר':           'home',
        'ישוב':          'home',
        'עיר / ישוב':    'home',
        'תיאור':         'activities',
        'תואר':          'activities',
        'תיאור / תואר':  'activities',
        'למה אני רוצה':  'rationale',
        'מוטיבציה':      'rationale',
        'מילה טובה':     'recommendation',
        'שר':            'minister',
        'שרה':           'minister',
        'שר/ה':          'minister',
        'פייסבוק':       'facebook',
        'אינסטגרם':      'instagram',
        'לינקדאין':      'linkedin',
        'linkedin':      'linkedin',
        'טוויטר':        'x',
        'twitter':       'x',
        'x / טוויטר':   'x',
    }
    for line in body.splitlines():
        line = line.strip()
        if not line:
            continue
        for label, field in label_map.items():
            # Match "label: value" or "label — value"
            pattern = re.compile(
                r'^' + re.escape(label) + r'[\s]*[:\-—]\s*(.+)',
                re.IGNORECASE
            )
            m = pattern.match(line)
            if m:
                val = m.group(1).strip()
                if val and field not in fields:
                    fields[field] = val
                break

    return fields


def validate_image(data: bytes, filename: str) -> tuple[bool, str]:
    """Returns (ok, reason). Checks size and (if Pillow available) validity."""
    if len(data) > MAX_IMAGE_BYTES:
        mb = len(data) / 1024 / 1024
        return False, f"גודל {mb:.1f}MB חורג מ-1MB המותר"

    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXT:
        return False, f"סיומת {ext} אינה נתמכת (jpg/png/webp בלבד)"

    if Image:
        try:
            img = Image.open(_io.BytesIO(data))
            img.verify()
        except Exception as e:
            return False, f"קובץ תמונה פגום: {e}"

    return True, ""


def save_image(data: bytes, filename: str, portraits_dir: Path) -> str:
    """Save image bytes, return relative path used in candidates.json."""
    portraits_dir.mkdir(parents=True, exist_ok=True)
    dest = portraits_dir / filename
    # Avoid overwriting — append hash suffix if name collision
    if dest.exists():
        h = hashlib.md5(data).hexdigest()[:6]
        stem, ext = os.path.splitext(filename)
        filename = f"{stem}_{h}{ext}"
        dest = portraits_dir / filename
    dest.write_bytes(data)
    print(f"  ✓ תמונה נשמרה: {dest}")
    return f"portraits/{filename}"


# ── Core parser ───────────────────────────────────────────────────

def parse_eml(eml_path: Path) -> tuple[dict, list[tuple[str, bytes]]]:
    """
    Parse an .eml file.
    Returns:
        fields  — dict of text fields extracted from the body
        images  — list of (filename, bytes) for each image attachment
    """
    with eml_path.open('rb') as f:
        msg = BytesParser(policy=policy.default).parse(f)

    body_text = ""
    images = []

    for part in msg.walk():
        ct = part.get_content_type()
        cd = part.get_content_disposition() or ''

        if ct in ALLOWED_MIME and 'attachment' in cd:
            filename = part.get_filename() or f"photo_{len(images)+1}.jpg"
            images.append((filename, part.get_payload(decode=True)))

        elif ct == 'text/html' and not body_text:
            payload = part.get_payload(decode=True)
            charset = part.get_content_charset() or 'utf-8'
            body_text = payload.decode(charset, errors='replace')

        elif ct == 'text/plain' and not body_text:
            payload = part.get_payload(decode=True)
            charset = part.get_content_charset() or 'utf-8'
            body_text = payload.decode(charset, errors='replace')

    fields = extract_text_fields(body_text)
    return fields, images


def build_candidate(fields: dict, photo_paths: list[str], existing_ids: set) -> dict:
    """Construct a candidates.json entry from parsed fields."""
    name = fields.get('name', '').strip()
    if not name:
        raise ValueError("שם המועמד/ת חסר — לא ניתן ליצור רשומה")

    cid = unique_id(slugify(name), existing_ids)

    links = {}
    for platform in ('facebook', 'instagram', 'linkedin', 'x'):
        val = fields.get(platform, '').strip()
        if val and val.startswith('http'):
            links[platform] = val

    candidate = {
        "id":             cid,
        "name":           name,
        "age":            fields.get('age', '').strip(),
        "home":           fields.get('home', '').strip(),
        "activities":     fields.get('activities', '').strip(),
        "rationale":      fields.get('rationale', '').strip(),
        "recommendation": fields.get('recommendation', '').strip(),
        "minister":       fields.get('minister', '').strip(),
        "links":          links,
        "photos":         photo_paths,
    }
    return candidate


def update_json(json_path: Path, candidate: dict, dry_run: bool) -> None:
    if json_path.exists():
        with json_path.open('r', encoding='utf-8') as f:
            data = json.load(f)
    else:
        data = []

    data.append(candidate)

    if dry_run:
        print("\n── DRY RUN — candidates.json לא עודכן. רשומה שהיתה נוספת:")
        print(json.dumps(candidate, ensure_ascii=False, indent=2))
        return

    with json_path.open('w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"\n✓ {json_path} עודכן — סך הכל {len(data)} מועמדים")


# ── Main ──────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(
        description='Parse a returned candidate email and add to candidates.json'
    )
    ap.add_argument('eml',           help='Path to the .eml file')
    ap.add_argument('--json',        default='candidates.json',
                    help='Path to candidates.json (default: candidates.json)')
    ap.add_argument('--portraits',   default='portraits',
                    help='Directory to save images (default: portraits/)')
    ap.add_argument('--dry-run',     action='store_true',
                    help='Parse and print without writing any files')
    args = ap.parse_args()

    eml_path      = Path(args.eml)
    json_path     = Path(args.json)
    portraits_dir = Path(args.portraits)

    if not eml_path.exists():
        print(f"שגיאה: הקובץ {eml_path} לא נמצא", file=sys.stderr)
        sys.exit(1)

    print(f"\n📧  מנתח: {eml_path.name}")
    print("─" * 50)

    # Parse email
    fields, raw_images = parse_eml(eml_path)

    # Report extracted fields
    print("\n📋  שדות שזוהו:")
    for k, v in fields.items():
        preview = v[:60].replace('\n', ' ')
        print(f"  {k:20s} → {preview}")
    if not fields:
        print("  ⚠️  לא זוהו שדות — ייתכן שפורמט המייל אינו נתמך")

    # Validate and save images
    print(f"\n🖼️  תמונות שנמצאו: {len(raw_images)}")
    if len(raw_images) < 3:
        print(f"  ⚠️  נמצאו {len(raw_images)} תמונות — נדרשות 3")

    photo_paths = []
    errors = []
    for filename, data in raw_images:
        ok, reason = validate_image(data, filename)
        if not ok:
            print(f"  ✗ {filename} — {reason}")
            errors.append(f"{filename}: {reason}")
            continue
        if not args.dry_run:
            path = save_image(data, filename, portraits_dir)
            photo_paths.append(path)
        else:
            photo_paths.append(f"portraits/{filename}")
            print(f"  [dry-run] {filename} ({len(data)//1024}KB) — תקין")

    if errors:
        print(f"\n⚠️  {len(errors)} תמונות נדחו. הוספת המועמד/ת תמשיך ללא תמונות אלו.")

    # Load existing IDs
    existing_ids = set()
    if json_path.exists():
        try:
            with json_path.open('r', encoding='utf-8') as f:
                existing = json.load(f)
            existing_ids = {c.get('id', '') for c in existing}
        except Exception:
            pass

    # Build and save candidate
    try:
        candidate = build_candidate(fields, photo_paths, existing_ids)
    except ValueError as e:
        print(f"\n❌  {e}", file=sys.stderr)
        sys.exit(1)

    print(f"\n👤  מועמד/ת חדש/ה: {candidate['name']}  (id: {candidate['id']})")
    update_json(json_path, candidate, args.dry_run)
    print("\n✅  סיום\n")


if __name__ == '__main__':
    main()
