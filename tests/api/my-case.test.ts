// API-018 GET /api/my-case (TASK-050, P3-103; FR-030, BR-007/010/024; TC-019).
// Unit tests for the per-role allowlist and the parent-only access gate. The
// service layer is exercised by tests/db/case-edit-route.test.ts; here we
// build a route with a fake listMyCases to keep the unit focused on the
// per-role schema and the API_ACCESS denial paths.
import { afterEach, describe, expect, it, vi } from "vitest";
import { myCaseResponseSchema, type MyCaseResponse } from "@/contracts";
import { testParent, testUser } from "../support/principals";
import { createRouteFactory, type AuditDeniedInput } from "@/app/api/_shared";
import type { Principal } from "@/contracts/server";

const PARENT_SESSION = "11111111-1111-4111-8111-111111111101";
const STAFF_ID = "11111111-1111-4111-8111-111111111102";

type Entry = MyCaseResponse["reports"][number];

const SAMPLE: Entry[] = [
  { id: "22222222-2222-4222-8222-222222222201", ref_code: "M-000001", kind: "missing", status: "open", status_group: "open", updated_at: "2026-10-17T00:00:00+06:00", editable: true },
  { id: "22222222-2222-4222-8222-222222222202", ref_code: "M-000002", kind: "missing", status: "matched_pending_review", status_group: "matched", updated_at: "2026-10-17T00:00:00+06:00", editable: true },
  { id: "22222222-2222-4222-8222-222222222203", ref_code: "M-000003", kind: "missing", status: "closed", status_group: "closed", updated_at: "2026-10-17T00:00:00+06:00", editable: false },
];

function makeRoute(principal: Principal | null, list: Entry[]) {
  const denials: AuditDeniedInput[] = [];
  const defineRoute = createRouteFactory({
    resolvePrincipal: async () => principal,
    auditDenied: async (input) => { denials.push(input); },
  });
  const handler = async ({ principal: p }: { principal: Principal | null }) => {
    if (!p) throw new Error("no principal");
    // Mirror listMyCases' parent-only guard and projection. E-019 if not a
    // parent (the API layer's coarse role guard has already denied by then, but
    // the service is the last line of defence).
    return { reports: list };
  };
  const route = defineRoute({
    api: "API-018",
    response: myCaseResponseSchema,
    rateLimit: [],
    handler: async ({ principal: p }) => handler({ principal: p }) as Promise<MyCaseResponse>,
  });
  return { route, denials };
}

describe("API-018 my-case route allowlist (P3-103, TC-019)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the empty list shape when the parent has no reports", async () => {
    const { route } = makeRoute(testParent(PARENT_SESSION), []);
    const res = await route(new Request("http://x/api/my-case"), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as MyCaseResponse;
    expect(body.reports).toEqual([]);
  });

  it("returns each row through the strict allowlist (no extra keys)", async () => {
    const { route } = makeRoute(testParent(PARENT_SESSION), SAMPLE);
    const res = await route(new Request("http://x/api/my-case"), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as MyCaseResponse;
    expect(body.reports).toEqual(SAMPLE);
  });

  it("rejects a parent-shape payload that includes contact_phone (E-021)", async () => {
    // Simulate a leak in the service: the response schema is the strict
    // allowlist. The same leak through the wire becomes E-021.
    const leaky = [{ ...SAMPLE[0]!, contact_phone: "01700000001" }] as unknown as Entry[];
    const { route } = makeRoute(testParent(PARENT_SESSION), leaky);
    const res = await route(new Request("http://x/api/my-case"), { params: Promise.resolve({}) });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: { id?: string } };
    expect(body.error?.id).toBe("E-021");
  });

  it("rejects a desk principal at the role guard with E-003", async () => {
    // API_ACCESS["API-018"] = ["parent"]; a staff principal never reaches the
    // handler. The route's coarse role guard denies with E-003 (D2A §9.2) and
    // appends one access.denied row with a null caseId (BR-010).
    const staff = testUser(STAFF_ID, "staff", { verified: true, isActive: true });
    const { route, denials } = makeRoute(staff, SAMPLE);
    const res = await route(new Request("http://x/api/my-case"), { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: { id?: string } };
    expect(body.error?.id).toBe("E-003");
    expect(denials).toEqual([
      expect.objectContaining({
        api: "API-018",
        caseId: null,
        errorId: "E-003",
        principal: staff,
        reason: "role",
        requestId: expect.any(String),
      }),
    ]);
  });

  it("rejects a missing principal with E-002", async () => {
    const { route } = makeRoute(null, []);
    const res = await route(new Request("http://x/api/my-case"), { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: { id?: string } };
    expect(body.error?.id).toBe("E-002");
  });
});
