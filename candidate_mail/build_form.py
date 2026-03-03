"""
generate_candidate_form.py
==========================
Generates a fillable PDF for the "עכשיו באות" candidate registration form.

Requirements:
    pip install reportlab

Run:
    python generate_candidate_form.py
    → outputs: candidate_invite.pdf
"""

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os, sys

# ── Font setup ────────────────────────────────────────────────────────────────
# We need a font that contains Hebrew glyphs.
# The script tries common system paths; adjust HEBREW_FONT_PATH if needed.

HEBREW_FONT_CANDIDATES = [
    # Linux
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
    # macOS
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/Library/Fonts/Arial Unicode MS.ttf",
    "/System/Library/Fonts/Arial.ttf",
    # Windows (run from WSL or just point to the path)
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/arialuni.ttf",
]

HEBREW_FONT_PATH = None
for p in HEBREW_FONT_CANDIDATES:
    if os.path.exists(p):
        HEBREW_FONT_PATH = p
        break

if 0 or HEBREW_FONT_PATH is None:
    print(
        "⚠  No Hebrew-capable font found at known paths.\n"
        "   Set HEBREW_FONT_PATH manually at the top of this script.\n"
        "   Using Helvetica as fallback — Hebrew text may not render.\n"
    )
    HEBREW = "Helvetica"
    HEBREW_BOLD = "Helvetica-Bold"
else:
    print(f"✓ Using font: {HEBREW_FONT_PATH}")
    pdfmetrics.registerFont(TTFont("Hebrew", HEBREW_FONT_PATH))
    HEBREW = "Hebrew"
    HEBREW_BOLD = "Hebrew"   # bold variant would need a separate bold TTF

STATIC_FONT = "Helvetica"
OUTPUT_FILE = "candidate_invite.pdf"

# ── Layout constants ──────────────────────────────────────────────────────────
W, H = A4          # 595 x 842 pt
MARGIN_L = 40
MARGIN_R = W - 40
CONTENT_W = MARGIN_R - MARGIN_L
NAVY   = colors.HexColor("#09366d")
BLUE   = colors.HexColor("#1a6aff")
ORANGE = colors.HexColor("#e47f09")
LIGHT  = colors.HexColor("#eef2fb")
BG     = colors.HexColor("#f4f7fc")

# ── Helpers ───────────────────────────────────────────────────────────────────

def section_title(c: canvas.Canvas, y: float, text: str) -> float:
    """Draw a section divider and return new y."""
    y -= 18
    c.setStrokeColor(colors.HexColor("#e0e8f5"))
    c.setLineWidth(0.8)
    c.line(MARGIN_L, y, MARGIN_R, y)
    c.setFont(HEBREW_BOLD, 8)
    c.setFillColor(NAVY)
    # Right-align for RTL
    c.drawRightString(MARGIN_R, y + 4, text.upper())
    return y - 14


def label(c: canvas.Canvas, y: float, text: str, required=False, hint="") -> float:
    """Draw a field label and return new y."""
    c.setFont(HEBREW_BOLD, 9)
    c.setFillColor(NAVY)
    c.drawRightString(MARGIN_R, y, text)
    if required:
        c.setFillColor(ORANGE)
        c.drawString(MARGIN_R - c.stringWidth(text, HEBREW_BOLD, 9) - 10, y, "*")
    if hint:
        c.setFont(HEBREW, 8)
        c.setFillColor(colors.HexColor("#888888"))
        c.drawRightString(MARGIN_R - c.stringWidth(text, HEBREW_BOLD, 9) - 18, y, hint)
    return y - 4


def text_field(
    c: canvas.Canvas,
    form,
    y: float,
    name: str,
    height=22,
    multiline=False,
    tooltip="",
    width=None,
    x=None,
) -> float:
    """Draw a text input field and return new y (after the field)."""
    fw = width or CONTENT_W
    fx = x or MARGIN_L
    fy = y - height
    form.textfield(
        name=name,
        tooltip=tooltip or name,
        x=fx,
        y=fy,
        width=fw,
        height=height,
        borderStyle="inset",
        borderColor=colors.HexColor("#c8d6ee"),
        fillColor=colors.HexColor("#f9fbff"),
        textColor=colors.black,
        fontSize=10,
        fontName=STATIC_FONT,
        # multiline=multiline,
        fieldFlags="multiline" if multiline else "",
    )
    return fy - 8   # gap below field


