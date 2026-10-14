// Case service (COMP-014, TASK-015). Server-only; consumers: route handlers and other
// src/server modules. Usage notes: src/server/case/README.md.
//
// Every command takes a server-derived Principal and enforces role, ownership and
// verification itself; it returns contract row types, DTOs or IDs. Errors are thrown as
// ApiError with contract IDs (E-001/003/004/005/006/017/018); anything unexpected is
// rethrown for the API layer to log and answer E-021.
export { createMissingCase, createFoundCase, editMissingCase, changedFields, draftColumns, newRefCode } from "./commands";
export type { CreateResult } from "./commands";
export { openCase, reconcileQueueState, assertTransition, applyStatus, applyStatusPath } from "./state";
export type { ServiceContext, StatusChange } from "./state";
export { decideCandidate } from "./decision";
export type { DecisionResult } from "./decision";
export { closeCase } from "./close";
export type { CloseResult } from "./close";
export { readCase, officerContext } from "./read";
export type { ReadResult } from "./read";
export { voidPendingCandidates } from "./candidates";
export { withTransaction, DEFAULT_TX_ATTEMPTS } from "./tx";
export type { Connectable, TxOptions } from "./tx";
export { lockCases, lockCandidates, lockNeighbourhood, sortedIds } from "./lock";
export type { Neighbourhood } from "./lock";
export { getCaseRow, mapCaseRow, pendingCandidatesFor, CASE_COLUMNS } from "./rows";
export type { PendingCandidate } from "./rows";
export { mapDbError, mapInsertError, sqlstateOf, isRetryable, LockSetChanged, SQLSTATE } from "./errors";
// Payload redaction (API-016) stays in src/server/admin/redact.ts (fera_redactor pool).
export { redactCases, RedactionForbiddenError, RedactionDbError } from "@/server/admin/redact";
