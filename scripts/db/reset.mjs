// npm run db:reset — fresh local database with db/schema_v2.sql (TASK-002).
// Admin connection: FERA_DB_ADMIN_URL (never the app's DATABASE_URL), default = local fera-db.
// Target database: FERA_DB_NAME (default `fera`; must match ^fera[a-z0-9_]*$).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DEFAULT_DATABASE_URL, assertDatabaseName, assertLocalDatabaseUrl, maskUrl, scrubbedEnv, withDatabase } from "./guard.mjs";

const SCHEMA = "db/schema_v2.sql";
const COMPANION = "docs/code/schema_v2.sql";
const EXPECTED_HNSW = "cases_embedding_hnsw_idx";

// The password goes to psql through PGPASSWORD, never argv (visible to `ps`) or error text.
function connection(url) {
  const bare = new URL(url.href);
  const password = decodeURIComponent(bare.password);
  bare.password = "";
  return { href: bare.href, env: { ...scrubbedEnv(), ...(password ? { PGPASSWORD: password } : {}) } };
}

function psql(url, args) {
  const { href, env } = connection(url);
  try {
    return execFileSync("psql", [href, "-v", "ON_ERROR_STOP=1", "-X", "-q", ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });
  } catch (err) {
    const stderr = typeof err?.stderr === "string" ? err.stderr.trim().split("\n").at(-1) : "";
    throw new Error(`psql failed on ${maskUrl(url)}${stderr ? `: ${stderr}` : ""}`);
  }
}

const query = (url, sql) => psql(url, ["-At", "-c", sql]).trim();
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const versionAtLeast = (actual, min) => {
  const a = actual.split(".").map(Number);
  const m = min.split(".").map(Number);
  for (let i = 0; i < m.length; i++) if ((a[i] ?? 0) !== m[i]) return (a[i] ?? 0) > m[i];
  return true;
};

try {
  const server = withDatabase(assertLocalDatabaseUrl(process.env.FERA_DB_ADMIN_URL ?? DEFAULT_DATABASE_URL), "postgres");
  const dbName = assertDatabaseName(process.env.FERA_DB_NAME ?? "fera");
  const target = withDatabase(server, dbName);
  const schemaHash = sha256(SCHEMA);
  if (schemaHash !== sha256(COMPANION)) throw new Error(`${SCHEMA} differs from ${COMPANION}`);

  // Check the server before anything destructive.
  const version = query(server, "SHOW server_version");
  if (!version.startsWith("16.")) throw new Error(`expected PostgreSQL 16, got ${version}`);
  const available = query(server, "SELECT default_version FROM pg_available_extensions WHERE name = 'vector'");
  if (!available || !versionAtLeast(available, "0.8.1")) throw new Error(`pgvector >= 0.8.1 required (A-034), found ${available || "none"}`);

  console.log(`db:reset → ${maskUrl(target)}`);
  psql(server, ["-c", `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`]);
  psql(server, ["-c", `CREATE DATABASE ${dbName}`]);
  psql(target, ["-f", SCHEMA]);

  const vector = query(target, "SELECT extversion FROM pg_extension WHERE extname = 'vector'");
  const hnsw = query(
    target,
    `SELECT i.indisvalid FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN pg_am a ON a.oid = c.relam
     WHERE c.relname = '${EXPECTED_HNSW}' AND a.amname = 'hnsw'`,
  );
  const tables = Number(query(target, "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"));
  console.log(JSON.stringify({ database: dbName, server_version: version, pgvector: vector, hnsw_index: EXPECTED_HNSW, hnsw_valid: hnsw === "t", public_tables: tables, schema_sha256: schemaHash }));
  if (!versionAtLeast(vector, "0.8.1")) throw new Error(`pgvector ${vector} < 0.8.1`);
  if (hnsw !== "t") throw new Error(`HNSW index ${EXPECTED_HNSW} missing or invalid`);
} catch (err) {
  console.error(`db:reset failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
