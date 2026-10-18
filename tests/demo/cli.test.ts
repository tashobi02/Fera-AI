// Integration tests for the offline-stack CLI (TASK-053, revised).
//
// These tests run the actual scripts/demo/*.mjs entry points against a
// fake `docker` on PATH that behaves like a reachable daemon on which
// none of this worktree's resources exist ("No such container /
// volume"), so every outcome below is deterministic and no real
// Docker or Postgres is touched. The unit-level guarantees (loopback,
// dedicated prefix, error sanitization) are covered by
// tests/demo/guard.test.ts; an unreachable daemon is covered by
// tests/demo/docker-unreachable.test.ts.
import { describe, expect, it, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const WORKTREE = resolve(import.meta.dirname, "../..");
const TEST_ROOT = mkdtempSync(join(tmpdir(), "fera-cli-test-"));
const FAKE_BIN = join(TEST_ROOT, "bin"); mkdirSync(FAKE_BIN);
writeFileSync(join(FAKE_BIN, "docker"), `#!${process.execPath}\nconst a=process.argv.slice(2);if(a[1]==='inspect'){process.stderr.write('Error: No such '+a[0]+': '+a[2]+'\\n');process.exit(1)}process.stderr.write('unexpected docker call\\n');process.exit(97);\n`, { mode: 0o700 });
afterAll(() => rmSync(TEST_ROOT, { recursive: true, force: true }));

type CliJson = {
  ok: boolean; worktree: string; steps: { step: string; ok?: boolean; skipped?: boolean }[];
  port: number; appPort: number; container: { name: string; status: string };
  overall: boolean; verifyOverall: boolean; cache: { status: string }; dbScripts: { ok: boolean }[]; db: { ok: boolean };
};

function runCli(args: string[], { cwd, env, input }: { cwd?: string; env?: Record<string, string>; input?: string } = {}) {
  return spawnSync("node", [resolve(WORKTREE, "scripts/demo/cli.mjs"), ...args], {
    cwd: cwd ?? TEST_ROOT,
    env: { ...process.env, ...(env ?? {}), PATH: FAKE_BIN + ":" + process.env.PATH },
    encoding: "utf8",
    input,
    timeout: 60_000,
  });
}

function parseJson(stdout: string, cmd: string): CliJson {
  try { return JSON.parse(stdout) as CliJson; } catch { throw new Error(`${cmd} did not print JSON: ${stdout}`); }
}

describe("scripts/demo/cli.mjs (TASK-053, revised)", () => {
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

  it("reset --yes on a clean worktree is a no-op, reports ok and exits 0", () => {
    const r = runCli(["reset", "--yes"]);
    expect(r.status, r.stderr).toBe(0);
    const parsed = parseJson(r.stdout, "reset");
    expect(parsed.ok).toBe(true);
    expect(parsed.worktree).toBe(TEST_ROOT);
    expect(parsed.steps).toEqual([
      expect.objectContaining({ step: "remove-container", skipped: true }),
      expect.objectContaining({ step: "remove-volume", skipped: true }),
      expect.objectContaining({ step: "remove-state", ok: true }),
    ]);
  });

  it("status on a clean worktree prints the JSON shape and exits 1 (nothing running)", () => {
    const r = runCli(["status"]);
    expect(r.status, r.stderr).toBe(1);
    const parsed = parseJson(r.stdout, "status");
    expect(parsed.ok).toBe(false);
    expect(parsed.db.ok).toBe(false);
    expect(parsed.port).toBe(3215);
    expect(parsed.appPort).toBe(3216);
    expect(parsed.container.name).toMatch(/^fera-demo-/);
    expect(parsed.container.status).toBe("missing");
  });

  it("verify exits non-zero when any step fails (silent-failure guard)", () => {
    // No model cache, no db scripts and no container in TEST_ROOT:
    // every step fails, so overall must be false and the exit 1.
    const r = runCli(["verify"], { env: { FERA_MODEL_CACHE: join(TEST_ROOT, "no-cache") } });
    expect(r.status, r.stderr).toBe(1);
    const parsed = parseJson(r.stdout, "verify");
    expect(parsed.overall).toBe(false);
    expect(parsed.verifyOverall).toBe(false);
    expect(parsed.cache.status).toBe("missing");
    expect(parsed.dbScripts.length).toBeGreaterThan(0);
    expect(parsed.dbScripts.every((s) => s.ok === false)).toBe(true);
    expect(parsed.db.ok).toBe(false);
  });

  it("propagates the command's ok flag to the exit code", () => {
    const failing = runCli(["status"]);
    expect(parseJson(failing.stdout, "status").ok).toBe(false);
    expect(failing.status).toBe(1);
    const passing = runCli(["stop"]);
    expect(parseJson(passing.stdout, "stop").ok).toBe(true);
    expect(passing.status).toBe(0);
  });
});
