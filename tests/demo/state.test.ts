// Unit tests for the offline-stack state file (TASK-053, revised).
// The state file lives at <worktree>/.demo/state.json and records
// pid, port, container, volume, network, DB name, model cache
// provenance, and the schema version. None of it is committed; nothing
// here writes outside the worktree-owned path.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEMO_PORT,
  PROVENANCE_SCHEMA_VERSION,
  containerNameFor,
  volumeNameFor,
} from "../../scripts/demo/lib/guard.mjs";
import {
  createState,
  loadState,
  removeState,
  saveState,
  writeProvenance,
} from "../../scripts/demo/lib/state.mjs";

let workdir = "";
let statePath = "";
beforeEach(() => {
  // We use a fake "worktree" so the state helpers, which anchor their
  // state file under .demo/state.json, write to a throwaway path.
  workdir = mkdtempSync(join(tmpdir(), "fera-offline-state-"));
  statePath = join(workdir, ".demo", "state.json");
});
afterEach(() => {
  rmSync(workdir, { recursive: true, force: true });
});

describe("createState (TASK-053, revised)", () => {
  it("captures pid, port, container, volume, DB name and marks the schema version", () => {
    const s = createState({
      pid: 4242,
      port: DEMO_PORT,
      container: containerNameFor(workdir),
      volume: volumeNameFor(workdir),
      database: "fera_demo_premain_x",
      cache: { status: "ok", expected: 4, present: 4, missing: [], tampered: [] },
    });
    expect(s.pid).toBe(4242);
    expect(s.port).toBe(DEMO_PORT);
    expect(s.container).toBe(containerNameFor(workdir));
    expect(s.volume).toBe(volumeNameFor(workdir));
    expect(s.database).toBe("fera_demo_premain_x");
    expect(s.cache.status).toBe("ok");
    expect(s.schemaVersion).toBe(PROVENANCE_SCHEMA_VERSION);
    expect(typeof s.startedAt).toBe("string");
    // No secret in the state shape.
    expect(JSON.stringify(s)).not.toMatch(/password|secret|api[_-]?key|token/i);
  });

  it("rejects a state without a volume field (volume is required for ownership)", () => {
    expect(() =>
      // @ts-expect-error -- deliberately malformed runtime input lacks volume.
      createState({
        pid: 1,
        port: DEMO_PORT,
        container: containerNameFor(workdir),
        database: "fera_demo_premain_x",
        cache: { status: "ok", expected: 0, present: 0, missing: [], tampered: [] },
      }),
    ).toThrow(/volume is required/);
  });

  it("masks the appUrl so the password never reaches disk", () => {
    const s = createState({
      pid: 1,
      port: DEMO_PORT,
      container: containerNameFor(workdir),
      volume: volumeNameFor(workdir),
      database: "fera_demo_premain_x",
      cache: { status: "ok", expected: 0, present: 0, missing: [], tampered: [] },
      appUrl: "postgresql://fera_app:s3cret@127.0.0.1:3215/fera_demo_premain_x",
    });
    expect(s.appUrl).not.toContain("s3cret");
    expect(s.appUrl).toContain("***");
  });
});

describe("saveState + loadState (TASK-053, revised)", () => {
  it("round-trips through the worktree-owned state path", () => {
    const s = createState({
      pid: 1234,
      port: DEMO_PORT,
      container: containerNameFor(workdir),
      volume: volumeNameFor(workdir),
      database: "fera_demo_premain_42",
      cache: { status: "ok", expected: 4, present: 4, missing: [], tampered: [] },
    });
    saveState(s, { statePath, worktreeRoot: workdir });
    expect(existsSync(statePath)).toBe(true);
    const loaded = loadState({ statePath, worktreeRoot: workdir });
    expect(loaded).toEqual(s);
  });

  it("returns null when the file is absent (idempotent start)", () => {
    expect(loadState({ statePath, worktreeRoot: workdir })).toBeNull();
  });

  it("refuses a state file that does not match the expected schema version", () => {
    mkdirSync(join(workdir, ".demo"), { recursive: true });
    writeFileSync(statePath, JSON.stringify({ schemaVersion: "bogus-9", pid: 1, port: 3215, container: containerNameFor(workdir), volume: volumeNameFor(workdir), database: "y", startedAt: "2026-10-18T00:00:00Z" }));
    expect(() => loadState({ statePath, worktreeRoot: workdir })).toThrow(/schema version/);
  });

  it("refuses a state file whose DB name is not this lane's dedicated loopback DB", () => {
    mkdirSync(join(workdir, ".demo"), { recursive: true });
    writeFileSync(statePath, JSON.stringify({ schemaVersion: PROVENANCE_SCHEMA_VERSION, pid: 1, port: 3215, container: containerNameFor(workdir), volume: volumeNameFor(workdir), database: "fera", startedAt: "2026-10-18T00:00:00Z" }));
    expect(() => loadState({ statePath, worktreeRoot: workdir })).toThrow(/offline-stack|not owned|refuses/);
  });

  it("refuses a state file whose container belongs to another worktree (per-worktree ownership)", () => {
    mkdirSync(join(workdir, ".demo"), { recursive: true });
    writeFileSync(statePath, JSON.stringify({
      schemaVersion: PROVENANCE_SCHEMA_VERSION,
      pid: 1, port: 3215,
      container: "fera-demo-otherowner-pg",
      volume: volumeNameFor(workdir),
      database: "fera_demo_premain_x",
      startedAt: "2026-10-18T00:00:00Z",
    }));
    expect(() => loadState({ statePath, worktreeRoot: workdir })).toThrow(/not owned by this worktree/);
  });
});

describe("writeProvenance (TASK-053, revised)", () => {
  it("writes a machine- and human-readable provenance file under .demo/ with masked URLs", () => {
    const s = createState({
      pid: 1,
      port: DEMO_PORT,
      container: containerNameFor(workdir),
      volume: volumeNameFor(workdir),
      database: "fera_demo_premain_p",
      cache: { status: "ok", expected: 4, present: 4, missing: [], tampered: [] },
      appUrl: "postgresql://fera_app:s3cret@127.0.0.1:3215/fera_demo_premain_p",
    });
    const mdPath = writeProvenance(s, { dir: join(workdir, ".demo"), worktreeRoot: workdir });
    expect(existsSync(mdPath)).toBe(true);
    const text = readFileSync(mdPath, "utf8");
    expect(text).toMatch(/Fera offline-stack provenance/);
    expect(text).toMatch(/fera_demo_premain_p/);
    expect(text).toMatch(new RegExp(String(DEMO_PORT)));
    expect(text).toMatch(/cache: ok/);
    expect(text).not.toMatch(/s3cret/);
    expect(text).toMatch(/App port: \d+/);
    expect(text).not.toMatch(/password|secret|api[_-]?key/i);
  });
});

describe("removeState (TASK-053, revised)", () => {
  it("deletes the state file when it exists and is a no-op when it does not", () => {
    const s = createState({
      pid: 1,
      port: DEMO_PORT,
      container: containerNameFor(workdir),
      volume: volumeNameFor(workdir),
      database: "fera_demo_premain_q",
      cache: { status: "ok", expected: 4, present: 4, missing: [], tampered: [] },
    });
    saveState(s, { statePath, worktreeRoot: workdir });
    expect(existsSync(statePath)).toBe(true);
    removeState({ statePath, worktreeRoot: workdir });
    expect(existsSync(statePath)).toBe(false);
    expect(() => removeState({ statePath, worktreeRoot: workdir })).not.toThrow();
  });
});
