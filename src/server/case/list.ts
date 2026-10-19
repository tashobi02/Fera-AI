// API-022 case list — verified-officer drill-through (P3-041, TASK-030a, FR-019,
// BR-007/024; TC-012, TC-015, TC-055). Owner: Masnun (this file is the case-service
// entry the API route and the page drill-through both call).
//
// - The route layer (src/app/api/cases/route.ts) wraps this with role guards and the
//   frozen `caseListResponseSchema` allowlist; the list function itself enforces that
//   the caller is a verified officer (effective role "officer") and projects every
//   row through `projectCaseListFor` so a leaked field or an extra key cannot escape
//   (BR-007/024). Admin, staff and parent callers are rejected here too — admin has
//   no access to API-022 (D2A §9.2: officer only).
// - One access.denied row is written when a signed-in non-officer calls (BR-010,
//   TC-052). The API layer's compose is what actually attaches the auditDenied hook;
//   the route passes the same hook down here so the denial row carries the real
//   `api: "API-022"` token. An unknown district, a malformed cursor or a leaked
//   response field is the composer's E-003/E-004/E-021 path, not this service.
// - Filters (district, kind, status_group) and cursor are passed straight to the
//   dashboard reader (`listCasesForDistrict`); the WHERE clause is built inside that
//   reader with parameterised placeholders, never from string concatenation, so the
//   route cannot inject SQL through a query param (BR-024).
// - `anonymised_at IS NULL` is always in the reader's WHERE so redacted rows never
//   appear (BR-007 "candidates and the other party's data go only to verified
//   officers"; a payload-redacted row keeps lifecycle fields for the dashboard totals
//   — TC-015 — but the contact-aware officer list must not serve it).
// - The dashboard service (src/server/dashboard/stats.ts) holds the row reader; this
//   module is the role-scoped + projected wrapper that satisfies the API-022 contract.
import { createHmac, timingSafeEqual } from "node:crypto";
import { ApiError } from "@/app/api/_shared/envelope";
import { caseListResponseSchema, cursorSchema, isUuid, officerDuplicateSchema, type CaseListResponse } from "@/contracts";
import { effectiveRole, projectCaseListFor, type OfficerContext, type Principal } from "@/contracts/server";
import { loadSecret, subkey } from "@/server/auth/secrets";
import { CASE_COLUMNS, mapCaseRow } from "./rows";
import { asRow, col } from "@/server/db/decode";
import type { Queryable } from "@/server/db/queryable";

// Allowlist of API-022 filter inputs the route forwards. Keeping this here (not in the
// dashboard reader) means a future dashboard-internal call cannot widen the surface.
export type OfficerCaseListInput = {
  district?: number | string;
  kind?: "missing" | "found";
  status_group?: "open" | "matched" | "closed";
  cursor?: string;
  limit?: number;
};

export type OfficerCaseListResult = CaseListResponse;

export type ListCasesServiceContext = { requestId?: string | null };

const listCursorKey = () => subkey(loadSecret("AUTH_SECRET"), "cursor.case_list");
const listCursorMac = (key: Buffer, payload: string) =>
  createHmac("sha256", key).update(payload).digest("base64url");

function encodeListCursor(after: string, key: Buffer): string {
  const payload = Buffer.from(JSON.stringify({ v: 1, after }), "utf8").toString("base64url");
  return `${payload}.${listCursorMac(key, payload)}`;
}

function decodeListCursor(cursor: string, key: Buffer): string | null {
  const [payload, signature, extra] = cursor.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(listCursorMac(key, payload));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof value !== "object" || value === null) return null;
    const { v, after } = value as { v?: unknown; after?: unknown };
    return v === 1 && typeof after === "string" && isUuid(after) ? after.toLowerCase() : null;
  } catch {
    return null;
  }
}

