// TASK-018 detect-and-persist service (COMP-013, FR-022/FR-023, BR-021). Owner: Masnun.
//
// Wraps `detectDuplicates` (the read-only detector) in one bounded transaction that
// writes any new duplicate_links for the submitted case and appends a paired
// `duplicate.flagged` audit row. The matcher orchestrator calls this AFTER a
// submitted case has been confirmed by an officer and the matching embedding has
// been stored, so the source case is non-redacted, active and carries a current
// embedding in a known space.
//
// Why this is a separate service (not an extension of detectDuplicates):
//   - The detector is pure and read-only by contract; nothing it returns may
//     affect a case row. The persister does the write half.
//   - The persister is allowed to take row locks (sorted UUID, BR-020) and to
//     audit-log; the detector is not. The detector only ever runs as a query
//     helper inside a transaction whose locks the persister has taken.
//
// One transaction (BR-020, D2A §8 Concurrency):
//   1. Read the source case (no lock) to learn its kind, version and embedding
//      space; a missing or non-current source returns an empty result rather
//      than an error. The detector also runs as a non-locking read so a model
//      call (none here) would never hold a lock during a model call.
//   2. Take the sorted-UUID lock for the source case alone. The persister only
//      locks an endpoint when it is about to insert a link that names it. A
//      lower-UUID lock is taken first; the higher-UUID counterpart is locked
//      afterwards, both inside `lockCases`. This avoids the deadlock pattern
//      forbidden in the spec ("don't prelock source then lowerUUID counterpart").
//   3. Re-read the source row under the lock and refuse on a stale version or
//      a different embedding space; the candidate pool was computed before the
//      lock and would otherwise produce a stale false flag.
//   4. For each profile flag, also lock the candidate row in the same ascending
//      pass; the duplicate_links CHECK requires case_a < case_b, so the sort
//      already matches the order the schema enforces.
//   5. INSERT INTO duplicate_links with ON CONFLICT (case_a, case_b) DO NOTHING
//      (idempotent: a rerun of the same flag does not double-write, and a
//      previously-resolved link is left untouched because we filter
//      `WHERE status = 'flagged'` in a guarded UPDATE path — here the conflict
//      clause simply skips the insert and the audit is only written when the
//      INSERT actually returned a row).
//   6. Append one `duplicate.flagged` audit row per inserted link, with the
//      lower endpoint as case_id, candidate_id null, and metadata-only
//      allowlisted details (ref_code, score, duplicate_rule, version).
//      No child payload, no phone, no raw text.
//
// Honest-conflict rule: a flag is only ever written for the profile rule. The
// detector does not produce the same_phone weak cue (BR-021; a shared phone
// alone never confirms the same child). Phone-only siblings stay unflagged.
//
// Safeguarding (round 2): the detector already refuses to flag pairs with a
// known sex mismatch or a known disjoint age range. The persister inherits
// that gate by trusting only the flags the detector returns; it never invents
// a flag of its own.
//
// Never hides, merges or closes a report (FR-022, BR-021). The persister does
// not UPDATE the case row in any path.
import { isUuid, type DuplicateRule } from "@/contracts";
import { CASE_AUDIT_ACTIONS, SYSTEM_ACTOR, appendAudit, type AuditDetails } from "@/server/audit";
import { lockCases, sortedIds, withTransaction } from "@/server/case/internal";
import type { Connectable } from "@/server/case/tx";
import { col, firstRow, asRow } from "@/server/db/decode";
import type { Queryable } from "@/server/db/queryable";
import { detectDuplicates, type DuplicateFlag } from "./detect";

const TABLE = "cases" as const;

export type PersistContext = {
  /** Server-generated request id; written on the audit rows. */
  requestId?: string | null;
  /** Test seam: a non-default pg pool or Connectable. */
  pool?: Connectable;
  /** Bounded transient-conflict retries; tests pass 1 to fail-fast. */
  attempts?: number;
};

/** The decision the orchestrator can branch on. */
export type PersistResult = {
  /** Number of NEW duplicate_links written in this call. */
  inserted: number;
  /** Total flags the detector returned for the source case. */
  detected: number;
  /** True when the source case had no current embedding (no-op). */
  skipped: boolean;
  /** Audit ids of the freshly-written duplicate.flagged rows, ascending. */
  auditIds: number[];
};

