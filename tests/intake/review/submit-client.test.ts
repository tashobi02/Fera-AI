import { describe, expect, it, vi } from "vitest";
import { clientExamples } from "@/contracts/client-examples";
import { caseDraftSchema, errorEnvelope } from "@/contracts";
import { clearDraft, createDeviceDraft, loadDraft, readSubmittedReference, saveDraft } from "@/lib/intake/draft-store";
import { buildSubmission, createSubmitter, editField, newSubmission, validateReview } from "@/lib/intake/review";
import { memoryStorage } from "./storage";

function record() {
  return createDeviceDraft({ to: "review", sourceText: clientExamples.extractResponse.draft.source_text, response: { ...clientExamples.extractResponse, draft: caseDraftSchema.parse({ ...clientExamples.createMissingRequest.draft, event: { ...clientExamples.createMissingRequest.draft.event, district_text: null } }), expires_at: new Date(Date.now() + 60_000).toISOString() }, missing: [], asked: 0, mock: true, cached: false })!;
}

describe("BR-015/016 review validation", () => {
  it("builds the frozen API-003 request with confirmation, a stable UUID and token", () => {
    const r = record(); expect(validateReview(r)).toEqual([]);
    expect(buildSubmission(r, true)).toMatchObject({ confirmed: true, client_submission_id: r.client_submission_id, draft_token: r.draftToken });
    expect(buildSubmission(r, false)).toBeNull();
  });
  it.each(["child.age_years", "event.at", "event.at_lower", "event.at_upper", "event.place_text", "event.district_code", "reporter.phone"] as const)("blocks missing mandatory %s", (path) => {
    let r = record();
    if (path === "child.age_years") { r = editField(editField(r, "child.age_min", ""), "child.age_max", ""); }
    r = editField(r, path, ""); expect(validateReview(r)).toContain(path);
  });
  it.each(["018", "+8801711223344", "02123456789", "01xxxxxxxxx"])("rejects contract-invalid phone %s", (phone) => {
    expect(validateReview(editField(record(), "reporter.phone", phone))).toContain("reporter.phone");
  });
  it("accepts Bangla phone digits with contract punctuation normalization", () => {
    expect(buildSubmission(editField(record(), "reporter.phone", "০১৭১১-২২৩৩৪৪"), true)?.draft.reporter.phone).toBe("01711223344");
  });
  it("rejects out of range, fractional, reversed age/time, invalid code, and future time", () => {
    expect(validateReview(editField(record(), "child.age_years", "১৮"))).toContain("child.age_years");
    expect(validateReview(editField(record(), "child.age_years", "2.5"))).toContain("child.age_years");
    expect(validateReview(editField(record(), "event.district_code", "65"))).toContain("event.district_code");
    expect(validateReview(editField(record(), "event.at", "2099-01-01T00:00:00Z"))).toContain("event.at");
    expect(validateReview(editField(editField(record(), "child.age_years", ""), "child.age_min", "16"))).toContain("child.age_max");
  });
  it.each(["0x10", "1e1", "not a number"])("does not interpret non-decimal numeric text %s", (value) => {
    expect(validateReview(editField(record(), "event.district_code", value))).toContain("event.district_code");
  });
  it("edits drop evidence only for that field and never change the original source", () => {
    const r = record(); const edited = editField(r, "child.clothing", "[MOCK] parent changed");
    const body = buildSubmission(edited, true)!;
    expect(body.draft.child.clothing).toBe("[MOCK] parent changed"); expect(body.draft.evidence["child.clothing"]).toBeUndefined();
    expect(body.draft.source_text).toBe(r.draft.source_text);
    expect(body.draft.evidence["child.name"]).toEqual(r.draft.evidence["child.name"]);
  });
});

