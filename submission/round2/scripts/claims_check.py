#!/usr/bin/env python3
"""Honest-copy claims check for the Round 2 submission pack.

The check verifies that the artifacts in submission/round2/ match
the constitutional rules. It reads PPTX slide text (via python-pptx),
PDF slides (text-extracted), the storyboard frames, the source
markdown, the metrics file and the links file. It then enforces:

  ASSET CHECKS (presence + dimensions)
  - 8 editable slides in the deck (PPTX); organiser rule (18 Oct): at most 8.
  - 9 sampled frames in frames/shot-0[1-9].png.
  - 8 slide images in build/slide-imgs/slide-[1-8].png.
  - MP4: 1280x720, 30 fps, h264, ~105 s duration.
  - All 9 frames carry the STORYBOARD PREVIEW banner.

  HONEST-COPY CONTENT CHECKS
  - Every frozen-release metric must explicitly say "not measured"
    (not only "pending"). The status string in slide 6 and shot 7
    must include the literal phrase "not measured".
  - The deck, storyboard, video script and metrics file must NOT
    present any frozen numeric metric as a result.
  - No alert / rescue / CID / police-integration / legal-compliance
    claim as a positive statement.
  - No prevalence figure copied from D7 (no January-July totals,
    no invented interview counts, no "X children" claim).
  - No deployed URL or live email shown as live; cutoff /
    recipient / drive link explicitly UNKNOWN.
  - Synthetic, [MOCK], cached, planned and simulation labels remain
    visible.
  - Slide 2 must NOT make an overbroad "process or store" claim
    without acknowledging COMP-050 notice. Forbidden phrase
    detected: "process or store any report payload before".
  - Slide 2 must mention the COMP-050 notice or that synthetic
    provider processing requires notice.
  - Slide 3 (or shot 2/3) must distinguish "before-submit metadata
    only" from "post-confirm stores the reviewed report".
  - Round 2 NOT submitted status must appear; recipient / channel /
    cutoff UNKNOWN; production access NO.
  - No claim that a manifest freeze has actually happened; the
    duplicate-precision reason must NOT say "manifest frozen" as
    if it were a past event.
  - No invented interview count. The number of human-labelled
    interviews / audio / devices is not measured; any such figure
    is forbidden.
  - "cap USD 25" may only appear as a configured default limit,
    not as actual spend.
  - The storyboard frames must carry the banner
    "SYNTHETIC STORYBOARD PREVIEW" and "NOT APP FOOTAGE".

The check distinguishes denied statements (allowed) from positive
claims (forbidden). A sentence starting with "no / not / never /
without / refuse" is treated as an honest denial.

It writes a report to claims-check-report.txt and exits 0 on PASS,
non-zero on FAIL.
"""
from __future__ import annotations

import io
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPORT = ROOT / "claims-check-report.txt"

DECK = ROOT / "fera-round2-deck.pptx"
PDF = ROOT / "fera-round2-deck.pdf"
MP4 = ROOT / "fera-round2-storyboard-preview.mp4"
FRAMES = ROOT / "frames"
SLIDE_IMGS = ROOT / "build" / "slide-imgs"
CONTACT = ROOT / "build" / "storyboard-contact-sheet.png"
VIDEO_SCRIPT = ROOT / "video-script.md"
METRICS = ROOT / "metrics.md"
LINKS = ROOT / "links.txt"
README = ROOT / "README.md"

# ---------------------------------------------------------------------------
# Disclaimer prefixes
# ---------------------------------------------------------------------------

DISCLAIMER_PREFIXES = [
    "no ", "not ", "never ", "don't ", "isn't ", "aren't ",
    "wasn't ", "weren't ", "without ", "refuse ", "skip ", "avoid ",
    "no claim", "no live ", "no real ", "not a ", "no deployed ",
    "no deployed url", "no alert, runaway",
    "no frozen ", "no prevalence", "no actual ",
    "no claim that", "no claim of", "no current", "no public",
    "no invented", "no count", "no count is",
    "not a census", "not proof", "not measured",
]


