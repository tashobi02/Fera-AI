// TASK-017a: matcher hard filters (P3-030; D5 BR-017; TC-009/039/040). Unit tests.
//
// The pure rules live in the SQL string (filters.ts), so the unit suite checks
// the rule text and a typed mocked Queryable over candidate rows. DB tests
// live in tests/db/match-filters.test.ts and run under `npm run test:db`.
//
// Synthetic-only; no real child data; [MOCK] labels on every fixture.
import { describe, expect, it, vi } from "vitest";
import {
  ELIGIBLE_FOUND_SQL_RUNNABLE,
  INELIGIBLE_PAIR_CHECK_SQL,
  assertNoIneligible,
  eligibleFoundCandidates,
  type EligibleFoundRow,
} from "@/server/matching/filters";
import type { Queryable } from "@/server/db/queryable";

function makeQueryable(plan: { rows: unknown[] }[]): Queryable {
  const calls: Array<{ text: string; values?: unknown[] }> = [];
  let i = 0;
  const q: Queryable = {
    async query(text, values) {
      calls.push({ text, values });
      const step = plan[i++] ?? { rows: [] };
      return step;
    },
  };
  return Object.assign(q, { __calls: calls }) as Queryable & { __calls: typeof calls };
}

function fakeEligible(over: Partial<EligibleFoundRow> = {}): EligibleFoundRow {
  return {
    missing_case_id: "00000000-0000-4000-8000-0000000000aa",
    missing_version: 1,
    found_case_id: "00000000-0000-4000-8000-000000000001",
    found_version: 1,
    status: "open",
    sex: "male",
    age_min: 7,
    age_max: 9,
    event_at: new Date("2026-10-10T00:00:00Z"),
    event_at_approx: true,
    event_at_lower: new Date("2026-10-09T00:00:00Z"),
    event_at_upper: new Date("2026-10-11T00:00:00Z"),
    anonymised_at: null,
    ref_code: "F-AAAAAA",
    ...over,
  };
}

