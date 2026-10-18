// Admin tools (COMP-019/COMP-043, TASK-032): SCREEN-013 and API-016/017/021. Server-only.
// Route handlers and the admin page import from here.
//   - redactCases / countEligibleCases: API-016 on the fera_redactor pool (redact.ts).
//   - setOfficerVerified: API-017 [MOCK] on the fera_app pool, audited (verify.ts).
//   - listAdminUsers: API-021 through the contract AdminUserView (users.ts).
export {
  REDACTION_DB_ROLE, RedactionDbError, RedactionForbiddenError, countEligibleCases, redactCases,
} from "./redact";
export { getRedactorPool, setRedactorPoolForTests, closeRedactorPool, RedactorConfigError } from "./pool";
export { setOfficerVerified } from "./verify";
export type { AdminWriteContext } from "./verify";
export { listAdminUsers, encodeUsersCursor, decodeUsersCursor } from "./users";
export type { AdminReadContext } from "./users";
