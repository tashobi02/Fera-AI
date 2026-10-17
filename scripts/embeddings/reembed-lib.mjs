// TASK-016 re-embed logic, separate from the CLI so tests/db/embeddings.test.ts can drive
// it with a fake embedder. Loads the embeddings service sources directly with Node's type
// stripping (model.ts / text.ts are self-contained for this reason).
//
// Reads ONLY submitted cases (table `cases`); unreviewed intake drafts (`intake_drafts`)
// are never selected, so they can never be embedded.
import { EMBEDDING, ROLE_BY_KIND, embedText } from "../../src/server/embeddings/model.ts";
import { caseEmbeddingText } from "../../src/server/embeddings/text.ts";

export const DEFAULT_BATCH = 25;

// confirmed / closed / referred cases are locked by the cases_transition_guard trigger
// (their report fields, which include the embedding, cannot change), and they are no
// longer matched, so they are left as they are. Redacted cases (anonymised_at) have no
// text and must keep embedding NULL (schema CHECK). NOTE: this list DUPLICATES the trigger's
// terminal states in db/schema_v2.sql; the schema owner must keep the two in sync.
export const TERMINAL = ["confirmed", "closed", "referred"];

const STALE_SQL = `(embedding IS NULL OR embedding_model IS DISTINCT FROM $1
                    OR embedding_revision IS DISTINCT FROM $2 OR embedding_space IS DISTINCT FROM $3)`;
const NULL_VECTOR = null;

async function pass(client, { batchSize, embedding, beforeWrite }) {
  const params = [embedding.model, embedding.revision, embedding.space];
  const counts = { embedded: 0, skipped_empty: 0, cleared_empty: 0, stale_retry: 0, batches: 0 };
  let last = "00000000-0000-0000-0000-000000000000";
  for (;;) {
    const { rows } = await client.query(
      `SELECT id, kind, version, (embedding IS NOT NULL OR embedding_model IS NOT NULL) AS has_embedding,
              sex, age_years, age_min, age_max, clothing, marks, circumstances, place_text
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
        // Nothing to embed. A case that already holds an old vector must not keep it: clear it.
        if (row.has_embedding) work.push({ id: row.id, version: row.version, literal: NULL_VECTOR, clear: true });
        else counts.skipped_empty++;
        continue;
      }
      // Missing reports are the query side, found records the passage side (D2 Part A).
      const vector = await embedText(text, ROLE_BY_KIND[row.kind]);
      work.push({ id: row.id, version: row.version, literal: `[${Array.from(vector).join(",")}]` });
    }
    if (beforeWrite) await beforeWrite(rows); // test seam: simulate a concurrent edit
    if (work.length === 0) continue;
    await client.query("BEGIN");
    try {
      for (const w of work) {
        const res = w.clear
          ? await client.query(
              `UPDATE cases SET embedding = NULL, embedding_model = NULL, embedding_revision = NULL, embedding_space = NULL
                WHERE id = $1 AND version = $2 AND anonymised_at IS NULL AND status <> ALL($3)`,
              [w.id, w.version, TERMINAL],
            )
          : await client.query(
              `UPDATE cases SET embedding = $1::vector, embedding_model = $2, embedding_revision = $3, embedding_space = $4
                WHERE id = $5 AND version = $6 AND anonymised_at IS NULL AND status <> ALL($7)`,
              [w.literal, ...params, w.id, w.version, TERMINAL],
            );
        if (res.rowCount === 1) {
          if (w.clear) counts.cleared_empty++;
          else counts.embedded++;
        } else counts.stale_retry++; // edited, locked or redacted since the read
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

/**
 * Embeds every eligible case whose embedding is NULL or from a different model, revision
 * or space. Idempotent: a second run finds nothing to do. One transaction per batch.
 * If rows went stale mid-run (edited concurrently), ONE more bounded pass is made.
 * Returns counts only; never returns or logs case text.
 *
 * Open decision for the matcher (TASK-017): after a model change this does NOT reset
 * matching_state / matched_at / match_error_id; candidates computed from old-space vectors
 * are not invalidated here.
 */
export async function reembedCases(client, { batchSize = DEFAULT_BATCH, embedding = EMBEDDING, retryStale = true, beforeWrite = null } = {}) {
  await client.query("SET statement_timeout = '60s'");
  await client.query("SET lock_timeout = '5s'");
  const first = await pass(client, { batchSize, embedding, beforeWrite });
  const counts = { ...first, stale_remaining: 0 };
  if (first.stale_retry > 0 && retryStale) {
    const second = await pass(client, { batchSize, embedding, beforeWrite: null });
    counts.embedded += second.embedded;
    counts.cleared_empty += second.cleared_empty;
    counts.skipped_empty = Math.max(counts.skipped_empty, second.skipped_empty);
    counts.batches += second.batches;
    counts.stale_remaining = second.stale_retry;
  } else {
    counts.stale_remaining = first.stale_retry;
  }
  return counts;
}