type SourceCase = {
  id: string;
  kind: "missing" | "found";
  ref_code: string;
  version: number;
  embedding_model: string | null;
  embedding_revision: string | null;
  embedding_space: string | null;
  status: string;
  anonymised_at: Date | null;
};

const sourceColumns = [
  "id", "kind", "ref_code", "version",
  "embedding_model", "embedding_revision", "embedding_space",
  "status", "anonymised_at",
] as const;

function mapSource(value: unknown): SourceCase {
  const r = asRow(TABLE, value);
  return {
    id: col.uuid(TABLE, r, "id"),
    kind: col.oneOf(TABLE, r, "kind", ["missing", "found"] as const),
    ref_code: col.text(TABLE, r, "ref_code"),
    version: col.int(TABLE, r, "version"),
    embedding_model: col.textOrNull(TABLE, r, "embedding_model"),
    embedding_revision: col.textOrNull(TABLE, r, "embedding_revision"),
    embedding_space: col.textOrNull(TABLE, r, "embedding_space"),
    status: col.text(TABLE, r, "status"),
    anonymised_at: col.dateOrNull(TABLE, r, "anonymised_at"),
  };
}

async function readSource(db: Queryable, id: string): Promise<SourceCase | null> {
  const { rows } = await db.query(
    `SELECT ${sourceColumns.join(", ")} FROM cases WHERE id = $1`,
    [id],
  );
  const row = firstRow(TABLE, rows);
  if (!row) return null;
  return mapSource(row);
}

/**
 * Detect and persist possible duplicates for `caseId`. Returns the count of
 * freshly-written duplicate_links (idempotent on rerun; resolved links are
 * preserved).
 *
 * Caller contract:
 *   - The case must exist and have a non-redacted, current embedding in a known
 *     model/revision/space. A case without an embedding is a no-op (`skipped: true`).
 *   - The case must not be anonymised (a redacted row is removed from the
 *     duplicate pool; this mirrors the detector).
 *   - This service does NOT alter any case row. The matcher orchestrator is
 *     responsible for status changes before and after the call.
 */
