// TASK-015 audit logger (COMP-015; BR-010, FR-021, TC-016/052): action and details
// allowlists, server-derived actors, and the access.denied hooks for API record routes
// and page guards.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AUDIT_ACTIONS, AUDIT_ACTION_PATTERN, ADMIN_AUDIT_DETAIL_KEYS, OFFICER_AUDIT_DETAIL_KEYS } from "@/contracts";
import {
  AuditWriteError,
  CASE_AUDIT_ACTIONS,
  SYSTEM_ACTOR,
  WRITABLE_AUDIT_ACTIONS,
  actorFor,
  appendAudit,
  checkAuditEntry,
  createDeniedAuditHooks,
} from "@/server/audit";
import { testParent, testUser } from "../support/principals";
import { get, noParams, testFactory } from "../api/fakes";

const SESSION = "6b1f3c2a-4d5e-4f60-8a71-0000000000e1";
const OFFICER = "6b1f3c2a-4d5e-4f60-8a71-000000000021";
const CASE = "6b1f3c2a-4d5e-4f60-8a71-0000000000a1";
const REQUEST = "7e7b9a55-a2ed-4ea8-8f66-024f3152ecb9";

const officer = actorFor(testUser(OFFICER, "officer", { verified: true }));

function recorder(rows: (text: string, values: unknown[]) => unknown[] = () => [{ id: "17" }]) {
  const calls: { text: string; values: unknown[] }[] = [];
  return {
    calls,
    db: {
      async query(text: string, values: unknown[] = []) {
        calls.push({ text, values });
        return { rows: rows(text, values) };
      },
    },
  };
}

const rule = (fn: () => unknown) => {
  try {
    fn();
    return "ok";
  } catch (err) {
    return err instanceof AuditWriteError ? err.rule : "other";
  }
};

describe("audit actions", () => {
  it("names every action with the audit_log.action CHECK pattern and keeps the contract codes", () => {
    for (const a of WRITABLE_AUDIT_ACTIONS) expect(a).toMatch(AUDIT_ACTION_PATTERN);
    expect(WRITABLE_AUDIT_ACTIONS).toEqual(expect.arrayContaining([AUDIT_ACTIONS.matchConfirm, AUDIT_ACTIONS.matchReject, AUDIT_ACTIONS.accessDenied]));
    expect(new Set(WRITABLE_AUDIT_ACTIONS).size).toBe(WRITABLE_AUDIT_ACTIONS.length);
  });

  it("refuses unknown codes and case.payload_redacted, which only redact_case() writes", () => {
    expect(rule(() => checkAuditEntry(officer, { action: "case.payload_redacted" as never }))).toBe("action");
    expect(rule(() => checkAuditEntry(officer, { action: "case.deleted" as never }))).toBe("action");
    expect(rule(() => checkAuditEntry(officer, { action: CASE_AUDIT_ACTIONS.caseClosed }))).toBe("ok");
  });
});

describe("audit details allowlist", () => {
  it("accepts typed tokens, IDs, versions, statuses and counts", () => {
    const safe = checkAuditEntry(officer, {
      action: CASE_AUDIT_ACTIONS.matchConfirm,
      caseId: CASE.toUpperCase(),
      details: {
        api: "API-010", candidate_id: CASE, missing_ref: "M-7K2Q9A", found_ref: "F-3D8W1Z", missing_version: 1,
        found_version: 1, decision: "confirm", candidate_status: "confirmed", score: 72.5, rank: 1, reason_recorded: false,
      },
    });
    expect(safe.caseId).toBe(CASE);
  });

  it.each([
    ["a free-text note", { note: "[MOCK] synthetic note" }],
    ["a reason", { reason: "[MOCK] reason text" }],
    ["a child name", { child_name: "[MOCK] name" }],
    ["a phone", { contact_phone: "01700000001" }],
    ["a place", { place_text: "[MOCK] place" }],
    ["a path", { path: "/officer/case/x" }],
    ["a malformed ref", { ref_code: "M-01700000001" }],
    ["a non-enum status", { to_status: "rescued" }],
    ["a non-literal mode", { mode: "anonymisation" }],
    ["a delivered referral", { referral_simulated: false }],
    ["an unknown field path", { fields_changed: ["child.photo"] }],
    ["a probability-shaped score", { score: 101 }],
  ])("refuses %s", (_label, details) => {
    expect(rule(() => checkAuditEntry(officer, { action: CASE_AUDIT_ACTIONS.caseEdited, details: details as never }))).toBe("details");
  });

  it("allows exactly the officer API-013 keys (a superset of the admin keys)", () => {
    expect(OFFICER_AUDIT_DETAIL_KEYS).toEqual(expect.arrayContaining([...ADMIN_AUDIT_DETAIL_KEYS]));
  });

  it("refuses non-UUID case and candidate IDs and drops a non-UUID request ID", () => {
    expect(rule(() => checkAuditEntry(officer, { action: CASE_AUDIT_ACTIONS.caseClosed, caseId: "M-7K2Q9A" }))).toBe("ids");
    expect(rule(() => checkAuditEntry(officer, { action: CASE_AUDIT_ACTIONS.caseClosed, candidateId: "1" }))).toBe("ids");
    expect(checkAuditEntry(officer, { action: CASE_AUDIT_ACTIONS.caseClosed, requestId: "client-supplied" }).requestId).toBeNull();
    expect(checkAuditEntry(officer, { action: CASE_AUDIT_ACTIONS.caseClosed, requestId: REQUEST }).requestId).toBe(REQUEST);
  });
});

