#!/usr/bin/env python3
"""
Build a static ask_<id>.html page for a weekly candidate.

Replaces the previous client-side JS content loader: candidate name, first
name, photo, and interview day/time are baked into the HTML at build time, so
WhatsApp/Telegram/Slack scrapers (which don't run JS) see real OG tags and
real text. The only JS that remains is the form-submission handler and the
"registered" radio-button toggle — those are interactive and can't be static.

Usage:
    python build_ask_page.py nava_r
    python build_ask_page.py nava_r --day "חמישי, 25.6" --time "14:00"
    python build_ask_page.py nava_r --root /path/to/site --out custom.html

The script reads candidates.json from <root> (default: cwd) and writes
ask_<id>.html to <root> (override with --out). Interview day/time come from
the candidate's interview_day / interview_time fields, but --day / --time
override them when given on the command line.
"""

import argparse
import html
import json
import sys
from pathlib import Path

SITE_URL  = "https://hagush.org.il"
SITE_NAME = "עכשיו באות!"
PORTRAITS_DIR = "portraits"

SUBMIT_URL = "https://script.google.com/macros/s/AKfycbyPXkZWptHieBiqSfaCJGwgVQTJKZreRJONKmGyDtKZ5z3iio56rtjaE3G_TdXgYWRW/exec"
TOKEN      = "NachshavBaot2026"


def first_name_of(c: dict) -> str:
    """Match the existing JS convention: c.first_name || c.name.split(/\\s+/)[0]."""
    if c.get("first_name"):
        return c["first_name"]
    name = c.get("name", "")
    return name.split()[0] if name else ""


