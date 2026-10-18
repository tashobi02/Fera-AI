import type { Queryable } from "@/server/db/queryable";
// TASK-017d / P3-040: the matcher run (D2A §5.7, BR-017/018/019/020, D5 BR-017).
// Owner: Masnun. Server-only.
//
// One matcher run is the bounded synchronous work for a single missing case:
//   1. SELECT the missing case row in a transaction, lock the case row + every
//      pending candidate for the pair under the lock protocol (lock.ts).
//   2. SELECT every eligible found case (filters.ts, BR-017) and embed each only
//      when its `embedding` column is NULL. Reuse the existing space on the row
//      so a new space from a different model never reaches the cosine (TC-059).
//   3. scorePair(...) for every pair; rankCandidates(...) keeps at most five
//      qualified pairs (FR-012, BR-018, A-028; documented default cap 5).
//   4. Insert one match_candidates row per qualified pair at the missing and
//      found endpoints' current versions. On a same-version conflict, only the
//      status/decision timestamp are refreshed: fera_app is intentionally not
//      granted UPDATE on candidate score/rank/reason/component columns. Pairs
//      already `rejected` at ANY versions are NEVER re-inserted (BR-019 —
//      filters.ts excludes them by endpoint identity only).
//   5. reconcileQueueState() moves the missing report to `matched_pending_review`
//      when it has at least one qualified pending candidate, otherwise to `open`,
//      and writes a `case.state_changed` audit row for the same transaction
//      (state.ts).
//   6. Stamp `matching_state = 'complete'` and `matched_at = now()` (or
//      'failed' / `match_error_id` on the error path).
//
// The run is the SINGLE place candidates are ever created; API-014 calls it on
// demand, and API-003/API-005/API-007 hooks call it after their writes commit.
//
// `runMatcherForCase(db, missingCaseId, opts)` is the only public entry point.
// Everything else is internal. `opts.embedder` is required; tests inject
// `createFakeEmbedder` (no model download, no paid call).
import type { PoolClient } from "pg";
import { canonicalCaseText } from "@/server/embeddings/text";
import { ApiError } from "@/app/api/_shared/envelope";
import { LIMITS, isUuid, type MatchingState } from "@/contracts";
import { SYSTEM_ACTOR } from "@/server/audit";
import type { Embedder } from "@/server/embeddings/model";
import { EmbeddingShapeError, EMBEDDING_DIM, loadLocalEmbedder, normaliseVectors } from "@/server/embeddings/model";
import {
  lockCases,
  lockCandidates,
  LockSetChanged,
  pendingCandidatesFor,
  reconcileQueueState,
  withTransaction,
  type Connectable,
  type TxOptions,
} from "@/server/case/internal";
import { getCaseRow, mapCaseRow } from "@/server/case/rows";
import type { CaseRow } from "@/contracts/server";
import { eligibleFoundCandidates, type EligibleFoundCandidate } from "./filters";
import { reasonsFor, type MatchReason, type ReasonsForView } from "./reasons";
import { rankCandidates, scorePair, type RankedCandidate, type ScoredCandidate } from "./score";
import { MissingNotEmbeddableError, embedMissingForRun } from "./embed";
import { districtNeighbourFor, loadNeighbourSet } from "./neighbour";
import { persistDuplicateFlags } from "@/server/duplicates/persist";

/* ---------- public options and return shape ---------- */

export type MatcherRunOptions = {
  /** Tests inject a deterministic embedder; production lazily loads the local E5 model. */
  embedder?: Embedder;
  /** Source of the run for the audit: API-014 rematch or API-003/005/007 after-commit. */
  api: "API-003" | "API-005" | "API-007" | "API-014";
  requestId?: string | null;
  /** Test seam: replace the transaction wrapper. */
  withTransaction?: typeof withTransaction;
  /** Test seam: use a selected pool for each bounded transaction. */
  pool?: Connectable;
};

export type MatcherRunResult = {
  caseId: string;
  state: MatchingState;
  /** Qualified, ranked candidates the run wrote. Empty for an abstain (TC-041) or a failure. */
  candidates: { id: string; rank: number; similarity: number }[];
  /** Total considered before ranking (eligible rows). */
  considered: number;
  /** True when the run produced zero qualified candidates (TC-041). */
  abstained: boolean;
  /** Error code to record on the case row when state === 'failed' (e.g. "E-021"). */
  errorId?: string;
};

/* ---------- constants ---------- */

const SUPERSEDED_NOTE = "Superseded by a fresher match run";

/* ---------- SQL strings (parameterised; no interpolation) ---------- */

const STAMP_RUNNING_SQL = `
  UPDATE cases SET matching_state = 'running', match_error_id = NULL,
                   matched_at = NULL
  WHERE id = $1 AND matching_state IN ('queued', 'failed')`;

