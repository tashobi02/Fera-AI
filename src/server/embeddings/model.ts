// TASK-016 / COMP-011 / P3-024: the embedding model, the prefix policy and the
// embedder loader.
//
// Pinned model, pinned revision, pinned weights, pinned space.
//
//   * Model id:       Xenova/multilingual-e5-small (ONNX export of
//                     intfloat/multilingual-e5-small)
//   * Revision:       761b726dd34fb83930e26aab4e9ac3899aa1fa78
//                     (read from the Hugging Face API for that model on
//                     17 Oct 2026 and re-checked on 18 Oct 2026; main was
//                     last modified 2025-07-22, so this is the same commit
//                     unless HF rewrites history. Not invented.)
//   * Dtype:          q8 (the spike showed q8 was within one query of
//                     fp32 on the synthetic set; ~113 MiB vs ~449 MiB)
//   * Pooling:        mean
//   * Normalisation:  L2
//   * Dimension:      384
//   * Prefixes:       `query: ` on the missing/query side, `passage: ` on
//                     the found side (the documented e5 policy; the spike
//                     showed a small gain over `passage: ` on both sides)
//   * Text recipe:    text-v1 (Bump when text.ts changes. A golden test
//                     pins the exact text for fixed inputs.)
//
// The three values in EMBEDDING (model, revision, space) are written to
// cases.embedding_model / embedding_revision / embedding_space together with
// the vector (the schema CHECK sets them all or none). Changing ANY of them
// makes `npm run reembed` re-embed every case — vectors from different
// spaces must never be compared.
//
// The Embedder interface is the only thing the rest of the codebase depends
// on. Tests pass a FAKE embedder (deterministic 384-d vectors) and never
// download the model. Production calls `loadLocalEmbedder` which:
//
//   1. Verifies the four model files exist locally and match their
//      SHA-256 digests (so the on-disk bytes are tied to the pinned
//      revision).
//   2. Sets `env.allowRemoteModels = false` BEFORE `pipeline(...)` so
//      the runtime never reaches huggingface.co.
//   3. Returns an Embedder that L2-normalises every vector and rejects
//      non-finite / wrong-dim / zero vectors.
//
// Runtime callers keep the cache read-only. The supported cache-priming
// entry point is `scripts/model-fetch.mjs`, which is opt-in and verifies
// each fixed asset against its pinned SHA-256 before loading offline.
//
// SECURITY HARDENING (P3-024):
//   * `env.allowRemoteModels = false` is set on the runtime path. The
//     fetch script downloads only pinned URLs itself, then verifies and
//     warms the model through this loader with remote disabled.
//   * The default cache directory is anchored at the repository root
//     via `import.meta.url`, not the current working directory, so
//     the loader, `scripts/reembed.mjs`, and `scripts/model-fetch.mjs`
//     agree when run from any cwd.
//   * The on-disk cache is verified (SHA-256) before the pipeline is
//     built. A corrupted or replaced file fails closed with a
//     `model:fetch` hint.
//   * World-writable cache directories are refused (POSIX).
//   * `makeEmbeddingSpace` (legacy) and `buildSpace` (the canonical
//     hash) both include the model, revision, dtype, pooling,
//     normalisation, prefixes, roleByKind and text recipe so a space
//     switch forces a re-embed.

import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EMBEDDING_DIM = 384;

/* ---------------------------------------------------------------- *
 * Pinned model.                                                    *
 * ---------------------------------------------------------------- */