describe("TC-004/031 explicit submit client", () => {
  it("never dispatches without explicit confirmation or with invalid fields", async () => {
    const fetcher = vi.fn(); const submit = createSubmitter(fetcher); const r = record();
    await submit(r, false); await submit(editField(r, "reporter.phone", ""), true);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([200, 201])("clears the entire local record on HTTP %s and returns the existing reference", async (status) => {
    const storage = memoryStorage(); const r = record(); saveDraft(r, storage);
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ...clientExamples.createMissingResponse, replayed: status === 200 }, { status }));
    const result = await createSubmitter(fetcher, storage)(r, true);
    expect(result).toMatchObject({ ok: true, data: { id: clientExamples.createMissingResponse.id, ref_code: clientExamples.createMissingResponse.ref_code } });
    expect(loadDraft(storage)).toBeNull();
    expect(readSubmittedReference(storage)).toEqual({ id: clientExamples.createMissingResponse.id, ref: clientExamples.createMissingResponse.ref_code });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(buildSubmission(r, true));
    expect(fetcher.mock.calls[0][0]).toBe("/api/cases");
  });
  it.each(["E-001", "E-006", "E-002", "E-021", "E-024"] as const)("maps %s to catalogue copy and retains local data and UUID", async (id) => {
    const storage = memoryStorage(); const r = record();
    const response = errorEnvelope(id, id === "E-001" ? { fields: ["reporter.phone"] } : {});
    const result = await createSubmitter(vi.fn().mockResolvedValue(Response.json(response, { status: 400 })), storage)(r, true);
    expect(result).toEqual({ ok: false, error: response });
    expect(loadDraft(storage)?.client_submission_id).toBe(r.client_submission_id);
  });
  it("OD-022-10: E-019 clears the device record while mapping the catalogue copy", async () => {
    const storage = memoryStorage(); const r = record();
    const response = errorEnvelope("E-019");
    const result = await createSubmitter(vi.fn().mockResolvedValue(Response.json(response, { status: 401 })), storage)(r, true);
    expect(result).toEqual({ ok: false, error: response });
    expect(loadDraft(storage)).toBeNull();
    expect(storage.getItem("fera.intake.review.v1")).toBeNull();
  });
  it("reuses the same UUID and payload after E-021 and E-024, including after reload", async () => {
    const storage = memoryStorage(); const r = record();
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(errorEnvelope("E-021"), { status: 500 })).mockRejectedValueOnce(Error("offline"));
    await createSubmitter(fetcher, storage)(r, true);
    await createSubmitter(fetcher, storage)(loadDraft(storage)!, true);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(JSON.parse(fetcher.mock.calls[1][1].body));
    expect(loadDraft(storage)?.attempted).toBe(true);
  });
  it("blocks double submission while busy", async () => {
    let finish!: (r: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const submit = createSubmitter(fetcher); const r = record(); const first = submit(r, true); await submit(r, true);
    expect(fetcher).toHaveBeenCalledTimes(1); finish(Response.json(clientExamples.createMissingResponse)); await first;
  });
  it("requires deliberate new ID after E-006 before edited resubmission", () => {
    const r = record(); const next = newSubmission(editField({ ...r, attempted: true }, "child.clothing", "[MOCK] changed"));
    expect(next.client_submission_id).not.toBe(r.client_submission_id); expect(next.attempted).toBe(false);
    expect(buildSubmission(next, true)?.draft.child.clothing).toBe("[MOCK] changed");
  });
  it("does not erase a newer local draft when an older in-flight submission completes", async () => {
    const storage = memoryStorage(); const old = record(); let finish!: (r: Response) => void;
    const promise = createSubmitter(vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })), storage)(old, true);
    const newer = record(); clearDraft(storage); saveDraft(newer, storage);
    finish(Response.json(clientExamples.createMissingResponse)); await promise;
    expect(loadDraft(storage)?.client_submission_id).toBe(newer.client_submission_id);
  });
  it("refuses dispatch when a saved draft cannot durably freeze", async () => {
    const backing = memoryStorage(); const r = record(); saveDraft(r, backing);
    const storage = { ...backing, setItem() { throw Error("quota"); } }; const fetcher = vi.fn();
    const result = await createSubmitter(fetcher, storage)(r, true, true);
    expect(fetcher).not.toHaveBeenCalled(); expect(result).toMatchObject({ ok: false, dispatched: false });
    expect(loadDraft(backing)?.attempted).toBe(false);
  });
  it("cannot dispatch or overwrite when another draft occupies the shared key", async () => {
    const storage = memoryStorage(); const r = record(); const other = record(); saveDraft(other, storage); const fetcher = vi.fn();
    await createSubmitter(fetcher, storage)(r, true);
    expect(fetcher).not.toHaveBeenCalled(); expect(loadDraft(storage)?.client_submission_id).toBe(other.client_submission_id);
  });
  it("cannot replace or send a stale editable snapshot sharing the frozen UUID", async () => {
    const storage = memoryStorage(); const original = record(); const frozen = { ...original, attempted: true }; saveDraft(frozen, storage);
    const stale = editField(original, "child.clothing", "[MOCK] stale same ID");
    expect(saveDraft(stale, storage)).toBe(false); expect(saveDraft({ ...stale, attempted: true }, storage)).toBe(false);
    const fetcher = vi.fn(); await createSubmitter(fetcher, storage)(stale, true, true);
    expect(fetcher).not.toHaveBeenCalled(); expect(loadDraft(storage)).toEqual(frozen);
  });
  it("a known persisted draft removed by another tab cannot be recreated on submit", async () => {
    const storage = memoryStorage(); const r = record(); const fetcher = vi.fn();
    await createSubmitter(fetcher, storage)(r, true, true); expect(fetcher).not.toHaveBeenCalled(); expect(loadDraft(storage)).toBeNull();
  });
  it("maps exact-time approximation errors to a visible time field", () => {
    const r = record(); r.approximate = false;
    r.edits["event.at_upper"] = "2026-10-12T20:00:00+06:00";
    expect(validateReview(r)).toContain("event.at");
  });
  it("never clears for malformed success or non-200/201 and never echoes response text", async () => {
    const storage = memoryStorage(); const r = record();
    const result = await createSubmitter(vi.fn().mockResolvedValue(Response.json({ secret: "payload" }, { status: 201 })), storage)(r, true);
    expect(result).toEqual({ ok: false, error: errorEnvelope("E-021") }); expect(loadDraft(storage)).not.toBeNull();
  });
});