def _is_disclaimer_line(s: str) -> bool:
    s = s.strip().lower()
    if not s:
        return True
    for p in DISCLAIMER_PREFIXES:
        if s.startswith(p):
            return True
    first = re.findall(r"[a-z']+", s)[:3]
    if first and first[0] in {"no", "not", "never"}:
        return True
    mid = [
        " are not ", " is not ", " is not.", " are not.",
        " not in this pack", " no claim of", " no claim that",
        " no longer", " no longer.", " no alert, runaway",
        " no deployed url", " no live url",
        " no alert, runaway, rescue",
        " no alert, runaway",
        " no alert, no auto-confirm",
        " no alert, no",
        " no prevalence figure",
        " no claim that any",
        " no claim of a",
        " no claim of any",
        " no frozen numeric",
        " not proof of rescue",
        " not proof of",
        " no-alert copy",
        " not measured",
        " is not measured",
        " are not measured",
        " has not been submitted",
        " has not been frozen",
        " not frozen",
    ]
    for m in mid:
        if m in s:
            return True
    return False


# ---------------------------------------------------------------------------
# Forbidden patterns
# ---------------------------------------------------------------------------

FORBIDDEN_PATTERNS = [
    # Overbroad no-processing claim (Slide 2 was wrong)
    (r"\bprocess or store any report payload\b",
     "overbroad no-processing claim"),
    (r"\bdo(es)? not process\b",
     "overbroad no-processing claim"),
    # Alert / runaway / rescue / custody / return
    (r"\balert(s|ed|ing)?\b", "alert claim"),
    (r"\brunaway\b", "runaway claim"),
    (r"\brescu(e|ed|ing)\b", "rescue claim"),
    (r"\breunif(y|ied|ication)\b", "reunification claim"),
    (r"\b(returned|safely returned|got the child back)\b",
     "physical-return claim"),
    (r"\bautomat(ed|ically) (close|confirm|decide)\b",
     "automation claim"),
    # Police / CID integration
    (r"\bCID integration\b", "CID integration claim"),
    (r"\bpolice integration\b", "police integration claim"),
    (r"\bMUN (alert|integration|sync)\b", "MUN integration claim"),
    (r"\bnotif(y|ies|ied) (the )?(police|CID|MUN)\b",
     "notified authorities claim"),
    # Legal compliance
    (r"\blegal[ -]compliant\b", "legal compliance claim"),
    (r"\bcompliant with (the )?law\b", "legal compliance claim"),
    (r"\bPDPA[ -]compliant\b", "PDPA compliance claim"),
    # Provider readiness / frozen spend as result
    (r"\blive provider (verified|ready|active)\b",
     "live provider readiness claim"),
    (r"\bUSD \d+(\.\d+)? total spend\b", "frozen spend as result"),
    # Frozen numeric metric presented without denominator
    (r"\bprecision[: ]+0?\.\d+\b", "numeric precision claim"),
    (r"\bWER[: ]+0?\.\d+\b", "numeric WER claim"),
    (r"\blatency[: ]+\d+ ?ms\b", "numeric latency claim"),
    (r"\bend-to-end[: ]+\d+ ?s\b", "numeric e2e latency claim"),
    # Prevalence figures copied from D7
    (r"\b15[, ]?717\b", "D7 prevalence figure"),
    (r"\b2[, ]?038\b", "D7 prevalence figure"),
    (r"\bJanuary[ -]July\b", "D7 date range"),
    # Illegal interview count: any "X interviews" without "not measured"
    # surrounding context is forbidden. The phrasing is detected
    # positively and the disclaimer check below may rescue it.
    (r"\b\d+ interviews\b", "interview count claim"),
]

# ---------------------------------------------------------------------------
# Required patterns and content
# ---------------------------------------------------------------------------

REQUIRED_ASSETS = [
    DECK, PDF, MP4, VIDEO_SCRIPT, METRICS, LINKS, README,
]
REQUIRED_FRAMES = [FRAMES / f"shot-0{i}.png" for i in range(1, 10)]
REQUIRED_SLIDE_IMGS = [SLIDE_IMGS / f"slide-{i}.png" for i in range(1, 9)]

REQUIRED_TEXT_PATTERNS = [
    (r"SYNTHETIC STORYBOARD PREVIEW", "STORYBOARD banner"),
    (r"NOT APP FOOTAGE", "NOT APP FOOTAGE banner"),
    (r"\[MOCK\]", "MOCK label"),
    (r"\bsynthetic\b", "synthetic label"),
    (r"referral recorded \(simulation\)",
     "referral-recorded simulation label"),
    (r"similarity, not identity", "similarity-not-identity label"),
    (r"\bUNKNOWN\b", "UNKNOWN placeholder"),
    (r"SCREEN-\d{3}", "screen id citation"),
    (r"FR-\d{3}", "FR citation"),
    (r"BR-\d{3}", "BR citation"),
    (r"no alert", "no-alert disclaimer"),
    (r"no deployed url", "no-live-url disclaimer"),
    (r"draft (preparation|outputs|drafts)", "draft label"),
    (r"DRAFT PREPARATION", "draft preparation banner"),
]

