// API-023 role-gate checks plus the service's defense-in-depth guard (BR-024).
// The route factory test exercises the same API allowlist used by production;
// the service check proves ineligible principals cannot reach a database pool.
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  duplicateDecisionRequestSchema,
  duplicateDecisionResponseSchema,
  uuidSchema,
} from "@/contracts";
import type { Connectable } from "@/server/case/tx";
import { decideDuplicate } from "@/server/duplicates/decision";
import { testParent, testUser } from "../support/principals";
import { jsonPost, testFactory } from "./fakes";

const LINK_ID = "11111111-1111-4111-8111-111111111101";
const OFFICER_ID = "11111111-1111-4111-8111-111111111102";
const REQUEST = duplicateDecisionRequestSchema.parse({
  status: "dismissed",
  reason: "[MOCK] synthetic review reason",
  profile_evidence_reviewed: true,
});

describe("API-023 duplicate decision role gate", () => {
  it.each([
    ["parent", testParent("11111111-1111-4111-8111-111111111103")],
    ["staff", testUser("11111111-1111-4111-8111-111111111104", "staff", { verified: true })],
    ["unverified officer", testUser("11111111-1111-4111-8111-111111111105", "officer")],
    ["admin", testUser("11111111-1111-4111-8111-111111111106", "admin")],
  ] as const)("hides the API-023 record from %s before the handler", async (_label, principal) => {
    const { defineRoute, audit } = testFactory(principal);
    const handler = vi.fn(async () => ({ link_id: LINK_ID, status: "dismissed" as const, audit_id: 1 }));
    const POST = defineRoute({
      api: "API-023",
      params: z.strictObject({ id: uuidSchema }),
      body: duplicateDecisionRequestSchema,
      response: duplicateDecisionResponseSchema,
      handler,
    });

    const response = await POST(jsonPost(`/api/duplicates/${LINK_ID}/decision`, REQUEST), {
      params: Promise.resolve({ id: LINK_ID }),
    });

    expect(response.status).toBe(404);
    expect((await response.json()).error.id).toBe("E-004");
    expect(handler).not.toHaveBeenCalled();
    expect(audit).toEqual([expect.objectContaining({ api: "API-023", errorId: "E-004", reason: "role" })]);
  });

  it("allows an active verified officer through the API-023 role gate", async () => {
    const { defineRoute, audit } = testFactory(testUser(OFFICER_ID, "officer", { verified: true }));
    const POST = defineRoute({
      api: "API-023",
      params: z.strictObject({ id: uuidSchema }),
      body: duplicateDecisionRequestSchema,
      response: duplicateDecisionResponseSchema,
      handler: async () => ({ link_id: LINK_ID, status: "dismissed" as const, audit_id: 1 }),
    });

    const response = await POST(jsonPost(`/api/duplicates/${LINK_ID}/decision`, REQUEST), {
      params: Promise.resolve({ id: LINK_ID }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ link_id: LINK_ID, status: "dismissed", audit_id: 1 });
    expect(audit).toHaveLength(0);
  });

  it.each([
    ["parent", testParent("11111111-1111-4111-8111-111111111107")],
    ["staff", testUser("11111111-1111-4111-8111-111111111108", "staff", { verified: true })],
    ["unverified officer", testUser("11111111-1111-4111-8111-111111111109", "officer")],
    ["inactive officer", testUser("11111111-1111-4111-8111-111111111110", "officer", { verified: true, isActive: false })],
  ] as const)("service also refuses %s without connecting", async (_label, principal) => {
    const connect = vi.fn();
    const pool = { connect } as unknown as Connectable;

    await expect(decideDuplicate(principal, LINK_ID, REQUEST, { pool })).rejects.toMatchObject({ id: "E-004" });
    expect(connect).not.toHaveBeenCalled();
  });

  it("rejects a malformed link id before connecting", async () => {
    const connect = vi.fn();
    const pool = { connect } as unknown as Connectable;
    const officer = testUser(OFFICER_ID, "officer", { verified: true });

    await expect(decideDuplicate(officer, "not-a-uuid", REQUEST, { pool })).rejects.toMatchObject({ id: "E-004" });
    expect(connect).not.toHaveBeenCalled();
  });
});
