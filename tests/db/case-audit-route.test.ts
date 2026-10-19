// API-013 GET /api/cases/:id/audit (P3-018 continuation; TASK-029 part; FR-021;
// BR-010/024; TC-016/052). DB tests with the real pool (fera_test_<pid>_<n>, see
// scripts/db/test-db.mjs) and the real audit log. The service-level and audit-reader
// tests are green; these tests exercise the real route handler against the real test
// database.
//
// Modelled on tests/db/case-read.test.ts (P3-016): the test inserts a minimal synthetic
// case, seeds a handful of audit_log rows (case.created, case.closed, match.confirm)
// directly, builds a principal/session through the real `parentPrincipal` /
// `userPrincipal` constructors, calls the exported route GET and asserts on the
// response and on the audit_log rows. Only the two files in this brief are created; no
// existing file is modified.
//
// What these tests cover:
//   (a) verified officer gets the officer view with entries (operational allowlist);
//   (b) admin gets the admin view; the JSON contains none of `candidate_id`,
//       `actor_id`, `score` (metadata allowlist only);
//   (c) parent session → E-004 envelope and one `access.denied` audit row;
//   (d) unknown but well-formed case id → E-004 and an `access.denied` audit row with
//       a null case FK (TC-052).
//
// Run with: npm run test:db (this file is auto-discovered by scripts/db/test-db.mjs).
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getPool, setPoolForTests } from "@/server/db/pool";
import { adminAuditResponseSchema, errorEnvelopeSchema, officerAuditResponseSchema } from "@/contracts";
import { parentPrincipal, userPrincipal, type Principal } from "@/contracts/server";
import { GET } from "@/app/api/cases/[id]/audit/route";
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

