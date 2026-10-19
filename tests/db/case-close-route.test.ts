// API-011 POST /api/cases/:id/close (P3-018 continuation; TASK-029 part; FR-018; BR-012;
// TC-010/032). DB tests with the real pool (fera_test_<pid>_<n>, see scripts/db/test-db.mjs)
// and the real audit log. The service-level and audit-reader tests are green; these tests
// exercise the real route handler against the real test database.
//
// Modelled on tests/db/case-read.test.ts (P3-016): the test inserts a minimal synthetic
// missing report, builds a principal/session through the real `parentPrincipal` /
// `userPrincipal` constructors, calls the exported route POST and asserts on the response
// and on the audit_log rows. Only the two files in this brief are created; no existing
// file is modified.
//
// What these tests cover:
//   (a) verified active officer closes an open missing report with outcome
//       resolved_outside_fera and the correct expected_version → 200 and the case is
//       closed (`status = 'closed'`, `outcome = 'resolved_outside_fera'`, `closed_at` set);
//   (b) parent session → E-004 envelope and one `access.denied` audit row;
//   (c) stale expected_version → E-005 envelope;
//   (d) malformed id in the path → E-004 (no 500) and the route still returns the
//       generic error envelope.
//
// Run with: npm run test:db (this file is auto-discovered by scripts/db/test-db.mjs).
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setPoolForTests, getPool } from "@/server/db/pool";
import { closeCaseRequestSchema, errorEnvelopeSchema } from "@/contracts";
import { parentPrincipal, userPrincipal, type Principal } from "@/contracts/server";
import { POST } from "@/app/api/cases/[id]/close/route";
import { defaultAuth } from "@/server/auth/default";
import type { Pool, PoolClient } from "pg";
import { dbTestsEnabled, fakePhone, pool, seedReference } from "./support/db";

let fixturePool: Pool;
let appPool: Pool;

// Fixture setup uses the local test DB owner; reads under test use fera_app.
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

// Insert a minimal synthetic missing case with `status = 'open'`. The schema's
// state-machine guard only accepts status 'submitted' on INSERT; we insert with
// 'submitted' and then transition to 'open' in the same transaction. 'open' is the
// only status where `resolved_outside_fera` is legal (allowedCloseOutcome("open")).
async function insertOpenMissingCase(sessionId: string): Promise<{ id: string; version: number }> {
  return asFixtureOwner(async (c) => {
    const { rows } = await c.query<{ id: string; version: number }>(
      `INSERT INTO cases (ref_code, kind, status, source, is_synthetic, reporter_session_id,
                          client_submission_id, submission_payload_hash, sex, event_at,
                          event_at_lower, event_at_upper, place_text, district_code, contact_phone,
                          provenance, child_name, age_min, age_max)
       VALUES ($1, 'missing', 'submitted', 'parent', true, $2, $3, $4, 'male', now(), now(), now(), 'place', 1, $5, '{}'::jsonb, '[MOCK] Rafi', 7, 7)
       RETURNING id, version`,
      [`M-${randomUUID().slice(0, 6).toUpperCase()}`, sessionId, randomUUID(), randomBytes(32).toString("hex"), fakePhone()],
    );
    await c.query("UPDATE cases SET status = 'open' WHERE id = $1", [rows[0].id]);
    return rows[0];
  });
}

// Insert an active verified officer user.
async function insertVerifiedOfficer(): Promise<{ id: string }> {
  return asFixtureOwner(async (c) => {
    const u = randomUUID();
    await c.query(
      `INSERT INTO users (id, role, username, display_name, password_hash, verified, is_active)
       VALUES ($1, 'officer', $2, 'Officer Test', '$argon2id$v=19$m=19456,t=2,p=1$aaaaaaaaaaaaaaaaaaaaaa$bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', true, true)`,
      [u, `officer_${u.slice(0, 8)}`],
    );
    return { id: u };
  });
}

// Insert a parent session row (no user).
async function insertParentSession(): Promise<string> {
  return asFixtureOwner(async (c) => {
    const s = randomUUID();
    await c.query(`INSERT INTO parent_sessions (id) VALUES ($1)`, [s]);
    return s;
  });
}

