// TASK-016 re-embed logic, separate from the CLI so tests/db/embeddings.test.ts can drive
// it with a fake embedder. Loads the embeddings service sources directly with Node's type
// stripping (model.ts / text.ts are self-contained for this reason).
import { EMBEDDING, embedText } from "../../src/server/embeddings/model.ts";
import { caseEmbeddingText } from "../../src/server/embeddings/text.ts";

export const DEFAULT_BATCH = 25;

// confirmed / closed / referred cases are locked by the cases_transition_guard trigger
// (their report fields, which include the embedding, cannot change), and they are no
// longer matched, so they are left as they are. Redacted cases (anonymised_at) have no
// text and must keep embedding NULL (schema CHECK).
const TERMINAL = ["confirmed", "closed", "referred"];

const STALE_SQL = `(embedding IS NULL OR embedding_model IS DISTINCT FROM $1
                    OR embedding_revision IS DISTINCT FROM $2 OR embedding_space IS DISTINCT FROM $3)`;

/**
 * Embeds every eligible case whose embedding is NULL or from a different model, revision
 * or space. Idempotent: a second run finds nothing to do. One transaction per batch.
 * Returns counts only; never returns or logs case text.
 */
export async function reembedCases(client, { batchSize = DEFAULT_BATCH, embedding = EMBEDDING } = {}) {
  const params = [embedding.model, embedding.revision, embedding.space];
  const counts = { embedded: 0, skipped_empty: 0, stale_retry: 0, batches: 0 };
  let last = "00000000-0000-0000-0000-000000000000";
  for (;;) {
    const { rows } = await client.query(
      `SELECT id, kind, version, sex, age_years, age_min, age_max, clothing, marks, circumstances, place_text
         FROM cases
        WHERE anonymised_at IS NULL AND status <> ALL($4) AND id > $5 AND ${STALE_SQL}
        ORDER BY id LIMIT $6`,
      [...params, TERMINAL, last, batchSize],
    );
    if (rows.length === 0) break;
    last = rows[rows.length - 1].id;
    // Embed first, outside the transaction, so the write transaction stays short.
    const work = [];
    for (const row of rows) {
      const text = caseEmbeddingText(row);
      if (text === "") {
        counts.skipped_empty++;
        continue;
      }
      // Missing reports are the query side, found records the passage side (D2 Part A).
      const vector = await embedText(text, row.kind === "missing" ? "query" : "passage");
      work.push({ id: row.id, version: row.version, literal: `[${Array.from(vector).join(",")}]` });
    }
    if (work.length === 0) continue;
    await client.query("BEGIN");
    try {
      for (const w of work) {
        const res = await client.query(
          `UPDATE cases SET embedding = $1::vector, embedding_model = $2, embedding_revision = $3, embedding_space = $4
            WHERE id = $5 AND version = $6 AND anonymised_at IS NULL AND status <> ALL($7)`,
          [w.literal, ...params, w.id, w.version, TERMINAL],
        );
        if (res.rowCount === 1) counts.embedded++;
        else counts.stale_retry++; // edited, locked or redacted since the read; the next run picks it up
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    }
    counts.batches++;
  }
  return counts;
}
