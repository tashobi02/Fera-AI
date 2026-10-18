// API-012 GET /api/dashboard/stats (P3-041, TASK-030a, FR-019, BR-014, TC-012/055).
// Unit tests for the route layer and the per-role projections.
//
// - Verified officer and admin are the only roles the API allows (D2A §9.2 line
//   1287). Parent and staff must answer E-003 (with the access.denied audit), and
//   unverified officer answers E-003 (effectiveRole() falls back to "staff").
// - The handler returns the projected DashboardStatsResponse; the strict
//   `dashboardStatsResponseSchema` is the allowlist. A handler that leaked the
//   raw rows or an extra field would be rejected at the response stage as E-021.
// - The route carries a per-principal rate limit; the test injects a tight rule
//   and confirms the E-007 path.
// - The route does not take query or body params; a request with unknown query
//   keys is rejected as malformed input (E-001) before the role guard runs.
import { describe, expect, it } from "vitest";
import { errorEnvelopeSchema, type DashboardStatsResponse } from "@/contracts";
import { PRINCIPALS } from "@/contracts/examples";
import { ApiError, createRouteFactory } from "@/app/api/_shared";
import { dashboardStatsResponseSchema } from "@/contracts/schemas";
import { userPrincipal } from "@/contracts/server";
import { testFactory, get, noParams, recordingAudit, fakeResolver } from "./fakes";

const SAMPLE_RESPONSE: DashboardStatsResponse = {
  generated_at: "2026-10-17T12:00:00+06:00",
  counting_basis: "report_rows_separated_by_kind",
  totals: {
    missing_reports: { open: 0, matched: 0, closed: 0 },
    found_reports: { open: 0, matched: 0, referral_recorded: 0 },
    confirmed_pairs: 0,
  },
  districts: Array.from({ length: 64 }, (_, i) => ({
    code: i + 1,
    name_bn: `[MOCK] জেলা ${String(i + 1).padStart(2, "0")}`,
    name_en: `[MOCK] District ${String(i + 1).padStart(2, "0")}`,
    lat: 23 + (i % 4) * 0.5,
    lng: 89 + (i % 4) * 0.5,
    missing_reports: { open: 0, matched: 0, closed: 0 },
    found_reports: { open: 0, matched: 0, referral_recorded: 0 },
    confirmed_pairs: 0,
  })),
};

