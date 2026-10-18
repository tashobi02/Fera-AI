// P3-FINISH-HEALTH / API-019 actual readiness probe (TASK-062/015/016).
//
// The previous route hard-coded `db: "unavailable"` and `embeddings: "unavailable"`
// with a stale TODO. This module replaces that with two independent, best-effort
// probes that the route composes:
//
//   * DB probe: a bound `SELECT 1` through the lazily-created pool. The pool
//     itself carries the `query_timeout: 31_000` backstop (src/server/db/pool.ts),
//     so we do not add another client-side statement_timeout — the role's setting
//     is authoritative and an extra wrapper would only mask the real failure mode.
//   * Embedding probe: an actual 384-d finite, non-zero, L2-normalised vector from
//     `loadLocalEmbedder({ allowRemote: false })`. We do NOT trust `path.exists`
//     alone: the cache directory can be primed without the model being loadable,
//     and a half-cached pipeline is not "ready". The result is memoised by
//     the loaded Embedder's `(model, revision, space, cacheDir)` identity so
//     a hot path does not pay the warm-up cost on every request; we deliberately
//     do not key on arbitrary option keys (dtype / pooling / prefixes) because
//     those are already encoded in `embedder.space`.
//
// SECURITY:
//   * The route is public; the response schema (API-019) is a strict
//     { version, db, embeddings, synthetic_only, demo_mode }. We never echo the
//     raw error, the connection string, the cache path, the model id, the
//     version hash, the child payload, or the pool's last error. Failures are
//     caught and reduced to "unavailable".
//   * `allowRemote: false` is hard-coded so a missing local cache cannot fall
//     back to a huggingface.co download from this path. The operator must prime
//     the cache with `scripts/model-fetch.mjs` (which passes `allowRemote: true`).
//   * Each probe is wrapped in its own try/catch so a DB outage cannot prevent
//     the embedding probe from running, and vice versa. A missing DB MUST NOT
//     pretend the service is ready (a partial readiness is a "unavailable" flag,
//     not a "ready" one).
//
// TESTABILITY:
//   * `createHealthReadiness(deps)` accepts injectable `dbProbe` and
//     `embeddingProbe` functions. Tests pass a fake probe; the real probe is the
//     default. The default probe is the *only* place the heavy
//     `@huggingface/transformers` module is touched.

import { createLogger, describeError } from "@/app/api/_shared/log";
import { getPool } from "@/server/db/pool";
import {
  EMBEDDING_DIM,
  EmbeddingShapeError,
  loadLocalEmbedder,
  defaultCacheDir,
  type Embedder,
  type LocalEmbedderOptions,
} from "@/server/embeddings/model";

export type ReadinessFlag = "ready" | "unavailable";

export type HealthReadiness = {
  db: ReadinessFlag;
  embeddings: ReadinessFlag;
};

/**
 * A probe returns `true` when the dependency is healthy. The probe MUST catch
 * its own errors and return `false`; the route never sees them.
 */
export type DbProbe = () => Promise<boolean>;
export type EmbeddingProbe = () => Promise<boolean>;

export type HealthReadinessDeps = {
  dbProbe?: DbProbe;
  embeddingProbe?: EmbeddingProbe;
  /**
   * Optional override for the embedder factory. Tests pass a `FakeEmbedder` to
   * avoid `@huggingface/transformers` and any onnxruntime-node bundle.
   */
  loadEmbedder?: (opts: LocalEmbedderOptions) => Promise<Embedder>;
  /**
   * Cache directory the embedder is loaded against. The identity is keyed on
   * this so two probes that target different caches do not collide. Defaults
   * to `DEFAULT_CACHE_DIR` (the gitignored `.cache/models` at the repo root).
   */
  cacheDir?: string;
  logger?: ReturnType<typeof createLogger>;
};

/* ---------- DB probe ---------- */

async function defaultDbProbe(): Promise<boolean> {
  // The pool is lazily created; first call may pay the connect cost. The pool
  // owns the bounded `query_timeout`, so a dead server cancels inside 31 s and
  // we never block the health route for longer than that.
  const pool = getPool();
  const { rows } = await pool.query("SELECT 1 AS ok");
  return Array.isArray(rows) && rows.length === 1;
}

/* ---------- Embedding probe ---------- */

const PROBE_TEXT = "ferA health probe";

/**
 * Build the memo key from the *actual* loaded embedder, not from arbitrary
 * loader options. The model id, the resolved revision, the canonical space
 * tag, and the cache directory together uniquely identify a pipeline. The
 * space tag is already derived from `(model, dtype, pool, normalize, prefixes)`
 * inside the loader, so we do not duplicate those fields here.
 */
export function configIdentity(embedder: Embedder, cacheDir: string): string {
  return [
    `model=${embedder.model}`,
    `rev=${embedder.revision ?? ""}`,
    `space=${embedder.space}`,
    `cache=${cacheDir}`,
  ].join("|");
}

type CacheSlot = {
  identity: string;
  embedder: Embedder;
  load: (opts: LocalEmbedderOptions) => Promise<Embedder>;
  cacheDir: string;
};

