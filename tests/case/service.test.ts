// TASK-015 case service, unit level with scripted pg fakes: submission idempotency
// classification (FR-031, TC-031/042), server-derived authority (BR-024), and the
// field-change and reference helpers. PostgreSQL behaviour is in tests/db/case.test.ts.
import { describe, expect, it } from "vitest";
import { ApiError } from "@/app/api/_shared";
import { REF_CODE_PATTERN, createFoundRequestSchema, createMissingRequestSchema, updateCaseRequestSchema } from "@/contracts";
import { IDS, exampleCreateFoundRequest, exampleCreateMissingRequest, exampleMissingRow, exampleUpdateCaseRequest } from "@/contracts/examples";
import { submissionPayloadHash } from "@/contracts/server";
import {
  changedFields,
  closeCase,
  createFoundCase,
  createMissingCase,
  decideCandidate,
  editMissingCase,
  newRefCode,
  openCase,
} from "@/server/case";
import { testParent, testUser } from "../support/principals";
import { fakePool, pgError, type Handler } from "./fakes";

const missingReq = createMissingRequestSchema.parse(exampleCreateMissingRequest);
const foundReq = createFoundRequestSchema.parse(exampleCreateFoundRequest);
const parent = testParent(IDS.parentSession);
const staff = testUser(IDS.staffUser, "staff");
const officer = testUser(IDS.officerUser, "officer", { verified: true });
const unverified = testUser(IDS.officerUser, "officer", { verified: false });
const admin = testUser(IDS.adminUser, "admin");
const missingHash = submissionPayloadHash(missingReq.draft);

const storedRow = (hash: string) => ({
  ...exampleMissingRow,
  status: "submitted",
  client_submission_id: missingReq.client_submission_id,
  submission_payload_hash: hash,
});

const audit: Handler = { match: /^INSERT INTO audit_log/, reply: () => [{ id: "1" }] };
const lookup = (rows: () => unknown[]): Handler => ({ match: /FROM cases WHERE (reporter_session_id|created_by_user_id) = \$1 AND client_submission_id = \$2/, reply: rows });
const insert = (rows: (values: unknown[]) => unknown[] | Error): Handler => ({ match: /^INSERT INTO cases/, reply: rows });

const errId = async (p: Promise<unknown>) => {
  const err = await p.then(() => null, (e: unknown) => e);
  return err instanceof ApiError ? err.id : err;
};

const auditActions = (db: ReturnType<typeof fakePool>) => db.sent(/^INSERT INTO audit_log/).map((c) => c.values[3]);

