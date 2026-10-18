// Pre-main test-journeys — rehearsal database helper.
//
// Mirrors `tests/e2e/support/db.ts` but uses the rehearsal env vars
// (FERA_REHEARSAL_DATABASE_URL, FERA_REHEARSAL_DB_NAME) and the
// dedicated `fera_e2e_premainjourney_` prefix. The guard is the same
// `assertLocalDatabaseUrl` from `scripts/db/guard.mjs`; the loopback
// check, the protocol check, and the "no query-string overrides" check
// are reused. Synthetic-data only, no real child rows.
import { strict as assert } from "node:assert";
import type { Client } from "pg";
import {
  assertLocalDatabaseUrl as _assertLocalDatabaseUrl,
  DEFAULT_DATABASE_URL,
  // @ts-expect-error -- the untyped .mjs guard is re-typed locally.
} from "../../scripts/db/guard.mjs";

const assertLocalDatabaseUrl: (raw: string, label?: string) => URL =
  _assertLocalDatabaseUrl as (raw: string, label?: string) => URL;

export const REHEARSAL_DB_NAME = process.env.FERA_REHEARSAL_DB_NAME;

/** Throw early if the env the rehearsal webServer set has been
 *  tampered with. Same loopback-only contract as the e2e helper. */
function loopbackOnly(): URL {
  const raw = process.env.FERA_REHEARSAL_DATABASE_URL;
  assert.ok(raw, "test:rehearsal requires the validated app database URL from the offline Playwright config");
  assert.ok(REHEARSAL_DB_NAME, "test:rehearsal requires the per-run database name");
  const url = assertLocalDatabaseUrl(raw, "test:rehearsal");
  assert.equal(decodeURIComponent(url.pathname.slice(1)), REHEARSAL_DB_NAME);
  // Belt-and-braces: the prefix check the Playwright config enforces
  // is repeated here so a future env override cannot bypass it.
  assert.match(
    REHEARSAL_DB_NAME!,
    /^fera_e2e_premainjourney_[a-z0-9_]{1,32}$/,
    "rehearsal DB name must start with fera_e2e_premainjourney_",
  );
  return url;
}

/** The loopback-only URL the rehearsal run is bound to. Throws if
 *  anything is off. */
export function rehearsalDatabaseUrl(): URL {
  const url = loopbackOnly();
  assert.equal(url.protocol, "postgresql:", "test:rehearsal requires postgresql://");
  return url;
}

/** Convenience: rehearsal DB name (also asserted by the guard). */
export function rehearsalDbName(): string {
  rehearsalDatabaseUrl();
  return REHEARSAL_DB_NAME!;
}

/** Open a pg connection as the local OWNER role for fixture writes.
 *  Mirrors the existing `ownerClient` so a future merge is mechanical. */
export async function rehearsalOwnerClient(): Promise<Client> {
  const { Client } = await import("pg");
  const url = rehearsalDatabaseUrl();
  const adminRaw = process.env.FERA_DB_ADMIN_URL ?? DEFAULT_DATABASE_URL;
  assertLocalDatabaseUrl(adminRaw, "test:rehearsal owner");
  const admin = new URL(adminRaw);
  admin.pathname = `/${url.pathname.slice(1)}`;
  const client = new Client({ connectionString: admin.href, connectionTimeoutMillis: 10_000 });
  await client.connect();
  return client;
}

/** Open a pg connection as the runtime `fera_app` role. Used by the
 *  spec to read what the app sees. */
export async function rehearsalAppClient(): Promise<Client> {
  const { Client } = await import("pg");
  const url = rehearsalDatabaseUrl();
  const appUrl = new URL(url.href);
  appUrl.username = "fera_app";
  appUrl.password = process.env.FERA_APP_DB_PASSWORD ?? "fera_app_local_dev";
  const client = new Client({ connectionString: appUrl.href, connectionTimeoutMillis: 10_000 });
  await client.connect();
  return client;
}
