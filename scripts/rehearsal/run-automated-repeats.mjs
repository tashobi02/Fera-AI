#!/usr/bin/env node
// Pre-main test-journeys — AUTOMATED 5-repeat runner.
//
// Why this script exists:
//   The brief calls for "five automated repeat journeys", each labelled
//   AUTOMATED (not five human rehearsals). The runner is the only piece
//   that orchestrates the repeat; the spec file is single-shot so the
//   test failure report is stable.
//
// What it does:
//   1. Re-uses the pinned Playwright config (`playwright.offline.config.ts`)
//      and the per-run wrapper, so each repeat gets a fresh loopback
//      database (the prefix `fera_e2e_premainjourney_<pid>` is
//      per-pid-and-run) and a fresh log file. No reset of any
//      pre-existing human/demo/shared DB; the guard in
//      `playwright.offline.config.ts` enforces the loopback-only host
//      and the prefix regex.
//   2. Runs the suite `N` times (default N=5; flag --runs). The number
//      must be a positive bounded integer; unknown args are refused.
//   3. Each child is spawned; spawn errors (ENOENT, EACCES, …) are
//      captured and counted as a run failure rather than crashing the
//      runner. The runner does not invent a stale success fallback.
//   4. After every run, the runner:
//        a) copies the per-run network records to
//           `docs/execution/evidence/pre-main-test-journeys-records.run<N>.json`
//           so each run has its own snapshot, not only the last one;
//        b) copies the per-run raw log to
//           `docs/execution/evidence/pre-main-test-journeys-logs/run<N>.log`
//           so a human reviewer can read it without a .e2e-logs path;
//        c) on exit, drops the run's dedicated `fera_e2e_premainjourney_…`
//           DB only — never any pre-existing human/demo/shared DB.
//   5. Aggregates pass/fail counts; exits 0 only if every run is green
//      and the offline log scan has no external-host rows.
//   6. Merges run-by-run rows into the seeded evidence file:
//      `docs/execution/evidence/pre-main-test-journeys.md`. The runner
//      OWNS the merge; the seed content is preserved.
//
// Non-network / no provider: every run uses DEMO_MODE=1 and
// FERA_MODEL_CACHE pinned to `phase3-finish/.cache/models`. No
// .env* is read. No provider API is contacted. The runner is
// strictly hermetic.
//
// Pure helper contract (parseArgs, parseRuns, replaceSection, …) is
// re-exported from `./runner-helpers.mjs`; the unit tests in
// `tests/rehearsal/runner-helpers.test.ts` assert the contract and
// the runner's main path consumes the same helpers so the production
// behaviour and the test assertions cannot drift.

import { randomBytes } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  parseArgs,
  parseRuns,
  replaceSection,
  truthy,
  DEFAULT_DATABASE_URL,
  dropRehearsalDb,
} from "./runner-helpers.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const EVIDENCE_PATH_DIR = join(REPO_ROOT, "docs", "execution", "evidence");
const EVIDENCE_PATH = join(EVIDENCE_PATH_DIR, "pre-main-test-journeys.md");
const SPEC_PATH = join(REPO_ROOT, "tests", "rehearsal", "full-journey-offline.spec.ts");
const RECORDS_PATH = join(EVIDENCE_PATH_DIR, "pre-main-test-journeys-records.json");
const PER_RUN_RECORDS = (n) =>
  join(EVIDENCE_PATH_DIR, `pre-main-test-journeys-records.run${n}.json`);
const PER_RUN_LOGS_DIR = join(EVIDENCE_PATH_DIR, "pre-main-test-journeys-logs");

