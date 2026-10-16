// TASK-059 / DECISION-017 / NFR-016. Unit tests for the spend lib's formatting
// and exit-code policy. No database, no network; everything in-memory.
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM script without type declarations
import { evaluateBudget, exitCodeForStatus, formatReport, isUsdString, safeUrl, STATUS, toJsonReport, usdToMicros } from "../../scripts/spend/lib.mjs";

describe("spend lib exact-decimal formatting (TASK-059)", () => {
  it("recognises six-decimal USD strings", () => {
    for (const ok of ["0", "0.000000", "0.000001", "1", "1.5", "1.500000", "25", "30"]) {
      expect(isUsdString(ok)).toBe(true);
    }
    for (const bad of [null, undefined, "", "01.5", "1.", ".5", "+1", "1e3", "10000", "-1", "0.0000001", "30.0000001"]) {
      expect(isUsdString(bad)).toBe(false);
    }
  });

  it("parses USD strings to micros without floating point", () => {
    expect(usdToMicros("25")).toBe(25_000_000n);
    expect(usdToMicros("25.0")).toBe(25_000_000n);
    expect(usdToMicros("25.000000")).toBe(25_000_000n);
    expect(usdToMicros("0.010000")).toBe(10_000n);
    expect(usdToMicros("0.000001")).toBe(1n);
    expect(usdToMicros("9999.999999")).toBe(9_999_999_999n);
  });
});

describe("evaluateBudget (TASK-059)", () => {
  it("marks status=ok when the budget is untouched", () => {
    const r = evaluateBudget({ cap: "25.000000", committed: "0.000000", reserved: "0.000000", today: "0.000000" });
    expect(r).toEqual({
      cap: "25.000000",
      committed: "0.000000",
      reserved: "0.000000",
      used: "0.000000",
      remaining: "25.000000",
      today: "0.000000",
      status: "ok",
    });
  });

  it("defaults today to zero when omitted", () => {
    const r = evaluateBudget({ cap: "25.000000", committed: "0.000000", reserved: "0.000000" });
    expect(r.today).toBe("0.000000");
  });

  it("reports the exact spent total, remaining and today", () => {
    const r = evaluateBudget({ cap: "25.000000", committed: "0.012000", reserved: "0.030000", today: "0.005000" });
    expect(r.used).toBe("0.042000");
    expect(r.remaining).toBe("24.958000");
    expect(r.today).toBe("0.005000");
    expect(r.status).toBe(STATUS.OK);
  });

  it("marks status=at_cap when committed+reserved equals the cap", () => {
    const r = evaluateBudget({ cap: "25.000000", committed: "25.000000", reserved: "0.000000", today: "0.000000" });
    expect(r.status).toBe(STATUS.AT_CAP);
    expect(r.remaining).toBe("0.000000");
  });

  it("throws if the input is not a numeric(10,6) USD string", () => {
    expect(() => evaluateBudget({ cap: "abc", committed: "0", reserved: "0", today: "0" })).toThrow(/cap/);
    expect(() => evaluateBudget({ cap: "25", committed: "0", reserved: "0", today: "5.0.0" })).toThrow(/today/);
  });

  it("does not mutate its inputs", () => {
    const cap = "25.000000";
    const committed = "0.012000";
    const reserved = "0.030000";
    evaluateBudget({ cap, committed, reserved });
    expect(cap).toBe("25.000000");
    expect(committed).toBe("0.012000");
    expect(reserved).toBe("0.030000");
  });

  it("throws with six-decimal text when the schema invariant is broken", () => {
    // Used > cap (a BigInt we have not normalised yet) must surface as a
    // six-decimal USD pair, not a raw BigInt or a `formatUsd` failure on a
    // BigInt that lib never expected to see.
    expect(() =>
      evaluateBudget({ cap: "25.000000", committed: "30.000000", reserved: "0.000000", today: "0.000000" }),
    ).toThrowError(/invariant broken: committed\+reserved > cap \(30\.000000 > 25\.000000\)/);
  });
});

describe("exitCodeForStatus (TASK-059)", () => {
  it.each([
    [STATUS.OK, 0],
    [STATUS.AT_CAP, 2],
  ])("maps status=%s to exit %i", (status, code) => {
    expect(exitCodeForStatus(status)).toBe(code);
  });

  it("throws on an unknown status", () => {
    expect(() => exitCodeForStatus(/** @type {never} */ ("bogus"))).toThrow(/unknown spend status/);
  });
});

describe("formatReport / toJsonReport (TASK-059)", () => {
  it("formats a plain-text report with one line per field", () => {
    const r = evaluateBudget({ cap: "25.000000", committed: "0.012000", reserved: "0.030000", today: "0.005000" });
    const text = formatReport(r);
    expect(text).toBe(
      "cap_usd=25.000000\ncommitted_usd=0.012000\nreserved_usd=0.030000\nused_usd=0.042000\ntoday_usd=0.005000\nremaining_usd=24.958000\nstatus=ok\n",
    );
  });

  it("renders the JSON shape with snake_case keys and a today_usd field", () => {
    const r = evaluateBudget({ cap: "25.000000", committed: "0.000000", reserved: "0.000000", today: "0.000000" });
    expect(toJsonReport(r)).toEqual({
      cap_usd: "25.000000",
      committed_usd: "0.000000",
      reserved_usd: "0.000000",
      used_usd: "0.000000",
      today_usd: "0.000000",
      remaining_usd: "25.000000",
      status: "ok",
    });
  });
});

// Failure diagnostics must expose only the guarded database location.
describe("safeUrl (TASK-059)", () => {
  it("renders host:port/dbname with neither scheme nor userinfo", () => {
    const url = new URL("postgresql://sekrit:s3cret@127.0.0.1:54322/fera_test");
    expect(safeUrl(url)).toBe("127.0.0.1:54322/fera_test");
    expect(url.username).toBe("sekrit");
    expect(url.password).toBe("s3cret");
  });
});
