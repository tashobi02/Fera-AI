// eval:audit (P3-212): the coverage SQL must only count human decisions. A system-voided
// competitor has no matching required action and would read as a false audit gap.
import { describe, expect, it } from "vitest";
// @ts-expect-error -- untyped .mjs eval module
import { __test } from "../../eval/audit.mjs";

describe("eval:audit coverage SQL", () => {
  const sql: string = __test.COVERAGE_SQL;

  it("counts only confirmed or rejected candidates, never voided or superseded", () => {
    expect(sql).toContain("mc.status IN ('confirmed', 'rejected')");
    expect(sql).not.toMatch(/status <> 'pending'/);
  });

  it("matches candidate and referral records by candidate_id and closures by case_id only", () => {
    expect(sql).toContain("WHEN 'case_closure' THEN a.case_id = d.case_id::uuid");
    expect(sql).toContain("ELSE a.candidate_id = d.candidate_id::uuid");
  });
});
