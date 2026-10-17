// API-005 PATCH /api/cases/:id (TASK-049, P3-102; FR-029, BR-025; TC-018). Unit
// tests for the route layer's role gate and the per-role response allowlist.
// The service-layer lifecycle (lock, version recheck, snapshot, void, queue
// reconcile, audit) is exercised by tests/db/case-edit-route.test.ts; here we
// assert the route's HTTP behaviour: parent-only, no optimistic false success,
// OwnerCaseView response shape, schema-leak refused (E-021).
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  type MissingSubmissionDraft,
  type OwnerCaseView,
  type UpdateCaseRequest,
} from "@/contracts";
import {
  ownerCaseViewSchema,
  updateCaseRequestSchema,
} from "@/contracts/schemas";
import { testParent, testUser } from "../support/principals";
import { createRouteFactory, type AuditDeniedInput } from "@/app/api/_shared";
import type { Principal } from "@/contracts/server";

const PARENT_SESSION = "11111111-1111-4111-8111-111111111101";
const STAFF_ID = "11111111-1111-4111-8111-111111111102";
const CASE_ID = "22222222-2222-4222-8222-222222222201";
const OTHER_PARTY_CASE = "22222222-2222-4222-8222-222222222202";
const SAME_ORIGIN_HEADERS = { "content-type": "application/json", host: "x", origin: "http://x" };

const OWNER_VIEW: OwnerCaseView = {
  id: CASE_ID,
  ref_code: "M-000001",
  kind: "missing",
  status: "open",
  status_group: "open",
  is_synthetic: true,
  version: 2,
  editable: true,
  matching_state: "queued",
  draft: null,
  created_at: "2026-10-17T00:00:00+06:00",
  updated_at: "2026-10-17T00:00:00+06:00",
};

const REVIEWED_DRAFT: MissingSubmissionDraft = {
  kind: "missing",
  source_text: "two days ago…",
  child: {
    name: "Mim",
    name_latin: null,
    age_years: 11,
    age_min: null,
    age_max: null,
    sex: "female",
    height_cm: null,
    clothing: "blue shirt",
    marks: null,
  },
  event: {
    at: "2026-10-15T08:00:00+06:00",
    at_approx: false,
    at_lower: "2026-10-15T08:00:00+06:00",
    at_upper: "2026-10-15T08:00:00+06:00",
    place_text: "school gate",
    district_text: null,
    district_code: 26,
    thana: null,
    circumstances: "on the way to school",
  },
  reporter: { relation: "mother", phone: "01700000001" },
  evidence: {},
};

const VALID_REQUEST: UpdateCaseRequest = {
  draft: REVIEWED_DRAFT,
  confirmed: true,
  expected_version: 1,
};

// The handler is a tiny seam: it forwards to editOwnerCase, which calls
// editMissingCase and projects through projectCaseFor. Here we model the
// service with a tiny stub that captures the inputs and returns a fixed view.
type EditCall = { principal: Principal | null; caseId: string; request: UpdateCaseRequest };
function makeRoute(opts: {
  principal: Principal | null;
  editImpl: (call: EditCall) => Promise<OwnerCaseView>;
}) {
  const denials: AuditDeniedInput[] = [];
  const calls: EditCall[] = [];
  const defineRoute = createRouteFactory({
    resolvePrincipal: async () => opts.principal,
    auditDenied: async (input) => { denials.push(input); },
  });
  const route = defineRoute({
    api: "API-005",
    params: z.strictObject({ id: z.string() }),
    body: updateCaseRequestSchema,
    response: ownerCaseViewSchema,
    rateLimit: [],
    handler: async ({ principal, params, body }) => {
      const view = await opts.editImpl({ principal, caseId: (await params).id, request: body as UpdateCaseRequest });
      calls.push({ principal, caseId: (await params).id, request: body as UpdateCaseRequest });
      return view;
    },
  });
  return { route, denials, calls };
}

