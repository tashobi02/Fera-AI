#!/usr/bin/env python3
"""
Build the Round 2 submission deck for Fera.

7 editable slides following the Cockpit & Paper palette (DESIGN.md).
All claims use honest copy; no frozen metrics are invented; every metric
slot says "not measured" or labels them as "pending".

Sources cited in speaker notes:
  - docs/spec/D7_Closing_Pack_V2.md
  - docs/spec/D3_App_Flow_V2.md
  - docs/spec/D1_PRD_V2.md
  - docs/execution/PHASE_4_SUBMISSION.md
  - AGENTS.md / constitution Principle VI
"""

from pathlib import Path
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

OUT_DIR = Path(__file__).resolve().parent.parent
DECK_PATH = OUT_DIR / "fera-round2-deck.pptx"

# Cockpit & Paper palette (DESIGN.md)
C_CANVAS = RGBColor(0x07, 0x08, 0x0A)
C_SURFACE = RGBColor(0x0d, 0x0d, 0x0d)
C_SURFACE_ELEV = RGBColor(0x10, 0x11, 0x11)
C_HAIRLINE = RGBColor(0x24, 0x27, 0x28)
C_INK = RGBColor(0xf4, 0xf4, 0xf6)
C_BODY = RGBColor(0xcd, 0xcd, 0xcd)
C_MUTE = RGBColor(0x9c, 0x9c, 0x9d)
C_FAINT = RGBColor(0x6a, 0x6b, 0x6c)
C_INFO = RGBColor(0x57, 0xc1, 0xff)
C_INFO_SOFT = RGBColor(0x15, 0x30, 0x40)
C_WARNING = RGBColor(0xff, 0xc5, 0x33)
C_WARNING_SOFT = RGBColor(0x40, 0x35, 0x10)
C_SUCCESS = RGBColor(0x59, 0xd4, 0x99)
C_SUCCESS_SOFT = RGBColor(0x10, 0x35, 0x25)
C_DANGER = RGBColor(0xff, 0x61, 0x61)
C_DANGER_SOFT = RGBColor(0x40, 0x18, 0x18)
C_PAPER = RGBColor(0xf6, 0xf5, 0xf4)
C_PAPER_INK = RGBColor(0x00, 0x00, 0x00)

# Slide geometry: 16:9 widescreen, 13.333" x 7.5"
SLIDE_W = Inches(13.333)
SLIDE_H = Inches(7.5)


def add_rect(slide, x, y, w, h, fill, line=None, line_w=None):
    shp = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, w, h)
    shp.fill.solid()
    shp.fill.fore_color.rgb = fill
    if line is None:
        shp.line.fill.background()
    else:
        shp.line.color.rgb = line
        if line_w is not None:
            shp.line.width = line_w
    shp.shadow.inherit = False
    return shp


def add_text(slide, x, y, w, h, text, *,
             font="Inter", size=14, bold=False, color=C_BODY,
             align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, italic=False):
    tb = slide.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = 0
    tf.margin_right = 0
    tf.margin_top = 0
    tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    lines = text.split("\n")
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        run = p.add_run()
        run.text = line
        run.font.name = font
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.italic = italic
        run.font.color.rgb = color
    return tb


def add_notes(slide, text):
    notes = slide.notes_slide.notes_text_frame
    notes.text = text


def add_badge(slide, x, y, w, h, label, tone="neutral"):
    if tone == "info":
        fill = C_INFO_SOFT
        fg = C_INFO
    elif tone == "warning":
        fill = C_WARNING_SOFT
        fg = C_WARNING
    elif tone == "success":
        fill = C_SUCCESS_SOFT
        fg = C_SUCCESS
    elif tone == "danger":
        fill = C_DANGER_SOFT
        fg = C_DANGER
    else:
        fill = C_SURFACE_ELEV
        fg = C_MUTE
    add_rect(slide, x, y, w, h, fill, line=C_HAIRLINE)
    add_text(slide, x + Inches(0.08), y + Inches(0.02),
             w - Inches(0.16), h - Inches(0.04),
             label, font="Inter", size=10, bold=True, color=fg,
             align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.MIDDLE)
    return None


