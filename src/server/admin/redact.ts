// API-016 payload redaction service (TASK-062 / T007; BR-009/010/025).
// Calls the schema's redact_case() once per eligible case, each in its own transaction.
// redact_case() clears the direct and related identifying payload and writes the safe
// `case.payload_redacted` audit event; this module writes nothing else. Retained IDs,
// date, district, status and coarse age are pseudonymous, not anonymous.
//
// The pool must connect as the restricted `fera_redactor` role (db/roles.sql); the
// general runtime role cannot execute redact_case(). The route owns Zod parsing, the
// typed confirmation and the error envelope.
import type { Pool } from "pg";
import { anonymiseResponseSchema, type AnonymiseRequest, type AnonymiseResponse } from "@/contracts";
import { canCall, type Principal } from "@/contracts/server";

export class RedactionForbiddenError extends Error {
  readonly errorId = "E-003" as const;
  constructor() {
    super("payload redaction requires an active admin");
  }
}

// Mirrors redact_case(): closed/referred only, and a referred found report stays while
// its confirmed missing report is unclosed. Already-redacted rows count as skipped.
const LOCK_IF_ELIGIBLE = `
  SELECT c.id FROM cases c
  WHERE c.id = $1 AND c.anonymised_at IS NULL AND c.status IN ('closed', 'referred')
    AND NOT (c.kind = 'found' AND EXISTS (
      SELECT 1 FROM match_candidates mc JOIN cases m ON m.id = mc.missing_case_id
      WHERE mc.found_case_id = c.id AND mc.status = 'confirmed' AND m.status <> 'closed'))
  FOR UPDATE OF c`;

const ALL_CANDIDATES = `
  SELECT id FROM cases WHERE anonymised_at IS NULL AND status IN ('closed', 'referred') ORDER BY id`;

export async function redactCases(
  pool: Pick<Pool, "connect" | "query">,
  principal: Principal | null,
  request: AnonymiseRequest,
): Promise<AnonymiseResponse> {
  if (!principal || principal.kind !== "user" || !canCall("API-016", principal)) throw new RedactionForbiddenError();

  const ids = request.all_eligible
    ? (await pool.query<{ id: string }>(ALL_CANDIDATES)).rows.map((r) => r.id)
    : [...new Set((request.case_ids ?? []).map((id) => id.toLowerCase()))];

  let redacted = 0;
  let skipped = 0;
  for (const id of ids) {
    if (await redactOne(pool, id, principal.userId)) redacted++;
    else skipped++;
  }
  return anonymiseResponseSchema.parse({
    redacted,
    skipped_not_eligible: skipped,
    mode: "pseudonymisation",
    external_copies_removed: false,
  });
}

// Any database error (inactive admin, a trigger refusing the write) rolls back that case
// and propagates: a failed redaction is never reported as skipped.
async function redactOne(pool: Pick<Pool, "connect">, caseId: string, adminId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const eligible = await client.query(LOCK_IF_ELIGIBLE, [caseId]);
    if (eligible.rowCount !== 1) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query("SELECT redact_case($1, $2)", [caseId, adminId]);
    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
