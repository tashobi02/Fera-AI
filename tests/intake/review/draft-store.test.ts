import { describe, expect, it } from "vitest";
import { clientExamples } from "@/contracts/client-examples";
import {
  clearDraft, clearSubmittedDraft, clearSubmittedReference, createDeviceDraft, DRAFT_KEY,
  loadDraft, readDraft, readSubmittedReference, saveDraft, saveSubmittedReference,
  SUBMITTED_KEY, sweepDrafts, type DraftStorage,
} from "@/lib/intake/draft-store";

const now = Date.parse("2026-10-16T00:00:00Z");
import { memoryStorage } from "./storage";
function draft() {
  return createDeviceDraft({ to: "review", sourceText: clientExamples.extractResponse.draft.source_text, response: { ...clientExamples.extractResponse, expires_at: new Date(now + 60_000).toISOString() }, missing: [], asked: 0, cached: false, mock: true }, now);
}

describe("TASK-022 device draft store", () => {
  it("round trips payload, full source, UUID, token, flags, edits and timestamp locally", () => {
    const storage = memoryStorage(); const record = draft()!;
    record.edits["child.clothing"] = "[MOCK] edited";
    expect(saveDraft(record, storage)).toBe(true);
    expect(loadDraft(storage, now)).toEqual(record);
    expect(record.client_submission_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(record.savedAt).toBe(now);
  });
  it.each(["{", "null", '{"version":999}', '{"version":1,"draft":{}}'])("drops corrupt or unsupported data: %s", (raw) => {
    const storage = memoryStorage(); storage.setItem(DRAFT_KEY, raw);
    expect(loadDraft(storage, now)).toBeNull(); expect(storage.getItem(DRAFT_KEY)).toBeNull();
  });
  it("expires exactly at supplied draft expiry without extending on saves", () => {
    const storage = memoryStorage(); const record = draft()!; saveDraft(record, storage);
    expect(loadDraft(storage, now + 59_999)).not.toBeNull();
    expect(loadDraft(storage, now + 60_000)).toBeNull(); expect(storage.getItem(DRAFT_KEY)).toBeNull();
  });
  it("does not extend a supplied long expiry or evict an incomplete draft", () => {
    const storage = memoryStorage(); const r = draft()!;
    r.expiresAt = now + 3_600_000; r.edits["event.at"] = "unfinished time";
    saveDraft(r, storage); expect(loadDraft(storage, now + 1_800_000)).toEqual(r);
  });
  it("clears both draft and submission UUID", () => {
    const storage = memoryStorage(); saveDraft(draft()!, storage);
    expect(clearDraft(storage)).toBe(true); expect(loadDraft(storage, now)).toBeNull();
  });
  it("survives throwing storage and unavailable window", () => {
    const storage: DraftStorage = { getItem() { throw Error(); }, setItem() { throw Error(); }, removeItem() { throw Error(); } };
    expect(loadDraft(storage, now)).toBeNull(); expect(saveDraft(draft()!, storage)).toBe(false); expect(clearDraft(storage)).toBe(false);
    expect(loadDraft()).toBeNull(); expect(clearDraft()).toBe(true);
    expect(clearSubmittedDraft("some-id", undefined)).toBe(true);
  });
  it("stale writes are refused, but an explicit replacement requires the current ID", () => {
    const storage = memoryStorage(); const old = draft()!; const next = draft()!; saveDraft(old, storage);
    expect(saveDraft(next, storage)).toBe(false);
    expect(saveDraft(next, storage, old.client_submission_id)).toBe(true);
    expect(saveDraft(old, storage)).toBe(false);
    expect(loadDraft(storage, now)?.client_submission_id).toBe(next.client_submission_id);
  });
  // SYS-BUG-01 / SYS-BUG-10: the manual form must remain usable when no
  // extract response exists. The old contract returned null, which left
  // the parent with no editable record and dropped their typed text. The
  // form now adopts the source text and an empty, editable draft.
  it("builds a minimal editable draft from the source text when no extract response exists", () => {
    const r = createDeviceDraft({ to: "manual", sourceText: "[MOCK]", response: null, missing: [], asked: 4, mock: true, cached: false }, now);
    expect(r).not.toBeNull();
    expect(r?.sourceText).toBe("[MOCK]");
    expect(r?.draft.source_text).toBe("[MOCK]");
    expect(r?.draft.kind).toBe("missing");
    expect(r?.draft.child.sex).toBe("unknown");
  });
  it("keeps full local source and a valid Unicode boundary in the bounded manual submission field", () => {
    const sourceText = "[MOCK] " + "ক".repeat(3992) + "😀 retained history";
    const r = createDeviceDraft({ to: "manual", sourceText, response: null, missing: [], asked: 0, mock: true, cached: false }, now)!;
    expect(r.sourceText).toBe(sourceText);
    expect(r.draft.source_text).toBe(sourceText.slice(0, 3999));
    expect(r.draft.evidence).toEqual({});
    expect(saveDraft(r, memoryStorage(), null)).toBe(true);
  });
  it("persists submitted reference without payload and clears it cleanly (W2)", () => {
    const storage = memoryStorage();
    expect(saveSubmittedReference({ id: clientExamples.createMissingResponse.id, ref: "M-TEST12" }, storage, now)).toBe(true);
    expect(readSubmittedReference(storage)).toEqual({ id: clientExamples.createMissingResponse.id, ref: "M-TEST12" });
    expect(storage.getItem(SUBMITTED_KEY)).not.toContain("reporter");
    expect(clearSubmittedReference(storage)).toBe(true);
    expect(readSubmittedReference(storage)).toBeNull();
  });
  it("OD-022-10: an attempted, expired record is cleared; the rare 2xx retry loses the device reference", () => {
    const storage = memoryStorage();
    const attemptedExpired = { ...draft()!, attempted: true, expiresAt: now - 1000 };
    saveDraft(attemptedExpired, storage);
    expect(loadDraft(storage, now)).toBeNull();
    expect(storage.getItem(DRAFT_KEY)).toBeNull();
  });
  it("OD-022-10: a clock-stepped attempted record is also cleared", () => {
    const storage = memoryStorage();
    const attemptedClockSkew = { ...draft()!, attempted: true, savedAt: now + 5000 };
    saveDraft(attemptedClockSkew, storage);
    expect(loadDraft(storage, now)).toBeNull();
    expect(storage.getItem(DRAFT_KEY)).toBeNull();
  });
  it("SW3: caps expiresAt at min(server value, now + 24 h)", () => {
    const serverLong = new Date(now + 40 * 24 * 3600 * 1000).toISOString();
    const dLong = createDeviceDraft({ to: "review", sourceText: "[MOCK]", response: { ...clientExamples.extractResponse, expires_at: serverLong }, missing: [], asked: 0, cached: false, mock: true }, now)!;
    expect(dLong.expiresAt).toBe(now + 24 * 3600 * 1000);

    const serverShort = new Date(now + 2 * 3600 * 1000).toISOString();
    const dShort = createDeviceDraft({ to: "review", sourceText: "[MOCK]", response: { ...clientExamples.extractResponse, expires_at: serverShort }, missing: [], asked: 0, cached: false, mock: true }, now)!;
    expect(dShort.expiresAt).toBe(now + 2 * 3600 * 1000);
  });
  it("OD-022-10: sweepDrafts removes any readable expired draft (attempted or not), keeps active drafts", () => {
    const storage = memoryStorage();
    const expiredNonAttempted = { ...draft()!, attempted: false, expiresAt: now - 1000 };
    saveDraft(expiredNonAttempted, storage);
    expect(sweepDrafts(storage, now)).toBe(true);
    expect(storage.getItem(DRAFT_KEY)).toBeNull();

    const expiredAttempted = { ...draft()!, attempted: true, expiresAt: now - 1000 };
    saveDraft(expiredAttempted, storage);
    expect(sweepDrafts(storage, now)).toBe(true);
    expect(storage.getItem(DRAFT_KEY)).toBeNull();

    const activeNonAttempted = { ...draft()!, attempted: false, expiresAt: now + 60_000 };
    saveDraft(activeNonAttempted, storage);
    expect(sweepDrafts(storage, now)).toBe(true);
    expect(storage.getItem(DRAFT_KEY)).not.toBeNull();
  });
  it("N1: keeps attempted id on corrupt or old version without silent deletion", () => {
    const storage = memoryStorage();
    const r = { ...draft()!, attempted: true };
    const raw = JSON.stringify(r).replace('"version":1', '"version":2');
    storage.setItem(DRAFT_KEY, raw);
    const result = readDraft(storage, now);
    expect(result.corruptAttemptedId).toBe(r.client_submission_id);
    expect(storage.getItem(DRAFT_KEY)).not.toBeNull();
  });
});

describe("A8 Sol corrupt attempted retention", () => {
  it("sweep preserves a parseable attempted identity even on unsupported record version", () => {
    const storage = memoryStorage();
    const raw = JSON.stringify({ ...draft()!, attempted: true, version: 2 });
    storage.setItem(DRAFT_KEY, raw);
    expect(sweepDrafts(storage, now)).toBe(true);
    expect(storage.getItem(DRAFT_KEY)).toBe(raw);
  });
  it("ordinary writes cannot overwrite a corrupt attempted identity", () => {
    const storage = memoryStorage();
    const raw = JSON.stringify({ ...draft()!, attempted: true, version: 2 });
    storage.setItem(DRAFT_KEY, raw);
    expect(saveDraft(draft()!, storage, null)).toBe(false);
    expect(storage.getItem(DRAFT_KEY)).toBe(raw);
  });
});

describe("A8 Sol late response cleanup", () => {
  it("cannot erase a corrupt attempted replacement with a different recoverable UUID", () => {
    const storage = memoryStorage(); const old = draft()!; const replacement = draft()!;
    const raw = JSON.stringify({ ...replacement, version: 2, attempted: true });
    storage.setItem(DRAFT_KEY, raw);
    expect(clearSubmittedDraft(old.client_submission_id, storage)).toBe(true);
    expect(storage.getItem(DRAFT_KEY)).toBe(raw);
  });
});

describe("A8 Sol transient read failure", () => {
  it("a throwing getItem never deletes the unread attempted record", () => {
    const backing = memoryStorage(); const r = { ...draft()!, attempted: true }; saveDraft(r, backing);
    const storage = { ...backing, getItem() { throw Error("unavailable"); } };
    expect(readDraft(storage, now).available).toBe(false);
    expect(sweepDrafts(storage, now)).toBe(false);
    expect(backing.getItem(DRAFT_KEY)).toBe(JSON.stringify(r));
  });
});
