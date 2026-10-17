// TASK-063 / D2B §12: real identities and rates await TASK-003, docs/costs.md.
import { ApiError } from "@/app/api/_shared/envelope";
import { createLogger, describeError, type Logger } from "@/app/api/_shared/log";
import { formatUsd, MAX_USD_MICROS, usdMicros } from "./money";
import { safeLogger } from "./safe-log";

type PriceIdentity = { readonly id: string; readonly provider: string; readonly model: string };
export type Price = PriceIdentity & (
  | { readonly operation: "extract"; readonly inputUsdPerMillion: string; readonly outputUsdPerMillion: string }
  | { readonly operation: "transcribe"; readonly usdPerMinute: string }
);

export type PriceSheet =
  | { readonly status: "UNKNOWN"; readonly source: "docs/costs.md" }
  | { readonly status: "injected"; readonly entries: readonly Price[] };

export const UNKNOWN_PRICE_SHEET: PriceSheet = Object.freeze({ status: "UNKNOWN", source: "docs/costs.md" });

// Only the estimator mints this compile-time brand. A raw client/adapter string
// cannot be used as a reservation estimate. Sheets and usage bounds stay server-owned.
declare const upperUsdBrand: unique symbol;
export type UpperUsdEstimate = string & { readonly [upperUsdBrand]: true };

export type EstimateInput = { priceId: string } & (
  | { operation: "extract"; inputTokens: number; maxOutputTokens: number }
  | { operation: "transcribe"; maxBillableSeconds: number }
);

function units(value: number): bigint {
  if (!Number.isSafeInteger(value) || value < 0) throw new ApiError("E-023");
  return BigInt(value);
}

export function estimateUpperUsd(sheet: PriceSheet, input: EstimateInput, ctx: { logger?: Logger } = {}): UpperUsdEstimate {
  try {
    if (sheet.status !== "injected") throw new ApiError("E-023");
    const entries = sheet.entries.filter((entry) => entry.id === input.priceId);
    if (entries.length !== 1) throw new ApiError("E-023");
    const price = entries[0];
    if (!price.provider.trim() || !price.model.trim()) throw new ApiError("E-023");
    let numerator: bigint;
    let denominator: bigint;
    if (input.operation === "extract" && price.operation === "extract") {
      numerator = units(input.inputTokens) * usdMicros(price.inputUsdPerMillion)
        + units(input.maxOutputTokens) * usdMicros(price.outputUsdPerMillion);
      denominator = 1_000_000n;
    } else if (input.operation === "transcribe" && price.operation === "transcribe") {
      numerator = units(input.maxBillableSeconds) * usdMicros(price.usdPerMinute);
      denominator = 60n;
    } else {
      throw new ApiError("E-023");
    }
    const upper = (numerator + denominator - 1n) / denominator;
    if (upper <= 0n || upper > MAX_USD_MICROS) throw new ApiError("E-023");
    return formatUsd(upper) as UpperUsdEstimate;
  } catch (err) {
    if (err instanceof ApiError && err.id === "E-023") throw err;
    // Identifier token and error class only: sheet values and messages never leave.
    safeLogger(ctx?.logger ?? createLogger()).error({
      event: "spend.price_sheet_invalid",
      error_id: "E-023",
      price_id: input?.priceId,
      err_name: describeError(err).err_name,
    });
    // Unknown or malformed pricing is a paid refusal; the device draft remains usable.
    throw new ApiError("E-023");
  }
}
