// API-016 payload redaction service (TASK-062 / T007; BR-009/010/025).
// Calls the schema's redact_case() once per eligible case, each in its own transaction.
// redact_case() clears the direct and related identifying payload and writes the safe
// `case.payload_redacted` audit event; this module writes nothing else. Retained IDs,
// date, district, status and coarse age are pseudonymous, not anonymous.
//
// The pool must connect as the restricted `fera_redactor` role (db/roles.sql), which can
// execute redact_case() (SECURITY DEFINER in the operator layer, OD-062-2) and read the
// eligibility columns only. The route owns the error envelope and the access.denied
// audit event for RedactionForbiddenError.
import type { Pool, PoolClient } from "pg";
import {
  anonymiseRequestSchema, anonymiseResponseSchema, type AnonymiseRequestInput, type AnonymiseResponse,
} from "@/contracts";
import { canCall, type Principal } from "@/contracts/server";

export const REDACTION_DB_ROLE = "fera_redactor";

export class RedactionForbiddenError extends Error {
  readonly errorId = "E-003" as const;
  constructor() {
    super("payload redaction requires an active admin");
  }
}

// Carries only the SQLSTATE: no message, detail, hint or where text from the database
// (they can quote row values). `redacted` counts the cases committed before the failure.
export class RedactionDbError extends Error {
  constructor(readonly sqlstate: string | null, readonly redacted: number) {
    super(`payload redaction failed${sqlstate ? ` (SQLSTATE ${sqlstate})` : ""}`);
  }
}

// Must stay equal to redact_case()'s own refusal checks in db/schema_v2.sql
// (status IN ('closed','referred'); a found report with a confirmed candidate whose
// missing report is not closed is retained). tests/db/redaction.test.ts exercises each
// branch against redact_case() directly. Already-redacted rows count as skipped.
const ELIGIBLE_WHERE = `
  c.anonymised_at IS NULL AND c.status IN ('closed', 'referred')
    AND NOT (c.kind = 'found' AND EXISTS (
      SELECT 1 FROM match_candidates mc JOIN cases m ON m.id = mc.missing_case_id
      WHERE mc.found_case_id = c.id AND mc.status = 'confirmed' AND m.status <> 'closed'))`;

const ELIGIBLE = `SELECT 1 FROM cases c WHERE c.id = $1 AND ${ELIGIBLE_WHERE}`;

// SCREEN-013 eligible summary (TASK-032): a count only, no IDs or payload.
const ELIGIBLE_COUNT = `SELECT count(*)::int AS n FROM cases c WHERE ${ELIGIBLE_WHERE}`;

const ALL_CANDIDATES = `
  SELECT id FROM cases WHERE anonymised_at IS NULL AND status IN ('closed', 'referred') ORDER BY id`;

type Queryable = Pick<Pool, "connect" | "query">;

export async function redactCases(
  pool: Queryable,
  principal: Principal | null,
  input: AnonymiseRequestInput,
): Promise<AnonymiseResponse> {
  const request = anonymiseRequestSchema.parse(input);
  if (!principal || principal.kind !== "user" || !canCall("API-016", principal)) throw new RedactionForbiddenError();

  let redacted = 0;
  let skipped = 0;
  try {
    const who = await pool.query<{ role: string }>("SELECT current_user AS role");
    if (who.rows[0]?.role !== REDACTION_DB_ROLE) throw new RedactionDbError(null, 0);

    const ids = request.all_eligible
      ? (await pool.query<{ id: string }>(ALL_CANDIDATES)).rows.map((r) => r.id)
      : [...new Set((request.case_ids ?? []).map((id) => id.toLowerCase()))];

    // Owner decision pending (OD-062-4): the first failure aborts the batch; cases
    // already committed stay redacted and are reported on the error.
    for (const id of ids) {
      if (await redactOne(pool, id, principal.userId)) redacted++;
      else skipped++;
    }
  } catch (err) {
    throw new RedactionDbError(err instanceof RedactionDbError ? err.sqlstate : sqlstateOf(err), redacted);
  }
  return anonymiseResponseSchema.parse({
    redacted,
    skipped_not_eligible: skipped,
    mode: "pseudonymisation",
    external_copies_removed: false,
  });
}

async function redactOne(pool: Pick<Pool, "connect">, caseId: string, adminId: string): Promise<boolean> {
  const client: PoolClient = await pool.connect();
  let broken = false;
  try {
    await client.query("BEGIN");
    // Serialises concurrent redactions of one case; redact_case() takes the row lock.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [caseId]);
    // Deferred pair checks then fire inside redact_case(), as its owner (db/roles.sql).
    await client.query("SET CONSTRAINTS ALL IMMEDIATE");
    const eligible = await client.query(ELIGIBLE, [caseId]);
    if (eligible.rowCount !== 1) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query("SELECT redact_case($1, $2)", [caseId, adminId]);
    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {
      broken = true;
    });
    throw err;
  } finally {
    client.release(broken);
  }
}

function sqlstateOf(err: unknown): string | null {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code : null;
}

// Number of reports an all_eligible run would redact right now (SCREEN-013 summary and
// empty state). Same eligibility as redact_case(); admin only, on the redactor pool.
export async function countEligibleCases(pool: Pick<Pool, "query">, principal: Principal | null): Promise<number> {
  if (!principal || principal.kind !== "user" || !canCall("API-016", principal)) throw new RedactionForbiddenError();
  try {
    const who = await pool.query<{ role: string }>("SELECT current_user AS role");
    if (who.rows[0]?.role !== REDACTION_DB_ROLE) throw new RedactionDbError(null, 0);
    const { rows } = await pool.query<{ n: unknown }>(ELIGIBLE_COUNT);
    const n = rows[0]?.n;
    if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0) throw new RedactionDbError(null, 0);
    return n;
  } catch (err) {
    throw err instanceof RedactionDbError ? err : new RedactionDbError(sqlstateOf(err), 0);
  }
}
