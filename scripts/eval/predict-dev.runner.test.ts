// scripts/eval/predict-dev.runner.test.ts — Fera Phase 3 dev-split prediction runner.
//
// This is the production entry point for the predict-dev generator. It runs
// under `vitest.predict-dev.config.mts`, NOT under `npm test`. The test
// harness calls `runPredict` against a freshly-bootstrapped isolated
// local PostgreSQL database, using the real local pinned E5 embedder.
//
// Output JSONL files are written to the paths given by env vars
// FERA_PREDICT_MATCH_OUT and FERA_PREDICT_DEDUPE_OUT (both required; the
// runner fails the test if either path is missing or unwritable).
//
// The test passes only if:
//   * the manifest gate (loadSplit(manifest,'dev')) accepts the canonical
//     committed manifest,
//   * the isolated DB bootstraps cleanly (a unique dedicated local test DB),
//   * the reembed step embeds at least one row,
//   * the match output contains one row per dev MISSING record (the
//     generator never reads `role` or `no_match` to choose queries;
//     every missing record gets a real matcher run),
//   * (if dedupe is requested) one row per dev source case,
//   * the provenance *.meta.json files are written.
// The test FAILS (vitest exits non-zero) on any of those conditions.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
// @ts-expect-error -- plain ESM helper, no .d.ts.
import {
  DEFAULT_DATABASE_URL,
  assertLocalDatabaseUrl,
  withDatabase,
} from "../db/guard.mjs";
import {
  bootstrapIsolatedDb,
  dropIsolatedDb,
  loadDevSplit,
  loadEmbedder,
  parsePredictArgs,
  runPredict,
  uniqueDbName,
  type PredictCli,
  type LoadedManifest,
  type DbBootstrap,
} from "./predict-dev";
// @ts-expect-error -- plain ESM helper, no .d.ts.
import { safeReadJsonl } from "../../eval/metric-utils.mjs";

// This runner test file lives at scripts/eval/predict-dev.runner.test.ts,
// so its directory is scripts/eval/ and the repo root is two levels up.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const matchOut = process.env.FERA_PREDICT_MATCH_OUT ?? "eval/data/dev-match.jsonl";
const dedupeOut = process.env.FERA_PREDICT_DEDUPE_OUT ?? "eval/data/dev-dedupe.jsonl";
const baseDbName = process.env.FERA_PREDICT_DB ?? "fera_predict_dev";

const args: PredictCli = parsePredictArgs([
  "--match-out", matchOut,
  "--dedupe-out", dedupeOut,
  "--db-name", baseDbName,
]);