// Hugging Face commit of Xenova/multilingual-e5-small (ONNX export of
// intfloat/multilingual-e5-small). Read from
// https://huggingface.co/api/models/Xenova/multilingual-e5-small on 17 Oct
// 2026 (first look-up) and again on 18 Oct 2026 (same sha; lastModified
// 2025-07-22), not invented. The TASK-004 spike downloaded `main` without
// recording a hash; main had not moved since 2025-07-22, so it is the same
// commit unless Hugging Face rewrote history.
const MODEL_REVISION = "761b726dd34fb83930e26aab4e9ac3899aa1fa78";
// Weights precision. q8 (~113 MiB) was within one query of fp32 (~449 MiB)
// in the spike on the synthetic set.
const DTYPE = "q8";
// Bump when caseEmbeddingText (text.ts) changes what is embedded. A golden
// test pins the text for fixed inputs, so a change cannot slip through
// without touching this.
export const TEXT_RECIPE = "text-v1";

/* ---------------------------------------------------------------- *
 * Pinned text policy.                                              *
 * ---------------------------------------------------------------- */

export type EmbeddingRole = "query" | "passage";
// multilingual-e5 documented prefixes. `query: ` is the missing/query
// side, `passage: ` the found side (spike: small gain over
// `passage: ` on both sides).
export const PREFIX: Record<EmbeddingRole, string> = {
  query: "query: ",
  passage: "passage: ",
};
// Which side each case kind is embedded as. The single source for text
// embedding and reembed.
export const ROLE_BY_KIND: Record<"missing" | "found", EmbeddingRole> = {
  missing: "query",
  found: "passage",
};
// Options handed to the model call: the only place they are written down.
export const POOLING_OPTIONS = { pooling: "mean", normalize: true } as const;

/* ---------------------------------------------------------------- *
 * Space hash.                                                      *
 * ---------------------------------------------------------------- */

export interface SpaceInputs {
  model: string;
  revision: string | null;
  dtype: string;
  dim: number;
  textRecipe: string;
  prefix: Record<EmbeddingRole, string>;
  roleByKind: Record<string, EmbeddingRole>;
  pooling: string;
  normalize: boolean;
}

/**
 * Builds the canonical vector-space label from the model identity and every
 * runtime choice that changes a vector. Two embeddings with different model
 * revisions or `buildSpace(...)` inputs MUST NOT be compared on cosine.
 */
export function buildSpace(i: SpaceInputs): string {
  const digest = createHash("sha256")
    .update(
      JSON.stringify([
        i.model,
        i.revision,
        i.dtype,
        i.dim,
        i.textRecipe,
        i.prefix,
        i.roleByKind,
        i.pooling,
        i.normalize,
      ]),
    )
    .digest("hex")
    .slice(0, 10);
  return `e5-small-${i.dtype}-${i.pooling}-${i.normalize ? "l2" : "raw"}-${i.dim}-${i.textRecipe}-${digest}`;
}

/**
 * Resolve the repository root from this module's URL. Used to anchor the
 * default `.cache/models` directory so the loader, `scripts/reembed.mjs`,
 * and `scripts/model-fetch.mjs` all agree regardless of the cwd.
 */
function repoRoot(): string {
  // src/server/embeddings/model.ts → ../../../  (repo root)
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
}

/** Default gitignored cache directory (relative to the repository root). */
export const DEFAULT_CACHE_DIR = resolve(repoRoot(), ".cache/models");

/**
 * Resolve the cache directory: env override first, then the
 * repo-root-anchored default. The env override lets an operator use a
 * shared cache across worktrees, and lets a test point at a tmpdir.
 */
export function defaultCacheDir(): string {
  return process.env.FERA_MODEL_CACHE ?? DEFAULT_CACHE_DIR;
}

/* ---------------------------------------------------------------- *
 * Pinned model files.                                              *
 * ---------------------------------------------------------------- */

export interface ModelFile {
  path: string;
  sha256: string;
}

