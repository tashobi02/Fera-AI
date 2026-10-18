// P3-014 — Playwright + axe harness (D6 §7). E2E specs own `tests/e2e/**`;
// `npm test` (vitest) excludes them. Two viewports from D6 §7:
//   - mobile  360×780 (parent default; 360 px is the smallest target)
//   - desktop 1280×800
// `webServer` boots a built production server against a fresh, loopback-only
// test DB. Config validates both URLs and generates a dedicated database name
// before `webServer` starts. `npm run db:reset` then creates that database with
// `schema_v2.sql + roles.sql`. No real child data.
//
// TC-028 / P3-209: the `webServer` is `scripts/e2e-server.mjs`, which spawns
// `next start` and tees its stdout/stderr to `FERA_E2E_LOG_PATH` so the
// log-scan spec can read the captured JSON lines. The path is per-run and
// lives under `.e2e-logs/` (gitignored) so a previous run cannot leak in.
import { defineConfig, devices } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import {
  DEFAULT_DATABASE_URL,
  assertLocalDatabaseUrl,
  // @ts-expect-error -- the shared database guard is an untyped .mjs module.
} from "./scripts/db/guard.mjs";

const PORT = Number(process.env.FERA_E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const START_URL = "/";
const E2E_DB_NAME =
  process.env.FERA_E2E_DB_NAME ??
  `fera_e2e_${process.pid}_${randomBytes(4).toString("hex")}`;
if (!/^fera_e2e_[a-z0-9_]{1,32}$/.test(E2E_DB_NAME)) {
  throw new Error("test:e2e requires a dedicated fera_e2e_<run> database name");
}
// Per-run log capture path. Pinned relative to the repo so spec fixtures read
// the same file the wrapper writes (tests/e2e/support/log.ts joins the same
// root). `.e2e-logs/` is gitignored.
const E2E_LOG_PATH =
  process.env.FERA_E2E_LOG_PATH ??
  join(process.cwd(), ".e2e-logs", `fera_e2e_${process.pid}_${randomBytes(4).toString("hex")}.log`);
process.env.FERA_E2E_LOG_PATH = E2E_LOG_PATH;
const adminUrl = assertLocalDatabaseUrl(
  process.env.FERA_DB_ADMIN_URL ?? DEFAULT_DATABASE_URL,
  "test:e2e admin",
);
const appUrl = assertLocalDatabaseUrl(
  process.env.FERA_E2E_DATABASE_URL ??
    `postgresql://fera_app:fera_app_local_dev@${adminUrl.hostname}:${adminUrl.port}/${E2E_DB_NAME}`,
  "test:e2e app",
);
if (
  appUrl.username !== "fera_app" ||
  decodeURIComponent(appUrl.pathname.slice(1)) !== E2E_DB_NAME ||
  appUrl.hostname !== adminUrl.hostname ||
  appUrl.port !== adminUrl.port
) {
  throw new Error("test:e2e app and admin URLs must target the same local server and dedicated database");
}
const E2E_DATABASE_URL = appUrl.href;
process.env.FERA_E2E_DB_NAME = E2E_DB_NAME;
process.env.FERA_E2E_DATABASE_URL = E2E_DATABASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  // Each worker runs sequentially; a fresh DB is created once per `webServer`.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile",
      use: {
        ...devices["Pixel 5"],
        viewport: { width: 360, height: 780 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent:
          "Mozilla/5.0 (Linux; Android 13; Fera-E2E-Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
        locale: "bn-BD",
      },
    },
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        locale: "en-US",
      },
    },
  ],
  webServer: {
    // Fresh DB → build → server wrapper. db:reset drops/recreates this run's
    // dedicated database against the validated loopback admin URL; the
    // e2e-server wrapper spawns `next start` and tees its streams to
    // FERA_E2E_LOG_PATH so TC-028 can read the captured log.
    command:
      "npm run db:reset && npm run build && node scripts/e2e-server.mjs",
    url: BASE_URL + START_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      FERA_DB_NAME: E2E_DB_NAME,
      DATABASE_URL: E2E_DATABASE_URL,
      FERA_E2E: "1",
      FERA_E2E_PORT: String(PORT),
      FERA_E2E_LOG_PATH: E2E_LOG_PATH,
      // `npm start` runs in production mode, which refuses missing signing keys (D2B §15.1: 32+ random
      // bytes, base64). Throwaway per-run keys; nothing real is signed.
      AUTH_SECRET: randomBytes(32).toString("base64"),
      PARENT_COOKIE_KEY: randomBytes(32).toString("base64"),
      // P3-209 / TC-028 / D2B §15.1: 32 random bytes for the draft-signing
      // key. The brief required a per-run random value; it is identical in
      // shape to AUTH_SECRET and never reused.
      DRAFT_SIGNING_KEY: randomBytes(32).toString("base64"),
      // Synthetic-only prototype; no live provider call is made.
      DEMO_MODE: "1",
    },
  },
});
