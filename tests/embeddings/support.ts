// Deterministic fake embedder for tests: no model, no network. Hash-seeded, so equal
// input gives an equal vector. Deliberately NOT L2-normalised, so the tests prove that
// embedText normalises.
import { createHash } from "node:crypto";
import type { Embedder } from "../../src/server/embeddings";

export const seen: string[] = [];

export function fakeEmbedder(): Embedder {
  return {
    async embed(text: string) {
      seen.push(text);
      const out = new Float32Array(384);
      let block = createHash("sha256").update(text).digest();
      for (let i = 0; i < 384; i++) {
        if (i % 32 === 0 && i > 0) block = createHash("sha256").update(block).digest();
        out[i] = block[i % 32] / 16 - 8;
      }
      return out;
    },
  };
}
