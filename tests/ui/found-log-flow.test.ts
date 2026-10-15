// TASK-026 / TC-008 (client half): the S-007 found-child form logic. Synthetic values only.
import { describe, expect, it } from "vitest";
import {
  buildFoundRequest, classifyFoundLogFailure, createSaveGuard, dhakaLocalInput, emptyValues, foundLogReducer,
  initialFoundLogState, requestFoundLog, valuesFromFormData, type FoundLogValues,
} from "@/lib/found-log-flow";
import { exampleCreateFoundResponse } from "@/contracts/examples";

const NOW = Date.parse("2026-10-15T17:30:00+06:00");
const ID = "11111111-1111-4111-8111-111111111111";

function filled(over: Partial<FoundLogValues> = {}): FoundLogValues {
  return {
    ...emptyValues(NOW),
    circumstances: "রেলস্টেশনে একা বসে ছিল",
    clothing: "লাল জামা",
    place: "কমলাপুর রেলস্টেশন",
    district: "14",
    phone: "01712345678",
    ...over,
  };
}

describe("dhakaLocalInput", () => {
  it("renders the current Dhaka wall time for a datetime-local input", () => {
    expect(dhakaLocalInput(NOW)).toBe("2026-10-15T17:30");
    expect(dhakaLocalInput(Date.parse("2026-10-15T23:45:00Z"))).toBe("2026-10-16T05:45");
  });
});

describe("buildFoundRequest", () => {
  it("builds a confirmed found request from a filled form, with unknowns as null", () => {
    const r = buildFoundRequest(filled(), { clientSubmissionId: ID, nowMs: NOW });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.request.confirmed).toBe(true);
    expect(r.request.client_submission_id).toBe(ID);
    expect(r.request.draft.kind).toBe("found");
    expect(r.request.draft.child).toMatchObject({ name: null, age_years: null, age_min: null, age_max: null, height_cm: null, marks: null, sex: "unknown" });
    expect(r.request.draft.event).toMatchObject({ district_code: 14, at_approx: false });
    expect(r.request.draft.event.at).toBe("2026-10-15T17:30:00+06:00");
    expect(r.request.draft.source_text).toBe("");
    expect(r.request.draft.evidence).toEqual({});
  });

  it("stores an exact age as years and a range as min/max", () => {
    const exact = buildFoundRequest(filled({ ageYears: "7" }), { clientSubmissionId: ID, nowMs: NOW });
    expect(exact.ok && exact.request.draft.child).toMatchObject({ age_years: 7, age_min: 7, age_max: 7 });
    const range = buildFoundRequest(filled({ ageMin: "6", ageMax: "9" }), { clientSubmissionId: ID, nowMs: NOW });
    expect(range.ok && range.request.draft.child).toMatchObject({ age_years: null, age_min: 6, age_max: 9 });
  });

  it("names every missing required field and does not guess", () => {
    const r = buildFoundRequest(filled({ circumstances: "", clothing: "", place: " ", district: "", phone: "" }), { clientSubmissionId: ID, nowMs: NOW });
    expect(r).toEqual({ ok: false, fields: { circumstances: "description", place: "required", district: "required", phone: "required" } });
  });

  it("accepts a description in clothing or marks alone", () => {
    const r = buildFoundRequest(filled({ circumstances: "", clothing: "নীল শার্ট" }), { clientSubmissionId: ID, nowMs: NOW });
    expect(r.ok).toBe(true);
  });

  it("rejects a bad phone, a future time, an out-of-range height and a half age range", () => {
    expect(buildFoundRequest(filled({ phone: "12345" }), { clientSubmissionId: ID, nowMs: NOW })).toEqual({ ok: false, fields: { phone: "invalid" } });
    expect(buildFoundRequest(filled({ foundAt: "2026-10-16T09:00" }), { clientSubmissionId: ID, nowMs: NOW })).toEqual({ ok: false, fields: { foundAt: "future" } });
    expect(buildFoundRequest(filled({ heightCm: "300" }), { clientSubmissionId: ID, nowMs: NOW })).toEqual({ ok: false, fields: { heightCm: "invalid" } });
    expect(buildFoundRequest(filled({ ageMin: "5" }), { clientSubmissionId: ID, nowMs: NOW })).toEqual({ ok: false, fields: { ageMax: "required" } });
    expect(buildFoundRequest(filled({ ageYears: "7", ageMin: "5", ageMax: "9" }), { clientSubmissionId: ID, nowMs: NOW }).ok).toBe(false);
  });

  it("accepts Bangla digits in the phone (the contract normalises them)", () => {
    expect(buildFoundRequest(filled({ phone: "০১৭১২৩৪৫৬৭৮" }), { clientSubmissionId: ID, nowMs: NOW }).ok).toBe(true);
  });
});

