#!/usr/bin/env python3
"""
parse_candidates.py — import Google Form CSV responses into candidates.json

Default (no flags): add new people with all fields filled in.
--minimal:  add new people but leave text fields empty.
--fill:     only fill empty text fields for existing people, don't add new ones.
--verify:   check social media link URLs (can combine with other flags).

Config file (INI format):
  [parse_candidates]
  json     = candidates.json
  csv      = responses.csv
  portraits = portraits/
  mapping  = mapping.txt

Mapping file (one entry per line):
  Dany_e    דני אלגרט
  Hadas_r   הדס רגולסקי

Command-line args always override config file values.
"""

import argparse
import configparser
import csv
import json
import os
import re
import sys
from pathlib import Path


# ── CSV column → JSON field mapping ──────────────────────────────────────────

COL_NAME        = "שם"
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

CONFIG_SECTION = "parse_candidates"


# ── Helpers ───────────────────────────────────────────────────────────────────

def die(msg):
    print(f"Error: {msg}", file=sys.stderr)
    sys.exit(1)

def load_json(path):
    if not os.path.exists(path):
        die(f"JSON file not found: {path}")
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        die(f"Failed to parse JSON ({path}): {e}")
    if not isinstance(data, list):
        die(f"JSON must contain a list of candidates, got: {type(data).__name__}")
    return data

def load_csv(path):
    if not os.path.exists(path):
        die(f"CSV file not found: {path}")
    try:
        with open(path, encoding="utf-8-sig") as f:
            rows = list(csv.DictReader(f))
    except Exception as e:
        die(f"Failed to parse CSV ({path}): {e}")
    if not rows:
        die(f"CSV file is empty: {path}")
    if COL_NAME not in rows[0]:
        die(
            f"CSV missing expected name column '{COL_NAME}'. "
            f"Found: {list(rows[0].keys())}"
        )
    return rows

def load_mapping(path):
    """Load mapping file: lines of '<english_id>  <hebrew name>'.
    Returns dict of normalized_hebrew_name → english_id.
    Skips blank lines and lines starting with #.
    """
    if not os.path.exists(path):
        die(f"Mapping file not found: {path}")
    mapping = {}
    with open(path, encoding="utf-8") as f:
        for lineno, line in enumerate(f, 1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split(None, 1)
            if len(parts) != 2:
                die(f"Mapping file line {lineno}: expected '<id> <hebrew name>', got: {line!r}")
            cid, name = parts[0].strip().lower(), parts[1].strip()
            mapping[normalize_name(name)] = cid
    if not mapping:
        die(f"Mapping file is empty: {path}")
    return mapping

def load_config(path):
    """Load INI config file. Returns dict of key→value from [parse_candidates] section."""
    if not os.path.exists(path):
        die(f"Config file not found: {path}")
    cp = configparser.ConfigParser()
    try:
        cp.read(path, encoding="utf-8")
    except configparser.Error as e:
        die(f"Failed to parse config file ({path}): {e}")
    if not cp.has_section(CONFIG_SECTION):
        die(f"Config file missing [{CONFIG_SECTION}] section: {path}")
    return dict(cp[CONFIG_SECTION])

def check_portraits_dir(portraits_dir):
    p = Path(portraits_dir)
    if not p.exists():
        die(f"Portraits directory not found: {portraits_dir}")
    if not p.is_dir():
        die(f"Portraits path is not a directory: {portraits_dir}")
    if not list(p.glob("*.webp")):
        die(f"Portraits directory contains no .webp files: {portraits_dir}")

def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"✓ Saved {path}")

def clean(s):
    return (s or "").strip()

# Honorifics to strip before name matching.
# Built at runtime to avoid Python 3.12+ issues with U+05F3/U+05F4 in literals.
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
# Hebrew geresh/gershayim (U+05F3, U+05F4) -> ASCII equivalents
_GERESH_MAP = str.maketrans("׳״", "'\"")

def normalize_name(s):
    s = " ".join(clean(s).split())
    s = s.translate(_GERESH_MAP)
    s = _HONORIFICS.sub("", s)
    return s

def fuzzy_warn(csv_name, json_names, threshold=0.7):
    """If csv_name has no exact match, warn if it is close to any json name."""
    from difflib import SequenceMatcher
    best_ratio, best_match = 0.0, None
    for jname in json_names:
        ratio = SequenceMatcher(None, csv_name, jname).ratio()
        if ratio > best_ratio:
            best_ratio, best_match = ratio, jname
    if best_ratio >= threshold:
        print(
            f"  \u2139\ufe0f  No match for '{csv_name}' \u2014 "
            f"closest JSON name: '{best_match}' (similarity: {best_ratio:.0%})"
        )

