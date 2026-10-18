// P3-209 · TC-028 log scan (NFR-010; PII never reaches logs).
//
// `scripts/e2e-server.mjs` (the `webServer` for `playwright.config.ts`) spawns
// `next start` and tees its stdout/stderr to `FERA_E2E_LOG_PATH` per run. This
// spec reads that file, drives a real public request carrying a unique
// synthetic marker (a name and a phone number), captures the server-issued
// `request_id` from the response header, and asserts the captured log
// contains a matching request line (proving the log file is the server's,
// not stale or empty) while remaining free of any phone-shaped digit run,
// any of the seeded fixture display names, and the synthetic marker name.
//
// Why this is runnable: the wrapper writes the same bytes to a per-run log
// file under `.e2e-logs/`, so the spec can read it directly. The health
// request proves the log file is the server's output (no false positive on
// an empty file).
import { test, expect } from "@playwright/test";
import { STAFF_DISPLAY, UNVERIFIED_DISPLAY, VERIFIED_DISPLAY, SEED_PARENT_NAME, SEED_CHILD_NAME } from "./support/fixtures";
import { findLogLines, readCapturedLog, logFileExists } from "./support/log";

// Seeded fixture display names inserted by `tests/e2e/safeguarding.spec.ts`
// and read by `parent-journey.spec.ts` and `officer-lifecycle.spec.ts`.  The
// logger allowlist has no key for names; dropping them is the only correct
// outcome.
const SEEDED_NAMES = [STAFF_DISPLAY, UNVERIFIED_DISPLAY, VERIFIED_DISPLAY, SEED_PARENT_NAME, SEED_CHILD_NAME];

// The phone-pattern the brief names explicitly: a "01" digit run, then nine
// more digits.  `PHONE_LIKE` in `src/app/api/_shared/log.ts` is stricter
// (also matches Bangla digits), but the spec covers exactly the ASCII run
// the brief names.
const PHONE_PATTERN = /01[0-9]{9}/;

// A unique synthetic marker we embed in the request via the body.  Both the
// marker and a phone-shaped digit run we add to the body must NOT appear in
// the log; the only thing the spec matches in the log is the server-issued
// `request_id`.  The number is high-entropy to avoid colliding with other
// e2e runs.
const MARKER_NAME = `e2e-marker-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
const MARKER_PHONE = "019" + String(Date.now()).slice(-8); // 11 ASCII digits

test.describe("log scan (TC-028, NFR-010)", () => {
  test("server log contains the request_id but no synthetic name, no phone, no seeded fixture", async ({ request }) => {
    // 1) Drive a real public request that carries the unique synthetic
    //    marker in the body.  /api/health is API-019 — no auth, no payload
    //    schema; the body is plain JSON parsed by the request reader and
    //    dropped by the logger allowlist.  The server sets an `x-request-id`
    //    response header we can read.
    const response = await request.get("/api/health", {
      params: { marker: MARKER_NAME, contact: MARKER_PHONE },
    });
    expect(response.status()).toBe(200);
    const requestId = response.headers()["x-request-id"] ?? "";
    expect(requestId, "server must issue a request id").toMatch(/^[0-9a-f-]{8,}$/);

    // 2) The log file exists and is non-empty (wrapper wrote at least the
    //    start banner and our request line).
    expect(
      logFileExists(),
      "e2e log file must be present and non-empty after a request",
    ).toBe(true);

    // 3) Find the request line for the issued `request_id`.  The format is
    //    the allowlist JSON: {"level":30,"time":<ms>,"event":"request",
    //    "request_id":"<uuid>","route":"API-019","method":"POST",...}.
    //    Matching the request_id is the most precise possible proof the
    //    captured log is the live server's for *this* request.
    await expect.poll(() => findLogLines(`"request_id":"${requestId}"`).length).toBeGreaterThan(0);
    const requestLines = findLogLines(`"request_id":"${requestId}"`);
    expect(
      requestLines.length,
      `expected at least one request line for request_id=${requestId}`,
    ).toBeGreaterThan(0);
    // The request line must carry the API-019 route marker.
    expect(
      requestLines[0],
      "request line must reference API-019",
    ).toContain('"route":"API-019"');

    // 4) The synthetic marker name must not appear in any log line.  A
    //    regression that logs the request body unfiltered is caught here.
    const markerLines = findLogLines(MARKER_NAME);
    expect(
      markerLines,
      `marker ${MARKER_NAME} must not appear in the captured log; found ${markerLines.length} line(s)`,
    ).toEqual([]);

    // 5) NFR-010 phone-pattern scan: 0 matches across the full log.  This
    //    covers both the marker phone we just sent and any seeded fixture
    //    phone-shaped string.
    const phoneLines = findLogLines(PHONE_PATTERN);
    expect(
      phoneLines,
      `phone-shaped digit runs found in log: ${phoneLines.length} line(s)`,
    ).toEqual([]);

    // 6) Seeded fixture name scan: 0 matches across the full log.
    const nameHits: Array<{ name: string; lines: string[] }> = [];
    for (const name of SEEDED_NAMES) {
      const lines = findLogLines(name);
      if (lines.length > 0) nameHits.push({ name, lines });
    }
    expect(
      nameHits,
      `seeded fixture names found in log: ${nameHits.length}`,
    ).toEqual([]);
  });
});
