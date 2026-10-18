// API-014 acceptance: verified actors may trigger a run, while the response
// remains a status-only DTO even when the matcher has candidate details.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { errorEnvelopeSchema, rematchResponseSchema, uuidSchema } from "@/contracts";
import { createRematchHandler } from "@/app/api/match/[caseId]/route";
import { createFakeEmbedder } from "@/server/embeddings/model";
import type { MatcherRunOptions, MatcherRunResult } from "@/server/matching/run";
import { testParent, testUser } from "../support/principals";
import { ORIGIN, sameOriginHeaders, testFactory } from "./fakes";

const CASE_ID = randomUUID();

function post(id: string): Request {
  return new Request(`${ORIGIN}/api/match/${id}`, { method: "POST", headers: sameOriginHeaders });
}

function route(principal: ReturnType<typeof testUser> | ReturnType<typeof testParent> | null, runner: RunFn) {
  return testFactory(principal).defineRoute({
    api: "API-014",
    params: zParams,
    response: rematchResponseSchema,
    rateLimit: [],
    handler: createRematchHandler({
      embedder: createFakeEmbedder(),
      runMatcherForCase: runner,
    }),
  });
}

type RunFn = (caseId: string, opts: MatcherRunOptions) => Promise<MatcherRunResult>;

function viRunner(fn: RunFn): RunFn {
  return fn;
}

const zParams = z.strictObject({ caseId: uuidSchema });

describe("API-014 rematch (P3-040)", () => {
  it("allows a verified officer and returns only case_id + matching_state", async () => {
    const calls: Array<{ caseId: string; api: string }> = [];
    const run = viRunner(async (caseId, opts) => {
      calls.push({ caseId, api: opts.api });
      return {
        caseId,
        state: "complete",
        candidates: [{ id: randomUUID(), rank: 1, similarity: 91 }],
        considered: 3,
        abstained: false,
      };
    });
    const handler = route(testUser(randomUUID(), "officer", { verified: true }), run);
    const response = await handler(post(CASE_ID), { params: Promise.resolve({ caseId: CASE_ID }) });
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(rematchResponseSchema.parse(payload)).toEqual({ case_id: CASE_ID, matching_state: "complete" });
    expect(Object.keys(payload).sort()).toEqual(["case_id", "matching_state"]);
    expect(calls).toEqual([{ caseId: CASE_ID, api: "API-014" }]);
  });

  it.each([
    ["parent", () => testParent(randomUUID())],
    ["staff", () => testUser(randomUUID(), "staff")],
    ["unverified officer", () => testUser(randomUUID(), "officer", { verified: false })],
  ] as const)("denies %s before calling the matcher", async (_label, makePrincipal) => {
    let calls = 0;
    const run = viRunner(async (caseId) => {
      calls++;
      return { caseId, state: "complete", candidates: [], considered: 0, abstained: true };
    });
    const handler = route(makePrincipal(), run);
    const response = await handler(post(CASE_ID), { params: Promise.resolve({ caseId: CASE_ID }) });
    // API-014 has a caseId record route, so the shared route layer conceals role
    // denial as the same not-found envelope used for unknown case IDs.
    expect(response.status).toBe(404);
    expect(errorEnvelopeSchema.parse(await response.json()).error.id).toBe("E-004");
    expect(calls).toBe(0);
  });

  it("returns a visible failed status without returning the internal error or candidate details", async () => {
    const run = viRunner(async (caseId) => ({
      caseId,
      state: "failed",
      candidates: [{ id: randomUUID(), rank: 1, similarity: 75 }],
      considered: 1,
      abstained: false,
      errorId: "E-021",
    }));
    const handler = route(testUser(randomUUID(), "admin"), run);
    const response = await handler(post(CASE_ID), { params: Promise.resolve({ caseId: CASE_ID }) });
    expect(rematchResponseSchema.parse(await response.json())).toEqual({ case_id: CASE_ID, matching_state: "failed" });
  });
});
