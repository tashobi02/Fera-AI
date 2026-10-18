// submission/demo/verify-submission.mjs
//
// Verifies the committed submission variant against its dedicated
// provenance file. The script is honest about the binary contract:
// ffmpeg with libx264 -crf 23 is not bit-exact across runs, so a fresh
// regeneration is NOT expected to match the committed SHA-256.
// Instead, we verify:
//   - the committed variant file's bytes still hash to the recorded
//     SHA-256 in final-submission.provenance.json
//   - the committed variant file's ffprobe dimensions/codec/duration
//     match the recorded regeneration_target
//   - the original final.mp4 source still hashes to the SHA-256
//     recorded in final-submission.provenance.json AND in
//     provenance.json (the two records must agree)
//   - the regenerated variant (if --regenerated PATH is given) matches
//     the spec contract but is NOT byte-identical to the committed
//     variant
//
// The script does NOT perform OCR on the end-card text. The end-card
// labels are recorded in final-submission.provenance.json under
// labels_required, but verifying that the bytes on disk literally read
// those strings is delegated to a separate, human-in-the-loop review.

import { execFileSync } from "node:child_process";
import { statSync, existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const DEMO = join(ROOT, "submission", "demo");

const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  console.log(JSON.stringify({ name, ok, detail }));
}

const arg = process.argv.find((a) => a === "--regenerated");
const regenPath = arg
  ? process.argv[process.argv.indexOf(arg) + 1]
  : null;

function sha256OfFile(path) {
  const h = createHash("sha256");
  h.update(readFileSync(path));
  return h.digest("hex");
}

function probeVideo(path) {
  const j = JSON.parse(execFileSync("ffprobe", [
    "-v", "error", "-show_format", "-show_streams", "-of", "json", path,
  ]).toString());
  const video = (j.streams || []).find((s) => s.codec_type === "video");
  const audio = (j.streams || []).filter((s) => s.codec_type === "audio");
  return {
    duration: Number(j.format?.duration ?? 0),
    width: Number(video?.width ?? 0),
    height: Number(video?.height ?? 0),
    codec_name: video?.codec_name ?? "",
    r_frame_rate: video?.r_frame_rate ?? "",
    audio_stream_count: audio.length,
  };
}

// 1. The original source file and its dedicated provenance must agree.
const finalMp4 = join(DEMO, "final.mp4");
const finalProvPath = join(DEMO, "provenance.json");
const finalProv = JSON.parse(readFileSync(finalProvPath, "utf8"));

if (!existsSync(finalMp4)) {
  check("origin final.mp4 exists", false);
  process.exit(1);
}
const finalMp4Sha = sha256OfFile(finalMp4);
check(
  "origin final.mp4 sha256 matches provenance.json",
  finalMp4Sha === finalProv.final_mp4_sha256,
  `file=${finalMp4Sha} provenance=${finalProv.final_mp4_sha256}`,
);

// 2. The committed variant file must hash to what the variant
//    provenance says it does.
const variantMp4 = join(DEMO, "final-submission.mp4");
const variantProvPath = join(DEMO, "final-submission.provenance.json");
const variantProv = JSON.parse(readFileSync(variantProvPath, "utf8"));

if (!existsSync(variantMp4)) {
  check("committed final-submission.mp4 exists", false);
  process.exit(1);
}
const variantMp4Sha = sha256OfFile(variantMp4);
check(
  "committed final-submission.mp4 sha256 matches variant provenance",
  variantMp4Sha === variantProv.committed_variant.sha256,
  `file=${variantMp4Sha} provenance=${variantProv.committed_variant.sha256}`,
);

