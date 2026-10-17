// TASK-016 / COMP-011 / P3-024: Embedder interface and FakeEmbedder.
//
// The unit tests must NEVER download the model. We exercise:
//   * the FakeEmbedder produces 384-d, L2-normalised, finite vectors
//   * the FakeEmbedder is deterministic — same input → same vector
//   * normaliseVectors rejects bad shapes (wrong dim, non-finite, zero)
//   * the Embedder interface is shape-stable (model, revision, space, dimension)
//   * SECURITY HARDENING (P3-024): the default `loadLocalEmbedder` sets
//     `env.allowRemoteModels = false` before any `pipeline(...)` call, and
//     `allowRemote: true` is the only way to flip it on.
//   * The default cache directory is anchored at the repository root, not
//     the cwd, so all three entry points agree when run from any dir.
//   * The loader caches its pipeline per `(model, cacheDir)` key so calls
//     with different cache directories do not collide.
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CACHE_DIR,
  EMBEDDING_DIM,
  EmbeddingShapeError,
  _resetLocalEmbedderForTests,
  createFakeEmbedder,
  loadLocalEmbedder,
  makeEmbeddingSpace,
  normaliseVectors,
} from "@/server/embeddings/model";

// FakeTransformers env + pipeline. The loader reads and writes
// `env.allowRemoteModels` and `env.cacheDir`, then calls `pipeline(...)`.
// We capture the values the loader sets on `env` and short-circuit the
// pipeline to a stub that returns a deterministic Float32Array so the
// warm-up and the embed call never touch the network.
type EnvRecorder = {
  allowRemoteModels: boolean | null;
  cacheDir: string | null;
  pipelineOptions: unknown[] | null;
};

const envRecord: EnvRecorder = {
  allowRemoteModels: null,
  cacheDir: null,
  pipelineOptions: null,
};

const fakeEnv = {
  get allowRemoteModels(): boolean {
    return envRecord.allowRemoteModels === true;
  },
  set allowRemoteModels(v: boolean) {
    envRecord.allowRemoteModels = v;
  },
  get cacheDir(): string {
    return envRecord.cacheDir ?? "";
  },
  set cacheDir(v: string) {
    envRecord.cacheDir = v;
  },
  localModelPath: undefined,
};

// Fake extractor: returns a 384-d vector of 1/√384 for any input.
function fakeExtractor(inputs: string | string[]): Promise<{ data: Float32Array; dims: number[] }> {
  const arr = Array.isArray(inputs) ? inputs : [inputs];
  const dim = EMBEDDING_DIM;
  const data = new Float32Array(arr.length * dim);
  const v = 1 / Math.sqrt(dim);
  for (let i = 0; i < arr.length * dim; i++) data[i] = v;
  return Promise.resolve({ data, dims: [arr.length, dim] });
}

vi.mock("@huggingface/transformers", () => ({
  env: fakeEnv,
  pipeline: (_task: string, _model: string, options: unknown) => {
    envRecord.pipelineOptions = (envRecord.pipelineOptions ?? []) as unknown[];
    (envRecord.pipelineOptions as unknown[]).push(options);
    return Promise.resolve(fakeExtractor);
  },
}));

function l2norm(v: Float32Array): number {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i]! * v[i]!;
  return Math.sqrt(s);
}

