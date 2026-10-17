// SCREEN-002 seam to API-001 (transcribe) and API-002 (extract) (TASK-021; D2A §5.5).
//
// The UI talks to an IntakeClient. Until TASK-014/020 land the routes, the page uses
// the labelled fake in ./fakes (client.mock = true, shown as [MOCK]). The HTTP client
// below is the real one; set FERA_INTAKE_CLIENT=live to use it (see the S-002 page).
//
// A client never throws: every failure is a catalogue error envelope (D2B §13), so
// the screen shows catalogue copy only, never response text.
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

export const TRANSCRIBE_API = "/api/intake/transcribe";
export const EXTRACT_API = "/api/intake/extract";
// ponytail: D2A names no multipart part for the audio; "audio" until TASK-014 agrees (OD-021-2).
export const AUDIO_PART = "audio";

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

// BR-004 / FR-007: no audio or text reaches a provider before the on-screen notice is
// acknowledged. The UI never offers capture before that; this wrapper makes a stray
// call fail loudly instead of dispatching.
export function noticeGated(client: IntakeClient, acknowledged: () => boolean): IntakeClient {
  const refuse = () => Promise.reject(new Error("provider notice not acknowledged"));
  return {
    mock: client.mock,
    transcribe: (input, signal) => (acknowledged() ? client.transcribe(input, signal) : refuse()),
    extract: (body, signal) => (acknowledged() ? client.extract(body, signal) : refuse()),
  };
}

// duration_s is a decimal string, 5–120 s (transcribeFieldsSchema).
export function durationField(seconds: number): string {
  return Math.min(LIMITS.audioSeconds.max, Math.max(0, seconds)).toFixed(1);
}

// Statuses without a valid envelope (a proxy, a platform error page) map per endpoint
// (D2B §13). A bare 401 does not distinguish expiry, so use E-002; an E-019
// session-expired envelope from the server is preserved by readResult.
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

// fetch rejects on abort (our 25 s timeout → E-014) or on a network failure (E-024).
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
    res = await fetchImpl(url, { ...init, method: "POST", credentials: "same-origin", cache: "no-store", signal });
  } catch {
    return signal.aborted ? failure("E-014") : failure("E-024");
  }
  return readResult(res, schema, fallbacks);
}

export function createHttpIntakeClient(fetchImpl: typeof fetch = (...args) => fetch(...args)): IntakeClient {
  return {
    mock: false,
    transcribe({ audio, durationS, draftToken }, signal) {
      const form = new FormData();
      form.set("kind", "missing");
      form.set("duration_s", durationField(durationS));
      if (draftToken) form.set("draft_token", draftToken);
      form.set(AUDIO_PART, audio, "voice-note");
      return send(fetchImpl, TRANSCRIBE_API, { body: form }, transcribeResponseSchema, TRANSCRIBE_FALLBACKS, signal);
    },
    extract(body, signal) {
      const init = { body: JSON.stringify(body), headers: { "content-type": "application/json", accept: "application/json" } };
      return send(fetchImpl, EXTRACT_API, init, extractResponseSchema, EXTRACT_FALLBACKS, signal);
    },
  };
}
