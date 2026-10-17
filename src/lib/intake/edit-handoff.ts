// SCREEN-006 → SCREEN-003 edit-mode device-local handoff (TASK-049, P3-102; D3 §3
// row 142 ACT-017, D2A §5.3/API-005; FR-029, BR-025). The parent taps "তথ্য সংশোধন"
// / "Correct details" on the status page. This module records the edit mode in
// localStorage so the next page knows:
//
//   1. which case ID is being edited (no child payload, no phone, no name),
//   2. which ref code to show while the review page loads,
//   3. that the parent explicitly chose to edit, not to start a new report.
//
// Storage shape (Zod-parsed on read; corrupt records are cleared):
//   {
//     version: 1,
//     caseId: <uuid>,
//     refCode: <string>, // e.g. "M-7K3Q2A", kept for the device-local copy
//     savedAt: <epoch ms>,
//   }
//
// The record never leaves the device; it is not in the URL, the body or the
// server. The status page reads it on return to detect "an edit was in flight"
// so it can re-load API-018 instead of using a stale local copy. The review
// page (SCREEN-003) is not modified by this work; it already knows how to take
// an IntakeHandoff and call API-003. The expected_version for API-005 is read
// from the canonical owner view (API-004) on the review page.
import { z } from "zod";
import { refCodeSchema, uuidSchema } from "@/contracts";

const EDIT_KEY = "fera.intake.edit-mode.v1";

const editModeSchema = z.strictObject({
  version: z.literal(1),
  caseId: uuidSchema,
  refCode: refCodeSchema,
  savedAt: z.number().finite(),
});

export type EditMode = z.infer<typeof editModeSchema>;

function browserStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined {
  try { return typeof window === "undefined" ? undefined : window.localStorage; } catch { return undefined; }
}

// P3-102: a Correct-details click stores the explicit edit-mode record. The case
// ID is the only identifier, and the ref code is what the parent saw on the
// status card. We never store the draft, the child name, the phone, the district
// or any other child payload.
export function beginEditMode(input: { caseId: string; refCode: string }, storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined = browserStorage(), now = Date.now()): boolean {
  try {
    if (!storage) return false;
    const next = editModeSchema.parse({
      version: 1,
      caseId: input.caseId,
      refCode: input.refCode,
      savedAt: now,
    });
    storage.setItem(EDIT_KEY, JSON.stringify(next));
    return true;
  } catch { return false; }
}

// P3-102: S-006 reads the record on return to detect a fresh edit. A record older
// than `maxAgeMs` is treated as stale and removed; the default matches the
// existing 24 h draft window so a parent who taps "Correct" and comes back the
// next day is not shown the edit-in-flight copy.
export function readEditMode(storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined = browserStorage(), now = Date.now(), maxAgeMs = 24 * 60 * 60 * 1000): EditMode | null {
  try {
    if (!storage) return null;
    const raw = storage.getItem(EDIT_KEY);
    if (raw === null) return null;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      storage.removeItem(EDIT_KEY);
      return null;
    }
    const parsed = editModeSchema.safeParse(value);
    if (!parsed.success) { storage.removeItem(EDIT_KEY); return null; }
    if (now - parsed.data.savedAt > maxAgeMs) {
      storage.removeItem(EDIT_KEY);
      return null;
    }
    return parsed.data;
  } catch { return null; }
}

export function clearEditMode(storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined = browserStorage()): boolean {
  try { if (!storage) return true; storage.removeItem(EDIT_KEY); return true; } catch { return false; }
}