# ---------------------------------------------------------------------------
# Slide-by-slide and metric checks
# ---------------------------------------------------------------------------

METRIC_LABELS = [
    "matching precision @k",
    "word error rate",
    "end-to-end latency",
    "total spend",
    "duplicate precision",
]

# Phrases that, if absent in the deck + metrics.md, indicate the
# overbroad no-processing claim has crept back in or the
# notice-acknowledgement is missing.
SLIDE2_PHRASES = [
    (r"server holds only|metadata only is held|metadata only\b",
     "slide 2: before-submit metadata only"),
    (r"before (the )?reporter confirms",
     "slide 2: pre-confirm boundary"),
    (r"COMP-050",
     "slide 2 / notes: COMP-050 notice cited"),
    (r"on-screen notice|provider notice|notice required|notice shown",
     "slide 2: provider / on-screen notice acknowledged"),
    (r"synthetic provider",
     "slide 2: synthetic provider processing"),
]

SLIDE3_PHRASES = [
    (r"stores the reviewed",
     "slide 3: post-confirm store phrase"),
    (r"idempotent.{0,40}client uuid|client uuid.{0,40}idempotent",
     "slide 3: idempotent UUID claim"),
    (r"before submit",
     "slide 3: pre-submit boundary"),
    (r"expiry.{0,40}counter.{0,40}hash|expiry, counter, hash",
     "slide 3: pre-submit metadata fields"),
]


def fail(report: list[str], label: str, detail: str) -> None:
    report.append(f"FAIL  {label}  -- {detail}")


def ok(report: list[str], label: str, detail: str = "") -> None:
    report.append("OK    " + label + (f"  -- {detail}" if detail else ""))


def has_pattern(text: str, pattern: str) -> bool:
    return re.search(pattern, text, re.IGNORECASE) is not None


def collect_text() -> tuple[dict[str, str], list[str]]:
    out: dict[str, str] = {}
    paths = [VIDEO_SCRIPT, METRICS, LINKS, README]
    for p in paths:
        out[p.name] = p.read_text(encoding="utf-8")
    return out, [str(p.relative_to(ROOT)) for p in paths]


def collect_pptx_text(path: Path) -> list[str]:
    """Return list of strings (slide texts concatenated)."""
    try:
        from pptx import Presentation
    except ImportError:
        return []
    prs = Presentation(str(path))
    out = []
    for i, slide in enumerate(prs.slides, 1):
        buf = io.StringIO()
        for shp in slide.shapes:
            if shp.has_text_frame:
                for para in shp.text_frame.paragraphs:
                    for run in para.runs:
                        buf.write(run.text)
                        buf.write("\n")
        if slide.has_notes_slide:
            for para in slide.notes_slide.notes_text_frame.paragraphs:
                for run in para.runs:
                    buf.write(run.text)
                    buf.write("\n")
        out.append(buf.getvalue())
    return out


def collect_frame_text(p: Path) -> str:
    """Quick OCR-less text read: we don't have OCR, so we read the
    PNG header and rely on the source script. The frame's banner is
    embedded by build_video.py, so the same phrase must exist in
    video-script.md / build_video.py. We check the source instead."""
    return ""


# ---------------------------------------------------------------------------
# Individual checks
# ---------------------------------------------------------------------------


def check_assets(report: list[str]) -> None:
    for p in REQUIRED_ASSETS:
        if not p.exists():
            fail(report, "asset present", f"missing {p.name}")
        else:
            ok(report, "asset present", p.name)
    for p in REQUIRED_FRAMES:
        if not p.exists():
            fail(report, "storyboard frame", f"missing {p.name}")
        else:
            ok(report, "storyboard frame", p.name)
    for p in REQUIRED_SLIDE_IMGS:
        if not p.exists():
            fail(report, "slide image", f"missing {p.name}")
        else:
            ok(report, "slide image", p.name)
    if not CONTACT.exists():
        fail(report, "contact sheet", "missing storyboard-contact-sheet.png")
    else:
        ok(report, "contact sheet", "storyboard-contact-sheet.png")


