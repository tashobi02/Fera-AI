// SCREEN-006 → SCREEN-003 edit-mode device-local handoff (TASK-049, P3-102; D3 §3
// row 142 ACT-017, D2A §5.3/API-005; FR-029, BR-025). The parent taps "তথ্য সংশোধন"
// / "Correct details" on the status page. This module records the edit mode in
// localStorage so the next page knows:
//
//   1. which case ID is being edited (no child payload, no phone, no name),
//   2. which ref code to show while the review page loads,
//   3. which case version the parent saw when they tapped Correct; the PATCH on
//      API-005 carries the same expected_version so a stale edit cannot silently
//      overwrite a server-side change (E-005, no false success).
//
// Storage shape (Zod-parsed on read; corrupt records are cleared):
//   {
//     version: 2,
//     caseId: <uuid>,
//     refCode: <string>, // e.g. "M-7K3Q2A", kept for the device-local copy
//     expectedVersion: <int>, // the case version the parent saw at click time
//     savedAt: <epoch ms>,
//   }
//
// The record never leaves the device; it is not in the URL, the body or the
// server. The status page reads it on return to detect "an edit was in flight"
// so it can re-load API-018 instead of using a stale local copy. The review
// page (SCREEN-003) hydrates the canonical owner view (API-004) into a
// device-local edit draft; the expected_version is read from this pointer, then
// the PATCH on API-005 carries the same value.
import { z } from "zod";
import { refCodeSchema, uuidSchema, versionSchema } from "@/contracts";

const EDIT_KEY = "fera.intake.edit-mode.v1";

// v2 (P3-035/ACT017): expected_version is part of the pointer. v1 records
// (without the field) are read as `expectedVersion: 0` so a parent who
// upgraded mid-flight still gets a usable pointer; the PATCH then fails with
// E-005 the first time, and the review page reloads against the server.
const editModeSchema = z.strictObject({
  version: z.literal(2),
  caseId: uuidSchema,
  refCode: refCodeSchema,
  expectedVersion: versionSchema,
  savedAt: z.number().finite(),
});
// v1 records predate expectedVersion; treat them as version 0 so the read path
// still hands the case back to the review page, which immediately re-validates
// against the server. The review submit is then forced to fetch API-004 to
// read the live version before PATCHing.
const editModeV1Schema = z.strictObject({
  version: z.literal(1),
  caseId: uuidSchema,
  refCode: refCodeSchema,
  savedAt: z.number().finite(),
});

export type EditMode = z.infer<typeof editModeSchema>;
export type EditModeV1 = z.infer<typeof editModeV1Schema>;

function browserStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined {
  try { return typeof window === "undefined" ? undefined : window.localStorage; } catch { return undefined; }
}

// P3-102/P3-035: a Correct-details click stores the explicit edit-mode record.
// The case ID is the only identifier, the ref code is what the parent saw on
// the status card, and the expected_version is the case version at click time
// (E-005 guard). We never store the draft, the child name, the phone, the
// district or any other child payload.
//
// The list view (API-018) does not carry the live case version; when the
// status page calls this without a version, the S-003 page reads API-004 to
// learn the live version before PATCHing. Passing a non-zero version is
// purely an optimisation: the review page can re-check the version on its own.
export function beginEditMode(
  input: { caseId: string; refCode: string; expectedVersion?: number },
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined = browserStorage(),
  now = Date.now(),
): boolean {
  try {
    if (!storage) return false;
    // API-018's parent list does not include a case version. Keep that pointer
    // in the legacy version-1 shape until API-004 returns the authoritative
    // version; writing a synthetic zero would fail versionSchema (min: 1).
    const expected = input.expectedVersion;
    const next = expected !== undefined && Number.isSafeInteger(expected) && expected >= 1
      ? editModeSchema.parse({ version: 2, caseId: input.caseId, refCode: input.refCode, expectedVersion: expected, savedAt: now })
      : editModeV1Schema.parse({ version: 1, caseId: input.caseId, refCode: input.refCode, savedAt: now });
    storage.setItem(EDIT_KEY, JSON.stringify(next));
    return true;
  } catch { return false; }
}

// P3-102: S-006 reads the record on return to detect a fresh edit. A record
// older than `maxAgeMs` is treated as stale and removed; the default matches
// the existing 24 h draft window so a parent who taps "Correct" and comes back
// the next day is not shown the edit-in-flight copy.
export function readEditMode(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined = browserStorage(),
  now = Date.now(),
  maxAgeMs = 24 * 60 * 60 * 1000,
): EditMode | null {
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
    const v2 = editModeSchema.safeParse(value);
    if (v2.success) {
      if (now - v2.data.savedAt > maxAgeMs) {
        storage.removeItem(EDIT_KEY);
        return null;
      }
      return v2.data;
    }
    // v1 fallback: keep the case id/ref so the review page can still re-load
    // the canonical view. The expected version is unknown; the review page
    // must read the live version before PATCHing.
    const v1 = editModeV1Schema.safeParse(value);
    if (v1.success) {
      if (now - v1.data.savedAt > maxAgeMs) {
        storage.removeItem(EDIT_KEY);
        return null;
      }
      return {
        version: 2,
        caseId: v1.data.caseId,
        refCode: v1.data.refCode,
        expectedVersion: 0,
        savedAt: v1.data.savedAt,
      };
    }
    storage.removeItem(EDIT_KEY);
    return null;
  } catch { return null; }
}

export function clearEditMode(storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined = browserStorage()): boolean {
  try { if (!storage) return true; storage.removeItem(EDIT_KEY); return true; } catch { return false; }
}
