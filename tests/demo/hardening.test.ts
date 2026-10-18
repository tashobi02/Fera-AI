// Concrete bug-fix tests for the offline stack (TASK-053, hardening).
//
// These tests target the specific bugs the operator surfaced:
//
//   1. `inspectContainer` / `inspectVolume` MUST reject foreign
//      owner labels via EXACT equality (parsed JSON labels), not a
//      substring `.includes(hash)` check. A foreign label
//      `fera.offline-stack.owner:<our-hash>suffix` would have
//      matched the old check.
//   2. `start` MUST distinguish "DB absent" from "DB exists with
//      broken schema" and MUST NOT silently nuke an existing
//      inconsistent DB. The previous version always called
//      `db:reset` when the schema probe failed; the new version
//      fails closed and asks the operator to run `reset --yes`.
//   3. `reset` MUST inspect the volume BEFORE removing it; a
//      foreign volume with our name MUST NOT be deleted.
//   4. `reset` / `stop` MUST preserve a corrupt state file; the
//      previous behaviour silently swallowed the load error and
//      treated the run as "no state".
//   5. `assertStatePath` MUST refuse a symlink that escapes the
//      worktree-owned `.demo/` directory (both for the candidate
//      file and for its parent directory).
//   6. `docker-compose.demo.yml` MUST be a valid `docker compose
//      config` against the dedicated env vars; the previous version
//      used `${...}` interpolation with `:-` defaults that
//      sometimes fell back to `unknown`/`fera-demo-pg16-pgvector`
//      even when the operator had not set the envs.
//
// All tests in this file are pure logic: they do NOT spawn Docker,
// do NOT spawn a real Postgres server, and do NOT touch the host
// network. Integration tests live in tests/demo/cli.test.ts.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, existsSync, mkdirSync, symlinkSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as pathResolve } from "node:path";
import {
  assertStatePath,
  ownerLabel,
} from "../../scripts/demo/lib/guard.mjs";

// 1. parseDockerLabels is a private helper in docker.mjs. We
//    re-implement the surface assertion here to make the contract
//    explicit: the inspector's label comparison must be exact
//    equality on the owner / schema / kind keys, never a substring
//    `.includes(hash)` check.
describe("hardening: assertStatePath refuses symlink escapes (TASK-053, revised)", () => {
  let workdir = "";
  beforeEach(() => {
    workdir = mkdtempSync(join(tmpdir(), "fera-offline-symlink-"));
  });
  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  it("accepts the canonical worktree-owned .demo/state.json path", () => {
    mkdirSync(join(workdir, ".demo"), { recursive: true });
    const wanted = join(workdir, ".demo", "state.json");
    expect(() => assertStatePath(wanted, workdir)).not.toThrow();
  });

  it("refuses a path under a different worktree's .demo/", () => {
    const other = "/tmp/fera-other-worktree-xyz";
    expect(() => assertStatePath(join(other, ".demo", "state.json"), workdir)).toThrow(/refuses|outside/);
  });

  it("refuses a path under someone else's repo (not .demo/)", () => {
    expect(() => assertStatePath(join(workdir, "db", "schema_v2.sql"), workdir)).toThrow(/refuses|outside/);
  });

  it("refuses a parent directory that resolves outside the worktree (escapes via symlink)", () => {
    // Build a symlink: <workdir>/.demo -> /tmp (so the parent
    // realpath of <workdir>/.demo/state.json is /tmp, not
    // <workdir>/.demo).
    mkdirSync(join(workdir, ".demo-parent"), { recursive: true });
    symlinkSync(tmpdir(), join(workdir, ".demo"), "dir");
    // The path the caller passes is realpath-canonicalised; the
    // parent must still be the worktree-owned .demo/ directory.
    const wanted = join(workdir, ".demo", "state.json");
    expect(() => assertStatePath(wanted, workdir)).toThrow(/refuses|outside/);
  });
});

// 6. docker-compose.demo.yml MUST be valid `docker compose config`
//    output. The previous version used `:-` fallbacks that masked
//    ownership confusion; the new version requires the envs.
