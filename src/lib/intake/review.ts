// SCREEN-003 pure editing, contract validation and the sole explicit submit seam.
import {
  createMissingRequestSchema, createMissingResponseSchema, errorEnvelope, errorEnvelopeSchema,
  fieldsFromZodIssues, missingSubmissionDraftSchema,
  type CreateMissingRequest, type CreateMissingResponse, type DraftFieldPath, type ErrorEnvelope,
} from "@/contracts";
import { toLatinDigits } from "@/lib/numerals";
import { clearSubmittedDraft, loadDraft, readDraft, saveDraft, saveSubmittedReference, type DeviceDraft, type DraftStorage } from "./draft-store";
import { REQUEST_TIMEOUT_MS } from "./machine";

export const NUMBER_FIELDS = new Set<DraftFieldPath>(["child.age_years", "child.age_min", "child.age_max", "child.height_cm", "event.district_code"]);
export const TIME_FIELDS = new Set<DraftFieldPath>(["event.at", "event.at_lower", "event.at_upper"]);
export function fieldValue(record: DeviceDraft, path: DraftFieldPath): string {
  if (Object.hasOwn(record.edits, path)) return record.edits[path]!;
  const [group, field] = path.split(".");
  const value = (record.draft[group as "child" | "event" | "reporter"] as Record<string, unknown>)[field];
  return value === null || value === "unknown" ? "" : String(value);
}
export function editField(record: DeviceDraft, path: DraftFieldPath, value: string): DeviceDraft {
  return { ...record, edits: { ...record.edits, [path]: value } };
}
// ponytail: lead working ranges pending human review (OD-022-17).
export const PART_OF_DAY_RANGES = {
  morning: [6, 12], midday: [12, 15], afternoon: [15, 18], evening: [18, 20], night: [20, 30],
} as const;
export type PartOfDay = keyof typeof PART_OF_DAY_RANGES;
export function partOfDayEdits(dateInput: string, part: PartOfDay, now = Date.now()): Partial<Record<DraftFieldPath, string>> | null {
  const date = toLatinDigits(dateInput).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const day = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date) return null;
  const stamp = (hour: number) => {
    const next = new Date(day.getTime() + Math.floor(hour / 24) * 86_400_000);
    return `${next.toISOString().slice(0, 10)}T${String(hour % 24).padStart(2, "0")}:00:00+06:00`;
  };
  const [start, end] = PART_OF_DAY_RANGES[part];
  // at remains mandatory: use the lower bound as the editable representative time.
  const upper = stamp(end);
  // BR-016: a current night must not imply an observation in tomorrow's future.
  const boundedUpper = part === "night" && new Date(upper).getTime() > now
    ? `${new Date(now + 6 * 3_600_000).toISOString().slice(0, 19)}+06:00` : upper;
  return { "event.at": stamp(start), "event.at_lower": stamp(start), "event.at_upper": boundedUpper };
}
export function newSubmission(record: DeviceDraft): DeviceDraft {
  return { ...record, client_submission_id: crypto.randomUUID(), attempted: false };
}