export async function runOnce(runIndex, args) {
  // Each Playwright run mints its own DB name and log path; the
  // config handles the prefix. We do NOT pass --reuse-existing-server;
  // each repeat is a fresh webServer lifecycle so the offline proof
  // is recorded per run.
  // The test process writes a manifest file
  // (`pre-main-test-journeys-managed-dbs.<pid>.txt`) on afterAll
  // with the DB name the Playwright config set. We pick it up
  // by the run's child pid after exit.
  const ownedDbName = `fera_e2e_premainjourney_${process.pid}_${runIndex}_${randomBytes(3).toString("hex")}`;
  return new Promise((resolveRun) => {
    let child;
    try {
      child = spawn(
        "npx",
        [
          "playwright",
          "test",
          "--config",
          args.config,
          "--project",
          args.project,
          "--reporter=line,json",
          SPEC_PATH,
        ],
        {
          cwd: REPO_ROOT,
          env: {
            ...process.env,
            // Forward the runner's child pid so the test process can
            // namespace its manifest under the runner's pid (the
            // worker's own pid is unrelated to the runner's).
            FERA_REHEARSAL_RUNNER_CHILD_PID: String(process.pid),
            FERA_REHEARSAL_DB_NAME: ownedDbName,
          },
        },
      );
    } catch (err) {
      // Synchronous spawn failure (e.g. ENOENT for `npx`). Treat as
      // a run failure, not a runner crash.
      resolveRun({
        runIndex,
        code: 1,
        stdout: "",
        stderr: `spawn error: ${err.message}`,
        spawnError: true,
        dbName: ownedDbName,
        logPath: null,
        childPid: null,
      });
      return;
    }
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => { stdout += c.toString("utf8"); });
    child.stderr.on("data", (c) => { stderr += c.toString("utf8"); });
    child.on("error", (err) => {
      // Async spawn error (e.g. EACCES). Capture as a run failure.
      stdout += `\n[runner] child error event: ${err.message}\n`;
      stderr += `[runner] child error event: ${err.message}\n`;
      resolveRun({ runIndex, code: 1, stdout, stderr, spawnError: true, dbName: ownedDbName, logPath: null, childPid: child.pid ?? null });
    });
    child.on("close", (code, signal) => {
      // Extract the per-run DB name and log path from the manifest
      // the test process wrote. The runner cannot read
      // FERA_REHEARSAL_DB_NAME or FERA_REHEARSAL_LOG_PATH directly
      // (both are set on the webServer's child env and on the
      // test process env, neither of which the runner inherits).
      // The manifest is keyed by the RUNNER'S pid (forwarded as
      // FERA_REHEARSAL_RUNNER_CHILD_PID) so two concurrent runners
      // cannot collide; the test worker's own pid is unrelated.
      let dbName = ownedDbName;
      let logPath = null;
      const manifestPath = join(
        EVIDENCE_PATH_DIR,
        `pre-main-test-journeys-managed-dbs.${process.pid}.txt`,
      );
      if (existsSync(manifestPath)) {
        try {
          const raw = readFileSync(manifestPath, "utf8");
          const lines = raw.split("\n").map((l) => l.trim());
          if (lines[0] && lines[0] !== ownedDbName) code = 1;
          logPath = lines[1] || null;
        } catch {
          /* ignore */
        }
      }
      resolveRun({
        runIndex,
        code: code ?? (signal ? 1 : 0),
        stdout,
        stderr,
        signal,
        dbName,
        logPath,
        childPid: child.pid ?? null,
      });
    });
  });
}

