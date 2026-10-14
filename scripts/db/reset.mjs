// npm run db:reset — fresh local `fera` database with db/schema_v2.sql (TASK-002, TC-062).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DEFAULT_DATABASE_URL, assertLocalDatabaseUrl, maskUrl, scrubbedEnv, withDatabase } from "./guard.mjs";

const DB_NAME = "fera";
const SCHEMA = "db/schema_v2.sql";
const COMPANION = "docs/code/schema_v2.sql";

function psql(url, args, opts = {}) {
  return execFileSync("psql", [url.href, "-v", "ON_ERROR_STOP=1", "-X", "-q", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    env: scrubbedEnv(),
    ...opts,
  });
}

function query(url, sql) {
  return psql(url, ["-At", "-c", sql]).trim();
}

const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

try {
  const server = assertLocalDatabaseUrl(process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL);
  const target = withDatabase(server, DB_NAME);
  const schemaHash = sha256(SCHEMA);
  if (schemaHash !== sha256(COMPANION)) throw new Error(`${SCHEMA} differs from ${COMPANION}`);

  console.log(`db:reset → ${maskUrl(target)}`);
  psql(server, ["-c", `DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`]);
  psql(server, ["-c", `CREATE DATABASE ${DB_NAME}`]);
  psql(target, ["-f", SCHEMA]);

  const version = query(target, "SHOW server_version");
  const vector = query(target, "SELECT extversion FROM pg_extension WHERE extname = 'vector'");
  const hnsw = query(target, "SELECT string_agg(indexname, ',' ORDER BY indexname) FROM pg_indexes WHERE indexdef ILIKE '%using hnsw%'");
  const tables = query(target, "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'");
  console.log(JSON.stringify({ server_version: version, pgvector: vector, hnsw_indexes: hnsw.split(",").filter(Boolean), public_tables: Number(tables), schema_sha256: schemaHash }));

  if (!version.startsWith("16.")) throw new Error(`expected PostgreSQL 16, got ${version}`);
  if (!hnsw) throw new Error("no HNSW index was created");
} catch (err) {
  console.error(`db:reset failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
