// SCREEN-003 edit-mode owner case read (P3-035/ACT017; D2A §5.4/API-004, D2B §13).
// The "Correct details" lane calls API-004 from the device to learn the
// canonical case view before PATCHing API-005. The fetch follows the same
// surface contract the rest of the parent UI uses: the response is parsed
// against the strict `ownerCaseViewSchema`; a non-2xx with a valid envelope is
// returned as the error; everything else maps to the catalogue (E-021 / E-024
// / E-014). The screen renders catalogue copy only (D2B §13).
//
// The header `x-fera-provider-notice: v1` is the same frozen contract value the
// intake client uses; the S-003 page is a parent surface and the same
// acknowledgement rule applies.
import {
  errorEnvelope,
  errorEnvelopeSchema,
  ownerCaseViewSchema,
  type ErrorEnvelope,
  type ErrorId,
  type OwnerCaseView,
} from "@/contracts";
import { PROVIDER_NOTICE_HEADER, PROVIDER_NOTICE_VALUE } from "./http-client";

export type OwnerCaseResult = { ok: true; data: OwnerCaseView } | { ok: false; error: ErrorEnvelope };

// The single explicit seam between the S-003 edit-mode screen and API-004.
// Tests inject a mock fetch via the optional `fetchImpl` argument. The default
// uses the global `fetch` (browser, same-origin). No `OwnerCaseResult` ever
// throws; every failure is a catalogue envelope.
export async function fetchOwnerCase(
  caseId: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): Promise<OwnerCaseResult> {
  let res: Response;
  try {
    res = await fetchImpl(`/api/cases/${encodeURIComponent(caseId)}`, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { accept: "application/json", [PROVIDER_NOTICE_HEADER]: PROVIDER_NOTICE_VALUE },
      signal,
    });
  } catch {
    return signal.aborted ? { ok: false, error: errorEnvelope("E-014") } : { ok: false, error: errorEnvelope("E-024") };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch (err) {
    body = null;
    if (res.ok) console.warn(`owner case: ${err instanceof Error ? err.name : "unknown"}`);
  }
  if (res.ok) {
    const parsed = ownerCaseViewSchema.safeParse(body);
    if (parsed.success) return { ok: true, data: parsed.data };
    console.warn("owner case: ZodError");
    return { ok: false, error: errorEnvelope("E-021") };
  }
  const envelope = errorEnvelopeSchema.safeParse(body);
  if (envelope.success) return { ok: false, error: envelope.data };
  return { ok: false, error: statusErrorFor(res.status) };
}

// 401 here is "session expired" (E-002); 403/404 → E-004 (hidden or
// other-party); 409 → E-005 (stale, but PATCH-only by the catalogue) or
// E-018 (locked); everything else is E-021. The same fallback table the
// intake HTTP client uses (D2B §13), reused so the screen never renders
// server-supplied text.
function statusErrorFor(status: number): ErrorEnvelope {
  const id: ErrorId = status === 401 ? "E-002" : status === 403 || status === 404 ? "E-004" : status === 409 ? "E-005" : status === 429 ? "E-007" : "E-021";
  return errorEnvelope(id as Exclude<ErrorId, "E-007">);
}

// Re-export the schema for tests that want to validate their fake responses.
export { ownerCaseViewSchema };