export async function listOfficerCases(
  principal: Principal,
  input: OfficerCaseListInput,
  db: Queryable,
  ctx: ListCasesServiceContext = {},
): Promise<OfficerCaseListResult> {
  // Officer only: API-022 is in the officer column of the D2A §9.2 matrix. A signed-in
  // parent, staff, unverified officer or admin must be told the area does not exist
  // for them (BR-010). The route's compose layer attaches the API-level auditDenied
  // hook (with the API-022 token) and catches the thrown E-003; this service only
  // answers the error id. An anonymous principal reaches E-002 before this runs.
  if (effectiveRole(principal) !== "officer") throw new ApiError("E-003", { reason: "role" });
  // The request id flows through the API layer's response headers (`x-request-id`)
  // and is recorded on the optional access.denied audit row, so the service itself
  // does not need to act on it. Reading it here makes the parameter consumed and
  // keeps the call site one-liner stable when audits grow.
  void ctx.requestId;

  let signingKey: Buffer | undefined;
  const getSigningKey = () => signingKey ??= listCursorKey();
  let cursor: string | undefined;
  if (input.cursor !== undefined) {
    if (!cursorSchema.safeParse(input.cursor).success) throw new ApiError("E-001", { reason: "schema" });
    const decoded = decodeListCursor(input.cursor, getSigningKey());
    if (decoded === null) throw new ApiError("E-001", { reason: "schema" });
    cursor = decoded;
  }

  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const params: unknown[] = [];
  const where = ["c.anonymised_at IS NULL"];
  if (input.district !== undefined) {
    params.push(String(input.district));
    where.push(`c.district_code = $${params.length}`);
  }
  if (input.kind !== undefined) {
    params.push(input.kind);
    where.push(`c.kind = $${params.length}`);
  }
  if (input.status_group !== undefined) {
    const statuses = {
      open: ["submitted", "open"],
      matched: ["matched_pending_review", "confirmed"],
      closed: ["closed", "referred"],
    }[input.status_group];
    params.push(statuses);
    where.push(`c.status = ANY($${params.length}::case_status[])`);
  }
  if (cursor !== undefined) {
    params.push(cursor);
    where.push(`c.id < $${params.length}`);
  }
  params.push(limit + 1);
  const limitParam = `$${params.length}`;
  const qualifiedColumns = CASE_COLUMNS.split(", ").map((column) => `c.${column}`).join(", ");

  // Page selection, complete case rows, district labels and duplicate cues all come
  // from one statement snapshot. This keeps API-022 to one database round-trip while
  // retaining the same officer-only allowlist used by API-004.
  const { rows: rawRows } = await db.query(
    `WITH page AS (
       SELECT c.id FROM cases c
       WHERE ${where.join(" AND ")}
       ORDER BY c.id DESC
       LIMIT ${limitParam}
     )
     SELECT ${qualifiedColumns}, d.name_bn AS district_name_bn,
            COALESCE(dupes.items, '[]'::json) AS duplicate_items
     FROM page p
     JOIN cases c ON c.id = p.id
     LEFT JOIN districts d ON d.code = c.district_code
     LEFT JOIN LATERAL (
       SELECT json_agg(
         json_build_object('id', other.id, 'ref', other.ref_code, 'status', other.status)
         ORDER BY other.ref_code
       ) AS items
       FROM duplicate_links dl
       JOIN cases other ON other.id = CASE WHEN dl.case_a = c.id THEN dl.case_b ELSE dl.case_a END
       WHERE (dl.case_a = c.id OR dl.case_b = c.id)
         AND other.anonymised_at IS NULL AND dl.status <> 'dismissed'
     ) dupes ON true
     ORDER BY c.id DESC`,
    params,
  );

  const hasMore = rawRows.length > limit;
  const pageRows = hasMore ? rawRows.slice(0, limit) : rawRows;
  const items = pageRows.map((value) => {
    const raw = asRow("cases", value);
    const row = mapCaseRow(raw);
    const duplicateValue = raw.duplicate_items;
    const duplicates = officerDuplicateSchema.array().parse(duplicateValue);
    const octx: OfficerContext = {
      districtNameBn: col.textOrNull("districts", raw, "district_name_bn"),
      duplicateOf: duplicates,
    };
    return { row, ctx: octx };
  });
  const projected = projectCaseListFor(principal, items, null);
  if (!projected) throw new ApiError("E-003", { reason: "role" });
  const lastId = items.at(-1)?.row.id;

  return caseListResponseSchema.parse({
    cases: projected.cases,
    next_cursor: hasMore && lastId ? encodeListCursor(lastId, getSigningKey()) : null,
  });
}
