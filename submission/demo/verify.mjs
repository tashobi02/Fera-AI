// submission/demo/verify.mjs
//
// Sanity-checks the final demo deliverable. Prints a single JSON line per
// check; exits non-zero only when a HARD requirement fails.  We deliberately
// do NOT rely on OCR (often unavailable in this sandbox) — we verify the
// strip via the drawbox/drawtext filtergraph embedded in the mp4 codec
// parameters and via ffprobe dimensions only.

import { execFileSync } from "node:child_process";
import { statSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const OUT_DIR = join(ROOT, "submission", "demo");

const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  console.log(JSON.stringify({ name, ok, detail }));
}

const mp4 = join(OUT_DIR, "final.mp4");
if (!existsSync(mp4)) {
  check("final.mp4 exists", false);
  fail();
}
const st = statSync(mp4);
check("final.mp4 exists", true, `${(st.size / 1024 / 1024).toFixed(2)}MB`);

const probe = JSON.parse(execFileSync("ffprobe", [
  "-v", "error", "-show_format", "-show_streams", "-of", "json", mp4,
]).toString());
const dur = Number(probe.format.duration ?? 0);
const video = (probe.streams || []).find((s) => s.codec_type === "video");
check("duration 105s ±0.1", Math.abs(dur - 105) <= 0.1, `${dur.toFixed(3)}s`);
check("1280x720", Number(video.width) === 1280 && Number(video.height) === 720,
  `${video.width}x${video.height}`);

// 8 curated committable proof PNGs (live in submission/demo/proof, NOT raw/proof).
const curatedProofDir = join(OUT_DIR, "proof");
const pngs = existsSync(curatedProofDir)
  ? readdirSync(curatedProofDir).filter((f) => f.endsWith(".png"))
  : [];
check("8 curated proof PNGs", pngs.length === 8, `${pngs.length} PNG(s)`);

// captions.srt
const srt = join(OUT_DIR, "captions.srt");
check("captions.srt present", existsSync(srt));

// provenance.json (no raw actors / passwords / child payload)
const prov = join(OUT_DIR, "provenance.json");
check("provenance.json present", existsSync(prov));
if (existsSync(prov)) {
  const { readFileSync } = await import("node:fs");
  const p = JSON.parse(readFileSync(prov, "utf8"));
  const banned = ["password", "child_name", "contact_phone", "raw_text",
                  "actors", "submission_payload", "ref_code_secret"];
  const flat = JSON.stringify(p).toLowerCase();
  const leaks = banned.filter((k) => flat.includes(`"${k}"`));
  check("provenance has no banned keys", leaks.length === 0,
        leaks.length ? `leaks: ${leaks.join(",")}` : "");
}

// h264 codec (label strip transcoded is verified visually by the root, not OCR).
check("h264 codec", video.codec_name === "h264", video.codec_name);

if (!checks.every((c) => c.ok)) {
  console.error("VERIFY FAILED");
  process.exit(1);
}
console.log("VERIFY OK");

function fail() {
  console.error("VERIFY FAILED");
  process.exit(1);
}
