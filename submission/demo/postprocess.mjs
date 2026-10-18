// submission/demo/postprocess.mjs
//
// Reads:
//   submission/demo/raw/capture.webm           (raw Playwright recording)
//   submission/demo/raw/proof/*.png            (per-beat screenshots)
//   submission/demo/raw/capture-meta.json      (timing)
// Writes:
//   submission/demo/final.mp4                  (105s, 1280x720, captions + label)
//   submission/demo/captions.srt               (caption manifest)
//
// The persistent on-screen label is added via ffmpeg drawbox+drawtext. The
// caption timeline is deterministic (no live captioning) so reviewers can
// grep the SRT. Timing is edited to fit 105 seconds (slow/hold for
// readability); the persistent label and SRT both state that fact.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, statSync, existsSync, rmSync, copyFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const RAW = process.env.FERA_DEMO_CAPTURE_DIR ?? join(ROOT, "submission", "demo", "raw");
const OUT_DIR = join(ROOT, "submission", "demo");
mkdirSync(OUT_DIR, { recursive: true });

const TARGET_DURATION = 105; // seconds
const W = 1280, H = 720;

const PERSISTENT_LABEL =
  "SYNTHETIC LOCAL DEMO | [MOCK] officer verification | Timing edited";

// ---- 1) Probe raw video ----------------------------------------------------
const rawWebm = join(RAW, "capture.webm");
if (!existsSync(rawWebm)) {
  console.error(`[postprocess] missing ${rawWebm}; run capture.mjs first`);
  process.exit(1);
}
const probe = JSON.parse(execFileSync("ffprobe", [
  "-v", "error", "-show_format", "-show_streams", "-of", "json", rawWebm,
]).toString());
const rawDuration = Number(probe.format.duration ?? 0);
const stream = (probe.streams || []).find((s) => s.codec_type === "video") || {};
const rawW = Number(stream.width ?? 0);
const rawH = Number(stream.height ?? 0);
console.log(`[postprocess] raw: ${rawW}x${rawH} ${rawDuration.toFixed(2)}s`);

// ---- 2) Build a 105-second timeline by remapping raw 0..T -> 0..105 ---------
//
// ffmpeg's setpts=PTS*F expression stretches/squeezes the timeline by factor
// F: F > 1 SLOWS the footage (final duration = raw * F); F < 1 speeds it up.
// To precisely map the raw recording to TARGET_DURATION we therefore need
// F = TARGET_DURATION / rawDuration.  We then ask ffmpeg for exactly
// TARGET_DURATION via -t, so a slightly oversized stretch is fine — ffmpeg
// trims the tail.  We clamp F to [0.5, 4.0] defensively but the canonical
// case is F ≈ 105/29.68 ≈ 3.54 (slows ~30s raw up to 105s).
const ptsFactor = (TARGET_DURATION - 8) / rawDuration;
if (!Number.isFinite(ptsFactor) || ptsFactor <= 0) throw new Error("invalid source video duration");
const PtsExpr = `PTS*${ptsFactor.toFixed(9)}`;
console.log(`[postprocess] raw ${rawDuration.toFixed(2)}s, setpts factor ${ptsFactor.toFixed(9)} → ~${TARGET_DURATION}s`);