def new_page(c: canvas.Canvas) -> float:
    """Finish current page, start new one, return starting y."""
    c.showPage()
    return H - 40


def check_y(c: canvas.Canvas, y: float, needed=80) -> float:
    """Start a new page if not enough vertical space left."""
    if y < needed:
        return new_page(c)
    return y

# ── Main builder ──────────────────────────────────────────────────────────────

def build_form():
    c = canvas.Canvas(OUTPUT_FILE, pagesize=A4)
    c.setTitle("עכשיו באות — טופס הצטרפות כמועמד/ת"[::-1])
    c.setAuthor("עכשיו באות"[::-1])
    form = c.acroForm

    y = H

    # ── Header banner ──────────────────────────────────────────────────────
    c.setFillColor(NAVY)
    c.rect(0, H - 80, W, 80, fill=1, stroke=0)

    c.setFont(HEBREW_BOLD, 20)
    c.setFillColor(colors.white)
    c.drawCentredString(W / 2, H - 42, "!עכשיו באות"[::1])

    c.setFont(HEBREW, 11)
    c.setFillColor(colors.HexColor("#ccddff"))
    c.drawCentredString(W / 2, H - 62, "טופס הצטרפות כמועמד/ת"[::1])

    y = H - 80

    # ── Intro box ──────────────────────────────────────────────────────────
    intro_h = 32
    c.setFillColor(LIGHT)
    c.rect(MARGIN_L, y - intro_h - 10, CONTENT_W, intro_h, fill=1, stroke=0)
    c.setFillColor(BLUE)
    c.rect(MARGIN_R - 4, y - intro_h - 10, 4, intro_h, fill=1, stroke=0)  # RTL accent bar

    c.setFont(HEBREW, 9.5)
    c.setFillColor(colors.HexColor("#444444"))
    lines = [
        "אנחנו שמחים שאתם שוקלים להצטרף לרשימה שלנו."[::-1],
        "אנא מלאו את הפרטים הבאים, שמרו את הקובץ, ושלחו את המייל בחזרה עם שלוש תמונות מצורפות"[::-1],
    ]
    for i, line in enumerate(lines):
        c.drawRightString(MARGIN_R - 10, y - 22 - i * 14, line)

    y = y - intro_h - 22

    # ══════════════════════════════════════════════════════════════════════
    # SECTION 1 — Personal details
    # ══════════════════════════════════════════════════════════════════════
    y = section_title(c, y, "פרטים אישיים"[::-1])

    # Full name
    y = check_y(c, y)
    y = label(c, y, "שם מלא"[::-1], required=True)
    y = text_field(c, form, y, "full_name", tooltip="שם מלא"[::-1])

    # Age + City on same row
    y = check_y(c, y)
    y = label(c, y, "גיל  ,  עיר / ישוב"[::-1], required=True)

    age_w  = 80
    city_w = CONTENT_W - age_w - 12

    # Age field (left side for RTL = smaller, rightmost of the pair)
    age_x = MARGIN_R - age_w
    cy_age = y - 22
    form.textfield(
        name="age", tooltip="גיל"[::-1],
        x=age_x, y=cy_age, width=age_w, height=22,
        borderStyle="inset", borderColor=colors.HexColor("#c8d6ee"),
        fillColor=colors.HexColor("#f9fbff"), fontSize=10, fontName=STATIC_FONT,
    )

    # City field
    city_x = MARGIN_L
    form.textfield(
        name="city", tooltip="עיר / ישוב"[::-1],
        x=city_x, y=cy_age, width=city_w, height=22,
        borderStyle="inset", borderColor=colors.HexColor("#c8d6ee"),
        fillColor=colors.HexColor("#f9fbff"), fontSize=10, fontName=STATIC_FONT,
    )
    y = cy_age - 8

    # Title / description
    y = check_y(c, y)
    y = label(c, y, "תיאור / תואר"[::-1], required=True, hint=")עד שורה אחת("[::-1])
    y = text_field(c, form, y, "title", tooltip="תיאור: עורכת דין, פעילת קהילה"[::-1])

    # ══════════════════════════════════════════════════════════════════════
    # SECTION 2 — About yourself
    # ══════════════════════════════════════════════════════════════════════
    y = check_y(c, y, 160)
    y = section_title(c, y, "על עצמך"[::-1])

    # Motivation
    y = label(c, y, "?למה אני רוצה להיות בכנסת"[::-1], required=True, hint=")2–4 משפטים("[::-1])
    y = text_field(c, form, y, "rationale", height=70, multiline=True)

    # Recommendation
    y = check_y(c, y, 80)
    y = label(c, y, "מילה טובה על מועמד/ת אחר/ת ברשימה"[::-1], hint=")אופציונלי("[::-1])
    y = text_field(c, form, y, "recommendation", height=50, multiline=True,
                   #tooltip="Recommendation for another candidate (optional)",
        )

    # Minister role
    y = check_y(c, y)
    y = label(c, y, "?איזה שר/ה היית רוצה להיות"[::-1], required=True)
    y = text_field(c, form, y, "minister_role") #, tooltip="Desired ministerial role")

    # ══════════════════════════════════════════════════════════════════════
    # SECTION 3 — Social links
    # ══════════════════════════════════════════════════════════════════════
    y = check_y(c, y, 140)
    y = section_title(c, y, "קישורים )אופציונלי("[::-1])

    link_fields = [
        ("facebook",  "פייסבוק"[::-1]),
        ("instagram", "אינסטגרם"[::-1]),
        ("linkedin",  "לינקדאין"[::-1]),
        ("twitter",   "X / טוויטר"[::-1]),
    ]
    col_w = (CONTENT_W - 12) / 2

    for i, (fname, flabel) in enumerate(link_fields):
        col = i % 2
        if col == 0:
            if i > 0:
                y -= 8   # gap after each row
            y = check_y(c, y, 50)
            row_y = y
            # Draw both labels on the same y
            y = label(c, row_y, flabel, required=False)

        fx = MARGIN_L + (1 - col) * (col_w + 12)   # RTL: col 0 = right side
        lx = MARGIN_R - col * (col_w + 12)
        c.setFont(HEBREW_BOLD, 9)
        c.setFillColor(NAVY)
        if col == 1:
            c.drawRightString(lx, row_y, flabel)

        form.textfield(
            name=fname, tooltip=flabel,
            x=fx, y=row_y - 22 - 4,
            width=col_w, height=22,
            borderStyle="inset", borderColor=colors.HexColor("#c8d6ee"),
            fillColor=colors.HexColor("#f9fbff"), fontSize=9, fontName=STATIC_FONT,
        )
        if col == 1:
            y = row_y - 22 - 4 - 8

    y -= 14

    # ══════════════════════════════════════════════════════════════════════
    # SECTION 4 — Photos note
    # ══════════════════════════════════════════════════════════════════════
    y = check_y(c, y, 120)
    y = section_title(c, y, "תמונות"[::-1])

    # Dashed box with instructions
    box_h = 90
    c.setStrokeColor(colors.HexColor("#b0c4de"))
    c.setFillColor(BG)
    c.setDash(4, 3)
    c.setLineWidth(1.2)
    c.roundRect(MARGIN_L, y - box_h, CONTENT_W, box_h, 6, fill=1, stroke=1)
    c.setDash()

    photo_lines = [
        "נא לצרף 3 תמונות כקבצים מצורפים למייל"[::-1],
        "  תמונה 1 — מבט קדמי / ישיר  •  תמונה 2 — מבט למטה  •  תמונה 3 — מבט למעלה"[::-1],
        "שלחו את תמונות ביחד עם הטופס במייל חוזר"[::-1],
    ]
    c.setFont(HEBREW, 9)
    c.setFillColor(colors.HexColor("#555555"))
    for i, line in enumerate(photo_lines):
        c.drawCentredString(W / 2, y - 22 - i * 18, line)

    y -= box_h + 10

    # ── Finalize ──────────────────────────────────────────────────────────
    c.save()
    print(f"\n✅  Saved: {OUTPUT_FILE}")
    print("   Open in Adobe Acrobat or a modern PDF viewer to fill and save.\n")


if __name__ == "__main__":
    build_form()
