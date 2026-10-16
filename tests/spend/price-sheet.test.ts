// TASK-063: all rates and identities here are injected synthetic test inputs.
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { estimateUpperUsd, UNKNOWN_PRICE_SHEET, type EstimateInput, type Price, type PriceSheet, type UpperUsdEstimate } from "@/server/spend/price-sheet";

import { ApiError } from "@/app/api/_shared/envelope";
import type { ReservationRequest } from "@/server/spend";
import { captureLogs } from "../api/fakes";

function expectRefusal(work: () => unknown) {
  let caught: unknown;
  try { work(); } catch (err) { caught = err; }
  expect(caught).toMatchObject({ id: "E-023" });
}

const sheet: PriceSheet = {
  status: "injected",
  entries: [
    { id: "mock-extract", operation: "extract", provider: "[MOCK]", model: "[MOCK]", inputUsdPerMillion: "1.000000", outputUsdPerMillion: "3.000000" },
    { id: "mock-transcribe", operation: "transcribe", provider: "[MOCK]", model: "[MOCK]", usdPerMinute: "0.060000" },
  ],
};

describe("price sheet upper bounds (TASK-063)", () => {
  it("requires an estimate minted by the price sheet rather than a raw USD string", () => {
    expectTypeOf<ReservationRequest["upperUsd"]>().toEqualTypeOf<UpperUsdEstimate>();
    expectTypeOf<string>().not.toMatchTypeOf<UpperUsdEstimate>();
  });

  it("passes intentional E-023 through unchanged without an unexpected-error log", () => {
    const logs = captureLogs();
    const refusal = new ApiError("E-023");
    const bad: PriceSheet = { status: "injected", get entries(): readonly Price[] { throw refusal; } };
    let caught: unknown;
    try { estimateUpperUsd(bad, { priceId: "mock-extract", operation: "extract", inputTokens: 1, maxOutputTokens: 1 }, { logger: logs.logger }); } catch (err) { caught = err; }
    expect(caught).toMatchObject({ id: "E-023" });
    expect(caught).toBe(refusal);
    expect(logs.lines).toHaveLength(0);
  });

  it("logs unexpected invalid pricing safely before mapping it to E-023", () => {
    const logs = captureLogs();
    const bad: PriceSheet = { status: "injected", entries: [{ id: "bad", provider: "[MOCK] private", model: "[MOCK] private", operation: "transcribe", usdPerMinute: "[MOCK] price text" }] };
    expectRefusal(() => estimateUpperUsd(bad, { priceId: "bad", operation: "transcribe", maxBillableSeconds: 60 }, { logger: logs.logger }));
    expect(logs.parsed()).toContainEqual(expect.objectContaining({ event: "spend.price_sheet_invalid", level: 50, error_id: "E-023", price_id: "bad", err_name: "ZodError" }));
    expect(logs.parsed().filter((l) => l.dropped)).toEqual([]);
    expect(logs.lines.join("\n")).not.toContain("[MOCK]");
  });

  it("estimateUpperUsd with a throwing logger still gives E-023", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const boom = () => { throw new Error("[MOCK] logger failed"); };
      const bad: PriceSheet = { status: "injected", entries: [{ id: "bad", provider: "[MOCK] private", model: "[MOCK] private", operation: "transcribe", usdPerMinute: "[MOCK] price text" }] };
      expectRefusal(() => estimateUpperUsd(bad, { priceId: "bad", operation: "transcribe", maxBillableSeconds: 60 }, { logger: { info: boom, warn: boom, error: boom } }));
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("keeps real provider/model/prices explicitly UNKNOWN until TASK-003", () => {
    expect(UNKNOWN_PRICE_SHEET).toEqual({ status: "UNKNOWN", source: "docs/costs.md" });
    expectRefusal(() => estimateUpperUsd(UNKNOWN_PRICE_SHEET, { priceId: "mock-extract", operation: "extract", inputTokens: 10, maxOutputTokens: 10 }));
  });

  it("prices maximum input and output tokens separately without the pack's illustrative ratio", () => {
    expect(estimateUpperUsd(sheet, { priceId: "mock-extract", operation: "extract", inputTokens: 1200, maxOutputTokens: 400 })).toBe("0.002400");
  });

  it("rounds sub-micro-dollar token estimates upward", () => {
    const tiny: PriceSheet = { status: "injected", entries: [{ ...sheet.entries[0], operation: "extract", inputUsdPerMillion: "0.010000", outputUsdPerMillion: "0.010000" }] };
    expect(estimateUpperUsd(tiny, { priceId: "mock-extract", operation: "extract", inputTokens: 1, maxOutputTokens: 1 })).toBe("0.000001");
  });

  it("estimates speech from maximum billable seconds", () => {
    expect(estimateUpperUsd(sheet, { priceId: "mock-transcribe", operation: "transcribe", maxBillableSeconds: 120 })).toBe("0.120000");
  });

  it("rounds speech division upward", () => {
    const tiny: PriceSheet = { status: "injected", entries: [{ id: "tiny", operation: "transcribe", provider: "[MOCK]", model: "[MOCK]", usdPerMinute: "0.000001" }] };
    expect(estimateUpperUsd(tiny, { priceId: "tiny", operation: "transcribe", maxBillableSeconds: 1 })).toBe("0.000001");
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("refuses invalid token units %s", (inputTokens) => {
    expectRefusal(() => estimateUpperUsd(sheet, { priceId: "mock-extract", operation: "extract", inputTokens, maxOutputTokens: 10 }));
  });

  it.each([0, -1, 0.5, Infinity])("refuses invalid maximum speech seconds %s", (maxBillableSeconds) => {
    expectRefusal(() => estimateUpperUsd(sheet, { priceId: "mock-transcribe", operation: "transcribe", maxBillableSeconds }));
  });

  it("refuses missing and operation-mismatched prices", () => {
    for (const priceId of ["UNKNOWN", "mock-transcribe"]) {
      expectRefusal(() => estimateUpperUsd(sheet, { priceId, operation: "extract", inputTokens: 10, maxOutputTokens: 10 }));
    }
  });

  it("refuses ambiguous duplicate price IDs", () => {
    expectRefusal(() => estimateUpperUsd({ status: "injected", entries: [sheet.entries[0], sheet.entries[0]] }, { priceId: "mock-extract", operation: "extract", inputTokens: 10, maxOutputTokens: 10 }));
  });

  it.each(["UNKNOWN", "-1", "NaN", "Infinity", "1e-3", "0.0000001", "10000"])('refuses unusable price "%s"', (usdPerMinute) => {
    const bad: PriceSheet = { status: "injected", entries: [{ id: "bad", operation: "transcribe", provider: "[MOCK]", model: "[MOCK]", usdPerMinute }] };
    expectRefusal(() => estimateUpperUsd(bad, { priceId: "bad", operation: "transcribe", maxBillableSeconds: 120 }));
  });

  it("refuses a zero-cost or overflowing reservation estimate", () => {
    expectRefusal(() => estimateUpperUsd(sheet, { priceId: "mock-extract", operation: "extract", inputTokens: 0, maxOutputTokens: 0 }));
    expectRefusal(() => estimateUpperUsd(sheet, { priceId: "mock-extract", operation: "extract", inputTokens: Number.MAX_SAFE_INTEGER, maxOutputTokens: 1 }));
  });

  it("refuses a null input defensively with E-023", () => {
    expectRefusal(() => estimateUpperUsd(sheet, null as unknown as EstimateInput));
  });
});
