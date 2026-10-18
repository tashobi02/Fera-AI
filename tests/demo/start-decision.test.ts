// Unit tests for the offline-stack `start` DB decision (TASK-053).
//
// `prepareDatabase` takes injectable DB steps, so these tests stub the
// psql probes with an in-memory fake: no Docker, no Postgres. The
// regression they pin: a seed that throws after the schema reset
// leaves a DB that exists but has no seed-complete marker, and the
// next `start` must refuse it instead of reporting "recovered".
import { afterAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
// @ts-expect-error -- plain ESM script without type declarations
import { prepareDatabase } from "../../scripts/demo/start.mjs";

const DB = "fera_demo_premain_abc123";

type Kind = { kind: string; stderr?: string };

// In-memory stand-in for the dedicated server. `seedFails` makes the
// seed step throw after db:reset created the DB.
function fakeServer({ seedFails = false, existsAtStart = false, markerAtStart = false } = {}) {
  const db = { exists: existsAtStart, marker: markerAtStart };
  const calls: string[] = [];
  const steps = {
    dbExists: async (): Promise<Kind> => { calls.push("dbExists"); return { kind: db.exists ? "exists" : "absent" }; },
    dbIsUsable: async (): Promise<Kind> => { calls.push("dbIsUsable"); return { kind: db.marker ? "usable" : "seed-incomplete" }; },
    ensureFreshDb: async () => { calls.push("ensureFreshDb"); db.exists = true; },
    seedDataset: async () => {
      calls.push("seedDataset");
      if (seedFails) throw new Error("offline-stack: seed --set demo failed: exit 1");
    },
    markSeedComplete: async () => { calls.push("markSeedComplete"); db.marker = true; },
  };
  return { db, calls, steps };
}

describe("prepareDatabase (TASK-053, seed completeness)", () => {
  it("seeds an absent DB and stamps the marker as the LAST step", async () => {
    const s = fakeServer();
    await expect(prepareDatabase({ dbName: DB, env: {}, existingDatabase: undefined }, s.steps)).resolves.toBe("fresh");
    expect(s.calls).toEqual(["dbExists", "ensureFreshDb", "seedDataset", "markSeedComplete"]);
    expect(s.db.marker).toBe(true);
  });

  it("does not stamp the marker when the seed throws", async () => {
    const s = fakeServer({ seedFails: true });
    await expect(prepareDatabase({ dbName: DB, env: {} }, s.steps)).rejects.toThrow(/seed --set demo failed/);
    expect(s.calls).not.toContain("markSeedComplete");
    expect(s.db).toEqual({ exists: true, marker: false });
  });

  it("refuses the half-seeded DB on the next start instead of 'recovered'", async () => {
    const s = fakeServer({ seedFails: true });
    await expect(prepareDatabase({ dbName: DB, env: {} }, s.steps)).rejects.toThrow();
    s.calls.length = 0;
    await expect(prepareDatabase({ dbName: DB, env: {}, existingDatabase: undefined }, s.steps))
      .rejects.toThrow(/seed did not complete[\s\S]*reset --yes/);
    // Fail closed: no reset, no re-seed, no marker on the refused DB.
    expect(s.calls).toEqual(["dbExists", "dbIsUsable"]);
    expect(s.db.marker).toBe(false);
  });

  it("refuses a half-seeded DB even when the state file names it", async () => {
    const s = fakeServer({ existsAtStart: true, markerAtStart: false });
    await expect(prepareDatabase({ dbName: DB, env: {}, existingDatabase: DB }, s.steps)).rejects.toThrow(/seed did not complete/);
  });

  it("reuses a fully seeded DB named by the state file without touching it", async () => {
    const s = fakeServer({ existsAtStart: true, markerAtStart: true });
    await expect(prepareDatabase({ dbName: DB, env: {}, existingDatabase: DB }, s.steps)).resolves.toBe("reused");
    expect(s.calls).toEqual(["dbExists", "dbIsUsable"]);
  });

  it("reports 'recovered' only for a fully seeded DB with no matching state file", async () => {
    const s = fakeServer({ existsAtStart: true, markerAtStart: true });
    await expect(prepareDatabase({ dbName: DB, env: {}, existingDatabase: undefined }, s.steps)).resolves.toBe("recovered");
    expect(s.calls).toEqual(["dbExists", "dbIsUsable"]);
  });

  it.each([
    ["existence", { dbExists: async () => ({ kind: "probe-error", stderr: "connection refused" }) }, /existence probe failed/],
    ["seed", { dbExists: async () => ({ kind: "exists" }), dbIsUsable: async () => ({ kind: "probe-error", stderr: "timeout" }) }, /seed probe failed/],
  ])("fails closed on a %s probe error without mutating", async (_name, override, message) => {
    const s = fakeServer();
    await expect(prepareDatabase({ dbName: DB, env: {} }, { ...s.steps, ...override })).rejects.toThrow(message);
    expect(s.calls).not.toContain("ensureFreshDb");
    expect(s.calls).not.toContain("seedDataset");
  });
});

describe("start --fresh (TASK-053)", () => {
  const root = mkdtempSync(join(tmpdir(), "fera-start-fresh-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("is rejected before any docker call", () => {
    const log = join(root, "docker-calls.log");
    writeFileSync(join(root, "docker"), `#!${process.execPath}\nrequire('fs').appendFileSync(process.env.FERA_FAKE_DOCKER_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');process.exit(0);\n`, { mode: 0o700 });
    const r = spawnSync(process.execPath, [resolve("scripts/demo/cli.mjs"), "start", "--fresh"], {
      cwd: root,
      env: { ...process.env, PATH: root + ":" + process.env.PATH, FERA_FAKE_DOCKER_LOG: log },
      encoding: "utf8",
      timeout: 10_000,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/--fresh is not accepted/);
    expect(existsSync(log)).toBe(false);
    expect(existsSync(join(root, ".demo"))).toBe(false);
  });
});
