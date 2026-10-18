// SCREEN-003 edit-mode pure editing, contract validation and the PATCH submit seam
// (P3-035/ACT017; D2A §5.3/API-005; FR-029, BR-025). The shape mirrors the regular
// review.ts submitter but the dispatch is PATCH /api/cases/:id (not POST
// /api/cases); the request carries the canonical case version from API-004 and
// the reviewed draft + confirmed: true. A stored [MOCK] fake can never reach
// the network: the submitter refuses any draft whose `mock` flag is true.
//
// Submit lifecycle (mirrors review.ts):
//   1. Read the current edit draft; abort on E-024 (storage lost the record).
//   2. Freeze the record as `attempted: true` before dispatch so a second
//      submit cannot race.
//   3. POST the PATCH; 2xx → update the local expected_version to the new
//      version, return the fresh OwnerCaseView.
//   4. Non-2xx with a valid envelope → keep the record (the parent can retry
//      with the same version), or clear it on E-019 (the server says the draft
//      is over).
//   5. Network error → E-024, the local record is kept so the parent can retry
//      without re-reading API-004.
//
// `mock` is a hard block: a stored fake has no live case behind it and
// PATCHing it would only ever fail or, worse, succeed against a different
// case. The submitter never PATCHes when `record.mock === true`.
import {
  errorEnvelope,
  errorEnvelopeSchema,
  fieldsFromZodIssues,
  missingSubmissionDraftSchema,
  ownerCaseViewSchema,
  updateCaseRequestSchema,
  type DraftFieldPath,
  type ErrorEnvelope,
  type OwnerCaseView,
  type UpdateCaseRequest,
} from "@/contracts";
import { toLatinDigits } from "@/lib/numerals";
import { NUMBER_FIELDS, TIME_FIELDS } from "@/lib/intake/review";
import { REQUEST_TIMEOUT_MS } from "@/lib/intake/machine";
import { readEditDraft, saveEditDraft, clearEditDraft, type EditDeviceDraft, type EditDraftStorage } from "@/lib/intake/edit-draft-store";

// Reuse the parent's request timeout constant for the PATCH (25 s; D2A §5.5).
export const EDIT_REQUEST_TIMEOUT_MS = REQUEST_TIMEOUT_MS;

export function editField(record: EditDeviceDraft, path: DraftFieldPath, value: string): EditDeviceDraft {
  return { ...record, edits: { ...record.edits, [path]: value } };
}

