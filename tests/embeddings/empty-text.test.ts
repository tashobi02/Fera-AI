// A case whose embedded text becomes empty must not keep its old vector. The schema forbids
// empty text for live cases today (place_text and age are required), so this is a stub-client
// test of the branch rather than a database test.
import { describe, expect, it } from "vitest";
import { setEmbedder } from "../../src/server/embeddings";
// @ts-expect-error -- plain ESM module without type declarations
import { reembedCases } from "../../scripts/embeddings/reembed-lib.mjs";
import { fakeEmbedder } from "./support";

describe("empty embedded text", () => {
  it("clears an old vector, and only counts (not touches) a row that never had one", async () => {
    setEmbedder(fakeEmbedder());
    const sql: string[] = [];
    let selected = 0;
    const blank = { kind: "missing", version: 1, sex: "unknown", age_years: null, age_min: null, age_max: null, clothing: null, marks: null, circumstances: null, place_text: "  " };
    const client = {
      async query(text: string) {
        sql.push(text.replace(/\s+/g, " ").trim());
        if (/FROM cases/.test(text)) {
          return { rows: selected++ === 0 ? [{ id: "a", has_embedding: true, ...blank }, { id: "b", has_embedding: false, ...blank }] : [] };
        }
        return { rows: [], rowCount: 1 };
      },
    };
    const counts = await reembedCases(client, { retryStale: false });
    setEmbedder(null);
    expect(counts).toMatchObject({ embedded: 0, cleared_empty: 1, skipped_empty: 1 });
    expect(sql.some((q) => q.startsWith("UPDATE cases SET embedding = NULL, embedding_model = NULL"))).toBe(true);
  });
});
