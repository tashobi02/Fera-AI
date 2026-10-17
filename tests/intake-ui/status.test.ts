// SCREEN-006 edit-handoff device-local helper (TASK-049, P3-102; D3 §3 row 142
// ACT-017). The "Correct details" click records an edit-mode pointer in
// localStorage so the next page (S-003) knows which case is being edited. The
// record never leaves the device; this test only checks storage shape and the
// staleness rule.
import { afterEach, describe, expect, it } from "vitest";
import { beginEditMode, clearEditMode, readEditMode } from "@/lib/intake/edit-handoff";
import { memoryStorage } from "../intake/review/storage";

const CASE_ID = "22222222-2222-4222-8222-222222222201";
const REF_CODE = "M-000001";
const NOW = 1_700_000_000_000;

describe("status edit-handoff (P3-102)", () => {
  afterEach(() => {
    clearEditMode(memoryStorage());
  });

  it("beginEditMode stores the case id and ref code, no child payload", () => {
    const storage = memoryStorage();
    const ok = beginEditMode({ caseId: CASE_ID, refCode: REF_CODE }, storage, NOW);
    expect(ok).toBe(true);
    const raw = storage.getItem("fera.intake.edit-mode.v1");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.caseId).toBe(CASE_ID);
    expect(parsed.refCode).toBe(REF_CODE);
    expect(parsed.savedAt).toBe(NOW);
    // No child payload: no name, no phone, no district, no event_at.
    expect(parsed.name).toBeUndefined();
    expect(parsed.phone).toBeUndefined();
    expect(parsed.district_code).toBeUndefined();
    expect(parsed.event_at).toBeUndefined();
  });

  it("readEditMode returns the parsed record when fresh", () => {
    const storage = memoryStorage();
    beginEditMode({ caseId: CASE_ID, refCode: REF_CODE }, storage, NOW);
    const read = readEditMode(storage, NOW);
    expect(read).toEqual({ version: 1, caseId: CASE_ID, refCode: REF_CODE, savedAt: NOW });
  });

  it("readEditMode clears and returns null on a corrupt record", () => {
    const storage = memoryStorage();
    storage.setItem("fera.intake.edit-mode.v1", "{not json}");
    const read = readEditMode(storage, NOW);
    expect(read).toBeNull();
    expect(storage.getItem("fera.intake.edit-mode.v1")).toBeNull();
  });

  it("readEditMode clears and returns null on a record older than the window", () => {
    const storage = memoryStorage();
    beginEditMode({ caseId: CASE_ID, refCode: REF_CODE }, storage, NOW);
    const tomorrow = NOW + 25 * 60 * 60 * 1000;
    const read = readEditMode(storage, tomorrow);
    expect(read).toBeNull();
    expect(storage.getItem("fera.intake.edit-mode.v1")).toBeNull();
  });

  it("clearEditMode removes the record", () => {
    const storage = memoryStorage();
    beginEditMode({ caseId: CASE_ID, refCode: REF_CODE }, storage, NOW);
    expect(clearEditMode(storage)).toBe(true);
    expect(storage.getItem("fera.intake.edit-mode.v1")).toBeNull();
  });

  it("beginEditMode refuses a non-uuid case id and does not write", () => {
    const storage = memoryStorage();
    const ok = beginEditMode({ caseId: "not-a-uuid", refCode: REF_CODE }, storage, NOW);
    expect(ok).toBe(false);
    expect(storage.getItem("fera.intake.edit-mode.v1")).toBeNull();
  });
});