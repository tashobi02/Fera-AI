// API-004 GET /api/cases/:id (P3-016; BR-007/010/024; TC-022/052). Unit tests for the
// route layer and the per-role projections.
//
// - Malformed path IDs reach the hidden-record E-004 path and denial audit.
// - The handler maps an "absent or other-party" service result to E-004 and lets the
//   compose layer write the access.denied audit:
//     * unknown case ID  → caseId: null in the audit row (BR-010, TC-052);
//     * existing-but-other-party case → caseId: <the real id> in the audit row.
// - The handler returns the projected DTO verbatim; never a raw row, never candidate
//   fields, never a parent/staff view of another party's payload. The strict per-role
//   response schema is the allowlist: a raw row that leaks extra keys (contact_phone,
//   child_name, raw_text) is refused at the response stage and becomes E-021.
//
// DB-level tests (real pool, real audit, real transaction) live at
// tests/db/case-read.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { isUuid, type OwnerCaseView } from "@/contracts";
import {
  adminCaseViewSchema,
  officerCaseViewSchema,
  ownerCaseViewSchema,
  staffOwnCaseViewSchema,
} from "@/contracts/schemas";
import { parentPrincipal } from "@/contracts/server";
import { ApiError, createRouteFactory } from "@/app/api/_shared";

type RecordedDenial = { caseId: string | null; errorId: "E-003" | "E-004"; api: string };

