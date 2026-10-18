// SCREEN-002/003 default live client (P3-035; D2A §5.5, D2B §13, BR-004, FR-007,
// TC-060). The previous default was the labelled [MOCK] fake; the real HTTP client
// is now the default for production while the fakes stay injected into tests.
//
// The provider-notice acknowledgement is enforced at the screen seam (intake-chat
// wraps this in `noticeGated`), not here. The client itself never re-checks the
// acknowledgement; if a stray caller reaches it without that gate, the missing
// route returns a 404 the same as any other absent endpoint, and the catalogue
// renders E-021 (never server-supplied text). The intake-chat `run` function
// additionally checks `noticeAcknowledged` and resets the state if the gate ever
// fails, so a stray call is visible in the UI rather than silent.
//
// Every request carries `x-fera-provider-notice: v1` so the server (TASK-014/020
// lane) can brand the dispatch as "an acknowledged parent request". The header is
// a frozen, versioned constant; bumping the version is a contract change.
//
// Error envelope contract:
// - a 2xx whose body parses against the strict response schema → `ok: true`;
// - a non-2xx whose body parses against `errorEnvelopeSchema` → `ok: false`,
//   preserving the server's ID, key and message_bn/en (the screen never renders
//   raw server text, but the screen's catalogue lookup reads the same ID);
// - everything else (non-JSON, schema-leak, network error, abort) maps onto the
//   catalogue (E-021 / E-024 / E-014) per endpoint.
//
// BR-023 / E-012 / E-013 / E-023 are the manual-form fallback errors; the
// upstream screen routes those onto the manual form (handoff to /intake/form).
// The state machine and intake-chat already do that — this client only returns
// the envelope.
import { z } from "zod";
import {
  LIMITS,
  errorEnvelope,
  errorEnvelopeSchema,
  extractResponseSchema,
  transcribeResponseSchema,
  type ErrorEnvelope,
  type ErrorId,
  type ExtractRequestInput,
  type ExtractResponse,
  type TranscribeResponse,
} from "@/contracts";

// API-001 / API-002 routes. Frozen contract paths; the server in another lane
// (TASK-014/020) owns the matching handlers.
export const TRANSCRIBE_API = "/api/intake/transcribe";
export const EXTRACT_API = "/api/intake/extract";
// Multipart audio part name. "audio" until TASK-014/020 confirm a different one
// (OD-021-2). The fake and the route must agree.
export const AUDIO_PART = "audio";

// Frozen provider-notice header (P3-035). The version is the header value; the
// server treats any `v1` acknowledgement as a parent that saw the on-screen
// notice for this device, and refuses unauthenticated dispatches.
export const PROVIDER_NOTICE_HEADER = "x-fera-provider-notice";
export const PROVIDER_NOTICE_VALUE = "v1";

export type IntakeResult<T> = { ok: true; data: T } | { ok: false; error: ErrorEnvelope };
export type TranscribeInput = { audio: Blob; durationS: number; draftToken?: string };

export interface IntakeClient {
  readonly mock: boolean; // synthetic local replies, labelled [MOCK] on screen
  transcribe(input: TranscribeInput, signal: AbortSignal): Promise<IntakeResult<TranscribeResponse>>;
  extract(body: ExtractRequestInput, signal: AbortSignal): Promise<IntakeResult<ExtractResponse>>;
}

export function failure(id: Exclude<ErrorId, "E-007">): { ok: false; error: ErrorEnvelope } {
  return { ok: false, error: errorEnvelope(id) };
}

// BR-004 / FR-007 / TC-060: the screen refuses to call before the parent has
// acknowledged the on-screen notice. The wrapper makes a stray call fail loudly
// instead of dispatching; the screen catches it via the `run` function's existing
// notice check and resets to the notice state.
export function noticeGated(client: IntakeClient, acknowledged: () => boolean): IntakeClient {
  const refuse = () => Promise.reject(new Error("provider notice not acknowledged"));
  return {
    mock: client.mock,
    transcribe: (input, signal) => (acknowledged() ? client.transcribe(input, signal) : refuse()),
    extract: (body, signal) => (acknowledged() ? client.extract(body, signal) : refuse()),
  };
}

// duration_s is a decimal string, 5–120 s (transcribeFieldsSchema). Clamp to the
// allowed range so a tiny clock drift or rounding error never crosses the lower
// bound at the server.
export function durationField(seconds: number): string {
  return Math.min(LIMITS.audioSeconds.max, Math.max(0, seconds)).toFixed(1);
}

