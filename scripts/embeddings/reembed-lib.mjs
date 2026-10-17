// TASK-016 re-embed logic, separate from the CLI so tests can drive it
// with a fake embedder.
//
// SUBMITTED CASES ONLY
//   We only ever SELECT from `cases` (the submitted table). Unreviewed
//   intake drafts live in `intake_drafts` and are never read; a unit test
//   asserts the source does not contain the string "intake_drafts".
//
// VERSION-GUARDED UPDATES
//   Every UPDATE is conditional on the row's `version` (and on
//   `anonymised_at IS NULL` and `status <> ALL(TERMINAL)`). A
//   concurrent edit that bumps `version` makes the UPDATE rowCount 0
//   and we count it as a stale retry. The next pass picks it up.
//
// EMPTY EMBED TEXT
//   A row whose structured fields are all empty produces a bare-prefix
//   text; we MUST NOT embed that (every such row would map to the same
//   generic vector and the matcher would treat them as duplicates). If
//   the row already has an old vector it is cleared in the same pass so
//   the table does not keep stale vectors on rows whose embed text is
//   now empty.
//
// TERMINAL AND REDACTED ROWS
//   Confirmed / closed / referred cases are locked by the
//   `cases_transition_guard` trigger (their report fields cannot
//   change, so the embedding never needs to be re-derived). Redacted
//   cases have no text and must keep `embedding = NULL`. Both are left
//   untouched.
//
// MODEL-SPACE UPGRADE (fail-closed)
//   `reembedCases` is idempotent in the same space. When stored active
//   vectors do not match the requested tuple, the function refuses
//   to leave the matching_state / matched_at / match_error_id columns
//   stale: it DELETEs the pending candidates and resets matching_state
//   for any non-terminal case whose stored vector is about to be
//   rewritten. Confirmed / closed / referred candidates are kept —
//   they are locked and were decided under a specific run, and the
//   spec does not let us undo a confirmation. The operator MUST rerun
//   the matcher after the model change; a warning is surfaced so the
//   wave gate can see it.

import { EMBEDDING, ROLE_BY_KIND, verifyModelCache } from "../../src/server/embeddings/model.ts";
import { caseEmbeddingText } from "../../src/server/embeddings/text.ts";

export const DEFAULT_BATCH = 25;