describe.skipIf(!dbTestsEnabled)("API-011 cases close (P3-018, TC-010/032)", () => {
  let parentSessionId!: string;
  let officerUserId!: string;
  let openCaseId!: string;
  let openCaseVersion!: number;
  let otherOpenCaseId!: string;
  let otherOpenCaseVersion!: number;

  beforeAll(async () => {
    fixturePool = pool("admin");
    appPool = pool("app");
    setPoolForTests(appPool);
    const fixtureClient = await fixturePool.connect();
    try { await seedReference(fixtureClient); } finally { fixtureClient.release(); }
    parentSessionId = await insertParentSession();
    const officer = await insertVerifiedOfficer();
    officerUserId = officer.id;
    const first = await insertOpenMissingCase(parentSessionId);
    openCaseId = first.id;
    openCaseVersion = first.version;
    const second = await insertOpenMissingCase(parentSessionId);
    otherOpenCaseId = second.id;
    otherOpenCaseVersion = second.version;
  });

  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    setPoolForTests(null);
    if (appPool) await appPool.end();
    if (fixturePool) await fixturePool.end();
  });

  // Invoke the real route handler with the given principal. The body is sent as a real
  // JSON request so the same `defineRoute` body parsing path runs. The
  // `sec-fetch-site: same-origin` header lets the route's state-change origin check pass.
  async function postAs(principal: Principal, id: string, body: unknown): Promise<Response> {
    vi.spyOn(defaultAuth(), "resolvePrincipal").mockResolvedValue(principal);
    const req = new Request(`http://localhost/api/cases/${id}/close`, {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: JSON.stringify(body),
    });
    return POST(req, { params: Promise.resolve({ id }) });
  }

  // (a) Happy path: a verified active officer closes an open missing case with
  // `resolved_outside_fera` and the correct expected_version.
  it("verified officer closes an open missing report → 200, case is closed", async () => {
    const principal = userPrincipal({ id: officerUserId, role: "officer", verified: true, is_active: true });
    expect(principal).not.toBeNull();
    const body = closeCaseRequestSchema.parse({
      outcome: "resolved_outside_fera",
      note: "[MOCK] synthetic closure note",
      expected_version: openCaseVersion,
    });
    const res = await postAs(principal!, openCaseId, body);
    expect(res.status).toBe(200);
    const response = (await res.json()) as Record<string, unknown>;
    expect(response.status).toBe("closed");
    expect(response.ref_code).toMatch(/^M-/);
    expect(typeof response.closed_at).toBe("string");

    // The case row is closed in the database with the requested outcome.
    const after = await getPool().query<{ status: string; outcome: string | null; closed_at: string | null }>(
      `SELECT status, outcome, closed_at FROM cases WHERE id = $1`,
      [openCaseId],
    );
    expect(after.rows[0]?.status).toBe("closed");
    expect(after.rows[0]?.outcome).toBe("resolved_outside_fera");
    expect(after.rows[0]?.closed_at).not.toBeNull();

    // Exactly one case.closed audit row was written for this case by this officer.
    const audits = await getPool().query<{ actor_user_id: string; details: { outcome?: string } }>(
      `SELECT actor_user_id, details FROM audit_log WHERE case_id = $1 AND action = 'case.closed' ORDER BY id DESC`,
      [openCaseId],
    );
    expect(audits.rows.length).toBe(1);
    expect(audits.rows[0]?.actor_user_id).toBe(officerUserId);
    expect(audits.rows[0]?.details.outcome).toBe("resolved_outside_fera");
  });

  // (b) A parent session may not close a case (API-011 is officer-only). The role
  // guard denies with E-004 and writes an `access.denied` audit row. The case FK is
  // null because the role guard denies before the case id is read (the `caseId`
  // parameter to ApiError is unset by the guard).
  it("parent session → E-004 envelope and one access.denied audit row", async () => {
    const session = { id: parentSessionId, expires_at: "2099-01-01T00:00:00+06:00", revoked_at: null };
    const principal = parentPrincipal(session);
    expect(principal).not.toBeNull();
    const body = closeCaseRequestSchema.parse({
      outcome: "resolved_outside_fera",
      note: "[MOCK] parent attempt",
      expected_version: otherOpenCaseVersion,
    });
    const res = await postAs(principal!, otherOpenCaseId, body);
    expect(res.status).toBe(404);
    const envelope = errorEnvelopeSchema.parse(await res.json());
    expect(envelope.error.id).toBe("E-004");
    const denial = await getPool().query<{ case_id: string | null; details: { api?: string; error_id?: string } }>(
      `SELECT case_id, details FROM audit_log WHERE action = 'access.denied' AND actor_session_id = $1 ORDER BY id DESC LIMIT 1`,
      [parentSessionId],
    );
    expect(denial.rows.length).toBe(1);
    expect(denial.rows[0]?.details.api).toBe("API-011");
    expect(denial.rows[0]?.details.error_id).toBe("E-004");

    // The case is unchanged.
    const after = await getPool().query<{ status: string }>(
      `SELECT status FROM cases WHERE id = $1`,
      [otherOpenCaseId],
    );
    expect(after.rows[0]?.status).toBe("open");
  });

  // (c) The officer sends a stale expected_version → E-005 (no DB mutation, no
  // case.closed audit row). The case.close.refused audit row may be written by the
  // service in a separate transaction; we assert it exists with { error_id: "E-005" }.
  it("stale expected_version → E-005 envelope and no case.closed row", async () => {
    const principal = userPrincipal({ id: officerUserId, role: "officer", verified: true, is_active: true });
    expect(principal).not.toBeNull();
    // Insert a fresh open case so the version check is the only thing that fails.
    const fresh = await insertOpenMissingCase(parentSessionId);
    const staleBody = closeCaseRequestSchema.parse({
      outcome: "resolved_outside_fera",
      note: "[MOCK] stale version",
      expected_version: fresh.version + 99, // wrong on purpose
    });
    const res = await postAs(principal!, fresh.id, staleBody);
    expect(res.status).toBe(409);
    const envelope = errorEnvelopeSchema.parse(await res.json());
    expect(envelope.error.id).toBe("E-005");

    // The case was not closed.
    const after = await getPool().query<{ status: string }>(
      `SELECT status FROM cases WHERE id = $1`,
      [fresh.id],
    );
    expect(after.rows[0]?.status).toBe("open");

    // No case.closed row for this case.
    const closed = await getPool().query<{ id: number }>(
      `SELECT id FROM audit_log WHERE case_id = $1 AND action = 'case.closed'`,
      [fresh.id],
    );
    expect(closed.rows.length).toBe(0);
  });

  // (d) A malformed id in the path is treated as a hidden case → E-004, no 500. The
  // route returns the generic error envelope and writes an access.denied audit row
  // with a null case FK (the case id is not a UUID; existingCaseId() returns null).
  it("malformed id in the path → E-004, no 500, denial audit has null case FK", async () => {
    const principal = userPrincipal({ id: officerUserId, role: "officer", verified: true, is_active: true });
    expect(principal).not.toBeNull();
    const body = closeCaseRequestSchema.parse({
      outcome: "resolved_outside_fera",
      note: "[MOCK] malformed",
      expected_version: 1,
    });
    const res = await postAs(principal!, "not-a-uuid", body);
    expect(res.status).toBe(404);
    const envelope = errorEnvelopeSchema.parse(await res.json());
    expect(envelope.error.id).toBe("E-004");
    const denial = await getPool().query<{ case_id: string | null; details: { api?: string; error_id?: string } }>(
      `SELECT case_id, details FROM audit_log WHERE action = 'access.denied' AND actor_user_id = $1 ORDER BY id DESC LIMIT 1`,
      [officerUserId],
    );
    expect(denial.rows.length).toBe(1);
    expect(denial.rows[0]?.case_id).toBeNull();
    expect(denial.rows[0]?.details.api).toBe("API-011");
    expect(denial.rows[0]?.details.error_id).toBe("E-004");
  });
});
