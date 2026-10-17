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
import { caseListResponseSchema, cursorSchema, isUuid, type CaseListResponse } from "@/contracts";
import { effectiveRole, projectCaseListFor, type OfficerContext, type Principal } from "@/contracts/server";
import { listCasesForDistrict, type CaseListQuery, type CaseListResult } from "@/server/dashboard";
import { loadSecret, subkey } from "@/server/auth/secrets";
import { officerContext } from "./read";
import { getCaseRow } from "./rows";
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

  const q: CaseListQuery = {
    ...(input.district !== undefined ? { district: String(input.district) } : {}),
    ...(input.kind !== undefined ? { kind: input.kind } : {}),
    ...(input.status_group !== undefined ? { status_group: input.status_group } : {}),
    ...(cursor !== undefined ? { cursor } : {}),
    ...(input.limit !== undefined ? { limit: input.limit } : {}),
  };

  const { rows, nextCursor }: CaseListResult = await listCasesForDistrict(db, q);

  // The dashboard reader gives us the internal row set (id, kind, status, district).
  // We need the per-role DTO for each row, which means reading the full CaseRow plus
  // the per-row officer context (district name, duplicate cue). One transaction so the
  // projection matches what read.ts returns to API-004 (no row-state drift between the
  // list and the detail view).
  const projected: CaseListResponse["cases"] = [];
  for (const r of rows) {
    const row = await getCaseRow(db, r.id);
    if (!row) continue; // the row was redacted between the list read and the projection read
    const octx: OfficerContext = await officerContext(db, r.id, r.district_code);
    const dto = projectCaseListFor(principal, [{ row, ctx: octx }], null);
    if (!dto) continue; // effective role changed mid-request: refuse this row
    projected.push(dto.cases[0]!);
  }

  return caseListResponseSchema.parse({
    cases: projected,
    next_cursor: nextCursor === null ? null : encodeListCursor(nextCursor, getSigningKey()),
  });
}