// Convert a stored edit record into the reviewed draft the API-005 PATCH
// carries. Mirrors reviewedDraft() in review.ts: numbers parse, time fields are
// ASCII digits, sex defaults to "unknown" rather than null (BR-015).
function reviewedEditDraft(record: EditDeviceDraft) {
  const draft = structuredClone(record.draft);
  if (draft.kind !== "missing") return null;
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

// Same allowlist as the regular review path: a missing submission draft must
// satisfy `missingSubmissionDraftSchema` to be PATCHed.
export function validateEditReview(record: EditDeviceDraft): DraftFieldPath[] {
  const draft = reviewedEditDraft(record);
  if (draft === null) return [];
  const parsed = missingSubmissionDraftSchema.safeParse(draft);
  if (parsed.success) return [];
  const issues = parsed.error.issues.map((issue) => issue.path.join(".") === "event.at_approx" ? { path: ["event", "at"] } : issue);
  return fieldsFromZodIssues(issues) ?? [];
}

// Build the API-005 PATCH body. Returns null when the record is invalid; the
// caller renders E-001 with the listed fields.
export function buildEditSubmission(record: EditDeviceDraft, confirmed: boolean): UpdateCaseRequest | null {
  if (!confirmed) return null;
  if (record.mock) return null; // never PATCH a stored [MOCK] fake
  const draft = reviewedEditDraft(record);
  if (draft === null) return null;
  const parsed = updateCaseRequestSchema.safeParse({
    draft,
    confirmed: true,
    expected_version: record.expectedVersion,
  });
  return parsed.success ? parsed.data : null;
}

export type EditSubmitResult = { ok: true; data: OwnerCaseView; cleared: boolean } | { ok: false; error: ErrorEnvelope; dispatched?: false; cleared?: boolean };

// The default submitter: PATCH /api/cases/:id with the reviewed draft. The
// `mock: true` short-circuit happens before any dispatch. Storage is the
// device-local edit-draft store; the regular review draft store is not
// touched (an edit must never turn into a new report POST).
export function createEditSubmitter(fetcher: typeof fetch = fetch, storage: EditDraftStorage | undefined) {
  let busy = false;
  return async (record: EditDeviceDraft, confirmed: boolean, requiresStorage = false): Promise<EditSubmitResult | null> => {
    if (busy) return null;
    if (record.mock) return { ok: false, error: errorEnvelope("E-021"), dispatched: false };
    if (!confirmed) return { ok: false, error: errorEnvelope("E-001", { fields: validateEditReview(record) }) };
    const fields = validateEditReview(record);
    if (fields.length > 0) return { ok: false, error: errorEnvelope("E-001", { fields }) };
    const body = buildEditSubmission(record, true);
    if (body === null) return { ok: false, error: errorEnvelope("E-001", { fields }) };
    // Read the live storage; a missing record (storage cleared between hydration
    // and submit) is an offline E-024, never a network call.
    const current = readEditDraft(storage);
    if (current.unreadable) return { ok: false, error: errorEnvelope("E-024"), dispatched: false };
    if (current.draft === null || (requiresStorage && current.draft === null)) {
      return { ok: false, error: errorEnvelope("E-024"), dispatched: false };
    }
    if (current.draft.caseId !== record.caseId) {
      // A different case's record is in storage; never overwrite it.
      return { ok: false, error: errorEnvelope("E-024"), dispatched: false };
    }
    // Freeze the attempt before dispatch; second submit on the same case is
    // impossible without a new attempt-cycle.
    const frozen = saveEditDraft({ ...record, attempted: true }, storage, record.caseId, { requireExisting: requiresStorage });
    if (!frozen && (requiresStorage || current.draft !== null)) {
      return { ok: false, error: errorEnvelope("E-024"), dispatched: false };
    }
    busy = true;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), EDIT_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetcher(`/api/cases/${encodeURIComponent(record.caseId)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          // The provider-notice header is the same frozen contract value used
          // for the parent's first report; API-005 in another lane verifies
          // the same way.
          "x-fera-provider-notice": "v1",
        },
        body: JSON.stringify(body),
        signal: abort.signal,
      });
      let parsedJson: unknown = null;
      try { parsedJson = await response.json(); } catch { parsedJson = null; }
      if (response.status === 200) {
        const view = ownerCaseViewSchema.safeParse(parsedJson);
        if (!view.success) return { ok: false, error: errorEnvelope("E-021") };
        // Success: clear the local edit draft and the edit-mode pointer. The
        // review page routes to /status with a "Correction submitted" notice;
        // the pointer is gone so a refresh does not re-enter edit mode.
        const cleared = clearEditDraft(storage);
        return { ok: true, data: view.data, cleared };
      }
      const envelope = errorEnvelopeSchema.safeParse(parsedJson);
      if (!envelope.success) return { ok: false, error: errorEnvelope("E-021") };
      const inner = envelope.data.error;
      // E-019 (session expired) from API-005: the local draft is no longer
      // live, drop the device record so a refresh does not re-enter edit mode.
      if (inner.id === "E-019") {
        const cleared = clearEditDraft(storage);
        return { ok: false, error: envelope.data, cleared };
      }
      // E-001 on the reviewed draft: unlock the attempt so the parent can
      // fix the fields and retry.
      if (inner.id === "E-001") {
        saveEditDraft({ ...record, attempted: false }, storage, record.caseId, { transition: "validation-refused", requireExisting: true });
      }
      // Rebuild catalogue copy from the parsed inner; never render server-supplied text.
      const safeError = inner.id === "E-007"
        ? errorEnvelope("E-007", { seconds: 30 })
        : inner.id === "E-001"
          ? errorEnvelope("E-001", { fields: inner.fields })
          : errorEnvelope(inner.id);
      return { ok: false, error: safeError };
    } catch {
      return { ok: false, error: errorEnvelope("E-024") };
    } finally { clearTimeout(timer); busy = false; }
  };
}