const STAMP_COMPLETE_SQL = `
  UPDATE cases SET matching_state = 'complete', matched_at = now(), match_error_id = NULL
  WHERE id = $1`;

const STAMP_FAILED_SQL = `
  UPDATE cases SET matching_state = 'failed', matched_at = NULL, match_error_id = $2
  WHERE id = $1`;

const SUPERSEDE_PRIOR_VERSIONS_SQL = `
  UPDATE match_candidates SET status = 'superseded', decided_at = now()
  WHERE missing_case_id = $1
    AND status = 'pending'
    AND id <> ALL($2::uuid[])`;

const UPSERT_CANDIDATE_SQL = `
  INSERT INTO match_candidates (missing_case_id, found_case_id, missing_version, found_version,
                                score, rank, reason_bn, reason_en, components)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
  ON CONFLICT (missing_case_id, found_case_id, missing_version, found_version) DO UPDATE
    SET status = 'pending',
        decided_at = NULL
  RETURNING id`;

/* ---------- reason + component builders ---------- */

type ReasonAndComponents = { reasonBn: string; reasonEn: string; components: Record<string, number | null> };

function buildReasonAndComponents(
  missing: CaseRow,
  found: CaseRow,
  scored: ScoredCandidate,
  reasons: MatchReason[],
): ReasonAndComponents {
  // reason_bn / reason_en are short, deterministic, template-driven (TASK-017c, FR-014/015).
  // The two most informative reasons go in: the first "agree" and the first "review"
  // verdict on the nine compareCases fields. If none, fall back to the similarity label.
  const agree = reasons.find((r) => r.verdict === "agree");
  const review = reasons.find((r) => r.verdict === "review");
  const bn: string[] = [];
  const en: string[] = [];
  if (agree) {
    bn.push(`${agree.fieldKey} একমত`);
    en.push(`${agree.fieldKey} agree`);
  }
  if (review) {
    bn.push(`${review.fieldKey} যাচাই করুন`);
    en.push(`${review.fieldKey} compare by eye`);
  }
  if (bn.length === 0) {
    bn.push(`মিলের মাত্রা ${scored.similarity.toFixed(0)}/১০০`);
    en.push(`similarity ${scored.similarity.toFixed(0)}/100`);
  }
  // Reason text is bounded by the schema CHECK (length(reason_*) <= 200).
  return {
    reasonBn: bn.join("; ").slice(0, 200),
    reasonEn: en.join("; ").slice(0, 200),
    components: {
      cosine: scored.components.cosine,
      name: scored.components.name,
      clothing: scored.components.clothing,
      district: scored.components.district,
      age: scored.components.age,
    },
  };
}

function viewForReasons(row: CaseRow): ReasonsForView {
  // The reasons module takes a ReasonsForView (a Pick<OfficerCaseView, …>) and
  // forwards the two views to compareCases, which only walks the nine
  // compareCases fields. Build the minimum shape reasonsFor actually reads so
  // the call below is typesafe: any future contract drift that adds a
  // required field is caught by `tsc` here, not by an `as never` cast that
  // silently drops a property. The view is a plain value, never projected
  // through the route layer, so no DTO leakage happens here.
  return {
    child: {
      name: row.child_name,
      name_latin: row.child_name_latin,
      age_years: row.age_years,
      age_min: row.age_min,
      age_max: row.age_max,
      sex: row.sex,
      height_cm: row.height_cm,
      clothing: row.clothing,
      marks: row.marks,
    },
    event: {
      at: row.event_at,
      at_approx: row.event_at_approx,
      at_lower: row.event_at_lower,
      at_upper: row.event_at_upper,
      place_text: row.place_text,
      district_code: row.district_code,
      district_name_bn: null,
      thana: row.thana,
      circumstances: row.circumstances,
    },
    reporter_relation: row.reporter_relation,
    contact_phone: row.contact_phone,
    contact_phone_masked: row.contact_phone ? null : null,
  };
}

/* ---------- found-end embedding reuse ---------- */