// Confirmed / closed / referred cases are locked by the
// cases_transition_guard trigger. Listed in the trigger and here; the
// schema owner must keep the two in sync.
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
              clothing, marks, circumstances, place_text
         FROM cases
        WHERE anonymised_at IS NULL AND status <> ALL($4) AND id > $5 AND ${STALE_SQL}
        ORDER BY id LIMIT $6`,
      [...params, TERMINAL, last, batchSize],
    );
    if (rows.length === 0) break;
    last = rows[rows.length - 1].id;
    const work = [];
    for (const row of rows) {
      const text = caseEmbeddingText(row);
      if (text === "") {
        // Nothing to embed. A case that already holds an old vector
        // must not keep it: clear it. A case that has no vector at
        // all stays NULL.
        if (row.has_embedding) work.push({ id: row.id, version: row.version, literal: NULL_VECTOR, clear: true });
        else counts.skipped_empty++;
        continue;
      }
      // Missing reports are the query side, found records the passage
      // side (D2 Part A).
      const vector = await embedOne(text, ROLE_BY_KIND[row.kind]);
      work.push({
        id: row.id,
        version: row.version,
        literal: `[${Array.from(vector).join(",")}]`,
      });
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

// One-text-at-a-time helper. The runtime loader exposes a batched
// `embed(texts)` interface; this thin wrapper just calls it for the one
// text we are about to write. Tests inject a fake embedder via the
// optional `embedFn` parameter.
async function embedOne(text, role, embedFn) {
  if (embedFn) return embedFn(text, role);
  const { embedOneText } = await import("../../src/server/embeddings/model.ts");
  return embedOneText(text, role);
}

/**
 * Embeds every eligible case whose embedding is NULL or from a
 * different model, revision or space. Idempotent in the same space.
 * One transaction per batch. If rows went stale mid-run (edited
 * concurrently), ONE more bounded pass is made.
 *
 * Before the embed pass the function checks stored non-terminal vectors
 * against the requested tuple. This catches the normal release-upgrade
 * case where the target is the current `EMBEDDING` constant but the DB
 * still holds vectors from the previously pinned revision. If any differ,
 * it deletes pending candidates touching active cases and resets active
 * match state. Confirmed / closed / referred cases are NOT touched.
 * The two-step is to make sure the matcher never compares a vector
 * from the old space to one from the new space (mixing spaces is
 * unsafe — the cosine is on a different scale and on a different side
 * of the asymmetric prefix). The clean-up runs in its own transaction
 * so the operator sees an explicit count and can rerun the matcher
 * separately.
 */
export async function reembedCases(
  client,
  { batchSize = DEFAULT_BATCH, embedding = EMBEDDING, retryStale = true, beforeWrite = null, embedFn = null } = {},
) {
  await client.query("SET statement_timeout = '60s'");
  await client.query("SET lock_timeout = '5s'");

  const persistedUpgrade = await hasStaleVectors(client, embedding);
  const isSpaceUpgrade = !spaceEqual(embedding, EMBEDDING) || persistedUpgrade;
  let invalidated = { pending_candidates: 0, cases_reset: 0 };
  if (isSpaceUpgrade) {
    invalidated = await invalidateStaleMatchState(client);
  }

  const first = await pass(client, { batchSize, embedding, beforeWrite });
  const counts = { ...first, ...invalidated, stale_remaining: 0, space_upgrade: isSpaceUpgrade };
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

async function hasStaleVectors(client, embedding) {
  const { rows } = await client.query(
    `SELECT EXISTS (
       SELECT 1
         FROM cases
        WHERE embedding IS NOT NULL
          AND anonymised_at IS NULL
          AND status <> ALL($4)
          AND (embedding_model IS DISTINCT FROM $1
            OR embedding_revision IS DISTINCT FROM $2
            OR embedding_space IS DISTINCT FROM $3)
     ) AS stale`,
    [embedding.model, embedding.revision, embedding.space, TERMINAL],
  );
  return rows[0]?.stale === true;
}

function spaceEqual(a, b) {
  return a.model === b.model && a.revision === b.revision && a.space === b.space;
}

/**
 * On a model-space upgrade, fail-closed: drop pending candidates and
 * reset matching_state for non-terminal cases. Confirmed / closed /
 * referred candidates are kept (the trigger locks them; we must not
 * undo a confirmation).
 *
 * Counts: pending_candidates = rows deleted from match_candidates
 * (status = 'pending'); cases_reset = rows in cases that were reset
 * to matching_state = 'queued'. Both happen in one transaction so the
 * operator sees a consistent snapshot.
 */
async function invalidateStaleMatchState(client) {
  const counts = { pending_candidates: 0, cases_reset: 0 };
  await client.query("BEGIN");
  try {
    // Delete pending candidates touching any non-terminal endpoint. A
    // confirmed candidate stays; a closed/referred-only candidate stays.
    // Either side may carry the stale vector, so check both endpoints.
    const del = await client.query(
      `DELETE FROM match_candidates
         WHERE status = 'pending'
           AND (
             missing_case_id IN (SELECT id FROM cases WHERE status <> ALL($1))
             OR found_case_id IN (SELECT id FROM cases WHERE status <> ALL($1))
           )
        RETURNING id`,
      [TERMINAL],
    );
    counts.pending_candidates = del.rowCount ?? 0;
    // Reset matching_state for any non-terminal case. We do not touch
    // terminal cases (their fields are locked and the embedding was
    // never going to be re-derived on them anyway).
    const upd = await client.query(
      `UPDATE cases
          SET matching_state = 'queued', matched_at = NULL, match_error_id = NULL
        WHERE status <> ALL($1)
          AND (matching_state <> 'queued' OR matched_at IS NOT NULL OR match_error_id IS NOT NULL)
        RETURNING id`,
      [TERMINAL],
    );
    counts.cases_reset = upd.rowCount ?? 0;
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  }
  return counts;
}

/**
 * One-shot helper for tests and for the CLI to fail fast when the
 * local cache is missing or tampered with. Throws with a `model:fetch`
 * hint on any failure.
 */
export async function assertCacheReady(cacheDir) {
  await verifyModelCache(cacheDir);
}