describe("A8 Sol reference persistence", () => {
  it("keeps the frozen retry record when persisting a 2xx reference fails", async () => {
    const backing = memoryStorage(); const r = record(); saveDraft(r, backing);
    const storage = { ...backing, setItem(key: string, value: string) {
      if (key === "fera.intake.submitted.v1") throw Error("quota");
      backing.setItem(key, value);
    } };
    const result = await createSubmitter(vi.fn().mockResolvedValue(Response.json(clientExamples.createMissingResponse)), storage)(r, true, true);
    expect(result).toMatchObject({ ok: true, cleared: false });
    expect(loadDraft(backing)?.client_submission_id).toBe(r.client_submission_id);
    expect(loadDraft(backing)?.attempted).toBe(true);
  });
});

describe("A8 Sol dispatch identity guard", () => {
  it("a memory-only caller cannot dispatch over a corrupt attempted stored identity", async () => {
    const storage = memoryStorage(); const r = record();
    storage.setItem("fera.intake.review.v1", JSON.stringify({ ...record(), version: 2, attempted: true }));
    const fetcher = vi.fn();
    expect(await createSubmitter(fetcher, storage)(r, true, false)).toMatchObject({ ok: false, dispatched: false });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("A8 Sol cleanup reporting", () => {
  it("reports retained payload when freeze succeeds from empty storage but reference save fails", async () => {
    const backing = memoryStorage(); const r = record();
    const storage = { ...backing, setItem(key: string, value: string) {
      if (key === "fera.intake.submitted.v1") throw Error("quota");
      backing.setItem(key, value);
    } };
    const result = await createSubmitter(vi.fn().mockResolvedValue(Response.json(clientExamples.createMissingResponse)), storage)(r, true);
    expect(result).toMatchObject({ ok: true, cleared: false });
    expect(loadDraft(backing)?.attempted).toBe(true);
  });
});

describe("A8 Sol unreadable storage", () => {
  it("does not dispatch over storage whose existing identity cannot be read", async () => {
    const backing = memoryStorage(); saveDraft({ ...record(), attempted: true }, backing);
    const storage = { ...backing, getItem() { throw Error("unavailable"); } };
    const fetcher = vi.fn();
    expect(await createSubmitter(fetcher, storage)(record(), true)).toMatchObject({ok:false,dispatched:false});
    expect(fetcher).not.toHaveBeenCalled();
  });
});