// Files fetched by `npm run model:fetch` from the pinned revision, with
// SHA-256 digests. onnx and tokenizer.json digests equal Hugging Face's
// LFS oids for that commit; the two small JSON files have no LFS oid, so
// their digests are trust-on-first-use (taken from the downloaded bytes
// on 17 Oct 2026). They are stored under <cache>/<model>/<path>, the
// layout Transformers.js reads with its default revision, so the runtime
// loads them with remote downloads disabled. Transformers.js 4.3.1 looks
// tokenizer files up under the DEFAULT revision, so passing `revision` to
// pipeline() cannot find a pinned cache ("this.tokenizer is not a
// function"); the cache is therefore not keyed by revision and the
// SHA-256 CHECK BELOW is what ties the bytes on disk to the pinned
// revision.
export const MODEL_FILES: readonly ModelFile[] = [
  { path: "config.json", sha256: "cb99455288675345e1a4f411438d5d0adbba5fbd3a67ea4fb03c015433b996c1" },
  { path: "tokenizer_config.json", sha256: "a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b" },
  { path: "tokenizer.json", sha256: "0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39" },
  { path: "onnx/model_quantized.onnx", sha256: "f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193" },
];

/* ---------------------------------------------------------------- *
 * EMBEDDING constant: the model + revision + space the rest of the *
 * code stores alongside every vector.                             *
 * ---------------------------------------------------------------- */

export const EMBEDDING = {
  model: "Xenova/multilingual-e5-small",
  revision: MODEL_REVISION,
  dtype: DTYPE,
  space: buildSpace({
    model: "Xenova/multilingual-e5-small",
    revision: MODEL_REVISION,
    dtype: DTYPE,
    dim: EMBEDDING_DIM,
    textRecipe: TEXT_RECIPE,
    prefix: PREFIX,
    roleByKind: ROLE_BY_KIND,
    pooling: POOLING_OPTIONS.pooling,
    normalize: POOLING_OPTIONS.normalize,
  }),
} as const;

/* ---------------------------------------------------------------- *
 * Legacy helpers kept for the existing P3 callers.                *
 * ---------------------------------------------------------------- */

/**
 * The space tag we store with each vector. Switching the model, the dtype,
 * the pooler, the prefix, or the normalisation is a space switch and
 * forces a full re-embed (TC-059). The format is "key=value" pairs joined
 * by ";" so a human can read it in a `psql` row. The hash of the
 * underlying components is included so the legacy form is consistent
 * with `buildSpace`.
 */
export function makeEmbeddingSpace(opts: {
  model: string;
  revision?: string | null;
  dtype: string;
  pooling: string;
  normalize: boolean;
  queryPrefix: string;
  passagePrefix: string;
}): string {
  const revision = opts.revision ?? (opts.model === EMBEDDING.model ? EMBEDDING.revision : null);
  const space = buildSpace({
    model: opts.model,
    revision,
    dtype: opts.dtype,
    dim: EMBEDDING_DIM,
    textRecipe: TEXT_RECIPE,
    prefix: { query: opts.queryPrefix, passage: opts.passagePrefix },
    roleByKind: ROLE_BY_KIND,
    pooling: opts.pooling,
    normalize: opts.normalize,
  });
  return [
    `model=${opts.model}`,
    `revision=${revision ?? "unknown"}`,
    `dtype=${opts.dtype}`,
    `pool=${opts.pooling}`,
    `normalize=${opts.normalize ? "true" : "false"}`,
    `query=${JSON.stringify(opts.queryPrefix)}`,
    `passage=${JSON.stringify(opts.passagePrefix)}`,
    `space=${space}`,
  ].join(";");
}

/* ---------------------------------------------------------------- *
 * Embedder interface and FakeEmbedder.                             *
 * ---------------------------------------------------------------- */

export type LocalEmbedderOptions = {
  model?: string;
  dtype?: "fp32" | "q8";
  cacheDir?: string;
  pooling?: "mean" | "cls";
  normalize?: boolean;
  queryPrefix?: string;
  passagePrefix?: string;
  revision?: string;
  /**
   * Allow Transformers.js itself to fetch model files from huggingface.co.
   * Defaults to `false`. Runtime and reembed paths must never go remote;
   * the repository's fetch script uses bounded, pinned-URL downloads and
   * then verifies/warmups with this flag false.
   */
  allowRemote?: boolean;
  /**
   * Override the pinned `MODEL_FILES` list. Tests use this to point
   * at small synthetic files; production never passes it. The default
   * is the pinned list in `MODEL_FILES`.
   */
  files?: readonly ModelFile[];
};

