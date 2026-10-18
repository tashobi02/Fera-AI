#!/usr/bin/env python3
"""
Render the Round 2 storyboard preview MP4 (SYNTHETIC STORYBOARD PREVIEW,
NOT APP FOOTAGE). 1280x720, 105 seconds total, 30 fps.

Each shot is a captioned frame sequence that:
  - visibly says "SYNTHETIC STORYBOARD PREVIEW  -  NOT APP FOOTAGE"
  - cites the source spec/screen id
  - is a hand-drawn mock, never a fabricated screenshot

PIL is used to render frames; ffmpeg encodes MP4 (H.264 yuv420p).
"""

from pathlib import Path
import subprocess
from PIL import Image, ImageDraw, ImageFont

W, H = 1280, 720
FPS = 30
DURATION = 105
TOTAL_FRAMES = DURATION * FPS
OUT_DIR = Path(__file__).resolve().parent.parent
FRAME_DIR = OUT_DIR / "frames"
ASSETS_DIR = OUT_DIR / "assets"
FRAME_DIR.mkdir(parents=True, exist_ok=True)
ASSETS_DIR.mkdir(parents=True, exist_ok=True)
MP4_PATH = OUT_DIR / "fera-round2-storyboard-preview.mp4"

# Cockpit palette (Cockpit & Paper)
C_CANVAS = (7, 8, 10)
C_SURFACE = (13, 13, 13)
C_SURFACE_ELEV = (16, 17, 17)
C_HAIRLINE = (36, 39, 40)
C_INK = (244, 244, 246)
C_BODY = (205, 205, 205)
C_MUTE = (156, 156, 157)
C_FAINT = (106, 107, 108)
C_INFO = (87, 193, 255)
C_INFO_SOFT = (21, 48, 64)
C_WARNING = (255, 197, 51)
C_WARNING_SOFT = (64, 53, 16)
C_SUCCESS = (89, 212, 153)
C_SUCCESS_SOFT = (16, 53, 37)
C_DANGER = (255, 97, 97)
C_DANGER_SOFT = (64, 24, 24)


def load_font(size, bold=False):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
            else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
            if bold else
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]
    for p in candidates:
        if Path(p).exists():
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def draw_frame_borders(d, title_text, shot_id, timecode, source_text):
    """Draw the persistent preview banner, slide title, source and timecode."""
    # Hairline border
    d.rectangle([(0, 0), (W - 1, H - 1)], outline=C_HAIRLINE, width=2)
    # Top banner: SYNTHETIC STORYBOARD PREVIEW
    d.rectangle([(0, 0), (W, 36)], fill=C_DANGER_SOFT)
    d.text((20, 8),
           "SYNTHETIC STORYBOARD PREVIEW   -   NOT APP FOOTAGE",
           font=load_font(15, bold=True), fill=C_DANGER)
    # Right-side timecode + shot id
    d.text((W - 220, 8), f"shot {shot_id}   t={timecode}",
           font=load_font(13, bold=True), fill=C_DANGER)
    # Slide title strip
    d.rectangle([(0, 36), (W, 84)], fill=C_SURFACE_ELEV)
    d.text((24, 48), title_text, font=load_font(22, bold=True), fill=C_INK)
    # Source strip
    d.rectangle([(0, H - 30), (W, H)], fill=C_SURFACE_ELEV)
    d.text((24, H - 26), source_text, font=load_font(12), fill=C_MUTE)


def fill_bg(img):
    d = ImageDraw.Draw(img)
    d.rectangle([(0, 0), (W, H)], fill=C_CANVAS)


def make_placeholder_node(d, x, y, w, h, label, sub=None,
                            tone=C_HAIRLINE, fill=C_SURFACE):
    d.rectangle([(x, y), (x + w, y + h)], fill=fill, outline=tone, width=2)
    d.text((x + 12, y + 10), label, font=load_font(14, bold=True),
           fill=C_INK)
    if sub:
        d.text((x + 12, y + 32), sub, font=load_font(11), fill=C_BODY)


