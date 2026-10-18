// Pre-main test-journeys — offline Playwright config (P3-journey).
//
// Scope: a single, fully offline rehearsal of the Phase 4/5 journeys
// driven by `tests/rehearsal/full-journey-offline.spec.ts` and the
// AUTOMATED repeat runner (`scripts/rehearsal/run-automated-repeats.mjs`).
//
// Why this file exists separately from `playwright.config.ts`:
//   * Phase 4/5 rehearsal needs its own port (3225), its own dedicated
//     loopback DB (prefix `fera_e2e_premainjourney_<pid>`), and its own
//     per-run log path. The existing `playwright.config.ts` is owned by
//     Sadman (P3-014) and reused here only by reference for the DB
//     guard and a shared log wrapper, not modified.
//   * The rehearsal exercises a *single* Next.js instance per run
//     (webServer.reuseExistingServer = false, workers = 1) so the
//     offline network-allowlist assertion is deterministic: every
//     non-loopback request the browser attempts is recorded against
//     this run.
//
// DB / role guard reuse: `scripts/db/guard.mjs` is the same guard the
// existing webServer uses, exported for reuse so the prefix regex,
// admin-URL loopback check and `asUser`/owner connection helpers are
// pinned in one place.
//
// Network allowlist: the rehearsal spec records every URL the browser
// attempts through Playwright routing and aborts anything outside
// 127.0.0.1 / localhost / ::1. That covers browser-originated HTTP(S)
// only; it does not observe server-side egress, the Playwright
// `request` fixture, Node `fetch`, or WebSockets beyond routing.
// Service workers are blocked below so they cannot bypass routing.
//
// Synthetic-only / no provider calls: the wrapper sets DEMO_MODE=1
// (cache-only) and points FERA_MODEL_CACHE at the shared
// `phase3-finish/.cache/models/` tree so the embedder reads the
// pinned Xenova/multilingual-e5-small model from disk and never
// reaches for a paid provider.
//
// The wrapper does NOT touch .env*; secrets are read from the existing
// per-process env (AGENTS.md / CLAUDE.md / AMD-ENV-2). The wrapper
// requires a baseURL hostname of `127.0.0.1`, `localhost`, or `::1`;
// non-loopback bases are refused before any test runs.
import { defineConfig, devices } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import {
  DEFAULT_DATABASE_URL,
  assertLocalDatabaseUrl,
  // @ts-expect-error -- shared database guard is an untyped .mjs module.
} from "./scripts/db/guard.mjs";

const PORT = Number(process.env.FERA_REHEARSAL_PORT ?? 3225);
const BASE_URL = `http://127.0.0.1:${PORT}`;
// Single-DB-per-run prefix, no reset of any pre-existing human/demo/shared DB
// (the run is hermetic; if the DB name is already taken the reset step
// drops and re-creates it via the same guarded `db:reset` script the
// existing webServer uses).
const REHEARSAL_DB_NAME =
  process.env.FERA_REHEARSAL_DB_NAME ??
  `fera_e2e_premainjourney_${process.pid}_${randomBytes(3).toString("hex")}`;
// Hard prefix check matches the spec brief: every rehearsal DB starts
// with `fera_e2e_premainjourney_`, never anything else. The existing
// `assertDatabaseName` regex would accept it but the prefix is
// re-validated here so a future env override cannot accidentally point
// at a different schema.
if (!/^fera_e2e_premainjourney_[a-z0-9_]{1,32}$/.test(REHEARSAL_DB_NAME)) {
  throw new Error("rehearsal requires a dedicated fera_e2e_premainjourney_<run> database name");
}
const E2E_LOG_PATH =
  process.env.FERA_REHEARSAL_LOG_PATH ??
  join(process.cwd(), ".e2e-logs", `fera_rehearsal_${process.pid}_${randomBytes(3).toString("hex")}.log`);
process.env.FERA_REHEARSAL_LOG_PATH = E2E_LOG_PATH;

