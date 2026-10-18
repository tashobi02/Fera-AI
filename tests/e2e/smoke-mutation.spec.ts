// P3-finish: exercises scripts/smoke.mjs (strict-MOCK, loopback-only mutation)
// against the running e2e server. The CLI is the source of truth for the
// synthetic-only health + parent submit + idempotent replay + owner read +
// status read sequence.
//
// Safety contract (mirrors scripts/smoke.mjs):
//   - CLI is invoked with the real Playwright baseURL as positional <base-url>
//     so the script hits 127.0.0.1:<FERA_E2E_PORT> (3100) and not its
//     127.0.0.1:3000 default. The baseURL hostname is re-validated against
//     the loopback guard so a non-loopback config can never reach the CLI.
//   - execFile is used (no shell); no env/provider/network secrets can be
//     interpolated, and process.env is never echoed.
//   - We assert exit code 0 only (execFile rejects on non-zero) and that
//     stdout contains no "fail" and no "skipped" tokens, plus the
//     synthetic-submit line carries the [passed] tag.
//   - Before the CLI runs, the project ownerClient + seedReferenceDistrict
//     helpers (tests/e2e/support/fixtures.ts) are used to load the full
//     reference district set so the MOCK submit's district_code=26 lookup
//     resolves against the real fixture.
//
// D2A API-019, D6 TASK-042, P3-301.
import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { e2eDatabaseUrl } from "./support/db";
import { ownerClient, seedReferenceDistrict } from "./support/fixtures";

const execFileAsync = promisify(execFile);

// Playwright's TypeScript transform compiles this spec as CommonJS, so
// `import.meta` is unavailable. `__dirname` is the CJS shim for the current
// spec directory and is what Playwright's test loader exposes.
declare const __dirname: string;
const REPO_ROOT = resolve(__dirname, "..", "..");
const SMOKE_PATH = resolve(REPO_ROOT, "scripts", "smoke.mjs");
const SMOKE_TIMEOUT_MS = 30_000;
// Real CLI prints one fixed short line per check (4 lines max: health,
// home-badge, sign-in-form, synthetic-submit). Anything beyond this is
// treated as a violation.
const MAX_STDOUT_BYTES = 4096;

test.describe("smoke-mutation (CLI)", () => {
  test("real CLI exits 0 with no fail/skipped lines", async ({ baseURL }) => {
    // Re-validate the real baseURL against the loopback guard before handing
    // it to the mutating CLI; a non-loopback config can never reach smoke.
    const dbUrl = e2eDatabaseUrl();
    if (
      dbUrl.hostname !== "127.0.0.1" &&
      dbUrl.hostname !== "localhost" &&
      dbUrl.hostname !== "::1"
    ) {
      throw new Error(`test:e2e refuses non-loopback host: ${dbUrl.hostname}`);
    }
    if (!baseURL) throw new Error("smoke CLI requires a configured Playwright baseURL");
    const target = new URL(baseURL);
    if (
      target.hostname !== "127.0.0.1" &&
      target.hostname !== "localhost" &&
      target.hostname !== "::1"
    ) {
      throw new Error(`smoke CLI baseURL must be loopback: ${target.hostname}`);
    }
    if (!existsSync(SMOKE_PATH)) {
      throw new Error(`smoke CLI not found at ${SMOKE_PATH}`);
    }

    // Seed every reference district from data/districts.json via the project's
    // shared ownerClient + seedReferenceDistrict helpers. seedReferenceDistrict
    // is ON CONFLICT DO NOTHING and is idempotent across re-runs.
    const admin = await ownerClient();
    try {
      await seedReferenceDistrict(admin);
    } finally {
      await admin.end();
    }

    // argv: <base-url> is positional; --synthetic-submit and --with-status
    // follow. Passing the real baseURL here is what makes the CLI hit the
    // e2e server on FERA_E2E_PORT instead of its 127.0.0.1:3000 default.
    const SMOKE_ARGV = [
      SMOKE_PATH,
      target.origin,
      "--synthetic-submit",
      "--with-status",
    ];
    let stdout = "";
    try {
      const result = await execFileAsync(process.execPath, SMOKE_ARGV, {
        cwd: REPO_ROOT,
        timeout: SMOKE_TIMEOUT_MS,
        maxBuffer: MAX_STDOUT_BYTES,
        windowsHide: true,
      });
      stdout = result.stdout;
    } catch (err) {
      // execFile rejects on non-zero exit or timeout. Surface only the fixed
      // short reason strings the CLI is allowed to emit. We never echo the
      // raw stderr or stdout payload here.
      const e = err as { code?: string | number; killed?: boolean };
      throw new Error(
        `smoke CLI did not exit 0 (code=${String(e.code)} killed=${Boolean(
          e.killed,
        )})`,
      );
    }

    const expectedChecks = [
      "health:",
      "home-badge:",
      "sign-in-form:",
      "synthetic-submit:",
    ];
    for (const prefix of expectedChecks) {
      expect(
        stdout.includes(prefix),
        `expected CLI stdout to include "${prefix}" line`,
      ).toBe(true);
    }

    // No "fail" and no "skipped" lines anywhere in stdout.
    const lines = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of lines) {
      expect(
        /\bfail\b/i.test(line),
        `CLI stdout contained a fail line: ${line}`,
      ).toBe(false);
      expect(
        /\bskipped\b/i.test(line),
        `CLI stdout contained a skipped line: ${line}`,
      ).toBe(false);
    }

    // The synthetic-submit line must carry the [passed] tag. The CLI emits
    // "[passed] ok (mutated, read back)" for the mutation step when
    // --synthetic-submit is set.
    const synthLine = lines.find((l) => l.startsWith("synthetic-submit:"));
    expect(
      synthLine && /\[passed\]/.test(synthLine),
      `synthetic-submit line missing [passed] tag: ${String(synthLine)}`,
    ).toBe(true);
  });
});