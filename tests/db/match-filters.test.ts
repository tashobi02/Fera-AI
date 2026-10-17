// TASK-017a: matcher hard filters (P3-030; D5 BR-017; TC-009/039/040). DB tests.
//
// Runs under `npm run test:db` against the real schema_v2.sql in a per-pid
// fresh database. Synthetic only; [MOCK] labels; fixture person names never
// contain digit runs (the support helper does that for us).
//
// Each scenario inserts a missing case plus the smallest set of found cases
// that exercises one rule at a time, then asserts the eligibility result.
import { randomBytes, randomUUID } from "node:crypto";
import type { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertNoIneligible,
  eligibleFoundCandidates,
} from "@/server/matching/filters";
import { setPoolForTests } from "@/server/db/pool";
import {
  createActors, dbTestsEnabled, pool, seedReference,
  type Actors,
} from "./support/db";

// One fixed base instant per test file: intervals that "touch" at 48 h must share the exact
// same timestamp (a fresh Date.now() per call put them a few milliseconds apart).
const T0 = Date.now();
function hours(n: number): string {
  return new Date(T0 - n * 3_600_000).toISOString();
}
// Returns an ISO timestamp at the midpoint of two ISO strings. The schema
// requires event_at to lie BETWEEN event_at_lower and event_at_upper (when
// present), so the midpoint is the simplest value that satisfies the
// constraint for any interval the tests describe.
function midpointIso(a: string, b: string): string {
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  return new Date((ta + tb) / 2).toISOString();
}
const hex = () => randomBytes(32).toString("hex");
const ref = (k: "M" | "F") => `${k}-${randomBytes(6).toString("hex").slice(0, 6).toUpperCase()}`;

// The schema requires missing cases to be inserted with status='submitted'
// and walked through the legal state machine: submitted -> open ->
// matched_pending_review. Each helper below handles its own transitions so
// the tests stay readable.
async function insertMissingAndOpen(opts: {
  sex?: "male" | "female" | "other" | "unknown";
  age_min?: number;
  age_max?: number;
  event_at_lower: string;
  event_at_upper: string;
  anonymised_at?: string | null;
  client: Client;
}): Promise<string> {
  const c = opts.client;
  const session = (await c.query<{ id: string }>("INSERT INTO parent_sessions DEFAULT VALUES RETURNING id")).rows[0].id;
  const r = ref("M");
  const phone = `0172000${Math.floor(Math.random() * 9999).toString().padStart(4, "0")}`;
  // BR-016 + schema CHECK: when age_min != age_max (a real range, not an
  // exact age), age_years must be NULL — the schema forbids
  // age_years = age_min < age_max. When both bounds coincide, the canonical
  // single-age value is stored in all three columns.
  const ageMin = opts.age_min ?? 7;
  const ageMax = opts.age_max ?? ageMin;
  const ageYears = ageMin === ageMax ? ageMin : null;
  // Schema CHECK on event_at: with event_at_approx=false, event_at must
  // equal both event_at_lower and event_at_upper. The tests describe a time
  // interval, so mark event_at_approx=true and pin event_at to the midpoint
  // (which satisfies the BETWEEN check). The interval bounds are kept so
  // the BR-017/TC-040 overlap rule still has both to compare.
  const { rows } = await c.query<{ id: string }>(
    `INSERT INTO cases (ref_code, kind, status, source, reporter_session_id, client_submission_id,
       submission_payload_hash, input_hash, raw_text, child_name, child_name_latin,
       age_years, age_min, age_max, sex, height_cm, clothing, marks, circumstances,
       event_at, event_at_approx, event_at_lower, event_at_upper, place_text, district_code, thana,
       reporter_relation, contact_phone, gd_number, provenance,
       embedding, embedding_model, embedding_revision, embedding_space,
       anonymised_at)
     VALUES ($1, 'missing', 'submitted', 'parent', $2, $3, $4, $5, $6, $7, $8,
             $9, $10, $11, $12, 120, $13, $14, $15,
             $16, true, $17, $18, $19, 1, '[MOCK] Thana',
             'mother', $20, 'GD-${r}',
             '{"child.name":{"quote":"${r}","start_utf16":0,"end_utf16":4,"derivation":"direct"}}'::jsonb,
             '[${Array(384).fill(0.01).join(",")}]', 'multilingual-e5-small', 'synthetic-rev', 'synthetic-space',
             $21)
     RETURNING id`,
    [
      r, session, randomUUID(), hex(), hex(),
      `[MOCK] raw text for ${r}`, `[MOCK] missing child ${r}`, `[MOCK] latin ${r}`,
      ageYears, ageMin, ageMax,
      opts.sex ?? "male",
      `[MOCK] clothing ${r}`, `[MOCK] marks ${r}`, `[MOCK] circumstances ${r}`,
      // Midpoint timestamp satisfies event_at BETWEEN event_at_lower AND event_at_upper.
      midpointIso(opts.event_at_lower, opts.event_at_upper),
      opts.event_at_lower, opts.event_at_upper,
      `[MOCK] place ${r}`,
      phone,
      opts.anonymised_at ?? null,
    ],
  );
  const id = rows[0].id;
  if (!opts.anonymised_at) {
    await c.query("UPDATE cases SET status = 'open' WHERE id = $1", [id]);
  }
  return id;
}

