// P3-014 — E2E database helper. The Playwright `webServer` (playwright.config.ts)
// runs `npm run db:reset` against a dedicated per-run loopback database before
// the server boots, so by the time a spec executes the schema + roles are
// already in place. This module only re-validates the URL on every call and
// exposes the per-run database name. No spec may connect to anything other
// than the loopback guard allows (CLAUDE.md / AGENTS.md: never run a db script
// against a non-local database). Synthetic-data only.
import { strict as assert } from "node:assert";
import {
  assertLocalDatabaseUrl as _assertLocalDatabaseUrl,
  // @ts-expect-error -- the untyped .mjs guard is re-typed with local wrappers below.
} from "../../../scripts/db/guard.mjs";

const assertLocalDatabaseUrl: (raw: string, label?: string) => URL =
  _assertLocalDatabaseUrl as (raw: string, label?: string) => URL;

export const E2E_DB_NAME = process.env.FERA_E2E_DB_NAME;

// Same loopback check db:reset uses, but the spec never sets the admin URL —
// it only reads. If the URL has been tampered with, refuse rather than connect.
function loopbackOnly(): URL {
  const raw = process.env.FERA_E2E_DATABASE_URL;
  assert.ok(raw, "test:e2e requires the validated app database URL from Playwright config");
  assert.ok(E2E_DB_NAME, "test:e2e requires the per-run database name");
  const url = assertLocalDatabaseUrl(raw, "test:e2e");
  assert.equal(decodeURIComponent(url.pathname.slice(1)), E2E_DB_NAME);
  return url;
}

/** The loopback-only URL the e2e run is bound to. Throws if anything is off. */
export function e2eDatabaseUrl(): URL {
  const url = loopbackOnly();
  assert.equal(
    url.protocol,
    "postgresql:",
    "test:e2e requires postgresql://",
  );
  return url;
}

/** Convenience: database name (also asserted by the guard). */
export function e2eDbName(): string {
  e2eDatabaseUrl();
  return E2E_DB_NAME!;
}
