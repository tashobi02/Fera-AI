#!/usr/bin/env node
// Local maintenance entry for the bounded metadata sweep. Production schedulers
// can invoke the narrowly scoped SQL function through their fera_app connection.
import { createRequire } from "node:module";
import { assertDatabaseName, assertLocalDatabaseUrl, DEFAULT_DATABASE_URL, withDatabase } from "./guard.mjs";
import { rolePasswordEnv } from "./roles.mjs";

const require = createRequire(import.meta.url);
const { Client } = require("pg");

async function main() {
  const url = withDatabase(
    assertLocalDatabaseUrl(process.env.FERA_DB_ADMIN_URL ?? DEFAULT_DATABASE_URL, "db:sweep"),
    assertDatabaseName(process.env.FERA_DB_NAME ?? "fera"),
  );
  url.username = "fera_app";
  url.password = rolePasswordEnv().FERA_APP_DB_PASSWORD;
  const client = new Client({ connectionString: url.href, connectionTimeoutMillis: 10_000 });
  try {
    await client.connect();
    const { rows } = await client.query("SELECT * FROM sweep_expired_metadata()");
    if (rows.length !== 1 || !Number.isInteger(rows[0].deleted_drafts) || !Number.isInteger(rows[0].deleted_sessions)) {
      throw new Error("metadata sweep returned an invalid result");
    }
    process.stdout.write(JSON.stringify(rows[0]) + "\n");
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((err) => {
  const name = typeof err?.name === "string" && /^[A-Za-z0-9_]{1,60}$/.test(err.name) ? err.name : "Error";
  process.stderr.write(`db:sweep failed (${name})\n`);
  process.exitCode = 1;
});