def set_slide_background(slide, color):
    bg = slide.background
    fill = bg.fill
    fill.solid()
    fill.fore_color.rgb = color


# --------------------------------------------------------------------------
# Slide builders
# --------------------------------------------------------------------------

def slide_01_title(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_background(s, C_CANVAS)
    # Hairline frame
    add_rect(s, Inches(0.5), Inches(0.5), Inches(12.333), Inches(6.5),
             C_CANVAS, line=C_HAIRLINE, line_w=Emu(6350))
    # Eyebrow
    add_text(s, Inches(0.9), Inches(0.9), Inches(11.5), Inches(0.35),
             "FERA · BANGLA-FIRST CASE COORDINATION · SYNTHETIC PROTOTYPE",
             font="Inter", size=11, bold=True, color=C_FAINT)
    # Title
    add_text(s, Inches(0.9), Inches(1.4), Inches(11.5), Inches(1.8),
             "Reviewed Bangla reports. Officer decisions.",
             font="Inter", size=40, bold=True, color=C_INK)
    # Subtitle
    add_text(s, Inches(0.9), Inches(3.6), Inches(11.5), Inches(0.6),
             "Reviewed intake, similarity-ranked candidates, and verified officer decisions.",
             font="Inter", size=18, color=C_BODY)
    # Pill row of honest labels
    pill_y = Inches(4.5)
    pill_w = Inches(2.6)
    pill_h = Inches(0.4)
    gap = Inches(0.2)
    x = Inches(0.9)
    for label, tone in [
        ("Synthetic only · No real child data", "info"),
        ("[MOCK] officer verification", "warning"),
        ("Referral recorded (simulation)", "neutral"),
        ("Draft outputs only", "neutral"),
    ]:
        add_badge(s, x, pill_y, pill_w, pill_h, label, tone)
        x = x + pill_w + gap
    # Footer
    add_text(s, Inches(0.9), Inches(6.5), Inches(11.5), Inches(0.35),
             "Round 2 working baseline 14 Oct 2026 · Organiser cutoff UNKNOWN · "
             "Built for review, not for delivery",
             font="Inter", size=11, color=C_MUTE, italic=True)
    add_notes(s, (
        "Sources: AGENTS.md (What we are building, AMD-AGENTS-2/6); "
        "docs/spec/D7_Closing_Pack_V2.md V2 release contract; "
        "docs/execution/PHASE_4_SUBMISSION.md AMD-4-1.\n\n"
        "Honest copy: the title avoids alert/rescue/police/CID claims. "
        "Working baseline is 14 Oct 2026 22:00; organiser extension "
        "cutoff/date/email/formats are UNKNOWN. No claim of deployed URL."
    ))


def slide_02_what(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_background(s, C_CANVAS)
    add_rect(s, Inches(0.5), Inches(0.5), Inches(12.333), Inches(6.5),
             C_CANVAS, line=C_HAIRLINE, line_w=Emu(6350))
    add_text(s, Inches(0.9), Inches(0.9), Inches(11.5), Inches(0.35),
             "WHAT FERA IS", font="Inter", size=11, bold=True, color=C_FAINT)
    add_text(s, Inches(0.9), Inches(1.35), Inches(11.5), Inches(0.9),
             "A coordination workspace, not a notification system.",
             font="Inter", size=32, bold=True, color=C_INK)
    # Two column body
    col_y = Inches(2.6)
    col_h = Inches(3.7)
    col_w = Inches(5.8)
    # Left column: what it does
    add_rect(s, Inches(0.9), col_y, col_w, col_h, C_SURFACE,
             line=C_HAIRLINE)
    add_text(s, Inches(1.1), col_y + Inches(0.2), col_w - Inches(0.4),
             Inches(0.4), "Coordinates", font="Inter", size=11, bold=True,
             color=C_INFO)
    add_text(s, Inches(1.1), col_y + Inches(0.6), col_w - Inches(0.4),
             col_h - Inches(0.8),
             "A parent reports a missing child by voice or typed Bangla.\n"
             "Staff log an invented found-report description.\n"
             "A verified officer compares ranked candidates and\n"
             "records a decision; counts are updated.\n\n"
             "Output drafts (GD text, poster, summary) are generated\n"
             "from reviewed fields and labelled 'Draft — submit yourself'.",
             font="Inter", size=14, color=C_BODY)
    # Right column: what it does NOT do
    rx = Inches(7.0)
    add_rect(s, rx, col_y, col_w, col_h, C_SURFACE,
             line=C_HAIRLINE)
    add_text(s, rx + Inches(0.2), col_y + Inches(0.2), col_w - Inches(0.4),
             Inches(0.4), "Does not", font="Inter", size=11, bold=True,
             color=C_WARNING)
    add_text(s, rx + Inches(0.2), col_y + Inches(0.6), col_w - Inches(0.4),
             col_h - Inches(0.8),
             "Send alerts to police or CID.\n"
             "Auto-confirm, auto-close, or guess fields.\n"
             "Take custody, return, or reunify children.\n"
             "Store report payload server-side before the\n"
             "reporter confirms (metadata only is held).\n"
             "Run synthetic provider processing without an\n"
             "on-screen notice (COMP-050 notice required).\n"
             "Show candidates or other-party data to anyone\n"
             "except verified officers.",
             font="Inter", size=14, color=C_BODY)
    # Footer
    add_text(s, Inches(0.9), Inches(6.6), Inches(11.5), Inches(0.35),
             "Sourced from AGENTS.md non-negotiables and D7 V2 release contract.",
             font="Inter", size=10, color=C_MUTE, italic=True)
    add_notes(s, (
        "Sources: AGENTS.md Non-negotiables (review before submit, AI retrieves "
        "and ranks; people decide, role-scoped DTOs); D1 BR-002/004/022/024; "
        "D7 §V2 release contract.\n\n"
        "Plain wording: 'Coordinates' / 'Does not' mirrors the project's "
        "honest-copy principle; nothing claims alert, rescue or delivery."
    ))


def slide_03_intake(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_background(s, C_CANVAS)
    add_rect(s, Inches(0.5), Inches(0.5), Inches(12.333), Inches(6.5),
             C_CANVAS, line=C_HAIRLINE, line_w=Emu(6350))
    add_text(s, Inches(0.9), Inches(0.9), Inches(11.5), Inches(0.35),
             "INTAKE · REVIEW BEFORE SUBMIT", font="Inter", size=11,
             bold=True, color=C_FAINT)
    add_text(s, Inches(0.9), Inches(1.35), Inches(11.5), Inches(0.9),
             "Typed intake plus cached extraction [MOCK].",
             font="Inter", size=28, bold=True, color=C_INK)
    # Process timeline
    steps = [
        ("Start", "Consent notice.\nBangla or English."),
        ("Speak or type",
         "Voice: PCM WAV only.\nWebM not supported.\nTranscript editable."),
        ("Follow-up",
         "Missing fields\nasked one at a time\nin Bangla."),
        ("Review",
         "Every field shown\nwith its source span.\nUnknown stays unknown."),
        ("Confirm and submit",
         "Stores the reviewed\nreport; idempotent\non client UUID."),
    ]
    n = len(steps)
    margin_x = Inches(0.9)
    usable_w = Inches(11.5)
    step_w = (usable_w - Inches(0.4) * (n - 1)) / n
    y = Inches(2.6)
    h = Inches(2.6)
    for i, (title, body) in enumerate(steps):
        x = margin_x + (step_w + Inches(0.4)) * i
        add_rect(s, x, y, step_w, h, C_SURFACE, line=C_HAIRLINE)
        # Step number
        add_text(s, x + Inches(0.15), y + Inches(0.15), Inches(1.0),
                 Inches(0.3), f"0{i+1}", font="Inter", size=10, bold=True,
                 color=C_FAINT)
        add_text(s, x + Inches(0.15), y + Inches(0.45), step_w - Inches(0.3),
                 Inches(0.45), title, font="Inter", size=14, bold=True,
                 color=C_INK)
        add_text(s, x + Inches(0.15), y + Inches(0.95), step_w - Inches(0.3),
                 h - Inches(1.05), body, font="Inter", size=11,
                 color=C_BODY)
    # Bottom note
    add_text(s, Inches(0.9), Inches(5.6), Inches(11.5), Inches(0.4),
             "Live AI provider availability is unverified. "
             "Cached outputs [MOCK] are labelled on screen and in narration.",
             font="Inter", size=12, color=C_WARNING, italic=True)
    add_text(s, Inches(0.9), Inches(6.0), Inches(11.5), Inches(0.4),
             "Before submit: server holds only expiry, counter, hash "
             "and cost metadata; no report payload is stored (BR-004, FR-006).",
             font="Inter", size=12, color=C_MUTE, italic=True)
    add_text(s, Inches(0.9), Inches(6.55), Inches(11.5), Inches(0.35),
             "Sources: D3 SCREEN-001–005; D1 BR-004, FR-001/004/006/026; "
             "AGENTS.md Principle I.",
             font="Inter", size=10, color=C_MUTE, italic=True)
    add_notes(s, (
        "Sources: D3 SCREEN-001/002/003/005; D1 BR-004; FR-001/004/006/026; "
        "AGENTS.md Principle I (Review before submit).\n\n"
        "Honest wording: typed path is the guaranteed path; voice captures "
        "PCM WAV only, webm unsupported. Cached extraction is labelled "
        "[MOCK] on screen. Provider availability is unverified."
    ))


def slide_04_outputs(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_background(s, C_CANVAS)
    add_rect(s, Inches(0.5), Inches(0.5), Inches(12.333), Inches(6.5),
             C_CANVAS, line=C_HAIRLINE, line_w=Emu(6350))
    add_text(s, Inches(0.9), Inches(0.9), Inches(11.5), Inches(0.35),
             "OUTPUTS · DRAFTS, NOT FILINGS",
             font="Inter", size=11, bold=True, color=C_FAINT)
    add_text(s, Inches(0.9), Inches(1.35), Inches(11.5), Inches(0.9),
             "Manual review-before-submit, fixed templates, draft outputs.",
             font="Inter", size=26, bold=True, color=C_INK)
    # Three cards
    card_w = Inches(3.7)
    card_h = Inches(3.5)
    gap = Inches(0.2)
    total = card_w * 3 + gap * 2
    start_x = (SLIDE_W - total) / 2
    y = Inches(2.6)
    cards = [
        ("GD draft text",
         "Fixed template over reviewed fields.\n"
         "Label 'খসড়া — নিজে জমা দিন / Draft — submit yourself' is always visible.\n"
         "Fera does not file a GD.",
         C_INFO_SOFT, C_INFO),
        ("Poster preview",
         "Fixed layout with synthetic fields only.\n"
         "No photos, faces or exact locations.\n"
         "Share and download are the parent's actions.",
         C_WARNING_SOFT, C_WARNING),
        ("13219 summary",
         "Brief, plain-language summary of the\n"
         "parent's own reviewed fields.\n"
         "tel:13219 link provided; Fera does not place the call.",
         C_SUCCESS_SOFT, C_SUCCESS),
    ]
    for i, (title, body, fill, fg) in enumerate(cards):
        x = start_x + (card_w + gap) * i
        add_rect(s, x, y, card_w, card_h, C_SURFACE, line=C_HAIRLINE)
        add_rect(s, x, y, card_w, Inches(0.1), fg)
        add_text(s, x + Inches(0.25), y + Inches(0.3), card_w - Inches(0.5),
                 Inches(0.4), title, font="Inter", size=18, bold=True,
                 color=C_INK)
        # Replace embedded Bengali glyphs with English-only copy so the
        # default LibreOffice render shows readable text. The Bangla
        # phrase remains in speaker notes for the on-screen Bengali UI.
        body_en = body
        if "খসড়া — নিজে জমা দিন" in body_en:
            body_en = body_en.replace(
                "খসড়া — নিজে জমা দিন",
                "Draft — submit yourself")
        add_text(s, x + Inches(0.25), y + Inches(0.9), card_w - Inches(0.5),
                 card_h - Inches(1.1), body_en, font="Inter", size=13,
                 color=C_BODY)
    # Footer
    add_text(s, Inches(0.9), Inches(6.3), Inches(11.5), Inches(0.35),
             "Sources: D3 SCREEN-004; D1 BR-002, BR-003; "
             "AGENTS.md Principle VI (Honest by construction).",
             font="Inter", size=10, color=C_MUTE, italic=True)
    add_notes(s, (
        "Sources: D3 SCREEN-004; D1 BR-002 (drafts only), BR-003; "
        "AGENTS.md Principle VI.\n\n"
        "Plain wording: each card labels itself a draft. No claim of "
        "filing, posting or placing a call on behalf of the user."
    ))


def slide_05_officer(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_background(s, C_CANVAS)
    add_rect(s, Inches(0.5), Inches(0.5), Inches(12.333), Inches(6.5),
             C_CANVAS, line=C_HAIRLINE, line_w=Emu(6350))
    add_text(s, Inches(0.9), Inches(0.9), Inches(11.5), Inches(0.35),
             "OFFICER REVIEW · SIMILARITY, NOT IDENTITY",
             font="Inter", size=11, bold=True, color=C_FAINT)
    add_text(s, Inches(0.9), Inches(1.35), Inches(11.5), Inches(0.9),
             "Staff entry, verified officer review, human decision.",
             font="Inter", size=26, bold=True, color=C_INK)
    # Two columns: flow + evidence gate
    col_w = Inches(5.8)
    col_h = Inches(4.3)
    col_y = Inches(2.5)
    add_rect(s, Inches(0.9), col_y, col_w, col_h, C_SURFACE,
             line=C_HAIRLINE)
    add_text(s, Inches(1.1), col_y + Inches(0.2), col_w - Inches(0.4),
             Inches(0.4), "Workflow", font="Inter", size=11, bold=True,
             color=C_INFO)
    add_text(s, Inches(1.1), col_y + Inches(0.6), col_w - Inches(0.4),
             col_h - Inches(0.8),
             "1. Staff log an invented found-child description\n"
             "   (synthetic fields, no photos).\n"
             "2. Matcher ranks candidates using filters,\n"
             "   cosine similarity and a soft district bonus.\n"
             "3. Verified officer opens the side-by-side\n"
             "   evidence view and reads each source span.\n"
             "4. Officer confirms or rejects with a reason.\n"
             "5. System records a [MOCK] referral and writes\n"
             "   an append-only audit row.",
             font="Inter", size=13, color=C_BODY)
    rx = Inches(7.0)
    add_rect(s, rx, col_y, col_w, col_h, C_SURFACE, line=C_HAIRLINE)
    add_text(s, rx + Inches(0.2), col_y + Inches(0.2), col_w - Inches(0.4),
             Inches(0.4), "Reviewer checks", font="Inter", size=11, bold=True,
             color=C_WARNING)
    add_text(s, rx + Inches(0.2), col_y + Inches(0.6), col_w - Inches(0.4),
             col_h - Inches(0.8),
             "Score is 'similarity' — not identity probability.\n"
             "Zero qualified candidates is a valid result.\n"
             "Shared phone alone never establishes the same child.\n"
             "Confirmation is one transaction: lock both rows,\n"
             "recheck versions, void competitors, write audit.\n"
             "Candidates and other-party data stay scoped\n"
             "to verified officers (BR-024).",
             font="Inter", size=13, color=C_BODY)
    add_text(s, Inches(0.9), Inches(6.55), Inches(11.5), Inches(0.35),
             "Sources: D3 SCREEN-007/009/010/011; D1 BR-001/012/013/017/018/024; "
             "AGENTS.md Principles II, III, IV.",
             font="Inter", size=10, color=C_MUTE, italic=True)
    add_notes(s, (
        "Sources: D3 SCREEN-007/009/010; D1 BR-001/012/013/017/018/024; "
        "AGENTS.md Principles II, III, IV.\n\n"
        "Honest copy: similarity, not identity; one transaction; "
        "verified officers only; referral is recorded (simulation)."
    ))


def slide_06_evaluation(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_background(s, C_CANVAS)
    add_rect(s, Inches(0.5), Inches(0.5), Inches(12.333), Inches(6.5),
             C_CANVAS, line=C_HAIRLINE, line_w=Emu(6350))
    add_text(s, Inches(0.9), Inches(0.9), Inches(11.5), Inches(0.35),
             "EVALUATION · FROZEN METRICS NOT MEASURED YET",
             font="Inter", size=11, bold=True, color=C_FAINT)
    add_text(s, Inches(0.9), Inches(1.35), Inches(11.5), Inches(0.9),
             "Each metric is 'not measured' until the live run.",
             font="Inter", size=26, bold=True, color=C_INK)
    # Table-like grid of metric tiles
    rows = [
        ("Matching precision @k", "not measured — held-out run not executed"),
        ("Word error rate (WER)", "not measured — no reviewed 60-clip set"),
        ("End-to-end latency",
         "not measured — live latency not recorded"),
        ("Total spend (USD)", "not measured — no live paid calls"),
        ("Duplicate precision",
         "not measured — manifest not frozen; thresholds TBD"),
    ]
    n = len(rows)
    tile_w = Inches(11.5)
    tile_h = Inches(0.62)
    gap = Inches(0.08)
    y0 = Inches(2.5)
    for i, (label, status) in enumerate(rows):
        y = y0 + (tile_h + gap) * i
        add_rect(s, Inches(0.9), y, tile_w, tile_h, C_SURFACE,
                 line=C_HAIRLINE)
        # Label cell
        add_text(s, Inches(1.1), y, Inches(4.5), tile_h, label,
                 font="Inter", size=13, bold=True, color=C_INK,
                 anchor=MSO_ANCHOR.MIDDLE)
        # Status cell
        add_text(s, Inches(5.7), y, Inches(6.5), tile_h, status,
                 font="Inter", size=12, color=C_WARNING,
                 anchor=MSO_ANCHOR.MIDDLE, italic=True)
    # Bottom strip
    add_rect(s, Inches(0.9), Inches(6.05), Inches(11.5), Inches(0.4),
             C_WARNING_SOFT, line=C_WARNING)
    add_text(s, Inches(1.0), Inches(6.05), Inches(11.4), Inches(0.4),
             "Each metric is 'not measured' until the live run. "
             "Denominator and failures will be shown when measured "
             "(BR-026, Principle VI).",
             font="Inter", size=11, bold=True, color=C_WARNING,
             anchor=MSO_ANCHOR.MIDDLE)
    add_text(s, Inches(0.9), Inches(6.6), Inches(11.5), Inches(0.2),
             "Sources: AGENTS.md Principle VI; D1 BR-026; "
             "D6 TASK-039–043.",
             font="Inter", size=10, color=C_MUTE, italic=True)
    add_notes(s, (
        "Sources: AGENTS.md Principle VI; D1 BR-026; D6 TASK-039–043.\n\n"
        "Explicit policy: every metric shows its denominator and failures, "
        "or says 'not measured'. No frozen numeric figures are presented as "
        "results. Counters distinguish missing rows, found rows and "
        "confirmed pairs; they are not a census of unique children."
    ))


def slide_07_limitations(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    set_slide_background(s, C_CANVAS)
    add_rect(s, Inches(0.5), Inches(0.5), Inches(12.333), Inches(6.5),
             C_CANVAS, line=C_HAIRLINE, line_w=Emu(6350))
    add_text(s, Inches(0.9), Inches(0.9), Inches(11.5), Inches(0.35),
             "LIMITATIONS AND NEXT STEPS",
             font="Inter", size=11, bold=True, color=C_FAINT)
    add_text(s, Inches(0.9), Inches(1.35), Inches(11.5), Inches(0.9),
             "What this prototype does not do, and what comes next.",
             font="Inter", size=26, bold=True, color=C_INK)
    # Two-column layout
    col_w = Inches(5.8)
    col_h = Inches(4.4)
    col_y = Inches(2.5)
    # Left: limitations
    add_rect(s, Inches(0.9), col_y, col_w, col_h, C_SURFACE,
             line=C_HAIRLINE)
    add_text(s, Inches(1.1), col_y + Inches(0.2), col_w - Inches(0.4),
             Inches(0.4), "Limitations",
             font="Inter", size=11, bold=True, color=C_WARNING)
    items_left = [
        "Synthetic data only — no real child records, faces or coordinates.",
        "Officer verification is [MOCK]; referral is a recorded simulation.",
        "Live AI provider availability and account configuration are unverified.",
        "Voice intake supports PCM WAV only; webm is unsupported.",
        "Cached outputs [MOCK] are labelled and never hidden.",
        "No alert, runaway, rescue, police/CID-integration or legal-compliance claim.",
    ]
    body_left = "\n".join("•  " + item for item in items_left)
    add_text(s, Inches(1.1), col_y + Inches(0.7), col_w - Inches(0.4),
             col_h - Inches(0.9), body_left, font="Inter", size=12,
             color=C_BODY)
    # Right: next steps
    rx = Inches(7.0)
    add_rect(s, rx, col_y, col_w, col_h, C_SURFACE, line=C_HAIRLINE)
    add_text(s, rx + Inches(0.2), col_y + Inches(0.2), col_w - Inches(0.4),
             Inches(0.4), "Next steps",
             font="Inter", size=11, bold=True, color=C_INFO)
    items_right = [
        "Run the frozen held-out evaluation (TASK-043) and publish denominators.",
        "Confirm organiser cutoff, channel and formats before submission.",
        "Execute LINK-CHECK before sending and again after delivery.",
        "Capture TASK-045 actual demo footage once the working build is signed off.",
        "Resolve OQ-011 (PDPA specifics) and OQ-018 (referral agency) before any pilot.",
        "Plan partner hand-off only after external identity and guardian procedures are confirmed.",
    ]
    body_right = "\n".join("•  " + item for item in items_right)
    add_text(s, rx + Inches(0.2), col_y + Inches(0.7), col_w - Inches(0.4),
             col_h - Inches(0.9), body_right, font="Inter", size=12,
             color=C_BODY)
    add_text(s, Inches(0.9), Inches(6.55), Inches(11.5), Inches(0.35),
             "Sources: D7 §4 clarifications still needed; "
             "PHASE_4_SUBMISSION.md AMD-4-1; AGENTS.md Principles VI, VII.",
             font="Inter", size=10, color=C_MUTE, italic=True)
    add_notes(s, (
        "Sources: D7 §4 (OQ list); PHASE_4_SUBMISSION.md AMD-4-1; "
        "AGENTS.md Principles VI and VII.\n\n"
        "Plain wording: nothing is presented as a result that has not been "
        "measured. TASK-045 demo footage, production, gate clearance, "
        "upload and submission remain blocked until the working build is "
        "signed off and organiser evidence is recorded."
    ))


def main():
    prs = Presentation()
    prs.slide_width = SLIDE_W
    prs.slide_height = SLIDE_H
    slide_01_title(prs)
    slide_02_what(prs)
    slide_03_intake(prs)
    slide_04_outputs(prs)
    slide_05_officer(prs)
    slide_06_evaluation(prs)
    slide_07_limitations(prs)
    prs.save(str(DECK_PATH))
    print(f"wrote {DECK_PATH}")
    print(f"slides: {len(prs.slides)}")


if __name__ == "__main__":
    main()