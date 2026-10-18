// Pre-main test-journeys — offline log helper.
//
// `scripts/rehearsal/launch-offline-server.mjs` tees the Next.js
// child's stdout/stderr to `FERA_REHEARSAL_LOG_PATH`. This module
// reads that file for the rehearsal spec's offline log-scan
// assertion. The shape mirrors the existing
// `tests/e2e/support/log.ts` so the conventions line up; the path
// comes from a different env var so the two webServers cannot share
// a log file.
import { strict as assert } from "node:assert";
import { readFileSync, statSync, existsSync } from "node:fs";

/** The env var the wrapper writes to. */
const REHEARSAL_LOG_PATH = "FERA_REHEARSAL_LOG_PATH";

/** Read every byte the rehearsal server wrote so far. Empty string if
 *  the file is unwritten. */
export function readRehearsalLog(): string {
  const path = process.env[REHEARSAL_LOG_PATH];
  assert.ok(path, `test:rehearsal requires the offline log path from Playwright config (${REHEARSAL_LOG_PATH})`);
  assert.ok(/\.log$/.test(path), "rehearsal log path must end in .log");
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8");
}

/** Return lines that match a substring or regex. Empty buffer → empty array. */
export function findRehearsalLogLines(matcher: string | RegExp): string[] {
  const text = readRehearsalLog();
  if (text === "") return [];
  const lines = text.split(/\r?\n/);
  return lines.filter((line) => (typeof matcher === "string" ? line.includes(matcher) : matcher.test(line)));
}

/** True if the rehearsal log has grown past zero bytes. */
export function rehearsalLogExists(): boolean {
  const path = process.env[REHEARSAL_LOG_PATH];
  if (!path) return false;
  try {
    return statSync(path).size > 0;
  } catch {
    return false;
  }
}
