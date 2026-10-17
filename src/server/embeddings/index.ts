// TASK-016 / COMP-011: the embed-and-store service (P3-024).
//
// `reembedAll` recomputes the embedding for every non-redacted case row and
// stores the model / revision / space with the vector. It refuses to leave
// the table in a mixed state (TC-059): if any row already has a different
// `embedding_space` it rewrites the whole table in a single transaction, or
// aborts untouched. The matcher compares cosine, so mixing spaces is unsafe.
//
// The function never reaches for a real model by itself; it takes an
// `Embedder` (production passes the local Transformers.js one, tests pass
// `createFakeEmbedder`). That keeps tests fast and offline, and keeps the
// "no network in tests" rule in the AGENTS file.
//
// Output vector format: pgvector accepts `[v0,v1,...]` text. The schema
// `vector(384)` enforces the dimension; the column is `vector_cosine_ops`
// in the HNSW index. We use a single quoted string parameter so the driver
// never has to escape the values.

import { type Queryable } from "@/server/db/queryable";
import { type Embedder, EMBEDDING_DIM, EmbeddingShapeError, normaliseVectors } from "./model";
import { canonicalCaseText, structuredCaseText } from "./text";

/** Minimal row shape we need to embed. Other columns are unused. */
type EmbeddableCaseRow = {
  id: string;
  kind: "missing" | "found";
  embedding: number[] | null;
  embedding_model: string | null;
  embedding_revision: string | null;
  embedding_space: string | null;
  anonymised_at: string | null;
  // Structured fields. All are nullable in the schema.
  clothing: string | null;
  marks: string | null;
  circumstances: string | null;
  place_text: string | null;
};

export type ReembedSummary = {
  considered: number;
  embedded: number;
  skippedEmpty: number;
  previousSpace: string | null;
  /** How many rows already had a different embedding_space before the run. */
  previousConflicting: number;
  newSpace: string;
  newModel: string;
  newRevision: string | null;
};

/**
 * Encode a Float32Array as the `[v0,v1,...]` text pgvector accepts.
 * - All values are finite (normaliseVectors rejects NaN/Inf).
 * - Six decimal places is plenty for cosine over L2-normalised vectors.
 */
