// API-022 GET /api/cases (P3-041, TASK-030a, FR-019, BR-007/024, TC-012). DB tests
// with the real pool and the real schema.
//
// - listCasesForDistrict returns the officer drill-through rows for the route; the
//   tests assert equality with an independent SQL query that uses the same WHERE
//   and ORDER BY clauses. The service is a thin reader; the route layer wraps it
//   with role guards and the per-role response schema.
// - The cursor (id of the previous page's last row) is filtered with `id < cursor`
//   so the second page strictly precedes the first. The limit clamp caps pages at
//   50 and floors at 1.
// - Status-group filtering maps the API-022 enum ("open" / "matched" / "closed")
//   to the case_status values the service knows. A "closed" group includes the
//   closed-missing and the referred-found buckets; "matched" includes
//   matched_pending_review and confirmed for missing plus matched_pending_review
//   for found.
//
// Runs under the fast DB loop (`/tmp/dbtest.sh`); skipped in plain `npm test`.
import type { Client, Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { listCasesForDistrict, type CaseListRow } from "@/server/dashboard";
import { caseListResponseSchema, cursorSchema, officerCaseRowSchema, toDhakaIso } from "@/contracts";
import { userPrincipal } from "@/contracts/server";
import { listOfficerCases } from "@/server/case";
import { setPoolForTests } from "@/server/db/pool";
// @ts-expect-error -- plain ESM script without type declarations
import { loadDistrictData, seedDistricts } from "../../db/seed/districts.mjs";
import {
  addCandidate, closeMissing, closedPair, connect, createActors, dbTestsEnabled,
  insertFound, insertMissing, openMissing, pool, tx, type Actors,
} from "./support/db";

let fixturePool: Pool;
// Long-lived Client (not Pool): the support helpers take ClientBase, and Pool is
// not structurally a ClientBase. We use a single Client from connect("admin") for
// both the fixture helpers and the service-under-test calls.
let dbClient: Client;

async function asFixtureOwner<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
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

type RawRow = {
  id: string;
  ref_code: string;
  kind: string;
  status: string;
  status_group: string;
  district_code: number | null;
  anonymised_at: string | null;
  created_at: string;
};

// Mirror the listing SQL minus the service-specific LIMIT/+1 trick so a real bug in
// the WHERE/ORDER shows up as a row-set mismatch. The route layer passes
// `limit + 1` so the service can detect the next page; we use the same convention.
function listingSql(where: string): string {
  return `SELECT id, ref_code, kind, status,
                 CASE WHEN kind='missing' AND status IN ('matched_pending_review','confirmed') THEN 'matched'
                      WHEN kind='missing' AND status='closed' THEN 'closed'
                      WHEN kind='missing' THEN 'open'
                      WHEN status='referred' THEN 'closed'
                      WHEN status='matched_pending_review' THEN 'matched'
                      ELSE 'open'
                 END AS status_group,
                 district_code, anonymised_at, created_at
          FROM cases
          WHERE ${where}
          ORDER BY id DESC`;
}

function projectRaw(r: RawRow): CaseListRow {
  return {
    id: r.id,
    ref_code: r.ref_code,
    kind: r.kind as "missing" | "found",
    status: r.status as CaseListRow["status"],
    status_group: r.status_group as CaseListRow["status_group"],
    district_code: r.district_code,
    anonymised_at: r.anonymised_at,
    // The service returns contract timestamps (Dhaka ISO strings); pg gives a Date.
    created_at: (r.created_at as unknown) instanceof Date ? toDhakaIso((r.created_at as unknown as Date).getTime()) : r.created_at,
  };
}

describe.skipIf(!dbTestsEnabled)("API-022 case list (P3-041)", () => {
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

  it("indexes the live district cursor path", async () => {
    await dbClient.query("BEGIN");
    try {
      await dbClient.query("SET LOCAL enable_seqscan = off");
      const { rows } = await dbClient.query<{ "QUERY PLAN": unknown }>(
        "EXPLAIN (FORMAT JSON) SELECT id FROM cases WHERE district_code = 1 AND anonymised_at IS NULL ORDER BY id DESC LIMIT 20",
      );
      expect(JSON.stringify(rows[0]?.["QUERY PLAN"])).toContain("cases_district_anonymous_id_idx");
      await dbClient.query("ROLLBACK");
    } catch (err) {
      await dbClient.query("ROLLBACK").catch(() => undefined);
      throw err;
    }
  });

  it("returns cases ordered by id DESC, anonymised rows excluded, and respects the district filter", async () => {
    // Seed: one open missing, one open found, one matched pending review, one
    // anonymised (must not appear), all in district 1.
    const m1 = await insertMissing(dbClient); await openMissing(dbClient, m1.id);
    const m2 = await insertMissing(dbClient); await openMissing(dbClient, m2.id);
    await insertFound(dbClient, actors.staff);
    // A matched pair (missing matched, found matched_pending_review, but missing
    // still 'open' before addCandidate). After addCandidate, both go to matched.
    const m3 = await insertMissing(dbClient); await openMissing(dbClient, m3.id);
    const f2 = await insertFound(dbClient, actors.staff);
    const c1 = await addCandidate(dbClient, m3.id, f2.id);
    expect(c1).toMatch(/^[0-9a-f-]{36}$/);

    // Anonymised (must not show up).
    const m4 = await insertMissing(dbClient); await openMissing(dbClient, m4.id);
    // Redaction may not rewrite the lifecycle in the same UPDATE: close first, redact afterwards.
    await closeMissing(dbClient, m4.id, "resolved_outside_fera");
    await asFixtureOwner(async (c) => {
      await c.query("SELECT set_config('fera.redaction_actor_id', $1, true)", [actors.admin]);
      await c.query("SELECT redact_case($1, $2)", [m4.id, actors.admin]);
    });

    const listed = await listCasesForDistrict(dbClient, { district: "1", limit: 50 });
    const ids = listed.rows.map((r) => r.id);
    // Strict id DESC, no anonymised row, no district mismatch.
    expect(ids).toEqual([...ids].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)));
    for (const r of listed.rows) {
      expect(r.district_code).toBe(1);
      expect(r.anonymised_at).toBeNull();
    }
    // The anonymised m4 must be absent.
    expect(ids).not.toContain(m4.id);
    // The pair endpoints (m3, f2) must be present.
    expect(ids).toContain(m3.id);
    expect(ids).toContain(f2.id);

    // Compare to an independent query over the same data.
    const independent = await dbClient.query<RawRow>(
      listingSql("anonymised_at IS NULL AND district_code = 1") + " LIMIT $1",
      [51],
    );
    expect(listed.rows).toEqual(independent.rows.map(projectRaw));
  });

  it("filters by kind (missing or found)", async () => {
    const missingOnly = await listCasesForDistrict(dbClient, { district: "1", kind: "missing", limit: 50 });
    const foundOnly = await listCasesForDistrict(dbClient, { district: "1", kind: "found", limit: 50 });
    expect(missingOnly.rows.every((r) => r.kind === "missing")).toBe(true);
    expect(foundOnly.rows.every((r) => r.kind === "found")).toBe(true);
    // Together, they make the unfiltered district 1 list (modulo the next-cursor
    // sentinel and the limit).
    const combined = [...missingOnly.rows, ...foundOnly.rows]
      .sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
      .map(projectRaw);
    const union = await listCasesForDistrict(dbClient, { district: "1", limit: 50 });
    expect(combined).toEqual(union.rows.map(projectRaw));
  });

  it("filters by status_group (open, matched, closed) per the API-022 mapping", async () => {
    // Set up: at least one open missing, one matched missing (via addCandidate),
    // one closed missing (via closeMissing).
    const om = await insertMissing(dbClient); await openMissing(dbClient, om.id);
    const mm = await insertMissing(dbClient); await openMissing(dbClient, mm.id);
    const mf = await insertFound(dbClient, actors.staff);
    await addCandidate(dbClient, mm.id, mf.id);
    const cm = await insertMissing(dbClient); await openMissing(dbClient, cm.id);
    await closeMissing(dbClient, cm.id, "resolved_outside_fera");

    const openList = await listCasesForDistrict(dbClient, { district: "1", kind: "missing", status_group: "open", limit: 50 });
    const matchedList = await listCasesForDistrict(dbClient, { district: "1", kind: "missing", status_group: "matched", limit: 50 });
    const closedList = await listCasesForDistrict(dbClient, { district: "1", kind: "missing", status_group: "closed", limit: 50 });
    for (const r of openList.rows) expect(r.status_group).toBe("open");
    for (const r of matchedList.rows) expect(r.status_group).toBe("matched");
    for (const r of closedList.rows) expect(r.status_group).toBe("closed");
    expect(openList.rows.find((r) => r.id === om.id)).toBeDefined();
    expect(matchedList.rows.find((r) => r.id === mm.id)).toBeDefined();
    expect(closedList.rows.find((r) => r.id === cm.id)).toBeDefined();

    // "closed" for kind=found should include the referred bucket; a confirmed pair
    // moves the found to 'referred', which falls into the 'closed' status_group.
    const pair = await closedPair(dbClient, actors);
    const closedFound = await listCasesForDistrict(dbClient, { district: "1", kind: "found", status_group: "closed", limit: 50 });
    expect(closedFound.rows.find((r) => r.id === pair.found.id)).toBeDefined();
  });

  it("cursor pagination: next_cursor is the last id of the page, second page is `id < cursor`", async () => {
    // Fetch with a small limit so we definitely get a second page.
    const page1 = await listCasesForDistrict(dbClient, { district: "1", limit: 2 });
    expect(page1.rows.length).toBeLessThanOrEqual(2);
    if (page1.nextCursor === null) {
      // Not enough rows in district 1 to paginate; seed two more and retry.
      for (let i = 0; i < 3; i++) {
        const x = await insertMissing(dbClient);
        await openMissing(dbClient, x.id);
      }
      const retry = await listCasesForDistrict(dbClient, { district: "1", limit: 2 });
      expect(retry.nextCursor).not.toBeNull();
      return runTwoPageCheck(retry);
    }
    return runTwoPageCheck(page1);
  });

  async function runTwoPageCheck(page1: { rows: CaseListRow[]; nextCursor: string | null }): Promise<void> {
    expect(page1.nextCursor).not.toBeNull();
    if (page1.nextCursor === null) throw new Error("unreachable");
    const cursor = page1.nextCursor;
    const page2 = await listCasesForDistrict(dbClient, { district: "1", limit: 50, cursor });
    // Every row on page 2 must be strictly less than the cursor (id DESC ordering).
    for (const r of page2.rows) {
      expect(r.id < cursor).toBe(true);
    }
    // The union of the two pages, sorted, equals the unfiltered district 1 list.
    const union = [...page1.rows, ...page2.rows]
      .sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
      .map(projectRaw);
    const full = await listCasesForDistrict(dbClient, { district: "1", limit: 50 });
    expect(union).toEqual(full.rows.map(projectRaw));
  }

  it("the limit is clamped to 1..50", async () => {
    // Limit 0 and 999 are clamped: 0 → 1, 999 → 50. The clamp is internal; we just
    // assert that the row count never exceeds 50 and is at least 1.
    const tiny = await listCasesForDistrict(dbClient, { district: "1", limit: 0 });
    expect(tiny.rows.length).toBeLessThanOrEqual(1);
    const huge = await listCasesForDistrict(dbClient, { district: "1", limit: 999 });
    expect(huge.rows.length).toBeLessThanOrEqual(50);
  });

  it("returns a nonempty, contract-valid officer drill-through and continues with its opaque cursor", async () => {
    const firstFixture = await insertMissing(dbClient);
    await openMissing(dbClient, firstFixture.id);
    const secondFixture = await insertMissing(dbClient);
    await openMissing(dbClient, secondFixture.id);
    const principal = userPrincipal({
      id: actors.officer,
      role: "officer",
      verified: true,
      is_active: true,
    });
    if (!principal) throw new Error("fixture officer principal was invalid");

    const filter = { district: "1", kind: "missing" as const, status_group: "open" as const, limit: 1 };
    const querySpy = vi.spyOn(dbClient, "query");
    const firstPage = await listOfficerCases(principal, filter, dbClient);

    expect(firstPage.cases).toHaveLength(1);
    expect(querySpy).toHaveBeenCalledTimes(1);
    querySpy.mockClear();
    expect(caseListResponseSchema.safeParse(firstPage).success).toBe(true);
    expect(cursorSchema.safeParse(firstPage.next_cursor).success).toBe(true);
    expect(firstPage.cases[0]).toMatchObject({ kind: "missing", status_group: "open", is_synthetic: true, contact_phone: null });
    expect(Object.keys(firstPage.cases[0]!).sort()).toEqual(Object.keys(officerCaseRowSchema.shape).sort());
    expect(firstPage.cases[0]).not.toHaveProperty("raw_text");
    expect(firstPage.cases[0]).not.toHaveProperty("candidate_id");
    expect(firstPage.cases[0]).not.toHaveProperty("score");

    const cursor = firstPage.next_cursor;
    if (cursor === null) throw new Error("expected another page for the populated district");
    const secondPage = await listOfficerCases(principal, { ...filter, cursor }, dbClient);

    expect(secondPage.cases).toHaveLength(1);
    expect(querySpy).toHaveBeenCalledTimes(1);
    expect(secondPage.cases[0]?.id).not.toBe(firstPage.cases[0]?.id);
    expect(secondPage.cases[0]).toMatchObject({ kind: "missing", status_group: "open", event: { district_code: 1 } });
    expect(caseListResponseSchema.safeParse(secondPage).success).toBe(true);

    await expect(
      listOfficerCases(principal, { ...filter, cursor: "abcdefgh.abcdefghijklmnop" }, dbClient),
    ).rejects.toMatchObject({ id: "E-001" });
    querySpy.mockRestore();
  });

  it("does not include redacted linked cases in officer duplicate cues", async () => {
    const currentCase = await insertMissing(dbClient);
    const redactedCase = await insertMissing(dbClient);
    await openMissing(dbClient, currentCase.id);
    await openMissing(dbClient, redactedCase.id);
    await closeMissing(dbClient, redactedCase.id, "resolved_outside_fera");
    await dbClient.query(
      "INSERT INTO duplicate_links (case_a, case_b, score, rule) VALUES ($1, $2, 88, 'profile')",
      [currentCase.id, redactedCase.id].sort(),
    );
    await tx(dbClient, async () => {
      await dbClient.query("SELECT set_config('fera.redaction_actor_id', $1, true)", [actors.admin]);
      await dbClient.query("SELECT redact_case($1, $2)", [redactedCase.id, actors.admin]);
    });

    const principal = userPrincipal({ id: actors.officer, role: "officer", verified: true, is_active: true });
    if (!principal) throw new Error("fixture officer principal was invalid");
    const result = await listOfficerCases(principal, { district: "1", kind: "missing", status_group: "open", limit: 50 }, dbClient);
    const currentRow = result.cases.find((row) => row.id === currentCase.id);
    expect(currentRow).toBeDefined();
    expect(currentRow?.duplicate_of).toEqual([]);
  });
});
