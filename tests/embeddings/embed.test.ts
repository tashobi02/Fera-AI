import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { EMBEDDING, EMBEDDING_DIM, EmbeddingNotConfiguredError, caseEmbeddingText, embedText, getEmbedder, setEmbedder } from "../../src/server/embeddings";
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
