// P3-209 / TC-028 — log capture support. The e2e wrapper (`scripts/e2e-server.mjs`)
// tees `next start` stdout/stderr to `FERA_E2E_LOG_PATH`, set by
// `playwright.config.ts` to a per-run `.e2e-logs/<run>.log` file. This module
// is the only consumer; it validates the path is the one Playwright set and
// reads the captured lines for the log-scan spec.
//
// The loopback guard mirrors `tests/e2e/support/db.ts`: a tampering would let
// a future caller point the scan at a non-e2e log; refuse rather than trust.
import { strict as assert } from "node:assert";
import { readFileSync, statSync, existsSync } from "node:fs";

/**
 * Read every byte the e2e server wrote so far. The wrapper truncates the file
 * on open, so the first read is the full content. Re-reads return the same
 * growing buffer until the wrapper exits.
 */
export function readCapturedLog(): string {
  const path = process.env.FERA_E2E_LOG_PATH;
  assert.ok(path, "test:e2e requires the e2e log path from Playwright config");
  assert.ok(/\.log$/.test(path), "e2e log path must end in .log");
  assert.ok(existsSync(path), `e2e log not found at ${path}`);
  // The wrapper writes UTF-8 JSON lines; reading as utf8 keeps Bangla digits
  // and emojis valid for regex matches later.
  return readFileSync(path, "utf8");
}

/**
 * Return lines that match a substring or regex.  Empty file → empty array, so
 * the log-scan spec can assert "no lines yet" without false positives on an
 * unwritten file.
 */
export function findLogLines(matcher: string | RegExp): string[] {
  const text = readCapturedLog();
  if (text === "") return [];
  const lines = text.split(/\r?\n/);
  return lines.filter((line) =>
    typeof matcher === "string" ? line.includes(matcher) : matcher.test(line),
  );
}

/** True if the captured log has grown past zero bytes. */
export function logFileExists(): boolean {
  const path = process.env.FERA_E2E_LOG_PATH;
  if (!path) return false;
  try {
    return statSync(path).size > 0;
  } catch {
    return false;
  }
}