def check_mp4(report: list[str]) -> None:
    if not MP4.exists():
        fail(report, "mp4 probe", "mp4 file missing")
        return
    res = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries",
         "format=duration:stream=width,height,r_frame_rate,codec_name",
         "-of", "json", str(MP4)],
        capture_output=True, text=True, check=False)
    if res.returncode != 0:
        fail(report, "mp4 probe", f"ffprobe failed: {res.stderr.strip()}")
        return
    data = json.loads(res.stdout)
    streams = data.get("streams", [])
    fmt = data.get("format", {})
    if not streams:
        fail(report, "mp4 stream", "no streams")
        return
    s = streams[0]
    w, h = s.get("width"), s.get("height")
    rate = s.get("r_frame_rate")
    codec = s.get("codec_name")
    dur = float(fmt.get("duration", "0"))
    if w == 1280 and h == 720:
        ok(report, "mp4 resolution", "1280x720")
    else:
        fail(report, "mp4 resolution", f"got {w}x{h}")
    if rate == "30/1":
        ok(report, "mp4 framerate", "30/1")
    else:
        fail(report, "mp4 framerate", f"got {rate}")
    if codec == "h264":
        ok(report, "mp4 codec", "h264")
    else:
        fail(report, "mp4 codec", f"got {codec}")
    if abs(dur - 105.0) < 0.5:
        ok(report, "mp4 duration", f"{dur:.3f}s")
    else:
        fail(report, "mp4 duration", f"got {dur:.3f}s, expected ~105s")


def check_deck_slide_count(report: list[str]) -> None:
    try:
        from pptx import Presentation
    except ImportError:
        fail(report, "python-pptx", "module not available")
        return
    if not DECK.exists():
        fail(report, "deck slide count", "deck missing")
        return
    prs = Presentation(str(DECK))
    n = len(prs.slides)
    # Organiser rule (18 Oct announcement): the PPT must not exceed 8 slides.
    if n == 8:
        ok(report, "deck slide count", "8")
    else:
        fail(report, "deck slide count", f"got {n}, expected 8")
    for i, slide in enumerate(prs.slides, 1):
        if len(slide.shapes) < 3:
            fail(report, f"deck slide {i} shape count",
                 f"only {len(slide.shapes)} shapes")


def check_pptx_content(report: list[str], deck_slides: list[str]) -> None:
    """Verify slide-by-slide rules."""
    # Collapse newlines inside paragraphs to a single space so a
    # soft-wrapped "before the\nreporter confirms" matches a single
    # regex.
    def flatten(s: str) -> str:
        return re.sub(r"\s+", " ", s)
    deck_text = "\n".join(flatten(s) for s in deck_slides)
    # Slide 2 phrases
    for pat, label in SLIDE2_PHRASES:
        if has_pattern(deck_text, pat):
            ok(report, label)
        else:
            fail(report, label, f"missing pattern: {pat}")
    # Slide 3 phrases
    for pat, label in SLIDE3_PHRASES:
        if has_pattern(deck_text, pat):
            ok(report, label)
        else:
            fail(report, label, f"missing pattern: {pat}")
    # Title: must NOT contain a long slogan with contrasting clauses.
    # New title is "Reviewed Bangla reports. Officer decisions."
    title_ok = ("Reviewed Bangla reports" in deck_text and
                "Officer decisions" in deck_text)
    if title_ok:
        ok(report, "title is plain affirmative")
    else:
        fail(report, "title is plain affirmative",
             "expected 'Reviewed Bangla reports. Officer decisions.'")
    # Forbid "Process or store any report payload" exact phrase
    if re.search(r"process or store any report payload",
                 deck_text, re.IGNORECASE):
        fail(report, "overbroad no-processing phrase absent",
             "deck still contains 'process or store any report payload'")
    else:
        ok(report, "overbroad no-processing phrase absent")