def shot_001_intake(t):
    img = Image.new("RGB", (W, H), C_CANVAS)
    d = ImageDraw.Draw(img)
    fill_bg(img)
    draw_frame_borders(
        d,
        "Shot 1  *  Parent intake -- synthetic, cached, with notice",
        "01", t, "Sources: D3 SCREEN-001/002; FR-001/004; BR-004")
    # Mock parent surface
    make_placeholder_node(d, 60, 110, 460, 540, "S-001 Welcome",
                          "Synthetic prototype.\n"
                          "Fera turns what you say into a missing-child\n"
                          "report. Fera does not send alerts to police\n"
                          "or CID.\n"
                          "Start  *  Call 13219 (tel:)",
                          tone=C_HAIRLINE, fill=C_SURFACE)
    # Mock chat
    make_placeholder_node(d, 540, 110, 680, 540, "S-002 Intake chat",
                          "Provider notice shown before STT/LLM call.\n"
                          "Voice: PCM WAV only. WebM not supported.\n"
                          "Cached extraction [MOCK].\n"
                          "Transcript editable.\n"
                          "Follow-up: missing fields asked one at a\n"
                          "time in Bangla.",
                          tone=C_INFO, fill=C_SURFACE)
    # Bottom watermark inside frame, above source strip
    d.rectangle([(60, 660), (W - 60, 686)],
                fill=C_SURFACE_ELEV, outline=C_WARNING)
    d.text((70, 666),
           "MOCKUP -- labels show what the on-screen surface will say, "
           "not a recording of it.",
           font=load_font(13, bold=True), fill=C_WARNING)
    return img


def shot_002_review(t):
    img = Image.new("RGB", (W, H), C_CANVAS)
    d = ImageDraw.Draw(img)
    fill_bg(img)
    draw_frame_borders(
        d,
        "Shot 2  *  Review before submit  -  every field with its source",
        "02", t, "Sources: D3 SCREEN-003; FR-006/007; BR-004")
    # Field cards
    fields = [
        ("Name", "সাবরিনা আক্তার (editable)"),
        ("Age", "8 years (extracted  *  source span #14)"),
        ("Sex", "Girl (extracted  *  source span #22)"),
        ("District (last seen)", "Gazipur (extracted  *  source span #30)"),
        ("Phone (parent)", "unknown  -  please complete manually"),
    ]
    x0, y0 = 80, 110
    card_w = 1120
    card_h = 90
    for i, (k, v) in enumerate(fields):
        y = y0 + i * (card_h + 12)
        d.rectangle([(x0, y), (x0 + card_w, y + card_h)],
                    fill=C_SURFACE, outline=C_HAIRLINE, width=2)
        d.text((x0 + 18, y + 14), k, font=load_font(15, bold=True),
               fill=C_INK)
        d.text((x0 + 18, y + 40), v, font=load_font(15), fill=C_BODY)
        # Unverified badge
        if "unknown" in v:
            d.rectangle([(x0 + card_w - 220, y + 24),
                         (x0 + card_w - 18, y + 56)],
                        fill=C_WARNING_SOFT, outline=C_WARNING)
            d.text((x0 + card_w - 210, y + 32), "unverified field",
                   font=load_font(12, bold=True), fill=C_WARNING)
    # Confirm bar
    d.rectangle([(80, H - 100), (1200, H - 50)], fill=C_SURFACE_ELEV,
                outline=C_INFO, width=2)
    d.text((100, H - 90), "[ ] I have checked",
           font=load_font(15, bold=True), fill=C_INK)
    d.rectangle([(940, H - 92), (1180, H - 58)], fill=C_INFO)
    d.text((990, H - 88), "Check and submit",
           font=load_font(15, bold=True), fill=C_CANVAS)
    return img


def shot_003_outputs(t):
    img = Image.new("RGB", (W, H), C_CANVAS)
    d = ImageDraw.Draw(img)
    fill_bg(img)
    draw_frame_borders(
        d,
        "Shot 3  *  Draft outputs  -  generated, not filed",
        "03", t, "Sources: D3 SCREEN-004; BR-002/003; Principle VI")
    cards = [
        ("GD draft text", "Fixed template over reviewed fields.\n"
                          "Label: 'Draft  -  submit yourself'.\n"
                          "Fera does not file a GD.",
         C_INFO, C_INFO_SOFT),
        ("Poster preview", "Fixed layout with synthetic fields only.\n"
                          "No photos, faces or exact locations.\n"
                          "Share and download are the parent's actions.",
         C_WARNING, C_WARNING_SOFT),
        ("13219 summary", "Brief summary of the parent's\n"
                          "own reviewed fields.\n"
                          "tel:13219 link provided; Fera does not place the call.",
         C_SUCCESS, C_SUCCESS_SOFT),
    ]
    card_w = 360
    card_h = 420
    gap = 30
    total = card_w * 3 + gap * 2
    start_x = (W - total) // 2
    y = 130
    for i, (t_, body, fg, fill) in enumerate(cards):
        x = start_x + (card_w + gap) * i
        d.rectangle([(x, y), (x + card_w, y + card_h)], fill=C_SURFACE,
                    outline=C_HAIRLINE, width=2)
        d.rectangle([(x, y), (x + card_w, y + 10)], fill=fg)
        d.text((x + 18, y + 30), t_, font=load_font(20, bold=True),
               fill=C_INK)
        d.text((x + 18, y + 70), body, font=load_font(14), fill=C_BODY)
    d.text((80, 600),
           "Each card labelled a draft. Fera does not file, post or place a call.",
           font=load_font(14, bold=True), fill=C_WARNING)
    return img


