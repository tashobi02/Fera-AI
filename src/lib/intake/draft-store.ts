// TASK-022 / BR-004: device storage only. Never import this module in a server route.
import { z } from "zod";
import { caseDraftSchema, draftFieldPathSchema, draftTokenSchema, uuidSchema } from "@/contracts";
import type { IntakeHandoff } from "./handoff";

export const DRAFT_KEY = "fera.intake.review.v1";
const storedDraftSchema = z.strictObject({
  version: z.literal(1),
  draft: caseDraftSchema,
  sourceText: z.string().max(20_000),
  client_submission_id: uuidSchema,
  savedAt: z.number().finite(),
  expiresAt: z.number().finite(),
  draftToken: draftTokenSchema.optional(),
  edits: z.partialRecord(draftFieldPathSchema, z.string().max(20_000)),
  approximate: z.boolean(),
  attempted: z.boolean(),
  mock: z.boolean(),
  cached: z.boolean(),
});
export type DeviceDraft = z.infer<typeof storedDraftSchema>;
export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): DraftStorage | undefined {
  try { return typeof window === "undefined" ? undefined : window.localStorage; } catch { return undefined; }
}

export function createDeviceDraft(handoff: IntakeHandoff, now = Date.now()): DeviceDraft | null {
  if (!handoff.response || handoff.response.draft.kind !== "missing") return null;
  return {
    version: 1, draft: handoff.response.draft, sourceText: handoff.sourceText,
    client_submission_id: crypto.randomUUID(), savedAt: now,
    expiresAt: Date.parse(handoff.response.expires_at), draftToken: handoff.response.draft_token,
    edits: {}, approximate: handoff.response.draft.event.at_approx, attempted: false,
    mock: handoff.mock, cached: handoff.cached,
  };
}

export function clearDraft(storage = browserStorage()): boolean {
  try { if (!storage) return false; storage.removeItem(DRAFT_KEY); return true; } catch { return false; }
}
// expectedId is supplied only for an intentional replacement (new handoff/new ID).
export function saveDraft(record: DeviceDraft, storage = browserStorage(), expectedId: string | null = record.client_submission_id,
  options: { transition?: "validation-refused" | "payload-conflict"; requireExisting?: boolean } = {}): boolean {
  try {
    if (!storage) return false;
    const next = storedDraftSchema.parse(record);
    const raw = storage.getItem(DRAFT_KEY);
    if (raw === null && options.requireExisting) return false;
    if (raw !== null) {
      const current = storedDraftSchema.safeParse(JSON.parse(raw));
      if (current.success) {
        if (current.data.client_submission_id !== expectedId) return false;
        if (current.data.attempted) {
          if (next.client_submission_id !== current.data.client_submission_id) {
            if (options.transition !== "payload-conflict") return false;
          } else {
            const snapshot = (d: DeviceDraft) => JSON.stringify({ ...d, attempted: false });
            if (snapshot(current.data) !== snapshot(next)) return false;
            if (!next.attempted && options.transition !== "validation-refused") return false;
          }
        }
      }
    }
    storage.setItem(DRAFT_KEY, JSON.stringify(next));
    return true;
  } catch { return false; }
}
export function readDraft(storage = browserStorage(), now = Date.now()): { draft: DeviceDraft | null; available: boolean } {
  try {
    if (!storage) return { draft: null, available: false };
    const raw = storage.getItem(DRAFT_KEY);
    if (raw === null) return { draft: null, available: true };
    const parsed = storedDraftSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.expiresAt <= now || parsed.data.savedAt > now) {
      return { draft: null, available: clearDraft(storage) };
    }
    return { draft: parsed.data, available: true };
  } catch { clearDraft(storage); return { draft: null, available: false }; }
}
export function loadDraft(storage = browserStorage(), now = Date.now()): DeviceDraft | null {
  return readDraft(storage, now).draft;
}

// A request finishing in an old tab must not remove a replacement draft.
export function clearSubmittedDraft(id: string, storage = browserStorage()): boolean {
  try {
    if (!storage) return false;
    const raw = storage.getItem(DRAFT_KEY);
    if (raw !== null) {
      const parsed = storedDraftSchema.safeParse(JSON.parse(raw));
      if (parsed.success && parsed.data.client_submission_id !== id) return true;
    }
    return clearDraft(storage);
  } catch { return false; }
}
