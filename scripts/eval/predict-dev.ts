// scripts/eval/predict-dev.ts — Fera Phase 3 dev-split prediction generator.
//
// TC-020 / TASK-039 / P3-211. Generates genuine inference artifacts for the
// dev split only. Real matcher pipeline (src/server/matching/run.ts) and real
// duplicate detector (src/server/duplicates/detect.ts) against an isolated
// fresh local PostgreSQL database, embedding every case with the local pinned
// E5 embedder (loadLocalEmbedder).
//
// Hard rules (enforced or visible in the code):
//   * Uses the canonical loadSplit(manifest,'dev') — never the test split.
//   * FREEZE_FLAG is never set; thresholds are never tuned here.
//   * The match generator runs the real matcher for EVERY dev missing
//     record — `no_match` is a label, never an oracle hint. The eval
//     scorer decides whether an empty `ranked` is correct; we never
//     pre-empt the scorer with a synthetic empty row.
//   * No true_partner_ids / duplicate_group_ids / no_match labels are
//     read to choose predictions. Labels are only used by the separate
//     eval/match.mjs / eval/dedupe.mjs scorers after the fact.
//   * The match output `id` field is the missing record_id, and the
//     `ranked` list contains the found case UUIDs (NOT the
//     match_candidates row id). Error rows carry an explicit
//     `error_id`; they never count as a silent abstention.
//   * Dedupe output is one row per dev source case (canonical + decoy
//     sources, paired with the candidate case_id), shape compatible
//     with `eval/dedupe.mjs`.
//   * Provenance *.meta.json next to the JSONL carries the SHA-256 of
//     the commit, embedder model / space, manifest and the prediction
//     JSONL itself. No child payload. No full transcripts. No raw
//     `Error` objects, no child names, no contact fields in stderr.
//
// Testable helpers are exported under `__test`. Unit tests
// (tests/scripts/predict-dev.test.ts) use a fake embedder and a fake
// pool; they never reach the database and never read the synthetic set.
// The standalone runner (scripts/eval/predict-dev.runner.test.ts) is
// the production entry point and is executed under the dedicated
// vitest config (vitest.predict-dev.config.mts), not under `npm test`.
//
// CLI usage (via the runner test):
//   FERA_PREDICT_MATCH_OUT=eval/data/dev-match.jsonl \
//   FERA_PREDICT_DEDUPE_OUT=eval/data/dev-dedupe.jsonl \
//   FERA_PREDICT_DB=fera_predict_dev \
//   npx vitest run --config vitest.predict-dev.config.mts \
//     scripts/eval/predict-dev.runner.test.ts
//
// Exit code:
//   * the runner test fails (exit 1) if the generator returns without
//     writing the expected JSONL. Vitest then exits non-zero.

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
// @ts-expect-error -- plain ESM helper without declarations
import { DEFAULT_DATABASE_URL, assertDatabaseName, assertLocalDatabaseUrl, withDatabase, scrubbedEnv } from "../db/guard.mjs";
// @ts-expect-error -- plain ESM helper without declarations
import { rolePasswordEnv } from "../db/roles.mjs";
// @ts-expect-error -- plain ESM helper without declarations
import { loadSplit as loadCanonicalSplit, paths as manifestPaths, serializeManifest } from "../../eval/manifest-lib.mjs";
import { runMatcherForCase } from "@/server/matching/run";
import { detectDuplicates } from "@/server/duplicates/detect";
import {
  createFakeEmbedder,
  loadLocalEmbedder,
  EMBEDDING_DIM,
  type Embedder,
} from "@/server/embeddings/model";
import { reembedAll } from "@/server/embeddings";
import { withTransaction } from "@/server/case/internal";

/* ---------- CLI args ---------- */

export type PredictCli = {
  matchOut: string;
  dedupeOut: string | null;
  dbName: string;
  matcherLimit: number;
  embedderTimeoutMs: number;
  help: boolean;
  errors: string[];
};

export function parsePredictArgs(argv: readonly string[]): PredictCli {
  const out: PredictCli = {
    matchOut: "",
    dedupeOut: null,
    dbName: "fera_predict_dev",
    matcherLimit: 1_000_000,
    embedderTimeoutMs: 60_000,
    help: false,
    errors: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--match-out") out.matchOut = argv[++i] ?? "";
    else if (a === "--dedupe-out") out.dedupeOut = argv[++i] ?? null;
    else if (a === "--db-name") out.dbName = argv[++i] ?? "";
    else if (a === "--matcher-limit") out.matcherLimit = Number(argv[++i] ?? "0") || 0;
    else if (a === "--embedder-timeout-ms") out.embedderTimeoutMs = Number(argv[++i] ?? "0") || 0;
    else out.errors.push(`unknown argument: ${a}`);
  }
  if (!out.matchOut && !out.help) out.errors.push("--match-out is required");
  if (out.dbName && !/^fera[a-z0-9_]{0,40}$/.test(out.dbName)) {
    out.errors.push("--db-name must match ^fera[a-z0-9_]*$");
  }
  return out;
}

