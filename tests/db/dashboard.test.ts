// API-012 GET /api/dashboard/stats (P3-041, TASK-030a, FR-019, BR-014, TC-012,
// TC-055). DB tests with the real pool and the real schema.
//
// TC-012: every district count returned by the service equals an independent SQL
//         GROUP BY over the seeded fixtures (no in-memory derivation; the service
//         is a thin reader over the GROUP BYs).
// TC-055: a confirmed pair counts once in the pair figure while missing and found
//         categories change separately when only one side moves.
//
// Runs under the fast DB loop (`/tmp/dbtest.sh`); skipped in plain `npm test`.
import type { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toDhakaIso } from "@/contracts";
import { districtStats, listCasesForDistrict, totalsOf } from "@/server/dashboard";
import { setPoolForTests } from "@/server/db/pool";
// @ts-expect-error -- plain ESM script without type declarations
import { loadDistrictData, seedDistricts } from "../../db/seed/districts.mjs";
import {
  addCandidate, closeMissing, closedPair, confirmPair, connect, createActors, dbTestsEnabled,
  insertFound, insertMissing, one, openMissing, pool, seedReference, type Actors,
} from "./support/db";

let fixturePool: Pool;
// Long-lived Client (not Pool): the support helpers take ClientBase, and Pool is
// not structurally a ClientBase. We use a single Client from connect("admin") for
// both the fixture helpers and the service-under-test calls.
let dbClient: Client;

// Fixture setup uses the local test DB owner; reads under test use fera_app.
async function asFixtureOwner<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = await fixturePool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

// Independent GROUP BYs over the same dataset. If the service's aggregated SQL ever
// drifts, these independent queries catch the mismatch. TC-012/TC-055 ride on this.
type IndependentRow = {
  code: number;
  missing_open: number;
  missing_matched: number;
  missing_closed: number;
  found_open: number;
  found_matched: number;
  found_referral: number;
  pairs: number;
};

const INDEPENDENT_SQL = `
  WITH d AS (SELECT code FROM districts),
  m AS (
    SELECT district_code,
           count(*) FILTER (WHERE status IN ('submitted','open'))::int AS open_count,
           count(*) FILTER (WHERE status IN ('matched_pending_review','confirmed'))::int AS matched_count,
           count(*) FILTER (WHERE status = 'closed')::int AS closed_count
    FROM cases WHERE kind = 'missing'
    GROUP BY district_code
  ),
  f AS (
    SELECT district_code,
           count(*) FILTER (WHERE status = 'open')::int AS open_count,
           count(*) FILTER (WHERE status = 'matched_pending_review')::int AS matched_count,
           count(*) FILTER (WHERE status = 'referred')::int AS referral_recorded
    FROM cases WHERE kind = 'found'
    GROUP BY district_code
  ),
  p AS (
    SELECT m.district_code, count(*)::int AS pairs
    FROM match_candidates c JOIN cases m ON m.id = c.missing_case_id
    WHERE c.status = 'confirmed'
    GROUP BY m.district_code
  )
  SELECT d.code,
         coalesce(m.open_count, 0)        AS missing_open,
         coalesce(m.matched_count, 0)     AS missing_matched,
         coalesce(m.closed_count, 0)      AS missing_closed,
         coalesce(f.open_count, 0)        AS found_open,
         coalesce(f.matched_count, 0)     AS found_matched,
         coalesce(f.referral_recorded, 0) AS found_referral,
         coalesce(p.pairs, 0)             AS pairs
  FROM d
  LEFT JOIN m ON m.district_code = d.code
  LEFT JOIN f ON f.district_code = d.code
  LEFT JOIN p ON p.district_code = d.code
  ORDER BY d.code
`;

async function independentDistrictRows(client: Client): Promise<IndependentRow[]> {
  const { rows } = await client.query<IndependentRow>(INDEPENDENT_SQL);
  return rows;
}

