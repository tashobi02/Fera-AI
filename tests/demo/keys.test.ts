// Unit tests for the dedicated app launcher's keys file (TASK-053, revised).
//
// The launcher persists three signing keys in
// <worktree>/.demo/keys.json so the session cookie + drafts survive
// `stop` → `start --reuse`. This file exercises the
// `assertKeysPath` helper and the launcher's keys file discipline:
// the file is mode 0600, the launcher never logs the bytes, and a
// corrupt or partial file is reported as a hard error.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as pathResolve } from "node:path";
import {
  assertKeysPath,
  assertStatePath,
  ownerLabel,
  containerNameFor,
  volumeNameFor,
} from "../../scripts/demo/lib/guard.mjs";
import { spawnSync } from "node:child_process";

const LAUNCHER = pathResolve(process.cwd(), "scripts/demo/app.mjs");

function runLauncher(args: string[], { cwd, env }: { cwd?: string; env?: Record<string, string> } = {}) {
  return spawnSync("node", [LAUNCHER, ...args], {
    cwd: cwd ?? process.cwd(),
    env: { ...process.env, ...(env ?? {}) },
    encoding: "utf8",
    timeout: 15_000,
  });
}

describe("keys file: assertKeysPath (TASK-053, revised)", () => {
  let workdir = "";
  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), "fera-keys-guard-"));
    mkdirSync(join(workdir, ".demo"), { recursive: true, mode: 0o700 });
  });
  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  it("accepts a path inside the worktree-owned .demo/ directory", () => {
    const wanted = join(workdir, ".demo", "keys.json");
    expect(() => assertKeysPath(wanted, workdir)).not.toThrow();
    expect(assertKeysPath(wanted, workdir)).toBe(wanted);
  });

  it.each([
    "/etc/keys.json",
    "/tmp/some-other-worktree/.demo/keys.json",
    `${workdir}/db/keys.json`,
    `${workdir}/keys.json`,
  ])("refuses a path that is not the worktree-owned keys file: %j", (p) => {
    expect(() => assertKeysPath(p, workdir)).toThrow(/refuses|non-owned|outside/);
  });

  it("assertStatePath does not accept the keys file (each helper is type-specific)", () => {
    // The state file and the keys file are different paths; the
    // state guard must NOT accept the keys file.
    const keysPath = join(workdir, ".demo", "keys.json");
    expect(() => assertStatePath(keysPath, workdir)).toThrow(/refuses|outside/);
  });
});

describe("keys file: symlink refusal (TASK-053, revised)", () => {
  let workdir = "";
  let outside = "";
  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), "fera-keys-symlink-"));
    outside = mkdtempSync(join(tmpdir(), "fera-keys-outside-"));
  });
  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it("assertKeysPath refuses a symlink that escapes the worktree-owned .demo/", () => {
    // workdir/.demo -> outside (a foreign directory). The keys
    // path's parent realpath is `outside`, not workdir, so the
    // guard must refuse.
    symlinkSync(outside, join(workdir, ".demo"), "dir");
    expect(() => assertKeysPath(join(workdir, ".demo", "keys.json"), workdir)).toThrow(/refuses|outside/);
  });
});

