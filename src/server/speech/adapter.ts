import { createLogger, levelFor, LOG_EVENTS } from "@/app/api/_shared/log";
import { errorEnvelope } from "@/contracts";
import {
  DispatchRefused,
  SttFailure,
  SttTimeoutError,
  type SttDispatch,
  type SttFailureReason,
  type SttLogEntry,
  type SttProvider,
  type TranscribeResult,
} from "./types";

// D2A:182 (COMP-006), D2B:157 (E-014). Per-attempt scope: OD-014-6.
export const STT_DEFAULT_TIMEOUT_MS = 25_000;
export const STT_MAX_TIMEOUT_MS = 25_000;

const abortError = () => new DOMException("Transcription aborted", "AbortError");

async function dispatchAttempt(
  provider: SttProvider,
  audio: { bytes: Uint8Array; mime: string },
  dispatch: SttDispatch,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<{ text: string }> {
  if (signal?.aborted) throw abortError();
  const controller = new AbortController();
  let cancel!: (reason: Error) => void;
  const cancelled = new Promise<never>((_, reject) => { cancel = reject; });
  const abort = () => { cancel(abortError()); controller.abort(); };
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => {
    cancel(new SttTimeoutError());
    controller.abort();
  }, timeoutMs);
  try {
    // Bounds even a dispatch that ignores cancellation; it cannot forcibly stop its work.
    // Capture synchronous throws as a rejection too. Otherwise a dispatch that aborts
    // the caller and then throws can bypass Promise.race and leave cancelled unobserved.
    const dispatched = new Promise<{ text: string }>((resolve) => {
      resolve(dispatch(provider, audio, { signal: controller.signal }));
    });
    return await Promise.race([cancelled, dispatched]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

// Do not execute getters on provider errors or trust their mutable name/code/cause fields.
function instanceOf<T extends Error>(value: unknown, ctor: abstract new (...args: never[]) => T): value is T {
  try { return value instanceof ctor; } catch { return false; }
}

function safeError(error: unknown): Pick<SttLogEntry, "err_name"> {
  const classes = [SttFailure, SttTimeoutError, TypeError, RangeError, SyntaxError, ReferenceError, URIError, EvalError, Error];
  const match = classes.find((ctor) => instanceOf(error, ctor));
  return match ? { err_name: match.name } : {};
}

function refusalId(error: unknown): "E-019" | "E-023" | undefined {
  if (!instanceOf(error, DispatchRefused)) return undefined;
  try {
    const value: unknown = Object.getOwnPropertyDescriptor(error, "errorId")?.value;
    return value === "E-019" || value === "E-023" ? value : undefined;
  } catch { return undefined; }
}

const projectLog = createLogger();
function defaultSink(entry: SttLogEntry) {
  const level = entry.outcome === "unexpected" ? "error" : levelFor(200, entry.error_id);
  // Log registered speech events through createLogger without bypassing its allowlist.
  projectLog[level]({
    event: entry.event,
    rule: entry.slot,
    duration_ms: entry.duration_ms,
    error_id: entry.error_id,
    err_name: entry.err_name,
    issues: [{ code: entry.outcome ?? (entry.ok ? "ok" : "failed"), path: String(entry.attempt ?? "") }],
  });
}

export type SttAdapterOptions = {
  primary: SttProvider;
  fallback?: SttProvider;
  dispatch: SttDispatch;
  timeoutMs?: number;
  log?: (entry: SttLogEntry) => void;
};

export function createSttAdapter(options: SttAdapterOptions) {
  const requestedTimeout = options.timeoutMs ?? STT_DEFAULT_TIMEOUT_MS;
  const perAttemptTimeoutMs = Number.isFinite(requestedTimeout)
    ? Math.min(Math.max(1, requestedTimeout), STT_MAX_TIMEOUT_MS)
    : STT_DEFAULT_TIMEOUT_MS;
  const sink = options.log ?? defaultSink;
  const log = (entry: SttLogEntry) => {
    try {
      sink(entry);
    } catch {
      // A logging failure must never trigger a second paid dispatch.
      try {
        const fallback: { event: string; failed_event?: string } = {
          event: "speech.log_failed",
        };
        if (entry && (LOG_EVENTS as readonly string[]).includes(entry.event)) {
          fallback.failed_event = entry.event;
        }
        console.error(JSON.stringify(fallback));
      } catch {
        /* logging is best effort */
      }
    }
  };

  return {
    async transcribe(
      audio: { bytes: Uint8Array; mime: string },
      { signal }: { signal?: AbortSignal } = {},
    ): Promise<TranscribeResult> {
      if (signal?.aborted) throw abortError();
      const plan: Array<{ slot: "primary" | "fallback"; provider: SttProvider }> = [
        { slot: "primary", provider: options.primary },
      ];
      if (options.fallback) plan.push({ slot: "fallback", provider: options.fallback });
      let timeout = false;
      let unexpected = false;
      const finish = (result: TranscribeResult, error_id?: SttLogEntry["error_id"]): TranscribeResult => {
        log({
          event: "speech.summary",
          ok: result.ok,
          ...(result.ok ? {} : { error_id, outcome: result.failure }),
        });
        return result;
      };

      try {
        for (const step of plan) {
          if (signal?.aborted) throw abortError();
          const start = performance.now();
          const detail: Omit<SttLogEntry, "event"> = {};
          let done: TranscribeResult | undefined;
          try {
            const res = await dispatchAttempt(step.provider, audio, options.dispatch, perAttemptTimeoutMs, signal);
            if (signal?.aborted) throw abortError();
            if (typeof res?.text !== "string") throw new TypeError("Invalid STT response");
            const text = res.text.trim();
            const stripped = text.replace(/[\u200B\u200C\u200D\u2060]/g, "").trim();
            if (stripped.length === 0) {
              // D2A:182, D2B:153: empty/garbled -> E-010. No guessed text or extra paid attempt.
              Object.assign(detail, { outcome: "unintelligible", error_id: "E-010" });
              done = { ok: false, error: errorEnvelope("E-010") };
            } else {
              Object.assign(detail, { outcome: "ok" });
              done = { ok: true, text };
            }
          } catch (error) {
            if (signal?.aborted) {
              Object.assign(detail, { outcome: "aborted" });
              throw abortError();
            }
            const refusal = refusalId(error);
            if (refusal) {
              Object.assign(detail, { outcome: "refused", error_id: refusal });
              done = { ok: false, error: errorEnvelope(refusal) };
            } else {
              const outcome: SttFailureReason = instanceOf(error, SttTimeoutError)
                ? "timeout" : instanceOf(error, SttFailure) ? "unavailable" : "unexpected";
              timeout ||= outcome === "timeout";
              unexpected ||= outcome === "unexpected";
              // D2B §13:154 E-011 is unavailable; :164 E-021 is INTERNAL, logged at error.
              const error_id = outcome === "timeout" ? "E-014" : outcome === "unavailable" ? "E-011" : "E-021";
              Object.assign(detail, { outcome, error_id, ...safeError(error) });
            }
          } finally {
            log({
              event: "speech.attempt",
              slot: step.slot,
              attempt: 1,
              duration_ms: Math.max(0, Math.round(performance.now() - start)),
              ...detail,
            });
          }
          if (done) return finish(done, detail.error_id);
        }
        // Exhausted mixed failures: preserve bugs first, then timeout, then outage (OD-014-6).
        const failure = unexpected ? "unexpected" : timeout ? "timeout" : "unavailable";
        const error_id = unexpected ? "E-021" : timeout ? "E-014" : "E-011";
        return finish({
          ok: false,
          error: errorEnvelope(error_id),
          failure,
        }, error_id);
      } catch (error) {
        // Caller cancellation is the only rejection; raw provider throws become results above.
        if (signal?.aborted) log({ event: "speech.summary", ok: false, outcome: "aborted" });
        throw error;
      }
    },
  };
}