export async function persistDuplicateFlags(
  caseId: string,
  ctx: PersistContext = {},
): Promise<PersistResult> {
  if (!isUuid(caseId)) throw new Error("invalid case id");
  // Canonical lowercase form: matches sortedIds() / lockCases() map keys, and
  // matches the contracts' UUID normalisation. Required so `locked.get(caseId)`
  // below returns the row the persister just acquired.
  const sourceId = caseId.toLowerCase();
  const requestId = ctx.requestId ?? null;
  return withTransaction(async (client) => {
    // Step 1: unlocked read of the source to learn kind/version/space.
    const source = await readSource(client, sourceId);
    if (!source) return { inserted: 0, detected: 0, skipped: true, auditIds: [] };
    if (source.anonymised_at !== null) {
      // Redacted rows are not eligible. The detector would also skip them via
      // its embedding IS NULL guard, but refusing here keeps the audit clean.
      return { inserted: 0, detected: 0, skipped: true, auditIds: [] };
    }
    if (!source.embedding_model || !source.embedding_revision || !source.embedding_space) {
      return { inserted: 0, detected: 0, skipped: true, auditIds: [] };
    }

    // Step 2: detector runs on the same client, still no locks taken by us. The
    // detector's candidate pool is a snapshot; we re-check endpoints using
    // the FOR-UPDATE-locked rows from lockCases() before inserting.
    const { flags, skipped } = await detectDuplicates(client, sourceId);
    if (skipped) return { inserted: 0, detected: 0, skipped: true, auditIds: [] };

    // Step 3: lock every endpoint we will write about in one ascending UUID
    // pass. This avoids prelocking the source and later acquiring a lower UUID.
    // The detector includes both endpoint versions and embedding-space identity
    // from its SELECT snapshots; the locked rows below must still match them.
    const allIds = sortedIds([sourceId, ...flags.map((f) => f.candidate_id)]);
    const locked = await lockCases(client, allIds);
    const lockedSource = locked.get(sourceId);
    if (!lockedSource) {
      // The source was deleted between the unlocked read and the lock; nothing
      // to do. This is a rare race (no DELETE on cases from the app role,
      // but a future migration could expose one) and we skip rather than
      // throw, so a stale flag does not abort the caller's transaction.
      return { inserted: 0, detected: flags.length, skipped: true, auditIds: [] };
    }
    if (lockedSource.anonymised_at !== null) {
      return { inserted: 0, detected: flags.length, skipped: true, auditIds: [] };
    }
    if (
      lockedSource.version !== source.version ||
      lockedSource.embedding_model !== source.embedding_model ||
      lockedSource.embedding_revision !== source.embedding_revision ||
      lockedSource.embedding_space !== source.embedding_space
    ) {
      // Stale: the source moved between the unlocked read and the lock. The
      // detector's pool was computed against the previous version/space; the
      // flags it returned are not safe to persist. Skip this round; a future
      // confirm will rerun the detector.
      return { inserted: 0, detected: flags.length, skipped: true, auditIds: [] };
    }
    const sourceSnapshot = flags[0]?.source_snapshot;
    if (sourceSnapshot && flags.some((flag) =>
      flag.source_snapshot.version !== sourceSnapshot.version ||
      flag.source_snapshot.embedding_model !== sourceSnapshot.embedding_model ||
      flag.source_snapshot.embedding_revision !== sourceSnapshot.embedding_revision ||
      flag.source_snapshot.embedding_space !== sourceSnapshot.embedding_space
    )) {
      return { inserted: 0, detected: flags.length, skipped: true, auditIds: [] };
    }
    if (sourceSnapshot && (
      lockedSource.version !== sourceSnapshot.version ||
      lockedSource.embedding_model !== sourceSnapshot.embedding_model ||
      lockedSource.embedding_revision !== sourceSnapshot.embedding_revision ||
      lockedSource.embedding_space !== sourceSnapshot.embedding_space
    )) {
      return { inserted: 0, detected: flags.length, skipped: true, auditIds: [] };
    }
    // Same-kind check (the schema's check_duplicate_integrity trigger enforces
    // this, but checking in app is friendlier and avoids an opaque
    // check_violation if a future path ever loosens the trigger).
    if (lockedSource.kind !== source.kind) {
      return { inserted: 0, detected: flags.length, skipped: true, auditIds: [] };
    }
    if (lockedSource.status === "closed" || lockedSource.status === "referred") {
      // A terminal source row never participates in new flagging: its lifecycle
      // is closed and a new link would invite review on a case the case
      // service no longer mutates. The detector would still surface a flag
      // here because the case row is still present, so the explicit guard
      // matters.
      return { inserted: 0, detected: flags.length, skipped: true, auditIds: [] };
    }

    // Step 4: insert each flag, sorted-pair, idempotent. Audit only when the
    // INSERT actually returned a row.
    const sortedSourceId = lockedSource.id;
    const insertedAuditIds: number[] = [];
    let inserted = 0;
    let detected = 0;
    for (const flag of flags) {
      // Only the documented profile rule is persisted. The detector does not
      // return same_phone; this guard is defensive.
      if (flag.rule !== ("profile" as DuplicateRule)) continue;
      detected += 1;
      // Use the locked-map snapshot (already FOR UPDATE in lockCases) so we
      // read each candidate under the same lock the source holds. The
      // candidate's version and embedding space are the recheck against a
      // potentially stale flag. Lowercase the key to match lockCases()'s
      // canonical form.
      const candidate = locked.get(flag.candidate_id.toLowerCase());
      if (!candidate) {
        // The candidate row was deleted between the unlocked detector read
        // and the lock; nothing to insert. Skip silently.
        continue;
      }
      if (candidate.anonymised_at !== null) continue;
      if (candidate.kind !== lockedSource.kind) continue;
      if (
        candidate.version !== flag.candidate_snapshot.version ||
        candidate.embedding_model !== flag.candidate_snapshot.embedding_model ||
        candidate.embedding_revision !== flag.candidate_snapshot.embedding_revision ||
        candidate.embedding_space !== flag.candidate_snapshot.embedding_space ||
        candidate.embedding_model !== source.embedding_model ||
        candidate.embedding_revision !== source.embedding_revision ||
        candidate.embedding_space !== source.embedding_space
      ) continue;
      if (candidate.embedding_model === null || candidate.embedding_revision === null || candidate.embedding_space === null) continue;

      // Sorted pair: case_a < case_b is the schema CHECK.
      const sorted = sortedIds([sortedSourceId, candidate.id]);
      const caseA = sorted[0]!;
      const caseB = sorted[1]!;

      // Idempotent insert. ON CONFLICT (case_a, case_b) DO NOTHING: a rerun of
      // the same source+candidate pair is a no-op. A previously-resolved link
      // is preserved (the conflict is on the pair, not the status, so the
      // resolved status stays put).
      const ins = await client.query(
        `INSERT INTO duplicate_links (case_a, case_b, score, rule)
         VALUES ($1, $2, $3::numeric, $4)
         ON CONFLICT (case_a, case_b) DO NOTHING
         RETURNING id, case_a, case_b, status`,
        [caseA, caseB, flag.score, flag.rule],
      );
      if (ins.rows.length === 0) continue;
      inserted += 1;
      const insertedRow = ins.rows[0] as Record<string, unknown>;
      const linkCaseA = String(insertedRow.case_a);
      const linkStatus = String(insertedRow.status);
      // The schema default is 'flagged' on a fresh row. Anything else would be
      // a trigger error we already rolled back for; refuse the transaction
      // rather than leave an inserted link without its corresponding audit.
      if (linkStatus !== "flagged") throw new Error("duplicate link was not inserted in flagged state");

      // Audit row. The lower endpoint (case_a) is the audited case; the
      // details carry the lower endpoint's ref_code (the audited case's own
      // reference, per the audit details contract) and version, so an audit
      // reader can rejoin the link to the case. The officer-scoped
      // `missing_ref` / `found_ref` keys are written with the lower endpoint's
      // reference so the detail view (which renders only those) is complete.
      // No raw child payload, no phone; the `api` key is omitted because this
      // is a system-actor write, not an API endpoint call.
      const lowerIsSource = linkCaseA === lockedSource.id;
      const lowerRef = lowerIsSource ? lockedSource.ref_code : candidate.ref_code;
      const lowerKind = lowerIsSource ? lockedSource.kind : candidate.kind;
      const lowerVersion = lowerIsSource ? lockedSource.version : candidate.version;
      const details: AuditDetails = {
        duplicate_status: "flagged",
        duplicate_rule: flag.rule,
        score: flag.score,
        version: lowerVersion,
        ref_code: lowerRef,
        ...(lowerKind === "missing"
          ? { missing_ref: lowerRef }
          : { found_ref: lowerRef }),
      };
      const auditId = await appendAudit(client, SYSTEM_ACTOR, {
        action: CASE_AUDIT_ACTIONS.duplicateFlagged,
        caseId: linkCaseA,
        requestId,
        details,
      });
      insertedAuditIds.push(auditId);
    }
    return { inserted, detected, skipped: false, auditIds: insertedAuditIds.sort((a, b) => a - b) };
  }, { pool: ctx.pool, attempts: ctx.attempts });
}

// Public type guard for tests and the orchestrator: was a flag inserted? Used
// to drive orchestrator branching after the matcher lane merges.
export function wasInserted(result: PersistResult): boolean {
  return result.inserted > 0;
}

// Hook signature for the matcher orchestrator. Documented here so the wiring
// stays explicit. The orchestrator calls this AFTER it has confirmed a
// submitted case and stored the matching embedding (so the source is a valid
// active non-redacted case with a current embedding).
//
//   await persistDuplicateFlags(caseId, {
//     requestId: ctx.requestId,
//     pool: ctx.pool,        // test seam; default = the fera_app pool
//     attempts: 3,           // default = withTransaction's transient-conflict retry
//   });
//
// Returns the number of newly-inserted duplicate_links. A case without an
// embedding, a redacted case, a terminal case or a case whose version moved
// between the unlocked read and the lock returns `skipped: true` and writes
// nothing. The orchestrator may safely re-call this service: it is idempotent.
export const PERSIST_HOOK = "persistDuplicateFlags" as const;
export type PersistHook = typeof persistDuplicateFlags;
export type { DuplicateFlag };
