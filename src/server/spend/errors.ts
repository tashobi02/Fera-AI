import { ApiError } from "@/app/api/_shared/envelope";
import type { Logger } from "@/app/api/_shared/log";
import { sqlstateOf } from "@/server/case/errors";

// IDs this module throws on purpose. Any other ApiError reaching here was mapped by
// the case-service helper (e.g. E-005 at the constraints/COMMIT stage) and has no
// manual_form fallback, so it becomes E-013 (BR-023).
const SPEND_IDS: readonly string[] = ["E-002", "E-003", "E-012", "E-013", "E-014", "E-023"];

export function mapSpendDbError(err: unknown, logger?: Logger): ApiError {
  if (err instanceof ApiError) {
    if (SPEND_IDS.includes(err.id)) return err;
    try { logger?.error({ event: "spend.error_remapped", error_id: "E-013", original_error_id: err.id }); } catch { /* best effort */ }
    return new ApiError("E-013");
  }
  const message = err instanceof Error ? err.message : "";
  const e = (err ?? {}) as { constraint?: unknown; routine?: unknown; where?: unknown };
  // db/schema_v2.sql:553/557: these RAISEs set 23514 without a named
  // constraint. Prefer function context; exact text is a compatibility fallback.
  const fromReserve = !e.constraint && [e.routine, e.where].some((value) =>
    typeof value === "string" && /\breserve_ai_call\b/.test(value));
  if (sqlstateOf(err) === "23514" && (
    fromReserve || message === "AI budget exhausted" || message === "draft expired or six-call limit reached"
  )) return new ApiError("E-023");
  // No dedicated settlement/replay IDs exist in the frozen contracts (OD-063-2).
  // E-013 keeps manual_form available without exposing pg messages or provider text.
  return new ApiError("E-013");
}
