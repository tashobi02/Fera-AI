#!/usr/bin/env node
// eval:all — P3-214 / TC-020 / TASK-039.
//
// Runs eval:extract, eval:match, eval:dedupe (and the already-implemented
// eval:wer, eval:time, eval:audit) and writes a Markdown report plus a JSON
// result file. Honest reporting only:
//   - every measured number has a denominator;
//   - missing inputs print "not measured (<reason>)";
//   - failures are taken from real outputs, never invented to fill a
//     template;
//   - held-out (test) splits require the freeze gate (FERA_FREEZE_COMMIT,
//     FERA_FREEZE_MODEL, FERA_MANIFEST_SHA256) (D2B §17, AMD-3-3);
//   - cache/fixture hits are excluded and counted (TC-056).
import {
  REPO_ROOT, REPORTS_DIR, hasManifestLib,
  checkFreezeGate, fileSha256, notMeasuredMessage, gitHeadShort, gitHeadFull,
  loadManifest, ensureDir,
} from "./metric-utils.mjs";
import { existsSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { run as runExtract } from "./extract.mjs";
import { run as runMatch } from "./match.mjs";
import { run as runDedupe } from "./dedupe.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const USAGE = "Usage: node eval/all.mjs [--split dev|heldout] [--extract-prediction <file>] [--match-prediction <file>] [--dedupe-prediction <file>] [--report <path>] [--json <path>]";

function parseArgs(argv) {
  const out = {
    split: "dev",
    extractPrediction: null,
    matchPrediction: null,
    dedupePrediction: null,
    report: null,
    json: null,
    help: false,
    errors: [],
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--split") out.split = argv[++i];
    else if (a === "--extract-prediction") out.extractPrediction = argv[++i];
    else if (a === "--match-prediction") out.matchPrediction = argv[++i];
    else if (a === "--dedupe-prediction") out.dedupePrediction = argv[++i];
    else if (a === "--report") out.report = argv[++i];
    else if (a === "--json") out.json = argv[++i];
    else if (a === "--heldout") out.split = "heldout";
    else if (a === "--dev") out.split = "dev";
    else out.errors.push(`unknown argument: ${a}`);
  }
  if (!["dev", "heldout", "test"].includes(out.split)) {
    out.errors.push(`split must be dev|heldout|test, got ${out.split}`);
  }
  if (out.errors.length && !out.help) {
    process.stderr.write(`eval:all: ${out.errors.join("; ")}\n${USAGE}\n`);
    process.exit(2);
  }
  return out;
}

function helpText() {
  return [
    "node eval/all.mjs — Combined eval report (D2B §17, TC-020, TASK-039).",
    "",
    "Runs eval:extract, eval:match and eval:dedupe and writes a Markdown",
    "report plus a JSON result file. WER, time and audit sub-summaries are",
    "delegated to their existing scripts and included by reference.",
    "",
    "Options:",
    "  --split dev|heldout             which split to evaluate (default dev)",
    "  --extract-prediction <file>     JSONL predictions for extract",
    "  --match-prediction <file>       JSONL predictions for match",
    "  --dedupe-prediction <file>      JSONL predictions for dedupe",
    "  --report <path>                 markdown report path (default",
    "                                  reports/eval-YYYY-MM-DD.md)",
    "  --json <path>                   json result path (default",
    "                                  reports/eval-YYYY-MM-DD.json)",
    "  --heldout                       shortcut for --split heldout",
    "  --help                          this help",
    "",
    "Held-out runs (AMD-3-3) require FERA_FREEZE_COMMIT, FERA_FREEZE_MODEL",
    "and FERA_MANIFEST_SHA256 to match the live tree.",
  ].join("\n");
}

function defaultDateStamp() {
  // Asia/Dhaka is UTC+6 (no DST). We just emit YYYY-MM-DD in that zone.
  const d = new Date();
  const utcMs = d.getTime();
  const dhaka = new Date(utcMs + 6 * 3600 * 1000);
  return dhaka.toISOString().slice(0, 10);
}

function defaultPaths() {
  const stamp = defaultDateStamp();
  return {
    report: join(REPORTS_DIR, `eval-${stamp}.md`),
    json: join(REPORTS_DIR, `eval-${stamp}.json`),
  };
}

function runChild(cmd, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: REPO_ROOT, ...options });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => { stdout += b.toString("utf8"); });
    child.stderr.on("data", (b) => { stderr += b.toString("utf8"); });
    child.on("error", (err) => {
      resolve({ code: 127, stdout, stderr: stderr + (err.message || "") });
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

function manifestInfo() {
  if (!existsSync(join(REPO_ROOT, "data", "synthetic", "manifest.json"))) {
    return { present: false };
  }
  const m = loadManifest();
  if (!m) return { present: false };
  const hash = existsSync(join(REPO_ROOT, "data", "synthetic", "manifest.sha256"))
    ? require("node:fs").readFileSync(join(REPO_ROOT, "data", "synthetic", "manifest.sha256"), "utf8").split(/\s+/)[0]
    : null;
  return {
    present: true,
    hash,
    groundTruthSha: m.inputs?.ground_truth_sha256,
    recordsSha: m.inputs?.records_sha256,
    total: m.counts?.total,
    bySplit: m.counts?.by_split,
    manifestRevision: m.manifest_revision,
  };
}

async function runExisting(name, args) {
  const result = await runChild("node", [join(REPO_ROOT, "eval", `${name}.mjs`), ...args]);
  return { code: result.code, stdout: result.stdout, stderr: result.stderr };
}

function captureStdout(fn) {
  let buf = "";
  return { result: null, fn, capture: (s) => { buf += s; } };
}

function mdSection(title, body) {
  return `## ${title}\n\n${body}\n`;
}

function mdList(items) {
  if (!items || items.length === 0) return "- (none)\n";
  return items.map((s) => `- ${s}`).join("") + "\n";
}

function mdTable(headers, rows) {
  const sep = headers.map(() => "---");
  return [headers, sep, ...rows].map((r) => `| ${r.join(" | ")} |`).join("\n") + "\n";
}

function summariseModule(name, result, denominators = []) {
  if (!result) {
    return [`### ${name}`, "**not measured (not run)**"].join("\n\n") + "\n";
  }
  const parts = [`### ${name}`];
  parts.push(`- measured: ${result.measured ? "yes" : "no"}`);
  parts.push(`- reason: ${result.reason ?? "n/a"}`);
  for (const d of denominators) {
    if (d in result) parts.push(`- ${d}: ${result[d]}`);
  }
  return parts.join("\n") + "\n";
}

export async function run({ split, extractPrediction, matchPrediction, dedupePrediction, reportPath, jsonPath, stdout }) {
  const out = (s) => stdout(s);
  const log = [];

  // 1. Held-out gate.
  const gate = checkFreezeGate(split);
  if (!gate.ok) {
    out(notMeasuredMessage("eval:all", `freeze gate refused: ${gate.reason}`) + "\n");
    return { measured: false, reason: "freeze-gate", split };
  }

  // 2. Manifest present.
  const manifest = manifestInfo();
  if (!manifest.present) {
    out(notMeasuredMessage("eval:all", "manifest.json missing; eval:all requires the frozen manifest (TC-064, TASK-064)") + "\n");
    return { measured: false, reason: "no-manifest", split };
  }

  // 3. Capture stdout for the modules.
  const cap = (s) => log.push(s);

  const extractResult = await runExtract({
    inputPath: null,
    predictionPath: extractPrediction,
    split,
    stdout: cap,
  });
  const matchResult = await runMatch({
    split,
    predictionPath: matchPrediction,
    stdout: cap,
  });
  const dedupeResult = await runDedupe({
    split,
    predictionPath: dedupePrediction,
    stdout: cap,
  });

  // 4. WER / time / audit are existing scripts; capture their output.
  const werArgs = split === "heldout" ? ["--split", "heldout"] : [];
  const werRun = await runExisting("wer", werArgs);
  const timeRun = await runExisting("time", []);
  const auditRun = await runExisting("audit", []);

  // 5. Compose JSON.
  const result = {
    measured: extractResult.measured || matchResult.measured || dedupeResult.measured,
    split,
    timestamp: new Date().toISOString(),
    commit: gitHeadFull(),
    commitShort: gitHeadShort(),
    manifest: {
      hash: manifest.hash,
      groundTruthSha: manifest.groundTruthSha,
      recordsSha: manifest.recordsSha,
      total: manifest.total,
      bySplit: manifest.bySplit,
      revision: manifest.manifestRevision,
    },
    freeze: {
      commit: process.env.FERA_FREEZE_COMMIT ?? null,
      model: process.env.FERA_FREEZE_MODEL ?? null,
      manifest: process.env.FERA_MANIFEST_SHA256 ?? null,
    },
    manifestLibPresent: hasManifestLib(),
    modules: {
      extract: extractResult,
      match: matchResult,
      dedupe: dedupeResult,
    },
    existing: {
      wer: { code: werRun.code, measured: werRun.code === 0, stdout: werRun.stdout },
      time: { code: timeRun.code, measured: timeRun.code === 0, stdout: timeRun.stdout },
      audit: { code: auditRun.code, measured: auditRun.code === 0, stdout: auditRun.stdout },
    },
  };

  // 6. Compose Markdown.
  const md = [];
  md.push(`# Fera eval:all — ${result.timestamp} (${split})`);
  md.push("");
  md.push(`- commit: \`${result.commitShort ?? "n/a"}\` (full: \`${result.commit ?? "n/a"}\`)`);
  md.push(`- manifest revision: \`${manifest.manifestRevision ?? "n/a"}\``);
  md.push(`- manifest hash (sha256): \`${manifest.hash ?? "n/a"}\``);
  md.push(`- manifest ground_truth hash: \`${(manifest.groundTruthSha ?? "n/a").slice(0, 16)}...\``);
  md.push(`- manifest records hash: \`${(manifest.recordsSha ?? "n/a").slice(0, 16)}...\``);
  md.push(`- freeze commit: \`${result.freeze.commit ?? "n/a"}\``);
  md.push(`- freeze model: \`${result.freeze.model ?? "n/a"}\``);
  md.push(`- freeze manifest: \`${result.freeze.manifest ?? "n/a"}\``);
  md.push(`- manifest-lib present: \`${result.manifestLibPresent}\` (other lane)`);
  md.push(`- dataset total: \`${manifest.total ?? "n/a"}\``);
  md.push(`- by-split (dev / heldout):`);
  md.push(`  - dev records: \`${manifest.bySplit?.dev?.records ?? "n/a"}\` (groups: \`${manifest.bySplit?.dev?.groups ?? "n/a"}\`)`);
  md.push(`  - heldout records: \`${manifest.bySplit?.heldout?.records ?? "n/a"}\` (groups: \`${manifest.bySplit?.heldout?.groups ?? "n/a"}\`)`);
  md.push("");

  // Measured / not measured summary
  md.push("## Measurement status");
  md.push("");
  md.push(mdTable(
    ["Module", "Measured", "Reason", "Denominators"],
    [
      ["extract", String(extractResult.measured), extractResult.reason ?? "n/a", `denom: ${extractResult.denominator ?? extractResult.matched ?? "n/a"}`],
      ["match", String(matchResult.measured), matchResult.reason ?? "n/a", `truth pairs: ${matchResult.totalTruthPairs ?? "n/a"}, no-match: ${matchResult.totalNoMatchQueries ?? "n/a"}`],
      ["dedupe", String(dedupeResult.measured), dedupeResult.reason ?? "n/a", `truth size: ${dedupeResult.truthSize ?? "n/a"}`],
      ["wer (existing)", String(werRun.code === 0), werRun.code === 0 ? "ok" : "non-zero exit", "clips / matched"],
      ["time (existing)", String(timeRun.code === 0), timeRun.code === 0 ? "ok" : "non-zero exit", "participants / completed"],
      ["audit (existing)", String(auditRun.code === 0), auditRun.code === 0 ? "ok" : "non-zero exit", "decisions / covered"],
    ],
  ));

  // Module sections
  md.push(mdSection("eval:extract", [
    "Output:",
    "```",
    log.filter((l) => l.startsWith("eval:extract")).join("") || "(no output captured)",
    "```",
    `Result summary: measured=${extractResult.measured}, reason=${extractResult.reason ?? "n/a"}, cache/fixture excluded=${extractResult.cacheHitsExcluded ?? 0}, matched=${extractResult.matched ?? "n/a"}, in-split=${extractResult.inSplit ?? "n/a"}, failures=${(extractResult.failures || []).length}`,
  ].join("\n\n")));

  md.push(mdSection("eval:match", [
    "Output:",
    "```",
    log.filter((l) => l.startsWith("eval:match")).join("") || "(no output captured)",
    "```",
    `Result summary: measured=${matchResult.measured}, reason=${matchResult.reason ?? "n/a"}, recall@5=${matchResult.recallAt5 ?? "n/a"}%, P@5=${matchResult.pAt5 ?? "n/a"}%, top-1=${matchResult.top1 ?? "n/a"}%, coverage=${matchResult.coverage ?? "n/a"}%, abstention=${matchResult.abstention ?? "n/a"}%, false-positive suggestion rate=${matchResult.falsePosRate ?? "n/a"}%`,
  ].join("\n\n")));

  md.push(mdSection("eval:dedupe", [
    "Output:",
    "```",
    log.filter((l) => l.startsWith("eval:dedupe")).join("") || "(no output captured)",
    "```",
    `Result summary: measured=${dedupeResult.measured}, reason=${dedupeResult.reason ?? "n/a"}, precision=${dedupeResult.precision ?? "n/a"}%, recall=${dedupeResult.recall ?? "n/a"}%, F1=${dedupeResult.f1 ?? "n/a"}%, TP=${dedupeResult.tp ?? "n/a"}, FP=${dedupeResult.fp ?? "n/a"}, FN=${dedupeResult.fn ?? "n/a"}`,
  ].join("\n\n")));

  md.push(mdSection("eval:wer (existing, delegated)", "```\n" + werRun.stdout + "\n```"));
  md.push(mdSection("eval:time (existing, delegated)", "```\n" + timeRun.stdout + "\n```"));
  md.push(mdSection("eval:audit (existing, delegated)", "```\n" + auditRun.stdout + "\n```"));

  // Failure examples (NEVER invent two)
  md.push("## Failure examples");
  md.push("");
  md.push("- These are taken from real output, never invented to fill a template.");
  md.push("- If a module is not measured, this section is empty for that module.");
  md.push("");
  const failureRows = [];
  for (const [name, r] of [["extract", extractResult], ["match", matchResult], ["dedupe", dedupeResult]]) {
    const failures = r.failures || [];
    if (failures.length === 0) {
      failureRows.push([name, "none observed"]);
    } else {
      failureRows.push([name, `${failures.length} failure(s); first 5: ${failures.slice(0, 5).join(", ")}`]);
    }
  }
  md.push(mdTable(["Module", "Failures"], failureRows));

  // Missing evidence section
  md.push("## Missing evidence");
  md.push("");
  const missing = [];
  if (!extractPrediction) missing.push("- eval:extract: no --extract-prediction file; extraction measurement skipped");
  if (!matchPrediction) missing.push("- eval:match: no --match-prediction file; matching measurement skipped");
  if (!dedupePrediction) missing.push("- eval:dedupe: no --dedupe-prediction file; duplicate measurement skipped");
  if (!result.freeze.commit && (split === "heldout" || split === "test")) missing.push("- freeze commit env var missing (held-out requested)");
  if (!hasManifestLib()) missing.push("- eval/manifest-lib.mjs is not present yet; eval:match/eval:dedupe fell back to direct manifest reads");
  if (missing.length === 0) missing.push("- none");
  md.push(missing.join("\n"));

  md.push("");
  md.push("## Honest metrics policy");
  md.push("");
  md.push("- Every measured number has a denominator in its own section.");
  md.push("- Missing inputs print `not measured (<reason>)`; never fabricated zero.");
  md.push("- Cache / fixture hits are excluded and counted (TC-056).");
  md.push("- Held-out runs require the freeze gate (AMD-3-3, D2B §17).");
  md.push("- Synthetic record text, labels and metric numbers do not imply successful rescue or operational adoption.");

  // 7. Write report + JSON.
  ensureDir(REPORTS_DIR);
  writeFileSync(reportPath, md.join("\n") + "\n");
  writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  out(`wrote ${reportPath} and ${jsonPath}\n`);
  for (const line of log) out(line);

  return result;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    process.stdout.write(helpText());
    process.exit(0);
  }
  const defaults = defaultPaths();
  const reportPath = args.report ?? defaults.report;
  const jsonPath = args.json ?? defaults.json;
  try {
    const result = await run({
      split: args.split,
      extractPrediction: args.extractPrediction,
      matchPrediction: args.matchPrediction,
      dedupePrediction: args.dedupePrediction,
      reportPath,
      jsonPath,
      stdout: process.stdout.write.bind(process.stdout),
    });
    process.exit(0);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`eval:all: ${msg}\n`);
    process.exit(1);
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main();
}

export const __test = { parseArgs, notMeasuredMessage };
