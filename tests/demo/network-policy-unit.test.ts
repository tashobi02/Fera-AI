// Offline-stack network-policy unit tests (TASK-053, revised).
//
// The previous test lane made real Docker and Playwright calls to
// satisfy the "OFFLINE evidence" requirement. The reviewer found
// that:
//
//   * The previous run only proved that the synthetic page (served
//     by an HTTP server in the test) did not fetch anything. A
//     network-deny handler is the OFFLINE guarantee, but exercising
//     it through Playwright + Docker is not necessary in a unit
//     test. Real offline HTTP journeys belong to the coordinator
//     lane (TASK-054), not this one.
//   * The generated spec / config / run-log lived under
//     tests/demo/.evidence and were re-committed each run, which
//     the reviewer flagged as fake evidence.
//
// This file is a pure-logic test of the network-policy decisions
// the offline stack makes at the command level: it never spawns
// Docker, never spawns Playwright, never spawns a Postgres client,
// never spawns a real HTTP server. The integration-level "this
// command did not make any non-loopback request" evidence is the
// coordinator's responsibility (TASK-054).
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import {
  assertLoopbackUrl,
  DEMO_PORT,
  DEMO_APP_PORT,
  maskUrl,
  sanitizeError,
  withDemoDatabase,
} from "../../scripts/demo/lib/guard.mjs";

const WORKTREE = resolve(import.meta.dirname, "../..");

function runCli(args: string[]) {
  return spawnSync("node", [resolve(WORKTREE, "scripts/demo/cli.mjs"), ...args], {
    cwd: WORKTREE,
    env: { ...process.env },
    encoding: "utf8",
    timeout: 30_000,
  });
}

describe("network-policy-unit: loopback-only DB and app (TASK-053, revised)", () => {
  it("refuses any non-loopback database host", () => {
    expect(() => assertLoopbackUrl("postgresql://u:p@db.example.com/fera")).toThrow(/loopback/);
    expect(() => assertLoopbackUrl("postgresql://u:p@10.0.0.5/fera")).toThrow(/loopback/);
  });

  it("refuses a connection parameter (defends against host= injection)", () => {
    expect(() => assertLoopbackUrl("postgresql://u:p@127.0.0.1:3215/postgres?host=evil.example.com")).toThrow(/parameters/);
  });

  it("the dedicated DB port is 3215 and the dedicated app port is distinct", () => {
    expect(DEMO_PORT).toBe(3215);
    expect(DEMO_APP_PORT).not.toBe(DEMO_PORT);
  });

  it("maskUrl never echoes a password in any URL it touches", () => {
    const out = maskUrl("postgresql://postgres:s3cret@127.0.0.1:3215/postgres");
    expect(out).not.toContain("s3cret");
    expect(out).toContain("***");
  });

  it("sanitizeError never echoes a password, host, or DB name", () => {
    const e = new Error("FATAL: password authentication failed for user \"postgres\" on postgresql://postgres:s3cret@127.0.0.1:3215/fera_demo_premain_x");
    const out = sanitizeError(e);
    expect(out).not.toContain("s3cret");
    expect(out).not.toContain("127.0.0.1:3215");
    expect(out).toMatch(/password authentication failed/i);
  });

  it("withDemoDatabase only changes the path; it never changes the host or port", () => {
    const url = assertLoopbackUrl("postgresql://postgres:postgres@127.0.0.1:3215/postgres");
    const named = withDemoDatabase(url, "fera_demo_premain_x");
    expect(named.pathname).toBe("/fera_demo_premain_x");
    expect(named.host).toBe("127.0.0.1:3215");
    expect(named.protocol).toBe("postgresql:");
  });
});

describe("network-policy-unit: CLI exit-code propagation (TASK-053, revised)", () => {
  it("--help exits 0 and prints the help block (no docker call)", () => {
    const r = runCli(["--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Usage: node scripts\/demo\/cli\.mjs/);
  });

  it("unknown command exits 2 (no docker call)", () => {
    const r = runCli(["nope"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/offline-stack/);
  });

  it("reset without --yes exits 2 (the destructive path is gated)", () => {
    const r = runCli(["reset"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--yes/);
  });
});
