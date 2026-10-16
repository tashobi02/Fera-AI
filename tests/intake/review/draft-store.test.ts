import { describe, expect, it } from "vitest";
import { clientExamples } from "@/contracts/client-examples";
import { clearDraft, createDeviceDraft, DRAFT_KEY, loadDraft, saveDraft, type DraftStorage } from "@/lib/intake/draft-store";

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
    expect(loadDraft()).toBeNull(); expect(clearDraft()).toBe(false);
  });
  it("stale writes are refused, but an explicit replacement requires the current ID", () => {
    const storage = memoryStorage(); const old = draft()!; const next = draft()!; saveDraft(old, storage);
    expect(saveDraft(next, storage)).toBe(false);
    expect(saveDraft(next, storage, old.client_submission_id)).toBe(true);
    expect(saveDraft(old, storage)).toBe(false);
    expect(loadDraft(storage, now)?.client_submission_id).toBe(next.client_submission_id);
  });
  it("does not invent a draft for a handoff without extraction", () => {
    expect(createDeviceDraft({ to: "manual", sourceText: "[MOCK]", response: null, missing: [], asked: 4, mock: true, cached: false }, now)).toBeNull();
  });
});
