import { describe, expect, it } from "vitest";
import {
  FOUND_COUNT_CATEGORY,
  LIMITS,
  MISSING_COUNT_CATEGORY,
  REFERRAL_RECORDED_LABEL,
  canonicalJson,
  caseDraftSchema,
  classifySubmission,
  closeCaseRequestSchema,
  createFoundRequestSchema,
  createMissingRequestSchema,
  dashboardStatsResponseSchema,
  decisionRequestSchema,
  decisionResponseSchema,
  duplicateDecisionAllowed,
  duplicateDecisionRequestSchema,
  extractRequestSchema,
  extractResponseSchema,
  missingSubmissionDraftSchema,
  normalisePhone,
  transcribeResponseSchema,
  updateCaseRequestSchema,
  type FoundStatus,
  type MissingStatus,
} from "@/contracts";
import {
  EXAMPLES,
  exampleConfirmDecisionRequest,
  exampleConfirmDecisionResponse,
  exampleCreateFoundRequest,
  exampleCreateMissingRequest,
  exampleDashboardStatsResponse,
  exampleExtractResponse,
  exampleFoundDraft,
  exampleMissingDraft,
  exampleRejectDecisionRequest,
} from "@/contracts/examples";

const paths = (r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  [...new Set((r.error?.issues ?? []).map((i) => i.path.join(".")))].sort();

const missing = (patch: (d: typeof exampleMissingDraft) => unknown) => ({
  ...exampleCreateMissingRequest,
  draft: patch(structuredClone(exampleMissingDraft)),
});

describe("TASK-061 examples", () => {
  it.each(EXAMPLES.map((e) => [`${e.api} ${e.name}`, e] as const))("%s parses with its schema", (_, e) => {
    const result = e.schema.safeParse(e.value);
    expect(result.error?.issues ?? []).toEqual([]);
  });

  it("covers every API-001–API-023 endpoint", () => {
    const apis = new Set(EXAMPLES.map((e) => e.api));
    for (let n = 1; n <= 23; n++) expect(apis.has(`API-${String(n).padStart(3, "0")}`)).toBe(true);
  });

  it("uses only fake 11-digit 01X00000000 phone numbers", () => {
    const phones = JSON.stringify(EXAMPLES.map((e) => e.value)).match(/01[0-9]{9}/g) ?? [];
    expect(phones.length).toBeGreaterThan(0);
    for (const phone of phones) expect(phone).toMatch(/^01[0-9]0{7}[0-9]$/);
  });
});

describe("BR-004 review before submit", () => {
  it("rejects submission without confirmed: true", () => {
    for (const confirmed of [undefined, false, "true", 1]) {
      expect(createMissingRequestSchema.safeParse({ ...exampleCreateMissingRequest, confirmed }).success).toBe(false);
      expect(createFoundRequestSchema.safeParse({ ...exampleCreateFoundRequest, confirmed }).success).toBe(false);
    }
    expect(updateCaseRequestSchema.safeParse({ draft: exampleMissingDraft, expected_version: 1 }).success).toBe(false);
  });

  it("requires a client submission UUID", () => {
    expect(createMissingRequestSchema.safeParse({ ...exampleCreateMissingRequest, client_submission_id: "abc" }).success).toBe(false);
  });

  it("strips client-supplied authority from requests", () => {
    const parsed = createMissingRequestSchema.parse({
      ...exampleCreateMissingRequest,
      reporter_session_id: "attacker",
      is_synthetic: false,
      source: "public_import",
    });
    expect(Object.keys(parsed).sort()).toEqual(["client_submission_id", "confirmed", "draft", "draft_token"]);
  });
});

describe("BR-015/016 submission fields", () => {
  it("TC-030: age 19, future time, phone 0171, district XYZ give four field paths", () => {
    const future = "2099-01-01T10:00:00+06:00";
    const result = createMissingRequestSchema.safeParse(
      missing((d) => ({
        ...d,
        child: { ...d.child, age_years: 19, age_min: null, age_max: null },
        event: { ...d.event, at: future, at_lower: future, at_upper: future, at_approx: false, district_code: "XYZ" },
        reporter: { ...d.reporter, phone: "0171" },
      })),
    );
    expect(result.success).toBe(false);
    expect(paths(result)).toEqual(["draft.child.age_years", "draft.event.at", "draft.event.district_code", "draft.reporter.phone"]);
  });

  it("missing: exact age or complete range within 0–17", () => {
    const parse = (child: object) =>
      missingSubmissionDraftSchema.safeParse({ ...exampleMissingDraft, child: { ...exampleMissingDraft.child, ...child } });
    expect(parse({ age_years: 0, age_min: 0, age_max: 0 }).success).toBe(true);
    expect(parse({ age_years: null, age_min: 5, age_max: 9 }).success).toBe(true);
    expect(parse({ age_years: null, age_min: 15, age_max: 18 }).success).toBe(false);
    expect(parse({ age_years: null, age_min: null, age_max: null }).success).toBe(false);
    expect(parse({ age_years: null, age_min: 5, age_max: null }).success).toBe(false);
    expect(parse({ age_years: null, age_min: 9, age_max: 5 }).success).toBe(false);
    expect(parse({ age_years: 7, age_min: 6, age_max: 8 }).success).toBe(false); // conflicting exact age
  });

  it("missing: exact age is stored as age_min = age_max = age_years", () => {
    const parsed = missingSubmissionDraftSchema.parse({
      ...exampleMissingDraft,
      child: { ...exampleMissingDraft.child, age_years: 7, age_min: null, age_max: null },
    });
    expect(parsed.child).toMatchObject({ age_years: 7, age_min: 7, age_max: 7 });
  });

  it("found: age may be unknown; estimated bounds may reach 25", () => {
    const parse = (child: object) =>
      createFoundRequestSchema.safeParse({
        ...exampleCreateFoundRequest,
        draft: { ...exampleFoundDraft, child: { ...exampleFoundDraft.child, ...child } },
      });
    expect(parse({ age_years: null, age_min: null, age_max: null }).success).toBe(true);
    expect(parse({ age_years: null, age_min: 14, age_max: 25 }).success).toBe(true);
    expect(parse({ age_years: null, age_min: 14, age_max: 26 }).success).toBe(false);
    expect(parse({ age_years: 18, age_min: 18, age_max: 18 }).success).toBe(false); // age_years column is 0–17
  });

  it("found: requires a description", () => {
    const result = createFoundRequestSchema.safeParse({
      ...exampleCreateFoundRequest,
      draft: {
        ...exampleFoundDraft,
        child: { ...exampleFoundDraft.child, clothing: null, marks: null },
        event: { ...exampleFoundDraft.event, circumstances: " " },
        evidence: {},
      },
    });
    expect(paths(result)).toEqual(["draft.event.circumstances"]);
  });

  it("phone: normalised digits, 11 starting 01", () => {
    expect(normalisePhone("০১৭০০-০০০০ ০১")).toBe("01700000001");
    const parse = (phone: string) =>
      missingSubmissionDraftSchema.safeParse({ ...exampleMissingDraft, reporter: { relation: null, phone } });
    expect(parse("০১৭০০০০০০০১").data?.reporter.phone).toBe("01700000001");
    for (const bad of ["0171", "02700000001", "017000000012", "+8801700000001"]) expect(parse(bad).success).toBe(false);
  });

  it("district: internal code 1–64 is required", () => {
    const parse = (district_code: unknown) =>
      missingSubmissionDraftSchema.safeParse({ ...exampleMissingDraft, event: { ...exampleMissingDraft.event, district_code } });
    expect(parse(1).success).toBe(true);
    expect(parse(64).success).toBe(true);
    for (const bad of [0, 65, null, 12.5, "26"]) expect(parse(bad).success).toBe(false);
  });

  it("place: non-empty last-seen place is required", () => {
    const parse = (place_text: unknown) =>
      missingSubmissionDraftSchema.safeParse({ ...exampleMissingDraft, event: { ...exampleMissingDraft.event, place_text } });
    expect(parse("   ").success).toBe(false);
    expect(parse(null).success).toBe(false);
  });

  it("event interval: present, ordered, consistent and not in the future", () => {
    const parse = (event: object) =>
      paths(missingSubmissionDraftSchema.safeParse({ ...exampleMissingDraft, event: { ...exampleMissingDraft.event, ...event } }));
    expect(parse({})).toEqual([]);
    expect(parse({ at_lower: null })).toEqual(["event.at_lower"]);
    expect(parse({ at_lower: "2026-10-12T19:00:00+06:00", at_upper: "2026-10-12T18:00:00+06:00" })).toEqual(["event.at_upper"]);
    expect(parse({ at: "2026-10-12T12:00:00+06:00" })).toEqual(["event.at"]);
    expect(parse({ at_approx: false })).toEqual(["event.at_approx"]);
    expect(parse({ at_upper: "2099-01-01T00:00:00+06:00" })).toEqual(["event.at_upper"]);
    expect(parse({ at: "2026-10-12 16:00" })).toEqual(["event.at"]);
  });

  it("evidence quotes must match source_text spans", () => {
    const evidence = { ...exampleMissingDraft.evidence, "child.name": { quote: "মিতু", start_utf16: 0, end_utf16: 4, derivation: "direct" } };
    expect(paths(caseDraftSchema.safeParse({ ...exampleMissingDraft, evidence }))).toEqual(["evidence.child.name"]);
    expect(caseDraftSchema.safeParse({ ...exampleMissingDraft, evidence: { "child.favourite": evidence["child.name"] } }).success).toBe(false);
  });
});

describe("BR-023 / FV-05 draft token, counters and idempotency", () => {
  it("CaseDraft carries no token, counter or session metadata", () => {
    for (const extra of [{ draft_token: "syn.draft.v1.c3ludGhldGljLWRyYWZ0" }, { ai_calls_used: 0 }, { session_id: "x" }]) {
      expect(caseDraftSchema.safeParse({ ...exampleMissingDraft, ...extra }).success).toBe(false);
    }
  });

  it("server-owned call count is capped at six per draft (TC-043)", () => {
    expect(extractResponseSchema.safeParse({ ...exampleExtractResponse, ai_calls_used: LIMITS.aiCallsPerDraft }).success).toBe(true);
    expect(extractResponseSchema.safeParse({ ...exampleExtractResponse, ai_calls_used: 7 }).success).toBe(false);
    expect(transcribeResponseSchema.safeParse({ ...exampleExtractResponse, ai_calls_used: 7 }).success).toBe(false);
  });

  it("typed intake text is 20–2,000 characters; exactly one of text or answer", () => {
    expect(extractRequestSchema.safeParse({ kind: "missing", text: "ছোট লেখা" }).success).toBe(false);
    expect(extractRequestSchema.safeParse({ kind: "missing", text: "ক".repeat(2001) }).success).toBe(false);
    expect(extractRequestSchema.safeParse({ kind: "missing" }).success).toBe(false);
    expect(extractRequestSchema.safeParse({ kind: "missing", answer: "জেলা ২৬" }).success).toBe(false); // continuing needs draft + token
  });

  it("TC-042: same UUID + same hash replays, changed payload conflicts, new UUID creates", () => {
    const existing = { caseId: "case-1", payloadHash: "a".repeat(64) };
    expect(classifySubmission(existing, "a".repeat(64))).toEqual({ kind: "replay", caseId: "case-1" });
    expect(classifySubmission(existing, "b".repeat(64))).toEqual({ kind: "conflict" });
    expect(classifySubmission(null, "a".repeat(64))).toEqual({ kind: "create" });
  });

  it("canonical payload JSON is key-order independent and value sensitive", () => {
    const a = createMissingRequestSchema.parse(exampleCreateMissingRequest).draft;
    const reverse = (v: unknown): unknown =>
      v && typeof v === "object" && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reverse(x)]))
        : v;
    const reordered = reverse(a);
    expect(canonicalJson(reordered)).toBe(canonicalJson(a));
    expect(canonicalJson({ ...a, child: { ...a.child, marks: "দাগ" } })).not.toBe(canonicalJson(a));
  });
});

