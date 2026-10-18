// Pre-main test-journeys — offline-aware e2e server wrapper.
//
// Why a separate wrapper from `scripts/e2e-server.mjs`:
//   * The existing e2e wrapper is owned by P3-014 / TC-028 and is the
//     proven path for the existing test suite. We do not modify it
//     (Sadman owns `scripts/e2e-server.mjs`).
//   * The rehearsal run is hermetic and reads its log path from
//     `FERA_REHEARSAL_LOG_PATH` rather than `FERA_E2E_LOG_PATH` so the
//     two webServers cannot share a log file. The rehearsal spec reads
//     the same per-run path (`tests/rehearsal/network-watchdog.ts`
//     consumes the offline log alongside the route allowlist to prove
//     no external host was reached).
//
// Lifecycle and capture mirror the existing wrapper:
//   * Stdout and stderr are teed to `FERA_REHEARSAL_LOG_PATH` per run.
//     Lines are not parsed or rewritten, so the same JSON the server
//     produced is on disk.
//   * SIGTERM-then-SIGKILL teardown; Playwright owns the parent
//     process so the child never leaks.
//   * Refuses to start unless `FERA_REHEARSAL_LOG_PATH` ends in `.log`.
//
// Environment: the wrapper does NOT touch `.env*`; it inherits the
// process env (which carries DEMO_MODE=1, FERA_MODEL_CACHE pointing at
// the phase3-finish tree, the throwaway signing keys, and the
// dedicated loopback DATABASE_URL — all set by
// `playwright.offline.config.ts`).
import { spawn } from "node:child_process";
import { mkdirSync, createWriteStream, writeSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
// Spawn the Next CLI directly with Node so cleanup does not leave an
// `npx` shim / grandchild in the process tree. The CLI is a small JS
// entry point that hands off to the production server; invoking it
// through `node <cli.js>` keeps the child tree as
// `node` (this wrapper) → `node` (the CLI) → Next.js workers.
const NEXT_BIN = resolve(REPO_ROOT, "node_modules/next/dist/bin/next");

const LOG_PATH = process.env.FERA_REHEARSAL_LOG_PATH;
if (!LOG_PATH || !/\.log$/.test(LOG_PATH)) {
  console.error("[rehearsal] FERA_REHEARSAL_LOG_PATH must be set and end in .log");
  process.exit(2);
}
if (!process.env.DEMO_MODE) {
  // Pinned by the Playwright config; the offline guarantee requires
  // the cache-only path (BR-026, TC-021/056).
  console.error("[rehearsal] DEMO_MODE must be set (Playwright config pins it to 1)");
  process.exit(2);
}
if (!process.env.FERA_MODEL_CACHE) {
  // Pinned by the Playwright config; the offline guarantee requires
  // the model loader to read the on-disk cache, not download.
  console.error("[rehearsal] FERA_MODEL_CACHE must be set (Playwright config pins it)");
  process.exit(2);
}

mkdirSync(dirname(LOG_PATH), { recursive: true });
// Truncate so a previous run cannot leak in. The path includes
// pid + 3 random hex bytes, so collisions are unlikely; the file may
// still exist from a prior run.
const out = createWriteStream(LOG_PATH, { flags: "w" });
out.on("error", (err) => {
  process.stderr.write(`[rehearsal] log write error: ${err.message}\n`);
});

// Disable Next telemetry so the test never contacts
// https://telemetry.nextjs.org (an external host). The Playwright
// config also pins DEMO_MODE=1 and FERA_MODEL_CACHE; we honour both.
const HOSTNAME = "127.0.0.1";
const childEnv = {
  ...process.env,
  FERA_REHEARSAL: "1",
  NEXT_TELEMETRY_DISABLED: "1",
};
const PORT = process.env.FERA_REHEARSAL_PORT ?? "3225";

const child = spawn(
  process.execPath,
  [NEXT_BIN, "start", "-H", HOSTNAME, "-p", String(PORT)],
  {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: childEnv,
  },
);

let exiting = false;
function shutdown(code = 0) {
  if (exiting) return;
  exiting = true;
  try { child.kill("SIGTERM"); } catch { /* already gone */ }
  const killTimer = setTimeout(() => {
    try { child.kill("SIGKILL"); } catch { /* already gone */ }
  }, 2_000);
  killTimer.unref?.();
  let exited = false;
  const finish = () => {
    if (exited) return;
    exited = true;
    clearTimeout(fallback);
    process.exit(code);
  };
  out.end(finish);
  const fallback = setTimeout(finish, 1_500);
  fallback.unref?.();
}

child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  out.write(chunk);
});
child.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
  out.write(chunk);
});
child.on("error", (err) => {
  process.stderr.write(`[rehearsal] spawn error: ${err.message}\n`);
  writeSync(2, `spawn error: ${err.message}\n`);
  shutdown(1);
});
child.on("exit", (code, signal) => {
  shutdown(code ?? (signal ? 1 : 0));
});
process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));