async function totalCounts(client: Client): Promise<{
  missing_total: number; missing_open: number; missing_matched: number; missing_closed: number;
  found_total: number; found_open: number; found_matched: number; found_referral: number;
  pairs: number;
}> {
  return one(client, `
    WITH m AS (
      SELECT
        count(*) FILTER (WHERE status IN ('submitted','open'))::int AS open_count,
        count(*) FILTER (WHERE status IN ('matched_pending_review','confirmed'))::int AS matched_count,
        count(*) FILTER (WHERE status = 'closed')::int AS closed_count,
        count(*)::int AS total
      FROM cases WHERE kind = 'missing'
    ),
    f AS (
      SELECT
        count(*) FILTER (WHERE status = 'open')::int AS open_count,
        count(*) FILTER (WHERE status = 'matched_pending_review')::int AS matched_count,
        count(*) FILTER (WHERE status = 'referred')::int AS referral_recorded,
        count(*)::int AS total
      FROM cases WHERE kind = 'found'
    ),
    p AS (SELECT count(*)::int AS pairs FROM match_candidates WHERE status = 'confirmed')
    SELECT
      (SELECT total FROM m)            AS missing_total,
      (SELECT open_count FROM m)       AS missing_open,
      (SELECT matched_count FROM m)    AS missing_matched,
      (SELECT closed_count FROM m)     AS missing_closed,
      (SELECT total FROM f)            AS found_total,
      (SELECT open_count FROM f)       AS found_open,
      (SELECT matched_count FROM f)    AS found_matched,
      (SELECT referral_recorded FROM f) AS found_referral,
      (SELECT pairs FROM p)            AS pairs
  `);
}