function parseVectorText(value: string): number[] {
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

/* ---------- found-end embed guard for the duplicate hook ----------
 *
 * `runMatcherForFoundCase` must run the duplicate persister for the found
 * case even when the missing-fanout loop has zero rows (the matcher can be
 * a no-op for an empty queue and the duplicate review surface still needs
 * to be populated for a freshly opened found report). Found reports are
 * embedded synchronously by API-007 / `reembedAll`, so this helper only
 * VALIDATES the row: it never calls the provider. Refusals are explicit
 * (redacted / wrong kind / closed-or-referred / no embedding / wrong
 * version) so the orchestrator can return a precise matcher state.
 */

export class FoundNotEmbeddableError extends Error {
  constructor(readonly caseId: string, readonly reason: "redacted" | "terminal" | "wrong_kind" | "no_embedding" | "stale_version") {
    super(`found case ${caseId} not embeddable (${reason})`);
    this.name = "FoundNotEmbeddableError";
  }
}

export type FoundEmbeddingState = {
  vector: Float32Array;
  model: string;
  revision: string | null;
  space: string;
  version: number;
};

/**
 * Validate the found case's current embedding in its own space. NO provider
 * call. Throws `FoundNotEmbeddableError` for: wrong kind, anonymised,
 * terminal status (closed / referred / confirmed), missing embedding, or
 * a row whose model/revision/space tags are absent. The returned version
 * is the row's current version; the duplicate persister re-checks it
 * under the lock.
 */
export async function embedFoundForRun(client: PoolClient, foundCaseId: string, embedder?: Embedder): Promise<FoundEmbeddingState> {
  const { rows } = await client.query(`SELECT id, kind, status, version, anonymised_at, embedding::text AS embedding,
    embedding_model, embedding_revision, embedding_space, clothing, marks, circumstances, place_text
    FROM cases WHERE id=$1`, [foundCaseId]);
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row || row.kind !== "found") throw new FoundNotEmbeddableError(foundCaseId, "wrong_kind");
  if (row.anonymised_at !== null) throw new FoundNotEmbeddableError(foundCaseId, "redacted");
  if (row.status !== "open" && row.status !== "matched_pending_review") throw new FoundNotEmbeddableError(foundCaseId, "terminal");
  const version = Number(row.version);
  if (row.embedding !== null && typeof row.embedding_model === "string" && typeof row.embedding_space === "string") {
    return { vector: normaliseVectors([parseVectorText(String(row.embedding))], EMBEDDING_DIM)[0]!,
      model: row.embedding_model, revision: typeof row.embedding_revision === "string" ? row.embedding_revision : null, space: row.embedding_space, version };
  }
  if (!embedder || embedder.dimension !== EMBEDDING_DIM) throw new FoundNotEmbeddableError(foundCaseId, "no_embedding");
  const text = canonicalCaseText({ kind: "found", clothing: typeof row.clothing === "string" ? row.clothing : null,
    marks: typeof row.marks === "string" ? row.marks : null, circumstances: typeof row.circumstances === "string" ? row.circumstances : null,
    place_text: typeof row.place_text === "string" ? row.place_text : null });
  if (text.trim() === "passage:") throw new FoundNotEmbeddableError(foundCaseId, "no_embedding");
  const raw = await embedder.embed([text]);
  if (raw.length !== 1) throw new EmbeddingShapeError("expected one found embedding");
  const vector = normaliseVectors(raw, EMBEDDING_DIM)[0]!;
  const updated = await client.query(`UPDATE cases SET embedding=$1::vector, embedding_model=$2,
    embedding_revision=$3, embedding_space=$4 WHERE id=$5 AND version=$6 AND anonymised_at IS NULL
    AND status IN ('open','matched_pending_review')`, [`[${Array.from(vector).join(",")}]`, embedder.model, embedder.revision, embedder.space, foundCaseId, version]);
  if (updated.rowCount !== 1) throw new FoundNotEmbeddableError(foundCaseId, "stale_version");
  return { vector, model: embedder.model, revision: embedder.revision, space: embedder.space, version };
}

/* ---------- run core ---------- */

