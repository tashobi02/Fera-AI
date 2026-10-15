// TASK-028 / TC-010 (confirm part) / TC-011: the S-010 comparison and decision-request logic.
// Synthetic data only; no database, no browser.
import { describe, expect, it } from "vitest";
import { decisionResponseSchema, type OfficerCaseView } from "@/contracts";
import { exampleCandidateDecisionView } from "@/contracts/examples";
import {
  buildConfirm, buildReject, candidateDecisionApi, classifyDecisionFailure, compareCases, componentEntries,
  emptyChecklist, requestDecision, summarise, CHECKLIST_KEYS, type Checklist,
} from "@/lib/match-review";

const view = exampleCandidateDecisionView;
const withChild = (c: OfficerCaseView, child: Partial<OfficerCaseView["child"]>, event: Partial<OfficerCaseView["event"]> = {}): OfficerCaseView => ({
  ...c, child: { ...c.child, ...child }, event: { ...c.event, ...event },
});
const row = (rows: ReturnType<typeof compareCases>, f: string) => rows.find((r) => r.field === f)!;
const full = (): Checklist => Object.fromEntries(CHECKLIST_KEYS.map((k) => [k, true])) as Checklist;

describe("compareCases", () => {
  it("gives a verdict only for structured fields and 'review' for free text and measurements", () => {
    const rows = compareCases(view.missing, view.found);
    expect(rows.map((r) => r.field)).toEqual(["sex", "age", "height", "district", "place", "time", "clothing", "marks", "circumstances"]);
    for (const f of ["height", "place", "time", "clothing", "marks", "circumstances"]) {
      expect(["review", "unknown"], f).toContain(row(rows, f).verdict);
    }
  });

  it("sex: agree, differ, or unknown when either side is unknown", () => {
    const m = withChild(view.missing, { sex: "male" });
    expect(row(compareCases(m, withChild(view.found, { sex: "male" })), "sex").verdict).toBe("agree");
    expect(row(compareCases(m, withChild(view.found, { sex: "female" })), "sex").verdict).toBe("differ");
    expect(row(compareCases(m, withChild(view.found, { sex: "unknown" })), "sex").verdict).toBe("unknown");
  });

  it("age: ranges that overlap agree, disjoint ranges differ, unknown stays unknown", () => {
    const base = { age_years: null };
    const m = withChild(view.missing, { ...base, age_min: 6, age_max: 9 });
    expect(row(compareCases(m, withChild(view.found, { ...base, age_min: 8, age_max: 12 })), "age").verdict).toBe("agree");
    expect(row(compareCases(m, withChild(view.found, { ...base, age_min: 10, age_max: 12 })), "age").verdict).toBe("differ");
    expect(row(compareCases(m, withChild(view.found, { age_years: null, age_min: null, age_max: null })), "age").verdict).toBe("unknown");
    expect(row(compareCases(withChild(view.missing, { age_years: 7, age_min: 7, age_max: 7 }), withChild(view.found, { ...base, age_min: 6, age_max: 8 })), "age").verdict).toBe("agree");
  });

  it("district: same code agrees, different differs, missing is unknown (never a hard filter)", () => {
    const m = withChild(view.missing, {}, { district_code: 14, district_name_bn: "ঢাকা" });
    expect(row(compareCases(m, withChild(view.found, {}, { district_code: 14, district_name_bn: "ঢাকা" })), "district").verdict).toBe("agree");
    expect(row(compareCases(m, withChild(view.found, {}, { district_code: 5, district_name_bn: "ভোলা" })), "district").verdict).toBe("differ");
    expect(row(compareCases(m, withChild(view.found, {}, { district_code: null, district_name_bn: null })), "district").verdict).toBe("unknown");
  });

  it("free text with an empty side is unknown, never agree or differ", () => {
    const r = row(compareCases(withChild(view.missing, { clothing: "" }), withChild(view.found, { clothing: "লাল জামা" })), "clothing");
    expect(r).toMatchObject({ missing: null, found: "লাল জামা", verdict: "unknown" });
  });

  it("summarises the verdict groups for the contradictions panel", () => {
    const s = summarise(compareCases(withChild(view.missing, { sex: "male" }), withChild(view.found, { sex: "female" })));
    expect(s.differ).toContain("sex");
  });
});

describe("componentEntries", () => {
  it("sorts by key and keeps null as an unknown cue", () => {
    expect(componentEntries({ time: 0.4, age: null, sex: 1 })).toEqual([
      { key: "age", value: null }, { key: "sex", value: 1 }, { key: "time", value: 0.4 },
    ]);
  });
});

