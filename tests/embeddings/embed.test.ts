// Pinned e5-small embedder: 384-d, L2-normalised, `query:` / `passage:`
// prefix, NFC-normalised input. The runtime path is offline only —
// `getEmbedder()` returns `lazyLocal` which loads from the verified
// local cache. `EMBED_PROVIDER=api` fails closed (no provider, key, or
// price is configured; account and prices are UNKNOWN).
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  EMBEDDING,
  EMBEDDING_DIM,
  EmbeddingNotConfiguredError,
  POOLING_OPTIONS,
  PREFIX,
  ROLE_BY_KIND,
  TEXT_RECIPE,
  buildSpace,
  getEmbedder,
  setEmbedder,
} from "@/server/embeddings";

afterEach(() => {
  setEmbedder(null);
  delete process.env.EMBED_PROVIDER;
  delete process.env.FERA_REAL_EMBED;
});

describe("EMBEDDING.space and the live constants", () => {
  it("is the hash of model+revision plus dtype/pooling/text recipe", () => {
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
    // The hash must change if any of the "recipe" inputs change:
    const base = {
      model: EMBEDDING.model,
      revision: EMBEDDING.revision,
      dtype: EMBEDDING.dtype,
      dim: EMBEDDING_DIM,
      textRecipe: TEXT_RECIPE,
      prefix: PREFIX,
      roleByKind: ROLE_BY_KIND,
      pooling: POOLING_OPTIONS.pooling,
      normalize: POOLING_OPTIONS.normalize,
    };
    const recipes: Array<{ label: string; v: Parameters<typeof buildSpace>[0] }> = [
      { label: "textRecipe", v: { ...base, textRecipe: "text-v2" } },
      { label: "dtype", v: { ...base, dtype: "fp32" } },
      { label: "pooling", v: { ...base, pooling: "cls" } },
      { label: "normalize", v: { ...base, normalize: false } },
      { label: "prefix.query", v: { ...base, prefix: { ...PREFIX, query: "passage: " } } },
      { label: "prefix.passage", v: { ...base, prefix: { ...PREFIX, passage: "query: " } } },
      { label: "roleByKind", v: { ...base, roleByKind: { missing: "passage", found: "passage" } as typeof ROLE_BY_KIND } },
      { label: "dim", v: { ...base, dim: 768 } },
      { label: "model", v: { ...base, model: "Xenova/other-model" } },
      { label: "revision", v: { ...base, revision: "another-revision" } },
    ];
    const spaces = new Set([EMBEDDING.space, ...recipes.map((r) => buildSpace(r.v))]);
    expect(spaces.size).toBe(recipes.length + 1);
  });
});

describe("getEmbedder provider switch", () => {
  it("returns the local embedder by default (which fails fast on a missing cache)", async () => {
    const e = getEmbedder();
    expect(e).toBeDefined();
    // The local embedder reads from the verified cache; with no
    // cache present on this machine, the call must fail with the
    // documented model:fetch hint, NOT a silent network call.
    const cached = join(process.cwd(), ".cache", "models", EMBEDDING.model);
    if (!existsSync(cached)) {
      await expect(e.embed(["query: পরীক্ষা"])).rejects.toThrow(
        /model:fetch|model is not available/i,
      );
    }
  });

  it("EMBED_PROVIDER=api fails closed (no provider, key, or price is configured)", () => {
    process.env.EMBED_PROVIDER = "api";
    expect(() => getEmbedder()).toThrow(EmbeddingNotConfiguredError);
  });

  it("an unknown EMBED_PROVIDER value fails closed", () => {
    process.env.EMBED_PROVIDER = "vertex";
    expect(() => getEmbedder()).toThrow(EmbeddingNotConfiguredError);
  });

  it("setEmbedder(null) restores the configured provider", () => {
    const fake = {
      embed: async (_t: readonly string[]): Promise<Float32Array[]> => [
        new Float32Array(EMBEDDING_DIM),
      ],
      model: "fake/test",
      revision: "fake",
      space: "fake-space",
      dimension: EMBEDDING_DIM,
    };
    setEmbedder(fake);
    expect(getEmbedder()).toBe(fake);
    setEmbedder(null);
    process.env.EMBED_PROVIDER = "api";
    expect(() => getEmbedder()).toThrow(EmbeddingNotConfiguredError);
  });
});

/* ----------------------------------------------------------------------- *
 * Real model (gated by FERA_REAL_EMBED=1 — runs only in CI priming).    *
 * ----------------------------------------------------------------------- */
describe.skipIf(process.env.FERA_REAL_EMBED !== "1")("real model (FERA_REAL_EMBED=1)", () => {
  it("embeds a Bangla pair with the e5 prefix and returns 384-d, L2-normalised vectors", async () => {
    const e = getEmbedder();
    const a = (await e.embed(["query: " + "নীল ফ্রক। বাঁ হাতে কাটা দাগ"]))[0]!;
    const b = (await e.embed(["passage: " + "নীল ফ্রক। বাঁ হাতে কাটা দাগ"]))[0]!;
    const c = (await e.embed(["passage: " + "সাদা শার্ট। কিছু নেই"]))[0]!;
    for (const v of [a, b, c]) {
      expect(v.length).toBe(EMBEDDING_DIM);
      let s = 0;
      for (let i = 0; i < v.length; i++) s += v[i]! * v[i]!;
      expect(Math.abs(Math.sqrt(s) - 1)).toBeLessThan(1e-3);
    }
    // Same text, different prefix → cosine is on opposite sides of the
    // asymmetric prefix and is expected to be lower than same-side.
    const dot = (x: Float32Array, y: Float32Array) => {
      let s = 0;
      for (let i = 0; i < x.length; i++) s += x[i]! * y[i]!;
      return s;
    };
    expect(dot(a, b)).toBeGreaterThan(dot(a, c));
  }, 130_000);
});