async function runInsideTransaction(
  client: PoolClient,
  missingCaseId: string,
  opts: MatcherRunOptions,
  embedder: Embedder,
): Promise<MatcherRunResult> {
  // Read a preliminary set, then lock every known endpoint once in UUID order.
  // Re-check eligibility after the locks; edits/rejections that win the race are
  // therefore reflected in the versions used below.
  const peek = await getCaseRow(client, missingCaseId);
  if (!peek) return { caseId: missingCaseId, state: "failed", candidates: [], considered: 0, abstained: false, errorId: "E-004" };
  if (peek.kind !== "missing") return { caseId: missingCaseId, state: "failed", candidates: [], considered: 0, abstained: false, errorId: "E-005" };
  const eligibleBeforeLock = await eligibleFoundCandidates(client, missingCaseId);
  const pendingBeforeLock = await pendingCandidatesFor(client, [missingCaseId]);
  const locked = await lockCases(client, [
    missingCaseId,
    ...eligibleBeforeLock.map((f) => f.found_case_id),
    ...pendingBeforeLock.map((c) => c.found_case_id),
  ]);
  const missing = locked.get(missingCaseId) ?? null;
  if (!missing) return { caseId: missingCaseId, state: "failed", candidates: [], considered: 0, abstained: false, errorId: "E-004" };
  if (missing.kind !== "missing") return { caseId: missingCaseId, state: "failed", candidates: [], considered: 0, abstained: false, errorId: "E-005" };
  // Redacted reports are skipped; their `embedding` may be gone, and BR-017 says
  // redacted endpoints are not eligible for matching.
  if (missing.anonymised_at !== null) {
    return { caseId: missingCaseId, state: "failed", candidates: [], considered: 0, abstained: false, errorId: "E-018" };
  }
  // Terminal reports (closed) are not eligible either.
  if (missing.status === "closed" || missing.status === "confirmed" || missing.status === "referred") {
    return { caseId: missingCaseId, state: "failed", candidates: [], considered: 0, abstained: false, errorId: "E-005" };
  }

  // Re-read eligibility and pending rows under the complete sorted case lock
  // set. If an endpoint appeared since the preliminary reads, retry from the
  // beginning rather than taking a lower UUID lock after this point.
  const eligible = await eligibleFoundCandidates(client, missingCaseId);
  const pending = await pendingCandidatesFor(client, [missingCaseId]);
  if (
    eligible.some((candidate) => !locked.has(candidate.found_case_id)) ||
    pending.some((candidate) => !locked.has(candidate.found_case_id))
  ) {
    throw new LockSetChanged();
  }
  await lockCandidates(client, pending.map((candidate) => candidate.id));

  // 2) Stamp 'running' so concurrent runs of the same case see one is in flight.
  // SYS-BUG-08: when the case lock is taken serially with another run, the
  // second run finds matching_state='running'; the WHERE clause filters for
  // IN ('queued','failed') and would silently produce rowCount=0, letting
  // the second run proceed and supersede the first mid-flight. Detect that
  // state and throw LockSetChanged; withTransaction's retry loop will
  // re-try once the in-flight run has finished.
  const stampRes = await client.query(STAMP_RUNNING_SQL, [missingCaseId]);
  if (stampRes.rowCount === 0) {
    const cur = await client.query<{ matching_state: string }>(
      "SELECT matching_state FROM cases WHERE id = $1",
      [missingCaseId],
    );
    if (cur.rows[0]?.matching_state === "running") {
      throw new LockSetChanged();
    }
    // Any other state (complete / failed / terminal) means the case is
    // no longer eligible; let the natural eligibility recheck produce
    // the right error.
  }

  // 3) Embed the missing case row. The embed helper either returns the existing
  // vector in its current space (reuse) or runs the embedder once and stores it.
  let missingEmbedding: Awaited<ReturnType<typeof embedMissingForRun>> = null;
  try {
    const m = await embedMissingForRun(client, missingCaseId, embedder);
    missingEmbedding = m;
  } catch (err) {
    if (err instanceof MissingNotEmbeddableError) {
      const id = err.reason === "redacted" ? "E-018" : "E-005";
      if (err.reason !== "redacted") await client.query(STAMP_FAILED_SQL, [missingCaseId, id]);
      return { caseId: missingCaseId, state: "failed", candidates: [], considered: 0, abstained: false, errorId: id };
    }
    if (err instanceof EmbeddingShapeError) {
      await client.query(STAMP_FAILED_SQL, [missingCaseId, "E-021"]);
      return { caseId: missingCaseId, state: "failed", candidates: [], considered: 0, abstained: false, errorId: "E-021" };
    }
    throw err;
  }

  // 4) Eligible found cases under BR-017.
  if (eligible.length === 0) {
    // TC-041: an empty shortlist is a valid result. Supersede any prior pending
    // candidate at any version (the run did not produce a fresh top 5) and
    // complete the run with no candidates.
    await supersedePriorPending(client, missingCaseId, missing.version, []);
    await reconcileQueueState(client, SYSTEM_ACTOR, [missingCaseId], { api: opts.api, requestId: opts.requestId ?? null });
    await client.query(STAMP_COMPLETE_SQL, [missingCaseId]);
    return { caseId: missingCaseId, state: "complete", candidates: [], considered: 0, abstained: true };
  }

  // 5) Pre-load neighbour set and per-found embeddings.
  const missingDistrictCode = missing.district_code;
  // Fetch the found rows' district codes + embeddings in ONE round trip. The
  // eligibility set is bounded by `LIMITS.candidatesPerQueueItem` (≤ 50); the
  // single `WHERE id = ANY($1::uuid[])` SELECT replaces the prior per-row
  // serial read so a 50-row fanout is one query, not 50.
  const foundRows = await readFoundRowsForScoring(client, eligible);
  const neighbourSet = await loadNeighbourSet(
    client,
    foundRows.map((r) => r.district_code).filter((c): c is number => c !== null).concat(missingDistrictCode === null ? [] : [missingDistrictCode]),
  );

  const foundEmbeddings = new Map<string, { vector: Float32Array | null; space: string | null; row: FoundRowForScoring }>();
  for (const r of foundRows) {
    foundEmbeddings.set(r.id, { vector: r.foundEmbedding?.vector ?? null, space: r.foundEmbedding?.space ?? null, row: r });
  }

  // 6) Score every pair. An invalid pair (no embeddings, or different spaces) is
  // guaranteed-abstain through scorePair's guard.
  const scored: { id: string; foundId: string; scored: ScoredCandidate; reasons: MatchReason[] }[] = [];
  let considered = 0;
  for (const f of eligible) {
    const fState = foundEmbeddings.get(f.found_case_id);
    if (!fState) continue;
    considered += 1;
    if (missingEmbedding === null || fState.vector === null || fState.space === null) {
      // No usable embedding: skip ranking for this pair (it cannot qualify).
      continue;
    }
    if (missingEmbedding.vector.length !== fState.vector.length || missingEmbedding.space !== fState.space) {
      // Mixed vector dimensions = mixed space = refuse to compare (TC-059).
      continue;
    }
    const districtSame = missingDistrictCode !== null && fState.row.district_code === missingDistrictCode;
    const districtNeighbour = districtNeighbourFor(missingDistrictCode, fState.row.district_code, neighbourSet);
    const pair = scorePair({
      missingEmbedding: missingEmbedding.vector,
      foundEmbedding: fState.vector,
      missingName: missing.child_name,
      foundName: fState.row.child_name,
      missingClothing: missing.clothing,
      foundClothing: fState.row.clothing,
      districtSame,
      districtNeighbour,
      missingAgeMin: missing.age_min,
      missingAgeMax: missing.age_max,
      foundAgeMin: fState.row.age_min,
      foundAgeMax: fState.row.age_max,
    });
    const reasons = reasonsFor({ missing: viewForReasons(missing), found: viewForReasons(fState.row) });
    scored.push({ id: fState.row.id, foundId: fState.row.id, scored: pair, reasons });
  }

  // 7) Rank: at most 5 qualified. The cap is the contract's LIMITS.candidatesPerQueueItem.
  const ranked: RankedCandidate[] = rankCandidates(
    scored.map((s) => ({ id: s.foundId, scored: s.scored })),
    LIMITS.candidatesPerQueueItem,
  );

  // 8) Supersede any pending candidate at a different version (the new run pins
  // a fresh pair). The candidates that DID make the top 5 keep their row; rows
  // that lost the top 5 are also superseded (they were the prior version's
  // top 5, not this version's).
  const topFiveIds = new Set(ranked.map((r) => r.id));
  const keepIds: string[] = [];
  await upsertTopFive(client, missing, ranked, scored, keepIds);
  await client.query(SUPERSEDE_PRIOR_VERSIONS_SQL, [missingCaseId, keepIds]);
  // Anything still pending at this version that is NOT in the new top 5 loses
  // the slot (a confirmed decision is left alone; superseded only touches
  // pending). The supersede above already covers different versions.
  await supersedeDropped(client, missingCaseId, missing.version, topFiveIds);

  // 9) Reconcile the missing report's queue state and stamp 'complete'.
  await reconcileQueueState(client, SYSTEM_ACTOR, [missingCaseId], { api: opts.api, requestId: opts.requestId ?? null });
  await client.query(STAMP_COMPLETE_SQL, [missingCaseId]);

  return {
    caseId: missingCaseId,
    state: "complete",
    candidates: keepIds.map((id, idx) => {
      const r = ranked.find((x) => x.id === id);
      return { id, rank: idx + 1, similarity: r?.similarity ?? 0 };
    }),
    considered,
    abstained: ranked.length === 0,
  };
}

