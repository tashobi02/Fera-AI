// API-003 POST /api/cases: the parent's reviewed missing report (TASK-022, FR-031,
// BR-004/023). The parent session is minted only on API-001/002, so a submit without
// one is the layer's E-002/E-019; nothing is stored until `confirmed: true` parses.
// Sequence per src/server/case/README.md: createMissingCase → openCase → owner DTO.
// Embedding, duplicate checks and matching (Masnun) are not built: the case keeps the
// service's durable `matching_state` and nothing runs in the background (OD-022-2).
//
// API-022 GET /api/cases: SCREEN-011 drill-through (TASK-030 part a; FR-019; BR-007/
// 024). Active verified officers only (D2A §5.5 line 487, line 1285 projection).
// The strict `caseListResponseSchema` is the per-role allowlist; a raw row or an
// extra child/contact/free-text field becomes E-021. Pagination is cursor-based
// (last `id` of the previous page; rows ordered by id DESC).
//
// P3-041 (lane): the per-id full CaseRow fetch is intentionally omitted — see
// the STOP note in the report. `projectCaseListFor` needs a CaseRow per id; the
// only public source is readCase, which also writes the contact_viewed audit per
// call (wrong for a list endpoint) and is heavier than a single SELECT. The lint
// rule (eslint.config.mjs CASE_INTERNALS) blocks `getCaseRow` here, and the
// brief forbids editing src/server/case. The route therefore returns an empty
// `cases` list and the lead must choose: (a) re-export getCaseRow from
// @/server/case, (b) move listCasesForDistrict's payload to the case service, or
// (c) accept the empty-list regression here.
import { caseListQuerySchema, caseListResponseSchema, createMissingRequestSchema, createMissingResponseSchema, type CaseListResponse, type CreateMissingResponse } from "@/contracts";
import { effectiveRole, projectCaseFor, projectCaseListFor, type Principal } from "@/contracts/server";
import { listCasesForDistrict, type CaseListResult } from "@/server/dashboard";
import { createMissingCase, openCase } from "@/server/case";
import { getPool } from "@/server/db/pool";
import { ApiError, Reply, defineRoute } from "../_shared";

export const runtime = "nodejs"; // pg

export const POST = defineRoute({
  api: "API-003",
  body: createMissingRequestSchema,
  response: createMissingResponseSchema,
  handler: async ({ principal, body, requestId, logger }): Promise<Reply<CreateMissingResponse>> => {
    // API-002 returns this token, but TASK-014/020 have not added its signer yet.
    // Accept the schema-valid token without persisting or trusting it (OD-022-1).
    if (body.draft_token !== undefined) {
      logger.info({ event: "submit.draft_token_unverified", request_id: requestId, route: "API-003", method: "POST", role: "parent" });
    }
    const { case: created, replayed } = await createMissingCase(principal, body, { requestId });
    // Also run on replay: it recovers a row whose earlier open step failed, and is a
    // no-op for any status other than submitted.
    const opened = await openCase(principal, created.id, { requestId });
    const projected = projectCaseFor(principal, opened, { districtNameBn: null, duplicateOf: [] });
    if (projected?.view !== "owner") throw new ApiError("E-021", { reason: "response" });
    // API-006 is not on this base, so no output can be fetched yet (OD-022-3).
    return new Reply({ ...projected.data, replayed, outputs_available: [] }, replayed ? 200 : 201);
  },
});

// One principal window per minute is well above the dashboard's expected use;
// documented here per D2A §5.5.
const CASE_LIST: { id: string; limit: number; windowMs: number; scope: "principal"; onStoreError: "allow" } = {
  id: "cases.list",
  limit: 120,
  windowMs: 60_000,
  scope: "principal",
  onStoreError: "allow",
};

export const GET = defineRoute({
  api: "API-022",
  query: caseListQuerySchema,
  response: caseListResponseSchema,
  rateLimit: [CASE_LIST],
  handler: async ({ principal, query }): Promise<CaseListResponse> => {
    // The contract `caseListResponseSchema` matches `officerCaseRowSchema` rows; the
    // role guard in compose.ts already restricts the route to verified officers
    // (D2A §9.2 API-ACCESS["API-022"] = ["officer"]). The per-role projection needs
    // a CaseRow per id; until the lead resolves the P3-041 STOP, the projection
    // receives an empty row set, so the response is `{ cases: [], next_cursor: … }`.
    if (effectiveRole(principal) !== "officer") throw new ApiError("E-003", { reason: "role" });
    const pool = getPool();
    const result: CaseListResult = await listCasesForDistrict(pool, {
      // caseListQuerySchema's district is a transformed number (queryIntSchema.pipe(districtCodeSchema));
      // listCasesForDistrict takes the raw query string so a `district_code = $n` param is a string.
      district: query.district !== undefined ? String(query.district) : undefined,
      kind: query.kind,
      status_group: query.status_group,
      cursor: query.cursor,
      limit: query.limit,
    });
    const rows: { row: never; ctx: { districtNameBn: null; duplicateOf: [] } }[] = [];
    void result;
    const projected = projectCaseListFor(principal as Principal, rows, null);
    if (projected === null) throw new ApiError("E-003", { reason: "role" });
    return projected;
  },
});