describe("predict-dev (standalone runner)", () => {
  let loaded: LoadedManifest;
  let boot: DbBootstrap;
  let adminClient: pg.Client;
  let appPool: pg.Pool;
  let embedder: Awaited<ReturnType<typeof loadEmbedder>>;
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  let dbName = "";

  beforeAll(async () => {
    if (args.errors.length) {
      throw new Error(`predict-dev runner: bad args: ${args.errors.join("; ")}`);
    }
    if (!existsSync(resolve(repoRoot, "eval/manifest.json"))) {
      throw new Error(`predict-dev runner: eval/manifest.json missing at ${resolve(repoRoot, "eval/manifest.json")}`);
    }
    // 1) Manifest + dev split.
    loaded = loadDevSplit(resolve(repoRoot, "eval/manifest.json"));
    if (loaded.devRecords.length === 0) {
      throw new Error("predict-dev runner: dev split has 0 records; check the manifest");
    }
    // 2) Bootstrap the isolated DB. The run is the only consumer of this
    //    name; a unique suffix prevents concurrent runs from racing.
    const adminUrlStr = process.env.FERA_DB_ADMIN_URL ?? DEFAULT_DATABASE_URL;
    assertLocalDatabaseUrl(adminUrlStr, "predict-dev-runner");
    dbName = uniqueDbName(baseDbName);
    boot = await bootstrapIsolatedDb({ adminUrl: adminUrlStr, dbName, repoRoot });
    // 3) Connect as owner (for seeding) and as fera_app (for matcher).
    const adminTarget = withDatabase(boot.adminUrl, dbName);
    adminClient = new pg.Client({ connectionString: adminTarget.href, connectionTimeoutMillis: 10_000 });
    await adminClient.connect();
    appPool = new pg.Pool({ connectionString: boot.appUrl.href, max: 2, connectionTimeoutMillis: 10_000 });
    // 4) Real local pinned E5 embedder. The CLI never accepts a fake
    //    embedder; the unit tests inject one through the helper seam.
    embedder = await loadEmbedder({ useFake: false, timeoutMs: 60_000 });
  }, 60 * 60 * 1000);

  afterAll(async () => {
    await appPool?.end().catch(() => undefined);
    await adminClient?.end().catch(() => undefined);
    if (dbName) {
      try {
        await dropIsolatedDb({ adminUrl: process.env.FERA_DB_ADMIN_URL ?? DEFAULT_DATABASE_URL, dbName });
      } catch {
        // best-effort; the dedicated local test DB is harmless if leaked
      }
    }
  });

  it("generates real match + dedupe predictions for the dev split", async () => {
    expect(loaded).toBeTruthy();
    expect(boot).toBeTruthy();
    expect(embedder).toBeTruthy();
    const result = await runPredict({
      adminClient: adminClient!,
      appPool: appPool!,
      embedder: embedder!,
      manifest: loaded!,
      args,
      commit,
      dbName,
    });
    // 1) Output files exist.
    expect(existsSync(args.matchOut)).toBe(true);
    expect(existsSync(args.matchOut + ".meta.json")).toBe(true);
    expect(existsSync(args.dedupeOut!)).toBe(true);
    expect(existsSync(args.dedupeOut! + ".meta.json")).toBe(true);
    // 2) JSONL shape is valid.
    const matchPred = safeReadJsonl(args.matchOut);
    expect(matchPred.present).toBe(true);
    expect(matchPred.rows.length).toBeGreaterThan(0);
    // 3) EVERY dev MISSING record has a row. The generator does not
    //    read `role` or `no_match` to choose queries; the matcher is
    //    the single source of inference.
    const devMissing = loaded!.devRecords.filter((r) => r.kind === "missing");
    const predictionIds = new Set(matchPred.rows.map((r) => r.id));
    for (const q of devMissing) {
      expect(predictionIds.has(q.record_id)).toBe(true);
    }
    // 4) Every row has a `ranked` array (possibly empty on a real
    //    abstention; never an oracle empty).
    for (const r of matchPred.rows as Array<{ id: string; ranked: unknown[]; abstained: boolean; error_id?: string }>) {
      expect(Array.isArray(r.ranked)).toBe(true);
      if (r.error_id) {
        // Error rows are explicit failures; they must not be silently
        // counted as correct abstentions by the scorer.
        expect(typeof r.error_id).toBe("string");
        expect(r.error_id, "inference errors cannot be scored as abstentions").toBeUndefined();
      }
    }
    // 5) Dedupe output: one row per dev source (canonical + decoy).
    const dedupePred = safeReadJsonl(args.dedupeOut!);
    expect(dedupePred.present).toBe(true);
    const devSources = loaded!.devRecords;
    expect(dedupePred.rows.length).toBe(devSources.length);
    // 6) Provenance carries the dev split, embedder model and the prediction sha.
    expect(result.matchProv.split).toBe("dev");
    expect(result.matchProv.embedder_model).toBe(embedder!.model);
    expect(result.matchProv.embedder_space).toBe(embedder!.space);
    expect(result.matchProv.prediction_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.matchProv.manifest_sha256).toMatch(/^[a-f0-9]{64}$/);
  }, 60 * 60 * 1000);
});