async function supersedePriorPending(
  client: PoolClient,
  missingCaseId: string,
  currentVersion: number,
  keepIds: readonly string[],
): Promise<void> {
  if (keepIds.length === 0) {
    await client.query(
      `UPDATE match_candidates SET status = 'superseded', decided_at = now()
       WHERE missing_case_id = $1 AND status = 'pending'`,
      [missingCaseId],
    );
    return;
  }
  await client.query(
    `UPDATE match_candidates SET status = 'superseded', decided_at = now()
     WHERE missing_case_id = $1 AND status = 'pending' AND id <> ALL($2::uuid[])`,
    [missingCaseId, keepIds],
  );
  // currentVersion kept for symmetry with the documented contract; the WHERE
  // clause above already covers all pending rows on this missing case.
  void currentVersion;
}

async function supersedeDropped(
  client: PoolClient,
  missingCaseId: string,
  currentMissingVersion: number,
  topFiveIds: ReadonlySet<string>,
): Promise<void> {
  // Anything still pending at the CURRENT missing version that is not in the
  // fresh top 5, or whose found endpoint has been redacted since the
  // candidate was created, loses the slot (SYS-BUG-09: a redacted found
  // endpoint can never be served to an officer). Pending rows at a different
  // version are superseded by SUPERSEDE_PRIOR_VERSIONS_SQL before this call.
  if (topFiveIds.size === 0) {
    await client.query(
      `UPDATE match_candidates SET status = 'superseded', decided_at = now()
       WHERE missing_case_id = $1 AND status = 'pending' AND missing_version = $2
         AND (found_case_id IN (SELECT id FROM cases WHERE anonymised_at IS NOT NULL))`,
      [missingCaseId, currentMissingVersion],
    );
    return;
  }
  await client.query(
    `UPDATE match_candidates SET status = 'superseded', decided_at = now()
     WHERE missing_case_id = $1 AND status = 'pending' AND missing_version = $2
       AND (found_case_id <> ALL($3::uuid[])
            OR found_case_id IN (SELECT id FROM cases WHERE anonymised_at IS NOT NULL))`,
    [missingCaseId, currentMissingVersion, Array.from(topFiveIds)],
  );
}

