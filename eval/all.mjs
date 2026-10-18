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
//   - test split requires FREEZE_FLAG: SET in eval/FREEZE.md and a valid
//     canonical manifest hash (D2B §17, TASK-064);
//   - cache/fixture hits are excluded and counted (TC-056).
import {
  REPO_ROOT, REPORTS_DIR, MANIFEST_PATH, FREEZE_PATH,
  checkFreezeGate, fileSha256, notMeasuredMessage, gitHeadShort, gitHeadFull,
  loadManifest, ensureDir,
} from "./metric-utils.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { run as runExtract } from "./extract.mjs";
import { run as runMatch } from "./match.mjs";
import { run as runDedupe } from "./dedupe.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const USAGE = "Usage: node eval/all.mjs [--split dev|test] [--extract-prediction <file>] [--match-prediction <file>] [--dedupe-prediction <file>] [--report <path>] [--json <path>]";

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
    "  --split dev|test                which split to evaluate (default dev)",
    "  --extract-prediction <file>     JSONL predictions for extract",
    "  --match-prediction <file>       JSONL predictions for match",
    "  --dedupe-prediction <file>      JSONL predictions for dedupe",
    "  --report <path>                 markdown report path (default",
    "                                  eval/reports/eval-YYYY-MM-DD.md)",
    "  --json <path>                   json result path (default",
    "                                  eval/reports/eval-YYYY-MM-DD.json)",
    "  --heldout                       shortcut for --split test",
    "  --help                          this help",
    "",
    "Test runs require FREEZE_FLAG: SET in eval/FREEZE.md and the canonical",
    "manifest hash to validate. Environment variables cannot unlock test.",
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
  const m = loadManifest();
  if (!m) return { present: false };
  const freezeText = readFileSync(FREEZE_PATH, "utf8");
  const freezeFlag = freezeText.match(/^FREEZE_FLAG: (SET|NOT SET)\s*$/m)?.[1];
  if (!freezeFlag) throw new Error("manifest: FREEZE.md has no valid FREEZE_FLAG");
  return {
    present: true,
    hash: fileSha256(MANIFEST_PATH),
    groundTruthSha: m.inputs?.ground_truth_sha256,
    recordsSha: m.inputs?.records_sha256,
    total: m.counts?.total,
    bySplit: m.counts?.by_split,
    manifestRevision: m.manifest_revision,
    freezeFlag,
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

function existingStatus(name, runResult) {
  const notMeasured = runResult.stdout.match(new RegExp(`^eval:${name}: not measured \\(([^\\n]*)\\)`, "m"));
  const hasSummary = runResult.stdout.split(/\r?\n/).some((line) => line.trim() === `eval:${name} summary`);
  return {
    code: runResult.code,
    measured: runResult.code === 0 && !notMeasured && hasSummary,
    reason: notMeasured?.[1] ?? (runResult.code !== 0 ? "non-zero exit" : hasSummary ? null : "summary output missing"),
    stdout: runResult.stdout,
  };
}

export async function run({ split, extractPrediction, matchPrediction, dedupePrediction, reportPath, jsonPath, stdout }) {
  const out = (s) => stdout(s);
  const log = [];
  const selectedSplit = split === "heldout" ? "test" : split;

  // 1. Validate the canonical manifest and enforce the test freeze state.
  const gate = checkFreezeGate(selectedSplit);
  if (!gate.ok) {
    out(notMeasuredMessage("eval:all", `freeze gate refused: ${gate.reason}`) + "\n");
    return { measured: false, reason: "freeze-gate", split: selectedSplit };
  }

  // 2. Manifest present.
  const manifest = manifestInfo();
  if (!manifest.present) {
    out(notMeasuredMessage("eval:all", "eval/manifest.json missing; eval:all requires the canonical manifest (TASK-064)") + "\n");
    return { measured: false, reason: "no-manifest", split: selectedSplit };
  }

  // 3. Capture stdout for the modules.
  const cap = (s) => log.push(s);

  const extractResult = await runExtract({
    inputPath: null,
    predictionPath: extractPrediction,
    split: selectedSplit,
    stdout: cap,
  });
  const matchResult = await runMatch({
    split: selectedSplit,
    predictionPath: matchPrediction,
    stdout: cap,
  });
  const dedupeResult = await runDedupe({
    split: selectedSplit,
    predictionPath: dedupePrediction,
    stdout: cap,
  });

  // 4. WER / time / audit are existing scripts; capture their output.
  const werRun = await runExisting("wer", []);
  const timeRun = await runExisting("time", []);
  const auditRun = await runExisting("audit", []);
  const werStatus = existingStatus("wer", werRun);
  const timeStatus = existingStatus("time", timeRun);
  const auditStatus = existingStatus("audit", auditRun);

  // 5. Compose JSON.
  const result = {
    measured: extractResult.measured || matchResult.measured || dedupeResult.measured,
    split: selectedSplit,
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
      flag: manifest.freezeFlag,
      model: "UNKNOWN",
    },
    modules: {
      extract: extractResult,
      match: matchResult,
      dedupe: dedupeResult,
    },
    existing: {
      wer: werStatus,
      time: timeStatus,
      audit: auditStatus,
    },
  };

  // 6. Compose Markdown.
  const md = [];
  md.push(`# Fera eval:all — ${result.timestamp} (${selectedSplit})`);
  md.push("");
  md.push(`- commit: \`${result.commitShort ?? "n/a"}\` (full: \`${result.commit ?? "n/a"}\`)`);
  md.push(`- manifest revision: \`${manifest.manifestRevision ?? "n/a"}\``);
  md.push(`- manifest hash (sha256): \`${manifest.hash ?? "n/a"}\``);
  md.push(`- manifest ground_truth hash: \`${(manifest.groundTruthSha ?? "n/a").slice(0, 16)}...\``);
  md.push(`- manifest records hash: \`${(manifest.recordsSha ?? "n/a").slice(0, 16)}...\``);
  md.push(`- test split freeze flag: \`${result.freeze.flag}\``);
  md.push(`- frozen model revision: \`${result.freeze.model}\``);
  md.push(`- dataset total: \`${manifest.total ?? "n/a"}\``);
  md.push(`- by-split (dev / test):`);
  md.push(`  - dev records: \`${manifest.bySplit?.dev?.records ?? "n/a"}\` (groups: \`${manifest.bySplit?.dev?.groups ?? "n/a"}\`)`);
  md.push(`  - test records: \`${manifest.bySplit?.test?.records ?? "n/a"}\` (groups: \`${manifest.bySplit?.test?.groups ?? "n/a"}\`)`);
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
      ["wer (existing)", String(werStatus.measured), werStatus.reason ?? "ok", "clips / matched"],
      ["time (existing)", String(timeStatus.measured), timeStatus.reason ?? "ok", "participants / completed"],
      ["audit (existing)", String(auditStatus.measured), auditStatus.reason ?? "ok", "decisions / covered"],
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

  md.push(mdSection("eval:wer (existing, delegated)", "```\n" + werStatus.stdout + "\n```"));
  md.push(mdSection("eval:time (existing, delegated)", "```\n" + timeStatus.stdout + "\n```"));
  md.push(mdSection("eval:audit (existing, delegated)", "```\n" + auditStatus.stdout + "\n```"));

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
  if (extractResult.reason === "human-empty" || extractResult.reason === "unmapped-labels")
    missing.push("- eval:extract: no human-reviewed labels; no extraction measurement produced");
  else if (extractResult.reason === "no-labels" || extractResult.reason === "empty-labels")
    missing.push("- eval:extract: no usable human labels; no extraction measurement produced");
  if (manifest.freezeFlag !== "SET") missing.push("- test split remains locked until FREEZE_FLAG is SET after the freeze inputs are reviewed");
  if (missing.length === 0) missing.push("- none");
  md.push(missing.join("\n"));

  md.push("");
  md.push("## Honest metrics policy");
  md.push("");
  md.push("- Every measured number has a denominator in its own section.");
  md.push("- Missing inputs print `not measured (<reason>)`; never fabricated zero.");
  md.push("- Cache / fixture hits are excluded and counted (TC-056).");
  md.push("- Test runs require the canonical freeze flag and manifest hash (TASK-064, D2B §17).");
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