def build_page(c: dict, day: str | None, time: str | None) -> str:
    cid    = c["id"]
    name   = c.get("name") or cid
    fname  = first_name_of(c)
    photos = c.get("photos") or []
    # last photo (matches the candidate-stubs convention; better-posed shots
    # tend to be later in the list)
    photo  = photos[-1] if photos else ""

    page_url  = f"{SITE_URL}/ask_{cid}.html"
    image_url = f"{SITE_URL}/{PORTRAITS_DIR}/{photo}" if photo else ""

    # Interview time line: only render if BOTH day and time are present.
    # This mirrors the original JS, which only un-hid the line when both
    # came back from candidates.json.
    show_time = bool(day) and bool(time)

    if show_time:
        og_description = (
            f"{fname} יצטרף אלינו לקבוצה ביום {day} בשעה {time} ויענה על כל השאלות."
        )
    else:
        og_description = f"שאלו את {fname} את השאלות שלכם."

    e = lambda s: html.escape(s or "", quote=True)

    og_image_tags = (
        f'    <meta property="og:image" content="{e(image_url)}" />\n'
        f'    <meta property="twitter:image" content="{e(image_url)}" />\n'
        f'    <meta name="twitter:card" content="summary_large_image" />\n'
        if image_url else
        '    <meta name="twitter:card" content="summary" />\n'
    )

    # Conditional bits of HTML body
    if show_time:
        time_line_html = (
            f'<p class="atc-sub">\n'
            f'            {e(fname)} יצטרף אלינו לקבוצה ביום <b>{e(day)}</b><br>'
            f'בשעה <b>{e(time)}</b> ויענה על כל השאלות.\n'
            f'          </p>'
        )
    else:
        time_line_html = ""  # rendered as nothing — matches "hidden" original

    photo_col_html = (
        f'<div class="atc-photo-col">\n'
        f'          <img class="atc-candidate-photo" '
        f'src="{e(PORTRAITS_DIR + "/" + photo)}" alt="{e(name)}" />\n'
        f'        </div>'
        if photo else ""
    )

    # NOTE: the script block at the bottom is intentionally minimal — it
    # handles ONLY (a) the registered-radio note toggle and (b) the actual
    # form submission to the Apps Script endpoint. All content loading from
    # candidates.json is gone; the page is otherwise pure static HTML.
    return f"""<!doctype html>
<html lang="he" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{e(name)} | {e(SITE_NAME)} שואלות</title>
    <link rel="icon" type="image/x-icon" href="favicon.ico" />
    <link rel="canonical" href="{e(page_url)}" />

    <!-- Open Graph (WhatsApp, Telegram, Slack, etc.) -->
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="{e(SITE_NAME)}" />
    <meta property="og:title" content="עכשיו באות שואלות! — {e(name)}" />
    <meta property="og:description" content="{e(og_description)}" />
    <meta property="og:url" content="{e(page_url)}" />
    <meta property="og:locale" content="he_IL" />
{og_image_tags}
    <meta name="description" content="{e(og_description)}" />

    <link
      href="https://fonts.googleapis.com/css2?family=Assistant:wght@300;400;600;700;800&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="./css/main.css?v=2" />
  </head>
  <body>
    <header>
      <input type="checkbox" id="nav-toggle" />
      <nav>
        <span class="nav-logo"><img src="images/logo_white.svg" alt="{e(SITE_NAME)}" /></span>
        <label class="nav-burger" for="nav-toggle" aria-label="תפריט">
          <span></span><span></span><span></span>
        </label>
        <ul>
          <li><a href="index.html">דף בית</a></li>
          <li><a href="about.html">אודות</a></li>
          <li><a href="candidates.html">בחירות בדמוקרטים!</a></li>
        </ul>
      </nav>
    </header>

    <main>
      <section class="atc">
        <div class="atc-text-col">
          <p class="atc-label">עכשיו באות שואלות!</p>
          <h1 class="atc-title">{e(name)}</h1>
          {time_line_html}
          <p class="atc-sub">
            יש לך שאלה ל{e(fname)}? מלא.י את הטופס.
          </p>
          <p class="atc-sub">
            <a class="link" href="https://chat.whatsapp.com/KYjojL9gh7g5fTQxEzB1HA"
               target="_blank" rel="noreferrer">קישור לקבוצה בה יתקיים הראיון</a>
          </p>

          <div class="join-form atc-form" id="askbox">
            <form id="askForm" novalidate>
              <!-- honeypot — must stay empty -->
              <input
                type="text" name="website" tabindex="-1" autocomplete="off"
                style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0"
                aria-hidden="true"
              />

              <input type="hidden" name="candidate" value="{e(name)}" />

              <div class="jf-field">
                <label class="jf-label" for="atc-name">שם <span class="jf-req">*</span></label>
                <input class="jf-input" id="atc-name" name="name" type="text" required autocomplete="name" />
              </div>

              <div class="jf-field">
                <label class="jf-label" for="atc-phone">טלפון <span class="jf-req">*</span></label>
                <input class="jf-input" id="atc-phone" name="phone" type="tel" required autocomplete="tel" dir="ltr" placeholder="05X-XXXXXXX" />
              </div>

              <div class="jf-field">
                <label class="jf-label" for="atc-email">אימייל</label>
                <input class="jf-input" id="atc-email" name="email" type="email" autocomplete="email" dir="ltr" />
              </div>

              <div class="jf-field">
                <label class="jf-label" for="atc-city">יישוב</label>
                <input class="jf-input" id="atc-city" name="city" type="text" autocomplete="address-level2" />
              </div>

              <div class="jf-field">
                <p class="jf-label">התפקדות לדמוקרטים <span class="jf-req">*</span></p>
                <label class="jf-radio">
                  <input type="radio" name="registered" value="yes" required />
                  התפקדתי לדמוקרטים
                </label>
                <div class="jf-note" id="jf-note-yes" style="display:none">
                  ממליצות לבדוק <a href="https://l.democrats.org.il/baot" target="_blank" rel="noreferrer">בלינק שלנו</a> שאתם אכן רשומים.
                </div>
                <label class="jf-radio">
                  <input type="radio" name="registered" value="no" />
                  עוד לא התפקדתי
                </label>
                <div class="jf-note jf-note-urgent" id="jf-note-no" style="display:none">
                  על מנת להיות חלק מעכשיו באות ולהשפיע בפריימריז, יש להתפקד לדמוקרטים:
                  <a href="https://l.democrats.org.il/baot" target="_blank" rel="noreferrer">להתפקדות</a>
                </div>
              </div>

              <div class="jf-field">
                <label class="jf-label" for="atc-question">השאלה שלי ל{e(name)} <span class="jf-req">*</span></label>
                <textarea class="jf-input atc-textarea" id="atc-question" name="question" rows="4" required></textarea>
              </div>

              <div class="jf-error" id="atc-error" style="display:none"></div>

              <button class="jf-submit atc-submit" type="submit">שליחת השאלה</button>
            </form>

            <div class="jf-success" id="atc-success" style="display:none">
              ✓ תודה! השאלה התקבלה.
            </div>
          </div>
        </div>

        {photo_col_html}
      </section>
    </main>

    <footer>
      <a href="index.html" aria-label="{e(SITE_NAME)} — לדף הבית">
        <img class="footer-logo" src="images/logo_blue.svg" alt="{e(SITE_NAME)}" />
      </a>
      כל הזכויות שמורות ל{e(SITE_NAME)} 2026
    </footer>

    <!-- Minimal JS: form submission + registered-radio toggle. No content loading. -->
    <script>
      (function () {{
        const SUBMIT_URL = {json.dumps(SUBMIT_URL)};
        const TOKEN      = {json.dumps(TOKEN)};

        const form    = document.getElementById("askForm");
        const noteYes = document.getElementById("jf-note-yes");
        const noteNo  = document.getElementById("jf-note-no");
        const errBox  = document.getElementById("atc-error");
        const success = document.getElementById("atc-success");

        form.querySelectorAll("input[name='registered']").forEach(r => {{
          r.addEventListener("change", () => {{
            noteYes.style.display = r.value === "yes" ? "block" : "none";
            noteNo.style.display  = r.value === "no"  ? "block" : "none";
          }});
        }});

        form.addEventListener("submit", async (e) => {{
          e.preventDefault();
          errBox.style.display = "none";

          if (!form.checkValidity()) {{
            form.reportValidity();
            return;
          }}

          const btn = form.querySelector(".atc-submit");
          btn.disabled = true;
          btn.textContent = "שולח/ת...";

          const data = {{
            _token:     TOKEN,
            formType:   "question",
            website:    form.website.value,
            candidate:  form.candidate.value,
            name:       form.name.value.trim(),
            phone:      form.phone.value.trim(),
            email:      form.email.value.trim(),
            city:       form.city.value.trim(),
            registered: form.registered.value,
            question:   form.question.value.trim(),
          }};

          let networkOk = false;
          try {{
            await fetch(SUBMIT_URL, {{
              method: "POST",
              mode: "no-cors",
              headers: {{ "Content-Type": "application/json" }},
              body: JSON.stringify(data),
            }});
            networkOk = true;
          }} catch (err) {{
            const isOffline = !navigator.onLine;
            errBox.textContent = isOffline
              ? "נראה שאין חיבור לאינטרנט. בדקי/י את החיבור ונסי/נסה שוב."
              : "שגיאה בשליחה. נסי/נסה שוב מאוחר יותר.";
            errBox.style.display = "block";
            btn.disabled = false;
            btn.textContent = "שליחת השאלה";
          }}

          if (networkOk) {{
            form.style.display = "none";
            success.style.display = "block";
          }}
        }});
      }})();
    </script>
  </body>
</html>
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    ap.add_argument("id", help="candidate id (e.g. nava_r)")
    ap.add_argument("--day",  help="interview day, e.g. 'חמישי, 25.6' "
                               "(overrides candidates.json's interview_day)")
    ap.add_argument("--time", help="interview time, e.g. '14:00' "
                               "(overrides candidates.json's interview_time)")
    ap.add_argument("--root", default=".", help="site root (default: cwd)")
    ap.add_argument("--json", default=None, help="path to candidates.json "
                                                 "(default: <root>/candidates.json)")
    ap.add_argument("--out",  default=None, help="output file "
                                                  "(default: <root>/ask_<id>.html)")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    json_path = Path(args.json) if args.json else root / "candidates.json"
    out_path  = Path(args.out)  if args.out  else root / f"ask_{args.id}.html"

    if not json_path.exists():
        sys.exit(f"error: {json_path} not found")

    data = json.loads(json_path.read_text(encoding="utf-8"))
    c = next((x for x in data if x.get("id") == args.id), None)
    if c is None:
        sys.exit(f"error: candidate id {args.id!r} not in {json_path}")

    # CLI overrides JSON; either source is fine.
    day  = args.day  or c.get("interview_day")
    time = args.time or c.get("interview_time")

    out_path.write_text(build_page(c, day, time), encoding="utf-8")
    msg = f"Wrote {out_path}"
    if day and time:
        msg += f"  (interview: {day} {time})"
    else:
        msg += "  (no interview time set — line hidden)"
    print(msg)


if __name__ == "__main__":
    main()