describe("createMissingCase idempotency (FR-031)", () => {
  it("creates a new submitted report for a new key, owned by the server-derived session", async () => {
    const db = fakePool([lookup(() => []), insert(() => [storedRow(missingHash)]), audit]);
    const out = await createMissingCase(parent, missingReq, { pool: db.pool });
    expect(out.replayed).toBe(false);
    const [ins] = db.sent(/^INSERT INTO cases/);
    expect(ins.text).toMatch(/ON CONFLICT \(reporter_session_id, client_submission_id\) DO NOTHING/);
    expect(ins.text).toMatch(/VALUES \(\$1, \$2, \$3, \$4, true,/); // is_synthetic is a literal, never input
    expect(ins.values.slice(1, 7)).toEqual(["missing", "submitted", "parent", IDS.parentSession, missingReq.client_submission_id, missingHash]);
    expect(String(ins.values[0])).toMatch(/^M-[0-9A-Z]{6}$/);
    expect(auditActions(db)).toEqual(["case.created"]);
    expect(db.sent(/^COMMIT$/)).toHaveLength(1);
  });

  it("replays the same report for the same key and hash, without a second insert", async () => {
    const db = fakePool([lookup(() => [storedRow(missingHash)]), audit]);
    const out = await createMissingCase(parent, missingReq, { pool: db.pool });
    expect(out).toMatchObject({ replayed: true, case: { id: IDS.missingCase } });
    expect(db.sent(/^INSERT INTO cases/)).toHaveLength(0);
    expect(auditActions(db)).toEqual(["case.submission_replayed"]);
    expect(JSON.parse(String(db.sent(/^INSERT INTO audit_log/)[0].values[6]))).toMatchObject({ replayed: true, api: "API-003" });
  });

  it("answers E-006 for the same key with a different payload, writing nothing", async () => {
    const db = fakePool([lookup(() => [storedRow("c".repeat(64))]), audit]);
    expect(await errId(createMissingCase(parent, missingReq, { pool: db.pool }))).toBe("E-006");
    expect(db.sent(/^INSERT/)).toHaveLength(0);
    expect(db.sent(/^ROLLBACK$/)).toHaveLength(1);
  });

  it("classifies against the concurrent winner when the scoped insert conflicts (TC-042)", async () => {
    let lookups = 0;
    const winnerHash = { value: missingHash };
    const db = fakePool([
      lookup(() => (++lookups === 1 ? [] : [storedRow(winnerHash.value)])),
      insert(() => []), // ON CONFLICT DO NOTHING: the other submit committed first
      audit,
    ]);
    const out = await createMissingCase(parent, missingReq, { pool: db.pool });
    expect(out.replayed).toBe(true);
    expect(lookups).toBe(2);

    lookups = 0;
    winnerHash.value = "d".repeat(64);
    const db2 = fakePool([lookup(() => (++lookups === 1 ? [] : [storedRow(winnerHash.value)])), insert(() => []), audit]);
    expect(await errId(createMissingCase(parent, missingReq, { pool: db2.pool }))).toBe("E-006");
  });

  it("retries a reference-code collision inside a savepoint", async () => {
    let inserts = 0;
    const db = fakePool([
      lookup(() => []),
      insert(() => (++inserts === 1 ? pgError("23505", "dup", { constraint: "cases_ref_code_key" }) : [storedRow(missingHash)])),
      audit,
    ]);
    const out = await createMissingCase(parent, missingReq, { pool: db.pool });
    expect(out.replayed).toBe(false);
    expect(inserts).toBe(2);
    expect(db.sent(/^ROLLBACK TO SAVEPOINT case_insert$/)).toHaveLength(1);
    const refs = db.sent(/^INSERT INTO cases/).map((c) => c.values[0]);
    expect(refs[0]).not.toBe(refs[1]);
  });

  it("maps an insert CHECK failure to E-001 (event.at_lower for the future-interval trigger)", async () => {
    const db = fakePool([lookup(() => []), insert(() => pgError("23514", "event interval starts in future")), audit]);
    const err = await createMissingCase(parent, missingReq, { pool: db.pool }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).id).toBe("E-001");
    expect((err as ApiError).fields).toEqual(["event.at_lower"]);
  });
});