def shot_004_staff(t):
    img = Image.new("RGB", (W, H), C_CANVAS)
    d = ImageDraw.Draw(img)
    fill_bg(img)
    draw_frame_borders(
        d,
        "Shot 4  *  Staff entry  -  synthetic found-child log",
        "04", t, "Sources: D3 SCREEN-007; FR-011; BR-006 (no photo)")
    d.rectangle([(60, 110), (W - 60, H - 60)], fill=C_SURFACE,
                outline=C_HAIRLINE, width=2)
    d.text((80, 130), "Found-child log   *   S-007",
           font=load_font(20, bold=True), fill=C_INK)
    rows = [
        ("Reference", "F-0001 (synthetic)"),
        ("Description (free text)",
         "Boy, ~9 years, blue shirt, found near bus stand."),
        ("District (found)", "Gazipur"),
        ("Time of finding", "Today 09:30 BST (staff-entered)"),
        ("Photo", "not collected  (no photos in synthetic prototype)"),
    ]
    for i, (k, v) in enumerate(rows):
        y = 180 + i * 60
        d.text((100, y), k, font=load_font(14, bold=True), fill=C_INK)
        d.text((400, y), v, font=load_font(14), fill=C_BODY)
    d.rectangle([(W - 280, H - 110), (W - 80, H - 70)],
                fill=C_INFO)
    d.text((W - 250, H - 105), "Save found report",
           font=load_font(15, bold=True), fill=C_CANVAS)
    return img


