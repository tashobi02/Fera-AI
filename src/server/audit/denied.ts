// access.denied audit hooks (TASK-015; BR-010, D2B E-004, TC-052). Installed as the
// API layer's `auditDenied` (src/app/api/_shared/index.ts) and the page guard's default
// hook (src/server/auth/require-role.ts).
//
// - A denial is recorded on its own, after the denied action rolled back (BR-010
//   "denials after rollback are logged separately"): one INSERT on the pool.
// - The case FK is kept only when that case exists, so a probe for an unknown ID is
//   recorded with a null FK and never fails on the foreign key (TC-052).
// - Details are the error ID and the API ID only: no path, query, body, reason text,
//   network address or record payload.
// - A failure throws. The API layer then answers E-021 and the page guard throws to
//   the error page (fail closed).
import { isUuid } from "@/contracts";
import type { AuditDenied } from "@/app/api/_shared/compose";
import type { PageAuditDenied } from "@/server/auth/require-role";
import { getPool } from "@/server/db/pool";
import { CASE_AUDIT_ACTIONS } from "./actions";
import { actorFor, appendAudit } from "./write";

type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }> };

async function existingCaseId(db: Queryable, caseId: string | null): Promise<string | null> {
  if (caseId === null || !isUuid(caseId)) return null;
  const { rows } = await db.query("SELECT id FROM cases WHERE id = $1", [caseId]);
  return rows.length === 1 ? caseId.toLowerCase() : null;
}

export function createDeniedAuditHooks(db: () => Queryable = () => getPool()) {
  const api: AuditDenied = async (input) => {
    const pool = db();
    await appendAudit(pool, actorFor(input.principal), {
      action: CASE_AUDIT_ACTIONS.accessDenied,
      caseId: await existingCaseId(pool, input.caseId),
      details: { error_id: input.errorId, api: input.api },
      requestId: input.requestId,
    });
  };
  // Page denials happen before any record is loaded (caseId is always null).
  const page: PageAuditDenied = async (input) => {
    await appendAudit(db(), actorFor(input.principal), {
      action: CASE_AUDIT_ACTIONS.accessDenied,
      caseId: null,
      details: { error_id: input.errorId },
    });
  };
  return { api, page };
}

const defaults = createDeniedAuditHooks();
export const auditAccessDenied: AuditDenied = defaults.api;
export const auditPageDenied: PageAuditDenied = defaults.page;