async function upsertTopFive(
  client: PoolClient,
  missing: CaseRow,
  ranked: readonly RankedCandidate[],
  scored: ReadonlyArray<{ id: string; foundId: string; scored: ScoredCandidate; reasons: MatchReason[] }>,
  keepIdsOut: string[],
): Promise<void> {
  if (ranked.length === 0) {
    keepIdsOut.length = 0;
    return;
  }
  for (let i = 0; i < ranked.length; i++) {
    const r = ranked[i]!;
    const s = scored.find((x) => x.id === r.id);
    if (!s) continue;
    const foundRow = (await getCaseRow(client, r.id)) ?? null;
    if (!foundRow) continue;
    // RankedCandidate carries similarity and components; wrap as ScoredCandidate for the reason builder.
    const scoredForReasons: ScoredCandidate = {
      similarity: r.similarity,
      components: r.components,
      qualified: true,
    };
    const built = buildReasonAndComponents(missing, foundRow, scoredForReasons, s.reasons);
    const { rows } = await client.query(UPSERT_CANDIDATE_SQL, [
      missing.id,
      foundRow.id,
      missing.version,
      foundRow.version,
      r.similarity,
      i + 1,
      built.reasonBn,
      built.reasonEn,
      JSON.stringify(built.components),
    ]);
    const id = rows[0]?.id as string | undefined;
    if (id) keepIdsOut.push(id);
  }
}

// The per-found-row projection the rest of the run reads: the mapped case
// row plus the parsed vector and the row's embedding space (used by the
// lock/version/vector-space validation). The vector and space preserve the
// pre-existing shape: a missing or null embedding stays a no-op for scoring
// (the same lock/version/space check at scoring time still applies).
export type FoundRowForScoring = CaseRow & {
  foundEmbedding: { vector: Float32Array; space: string } | null;
};

/**
 * Read the eligible found case rows in ONE parameterised round trip,
 * projecting the embedding text + space alongside the case row. The lock,
 * version and vector-space validation, plus the malformed-pgvector-text
 * behaviour (`EmbeddingShapeError`), are preserved verbatim. Exported for
 * the matcher-run unit tests; the matcher run itself consumes the result
 * through the local `runInsideTransaction` only.
 */
export async function readFoundRowsForScoring(
  client: Queryable,
  eligible: readonly EligibleFoundCandidate[],
): Promise<FoundRowForScoring[]> {
  if (eligible.length === 0) return [];
  const ids = Array.from(new Set(eligible.map((e) => e.found_case_id)));
  // Embed the `CASE_COLUMNS` allowlist once per call; the local SQL string
  // is parameterised on `$1::uuid[]` so the ids are never interpolated. The
  // embedding text + space travel in the same statement so a 50-row fanout
  // is one query, not 50.
  const { CASE_COLUMNS } = await import("@/server/case/rows");
  const { rows } = await client.query(
    `SELECT ${CASE_COLUMNS}, embedding::text AS embedding, embedding_space AS embedding_space FROM cases WHERE id = ANY($1::uuid[])`,
    [ids],
  );
  return rows.map((r) => {
    const row = r as Record<string, unknown>;
    const caseRow = mapCaseRow(r);
    const emb = row.embedding;
    const spaceRaw = row.embedding_space;
    let foundEmbedding: { vector: Float32Array; space: string } | null = null;
    if (emb !== null && emb !== undefined) {
      const space = typeof spaceRaw === "string" ? spaceRaw : null;
      // A missing or non-string space is the same as a missing embedding
      // for the lock/version/space check: the pair cannot qualify and the
      // scoring loop skips it (BR-017/018, TC-059). An unparseable vector
      // raises EmbeddingShapeError so the run stamps E-021 as before.
      if (space !== null) {
        const arr = parseVectorText(String(emb));
        foundEmbedding = { vector: new Float32Array(arr), space };
      }
    }
    return { ...caseRow, foundEmbedding };
  });
}

/* ---------- public entry point ---------- */

