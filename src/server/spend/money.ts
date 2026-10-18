import { z } from "zod";

// Match numeric(10,6) exactly; binary floating point must not under-reserve USD.
export const usdSchema = z.string().regex(/^(0|[1-9][0-9]{0,3})(\.[0-9]{1,6})?$/);
export const MAX_USD_MICROS = 9_999_999_999n;

export function usdMicros(value: string): bigint {
  const [whole, fraction = ""] = usdSchema.parse(value).split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}

export function formatUsd(micros: bigint): string {
  return `${micros / 1_000_000n}.${String(micros % 1_000_000n).padStart(6, "0")}`;
}