// ---- 3) Draw the persistent bottom label -----------------------------------
// We use drawbox for a high-contrast strip and drawtext for the label.
const labelText = PERSISTENT_LABEL.replace(/'/g, "’");
// Filtergraph: scale to 1280x720, persistent label strip.
const baseFilter = [
  `setpts=${PtsExpr}`,
  "tpad=stop_mode=clone:stop_duration=8",
  `scale=${W}:${H}:flags=lanczos`,
  `drawbox=x=0:y=0:w=${W}:h=${H}:color=black:t=fill:enable='gte(t,97)'`,
  "drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='Release metrics - not measured':fontsize=38:fontcolor=white:x=(w-text_w)/2:y=230:enable='gte(t,97)'",
  "drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='Synthetic local demonstration. Round 2 not submitted.':fontsize=28:fontcolor=white:x=(w-text_w)/2:y=300:enable='gte(t,97)'",
  `drawbox=x=0:y=${H - 56}:w=${W}:h=56:color=black@0.78:t=fill`,
  `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:` +
    `text='${labelText}':` +
    `fontcolor=white:fontsize=22:` +
    `x=(w-text_w)/2:y=${H - 44}`,
].join(",");

// ---- 4) Caption timeline ---------------------------------------------------
// Per-beat captions mapped onto the post-process timeline by scaling each raw
// beat's tMs by ptsFactor (= TARGET_DURATION / rawDuration).  Each cue covers
// the window [beatStart, beatStart + max(4, nextBeat - beatStart)/2] in the
// output timeline, with the persistent label already covering "synthetic
// local demo".  Timing is edited for readability; the SRT itself is the
// canonical record of what was edited.  We append a fixed closing editorial
// card in the last 8 seconds so reviewers see the explicit non-claim.

// Per-beat editorial copy.  Keys match the beat names emitted by
// capture.mjs; copy is the "what the viewer is looking at" line that the
// SRT must show during the beat's window.  Order is dictated by the
// chronological order of beats in capture-meta.json — we sort on render.
// Declared here (before buildCues is called) to avoid the ES-module TDZ
// that crashed the previous run: buildCues is a function declaration (and
// is hoisted), but BEAT_COPY is `const` (not hoisted), so it must be
// initialised before the call site.
const BEAT_COPY = {
  "seed actors":           "Synthetic actors seeded; no real person is referenced.",
  "browser open":          "Real Chromium, real Next.js app on 127.0.0.1.",
  "title screen":          "Fera — public landing page.",
  "form filled":           "Parent manual form: Bangla fields, real browser, real form.",
  "review ticked":         "Review checkbox required before submit (BR-004).",
  "status page":           "Submit lands on /status; ref_code M-… shown.",
  "sign-in":               "Officer signs in via API; cookie carried to the browser.",
  "officer review seeded": "Seeded synthetic candidate for workflow demonstration.",
  "reject prompt":         "Reject scenario: [MOCK] officer verification, no real claim.",
  "confirm open":          "Confirm scenario opens the strict 4-checkbox dialog.",
  "confirm dialog":        "4 strict checkboxes, simulated referral only.",
  "closed": "Coordination record closed through the officer form. Referral is simulated.",
  "counts": "District counts: missing reports, found reports and confirmed pairs are separate.",
  "confirmed":             "Referral recorded (simulation). Not a real delivery.",
  "closing":               "DRAFT pending release G4/G5; no release metrics measured.",
};

const beats = readBeats();
const cues = buildCues(beats, ptsFactor);
const srt = toSrt(cues);
writeFileSync(join(OUT_DIR, "captions.srt"), srt);
console.log(`[postprocess] wrote captions.srt (${cues.length} cues)`);

// Subtitle filter using the SRT (we need to copy the srt into a file the
// filtergraph can reference).  We use the 'subtitles' filter with charenc.
const srtPath = join(OUT_DIR, "captions.srt");
const subFilter =
  `subtitles='${srtPath.replace(/'/g, "\\'")}':` +
  `force_style='FontName=DejaVu Sans,FontSize=22,PrimaryColour=&H00FFFFFF,` +
  `OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,MarginV=72'`;

const fullFilter = `${baseFilter},${subFilter}`;

// ---- 5) Encode final MP4 ---------------------------------------------------
const finalMp4 = join(OUT_DIR, "final.mp4");
console.log(`[postprocess] encoding ${finalMp4}`);

const encArgs = [
  "-y",
  "-i", rawWebm,
  "-vf", fullFilter,
  "-an",                                 // no audio
  "-c:v", "libx264",
  "-preset", "veryfast",
  "-crf", "26",
  "-pix_fmt", "yuv420p",
  "-movflags", "+faststart",
  "-r", "30",
  "-t", String(TARGET_DURATION),         // hard cap at 105s
  finalMp4,
];
execFileSync("ffmpeg", encArgs, { stdio: "inherit" });

// ---- 6) Verify output size + duration --------------------------------------
const outProbe = JSON.parse(execFileSync("ffprobe", [
  "-v", "error", "-show_format", "-show_streams", "-of", "json", finalMp4,
]).toString());
const outDuration = Number(outProbe.format.duration ?? 0);
const outSize = statSync(finalMp4).size;
console.log(`[postprocess] final.mp4 ${outDuration.toFixed(2)}s ${(outSize / 1024 / 1024).toFixed(2)}MB`);

if (outDuration > TARGET_DURATION + 1) {
  console.warn(`[postprocess] WARN final is longer than ${TARGET_DURATION}s (${outDuration.toFixed(2)}s)`);
}
if (outSize > 15 * 1024 * 1024) {
  console.warn(`[postprocess] WARN final exceeds 15MB soft cap (${(outSize / 1024 / 1024).toFixed(2)}MB)`);
}

// ---- 7) Curate the committable proof PNGs into submission/demo/proof -------
// The capture script emits 11 PNGs in raw/proof/.  We curate 8 of them into
// submission/demo/proof/ (a directory the repo commits).  We deliberately
// keep the raw/ tree out of the commit via .gitignore.  Selection is by
// capture order, picking the strongest visual per beat.
const rawProofDir = join(RAW, "proof");
const curatedProofDir = join(OUT_DIR, "proof");
rmSync(curatedProofDir, { recursive: true, force: true });
mkdirSync(curatedProofDir, { recursive: true });
// Required proof states from the successful live capture.
const curated = ["01-home.png", "02-form-filled.png", "04-status.png", "06-officer-review.png", "09-confirm-dialog.png", "10-confirmed.png", "11-closed.png", "12-counts.png"];
for (const name of curated) if (!existsSync(join(rawProofDir, name))) throw new Error("missing required capture proof");
for (const name of curated) {
  copyFileSync(join(rawProofDir, name), join(curatedProofDir, name));
}
console.log(`[postprocess] curated ${curated.length} proof PNGs -> ${curatedProofDir}`);

// ---- 8) Write provenance.json ---------------------------------------------
// Committable record: source git SHA, source beat names + file SHA-256
// hashes for the curated proof PNGs, and the deterministic remap factor.
// No raw actors / passwords / child payload are emitted — see provenance
// allow-list below.
function sha256File(p) {
  const h = createHash("sha256");
  h.update(readFileSync(p));
  return h.digest("hex");
}
function tryReadGitSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT }).toString().trim();
  } catch { return "unknown"; }
}
const provenance = {
  generated_at: new Date().toISOString(),
  source_git_sha: tryReadGitSha(),
  raw_duration_seconds: rawDuration,
  target_duration_seconds: TARGET_DURATION,
  capture_script_sha256: sha256File(join(HERE, "capture.mjs")),
  pts_factor: Number(ptsFactor.toFixed(6)),
  output_duration_seconds: Number(outDuration.toFixed(3)),
  output_size_bytes: outSize,
  beat_names: beats.map((b) => b.name),
  proof_files: curated.map((name) => ({
    name,
    sha256: sha256File(join(curatedProofDir, name)),
    bytes: statSync(join(curatedProofDir, name)).size,
  })),
  final_mp4_sha256: sha256File(finalMp4),
  synthetic: true,
  release_metrics_measured: false,
  round2_submitted: false,
};
writeFileSync(
  join(OUT_DIR, "provenance.json"),
  JSON.stringify(provenance, null, 2),
);
console.log(`[postprocess] wrote provenance.json`);