function reviewedDraft(record: DeviceDraft) {
  const draft = structuredClone(record.draft);
  for (const [path, input] of Object.entries(record.edits)) {
    const [group, field] = path.split(".");
    const value = input.trim();
    const converted = NUMBER_FIELDS.has(path as DraftFieldPath)
      ? value === "" ? null : /^\d+$/.test(toLatinDigits(value)) ? Number(toLatinDigits(value)) : NaN
      : TIME_FIELDS.has(path as DraftFieldPath) ? value === "" ? null : toLatinDigits(value)
      : path === "child.sex" ? value || "unknown" : value || null;
    Object.assign(draft[group as "child" | "event" | "reporter"], { [field]: converted });
    delete draft.evidence[path];
  }
  draft.event.at_approx = record.approximate;
  return draft;
}
export function validateReview(record: DeviceDraft): DraftFieldPath[] {
  const parsed = missingSubmissionDraftSchema.safeParse(reviewedDraft(record));
  if (parsed.success) return [];
  const issues = parsed.error.issues.map((issue) => issue.path.join(".") === "event.at_approx" ? { path: ["event", "at"] } : issue);
  return fieldsFromZodIssues(issues) ?? [];
}
export function buildSubmission(record: DeviceDraft, confirmed: boolean): CreateMissingRequest | null {
  if (!confirmed) return null;
  const parsed = createMissingRequestSchema.safeParse({
    draft: reviewedDraft(record), confirmed: true, client_submission_id: record.client_submission_id,
    ...(record.draftToken ? { draft_token: record.draftToken } : {}),
  });
  return parsed.success ? parsed.data : null;
}
export type SubmitResult = { ok: true; data: CreateMissingResponse; cleared: boolean } | { ok: false; error: ErrorEnvelope; dispatched?: false; cleared?: false };
export function createSubmitter(fetcher: typeof fetch = fetch, storage?: DraftStorage) {
  let busy = false;
  return async (record: DeviceDraft, confirmed: boolean, requiresStorage = false): Promise<SubmitResult | null> => {
    if (busy) return null;
    const body = buildSubmission(record, confirmed);
    if (!body) return { ok: false, error: errorEnvelope("E-001", { fields: validateReview(record) }) };
    const current = readDraft(storage);
    if (current.unreadable || current.corruptAttemptedId || (requiresStorage && current.draft === null) || (current.draft && current.draft.client_submission_id !== record.client_submission_id)) {
      return { ok: false, error: errorEnvelope("E-024"), dispatched: false };
    }
    // An existing editable copy must be durably frozen before this can dispatch.
    const saved = saveDraft({ ...record, attempted: true }, storage, record.client_submission_id, { requireExisting: requiresStorage });
    if (!saved && (requiresStorage || current.draft !== null || current.corruptAttemptedId)) {
      return { ok: false, error: errorEnvelope("E-024"), dispatched: false };
    }
    busy = true;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetcher("/api/cases", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: abort.signal });
      const json: unknown = await response.json();
      if (response.status === 200 || response.status === 201) {
        const parsed = createMissingResponseSchema.safeParse(json);
        if (!parsed.success) return { ok: false, error: errorEnvelope("E-021") };
        const referenceSaved = saveSubmittedReference({ id: parsed.data.id, ref: parsed.data.ref_code }, storage);
        // Without a durable reference, retain the attempted UUID for a replay on return.
        return { ok: true, data: parsed.data, cleared: referenceSaved ? clearSubmittedDraft(record.client_submission_id, storage) : !saved && current.draft === null };
      }
      const parsed = errorEnvelopeSchema.safeParse(json);
      if (!parsed.success) return { ok: false, error: errorEnvelope("E-021") };
      const error = parsed.data.error;
      if (error.id === "E-001" && loadDraft(storage)?.client_submission_id === record.client_submission_id) saveDraft({ ...record, attempted: false }, storage, record.client_submission_id, { transition: "validation-refused", requireExisting: true });
      // OD-022-10 (fix round 2, lead-authorised 2026-10-16): on E-019 the server has
      // confirmed the draft lifetime is over; drop the device record. A parent whose
      // submission reached the server but who never saw the 2xx loses the device
      // retry reference. The server copy is unaffected.
      const clearFailed = error.id === "E-019" && !clearSubmittedDraft(record.client_submission_id, storage);
      // Rebuild catalogue copy, never render server-supplied text.
      return { ok: false, error: error.id === "E-007" ? errorEnvelope("E-021") : errorEnvelope(error.id, { fields: error.fields }), ...(clearFailed ? { cleared: false as const } : {}) };
    } catch {
      return { ok: false, error: errorEnvelope("E-024") };
    } finally { clearTimeout(timer); busy = false; }
  };
}
