// Audit logger (COMP-015, TASK-015). See write.ts for the rules and denied.ts for the
// access.denied hooks the API layer and page guards use.
export { CASE_AUDIT_ACTIONS, WRITABLE_AUDIT_ACTIONS, isWritableAuditAction } from "./actions";
export type { CaseAuditAction } from "./actions";
export { SYSTEM_ACTOR, AuditWriteError, actorFor, appendAudit, auditDetailsSchema, checkAuditEntry } from "./write";
export type { AuditActor, AuditDetails, AuditEntry } from "./write";
export { auditAccessDenied, auditPageDenied, createDeniedAuditHooks } from "./denied";
