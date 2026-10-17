// P3-209 · TC-028 log scan (NFR-010; PII never reaches logs).
//
// The brief: after the other specs, read the server log the webServer
// captures, regex the captured log for the phone pattern `/01[0-9]{9}/`
// and for the seeded fixture display names, and expect 0 matches for each.
//
// How Fera's logger is wired:
//   - `src/app/api/_shared/log.ts` exports `createLogger()`. The default
//     sink writes JSON lines to `process.stdout`. Every line is filtered
//     through `PHONE_LIKE = /(?:0|০)(?:1|১)[0-9০-৯]{9}/` and an allowlist
//     of keys (`event`, `request_id`, `route`, etc.); disallowed values
//     are dropped, never written.
//   - `playwright.config.ts` boots the webServer with
//     `stdout: "pipe", stderr: "pipe"`. With `pipe`, Playwright captures
//     the child process stdout/stderr but does not expose it back to the
//     spec process — there is no `webServer.outputPath`, no `processLog`
//     hook, and no fixture on the spec for captured lines.
//
// Therefore the spec process cannot read the captured stdout. Per the
// brief, we mark the test `test.fixme` with that one-line reason. A
// future change to write logs to a file under `webServer.outputPath` (or
// to expose them via a Playwright reporter hook) would unfixme this test.
import { test, expect } from "@playwright/test";

// Seeded fixture display names inserted by `tests/e2e/safeguarding.spec.ts`.
// `displayNameSchema` rejects names containing digit runs, so each of
// these contains only letters, spaces and the `[MOCK]` prefix.  The log
// scan must not see any of them — the allowlist logger has no key for
// names, and dropping names is the only correct outcome.
const SEEDED_NAMES = [
  "[MOCK] E2E Staff One",
  "[MOCK] E2E Officer Pending",
  "[MOCK] E2E Officer Verified",
  "[MOCK] E2E Reporter One",
  "[MOCK] E2E Child One",
] as const;

// The phone-pattern the brief names explicitly: a "01" digit run, then
// nine more digits.  `PHONE_LIKE` in `src/app/api/_shared/log.ts` is
// stricter (allows Bangla digits, forbids phone-shaped digit runs in any
// field).  This regex matches exactly what the brief says.
const PHONE_PATTERN = /01[0-9]{9}/;

// One-line reason the spec cannot read the captured log, per the brief.
// Reference it once so the linter does not flag the gap-tracker as dead.
const NOT_READABLE =
  "Playwright webServer stdout/stderr is piped and not exposed to the spec; " +
  "the captured server log cannot be read from this test process.";
void NOT_READABLE;

test.describe("log scan (TC-028, NFR-010)", () => {
  test.fixme(
    `server log contains no seeded names and no phone-shaped digit run matching ${PHONE_PATTERN.source}`,
    async () => {
      // Body intentionally empty.  When fixed, the test will:
      //   1. Open the captured server log file/stream.
      //   2. Read the lines emitted after the prior specs finished.
      //   3. For each line, assert `!PHONE_PATTERN.test(line)` and
      //      `!SEEDED_NAMES.some(name => line.includes(name))`.
      //   4. Aggregate to 0 matches across both checks.
      // Until then, the test is recorded as a known gap with the reason
      // above, and the same assertion is covered by:
      //   - unit tests of `createLogger()` in `tests/unit/log.test.ts`
      //     (PHONE_LIKE and the allowlist are tested directly), and
      //   - the allowlist shape in `src/app/api/_shared/log.ts` itself.
      expect(PHONE_PATTERN.source).toBe("01[0-9]{9}");
      expect(SEEDED_NAMES).toHaveLength(5);
    },
  );
});