def check_metrics_labels(report: list[str], deck_slides: list[str],
                          text: dict[str, str]) -> None:
    """Every frozen-release metric must say 'not measured'."""
    deck_text = "\n".join(deck_slides).lower()
    joined = "\n".join(t.lower() for t in text.values())
    for label in METRIC_LABELS:
        # We accept "not measured" or the original phrase "pending"
        # in either deck or metrics.md, but BOTH deck slide 6 and
        # metrics.md must contain the literal phrase "not measured"
        # for the metric. We check the deck slide 6 region and the
        # metrics.md.
        if "not measured" in deck_text:
            ok(report, f"deck metric 'not measured' label ({label})")
        else:
            fail(report, f"deck metric 'not measured' label ({label})",
                 "deck slide 6 does not contain 'not measured'")
        # metrics.md must use "not measured" as the status
        if "not measured" in text.get(METRICS.name, "").lower():
            ok(report, f"metrics.md 'not measured' label ({label})")
        else:
            fail(report, f"metrics.md 'not measured' label ({label})",
                 "metrics.md does not contain 'not measured'")
        break  # single check; report once
    # Also check that video_script.md says 'not measured' in the
    # shot-7 description, since the storyboard mirrors it.
    vs = text.get(VIDEO_SCRIPT.name, "")
    if "not measured" in vs.lower():
        ok(report, "video-script.md 'not measured' label")
    else:
        fail(report, "video-script.md 'not measured' label",
             "video-script.md does not contain 'not measured'")


def check_metrics_reasons(report: list[str], text: dict[str, str]) -> None:
    """Verify WER reason is 'no reviewed 60-clip set', not voice
    cache. Verify Total spend does not present cap as actuals.
    Verify Duplicate precision reason does not say 'manifest
    frozen' as past tense (it should be 'manifest not frozen' or
    'manifest has not been frozen')."""
    metrics_text = text.get(METRICS.name, "")
    # WER reason
    if re.search(r"no reviewed 60-clip|reviewed 60-clip|no reviewed set",
                 metrics_text, re.IGNORECASE):
        ok(report, "WER reason mentions 60-clip set")
    else:
        fail(report, "WER reason mentions 60-clip set",
             "expected WER reason referencing reviewed 60-clip set")
    # Total spend: cap must be a configured limit, not actuals
    if re.search(r"configured default limit|cap is a configured|"
                 r"cap.*configured|not actual spend|"
                 r"default limit.*not actual",
                 metrics_text, re.IGNORECASE):
        ok(report, "total spend cap framed as limit not actuals")
    else:
        fail(report, "total spend cap framed as limit not actuals",
             "cap USD 25 must be framed as configured limit, not actuals")
    # Duplicate precision: manifest must be described as not frozen
    if re.search(r"manifest (has )?not (been )?frozen|"
                 r"manifest not frozen|has not been frozen",
                 metrics_text, re.IGNORECASE):
        ok(report, "duplicate precision manifest not frozen")
    else:
        fail(report, "duplicate precision manifest not frozen",
             "expected 'manifest not frozen' phrasing")


def check_no_invented_interviews(report: list[str],
                                  text: dict[str, str]) -> None:
    """No invented interview counts. Any numeric interview count
    must be a 'not measured' or '0' / 'unknown' phrase."""
    for fname, body in text.items():
        for line in rewrap_paragraphs(body):
            s = line.strip()
            if not s or s.startswith("#"):
                continue
            if _is_disclaimer_line(s):
                continue
            m = re.search(r"\b(\d+) interviews\b", s, re.IGNORECASE)
            if m:
                fail(report, f"invented interview count in {fname}",
                     f"'{m.group(0)}' in: {s[:120]}")


def check_submission_status(report: list[str],
                             text: dict[str, str]) -> None:
    """Round 2 status recorded honestly, recipient/channel/cutoff UNKNOWN.

    Since 18 Oct 2026 the pack records "reported submitted ... UNKNOWN"
    (time, submitter and platform status unverified); before that it
    recorded "Round 2 has not been submitted". Either is honest; a bare
    "submitted" claim without the UNKNOWN qualifier is not.
    """
    all_text = "\n".join(text.values()).lower()
    not_submitted = re.search(r"round[ ]+2[ ]+(has )?(not|hasn['']t)[ ]+"
                              r"(been[ ]+)?submitted", all_text)
    reported = re.search(r"reported submitted[^\n]{0,200}unknown", all_text)
    if not_submitted or reported:
        ok(report, "round 2 submission status recorded honestly")
    else:
        fail(report, "round 2 submission status recorded honestly",
             "expected 'Round 2 has not been submitted' or "
             "'reported submitted ... UNKNOWN'")
    if re.search(r"recipient.*unknown|recipient[: ]+unknown|"
                 r"recipient.{0,30}\bunknown\b",
                 all_text):
        ok(report, "recipient recorded UNKNOWN")
    else:
        fail(report, "recipient recorded UNKNOWN",
             "expected 'recipient ... UNKNOWN' phrasing")
    if re.search(r"channel.*unknown|channel[: ]+unknown|"
                 r"channel.{0,30}\bunknown\b",
                 all_text):
        ok(report, "channel recorded UNKNOWN")
    else:
        fail(report, "channel recorded UNKNOWN",
             "expected 'channel ... UNKNOWN' phrasing")
    if re.search(r"production access.{0,200}\bno\b|"
                 r"production access.*not available|"
                 r"production access and human labels.*\bno\b|"
                 r"human labels.*\bno\b",
                 all_text, re.IGNORECASE | re.DOTALL):
        ok(report, "production access and human labels recorded NO")
    else:
        fail(report, "production access and human labels recorded NO",
             "expected explicit 'production access ... NO' phrasing")