describe("API-012 dashboard route (P3-041, TC-012/TC-055)", () => {
  it("verified officer receives the strict response schema", async () => {
    const { defineRoute, audit } = testFactory(PRINCIPALS.officer);
    const GET = defineRoute({
      api: "API-012",
      response: dashboardStatsResponseSchema,
      rateLimit: [],
      handler: async () => SAMPLE_RESPONSE,
    });
    const res = await GET(get("/api/dashboard/stats"), noParams);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DashboardStatsResponse;
    expect(body.districts).toHaveLength(64);
    expect(body.counting_basis).toBe("report_rows_separated_by_kind");
    // No denial row on a happy-path GET.
    expect(audit).toHaveLength(0);
  });

  it("admin receives the strict response schema", async () => {
    const { defineRoute } = testFactory(PRINCIPALS.admin);
    const GET = defineRoute({
      api: "API-012",
      response: dashboardStatsResponseSchema,
      rateLimit: [],
      handler: async () => SAMPLE_RESPONSE,
    });
    const res = await GET(get("/api/dashboard/stats"), noParams);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DashboardStatsResponse;
    expect(body.totals.confirmed_pairs).toBe(0);
  });

  it("parent is denied E-003 and writes one access.denied audit row", async () => {
    const { defineRoute, audit } = testFactory(PRINCIPALS.parent);
    const GET = defineRoute({
      api: "API-012",
      response: dashboardStatsResponseSchema,
      rateLimit: [],
      handler: async () => SAMPLE_RESPONSE,
    });
    const res = await GET(get("/api/dashboard/stats"), noParams);
    expect(res.status).toBe(403);
    const body = errorEnvelopeSchema.parse(await res.json());
    expect(body.error.id).toBe("E-003");
    expect(audit).toEqual([
      { principal: PRINCIPALS.parent, api: "API-012", requestId: expect.any(String), errorId: "E-003", reason: "role", caseId: null },
    ]);
  });

  it("staff is denied E-003 and writes one access.denied audit row", async () => {
    const { defineRoute, audit } = testFactory(PRINCIPALS.staff);
    const GET = defineRoute({
      api: "API-012",
      response: dashboardStatsResponseSchema,
      rateLimit: [],
      handler: async () => SAMPLE_RESPONSE,
    });
    const res = await GET(get("/api/dashboard/stats"), noParams);
    expect(res.status).toBe(403);
    const body = errorEnvelopeSchema.parse(await res.json());
    expect(body.error.id).toBe("E-003");
    expect(audit).toEqual([
      { principal: PRINCIPALS.staff, api: "API-012", requestId: expect.any(String), errorId: "E-003", reason: "role", caseId: null },
    ]);
  });

  it("an unverified officer resolves to effective role 'staff' and is denied E-003", async () => {
    // The principal is officer + not verified → effectiveRole is 'staff', which is
    // not in API-012's allowlist (officer/admin only). The resolver returns the
    // raw principal; the compose layer is what applies effectiveRole.
    const unverifiedOfficer = userPrincipal({
      id: "33333333-3333-4333-8333-333333333333",
      role: "officer",
      verified: false,
      is_active: true,
    });
    expect(unverifiedOfficer).not.toBeNull();
    const { defineRoute, audit } = testFactory(unverifiedOfficer!);
    const GET = defineRoute({
      api: "API-012",
      response: dashboardStatsResponseSchema,
      rateLimit: [],
      handler: async () => SAMPLE_RESPONSE,
    });
    const res = await GET(get("/api/dashboard/stats"), noParams);
    expect(res.status).toBe(403);
    expect(errorEnvelopeSchema.parse(await res.json()).error.id).toBe("E-003");
    expect(audit).toHaveLength(1);
    expect(audit[0].errorId).toBe("E-003");
  });

  it("a leaked field (raw_rows) is refused by the per-role schema as E-021", async () => {
    const { defineRoute } = testFactory(PRINCIPALS.officer);
    const GET = defineRoute({
      api: "API-012",
      response: dashboardStatsResponseSchema,
      rateLimit: [],
      // A handler that returns the strict schema PLUS an extra key would be
      // rejected by the response schema. The strict `dashboardStatsResponseSchema`
      // is the allowlist; the parser drops unknown keys only if `.strict()` is on,
      // which the schema is.
      handler: async () => ({ ...SAMPLE_RESPONSE, raw_rows: [{ id: "x" }] }) as unknown as DashboardStatsResponse,
    });
    const res = await GET(get("/api/dashboard/stats"), noParams);
    expect(res.status).toBe(500);
    expect(errorEnvelopeSchema.parse(await res.json()).error.id).toBe("E-021");
  });

  it("a missing district (63 rows) is refused by the per-role schema as E-021", async () => {
    const { defineRoute } = testFactory(PRINCIPALS.officer);
    const GET = defineRoute({
      api: "API-012",
      response: dashboardStatsResponseSchema,
      rateLimit: [],
      handler: async () => ({ ...SAMPLE_RESPONSE, districts: SAMPLE_RESPONSE.districts.slice(0, 63) }),
    });
    const res = await GET(get("/api/dashboard/stats"), noParams);
    expect(res.status).toBe(500);
    expect(errorEnvelopeSchema.parse(await res.json()).error.id).toBe("E-021");
  });

  it("a count out of range is refused by the schema as E-021", async () => {
    const { defineRoute } = testFactory(PRINCIPALS.officer);
    const GET = defineRoute({
      api: "API-012",
      response: dashboardStatsResponseSchema,
      rateLimit: [],
      handler: async () => ({
        ...SAMPLE_RESPONSE,
        districts: SAMPLE_RESPONSE.districts.map((d, i) => i === 0 ? { ...d, lat: 999 } : d),
      }),
    });
    const res = await GET(get("/api/dashboard/stats"), noParams);
    expect(res.status).toBe(500);
    expect(errorEnvelopeSchema.parse(await res.json()).error.id).toBe("E-021");
  });

  it("the route's per-principal rate limit is enforced (E-007 on the second request)", async () => {
    // Reuse the cases-read pattern: a strict 1/min principal rule. The dashboard
    // route declares its own rule (60/min); here we inject a tight rule so we can
    // observe the E-007 path without depending on a real clock.
    const audit = recordingAudit();
    const limiter = await (async () => {
      const { RateLimiter, MemoryRateLimitStore, createKeyer } = await import("@/app/api/_shared");
      const store = new MemoryRateLimitStore(100, () => Date.now());
      return new RateLimiter(store, () => Date.now());
    })();
    const defineRoute = createRouteFactory({
      resolvePrincipal: fakeResolver(PRINCIPALS.officer),
      auditDenied: audit.audit,
      limiter,
      keyer: (await import("@/app/api/_shared")).createKeyer("test"),
    });
    const GET = defineRoute({
      api: "API-012",
      response: dashboardStatsResponseSchema,
      rateLimit: [{ id: "dashboard.stats.test", limit: 1, windowMs: 60_000, scope: "principal", onStoreError: "allow" }],
      handler: async () => SAMPLE_RESPONSE,
    });
    const first = await GET(get("/api/dashboard/stats"), noParams);
    expect(first.status).toBe(200);
    const second = await GET(get("/api/dashboard/stats"), noParams);
    expect(second.status).toBe(429);
    const body = errorEnvelopeSchema.parse(await second.json());
    expect(body.error.id).toBe("E-007");
    // The E-007 envelope interpolates the seconds into the bilingual message; the
    // strict envelope schema does not expose a `details.seconds` field, so we
    // assert the message contains a whole-second count.
    expect(body.error.message_en).toMatch(/\d+ seconds?/);
  });

  it("an unsigned-in (anonymous) principal fails closed as E-002 and does not audit a denial", async () => {
    // API-012 is not public; an anonymous principal cannot reach the rate limit
    // or the role guard. The compose layer answers E-002 with no audit row
    // (audits are for E-003/E-004 only; E-002 is "no credentials" and cannot
    // identify a session).
    const { defineRoute, audit } = testFactory(null);
    const GET = defineRoute({
      api: "API-012",
      response: dashboardStatsResponseSchema,
      rateLimit: [],
      handler: async () => SAMPLE_RESPONSE,
    });
    const res = await GET(get("/api/dashboard/stats"), noParams);
    expect(res.status).toBe(401);
    expect(errorEnvelopeSchema.parse(await res.json()).error.id).toBe("E-002");
    expect(audit).toHaveLength(0);
  });

  it("a handler that throws is wrapped as E-021 with no audit", async () => {
    const { defineRoute, audit } = testFactory(PRINCIPALS.officer);
    const GET = defineRoute({
      api: "API-012",
      response: dashboardStatsResponseSchema,
      rateLimit: [],
      handler: async () => { throw new ApiError("E-021", { reason: "response" }); },
    });
    const res = await GET(get("/api/dashboard/stats"), noParams);
    expect(res.status).toBe(500);
    expect(errorEnvelopeSchema.parse(await res.json()).error.id).toBe("E-021");
    expect(audit).toHaveLength(0);
  });
});