export type Embedder = {
  /** The model identifier (Hugging Face id). */
  readonly model: string;
  /** The pinned model revision / file hash, when the backend exposes one. */
  readonly revision: string | null;
  /** A short string that names the embedding space (see `makeEmbeddingSpace`). */
  readonly space: string;
  /** The vector dimension this embedder always produces. */
  readonly dimension: number;
  /** Embed a batch of texts. Returns a parallel array of Float32Array. */
  embed(texts: readonly string[]): Promise<Float32Array[]>;
};

/** Thrown by `embedTexts` / the Embedder when the embedder returns a bad vector. */
export class EmbeddingShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingShapeError";
  }
}

/**
 * Thrown by `getEmbedder()` when an embedder is requested that the
 * runtime has not been configured to use. Today the only configured
 * provider is "local" (the pinned Transformers.js model). Any other
 * value (e.g. an API provider) fails closed because no provider,
 * key, or price is configured (account and prices are UNKNOWN).
 */
export class EmbeddingNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingNotConfiguredError";
  }
}

/**
 * Wrap a raw embedder call and enforce the brief's invariants:
 *   * one Float32Array per input
 *   * each array has length EMBEDDING_DIM
 *   * each value is finite (no NaN / Infinity)
 *   * each vector is L2-normalised
 *
 * Throws `EmbeddingShapeError` (never silently accepts a bad vector) —
 * the brief explicitly says: "reject empty/zero/incorrect vectors".
 */
export function normaliseVectors(
  raw: readonly ArrayLike<number>[],
  expectedDim: number = EMBEDDING_DIM,
): Float32Array[] {
  if (raw.length === 0) return [];
  const out: Float32Array[] = new Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const v = raw[i];
    if (v.length !== expectedDim) {
      throw new EmbeddingShapeError(`expected length ${expectedDim}, got ${v.length}`);
    }
    const arr = new Float32Array(expectedDim);
    let norm2 = 0;
    for (let j = 0; j < expectedDim; j++) {
      const x = v[j];
      if (!Number.isFinite(x)) throw new EmbeddingShapeError("non-finite value");
      arr[j] = x;
      norm2 += x * x;
    }
    if (norm2 === 0) throw new EmbeddingShapeError("zero vector");
    const inv = 1 / Math.sqrt(norm2);
    for (let j = 0; j < expectedDim; j++) arr[j] *= inv;
    out[i] = arr;
  }
  return out;
}

/**
 * Default production options for the local Transformers.js model. Matches
 * the e5 production policy in `docs/execution/evidence/embedding-spike.md`:
 * `query: ` / `passage: ` prefix, mean pooling, L2 normalisation, q8
 * dtype (chosen for the spike; fp32 is also available via the `dtype`
 * option in LocalEmbedderOptions, but switching dtype changes the space).
 */
export const DEFAULT_LOCAL_OPTIONS: Required<
  Omit<LocalEmbedderOptions, "revision" | "cacheDir" | "allowRemote" | "files">
> = {
  model: EMBEDDING.model,
  dtype: "q8",
  pooling: "mean",
  normalize: true,
  queryPrefix: PREFIX.query,
  passagePrefix: PREFIX.passage,
};

/* ---------------------------------------------------------------- *
 * Cache verification (SHA-256 of every pinned file).              *
 * ---------------------------------------------------------------- */

function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

const verified = new Set<string>();