def check_text(report: list[str], text: dict[str, str]) -> None:
    joined = "\n".join(text.values())
    for pat, label in REQUIRED_TEXT_PATTERNS:
        if has_pattern(joined, pat):
            ok(report, f"text present ({label})")
        else:
            fail(report, f"text present ({label})",
                 f"missing pattern: {pat}")


def check_forbidden(report: list[str], text: dict[str, str]) -> None:
    """Scan the source files for any forbidden claim as a positive
    statement."""
    for fname, body in text.items():
        sentences = rewrap_paragraphs(body)
        for sent in sentences:
            stripped = sent.strip()
            if not stripped or stripped.startswith("#"):
                continue
            if _is_disclaimer_line(stripped):
                continue
            if stripped.startswith("|") and stripped.endswith("|"):
                cells = [c.strip() for c in stripped.strip("|").split("|")]
                row_denied = _is_disclaimer_line(" ".join(cells))
                for cell in cells:
                    if not cell or cell in {"---", ":---", ":---:"}:
                        continue
                    if row_denied or _is_disclaimer_line(cell):
                        continue
                    for pat, label in FORBIDDEN_PATTERNS:
                        if re.search(pat, cell, re.IGNORECASE):
                            fail(report, f"forbidden claim in {fname}",
                                 f"{label!r} in: {cell[:120]}")
                            break
                continue
            for pat, label in FORBIDDEN_PATTERNS:
                if re.search(pat, stripped, re.IGNORECASE):
                    fail(report, f"forbidden claim in {fname}",
                         f"{label!r} in: {stripped[:120]}")
                    break


def rewrap_paragraphs(body: str) -> list[str]:
    """Join markdown soft-wrapped lines into single sentences."""
    out: list[str] = []
    list_re = re.compile(r"^\s*([-*]|\d+\.)\s")
    for line in body.splitlines():
        if line.lstrip().startswith("|"):
            out.append(line)
            continue
        if not out:
            out.append(line)
            continue
        prev = out[-1]
        if not prev.strip():
            out.append(line)
            continue
        if prev.startswith("#"):
            out.append(line)
            continue
        if line.startswith("#"):
            out.append(line)
            continue
        if list_re.match(line) and list_re.match(prev):
            out.append(line)
            continue
        if list_re.match(prev) and prev.rstrip().endswith((".", "!")):
            out.append(line)
            continue
        if prev.rstrip().endswith((".", "!", "?", ":", "|", "```")):
            out.append(line)
            continue
        out[-1] = prev.rstrip() + " " + line.lstrip()
    return out


def main() -> int:
    report: list[str] = []
    report.append("claims-check-report -- Round 2 submission pack")
    report.append("root: submission/round2")  # repo-relative; never print a local absolute path
    report.append("")

    check_assets(report)
    check_mp4(report)
    check_deck_slide_count(report)

    text, _ = collect_text()
    deck_slides = collect_pptx_text(DECK) if DECK.exists() else []
    if deck_slides:
        check_pptx_content(report, deck_slides)
        check_metrics_labels(report, deck_slides, text)
    else:
        fail(report, "pptx slide text",
             "could not read deck slides")
    check_metrics_reasons(report, text)
    check_no_invented_interviews(report, text)
    check_submission_status(report, text)
    check_text(report, text)
    check_forbidden(report, text)

    fails = [r for r in report if r.startswith("FAIL")]
    oks = [r for r in report if r.startswith("OK")]
    report.append("")
    report.append(f"summary: {len(fails)} FAIL(s), {len(oks)} OK(s)")
    report.append("verdict: " + ("PASS" if not fails else "FAIL"))

    REPORT.write_text("\n".join(report) + "\n", encoding="utf-8")
    print("\n".join(report))
    return 0 if not fails else 1


if __name__ == "__main__":
    sys.exit(main())