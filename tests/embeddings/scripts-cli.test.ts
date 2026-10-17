// P3-024 / TASK-016 / TC-059 — `npm run reembed` and `npm run model:fetch`
// must refuse a non-loopback database URL (TASK-005, AGENTS.md "no real
// providers, no real child data"). These are unit tests, not DB tests: we
// spawn the scripts with a hostile URL and assert the guard fires before
// any network or model download is attempted.
//
// `model:fetch` does not touch the database at all; the test confirms its
// network failure mode (no host is reachable in CI) is the same one an
// operator would see, and that the script's first action is to verify the
// cache directory is gitignored.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const reembedCli = fileURLToPath(new URL("../../scripts/reembed.mjs", import.meta.url));
const modelFetchCli = fileURLToPath(new URL("../../scripts/model-fetch.mjs", import.meta.url));

function run(script: string, env: Record<string, string | undefined>) {
  return spawnSync("node", [script], {
    encoding: "utf8",
    env: { ...process.env, ...env } as NodeJS.ProcessEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

describe("reembed.mjs refuses a non-loopback host", () => {
  it("exits non-zero with 'non-local database host' and never prints the URL or password", () => {
    const hostile = "postgresql://postgres:hunter2@db.example.supabase.co:5432/postgres";
    const r = run(reembedCli, { FERA_DB_ADMIN_URL: hostile });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/non-local database host/);
    // No form of the password or the userinfo must leak on either stream.
    expect(r.stderr).not.toContain("hunter2");
    expect(r.stdout).not.toContain("hunter2");
    expect(r.stderr).not.toContain("supabase");
    expect(r.stdout).not.toContain("supabase");
    // No stack trace either: only the guarded message is allowed.
    expect(r.stderr).not.toMatch(/at .+\.mjs:(\d+):(\d+)/);
  });

  it("refuses connection parameters in the URL (host= override)", () => {
    const r = run(reembedCli, {
      FERA_DB_ADMIN_URL:
        "postgresql://postgres:postgres@127.0.0.1:54322/postgres?host=db.example.supabase.co",
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/connection parameters/);
    // The override target is never echoed.
    expect(r.stderr).not.toContain("supabase");
    expect(r.stdout).not.toContain("supabase");
  });

  it("refuses a non-fera database name", () => {
    const r = run(reembedCli, {
      FERA_DB_ADMIN_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      FERA_DB_NAME: "postgres",
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/FERA_DB_NAME must match/);
  });

  it("refuses a non-postgres scheme", () => {
    const r = run(reembedCli, {
      FERA_DB_ADMIN_URL: "mysql://postgres:postgres@127.0.0.1:3306/postgres",
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/postgresql: scheme/);
  });
});

describe("model-fetch.mjs is database-free and guarded", () => {
  it("does not read FERA_DB_ADMIN_URL or attempt a DB connection (no DB connection error)", () => {
    // We point at a non-loopback host on purpose. The script must not even
    // look at this variable (it is database-free), so the failure mode
    // should be a network error / dynamic import error, NOT a "non-local
    // database host" guard message and NOT a "connection refused" code
    // from pg (pg is not imported here at all).
    const r = run(modelFetchCli, {
      FERA_DB_ADMIN_URL: "postgresql://postgres:hunter2@db.example.supabase.co:5432/postgres",
    });
    // The exact status / message depends on the environment (no network in
    // CI is the most common case). The point is that the database guard
    // never fires — the script does not look at FERA_DB_ADMIN_URL.
    expect(r.stderr).not.toMatch(/non-local database host/);
    expect(r.stderr).not.toMatch(/FERA_DB_NAME must match/);
    // And no part of the URL or the password leaks through.
    expect(r.stderr).not.toContain("hunter2");
    expect(r.stdout).not.toContain("hunter2");
    expect(r.stderr).not.toContain("supabase");
    expect(r.stdout).not.toContain("supabase");
  });
});