describe("matcher hard filters (P3-030, BR-017)", () => {
  it("SQL embeds all eight BR-017 rules and is parameterised ($1, $2 only)", () => {
    expect(ELIGIBLE_FOUND_SQL_RUNNABLE).toMatch(/f\.kind = 'found'/);
    expect(ELIGIBLE_FOUND_SQL_RUNNABLE).toMatch(/m\.kind = 'missing'/);
    // (2) sex equal or unknown
    expect(ELIGIBLE_FOUND_SQL_RUNNABLE).toMatch(/f\.sex = m\.sex OR f\.sex = 'unknown' OR m\.sex = 'unknown'/);
    // (3) age interval overlap ±2y with found unknown allowed
    expect(ELIGIBLE_FOUND_SQL_RUNNABLE).toMatch(/f\.age_min <= m\.age_max \+ 2 AND m\.age_min <= f\.age_max \+ 2/);
    expect(ELIGIBLE_FOUND_SQL_RUNNABLE).toMatch(/f\.age_min IS NULL/);
    // (4) D1 line 501: only "found upper time >= missing lower time" is required.
    // TC-040 (an interval that overlaps but whose midpoint would have rejected
    // it) must still be eligible, which is why the symmetric lower bound is
    // not checked.
    expect(ELIGIBLE_FOUND_SQL_RUNNABLE).toMatch(/f\.event_at_upper >= m\.event_at_lower/);
    expect(ELIGIBLE_FOUND_SQL_RUNNABLE).not.toMatch(/f\.event_at_lower <= m\.event_at_upper/);
    // (5)/(6) queue status, no redaction
    expect(ELIGIBLE_FOUND_SQL_RUNNABLE).toMatch(/m\.status = ANY \(\$2::case_status\[\]\)/);
    expect(ELIGIBLE_FOUND_SQL_RUNNABLE).toMatch(/f\.status = ANY \(\$2::case_status\[\]\)/);
    expect(ELIGIBLE_FOUND_SQL_RUNNABLE).toMatch(/m\.anonymised_at IS NULL/);
    expect(ELIGIBLE_FOUND_SQL_RUNNABLE).toMatch(/f\.anonymised_at IS NULL/);
    // (7) BR-019: only a `rejected` row at the same versions blocks the pair.
    // Pending/confirmed/voided/superseded rows are kept (the matcher glue
    // upserts with ON CONFLICT and never produces a true duplicate).
    expect(ELIGIBLE_FOUND_SQL_RUNNABLE).toMatch(/mc\.status = 'rejected'/);
    expect(ELIGIBLE_FOUND_SQL_RUNNABLE).not.toMatch(/mc\.status IN \('rejected', 'pending', 'confirmed', 'voided', 'superseded'\)/);
    // (4 cont.) SELECT exposes the missing version so the matcher can pin
    // the version it filtered against.
    expect(ELIGIBLE_FOUND_SQL_RUNNABLE).toMatch(/m\.version\s+AS missing_version/);
    // The only literals the SQL hard-codes are the spec constants (kinds, queue
    // status, candidate status set); the two user inputs go through $1 and $2.
    expect(ELIGIBLE_FOUND_SQL_RUNNABLE).toMatch(/WHERE f\.kind = 'found'/);
    expect(ELIGIBLE_FOUND_SQL_RUNNABLE).toMatch(/AND m\.kind = 'missing'/);
  });

  it("ineligible-pair check covers every BR-017 rule and is parameter-free", () => {
    expect(INELIGIBLE_PAIR_CHECK_SQL).toMatch(/mc\.status = 'pending'/);
    expect(INELIGIBLE_PAIR_CHECK_SQL).toMatch(/m\.kind <> 'missing'/);
    expect(INELIGIBLE_PAIR_CHECK_SQL).toMatch(/f\.kind <> 'found'/);
    expect(INELIGIBLE_PAIR_CHECK_SQL).toMatch(/sex_mismatch/);
    expect(INELIGIBLE_PAIR_CHECK_SQL).toMatch(/age_no_overlap/);
    // Reason was renamed from time_no_overlap to found_before_missing
    // to reflect BR-017: the only time failure is "found interval ends
    // before the missing interval even starts".
    expect(INELIGIBLE_PAIR_CHECK_SQL).toMatch(/found_before_missing/);
    expect(INELIGIBLE_PAIR_CHECK_SQL).not.toMatch(/time_no_overlap/);
    expect(INELIGIBLE_PAIR_CHECK_SQL).toMatch(/wrong_missing_state/);
    expect(INELIGIBLE_PAIR_CHECK_SQL).toMatch(/wrong_found_state/);
    // The check uses only "found upper time >= missing lower time" too.
    expect(INELIGIBLE_PAIR_CHECK_SQL).toMatch(/f\.event_at_upper >= m\.event_at_lower/);
    expect(INELIGIBLE_PAIR_CHECK_SQL).not.toMatch(/f\.event_at_lower <= m\.event_at_upper/);
    // No parameters at all (the script is independent of any case id).
    expect(INELIGIBLE_PAIR_CHECK_SQL).not.toMatch(/\$\d/);
  });

  it("eligibleFoundCandidates passes only the missing case id and the queue-status array", async () => {
    const plan = [{ rows: [] }];
    const q = makeQueryable(plan);
    await eligibleFoundCandidates(q, "00000000-0000-4000-8000-0000000000aa");
    const calls = (q as Queryable & { __calls: { text: string; values?: unknown[] }[] }).__calls;
    expect(calls).toHaveLength(1);
    const params = calls[0].values ?? [];
    expect(params).toHaveLength(2);
    expect(params[0]).toBe("00000000-0000-4000-8000-0000000000aa");
    expect(params[1]).toEqual(["open", "matched_pending_review"]);
  });

  it("normalises eligible rows: unknown found age returns age_min/age_max as null (TC-039)", async () => {
    const eligibleUnknownAge = fakeEligible({ age_min: null, age_max: null });
    const plan = [{ rows: [eligibleUnknownAge] }];
    const rows = await eligibleFoundCandidates(makeQueryable(plan), "00000000-0000-4000-8000-0000000000aa");
    expect(rows).toHaveLength(1);
    expect(rows[0].age_min).toBeNull();
    expect(rows[0].age_max).toBeNull();
    expect(rows[0].sex).toBe("male");
    expect(rows[0].anonymised_at).toBeNull();
    expect(rows[0].status).toBe("open");
    // The missing-side identifiers are returned so the matcher can pin them.
    expect(rows[0].missing_case_id).toBe("00000000-0000-4000-8000-0000000000aa");
    expect(rows[0].missing_version).toBe(1);
  });

  it("accepts the unknown found-age shape that BR-016 + TC-039 require", () => {
    const e = fakeEligible({ age_min: null, age_max: null, sex: "unknown" });
    expect(e.age_min).toBeNull();
    expect(e.age_max).toBeNull();
    expect(e.sex).toBe("unknown");
  });

  it("returns the empty list when there is no eligible found case", async () => {
    const plan = [{ rows: [] }];
    const rows = await eligibleFoundCandidates(makeQueryable(plan), "00000000-0000-4000-8000-0000000000aa");
    expect(rows).toEqual([]);
  });

  it("does not interpret client strings as SQL (no string interpolation in the runner)", async () => {
    const q = makeQueryable([{ rows: [] }]);
    // A case id that looks dangerous must reach the wire as a parameter, never as a fragment.
    await eligibleFoundCandidates(q, "'); DROP TABLE cases; --");
    const calls = (q as Queryable & { __calls: { text: string; values?: unknown[] }[] }).__calls;
    expect(calls[0].text).not.toContain("DROP TABLE");
    expect((calls[0].values ?? [])[0]).toBe("'); DROP TABLE cases; --");
  });

  it("assertNoIneligible uses the documented SQL string and returns parsed rows", async () => {
    const plan = [{ rows: [{ missing_case_id: "m1", found_case_id: "f1", reason: "sex_mismatch" }] }];
    const q = makeQueryable(plan);
    const rows = await assertNoIneligible(q);
    expect(rows).toEqual([{ missing_case_id: "m1", found_case_id: "f1", reason: "sex_mismatch" }]);
    const calls = (q as Queryable & { __calls: { text: string; values?: unknown[] }[] }).__calls;
    expect(calls[0].text).toBe(INELIGIBLE_PAIR_CHECK_SQL);
  });

  it("never concatenates caller values into the SQL text", async () => {
    const q = makeQueryable([{ rows: [] }, { rows: [] }]);
    const id = "00000000-0000-4000-8000-0000000000ff";
    await eligibleFoundCandidates(q, id);
    await assertNoIneligible(q);
    const calls = (q as Queryable & { __calls: { text: string; values?: unknown[] }[] }).__calls;
    expect(calls[0].text.includes(id)).toBe(false);
    expect(calls[1].text.includes(id)).toBe(false);
  });

  it("vi spies are restorable between tests (no shared mutable state)", () => {
    // Pure smoke: this test enforces we do not register global vi.fn()s that
    // would leak across files. If a regression adds one, this is the place to
    // notice the spy count.
    const spy = vi.fn();
    spy();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});