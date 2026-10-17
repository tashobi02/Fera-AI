// TASK-016 / COMP-011: the embedding interface and loaders (P3-024).
//
// The Embedder interface is the only thing the rest of the codebase depends on.
// Tests pass a FAKE embedder (deterministic 384-d vectors) and never download
// the model. Production calls `loadLocalEmbedder` which lazily imports
// `@huggingface/transformers`, downloads the model into a gitignored cache
// directory the first time, and is cached per (model, cacheDir) on `globalThis`
// so a Next.js dev hot reload does not leak a pipeline per edit and so calls
// with different cache directories do not collide.
//
// `embedTexts` always returns L2-normalised Float32Array of length 384
// (D2A §2.3, schema_v2.sql `vector(384)`). The contract from the brief:
//   * 384 finite values per text
//   * L2-normalised
//   * rejects empty / zero / incorrect vectors
//
// The module never imports the heavy library at top level; the import is inside
// `loadLocalEmbedder` so a unit test that only uses FakeEmbedder never touches
// onnxruntime-node. `createFakeEmbedder` returns deterministic vectors derived
// from the text, so a test can assert on a known input/output pair.
//
// Security hardening (P3-024, this lane):
//   * The default loader refuses to fetch from huggingface.co: it sets
//     `env.allowRemoteModels = false` on the Transformers.js environment
//     before calling `pipeline()`. Only callers that pass
//     `allowRemote: true` (currently `scripts/model-fetch.mjs` and ad-hoc
//     CI priming scripts) can reach the network.
//   * The default cache directory is resolved from the repository root via
//     `import.meta.url`, not the current working directory, so the loader,
//     `scripts/reembed.mjs`, and `scripts/model-fetch.mjs` agree when run
//     from anywhere.
//   * Model revision: docs/execution/evidence/embedding-spike.md does not
//     record a specific revision hash, so we do NOT pin one. UNKNOWN: model
//     revision not pinned (not recorded in embedding-spike.md). The open
//     decision is listed in docs/execution/evidence/embedding-dependency-note.md.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EMBEDDING_DIM = 384;

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
 * The space tag we store with each vector. Switching the model, the dtype, the
 * pooler, the prefix, or the normalisation is a space switch and forces a
 * full re-embed (TC-059). The format is "key=value" pairs joined by ";" so
 * a human can read it in a `psql` row.
 */
export function makeEmbeddingSpace(opts: {
  model: string;
  dtype: string;
  pooling: string;
  normalize: boolean;
  queryPrefix: string;
  passagePrefix: string;
}): string {
  return [
    `model=${opts.model}`,
    `dtype=${opts.dtype}`,
    `pool=${opts.pooling}`,
    `normalize=${opts.normalize ? "true" : "false"}`,
    `query=${JSON.stringify(opts.queryPrefix)}`,
    `passage=${JSON.stringify(opts.passagePrefix)}`,
  ].join(";");
}

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
   * Allow the pipeline to fetch model files from huggingface.co.
   * Defaults to `false`; only scripts that explicitly need to populate the
   * cache (`scripts/model-fetch.mjs`, occasional CI priming) pass `true`.
   * The runtime path (loader + `scripts/reembed.mjs`) must never go
   * remote: if the cache is empty the call is allowed to fail and the
   * operator must prime the cache with `npm run model:fetch`.
   */
  allowRemote?: boolean;
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
 * Wrap a raw embedder call and enforce the brief's invariants:
 *   * one Float32Array per input
 *   * each array has length EMBEDDING_DIM
 *   * each value is finite (no NaN / Infinity)
 *   * each vector is L2-normalised
 *
 * Throws `EmbeddingShapeError` (never silently accepts a bad vector) — the
 * brief explicitly says: "reject empty/zero/incorrect vectors".
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
 * query: / passage: prefix, mean pooling, L2 normalisation, fp32 dtype.
 */
export const DEFAULT_LOCAL_OPTIONS: Required<Omit<LocalEmbedderOptions, "revision" | "cacheDir" | "allowRemote">> = {
  model: "Xenova/multilingual-e5-small",
  dtype: "fp32",
  pooling: "mean",
  normalize: true,
  queryPrefix: "query: ",
  passagePrefix: "passage: ",
};

/**
 * Cached pipeline slots. Keyed by `(model, cacheDir)` on globalThis so a
 * Next.js dev hot reload does not leak a pipeline per edit AND so calls
 * with different cache directories (e.g. a unit test that wants its own
 * cache root) do not collide.
 */
type CachedSlot = { promise: Promise<Embedder> | null };
type SlotTable = Record<string, CachedSlot>;

function slotTable(): SlotTable {
  const g = globalThis as unknown as { __feraEmbedderSlots?: SlotTable };
  if (!g.__feraEmbedderSlots) g.__feraEmbedderSlots = {};
  return g.__feraEmbedderSlots;
}