// Insert a minimal synthetic missing case owned by the given parent session.
// The schema's state-machine guard only accepts 'submitted' on INSERT; we transition
// to 'open' in the same transaction so the audit route can read it as an open case.
async function insertMissingCase(sessionId: string): Promise<{ id: string; ref: string }> {
  return asFixtureOwner(async (c) => {
    const ref = `M-${randomUUID().slice(0, 6).toUpperCase()}`;
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO cases (ref_code, kind, status, source, is_synthetic, reporter_session_id,
                          client_submission_id, submission_payload_hash, sex, event_at,
                          event_at_lower, event_at_upper, place_text, district_code, contact_phone,
                          provenance, child_name, age_min, age_max)
       VALUES ($1, 'missing', 'submitted', 'parent', true, $2, $3, $4, 'male', now(), now(), now(), 'place', 1, $5, '{}'::jsonb, '[MOCK] Rafi', 7, 7)
       RETURNING id`,
      [ref, sessionId, randomUUID(), randomBytes(32).toString("hex"), fakePhone()],
    );
    await c.query("UPDATE cases SET status = 'open' WHERE id = $1", [rows[0].id]);
    return { id: rows[0].id, ref };
  });
}

// Insert a verified active officer user.
async function insertVerifiedOfficer(): Promise<{ id: string; displayName: string }> {
  return asFixtureOwner(async (c) => {
    const u = randomUUID();
    // displayNameSchema rejects digit runs, so strip digits from the random suffix.
    const displayName = `[MOCK] Officer ${u.slice(0, 8).replace(/\d/g, "x")}`;
    await c.query(
      `INSERT INTO users (id, role, username, display_name, password_hash, verified, is_active)
       VALUES ($1, 'officer', $2, $3, '$argon2id$v=19$m=19456,t=2,p=1$aaaaaaaaaaaaaaaaaaaaaa$bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', true, true)`,
      [u, `officer_${u.slice(0, 8)}`, displayName],
    );
    return { id: u, displayName };
  });
}

async function insertAdminUser(): Promise<{ id: string }> {
  return asFixtureOwner(async (c) => {
    const id = randomUUID();
    await c.query(
      `INSERT INTO users (id, role, username, display_name, password_hash, verified, is_active)
       VALUES ($1, 'admin', $2, '[MOCK] Admin', '$argon2id$v=19$m=19456,t=2,p=1$aaaaaaaaaaaaaaaaaaaaaa$bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', false, true)`,
      [id, `admin_${id.slice(0, 8)}`],
    );
    return { id };
  });
}

async function insertParentSession(): Promise<string> {
  return asFixtureOwner(async (c) => {
    const s = randomUUID();
    await c.query(`INSERT INTO parent_sessions (id) VALUES ($1)`, [s]);
    return s;
  });
}

// Seed a handful of audit rows for a case (case.created, case.closed). Written via
// the owner connection so the audit_log is filled before the route reads it. The
// `match.confirm` row is also seeded because the officer-view assertion checks
// that `score` and `candidate_id` are present in the operational allowlist; the
// details carry the same key names so the projection picks them up without
// requiring a real match_candidates FK (the `audit_log.candidate_id` column is
// left NULL for the same reason).
async function seedAuditRows(input: {
  caseId: string;
  refCode: string;
  officerId: string;
}): Promise<void> {
  await asFixtureOwner(async (c) => {
    await c.query(
      `INSERT INTO audit_log (actor_type, actor_user_id, action, case_id, details)
       VALUES ('officer', $1, 'case.created', $2, $3::jsonb)`,
      [input.officerId, input.caseId, JSON.stringify({ ref_code: input.refCode, version: 1, api: "API-003" })],
    );
    await c.query(
      `INSERT INTO audit_log (actor_type, actor_user_id, action, case_id, details)
       VALUES ('officer', $1, 'match.confirm', $2, $3::jsonb)`,
      [
        input.officerId,
        input.caseId,
        JSON.stringify({
          ref_code: input.refCode,
          candidate_id: "00000000-0000-4000-8000-000000000099",
          missing_ref: input.refCode,
          found_ref: "F-000099",
          missing_version: 1,
          found_version: 1,
          score: 87,
          rank: 1,
          decision: "confirm",
          candidate_status: "confirmed",
          api: "API-010",
          reason_recorded: true,
        }),
      ],
    );
    await c.query(
      `INSERT INTO audit_log (actor_type, actor_user_id, action, case_id, details)
       VALUES ('officer', $1, 'case.closed', $2, $3::jsonb)`,
      [input.officerId, input.caseId, JSON.stringify({ ref_code: input.refCode, outcome: "resolved_outside_fera", api: "API-011", reason_recorded: true })],
    );
  });
}

describe.skipIf(!dbTestsEnabled)("API-013 cases audit (P3-018, TC-016/052)", () => {
  let parentSessionId!: string;
  let otherParentSessionId!: string;
  let officerUserId!: string;
  let adminUserId!: string;
  let missingCaseId!: string;
  let missingRef!: string;

  beforeAll(async () => {
    fixturePool = pool("admin");
    appPool = pool("app");
    setPoolForTests(appPool);
    const fixtureClient = await fixturePool.connect();
    try { await seedReference(fixtureClient); } finally { fixtureClient.release(); }
    parentSessionId = await insertParentSession();
    otherParentSessionId = await insertParentSession();
    const officer = await insertVerifiedOfficer();
    officerUserId = officer.id;
    adminUserId = (await insertAdminUser()).id;
    const missing = await insertMissingCase(parentSessionId);
    missingCaseId = missing.id;
    missingRef = missing.ref;
    await seedAuditRows({
      caseId: missingCaseId,
      refCode: missingRef,
      officerId: officerUserId,
    });
  });

  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    setPoolForTests(null);
    if (appPool) await appPool.end();
    if (fixturePool) await fixturePool.end();
  });

  async function getAs(principal: Principal, id: string): Promise<Response> {
    vi.spyOn(defaultAuth(), "resolvePrincipal").mockResolvedValue(principal);
    return GET(new Request(`http://localhost/api/cases/${id}/audit`), { params: Promise.resolve({ id }) });
  }

  // (a) A verified officer gets the officer view with entries.
  it("verified officer gets the officer view with entries", async () => {
    const principal = userPrincipal({ id: officerUserId, role: "officer", verified: true, is_active: true });
    expect(principal).not.toBeNull();
    const res = await getAs(principal!, missingCaseId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.view).toBe("officer");
    const view = officerAuditResponseSchema.parse(body);
    expect(view.entries.length).toBeGreaterThanOrEqual(3);
    const actions = view.entries.map((e) => e.action);
    expect(actions).toContain("case.created");
    expect(actions).toContain("match.confirm");
    expect(actions).toContain("case.closed");
    // The match.confirm entry retains the operational allowlist (candidate id, score).
    const confirm = view.entries.find((e) => e.action === "match.confirm");
    expect(confirm?.details.candidate_id).toBe("00000000-0000-4000-8000-000000000099");
    expect(confirm?.details.score).toBe(87);
    // Officer sees actor identity.
    expect(confirm?.actor_id).toBe(officerUserId);
  });

  // (b) An admin gets the admin view; the JSON contains none of `candidate_id`,
  // `actor_id`, `score`. The admin allowlist is metadata only.
  it("admin gets the admin view; JSON contains none of candidate_id, actor_id, score", async () => {
    const principal = userPrincipal({ id: adminUserId, role: "admin", verified: false, is_active: true });
    expect(principal).not.toBeNull();
    const res = await getAs(principal!, missingCaseId);
    expect(res.status).toBe(200);
    // Read the body once and assert against the serialised text (no extra read).
    const raw = await res.text();
    expect(raw).not.toContain("candidate_id");
    expect(raw).not.toContain("actor_id");
    expect(raw).not.toContain("score");
    const body = JSON.parse(raw) as Record<string, unknown>;
    expect(body.view).toBe("admin");
    const view = adminAuditResponseSchema.parse(body);
    expect(view.entries.length).toBeGreaterThanOrEqual(3);
    // Admin sees actor_role only; no actor_id, no actor_display.
    for (const entry of view.entries) {
      const ownKeys = Object.keys(entry).sort();
      expect(ownKeys).toEqual(["action", "actor_role", "at", "details"]);
      // Operational keys are stripped from the admin details.
      const detailKeys = Object.keys(entry.details);
      expect(detailKeys).not.toContain("candidate_id");
      expect(detailKeys).not.toContain("score");
    }
  });

  // (c) A parent session is denied by the API-013 role guard (parent is not in
  // API_ACCESS["API-013"] = ["officer", "admin"]). The route returns E-004 and writes
  // an `access.denied` audit row. The case FK is null because the role guard denies
  // before the case id is read (the `caseId` parameter to ApiError is unset).
  it("parent → E-004 envelope and access.denied audit row", async () => {
    const session = { id: otherParentSessionId, expires_at: "2099-01-01T00:00:00+06:00", revoked_at: null };
    const principal = parentPrincipal(session);
    expect(principal).not.toBeNull();
    const res = await getAs(principal!, missingCaseId);
    expect(res.status).toBe(404);
    const envelope = errorEnvelopeSchema.parse(await res.json());
    expect(envelope.error.id).toBe("E-004");
    const denial = await getPool().query<{ case_id: string | null; details: { api?: string; error_id?: string } }>(
      `SELECT case_id, details FROM audit_log WHERE action = 'access.denied' AND actor_session_id = $1 ORDER BY id DESC LIMIT 1`,
      [otherParentSessionId],
    );
    expect(denial.rows.length).toBe(1);
    expect(denial.rows[0]?.details.api).toBe("API-013");
    expect(denial.rows[0]?.details.error_id).toBe("E-004");
  });

  // (d) TC-052: an unknown but well-formed case id → E-004 and an access.denied
  // audit row with a NULL case FK (the case does not exist, so the FK is dropped).
  it("unknown but well-formed case id → E-004 and access.denied audit row with NULL case FK (TC-052)", async () => {
    const principal = userPrincipal({ id: officerUserId, role: "officer", verified: true, is_active: true });
    expect(principal).not.toBeNull();
    const fakeId = "00000000-0000-4000-8000-0000000000ff";
    const res = await getAs(principal!, fakeId);
    expect(res.status).toBe(404);
    const envelope = errorEnvelopeSchema.parse(await res.json());
    expect(envelope.error.id).toBe("E-004");
    const denial = await getPool().query<{ case_id: string | null; details: { api?: string; error_id?: string } }>(
      `SELECT case_id, details FROM audit_log WHERE action = 'access.denied' AND actor_user_id = $1 ORDER BY id DESC LIMIT 1`,
      [officerUserId],
    );
    expect(denial.rows.length).toBe(1);
    expect(denial.rows[0]?.case_id).toBeNull();
    expect(denial.rows[0]?.details.api).toBe("API-013");
    expect(denial.rows[0]?.details.error_id).toBe("E-004");
  });
});