def csv_to_links(row):
    links = {}
    for platform, (col, _) in LINK_COLUMNS.items():
        val = clean(row.get(col, ""))
        if val:
            if not re.match(r"https?://", val, re.I):
                val = "https://" + val
            links[platform] = val
    return links

def find_photos(portraits_dir, candidate_id):
    p = Path(portraits_dir)
    if not p.is_dir():
        return []
    return sorted(
        f.name for f in p.iterdir()
        if f.name.lower().startswith(candidate_id) and f.suffix.lower() == ".webp"
    )


# ── Verify ────────────────────────────────────────────────────────────────────

def verify_links(candidates):
    errors = []
    for c in candidates:
        for platform, url in (c.get("links") or {}).items():
            pattern = SOCIAL_PATTERNS.get(platform)
            if pattern is None:
                continue
            if not re.search(pattern, url, re.I):
                errors.append(
                    f"  {c['name']} [{c['id']}]: '{platform}' URL looks wrong → {url}"
                )
            if "utm_" in url.lower():
                errors.append(
                    f"  {c['name']} [{c['id']}]: "
                    f"'{platform}' URL contains UTM parameters → {url}"
                )
    if errors:
        print("⚠️  Link verification issues:")
        for e in errors:
            print(e)
    else:
        print("✓ All links look correct.")
    return len(errors) == 0


# ── Modes ─────────────────────────────────────────────────────────────────────

def prompt_id(name, candidates):
    """Prompt for an English ID; return None if user skips (empty input)."""
    while True:
        cid = input(f"  English ID for {name} (or Enter to skip): ").strip().lower()
        if not cid:
            print("  Skipping.")
            return None
        if any(c["id"] == cid for c in candidates):
            print(f"  ID '{cid}' already taken, choose another.")
            continue
        return cid


def add_new_candidates(candidates, rows, portraits_dir, minimal, mapping):
    """Add candidates from rows not already in candidates.
    mapping: dict of normalized_hebrew_name → english_id (may be None).
    If a name is not in mapping, fall back to interactive prompt.
    If mapping is provided, names not in it are silently skipped.
    """
    existing_names = {normalize_name(c["name"]) for c in candidates}
    added = 0
    skipped_no_mapping = []

    for row in rows:
        name = normalize_name(row.get(COL_NAME, ""))
        if not name:
            continue
        if name in existing_names:
            print(f"  skip (already exists): {name}")
            continue

        # Resolve ID from mapping or prompt
        if mapping is not None:
            cid = mapping.get(name)
            if cid is None:
                skipped_no_mapping.append(name)
                continue
            if any(c["id"] == cid for c in candidates):
                print(f"  ⚠️  ID '{cid}' (from mapping) already taken, skipping {name}")
                continue
            print(f"\nNew candidate: {name}  →  id: {cid}")
        else:
            print(f"\nNew candidate: {name}")
            cid = prompt_id(name, candidates)
            if cid is None:
                continue

        # Check portraits
        photos = find_photos(portraits_dir, cid)
        if not photos:
            print(f"  ⚠️  No .webp files found in '{portraits_dir}' starting with '{cid}'")
            if mapping is not None:
                print("  Skipping (no photos — add photos and re-run).")
                continue
            cont = input("  Continue anyway? [y/N]: ").strip().lower()
            if cont != "y":
                print("  Skipping.")
                continue
        else:
            print(f"  Found photos: {photos}")

        links = csv_to_links(row)
        entry = {
            "id": cid,
            "name": name,
            "age": clean(row.get(COL_AGE, "")),
            "home": clean(row.get(COL_HOME, "")),
            "activities": "" if minimal else clean(row.get(COL_ACTIVITIES, "")),
            "rationale":  "" if minimal else clean(row.get(COL_RATIONALE, "")),
            "recommendation": "" if minimal else clean(row.get(COL_RECOMMEND, "")),
            "minister":   "" if minimal else clean(row.get(COL_MINISTER, "")),
            "links": links,
            "photos": photos,
        }
        candidates.append(entry)
        existing_names.add(name)
        added += 1
        print(f"  ✓ Added {name} as '{cid}'")

    if skipped_no_mapping:
        print(f"\n  ℹ️  Skipped (not in mapping): {', '.join(skipped_no_mapping)}")
    print(f"\nDone. Added {added} new candidate(s).")
    return candidates


