// TASK-017d / P3-040: per-case embed-and-store for the matcher run. Owner: Masnun.
//
// Same model/revision/space policy as reembedAll (P3-024). The matcher run only embeds the
// missing endpoint (the found endpoints are pre-embedded at API-007 by reembedAll — the
// `embedding` column is set when a found report is logged). When the missing case's row has
// no embedding yet (the common case right after API-003), the run embeds it once and stamps
// the model / revision / space. When it already has an embedding, the run REUSES it; it
// never embeds again. Two space tags on the table would break cosine (TC-059).
//
// `embedMissingForRun(db, missingCaseId, embedder)` is the only entry point:
//   * SELECT the missing case row (no lock; the matcher run is the only writer for this row).
//   * If `embedding IS NOT NULL` → return the existing vector, the existing model / revision
//     and space (REUSE — match against whatever the rest of the table already uses).
//   * Otherwise → embed the canonical text and UPDATE the row in a short transaction.
//     A bare-prefix row (the schema only stores a prefix when structuredCaseText() is empty)
//     gets `embedding = NULL` so the candidate row cannot be inserted against a uniform
//     fallback vector (P3-024 security hardening).
//
// The function never loads a real model itself: production passes the lazy `loadLocalEmbedder`,
// tests pass `createFakeEmbedder`. No paid calls.
import type { PoolClient } from "pg";
import type { Embedder } from "@/server/embeddings/model";
import { EMBEDDING_DIM, EmbeddingShapeError, normaliseVectors } from "@/server/embeddings/model";
import { canonicalCaseText } from "@/server/embeddings/text";

type MissingForEmbed = {
  id: string;
  kind: "missing";
  embedding: string | null;
  embedding_model: string | null;
  embedding_revision: string | null;
  embedding_space: string | null;
  anonymised_at: string | null;
  clothing: string | null;
  marks: string | null;
  circumstances: string | null;
  place_text: string | null;
};

const SELECT_SQL = `
  SELECT id, kind, embedding::text AS embedding, embedding_model, embedding_revision,
         embedding_space, anonymised_at, clothing, marks, circumstances, place_text
  FROM cases WHERE id = $1`;

export type MissingEmbedding = {
  vector: Float32Array;
  model: string;
  revision: string | null;
  space: string;
};

export class MissingNotEmbeddableError extends Error {
  constructor(readonly caseId: string, readonly reason: "redacted" | "terminal" | "missing_text" | "wrong_kind") {
    super(`missing case ${caseId} not embeddable (${reason})`);
    this.name = "MissingNotEmbeddableError";
  }
}

function parseVectorText(value: string): number[] {
  // pgvector returns `[v0,v1,...]` text. A value from `::text` cast is the same format.
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    throw new EmbeddingShapeError("expected pgvector text repr");
  }
  const body = trimmed.slice(1, -1).trim();
  if (body.length === 0) throw new EmbeddingShapeError("empty pgvector repr");
  const parts = body.split(",");
  const out = new Array<number>(parts.length);
  for (let i = 0; i < parts.length; i++) {
    const n = Number(parts[i]);
    if (!Number.isFinite(n)) throw new EmbeddingShapeError("non-finite vector value");
    out[i] = n;
  }
  return out;
}

function vectorToSql(v: Float32Array): string {
  const parts = new Array<string>(v.length);
  for (let i = 0; i < v.length; i++) parts[i] = v[i].toFixed(6);
  return `[${parts.join(",")}]`;
}

function decodeRow(raw: Record<string, unknown>): MissingForEmbed {
  const id = raw.id;
  const kind = raw.kind;
  if (typeof id !== "string") throw new Error("embed: missing id");
  if (kind !== "missing") throw new MissingNotEmbeddableError(id, "wrong_kind");
  return {
    id,
    kind: "missing",
    embedding: raw.embedding === null || raw.embedding === undefined ? null : String(raw.embedding),
    embedding_model: typeof raw.embedding_model === "string" ? raw.embedding_model : null,
    embedding_revision: typeof raw.embedding_revision === "string" ? raw.embedding_revision : null,
    embedding_space: typeof raw.embedding_space === "string" ? raw.embedding_space : null,
    anonymised_at: typeof raw.anonymised_at === "string" ? raw.anonymised_at : null,
    clothing: typeof raw.clothing === "string" ? raw.clothing : null,
    marks: typeof raw.marks === "string" ? raw.marks : null,
    circumstances: typeof raw.circumstances === "string" ? raw.circumstances : null,
    place_text: typeof raw.place_text === "string" ? raw.place_text : null,
  };
}

/**
 * Return the missing case's current embedding in `embedder.space`. If the row already has
 * an embedding in any space, REUSE it and ignore `embedder` (the run compares against the
 * found rows the rest of the table already uses; mixing spaces is forbidden, TC-059).
 * If the row has none, embed the canonical text once with `embedder` and UPDATE the row.
 *
 * Refuses to embed a redacted row, a row whose structured text is empty (matches the
 * P3-024 `skippedEmpty` policy), or a row whose kind is not `missing`. Callers translate
 * the refusal into the right failure state.
 *
 * `withTransaction` is the test seam: production calls it through the case-service helper
 * to keep the SELECT + UPDATE atomic with the candidate writes. Tests can inject a runner
 * to assert concurrency without holding a real pool.
 */
export async function embedMissingForRun(
  client: PoolClient,
  missingCaseId: string,
  embedder: Embedder,
): Promise<MissingEmbedding | null> {
  if (embedder.dimension !== EMBEDDING_DIM) {
    throw new EmbeddingShapeError(`embedder dimension ${embedder.dimension} != ${EMBEDDING_DIM}`);
  }
  const { rows } = await client.query(SELECT_SQL, [missingCaseId]);
  const r = rows.length === 0 ? null : decodeRow(rows[0] as Record<string, unknown>);
  if (!r) throw new MissingNotEmbeddableError(missingCaseId, "wrong_kind");
  if (r.anonymised_at !== null) throw new MissingNotEmbeddableError(missingCaseId, "redacted");

  // Reuse an existing embedding (any space): the rest of the table decides the space.
  if (r.embedding !== null && r.embedding_model !== null && r.embedding_space !== null) {
    const vec = parseVectorText(r.embedding);
    const normalised = normaliseVectors([vec], EMBEDDING_DIM)[0]!;
    return {
      vector: normalised,
      model: r.embedding_model,
      revision: r.embedding_revision,
      space: r.embedding_space,
    };
  }

  const canonical = canonicalCaseText(r);
  // P3-024 hardening: a row whose canonical text is the bare prefix (no structured
  // fields) would map every such row to a uniform fallback vector and the matcher
  // would treat them as duplicates. We refuse to embed and leave `embedding = NULL`;
  // the matcher must still run, but against a no-vector missing case, which the
  // scoring layer turns into a guaranteed-abstain (invalid pair → qualified: false).
  if (canonical === "query: ") {
    return null;
  }

  const raws = await embedder.embed([canonical]);
  if (raws.length !== 1) {
    throw new EmbeddingShapeError(`embedder returned ${raws.length} vectors for 1 input`);
  }
  const [vector] = normaliseVectors(raws, EMBEDDING_DIM);
  const revision = embedder.revision;
  await client.query(
    `UPDATE cases SET embedding = $1::vector, embedding_model = $2,
       embedding_revision = $3, embedding_space = $4 WHERE id = $5`,
    [vectorToSql(vector), embedder.model, revision, embedder.space, missingCaseId],
  );
  return { vector, model: embedder.model, revision, space: embedder.space };
}