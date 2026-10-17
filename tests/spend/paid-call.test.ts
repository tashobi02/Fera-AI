import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "@/app/api/_shared/log";
import { errorEnvelope } from "@/contracts";
import { PaidCallError, PaidProviderFailure, runPaidCall } from "@/server/spend";
import { safeLogger } from "@/server/spend/safe-log";
import { testUser } from "../support/principals";
import { draftId, pgError, principal, request, reservationId, spendFake } from "./fakes";

afterEach(() => vi.useRealTimers());

describe("paid dispatch lifecycle (TASK-063)", () => {
  it("dispatches only after COMMIT and settles the actual cost after success", async () => {
    const f = spendFake();
    const result = await runPaidCall(principal, request, async ({ signal }) => {
      expect(f.calls.at(-1)?.text).toBe("COMMIT");
      expect(signal.aborted).toBe(false);
      return { value: "[MOCK] result", actualUsd: "0.012000" };
    }, { ...f.ctx, timeoutMs: 100 });
    expect(result).toMatchObject({ value: "[MOCK] result", settlement: "settled", reservation: { id: reservationId, revision: 2 } });
    expect(f.sent(/settle_ai_call/)[0].values).toEqual([reservationId, "0.012000"]);
    expect(f.logs.parsed()).toContainEqual(expect.objectContaining({
      event: "spend.settled",
      level: 30,
      route: "API-002",
      reservation_id: reservationId,
      draft_id: draftId,
      upper_usd: "0.100000",
    }));
    expect(f.logs.parsed().filter((l) => l.dropped)).toEqual([]);
  });

  it("never dispatches on a paid refusal or uncertain reservation commit", async () => {
    for (const [failure, id] of [[{ reserveError: pgError("23514", "AI budget exhausted") }, "E-023"], [{ commitError: new Error("[MOCK] lost commit") }, "E-013"]] as const) {
      const f = spendFake(failure);
      const dispatch = vi.fn();
      await expect(runPaidCall(principal, request, dispatch, { ...f.ctx, timeoutMs: 100 })).rejects.toMatchObject({ id });
      expect(dispatch).not.toHaveBeenCalled();
    }
  });

  it("retains a successful call's upper bound when actual billing is UNKNOWN", async () => {
    const f = spendFake();
    expect(await runPaidCall(principal, request, async () => ({ value: "[MOCK]", actualUsd: null }), { ...f.ctx, timeoutMs: 100 })).toMatchObject({ settlement: "retained" });
    expect(f.sent(/settle_ai_call/)).toHaveLength(0);
    expect(f.logs.parsed()).toContainEqual(expect.objectContaining({
      event: "spend.retained",
      level: 40,
      route: "API-002",
      reason: "unknown_billing",
      reservation_id: reservationId,
      draft_id: draftId,
      upper_usd: "0.100000",
    }));
  });

  it("releases a known unbilled failure but keeps the consumed draft revision", async () => {
    const f = spendFake();
    const result = runPaidCall(principal, request, async () => { throw new PaidProviderFailure("E-013", "0.000000"); }, { ...f.ctx, timeoutMs: 100 });
    await expect(result).rejects.toMatchObject({ id: "E-013", failureSource: "provider", reservation: { revision: 2 }, settlement: "settled" });
    expect(f.sent(/settle_ai_call/)[0].values).toEqual([reservationId, "0.000000"]);
    expect(f.logs.parsed()).toContainEqual(expect.objectContaining({
      event: "spend.settled",
      provider_error_id: "E-013",
      reservation_id: reservationId,
      draft_id: draftId,
      upper_usd: "0.100000",
    }));
  });

  it("settles known billed usage even when the provider output is invalid", async () => {
    const f = spendFake();
    await expect(runPaidCall(principal, request, async () => { throw new PaidProviderFailure("E-012", "0.020000"); }, { ...f.ctx, timeoutMs: 100 })).rejects.toMatchObject({ id: "E-012", settlement: "settled" });
    expect(f.sent(/settle_ai_call/)[0].values).toEqual([reservationId, "0.020000"]);
    expect(f.logs.parsed()).toContainEqual(expect.objectContaining({
      event: "spend.settled",
      provider_error_id: "E-012",
      reservation_id: reservationId,
      draft_id: draftId,
      upper_usd: "0.100000",
    }));
  });

  it("retains uncertain failure usage without exposing provider error text", async () => {
    const f = spendFake();
    const providerError = Object.assign(new TypeError("[MOCK] sensitive provider response"), { code: "ECONNRESET" });
    const err = await runPaidCall(principal, request, async () => { throw providerError; }, { ...f.ctx, timeoutMs: 100 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PaidCallError);
    expect(err).toMatchObject({ id: "E-013", failureSource: "provider", settlement: "retained", reservation: { revision: 2 } });
    expect(String(err)).not.toContain("sensitive");
    expect(f.sent(/settle_ai_call/)).toHaveLength(0);
    expect(f.logs.parsed()).toContainEqual(expect.objectContaining({
      event: "spend.retained",
      level: 40,
      route: "API-002",
      reason: "unknown_billing",
      provider_error_id: "E-013",
      reservation_id: reservationId,
      draft_id: draftId,
      upper_usd: "0.100000",
      err_name: "TypeError",
      err_code: "ECONNRESET",
      err_frame: expect.stringMatching(/^paid-call\.test\.ts:\d+$/),
    }));
    expect(f.logs.parsed().filter((l) => l.dropped)).toEqual([]);
    expect(f.logs.lines.join("\n")).not.toContain("sensitive provider response");
  });

  it("times out, aborts dispatch and retains the reservation even if a provider ignores abort", async () => {
    vi.useFakeTimers();
    const f = spendFake();
    let signal: AbortSignal | undefined;
    let resolve!: (value: { value: string; actualUsd: string }) => void;
    const work = runPaidCall<string>(principal, request, (ctx) => {
      signal = ctx.signal;
      return new Promise<{ value: string; actualUsd: string }>((done) => { resolve = done; });
    }, { ...f.ctx, timeoutMs: 25 });
    const check = expect(work).rejects.toMatchObject({ id: "E-014", settlement: "retained" });
    await vi.advanceTimersByTimeAsync(25);
    await check;
    expect(signal?.aborted).toBe(true);
    expect(f.logs.parsed()).toContainEqual(expect.objectContaining({
      event: "spend.retained",
      reason: "timeout",
      provider_error_id: "E-014",
      reservation_id: reservationId,
      draft_id: draftId,
      upper_usd: "0.100000",
    }));
    resolve({ value: "[MOCK] late result", actualUsd: "0.010000" });
    await vi.runAllTimersAsync();
    expect(f.sent(/settle_ai_call/)).toHaveLength(0);
    expect(f.logs.parsed()).toContainEqual(expect.objectContaining({
      event: "spend.late_result",
      route: "API-002",
      actual_usd: "0.010000",
      reservation_id: reservationId,
      draft_id: draftId,
      upper_usd: "0.100000",
    }));
    expect(f.logs.parsed().filter((l) => l.dropped)).toEqual([]);
    expect(f.logs.lines.join("\n")).not.toContain("late result");
  });

  it("returns paid output as unsettled on an ambiguous settlement failure", async () => {
    const f = spendFake({ settleError: new Error("[MOCK] connection lost") });
    const dispatch = vi.fn(async () => ({ value: "[MOCK]", actualUsd: "0.010000" }));
    await expect(runPaidCall(principal, request, dispatch, { ...f.ctx, timeoutMs: 100 })).resolves.toMatchObject({ value: "[MOCK]", settlement: "unsettled" });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(f.sent(/settle_ai_call/)).toHaveLength(1);
    expect(f.logs.parsed()).toContainEqual(expect.objectContaining({
      event: "spend.retained",
      level: 40,
      reason: "settle_failed",
      reservation_id: reservationId,
      draft_id: draftId,
      upper_usd: "0.100000",
      err_name: "ApiError",
    }));
    expect(f.logs.lines.join("\n")).not.toContain("connection lost");
  });

  it.each(["E-012", "E-014"] as const)("preserves %s when known-cost failure settlement also fails", async (id) => {
    const f = spendFake({ settleError: new Error("[MOCK] settlement text") });
    await expect(runPaidCall(principal, request, async () => { throw new PaidProviderFailure(id, "0.010000"); }, { ...f.ctx, timeoutMs: 100 })).rejects.toMatchObject({ id, failureSource: "settlement", settlement: "unsettled" });
    expect(f.logs.parsed()).toContainEqual(expect.objectContaining({
      event: "spend.retained",
      reason: "settle_failed",
      provider_error_id: id,
      reservation_id: reservationId,
      draft_id: draftId,
      upper_usd: "0.100000",
      err_name: "ApiError",
    }));
    expect(f.logs.lines.join("\n")).not.toContain("settlement text");
  });

  it("returns paid output and logs an uncertain settlement COMMIT without retrying", async () => {
    const f = spendFake({ settleCommitError: new Error("[MOCK] lost COMMIT acknowledgement") });
    await expect(runPaidCall(principal, request, async () => ({ value: "[MOCK] paid", actualUsd: "0.010000" }), { ...f.ctx, timeoutMs: 100 })).resolves.toMatchObject({ value: "[MOCK] paid", settlement: "unsettled" });
    expect(f.sent(/settle_ai_call/)).toHaveLength(1);
    expect(f.logs.parsed()).toContainEqual(expect.objectContaining({ event: "spend.commit_uncertain", tx_stage: "commit" }));
    expect(f.logs.parsed()).toContainEqual(expect.objectContaining({
      event: "spend.retained",
      reason: "settle_failed",
      reservation_id: reservationId,
      draft_id: draftId,
      upper_usd: "0.100000",
    }));
    expect(f.logs.lines.join("\n")).not.toContain("acknowledgement");
  });

  it.each(["0.100001", "NaN", "0.0000001", "-1"])("returns paid output and retains budget for bad actual cost %s", async (actualUsd) => {
    const f = spendFake();
    await expect(runPaidCall(principal, request, async () => ({ value: "[MOCK] paid output", actualUsd }), { ...f.ctx, timeoutMs: 100 })).resolves.toMatchObject({ value: "[MOCK] paid output", settlement: "unsettled" });
    expect(f.sent(/settle_ai_call/)).toHaveLength(0);
    expect(f.logs.parsed()).toContainEqual(expect.objectContaining({
      event: "spend.retained",
      reason: "bad_actual",
      reservation_id: reservationId,
      draft_id: draftId,
      upper_usd: "0.100000",
    }));
  });

  it("logs a late dispatch failure without leaking provider text or settling", async () => {
    vi.useFakeTimers();
    const f = spendFake();
    let reject!: (err: Error) => void;
    const work = runPaidCall(principal, request, () => new Promise<never>((_, fail) => { reject = fail; }), { ...f.ctx, timeoutMs: 25 });
    const outcome = work.catch((err: unknown) => err);
    await vi.advanceTimersByTimeAsync(25);
    expect(await outcome).toMatchObject({ id: "E-014", failureSource: "provider", settlement: "retained" });
    reject(new PaidProviderFailure("E-012", "0.010000"));
    await vi.runAllTimersAsync();
    expect(f.logs.parsed()).toContainEqual(expect.objectContaining({
      event: "spend.late_failure",
      provider_error_id: "E-012",
      reservation_id: reservationId,
      draft_id: draftId,
      upper_usd: "0.100000",
      err_name: "PaidProviderFailure",
    }));
    expect(f.sent(/settle_ai_call/)).toHaveLength(0);
  });

  it("sanitises malformed costs in late results", async () => {
    vi.useFakeTimers();
    const f = spendFake();
    let resolve!: (result: { value: string; actualUsd: string }) => void;
    const work = runPaidCall(principal, request, () => new Promise<{ value: string; actualUsd: string }>((done) => { resolve = done; }), { ...f.ctx, timeoutMs: 25 });
    const check = expect(work).rejects.toMatchObject({ id: "E-014" });
    await vi.advanceTimersByTimeAsync(25);
    await check;
    resolve({ value: "[MOCK] payload", actualUsd: "[MOCK] provider text" });
    await vi.runAllTimersAsync();
    expect(f.logs.parsed()).toContainEqual(expect.objectContaining({
      event: "spend.late_result",
      reason: "bad_actual",
      reservation_id: reservationId,
      draft_id: draftId,
      upper_usd: "0.100000",
    }));
    expect(f.logs.lines.join("\n")).not.toContain("[MOCK]");
    expect(f.sent(/settle_ai_call/)).toHaveLength(0);
  });

  it.each([undefined, null, "[MOCK] provider payload"])("logs a late non-object result (%s) with reason bad_actual and does not settle", async (bad) => {
    vi.useFakeTimers();
    const f = spendFake();
    let resolve!: (result: unknown) => void;
    const dispatch = () => new Promise<unknown>((done) => { resolve = done; });
    const work = runPaidCall(principal, request, dispatch as never, { ...f.ctx, timeoutMs: 25 });
    const check = expect(work).rejects.toMatchObject({ id: "E-014" });
    await vi.advanceTimersByTimeAsync(25);
    await check;
    resolve(bad);
    await vi.runAllTimersAsync();
    expect(f.logs.parsed()).toContainEqual(expect.objectContaining({
      event: "spend.late_result",
      reason: "bad_actual",
      reservation_id: reservationId,
      draft_id: draftId,
      upper_usd: "0.100000",
    }));
    const late = f.logs.parsed().find((l) => l.event === "spend.late_result");
    expect(late?.actual_usd).toBeUndefined();
    expect(f.logs.lines.join("\n")).not.toContain("[MOCK]");
    expect(f.sent(/settle_ai_call/)).toHaveLength(0);
  });

  it("reserves each explicit retry/fallback separately using the advanced revision", async () => {
    const f = spendFake();
    const failed = await runPaidCall(principal, request, async () => { throw new PaidProviderFailure("E-013", "0"); }, { ...f.ctx, timeoutMs: 100 }).catch((e: unknown) => e);
    if (!(failed instanceof PaidCallError) || !failed.reservation) throw new Error("expected a reservation");
    const next = spendFake({ revision: 3 });
    await runPaidCall(principal, { ...request, expectedRevision: failed.reservation.revision }, async () => ({ value: "[MOCK] fallback", actualUsd: "0.010000" }), { ...next.ctx, timeoutMs: 100 });
    expect(f.sent(/reserve_ai_call/)).toHaveLength(1);
    expect(next.sent(/reserve_ai_call/)).toHaveLength(1);
  });

  it("runPaidCall forwards the API-007 guard and never dispatches for a parent", async () => {
    const f = spendFake();
    const dispatch = vi.fn();
    await expect(runPaidCall(principal, { ...request, apiId: "API-007" }, dispatch, { ...f.ctx, timeoutMs: 100 })).rejects.toMatchObject({ id: "E-003" });
    expect(dispatch).not.toHaveBeenCalled();
    expect(f.calls).toHaveLength(0);
  });

  it("accepts the pack's 25-second maximum timeout", async () => {
    const f = spendFake();
    await expect(runPaidCall(principal, request, async () => ({ value: "[MOCK]", actualUsd: "0" }), { ...f.ctx, timeoutMs: 25_000 })).resolves.toMatchObject({ settlement: "settled" });
  });

  it.each([0, -1, Infinity, 0.5, 25_001])("maps an invalid server timeout %s to manual-form E-013 before reservation", async (timeoutMs) => {
    const f = spendFake();
    await expect(runPaidCall(principal, request, vi.fn(), { ...f.ctx, timeoutMs })).rejects.toMatchObject({ id: "E-013" });
    expect(errorEnvelope("E-013").error.fallback).toBe("manual_form");
    expect(f.calls).toHaveLength(0);
    expect(f.logs.parsed()).toEqual([expect.objectContaining({ event: "spend.bad_input", level: 50, error_id: "E-013", issues: [{ code: "invalid_value", path: "timeoutMs" }] })]);
  });

  it.each([null, testUser(randomUUID(), "admin"), testUser(randomUUID(), "staff", { isActive: false }), testUser(randomUUID(), "officer", { verified: false })])("preserves principal refusals even with an invalid adapter timeout", async (actor) => {
    const f = spendFake();
    const dispatch = vi.fn();
    await expect(runPaidCall(actor, request, dispatch, { ...f.ctx, timeoutMs: 0 })).rejects.toMatchObject({ id: actor ? "E-003" : "E-002" });
    expect(dispatch).not.toHaveBeenCalled();
    expect(f.calls).toHaveLength(0);
    expect(f.logs.lines).toHaveLength(0);
  });

  it("returns paid output as unsettled when a success reports more than its bound, without settling", async () => {
    const f = spendFake();
    const result = await runPaidCall(principal, request, async () => ({ value: "[MOCK] paid", actualUsd: "0.200000" }), { ...f.ctx, timeoutMs: 100 });
    expect(result).toMatchObject({ value: "[MOCK] paid", settlement: "unsettled", reservation: { id: reservationId } });
    expect(f.sent(/settle_ai_call/)).toHaveLength(0);
    expect(f.logs.parsed()).toContainEqual(expect.objectContaining({
      event: "spend.retained",
      reason: "bad_actual",
      reservation_id: reservationId,
      draft_id: draftId,
      upper_usd: "0.100000",
    }));
  });

  it("logs unknown_billing when a late result reports null actual cost", async () => {
    vi.useFakeTimers();
    const f = spendFake();
    let resolve!: (result: { value: string; actualUsd: string | null }) => void;
    const work = runPaidCall(principal, request, () => new Promise<{ value: string; actualUsd: string | null }>((done) => { resolve = done; }), { ...f.ctx, timeoutMs: 25 });
    const check = expect(work).rejects.toMatchObject({ id: "E-014" });
    await vi.advanceTimersByTimeAsync(25);
    await check;
    resolve({ value: "[MOCK] late unbilled", actualUsd: null });
    await vi.runAllTimersAsync();
    expect(f.logs.parsed()).toContainEqual(expect.objectContaining({
      event: "spend.late_result",
      reason: "unknown_billing",
      reservation_id: reservationId,
      draft_id: draftId,
      upper_usd: "0.100000",
    }));
    expect(f.logs.lines.join("\n")).not.toContain("late unbilled");
  });

  it("never includes provider response text or result payload in any log line", async () => {
    const f = spendFake();
    const sensitivePayload = "[MOCK] SENSITIVE_PAYLOAD_BODY_DATA";
    const sensitiveProvider = "[MOCK] SENSITIVE_PROVIDER_DATA";
    await runPaidCall(principal, request, async () => ({
      value: sensitivePayload,
      actualUsd: "0.010000",
    }), { ...f.ctx, timeoutMs: 100 });
    // Failure path: the provider's own error text must not reach any log line either.
    await runPaidCall(principal, request, async () => { throw new Error(sensitiveProvider); }, { ...f.ctx, timeoutMs: 100 }).catch(() => undefined);
    expect(f.logs.parsed().some((l) => l.event === "spend.retained" && l.provider_error_id === "E-013")).toBe(true);
    expect(f.logs.lines.join("\n")).not.toContain(sensitivePayload);
    expect(f.logs.lines.join("\n")).not.toContain(sensitiveProvider);
  });

  it("drops invalid upper_usd, non-UUID reservation_id and unknown reason in the logger", () => {
    const lines: string[] = [];
    const logger = createLogger((line) => lines.push(line));
    logger.warn({
      event: "spend.retained",
      reservation_id: "not-a-uuid",
      draft_id: draftId,
      upper_usd: "not-a-decimal",
      reason: "unknown_spend_reason" as unknown as "timeout",
      route: "API-002",
    });
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.dropped).toEqual(expect.arrayContaining(["reservation_id", "upper_usd", "reason"]));
    expect(parsed.reservation_id).toBeUndefined();
    expect(parsed.upper_usd).toBeUndefined();
    expect(parsed.reason).toBeUndefined();
    expect(parsed.draft_id).toBe(draftId);
    expect(parsed.route).toBe("API-002");
  });

  it("drops bad actual_usd, provider_error_id and phone-shaped price_id in the logger", () => {
    const lines: string[] = [];
    const logger = createLogger((line) => lines.push(line));
    logger.warn({
      event: "spend.late_result",
      actual_usd: "+8801712345678",
      provider_error_id: "E-001" as unknown as "E-013",
      price_id: "+880 1712-345678",
    });
    logger.warn({ event: "spend.late_result", actual_usd: "0.0123", provider_error_id: "E-014", price_id: "mock-sheet_1" });
    const [bad, good] = lines.map((l) => JSON.parse(l));
    expect(bad.dropped).toEqual(expect.arrayContaining(["actual_usd", "provider_error_id", "price_id"]));
    for (const key of ["actual_usd", "provider_error_id", "price_id"]) expect(bad[key]).toBeUndefined();
    expect(lines[0]).not.toContain("8801712345678");
    expect(good).toMatchObject({ actual_usd: "0.0123", provider_error_id: "E-014", price_id: "mock-sheet_1" });
  });

  it("drops a phone-shaped price_id matching the charset pattern in the logger", () => {
    const lines: string[] = [];
    const logger = createLogger((line) => lines.push(line));
    logger.warn({
      event: "spend.late_result",
      price_id: "01712345678",
    });
    const parsed = JSON.parse(lines[0]);
    expect(parsed.dropped).toContain("price_id");
    expect(parsed.price_id).toBeUndefined();
    expect(lines[0]).not.toContain("01712345678");
  });

  it("safeLogger writes exactly one console.error fallback line with no payload when the logger throws", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const boom = () => { throw new Error("[MOCK] logger failed"); };
      const logger = safeLogger({ info: boom, warn: boom, error: boom });
      logger.info({
        event: "spend.settled",
        reservation_id: reservationId,
        upper_usd: "0.100000",
      });
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const line = errorSpy.mock.calls[0][0];
      expect(JSON.parse(line)).toEqual({
        event: "spend.log_failed",
        failed_event: "spend.settled",
        reservation_id: reservationId,
      });
      expect(line).not.toContain("upper_usd");
      expect(line).not.toContain("0.100000");
      expect(line).not.toContain("[MOCK]");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it.each(["01712345678", "[MOCK] private", "00000000-0000-0000-0000-017123456789"])("drops unsafe fallback fields (%s) when the logger throws", (unsafe) => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const boom = () => { throw new Error("[MOCK] logger failed"); };
      const logger = safeLogger({ info: boom, warn: boom, error: boom });
      logger.warn({ event: unsafe, reservation_id: unsafe } as never);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(JSON.parse(errorSpy.mock.calls[0][0])).toEqual({ event: "spend.log_failed" });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("keeps the paid result when both the logger and fallback console throw", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => { throw new Error("[MOCK] console failed"); });
    try {
      const f = spendFake();
      const boom = () => { throw new Error("[MOCK] logger failed"); };
      const result = await runPaidCall(principal, request, async () => ({ value: "[MOCK] paid", actualUsd: "0.010000" }), {
        pool: f.pool, logger: { info: boom, warn: boom, error: boom }, timeoutMs: 100,
      });
      expect(result).toMatchObject({ value: "[MOCK] paid", settlement: "settled" });
      expect(errorSpy).toHaveBeenCalledTimes(1);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("keeps the paid value when the logger throws, and records a committed settlement as settled", async () => {
    const f = spendFake();
    const boom = () => { throw new Error("[MOCK] logger down"); };
    const ctx = { pool: f.pool, logger: { info: boom, warn: boom, error: boom } };
    const result = await runPaidCall(principal, request, async () => ({ value: "[MOCK] paid", actualUsd: "0.010000" }), { ...ctx, timeoutMs: 100 });
    expect(result).toMatchObject({ value: "[MOCK] paid", settlement: "settled" });
    // Retained path: warn throws too, the provider error ID must survive.
    const retained = runPaidCall(principal, request, async () => { throw new PaidProviderFailure("E-012"); }, { ...ctx, timeoutMs: 100 });
    await expect(retained).rejects.toMatchObject({ id: "E-012", settlement: "retained" });
  });

  it("rolls back when the logger throws during a failing transaction", async () => {
    const f = spendFake({ constraintsError: pgError("23514", "[MOCK] check failed") });
    const boom = () => { throw new Error("[MOCK] logger down"); };
    await expect(runPaidCall(principal, request, vi.fn(), { pool: f.pool, logger: { info: boom, warn: boom, error: boom }, timeoutMs: 100 }))
      .rejects.toMatchObject({ id: expect.stringMatching(/^E-/) });
    expect(f.calls.map((c) => c.text)).toContain("ROLLBACK");
  });

  it("does not leak an unhandled rejection when the logger throws on a late failure", async () => {
    vi.useFakeTimers();
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const f = spendFake();
      const boom = () => { throw new Error("[MOCK] logger down"); };
      let reject!: (err: Error) => void;
      const work = runPaidCall(principal, request, () => new Promise<never>((_, r) => { reject = r; }), { pool: f.pool, logger: { info: boom, warn: boom, error: boom }, timeoutMs: 25 });
      const check = expect(work).rejects.toMatchObject({ id: "E-014" });
      await vi.advanceTimersByTimeAsync(25);
      await check;
      reject(new Error("[MOCK] late"));
      await vi.runAllTimersAsync();
      vi.useRealTimers();
      await new Promise((r) => setImmediate(r));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("maps a non-object dispatch result to E-013 and retains the reservation", async () => {
    for (const bad of [undefined, null, "paid"]) {
      const f = spendFake();
      const err = await runPaidCall(principal, request, (async () => bad) as never, { ...f.ctx, timeoutMs: 100 }).catch((e) => e);
      expect(err).toBeInstanceOf(PaidCallError);
      expect(err).toMatchObject({ id: "E-013", settlement: "retained", failureSource: "provider", reservation: { id: reservationId } });
      expect(f.sent(/settle_ai_call/)).toHaveLength(0);
      expect(f.logs.parsed()).toContainEqual(expect.objectContaining({ event: "spend.retained", reservation_id: reservationId, provider_error_id: "E-013" }));
    }
  });

  it("carries reservation facts on a lost COMMIT acknowledgement", async () => {
    const reserve = spendFake({ commitError: new Error("[MOCK] lost commit") });
    await runPaidCall(principal, request, vi.fn(), { ...reserve.ctx, timeoutMs: 100 }).catch(() => undefined);
    expect(reserve.logs.parsed()).toContainEqual(expect.objectContaining({ event: "spend.commit_uncertain", draft_id: draftId, route: "API-002" }));
    const settle = spendFake({ settleCommitError: new Error("[MOCK] lost commit") });
    await runPaidCall(principal, request, async () => ({ value: "[MOCK]", actualUsd: "0.010000" }), { ...settle.ctx, timeoutMs: 100 });
    expect(settle.logs.parsed()).toContainEqual(expect.objectContaining({ event: "spend.commit_uncertain", reservation_id: reservationId, draft_id: draftId, route: "API-002" }));
  });

  it("omits the provider error ID on an abort-induced late rejection", async () => {
    vi.useFakeTimers();
    const f = spendFake();
    const work = runPaidCall(principal, request, ({ signal }) => new Promise<never>((_, reject) => {
      signal.addEventListener("abort", () => reject(new Error("[MOCK] aborted")));
    }), { ...f.ctx, timeoutMs: 25 });
    const check = expect(work).rejects.toMatchObject({ id: "E-014" });
    await vi.advanceTimersByTimeAsync(25);
    await check;
    await vi.runAllTimersAsync();
    const late = f.logs.parsed().find((l) => l.event === "spend.late_failure");
    expect(late).toBeDefined();
    expect(late.provider_error_id).toBeUndefined();
  });
});