describe("server-derived authority (BR-024)", () => {
  it("lets only a parent session create a missing report", async () => {
    for (const p of [staff, officer, unverified, admin]) {
      const db = fakePool([]);
      expect(await errId(createMissingCase(p, missingReq, { pool: db.pool }))).toBe("E-003");
      expect(db.connects).toBe(0);
    }
  });

  it("lets staff and officers (verified or not) create a found report under their own user ID, never parents or admins", async () => {
    for (const [p, actor] of [[staff, "staff"], [unverified, "staff"], [officer, "officer"]] as const) {
      const db = fakePool([lookup(() => []), insert(() => [{ ...exampleMissingRow, kind: "found", ref_code: "F-3D8W1Z", status: "open" }]), audit]);
      await createFoundCase(p, foundReq, { pool: db.pool });
      const [ins] = db.sent(/^INSERT INTO cases/);
      expect(ins.text).toMatch(/created_by_user_id, client_submission_id/);
      expect(ins.values.slice(1, 5)).toEqual(["found", "open", "staff", p.kind === "user" ? p.userId : null]);
      expect(db.sent(/^INSERT INTO audit_log/)[0].values[0]).toBe(actor);
    }
    for (const p of [parent, admin]) {
      const db = fakePool([]);
      expect(await errId(createFoundCase(p, foundReq, { pool: db.pool }))).toBe("E-003");
      expect(db.connects).toBe(0);
    }
  });

  it("refuses decisions and closure to anyone but an active verified officer before touching the database", async () => {
    const decision = { decision: "reject" as const, reason: "[MOCK] reason", expected_missing_version: 1, expected_found_version: 1 };
    const close = { outcome: "resolved_outside_fera" as const, note: "[MOCK] note", expected_version: 1 };
    const inactive = testUser(IDS.officerUser, "officer", { verified: true, isActive: false });
    for (const p of [parent, staff, unverified, admin, inactive]) {
      const db = fakePool([]);
      expect(await errId(decideCandidate(p, IDS.candidate, decision, { pool: db.pool }))).toBe("E-004");
      expect(await errId(closeCase(p, IDS.missingCase, close, { pool: db.pool }))).toBe("E-004");
      expect(db.connects).toBe(0);
    }
  });

  it("re-reads the officer inside the transaction: an officer revoked since sign-in gets E-004 and nothing is written", async () => {
    const db = fakePool([{ match: /FROM users WHERE id = \$1 AND role = 'officer' AND verified AND is_active FOR SHARE/, reply: () => [] }]);
    const decision = { decision: "reject" as const, reason: "[MOCK] reason", expected_missing_version: 1, expected_found_version: 1 };
    expect(await errId(decideCandidate(officer, IDS.candidate, decision, { pool: db.pool }))).toBe("E-004");
    expect(db.sent(/^INSERT/)).toHaveLength(0);
    expect(db.sent(/^ROLLBACK$/)).toHaveLength(1);
  });

  it("lets only the owning parent edit or open a missing report", async () => {
    const edit = updateCaseRequestSchema.parse(exampleUpdateCaseRequest);
    for (const p of [staff, officer, admin]) {
      const db = fakePool([]);
      expect(await errId(editMissingCase(p, IDS.missingCase, edit, { pool: db.pool }))).toBe("E-004");
      expect(await errId(openCase(p, IDS.missingCase, { pool: db.pool }))).toBe("E-003");
      expect(db.connects).toBe(0);
    }
    const other = testParent(IDS.otherParentSession);
    const db = fakePool([{ match: /^SELECT .* FROM cases WHERE id = \$1$/s, reply: () => [exampleMissingRow] }]);
    const err = await editMissingCase(other, IDS.missingCase, edit, { pool: db.pool }).catch((e: unknown) => e);
    expect((err as ApiError).id).toBe("E-004");
    expect((err as ApiError).caseId).toBe(IDS.missingCase); // the hidden case, for the denial audit FK
    expect(db.sent(/FOR UPDATE/)).toHaveLength(0);
  });
});

describe("helpers", () => {
  it("lists changed draft field paths only, comparing instants rather than strings", () => {
    const edit = updateCaseRequestSchema.parse(exampleUpdateCaseRequest);
    expect(changedFields(exampleMissingRow, edit.draft)).toEqual(["child.marks"]);
    const sameInstant = { ...exampleMissingRow, event_at: "2026-10-12T10:00:00.000Z" };
    expect(changedFields(sameInstant, edit.draft)).toEqual(["child.marks"]);
    const moved = { ...exampleMissingRow, district_code: 1, contact_phone: "01700000009" };
    expect(changedFields(moved, edit.draft)).toEqual(["child.marks", "event.district_code", "reporter.phone"]);
  });

  it("generates M-/F- reference codes in the SQL pattern", () => {
    for (let i = 0; i < 200; i++) {
      expect(newRefCode("missing")).toMatch(/^M-/);
      expect(newRefCode("found")).toMatch(REF_CODE_PATTERN);
    }
  });
});
