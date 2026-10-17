// Case service (COMP-014, TASK-015): the commands route handlers call. Server-only.
// Usage notes: src/server/case/README.md.
//
// Every command here takes a server-derived Principal and enforces role, ownership and
// verification itself; it returns contract row types, DTOs or IDs. Errors are thrown as
// ApiError with contract IDs (E-001/003/004/005/006/017/018); anything unexpected is
// rethrown for the API layer to log and answer E-021.
//
// Low-level steps (status changes, locks, row mapping, queue reconciliation) are not
// exported here; the matcher and tests use src/server/case/internal.ts under its rules.
// Payload redaction (API-016) is src/server/admin/redact.ts, imported directly.
export { createMissingCase, createFoundCase, editMissingCase } from "./commands";
export type { CreateResult } from "./commands";
export { openCase, assertTransition } from "./state";
export type { ServiceContext } from "./state";
export { decideCandidate } from "./decision";
export type { DecisionResult } from "./decision";
export { closeCase } from "./close";
export type { CloseResult } from "./close";
export { readCase } from "./read";
export type { ReadResult } from "./read";
export { listOfficerCases } from "./list";
export type { OfficerCaseListInput, OfficerCaseListResult, ListCasesServiceContext } from "./list";
