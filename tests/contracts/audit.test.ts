import { describe, expect, it } from "vitest";
import {
  ADMIN_AUDIT_DETAIL_KEYS,
  OFFICER_AUDIT_DETAIL_KEYS,
  adminAuditEntryViewSchema,
  officerAuditEntryViewSchema,
  projectAuditFor,
  type Principal,
} from "@/contracts";
import { IDS, REFS, exampleAdminAuditResponse, exampleAuditRows, exampleOfficerAuditResponse } from "@/contracts/examples";

const officer: Principal = { kind: "user", userId: IDS.officerUser, role: "officer", verified: true, isActive: true };
const unverifiedOfficer: Principal = { ...officer, verified: false };
const admin: Principal = { kind: "user", userId: IDS.adminUser, role: "admin", verified: false, isActive: true };
const staff: Principal = { kind: "user", userId: IDS.staffUser, role: "staff", verified: false, isActive: true };
const parent: Principal = { kind: "parent", sessionId: IDS.parentSession };

const officerEntry = exampleOfficerAuditResponse.entries[0];
const adminEntry = exampleAdminAuditResponse.entries[0];
const withDetails = <T extends { details: object }>(e: T, details: object) => ({ ...e, details: { ...e.details, ...details } });

const FREE_TEXT = [
  { note: "মা বাস টার্মিনালে খুঁজছেন" }, // Bangla note under an unknown key
  { ref_code: "মিতু" }, // Bangla name in a typed key
  { ref_code: "01700000001" }, // phone in a typed key
  { outcome: "returned to mother" },
  { error_id: "free text" },
  { mode: "anything" },
];

describe("API-013 safe audit views (D2A §9.2, BR-010/024)", () => {
  it("only verified officers and admins get an audit view", () => {
    expect(projectAuditFor(officer, exampleAuditRows)?.view).toBe("officer");
    expect(projectAuditFor(admin, exampleAuditRows)?.view).toBe("admin");
    for (const p of [unverifiedOfficer, staff, parent, null]) expect(projectAuditFor(p, exampleAuditRows)).toBeNull();
  });

  it("admin view drops actor identity, candidate IDs, scores, pair refs and decision detail", () => {
    expect(Object.keys(adminEntry).sort()).toEqual(["action", "actor_role", "at", "details"]);
    const text = JSON.stringify(exampleAdminAuditResponse);
    for (const leak of [IDS.candidate, IDS.officerUser, REFS.found, "[MOCK] কর্মকর্তা", "score", "candidate", "missing_ref", "found_ref", "decision"]) {
      expect(text).not.toContain(leak);
    }
    expect(adminEntry.details).toEqual({ ref_code: REFS.missing, referral_simulated: true, reason_recorded: false });
  });

  it("officer view keeps the operational pair detail", () => {
    expect(officerEntry.details).toMatchObject({ candidate_id: IDS.candidate, score: 87, missing_ref: REFS.missing, found_ref: REFS.found });
    expect(officerEntry.actor_id).toBe(IDS.officerUser);
  });

  it.each([
    ["a phone", { ref_code: "01700000001" }],
    ["a Bangla note", { note: "সিনথেটিক নোট" }],
    ["a score key", { score: 87 }],
    ["a candidate_id", { candidate_id: IDS.candidate }],
    ["a pair reference", { found_ref: REFS.found }],
  ])("admin entry rejects %s", (_, details) => {
    expect(adminAuditEntryViewSchema.safeParse(withDetails(adminEntry, details)).success).toBe(false);
  });

  it("admin entry rejects actor identity", () => {
    expect(adminAuditEntryViewSchema.safeParse({ ...adminEntry, actor_id: IDS.officerUser }).success).toBe(false);
    expect(adminAuditEntryViewSchema.safeParse({ ...adminEntry, actor_display: "[MOCK] কর্মকর্তা" }).success).toBe(false);
  });

  it.each(FREE_TEXT.map((d) => [JSON.stringify(d), d] as const))("both views reject free text %s", (_, details) => {
    expect(officerAuditEntryViewSchema.safeParse(withDetails(officerEntry, details)).success).toBe(false);
    expect(adminAuditEntryViewSchema.safeParse(withDetails(adminEntry, details)).success).toBe(false);
  });

  it("officer actor display cannot carry a phone or long number; action stays a code", () => {
    for (const actor_display of ["কর্মকর্তা 01700000001", "Officer ০১৭০০০০০০০১", "Officer 12345"]) {
      expect(officerAuditEntryViewSchema.safeParse({ ...officerEntry, actor_display }).success).toBe(false);
    }
    expect(officerAuditEntryViewSchema.safeParse({ ...officerEntry, action: "match.confirm by Karim" }).success).toBe(false);
  });

  it("projection fails closed on an unsafe stored value and drops unknown keys", () => {
    const leaked = [{ ...exampleAuditRows[1], details: { ...exampleAuditRows[1].details, ref_code: "01700000001" } }];
    expect(() => projectAuditFor(admin, leaked)).toThrow();
    expect(() => projectAuditFor(officer, leaked)).toThrow();
    const extra = [{ ...exampleAuditRows[1], details: { ...exampleAuditRows[1].details, note: "সিনথেটিক নোট", phone: "01700000001" } }];
    expect(JSON.stringify(projectAuditFor(officer, extra))).not.toMatch(/নোট|01700000001/);
    expect(JSON.stringify(projectAuditFor(admin, extra))).not.toMatch(/নোট|01700000001/);
  });

  it("parent actors never get a display name", () => {
    const rows = [{ ...exampleAuditRows[1], actor_type: "parent" as const, actor_user_id: null, actor_session_id: IDS.parentSession, actor_display: "মিতুর মা" }];
    expect(projectAuditFor(officer, rows)?.entries[0]).toMatchObject({ actor_role: "parent", actor_id: null, actor_display: null });
  });

  it("admin keys are a strict subset of officer keys", () => {
    for (const key of ADMIN_AUDIT_DETAIL_KEYS) expect(OFFICER_AUDIT_DETAIL_KEYS).toContain(key);
    for (const key of ["candidate_id", "score", "rank", "missing_ref", "found_ref", "decision"]) expect(ADMIN_AUDIT_DETAIL_KEYS).not.toContain(key);
  });
});