// Capture-only audit hook so we can assert the deny row's case FK (null for unknown,
// real for other-party) without touching the database.
function makeFactory(handler: (params: { id: string }) => Promise<unknown>): {
  GET: (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
  denials: RecordedDenial[];
} {
  const denials: RecordedDenial[] = [];
  // A valid (non-null) parent principal so the composer reaches the Zod step and the
  // response-schema step. The test handler is what exercises each stage.
  const principal = parentPrincipal({
    id: "11111111-1111-4111-8111-111111111111",
    expires_at: "2099-01-01T00:00:00+06:00",
    revoked_at: null,
  });
  const defineRoute = createRouteFactory({
    resolvePrincipal: async () => principal,
    auditDenied: async (input) => {
      denials.push({ caseId: input.caseId, errorId: input.errorId, api: input.api });
    },
  });
  const route = defineRoute({
    api: "API-004",
    params: z.strictObject({ id: z.string() }),
    response: {
      parent: ownerCaseViewSchema,
      staff: staffOwnCaseViewSchema,
      officer: officerCaseViewSchema,
      admin: adminCaseViewSchema,
    },
    rateLimit: [],
    // This test deliberately injects a raw row in one case to exercise the
    // runtime response allowlist; the production handler stays fully typed.
    handler: async ({ params }: { params: { id: string } }) => handler(params) as Promise<OwnerCaseView>,
  });
  return { GET: route, denials };
}

const UNKNOWN_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PARTY_ID = "22222222-2222-4222-8222-222222222222";

describe("API-004 cases read route (P3-016, TC-022/052)", () => {
  let rec: ReturnType<typeof makeFactory>;
  beforeEach(() => {
    rec = makeFactory(async () => ({ id: "irrelevant" }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hides a malformed ID as E-004 and audits the denial", async () => {
    rec = makeFactory(async () => { throw new ApiError("E-004"); });
    const res = await rec.GET(new Request("http://x/api/cases/not-a-uuid"), {
      params: Promise.resolve({ id: "not-a-uuid" }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: { id?: string } };
    expect(body.error?.id).toBe("E-004");
    expect(rec.denials).toEqual([{ caseId: null, errorId: "E-004", api: "API-004" }]);
  });

  it("passes a valid UUID through to the handler", async () => {
    const seen: string[] = [];
    const OWNER_PAYLOAD = {
      id: UNKNOWN_ID,
      ref_code: "M-000001",
      kind: "missing",
      status: "open",
      status_group: "open",
      is_synthetic: true,
      version: 1,
      editable: true,
      matching_state: "queued",
      draft: null,
      created_at: "2026-10-17T00:00:00+06:00",
      updated_at: "2026-10-17T00:00:00+06:00",
    };
    rec = makeFactory(async ({ id }) => {
      seen.push(id);
      return { ...OWNER_PAYLOAD, id };
    });
    const res = await rec.GET(new Request(`http://x/api/cases/${UNKNOWN_ID}`), {
      params: Promise.resolve({ id: UNKNOWN_ID }),
    });
    expect(res.status).toBe(200);
    expect(seen).toEqual([UNKNOWN_ID]);
  });

  it("maps an unknown case to E-004 with a null FK in the audit row (TC-052)", async () => {
    rec = makeFactory(async () => {
      // Mirror readCase's "hidden, caseId: null" branch: the route throws E-004 with
      // no caseId, the compose layer audits with caseId: null.
      throw new ApiError("E-004");
    });
    const res = await rec.GET(new Request(`http://x/api/cases/${UNKNOWN_ID}`), {
      params: Promise.resolve({ id: UNKNOWN_ID }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: { id?: string } };
    expect(body.error?.id).toBe("E-004");
    expect(rec.denials).toEqual([
      { caseId: null, errorId: "E-004", api: "API-004" },
    ]);
  });

  it("maps an existing-but-other-party case to E-004 with the real case FK in the audit row", async () => {
    rec = makeFactory(async () => {
      throw new ApiError("E-004", { caseId: OTHER_PARTY_ID });
    });
    const res = await rec.GET(new Request(`http://x/api/cases/${OTHER_PARTY_ID}`), {
      params: Promise.resolve({ id: OTHER_PARTY_ID }),
    });
    expect(res.status).toBe(404);
    expect(rec.denials).toEqual([
      { caseId: OTHER_PARTY_ID, errorId: "E-004", api: "API-004" },
    ]);
  });

  it("a raw-row leak (contact_phone, raw_text, child_name) is refused by the per-role schema (E-021)", async () => {
    // A raw row carries every column the projection would strip (contact_phone, child
    // name, raw_text, …). The strict per-role response schema rejects unknown keys at
    // the response stage, so a handler that leaked the row would fail E-021.
    const RAW_ROW_LIKE = {
      id: UNKNOWN_ID,
      ref_code: "M-000001",
      kind: "missing",
      status: "open",
      status_group: "open",
      is_synthetic: true,
      version: 1,
      editable: true,
      matching_state: "queued",
      draft: null,
      created_at: "2026-10-17T00:00:00+06:00",
      updated_at: "2026-10-17T00:00:00+06:00",
      contact_phone: "01700000001",
      child_name: "Rafi",
      raw_text: "secret",
    };
    rec = makeFactory(async () => RAW_ROW_LIKE);
    const res = await rec.GET(new Request(`http://x/api/cases/${UNKNOWN_ID}`), {
      params: Promise.resolve({ id: UNKNOWN_ID }),
    });
    // The response schema (per-role) is the allowlist: contact_phone, child_name and
    // raw_text would fail the strict object schema and become E-021.
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: { id?: string } };
    expect(body.error?.id).toBe("E-021");
  });

  it("a clean projected payload returns 200", async () => {
    const PARENT_PAYLOAD = {
      id: UNKNOWN_ID,
      ref_code: "M-000001",
      kind: "missing",
      status: "open",
      status_group: "open",
      is_synthetic: true,
      version: 1,
      editable: true,
      matching_state: "queued",
      draft: null,
      created_at: "2026-10-17T00:00:00+06:00",
      updated_at: "2026-10-17T00:00:00+06:00",
    };
    rec = makeFactory(async () => PARENT_PAYLOAD);
    expect(isUuid(UNKNOWN_ID)).toBe(true);
    const res = await rec.GET(new Request(`http://x/api/cases/${UNKNOWN_ID}`), {
      params: Promise.resolve({ id: UNKNOWN_ID }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; ref_code: string };
    expect(body.id).toBe(UNKNOWN_ID);
    expect(body.ref_code).toBe("M-000001");
  });
});
