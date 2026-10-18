// P3-209 / TC-028 — E2E server wrapper. `playwright.config.ts` boots this
// wrapper as the `webServer` so the underlying `next start` child is captured
// to a per-run log file while still being piped back to Playwright.
//
// Why a wrapper exists: Playwright's `webServer` with `stdout: "pipe"` keeps
// the child's output in-process, but does not expose it back to the spec
// process. The log-scan test (TC-028, NFR-010) needs to read what the server
// wrote to know that phone-shaped and named payloads were dropped by the
// allowlist logger. The wrapper tees both streams to `FERA_E2E_LOG_PATH`.
//
// - Stdout and stderr from `next start` are written verbatim, in order, with
//   only the `Buffer` boundaries respected. Lines are not parsed or
//   rewritten, so the same JSON the server produced is on disk.
// - The wrapper refuses to start unless `FERA_E2E_LOG_PATH` is set and ends
//   in `.log`; the e2e config sets a per-run path under `.e2e-logs/` so a
//   stale file is impossible. The directory is created if missing.
// - The wrapper is killed with SIGTERM on the parent's exit (the webServer
//   owns lifecycle), so the file is fully flushed when the spec reads it.
// - The wrapper is NOT used outside the e2e run. `npm run dev`, `npm start`
//   and CI all use `next` directly. No production code path runs through it.
//
// Local-only disposable database guard is the responsibility of `db:reset`
// (called by the webServer command); this wrapper only adds capture.
import { spawn } from "node:child_process";
import { mkdirSync, createWriteStream, writeSync } from "node:fs";
import { dirname } from "node:path";

const LOG_PATH = process.env.FERA_E2E_LOG_PATH;
if (!LOG_PATH || !/\.log$/.test(LOG_PATH)) {
  console.error("[e2e-server] FERA_E2E_LOG_PATH must be set and end in .log");
  process.exit(2);
}

// Ensure the parent directory exists so a first-run repo does not ENOENT the
// log file. .e2e-logs/ stays ignored via .gitignore.
mkdirSync(dirname(LOG_PATH), { recursive: true });

// Truncate so a previous run cannot leak in. Per-run path comes from
// playwright.config.ts (pid + 4 random hex bytes) so collisions are unlikely,
// but the file may still exist from a prior run.
const out = createWriteStream(LOG_PATH, { flags: "w" });
out.on("error", (err) => {
  process.stderr.write(`[e2e-server] log write error: ${err.message}\n`);
});

// Pass-through env, with the log path and a marker so server logs can mention
// the e2e mode without leaking secrets. We never echo the env to the log
// file directly; only the child's stdout/stderr is captured.
const childEnv = { ...process.env, FERA_E2E: "1" };
const PORT = process.env.FERA_E2E_PORT ?? "3100";

const child = spawn("npx", ["next", "start", "-p", String(PORT)], {
  stdio: ["ignore", "pipe", "pipe"],
  env: childEnv,
});

let exiting = false;
function shutdown(code = 0) {
  if (exiting) return;
  exiting = true;
  // Ask the child to exit; if it ignores SIGTERM, escalate so we never leak
  // an orphan `next start` process holding the loopback port.
  try { child.kill("SIGTERM"); } catch { /* already gone */ }
  const killTimer = setTimeout(() => {
    try { child.kill("SIGKILL"); } catch { /* already gone */ }
  }, 2_000);
  killTimer.unref?.();
  // Wait for the log write stream to flush before exiting, so the spec that
  // reads FERA_E2E_LOG_PATH never sees a truncated tail. Fall back to a
  // hard timer so a stuck stream cannot keep the process alive forever.
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

// Forward + tee stdout. The child writes JSON log lines; copying them to
// process.stdout lets Playwright keep its stream alive, and to `out` keeps the
// spec-readable copy.
child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  out.write(chunk);
});
child.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
  out.write(chunk);
});
child.on("error", (err) => {
  process.stderr.write(`[e2e-server] spawn error: ${err.message}\n`);
  writeSync(2, `spawn error: ${err.message}\n`);
  shutdown(1);
});
child.on("exit", (code, signal) => {
  // Mirror the child's exit; Playwright will mark the webServer unhealthy.
  shutdown(code ?? (signal ? 1 : 0));
});
process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));