async function insertFound(opts: {
  staffId: string;
  sex?: "male" | "female" | "other" | "unknown";
  age_min?: number | null;
  age_max?: number | null;
  event_at_lower: string;
  event_at_upper: string;
  status?: "open" | "matched_pending_review" | "referred";
  anonymised_at?: string | null;
  client: Client;
}): Promise<string> {
  const c = opts.client;
  const r = ref("F");
  const phone = `0173000${Math.floor(Math.random() * 9999).toString().padStart(4, "0")}`;
  const ageMin = opts.age_min ?? null;
  const ageMax = opts.age_max ?? null;
  // Schema CHECK on event_at (see insertMissingAndOpen): mark the timestamp
  // approximate and pin event_at to the interval midpoint so the
  // event_at BETWEEN event_at_lower AND event_at_upper check passes.
  const { rows } = await c.query<{ id: string }>(
    `INSERT INTO cases (ref_code, kind, status, source, created_by_user_id, client_submission_id,
       submission_payload_hash, child_name, age_min, age_max, sex, clothing, circumstances,
       event_at, event_at_approx, event_at_lower, event_at_upper, place_text, district_code,
       contact_phone, anonymised_at)
     VALUES ($1, 'found', $2, 'staff', $3, $4, $5, $6, $7, $8, $9, $10, $11,
             $12, true, $13, $14, $15, 1, $16, $17)
     RETURNING id`,
    [
      r, "open", opts.staffId, randomUUID(), hex(),
      `[MOCK] found child ${r}`, ageMin, ageMax,
      opts.sex ?? "male",
      `[MOCK] clothing ${r}`, `[MOCK] found description ${r}`,
      midpointIso(opts.event_at_lower, opts.event_at_upper),
      opts.event_at_lower, opts.event_at_upper,
      `[MOCK] found place ${r}`,
      phone,
      opts.anonymised_at ?? null,
    ],
  );
  if (opts.status && opts.status !== "open") await forceStatus(c, rows[0].id, opts.status, opts.status === "referred" ? ", closed_at = now()" : "");
  return rows[0].id;
}

// Fixtures need states the state guard only reaches through the full workflow (and through a
// pending candidate); the replica role skips triggers for this one UPDATE, as the owner.
async function asReplica<T>(c: Client, fn: () => Promise<T>): Promise<T> {
  await c.query("SET session_replication_role = replica");
  try {
    return await fn();
  } finally {
    await c.query("SET session_replication_role = DEFAULT");
  }
}
async function forceStatus(c: Client, id: string, status: string, extra = ""): Promise<void> {
  await asReplica(c, () => c.query(`UPDATE cases SET status = $2::case_status${extra} WHERE id = $1`, [id, status]));
}

async function insertCandidate(opts: {
  missingId: string;
  foundId: string;
  missingVersion: number;
  foundVersion: number;
  status: "pending" | "confirmed" | "rejected" | "voided" | "superseded";
  client: Client;
}): Promise<string> {
  const c = opts.client;
  const insert = () => c.query<{ id: string }>(
    `INSERT INTO match_candidates (missing_case_id, found_case_id, missing_version, found_version,
       score, rank, reason_bn, reason_en, components, status, decided_at)
     VALUES ($1, $2, $3, $4, 50.0, 1, '[MOCK] কারণ', '[MOCK] reason',
             '{"text":0.5,"age":0.5}'::jsonb, $5::candidate_status, CASE WHEN $5::candidate_status = 'pending' THEN NULL ELSE now() END)
     RETURNING id`,
    [opts.missingId, opts.foundId, opts.missingVersion, opts.foundVersion, opts.status],
  );
  // Decided candidates normally need a decision/referral row; the filter tests only need the status.
  const { rows } = opts.status === "pending" ? await insert() : await asReplica(c, insert);
  return rows[0].id;
}

