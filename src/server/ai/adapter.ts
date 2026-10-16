import { ZodError } from "zod";
import { createLogger } from "@/app/api/_shared/log";
import { errorEnvelope } from "@/contracts";
import { normaliseText } from "@/server/normalise";
import { emptyDraft, extractInputSchema, type ExtractField, type ExtractInput } from "./contract";
import { checkOutput, mergePartials } from "./evidence";
import { providerRequest } from "./prompt";
import { DispatchRefused, ProviderFailure, type AiDropped, type AiFailure, type AiErrorId, type AiInputReason, type AiLogEntry, type AiOutcome, type ExtractionResult, type LLMProvider, type ProviderDispatch, type ProviderOptions } from "./types";

// D2 Part B §13, E-014: operation timeout 25 s. Per-dispatch scope: OD-013-2.
export const LLM_TIMEOUT_MS = 25_000;
class ProviderTimeout extends Error {}
const abortError = () => new DOMException("Extraction aborted", "AbortError");

async function dispatchAttempt(provider: LLMProvider, input: ExtractInput, repair: boolean, dispatch: ProviderDispatch, signal?: AbortSignal): Promise<unknown> {
  if (signal?.aborted) throw abortError();
  const controller = new AbortController();
  let cancel!: (reason: Error) => void;
  const cancelled = new Promise<never>((_, reject) => { cancel = reject; });
  const abort = () => { cancel(abortError()); controller.abort(); };
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => { cancel(new ProviderTimeout()); controller.abort(); }, LLM_TIMEOUT_MS);
  try {
    // Race also bounds a provider/dispatch wrapper that fails to observe its signal.
    return await Promise.race([cancelled, dispatch(provider, providerRequest(input, repair), { signal: controller.signal })]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export type LlmAdapterOptions = {
  primary: LLMProvider;
  fallback: LLMProvider;
  dispatch: ProviderDispatch;
  log?: (entry: AiLogEntry) => void;
};

const projectLog = createLogger();
// The project logger's allowlist has no outcome/reason/count keys: the slot goes in `rule`; the outcome
// (with the invalid reason folded in), and counts per drop reason and per outcome go in `issues` (codes
// and small integers only, never field paths or values). The logger keeps at most 5 issues: an attempt
// has 1 outcome entry + at most 4 drop reasons, a summary at most 3 outcomes.
function defaultSink(e: AiLogEntry) {
  const bug = e.outcome === "unexpected" || e.outcome === "check_bug" || (e.tally?.unexpected ?? 0) + (e.tally?.check_bug ?? 0) > 0;
  const level = bug ? "error" : e.error_id || e.ok === false ? "warn" : "info";
  const counts = new Map<string, number>();
  for (const d of e.dropped ?? []) counts.set(d.reason, (counts.get(d.reason) ?? 0) + 1);
  const issues = [
    ...(e.outcome ? [{ code: e.reason ? `${e.outcome}_${e.reason}` : e.outcome, path: "" }] : e.reason ? [{ code: e.reason, path: "" }] : []),
    ...[...counts].map(([code, n]) => ({ code, path: String(n) })),
    ...Object.entries(e.tally ?? {}).map(([code, n]) => ({ code, path: String(n) })),
  ];
  projectLog[level]({
    event: e.event,
    rule: e.slot ? `${e.slot}.${e.attempt === 2 ? "repair" : "first"}` : undefined,
    duration_ms: e.latency_ms, error_id: e.error_id, status: e.status, err_name: e.err_name, err_code: e.err_code,
    issues: issues.length > 0 ? issues : undefined,
  });
}

function ownData(error: unknown, key: string): unknown {
  try { return error !== null && typeof error === "object" ? Object.getOwnPropertyDescriptor(error, key)?.value : undefined; }
  catch { return undefined; }
}
function instanceOf<T extends Error>(value: unknown, ctor: abstract new (...args: never[]) => T): value is T {
  try { return value instanceof ctor; } catch { return false; }
}

// Read only fixed classes and known diagnostic codes. Token syntax alone does not establish
// safe metadata: a provider can put a child's Latin name in error.name or error.code.
const ERROR_CODES = new Set(["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "EPIPE", "ECONNABORTED", "ERR_NETWORK", "ERR_CANCELED", "ERR_BUG"]);
function safeError(error: unknown): Pick<AiLogEntry, "err_name" | "err_code"> {
  try {
    if (!instanceOf(error, Error)) return {};
    const err_name = error instanceof ProviderFailure ? "ProviderFailure"
      : error instanceof TypeError ? "TypeError" : error instanceof RangeError ? "RangeError"
      : error instanceof SyntaxError ? "SyntaxError" : error instanceof ReferenceError ? "ReferenceError"
      : error instanceof URIError ? "URIError" : error instanceof EvalError ? "EvalError"
      : error instanceof ZodError ? "ZodError" : "Error";
    // Never execute accessors, stringify an error, or inspect message/stack/cause here.
    const code: unknown = ownData(error, "code");
    return { err_name, ...(typeof code === "string" && ERROR_CODES.has(code) ? { err_code: code } : {}) };
  } catch {
    return {}; // hostile proxies must not break the manual fallback or its diagnostics
  }
}

export function createLlmAdapter(options: LlmAdapterOptions) {
  const sink = options.log ?? defaultSink;
  const log = (entry: AiLogEntry) => {
    try { sink(entry); } catch (error) {
      // A log failure cannot turn a completed paid call into a second dispatch.
      try { process.stderr.write(`${JSON.stringify({ event: "ai.log_failed", ...safeError(error) })}\n`); } catch { /* no remaining safe sink */ }
    }
  };
  return {
    async extract(rawInput: ExtractInput, { signal }: Partial<ProviderOptions> = {}): Promise<ExtractionResult> {
      if (signal?.aborted) throw abortError();
      const parsed = extractInputSchema.safeParse(rawInput);
      const text = parsed.success ? normaliseText(parsed.data.sourceText) : null;
      if (!parsed.success || text?.status !== "known" || text.value.normalisedText !== parsed.data.normalisedText) {
        const reason: AiInputReason = !parsed.success ? "zod" : text?.status !== "known" ? "normalise_status" : "normalised_text_mismatch";
        log({ event: "ai.input_rejected", error_id: "E-001", reason });
        return { ok: false, error: errorEnvelope("E-001"), draft: null, dropped: [] };
      }
      const input = parsed.data;
      let partial = emptyDraft(input);
      const conflicts = new Set<ExtractField>();
      const dropped = new Map<string, AiDropped>();
      const tally: Partial<Record<AiOutcome, number>> = {};
      let invalid = 0;
      let timeout = false;
      let lastError: AiErrorId = "E-013";
      let failure: AiFailure | undefined;
      let aborted = false;
      const finish = (result: ExtractionResult): ExtractionResult => {
        log({ event: "ai.summary", ok: result.ok, ...(result.ok ? {} : { error_id: result.error.error.id as AiErrorId }), tally });
        return result;
      };
      const fail = (errorId: AiErrorId | "E-019" | "E-023", cause?: unknown): ExtractionResult =>
        ({ ok: false, error: errorEnvelope(errorId), draft: partial, dropped: [...dropped.values()], ...(cause === undefined ? {} : { cause }), ...(failure && errorId !== "E-012" ? { failure } : {}) });
      // An abort after a paid attempt still emits the summary, so the tally shows what was spent.
      const abort = () => { aborted = true; return abortError(); };
      const plan = [
        { slot: "primary", attempt: 1, provider: options.primary },
        { slot: "primary", attempt: 2, provider: options.primary },
        { slot: "fallback", attempt: 1, provider: options.fallback },
      ] as const;
      try {
      for (const step of plan) {
        if (step.slot === "primary" && step.attempt === 2 && lastError !== "E-012") continue;
        if (signal?.aborted) { tally.aborted = (tally.aborted ?? 0) + 1; throw abort(); }
        const start = performance.now();
        const detail: { outcome?: AiOutcome; error_id?: AiLogEntry["error_id"]; reason?: AiLogEntry["reason"]; dropped?: AiDropped[]; status?: number; err_name?: string; err_code?: string } = {};
        let done: ExtractionResult | undefined;
        try {
          const output = await dispatchAttempt(step.provider, input, step.attempt === 2, options.dispatch, signal);
          if (signal?.aborted) throw abort();
          try {
            const checked = checkOutput(output, input, text.value);
            if (checked.dropped.length > 0) detail.dropped = checked.dropped;
            if (checked.valid) {
              detail.outcome = "ok";
              done = { ok: true, draft: checked.draft, dropped: checked.dropped };
            } else {
              for (const d of checked.dropped) dropped.set(`${d.field}:${d.reason}`, d);
              partial = mergePartials(partial, checked.draft, conflicts, input);
              invalid++;
              Object.assign(detail, { outcome: "invalid", error_id: "E-012", reason: checked.invalidReason });
              lastError = "E-012";
            }
          } catch (error) {
            // A bug in the checker must not become a 500 after a paid call: manual form, no further paid call.
            Object.assign(detail, { outcome: "check_bug", error_id: "E-012", ...safeError(error) });
            done = fail("E-012", instanceOf(error, ZodError) ? new Error("ZodError") : error);
          }
        } catch (error) {
          if (signal?.aborted) { detail.outcome = "aborted"; throw abort(); }
          const refusal = instanceOf(error, DispatchRefused) ? ownData(error, "errorId") : undefined;
          if (refusal === "E-019" || refusal === "E-023") {
            Object.assign(detail, { outcome: "refused", error_id: refusal });
            done = fail(refusal);
          } else {
            const knownFailure = instanceOf(error, ProviderFailure);
            const outcome = instanceOf(error, ProviderTimeout) ? "timeout" : knownFailure ? "unavailable" : "unexpected";
            const status = knownFailure ? ownData(error, "status") : undefined;
            const cause = knownFailure ? ownData(error, "cause") : undefined;
            timeout ||= outcome === "timeout";
            failure = outcome;
            lastError = outcome === "timeout" ? "E-014" : "E-013";
            Object.assign(detail, { outcome, error_id: lastError, ...(typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599 ? { status } : {}), ...(outcome === "timeout" ? {} : safeError(cause ?? error)) });
          }
        } finally {
          const outcome = detail.outcome ?? "aborted";
          tally[outcome] = (tally[outcome] ?? 0) + 1;
          log({ event: "ai.attempt", slot: step.slot, attempt: step.attempt, latency_ms: Math.max(0, Math.round(performance.now() - start)), ...detail, outcome });
        }
        if (done) return finish(done);
      }
      // The pack gives homogeneous failures; mixed precedence is recorded in OD-013-3 (the summary tally shows the mix).
      return finish(fail(invalid >= 2 || lastError === "E-012" ? "E-012" : timeout ? "E-014" : "E-013"));
      } catch (error) {
        if (aborted) log({ event: "ai.summary", ok: false, tally });
        throw error;
      }
    },
  };
}