def fill_existing(candidates, rows):
    name_to_candidate = {normalize_name(c["name"]): c for c in candidates}
    FILL_FIELDS = {
        "activities":     COL_ACTIVITIES,
        "rationale":      COL_RATIONALE,
        "recommendation": COL_RECOMMEND,
        "minister":       COL_MINISTER,
    }
    CORE_FIELDS = {"age": COL_AGE, "home": COL_HOME}
    filled = warnings = 0

    json_names_normalized = list(name_to_candidate.keys())

    for row in rows:
        name = normalize_name(row.get(COL_NAME, ""))
        if not name:
            continue
        if name not in name_to_candidate:
            fuzzy_warn(name, json_names_normalized)
            continue
        c = name_to_candidate[name]
        for field, col in CORE_FIELDS.items():
            csv_val = clean(row.get(col, ""))
            json_val = clean(c.get(field, ""))
            if csv_val and json_val and csv_val != json_val:
                print(f"  ⚠️  {name}: '{field}' differs — JSON='{json_val}' CSV='{csv_val}'")
                warnings += 1
        for field, col in FILL_FIELDS.items():
            if not c.get(field):
                csv_val = clean(row.get(col, ""))
                if csv_val:
                    c[field] = csv_val
                    print(f"  ✓ {name}: filled '{field}'")
                    filled += 1

    print(f"Filled {filled} field(s), {warnings} warning(s).")
    return candidates


# ── Argument resolution (config + CLI) ───────────────────────────────────────

def resolve_args(args, parser):
    """Merge config file values with CLI args. CLI always wins.
    Returns a namespace with all required values populated, or exits with a
    helpful error listing exactly which args are still missing.
    """
    cfg = {}
    if args.config:
        cfg = load_config(args.config)

    # Map config keys to arg attribute names
    CONFIG_KEYS = {
        "json":      "json",
        "csv":       "csv",
        "portraits": "portraits",
        "mapping":   "mapping",
    }

    for cfg_key, attr in CONFIG_KEYS.items():
        if getattr(args, attr) is None and cfg_key in cfg:
            setattr(args, attr, cfg[cfg_key])

    # Determine which args are required given the mode
    needs_csv      = not args.verify or args.fill or args.minimal
    needs_portraits = not args.fill and not args.verify

    missing = []
    if args.json is None:
        missing.append("--json")
    if needs_csv and args.csv is None:
        missing.append("--csv")
    if needs_portraits and args.portraits is None:
        missing.append("--portraits")

    if missing:
        how = "supply them on the command line or in a config file (--config)"
        parser.error(
            f"Missing required argument(s): {', '.join(missing)}\n  → {how}"
        )

    return args


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    # File args — all optional at parse time, validated after config merge
    parser.add_argument("--config",    metavar="FILE", help="INI config file")
    parser.add_argument("--json",      metavar="FILE", help="Path to candidates.json")
    parser.add_argument("--csv",       metavar="FILE", help="Path to CSV responses file")
    parser.add_argument("--portraits", metavar="DIR",  help="Path to portraits directory")
    parser.add_argument("--mapping",   metavar="FILE", help="Path to id→name mapping file")

    # Mode flags
    parser.add_argument("--minimal", action="store_true",
                        help="Add new candidates with core fields only (skip text fields)")
    parser.add_argument("--fill",    action="store_true",
                        help="Fill empty text fields for existing candidates; don't add new ones")
    parser.add_argument("--verify",  action="store_true",
                        help="Check social media links for correctness")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print what would change without writing to disk")

    args = parser.parse_args()
    args = resolve_args(args, parser)

    candidates = load_json(args.json)
    modified = False

    if args.csv and not args.verify or (args.fill or args.minimal):
        rows = load_csv(args.csv)

        # Load mapping if provided
        mapping = load_mapping(args.mapping) if args.mapping else None

        if args.fill:
            print("── Filling existing candidates ──────────────────────")
            candidates = fill_existing(candidates, rows)
            modified = True
        else:
            check_portraits_dir(args.portraits)
            print("── Adding new candidates ────────────────────────────")
            candidates = add_new_candidates(
                candidates, rows, args.portraits,
                minimal=args.minimal, mapping=mapping,
            )
            modified = True
            if not args.minimal:
                print("\n── Filling existing candidates ──────────────────────")
                candidates = fill_existing(candidates, rows)

    if args.verify:
        print("\n── Link verification ────────────────────────────────")
        verify_links(candidates)

    if modified and not args.dry_run:
        save_json(args.json, candidates)
    elif modified and args.dry_run:
        import difflib
        original = load_json(args.json)
        before = json.dumps(original, ensure_ascii=False, indent=2).splitlines(keepends=True)
        after  = json.dumps(candidates, ensure_ascii=False, indent=2).splitlines(keepends=True)
        diff = list(difflib.unified_diff(
            before, after,
            fromfile="candidates.json (current)",
            tofile="candidates.json (new)",
        ))
        if diff:
            print("\n[dry-run] Diff:")
            print("".join(diff))
        else:
            print("\n[dry-run] No changes.")


if __name__ == "__main__":
    main()
