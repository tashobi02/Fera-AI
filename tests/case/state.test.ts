// TASK-015 app-level state guard (BR-012/013, TC-032). The expected table is written out
// independently of the contracts, copied from enforce_case_transition() in
// db/schema_v2.sql, so a drift in either copy fails here.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/app/api/_shared";
import { CASE_STATUSES, type CaseKind, type CaseStatus } from "@/contracts";
import { assertTransition } from "@/server/case";

const LEGAL: Record<CaseKind, string[]> = {
  missing: [
    "submitted>open",
    "open>matched_pending_review",
    "matched_pending_review>open",
    "matched_pending_review>confirmed",
    "confirmed>closed",
    "open>closed",
  ],
  found: ["open>matched_pending_review", "matched_pending_review>open", "matched_pending_review>referred"],
};

const verdict = (kind: CaseKind, from: CaseStatus, to: CaseStatus) => {
  try {
    assertTransition(kind, from, to);
    return "ok";
  } catch (err) {
    return err instanceof ApiError ? err.id : "threw";
  }
};

describe("assertTransition (app guard mirroring enforce_case_transition)", () => {
  it("matches the SQL trigger's step lists exactly", () => {
    const sql = readFileSync("db/schema_v2.sql", "utf8");
    const body = sql.slice(sql.indexOf("CREATE FUNCTION enforce_case_transition"), sql.indexOf("CREATE TRIGGER cases_transition_guard"));
    const lists = [...body.matchAll(/OLD\.kind = '(missing|found)' AND step = ANY \(ARRAY\[([^\]]+)\]\)/g)];
    expect(lists).toHaveLength(2);
    for (const [, kind, raw] of lists) {
      const steps = [...raw.matchAll(/'([a-z_]+>[a-z_]+)'/g)].map((m) => m[1]).sort();
      expect(steps).toEqual([...LEGAL[kind as CaseKind]].sort());
    }
  });

  for (const kind of ["missing", "found"] as const) {
    it(`allows exactly the ${LEGAL[kind].length} legal ${kind} steps and refuses the other ${36 - LEGAL[kind].length} pairs with E-005`, () => {
      let ok = 0;
      for (const from of CASE_STATUSES) {
        for (const to of CASE_STATUSES) {
          const expected = LEGAL[kind].includes(`${from}>${to}`) ? "ok" : "E-005";
          expect(verdict(kind, from, to), `${kind} ${from}>${to}`).toBe(expected);
          if (expected === "ok") ok++;
        }
      }
      expect(ok).toBe(LEGAL[kind].length);
    });
  }

  it("refuses the TC-032 steps open → confirmed (missing) and open/matched → closed (found)", () => {
    expect(verdict("missing", "open", "confirmed")).toBe("E-005");
    expect(verdict("found", "open", "closed")).toBe("E-005");
    expect(verdict("found", "matched_pending_review", "closed")).toBe("E-005");
    expect(verdict("found", "referred", "closed")).toBe("E-005");
  });

  it("never allows a same-status step, leaving a terminal state, or an initial confirmed/closed jump", () => {
    for (const s of CASE_STATUSES) {
      expect(verdict("missing", s, s)).toBe("E-005");
      expect(verdict("found", s, s)).toBe("E-005");
    }
    for (const to of CASE_STATUSES) {
      expect(verdict("missing", "closed", to)).toBe("E-005");
      expect(verdict("found", "referred", to)).toBe("E-005");
    }
    expect(verdict("missing", "submitted", "confirmed")).toBe("E-005");
    expect(verdict("missing", "submitted", "closed")).toBe("E-005");
  });
});