/**
 * Checks, once per process, that every model file exists locally and
 * matches its SHA-256, and that the cache directories are not
 * world-writable. Fails closed with a `model:fetch` hint. This is what
 * ties the bytes on disk to the pinned revision: Transformers.js 4.3.1
 * looks tokenizer files up under the DEFAULT revision, so passing
 * `revision` to pipeline() cannot find a pinned cache; the SHA-256 check
 * is the only thing that proves the pinned revision is on disk.
 */
export async function verifyModelCache(
  cacheDir: string = defaultCacheDir(),
  files: readonly ModelFile[] = MODEL_FILES,
  model: string = EMBEDDING.model,
): Promise<void> {
  const key = JSON.stringify([cacheDir, model, files]);
  if (verified.has(key)) return;
  const hint = "run `npm run model:fetch`";
  for (const dir of [cacheDir, join(cacheDir, model)]) {
    if (!existsSync(dir)) {
      throw new Error(
        `embedding model is not available locally (${hint}): ${dir} is missing`,
      );
    }
    if (process.platform !== "win32" && (statSync(dir).mode & 0o002) !== 0) {
      throw new Error(
        `embedding model cache ${dir} is world-writable; refusing to load model files from it (chmod o-w, then ${hint})`,
      );
    }
  }
  for (const file of files) {
    const path = join(cacheDir, model, file.path);
    if (!existsSync(path)) {
      throw new Error(
        `embedding model is not available locally (${hint}); missing ${file.path}`,
      );
    }
    if ((await sha256File(path)) !== file.sha256) {
      throw new Error(
        `embedding model file ${file.path} does not match its pinned SHA-256 (corrupt or replaced); ${hint}`,
      );
    }
  }
  verified.add(key);
}

/* ---------------------------------------------------------------- *
 * Production loader.                                               *
 * ---------------------------------------------------------------- */

/**
 * Cached pipeline slots on globalThis so a Next.js dev hot reload does
 * not leak a pipeline per edit. Each model/cache/recipe configuration
 * gets a distinct slot; reusing a model/cache path with a different dtype,
 * revision, prefix or normalisation must not return the earlier pipeline.
 */
type CachedSlot = { promise: Promise<Embedder> | null };
type SlotTable = Record<string, CachedSlot>;

function slotTable(): SlotTable {
  const g = globalThis as unknown as { __feraEmbedderSlots?: SlotTable };
  if (!g.__feraEmbedderSlots) g.__feraEmbedderSlots = {};
  return g.__feraEmbedderSlots;
}

function cacheKey(options: {
  model: string;
  revision?: string;
  dtype: string;
  cacheDir: string;
  pooling: string;
  normalize: boolean;
  queryPrefix: string;
  passagePrefix: string;
  allowRemote: boolean;
  files?: readonly ModelFile[];
}): string {
  const identity = JSON.stringify([
    options.model,
    options.revision ?? null,
    options.dtype,
    options.cacheDir,
    options.pooling,
    options.normalize,
    options.queryPrefix,
    options.passagePrefix,
    options.allowRemote,
    options.files ?? MODEL_FILES,
  ]);
  return createHash("sha256").update(identity).digest("hex");
}

/**
 * Lazily load the local Transformers.js pipeline and return an Embedder.
 * The first call verifies the on-disk cache against the pinned SHA-256
 * digests (see `verifyModelCache`) and then loads the pipeline; the
 * runtime never reaches huggingface.co.
 *
 * The loader REFUSES to fetch from huggingface.co: it sets
 * `env.allowRemoteModels = false` on the Transformers.js environment
 * before calling `pipeline()`. Operators must prime the cache with
 * `scripts/model-fetch.mjs`, which downloads only pinned public URLs and
 * then calls this loader with `allowRemote: false`.
 *
 * `allowRemote: true` is a guarded debug/test escape hatch. The only
 * documented production caller that ever needs it is the fetch
 * priming path (it flips the flag off again before reaching
 * `pipeline()`). When set, the loader fails closed BEFORE any
 * `pipeline(...)` call, surfacing the intent in the error message and
 * the model:fetch hint. This is what ties the runtime to the verified
 * cache: the runtime path cannot be tricked into loading substituted
 * bytes from the network, even by a misconfigured caller.
 *
 * The import of `@huggingface/transformers` is inside the function so a
 * test that only uses FakeEmbedder never touches the heavy native
 * dependency.
 */
