// Pre-main test-journeys — owned second-server lifecycle helper.
//
// Why this exists:
//   * The survival test (and any future restart test) needs a small
//     API to start, probe, and stop an OWNED second Next.js
//     instance without coupling to `child_process` or to
//     `scripts/rehearsal/launch-offline-server.mjs`.
//   * The helper captures the spawn → log → ready-probe →
//     teardown lifecycle in a single function with a finally
//     that always cleans up. The test never leaks a child even
//     when an assertion throws.
//
// What it does:
//   1. Computes a per-call log path under `.e2e-logs/` from the
//      test's PID + a per-call index, so a second invocation
//      during the same test run does not overwrite the first
//      log.
//   2. Forwards the entire `process.env` so the wrapper inherits
//      `DATABASE_URL`, `FERA_MODEL_CACHE`, `DEMO_MODE`, and the
//      throwaway signing keys. The test only needs to inject
//      `FERA_REHEARSAL_PORT` (the fresh loopback port) before
//      calling.
//   3. Polls `${baseURL}/api/health` for up to 60 s. Each probe has
//      its own `AbortSignal.timeout`, so a hung socket cannot eat the
//      whole budget. We accept only a 200 whose JSON body is the
//      API-019 shape with `db: "ready"` and `synthetic_only: true`;
//      a half-booted server that returns 200 + HTML (or a degraded
//      DB) is rejected. If the owned child exits or errors while we
//      wait, the wait fails immediately with the exit code/signal.
//   4. Returns the `ChildProcess` and the per-call log path so
//      the caller can attach to the child's streams (e.g. for a
//      failure report). The caller MUST call `stopOwnedServer`
//      in a `finally` block; the helper does NOT auto-clean.
//
// Direct-Node spawn: the helper calls
// `spawn(process.execPath, [wrapperScript, "--port", ..., "--log", ...])`.
// No `npx`, no sh, no grandchild. The wrapper then spawns the
// Next CLI via the same `process.execPath`. The child tree is
// `node` (test) → `node` (wrapper) → `node` (next CLI) → Next
// workers; killing the wrapper's child PID is enough to free
// the loopback port.

import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

export type OwnedServer = {
  child: ChildProcess;
  port: number;
  baseURL: string;
  logPath: string;
};

const REPO_ROOT = resolve(__dirname, "..", "..");
const WRAPPER = resolve(REPO_ROOT, "scripts/rehearsal/launch-second-server.mjs");
// A spawn 'error' can fire before anyone waits on the child; it is kept
// here so the health wait reports it instead of an unhandled 'error'.
const SPAWN_ERRORS = new WeakMap<ChildProcess, Error>();

/** Start an owned second server on the given port. The caller owns
 *  the lifecycle and must call `stopOwnedServer` in a `finally`.
 *  `extraEnv` is merged into the process env so the test can pin
 *  per-call values (port, log path, etc.). */
export async function startOwnedServer(opts: {
  port: number;
  logPath: string;
  extraEnv?: Record<string, string>;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}): Promise<{ child: ChildProcess; logPath: string }> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...opts.extraEnv,
  };
  // Pin the port the wrapper must use.
  env.FERA_REHEARSAL_PORT = String(opts.port);
  env.FERA_REHEARSAL_LOG_PATH = opts.logPath;
  // The wrapper reads NEXT_TELEMETRY_DISABLED from the env, but we
  // also set it here as a defence in depth.
  env.NEXT_TELEMETRY_DISABLED = "1";
  // `stdio: ["ignore", "pipe", "pipe"]` tells TS that stdout/stderr
  // are Readable streams; we keep the child as `ChildProcess` (not
  // `ChildProcessWithoutNullStreams`) so the type signature for
  // callers does not change, and we re-fetch the streams as `any`
  // because TS narrows the union to `never` when stdio is
  // pipe-mixed across the three positions.
  const child = spawn(
    process.execPath,
    [WRAPPER, "--port", String(opts.port), "--log", opts.logPath, "--hostname", "127.0.0.1"],
    {
      cwd: REPO_ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  ) as ChildProcess & { stdout: import("node:stream").Readable | null; stderr: import("node:stream").Readable | null };
  child.on("error", (err: Error) => SPAWN_ERRORS.set(child, err));
  if (opts.onStdout && child.stdout) {
    child.stdout.on("data", (c: Buffer | string) => opts.onStdout!(c.toString("utf8")));
  }
  if (opts.onStderr && child.stderr) {
    child.stderr.on("data", (c: Buffer | string) => opts.onStderr!(c.toString("utf8")));
  }
  return { child, logPath: opts.logPath };
}

/** True once the child has exited or been killed by a signal. */
function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

/** Wait for `${baseURL}/api/health` to return 200 with a ready API-019
 *  body. Throws if the probe never succeeds within `timeoutMs`, and
 *  fails fast if `child` exits or emits 'error' first. */
