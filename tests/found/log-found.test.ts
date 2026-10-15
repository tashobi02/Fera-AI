// TASK-026 / API-007 / TC-008 (API half): the found-child log service and its route shape.
// Synthetic data only. The case service is replaced by a recording fake; its own
// behaviour (ownership, idempotency, audit, one transaction) is tested in tests/case.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ERROR_CATALOGUE, createFoundRequestSchema, createFoundResponseSchema, errorEnvelopeSchema } from "@/contracts";
import { exampleCreateFoundRequest, exampleFoundRow } from "@/contracts/examples";
import type { CaseRow } from "@/contracts/server";
import { Reply } from "@/app/api/_shared";
import { logFoundCase } from "@/server/found/log-found";
import { jsonPost, noParams, sameOriginHeaders, testFactory } from "../api/fakes";
import { testParent, testUser } from "../support/principals";

const staffId = randomUUID();
const request = createFoundRequestSchema.parse(exampleCreateFoundRequest);
const rowFor = (ownerId: string, over: Partial<CaseRow> = {}): CaseRow => ({ ...exampleFoundRow, created_by_user_id: ownerId, ...over });

function fakeCreate(row: CaseRow, replayed = false) {
  const calls: Array<{ principal: unknown; body: unknown; ctx: unknown }> = [];
  const createFoundCase = async (principal: unknown, body: unknown, ctx: unknown) => {
    calls.push({ principal, body, ctx });
    return { case: row, replayed };
  };
  return { calls, deps: { createFoundCase } as never };
}

describe("logFoundCase (API-007)", () => {
  it("returns the staff's own found report with matching state, and no candidate details", async () => {
    const staff = testUser(staffId, "staff");
    const f = fakeCreate(rowFor(staffId));
    const res = await logFoundCase(staff, request, { requestId: "req-1" }, f.deps);
    expect(createFoundResponseSchema.safeParse(res).success).toBe(true);
    expect(res).toMatchObject({ kind: "found", status: exampleFoundRow.status, replayed: false, is_synthetic: true });
    expect(res.matching_state).toBe(exampleFoundRow.matching_state);
    expect(Object.keys(res).sort()).toEqual(
      ["created_at", "draft", "id", "is_synthetic", "kind", "matching_state", "ref_code", "replayed", "status", "version"],
    );
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]?.ctx).toEqual({ requestId: "req-1" });
    expect(f.calls[0]?.body).toBe(request);
  });

  it("reports a replay without creating anything new", async () => {
    const staff = testUser(staffId, "staff");
    const res = await logFoundCase(staff, request, {}, fakeCreate(rowFor(staffId), true).deps);
    expect(res.replayed).toBe(true);
  });

  it("gives a verified officer the same own-report shape, never the officer case view", async () => {
    const officer = testUser(staffId, "officer", { verified: true });
    const res = await logFoundCase(officer, request, {}, fakeCreate(rowFor(staffId)).deps);
    expect(createFoundResponseSchema.safeParse(res).success).toBe(true);
    expect(res).not.toHaveProperty("child");
    expect(res).not.toHaveProperty("status_group");
  });

  it("fails closed when the stored row is not the caller's own", async () => {
    const staff = testUser(staffId, "staff");
    await expect(logFoundCase(staff, request, {}, fakeCreate(rowFor(randomUUID())).deps)).rejects.toThrow(/own/i);
  });

  it("does not call the case service for a parent principal", async () => {
    const f = fakeCreate(rowFor(staffId));
    await expect(logFoundCase(testParent(randomUUID()), request, {}, f.deps)).rejects.toThrow();
    expect(f.calls).toHaveLength(0);
  });
});

describe("API-007 route contract (defineRoute + the same schemas)", () => {
  function route(principal: ReturnType<typeof testUser> | ReturnType<typeof testParent> | null, replayed = false) {
    const t = testFactory(principal);
    const f = fakeCreate(rowFor(staffId), replayed);
    const handler = t.defineRoute({
      api: "API-007",
      body: createFoundRequestSchema,
      response: createFoundResponseSchema,
      handler: async ({ principal: p, body, requestId }) => {
        const out = await logFoundCase(p, body, { requestId }, f.deps);
        return new Reply(out, out.replayed ? 200 : 201);
      },
    });
    return { t, f, handler };
  }
  const post = (body: unknown) => jsonPost("/api/found-cases", body, sameOriginHeaders);

  it("201 for a new report and 200 for an identical replay (staff)", async () => {
    const created = route(testUser(staffId, "staff"));
    const res = await created.handler(post(exampleCreateFoundRequest), noParams);
    expect(res.status).toBe(201);
    expect((await res.json()).replayed).toBe(false);
    const replay = route(testUser(staffId, "staff"), true);
    const again = await replay.handler(post(exampleCreateFoundRequest), noParams);
    expect(again.status).toBe(200);
    expect((await again.json()).replayed).toBe(true);
  });

  it("E-001 without confirmed=true, and the case service is not reached", async () => {
    const r = route(testUser(staffId, "staff"));
    const res = await r.handler(post({ ...exampleCreateFoundRequest, confirmed: false }), noParams);
    expect(res.status).toBe(ERROR_CATALOGUE["E-001"].http);
    expect(errorEnvelopeSchema.parse(await res.json()).error.id).toBe("E-001");
    expect(r.f.calls).toHaveLength(0);
  });

  it("E-001 for a missing-kind draft (wrong kind never reaches the service)", async () => {
    const r = route(testUser(staffId, "staff"));
    const bad = { ...exampleCreateFoundRequest, draft: { ...exampleCreateFoundRequest.draft, kind: "missing" } };
    const res = await r.handler(post(bad), noParams);
    expect(res.status).toBe(400);
    expect(r.f.calls).toHaveLength(0);
  });

  it("E-002 with no session and E-003 for a parent", async () => {
    const anon = route(null);
    const a = await anon.handler(post(exampleCreateFoundRequest), noParams);
    expect(errorEnvelopeSchema.parse(await a.json()).error.id).toBe("E-002");
    const parent = route(testParent(randomUUID()));
    const p = await parent.handler(post(exampleCreateFoundRequest), noParams);
    expect(errorEnvelopeSchema.parse(await p.json()).error.id).toBe("E-003");
    expect(parent.f.calls).toHaveLength(0);
  });
});
