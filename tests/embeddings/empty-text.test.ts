// A case whose embedded text becomes empty must not keep its old vector.
// The schema forbids empty text for live cases today, so this is a
// stub-client test of the reembed-lib branch.
import { describe, expect, it } from "vitest";

describe("empty embedded text", () => {
  it("clears an old vector, and only counts (not touches) a row that never had one", async () => {
    // @ts-expect-error -- plain ESM module without type declarations
    const { reembedCases } = await import("../../scripts/embeddings/reembed-lib.mjs");
    const sql: string[] = [];
    let selected = 0;
    const blank = {
      kind: "missing",
      version: 1,
      has_embedding: false,
      clothing: null,
      marks: null,
      circumstances: null,
      place_text: "  ",
    };
    const blankWithOld = { ...blank, has_embedding: true };
    const client = {
      async query(text: string) {
        sql.push(text.replace(/\s+/g, " ").trim());
        if (/SET statement_timeout/.test(text)) return { rows: [] };
        if (/SET lock_timeout/.test(text)) return { rows: [] };
        if (/SELECT EXISTS/.test(text)) return { rows: [{ stale: false }] };
        if (/SELECT id, kind, version/.test(text)) {
          return {
            rows:
              selected++ === 0
                ? [blankWithOld, blank]
                : [],
          };
        }
        if (/UPDATE cases SET embedding = NULL/.test(text)) {
          return { rows: [], rowCount: 1 };
        }
        if (/UPDATE cases SET embedding = /.test(text)) {
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
    };
    const counts = await reembedCases(client, { retryStale: false });
    expect(counts).toMatchObject({ embedded: 0, cleared_empty: 1, skipped_empty: 1 });
    // The reembed pass emits a clear UPDATE for the row that had an old vector.
    expect(sql.some((q) => q.startsWith("UPDATE cases SET embedding = NULL, embedding_model = NULL"))).toBe(true);
  });
});
