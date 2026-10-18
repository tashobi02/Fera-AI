import { describe, expect, it } from "vitest";
import { EMBEDDING } from "@/server/embeddings/model";

describe("reembed model-space upgrade", () => {
  it("detects stale stored vectors against the default pin and invalidates candidates before rewriting", async () => {
    // @ts-expect-error -- plain ESM helper without TypeScript declarations
    const { reembedCases } = await import("../../scripts/embeddings/reembed-lib.mjs");
    const calls: string[] = [];
    let upgradeParams: unknown[] | undefined;
    let selected = false;
    const client = {
      async query(sql: string, params?: unknown[]) {
        const normalized = sql.replace(/\s+/g, " ").trim();
        calls.push(normalized);
        if (/^SET /.test(normalized)) return { rows: [] };
        if (/SELECT EXISTS/.test(normalized)) {
          upgradeParams = params;
          return { rows: [{ stale: true }] };
        }
        if (/^BEGIN$|^COMMIT$/.test(normalized)) return { rows: [] };
        if (/DELETE FROM match_candidates/.test(normalized)) return { rows: [], rowCount: 2 };
        if (/UPDATE cases SET matching_state/.test(normalized)) return { rows: [], rowCount: 3 };
        if (/SELECT id, kind, version/.test(normalized)) {
          if (selected) return { rows: [] };
          selected = true;
          return {
            rows: [
              {
                id: "00000000-0000-0000-0000-000000000001",
                kind: "missing",
                version: 1,
                has_embedding: true,
                clothing: "নীল জামা",
                marks: null,
                circumstances: null,
                place_text: null,
              },
            ],
          };
        }
        if (/UPDATE cases SET embedding = \$1::vector/.test(normalized)) return { rows: [], rowCount: 1 };
        throw new Error(`Unexpected reembed SQL: ${normalized}`);
      },
    };

    const counts = await reembedCases(client, {
      retryStale: false,
      embedFn: async () => new Float32Array(384).fill(1),
    });

    expect(counts).toMatchObject({
      embedded: 1,
      pending_candidates: 2,
      cases_reset: 3,
      space_upgrade: true,
    });
    const deleteIndex = calls.findIndex((q) => q.startsWith("DELETE FROM match_candidates"));
    const deletion = calls[deleteIndex];
    expect(deletion).toContain("missing_case_id");
    expect(deletion).toContain("found_case_id");
    expect(deleteIndex).toBeLessThan(
      calls.findIndex((q) => q.startsWith("UPDATE cases SET embedding = $1::vector")),
    );
    expect(calls.find((q) => q.startsWith("SELECT EXISTS"))).toContain(
      "embedding_revision IS DISTINCT FROM $2",
    );
    expect(upgradeParams?.slice(0, 3)).toEqual([EMBEDDING.model, EMBEDDING.revision, EMBEDDING.space]);
  });
});