describe("buildConfirm / buildReject", () => {
  it("requires every checklist item before a confirm request exists", () => {
    expect(buildConfirm(view, emptyChecklist(), "")).toEqual({ ok: false, reason: "checklist" });
    const partial = { ...full(), referral_is_simulated: false };
    expect(buildConfirm(view, partial, "")).toEqual({ ok: false, reason: "checklist" });
  });

  it("builds a confirm with the viewed versions and the full checklist", () => {
    const r = buildConfirm(view, full(), "  চিহ্ন মিলেছে ");
    expect(r.ok).toBe(true);
    if (!r.ok || r.request.decision !== "confirm") return;
    expect(r.request.expected_missing_version).toBe(view.missing.version);
    expect(r.request.expected_found_version).toBe(view.found.version);
    expect(r.request.reason).toBe("চিহ্ন মিলেছে");
    expect(Object.values(r.request.reviewer_checklist)).toEqual([true, true, true, true]);
  });

  it("an empty confirm note is no reason at all", () => {
    const r = buildConfirm(view, full(), "   ");
    expect(r.ok && r.request.decision === "confirm" && r.request.reason).toBeUndefined();
  });

  it("reject needs a 3–500 character reason (TC-011)", () => {
    expect(buildReject(view, "  ")).toEqual({ ok: false, reason: "reason-required" });
    expect(buildReject(view, "ab")).toEqual({ ok: false, reason: "reason-length" });
    expect(buildReject(view, "x".repeat(501))).toEqual({ ok: false, reason: "reason-length" });
    const ok = buildReject(view, "পোশাক আলাদা");
    expect(ok.ok && ok.request).toMatchObject({ decision: "reject", reason: "পোশাক আলাদা", expected_missing_version: view.missing.version });
  });
});

describe("classifyDecisionFailure", () => {
  const body = (id: string) => ({ error: { id } });
  it("E-005 is 'stale': reload the stored state, never retry blindly", () => {
    expect(classifyDecisionFailure({ status: 409, body: body("E-005") })).toEqual({ kind: "stale" });
    expect(classifyDecisionFailure({ status: 404, body: body("E-004") })).toEqual({ kind: "hidden" });
    expect(classifyDecisionFailure({ status: 400, body: body("E-001") })).toEqual({ kind: "validation" });
    expect(classifyDecisionFailure({ status: 401, body: body("E-002") })).toEqual({ kind: "session" });
    expect(classifyDecisionFailure({ status: 429, retryAfter: "9" })).toEqual({ kind: "rate-limited", seconds: 9 });
    expect(classifyDecisionFailure({ status: 502, body: "<html>" })).toEqual({ kind: "uncertain" });
    expect(classifyDecisionFailure({ status: 418 })).toEqual({ kind: "generic" });
  });
});

describe("requestDecision", () => {
  const request = (() => {
    const r = buildReject(view, "পোশাক আলাদা");
    if (!r.ok) throw new Error("fixture");
    return r.request;
  })();
  const response = decisionResponseSchema.parse({
    candidate_status: "rejected",
    missing: { ref_code: "M-2026-0001".replace(/^M-.*/, view.missing.ref_code), status: "open", version: view.missing.version },
    found: { ref_code: view.found.ref_code, status: "open", version: view.found.version },
    referral_id: null,
    referral_state: null,
    referral_is_simulated: true,
  });
  const parse = (b: unknown) => {
    const r = decisionResponseSchema.safeParse(b);
    return r.success ? r.data : null;
  };
  const json = (status: number, b: unknown) => (async () => new Response(JSON.stringify(b), { status })) as unknown as typeof fetch;

  it("posts to the candidate's decision endpoint and returns the stored result", async () => {
    let url = "";
    const spy = (async (u: string) => {
      url = u;
      return new Response(JSON.stringify(response), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await requestDecision(view.candidate_id, request, { fetchImpl: spy, parse });
    expect(url).toBe(candidateDecisionApi(view.candidate_id));
    expect(out.kind).toBe("decided");
  });

  it("an unreadable 2xx is 'uncertain': the decision may be stored, so reload before deciding again", async () => {
    const out = await requestDecision(view.candidate_id, request, { fetchImpl: json(200, { ok: 1 }), parse });
    expect(out).toEqual({ kind: "failure", failure: { kind: "uncertain" } });
  });

  it("E-005 maps to stale", async () => {
    const out = await requestDecision(view.candidate_id, request, { fetchImpl: json(409, { error: { id: "E-005" } }), parse });
    expect(out).toEqual({ kind: "failure", failure: { kind: "stale" } });
  });
});