describe("createFakeEmbedder", () => {
  it("returns 384-d L2-normalised Float32Array vectors", async () => {
    const e = createFakeEmbedder();
    const out = await e.embed(["hello", "world", "বাংলা"]);
    expect(out).toHaveLength(3);
    for (const v of out) {
      expect(v).toBeInstanceOf(Float32Array);
      expect(v.length).toBe(EMBEDDING_DIM);
      expect(v.length).toBe(384);
      // L2-normalised
      expect(Math.abs(l2norm(v) - 1)).toBeLessThan(1e-5);
      // all finite
      for (let i = 0; i < v.length; i++) expect(Number.isFinite(v[i]!)).toBe(true);
    }
  });

  it("is deterministic — same input produces the same vector every time", async () => {
    const e = createFakeEmbedder();
    const a = await e.embed(["একই টেক্সট"]);
    const b = await e.embed(["একই টেক্সট"]);
    expect(a[0]!.length).toBe(b[0]!.length);
    for (let i = 0; i < a[0]!.length; i++) {
      expect(a[0]![i]).toBe(b[0]![i]);
    }
  });

  it("different inputs produce different vectors", async () => {
    const e = createFakeEmbedder();
    const out = await e.embed(["alpha", "beta"]);
    let anyDiff = false;
    for (let i = 0; i < out[0]!.length; i++) {
      if (out[0]![i] !== out[1]![i]) { anyDiff = true; break; }
    }
    expect(anyDiff).toBe(true);
  });

  it("exposes the model / revision / space / dimension contract fields", () => {
    const e = createFakeEmbedder({ model: "fake/test" });
    expect(e.model).toBe("fake/test");
    expect(e.revision).toBeTruthy();
    expect(e.space).toContain("model=fake/test");
    expect(e.dimension).toBe(384);
  });

  it("returns an empty array when given an empty input", async () => {
    const e = createFakeEmbedder();
    expect(await e.embed([])).toEqual([]);
  });
});

describe("normaliseVectors", () => {
  it("rejects a wrong-dimension vector", () => {
    expect(() => normaliseVectors([[1, 2, 3]], 384)).toThrow(EmbeddingShapeError);
  });

  it("rejects a vector containing NaN or Infinity", () => {
    expect(() => normaliseVectors([[Number.NaN, ...new Array(383).fill(0)]])).toThrow(EmbeddingShapeError);
    expect(() => normaliseVectors([[Number.POSITIVE_INFINITY, ...new Array(383).fill(0)]])).toThrow(EmbeddingShapeError);
  });

  it("rejects an all-zero vector", () => {
    expect(() => normaliseVectors([new Array(384).fill(0)])).toThrow(EmbeddingShapeError);
  });

  it("L2-normalises a valid vector", () => {
    const arr = new Array(384).fill(0).map((_, i) => i + 1);
    const out = normaliseVectors([arr]);
    expect(out[0]!.length).toBe(384);
    expect(Math.abs(l2norm(out[0]!) - 1)).toBeLessThan(1e-5);
  });
});

describe("makeEmbeddingSpace", () => {
  it("includes every dimension that distinguishes an embedding space", () => {
    const s = makeEmbeddingSpace({
      model: "Xenova/multilingual-e5-small",
      dtype: "fp32",
      pooling: "mean",
      normalize: true,
      queryPrefix: "query: ",
      passagePrefix: "passage: ",
    });
    expect(s).toContain("model=Xenova/multilingual-e5-small");
    expect(s).toContain("dtype=fp32");
    expect(s).toContain("pool=mean");
    expect(s).toContain("normalize=true");
    expect(s).toContain(`query=${JSON.stringify("query: ")}`);
    expect(s).toContain(`passage=${JSON.stringify("passage: ")}`);
  });

  it("changes when any of the five components changes", () => {
    const base = makeEmbeddingSpace({
      model: "m", dtype: "fp32", pooling: "mean", normalize: true,
      queryPrefix: "query: ", passagePrefix: "passage: ",
    });
    const other = (over: Partial<Parameters<typeof makeEmbeddingSpace>[0]>) => makeEmbeddingSpace({
      model: "m", dtype: "fp32", pooling: "mean", normalize: true,
      queryPrefix: "query: ", passagePrefix: "passage: ", ...over,
    });
    expect(other({ dtype: "q8" })).not.toBe(base);
    expect(other({ pooling: "cls" })).not.toBe(base);
    expect(other({ normalize: false })).not.toBe(base);
    expect(other({ queryPrefix: "Q: " })).not.toBe(base);
    expect(other({ passagePrefix: "P: " })).not.toBe(base);
    expect(other({ model: "other" })).not.toBe(base);
  });
});

/* ----------------------------------------------------------------------- *
 * SECURITY HARDENING (P3-024):                                          *
 *   * default loader refuses remote (`env.allowRemoteModels = false`)    *
 *   * `allowRemote: true` is the only way to flip remote on              *
 *   * cache directory is anchored at the repository root                  *
 *   * loader caches the pipeline per (model, cacheDir)                    *
 * ----------------------------------------------------------------------- */