async function missingVersion(c: Client, id: string): Promise<number> {
  const { rows } = await c.query<{ version: number }>("SELECT version FROM cases WHERE id = $1", [id]);
  return rows[0].version;
}
async function foundVersion(c: Client, id: string): Promise<number> {
  const { rows } = await c.query<{ version: number }>("SELECT version FROM cases WHERE id = $1", [id]);
  return rows[0].version;
}

describe.skipIf(!dbTestsEnabled)("matcher hard filters DB (P3-030, BR-017, TC-009/039/040)", () => {
  let admin: Client;
  let app: Client;
  let appPool: Pool;
  let actors: Actors;

  beforeAll(async () => {
    admin = await (await import("./support/db")).connect("admin");
    app = await (await import("./support/db")).connect("app");
    appPool = pool("app");
    setPoolForTests(appPool);
    await seedReference(admin);
    actors = await createActors(admin);
  });

  afterAll(async () => {
    setPoolForTests(null);
    await Promise.all([admin?.end(), app?.end(), appPool?.end()]);
  });

  // TC-039: a found case with unknown age (age_min/age_max NULL) is still
  // eligible when the missing case has a known age, sex matches and the time
  // intervals overlap. BR-016 allows unknown found age; BR-017 + TC-039
  // require the SQL to keep it in the result set.
  it("TC-039: unknown found age is eligible when other rules pass", async () => {
    const missingId = await insertMissingAndOpen({
      client: admin, sex: "female", age_min: 7, age_max: 9,
      event_at_lower: hours(48), event_at_upper: hours(24),
    });
    const foundUnknownAge = await insertFound({
      client: admin, staffId: actors.staff, sex: "female", age_min: null, age_max: null,
      event_at_lower: hours(47), event_at_upper: hours(23),
    });
    const foundKnownAge = await insertFound({
      client: admin, staffId: actors.staff, sex: "female", age_min: 7, age_max: 9,
      event_at_lower: hours(47), event_at_upper: hours(23),
    });
    const rows = await eligibleFoundCandidates(app, missingId);
    const ids = rows.map((r) => r.found_case_id);
    expect(ids).toContain(foundUnknownAge);
    expect(ids).toContain(foundKnownAge);
  });

  // TC-040: two intervals that overlap only outside the midpoint must still
  // pass. The SQL uses the bounds (BR-017), so the only requirement is that
  // the intervals share at least one point in time. We pair the missing
  // interval [72..48] with the found interval [48..0] (they touch at 48h)
  // and verify it is eligible, while a fully disjoint interval is not.
  it("TC-040: overlapping event intervals are eligible even when midpoint logic would reject them", async () => {
    const missingId = await insertMissingAndOpen({
      client: admin, sex: "male", age_min: 8, age_max: 10,
      event_at_lower: hours(72), event_at_upper: hours(48),
    });
    // Found [48h ago, 0h ago]: shares 48h with the missing interval.
    const overlapping = await insertFound({
      client: admin, staffId: actors.staff, sex: "male", age_min: 8, age_max: 10,
      event_at_lower: hours(48), event_at_upper: hours(0),
    });
    // A second found that is fully disjoint from the missing interval
    // ([10h, 5h] is inside [10h..5h], which does not reach 48h).
    const disjoint = await insertFound({
      client: admin, staffId: actors.staff, sex: "male", age_min: 8, age_max: 10,
      event_at_lower: hours(10), event_at_upper: hours(5),
    });
    const rows = await eligibleFoundCandidates(app, missingId);
    const ids = rows.map((r) => r.found_case_id);
    expect(ids).toContain(overlapping);
    expect(ids).not.toContain(disjoint);
  });

  it("sex mismatch is excluded (BR-017)", async () => {
    const missingId = await insertMissingAndOpen({
      client: admin, sex: "female", age_min: 6, age_max: 8,
      event_at_lower: hours(20), event_at_upper: hours(10),
    });
    const maleFound = await insertFound({
      client: admin, staffId: actors.staff, sex: "male", age_min: 6, age_max: 8,
      event_at_lower: hours(19), event_at_upper: hours(11),
    });
    const femaleFound = await insertFound({
      client: admin, staffId: actors.staff, sex: "female", age_min: 6, age_max: 8,
      event_at_lower: hours(19), event_at_upper: hours(11),
    });
    const rows = await eligibleFoundCandidates(app, missingId);
    const ids = rows.map((r) => r.found_case_id);
    expect(ids).toContain(femaleFound);
    expect(ids).not.toContain(maleFound);
  });

  it("sex 'unknown' on either side never excludes (BR-017)", async () => {
    const missingKnown = await insertMissingAndOpen({
      client: admin, sex: "male", age_min: 6, age_max: 8,
      event_at_lower: hours(20), event_at_upper: hours(10),
    });
    const foundUnknownSex = await insertFound({
      client: admin, staffId: actors.staff, sex: "unknown", age_min: 6, age_max: 8,
      event_at_lower: hours(19), event_at_upper: hours(11),
    });
    const rows = await eligibleFoundCandidates(app, missingKnown);
    expect(rows.map((r) => r.found_case_id)).toContain(foundUnknownSex);
  });

  it("a found case whose status is 'referred' is excluded (queue state, BR-017)", async () => {
    const missingId = await insertMissingAndOpen({
      client: admin, sex: "male", age_min: 6, age_max: 8,
      event_at_lower: hours(20), event_at_upper: hours(10),
    });
    const referred = await insertFound({
      client: admin, staffId: actors.staff, sex: "male", age_min: 6, age_max: 8,
      event_at_lower: hours(19), event_at_upper: hours(11), status: "referred",
    });
    const rows = await eligibleFoundCandidates(app, missingId);
    expect(rows.map((r) => r.found_case_id)).not.toContain(referred);
  });

  it("a missing case whose status is 'confirmed' is excluded (queue state, BR-017)", async () => {
    // Insert both cases in a legal state, walk them through the state machine
    // to confirmed / referred, then assert no eligible found case is returned.
    const missingId = await insertMissingAndOpen({
      client: admin, sex: "male", age_min: 6, age_max: 8,
      event_at_lower: hours(20), event_at_upper: hours(10),
    });
    const foundId = await insertFound({
      client: admin, staffId: actors.staff, sex: "male", age_min: 6, age_max: 8,
      event_at_lower: hours(19), event_at_upper: hours(11),
    });
    const mv = await missingVersion(admin, missingId);
    const fv = await foundVersion(admin, foundId);
    await insertCandidate({
      client: admin, missingId, foundId, missingVersion: mv, foundVersion: fv, status: "pending",
    });
    await forceStatus(admin, missingId, "matched_pending_review");
    await asReplica(admin, () => admin.query(
      "UPDATE match_candidates SET status='confirmed', decided_at=now() WHERE missing_case_id=$1 AND found_case_id=$2",
      [missingId, foundId],
    ));
    await forceStatus(admin, missingId, "confirmed");
    await forceStatus(admin, foundId, "referred", ", closed_at = now()");

    const rows = await eligibleFoundCandidates(app, missingId);
    // Missing is no longer in a queue state; the SQL returns no rows.
    expect(rows).toEqual([]);
  });

  it("a previously rejected pair at the same versions is never re-suggested (BR-019)", async () => {
    const missingId = await insertMissingAndOpen({
      client: admin, sex: "male", age_min: 6, age_max: 8,
      event_at_lower: hours(20), event_at_upper: hours(10),
    });
    const foundId = await insertFound({
      client: admin, staffId: actors.staff, sex: "male", age_min: 6, age_max: 8,
      event_at_lower: hours(19), event_at_upper: hours(11),
    });
    const mv = await missingVersion(admin, missingId);
    const fv = await foundVersion(admin, foundId);
    await insertCandidate({
      client: admin, missingId, foundId, missingVersion: mv, foundVersion: fv, status: "rejected",
    });
    const rows = await eligibleFoundCandidates(app, missingId);
    expect(rows.map((r) => r.found_case_id)).not.toContain(foundId);
  });

  it("a pair already listed as pending at the same versions is never re-suggested (no duplicate)", async () => {
    const missingId = await insertMissingAndOpen({
      client: admin, sex: "male", age_min: 6, age_max: 8,
      event_at_lower: hours(20), event_at_upper: hours(10),
    });
    const foundId = await insertFound({
      client: admin, staffId: actors.staff, sex: "male", age_min: 6, age_max: 8,
      event_at_lower: hours(19), event_at_upper: hours(11),
    });
    const mv = await missingVersion(admin, missingId);
    const fv = await foundVersion(admin, foundId);
    await insertCandidate({
      client: admin, missingId, foundId, missingVersion: mv, foundVersion: fv, status: "pending",
    });
    const rows = await eligibleFoundCandidates(app, missingId);
    expect(rows.map((r) => r.found_case_id)).not.toContain(foundId);
  });

  it("an age interval mismatch (> 2 years apart on both sides) is excluded (BR-017)", async () => {
    const missingId = await insertMissingAndOpen({
      client: admin, sex: "male", age_min: 5, age_max: 6,
      event_at_lower: hours(20), event_at_upper: hours(10),
    });
    const far = await insertFound({
      client: admin, staffId: actors.staff, sex: "male", age_min: 14, age_max: 15,
      event_at_lower: hours(19), event_at_upper: hours(11),
    });
    const near = await insertFound({
      client: admin, staffId: actors.staff, sex: "male", age_min: 7, age_max: 8,
      event_at_lower: hours(19), event_at_upper: hours(11),
    });
    const rows = await eligibleFoundCandidates(app, missingId);
    const ids = rows.map((r) => r.found_case_id);
    expect(ids).not.toContain(far);
    expect(ids).toContain(near);
  });

  it("the same pair at a different version is still eligible (rejection only blocks same versions)", async () => {
    const missingId = await insertMissingAndOpen({
      client: admin, sex: "male", age_min: 6, age_max: 8,
      event_at_lower: hours(20), event_at_upper: hours(10),
    });
    const foundId = await insertFound({
      client: admin, staffId: actors.staff, sex: "male", age_min: 6, age_max: 8,
      event_at_lower: hours(19), event_at_upper: hours(11),
    });
    // A rejection recorded at the missing report's version 1, then the parent edits the report
    // (version 2): the matcher compares live versions, so the old rejection no longer blocks the pair.
    const fv = await foundVersion(admin, foundId);
    await insertCandidate({
      client: admin, missingId, foundId, missingVersion: 1, foundVersion: fv, status: "rejected",
    });
    await asReplica(admin, () => admin.query("UPDATE cases SET version = 2 WHERE id = $1", [missingId]));
    const rows = await eligibleFoundCandidates(app, missingId);
    expect(rows.map((r) => r.found_case_id)).toContain(foundId);
  });

  it("TC-009: assertNoIneligible returns zero rows when no candidate violates the rules", async () => {
    // Seed a single pending candidate for a known-eligible pair.
    const missingId = await insertMissingAndOpen({
      client: admin, sex: "male", age_min: 6, age_max: 8,
      event_at_lower: hours(20), event_at_upper: hours(10),
    });
    const foundId = await insertFound({
      client: admin, staffId: actors.staff, sex: "male", age_min: 6, age_max: 8,
      event_at_lower: hours(19), event_at_upper: hours(11),
    });
    const mv = await missingVersion(admin, missingId);
    const fv = await foundVersion(admin, foundId);
    await forceStatus(admin, missingId, "matched_pending_review");
    await insertCandidate({
      client: admin, missingId, foundId, missingVersion: mv, foundVersion: fv, status: "pending",
    });
    const violations = await assertNoIneligible(app);
    // Filter to only this pair so other tests in the same database don't
    // influence the assertion.
    const ours = violations.filter((v) => v.missing_case_id === missingId && v.found_case_id === foundId);
    expect(ours).toEqual([]);
  });

  it("assertNoIneligible flags a known sex-mismatch pending candidate", async () => {
    const missingId = await insertMissingAndOpen({
      client: admin, sex: "male", age_min: 6, age_max: 8,
      event_at_lower: hours(20), event_at_upper: hours(10),
    });
    const foundId = await insertFound({
      client: admin, staffId: actors.staff, sex: "female", age_min: 6, age_max: 8,
      event_at_lower: hours(19), event_at_upper: hours(11),
    });
    const mv = await missingVersion(admin, missingId);
    const fv = await foundVersion(admin, foundId);
    await forceStatus(admin, missingId, "matched_pending_review");
    await insertCandidate({
      client: admin, missingId, foundId, missingVersion: mv, foundVersion: fv, status: "pending",
    });
    const violations = await assertNoIneligible(app);
    const ours = violations.filter((v) => v.missing_case_id === missingId && v.found_case_id === foundId);
    expect(ours).toHaveLength(1);
    expect(ours[0].reason).toBe("sex_mismatch");
  });
});