export async function loadLocalEmbedder(
  opts: LocalEmbedderOptions = {},
): Promise<Embedder> {
  const merged = { ...DEFAULT_LOCAL_OPTIONS, ...opts };
  const cacheDir = merged.cacheDir ?? defaultCacheDir();
  const allowRemote = merged.allowRemote === true;
  // SECURITY HARDENING: refuse `allowRemote: true` before the pipeline
  // is built. The runtime path and the reembed script never need
  // network downloads; only the model:fetch priming path does, and
  // even it sets this flag back to false before reaching
  // `pipeline(...)`. A caller that asks for remote at runtime is
  // either misconfigured or compromised, so the loader fails closed
  // with a clear `model:fetch` hint. Skipping this check would let
  // the runtime silently fall through to huggingface.co if the
  // on-disk cache is missing or corrupted.
  if (allowRemote) {
    throw new Error(
      "embedding loader refused: allowRemote: true is not a runtime " +
      "option; the model is verified against the pinned SHA-256 cache. " +
      "Run `npm run model:fetch` to prime the cache, then call " +
      "loadLocalEmbedder() without allowRemote.",
    );
  }
  const key = cacheKey({ ...merged, cacheDir, allowRemote });
  const table = slotTable();
  const slot = table[key] ?? { promise: null };
  if (slot.promise) return slot.promise;

  const mergedOpts = { ...merged, cacheDir, allowRemote };
  slot.promise = (async (): Promise<Embedder> => {
    // SECURITY HARDENING: verify the on-disk cache first. A missing or
    // tampered file fails closed with a model:fetch hint. We do not let
    // a missing cache fall through to the pipeline — the pipeline would
    // either fail with a confusing tokenizer error (if the file is
    // missing) or happily load a substituted file (if it has been
    // replaced). The verify step is the only thing that ties the bytes
    // to the pinned revision.
    if (!allowRemote) {
      await verifyModelCache(cacheDir, mergedOpts.files ?? MODEL_FILES);
    }
    // Dynamic import: the heavy onnxruntime-node bundle is only loaded
    // when this function is actually called. Unit tests with
    // FakeEmbedder skip it.
    const mod = await import("@huggingface/transformers");
    const { env, pipeline } = mod as unknown as {
      env: { cacheDir: string; allowRemoteModels: boolean; allowLocalModels?: boolean; localModelPath?: string };
      pipeline: (
        task: "feature-extraction",
        model: string,
        options: Record<string, unknown>,
      ) => Promise<
        (
          text: string | string[],
          options: Record<string, unknown>,
        ) => Promise<{ data: Float32Array; dims: number[] }>
      >;
    };
    // SECURITY HARDENING: default the loader to refuse remote
    // downloads. The model-fetch script uses its own bounded downloader
    // for pinned URLs and also loads the pipeline with this flag false.
    // The earlier allowRemote check has already failed closed for any
    // caller that requested remote, so the assignment here is always
    // `false`.
    env.allowRemoteModels = allowRemote;
    env.cacheDir = cacheDir;
    const pipelineOptions: Record<string, unknown> = { dtype: mergedOpts.dtype };
    if (typeof mergedOpts.revision === "string" && mergedOpts.revision.length > 0) {
      pipelineOptions.revision = mergedOpts.revision;
    }
    const extractor = await pipeline("feature-extraction", mergedOpts.model, pipelineOptions);
    // Warm up so the first user call has a known cost shape; failures
    // throw here. We embed the passage-side warm text so the warm-up
    // exercises the documented path.
    await extractor(mergedOpts.passagePrefix + "warm", {
      pooling: mergedOpts.pooling,
      normalize: mergedOpts.normalize,
    });
    const revision =
      mergedOpts.revision ??
      (mergedOpts.model === EMBEDDING.model
        ? EMBEDDING.revision
        : readRevisionFromCache(cacheDir, mergedOpts.model));
    const space = makeEmbeddingSpace({ ...mergedOpts, revision });
    return {
      model: mergedOpts.model,
      revision,
      space,
      dimension: EMBEDDING_DIM,
      async embed(texts: readonly string[]): Promise<Float32Array[]> {
        if (texts.length === 0) return [];
        const out = await extractor(texts as string[], {
          pooling: mergedOpts.pooling,
          normalize: mergedOpts.normalize,
        });
        // Transformers.js returns a single tensor when input is a
        // single string, and one row per text otherwise; we always
        // pass an array, so we get an array of length texts.length,
        // each a Float32Array of length 384.
        const list: ArrayLike<number>[] = [];
        const data = out.data;
        const dim = out.dims[out.dims.length - 1] ?? EMBEDDING_DIM;
        if (texts.length === 1) {
          list.push(data);
        } else {
          for (let i = 0; i < texts.length; i++) {
            const start = i * dim;
            const slice = new Float32Array(dim);
            for (let j = 0; j < dim; j++) slice[j] = data[start + j];
            list.push(slice);
          }
        }
        return normaliseVectors(list, EMBEDDING_DIM);
      },
    };
  })();
  table[key] = slot;
  return slot.promise;
}

