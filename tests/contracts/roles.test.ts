import { describe, expect, it } from "vitest";
import * as client from "@/contracts";
import {
  adminCaseViewSchema,
  caseListResponseSchema,
  createFoundResponseSchema,
  createMissingResponseSchema,
  officerCaseViewSchema,
  ownerCaseViewSchema,
  reviewQueueResponseSchema,
  staffOwnCaseViewSchema,
} from "@/contracts";
import * as server from "@/contracts/server";
import {
  API_ACCESS,
  canCall,
  canIntake,
  effectiveRole,
  parentPrincipal,
  projectCandidateFor,
  projectCaseFor,
  projectCaseListFor,
  projectQueueFor,
  toRematchResponse,
  userPrincipal,
  type ApiId,
  type CaseRow,
  type Principal,
} from "@/contracts/server";
import {
  IDS,
  PRINCIPALS,
  exampleCreateFoundResponse,
  exampleCreateMissingResponse,
  exampleFoundRow,
  exampleMissingRow,
  exampleOfficerMissingView,
  exampleReviewQueueResponse,
} from "@/contracts/examples";

const { parent, otherParent, staff, officer, admin } = PRINCIPALS;
const otherStaff: Principal = { ...staff, userId: IDS.adminUser };
// Same account as the found report creator, but with the officer role unverified.
const unverifiedOfficer: Principal = { ...officer, userId: IDS.staffUser, verified: false };
const inactiveOfficer: Principal = { ...officer, isActive: false };

const ctx = { districtNameBn: "[MOCK] জেলা ২৬", duplicateOf: [] };
const candidateInput = {
  candidateId: IDS.candidate,
  missing: { row: exampleMissingRow, ctx },
  found: { row: exampleFoundRow, ctx },
  score: 87,
  components: { cosine: 0.82, name: null },
  explanationVersion: "v1",
  qualified: true,
};

// Identifying values of a report (payload only; id/ref are metadata some views carry).
const payload = (row: CaseRow) =>
  [row.child_name, row.child_name_latin, row.contact_phone, row.raw_text, row.place_text, row.clothing, row.circumstances].filter(
    (v): v is string => typeof v === "string",
  );
const identifying = (row: CaseRow) => [...payload(row), row.id, row.ref_code];
const candidateMarkers = [IDS.candidate, "candidate", "score", "similarity", "components"];

it("the example reports share no identifying value (precondition for leak tests)", () => {
  const found = identifying(exampleFoundRow);
  for (const v of identifying(exampleMissingRow)) expect(found).not.toContain(v);
});

describe("principals are built from database rows (B6)", () => {
  const now = Date.parse("2026-10-13T10:00:00+06:00");

  it("parent session must be valid, unexpired and unrevoked", () => {
    const session = { id: IDS.parentSession, expires_at: "2026-11-12T10:00:00+06:00", revoked_at: null };
    expect(parentPrincipal(session, now)).toEqual({ kind: "parent", sessionId: IDS.parentSession });
    expect(parentPrincipal({ ...session, expires_at: "2026-10-13T09:59:59+06:00" }, now)).toBeNull();
    expect(parentPrincipal({ ...session, revoked_at: "2026-10-12T00:00:00+06:00" }, now)).toBeNull();
    expect(parentPrincipal({ ...session, id: "not-a-uuid" }, now)).toBeNull();
    expect(parentPrincipal(null, now)).toBeNull();
  });

  it("user principal keeps verified only for officers and lowercases the id", () => {
    expect(userPrincipal({ id: IDS.staffUser.toUpperCase(), role: "staff", verified: true, is_active: true })).toEqual({
      kind: "user",
      userId: IDS.staffUser,
      role: "staff",
      verified: false,
      isActive: true,
    });
    expect(userPrincipal({ id: "", role: "officer", verified: true, is_active: true })).toBeNull();
  });

  it("malformed principal ids never match a row with null owners", () => {
    const broken = { kind: "parent", sessionId: undefined } as unknown as Principal;
    expect(effectiveRole(broken)).toBeNull();
    expect(projectCaseFor(broken, { ...exampleMissingRow, reporter_session_id: null }, ctx)).toBeNull();
    const brokenStaff = { ...staff, userId: undefined } as unknown as Principal;
    expect(projectCaseFor(brokenStaff, { ...exampleFoundRow, created_by_user_id: null }, ctx)).toBeNull();
  });
});