// A typed Headers bag the transport can override in tests without rebuilding
// RequestInit by hand.
type RequestHeaders = Record<string, string>;

// Statuses without a valid envelope (a proxy, a platform error page) map per
// endpoint (D2B §13). A bare 401 does not distinguish expiry from auth; the
// server's E-019 envelope from /api/cases is the source of truth for expiry,
// but E-002 is preserved here so the parent's session_expired notice shows even
// when the route only sends the status code.
type Fallbacks = { 422: ErrorId; 503: ErrorId };
const TRANSCRIBE_FALLBACKS: Fallbacks = { 422: "E-010", 503: "E-011" };
const EXTRACT_FALLBACKS: Fallbacks = { 422: "E-012", 503: "E-013" };

export function statusError(status: number, retryAfter: string | null, fallbacks: Fallbacks): ErrorEnvelope {
  if (status === 429) {
    const seconds = Number(retryAfter);
    return errorEnvelope("E-007", { seconds: Number.isInteger(seconds) && seconds > 0 ? seconds : 30 });
  }
  const id: ErrorId =
    status === 401 ? "E-002" : status === 413 ? "E-008" : status === 422 ? fallbacks[422] : status === 503 ? fallbacks[503] : status === 504 ? "E-014" : "E-021";
  return errorEnvelope(id as Exclude<ErrorId, "E-007">);
}

async function readResult<T>(res: Response, schema: z.ZodType<T>, fallbacks: Fallbacks): Promise<IntakeResult<T>> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch (err) {
    body = null;
    // Name only: never the body, which may hold the parent's text.
    if (res.ok) console.warn(`intake response: ${err instanceof Error ? err.name : "unknown"}`);
  }
  if (res.ok) {
    const parsed = schema.safeParse(body);
    if (parsed.success) return { ok: true, data: parsed.data };
    // Record keys inside issue paths can contain child payload. Log a fixed name only.
    console.warn("intake response: ZodError");
    return failure("E-021");
  }
  const envelope = errorEnvelopeSchema.safeParse(body);
  if (envelope.success) return { ok: false, error: envelope.data };
  return { ok: false, error: statusError(res.status, res.headers.get("retry-after"), fallbacks) };
}

// Fetch rejects on abort (our 25 s timeout → E-014) or on a network failure (E-024).
async function send<T>(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  schema: z.ZodType<T>,
  fallbacks: Fallbacks,
  signal: AbortSignal,
) {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      ...init,
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      // The provider-notice header is a frozen contract value; every dispatch
      // from this client carries it, including the multipart audio upload.
      headers: { [PROVIDER_NOTICE_HEADER]: PROVIDER_NOTICE_VALUE, ...(init.headers ?? {}) },
      signal,
    });
  } catch {
    return signal.aborted ? failure("E-014") : failure("E-024");
  }
  return readResult(res, schema, fallbacks);
}

// The default live client. Tests inject a mock fetch via the optional
// `fetchImpl` argument; production code uses the global `fetch`. No
// `IntakeResult<T>` here is ever a `throw`: every failure is a catalogue
// envelope, the screen shows catalogue copy only (D2B §13).
export function createHttpIntakeClient(
  fetchImpl: typeof fetch = (...args) => fetch(...args),
  extraHeaders: RequestHeaders = {},
): IntakeClient {
  return {
    mock: false,
    transcribe({ audio, durationS, draftToken }, signal) {
      const form = new FormData();
      form.set("kind", "missing");
      // Client-side duration hint. The server still verifies (D2A §5.5;
      // LIMITS.audioSeconds), so a clock-skewed hint cannot pass an out-of-range
      // value — clamping here only ensures the request itself is well-formed.
      form.set("duration_s", durationField(durationS));
      if (draftToken) form.set("draft_token", draftToken);
      form.set(AUDIO_PART, audio, "voice-note");
      return send(
        fetchImpl,
        TRANSCRIBE_API,
        { body: form, headers: extraHeaders },
        transcribeResponseSchema,
        TRANSCRIBE_FALLBACKS,
        signal,
      );
    },
    extract(body, signal) {
      const init: RequestInit = {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json", accept: "application/json", ...extraHeaders },
      };
      return send(fetchImpl, EXTRACT_API, init, extractResponseSchema, EXTRACT_FALLBACKS, signal);
    },
  };
}