describe("API-005 PATCH /api/cases/:id (P3-102, TC-018)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts a parent's reviewed draft and returns the projected OwnerCaseView", async () => {
    const { route, calls } = makeRoute({
      principal: testParent(PARENT_SESSION),
      editImpl: async () => OWNER_VIEW,
    });
    const res = await route(
      new Request(`http://x/api/cases/${CASE_ID}`, {
        method: "PATCH",
        headers: SAME_ORIGIN_HEADERS,
        body: JSON.stringify(VALID_REQUEST),
      }),
      { params: Promise.resolve({ id: CASE_ID }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as OwnerCaseView;
    expect(body).toEqual(OWNER_VIEW);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.caseId).toBe(CASE_ID);
    expect(calls[0]?.request.expected_version).toBe(1);
  });

  it("rejects a malformed payload (missing confirmed=true) with E-001", async () => {
    const { route } = makeRoute({
      principal: testParent(PARENT_SESSION),
      editImpl: async () => OWNER_VIEW,
    });
    const res = await route(
      new Request(`http://x/api/cases/${CASE_ID}`, {
        method: "PATCH",
        headers: SAME_ORIGIN_HEADERS,
        body: JSON.stringify({ ...VALID_REQUEST, confirmed: false }),
      }),
      { params: Promise.resolve({ id: CASE_ID }) },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { id?: string } };
    expect(body.error?.id).toBe("E-001");
  });

  it("hides the parent-only record from staff with E-004 and writes the denial audit", async () => {
    const staff = testUser(STAFF_ID, "staff", { verified: true, isActive: true });
    const { route, denials } = makeRoute({
      principal: staff,
      editImpl: async () => OWNER_VIEW,
    });
    const res = await route(
      new Request(`http://x/api/cases/${CASE_ID}`, {
        method: "PATCH",
        headers: SAME_ORIGIN_HEADERS,
        body: JSON.stringify(VALID_REQUEST),
      }),
      { params: Promise.resolve({ id: CASE_ID }) },
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: { id?: string } };
    expect(body.error?.id).toBe("E-004");
    // API-005 is a record route: signed-in callers without record access receive
    // an indistinguishable E-004 and a null-FK access.denied audit entry.
    expect(denials).toEqual([
      expect.objectContaining({
        api: "API-005",
        caseId: null,
        errorId: "E-004",
        principal: staff,
        reason: "role",
        requestId: expect.any(String),
      }),
    ]);
  });

  it("maps an unknown case ID to E-004 with a null FK in the audit row", async () => {
    // editMissingCase throws ApiError("E-004") for an unknown id; the route
    // should propagate it; the audit hook receives caseId: null (BR-010, TC-052).
    const { route, denials } = makeRoute({
      principal: testParent(PARENT_SESSION),
      editImpl: async () => { throw new (await import("@/app/api/_shared")).ApiError("E-004"); },
    });
    const res = await route(
      new Request(`http://x/api/cases/${CASE_ID}`, {
        method: "PATCH",
        headers: SAME_ORIGIN_HEADERS,
        body: JSON.stringify(VALID_REQUEST),
      }),
      { params: Promise.resolve({ id: CASE_ID }) },
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: { id?: string } };
    expect(body.error?.id).toBe("E-004");
    expect(denials).toEqual([{ caseId: null, errorId: "E-004", api: "API-005", principal: testParent(PARENT_SESSION), requestId: denials[0]?.requestId, reason: "authorize" }]);
  });

  it("maps an other-party case to E-004 with the real case FK in the audit row", async () => {
    const { route, denials } = makeRoute({
      principal: testParent(PARENT_SESSION),
      editImpl: async () => { throw new (await import("@/app/api/_shared")).ApiError("E-004", { caseId: OTHER_PARTY_CASE }); },
    });
    const res = await route(
      new Request(`http://x/api/cases/${OTHER_PARTY_CASE}`, {
        method: "PATCH",
        headers: SAME_ORIGIN_HEADERS,
        body: JSON.stringify(VALID_REQUEST),
      }),
      { params: Promise.resolve({ id: OTHER_PARTY_CASE }) },
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: { id?: string } };
    expect(body.error?.id).toBe("E-004");
    expect(denials[0]?.caseId).toBe(OTHER_PARTY_CASE);
  });

  it("maps a stale expected_version to E-005 (no optimistic false success)", async () => {
    const { route } = makeRoute({
      principal: testParent(PARENT_SESSION),
      editImpl: async () => { throw new (await import("@/app/api/_shared")).ApiError("E-005"); },
    });
    const res = await route(
      new Request(`http://x/api/cases/${CASE_ID}`, {
        method: "PATCH",
        headers: SAME_ORIGIN_HEADERS,
        body: JSON.stringify(VALID_REQUEST),
      }),
      { params: Promise.resolve({ id: CASE_ID }) },
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: { id?: string } };
    expect(body.error?.id).toBe("E-005");
  });

  it("maps a terminal/redacted case to E-018", async () => {
    const { route } = makeRoute({
      principal: testParent(PARENT_SESSION),
      editImpl: async () => { throw new (await import("@/app/api/_shared")).ApiError("E-018"); },
    });
    const res = await route(
      new Request(`http://x/api/cases/${CASE_ID}`, {
        method: "PATCH",
        headers: SAME_ORIGIN_HEADERS,
        body: JSON.stringify(VALID_REQUEST),
      }),
      { params: Promise.resolve({ id: CASE_ID }) },
    );
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: { id?: string } };
    expect(body.error?.id).toBe("E-018");
  });

  it("refuses a leaked raw row through the per-role schema (E-021)", async () => {
    const leaky = { ...OWNER_VIEW, contact_phone: "01700000001", raw_text: "secret" } as unknown as OwnerCaseView;
    const { route } = makeRoute({
      principal: testParent(PARENT_SESSION),
      editImpl: async () => leaky,
    });
    const res = await route(
      new Request(`http://x/api/cases/${CASE_ID}`, {
        method: "PATCH",
        headers: SAME_ORIGIN_HEADERS,
        body: JSON.stringify(VALID_REQUEST),
      }),
      { params: Promise.resolve({ id: CASE_ID }) },
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: { id?: string } };
    expect(body.error?.id).toBe("E-021");
  });
});