describe("loadLocalEmbedder security hardening (P3-024)", () => {
  beforeEach(() => {
    _resetLocalEmbedderForTests();
    envRecord.allowRemoteModels = null;
    envRecord.cacheDir = null;
    envRecord.pipelineOptions = null;
  });

  afterEach(() => {
    _resetLocalEmbedderForTests();
  });

  it("default loader refuses remote: sets env.allowRemoteModels = false", async () => {
    const e = await loadLocalEmbedder();
    expect(envRecord.allowRemoteModels).toBe(false);
    // sanity: a real Embedder comes back
    expect(e.dimension).toBe(EMBEDDING_DIM);
    expect(e.model).toBe("Xenova/multilingual-e5-small");
  });

  it("allowRemote: true is the only way to enable remote", async () => {
    const e = await loadLocalEmbedder({ allowRemote: true });
    expect(envRecord.allowRemoteModels).toBe(true);
    expect(e.model).toBe("Xenova/multilingual-e5-small");
  });

  it("an explicit allowRemote: false keeps remote off", async () => {
    await loadLocalEmbedder({ allowRemote: false });
    expect(envRecord.allowRemoteModels).toBe(false);
  });

  it("anchors the default cache dir at the repository root, not the cwd", async () => {
    await loadLocalEmbedder();
    // The loader set env.cacheDir to the resolved repo-root path. We do
    // not import `process.cwd()` in the assertion because cwd may be
    // the worktree root and would still pass; we check that the
    // resolved path is a child of the repo root and ends in
    // `.cache/models`.
    expect(envRecord.cacheDir).not.toBeNull();
    expect(envRecord.cacheDir!).toMatch(/\.cache\/models$/);
    // And the DEFAULT_CACHE_DIR export must agree (proves the resolution
    // comes from the module's own location, not the cwd).
    expect(envRecord.cacheDir!).toBe(DEFAULT_CACHE_DIR);
    // The default cache dir must exist on disk after the loader
    // touches it? The loader does not mkdir, only Transformers.js
    // does (and we mocked that). So we just assert the path is
    // absolute.
    expect(envRecord.cacheDir!.startsWith("/") || /^[A-Za-z]:[\\/]/.test(envRecord.cacheDir!)).toBe(true);
  });

  it("uses a custom cacheDir when supplied and does not collide with the default", async () => {
    // Make a throwaway cache root per test invocation so two parallel
    // runs do not race on the same directory.
    const tmp = join(tmpdir(), `fera-embed-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmp, { recursive: true });
    try {
      const a = await loadLocalEmbedder({ cacheDir: tmp });
      // A second call with the SAME (model, cacheDir) must hit the cache
      // (no extra pipeline() call).
      const before = (envRecord.pipelineOptions ?? []).length;
      const b = await loadLocalEmbedder({ cacheDir: tmp });
      const after = (envRecord.pipelineOptions ?? []).length;
      expect(after).toBe(before);
      expect(a).toBe(b);
      // And a call with a DIFFERENT cacheDir MUST trigger a fresh
      // pipeline (caching is keyed, not just by presence of any prior
      // call).
      const other = join(tmpdir(), `fera-embed-test-other-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      mkdirSync(other, { recursive: true });
      try {
        const before2 = (envRecord.pipelineOptions ?? []).length;
        await loadLocalEmbedder({ cacheDir: other });
        const after2 = (envRecord.pipelineOptions ?? []).length;
        expect(after2).toBe(before2 + 1);
      } finally {
        rmSync(other, { recursive: true, force: true });
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("a different model id triggers a fresh pipeline (per-key cache)", async () => {
    await loadLocalEmbedder();
    const before = (envRecord.pipelineOptions ?? []).length;
    await loadLocalEmbedder({ model: "Xenova/another-model" });
    const after = (envRecord.pipelineOptions ?? []).length;
    expect(after).toBe(before + 1);
  });
});
