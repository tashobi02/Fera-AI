// TASK-016 / COMP-011 / P3-024: Embedder interface, FakeEmbedder, and the
// pinned-model contract.
//
// The unit tests must NEVER download the model. We exercise:
//   * the FakeEmbedder produces 384-d, L2-normalised, finite vectors
//   * the FakeEmbedder is deterministic — same input → same vector
//   * normaliseVectors rejects bad shapes (wrong dim, non-finite, zero)
//   * the Embedder interface is shape-stable (model, revision, space,
//     dimension)
//   * the pinned EMBEDDING constant carries the pinned revision and
//     space hash and that buildSpace changes when any component changes
//   * the on-disk model cache is verified against the four pinned
//     SHA-256 digests before the pipeline is built
//   * the default `loadLocalEmbedder` sets
//     `env.allowRemoteModels = false` before any `pipeline(...)` call,
//     and `allowRemote: true` is the only way to flip it on
//   * the default cache directory is anchored at the repository root,
//     not the cwd
//   * the loader caches its pipeline per model/cache/recipe configuration
//     so changing the model space cannot reuse the wrong pipeline

import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CACHE_DIR,
  EMBEDDING,
  EMBEDDING_DIM,
  EmbeddingShapeError,
  MODEL_FILES,
  POOLING_OPTIONS,
  PREFIX,
  ROLE_BY_KIND,
  TEXT_RECIPE,
  _resetLocalEmbedderForTests,
  buildSpace,
  createFakeEmbedder,
  defaultCacheDir,
  loadLocalEmbedder,
  makeEmbeddingSpace,
  normaliseVectors,
  verifyModelCache,
} from "@/server/embeddings/model";

// FakeTransformers env + pipeline. The loader reads and writes
// `env.allowRemoteModels` and `env.cacheDir`, then calls `pipeline(...)`.
// We capture the values the loader sets on `env` and short-circuit the
// pipeline to a stub that returns a deterministic Float32Array so the
// warm-up and the embed call never touch the network.
type EnvRecorder = {
  allowRemoteModels: boolean | null;
  allowLocalModels: boolean | null;
  cacheDir: string | null;
  pipelineOptions: unknown[] | null;
};

