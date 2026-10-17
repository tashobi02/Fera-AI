// TASK-016 / COMP-011: the embedding interface and loaders (P3-024).
//
// The Embedder interface is the only thing the rest of the codebase depends on.
// Tests pass a FAKE embedder (deterministic 384-d vectors) and never download
// the model. Production calls `loadLocalEmbedder` which lazily imports
// `@huggingface/transformers`, downloads the model into a gitignored cache
// directory the first time, and is cached on `globalThis` so a Next.js dev
// hot reload does not leak a pipeline per edit.
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
import { existsSync, readFileSync } from "node:fs";

export const EMBEDDING_DIM = 384;

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
export const DEFAULT_LOCAL_OPTIONS: Required<Omit<LocalEmbedderOptions, "revision" | "cacheDir">> = {
  model: "Xenova/multilingual-e5-small",
  dtype: "fp32",
  pooling: "mean",
  normalize: true,
  queryPrefix: "query: ",
  passagePrefix: "passage: ",
};

/**
 * Cached pipeline slot. Survives Next.js dev hot reloads via globalThis so we
 * do not download the model every edit.
 */
type CachedSlot = { promise: Promise<Embedder> | null };

function slot(): CachedSlot {
  const g = globalThis as unknown as { __feraEmbedderSlot?: CachedSlot };
  if (!g.__feraEmbedderSlot) g.__feraEmbedderSlot = { promise: null };
  return g.__feraEmbedderSlot;
}

/**
 * Lazily load the local Transformers.js pipeline and return an Embedder.
 * The first call downloads the model into `cacheDir` (default `.cache/models`,
 * already gitignored). Subsequent calls reuse the cached pipeline.
 *
 * The import of `@huggingface/transformers` is inside the function so a test
 * that only uses FakeEmbedder never touches the heavy native dependency.
 */
export async function loadLocalEmbedder(opts: LocalEmbedderOptions = {}): Promise<Embedder> {
  const s = slot();
  if (s.promise) return s.promise;
  const merged = { ...DEFAULT_LOCAL_OPTIONS, ...opts };
  const cacheDir = merged.cacheDir ?? ".cache/models";
  s.promise = (async (): Promise<Embedder> => {
    // Dynamic import: the heavy onnxruntime-node bundle is only loaded when
    // this function is actually called. Unit tests with FakeEmbedder skip it.
    const mod = await import("@huggingface/transformers");
    const { env, pipeline } = mod as unknown as {
      env: { cacheDir: string; localModelPath?: string };
      pipeline: (
        task: "feature-extraction",
        model: string,
        options: Record<string, unknown>,
      ) => Promise<(text: string | string[], options: Record<string, unknown>) => Promise<{ data: Float32Array; dims: number[] }>>;
    };
    env.cacheDir = cacheDir;
    const extractor = await pipeline("feature-extraction", merged.model, { dtype: merged.dtype });
    // Warm up so the first user call has a known cost shape; failures throw here.
    await extractor(merged.passagePrefix + "warm", {
      pooling: merged.pooling,
      normalize: merged.normalize,
    });
    const revision = readRevisionFromCache(cacheDir, merged.model) ?? null;
    const space = makeEmbeddingSpace(merged);
    return {
      model: merged.model,
      revision,
      space,
      dimension: EMBEDDING_DIM,
      async embed(texts: readonly string[]): Promise<Float32Array[]> {
        if (texts.length === 0) return [];
        const out = await extractor(texts as string[], {
          pooling: merged.pooling,
          normalize: merged.normalize,
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
  return s.promise;
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
  slot().promise = null;
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
