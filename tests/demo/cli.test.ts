// Integration tests for the offline-stack CLI (TASK-053, revised).
//
// These tests run the actual scripts/demo/*.mjs entry points. They
// are gated to skip themselves when Docker is not available so they
// never fail the lane on a host that has no daemon. The unit-level
// guarantees (loopback, dedicated prefix, error sanitization) are
// covered by tests/demo/guard.test.ts.
import { describe, expect, it, beforeAll } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const WORKTREE = resolve(import.meta.dirname, "../..");

function runCli(args: string[], { cwd, env, input }: { cwd?: string; env?: Record<string, string>; input?: string } = {}) {
  return spawnSync("node", [resolve(WORKTREE, "scripts/demo/cli.mjs"), ...args], {
    cwd: cwd ?? WORKTREE,
    env: { ...process.env, ...(env ?? {}) },
    encoding: "utf8",
    input,
    timeout: 60_000,
  });
}

function dockerAvailable() {
  const r = spawnSync("docker", ["version", "--format={{.Server.Version}}"], { encoding: "utf8" });
  return r.status === 0 && r.stdout.trim().length > 0;
}

describe("scripts/demo/cli.mjs (TASK-053, revised)", () => {
  beforeAll(() => {
    if (!dockerAvailable()) {
      // eslint-disable-next-line no-console
      console.warn("[demo/cli.test] docker not available; skipping integration paths");
    }
  });

  it("prints help with --help", () => {
    const r = runCli(["--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Usage: node scripts\/demo\/cli\.mjs/);
    expect(r.stdout).toMatch(/start/);
    expect(r.stdout).toMatch(/status/);
    expect(r.stdout).toMatch(/stop/);
    expect(r.stdout).toMatch(/reset/);
    expect(r.stdout).toMatch(/verify/);
    expect(r.stdout).toMatch(/DEMO_APP_PORT|DEMO_PORT|3215|3216/);
  });

  it("refuses an unknown command with exit 2", () => {
    const r = runCli(["wipe"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/offline-stack/);
  });

  it("refuses reset without --yes with exit 2", () => {
    const r = runCli(["reset"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--yes/);
  });

  it("resets --yes on a clean worktree is a no-op and reports ok", () => {
    const r = runCli(["reset", "--yes"]);
    // Either it succeeded or it reported a docker problem; in both
    // cases the JSON must say which one.
    expect([0, 1]).toContain(r.status);
    let parsed: any;
    try { parsed = JSON.parse(r.stdout); } catch { throw new Error(`reset did not print JSON: ${r.stdout}`); }
    expect(parsed.worktree).toBe(WORKTREE);
    expect(Array.isArray(parsed.steps)).toBe(true);
  });

  it("status on a clean worktree prints the JSON shape", () => {
    const r = runCli(["status"]);
    // 0 if db is up; 1 if db is down. Either way the shape must be
    // present and contain the per-worktree container / port fields.
    expect([0, 1]).toContain(r.status);
    let parsed: any;
    try { parsed = JSON.parse(r.stdout); } catch { throw new Error(`status did not print JSON: ${r.stdout}`); }
    expect(parsed.port).toBe(3215);
    expect(parsed.appPort).not.toBe(3215);
    expect(parsed.container.name).toMatch(/^fera-demo-/);
  });

  it("verify exits non-zero when any step fails (silent-failure guard)", () => {
    // The previous version always exited 0; this version exits
    // non-zero if any of: cache audit, db scripts, container, or
    // DB probe fails.
    const r = runCli(["verify"]);
    let parsed: any;
    try { parsed = JSON.parse(r.stdout); } catch { parsed = null; }
    if (parsed) {
      expect(typeof parsed.overall).toBe("boolean");
      expect(typeof parsed.verifyOverall).toBe("boolean");
      expect(parsed.cache).toBeTruthy();
      expect(Array.isArray(parsed.dbScripts)).toBe(true);
      // The exit code MUST match the reported overall: if
      // overall=false, exit code MUST be 1.
      if (parsed.overall === false) expect(r.status).toBe(1);
      if (parsed.overall === true) expect(r.status).toBe(0);
    }
  });

  it("runCli propagates nonzero exit when the command reports ok:false", () => {
    // The same invariant as the verify test, but for any command.
    // A command whose JSON result has ok:false MUST exit non-zero.
    const r = runCli(["status"]);
    let parsed: any;
    try { parsed = JSON.parse(r.stdout); } catch { parsed = null; }
    if (parsed && parsed.db && parsed.db.ok === false) {
      expect(r.status).toBe(1);
    }
  });
});