describe("BR-007/024 role projections (FV-04)", () => {
  it("unverified officer has staff permissions; inactive accounts have none", () => {
    expect(effectiveRole(unverifiedOfficer)).toBe("staff");
    expect(effectiveRole(officer)).toBe("officer");
    expect(effectiveRole(inactiveOfficer)).toBeNull();
    expect(effectiveRole(null)).toBeNull();
  });

  it("parent reads only the own missing report (TC-045)", () => {
    const own = projectCaseFor(parent, exampleMissingRow, ctx);
    expect(own?.view).toBe("owner");
    expect(projectCaseFor(otherParent, exampleMissingRow, ctx)).toBeNull();
    expect(projectCaseFor(parent, exampleFoundRow, ctx)).toBeNull();
    const text = JSON.stringify(own);
    for (const v of identifying(exampleFoundRow)) expect(text).not.toContain(v);
    for (const marker of candidateMarkers) expect(text).not.toContain(marker);
  });

  it("owner payload is editable before lock and withheld after lock (BR-025)", () => {
    const view = (row: CaseRow) => projectCaseFor(parent, row, ctx)?.data;
    expect(view(exampleMissingRow)).toMatchObject({ editable: true, draft: { kind: "missing" } });
    for (const status of ["confirmed", "closed"] as const) {
      expect(view({ ...exampleMissingRow, status, closed_at: status === "closed" ? exampleMissingRow.updated_at : null })).toMatchObject({
        editable: false,
        draft: null,
      });
    }
  });

  it("redacted reports show no payload to owner or staff, including a referred found report", () => {
    const redactedMissing: CaseRow = {
      ...exampleMissingRow,
      status: "closed",
      closed_at: "2026-10-12T21:00:00+06:00",
      outcome: "coordination_recorded",
      anonymised_at: "2026-10-12T22:00:00+06:00",
      child_name: null,
      child_name_latin: null,
      contact_phone: null,
      raw_text: null,
      place_text: null,
      clothing: null,
      provenance: {},
    };
    // Redaction clears reporter_session_id, so the owner can no longer read it at all.
    expect(projectCaseFor(parent, { ...redactedMissing, reporter_session_id: null }, ctx)).toBeNull();
    // Even with the session still set, the view withholds the payload.
    expect(projectCaseFor(parent, redactedMissing, ctx)?.data).toMatchObject({ editable: false, draft: null });

    const referred: CaseRow = { ...exampleFoundRow, status: "referred", closed_at: "2026-10-12T20:30:00+06:00" };
    expect(projectCaseFor(staff, referred, ctx)?.data).toMatchObject({ status: "referred", draft: null });
    const redactedFound: CaseRow = { ...referred, anonymised_at: "2026-10-12T22:00:00+06:00" };
    const text = JSON.stringify(projectCaseFor(staff, redactedFound, ctx));
    for (const v of payload(exampleFoundRow)) expect(text).not.toContain(v);
  });

  it("staff and unverified officer read only their own found report, never candidates (TC-022)", () => {
    for (const p of [staff, unverifiedOfficer]) {
      const own = projectCaseFor(p, exampleFoundRow, ctx);
      expect(own?.view).toBe("staff_own");
      expect(Object.keys(own!.data).sort()).toEqual(Object.keys(staffOwnCaseViewSchema.shape).sort());
      const text = JSON.stringify(own);
      for (const v of identifying(exampleMissingRow)) expect(text).not.toContain(v);
      for (const marker of candidateMarkers) expect(text).not.toContain(marker);
      expect(projectCaseFor(p, exampleMissingRow, ctx)).toBeNull();
      expect(projectCandidateFor(p, candidateInput)).toBeNull();
      expect(projectQueueFor(p, [], null)).toBeNull();
      expect(projectCaseListFor(p, [], null)).toBeNull();
    }
    expect(projectCaseFor(otherStaff, exampleFoundRow, ctx)).toBeNull();
  });

  it("admin gets metadata only: no child payload, contact, candidate or score (TC-044)", () => {
    for (const row of [exampleMissingRow, exampleFoundRow]) {
      const view = projectCaseFor(admin, row, ctx);
      expect(view?.view).toBe("admin");
      expect(Object.keys(view!.data).sort()).toEqual(
        ["anonymised_at", "district_code", "id", "is_synthetic", "kind", "ref_code", "status"].sort(),
      );
      const text = JSON.stringify(view);
      for (const v of payload(row)) expect(text).not.toContain(v);
      for (const marker of candidateMarkers) expect(text).not.toContain(marker);
    }
    expect(projectCandidateFor(admin, candidateInput)).toBeNull();
    expect(projectQueueFor(admin, [], null)).toBeNull();
    expect(projectCaseListFor(admin, [], null)).toBeNull();
    expect(Object.keys(toRematchResponse(exampleMissingRow)).sort()).toEqual(["case_id", "matching_state"]);
  });

  it("only an active verified officer gets the operational and candidate views", () => {
    expect(projectCaseFor(officer, exampleMissingRow, ctx)).toMatchObject({ view: "officer", contactServed: true });
    expect(projectCandidateFor(officer, candidateInput)?.identity_probability).toBe(false);
    expect(projectCaseFor(inactiveOfficer, exampleMissingRow, ctx)).toBeNull();
    expect(projectCandidateFor(inactiveOfficer, candidateInput)).toBeNull();
    expect(projectCaseFor(null, exampleMissingRow, ctx)).toBeNull();
  });

  it("officer list and queue rows carry the masked phone only (B4)", () => {
    const list = projectCaseListFor(officer, [{ row: exampleMissingRow, ctx }], null)!;
    expect(list.cases[0]).toMatchObject({ contact_phone: null, contact_phone_masked: "017••••••01" });
    const queueText = JSON.stringify(exampleReviewQueueResponse);
    for (const phone of [exampleMissingRow.contact_phone!, exampleFoundRow.contact_phone!]) expect(queueText).not.toContain(phone);
    expect(caseListResponseSchema.safeParse({ cases: [exampleOfficerMissingView], next_cursor: null }).success).toBe(false);
  });

  it("queue keeps qualified candidates only, by rank, at most five", () => {
    const base = { score: 50, reasonBn: "সিনথেটিক", reasonEn: "synthetic", components: {}, counterpart: exampleFoundRow, counterpartCtx: ctx };
    const ranks = [5, 3, 1, 2, 4, 5, 4];
    const candidates = ranks.map((rank, i) => ({
      ...base,
      candidateId: `6b1f3c2a-4d5e-4f60-8a71-00000000c0${i}0`,
      rank,
      qualified: i !== 3, // rank 2 is not qualified
    }));
    const queue = projectQueueFor(officer, [{ row: exampleMissingRow, ctx, candidates }], null)!;
    expect(queue.items[0].candidates.map((c) => c.rank)).toEqual([1, 3, 4, 4, 5]);
    const item = exampleReviewQueueResponse.items[0];
    const unqualified = { ...item, candidates: [{ ...item.candidates[0], qualified: false }] };
    expect(reviewQueueResponseSchema.safeParse({ ...exampleReviewQueueResponse, items: [unqualified] }).success).toBe(false);
  });

  it("officer view carries the comparison fields and is synthetic-only (CN-05, CN-08)", () => {
    const view = projectCaseFor(officer, exampleFoundRow, ctx)!.data as Record<string, unknown> & { event: object; child: object };
    expect(view.event).toMatchObject({ circumstances: exampleFoundRow.circumstances });
    expect(view.child).toHaveProperty("name_latin");
    expect(view).toHaveProperty("reporter_relation");
    expect(officerCaseViewSchema.safeParse({ ...exampleOfficerMissingView, is_synthetic: false }).success).toBe(false);
  });

  it("views reject kind/status/ref/status_group mismatches (D19)", () => {
    const v = exampleOfficerMissingView;
    expect(officerCaseViewSchema.safeParse({ ...v, status: "referred" }).success).toBe(false);
    expect(officerCaseViewSchema.safeParse({ ...v, ref_code: "F-7K2Q9A" }).success).toBe(false);
    expect(officerCaseViewSchema.safeParse({ ...v, status_group: "closed" }).success).toBe(false);
    const adminView = projectCaseFor(admin, exampleFoundRow, ctx)!.data;
    expect(adminCaseViewSchema.safeParse({ ...adminView, status: "confirmed" }).success).toBe(false);
    expect(() => projectCaseFor(officer, { ...exampleFoundRow, status: "closed" }, ctx)).toThrow();
  });

  it("strict view schemas reject any extra field", () => {
    const owner = projectCaseFor(parent, exampleMissingRow, ctx)!.data;
    expect(ownerCaseViewSchema.safeParse({ ...owner, contact_phone: "01700000001" }).success).toBe(false);
    expect(ownerCaseViewSchema.safeParse({ ...owner, candidates: [] }).success).toBe(false);
    const adminView = projectCaseFor(admin, exampleMissingRow, ctx)!.data;
    expect(adminCaseViewSchema.safeParse({ ...adminView, score: 87 }).success).toBe(false);
    expect(adminCaseViewSchema.safeParse({ ...adminView, child_name: "x" }).success).toBe(false);
    expect(createMissingResponseSchema.safeParse({ ...exampleCreateMissingResponse, candidates: [] }).success).toBe(false);
    expect(createFoundResponseSchema.safeParse({ ...exampleCreateFoundResponse, candidates: [] }).success).toBe(false);
  });

  it("barrels: no unrestricted CaseView; projections are server-only; detail mappers are private", () => {
    expect(Object.keys(client).filter((k) => /^caseView/i.test(k))).toEqual([]);
    for (const name of ["projectCaseFor", "canCall", "classifySubmission", "intakeDraftMetadataSchema", "canonicalJson"]) {
      expect(name in client).toBe(false);
      expect(name in server).toBe(true);
    }
    for (const name of ["toOfficerCaseView", "toOwnerCaseView", "toAdminCaseView", "toStaffOwnCaseView"]) expect(name in server).toBe(false);
  });
});