describe("audit actors", () => {
  it("derives the actor from the principal's effective role", () => {
    expect(actorFor(testParent(SESSION))).toMatchObject({ type: "parent", userId: null, sessionId: SESSION });
    expect(officer).toMatchObject({ type: "officer", userId: OFFICER, sessionId: null });
    // BR-024: an unverified officer acts with staff permissions, and is audited as staff.
    expect(actorFor(testUser(OFFICER, "officer", { verified: false }))).toMatchObject({ type: "staff" });
    expect(actorFor(testUser(OFFICER, "admin"))).toMatchObject({ type: "admin" });
    expect(SYSTEM_ACTOR).toMatchObject({ type: "system", userId: null, sessionId: null });
  });

  it("refuses an inactive principal", () => {
    expect(rule(() => actorFor(testUser(OFFICER, "officer", { verified: true, isActive: false })))).toBe("actor");
  });
});

describe("appendAudit", () => {
  it("inserts one parameterised row with the database clock and returns its id", async () => {
    const r = recorder();
    const id = await appendAudit(r.db, officer, {
      action: CASE_AUDIT_ACTIONS.caseClosed,
      caseId: CASE,
      details: { outcome: "coordination_recorded", reason_recorded: true },
      requestId: REQUEST,
    });
    expect(id).toBe(17);
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0].text).toMatch(/^INSERT INTO audit_log \(actor_type, actor_user_id, actor_session_id, action, case_id, candidate_id, details, request_id\)/);
    expect(r.calls[0].text).not.toMatch(/\bat\b,/);
    expect(r.calls[0].values).toEqual([
      "officer", OFFICER, null, "case.closed", CASE, null, '{"outcome":"coordination_recorded","reason_recorded":true}', REQUEST,
    ]);
  });

  it("sends nothing when the entry is refused", async () => {
    const r = recorder();
    await expect(appendAudit(r.db, officer, { action: CASE_AUDIT_ACTIONS.caseEdited, details: { note: "x" } as never })).rejects.toBeInstanceOf(AuditWriteError);
    expect(r.calls).toHaveLength(0);
  });

  it("throws when the insert returns no id (the action must abort)", async () => {
    const r = recorder(() => []);
    await expect(appendAudit(r.db, officer, { action: CASE_AUDIT_ACTIONS.caseClosed })).rejects.toThrow(/insert/);
  });
});

describe("access.denied hooks (BR-010, TC-052)", () => {
  const existing = (exists: boolean) =>
    recorder((text) => (text.startsWith("SELECT id FROM cases") ? (exists ? [{ id: CASE }] : []) : [{ id: "9" }]));

  it("records an API denial with the error and API IDs only, keeping the FK for an existing case", async () => {
    const r = existing(true);
    const hooks = createDeniedAuditHooks(() => r.db);
    await hooks.api({ principal: testUser(OFFICER, "staff"), api: "API-010", requestId: REQUEST, errorId: "E-004", reason: "role", caseId: CASE });
    const insert = r.calls.find((c) => c.text.startsWith("INSERT"))!;
    expect(insert.values).toEqual(["staff", OFFICER, null, "access.denied", CASE, null, '{"error_id":"E-004","api":"API-010"}', REQUEST]);
  });

  it("records an unknown case with a null FK instead of failing on the foreign key", async () => {
    const r = existing(false);
    const hooks = createDeniedAuditHooks(() => r.db);
    await hooks.api({ principal: testParent(SESSION), api: "API-004", requestId: REQUEST, errorId: "E-004", reason: "authorize", caseId: CASE });
    const insert = r.calls.find((c) => c.text.startsWith("INSERT"))!;
    expect(insert.values.slice(0, 6)).toEqual(["parent", null, SESSION, "access.denied", null, null]);
  });

  it("records a page denial without the path", async () => {
    const r = existing(false);
    const hooks = createDeniedAuditHooks(() => r.db);
    await hooks.page({ principal: testUser(OFFICER, "staff"), role: "staff", path: "/officer/queue", errorId: "E-004", reason: "role", caseId: null });
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0].values[6]).toBe('{"error_id":"E-004"}');
    expect(JSON.stringify(r.calls)).not.toContain("/officer/queue");
  });

  it("fails the request closed with E-021 when the denial cannot be written", async () => {
    const failing = createDeniedAuditHooks(() => ({
      query: async () => {
        throw Object.assign(new Error("down"), { code: "08006" });
      },
    }));
    const f = testFactory(testUser(OFFICER, "staff"), { auditDenied: failing.api });
    const route = f.defineRoute({ api: "API-008", response: z.strictObject({}), handler: async () => ({}) });
    const res = await route(get("/api/review-queue"), noParams);
    expect(res.status).toBe(500);
    expect((await res.json()).error.id).toBe("E-021");
  });

  it("is installed as the default API and page hook", async () => {
    const shared = await import("@/app/api/_shared/index");
    const source = (await import("node:fs")).readFileSync("src/app/api/_shared/index.ts", "utf8");
    expect(typeof shared.defineRoute).toBe("function");
    expect(source).toMatch(/createRouteFactory\(\{ resolvePrincipal, auditDenied: auditAccessDenied, logger \}\)/);
    const guard = (await import("node:fs")).readFileSync("src/server/auth/require-role.ts", "utf8");
    expect(guard).toMatch(/let pageAuditDenied: PageAuditDenied \| null = auditPageDenied;/);
  });
});