// Same loopback guard the existing webServer uses. Pinned locally so a
// tampering at import time is caught at config load, not at test time.
const adminUrl = assertLocalDatabaseUrl(
  process.env.FERA_DB_ADMIN_URL ?? DEFAULT_DATABASE_URL,
  "rehearsal admin",
);
const appUrl = assertLocalDatabaseUrl(
  process.env.FERA_REHEARSAL_DATABASE_URL ??
    `postgresql://fera_app:fera_app_local_dev@${adminUrl.hostname}:${adminUrl.port}/${REHEARSAL_DB_NAME}`,
  "rehearsal app",
);
if (
  appUrl.username !== "fera_app" ||
  decodeURIComponent(appUrl.pathname.slice(1)) !== REHEARSAL_DB_NAME ||
  appUrl.hostname !== adminUrl.hostname ||
  appUrl.port !== adminUrl.port
) {
  throw new Error("rehearsal app and admin URLs must target the same local server and dedicated database");
}
const REHEARSAL_DATABASE_URL = appUrl.href;
process.env.FERA_REHEARSAL_DB_NAME = REHEARSAL_DB_NAME;
process.env.FERA_REHEARSAL_DATABASE_URL = REHEARSAL_DATABASE_URL;

// Pinned offline model cache. The brief names the absolute path under
// `phase3-finish/.cache/models`; we read it through the same env the
// runtime embedder (`src/server/embeddings/model.ts`) honours. The
// `process.env.FERA_MODEL_CACHE` is consumed by `defaultCacheDir()` and
// overrides `.cache/models` for both the matcher and the audit-side
// embedder so the rehearsal never reads a different cache.
const PHASE3_MODEL_CACHE = resolve(process.cwd(), ".cache/models");
if (process.env.FERA_MODEL_CACHE === undefined) {
  process.env.FERA_MODEL_CACHE = PHASE3_MODEL_CACHE;
}

export default defineConfig({
  testDir: "./tests/rehearsal",
  // The rehearsal folder holds both Playwright specs (`*.spec.ts`)
  // and unit tests (`*.test.ts`). The unit tests are vitest-only;
  // Playwright must NOT pick them up. We pin the matcher here so a
  // future contributor who adds a `*.test.ts` next to a journey
  // does not break `--list` or the runtime test discovery.
  testMatch: /.*\.spec\.ts$/,
  // Single worker; the rehearsal is a single-DB-per-run exercise and
  // must not race with itself.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["json", { outputFile: "playwright-offline-results.json" }]] : "list",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // A service worker's requests are not seen by `context.route`; block
    // registration so the browser-side network watchdog sees everything.
    serviceWorkers: "block",
  },
  // Single project: desktop 1280×800. The parent mobile project is
  // covered by the existing `a11y.spec.ts` and `parent-journey.spec.ts`;
  // the rehearsal focuses on journey wiring, not viewport reflow.
  projects: [
    {
      name: "offline-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        locale: "en-US",
      },
    },
  ],
  webServer: {
    // The rehearsal webServer runs `db:reset` exactly like the existing
    // e2e config; the dedicated DB name comes from this file. The
    // wrapper (`scripts/rehearsal/launch-offline-server.mjs`) is the
    // offline-aware log-tee equivalent of `scripts/e2e-server.mjs` —
    // it owns the Next.js child lifecycle and writes to a per-run
    // `.e2e-logs/fera_rehearsal_<pid>_<hex>.log` file the spec reads.
    command:
      "npm run db:reset && npm run build && node scripts/rehearsal/launch-offline-server.mjs",
    url: BASE_URL + "/",
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      FERA_DB_NAME: REHEARSAL_DB_NAME,
      DATABASE_URL: REHEARSAL_DATABASE_URL,
      FERA_REHEARSAL: "1",
      FERA_REHEARSAL_PORT: String(PORT),
      FERA_REHEARSAL_LOG_PATH: E2E_LOG_PATH,
      // 32 random bytes for AUTH_SECRET (D2B §15.1: 32+ random bytes,
      // base64). Throwaway per-run key; nothing real is signed.
      AUTH_SECRET: randomBytes(32).toString("base64"),
      PARENT_COOKIE_KEY: randomBytes(32).toString("base64"),
      DRAFT_SIGNING_KEY: randomBytes(32).toString("base64"),
      // DEMO_MODE=1 keeps the extract endpoint on the cache path
      // (TASK-014/020/033, FR-027/032, BR-026, TC-021/056). The cache
      // contains a single exact synthetic source string; any other
      // input is refused before a paid reservation is created.
      DEMO_MODE: "1",
      // Pin the offline model cache to the phase3-finish tree. The
      // runtime cache loader reads this BEFORE pipeline() is called so
      // no remote download is ever attempted.
      FERA_MODEL_CACHE: process.env.FERA_MODEL_CACHE!,
    },
  },
});