/**
 * A process-wide memo of the `(identity -> Embedder)` map. The identity is the
 * loaded embedder's `model / revision / space` plus the `cacheDir` we asked
 * the loader to use. We deliberately do NOT key on every field of the loader
 * options: the loader has its own `(model, cacheDir)` cache on `globalThis`
 * and the readiness probe only ever passes `{ allowRemote: false }`, so the
 * canonical identity collapses to the loaded embedder's view of itself.
 */
let memo: CacheSlot | null = null;

async function warmEmbedder(
  load: (opts: LocalEmbedderOptions) => Promise<Embedder>,
  cacheDir: string,
): Promise<Embedder> {
  if (memo?.load === load && memo.cacheDir === cacheDir) return memo.embedder;
  // SECURITY: `allowRemote: false` is hard-coded. The operator primes the
  // cache with `scripts/model-fetch.mjs` (which passes `allowRemote: true`).
  const options: LocalEmbedderOptions = { allowRemote: false, cacheDir };
  const embedder = await load(options);
  const identity = configIdentity(embedder, cacheDir);
  if (memo && memo.identity === identity) return memo.embedder;
  // Replace memo first so a concurrent caller waits on the new embedder,
  // never the old one.
  memo = { identity, embedder, load, cacheDir };
  return embedder;
}

const UNIT_NORM_TOLERANCE = 1e-3;

async function defaultEmbeddingProbe(
  load: (opts: LocalEmbedderOptions) => Promise<Embedder>,
  cacheDir: string,
): Promise<boolean> {
  const embedder = await warmEmbedder(load, cacheDir);
  const raw = await embedder.embed([PROBE_TEXT]);
  // Explicit shape + numeric checks. We do NOT call `normaliseVectors` here:
  // the probe's job is to verify the embedder actually produced a 384-d
  // finite, unit-norm vector, not to silently fix a malformed one. A failure
  // throws (or returns false on a shape mismatch); the outer wrapper turns
  // it into `"unavailable"`.
  if (!Array.isArray(raw) || raw.length !== 1) return false;
  const v = raw[0];
  if (!(v instanceof Float32Array) && !Array.isArray(v)) return false;
  if (v.length !== EMBEDDING_DIM) return false;
  if (embedder.dimension !== EMBEDDING_DIM) return false;
  let norm2 = 0;
  for (let i = 0; i < v.length; i++) {
    const x = v[i];
    if (!Number.isFinite(x)) return false;
    norm2 += x * x;
  }
  // L2 unit-norm: a healthy embedder must hand back a normalised vector. We
  // accept a small tolerance for FP32 rounding, but anything that is not
  // approximately 1.0 means the pipeline is not honouring the space contract.
  if (Math.abs(norm2 - 1) > UNIT_NORM_TOLERANCE) return false;
  return true;
}

/* ---------- Composed readiness ---------- */

/**
 * Build a readiness function. Tests inject fake probes; production uses the
 * defaults (real pool + real local embedder).
 */
export function createHealthReadiness(deps: HealthReadinessDeps = {}): () => Promise<HealthReadiness> {
  const logger = deps.logger ?? createLogger();
  const dbProbe = deps.dbProbe ?? defaultDbProbe;
  const cacheDir = deps.cacheDir ?? defaultCacheDir();
  const load = deps.loadEmbedder ?? loadLocalEmbedder;
  const embeddingProbe = deps.embeddingProbe ?? (() => defaultEmbeddingProbe(load, cacheDir));

  return async function read(): Promise<HealthReadiness> {
    // Each probe is wrapped independently so a failure in one does not
    // suppress the other, and so the route never sees the raw error.
    const dbPromise = dbProbe()
      .then(
        (ok): ReadinessFlag => (ok ? "ready" : "unavailable"),
        (err): ReadinessFlag => {
          logger.error({ event: "health.db_probe_failed", ...describeError(err) });
          return "unavailable";
        },
      );
    const emPromise = embeddingProbe()
      .then(
        (ok): ReadinessFlag => (ok ? "ready" : "unavailable"),
        (err): ReadinessFlag => {
          // A real error (load failure, bad shape) is the only signal we
          // would otherwise lose; log it at error level for the operator,
          // but never let it leak into the response.
          logger.error({ event: "health.embedding_probe_failed", ...describeError(err) });
          return "unavailable";
        },
      );
    const [db, embeddings] = await Promise.all([dbPromise, emPromise]);
    return { db, embeddings };
  };
}

/* ---------- Test seams ---------- */

/** Forget the memoised embedder. Tests call this between cases so a fresh
 *  config (or a deliberate re-warm) is exercised. */
export function _resetReadinessForTests(): void {
  memo = null;
}

/** Exposed so tests can assert the identity function is stable for the same
 *  loaded embedder and changes when the model / revision / space / cacheDir
 *  changes. */
export const _configIdentity = configIdentity;

/** Re-export so a test that wants to inject a fake embedder does not have to
 *  re-import from `@/server/embeddings/model`. */
export { EMBEDDING_DIM, EmbeddingShapeError };
