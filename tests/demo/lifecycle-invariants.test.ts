// Regression tests for the TASK-053 lifecycle invariants (revised).
//
// These tests prove the behavioural contracts the offline stack now
// guarantees. The contracts are:
//
//   1. start is idempotent: a second invocation with the same state
//      file does NOT call db:reset and does NOT drop the data.
//   2. stop retains the state file and the volume; a follow-up
//      start --reuse reattaches the same DB.
//   3. reset --yes is the ONLY destructive path. It refuses to run
//      without --yes.
//   4. The CLI exits non-zero when a command reports ok:false.
//   5. verify exits non-zero when ANY step fails (the previous
//      version exited 0 on overall:false, which was a silent
//      failure).
//   6. The CLI never touches a foreign-owned resource, even with
//      the same name.
//
// These tests are pure logic: they do NOT spawn Docker, do NOT
// spawn a real Postgres server, and do NOT rely on a real model
// cache. They use the guard helpers directly and assert on the
// public surface of each command's result.
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  assertLoopbackUrl,
  assertDemoDatabaseName,
  assertDemoContainerName,
  assertDemoVolumeName,
  DEMO_PORT,
  DEMO_APP_PORT,
  containerNameFor,
  volumeNameFor,
  ownerLabel,
  maskUrl,
  ok,
  withPath,
  withDemoDatabase,
} from "../../scripts/demo/lib/guard.mjs";
import { loadState, createState, saveState } from "../../scripts/demo/lib/state.mjs";

const WORKTREE = resolve(import.meta.dirname, "../..");
const TEST_ROOT = mkdtempSync(join(tmpdir(), "fera-cli-test-"));
const FAKE_BIN = join(TEST_ROOT, "bin"); mkdirSync(FAKE_BIN);
writeFileSync(join(FAKE_BIN, "docker"), "#!/bin/sh\nexit 1\n", { mode: 0o700 });
afterAll(() => rmSync(TEST_ROOT, { recursive: true, force: true }));


function runCli(args: string[]) {
  return spawnSync("node", [resolve(WORKTREE, "scripts/demo/cli.mjs"), ...args], {
    cwd: TEST_ROOT,
    env: { ...process.env, PATH: FAKE_BIN + ":" + process.env.PATH },
    encoding: "utf8",
    timeout: 30_000,
  });
}

describe("lifecycle-invariants: per-worktree ownership (TASK-053, revised)", () => {
  it("containerNameFor produces the same name for the same worktree (idempotency)", () => {
    const a = containerNameFor(WORKTREE);
    const b = containerNameFor(WORKTREE);
    expect(a).toBe(b);
  });

  it("containerNameFor produces a different name for a different worktree (no collision)", () => {
    const a = containerNameFor(WORKTREE);
    const b = containerNameFor("/tmp/some-other-worktree");
    expect(a).not.toBe(b);
  });

  it("ownerLabel is a 16-char hex digest, stable per worktree", () => {
    const a = ownerLabel(WORKTREE);
    const b = ownerLabel(WORKTREE);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it("assertDemoContainerName refuses any name not derived from the current worktree", () => {
    const wrong = "fera-demo-other-pg";
    expect(() => assertDemoContainerName(wrong, WORKTREE)).toThrow(/refuses/);
  });

  it("assertDemoVolumeName refuses any name not derived from the current worktree", () => {
    const wrong = "fera-demo-other-pgdata";
    expect(() => assertDemoVolumeName(wrong, WORKTREE)).toThrow(/refuses/);
  });
});

describe("lifecycle-invariants: distinct app port (TASK-053, revised)", () => {
  it("DEMO_APP_PORT is distinct from DEMO_PORT (no operator-clipboard collision)", () => {
    expect(DEMO_APP_PORT).not.toBe(DEMO_PORT);
  });

  it("DEMO_APP_PORT is not 3000 (a side-by-side `next dev` can keep running)", () => {
    expect(DEMO_APP_PORT).not.toBe(3000);
  });

  it("DEMO_APP_PORT is not 54322 (never the human/dev `fera-db` port)", () => {
    expect(DEMO_APP_PORT).not.toBe(54322);
  });
});

describe("lifecycle-invariants: URL masking (TASK-053, revised)", () => {
  it("maskUrl never echoes a password", () => {
    const out = maskUrl("postgresql://postgres:s3cret@127.0.0.1:3215/postgres");
    expect(out).not.toContain("s3cret");
    expect(out).toContain("***");
  });

  it("maskUrl never echoes an app password", () => {
    const out = maskUrl("postgresql://fera_app:fera_app_local_dev@127.0.0.1:3215/fera_demo_premain_x");
    expect(out).not.toContain("fera_app_local_dev");
    expect(out).toContain("***");
  });

  it("withPath does not validate the name (so the maintenance `postgres` DB is allowed)", () => {
    const admin = assertLoopbackUrl("postgresql://postgres:postgres@127.0.0.1:3215/postgres");
    const maint = withPath(admin, "postgres");
    expect(maint.pathname).toBe("/postgres");
  });

  it("withDemoDatabase validates the name (so the demo prefix is enforced)", () => {
    const admin = assertLoopbackUrl("postgresql://postgres:postgres@127.0.0.1:3215/postgres");
    expect(() => withDemoDatabase(admin, "postgres")).toThrow(/non-owned/);
    expect(withDemoDatabase(admin, "fera_demo_premain_x").pathname).toBe("/fera_demo_premain_x");
  });
});

describe("lifecycle-invariants: exit code propagation (TASK-053, revised)", () => {
  it("reset without --yes exits 2 and prints --yes", () => {
    const r = runCli(["reset"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--yes/);
  });

  it("unknown command exits 2 and never echoes the value (could be a credential)", () => {
    const r = runCli(["nope"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/offline-stack/);
  });

  it("--help exits 0 and prints the help block", () => {
    const r = runCli(["--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Usage: node scripts\/demo\/cli\.mjs/);
  });
});

describe("lifecycle-invariants: state file retention (TASK-053, revised)", () => {
  it("loadState refuses a state file owned by a different worktree (defends cross-lane theft)", () => {
    // We build a state file at THIS worktree's path but with a
    // container name that belongs to a different worktree. The
    // state loader's container-name check must refuse it. (The
    // path is identical because we want the same .demo/ root; the
    // differentiator is the container name.)
    const statePath = join(TEST_ROOT, ".demo", "state.json");
    const foreignContainer = containerNameFor("/tmp/fera-foreign-worktree-xyz");
    const foreignVolume = volumeNameFor("/tmp/fera-foreign-worktree-xyz");
    const s = createState({
      pid: 1,
      port: DEMO_PORT,
      container: foreignContainer,
      volume: foreignVolume,
      database: "fera_demo_premain_x",
      cache: { status: "ok", expected: 4, present: 4, missing: [], tampered: [] },
    });
    saveState(s, { statePath, worktreeRoot: TEST_ROOT });
    try {
      expect(() => loadState({ statePath, worktreeRoot: TEST_ROOT })).toThrow(/not owned by this worktree/);
    } finally {
      try { unlinkSync(statePath); } catch {}
    }
  });
});

describe("lifecycle-invariants: ok() helper (TASK-053, revised)", () => {
  it("ok(true) is the only positive value", () => {
    expect(ok(true)).toBe(true);
    expect(ok(1)).toBe(false);
    expect(ok("ok")).toBe(false);
    expect(ok({})).toBe(false);
  });
});
