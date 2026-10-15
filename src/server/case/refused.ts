// Refused-transaction audit (D2B §10.1 "rejected transaction audit is written after
// rollback"; BR-010; OD-015-7). When an officer decision, a closure or an owner edit is
// refused with E-005, E-017 or E-018, its transaction has already rolled back; one
// `*.refused` row is then written on its own, in the denied.ts pattern:
//
// - details are `{ error_id, api }` only (no versions, reasons, notes or payload);
// - the case / candidate FKs are kept only when those rows exist;
// - if that write fails, the request fails closed: RefusalAuditError → E-021 at the
//   API layer, and the original refusal is not returned.
//
// E-004 needs no row here: the API layer already writes access.denied for it.
import { ApiError } from "@/app/api/_shared/envelope";
import { createLogger, describeError, type Logger } from "@/app/api/_shared/log";
import { isUuid } from "@/contracts";
import type { ApiId, Principal } from "@/contracts/server";
import { actorFor, appendAudit, type CaseAuditAction } from "@/server/audit";
import type { Queryable } from "@/server/db/queryable";
import type { ServiceContext } from "./state";
import { withTransaction } from "./tx";

export const REFUSAL_ERROR_IDS = ["E-005", "E-017", "E-018"] as const;
type RefusalId = (typeof REFUSAL_ERROR_IDS)[number];

let logger: Logger | undefined;

export class RefusalAuditError extends Error {
  constructor() {
    super("refused-transaction audit unavailable");
    this.name = "RefusalAuditError";
  }
}

export type RefusalTarget = {
  action: CaseAuditAction;
  api: ApiId;
  caseId?: string | null;
  candidateId?: string | null;
};

const isRefusal = (err: unknown): err is ApiError & { id: RefusalId } =>
  err instanceof ApiError && (REFUSAL_ERROR_IDS as readonly string[]).includes(err.id);

async function existing(db: Queryable, table: "cases" | "match_candidates", id: string | null | undefined): Promise<string | null> {
  if (!id || !isUuid(id)) return null;
  const { rows } = await db.query(`SELECT id FROM ${table} WHERE id = $1`, [id]);
  return rows.length === 1 ? id.toLowerCase() : null;
}

// Runs `work`; a refusal is audited after its rollback and then rethrown unchanged.
export async function auditRefusals<T>(
  principal: Principal,
  ctx: ServiceContext,
  target: RefusalTarget,
  work: () => Promise<T>,
): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if (!isRefusal(err)) throw err;
    try {
      await withTransaction(async (client) => {
        await appendAudit(client, actorFor(principal), {
          action: target.action,
          caseId: await existing(client, "cases", target.caseId),
          candidateId: await existing(client, "match_candidates", target.candidateId),
          requestId: ctx.requestId,
          details: { error_id: err.id, api: target.api },
        });
      }, { pool: ctx.pool, attempts: 2 });
    } catch (auditErr) {
      // tx.ts logs database failures; this also covers AuditWriteError (no SQLSTATE).
      (logger ??= createLogger()).error({ event: "audit.unavailable", ...describeError(auditErr) });
      throw new RefusalAuditError();
    }
    throw err;
  }
}
