// TASK-028 / API-009 and API-010 route contracts: defineRoute with the same schemas and a
// fake case service. The decision transaction itself is tested in tests/case and tests/db.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ERROR_CATALOGUE, candidateDecisionViewSchema, decisionRequestSchema, decisionResponseSchema, errorEnvelopeSchema, isUuid, uuidSchema,
} from "@/contracts";
import { exampleCandidateDecisionView, exampleConfirmDecisionRequest, exampleConfirmDecisionResponse } from "@/contracts/examples";
import { ApiError } from "@/app/api/_shared";
import { jsonPost, sameOriginHeaders, testFactory, get } from "../api/fakes";
import { testParent, testUser } from "../support/principals";

const candidateId = randomUUID();
const params = z.strictObject({ id: uuidSchema });
const readParams = z.strictObject({ id: z.string() });
const officer = () => testUser(randomUUID(), "officer", { verified: true });

function decisionRoute(principal: ReturnType<typeof testUser> | ReturnType<typeof testParent> | null, fail?: Error) {
  const t = testFactory(principal);
  const calls: unknown[] = [];
  const handler = t.defineRoute({
    api: "API-010",
    params,
    body: decisionRequestSchema,
    response: decisionResponseSchema,
    handler: async ({ body }) => {
      calls.push(body);
      if (fail) throw fail;
      return exampleConfirmDecisionResponse;
    },
  });
  return { t, calls, handler };
}
const ctx = (id: string = candidateId) => ({ params: Promise.resolve({ id }) });
const confirmRequest = exampleConfirmDecisionRequest as Extract<typeof exampleConfirmDecisionRequest, { decision: "confirm" }>;
const post = (body: unknown) => jsonPost(`/api/candidates/${candidateId}/decision`, body, sameOriginHeaders);
const errorId = async (res: Response) => errorEnvelopeSchema.parse(await res.json()).error.id;

describe("API-010 decision route", () => {
  it("passes a valid confirm and returns the decision response (200)", async () => {
    const r = decisionRoute(officer());
    const res = await r.handler(post(exampleConfirmDecisionRequest), ctx());
    expect(res.status).toBe(200);
    expect(decisionResponseSchema.safeParse(await res.json()).success).toBe(true);
    expect(r.calls).toHaveLength(1);
  });

  it("E-001 when confirm lacks a checklist item, and reject lacks a reason; the service is not reached", async () => {
    const r = decisionRoute(officer());
    const incomplete = { ...confirmRequest, reviewer_checklist: { ...confirmRequest.reviewer_checklist, referral_is_simulated: false } };
    expect(await errorId(await r.handler(post(incomplete), ctx()))).toBe("E-001");
    const noReason = { decision: "reject", expected_missing_version: 1, expected_found_version: 1 };
    expect(await errorId(await r.handler(post(noReason), ctx()))).toBe("E-001");
    const short = { ...noReason, reason: "ab" };
    expect(await errorId(await r.handler(post(short), ctx()))).toBe("E-001");
    expect(r.calls).toHaveLength(0);
  });

  it("E-001 for a malformed candidate id", async () => {
    const r = decisionRoute(officer());
    const res = await r.handler(post(exampleConfirmDecisionRequest), ctx("not-a-uuid"));
    expect(res.status).toBe(400);
    expect(r.calls).toHaveLength(0);
  });

  it("maps the case service's E-005 to 409 and keeps the body free of server text", async () => {
    const r = decisionRoute(officer(), new ApiError("E-005"));
    const res = await r.handler(post(exampleConfirmDecisionRequest), ctx());
    expect(res.status).toBe(ERROR_CATALOGUE["E-005"].http);
    expect(await errorId(res)).toBe("E-005");
  });

  it("denies staff, parents and anonymous callers before the service (record route: E-004 / E-002)", async () => {
    for (const [principal, id] of [[testUser(randomUUID(), "staff"), "E-004"], [testParent(randomUUID()), "E-004"], [null, "E-002"]] as const) {
      const r = decisionRoute(principal);
      const res = await r.handler(post(exampleConfirmDecisionRequest), ctx());
      expect(await errorId(res), String(principal && "role" in principal ? principal.role : principal?.kind)).toBe(id);
      expect(r.calls).toHaveLength(0);
    }
  });

  it("refuses a cross-origin POST", async () => {
    const r = decisionRoute(officer());
    const res = await r.handler(jsonPost("/x", exampleConfirmDecisionRequest, { host: "fera.test", "sec-fetch-site": "cross-site" }), ctx());
    expect(res.status).toBe(403);
    expect(r.calls).toHaveLength(0);
  });
});

describe("API-009 candidate route", () => {
  function readRoute(principal: ReturnType<typeof testUser> | ReturnType<typeof testParent> | null, hidden = false) {
    const t = testFactory(principal);
    return t.defineRoute({
      api: "API-009",
      params: readParams,
      response: candidateDecisionViewSchema,
      handler: async ({ params: p }) => {
        if (!isUuid(p.id)) throw new ApiError("E-004");
        if (hidden) throw new ApiError("E-004");
        return exampleCandidateDecisionView;
      },
    });
  }

  it("returns the strict candidate view with no identity probability to a verified officer", async () => {
    const res = await readRoute(officer())(get(`/api/candidates/${candidateId}`), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.identity_probability).toBe(false);
    expect(candidateDecisionViewSchema.safeParse(body).success).toBe(true);
  });

  it("hidden, unverified and wrong roles are all E-004", async () => {
    expect(await errorId(await readRoute(officer(), true)(get("/x"), ctx()))).toBe("E-004");
    for (const p of [testUser(randomUUID(), "officer", { verified: false }), testUser(randomUUID(), "staff"), testParent(randomUUID())]) {
      expect(await errorId(await readRoute(p)(get("/x"), ctx()))).toBe("E-004");
    }
  });

  it("malformed candidate IDs use E-004 for a verified officer", async () => {
    const res = await readRoute(officer())(get("/api/candidates/not-a-uuid"), ctx("not-a-uuid"));
    expect(res.status).toBe(404);
    expect(await errorId(res)).toBe("E-004");
  });
});
