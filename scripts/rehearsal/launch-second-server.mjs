// Pre-main test-journeys — OWNED second Next.js server wrapper.
//
// Why this exists alongside `launch-offline-server.mjs`:
//   * The Playwright webServer (owned by `playwright.offline.config.ts`)
//     MUST be untouched. We do not modify it or its wrapper.
//   * The survival test owns its OWN second/third server on a fresh
//     loopback port (`FERA_REHEARSAL_RESTART_PORT`) using the SAME
//     signing keys the first webServer set, so a parent/auth cookie
//     minted by server #1 is still valid on server #2 (and vice versa).
//   * The brief: "Spawn the Next CLI directly with Node so cleanup
//     does not leave an npx grandchild running." We invoke the
//     `next` CLI through `node` invoking the binary directly so the
//     child tree is `node` (this wrapper) → `node` (the CLI) → the
//     Next.js workers, with no `npx` / sh shim in the chain. A kill
//     of the direct CLI child reliably terminates the worker so the
//     loopback port closes fast.
//   * `NEXT_TELEMETRY_DISABLED=1` is set on the child env so the
//     run does not contact the Next.js telemetry endpoint (a real
//     external host call) and so the test honours the brief's
//     "Disable Next telemetry" rule.
//   * The child is bound via `next start -H 127.0.0.1 -p <port>`
//     so the server only listens on the loopback interface; the
//     bind-host argument is documented in `next start --help`.
//
// Lifecycle:
//   * The caller spawns this script via Node (e.g.
//     `spawn(process.execPath, [thisScript, ...args])`). The
//     caller passes the per-restart log path and any extra env
//     via `process.env`.
//   * On SIGTERM the wrapper SIGTERMs the child directly and
//     waits up to 3 s for it to exit before escalating to
//     SIGKILL. The Next CLI honours SIGTERM in our experience;
//     SIGKILL is the belt-and-braces fallback.
//   * The wrapper exits with the child's exit code so a test
//     failure (e.g. the child crashes) surfaces immediately.

import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

// Resolve the Next CLI binary path RELATIVE TO THE REPO ROOT, not the
// caller's CWD. The test runs the spec from the worktree root;
// spawning `npx` here would create an extra shim process the brief
// explicitly forbids.
const NEXT_BIN = resolve(REPO_ROOT, "node_modules/next/dist/bin/next");

// CLI args we accept on the wrapper's argv:
//   --port <n>            required; loopback port for next start
//   --log <path>          required; per-restart tee path
// Optional flags:
//   --hostname 127.0.0.1  (default: 127.0.0.1; loopback only)
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = "1";
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const PORT = args.port;
const LOG_PATH = args.log;
const HOSTNAME = args.hostname ?? "127.0.0.1";
if (!PORT || !LOG_PATH) {
  console.error("[second-server] --port and --log are required");
  process.exit(2);
}
if (!/^\d+$/.test(String(PORT))) {
  console.error(`[second-server] --port must be a number (got ${PORT})`);
  process.exit(2);
}
if (!/\.log$/.test(LOG_PATH)) {
  console.error("[second-server] --log must end in .log");
  process.exit(2);
}
if (HOSTNAME !== "127.0.0.1" && HOSTNAME !== "localhost" && HOSTNAME !== "::1") {
  console.error(`[second-server] --hostname must be loopback (got ${HOSTNAME})`);
  process.exit(2);
}

mkdirSync(dirname(LOG_PATH), { recursive: true });
const out = createWriteStream(LOG_PATH, { flags: "w" });
out.on("error", (err) => {
  process.stderr.write(`[second-server] log write error: ${err.message}\n`);
});

// Bind explicitly to the loopback interface so the brief's "bind their
// servers to loopback" rule is honoured even on a host whose hostname
// resolves to a routable address.
// Disable Next telemetry so the test never contacts
// https://telemetry.nextjs.org (an external host).
const childEnv = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: "1",
  FERA_REHEARSAL: "1",
};

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
async function shutdown(code = 0) {
  if (exiting) return;
  exiting = true;
  if (child.exitCode === null && child.signalCode === null) {
    const closed = new Promise(resolve => child.once("close", resolve));
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
    await closed;
    clearTimeout(timer);
  }
  await new Promise(resolve => out.end(resolve));
  process.exit(code);
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
  process.stderr.write(`[second-server] spawn error: ${err.message}\n`);
  shutdown(1);
});
child.on("exit", (code, signal) => {
  // If the test SIGTERMed us, we still flush the log; we report
  // the child's exit code so a crash surfaces.
  shutdown(code ?? (signal ? 1 : 0));
});
process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));
