import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EMBEDDING,
  EMBEDDING_DIM,
  EmbeddingNotConfiguredError,
  POOLING_OPTIONS,
  PREFIX,
  ROLE_BY_KIND,
  TEXT_RECIPE,
  buildSpace,
  caseEmbeddingText,
  embedText,
  getEmbedder,
  loadLocalEmbedder,
  setEmbedder,
  verifyModelCache,
} from "../../src/server/embeddings";
import { fakeEmbedder, seen } from "./support";

afterEach(() => {
  setEmbedder(null);
  delete process.env.EMBED_PROVIDER;
  seen.length = 0;
});

const norm = (v: Float32Array) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));

describe("embedText", () => {
  it("returns a 384-d, L2-normalised Float32Array", async () => {
    setEmbedder(fakeEmbedder());
    const v = await embedText("লাল জামা", "passage");
    expect(v).toBeInstanceOf(Float32Array);
    expect(v).toHaveLength(384);
    expect(EMBEDDING_DIM).toBe(384);
    expect(norm(v)).toBeCloseTo(1, 5);
  });

  it("applies the prefixes exactly: 'query: ' and 'passage: '", async () => {
    setEmbedder(fakeEmbedder());
    await embedText("লাল জামা", "query");
    await embedText("লাল জামা", "passage");
    expect(seen).toEqual(["query: লাল জামা", "passage: লাল জামা"]);
  });

  it("query and passage vectors differ for the same text", async () => {
    setEmbedder(fakeEmbedder());
    const q = await embedText("লাল জামা", "query");
    const p = await embedText("লাল জামা", "passage");
    expect(Array.from(q)).not.toEqual(Array.from(p));
  });

  it("U+09DF and U+09AF U+09BC produce identical vectors end to end", async () => {
    setEmbedder(fakeEmbedder());
    const a = await embedText(caseEmbeddingText({ clothing: "য়াকুব" }), "passage");
    const b = await embedText(caseEmbeddingText({ clothing: "য়াকুব" }), "passage");
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("NFC-normalises the text itself even when called directly", async () => {
    setEmbedder(fakeEmbedder());
    await embedText("য়", "query");
    expect(seen[0]).toBe("query: য়");
  });

  it("rejects a wrong-dimension or non-finite vector from an embedder", async () => {
    setEmbedder({ embed: async () => new Float32Array(10).fill(1) });
    await expect(embedText("x", "query")).rejects.toThrow(/384/);
    setEmbedder({ embed: async () => new Float32Array(384) });
    await expect(embedText("x", "query")).rejects.toThrow(/zero|finite/i);
  });

  it("pins one model, revision and space", () => {
    expect(EMBEDDING.model).toBe("Xenova/multilingual-e5-small");
    expect(EMBEDDING.revision).toMatch(/^[0-9a-f]{40}$/);
    expect(EMBEDDING.space).toMatch(/384/);
  });
});

describe("EMBED_PROVIDER", () => {
  it("defaults to local (no throw selecting it)", () => {
    expect(() => getEmbedder()).not.toThrow();
  });

  it("api fails closed: not configured, no network", async () => {
    process.env.EMBED_PROVIDER = "api";
    expect(() => getEmbedder()).toThrow(EmbeddingNotConfiguredError);
    await expect(embedText("x", "query")).rejects.toThrow(/not configured/i);
  });

  it("an unknown provider fails closed too", () => {
    process.env.EMBED_PROVIDER = "nonsense";
    expect(() => getEmbedder()).toThrow(/EMBED_PROVIDER/);
  });
});

// The real model runs in a plain Node child process: Transformers.js' callable pipeline
// objects do not survive vitest's module wrapper ("this.tokenizer is not a function").
// Needs `npm run model:fetch` first. Skipped unless FERA_REAL_EMBED=1.
describe.skipIf(process.env.FERA_REAL_EMBED !== "1")("real model (FERA_REAL_EMBED=1)", () => {
  it("embeds Bangla with the pinned model: 384-d, unit norm, related text closer than unrelated", () => {
    const script = `
      import { embedText } from "./src/server/embeddings/model.ts";
      const texts = ["ধূসর পাঞ্জাবি ও বেগুনি প্যান্ট", "ধূসর পাঞ্জাবি ও বেগুনি প্যান্ট পরা ছেলে", "গরুর হাটে ধানের দাম বেড়েছে"];
      const roles = ["query", "passage", "passage"];
      const out = [];
      for (let i = 0; i < 3; i++) out.push(Array.from(await embedText(texts[i], roles[i])));
      console.log(JSON.stringify(out));`;
    const stdout = execFileSync("node", ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--input-type=module", "-e", script], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 120_000,
    });
    const [a, b, c] = (JSON.parse(stdout.trim().split("\n").pop()!) as number[][]).map((v) => Float32Array.from(v));
    expect(a).toHaveLength(384);
    expect(norm(a)).toBeCloseTo(1, 4);
    const dot = (x: Float32Array, y: Float32Array) => x.reduce((sum, v, i) => sum + v * y[i], 0);
    expect(dot(a, b)).toBeGreaterThan(dot(a, c));
  }, 130_000);
});

describe("space string comes from the real constants", () => {
  const base = {
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
  it("changes when each constant changes", () => {
    const variants = [
      { ...base, dtype: "fp32" },
      { ...base, dim: 768 },
      { ...base, textRecipe: "text-v2" },
      { ...base, prefix: { ...PREFIX, query: "passage: " } },
      { ...base, prefix: { ...PREFIX, passage: "query: " } },
      { ...base, roleByKind: { missing: "passage", found: "passage" } },
      { ...base, pooling: "cls" },
      { ...base, normalize: false },
    ];
    const spaces = new Set([buildSpace(base), ...variants.map(buildSpace)]);
    expect(spaces.size).toBe(variants.length + 1);
  });
});

describe("model cache integrity (verifyModelCache)", () => {
  const sha = (s: string) => createHash("sha256").update(s).digest("hex");
  const model = "Xenova/multilingual-e5-small";
  let n = 0;
  function makeCache(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), `fera-cache-${++n}-`));
    chmodSync(dir, 0o755);
    for (const [path, body] of Object.entries(files)) {
      mkdirSync(join(dir, model, path, ".."), { recursive: true });
      writeFileSync(join(dir, model, path), body);
    }
    chmodSync(join(dir, model), 0o755);
    return dir;
  }
  const list = (files: Record<string, string>) => Object.entries(files).map(([path, body]) => ({ path, sha256: sha(body) }));
  const good = { "config.json": "{}", "onnx/model_quantized.onnx": "weights" };

  it("passes for intact files", async () => {
    await expect(verifyModelCache(makeCache(good), list(good))).resolves.toBeUndefined();
  });
  it("fails closed on a corrupted file, pointing to model:fetch", async () => {
    const dir = makeCache({ ...good, "onnx/model_quantized.onnx": "tampered" });
    await expect(verifyModelCache(dir, list(good))).rejects.toThrow(/SHA-256.*model:fetch/);
    await expect(loadLocalEmbedder({ cacheDir: dir, files: list(good) })).rejects.toThrow(/model:fetch/);
  });
  it("fails closed on a missing file or directory", async () => {
    const dir = makeCache({ "config.json": "{}" });
    await expect(verifyModelCache(dir, list(good))).rejects.toThrow(/missing onnx\/model_quantized.onnx.*model:fetch|model:fetch.*missing/);
    await expect(verifyModelCache(join(dir, "nope"), list(good))).rejects.toThrow(/model:fetch/);
  });
  it("refuses a world-writable cache directory", async () => {
    const dir = makeCache(good);
    chmodSync(dir, 0o777);
    await expect(verifyModelCache(dir, list(good))).rejects.toThrow(/world-writable/);
  });
});

describe("Node preflight", () => {
  it("accepts versions with type stripping and rejects older ones", async () => {
    // @ts-expect-error -- plain ESM module without type declarations
    const { nodeCanStripTypes } = await import("../../scripts/embeddings/preflight.mjs");
    for (const v of ["22.18.0", "22.20.1", "23.6.0", "24.0.0", "24.18.0"]) expect(nodeCanStripTypes(v)).toBe(true);
    for (const v of ["22.12.0", "22.17.9", "23.5.0", "20.19.0"]) expect(nodeCanStripTypes(v)).toBe(false);
  });
});
