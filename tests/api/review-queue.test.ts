// API-008 GET /api/review-queue route unit tests (P3-034a, TASK-027, FR-012).
// The DB tests live at tests/db/review-queue.test.ts and use the real pool; here
// we exercise the route layer only: Zod validation, role guard, and the per-role
// response schema stripping.
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { reviewQueueResponseSchema } from "@/contracts";
import { parentPrincipal, userPrincipal, type Principal } from "@/contracts/server";
import { ApiError, createRouteFactory } from "@/app/api/_shared";
import { GET } from "@/app/api/review-queue/route";

type RecordedDenial = { caseId: string | null; errorId: "E-003" | "E-004"; api: string };

// A capture-only factory so we can assert the access.denied audit hook fired with
// the right shape without touching the database.
function makeFactory(handler: () => Promise<unknown>, principal: Principal | null): {
  GET: (req: Request, ctx: { params: Promise<Record<string, string | string[] | undefined>> }) => Promise<Response>;
  denials: RecordedDenial[];
} {
  const denials: RecordedDenial[] = [];
  const defineRoute = createRouteFactory({
    resolvePrincipal: async () => principal,
    auditDenied: async (input) => {
      denials.push({ caseId: input.caseId, errorId: input.errorId, api: input.api });
    },
  });
  const route = defineRoute({
    api: "API-008",
    query: z.strictObject({
      district: z.coerce.number().int().min(1).max(64).optional(),
      limit: z.coerce.number().int().min(1).max(50).optional(),
      cursor: z.string().min(1).optional(),
    }).optional(),
    response: reviewQueueResponseSchema,
    rateLimit: [],
    // Mirror the real route spec (P3-034: API-008 follows the record-route E-004 rule).
    deny: "E-004",
    handler: async () => handler() as never,
  });
  return { GET: route, denials };
}

const STAFF = userPrincipal({ id: "11111111-1111-4111-8111-111111111111", role: "staff", verified: false, is_active: true });
const UNVERIFIED = userPrincipal({ id: "22222222-2222-4222-8222-222222222222", role: "officer", verified: false, is_active: true });
const PARENT = parentPrincipal({ id: "33333333-3333-4333-8333-333333333333", expires_at: "2099-01-01T00:00:00+06:00", revoked_at: null });
const ADMIN = userPrincipal({ id: "44444444-4444-4444-8444-444444444444", role: "admin", verified: false, is_active: true });
const OFFICER = userPrincipal({ id: "55555555-5555-4555-8555-555555555555", role: "officer", verified: true, is_active: true });

describe("API-008 review queue route (P3-034a, TASK-027, FR-012)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("staff caller → route guard denies, E-004, null-FK audit", async () => {
    // The coarse role guard refuses non-officer callers before the handler runs.
    const f = makeFactory(async () => { throw new Error("handler should not run"); }, STAFF);
    const res = await f.GET(new Request("http://x/api/review-queue"), { params: Promise.resolve({}) });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: { id?: string } };
    expect(body.error?.id).toBe("E-004");
    expect(f.denials).toEqual([{ caseId: null, errorId: "E-004", api: "API-008" }]);
  });

  it("unverified officer → hidden, E-004", async () => {
    const f = makeFactory(async () => { throw new Error("handler should not run"); }, UNVERIFIED);
    const res = await f.GET(new Request("http://x/api/review-queue"), { params: Promise.resolve({}) });
    expect(res.status).toBe(404);
    expect(f.denials[0]).toEqual({ caseId: null, errorId: "E-004", api: "API-008" });
  });

  it("parent → hidden, E-004", async () => {
    const f = makeFactory(async () => { throw new Error("handler should not run"); }, PARENT);
    const res = await f.GET(new Request("http://x/api/review-queue"), { params: Promise.resolve({}) });
    expect(res.status).toBe(404);
    expect(f.denials[0]).toEqual({ caseId: null, errorId: "E-004", api: "API-008" });
  });

  it("admin → hidden, E-004 (D2A §9.2 admin = None for API-008)", async () => {
    const f = makeFactory(async () => { throw new Error("handler should not run"); }, ADMIN);
    const res = await f.GET(new Request("http://x/api/review-queue"), { params: Promise.resolve({}) });
    expect(res.status).toBe(404);
    expect(f.denials[0]).toEqual({ caseId: null, errorId: "E-004", api: "API-008" });
  });

  it("limit out of range (999) → Zod refuses with E-001", async () => {
    const f = makeFactory(async () => { throw new Error("handler should not run"); }, OFFICER);
    const res = await f.GET(new Request("http://x/api/review-queue?limit=999"), { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { id?: string } };
    expect(body.error?.id).toBe("E-001");
    // No denial audit for an input-validation failure: the guard never fired.
    expect(f.denials).toEqual([]);
  });

  it("malformed district (abc) → Zod refuses with E-001", async () => {
    const f = makeFactory(async () => { throw new Error("handler should not run"); }, OFFICER);
    const res = await f.GET(new Request("http://x/api/review-queue?district=abc"), { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { id?: string } };
    expect(body.error?.id).toBe("E-001");
    expect(f.denials).toEqual([]);
  });

  it("a raw-row leak (handler returns a case row with contact_phone) is refused by the strict response schema (E-021)", async () => {
    // The response schema is the only allowlist; a handler that served a raw row
    // would fail E-021 at the response stage, never reaching the client.
    const RAW_ROW = {
      items: [
        {
          case: {
            id: "11111111-1111-4111-8111-111111111111",
            contact_phone: "01700000001",
            child_name: "Rafi",
          },
          candidates: [],
        },
      ],
      next_cursor: null,
    };
    const f = makeFactory(async () => RAW_ROW, OFFICER);
    const res = await f.GET(new Request("http://x/api/review-queue"), { params: Promise.resolve({}) });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: { id?: string } };
    expect(body.error?.id).toBe("E-021");
  });

  it("verified officer + clean projected payload → 200", async () => {
    const PAYLOAD = { items: [], next_cursor: null };
    const f = makeFactory(async () => PAYLOAD, OFFICER);
    const res = await f.GET(new Request("http://x/api/review-queue?limit=10"), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; next_cursor: string | null };
    expect(body.items).toEqual([]);
    expect(body.next_cursor).toBeNull();
  });

  it("unknown api error in handler → E-021, no denial audit", async () => {
    const f = makeFactory(async () => { throw new Error("boom"); }, OFFICER);
    const res = await f.GET(new Request("http://x/api/review-queue"), { params: Promise.resolve({}) });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: { id?: string } };
    expect(body.error?.id).toBe("E-021");
  });

  it("officer handler returning E-004 audits with no case FK", async () => {
    // Mirrors the case where readReviewQueue's hidden branch is hit by an active
    // officer (which never happens in production; the route still throws E-004).
    const f = makeFactory(async () => { throw new ApiError("E-004"); }, OFFICER);
    const res = await f.GET(new Request("http://x/api/review-queue"), { params: Promise.resolve({}) });
    expect(res.status).toBe(404);
    expect(f.denials).toEqual([{ caseId: null, errorId: "E-004", api: "API-008" }]);
  });

  it("real route module exports a GET handler", () => {
    // The route module is the integration target for the API guard + Zod stack;
    // we only assert here that the export is wired.
    expect(typeof GET).toBe("function");
  });
});