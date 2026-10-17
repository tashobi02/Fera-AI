// TASK-016 / COMP-011 / P3-024: Embedder interface and FakeEmbedder.
//
// The unit tests must NEVER download the model. We exercise:
//   * the FakeEmbedder produces 384-d, L2-normalised, finite vectors
//   * the FakeEmbedder is deterministic — same input → same vector
//   * normaliseVectors rejects bad shapes (wrong dim, non-finite, zero)
//   * the Embedder interface is shape-stable (model, revision, space, dimension)
import { describe, expect, it } from "vitest";
import {
  EMBEDDING_DIM,
  EmbeddingShapeError,
  createFakeEmbedder,
  makeEmbeddingSpace,
  normaliseVectors,
} from "@/server/embeddings/model";

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