function cacheKey(model: string, cacheDir: string): string {
  return `${model}::${cacheDir}`;
}

/**
 * Lazily load the local Transformers.js pipeline and return an Embedder.
 * The first call downloads the model into `cacheDir` (default `.cache/models`
 * anchored at the repository root, already gitignored). Subsequent calls
 * with the same `(model, cacheDir)` reuse the cached pipeline.
 *
 * By default the loader REFUSES to fetch from huggingface.co: it sets
 * `env.allowRemoteModels = false` on the Transformers.js environment
 * before calling `pipeline()`. Operators must prime the cache with
 * `scripts/model-fetch.mjs` (which passes `allowRemote: true`). This is
 * the security hardening required by the runtime path of P3-024.
 *
 * The import of `@huggingface/transformers` is inside the function so a test
 * that only uses FakeEmbedder never touches the heavy native dependency.
 *
 * UNKNOWN: model revision not pinned (not recorded in
 * docs/execution/evidence/embedding-spike.md). We do not invent a hash;
 * the loader uses the model id alone and reads the optional `refs/main`
 * file best-effort after the pipeline is built. Listed as an open decision
 * in `docs/execution/evidence/embedding-dependency-note.md`.
 */
export async function loadLocalEmbedder(opts: LocalEmbedderOptions = {}): Promise<Embedder> {
  const merged = { ...DEFAULT_LOCAL_OPTIONS, ...opts };
  const cacheDir = merged.cacheDir ?? DEFAULT_CACHE_DIR;
  const allowRemote = merged.allowRemote === true;
  const key = cacheKey(merged.model, cacheDir);
  const table = slotTable();
  const slot = table[key] ?? { promise: null };
  if (slot.promise) return slot.promise;

  const mergedOpts = { ...merged, cacheDir, allowRemote };
  slot.promise = (async (): Promise<Embedder> => {
    // Dynamic import: the heavy onnxruntime-node bundle is only loaded when
    // this function is actually called. Unit tests with FakeEmbedder skip it.
    const mod = await import("@huggingface/transformers");
    const { env, pipeline } = mod as unknown as {
      env: { cacheDir: string; allowRemoteModels: boolean; localModelPath?: string };
      pipeline: (
        task: "feature-extraction",
        model: string,
        options: Record<string, unknown>,
      ) => Promise<(text: string | string[], options: Record<string, unknown>) => Promise<{ data: Float32Array; dims: number[] }>>;
    };
    // SECURITY HARDENING: default the loader to refuse remote downloads.
    // The brief is explicit: only scripts/model-fetch.mjs passes
    // allowRemote=true (see LocalEmbedderOptions.allowRemote).
    env.allowRemoteModels = allowRemote;
    env.cacheDir = cacheDir;
    const pipelineOptions: Record<string, unknown> = { dtype: mergedOpts.dtype };
    if (typeof mergedOpts.revision === "string" && mergedOpts.revision.length > 0) {
      pipelineOptions.revision = mergedOpts.revision;
    }
    const extractor = await pipeline("feature-extraction", mergedOpts.model, pipelineOptions);
    // Warm up so the first user call has a known cost shape; failures throw here.
    await extractor(mergedOpts.passagePrefix + "warm", {
      pooling: mergedOpts.pooling,
      normalize: mergedOpts.normalize,
    });
    const revision = mergedOpts.revision ?? readRevisionFromCache(cacheDir, mergedOpts.model) ?? null;
    const space = makeEmbeddingSpace(mergedOpts);
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
        // Transformers.js returns a single tensor when input is a single string,
        // and one row per text otherwise; we always pass an array, so we get an
        // array of length texts.length, each a Float32Array of length 384.
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
  // Transformers.js stores a `refs/main` file next to the snapshot; we read it
  // best-effort and fall back to null. The brief allows null when the backend
  // does not expose one — the model id + dtype + space are already pinned.
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
}

/* ---------------------------------------------------------------- *
 * FakeEmbedder: deterministic 384-d vectors, no model download.     *
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
  // Derive the vector from a seeded, reproducible LCG so the same text always
  // produces the same 384-d vector. We do not L2-normalise here —
  // normaliseVectors() does, which keeps the invariant in one place.
  const seed = hash32(text);
  const v = new Float32Array(dim);
  let s = seed || 1;
  for (let i = 0; i < dim; i++) {
    // Numerical Recipes LCG; cheap, deterministic, full-period for our range.
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
 * Create a deterministic fake embedder. Same input always produces the same
 * 384-d vector. Used by every unit test in `tests/embeddings`.
 */
export function createFakeEmbedder(opts: FakeEmbedderOptions = {}): Embedder {
  const model = opts.model ?? "fake/multilingual-e5-small";
  const space = opts.space ?? makeEmbeddingSpace({
    model,
    dtype: "fake",
    pooling: "mean",
    normalize: true,
    queryPrefix: "query: ",
    passagePrefix: "passage: ",
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