function helpText(): string {
  return [
    "predict-dev — Dev-split prediction generator (Fera Phase 3, TC-020).",
    "",
    "Generates real matcher + dedupe predictions for the dev split against an",
    "isolated fresh local PostgreSQL database, using the local pinned E5",
    "embedder. Reads the canonical manifest; loadSplit(manifest,'dev') guards",
    "group integrity. Never reads the test split, never sets FREEZE_FLAG,",
    "never tunes thresholds, never uses true labels to choose predictions.",
    "",
    "Options:",
    "  --match-out <path.jsonl>     output path for match predictions",
    "  --dedupe-out <path.jsonl>    output path for dedupe predictions",
    "  --db-name <fera_*>           isolated dev DB name (default fera_predict_dev)",
    "  --matcher-limit <N>          cap on missing cases per run",
    "  --embedder-timeout-ms <ms>   embedder load timeout (default 60000)",
    "",
    "Every record gets a real CPU embedding. The fake embedder is exposed",
    "only to the unit-test helper `loadEmbedder({ useFake: true })`; the CLI",
    "has no flag to opt into it (a CLI-produced run is always a real run).",
    "The companion *.meta.json file records the provenance hashes.",
  ].join("\n");
}

/* ---------- provenance helpers ---------- */

function fileSha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function gitHeadShort(cwd: string): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

export function jsonlSha256(rows: readonly unknown[]): string {
  const body = rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
  return createHash("sha256").update(body, "utf8").digest("hex");
}

export type MatchProvenance = {
  kind: "match";
  prediction_file: string;
  prediction_sha256: string;
  row_count: number;
  commit: string | null;
  manifest_sha256: string;
  manifest_revision: string;
  embedder_model: string | null;
  embedder_revision: string | null;
  embedder_space: string | null;
  generated_at: string;
  split: "dev";
  notes: string[];
};

export type DedupeProvenance = {
  kind: "dedupe";
  prediction_file: string;
  prediction_sha256: string;
  row_count: string;
  row_count_num: number;
  commit: string | null;
  manifest_sha256: string;
  manifest_revision: string;
  embedder_model: string | null;
  embedder_revision: string | null;
  embedder_space: string | null;
  generated_at: string;
  split: "dev";
  notes: string[];
};

/* ---------- manifest / split access ---------- */

export type DevRecord = {
  record_id: string;
  kind: string;
  role: string;
  identity_id: string;
  duplicate_group_id: string | null;
  split_group_id: string;
  true_partner_ids: string[];
  no_match: boolean;
  decoy_type: string | null;
  decoy_target_ids: string[];
};

export type LoadedManifest = {
  manifest: unknown;
  manifestPath: string;
  manifestSha: string;
  manifestRevision: string;
  devRecords: ReadonlyArray<DevRecord>;
};

/**
 * Load the manifest and the dev split. Uses the canonical loader which
 * validates source hashes, group assignment and FREEZE.md. The test split
 * is never loaded (FREEZE_FLAG is NOT SET in this branch).
 */
