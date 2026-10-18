import type { ErrorEnvelope } from "@/contracts";

export interface SttProvider {
  readonly name: string;
  transcribe(
    audio: { bytes: Uint8Array; mime: string },
    opts: { signal: AbortSignal },
  ): Promise<{ text: string }>;
}

export type RawSttDispatch = (
  provider: SttProvider,
  audio: { bytes: Uint8Array; mime: string },
  opts: { signal: AbortSignal },
) => Promise<{ text: string }>;

declare const sttDispatchBrand: unique symbol;
// Branded so a bare `provider.transcribe` pass-through does not type-check. TASK-014/API-001
// must brand the function that enforces the provider-notice check (BR-004, TC-060) and wraps
// each attempt in `reserve_ai_call` / `runPaidCall` (in TASK-063, PR #22, not yet merged) (BR-023, TC-043).
export type SttDispatch = RawSttDispatch & { readonly [sttDispatchBrand]: true };
export const brandSttDispatch = (dispatch: RawSttDispatch): SttDispatch =>
  dispatch as SttDispatch;

export type SttErrorId = "E-010" | "E-011" | "E-014" | "E-021";
export type SttFailureReason = "unavailable" | "unexpected" | "timeout";
export type SttOutcome =
  | "ok"
  | "unintelligible"
  | "timeout"
  | "unavailable"
  | "unexpected"
  | "aborted"
  | "refused";

// Allowlist-safe log entry: only event name, slot, attempt, duration_ms, error_id,
// fixed error class name and outcome. NEVER transcript, audio, size or messages.
export type SttLogEntry = Readonly<{
  event: "speech.attempt" | "speech.summary";
  slot?: "primary" | "fallback";
  attempt?: 1;
  duration_ms?: number;
  error_id?: SttErrorId | "E-019" | "E-023";
  err_name?: string;
  outcome?: SttOutcome;
  ok?: boolean;
}>;

export type TranscribeResult =
  | { ok: true; text: string }
  | {
      ok: false;
      error: ErrorEnvelope;
      failure?: SttFailureReason;
    };

export type SttResult = TranscribeResult;

// A known provider failure (e.g. 5xx, connection error, DNS failure).
export class SttFailure extends Error {
  constructor(readonly status?: number, options?: { cause?: unknown }) {
    super("STT provider failure", options);
    this.name = "SttFailure";
  }
}

// STT operation timeout (D2A §4 line 182, D2B §13 line 157: 25 s -> E-014).
export class SttTimeoutError extends Error {
  constructor(message = "STT operation timed out") {
    super(message);
    this.name = "SttTimeoutError";
  }
}

// A reservation or expiry refusal from the dispatch seam (BR-023 budget cap or expired session).
export class DispatchRefused extends Error {
  constructor(readonly errorId: "E-019" | "E-023") {
    super("Speech dispatch refused");
    this.name = "DispatchRefused";
  }
}