describe("valuesFromFormData", () => {
  it("reads known fields, defaults the rest and coerces an unknown sex", () => {
    const fd = new FormData();
    fd.set("place", "স্টেশন");
    fd.set("sex", "robot");
    fd.set("extra", "x");
    const v = valuesFromFormData(fd, NOW);
    expect(v.place).toBe("স্টেশন");
    expect(v.sex).toBe("unknown");
    expect(v.foundAt).toBe("2026-10-15T17:30");
  });
});

describe("classifyFoundLogFailure", () => {
  it("maps statuses and envelope ids to a safe failure kind", () => {
    const body = (id: string) => ({ error: { id } });
    expect(classifyFoundLogFailure({ status: 429, retryAfter: "12" })).toEqual({ kind: "rate-limited", seconds: 12 });
    expect(classifyFoundLogFailure({ status: 409, body: body("E-006") })).toEqual({ kind: "conflict" });
    expect(classifyFoundLogFailure({ status: 400, body: body("E-001") })).toEqual({ kind: "validation" });
    expect(classifyFoundLogFailure({ status: 401, body: body("E-002") })).toEqual({ kind: "session" });
    expect(classifyFoundLogFailure({ status: 404, body: body("E-004") })).toEqual({ kind: "forbidden" });
    expect(classifyFoundLogFailure({ status: 500, body: "not json" })).toEqual({ kind: "generic" });
  });
});

describe("requestFoundLog", () => {
  const request = (() => {
    const r = buildFoundRequest(filled(), { clientSubmissionId: ID, nowMs: NOW });
    if (!r.ok) throw new Error("fixture");
    return r.request;
  })();
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    (async () => new Response(JSON.stringify(body), { status, headers })) as unknown as typeof fetch;

  it("returns the saved response on 201", async () => {
    const out = await requestFoundLog(request, { fetchImpl: json(201, exampleCreateFoundResponse) });
    expect(out.kind).toBe("saved");
  });

  it("treats a 2xx with an unreadable body as uncertain (retry is safe, same submission id)", async () => {
    const out = await requestFoundLog(request, { fetchImpl: json(201, { ok: true }) });
    expect(out).toEqual({ kind: "failure", failure: { kind: "uncertain" } });
  });

  it("separates offline from a timeout", async () => {
    const offline = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    expect(await requestFoundLog(request, { fetchImpl: offline })).toEqual({ kind: "failure", failure: { kind: "offline" } });
    const timeout = (async () => { throw new DOMException("timed out", "TimeoutError"); }) as unknown as typeof fetch;
    expect(await requestFoundLog(request, { fetchImpl: timeout })).toEqual({ kind: "failure", failure: { kind: "uncertain" } });
  });

  it("sends JSON to API-007 with the confirmed flag and never a photo field", async () => {
    let seen: { url: string; body: string } | null = null;
    const spy = (async (url: string, init: RequestInit) => {
      seen = { url, body: String(init.body) };
      return new Response(JSON.stringify(exampleCreateFoundResponse), { status: 201 });
    }) as unknown as typeof fetch;
    await requestFoundLog(request, { fetchImpl: spy });
    expect(seen).not.toBeNull();
    expect(seen!.url).toBe("/api/found-cases");
    const sent = JSON.parse(seen!.body);
    expect(sent.confirmed).toBe(true);
    expect(JSON.stringify(sent)).not.toMatch(/photo|image|latitude|longitude/i);
  });
});

describe("foundLogReducer and guard", () => {
  it("walks idle → saving → saved, then back to a blank form", () => {
    let s = foundLogReducer(initialFoundLogState, { type: "save" });
    expect(s.status).toBe("saving");
    s = foundLogReducer(s, { type: "outcome", outcome: { kind: "saved", response: exampleCreateFoundResponse } });
    expect(s.status).toBe("saved");
    expect(s.saved?.ref_code).toBe(exampleCreateFoundResponse.ref_code);
    s = foundLogReducer(s, { type: "another" });
    expect(s).toMatchObject({ status: "idle", saved: null, failure: null });
  });

  it("keeps the form and shows the failure on error, and clears a field error on input", () => {
    let s = foundLogReducer(initialFoundLogState, { type: "invalid", fields: { phone: "invalid" } });
    expect(s.fields.phone).toBe("invalid");
    s = foundLogReducer(s, { type: "input", field: "phone" });
    expect(s.fields.phone).toBeUndefined();
    s = foundLogReducer(s, { type: "save" });
    s = foundLogReducer(s, { type: "outcome", outcome: { kind: "failure", failure: { kind: "offline" } } });
    expect(s).toMatchObject({ status: "idle", failure: { kind: "offline" } });
  });

  it("ignores a second press while one save is in flight", () => {
    const g = createSaveGuard();
    expect(g.enter()).toBe(true);
    expect(g.enter()).toBe(false);
    g.leave();
    expect(g.enter()).toBe(true);
  });
});
