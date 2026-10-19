#!/usr/bin/env node
// Apply numbered, checksummed production schema migrations. No URL is read from
// dotenv files or printed. The explicit allow flag and database-name match are
// required because this changes persistent schema state.
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertDatabaseName } from "./guard.mjs";

const require = createRequire(import.meta.url);
const { Client } = require("pg");
const MIGRATIONS = fileURLToPath(new URL("./migrations", import.meta.url));
const LOCK_KEY = "741827604219";
// Migration 006 briefly grants fera_app access to the old caller-cutoff sweep.
// Keep it in the same transaction as 007 so an interrupted upgrade cannot
// commit that unsafe intermediate function for new databases.
const ATOMIC_MIGRATION_GROUPS = [[
  "006_metadata_sweep.sql",
  "007_metadata_sweep_database_clock.sql",
]];

function targetUrl() {
  if (process.env.FERA_DB_MIGRATE_ALLOW !== "1") throw new Error("set FERA_DB_MIGRATE_ALLOW=1 for an intentional migration run");
  if (!process.env.FERA_DB_ADMIN_URL) throw new Error("FERA_DB_ADMIN_URL must be set explicitly");
  const name = assertDatabaseName(process.env.FERA_DB_NAME);
  let url;
  try { url = new URL(process.env.FERA_DB_ADMIN_URL); }
  catch { throw new Error("FERA_DB_ADMIN_URL is not a valid URL"); }
  if (!new Set(["postgresql:", "postgres:"]).has(url.protocol)) throw new Error("FERA_DB_ADMIN_URL must use PostgreSQL");
  if (url.search || url.hash) throw new Error("FERA_DB_ADMIN_URL connection parameters are not allowed");
  if (decodeURIComponent(url.pathname.slice(1)) !== name) throw new Error("FERA_DB_NAME must match the database in FERA_DB_ADMIN_URL");
  return url;
}

const checksum = (contents) => createHash("sha256").update(contents).digest("hex");

async function main() {
  const client = new Client({ connectionString: targetUrl().href, connectionTimeoutMillis: 10_000 });
  let locked = false;
  try {
    await client.connect();
    await client.query("SELECT pg_advisory_lock($1::bigint)", [LOCK_KEY]);
    locked = true;
    await client.query(`CREATE TABLE IF NOT EXISTS public.db_migrations (
      name text PRIMARY KEY CHECK (name ~ '^[0-9]{3}_[a-z0-9_]+\\.sql$'),
      checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const files = readdirSync(MIGRATIONS).filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
    let applied = 0;
    const processed = new Set();
    for (const name of files) {
      if (processed.has(name)) continue;
      const group = ATOMIC_MIGRATION_GROUPS.find((members) => members.includes(name));
      const batch = group ?? [name];
      if (group && batch.some((member) => !files.includes(member))) {
        throw new Error(`atomic migration group is incomplete at ${name}`);
      }

      const entries = [];
      for (const member of batch) {
        const sql = readFileSync(join(MIGRATIONS, member), "utf8");
        const digest = checksum(sql);
        const existing = await client.query("SELECT checksum FROM public.db_migrations WHERE name = $1", [member]);
        const wasApplied = existing.rows.length > 0;
        if (wasApplied && existing.rows[0].checksum !== digest) throw new Error(`checksum changed for applied migration ${member}`);
        entries.push({ name: member, sql, digest, wasApplied });
      }

      // A database cannot have 007 without 006. Refuse to guess at or bless
      // that migration history; normal interrupted runs roll both back.
      if (group && !entries[0].wasApplied && entries[1].wasApplied) {
        throw new Error(`inconsistent atomic migration history at ${entries[1].name}`);
      }
      const pending = entries.filter((entry) => !entry.wasApplied);
      if (pending.length > 0) {
        await client.query("BEGIN");
        try {
          for (const entry of pending) {
            await client.query(entry.sql);
            await client.query("INSERT INTO public.db_migrations (name, checksum) VALUES ($1, $2)", [entry.name, entry.digest]);
          }
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK").catch(() => undefined);
          throw err;
        }
        applied += pending.length;
        for (const entry of pending) process.stdout.write(`applied ${entry.name}\n`);
      }
      for (const member of batch) processed.add(member);
    }
    process.stdout.write(`db:migrate complete (${applied} applied)\n`);
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock($1::bigint)", [LOCK_KEY]).catch(() => undefined);
    await client.end().catch(() => undefined);
  }
}

main().catch((err) => {
  const name = typeof err?.name === "string" && /^[A-Za-z0-9_]{1,60}$/.test(err.name) ? err.name : "Error";
  process.stderr.write(`db:migrate failed (${name})\n`);
  process.exitCode = 1;
});
