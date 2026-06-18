#!/usr/bin/env python3
"""
Generate per-candidate stub HTML files for social-media previews.

Each stub at  candidates/<id>.html  carries OG/Twitter meta tags drawn from
candidates.json so when someone pastes the link into WhatsApp/Telegram/Slack/
etc., the preview shows the candidate's name + role + photo. A real browser
opening the stub is immediately redirected to  candidates.html?id=<id>  so the
existing single-page UI handles the actual rendering.

By default the script is INCREMENTAL: it only writes stubs for candidates that
don't already have one. Run with --force to rebuild every stub (use after
editing names, roles, or photos in candidates.json — the admin's add-candidate
PR flow doesn't need this).

Usage:
    python build_candidate_stubs.py                  # add stubs for new candidates only
    python build_candidate_stubs.py --force          # rebuild all stubs from scratch
    python build_candidate_stubs.py --root /path/to/site
"""

import argparse
import html
import json
import sys
from pathlib import Path

SITE_URL  = "https://hagush.org.il"
SITE_NAME = "עכשיו באות!"
PORTRAITS_DIR = "portraits"   # matches PORTRAITS_DIR in app.js
OUT_DIRNAME = "candidates"    # generated stubs live here: candidates/<id>.html


def trim(s: str, limit: int = 200) -> str:
    """Compact whitespace and cap length for meta-description sanity."""
    s = " ".join((s or "").split())
    if len(s) <= limit:
        return s
    # cut at last space before the limit so we don't slice mid-word
    cut = s.rfind(" ", 0, limit - 1)
    return (s[:cut] if cut > 0 else s[:limit - 1]) + "…"


def description_for(c: dict) -> str:
    """Short factual line: prefer activities; fall back to first rationale sentence."""
    act = trim(c.get("activities") or "")
    if act:
        return act
    rat = c.get("rationale") or ""
    # take the first sentence-ish chunk
    for sep in ("\n", ". ", "."):
        if sep in rat:
            rat = rat.split(sep, 1)[0]
            break
    return trim(rat)


def stub_html(c: dict) -> str:
    cid   = c["id"]
    name  = c.get("name") or cid
    desc  = description_for(c)
    photo = (c.get("photos") or [""])[-1]
    page_url  = f"{SITE_URL}/{OUT_DIRNAME}/{cid}.html"
    image_url = f"{SITE_URL}/{PORTRAITS_DIR}/{photo}" if photo else ""
    target    = f"../candidates.html?id={cid}"   # relative: works on any host/domain

    # html.escape everything that lands inside attributes or text
    e = lambda s: html.escape(s or "", quote=True)

    og_image = (
        f'    <meta property="og:image" content="{e(image_url)}" />\n'
        f'    <meta property="twitter:image" content="{e(image_url)}" />\n'
        f'    <meta name="twitter:card" content="summary_large_image" />\n'
        if image_url else
        '    <meta name="twitter:card" content="summary" />\n'
    )

    return f"""<!doctype html>
<html lang="he" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{e(name)} | {e(SITE_NAME)}</title>
    <link rel="canonical" href="{e(page_url)}" />

    <!-- Open Graph (WhatsApp, Telegram, Slack, Discord, LinkedIn, Facebook) -->
    <meta property="og:type" content="profile" />
    <meta property="og:site_name" content="{e(SITE_NAME)}" />
    <meta property="og:title" content="{e(name)}" />
    <meta property="og:description" content="{e(desc)}" />
    <meta property="og:url" content="{e(page_url)}" />
    <meta property="og:locale" content="he_IL" />
{og_image}
    <!-- Plain meta for search engines and older scrapers -->
    <meta name="description" content="{e(desc)}" />

    <!-- Send real browsers to the app; scrapers read the meta above and stop. -->
    <meta http-equiv="refresh" content="0; url={e(target)}" />
    <script>window.location.replace({json.dumps(target)});</script>
  </head>
  <body>
    <p style="font-family:sans-serif;text-align:center;margin-top:3em">
      מעבר לעמוד של <a href="{e(target)}">{e(name)}</a>…
    </p>
  </body>
</html>
"""


def main():
    here = Path(__file__).resolve().parent
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    ap.add_argument("--root", default=str(here),
                    help="site root containing candidates.json (default: script dir)")
    ap.add_argument("--json", default=None,
                    help="path to candidates.json (default: <root>/candidates.json)")
    ap.add_argument("--out", default=None,
                    help=f"output directory (default: <root>/{OUT_DIRNAME})")
    ap.add_argument("--force", action="store_true",
                    help="rewrite stubs that already exist (default: leave them alone)")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    json_path = Path(args.json) if args.json else root / "candidates.json"
    out_dir   = Path(args.out)  if args.out  else root / OUT_DIRNAME

    if not json_path.exists():
        sys.exit(f"error: {json_path} not found")

    data = json.loads(json_path.read_text(encoding="utf-8"))

    out_dir.mkdir(parents=True, exist_ok=True)

    added, skipped = 0, 0
    for c in data:
        cid = c.get("id")
        if not cid:
            print(f"  skipping candidate with no id: {c.get('name')!r}")
            continue
        target_file = out_dir / f"{cid}.html"
        if target_file.exists() and not args.force:
            skipped += 1
            continue
        target_file.write_text(stub_html(c), encoding="utf-8")
        added += 1

    # A tiny index so the directory isn't bare if someone browses to it.
    index_file = out_dir / "index.html"
    if not index_file.exists() or args.force:
        index_file.write_text(
            '<!doctype html><meta charset="utf-8">'
            '<meta http-equiv="refresh" content="0; url=../candidates.html">'
            '<title>מועמדים</title>', encoding="utf-8")

    verb = "Rebuilt" if args.force else "Added"
    print(f"{verb} {added} stub(s) in {out_dir}"
          + (f"; left {skipped} existing stub(s) untouched" if skipped else ""))


if __name__ == "__main__":
    main()
