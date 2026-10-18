// SCREEN-003 edit-mode device-local review draft (P3-035/ACT017; D2A §5.3/API-005,
// D2A §5.4/API-004; FR-029, BR-004/025). The "Correct details" lane hydrates a
// device-local review draft from the canonical owner view (API-004) and edits it
// before PATCHing API-005. The draft lives on this device only; it never leaves
// the tab. The review submit path patches `/api/cases/:id`, never `/api/cases`.
// PATCH cannot create a new report (D2A §5.3: API-005 is the only edit route),
// so a stored [MOCK] fake that somehow reached this draft must not be PATCHed.
//
// Storage shape (Zod-parsed on read; corrupt records are cleared):
//   {
//     version: 1,
//     caseId: <uuid>,            // the case being edited
//     expectedVersion: <int>,    // the version API-004 returned; the PATCH carries it
//     sourceText: <string>,      // mirror of draft.source_text
//     draft: <CaseDraft>,        // the missing case draft; null is rejected (E-018 lock)
//     edits: { path -> string }, // pending field edits, applied on submit
//     approximate: <bool>,       // at_approx from the draft
//     attempted: <bool>,         // a PATCH is in flight / has been attempted; blocks a second submit
//     savedAt: <epoch ms>,       // for staleness sweep
//     expiresAt: <epoch ms>,     // 24 h window from hydration
//     mock: <bool>,              // true if a stored [MOCK] fake (never dispatched)
//   }
//
// No child payload, no phone, no name, no source_text snippet in the URL. The
// record is keyed by the device-local `EDIT_DRAFT_KEY`; the read path is
// idempotent and never carries the value to the server.
import { z } from "zod";
import { caseDraftSchema, draftFieldPathSchema, uuidSchema, versionSchema } from "@/contracts";
import type { OwnerCaseView } from "@/contracts";

export const EDIT_DRAFT_KEY = "fera.intake.edit-draft.v1";

const editDraftSchema = z.strictObject({
  version: z.literal(1),
  caseId: uuidSchema,
  expectedVersion: versionSchema,
  sourceText: z.string().max(20_000),
  draft: caseDraftSchema,
  edits: z.partialRecord(draftFieldPathSchema, z.string().max(20_000)),
  approximate: z.boolean(),
  attempted: z.boolean(),
  savedAt: z.number().finite(),
  expiresAt: z.number().finite(),
  mock: z.boolean(),
});
export type EditDeviceDraft = z.infer<typeof editDraftSchema>;
export type EditDraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): EditDraftStorage | undefined {
  try { return typeof window === "undefined" ? undefined : window.localStorage; } catch { return undefined; }
}

// The view is the canonical source; we never invent fields the server did not
// return. Returns null when the case is locked (E-018, editable: false or
// draft: null) so the page renders the catalogue notice instead of an editable
// form. The `expectedVersion` from the view is the one the PATCH will carry; a
// subsequent API-004 re-read (after E-005) replaces the local version so the
// next PATCH uses the live number.
export function editDraftFromOwnerView(view: OwnerCaseView, now = Date.now()): EditDeviceDraft | null {
  if (!view.editable || view.draft === null) return null;
  if (view.draft.kind !== "missing") return null;
  // D2A §5.4: `version` is the row's optimistic-lock version. The PATCH carries
  // the same number, so any concurrent server change rejects with E-005.
  const expiresAt = now + 24 * 60 * 60 * 1000;
  return {
    version: 1,
    caseId: view.id,
    expectedVersion: view.version,
    sourceText: view.draft.source_text,
    draft: view.draft,
    edits: {},
    approximate: view.draft.event.at_approx,
    attempted: false,
    savedAt: now,
    expiresAt,
    mock: false,
  };
}

export function readEditDraft(
  storage: EditDraftStorage | undefined = browserStorage(),
  now = Date.now(),
): { draft: EditDeviceDraft | null; available: boolean; expiredId?: string; unreadable?: true } {
  try {
    if (!storage) return { draft: null, available: false };
    const raw = storage.getItem(EDIT_DRAFT_KEY);
    if (raw === null) return { draft: null, available: true };
    let value: unknown;
    try { value = JSON.parse(raw); } catch { return { draft: null, available: clearEditDraft(storage) }; }
    const parsed = editDraftSchema.safeParse(value);
    if (!parsed.success) {
      // Corrupt or future-shape record: drop and move on.
      return { draft: null, available: clearEditDraft(storage) };
    }
    if (parsed.data.expiresAt <= now || parsed.data.savedAt > now) {
      return { draft: null, available: clearEditDraft(storage), expiredId: parsed.data.caseId };
    }
    return { draft: parsed.data, available: true };
  } catch { return { draft: null, available: false, unreadable: true }; }
}