export function loadDevSplit(manifestPath: string = manifestPaths.manifest): LoadedManifest {
  if (!existsSync(manifestPath)) {
    throw new Error(`predict-dev: manifest missing: ${manifestPath}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { manifest_revision: string; records: DevRecord[] };
  const devRows = loadCanonicalSplit(manifest, "dev") as ReadonlyArray<DevRecord>;
  return {
    manifest,
    manifestPath,
    manifestSha: createHash("sha256").update(serializeManifest(manifest), "utf8").digest("hex"),
    manifestRevision: String(manifest.manifest_revision),
    devRecords: devRows,
  };
}

/* ---------- DB bootstrap (isolated fresh local test DB) ---------- */

const COMPANION_SCHEMA = "docs/code/schema_v2.sql";
const ROLES_SQL = "db/roles.sql";

export type DbBootstrap = {
  dbName: string;
  adminUrl: URL;
  appUrl: URL;
  schemaPath: string;
  schemaHash: string;
};

/**
 * Generate a unique dedicated local test database name. The base name is
 * checked against the documented `^fera[a-z0-9_]{0,40}$` guard, and a
 * short random suffix keeps two concurrent runs from racing on the same
 * database (the previous run is responsible for dropping its own).
 */
export function uniqueDbName(base: string): string {
  const safe = assertDatabaseName(base);
  const random = createHash("sha256")
    .update(`${safe}:${Date.now()}:${Math.random()}`)
    .digest("hex")
    .slice(0, 6);
  return `${safe}_${random}`;
}

/**
 * Create a fresh isolated local database with schema_v2.sql + roles.sql.
 * Refuses any non-local host. The DB name must match ^fera[a-z0-9_]*$.
 * If a previous run left a DB with the same name it is dropped first;
 * the run is the only consumer of that DB.
 */
export async function bootstrapIsolatedDb(opts: {
  adminUrl: string;
  dbName: string;
  repoRoot: string;
}): Promise<DbBootstrap> {
  // Re-assert the loopback guard before doing anything destructive.
  const admin = assertLocalDatabaseUrl(opts.adminUrl, "predict-dev");
  if (admin.hostname === "" || (admin.protocol !== "postgresql:" && admin.protocol !== "postgres:")) {
    throw new Error("predict-dev: refusing non-postgresql admin url");
  }
  const dbName = assertDatabaseName(opts.dbName);
  const server = withDatabase(admin, "postgres");
  const target = withDatabase(admin, dbName);

  const schemaPath = join(opts.repoRoot, "db", "schema_v2.sql");
  const companion = join(opts.repoRoot, COMPANION_SCHEMA);
  const rolesPath = join(opts.repoRoot, ROLES_SQL);
  if (!existsSync(schemaPath)) throw new Error("predict-dev: missing schema");
  if (!existsSync(companion)) throw new Error("predict-dev: missing companion schema");
  if (!existsSync(rolesPath)) throw new Error("predict-dev: missing roles");

  const schemaHash = fileSha256(schemaPath);
  if (schemaHash !== fileSha256(companion)) {
    throw new Error("predict-dev: schema drift between db/schema_v2.sql and docs/code/schema_v2.sql");
  }

  // psql inherits the environment, but PG* vars can redirect it; the URL
  // alone decides the target. We also strip the admin URL itself so a
  // misconfigured env never overrides the explicit URL we just validated.
  const scrubbed = scrubbedEnv(process.env);
  runPsql(server, scrubbed, "-c", `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  runPsql(server, scrubbed, "-c", `CREATE DATABASE ${dbName}`);
  runPsql(target, scrubbed, "-f", schemaPath);
  // Roles are created with the operator-supplied passwords from rolePasswordEnv().
  // The admin URL is the only authority for the role names; the password is
  // pulled from process.env (no URL printing here, only the mask below).
  const roleEnv = rolePasswordEnv();
  if (!roleEnv.FERA_APP_DB_PASSWORD || !roleEnv.FERA_REDACTOR_DB_PASSWORD) {
    throw new Error("predict-dev: missing role passwords in environment");
  }
  runPsql(target, { ...scrubbed, ...roleEnv }, "-f", rolesPath);

  // Connect as fera_app for the rest of the run.
  const appUrl = new URL(target.href);
  appUrl.username = "fera_app";
  appUrl.password = roleEnv.FERA_APP_DB_PASSWORD;

  return { dbName, adminUrl: admin, appUrl, schemaPath, schemaHash };
}

/**
 * Drop only the dedicated local test database created by this run. The
 * caller is responsible for closing all pools first; psql is invoked with
 * the scrubbed environment so PG* redirects cannot redirect it.
 */
export async function dropIsolatedDb(opts: {
  adminUrl: string;
  dbName: string;
}): Promise<void> {
  const admin = assertLocalDatabaseUrl(opts.adminUrl, "predict-dev");
  const dbName = assertDatabaseName(opts.dbName);
  const server = withDatabase(admin, "postgres");
  const scrubbed = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("PG") && k !== "FERA_DB_ADMIN_URL"),
  );
  runPsql(server, scrubbed, "-c", `DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
}

function runPsql(url: URL, env: Record<string, string | undefined>, ...args: string[]): void {
  const target = new URL(url.href);
  const password = decodeURIComponent(target.password);
  target.password = "";
  const childEnv: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV ?? "test", ...scrubbedEnv(env), PGCONNECT_TIMEOUT: "10", ...(password ? { PGPASSWORD: password } : {}) };
  const result = spawnSync(
    "psql",
    [target.href, "-v", "ON_ERROR_STOP=1", "-X", "-q", ...args],
    { encoding: "utf8", env: childEnv },
  );
  if (result.status !== 0) {
    const stderr = (result.stderr ?? "").toString().trim().split("\n").slice(-3).join("\n");
    void stderr;
    throw new Error(`predict-dev: local database command failed (${result.status})`);
  }
}

/* ---------- seed users + cases for the isolated dev DB ---------- */

/**
 * Seed the documented staff/officer/admin accounts (the same five the
 * committed seed-users.mjs creates). The synthetic set's found reports
 * require staff.demo and staff2.demo. We open an owner connection for
 * this — matching the existing `npm run seed:users` flow.
 */
export async function seedStaffAccountsForPredict(
  ownerClient: pg.Client,
): Promise<void> {
  // The committed seed-users.mjs hashes passwords with @node-rs/argon2. We
  // re-apply the same INSERTs directly here with a synthetic hash that
  // satisfies the schema's password_hash CHECK (length(text) > 0) and the
  // documented `[MOCK]` contract. The accounts are used only to set
  // created_by_user_id on found reports; no auth happens in this flow.
  const syntheticHash = "synthetic-not-a-hash:" + "0".repeat(60);
  const accounts: Array<{ username: string; display_name: string; role: string; verified: boolean }> = [
    { username: "admin.demo", display_name: "[MOCK] অ্যাডমিন", role: "admin", verified: false },
    { username: "officer.demo", display_name: "[MOCK] কর্মকর্তা এক", role: "officer", verified: true },
    { username: "officer2.demo", display_name: "[MOCK] কর্মকর্তা দুই", role: "officer", verified: true },
    { username: "officer.pending", display_name: "[MOCK] অযাচাইকৃত কর্মকর্তা", role: "officer", verified: false },
    { username: "staff.demo", display_name: "[MOCK] স্টাফ এক", role: "staff", verified: false },
    { username: "staff2.demo", display_name: "[MOCK] স্টাফ দুই", role: "staff", verified: false },
  ];
  await ownerClient.query("BEGIN");
  try {
    for (const a of accounts) {
      await ownerClient.query(
        `INSERT INTO users (username, display_name, password_hash, role, verified, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (username) DO UPDATE SET display_name = EXCLUDED.display_name,
           password_hash = EXCLUDED.password_hash, role = EXCLUDED.role,
           verified = EXCLUDED.verified, is_active = true`,
        [a.username, a.display_name, syntheticHash, a.role, a.verified],
      );
    }
    await ownerClient.query("COMMIT");
  } catch (err) {
    await ownerClient.query("ROLLBACK").catch(() => undefined);
    throw err;
  }
}

/**
 * Seed ONLY the dev-assigned records from the committed synthetic set
 * into a freshly-bootstrapped isolated DB. The filter is applied BEFORE
 * any insert via the `recordIds` allow-list on `seedCases`; nothing is
 * ever deleted, so the append-only audit log and the FK from
 * audit_log.case_id are never violated.
 *
 * The helper is exported under `__test` so the unit suite can exercise
 * it with a fake pool (the suite does not import this file directly).
 */
export async function seedDevRecords(
  ownerClient: pg.Client,
  devRecordIds: ReadonlySet<string>,
): Promise<{ inserted: number; skipped: number; devKept: number }> {
  // Districts first (case rows reference district_code), then users (so
  // seedCases finds staff.demo / staff2.demo), then cases filtered to
  // the dev set BEFORE any insert.
  const { loadDistrictData, seedDistricts } = await import(
    // @ts-expect-error -- plain ESM helper, no .d.ts.
    "../../db/seed/districts.mjs"
  );
  const { seedCases } = await import(
    // @ts-expect-error -- plain ESM helper, no .d.ts.
    "../../db/seed/cases.mjs"
  );
  const data = loadDistrictData();
  await seedDistricts(ownerClient, data, { allowRecode: false });
  await seedStaffAccountsForPredict(ownerClient);
  const result = await seedCases(ownerClient, { set: "full", recordIds: devRecordIds });

  const { rows: kept } = await ownerClient.query(
    "SELECT client_submission_id FROM cases WHERE client_submission_id = ANY($1::uuid[])",
    [[...devRecordIds]],
  );
  const devKept = (kept as Array<{ client_submission_id: string }>).length;
  return { ...result, devKept };
}

/* ---------- embedder loader ---------- */

/**
 * Inject a real or fake Embedder. The CLI never calls this with
 * `useFake: true`; that branch is reserved for unit tests. Production
 * always loads the local pinned E5 model (the model id is encoded in
 * `loadLocalEmbedder`).
 */
export async function loadEmbedder(opts: {
  useFake: boolean;
  timeoutMs: number;
}): Promise<Embedder> {
  if (opts.useFake) return createFakeEmbedder();
  return withTimeout(loadLocalEmbedder(), opts.timeoutMs, "predict-dev: embedder load timed out");
}

async function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  if (ms <= 0) return p;
  return await new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e instanceof Error ? e : new Error(String(e))); },
    );
  });
}

/* ---------- core generation: match ---------- */

export type MatchPredictionRow = {
  id: string;
  ranked: string[];
  abstained: boolean;
  error_id?: string;
  meta: {
    model: string | null;
    space: string | null;
    revision: string | null;
    considered: number;
    duration_ms: number;
  };
};

export type RunMatchOptions = {
  manifest: LoadedManifest;
  appPool: pg.Pool;
  embedder: Embedder;
  limit?: number;
};

export async function runMatchPredictions(opts: RunMatchOptions): Promise<{
  rows: MatchPredictionRow[];
  consideredCases: number;
  emptyAbstentions: number;
  errors: number;
}> {
  const recToCase = await buildRecordIdToCaseIdMap(opts.appPool, opts.manifest.devRecords);
  // Every dev missing record gets an actual matcher run, regardless of
  // `role` or `no_match`. The matcher returns an empty `ranked` for an
  // abstention; that is the genuine inference, never a fabricated empty.
  const queries = buildDevQueries(opts.manifest.devRecords, recToCase);
  const limit = opts.limit ?? Number.MAX_SAFE_INTEGER;
  const rows: MatchPredictionRow[] = [];
  let considered = 0;
  let emptyAbstain = 0;
  let errors = 0;
  const exit = (code: number): never => {
    throw new Error(`predict-dev: command fail (exit ${code})`);
  };
  void exit;

  for (const q of queries.slice(0, limit)) {
    const start = Date.now();
    let res: Awaited<ReturnType<typeof runMatcherForCase>>;
    try {
      res = await runMatcherForCase(q.caseId, {
        api: "API-014",
        embedder: opts.embedder,
        pool: opts.appPool,
      });
    } catch (err) {
      // Exception path: the matcher reported a real failure. Surface the
      // error id so the runner can fail the vitest run with a non-zero
      // exit; a silent empty row would only obscure the failure.
      errors += 1;
      const errId = err instanceof Error && /^\s*[A-Z]-\d+/.test(err.message) ? err.message : "E-021";
      rows.push({
        id: q.recordId,
        ranked: [],
        abstained: true,
        error_id: errId,
        meta: {
          model: opts.embedder.model,
          space: opts.embedder.space,
          revision: opts.embedder.revision,
          considered: 0,
          duration_ms: Date.now() - start,
        },
      });
      continue;
    }
    if (res.errorId) {
      errors += 1;
      rows.push({
        id: q.recordId,
        ranked: [],
        abstained: false,
        error_id: res.errorId,
        meta: {
          model: opts.embedder.model,
          space: opts.embedder.space,
          revision: opts.embedder.revision,
          considered: res.considered,
          duration_ms: Date.now() - start,
        },
      });
      continue;
    }
    const rankedIds = await readFoundIdsForRanked(opts.appPool, res.candidates);
    rows.push({
      id: q.recordId,
      ranked: rankedIds,
      abstained: res.abstained || rankedIds.length === 0,
      meta: {
        model: opts.embedder.model,
        space: opts.embedder.space,
        revision: opts.embedder.revision,
        considered: res.considered,
        duration_ms: Date.now() - start,
      },
    });
    if (rankedIds.length === 0) emptyAbstain += 1;
    considered += 1;
  }

  return { rows, consideredCases: considered, emptyAbstentions: emptyAbstain, errors };
}

/* ---------- core generation: dedupe ---------- */

export type DedupePredictionRow = {
  id: string;
  links: Array<{ a: string; b: string; rule: string; score: number }>;
  skipped: boolean;
  error_id?: string;
  meta: {
    model: string | null;
    space: string | null;
    revision: string | null;
    duration_ms: number;
  };
};

export type RunDedupeOptions = {
  manifest: LoadedManifest;
  appPool: pg.Pool;
  embedder: Embedder;
  limit?: number;
};

export async function runDedupePredictions(opts: RunDedupeOptions): Promise<{
  rows: DedupePredictionRow[];
  total: number;
  skipped: number;
  errors: number;
}> {
  const recToCase = await buildRecordIdToCaseIdMap(opts.appPool, opts.manifest.devRecords);
  const sourceIds = buildDevDedupeSources(opts.manifest.devRecords, recToCase);
  const limit = opts.limit ?? Number.MAX_SAFE_INTEGER;
  const rows: DedupePredictionRow[] = [];
  let skipped = 0;
  let errors = 0;
  for (const src of sourceIds.slice(0, limit)) {
    const start = Date.now();
    let result: Awaited<ReturnType<typeof detectDuplicates>>;
    try {
      result = await detectDuplicates(opts.appPool, src.caseId);
    } catch (err) {
      // Exception path: surface a real failure as an explicit error row.
      // A silent empty row would mask a detector bug; the runner test
      // asserts the row's `error_id` field is present and non-empty.
      errors += 1;
      const errId = "E-021";
      void err;
      rows.push({
        id: src.recordId,
        links: [],
        skipped: false,
        error_id: errId,
        meta: {
          model: opts.embedder.model,
          space: opts.embedder.space,
          revision: opts.embedder.revision,
          duration_ms: Date.now() - start,
        },
      });
      continue;
    }
    if (result.skipped) {
      skipped += 1;
      rows.push({
        id: src.recordId,
        links: [],
        skipped: true,
        meta: {
          model: opts.embedder.model,
          space: opts.embedder.space,
          revision: opts.embedder.revision,
          duration_ms: Date.now() - start,
        },
      });
      continue;
    }
    const links = result.flags.map((f) => {
      const partnerRecord = recToCase.invert.get(f.candidate_id) ?? f.candidate_id;
      return { a: src.recordId, b: partnerRecord, rule: f.rule, score: f.score };
    });
    rows.push({
      id: src.recordId,
      links,
      skipped: false,
      meta: {
        model: opts.embedder.model,
        space: opts.embedder.space,
        revision: opts.embedder.revision,
        duration_ms: Date.now() - start,
      },
    });
  }
  return { rows, total: sourceIds.length, skipped, errors };
}

/* ---------- helpers exported for unit tests ---------- */

export type RecordCaseMap = {
  recordToCase: Map<string, string>;
  invert: Map<string, string>;
};

/** Read the record_id -> case id map (client_submission_id == record_id). */
export async function buildRecordIdToCaseIdMap(
  db: Pick<pg.Pool, "query">,
  devRecords: ReadonlyArray<{ record_id: string }>,
): Promise<RecordCaseMap> {
  const ids = [...new Set(devRecords.map((r) => r.record_id))];
  const recordToCase = new Map<string, string>();
  const invert = new Map<string, string>();
  if (ids.length === 0) return { recordToCase, invert };
  const { rows } = await db.query(
    "SELECT id, client_submission_id FROM cases WHERE client_submission_id = ANY($1::uuid[])",
    [ids],
  );
  for (const r of rows as Array<{ id: string; client_submission_id: string | null }>) {
    if (r.client_submission_id) {
      recordToCase.set(r.client_submission_id, r.id);
      invert.set(r.id, r.client_submission_id);
    }
  }
  return { recordToCase, invert };
}

export type DevQuery = { recordId: string; caseId: string; kind: "missing" };

/**
 * Build the dev query set for the match generator. EVERY missing
 * record gets a query: the generator does not read the `role` or
 * `no_match` label fields to decide which queries to run. The matcher
 * is the single source of inference; an empty `ranked` is a real
 * abstention, never a fabricated empty row.
 */
export function buildDevQueries(
  devRecords: ReadonlyArray<DevRecord>,
  map: RecordCaseMap,
): DevQuery[] {
  const queries: DevQuery[] = [];
  for (const r of devRecords) {
    if (r.kind !== "missing") continue;
    const caseId = map.recordToCase.get(r.record_id);
    if (!caseId) continue;
    queries.push({ recordId: r.record_id, caseId, kind: "missing" });
  }
  return queries;
}

export function buildDevDedupeSources(
  devRecords: ReadonlyArray<DevRecord>,
  map: RecordCaseMap,
): Array<{ recordId: string; caseId: string }> {
  const out: Array<{ recordId: string; caseId: string }> = [];
  for (const r of devRecords) {
    const caseId = map.recordToCase.get(r.record_id);
    if (!caseId) continue;
    out.push({ recordId: r.record_id, caseId });
  }
  return out;
}

export function detectEmptyAbstain(rows: ReadonlyArray<{ ranked: unknown[]; abstained: boolean }>): number {
  let n = 0;
  for (const r of rows) if (Array.isArray(r.ranked) && r.ranked.length === 0) n += 1;
  return n;
}

async function readFoundIdsForRanked(
  db: Pick<pg.Pool, "query">,
  candidates: ReadonlyArray<{ id: string }>,
): Promise<string[]> {
  if (candidates.length === 0) return [];
  const ids = candidates.map((c) => c.id);
  const { rows } = await db.query(
    "SELECT mc.id, c.client_submission_id AS found_case_id FROM match_candidates mc JOIN cases c ON c.id=mc.found_case_id WHERE mc.id=ANY($1::uuid[])",
    [ids],
  );
  const map = new Map<string, string>();
  for (const r of rows as Array<{ id: string; found_case_id: string }>) map.set(r.id, r.found_case_id);
  return candidates.map((c) => map.get(c.id) ?? c.id);
}

/* ---------- writer ---------- */

export function writeMatchPredictions(path: string, rows: MatchPredictionRow[]): void {
  mkdirSync(dirname(path), { recursive: true });
  const body = rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
  writeFileSync(path, body, "utf8");
}

export function writeDedupePredictions(path: string, rows: DedupePredictionRow[]): void {
  mkdirSync(dirname(path), { recursive: true });
  const body = rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
  writeFileSync(path, body, "utf8");
}

export function writeMatchProvenance(path: string, prov: MatchProvenance): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(prov, null, 2) + "\n", "utf8");
}

export function writeDedupeProvenance(path: string, prov: DedupeProvenance): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(prov, null, 2) + "\n", "utf8");
}

/* ---------- top-level run ---------- */

export type PredictRunResult = {
  matchRows: MatchPredictionRow[];
  dedupeRows: DedupePredictionRow[] | null;
  matchProv: MatchProvenance;
  dedupeProv: DedupeProvenance | null;
  reembedSummary: { embedded: number; considered: number; skippedEmpty: number };
};

export type PredictRunDeps = {
  adminClient: pg.Client;
  appPool: pg.Pool;
  embedder: Embedder;
  manifest: LoadedManifest;
  args: PredictCli;
  commit: string | null;
  dbName: string;
};

/**
 * The single entry point that the standalone runner test calls. It is
 * also the seam unit tests use with fakes. The function does NOT
 * bootstrap the DB; the caller is responsible for that (the runner
 * calls bootstrapIsolatedDb, this function only runs the inference).
 */
export async function runPredict(opts: PredictRunDeps): Promise<PredictRunResult> {
  const owner = opts.adminClient;
  const pool = opts.appPool;
  const embedder = opts.embedder;
  const loaded = opts.manifest;

  // 1) Seed only the dev-assigned records.
  const devIds = new Set(loaded.devRecords.map((r) => r.record_id));
  const seedSummary = await seedDevRecords(owner, devIds);

  // 2) Re-embed every dev case row in-place. The reembedAll helper is the
  //    canonical path; it refuses to leave the table in a mixed space
  //    (TC-059). It embeds both `missing` and `found` rows.
  if (embedder.dimension !== EMBEDDING_DIM) {
    throw new Error(`predict-dev: embedder dimension ${embedder.dimension} != ${EMBEDDING_DIM}`);
  }
  const reembedSummary = await reembedAll(pool, embedder, { withTransaction: (fn) => withTransaction(fn, { pool }) });
  if (reembedSummary.embedded === 0) {
    throw new Error("predict-dev: reembed produced 0 vectors; cannot score");
  }
  void seedSummary;

  // 3) Match predictions.
  const matchResult = await runMatchPredictions({ manifest: loaded, appPool: pool, embedder, limit: opts.args.matcherLimit });
  if (matchResult.errors > 0) throw new Error(`predict-dev: ${matchResult.errors} matching inferences failed`);
  const matchProv: MatchProvenance = {
    kind: "match",
    prediction_file: opts.args.matchOut,
    prediction_sha256: jsonlSha256(matchResult.rows),
    row_count: matchResult.rows.length,
    commit: opts.commit,
    manifest_sha256: loaded.manifestSha,
    manifest_revision: loaded.manifestRevision,
    embedder_model: embedder.model,
    embedder_revision: embedder.revision,
    embedder_space: embedder.space,
    generated_at: new Date().toISOString(),
    split: "dev",
    notes: [
      `considered_cases=${matchResult.consideredCases}`,
      `empty_abstentions=${matchResult.emptyAbstentions}`,
      `errors=${matchResult.errors}`,
      `embedded=${reembedSummary.embedded}/${reembedSummary.considered}`,
      `db_name=${opts.dbName}`,
    ],
  };
  writeMatchPredictions(opts.args.matchOut, matchResult.rows);
  writeMatchProvenance(opts.args.matchOut + ".meta.json", matchProv);

  // 4) Dedupe predictions (optional).
  let dedupeRows: DedupePredictionRow[] | null = null;
  let dedupeProv: DedupeProvenance | null = null;
  if (opts.args.dedupeOut) {
    const dedupeResult = await runDedupePredictions({ manifest: loaded, appPool: pool, embedder, limit: opts.args.matcherLimit });
    dedupeRows = dedupeResult.rows;
    dedupeProv = {
      kind: "dedupe",
      prediction_file: opts.args.dedupeOut,
      prediction_sha256: jsonlSha256(dedupeResult.rows),
      row_count: `${dedupeResult.rows.length}`,
      row_count_num: dedupeResult.rows.length,
      commit: opts.commit,
      manifest_sha256: loaded.manifestSha,
      manifest_revision: loaded.manifestRevision,
      embedder_model: embedder.model,
      embedder_revision: embedder.revision,
      embedder_space: embedder.space,
      generated_at: new Date().toISOString(),
      split: "dev",
      notes: [
        `sources=${dedupeResult.total}`,
        `skipped_no_embedding=${dedupeResult.skipped}`,
        `errors=${dedupeResult.errors}`,
        `db_name=${opts.dbName}`,
      ],
    };
    writeDedupePredictions(opts.args.dedupeOut, dedupeResult.rows);
    writeDedupeProvenance(opts.args.dedupeOut + ".meta.json", dedupeProv);
  }

  return {
    matchRows: matchResult.rows,
    dedupeRows,
    matchProv,
    dedupeProv,
    reembedSummary: {
      embedded: reembedSummary.embedded,
      considered: reembedSummary.considered,
      skippedEmpty: reembedSummary.skippedEmpty,
    },
  };
}

/* ---------- main (when invoked directly) ---------- */

async function main(): Promise<number> {
  const args = parsePredictArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(helpText() + "\n");
    return 0;
  }
  if (args.errors.length) {
    process.stderr.write(`predict-dev: ${args.errors.join("; ")}\n`);
    return 2;
  }

  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const commit = gitHeadShort(repoRoot);

  let loaded: LoadedManifest;
  try {
    loaded = loadDevSplit();
  } catch (err) {
    process.stderr.write(`predict-dev: ${safeLogMessage(err)}\n`);
    return 2;
  }

  // Pick a unique dedicated local DB. Two concurrent runs would otherwise
  // race on the same database; the run that loses would drop the
  // winner's data. The suffix is a short hash of (dbName, time, random).
  const adminUrlStr = process.env.FERA_DB_ADMIN_URL ?? DEFAULT_DATABASE_URL;
  const dbName = uniqueDbName(args.dbName);

  let boot: DbBootstrap;
  try {
    boot = await bootstrapIsolatedDb({
      adminUrl: adminUrlStr,
      dbName,
      repoRoot,
    });
  } catch (err) {
    process.stderr.write(`predict-dev: db bootstrap failed: ${safeLogMessage(err)}\n`);
    return 1;
  }

  // Admin client connects to the server's maintenance DB; appPool connects
  // to the dedicated test DB as fera_app. The admin URL is never logged
  // unmasked; only the masked form is allowed in user-visible output.
  const adminMaintenanceUrl = withDatabase(boot.adminUrl, "postgres");
  const adminClient = new pg.Client({ connectionString: adminMaintenanceUrl.href, connectionTimeoutMillis: 10_000 });
  const appPool = new pg.Pool({ connectionString: boot.appUrl.href, max: 2, connectionTimeoutMillis: 10_000 });
  let rc = 1;
  try {
    await adminClient.connect();
    let embedder: Embedder;
    try {
      embedder = await loadEmbedder({ useFake: false, timeoutMs: args.embedderTimeoutMs });
    } catch (err) {
      process.stderr.write(`predict-dev: embedder load failed: ${safeLogMessage(err)}\n`);
      return 1;
    }
    const result = await runPredict({
      adminClient,
      appPool,
      embedder,
      manifest: loaded,
      args,
      commit,
      dbName,
    });
    process.stdout.write(JSON.stringify({
      ok: true,
      match: result.matchProv,
      dedupe: result.dedupeProv,
      reembed: result.reembedSummary,
    }, null, 2) + "\n");
    rc = 0;
  } catch (err) {
    process.stderr.write(`predict-dev: ${safeLogMessage(err)}\n`);
    rc = 1;
  } finally {
    // Pool first, then drop. The DB only ever belongs to this run; the
    // dedicated-name generator prevents collisions across runs.
    await adminClient.end().catch(() => undefined);
    await appPool.end().catch(() => undefined);
    try {
      await dropIsolatedDb({ adminUrl: adminUrlStr, dbName });
    } catch {
      // The drop is best-effort; a leaked test DB is harmless on a
      // local cluster and the next run will create its own unique name.
    }
  }
  return rc;
}

/**
 * Build a stderr-friendly log line. The brief forbids raw `Error` objects
 * and child fields in user-visible output; we only emit the safe message
 * string and never the stack, the cause, or any payload field.
 */
function safeLogMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`predict-dev: uncaught: ${safeLogMessage(err)}\n`);
      process.exit(1);
    },
  );
}

export const __test = {
  parsePredictArgs,
  loadDevSplit,
  buildRecordIdToCaseIdMap,
  buildDevQueries,
  buildDevDedupeSources,
  detectEmptyAbstain,
  bootstrapIsolatedDb,
  dropIsolatedDb,
  uniqueDbName,
  loadEmbedder,
  runMatchPredictions,
  runDedupePredictions,
  writeMatchPredictions,
  writeDedupePredictions,
  writeMatchProvenance,
  writeDedupeProvenance,
  jsonlSha256,
  runPredict,
};
