import { describe, expect, it } from "vitest";
import * as contracts from "@/contracts";
import {
  API_ACCESS,
  adminCaseViewSchema,
  canCall,
  createFoundResponseSchema,
  createMissingResponseSchema,
  effectiveRole,
  officerCaseViewSchema,
  ownerCaseViewSchema,
  reviewQueueResponseSchema,
  projectCandidateFor,
  projectCaseFor,
  staffOwnCaseViewSchema,
  toOwnerCaseView,
  toRematchResponse,
  type ApiId,
  type CaseRow,
  type Principal,
} from "@/contracts";
import {
  IDS,
  REFS,
  exampleCreateFoundResponse,
  exampleCreateMissingResponse,
  exampleFoundRow,
  exampleMissingRow,
  exampleOfficerFoundView,
  exampleOfficerMissingView,
  exampleReviewQueueResponse,
} from "@/contracts/examples";

const parent: Principal = { kind: "parent", sessionId: IDS.parentSession };
const otherParent: Principal = { kind: "parent", sessionId: IDS.otherParentSession };
const staff: Principal = { kind: "user", userId: IDS.staffUser, role: "staff", verified: false, isActive: true };
const otherStaff: Principal = { kind: "user", userId: IDS.adminUser, role: "staff", verified: false, isActive: true };
const unverifiedOfficer: Principal = { kind: "user", userId: IDS.staffUser, role: "officer", verified: false, isActive: true };
const officer: Principal = { kind: "user", userId: IDS.officerUser, role: "officer", verified: true, isActive: true };
const inactiveOfficer: Principal = { ...officer, isActive: false };
const admin: Principal = { kind: "user", userId: IDS.adminUser, role: "admin", verified: false, isActive: true };

const ctx = { districtNameBn: "[MOCK] জেলা ২৬", duplicateOf: [] };
const candidate = {
  candidateId: IDS.candidate,
  missing: exampleOfficerMissingView,
  found: exampleOfficerFoundView,
  score: 87,
  components: { cosine: 0.82, name: null },
  explanationVersion: "v1",
  qualified: true,
};

// Values that identify a child or the other party; none may reach a scoped view.
const sensitive = (row: CaseRow) =>
  [row.child_name, row.child_name_latin, row.contact_phone, row.raw_text, row.place_text, row.clothing].filter(
    (v): v is string => typeof v === "string",
  );
const candidateMarkers = [IDS.candidate, "candidate", "score", "similarity", "components"];

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
    for (const v of sensitive(exampleFoundRow).filter((v) => !sensitive(exampleMissingRow).includes(v))) expect(text).not.toContain(v);
    for (const marker of [...candidateMarkers, REFS.found, IDS.foundCase]) expect(text).not.toContain(marker);
  });

  it("owner payload is editable before lock and withheld after (TC-045, BR-025)", () => {
    expect(toOwnerCaseView(exampleMissingRow)).toMatchObject({ editable: true, draft: { kind: "missing" } });
    for (const status of ["confirmed", "closed"] as const) {
      const locked = toOwnerCaseView({ ...exampleMissingRow, status, closed_at: status === "closed" ? exampleMissingRow.updated_at : null });
      expect(locked).toMatchObject({ editable: false, draft: null });
    }
  });

  it("staff and unverified officer read only their own found report, never candidates (TC-022)", () => {
    for (const p of [staff, unverifiedOfficer]) {
      const own = projectCaseFor(p, exampleFoundRow, ctx);
      expect(own?.view).toBe("staff_own");
      expect(Object.keys(own!.data).sort()).toEqual(Object.keys(staffOwnCaseViewSchema.shape).sort());
      const text = JSON.stringify(own);
      for (const v of sensitive(exampleMissingRow).filter((v) => !sensitive(exampleFoundRow).includes(v))) expect(text).not.toContain(v);
      for (const marker of [...candidateMarkers, REFS.missing, IDS.missingCase]) expect(text).not.toContain(marker);
      expect(projectCaseFor(p, exampleMissingRow, ctx)).toBeNull();
      expect(projectCandidateFor(p, candidate)).toBeNull();
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
      for (const v of sensitive(row)) expect(text).not.toContain(v);
      for (const marker of candidateMarkers) expect(text).not.toContain(marker);
    }
    expect(projectCandidateFor(admin, candidate)).toBeNull();
    expect(Object.keys(toRematchResponse(exampleMissingRow)).sort()).toEqual(["case_id", "matching_state"]);
  });

  it("only an active verified officer gets the operational and candidate views", () => {
    expect(projectCaseFor(officer, exampleMissingRow, ctx)?.view).toBe("officer");
    expect(projectCandidateFor(officer, candidate)?.identity_probability).toBe(false);
    expect(projectCaseFor(inactiveOfficer, exampleMissingRow, ctx)).toBeNull();
    expect(projectCandidateFor(inactiveOfficer, candidate)).toBeNull();
    expect(projectCaseFor(null, exampleMissingRow, ctx)).toBeNull();
  });

  it("strict view schemas reject any extra field", () => {
    const owner = toOwnerCaseView(exampleMissingRow);
    expect(ownerCaseViewSchema.safeParse({ ...owner, contact_phone: "01700000001" }).success).toBe(false);
    expect(ownerCaseViewSchema.safeParse({ ...owner, candidates: [] }).success).toBe(false);
    const adminView = projectCaseFor(admin, exampleMissingRow, ctx)!.data;
    expect(adminCaseViewSchema.safeParse({ ...adminView, score: 87 }).success).toBe(false);
    expect(adminCaseViewSchema.safeParse({ ...adminView, child_name: "x" }).success).toBe(false);
    expect(createMissingResponseSchema.safeParse({ ...exampleCreateMissingResponse, candidates: [] }).success).toBe(false);
    expect(createFoundResponseSchema.safeParse({ ...exampleCreateFoundResponse, candidates: [] }).success).toBe(false);
  });

  it("officer view carries the comparison fields and is synthetic-only (CN-05, CN-08)", () => {
    const view = projectCaseFor(officer, exampleFoundRow, ctx)!.data as Record<string, unknown> & { event: object; child: object };
    expect(view.event).toMatchObject({ circumstances: exampleFoundRow.circumstances });
    expect(view.child).toHaveProperty("name_latin");
    expect(view).toHaveProperty("reporter_relation");
    expect(officerCaseViewSchema.safeParse({ ...exampleOfficerMissingView, is_synthetic: false }).success).toBe(false);
  });

  it("queue candidates are qualified only (API-008)", () => {
    const item = exampleReviewQueueResponse.items[0];
    const unqualified = { ...item, candidates: [{ ...item.candidates[0], qualified: false }] };
    expect(reviewQueueResponseSchema.safeParse({ ...exampleReviewQueueResponse, items: [unqualified] }).success).toBe(false);
  });

  it("exports no unrestricted CaseView", () => {
    expect(Object.keys(contracts).filter((k) => /^caseView/i.test(k))).toEqual([]);
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
});
