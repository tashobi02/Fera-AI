// TASK-022 / BR-004: device storage only. Never import this module in a server route.
import { z } from "zod";
import { caseDraftSchema, draftFieldPathSchema, draftTokenSchema, uuidSchema } from "@/contracts";
import type { IntakeHandoff } from "./handoff";

export const DRAFT_KEY = "fera.intake.review.v1";
export const SUBMITTED_KEY = "fera.intake.submitted.v1";

const submittedReferenceSchema = z.strictObject({
  version: z.literal(1),
  id: uuidSchema,
  ref: z.string().min(1),
  savedAt: z.number().finite(),
});

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

export function saveSubmittedReference(data: { id: string; ref: string }, storage = browserStorage(), now = Date.now()): boolean {
  try {
    if (!storage) return false;
    const record = submittedReferenceSchema.parse({
      version: 1, id: data.id, ref: data.ref, savedAt: now,
    });
    storage.setItem(SUBMITTED_KEY, JSON.stringify(record));
    return true;
  } catch { return false; }
}

export function readSubmittedReference(storage = browserStorage()): { id: string; ref: string } | null {
  try {
    if (!storage) return null;
    const raw = storage.getItem(SUBMITTED_KEY);
    if (!raw) return null;
    const parsed = submittedReferenceSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      storage.removeItem(SUBMITTED_KEY);
      return null;
    }
    return { id: parsed.data.id, ref: parsed.data.ref };
  } catch { return null; }
}

export function clearSubmittedReference(storage = browserStorage()): boolean {
  try {
    if (!storage) return true;
    storage.removeItem(SUBMITTED_KEY);
    return true;
  } catch { return false; }
}

export function createDeviceDraft(handoff: IntakeHandoff, now = Date.now()): DeviceDraft | null {
  if (!handoff.response || handoff.response.draft.kind !== "missing") return null;
  const serverExpiry = Date.parse(handoff.response.expires_at);
  const maxExpiry = now + 24 * 60 * 60 * 1000;
  const expiresAt = Number.isFinite(serverExpiry) ? Math.min(serverExpiry, maxExpiry) : maxExpiry;
  return {
    version: 1, draft: handoff.response.draft, sourceText: handoff.sourceText,
    client_submission_id: crypto.randomUUID(), savedAt: now,
    expiresAt, draftToken: handoff.response.draft_token,
    edits: {}, approximate: handoff.response.draft.event.at_approx, attempted: false,
    mock: handoff.mock, cached: handoff.cached,
  };
}

export function clearDraft(storage = browserStorage()): boolean {
  try { if (!storage) return true; storage.removeItem(DRAFT_KEY); return true; } catch { return false; }
}
// expectedId is supplied only for an intentional replacement (new handoff/new ID).
export function saveDraft(record: DeviceDraft, storage = browserStorage(), expectedId: string | null = record.client_submission_id,
  options: { transition?: "validation-refused" | "payload-conflict" | "discard-replace"; requireExisting?: boolean } = {}): boolean {
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
            if (options.transition !== "payload-conflict" && options.transition !== "discard-replace") return false;
          } else {
            const snapshot = (d: DeviceDraft) => JSON.stringify({ ...d, attempted: false });
            if (snapshot(current.data) !== snapshot(next)) return false;
            if (!next.attempted && options.transition !== "validation-refused") return false;
          }
        }
      } else if (attemptedIdentity(JSON.parse(raw))) return false;
    }
    storage.setItem(DRAFT_KEY, JSON.stringify(next));
    return true;
  } catch { return false; }
}
function attemptedIdentity(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("attempted" in value) || value.attempted !== true
    || !("client_submission_id" in value)) return null;
  const parsed = uuidSchema.safeParse(value.client_submission_id);
  return parsed.success ? parsed.data : null;
}
export function readDraft(storage = browserStorage(), now = Date.now()): { draft: DeviceDraft | null; available: boolean; unreadable?: true; corruptAttemptedId?: string | null; expiredId?: string } {
  try {
    if (!storage) return { draft: null, available: false };
    const raw = storage.getItem(DRAFT_KEY);
    if (raw === null) return { draft: null, available: true };
    let value: unknown;
    try { value = JSON.parse(raw); } catch { return { draft: null, available: clearDraft(storage) }; }
    const parsed = storedDraftSchema.safeParse(value);
    if (!parsed.success) {
      const corruptAttemptedId = attemptedIdentity(value);
      if (corruptAttemptedId) {
        return { draft: null, available: true, corruptAttemptedId };
      }
      return { draft: null, available: clearDraft(storage) };
    }
    // W1/OD-022-10 (fix round 2, lead-authorised 2026-10-16): attempted records share the
    // same 24 h bound as other drafts (D3:333, A-016). A readable, attempted, expired
    // record is removed. Corrupt or unreadable storage still keeps the record.
    if (parsed.data.expiresAt <= now || parsed.data.savedAt > now) {
      return { draft: null, available: clearDraft(storage), expiredId: parsed.data.client_submission_id };
    }
    return { draft: parsed.data, available: true };
  } catch { return { draft: null, available: false, unreadable: true }; }
}
export function loadDraft(storage = browserStorage(), now = Date.now()): DeviceDraft | null {
  return readDraft(storage, now).draft;
}

// W4: reuse the same retention rules as review restore, including corrupt attempts.
export function sweepDrafts(storage = browserStorage(), now = Date.now()): boolean {
  if (!storage) return true;
  return readDraft(storage, now).available;
}

// A request finishing in an old tab must not remove a replacement draft.
export function clearSubmittedDraft(id: string, storage = browserStorage()): boolean {
  try {
    if (!storage) return true;
    const raw = storage.getItem(DRAFT_KEY);
    if (raw !== null) {
      const parsed = storedDraftSchema.safeParse(JSON.parse(raw));
      const currentId = parsed.success ? parsed.data.client_submission_id : attemptedIdentity(JSON.parse(raw));
      if (currentId && currentId !== id) return true;
    }
    return clearDraft(storage);
  } catch { return false; }
}