async function readJsonIfPresent(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function snapshotPerRunArtifacts(runIndex, result) {
  // Per-run network records. The Playwright spec writes a single
  // `pre-main-test-journeys-records.json` on afterAll; we COPY it to
  // a per-run path before the next run overwrites it. A failed copy
  // fails the run: evidence that cannot be preserved is not evidence.
  const fail = (what, err) => {
    result.code = 1;
    result.snapshotError = `${what}: ${err.message ?? err}`;
    process.stdout.write(`[automated-repeats] run ${runIndex + 1} snapshot failed (${result.snapshotError})\n`);
  };
  if (existsSync(RECORDS_PATH)) {
    try {
      await copyFile(RECORDS_PATH, PER_RUN_RECORDS(runIndex + 1));
    } catch (err) {
      fail("records copy", err);
    }
  }
  // Per-run raw log. The wrapper writes the live log; we copy it to
  // the evidence dir so a reviewer without shell access to .e2e-logs
  // can still read it.
  if (result.logPath) {
    try {
      if (!existsSync(result.logPath)) throw new Error(`log not found at ${result.logPath}`);
      await mkdir(PER_RUN_LOGS_DIR, { recursive: true });
      await copyFile(result.logPath, join(PER_RUN_LOGS_DIR, `run${runIndex + 1}.log`));
    } catch (err) {
      fail("log copy", err);
    }
  }
}

/** `git status --porcelain` for the tree under test. Non-empty output
 *  means the runs exercised uncommitted changes, so the evidence is
 *  marked dirty instead of being attributed to `sourceCommit` alone. */
function gitTreeStatus() {
  try {
    const porcelain = execFileSync("git", ["status", "--porcelain"], { cwd: REPO_ROOT, encoding: "utf8" });
    return { porcelain, dirty: porcelain.trim() !== "" };
  } catch (err) {
    // Unknown tree state is treated as dirty, never as clean.
    return { porcelain: `git status failed: ${err.message}`, dirty: true };
  }
}

export async function runRepeatSuite(opts) {
  // Pure orchestration helper. Tests import this and the unit
  // assertions in `runner-helpers.test.ts` cover the same flow with
  // a mocked `runOnce`.
  const args = parseArgs(opts.argv);
  if (args.help === "1") {
    return { help: true };
  }
  const RUNS = parseRuns(args.runs, 5);
  const CONFIG = resolve(REPO_ROOT, args.config ?? "playwright.offline.config.ts");
  const PROJECT = args.project ?? "offline-desktop";
  const KEEP_GOING = truthy(args["keep-going"]);
  const NO_CLEANUP = truthy(args["no-cleanup"]);
  if (!existsSync(CONFIG)) {
    throw new Error(`missing config: ${CONFIG}`);
  }
  await mkdir(EVIDENCE_PATH_DIR, { recursive: true });
  // Captured before any run writes evidence files into the tree.
  const tree = gitTreeStatus();
  const results = [];
  try {
    for (let i = 0; i < RUNS; i += 1) {
      process.stdout.write(`[automated-repeats] run ${i + 1}/${RUNS} (AUTOMATED)\n`);
      if (existsSync(RECORDS_PATH)) unlinkSync(RECORDS_PATH);
      const staleManifest = join(EVIDENCE_PATH_DIR, `pre-main-test-journeys-managed-dbs.${process.pid}.txt`);
      if (existsSync(staleManifest)) unlinkSync(staleManifest);
      const r = await runOnce(i, { config: CONFIG, project: PROJECT });
      results.push(r);
      const network = await readJsonIfPresent(RECORDS_PATH);
      r.networkRecords = network?.perJourney?.length ?? 0;
      // Every deny row is an external attempt, whatever its outcome.
      r.externalAttempts = (network?.perJourney ?? []).filter(row => row.decision === "deny").length;
      r.sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
      if (!r.networkRecords || r.externalAttempts) r.code = 1;
      await snapshotPerRunArtifacts(i, r);
      if (r.code !== 0 && !KEEP_GOING) {
        process.stdout.write(
          `[automated-repeats] run ${i + 1} failed (exit ${r.code}); stopping (use --keep-going to continue)\n`,
        );
        break;
      }
    }
  } finally {
    // Cleanup runs even when a run, a read or a snapshot throws, so an
    // owned rehearsal DB is never left behind by a runner crash.
    if (!NO_CLEANUP) {
      // The manifest is namespaced by the runner's pid (forwarded
      // to the test process as FERA_REHEARSAL_RUNNER_CHILD_PID), so
      // one unlink covers all runs in this invocation.
      const manifestPath = join(
        EVIDENCE_PATH_DIR,
        `pre-main-test-journeys-managed-dbs.${process.pid}.txt`,
      );
      for (const r of results) {
        if (r.dbName) {
          try {
            await dropRehearsalDb(r.dbName, DEFAULT_DATABASE_URL);
            process.stdout.write(`[automated-repeats] dropped fresh owned DB: ${r.dbName}\n`);
          } catch (err) {
            r.code = 1;
            process.stdout.write(`[automated-repeats] could not drop ${r.dbName}: ${err.message}\n`);
          }
        }
      }
      if (existsSync(manifestPath)) {
        try {
          unlinkSync(manifestPath);
        } catch {
          /* non-fatal */
        }
      }
    } else {
      process.stdout.write(`[automated-repeats] --no-cleanup: leaving per-run DBs on disk\n`);
    }
  }
  await writeFile(join(EVIDENCE_PATH_DIR, "pre-main-automated-repeat-summary.json"), JSON.stringify({ automated: true, humanRehearsal: false,
    dirtyTree: tree.dirty, gitStatusPorcelain: tree.porcelain,
    results: results.map(({ runIndex, code, dbName, networkRecords, externalAttempts, sourceCommit, snapshotError }) => ({ run: runIndex + 1, code, dbName, networkRecords, externalAttempts, sourceCommit, ...(snapshotError ? { snapshotError } : {}) })), recordedAt: new Date().toISOString() }, null, 2) + "\n");
  const records = await readJsonIfPresent(RECORDS_PATH);
  await mergeEvidence(results, records, tree);
  const allGreen = results.every((r) => r.code === 0);
  return { allGreen, results, records, dirty: tree.dirty };
}

export async function mergeEvidence(results, records, tree = { dirty: true, porcelain: "" }) {
  await mkdir(EVIDENCE_PATH_DIR, { recursive: true });
  const ts = new Date().toISOString();
  const rows = results
    .map(
      (r) =>
        `| ${r.runIndex + 1} | ${r.code} | ${r.code === 0 ? "✅" : "❌"} | AUTOMATED |${
          r.spawnError ? " spawn-error" : ""
        }${r.signal ? ` signal=${r.signal}` : ""}${r.snapshotError ? " snapshot-error" : ""}${r.dbName ? ` ${r.dbName}` : ""}`,
    )
    .join("\n");
  const runTable = `| Run | Exit | Pass? | Notes |\n|----:|-----:|:----:|-------|`;
  const runRowsBlock = `${runTable}\n${rows || "_(none)_"}\n`;

  // Scope, stated exactly: these counts come from the browser-side
  // watchdog (Playwright `context.route`). They cover browser-originated
  // HTTP(S) only, not server-side egress, the Playwright `request`
  // fixture, Node fetch, or WebSockets beyond routing.
  const scopeLine =
    "Scope: browser-originated HTTP(S) requests seen by Playwright `context.route` only. Server-side egress from the Next.js process, the Playwright `request` fixture, Node `fetch` and WebSockets beyond routing are NOT observed by this count.";
  let netBlock =
    `${scopeLine}\n\n_records.json not found; this run did not produce a network summary (test may have failed before completion)._\n`;
  if (records && records.perJourney && Array.isArray(records.perJourney)) {
    const totals = { allow: 0, deny: 0, pass: 0, error: 0 };
    const byHost = new Map();
    for (const r of records.perJourney) {
      const key = r.host || "(non-http)";
      const entry = byHost.get(key) ?? { allow: 0, deny: 0, pass: 0, error: 0 };
      if (r.decision === "allow") entry.allow += 1;
      else if (r.decision === "deny") entry.deny += 1;
      else if (r.decision === "error") entry.error += 1;
      else entry.pass += 1;
      byHost.set(key, entry);
    }
    for (const v of byHost.values()) {
      totals.allow += v.allow;
      totals.deny += v.deny;
      totals.pass += v.pass;
      totals.error += v.error;
    }
    const hostRows = Array.from(byHost.entries())
      .map(([host, v]) => `| ${host} | ${v.allow} | ${v.deny} | ${v.pass} | ${v.error} |`)
      .join("\n");
    netBlock = [
      scopeLine,
      "",
      `- Total loopback allow: ${totals.allow}`,
      `- Total non-loopback deny (external browser attempts): ${totals.deny}`,
      `- Total data:/blob: pass-through: ${totals.pass}`,
      `- Total loopback route errors (not external): ${totals.error}`,
      "",
      "Per-host (only hosts the browser attempted):",
      "",
      "| Host | Allow | Deny | Pass | Error |",
      "|------|------:|-----:|-----:|------:|",
      hostRows,
    ].join("\n");
  }

  const allGreen = results.every((r) => r.code === 0);
  const verdict = !allGreen ? "see Run-by-run table" : tree.dirty ? "all green on a DIRTY tree (uncommitted changes; see pre-main-automated-repeat-summary.json gitStatusPorcelain)" : "all green";
  const summaryLine = `Last run: ${ts} — ${results.length} run(s) (AUTOMATED) — ${verdict}`;

  if (!existsSync(EVIDENCE_PATH)) {
    const lines = [
      "# Pre-main test-journeys — automated offline rehearsal evidence",
      "",
      summaryLine,
      "",
      "## Run-by-run results",
      "",
      runRowsBlock,
      "",
      "## Offline network proof",
      "",
      netBlock,
      "",
    ];
    await writeFile(EVIDENCE_PATH, lines.join("\n"), "utf8");
    process.stdout.write(`[automated-repeats] evidence created: ${EVIDENCE_PATH}\n`);
    return;
  }
  const existing = await readFile(EVIDENCE_PATH, "utf8");
  let updated = existing;
  updated = replaceSection(updated, /^## Run-by-run results.*$/m, runRowsBlock);
  updated = replaceSection(updated, /^## Offline network proof.*$/m, netBlock + "\n");
  updated = updated.replace(/^Last run: [^\n]*\n+/, "");
  updated = `${summaryLine}\n\n${updated}`;
  await writeFile(EVIDENCE_PATH, updated, "utf8");
  process.stdout.write(`[automated-repeats] evidence merged: ${EVIDENCE_PATH}\n`);
}

const isMain = process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  if (!existsSync(SPEC_PATH)) {
    console.error(`[automated-repeats] missing spec: ${SPEC_PATH}`);
    process.exit(2);
  }
  // Help is handled before any side-effect.
  if (process.argv.includes("--help")) {
    process.stdout.write(
      [
        "Usage: node scripts/rehearsal/run-automated-repeats.mjs [--runs N] [--config playwright.offline.config.ts] [--project offline-desktop] [--keep-going] [--no-cleanup]",
        "",
        "  --runs N         Number of repeat runs (1-50, default 5). Must be a positive integer.",
        "  --config PATH    Playwright config (default: playwright.offline.config.ts).",
        "  --project NAME   Playwright project (default: offline-desktop).",
        "  --keep-going     Continue past the first failure.",
        "  --no-cleanup     Do NOT drop the rehearsal DB after each run.",
        "  --help           Print this message.",
        "",
        "Unknown flags are refused. Per-run network records are written to",
        "docs/execution/evidence/pre-main-test-journeys-records.run<N>.json;",
        "per-run raw logs to docs/execution/evidence/pre-main-test-journeys-logs/run<N>.log.",
        "",
      ].join("\n"),
    );
    process.exit(0);
  }
  try {
    const out = await runRepeatSuite({ argv: process.argv.slice(2) });
    if (out.help) process.exit(0);
    process.exit(out.allGreen ? 0 : 1);
  } catch (err) {
    console.error("[automated-repeats] fatal", err);
    process.exit(2);
  }
}
