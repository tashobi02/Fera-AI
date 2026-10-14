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
  lockNotAvailable: "55P03",
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

// Transient conflicts that a fresh attempt can resolve. A lock timeout (fera_app
// lock_timeout = 5 s) is retried once only: a second 5 s wait is the limit.
export function isRetryable(err: unknown, attempt = 1): boolean {
  if (err instanceof LockSetChanged) return true;
  const code = sqlstateOf(err);
  if (code === SQLSTATE.lockNotAvailable) return attempt === 1;
  return code === SQLSTATE.serializationFailure || code === SQLSTATE.deadlockDetected;
}

// Identifier-only facts of a pg error for the allowlist logger: constraint, table and
// routine names. The message, detail, hint and where text (which can quote row values)
// are never returned.
const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const ident = (v: unknown) => (typeof v === "string" && IDENT.test(v) ? v : undefined);
export function refusalFacts(err: unknown): { constraint?: string; table?: string; routine?: string } {
  const e = (err ?? {}) as { constraint?: unknown; table?: unknown; routine?: unknown };
  return { constraint: ident(e.constraint), table: ident(e.table), routine: ident(e.routine) };
}

// Refusals from the pair-integrity and append-only triggers indicate an app bug or
// tampering, not a user race: they are logged at error level. Only the trigger
// function's name is matched in pg's `where` context; the text is never logged.
const SEVERE_ROUTINES = /\b(check_pair_integrity|audit_log_append_only|verify_decision_author|lock_decision_history|protect_confirmed_candidate|lock_referral_history)\(/;
export function isSevereRefusal(err: unknown): boolean {
  const where = (err as { where?: unknown } | null)?.where;
  return typeof where === "string" && SEVERE_ROUTINES.test(where);
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