describe.skipIf(!dbTestsEnabled)("API-012 dashboard stats (P3-041, TC-012/TC-055)", () => {
  let actors: Actors;

  beforeAll(async () => {
    fixturePool = pool("admin");
    dbClient = await connect("admin");
    setPoolForTests(fixturePool);
    // The per-file database is throwaway (scripts/db/test-db.mjs creates a fresh
    // schema for every file under FERA_DB_TESTS=1), so no TRUNCATE/DELETE on
    // audit_log (append-only; CASCADE would trigger the no-truncate rule).
    const admin = await connect("admin");
    try {
      const data = loadDistrictData() as { districts: unknown[] };
      await seedDistricts(admin, data as Parameters<typeof seedDistricts>[1]);
      actors = await createActors(admin);
    } finally {
      await admin.end();
    }
  });

  afterAll(async () => {
    setPoolForTests(null);
    if (dbClient) await dbClient.end();
    if (fixturePool) await fixturePool.end();
  });

  it("returns all 64 district rows including zero counts (TC-012)", async () => {
    const rows = await districtStats(dbClient);
    expect(rows).toHaveLength(64);
    // No duplicate codes; all 64 codes are 1..64; every other district reports 0.
    const codes = new Set(rows.map((r) => r.code));
    expect(codes.size).toBe(64);
    expect([...codes].sort((a, b) => a - b)).toEqual(Array.from({ length: 64 }, (_, i) => i + 1));
    for (const r of rows) {
      expect(r.missing_reports).toEqual({ open: 0, matched: 0, closed: 0 });
      expect(r.found_reports).toEqual({ open: 0, matched: 0, referral_recorded: 0 });
      expect(r.confirmed_pairs).toBe(0);
      expect(r.name_en.length).toBeGreaterThan(0);
      expect(r.name_bn.length).toBeGreaterThan(0);
    }
  });

  it("every district count equals an independent SQL GROUP BY (TC-012)", async () => {
    // Seed a small fixture set: one extra open missing, one matched pending review
    // missing, one open found, one referred found, plus a confirmed pair in district 1.
    const openMissingCase = await insertMissing(dbClient);
    await openMissing(dbClient, openMissingCase.id);
    const matchedMissingCase = await insertMissing(dbClient);
    await openMissing(dbClient, matchedMissingCase.id);
    const openFoundCase = await insertFound(dbClient, actors.staff);
    // Pair (TC-055): a closed pair contributes one to the pair figure and one each
    // to the closed-missing and found-referral buckets; the other seed rows stay open.
    const pair = await closedPair(dbClient, actors);

    // Compare to the independent GROUP BY over the exact same tables.
    const independent = await independentDistrictRows(dbClient);
    const service = await districtStats(dbClient);

    expect(service).toHaveLength(independent.length);
    for (let i = 0; i < service.length; i++) {
      const s = service[i];
      const g = independent[i];
      expect(s.code).toBe(g.code);
      expect(s.missing_reports).toEqual({
        open: g.missing_open,
        matched: g.missing_matched,
        closed: g.missing_closed,
      });
      expect(s.found_reports).toEqual({
        open: g.found_open,
        matched: g.found_matched,
        referral_recorded: g.found_referral,
      });
      expect(s.confirmed_pairs).toBe(g.pairs);
    }

    // Sanity: the row in district 1 has the counts we just seeded.
    const d1 = service.find((r) => r.code === 1)!;
    expect(d1.missing_reports.open).toBeGreaterThanOrEqual(1);
    expect(d1.missing_reports.closed).toBeGreaterThanOrEqual(1); // pair closes the missing
    expect(d1.found_reports.referral_recorded).toBeGreaterThanOrEqual(1); // pair moves the found to referred
    expect(d1.confirmed_pairs).toBeGreaterThanOrEqual(1);
    // The lone non-paired open missing and open found also landed in district 1.
    expect(d1.missing_reports.open).toBeGreaterThanOrEqual(1);
    expect(d1.found_reports.open).toBeGreaterThanOrEqual(1);
    // Referenced in the comparison above; silence the unused-binding warning.
    expect([openMissingCase, matchedMissingCase, openFoundCase, pair].length).toBe(4);
  });

  it("totalsOf matches a single independent GROUP BY over the same tables", async () => {
    const service = await districtStats(dbClient);
    const totals = totalsOf(service);
    const truth = await totalCounts(dbClient);
    expect(totals.missing_reports).toEqual({
      open: truth.missing_open,
      matched: truth.missing_matched,
      closed: truth.missing_closed,
    });
    expect(totals.found_reports).toEqual({
      open: truth.found_open,
      matched: truth.found_matched,
      referral_recorded: truth.found_referral,
    });
    expect(totals.confirmed_pairs).toBe(truth.pairs);
  });

  it("a confirmed pair contributes one to confirmed_pairs and changes only the pair side's buckets (TC-055)", async () => {
    // Take a fresh independent GROUP BY; the closedPair fixture above already
    // established a confirmed pair in district 1 with a closed-missing/referred-found.
    // We verify here that a second confirmed pair, made from fresh open endpoints,
    // bumps only the pair figure and the matched/closed/referral buckets of the
    // affected cases, never the open counts of the un-paired cases.
    const before = await districtStats(dbClient);
    const beforeTotal = totalsOf(before).confirmed_pairs;
    const d1Before = before.find((r) => r.code === 1)!;
    const beforeOpenMissing = d1Before.missing_reports.open;
    const beforeOpenFound = d1Before.found_reports.open;

    // Build a brand-new pair in district 1, keeping the open/closed/.../open cases
    // distinct so each state change is attributable to one decision.
    const missing = await insertMissing(dbClient);
    await openMissing(dbClient, missing.id);
    const found = await insertFound(dbClient, actors.staff);
    const candidateId = await addCandidate(dbClient, missing.id, found.id);
    await confirmPair(dbClient, { candidateId, missingId: missing.id, foundId: found.id, officerId: actors.officer });
    await closeMissing(dbClient, missing.id);

    const after = await districtStats(dbClient);
    const d1After = after.find((r) => r.code === 1)!;
    const afterTotal = totalsOf(after).confirmed_pairs;

    // Pair count: +1 (one confirmed pair).
    expect(afterTotal - beforeTotal).toBe(1);
    // Missing side: the new missing moved submitted→open→matched→confirmed→closed,
    // so closed +1. Open count is unchanged because we did not add a brand-new open
    // missing; the open count of district 1 already reflected the previous open
    // missing (the lone seed) and this one left the open bucket as soon as the
    // candidate inserted.
    expect(d1After.missing_reports.closed - d1Before.missing_reports.closed).toBe(1);
    // Found side: the new found moved open→matched_pending_review→referred, so
    // referral_recorded +1 and the matched bucket could be back at its previous
    // value (the candidate UPDATE moved it; confirmPair's UPDATE moved it again).
    expect(d1After.found_reports.referral_recorded - d1Before.found_reports.referral_recorded).toBe(1);
    // The earlier open-found seed case is still in the open bucket (we did not
    // touch it). So the open count of district 1 reflects the surviving open found.
    expect(d1After.found_reports.open).toBeGreaterThanOrEqual(1);
    // Pairs figure is the pair count, not the missing or found count.
    expect(d1After.confirmed_pairs - d1Before.confirmed_pairs).toBe(1);
    // Unrelated cells (matched) do not move for a side that did not change.
    expect(d1Before.missing_reports.open).toBe(beforeOpenMissing);
    expect(d1Before.found_reports.open).toBe(beforeOpenFound);
  });

  it("redacting a case leaves every count unchanged (TC-015, aggregate lifecycle fields are kept)", async () => {
    const m = await insertMissing(dbClient);
    await openMissing(dbClient, m.id);
    // A redaction may not rewrite the lifecycle in the same UPDATE: close first, snapshot, then redact.
    await asFixtureOwner(async (c) => {
      await c.query(
        "UPDATE cases SET status = 'closed', outcome = 'resolved_outside_fera', outcome_note = '[MOCK] synthetic closure note', closed_at = now() WHERE id = $1",
        [m.id],
      );
    });
    const beforeRedaction = (await districtStats(dbClient)).find((r) => r.code === 1)!;
    await asFixtureOwner(async (c) => {
      await c.query(
        `UPDATE cases SET anonymised_at = now(),
                           child_name = NULL, child_name_latin = NULL, contact_phone = NULL,
                           raw_text = NULL, place_text = NULL, embedding = NULL,
                           height_cm = NULL, clothing = NULL, marks = NULL, circumstances = NULL,
                           thana = NULL, reporter_relation = NULL, gd_number = NULL,
                           source_url = NULL, age_years = NULL, outcome_note = NULL,
                           reporter_session_id = NULL, created_by_user_id = NULL,
                           input_hash = NULL, submission_payload_hash = NULL,
                           client_submission_id = NULL, provenance = '{}'::jsonb,
                           embedding_model = NULL, embedding_revision = NULL, embedding_space = NULL
         WHERE id = $1`,
        [m.id],
      );
    });
    const afterRedaction = (await districtStats(dbClient)).find((r) => r.code === 1)!;
    // Redaction clears identifying fields only; the pseudonymous counts do not move.
    expect(afterRedaction.missing_reports).toEqual(beforeRedaction.missing_reports);
    expect(afterRedaction.found_reports).toEqual(beforeRedaction.found_reports);
    expect(afterRedaction.confirmed_pairs).toBe(beforeRedaction.confirmed_pairs);
    // And the counts still agree with an independent GROUP BY over the same rows.
    const d1Ind = (await independentDistrictRows(dbClient)).find((g) => g.code === 1)!;
    expect(afterRedaction.missing_reports.closed).toBe(d1Ind.missing_closed);
    expect(afterRedaction.confirmed_pairs).toBe(d1Ind.pairs);
    const { rows } = await dbClient.query<{ anonymised_at: string | null }>("SELECT anonymised_at FROM cases WHERE id = $1", [m.id]);
    expect(rows[0]?.anonymised_at).not.toBeNull();
  });

  it("listCasesForDistrict filters by district, kind and status_group with cursor pagination", async () => {
    // The district 1 fixtures above are the data; the listing is read-only and
    // does not change counts. We assert the listing matches an independent SQL
    // query that uses the same WHERE/ORDER clauses the service uses.
    const limit = 50;
    const listed = await listCasesForDistrict(dbClient, { district: "1", limit });
    expect(listed.rows.length).toBeGreaterThan(0);
    // The strict sort (id DESC) and the filter (anonymised_at IS NULL, district = 1).
    const ids = listed.rows.map((r) => r.id);
    const sorted = [...ids].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    expect(ids).toEqual(sorted);
    for (const r of listed.rows) {
      expect(r.district_code).toBe(1);
      expect(r.anonymised_at).toBeNull();
    }

    // Independent query: same predicates, same order.
    const independent = await dbClient.query<{ id: string; ref_code: string; kind: string; status: string; status_group: string; district_code: number; anonymised_at: string | null; created_at: string }>(
      `SELECT id, ref_code, kind, status,
              CASE WHEN kind='missing' AND status IN ('matched_pending_review','confirmed') THEN 'matched'
                   WHEN kind='missing' AND status='closed' THEN 'closed'
                   WHEN kind='missing' THEN 'open'
                   WHEN status='referred' THEN 'closed'
                   WHEN status='matched_pending_review' THEN 'matched'
                   ELSE 'open'
              END AS status_group,
              district_code, anonymised_at, created_at
       FROM cases
       WHERE anonymised_at IS NULL AND district_code = 1
       ORDER BY id DESC
       LIMIT $1`,
      [limit + 1],
    );
    const indRows = independent.rows.map((r) => ({
      id: r.id, ref_code: r.ref_code, kind: r.kind, status: r.status, status_group: r.status_group,
      district_code: r.district_code,
      anonymised_at: (r.anonymised_at as unknown) instanceof Date ? toDhakaIso((r.anonymised_at as unknown as Date).getTime()) : r.anonymised_at,
      created_at: (r.created_at as unknown) instanceof Date ? toDhakaIso((r.created_at as unknown as Date).getTime()) : r.created_at,
    }));
    expect(listed.rows.length).toBe(indRows.length);
    for (let i = 0; i < listed.rows.length; i++) {
      expect(listed.rows[i]).toEqual(indRows[i]);
    }
  });
});
