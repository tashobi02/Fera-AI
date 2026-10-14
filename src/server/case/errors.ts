// Database error mapping for the case service (TASK-015; D2A COMP-014 "illegal
// transition → E-005; transaction rollback"). The database is the final authority:
// whatever the app-level guard misses, its triggers and CHECKs refuse, and the refusal
// becomes a contract error ID here. Only SQLSTATEs are inspected for the mapping; the
// one message test below distinguishes a known trigger text and is never logged.
import { ApiError } from "@/app/api/_shared/envelope";

export const SQLSTATE = {
  checkViolation: "23514",
  uniqueViolation: "23505",
  insufficientPrivilege: "42501",
  serializationFailure: "40001",
  deadlockDetected: "40P01",
} as const;

export function sqlstateOf(err: unknown): string | null {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code : null;
}

// Internal retry signal: the set of rows to lock grew between the unlocked read and the
// locked re-read (lock.ts). The transaction is rolled back and run again.
export class LockSetChanged extends Error {
  constructor() {
    super("lock set changed; retry");
    this.name = "LockSetChanged";
  }
}

// Transient conflicts that a fresh attempt can resolve.
export function isRetryable(err: unknown): boolean {
  if (err instanceof LockSetChanged) return true;
  const code = sqlstateOf(err);
  return code === SQLSTATE.serializationFailure || code === SQLSTATE.deadlockDetected;
}

// From enforce_case_transition(): the app and DB clocks disagree about the interval start.
const FUTURE_INTERVAL = /event interval starts in future/;

// - ApiError passes through unchanged.
// - check_violation (trigger or CHECK) on a state-changing statement → E-005, except the
//   future-interval trigger → E-001 naming event.at_lower (contract-notes route obligation).
// - unique_violation (a second confirmed pair per endpoint, a second decision for one
//   candidate) → E-005: the state changed under the caller.
// - A LockSetChanged that survived every retry → E-005 (reload and try again).
// - Anything else is returned as is, so the API layer logs its SQLSTATE and answers E-021.
export function mapDbError(err: unknown): unknown {
  if (err instanceof ApiError) return err;
  if (err instanceof LockSetChanged) return new ApiError("E-005");
  const code = sqlstateOf(err);
  if (code === SQLSTATE.checkViolation) {
    const message = err instanceof Error ? err.message : "";
    return FUTURE_INTERVAL.test(message) ? new ApiError("E-001", { fields: ["event.at_lower"] }) : new ApiError("E-005");
  }
  if (code === SQLSTATE.uniqueViolation) return new ApiError("E-005");
  return err;
}

// Inserting a new report: a CHECK failure is invalid input (the contract and SQL should
// agree, so this is defence in depth), not an illegal transition.
export function mapInsertError(err: unknown): unknown {
  if (err instanceof ApiError) return err;
  if (sqlstateOf(err) === SQLSTATE.checkViolation) {
    const message = err instanceof Error ? err.message : "";
    return FUTURE_INTERVAL.test(message) ? new ApiError("E-001", { fields: ["event.at_lower"] }) : new ApiError("E-001");
  }
  return err;
}