/**
 * Run the matcher for a single missing case. Idempotent: a second call on the same
 * case at the same versions re-runs the same SQL and produces the same candidate
 * rows (the unique pair/version key prevents duplicate suggestions). Never
 * auto-confirms; never returns candidate DTOs to the caller — the API route serves
 * the officer view separately.
 *
 * Failure model: an unexpected run failure rolls back candidate and queue-state
 * writes, then a separate bounded transaction persists `matching_state = failed`
 * with a safe error ID. The case creation/open transaction is already committed
 * before this entry point is called, so matcher failure never removes the report.
 *
 * Duplicate hook: after the matcher transaction commits successfully, the
 * missing case is run through `persistDuplicateFlags` (same-kind = missing).
 * The hook is awaited inline — never detached. A duplicate-step failure is
 * mapped to a safe matcher failed state (`E-021`) and the previously
 * submitted/open case row stays saved.
 */
export async function runMatcherForCase(
  missingCaseId: string,
  opts: MatcherRunOptions,
): Promise<MatcherRunResult> {
  if (!isUuid(missingCaseId)) {
    return { caseId: missingCaseId, state: "failed", candidates: [], considered: 0, abstained: false, errorId: "E-004" };
  }
  const tx = opts.withTransaction ?? withTransaction;
  try {
    const embedder = opts.embedder ?? await loadLocalEmbedder();
    if (embedder.dimension !== EMBEDDING_DIM) {
      throw new EmbeddingShapeError(`embedder dimension ${embedder.dimension} != ${EMBEDDING_DIM}`);
    }
    const result = await tx(
      async (client) => runInsideTransaction(client, missingCaseId, opts, embedder),
      { pool: opts.pool } satisfies TxOptions,
    );
    // Post-commit duplicate hook. Runs only after the matcher transaction
    // commits; a thrown error here MUST NOT roll back candidate writes.
    if (result.state === "complete") {
      try {
        await persistDuplicateFlags(missingCaseId, {
          pool: opts.pool,
          requestId: opts.requestId ?? null,
        });
      } catch (hookErr) {
        const errorId = safeFailureId(hookErr);
        await persistFailure(missingCaseId, errorId, opts, "missing");
        return { caseId: missingCaseId, state: "failed", candidates: [], considered: 0, abstained: false, errorId };
      }
    }
    return result;
  } catch (err) {
    const errorId = safeFailureId(err);
    await persistFailure(missingCaseId, errorId, opts, "missing");
    return { caseId: missingCaseId, state: "failed", candidates: [], considered: 0, abstained: false, errorId };
  }
}

const MAX_MISSING_CASES_PER_FOUND_REPORT = 100;

const QUEUE_LIVE_MISSING_SQL = `
  UPDATE cases SET matching_state = 'queued', matched_at = NULL, match_error_id = NULL
  WHERE kind = 'missing' AND anonymised_at IS NULL
    AND status IN ('open', 'matched_pending_review')`;

async function persistFailure(
  caseId: string,
  errorId: string,
  opts: MatcherRunOptions,
  kind: "missing" | "found",
): Promise<void> {
  const tx = opts.withTransaction ?? withTransaction;
  await tx(async (client) => {
    const locked = await lockCases(client, [caseId]);
    const row = locked.get(caseId);
    if (!row || row.kind !== kind || row.anonymised_at !== null) return;
    if (row.status !== "open" && row.status !== "matched_pending_review") return;
    await client.query(STAMP_FAILED_SQL, [caseId, errorId]);
  }, { pool: opts.pool } satisfies TxOptions);
}

function safeFailureId(err: unknown): string {
  if (err instanceof MissingNotEmbeddableError) return err.reason === "redacted" ? "E-018" : "E-005";
  if (err instanceof ApiError && ["E-004", "E-005", "E-018", "E-021"].includes(err.id)) return err.id;
  return "E-021";
}

/**
 * Re-evaluate at most 100 live missing reports after a found report commits.
 * Any remaining live reports stay durably queued and can be retried one at a
 * time through API-014. The found row stores only the aggregate run state.
 *
 * Duplicate hook: the found case's own same-kind duplicate flags must be
 * populated even when the missing-fanout is empty, so the matcher validates
 * the found case's existing embedding with `embedFoundForRun` (no provider
 * call) and then runs `persistDuplicateFlags(foundCaseId, …)` after the
 * missing fanout + the matcher stamp complete. A duplicate-step failure
 * is mapped to a safe matcher failed state (`E-021`); the found case row
 * is left saved.
 */