export function loadEditDraft(storage: EditDraftStorage | undefined = browserStorage(), now = Date.now()): EditDeviceDraft | null {
  return readEditDraft(storage, now).draft;
}

// expectedCaseId guards against a stale record pointing at a different case
// (e.g. the user opened two tabs and Corrected a different report between
// reads). The transition vocabulary mirrors the regular draft store so the
// retry path stays symmetric.
export function saveEditDraft(
  record: EditDeviceDraft,
  storage: EditDraftStorage | undefined = browserStorage(),
  expectedCaseId: string | null = record.caseId,
  options: { transition?: "validation-refused" | "payload-conflict" | "discard-replace"; requireExisting?: boolean } = {},
): boolean {
  try {
    if (!storage) return false;
    const next = editDraftSchema.parse(record);
    const raw = storage.getItem(EDIT_DRAFT_KEY);
    if (raw === null && options.requireExisting) return false;
    if (raw !== null) {
      let value: unknown;
      try { value = JSON.parse(raw); } catch { return false; }
      const current = editDraftSchema.safeParse(value);
      if (current.success) {
        if (current.data.caseId !== expectedCaseId) return false;
        if (current.data.attempted) {
          if (next.caseId !== current.data.caseId) {
            if (options.transition !== "payload-conflict" && options.transition !== "discard-replace") return false;
          } else {
            // Mirror the regular draft store: an attempted record can only be
            // re-saved while it stays the same case and same payload.
            if (!next.attempted && options.transition !== "validation-refused") return false;
            const snapshot = (d: EditDeviceDraft) => JSON.stringify({ ...d, attempted: false });
            if (snapshot(current.data) !== snapshot(next)) return false;
          }
        }
      }
    }
    storage.setItem(EDIT_DRAFT_KEY, JSON.stringify(next));
    return true;
  } catch { return false; }
}

// Replace a frozen stale-version attempt only after a fresh API-004 response.
// This keeps a second tab from overwriting newer local edits: the stored
// attempted snapshot must still match the record that was shown to this screen.
export function refreshEditDraftAfterConflict(
  expected: EditDeviceDraft,
  refreshed: EditDeviceDraft,
  storage: EditDraftStorage | undefined = browserStorage(),
): boolean {
  try {
    if (!storage) return false;
    const raw = storage.getItem(EDIT_DRAFT_KEY);
    if (raw === null) return false;
    const current = editDraftSchema.safeParse(JSON.parse(raw));
    const next = editDraftSchema.safeParse(refreshed);
    if (!current.success || !next.success) return false;
    if (!current.data.attempted || current.data.caseId !== expected.caseId || next.data.caseId !== expected.caseId) return false;
    const snapshot = (record: EditDeviceDraft) => JSON.stringify({ ...record, attempted: false });
    if (snapshot(current.data) !== snapshot({ ...expected, attempted: true })) return false;
    if (next.data.attempted || next.data.expectedVersion < current.data.expectedVersion) return false;
    storage.setItem(EDIT_DRAFT_KEY, JSON.stringify(next.data));
    return true;
  } catch { return false; }
}

export function clearEditDraft(storage: EditDraftStorage | undefined = browserStorage()): boolean {
  try { if (!storage) return true; storage.removeItem(EDIT_DRAFT_KEY); return true; } catch { return false; }
}

// An attempted record shares the same 24 h bound as a fresh edit (D3:333, A-016).
// A readable, attempted, expired record is removed; corrupt or unreadable
// storage still keeps the record.
export function sweepEditDrafts(storage: EditDraftStorage | undefined = browserStorage(), now = Date.now()): boolean {
  if (!storage) return true;
  return readEditDraft(storage, now).available;
}

// Convert the edit-mode device record into the regular `DeviceDraft` shape the
// existing `ReviewFields` and `ConfirmBar` components consume. The same source
// text, edits and `at_approx` are passed through; `client_submission_id` is
// the case UUID (PATCH is the only dispatch path, so the dedupe key is the
// case itself, not a fresh UUID). `cached` is always false (an edit never
// returns a cached reply) and `mock` is the edit record's flag (always false
// from API-004; a stored [MOCK] fake cannot reach the network — see
// edit-review.ts).
import type { DeviceDraft } from "./draft-store";
export function editDraftToDeviceDraft(record: EditDeviceDraft): DeviceDraft {
  return {
    version: 1,
    draft: record.draft,
    sourceText: record.sourceText,
    client_submission_id: record.caseId,
    savedAt: record.savedAt,
    expiresAt: record.expiresAt,
    edits: record.edits,
    approximate: record.approximate,
    attempted: record.attempted,
    mock: record.mock,
    cached: false,
  };
}