describe("D2A §9.2 permission matrix", () => {
  const all = Object.keys(API_ACCESS) as ApiId[];

  it("candidate review, decision, closure and case list are verified-officer only", () => {
    for (const api of ["API-008", "API-009", "API-010", "API-011", "API-022", "API-023"] as const) {
      expect(canCall(api, officer)).toBe(true);
      for (const p of [parent, staff, unverifiedOfficer, admin, inactiveOfficer, null]) expect(canCall(api, p)).toBe(false);
    }
  });

  it("admin never decides, closes or reads candidates; parents never reach desk routes", () => {
    const adminAllowed = all.filter((api) => canCall(api, admin)).sort();
    expect(adminAllowed).toEqual(["API-004", "API-012", "API-013", "API-014", "API-015", "API-016", "API-017", "API-019", "API-020", "API-021"]);
    const parentAllowed = all.filter((api) => canCall(api, parent)).sort();
    expect(parentAllowed).toEqual(["API-001", "API-002", "API-003", "API-004", "API-005", "API-006", "API-018", "API-019", "API-020"]);
  });

  it("only health and auth are public", () => {
    expect(all.filter((api) => canCall(api, null)).sort()).toEqual(["API-019", "API-020"]);
  });

  it("intake kind: parent missing only, staff/officer found only (B5)", () => {
    expect([canIntake(parent, "missing"), canIntake(parent, "found")]).toEqual([true, false]);
    for (const p of [staff, unverifiedOfficer, officer]) expect([canIntake(p, "missing"), canIntake(p, "found")]).toEqual([false, true]);
    for (const p of [admin, inactiveOfficer, null]) expect([canIntake(p, "missing"), canIntake(p, "found")]).toEqual([false, false]);
  });
});