describe("BR-001/005/020 decisions and simulated referral (FV-01)", () => {
  it("reject needs a 3–500 character reason", () => {
    expect(decisionRequestSchema.safeParse({ ...exampleRejectDecisionRequest, reason: "না" }).success).toBe(false);
    expect(decisionRequestSchema.safeParse({ ...exampleRejectDecisionRequest, reason: "ক".repeat(501) }).success).toBe(false);
  });

  it("confirm needs both expected versions and every checklist item true", () => {
    expect(decisionRequestSchema.safeParse({ ...exampleConfirmDecisionRequest, expected_found_version: undefined }).success).toBe(false);
    expect(decisionRequestSchema.safeParse({ ...exampleConfirmDecisionRequest, expected_missing_version: 0 }).success).toBe(false);
    const checklist = {
      descriptions_reviewed: true,
      contradictions_reviewed: true,
      identity_not_proven_by_score: true,
      referral_is_simulated: true,
    };
    for (const key of Object.keys(checklist)) {
      const req = { ...exampleConfirmDecisionRequest, reviewer_checklist: { ...checklist, [key]: false } };
      expect(decisionRequestSchema.safeParse(req).success).toBe(false);
    }
  });

  it("ignores a client-supplied author", () => {
    const parsed = decisionRequestSchema.parse({ ...exampleConfirmDecisionRequest, officer_id: "attacker" });
    expect("officer_id" in parsed).toBe(false);
  });

  it("confirmation records a simulated referral and both endpoint states", () => {
    expect(decisionResponseSchema.safeParse({ ...exampleConfirmDecisionResponse, referral_is_simulated: false }).success).toBe(false);
    expect(decisionResponseSchema.safeParse({ ...exampleConfirmDecisionResponse, referral_id: null, referral_state: null }).success).toBe(false);
    expect(decisionResponseSchema.safeParse({ ...exampleConfirmDecisionResponse, found: { ref_code: "F-3D8W1Z", status: "open" } }).success).toBe(false);
    expect(REFERRAL_RECORDED_LABEL).toEqual({ bn: "রেফারেল নথিভুক্ত (সিমুলেশন)", en: "Referral recorded (simulation)" });
  });

  it("closure outcome is a coordination outcome with a reviewed note", () => {
    expect(closeCaseRequestSchema.safeParse({ outcome: "returned", note: "সিনথেটিক নোট", expected_version: 1 }).success).toBe(false);
    expect(closeCaseRequestSchema.safeParse({ outcome: "resolved_outside_fera", note: "", expected_version: 1 }).success).toBe(false);
  });

  it("FV-02: shared phone alone cannot confirm the same child", () => {
    expect(duplicateDecisionAllowed("same_phone", "confirmed_same")).toBe(false);
    expect(duplicateDecisionAllowed("same_phone", "dismissed")).toBe(true);
    expect(duplicateDecisionAllowed("profile", "confirmed_same")).toBe(true);
    expect(duplicateDecisionRequestSchema.safeParse({ status: "confirmed_same", reason: "একই বিবরণ" }).success).toBe(false);
  });
});

