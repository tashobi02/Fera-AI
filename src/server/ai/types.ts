import type { CaseDraft, ErrorEnvelope } from "@/contracts";
import type { ExtractField, ExtractInput } from "./contract";

export type PromptTemplate = Readonly<{ version: string; review_status: "needs_review"; sha256: string; text: string }>;

export type ProviderOptions = Readonly<{ signal: AbortSignal }>;
export type ProviderRequest = Readonly<{
  input: Readonly<ExtractInput>;
  temperature: 0;
  tools: readonly [];
  repair: boolean;
  prompt: PromptTemplate;
  messages: readonly Readonly<{ role: "system" | "user"; content: string }>[];
}>;

export interface LLMProvider {
  readonly name: string;
  extract(request: ProviderRequest, options: ProviderOptions): Promise<unknown>;
}

export type RawDispatch = (provider: LLMProvider, request: ProviderRequest, options: ProviderOptions) => Promise<unknown>;
declare const dispatchBrand: unique symbol;
// Branded so a bare `provider.extract` pass-through does not type-check. TASK-020 must brand the
// function that does the notice check and runPaidCall (reserve/settle each attempt) for every dispatch.
export type ProviderDispatch = RawDispatch & { readonly [dispatchBrand]: true };
export const brandProviderDispatch = (dispatch: RawDispatch): ProviderDispatch => dispatch as ProviderDispatch;

export type AiErrorId = "E-012" | "E-013" | "E-014";
export type AiOutcome = "ok" | "invalid" | "timeout" | "unavailable" | "unexpected" | "check_bug" | "aborted" | "refused";
export type AiDropReason = "type_mismatch" | "span_mismatch" | "uncertain" | "conflict";
export type AiDropped = Readonly<{ field: ExtractField; reason: AiDropReason }>;
export type AiInvalidReason = "non_json" | "schema_mismatch";
export type AiInputReason = "zod" | "normalise_status" | "normalised_text_mismatch";
// Only enumerated codes, counts, error class/code and contract field paths: never messages or text.
export type AiLogEntry = Readonly<{
  event: "ai.attempt" | "ai.summary" | "ai.input_rejected";
  slot?: "primary" | "fallback";
  attempt?: 1 | 2;
  latency_ms?: number;
  outcome?: AiOutcome;
  error_id?: AiErrorId | "E-001" | "E-019" | "E-023";
  status?: number;
  err_name?: string;
  err_code?: string;
  reason?: AiInvalidReason | AiInputReason;
  dropped?: readonly AiDropped[];
  ok?: boolean;
  tally?: Readonly<Partial<Record<AiOutcome, number>>>;
}>;

export type ExtractionResult =
  | { ok: true; draft: CaseDraft; dropped: readonly AiDropped[] }
  | { ok: false; error: ErrorEnvelope; draft: CaseDraft | null; dropped: readonly AiDropped[]; cause: Error; failure?: AiFailure };

// Non-contract: why an E-013/E-014 result happened, so TASK-020 can tell an outage from a bug.
export type AiFailure = "unavailable" | "unexpected" | "timeout";

// A known provider/network failure from the dispatch seam. Any other throw is a bug.
export class ProviderFailure extends Error {
  // `cause` keeps the original error for the route wrapper; log its class only, never serialise it.
  constructor(readonly status?: number, options?: { cause?: unknown }) {
    super("AI provider failure", options);
    this.name = "ProviderFailure";
  }
}

// A reservation/expiry refusal must stop the sequence; it is not a provider outage.
export class DispatchRefused extends Error {
  constructor(readonly errorId: "E-019" | "E-023") {
    super("AI dispatch refused");
    this.name = "DispatchRefused";
  }
}