function readRevisionFromCache(cacheDir: string, model: string): string | null {
  // Transformers.js stores a `refs/main` file next to the snapshot; we
  // read it best-effort and fall back to null. The pinned revision is
  // already exported as EMBEDDING.revision; this lookup is here so a
  // pipeline that was loaded without an explicit revision still has
  // some signal to record.
  try {
    const path = `${cacheDir}/${model}/refs/main`;
    if (existsSync(path)) {
      const v = readFileSync(path, "utf8").trim();
      return v.length === 0 ? null : v;
    }
  } catch {
    // cache may not exist yet on the first run; that is fine
  }
  return null;
}

/** Test-only seam: forget the cached pipeline so a test can re-load. */
export function _resetLocalEmbedderForTests(): void {
  const table = slotTable();
  for (const key of Object.keys(table)) delete table[key];
  // Also forget the verified-cache memo so a test that intentionally
  // manipulates the cache (e.g. corrupts a file and expects a
  // re-verification) actually re-checks.
  verified.clear();
}

/* ---------------------------------------------------------------- *
 * FakeEmbedder: deterministic 384-d vectors, no model download.   *
 * ---------------------------------------------------------------- */

function hash32(input: string): number {
  // FNV-1a 32-bit; deterministic, no crypto module needed in tests.
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function hashToVector(text: string, dim: number): Float32Array {
  // Derive the vector from a seeded, reproducible LCG so the same text
  // always produces the same 384-d vector. We do not L2-normalise
  // here — `normaliseVectors()` does, which keeps the invariant in one
  // place.
  const seed = hash32(text);
  const v = new Float32Array(dim);
  let s = seed || 1;
  for (let i = 0; i < dim; i++) {
    // Numerical Recipes LCG; cheap, deterministic, full-period for our
    // range.
    s = Math.imul(s, 1664525) + 1013904223;
    s = s >>> 0;
    v[i] = ((s & 0xffff) / 0x8000) - 1; // [-1, 1)
  }
  return v;
}

export type FakeEmbedderOptions = {
  model?: string;
  space?: string;
  dimension?: number;
};

/**
 * Create a deterministic fake embedder. Same input always produces the
 * same 384-d vector. Used by every unit test in `tests/embeddings` and
 * the database-level `tests/db/reembed.test.ts`.
 */
export function createFakeEmbedder(opts: FakeEmbedderOptions = {}): Embedder {
  const model = opts.model ?? "fake/multilingual-e5-small";
  // Default the fake to the production space shape so tests that read
  // the space get something realistic. Tests that need a different
  // space can pass one explicitly.
  const space =
    opts.space ??
    makeEmbeddingSpace({
      model,
      revision: "fake-rev-1",
      dtype: "fake",
      pooling: "mean",
      normalize: true,
      queryPrefix: PREFIX.query,
      passagePrefix: PREFIX.passage,
    });
  const dimension = opts.dimension ?? EMBEDDING_DIM;
  return {
    model,
    revision: "fake-rev-1",
    space,
    dimension,
    async embed(texts: readonly string[]): Promise<Float32Array[]> {
      const raws = texts.map((t) => Array.from(hashToVector(t, dimension)));
      return normaliseVectors(raws, dimension);
    },
  };
}

/* ---------------------------------------------------------------- *
 * Provider switch (getEmbedder / setEmbedder / embedText).         *
 *                                                                  *
 * The runtime path is OFFLINE ONLY: the local embedder reads from  *
 * the verified cache, never from huggingface.co. `EMBED_PROVIDER`  *
 * selects the provider; today the only valid value is `local`. An  *
 * unknown or `api` value fails closed.                             *
 * ---------------------------------------------------------------- */

let injectedEmbedder: Embedder | null = null;
let localPipeline: Promise<Embedder> | null = null;

// Lazy: selecting the provider loads nothing; the model loads on the
// first embed.
const lazyLocal: Embedder = {
  async embed(texts: readonly string[]): Promise<Float32Array[]> {
    if (!localPipeline) {
      localPipeline = loadLocalEmbedder({ allowRemote: false }).catch((err) => {
        localPipeline = null; // allow a retry after model:fetch
        throw err;
      });
    }
    const e = await localPipeline;
    return e.embed(texts);
  },
  get model() { return EMBEDDING.model; },
  get revision() { return EMBEDDING.revision; },
  get space() { return EMBEDDING.space; },
  get dimension() { return EMBEDDING_DIM; },
};

/**
 * Tests inject a deterministic fake here; pass `null` to restore the
 * configured provider. The injection is in-memory and process-local.
 */
export function setEmbedder(embedder: Embedder | null): void {
  injectedEmbedder = embedder;
  // Also reset the lazy local pipeline so a test that changes the
  // cache (or the pinned file list) actually re-loads on the next
  // call.
  localPipeline = null;
}

/**
 * Select the embedder for this request. The default is `local` (the
 * pinned, offline Transformers.js model). `api` and any other value
 * fail closed with `EmbeddingNotConfiguredError` because no provider,
 * key, or price is configured (account and prices are UNKNOWN).
 */
export function getEmbedder(): Embedder {
  if (injectedEmbedder) return injectedEmbedder;
  const provider = process.env.EMBED_PROVIDER || "local";
  if (provider === "api") {
    throw new EmbeddingNotConfiguredError(
      "EMBED_PROVIDER=api is not configured: no embeddings provider is wired (account and prices UNKNOWN). Use EMBED_PROVIDER=local.",
    );
  }
  if (provider !== "local") {
    throw new EmbeddingNotConfiguredError(
      `EMBED_PROVIDER must be "local" or "api", got ${JSON.stringify(provider)}`,
    );
  }
  return lazyLocal;
}

/**
 * 384-d, L2-normalised. NFC-normalises the text, then applies the
 * `query: ` or `passage: ` prefix per `ROLE_BY_KIND`. Used by the
 * caller-side helper that reuses the production embedder.
 */
export async function embedOneText(text: string, role: EmbeddingRole): Promise<Float32Array> {
  const embedder = getEmbedder();
  const [v] = await embedder.embed([PREFIX[role] + text.normalize("NFC")]);
  return v;
}
