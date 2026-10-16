import { ApiError } from "@/app/api/_shared/envelope";
import { createLogger, describeError } from "@/app/api/_shared/log";
import type { Principal } from "@/contracts/server";
import { formatUsd, usdMicros, usdSchema } from "./money";
import { safeLogger } from "./safe-log";
import { requirePaidPrincipal, reservePaidCall, settlePaidCall, type PaidReservation, type ReservationRequest, type SpendContext } from "./service";

type ProviderErrorId = "E-012" | "E-013" | "E-014";
type Settlement = "settled" | "retained" | "unsettled";

// D2A COMP-006 (speech) and D2B §13 E-014 (AI operation): 25 seconds.
const MAX_TIMEOUT_MS = 25_000;

// Adapters may report a known bill (including zero). Every other failure is UNKNOWN.
export class PaidProviderFailure extends Error {
  constructor(readonly id: ProviderErrorId, readonly actualUsd: string | null = null) {
    super(id);
    this.name = "PaidProviderFailure";
  }
}

export class PaidCallError extends ApiError {
  constructor(
    id: ProviderErrorId,
    readonly reservation: PaidReservation,
    readonly settlement: Settlement,
    readonly failureSource: "provider" | "settlement",
  ) {
    super(id);
    this.name = "PaidCallError";
  }
}

export type PaidCallOptions = SpendContext & { timeoutMs: number };
export type PaidCallResult<T> = { value: T; reservation: PaidReservation; settlement: Settlement };
type DispatchResult<T> = { value: T; actualUsd: string | null };

// The facts are validated by log.ts and never include text.
const reservationFacts = (reservation: PaidReservation, providerErrorId?: ProviderErrorId) => ({
  route: reservation.apiId,
  reservation_id: reservation.id,
  draft_id: reservation.draftId,
  upper_usd: reservation.upperUsd,
  provider_error_id: providerErrorId,
});

async function settleKnownCost(
  reservation: PaidReservation,
  actualUsd: string | null,
  ctx: SpendContext,
  providerErrorId?: ProviderErrorId,
  timedOut = false,
  providerDiagnostics: ReturnType<typeof describeError> = {},
): Promise<Settlement> {
  const logger = safeLogger(ctx.logger ?? createLogger());
  const facts = { ...reservationFacts(reservation, providerErrorId), ...providerDiagnostics };
  if (actualUsd === null) {
    logger.warn({ event: "spend.retained", ...facts, reason: timedOut ? "timeout" : "unknown_billing" });
    return "retained";
  }
  const actual = usdSchema.safeParse(actualUsd);
  if (!actual.success || usdMicros(actual.data) > usdMicros(reservation.upperUsd)) {
    logger.warn({ event: "spend.retained", ...facts, reason: "bad_actual" });
    return "unsettled";
  }
  try {
    await settlePaidCall(reservation.id, actual.data, ctx, { draft_id: reservation.draftId, route: reservation.apiId });
  } catch (err) {
    // Do not retry/refund an ambiguous settlement, discard paid output, or replace
    // the original provider error ID. Reconciliation remains explicit and internal.
    logger.warn({ event: "spend.retained", ...facts, reason: "settle_failed", ...describeError(err) });
    return "unsettled";
  }
  logger.info({ event: "spend.settled", ...facts });
  return "settled";
}

function observeLateDispatch<T>(work: Promise<DispatchResult<T>>, reservation: PaidReservation, ctx: SpendContext, aborted: boolean): void {
  const logger = safeLogger(ctx.logger ?? createLogger());
  const facts = reservationFacts(reservation);
  // Attach both handlers to the original promise after the timeout wins. Never
  // settle here, even if the late response reports a known bill (OD-063-4/5).
  void work.then((result) => {
    if (typeof result !== "object" || result === null) {
      logger.warn({ event: "spend.late_result", ...facts, reason: "bad_actual" });
      return;
    }
    const actual = usdSchema.safeParse(result.actualUsd);
    if (result.actualUsd === null) {
      logger.warn({ event: "spend.late_result", ...facts, reason: "unknown_billing" });
    } else if (!actual.success || usdMicros(actual.data) > usdMicros(reservation.upperUsd)) {
      logger.warn({ event: "spend.late_result", ...facts, reason: "bad_actual" });
    } else {
      logger.warn({ event: "spend.late_result", ...facts, actual_usd: formatUsd(usdMicros(actual.data)) });
    }
  }, (err: unknown) => {
    logger.warn({
      event: "spend.late_failure",
      ...facts,
      // An abort-induced rejection is ours, not the provider's: no error ID.
      provider_error_id: err instanceof PaidProviderFailure ? err.id : aborted ? undefined : "E-013",
      ...describeError(err),
    });
  }).catch(() => undefined);
}

export async function runPaidCall<T>(
  principal: Principal | null,
  input: ReservationRequest,
  dispatch: (ctx: { signal: AbortSignal }) => Promise<DispatchResult<T>>,
  options: PaidCallOptions,
): Promise<PaidCallResult<T>> {
  requirePaidPrincipal(principal);
  const ctx = { ...options, logger: safeLogger(options.logger ?? createLogger()) };
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > MAX_TIMEOUT_MS) {
    // A server/adapter fault, not a parent's field: keep the manual form (BR-023).
    ctx.logger.error({ event: "spend.bad_input", route: input.apiId, error_id: "E-013", issues: [{ code: "invalid_value", path: "timeoutMs" }] });
    throw new ApiError("E-013");
  }
  const reservation = await reservePaidCall(principal, input, ctx);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  // One invocation only. Every retry/fallback must reserve the consumed revision;
  // replaying the original revision is refused before any provider dispatch.
  const work = Promise.resolve().then(() => dispatch({ signal: controller.signal }));
  let outcome: { result: DispatchResult<T> } | { failure: PaidProviderFailure; diagnostics: ReturnType<typeof describeError> };
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        reject(new PaidProviderFailure("E-014"));
        try { controller.abort(); } catch { /* a throwing abort listener must not stop the timeout */ }
      }, options.timeoutMs);
    });
    const result = await Promise.race([work, timeout]);
    // The reservation has committed: a malformed adapter result is a provider fault (cost UNKNOWN).
    if (typeof result !== "object" || result === null) throw new PaidProviderFailure("E-013");
    outcome = { result };
  } catch (err) {
    if (timedOut) observeLateDispatch(work, reservation, ctx, controller.signal.aborted);
    outcome = { failure: err instanceof PaidProviderFailure ? err : new PaidProviderFailure("E-013"), diagnostics: describeError(err) };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
  if ("failure" in outcome) {
    const { failure } = outcome;
    const settlement = await settleKnownCost(reservation, failure.actualUsd, ctx, failure.id, timedOut, outcome.diagnostics);
    throw new PaidCallError(failure.id, reservation, settlement, settlement === "unsettled" ? "settlement" : "provider");
  }
  const { result } = outcome;
  const settlement = await settleKnownCost(reservation, result.actualUsd, ctx);
  return { value: result.value, reservation, settlement };
}