export async function runMatcherForFoundCase(
  foundCaseId: string,
  opts: Omit<MatcherRunOptions, "api"> & { api?: "API-007" },
): Promise<MatcherRunResult> {
  if (!isUuid(foundCaseId)) {
    return { caseId: foundCaseId, state: "failed", candidates: [], considered: 0, abstained: false, errorId: "E-004" };
  }
  const tx = opts.withTransaction ?? withTransaction;
  try {
    // Step 1: validate the found case's existing embedding in a short
    // post-commit transaction. Found reports are embedded by API-007 /
    // `reembedAll`; this helper never calls the provider, it only
    // asserts the row carries a current embedding in a known space and
    // is open / non-redacted / not terminal. A refusal here is treated
    // as a matcher failure (the case row is left saved by the create/
    // open transaction, so the safe error code surfaces in
    // `match_error_id` for an admin to inspect).
    try {
      await tx(async (client) => {
        await embedFoundForRun(client, foundCaseId, opts.embedder ?? await loadLocalEmbedder());
      }, { pool: opts.pool } satisfies TxOptions);
    } catch (embedErr) {
      const errorId = embedErr instanceof FoundNotEmbeddableError
        ? (embedErr.reason === "redacted" ? "E-018" : "E-005")
        : "E-021";
      await persistFailure(foundCaseId, errorId, { ...opts, api: "API-007" }, "found");
      return { caseId: foundCaseId, state: "failed", candidates: [], considered: 0, abstained: false, errorId };
    }

    // Step 2: re-queue live missing reports and fan out the bounded batch.
    const { rows } = await tx(async (client) => {
      // This is a separate postcommit transaction. It records outstanding work
      // before selecting the bounded batch; processed rows are stamped below.
      await client.query(QUEUE_LIVE_MISSING_SQL);
      return client.query(
        `SELECT id FROM cases WHERE kind = 'missing' AND anonymised_at IS NULL
           AND status IN ('open', 'matched_pending_review') ORDER BY id LIMIT $1`,
        [MAX_MISSING_CASES_PER_FOUND_REPORT + 1],
      );
    }, { pool: opts.pool } satisfies TxOptions);
    const hasMore = rows.length > MAX_MISSING_CASES_PER_FOUND_REPORT;
    const caseIds = rows.slice(0, MAX_MISSING_CASES_PER_FOUND_REPORT).map((r) => String((r as { id: string }).id));
    const results: MatcherRunResult[] = [];
    for (const id of caseIds) {
      results.push(await runMatcherForCase(id, { ...opts, api: "API-007" }));
    }
    const failed = results.find((result) => result.state === "failed");
    const state: MatchingState = failed ? "failed" : hasMore ? "queued" : "complete";
    const errorId = failed ? (failed.errorId === "E-018" ? "E-018" : "E-021") : undefined;
    await tx(async (client) => {
      const locked = await lockCases(client, [foundCaseId]);
      const found = locked.get(foundCaseId);
      if (!found || found.kind !== "found" || found.anonymised_at !== null) return;
      await client.query(
        `UPDATE cases SET matching_state = $2::matching_state_t,
           matched_at = CASE WHEN $2 = 'complete' THEN now() ELSE NULL END,
           match_error_id = $3
         WHERE id = $1 AND kind = 'found' AND anonymised_at IS NULL
           AND status IN ('open', 'matched_pending_review')`,
        [foundCaseId, state, errorId ?? null],
      );
    }, { pool: opts.pool } satisfies TxOptions);

    // Step 3: persist the found case's own same-kind duplicate flags. Run
    // only when the aggregate matcher state is `complete` (an in-flight
    // missing-fanout failure has already produced a safe `match_error_id`
    // on the found case row and the case service should retry on the
    // next trigger). The hook is awaited inline; a thrown error is
    // mapped to a safe matcher failure but the found row stays saved.
    if (state === "complete") {
      try {
        await persistDuplicateFlags(foundCaseId, {
          pool: opts.pool,
          requestId: opts.requestId ?? null,
        });
      } catch (hookErr) {
        const hookErrorId = safeFailureId(hookErr);
        await persistFailure(foundCaseId, hookErrorId, { ...opts, api: "API-007" }, "found");
        return { caseId: foundCaseId, state: "failed", candidates: [], considered: 0, abstained: false, errorId: hookErrorId };
      }
    }

    return {
      caseId: foundCaseId,
      state,
      candidates: [],
      considered: results.reduce((sum, result) => sum + result.considered, 0),
      abstained: results.every((result) => result.abstained),
      ...(errorId ? { errorId } : {}),
    };
  } catch (err) {
    const errorId = safeFailureId(err);
    await persistFailure(foundCaseId, errorId, { ...opts, api: "API-007" }, "found");
    return { caseId: foundCaseId, state: "failed", candidates: [], considered: 0, abstained: false, errorId };
  }
}

/**
 * The audit actor the route must pass to `reconcileQueueState` and any helper that
 * asks for an AuditActor. The matcher is a pipeline step: SYSTEM_ACTOR (matches
 * the existing case/README rule for the matcher and the edit-after hook).
 */
export const MATCHER_ACTOR = SYSTEM_ACTOR;

void SUPERSEDED_NOTE; // documentation reference; not exported