export async function waitForOwnedHealth(
  baseURL: string,
  opts: { child?: ChildProcess; timeoutMs?: number; probeTimeoutMs?: number } = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const probeTimeoutMs = opts.probeTimeoutMs ?? 15_000;
  const deadline = Date.now() + timeoutMs;
  let lastErr: string | null = null;
  let lastBody: string | null = null;
  let childFailure: string | null = null;
  const child = opts.child;
  const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
    childFailure = `owned server exited before it was healthy (code=${code}, signal=${signal})`;
  };
  const onError = (err: Error) => {
    childFailure = `owned server failed to start: ${err.message}`;
  };
  if (child) {
    const early = SPAWN_ERRORS.get(child);
    if (early) throw new Error(`owned server failed to start: ${early.message}`);
    if (hasExited(child)) {
      throw new Error(`owned server exited before it was healthy (code=${child.exitCode}, signal=${child.signalCode})`);
    }
    child.once("exit", onExit);
    child.once("error", onError);
  }
  try {
    while (Date.now() < deadline) {
      if (childFailure) throw new Error(childFailure);
      try {
        const res = await fetch(`${baseURL}/api/health`, {
          signal: AbortSignal.timeout(Math.max(1, Math.min(probeTimeoutMs, deadline - Date.now()))),
        });
        const body = await res.text();
        lastBody = body;
        if (res.status !== 200) {
          lastErr = `status=${res.status}`;
        } else {
          const problem = healthBodyProblem(body);
          if (problem === null) return;
          lastErr = problem;
        }
      } catch (err) {
        lastErr = (err as Error).message;
      }
      if (childFailure) throw new Error(childFailure);
      await new Promise((r) => setTimeout(r, 250));
    }
  } finally {
    child?.off("exit", onExit);
    child?.off("error", onError);
  }
  throw new Error(
    `owned server ${baseURL}/api/health did not respond within ${timeoutMs}ms (last error: ${lastErr}, last body: ${lastBody?.slice(0, 200)})`,
  );
}

/** Null when `body` is a ready API-019 health response, otherwise a
 *  short reason. Only the documented fields are read. */
function healthBodyProblem(body: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return "health response is not JSON";
  }
  const h = parsed as { version?: unknown; db?: unknown; synthetic_only?: unknown };
  if (typeof h !== "object" || h === null) return "health response is not an object";
  if (typeof h.version !== "string" || h.version.length === 0) return "health response has no version";
  if (h.synthetic_only !== true) return "health response is not synthetic_only";
  if (h.db !== "ready") return `health db=${String(h.db)}`;
  return null;
}

/** Confirm the loopback port is closed (i.e. the owned server
 *  actually released the bind). Probes the loopback TCP socket
 *  directly; HTTP requests would 200 if anything else were
 *  listening, but a port close is the documented liveness signal.
 *  Throws if the port is still accepting connections. */
export async function assertPortClosed(port: number, timeoutMs = 5_000): Promise<void> {
  const { createConnection } = await import("node:net");
  const deadline = Date.now() + timeoutMs;
  let lastErr: string | null = null;
  while (Date.now() < deadline) {
    const ok = await new Promise<boolean>((resolveOne) => {
      const sock = createConnection({ host: "127.0.0.1", port }, () => {
        sock.end();
        resolveOne(true);
      });
      sock.on("error", (err) => {
        lastErr = err.message;
        resolveOne(false);
      });
      // Belt-and-braces timeout.
      setTimeout(() => {
        sock.destroy();
        resolveOne(false);
      }, 500).unref?.();
    });
    if (!ok) {
      // Port is closed (ECONNREFUSED is what we want).
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`port ${port} is still accepting connections after ${timeoutMs}ms (last err: ${lastErr})`);
}

/** Stop the owned server. Sends SIGTERM, waits up to 5 s for the
 *  child to exit, then SIGKILLs as a last resort. Always returns
 *  without throwing — a test's `finally` must not be derailed by
 *  a teardown error. */
export async function stopOwnedServer(child: ChildProcess): Promise<void> {
  if (hasExited(child)) return; // already gone (exit code or signal)
  try {
    child.kill("SIGTERM");
  } catch {
    /* already gone */
  }
  const exitPromise = new Promise<void>((resolveExit) => {
    child.once("exit", () => resolveExit());
    setTimeout(resolveExit, 5_000).unref?.();
  });
  await exitPromise;
  if (!hasExited(child)) {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
    // Brief grace so the kernel releases the port; a 100 ms sleep
    // is the documented race-free window for Node's child.kill
    // on a SIGKILL'd POSIX process.
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** Convenience: build a per-run owned log path under `.e2e-logs/`.
 *  `tag` is the caller's label (e.g. "restart1" or "restart2"). */
export function ownedLogPath(tag: string, pid: number = process.pid): string {
  const hex = randomBytes(3).toString("hex");
  return resolve(REPO_ROOT, ".e2e-logs", `fera_rehearsal_${tag}_${pid}_${hex}.log`);
}