def shot_005_review(t):
    img = Image.new("RGB", (W, H), C_CANVAS)
    d = ImageDraw.Draw(img)
    fill_bg(img)
    draw_frame_borders(
        d,
        "Shot 5  *  Officer review  -  similarity, not identity",
        "05", t, "Sources: D3 SCREEN-009/010; BR-001/012/013/024")
    # Side-by-side
    d.rectangle([(60, 110), (W // 2 - 20, H - 60)],
                fill=C_SURFACE, outline=C_INFO, width=2)
    d.text((80, 130), "Missing report (parent, synthetic)",
           font=load_font(16, bold=True), fill=C_INFO)
    miss = [
        "Name: সাবরিনা আক্তার",
        "Age: 8",
        "Sex: Girl",
        "Last-seen district: Gazipur",
        "Phone: unknown (manual)",
    ]
    for i, line in enumerate(miss):
        d.text((80, 170 + i * 30), line, font=load_font(14), fill=C_BODY)
    # Right column
    d.rectangle([(W // 2 + 20, 110), (W - 60, H - 60)],
                fill=C_SURFACE, outline=C_WARNING, width=2)
    d.text((W // 2 + 40, 130), "Found report (staff, synthetic)",
           font=load_font(16, bold=True), fill=C_WARNING)
    found = [
        "Description: Boy, ~9 years, blue shirt",
        "Found district: Gazipur",
        "Photo: not collected",
        "Similarity: 0.42  (label: similarity, not identity)",
        "Source spans: 'boy' #3, 'blue shirt' #14",
    ]
    for i, line in enumerate(found):
        d.text((W // 2 + 40, 170 + i * 30), line, font=load_font(14),
               fill=C_BODY)
    # Bottom decision bar
    d.text((W // 2 - 100, H - 50),
           "Rejection reason required if not a match",
           font=load_font(12, bold=True), fill=C_MUTE)
    return img


def shot_006_close(t):
    img = Image.new("RGB", (W, H), C_CANVAS)
    d = ImageDraw.Draw(img)
    fill_bg(img)
    draw_frame_borders(
        d,
        "Shot 6  *  Closure  -  referral recorded (simulation), separate counts",
        "06", t, "Sources: D3 SCREEN-011/012; BR-020; D7 V2 contract")
    # Three counter tiles
    counts = [
        ("Missing reports", "12  (counter only, not a census)", C_INFO),
        ("Found reports", "8  (counter only, not a census)", C_WARNING),
        ("Confirmed pairs", "1  (recorded, not delivered)", C_SUCCESS),
    ]
    tile_w = 360
    tile_h = 220
    gap = 30
    total = tile_w * 3 + gap * 2
    start_x = (W - total) // 2
    y = 130
    for i, (k, v, c) in enumerate(counts):
        x = start_x + (tile_w + gap) * i
        d.rectangle([(x, y), (x + tile_w, y + tile_h)],
                    fill=C_SURFACE, outline=C_HAIRLINE, width=2)
        d.text((x + 20, y + 20), k, font=load_font(14, bold=True), fill=c)
        d.text((x + 20, y + 60), v, font=load_font(22, bold=True),
               fill=C_INK)
    # Mock audit log
    d.rectangle([(60, 380), (W - 60, H - 60)], fill=C_SURFACE,
                outline=C_HAIRLINE, width=2)
    d.text((80, 400), "Append-only audit (no child payload)",
           font=load_font(16, bold=True), fill=C_INK)
    lines = [
        "case.confirm  *  role=officer  *  pair=M-0003/F-0001  *  outcome=match",
        "referral.recorded  *  simulation=true  *  status=internal",
        "audit.access.denied  *  role=parent  *  reason=not-verified",
        "state.transition  *  open -> closed  *  both rows updated",
    ]
    for i, ln in enumerate(lines):
        d.text((100, 440 + i * 28), ln, font=load_font(13), fill=C_BODY)
    return img


def shot_007_eval(t):
    img = Image.new("RGB", (W, H), C_CANVAS)
    d = ImageDraw.Draw(img)
    fill_bg(img)
    draw_frame_borders(
        d,
        "Shot 7  *  Evaluation  -  each metric is not measured until the live run",
        "07", t, "Sources: Principle VI; BR-026; D6 TASK-039-043")
    rows = [
        ("Matching precision @k", "not measured  -  held-out run not executed"),
        ("Word error rate (WER)", "not measured  -  no reviewed 60-clip set"),
        ("End-to-end latency", "not measured  -  live latency not recorded"),
        ("Total spend (USD)", "not measured  -  no live paid calls"),
        ("Duplicate precision", "not measured  -  manifest not frozen; thresholds TBD"),
    ]
    tile_h = 70
    gap = 10
    y0 = 110
    for i, (k, v) in enumerate(rows):
        y = y0 + i * (tile_h + gap)
        d.rectangle([(60, y), (W - 60, y + tile_h)], fill=C_SURFACE,
                    outline=C_HAIRLINE, width=2)
        d.text((80, y + 22), k, font=load_font(15, bold=True), fill=C_INK)
        d.text((500, y + 22), v, font=load_font(14), fill=C_WARNING)
    d.rectangle([(60, 600), (W - 60, 640)], fill=C_WARNING_SOFT,
                outline=C_WARNING, width=2)
    d.text((80, 610),
           "Each metric is 'not measured' until the live run. "
           "Denominator and failures will be shown when measured "
           "(BR-026, Principle VI).",
           font=load_font(13, bold=True), fill=C_WARNING)
    return img


def shot_008_limits(t):
    img = Image.new("RGB", (W, H), C_CANVAS)
    d = ImageDraw.Draw(img)
    fill_bg(img)
    draw_frame_borders(
        d,
        "Shot 8  *  Limitations and next steps",
        "08", t, "Sources: D7 §4; PHASE_4_SUBMISSION.md AMD-4-1; "
        "Principles VI, VII")
    cols = [
        ("Limitations", [
            "Synthetic data only  -  no real records, faces or coordinates.",
            "Officer verification is [MOCK]; referral is a recorded simulation.",
            "Live AI provider availability and account configuration unverified.",
            "Voice intake supports PCM WAV only; webm is unsupported.",
            "Cached outputs [MOCK] are labelled and never hidden.",
            "No alert, runaway, rescue, police/CID-integration or legal-compliance claim.",
        ], C_WARNING),
        ("Next steps", [
            "Run the frozen held-out evaluation (TASK-043) and publish denominators.",
            "Confirm organiser cutoff, channel and formats before submission.",
            "Execute LINK-CHECK before sending and again after delivery.",
            "Capture TASK-045 actual demo footage once the working build is signed off.",
            "Resolve OQ-011 (PDPA) and OQ-018 (referral agency) before any pilot.",
            "Plan partner hand-off only after external identity/guardian procedures are confirmed.",
        ], C_INFO),
    ]
    col_w = (W - 140) // 2
    for i, (t_, items, c) in enumerate(cols):
        x = 60 + i * (col_w + 20)
        d.rectangle([(x, 110), (x + col_w, H - 60)], fill=C_SURFACE,
                    outline=C_HAIRLINE, width=2)
        d.text((x + 18, 130), t_, font=load_font(18, bold=True), fill=c)
        for j, item in enumerate(items):
            d.text((x + 18, 170 + j * 60), "•  " + item,
                   font=load_font(13), fill=C_BODY)
    return img


def shot_009_callout(t):
    img = Image.new("RGB", (W, H), C_CANVAS)
    d = ImageDraw.Draw(img)
    fill_bg(img)
    draw_frame_borders(
        d,
        "Shot 9  *  Submission status  -  DRAFT PREPARATION",
        "09", t,
        "Sources: PHASE_4_SUBMISSION.md (gate G5); AMD-4-1 cutoff UNKNOWN")
    d.rectangle([(60, 110), (W - 60, H - 60)], fill=C_SURFACE,
                outline=C_DANGER, width=3)
    d.text((100, 140),
           "This video is a SYNTHETIC STORYBOARD PREVIEW.",
           font=load_font(26, bold=True), fill=C_DANGER)
    d.text((100, 200),
           "It is not a recording of the running application.",
           font=load_font(20), fill=C_INK)
    d.text((100, 250),
           "Pptx, PDF and MP4 are DRAFT PREPARATION. Actual TASK-045 demo",
           font=load_font(18), fill=C_BODY)
    d.text((100, 280),
           "footage, production, gate clearance, upload and submission",
           font=load_font(18), fill=C_BODY)
    d.text((100, 310),
           "remain blocked until the working build is signed off.",
           font=load_font(18), fill=C_BODY)
    d.text((100, 360),
           "Repo URL: https://github.com/tashobi02/Fera-AI",
           font=load_font(16, bold=True), fill=C_INFO)
    d.text((100, 390),
           "Branch: phase3--phase4-handoff (planned runtime copy)",
           font=load_font(16), fill=C_BODY)
    d.text((100, 420),
           "Deployment, Drive folder and selection-email cutoff: UNKNOWN.",
           font=load_font(16, bold=True), fill=C_WARNING)
    d.text((100, 460),
           "No claim that any web URL or email is live; no frozen metrics.",
           font=load_font(16), fill=C_BODY)
    return img


# Shot list with seconds allocation
SHOTS = [
    (shot_001_intake, 0, 12, "01"),
    (shot_002_review, 12, 20, "02"),
    (shot_003_outputs, 20, 30, "03"),
    (shot_004_staff, 30, 42, "04"),
    (shot_005_review, 42, 60, "05"),
    (shot_006_close, 60, 75, "06"),
    (shot_007_eval, 75, 88, "07"),
    (shot_008_limits, 88, 100, "08"),
    (shot_009_callout, 100, 105, "09"),
]


def render_frames():
    """Render every frame of the storyboard."""
    n_per_shot_log = []
    sample_paths = []
    for fn, start, end, shot_id in SHOTS:
        duration = end - start
        frames = int(duration * FPS)
        n_per_shot_log.append((shot_id, duration, frames))
        for i in range(frames):
            local_t = i / FPS
            t = start + local_t
            mm = int(t // 60)
            ss = int(t % 60)
            cs = int((t - int(t)) * 100)
            tc = f"{mm:02d}:{ss:02d}.{cs:02d}"
            img = fn(tc)
            out = FRAME_DIR / f"frame_{i + start * FPS:05d}.png"
            img.save(out, "PNG", optimize=False)
            if i == 0:
                sample = FRAME_DIR / f"shot-{shot_id}.png"
                img.save(sample, "PNG", optimize=False)
                sample_paths.append(sample)
    return n_per_shot_log, sample_paths


def encode_mp4():
    cmd = [
        "ffmpeg", "-y",
        "-framerate", str(FPS),
        "-i", str(FRAME_DIR / "frame_%05d.png"),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "veryfast",
        "-crf", "26",
        "-movflags", "+faststart",
        str(MP4_PATH),
    ]
    print(" ".join(cmd))
    subprocess.run(cmd, check=True)


def main():
    # Always start clean: drop any old intermediate frame_*.png and
    # stale shot-*.png samples so the rebuild reflects the current
    # build_video.py edits.
    for old in FRAME_DIR.glob("frame_*.png"):
        old.unlink()
    for old in FRAME_DIR.glob("shot-*.png"):
        old.unlink()
    summary, samples = render_frames()
    print("frame counts per shot:")
    for shot_id, dur, n in summary:
        print(f"  shot {shot_id}: {dur}s -> {n} frames")
    encode_mp4()
    # Probe result
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries",
         "format=duration:stream=width,height,r_frame_rate,codec_name",
         "-of", "default=noprint_wrappers=1", str(MP4_PATH)],
        capture_output=True, text=True, check=True)
    print(out.stdout)


if __name__ == "__main__":
    main()