describe("BR-014 / FV-10 counts (TC-055)", () => {
  it("one pair lifecycle moves missing and found categories separately and counts the pair once", () => {
    const missingPath: MissingStatus[] = ["submitted", "open", "matched_pending_review", "confirmed", "closed"];
    const foundPath: FoundStatus[] = ["open", "matched_pending_review", "matched_pending_review", "referred", "referred"];
    const pairs = [0, 0, 0, 1, 1];
    const seen = missingPath.map((m, i) => [MISSING_COUNT_CATEGORY[m], FOUND_COUNT_CATEGORY[foundPath[i]], pairs[i]]);
    expect(seen).toEqual([
      ["open", "open", 0],
      ["open", "matched", 0],
      ["matched", "matched", 0],
      ["matched", "referral_recorded", 1],
      ["closed", "referral_recorded", 1],
    ]);
  });

  it("dashboard keeps all 64 districts and totals equal district sums", () => {
    const { districts } = exampleDashboardStatsResponse;
    expect(dashboardStatsResponseSchema.safeParse({ ...exampleDashboardStatsResponse, districts: districts.slice(1) }).success).toBe(false);
    expect(
      dashboardStatsResponseSchema.safeParse({
        ...exampleDashboardStatsResponse,
        totals: { ...exampleDashboardStatsResponse.totals, confirmed_pairs: 2 },
      }).success,
    ).toBe(false);
    expect(
      dashboardStatsResponseSchema.safeParse({ ...exampleDashboardStatsResponse, totals: { ...exampleDashboardStatsResponse.totals, unique_children: 1 } })
        .success,
    ).toBe(false);
  });
});
