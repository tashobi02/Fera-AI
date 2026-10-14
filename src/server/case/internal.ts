// Case-service internals (TASK-015). NOT for route handlers.
//
// Who may import this:
//   - the matcher and rematch work (TASK-017/API-014, Masnun) for candidate inserts and
//     queue-state reconciliation;
//   - the case service's own modules and tests (tests/case, tests/db).
// Route handlers use the commands in src/server/case/index.ts only. Nothing here checks a
// Principal: callers bring an AuditActor (actorFor(principal) or SYSTEM_ACTOR) and must
// already have authorised the work.
//
// Lock protocol (lock.ts; BR-020, D2A §8):
//   1. Inside withTransaction, lock every case you will change with lockCases() — FOR
//      UPDATE, ascending UUID, one pass — before touching match_candidates. Never lock a
//      lower UUID later in the same transaction.
//   2. Insert or update a match_candidates row only while holding both endpoint locks.
//   3. Then call reconcileQueueState() on the endpoints in the same transaction.
//   An unlocked candidate insert takes KEY SHARE on both endpoints through its FKs and
//   can deadlock with a decision. Status steps into confirmed/referred/closed are refused
//   to any non-officer actor (StepAuthorityError).
export { reconcileQueueState, txOptions, StepAuthorityError, OFFICER_ONLY_TARGETS } from "./state";
export { voidPendingCandidates } from "./candidates";
export { lockCases, lockCandidates, lockNeighbourhood, sortedIds } from "./lock";
export type { Neighbourhood } from "./lock";
export { getCaseRow, mapCaseRow, mapPendingCandidate, pendingCandidatesFor, returnedId, CASE_COLUMNS } from "./rows";
export type { PendingCandidate } from "./rows";
export { officerContext } from "./read";
export { changedFields, draftColumns, newRefCode } from "./commands";
export { withTransaction, DEFAULT_TX_ATTEMPTS } from "./tx";
export type { Connectable, TxOptions } from "./tx";
export { mapDbError, mapInsertError, sqlstateOf, isRetryable, refusalFacts, isSevereRefusal, LockSetChanged, SQLSTATE } from "./errors";
export { auditRefusals, RefusalAuditError, REFUSAL_ERROR_IDS } from "./refused";
export { DecisionStateError } from "./decision";
export { RowShapeError } from "@/server/db/decode";
