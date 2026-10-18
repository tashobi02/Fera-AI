// API-023 + SCREEN-014 duplicate read (TASK-051; FR-023; SCREEN-014). Owner: Masnun.
//
// Verified active officer opens a flagged duplicate link to compare the two same-kind
// reports side by side. Like API-004 / API-009, this is a read-through-projections
// path: the officer sees the safe OfficerCaseRow DTOs for both endpoints (masked
// phone, the documented allowlist) and the link's own similarity + rule. A raw row
// is never returned; the officer row schema is the strict allowlist.
//
// - Anything but an active verified officer, or a malformed/absent link, is the
//   same E-004 response (BR-010, TC-052). The page guard or API layer writes the
//   access.denied row.
// - The two endpoints must be of the same kind (the schema's check_duplicate_integrity
//   trigger enforces this on insert; a drift between flagging and viewing would
//   only happen if the case row were updated in an unsupported way).
// - When the link's rule is 'same_phone' (TC-038, BR-021), the form cannot confirm
//   same child: that is enforced by the schema CHECK and by the service. The page
//   uses this field to disable the "Same child" button for phone-only links.
// - "Allow honest conflicts after changed/redacted/terminal endpoints" (TASK-051
//   spec): a link with one redacted (anonymised_at != null) or terminal
//   (closed/referred) endpoint is still reviewable. The page receives the live
//   statuses and versions so the reviewer sees the truth; a missing endpoint is
//   the only E-004 path.
//
// A safe role-scoped DTO is what leaves this module (no raw rows). The page
// receives OfficerDuplicateView with OfficerCaseRow pairs and a typed LinkInfo;
// anything else is denied.
import { isUuid, officerCaseRowSchema, type DuplicateRule, type DuplicateStatus, type OfficerCaseRow } from "@/contracts";
import { effectiveRole, projectCaseFor, type Principal } from "@/contracts/server";
import { getCaseRow, officerContext, withTransaction } from "@/server/case/internal";
import type { Connectable } from "@/server/case/tx";
import { asRow, col, firstRow } from "@/server/db/decode";

export type DuplicateReadResult =
  | { kind: "ok"; view: OfficerDuplicateView }
  | { kind: "hidden"; caseId: string | null };

export type OfficerDuplicateView = {
  link: LinkInfo;
  cases: { a: OfficerCaseRow; b: OfficerCaseRow };
};

export type LinkInfo = {
  id: string;
  status: DuplicateStatus;
  rule: DuplicateRule;
  score: number;
};

type LinkRow = {
  id: string;
  case_a: string;
  case_b: string;
  status: DuplicateStatus;
  rule: DuplicateRule;
  score: number;
};

const TABLE = "duplicate_links";
function mapLink(value: unknown): LinkRow {
  const r = asRow(TABLE, value);
  return {
    id: col.uuid(TABLE, r, "id"),
    case_a: col.uuid(TABLE, r, "case_a"),
    case_b: col.uuid(TABLE, r, "case_b"),
    status: col.oneOf(TABLE, r, "status", ["flagged", "confirmed_same", "dismissed"] as const),
    rule: col.oneOf(TABLE, r, "rule", ["profile", "same_phone"] as const),
    score: col.numeric(TABLE, r, "score"),
  };
}

export type ReadContext = { requestId?: string; pool?: Connectable };

export async function readDuplicate(
  principal: Principal,
  linkId: string,
  ctx: ReadContext = {},
): Promise<DuplicateReadResult> {
  if (effectiveRole(principal) !== "officer" || principal.kind !== "user") return { kind: "hidden", caseId: null };
  if (!isUuid(linkId)) return { kind: "hidden", caseId: null };
  const { pool } = ctx;

  return withTransaction(async (client) => {
    // One snapshot for the link and both reports (no locks; nothing here decides):
    // without it an edit between the SELECTs could pair a link with a report it
    // was not made for. Must be the first statement of the transaction.
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    const linkRes = await client.query(
      `SELECT id, case_a, case_b, status, rule, score::text AS score
       FROM duplicate_links WHERE id = $1`,
      [linkId],
    );
    const linkRow = firstRow(TABLE, linkRes.rows);
    if (!linkRow) return { kind: "hidden", caseId: null } as const;
    const link = mapLink(linkRow);
    const a = await getCaseRow(client, link.case_a);
    const b = await getCaseRow(client, link.case_b);
    if (!a || !b) return { kind: "hidden", caseId: null } as const;
    if (a.kind !== b.kind) return { kind: "hidden", caseId: null } as const;

    // Project both reports through the officer projection, then strip contact_phone
    // to satisfy the row-schema allowlist. The detail view (with raw phone) is
    // served by API-004/009 only; this page is a compare view, so masked rows.
    const aCtx = await officerContext(client, a.id, a.district_code);
    const bCtx = await officerContext(client, b.id, b.district_code);
    const aView = projectCaseFor(principal, a, aCtx);
    const bView = projectCaseFor(principal, b, bCtx);
    if (!aView || aView.view !== "officer" || !bView || bView.view !== "officer") {
      return { kind: "hidden", caseId: a.id } as const;
    }
    const aRow = officerCaseRowSchema.parse({ ...aView.data, contact_phone: null });
    const bRow = officerCaseRowSchema.parse({ ...bView.data, contact_phone: null });

    return {
      kind: "ok",
      view: {
        link: {
          id: link.id,
          status: link.status,
          rule: link.rule,
          score: link.score,
        },
        cases: { a: aRow, b: bRow },
      },
    } as const;
  }, { pool });
}
