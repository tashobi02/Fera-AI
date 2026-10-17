// COMP-011 (TASK-016): the pinned embedding model, the prefix policy and the embedder
// switch. Self-contained (no relative imports, erasable syntax only) because
// scripts/model-fetch.mjs and scripts/reembed.mjs load it with Node's type stripping.
//
// One model, one revision, one vector space. The three values below are written to
// cases.embedding_model / embedding_revision / embedding_space together with the vector
// (the schema CHECK sets them all or none). Changing ANY of them makes `npm run reembed`
// re-embed every case, because vectors from different spaces must never be compared.

import { existsSync } from "node:fs";
import { join } from "node:path";

export const EMBEDDING_DIM = 384;

// Hugging Face commit of Xenova/multilingual-e5-small (ONNX export of
// intfloat/multilingual-e5-small), main on 17 Oct 2026, last modified 2025-07-22.
// Looked up from https://huggingface.co/api/models/Xenova/multilingual-e5-small, not
// invented. The TASK-004 spike downloaded `main` without recording a hash; main had not
// moved since 2025-07-22, so it is the same commit unless HF rewrote history.
const MODEL_REVISION = "761b726dd34fb83930e26aab4e9ac3899aa1fa78";
// Weights precision. q8 (~113 MiB) was within one query of fp32 (~449 MiB) in the spike.
const DTYPE = "q8";
// Bump when caseEmbeddingText (text.ts) changes what is embedded.
const TEXT_RECIPE = "text-v1";

export const EMBEDDING = {
  model: "Xenova/multilingual-e5-small",
  revision: MODEL_REVISION,
  // dtype + pooling + normalisation + dimension + text recipe: everything besides the
  // model files that changes the vector.
  space: `e5-small-${DTYPE}-mean-l2-${EMBEDDING_DIM}-${TEXT_RECIPE}`,
} as const;

export const MODEL_DTYPE = DTYPE;

// Files fetched by `npm run model:fetch` from the pinned revision, with SHA-256 digests
// (the onnx and tokenizer.json digests equal Hugging Face's LFS oids for that commit).
// They are stored under <cache>/<model>/<path>, the layout Transformers.js reads with its
// default revision, so the runtime can load them with remote downloads disabled.
// (Passing `revision` to Transformers.js 4.3.1 makes its tokenizer lookup miss the cache.)
export const MODEL_FILES = [
  { path: "config.json", sha256: "cb99455288675345e1a4f411438d5d0adbba5fbd3a67ea4fb03c015433b996c1" },
  { path: "tokenizer_config.json", sha256: "a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b" },
  { path: "tokenizer.json", sha256: "0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39" },
  { path: "onnx/model_quantized.onnx", sha256: "f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193" },
] as const;

export type EmbeddingRole = "query" | "passage";
// multilingual-e5 documented prefixes. `query: ` is the missing/query side, `passage: `
// the found side (spike: small gain over passage/passage).
export const PREFIX: Record<EmbeddingRole, string> = { query: "query: ", passage: "passage: " };

/** Embeds an already-prefixed string. May return an un-normalised vector. */
export interface Embedder {
  embed(prefixedText: string): Promise<Float32Array>;
}

export class EmbeddingNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingNotConfiguredError";
  }
}

export function defaultCacheDir(): string {
  return process.env.FERA_MODEL_CACHE || "models/hf";
}

/** Loads the cached model. Never downloads: a missing file fails with a model:fetch hint. */
export async function loadLocalEmbedder(options: { cacheDir?: string } = {}): Promise<Embedder> {
  const cacheDir = options.cacheDir ?? defaultCacheDir();
  const missing = MODEL_FILES.filter((f) => !existsSync(join(cacheDir, EMBEDDING.model, f.path)));
  if (missing.length > 0) {
    throw new Error(`embedding model is not available locally (run \`npm run model:fetch\`); missing ${missing.map((f) => f.path).join(", ")}`);
  }
  const { pipeline, env } = await import("@huggingface/transformers");
  env.cacheDir = cacheDir;
  env.allowRemoteModels = false;
  const extractor = await pipeline("feature-extraction", EMBEDDING.model, { dtype: MODEL_DTYPE });
  return {
    async embed(text: string) {
      const out = await (extractor as unknown as (t: string, o: object) => Promise<{ data: Float32Array }>)(text, {
        pooling: "mean",
        normalize: true,
      });
      return Float32Array.from(out.data);
    },
  };
}

let injected: Embedder | null = null;
let local: Promise<Embedder> | null = null;

// Lazy: selecting the provider loads nothing; the model loads on the first embed.
const lazyLocal: Embedder = {
  async embed(text: string) {
    local ??= loadLocalEmbedder().catch((err) => {
      local = null; // allow a retry after model:fetch
      throw err;
    });
    return (await local).embed(text);
  },
};

/** Tests inject a deterministic fake here; pass null to restore the configured provider. */
export function setEmbedder(embedder: Embedder | null): void {
  injected = embedder;
}

export function getEmbedder(): Embedder {
  if (injected) return injected;
  const provider = process.env.EMBED_PROVIDER || "local";
  if (provider === "api") {
    // No provider, key, price or notice is configured (account and prices are UNKNOWN),
    // so this fails closed. Nothing is sent anywhere.
    throw new EmbeddingNotConfiguredError(
      "EMBED_PROVIDER=api is not configured: no embeddings provider is wired (account and prices UNKNOWN). Use EMBED_PROVIDER=local.",
    );
  }
  if (provider !== "local") {
    throw new EmbeddingNotConfiguredError(`EMBED_PROVIDER must be "local" or "api", got ${JSON.stringify(provider)}`);
  }
  return lazyLocal;
}

function l2normalise(v: Float32Array): Float32Array {
  if (v.length !== EMBEDDING_DIM) throw new Error(`embedding has ${v.length} dimensions, expected ${EMBEDDING_DIM}`);
  let sum = 0;
  for (const x of v) {
    if (!Number.isFinite(x)) throw new Error("embedding contains a non-finite value");
    sum += x * x;
  }
  if (sum === 0) throw new Error("embedding has zero length (cannot be normalised)");
  const norm = Math.sqrt(sum);
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
}

/** 384-d, L2-normalised. NFC-normalises the text, then applies `query: ` or `passage: `. */
export async function embedText(text: string, role: EmbeddingRole): Promise<Float32Array> {
  const embedder = getEmbedder();
  return l2normalise(await embedder.embed(PREFIX[role] + text.normalize("NFC")));
}
