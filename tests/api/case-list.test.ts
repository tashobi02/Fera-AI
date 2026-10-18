// API-022 GET /api/cases (P3-041, TASK-030a, FR-019, BR-007/024; TC-012/015/052).
// Route-composition acceptance for the frozen query and response contracts.
import { describe, expect, it } from "vitest";
import { caseListQuerySchema, caseListResponseSchema, errorEnvelopeSchema, type CaseListQuery } from "@/contracts";
import { exampleCaseListResponse, PRINCIPALS } from "@/contracts/examples";
import { userPrincipal } from "@/contracts/server";
import { testFactory, get, noParams } from "./fakes";

const SAMPLE_LIST = caseListResponseSchema.parse(exampleCaseListResponse);
const OPAQUE_CURSOR = "abcdefgh.abcdefghijklmnop";
const RAW_UUID_CURSOR = "12345678-1234-4234-8234-123456789abc";

describe("API-022 officer case list (P3-041, TC-012/015/052)", () => {
  it("parses all frozen filters and returns the strict officer list DTO", async () => {
    const { defineRoute, audit } = testFactory(PRINCIPALS.officer);
    let received: CaseListQuery | undefined;
    const GET = defineRoute({
      api: "API-022",
      query: caseListQuerySchema,
      response: caseListResponseSchema,
      rateLimit: [],
      handler: async ({ query }) => {
        received = query;
        return SAMPLE_LIST;
      },
    });

    const response = await GET(
      get(`/api/cases?district=1&kind=missing&status_group=open&limit=2&cursor=${OPAQUE_CURSOR}`),
      noParams,
    );

    expect(response.status).toBe(200);
    expect(received).toEqual({ district: 1, kind: "missing", status_group: "open", limit: 2, cursor: OPAQUE_CURSOR });
    expect(caseListResponseSchema.parse(await response.json())).toEqual(SAMPLE_LIST);
    expect(audit).toHaveLength(0);
  });

  it.each([
    ["parent", PRINCIPALS.parent],
    ["staff", PRINCIPALS.staff],
    ["admin", PRINCIPALS.admin],
    ["unverified officer", userPrincipal({
      id: "33333333-3333-4333-8333-333333333333",
      role: "officer",
      verified: false,
      is_active: true,
    })!],
  ])("denies %s with E-003 and records one API-022 access denial", async (_label, principal) => {
    const { defineRoute, audit } = testFactory(principal);
    const GET = defineRoute({
      api: "API-022",
      query: caseListQuerySchema,
      response: caseListResponseSchema,
      rateLimit: [],
      handler: async () => SAMPLE_LIST,
    });

    const response = await GET(get("/api/cases?district=1"), noParams);

    expect(response.status).toBe(403);
    expect(errorEnvelopeSchema.parse(await response.json()).error.id).toBe("E-003");
    expect(audit).toEqual([{
      principal,
      api: "API-022",
      requestId: expect.any(String),
      errorId: "E-003",
      reason: "role",
      caseId: null,
    }]);
  });

  it("rejects invalid filters before invoking the handler", async () => {
    const { defineRoute } = testFactory(PRINCIPALS.officer);
    let reachedHandler = false;
    const GET = defineRoute({
      api: "API-022",
      query: caseListQuerySchema,
      response: caseListResponseSchema,
      rateLimit: [],
      handler: async () => {
        reachedHandler = true;
        return SAMPLE_LIST;
      },
    });

    const response = await GET(get("/api/cases?district=65&limit=0&kind=child"), noParams);

    expect(response.status).toBe(400);
    expect(errorEnvelopeSchema.parse(await response.json()).error.id).toBe("E-001");
    expect(reachedHandler).toBe(false);
  });

  it("fails closed when a handler adds a field outside the frozen officer DTO", async () => {
    const { defineRoute } = testFactory(PRINCIPALS.officer);
    const GET = defineRoute({
      api: "API-022",
      query: caseListQuerySchema,
      response: caseListResponseSchema,
      rateLimit: [],
      handler: async () => ({
        ...SAMPLE_LIST,
        cases: [{ ...SAMPLE_LIST.cases[0]!, raw_text: "[MOCK] must never be served" }],
      }) as never,
    });

    const response = await GET(get("/api/cases"), noParams);

    expect(response.status).toBe(500);
    expect(errorEnvelopeSchema.parse(await response.json()).error.id).toBe("E-021");
  });

  it("rejects an output cursor that is not in the frozen opaque cursor format", async () => {
    const { defineRoute } = testFactory(PRINCIPALS.officer);
    const GET = defineRoute({
      api: "API-022",
      query: caseListQuerySchema,
      response: caseListResponseSchema,
      rateLimit: [],
      handler: async () => ({ ...SAMPLE_LIST, next_cursor: RAW_UUID_CURSOR }),
    });

    const response = await GET(get("/api/cases"), noParams);

    expect(response.status).toBe(500);
    expect(errorEnvelopeSchema.parse(await response.json()).error.id).toBe("E-021");
  });
});
