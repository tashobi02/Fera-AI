// Unit tests for the matcher run's per-found row SELECT (P3-040, D2A §5.7).
//
// Regression target: the run used to issue a per-eligible-row SELECT for the
// found embedding (a serial N+1 over up to 50 rows). The fix reads the
// embedding text alongside the row's allowlisted columns in ONE parameterised
// query using `WHERE id = ANY($1::uuid[])`. The lock, version and
// vector-space validation, plus the malformed-shape behaviour, are preserved
// verbatim. The matching SELECT helper is local to run.ts and was extended
// in place.
//
// Synthetic data only; no real child data; no database, no providers.
import { describe, expect, it } from "vitest";
import { exampleFoundRow } from "@/contracts/examples";
import type { Queryable } from "@/server/db/queryable";
import { EmbeddingShapeError } from "@/server/embeddings/model";
import {
  readFoundRowsForScoring,
  type FoundRowForScoring,
} from "@/server/matching/run";
import type { EligibleFoundCandidate } from "@/server/matching/filters";

function makeQueryable(plan: { rows: unknown[] }[]): Queryable & { calls: Array<{ text: string; values?: unknown[] }> } {
  const calls: Array<{ text: string; values?: unknown[] }> = [];
  let i = 0;
  const q: Queryable = {
    async query(text, values) {
      calls.push({ text, values });
      const step = plan[i++] ?? { rows: [] };
      return step;
    },
  };
  return Object.assign(q, { calls }) as Queryable & { calls: Array<{ text: string; values?: unknown[] }> };
}

function fakeEligible(id: string, over: Partial<EligibleFoundCandidate> = {}): EligibleFoundCandidate {
  return {
    missing_case_id: "00000000-0000-4000-8000-0000000000aa",
    missing_version: 1,
    found_case_id: id,
    found_version: 1,
    status: "open",
    sex: "male",
    age_min: 7,
    age_max: 9,
    event_at: new Date("2026-10-10T00:00:00Z"),
    event_at_approx: true,
    event_at_lower: new Date("2026-10-09T00:00:00Z"),
    event_at_upper: new Date("2026-10-11T00:00:00Z"),
    anonymised_at: null,
    ref_code: "F-AAAAAA",
    ...over,
  };
}

function fakeFoundDbRow(id: string, embedding: string | null): Record<string, unknown> {
  // The minimum columns mapCaseRow requires. exampleFoundRow already supplies
  // a valid provenance object, a valid sex, and every NOT-NULL field. We
  // override the id and the two new projections the helper adds.
  return {
    ...exampleFoundRow,
    id,
    embedding_model: "multilingual-e5-small",
    embedding_revision: "1",
    embedding_space: "e5",
    embedding,
  };
}

describe("readFoundRowsForScoring (matcher run SELECT helper)", () => {
  it("returns the empty list and never queries when no eligible rows are supplied", async () => {
    const q = makeQueryable([]);
    const rows = await readFoundRowsForScoring(q, []);
    expect(rows).toEqual([]);
    expect(q.calls).toEqual([]);
  });

  it("uses ONE parameterised `WHERE id = ANY($1::uuid[])` SELECT for the whole eligible set (no N+1)", async () => {
    // Build 5 eligible rows; the helper must issue exactly one query,
    // regardless of the eligible-set size, and must project the embedding
    // text alongside the row's allowlisted columns in that same statement.
    const ids = [
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000003",
      "00000000-0000-4000-8000-000000000004",
      "00000000-0000-4000-8000-000000000005",
    ];
    const eligible = ids.map((id) => fakeEligible(id));
    const dbRows = ids.map((id, i) => fakeFoundDbRow(id, i === 1 ? null : "[0.1,0.2,0.3]"));
    const q = makeQueryable([{ rows: dbRows }]);

    const rows = await readFoundRowsForScoring(q, eligible);
    expect(q.calls).toHaveLength(1);
    const call = q.calls[0]!;
    // The parameterised single-round-trip form. No string interpolation of
    // caller-supplied ids into the SQL text.
    expect(call.text).toMatch(/FROM cases WHERE id = ANY\(\$1::uuid\[\]\)/);
    expect(call.values).toEqual([ids]);
    // The embedding text and space are projected in the same statement.
    expect(call.text).toMatch(/embedding::text AS embedding/);
    expect(call.text).toMatch(/embedding_space AS embedding_space/);
    // The returned rows carry the embedding/space facts the rest of the
    // matcher needs (vector + space) for the lock/version/space validation.
    expect(rows).toHaveLength(5);
    for (const r of rows as FoundRowForScoring[]) {
      expect(typeof r.foundEmbedding).toBe("object");
    }
  });

  it("preserves the malformed-pgvector-text behaviour (EmbeddingShapeError on non-numeric input)", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const eligible = [fakeEligible(id)];
    const q = makeQueryable([{ rows: [fakeFoundDbRow(id, "[not-a-number]")] }]);
    await expect(readFoundRowsForScoring(q, eligible)).rejects.toBeInstanceOf(EmbeddingShapeError);
  });

  it("preserves a null embedding (unembedded eligible row stays a no-op for scoring)", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const eligible = [fakeEligible(id)];
    const q = makeQueryable([{ rows: [fakeFoundDbRow(id, null)] }]);
    const rows = await readFoundRowsForScoring(q, eligible);
    expect(rows).toHaveLength(1);
    const r = rows[0] as FoundRowForScoring;
    expect(r.foundEmbedding).toBeNull();
  });
});