// Raw intermediates (raw/capture.webm, raw/proof/, raw/capture-meta.json,
// raw/actors.json) are intentionally left on disk for the verify step but
// are excluded from the commit via submission/demo/.gitignore.
console.log("[postprocess] DONE");

// ------------------------------------------------------------------ helpers

function readBeats() {
  const meta = JSON.parse(readFileSync(join(RAW, "capture-meta.json"), "utf8"));
  return meta.beats || [];
}

// Per-beat editorial copy.  Keys match the beat names emitted by
// capture.mjs; copy is the "what the viewer is looking at" line that the
// SRT must show during the beat's window.  Order is dictated by the
// chronological order of beats in capture-meta.json — we sort on render.
function buildCues(beats, ptsFactor) {
  // beats: [{name, tMs}]  — tMs are RAW (browser wall-clock) elapsed since
  // the previous beat.  We convert to a cumulative raw timeline, scale by
  // ptsFactor (= TARGET_DURATION / rawDuration), and emit one cue per beat
  // whose end is the midpoint to the next beat (min 3s window).  Beats
  // without explicit copy are skipped.  We also append a fixed 8-second
  // closing editorial card covering TARGET_DURATION-8 .. TARGET_DURATION
  // that explicitly states no release metrics were measured.
  if (!beats.length) {
    return [{
      start: 0, end: TARGET_DURATION,
      text: "Synthetic local demo. No release metrics measured. Round 2 not submitted.",
    }];
  }
  // Cumulative raw timeline (seconds).
  let rawCursor = 0;
  const beatTimes = beats.map((b) => {
    rawCursor += Number(b.tMs ?? 0) / 1000;
    return { name: b.name, rawSec: rawCursor };
  });
  // Scale to the post-process timeline.
  const scaled = beatTimes.map((b, i) => ({
    name: b.name,
    scaledSec: b.rawSec * ptsFactor,
    nextScaled: (beatTimes[i + 1]?.rawSec ?? (rawDuration)) * ptsFactor,
  }));

  const cues = [];
  for (let i = 0; i < scaled.length; i++) {
    const b = scaled[i];
    const text = BEAT_COPY[b.name];
    if (!text) continue;                          // unknown beat → skip
    const start = clamp(b.scaledSec, 0, TARGET_DURATION - 8);
    if (start >= TARGET_DURATION - 8) continue;
    let end = clamp((b.scaledSec + b.nextScaled) / 2, start + 3, TARGET_DURATION);
    // Reserve the last 8 seconds for the editorial closing card.
    if (end > TARGET_DURATION - 8) end = TARGET_DURATION - 8;
    cues.push({ start, end, text });
  }
  // Closing editorial card — 8 seconds, no fake metrics.
  cues.push({
    start: TARGET_DURATION - 8,
    end: TARGET_DURATION,
    text: "Editorial card: synthetic local demo, release metrics NOT measured, Round 2 NOT submitted. No voice, no edit-claim, no live URL.",
  });
  // Deduplicate by start time, then sort.
  const seen = new Set();
  const out = [];
  for (const c of cues.sort((a, b) => a.start - b.start)) {
    if (seen.has(c.start)) continue;
    seen.add(c.start);
    out.push(c);
  }
  return out;
}

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }

function toSrt(cues) {
  return cues.map((cue, i) => {
    return `${i + 1}\n${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}\n${cue.text}\n`;
  }).join("\n");
}

function formatSrtTime(seconds) {
  const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);
  const s = Math.floor(seconds) % 60;
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}