// 3. The committed variant file's ffprobe dimensions/codec/duration
//    must match the regeneration_target in the variant provenance.
const variantProbe = probeVideo(variantMp4);
const target = variantProv.regeneration_target;
check(
  "committed variant resolution matches regeneration_target",
  variantProbe.width === target.width && variantProbe.height === target.height,
  `${variantProbe.width}x${variantProbe.height}`,
);
check(
  "committed variant codec matches regeneration_target",
  variantProbe.codec_name === target.codec,
  `ffprobe=${variantProbe.codec_name} target=${target.codec}`,
);
check(
  "committed variant framerate matches regeneration_target",
  variantProbe.r_frame_rate === target.frame_rate,
  `ffprobe=${variantProbe.r_frame_rate} target=${target.frame_rate}`,
);
check(
  "committed variant duration matches regeneration_target (105s ±0.1)",
  Math.abs(variantProbe.duration - target.duration_seconds) <= 0.1,
  `ffprobe=${variantProbe.duration.toFixed(3)}s target=${target.duration_seconds}s`,
);
check(
  "committed variant has no audio streams",
  variantProbe.audio_stream_count === 0,
  `${variantProbe.audio_stream_count} audio stream(s)`,
);

// 4. The variant provenance must reference the source final.mp4's
//    SHA-256, and that must match what we just computed.
check(
  "variant provenance origin_final_mp4_sha256 matches provenance.json",
  variantProv.origin_final_mp4_sha256 === finalProv.final_mp4_sha256,
  `variant_provenance=${variantProv.origin_final_mp4_sha256} provenance=${finalProv.final_mp4_sha256}`,
);

// 5. Optionally verify the freshly regenerated file (when supplied via
//    --regenerated PATH). The regenerated file must:
//      - exit the script with a known-good ffprobe contract
//      - NOT be byte-identical to the committed variant
//      - hash to a different value than the committed SHA-256
if (regenPath) {
  if (!existsSync(regenPath)) {
    check("regenerated file exists (--regenerated)", false, regenPath);
  } else {
    const regenSha = sha256OfFile(regenPath);
    const regenProbe = probeVideo(regenPath);
    check(
      "regenerated dimensions match target",
      regenProbe.width === target.width && regenProbe.height === target.height,
      `${regenProbe.width}x${regenProbe.height}`,
    );
    check(
      "regenerated codec matches target",
      regenProbe.codec_name === target.codec,
      `ffprobe=${regenProbe.codec_name} target=${target.codec}`,
    );
    check(
      "regenerated duration matches target (105s ±0.1)",
      Math.abs(regenProbe.duration - target.duration_seconds) <= 0.1,
      `ffprobe=${regenProbe.duration.toFixed(3)}s target=${target.duration_seconds}s`,
    );
    check(
      "regenerated has no audio streams",
      regenProbe.audio_stream_count === 0,
      `${regenProbe.audio_stream_count} audio stream(s)`,
    );
    check(
      "regenerated SHA-256 DIFFERS from committed variant (not bit-exact)",
      regenSha !== variantProv.committed_variant.sha256,
      `regen=${regenSha} committed=${variantProv.committed_variant.sha256}`,
    );
    check(
      "regenerated SHA-256 DIFFERS from origin final.mp4",
      regenSha !== variantProv.origin_final_mp4_sha256,
      `regen=${regenSha} origin=${variantProv.origin_final_mp4_sha256}`,
    );
  }
}

// 6. Honest-copy guards: no banned keys anywhere in either provenance.
for (const provPath of [finalProvPath, variantProvPath]) {
  const p = JSON.parse(readFileSync(provPath, "utf8"));
  const banned = ["password", "child_name", "contact_phone", "raw_text",
                  "actors", "submission_payload", "ref_code_secret"];
  const flat = JSON.stringify(p).toLowerCase();
  const leaks = banned.filter((k) => flat.includes(`"${k}"`));
  check(`provenance ${provPath.split("/").pop()} has no banned keys`,
        leaks.length === 0,
        leaks.length ? `leaks: ${leaks.join(",")}` : "");
}

// 7. The variant provenance's labels_required list is recorded; this
//    script does NOT OCR the end-card text and explicitly records that
//    limitation here so reviewers are not surprised by missing checks.
const labelLen = (variantProv.regeneration_target?.labels_required ?? []).length;
check(
  "labels_required is recorded (OCR NOT performed by this verifier)",
  labelLen > 0,
  `${labelLen} label(s) recorded; OCR is delegated to a separate, human-in-the-loop review`,
);

if (!checks.every((c) => c.ok)) {
  console.error("VERIFY FAILED");
  process.exit(1);
}
console.log("VERIFY OK");
