// SCREEN-003 pure editing, contract validation and the sole explicit submit seam.
import {
  createMissingRequestSchema, createMissingResponseSchema, errorEnvelope, errorEnvelopeSchema,
  fieldsFromZodIssues, missingSubmissionDraftSchema,
  type CreateMissingRequest, type CreateMissingResponse, type DraftFieldPath, type ErrorEnvelope,
} from "@/contracts";
import { toLatinDigits } from "@/lib/numerals";
import { clearSubmittedDraft, loadDraft, readDraft, saveDraft, type DeviceDraft, type DraftStorage } from "./draft-store";
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
export type SubmitResult = { ok: true; data: CreateMissingResponse; cleared: boolean } | { ok: false; error: ErrorEnvelope; dispatched?: false };
export function createSubmitter(fetcher: typeof fetch = fetch, storage?: DraftStorage) {
  let busy = false;
  return async (record: DeviceDraft, confirmed: boolean, requiresStorage = false): Promise<SubmitResult | null> => {
    if (busy) return null;
    const body = buildSubmission(record, confirmed);
    if (!body) return { ok: false, error: errorEnvelope("E-001", { fields: validateReview(record) }) };
    const current = readDraft(storage);
    if ((requiresStorage && current.draft === null) || (current.draft && current.draft.client_submission_id !== record.client_submission_id)) {
      return { ok: false, error: errorEnvelope("E-024"), dispatched: false };
    }
    // An existing editable copy must be durably frozen before this can dispatch.
    const saved = saveDraft({ ...record, attempted: true }, storage, record.client_submission_id, { requireExisting: requiresStorage });
    if (!saved && (requiresStorage || current.draft !== null)) {
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
        return { ok: true, data: parsed.data, cleared: clearSubmittedDraft(record.client_submission_id, storage) };
      }
      const parsed = errorEnvelopeSchema.safeParse(json);
      if (!parsed.success) return { ok: false, error: errorEnvelope("E-021") };
      const error = parsed.data.error;
      if (error.id === "E-001" && loadDraft(storage)?.client_submission_id === record.client_submission_id) saveDraft({ ...record, attempted: false }, storage, record.client_submission_id, { transition: "validation-refused", requireExisting: true });
      // Rebuild catalogue copy, never render server-supplied text.
      return { ok: false, error: error.id === "E-007" ? errorEnvelope("E-021") : errorEnvelope(error.id, { fields: error.fields }) };
    } catch {
      return { ok: false, error: errorEnvelope("E-024") };
    } finally { clearTimeout(timer); busy = false; }
  };
}