function vectorToSql(v: Float32Array): string {
  const parts: string[] = new Array(v.length);
  for (let i = 0; i < v.length; i++) parts[i] = v[i].toFixed(6);
  return `[${parts.join(",")}]`;
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function decodeRow(raw: Record<string, unknown>): EmbeddableCaseRow {
  const id = raw.id;
  const kind = raw.kind;
  if (typeof id !== "string") throw new Error("cases.id missing");
  if (kind !== "missing" && kind !== "found") throw new Error("cases.kind invalid");
  return {
    id,
    kind,
    embedding: raw.embedding === null || raw.embedding === undefined ? null : (raw.embedding as number[]),
    embedding_model: isString(raw.embedding_model) ? raw.embedding_model : null,
    embedding_revision: isString(raw.embedding_revision) ? raw.embedding_revision : null,
    embedding_space: isString(raw.embedding_space) ? raw.embedding_space : null,
    anonymised_at: isString(raw.anonymised_at) ? raw.anonymised_at : null,
    clothing: isString(raw.clothing) ? raw.clothing : null,
    marks: isString(raw.marks) ? raw.marks : null,
    circumstances: isString(raw.circumstances) ? raw.circumstances : null,
    place_text: isString(raw.place_text) ? raw.place_text : null,
  };
}

function toEmbeddableRow(raw: Record<string, unknown>): EmbeddableCaseRow & { _structured: string } {
  const row = decodeRow(raw);
  // structuredCaseText is deterministic; if it is empty we still embed (the
  // brief never says to skip — and a uniform fallback vector is the honest
  // behaviour for rows the schema requires to exist with at least one of
  // circumstances/clothing/marks for found rows).
  return { ...row, _structured: structuredCaseText(row) };
}

export type ReembedDeps = {
  withTransaction: <T>(fn: (client: Queryable) => Promise<T>) => Promise<T>;
};

/**
 * Re-embed every non-redacted case row.
 *
 * - Reads the row id, kind, and the four structured fields.
 * - Embeds in one batch with the supplied Embedder.
 * - If ANY existing row already has a different `embedding_space` from the
 *   embedder's, the whole operation is wrapped in a single transaction: we
 *   rewrite every row, then COMMIT. If anything throws, the transaction
 *   aborts and no row changes (TC-059, "REFUSES to leave mixed spaces: if
 *   any row has a different embedding_space it rewrites all rows in one
 *   transaction or aborts untouched"). When the spaces already match, the
 *   loop is still inside the transaction so a partial failure rolls back.
 * - Returns a summary; never throws on per-row problems that can be skipped
 *   (a row with no structured text contributes a zero-length input, but we
 *   still embed and store — see `skippedEmpty`).
 */
export async function reembedAll(
  db: Queryable,
  embedder: Embedder,
  deps: ReembedDeps,
): Promise<ReembedSummary> {
  if (embedder.dimension !== EMBEDDING_DIM) {
    throw new EmbeddingShapeError(`embedder dimension ${embedder.dimension} != ${EMBEDDING_DIM}`);
  }

  const summary: ReembedSummary = {
    considered: 0,
    embedded: 0,
    skippedEmpty: 0,
    previousSpace: null,
    previousConflicting: 0,
    newSpace: embedder.space,
    newModel: embedder.model,
    newRevision: embedder.revision,
  };

  return deps.withTransaction(async (client) => {
    // 1) Load every non-redacted case row. We project only what we need.
    const { rows } = await client.query(
      "SELECT id, kind, embedding, embedding_model, embedding_revision, embedding_space, " +
        "anonymised_at, clothing, marks, circumstances, place_text " +
        "FROM cases WHERE anonymised_at IS NULL ORDER BY created_at, id",
    );

    const records: Array<EmbeddableCaseRow & { _structured: string }> = [];
    let firstExistingSpace: string | null = null;
    let conflictingRows = 0;
    for (const r of rows) {
      if (r === null || typeof r !== "object") continue;
      const rec = toEmbeddableRow(r as Record<string, unknown>);
      if (rec.embedding_space !== null) {
        if (firstExistingSpace === null) firstExistingSpace = rec.embedding_space;
        if (rec.embedding_space !== embedder.space) conflictingRows += 1;
      }
      records.push(rec);
    }
    summary.considered = records.length;
    summary.previousSpace = firstExistingSpace;
    summary.previousConflicting = conflictingRows;

    if (conflictingRows > 0) {
      // The brief says: REFUSES to leave mixed spaces — rewrite every row in
      // one transaction (TC-059). We are already inside `withTransaction`, so
      // the next UPDATE loop commits a single, consistent space. The summary
      // records the conflict count for the operator; the table itself never
      // holds two spaces at the end.
    }

    if (records.length === 0) return summary;

    // 2) Build the texts to embed.
    const texts: string[] = records.map((r) => canonicalCaseText(r));
    const emptyIdx = new Set<number>();
    for (let i = 0; i < texts.length; i++) {
      // strip the prefix and check the body
      const body = texts[i].replace(/^(query|passage): /, "");
      if (body.length === 0) emptyIdx.add(i);
    }

    // 3) Embed in one batch.
    const vectors = await embedder.embed(texts);
    const normalised = normaliseVectors(vectors, EMBEDDING_DIM);
    if (normalised.length !== records.length) {
      throw new EmbeddingShapeError(
        `embedder returned ${normalised.length} vectors for ${records.length} rows`,
      );
    }

    // 4) Persist each row with the matching model / revision / space.
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const v = normalised[i];
      await client.query(
        "UPDATE cases SET embedding = $1::vector, embedding_model = $2, " +
          "embedding_revision = $3, embedding_space = $4 WHERE id = $5",
        [vectorToSql(v), embedder.model, embedder.revision, embedder.space, r.id],
      );
      if (emptyIdx.has(i)) summary.skippedEmpty += 1;
      else summary.embedded += 1;
    }
    return summary;
  });
}