const envRecord: EnvRecorder = {
  allowRemoteModels: null,
  allowLocalModels: null,
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
  get allowLocalModels(): boolean {
    return envRecord.allowLocalModels === true;
  },
  set allowLocalModels(v: boolean) {
    envRecord.allowLocalModels = v;
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

function sha256Of(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function makeFakeModelCache(files: Record<string, string>): { dir: string; model: string } {
  const dir = mkdtempSync(join(tmpdir(), `fera-modelcache-${Date.now()}-${Math.random().toString(36).slice(2)}-`));
  chmodSync(dir, 0o755);
  const model = EMBEDDING.model;
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(dir, model, path, ".."), { recursive: true });
    writeFileSync(join(dir, model, path), body);
  }
  chmodSync(join(dir, model), 0o755);
  return { dir, model };
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

describe("makeEmbeddingSpace (legacy string format)", () => {
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

  it("changes when any of the components changes", () => {
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

  it("also embeds the canonical space hash so the legacy and canonical forms are consistent", () => {
    const s = makeEmbeddingSpace({
      model: "m", dtype: "q8", pooling: "mean", normalize: true,
      queryPrefix: "query: ", passagePrefix: "passage: ",
    });
    const space = buildSpace({
      model: "m",
      revision: null,
      dtype: "q8",
      dim: EMBEDDING_DIM,
      textRecipe: TEXT_RECIPE,
      prefix: PREFIX,
      roleByKind: ROLE_BY_KIND,
      pooling: "mean",
      normalize: true,
    });
    expect(s).toContain(`space=${space}`);
  });
});

/* ----------------------------------------------------------------------- *
 * Pinned model: model id, revision, files, space hash.                  *
 * ----------------------------------------------------------------------- */

describe("EMBEDDING pinned model contract", () => {
  it("pins model id, revision, dtype, and space from the constants", () => {
    expect(EMBEDDING.model).toBe("Xenova/multilingual-e5-small");
    expect(EMBEDDING.revision).toBe("761b726dd34fb83930e26aab4e9ac3899aa1fa78");
    expect(EMBEDDING.dtype).toBe("q8");
    expect(EMBEDDING.space).toBe(
      buildSpace({
        model: EMBEDDING.model,
        revision: EMBEDDING.revision,
        dtype: EMBEDDING.dtype,
        dim: EMBEDDING_DIM,
        textRecipe: TEXT_RECIPE,
        prefix: PREFIX,
        roleByKind: ROLE_BY_KIND,
        pooling: POOLING_OPTIONS.pooling,
        normalize: POOLING_OPTIONS.normalize,
      }),
    );
  });

  it("pins exactly the four model files and their SHA-256 digests", () => {
    expect(MODEL_FILES).toHaveLength(4);
    const paths = MODEL_FILES.map((f) => f.path).sort();
    expect(paths).toEqual([
      "config.json",
      "onnx/model_quantized.onnx",
      "tokenizer.json",
      "tokenizer_config.json",
    ]);
    for (const f of MODEL_FILES) {
      // SHA-256 hex digest is 64 lowercase hex chars.
      expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("TEXT_RECIPE is still text-v1 (a golden test pins the output for fixed inputs)", () => {
    expect(TEXT_RECIPE).toBe("text-v1");
  });
});

describe("buildSpace hash includes every space-defining component", () => {
  const base = {
    model: EMBEDDING.model,
    revision: EMBEDDING.revision,
    dtype: "q8",
    dim: 384,
    textRecipe: TEXT_RECIPE,
    prefix: PREFIX,
    roleByKind: ROLE_BY_KIND,
    pooling: POOLING_OPTIONS.pooling,
    normalize: POOLING_OPTIONS.normalize,
  };
  it("EMBEDDING.space is buildSpace of the exported constants", () => {
    expect(EMBEDDING.space).toBe(buildSpace(base));
  });
  it("changes when each component changes", () => {
    const variants = [
      { ...base, dtype: "fp32" },
      { ...base, dim: 768 },
      { ...base, textRecipe: "text-v2" },
      { ...base, prefix: { ...PREFIX, query: "passage: " } },
      { ...base, prefix: { ...PREFIX, passage: "query: " } },
      { ...base, roleByKind: { missing: "passage", found: "passage" } as typeof ROLE_BY_KIND },
      { ...base, pooling: "cls" },
      { ...base, normalize: false },
      { ...base, model: "Xenova/other-model" },
      { ...base, revision: "other-pinned-revision" },
    ];
    const spaces = new Set([buildSpace(base), ...variants.map(buildSpace)]);
    expect(spaces.size).toBe(variants.length + 1);
  });
  it("uses a short digest that distinguishes model identity without exposing the full model id", () => {
    const s = buildSpace(base);
    expect(s).toMatch(/-[0-9a-f]{10}$/);
    expect(s).not.toContain(EMBEDDING.model);
    expect(buildSpace({ ...base, model: "Xenova/another-model" })).not.toBe(s);
  });
});

describe("defaultCacheDir", () => {
  it("returns DEFAULT_CACHE_DIR when FERA_MODEL_CACHE is not set", () => {
    const prev = process.env.FERA_MODEL_CACHE;
    delete process.env.FERA_MODEL_CACHE;
    try {
      expect(defaultCacheDir()).toBe(DEFAULT_CACHE_DIR);
      expect(defaultCacheDir()).toMatch(/\.cache\/models$/);
    } finally {
      if (prev !== undefined) process.env.FERA_MODEL_CACHE = prev;
    }
  });
  it("honours FERA_MODEL_CACHE when set", () => {
    const prev = process.env.FERA_MODEL_CACHE;
    process.env.FERA_MODEL_CACHE = "/tmp/fera-shared-models";
    try {
      expect(defaultCacheDir()).toBe("/tmp/fera-shared-models");
    } finally {
      if (prev !== undefined) process.env.FERA_MODEL_CACHE = prev;
      else delete process.env.FERA_MODEL_CACHE;
    }
  });
});

/* ----------------------------------------------------------------------- *
 * Cache integrity: SHA-256 of every pinned file, world-writable refusal. *
 * ----------------------------------------------------------------------- */

describe("verifyModelCache (SHA-256 of every pinned file)", () => {
  // Make a list of model-file descriptors whose sha256 matches the
  // bytes we are about to write. This is the same shape MODEL_FILES
  // has at runtime, and what `model:fetch` verifies.
  const list = (files: Record<string, string>) =>
    Object.entries(files).map(([path, body]) => ({ path, sha256: sha256Of(body) }));

  const good: Record<string, string> = {
    "config.json": '{"model_type":"xlm-roberta"}',
    "tokenizer_config.json": '{"do_lower_case":true}',
    "tokenizer.json": "BINARY",
    "onnx/model_quantized.onnx": "WEIGHTS",
  };

  it("passes for intact files", async () => {
    const { dir } = makeFakeModelCache(good);
    try {
      await expect(verifyModelCache(dir, list(good))).resolves.toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails closed on a corrupted file, pointing at model:fetch", async () => {
    const { dir } = makeFakeModelCache({ ...good, "onnx/model_quantized.onnx": "tampered" });
    try {
      await expect(verifyModelCache(dir, list(good))).rejects.toThrow(/SHA-256.*model:fetch/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails closed on a missing file or directory", async () => {
    const incomplete = { ...good };
    delete incomplete["onnx/model_quantized.onnx"];
    const { dir } = makeFakeModelCache(incomplete);
    try {
      await expect(verifyModelCache(dir, list(good))).rejects.toThrow(
        /model:fetch.*onnx\/model_quantized.onnx|missing onnx\/model_quantized.onnx.*model:fetch/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    // And an entirely missing cache directory:
    await expect(verifyModelCache("/tmp/fera-does-not-exist-xyz", list(good))).rejects.toThrow(/model:fetch/);
  });

  it("refuses a world-writable cache directory (POSIX)", async () => {
    if (process.platform === "win32") return; // POSIX mode bits do not apply
    const { dir } = makeFakeModelCache(good);
    try {
      chmodSync(dir, 0o777);
      await expect(verifyModelCache(dir, list(good))).rejects.toThrow(/world-writable/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is memoised within a process (a follow-up call does not re-stat)", async () => {
    const { dir } = makeFakeModelCache(good);
    try {
      await verifyModelCache(dir, list(good));
      // After the first call, a deletion of a file would not be caught.
      // We just confirm the second call resolves (the function used
      // the memoised key).
      await expect(verifyModelCache(dir, list(good))).resolves.toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/* ----------------------------------------------------------------------- *
 * SECURITY HARDENING (P3-024):                                          *
 *   * default loader refuses remote (`env.allowRemoteModels = false`)    *
 *   * `allowRemote: true` is the only way to flip remote on              *
 *   * cache directory is anchored at the repository root                  *
 *   * loader caches the pipeline per model/cache/recipe config            *
 * ----------------------------------------------------------------------- */

describe("loadLocalEmbedder security hardening (P3-024)", () => {
  // We need a real on-disk cache so verifyModelCache passes when the
  // loader is called with `allowRemote: false`. The tests in this
  // describe block write the four pinned files (with the right
  // SHA-256) into a tmpdir and point the loader at it. Each test
  // gets its own tmpdir.
  let cacheDir: string;
  let n = 0;
  function withCache() {
    const files: Record<string, string> = {
      "config.json": "{}",
      "tokenizer_config.json": "{}",
      "tokenizer.json": "{}",
      "onnx/model_quantized.onnx": "WEIGHTS",
    };
    const dir = mkdtempSync(join(tmpdir(), `fera-embed-test-${++n}-`));
    chmodSync(dir, 0o755);
    for (const [p, body] of Object.entries(files)) {
      mkdirSync(join(dir, EMBEDDING.model, p, ".."), { recursive: true });
      writeFileSync(join(dir, EMBEDDING.model, p), body);
    }
    chmodSync(join(dir, EMBEDDING.model), 0o755);
    cacheDir = dir;
    // Make the SHA-256s match for the on-disk files we just wrote.
    const pins = MODEL_FILES.map((f) => ({ path: f.path, sha256: sha256Of(bodyFor(f.path, files)) }));
    return { dir, pins };
  }
  function bodyFor(p: string, files: Record<string, string>): string {
    return files[p] ?? "";
  }
  function rmCache() {
    if (cacheDir) rmSync(cacheDir, { recursive: true, force: true });
  }

  beforeEach(() => {
    _resetLocalEmbedderForTests();
    envRecord.allowRemoteModels = null;
    envRecord.allowLocalModels = null;
    envRecord.cacheDir = null;
    envRecord.pipelineOptions = null;
  });

  afterEach(() => {
    _resetLocalEmbedderForTests();
    rmCache();
  });

  it("default loader refuses remote: sets env.allowRemoteModels = false", async () => {
    const { dir, pins } = withCache();
    // Patch MODEL_FILES-aligned pins so the SHA-256 check matches the
    // bytes on disk for this test.
    const e = await loadLocalEmbedder({ cacheDir: dir, files: pins, allowRemote: false });
    expect(envRecord.allowRemoteModels).toBe(false);
    expect(e.dimension).toBe(EMBEDDING_DIM);
    expect(e.model).toBe("Xenova/multilingual-e5-small");
    expect(e.revision).toBe(EMBEDDING.revision);
    expect(e.space).toContain(`revision=${EMBEDDING.revision}`);
    expect(e.space).toContain(`space=${EMBEDDING.space}`);
  });

  it("allowRemote: true is the only way to enable remote (and skips the SHA-256 check)", async () => {
    // The remote-allowed path is reserved for the model:fetch priming
    // script; the runtime path never sets it. We assert the env flag
    // is flipped on, without needing a real cache.
    const e = await loadLocalEmbedder({ allowRemote: true });
    expect(envRecord.allowRemoteModels).toBe(true);
    expect(e.model).toBe("Xenova/multilingual-e5-small");
  });

  it("an explicit allowRemote: false keeps remote off and verifies the cache", async () => {
    const missingCache = join(tmpdir(), `fera-embed-missing-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await expect(loadLocalEmbedder({ allowRemote: false, cacheDir: missingCache })).rejects.toThrow(/model:fetch/);
    // We did not write a cache, so verifyModelCache rejected us before
    // the pipeline call — env.allowRemoteModels is still null.
    expect(envRecord.allowRemoteModels).toBeNull();
  });

  it("anchors the default cache dir at the repository root, not the cwd", async () => {
    // The test uses a real on-disk cache at DEFAULT_CACHE_DIR if
    // present; otherwise the loader's verify step throws and we check
    // the env values were set to DEFAULT_CACHE_DIR up to the throw.
    try {
      await loadLocalEmbedder();
    } catch {
      // ignore; we only care that env.cacheDir was set to DEFAULT_CACHE_DIR.
    }
    expect(envRecord.cacheDir).toBe(DEFAULT_CACHE_DIR);
    expect(envRecord.cacheDir).toMatch(/\.cache\/models$/);
    expect(envRecord.cacheDir!.startsWith("/") || /^[A-Za-z]:[\\/]/.test(envRecord.cacheDir!)).toBe(true);
  });

  it("uses a custom cacheDir when supplied and does not collide with the default", async () => {
    const { dir: tmp1, pins: pins1 } = withCache();
    const before = (envRecord.pipelineOptions ?? []).length;
    const a = await loadLocalEmbedder({ cacheDir: tmp1, files: pins1 });
    const after = (envRecord.pipelineOptions ?? []).length;
    expect(after).toBe(before + 1);
    expect(a.dimension).toBe(EMBEDDING_DIM);
    // A second call with the SAME model/cache/recipe config hits the cache
    // (no extra pipeline() call).
    const before2 = (envRecord.pipelineOptions ?? []).length;
    const b = await loadLocalEmbedder({ cacheDir: tmp1, files: pins1 });
    const after2 = (envRecord.pipelineOptions ?? []).length;
    expect(after2).toBe(before2);
    expect(a.model).toBe(b.model);
  });

  it("a different model id triggers a fresh pipeline (per-key cache)", async () => {
    // With allowRemote, the loader does not require a real on-disk cache
    // — the test is about the per-key pipeline cache, not the bytes.
    await loadLocalEmbedder({ allowRemote: true });
    const before = (envRecord.pipelineOptions ?? []).length;
    await loadLocalEmbedder({ allowRemote: true, model: "Xenova/another-model" });
    const after = (envRecord.pipelineOptions ?? []).length;
    expect(after).toBe(before + 1);
  });

  it("a different dtype in the same model cache triggers a fresh pipeline and space", async () => {
    const { dir, pins } = withCache();
    const q8 = await loadLocalEmbedder({ cacheDir: dir, files: pins, dtype: "q8" });
    const before = (envRecord.pipelineOptions ?? []).length;
    const fp32 = await loadLocalEmbedder({ cacheDir: dir, files: pins, dtype: "fp32" });
    const after = (envRecord.pipelineOptions ?? []).length;
    expect(after).toBe(before + 1);
    expect(fp32.space).not.toBe(q8.space);
  });
});
