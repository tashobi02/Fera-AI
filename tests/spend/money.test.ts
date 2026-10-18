import { describe, expect, it } from "vitest";
import { formatUsd, usdMicros, usdSchema } from "@/server/spend/money";

describe("exact numeric(10,6) USD (TASK-063)", () => {
  it.each(["01.5", "1.", ".5", "+1", "1e3", "10000", "-1", "0.0000001"])("rejects %s", (value) => {
    expect(usdSchema.safeParse(value).success).toBe(false);
  });

  it.each(["0", "0.000001", "1.5", "9999.999999"])("round-trips %s without floating point", (value) => {
    expect(usdSchema.safeParse(value).success).toBe(true);
    const canonical = formatUsd(usdMicros(value));
    const [whole, fraction = ""] = value.split(".");
    expect(canonical).toBe(`${whole}.${fraction.padEnd(6, "0")}`);
    expect(usdMicros(canonical)).toBe(usdMicros(value));
    expect(formatUsd(usdMicros(canonical))).toBe(canonical);
  });
});
