// API-004 GET /api/cases/:id (P3-016; BR-007/010/024; TC-022/052). DB tests with the
// real pool (fera_test_<pid>_<n>, see scripts/db/test-db.mjs) and the real audit log.
//
// What these tests cover:
//   TC-022: a parent reading their own missing case gets OwnerCaseView (kind=missing
//           only; no child, no candidate, no other-party fields). A parent reading
//           another parent's missing case, or any found case, is hidden.
//   TC-052: an E-004 on an unknown case ID writes one access.denied audit row with a
//           null case FK. An E-004 on an existing-but-other-party case writes the row
//           with the real case FK.
//
// Run with: npm run test:db (this file is auto-discovered).
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { closePool, getPool } from "@/server/db/pool";
import { errorEnvelopeSchema, isUuid } from "@/contracts";
import { parentPrincipal, userPrincipal, type Principal } from "@/contracts/server";
import { actorFor } from "@/server/audit";
import { readCase } from "@/server/case";
import { GET } from "@/app/api/cases/[id]/route";
import { defaultAuth } from "@/server/auth/default";
import type { Pool, PoolClient } from "pg";
import { fakePhone, pool, seedReference } from "./support/db";

let fixturePool: Pool;

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
async function insertMissingCase(sessionId: string): Promise<string> {
  return asFixtureOwner(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO cases (ref_code, kind, status, source, is_synthetic, reporter_session_id,
                          client_submission_id, submission_payload_hash, sex, event_at,
                          event_at_lower, event_at_upper, place_text, district_code, contact_phone,
                          provenance, child_name, age_min, age_max)
       VALUES ($1, 'missing', 'submitted', 'parent', true, $2, $3, $4, 'male', now(), now(), now(), 'place', 1, $5, '{}'::jsonb, '[MOCK] Rafi', 7, 7)
       RETURNING id`,
      [`M-${randomUUID().slice(0, 6).toUpperCase()}`, sessionId, randomUUID(), randomBytes(32).toString("hex"), fakePhone()],
    );
    return rows[0].id;
  });
}

// Insert a minimal synthetic found case owned by the given user.
async function insertFoundCase(userId: string): Promise<string> {
  return asFixtureOwner(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO cases (ref_code, kind, status, source, is_synthetic, created_by_user_id,
                          client_submission_id, submission_payload_hash, sex, event_at,
                          event_at_lower, event_at_upper, place_text, district_code, contact_phone,
                          provenance, circumstances)
       VALUES ($1, 'found', 'open', 'staff', true, $2, $3, $4, 'male', now(), now(), now(), 'place', 1, $5, '{}'::jsonb, '[MOCK] found a boy')
       RETURNING id`,
      [`F-${randomUUID().slice(0, 6).toUpperCase()}`, userId, randomUUID(), randomBytes(32).toString("hex"), fakePhone()],
    );
    return rows[0].id;
  });
}

// Insert an active verified officer user.
async function insertVerifiedOfficer(): Promise<{ id: string; sessionId: string }> {
  return asFixtureOwner(async (c) => {
    const u = randomUUID();
    await c.query(
      `INSERT INTO users (id, role, username, display_name, password_hash, verified, is_active)
       VALUES ($1, 'officer', $2, 'Officer Test', 'x', true, true)`,
      [u, `officer_${u.slice(0, 8)}`],
    );
    const s = randomUUID();
    await c.query(`INSERT INTO parent_sessions (id) VALUES ($1)`, [s]);
    return { id: u, sessionId: s };
  });
}

async function insertDeskUser(role: "staff" | "officer", verified: boolean): Promise<string> {
  return asFixtureOwner(async (c) => {
    const id = randomUUID();
    await c.query(
      `INSERT INTO users (id, role, username, display_name, password_hash, verified, is_active)
       VALUES ($1, $2, $3, '[MOCK] Desk User', 'synthetic-not-a-hash', $4, true)`,
      [id, role, `${role}_${id.slice(0, 8)}`, verified],
    );
    return id;
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

describe("API-004 cases read (P3-016, TC-022/052)", () => {
  let parentSessionId!: string;
  let otherParentSessionId!: string;
  let officerUserId!: string;
  let adminUserId!: string;
  let missingCaseId!: string;
  let foundCaseId!: string;
  let staffUserId!: string;
  let staffFoundCaseId!: string;
  let unverifiedOfficerId!: string;
  let unverifiedFoundCaseId!: string;

  beforeAll(async () => {
    if (!process.env.FERA_DB_TESTS) throw new Error("test:db must run with FERA_DB_TESTS=1");
    fixturePool = pool("admin");
    const fixtureClient = await fixturePool.connect();
    try { await seedReference(fixtureClient); } finally { fixtureClient.release(); }
    parentSessionId = await insertParentSession();
    otherParentSessionId = await insertParentSession();
    const officer = await insertVerifiedOfficer();
    officerUserId = officer.id;
    adminUserId = await asFixtureOwner(async (c) => {
      const id = randomUUID();
      await c.query(
        `INSERT INTO users (id, role, username, display_name, password_hash, verified, is_active)
         VALUES ($1, 'admin', $2, 'Admin Test', 'x', false, true)`,
        [id, `admin_${id.slice(0, 8)}`],
      );
      return id;
    });
    missingCaseId = await insertMissingCase(parentSessionId);
    const officer2 = await insertVerifiedOfficer();
    foundCaseId = await insertFoundCase(officer2.id);
    staffUserId = await insertDeskUser("staff", false);
    staffFoundCaseId = await insertFoundCase(staffUserId);
    unverifiedOfficerId = await insertDeskUser("officer", false);
    unverifiedFoundCaseId = await insertFoundCase(unverifiedOfficerId);
  });

  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await closePool();
    if (fixturePool) await fixturePool.end();
  });

  async function getAs(principal: Principal, id: string): Promise<Response> {
    vi.spyOn(defaultAuth(), "resolvePrincipal").mockResolvedValue(principal);
    return GET(new Request(`http://localhost/api/cases/${id}`), { params: Promise.resolve({ id }) });
  }

  // TC-022: a parent reads their own missing case → OwnerCaseView, no other-party
  // fields. The readCase service is exposed via the internal barrel for tests; the
  // route wraps it and adds the access.denied audit hook on E-004.
  it("parent reading own missing case → owner view, no other-party fields", async () => {
    const session = { id: parentSessionId, expires_at: "2099-01-01T00:00:00+06:00", revoked_at: null };
    const principal = parentPrincipal(session);
    expect(principal).not.toBeNull();
    const r = await readCase(principal!, missingCaseId, { requestId: "00000000-0000-4000-8000-000000000001" });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.view.view).toBe("owner");
    expect(r.view.data.kind).toBe("missing");
    expect(r.view.data.id).toBe(missingCaseId);
    // No raw-row leak: contact_phone and raw_text must not appear on the parent view.
    const keys = Object.keys(r.view.data);
    expect(keys).not.toContain("contact_phone");
    expect(keys).not.toContain("child");
    expect(keys).not.toContain("raw_text");
  });

  it("the real GET route returns only the owner's projected DTO", async () => {
    const principal = parentPrincipal({ id: parentSessionId, expires_at: "2099-01-01T00:00:00+06:00", revoked_at: null });
    expect(principal).not.toBeNull();
    const res = await getAs(principal!, missingCaseId);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.id).toBe(missingCaseId);
    expect(body).not.toHaveProperty("contact_phone");
    expect(body).not.toHaveProperty("child_name");
    expect(body).not.toHaveProperty("candidate_id");
  });

  // TC-022: a parent reading another parent's case → E-004 (hidden).
  it("parent reading another parent's case → hidden (E-004)", async () => {
    const session = { id: otherParentSessionId, expires_at: "2099-01-01T00:00:00+06:00", revoked_at: null };
    const principal = parentPrincipal(session);
    expect(principal).not.toBeNull();
    const r = await readCase(principal!, missingCaseId, { requestId: "00000000-0000-4000-8000-000000000002" });
    expect(r.kind).toBe("hidden");
    if (r.kind !== "hidden") throw new Error("expected hidden");
    expect(r.caseId).toBe(missingCaseId);
  });

  // TC-022: a parent reading a found case → hidden.
  it("parent reading a found case → hidden (E-004)", async () => {
    const session = { id: parentSessionId, expires_at: "2099-01-01T00:00:00+06:00", revoked_at: null };
    const principal = parentPrincipal(session);
    expect(principal).not.toBeNull();
    const r = await readCase(principal!, foundCaseId, { requestId: "00000000-0000-4000-8000-000000000003" });
    expect(r.kind).toBe("hidden");
    if (r.kind !== "hidden") throw new Error("expected hidden");
    expect(r.caseId).toBe(foundCaseId);
  });

  // TC-022: an officer reading any case → officer view; raw contact phone audited.
  it("officer reading any case → officer view, contact_viewed audit row written", async () => {
    const principal = userPrincipal({ id: officerUserId, role: "officer", verified: true, is_active: true });
    expect(principal).not.toBeNull();
    const r = await readCase(principal!, missingCaseId, { requestId: "00000000-0000-4000-8000-000000000004" });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.view.view).toBe("officer");
    expect(r.view.data.kind).toBe("missing");
    expect(r.view.data.id).toBe(missingCaseId);
    // The read serves the raw contact phone: contact_viewed = true in the audit row.
    const pool = getPool();
    const { rows } = await pool.query<{ details: { contact_viewed?: boolean } }>(
      `SELECT details FROM audit_log WHERE case_id = $1 AND action = 'case.contact_viewed' ORDER BY at DESC LIMIT 1`,
      [missingCaseId],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].details.contact_viewed).toBe(true);
  });

  // TC-022: an admin reading any case → AdminCaseView metadata; no child payload.
  it("admin reading any case → metadata only, no child, no contact", async () => {
    const principal = userPrincipal({ id: adminUserId, role: "admin", verified: false, is_active: true });
    expect(principal).not.toBeNull();
    const r = await readCase(principal!, missingCaseId, { requestId: "00000000-0000-4000-8000-000000000005" });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.view.view).toBe("admin");
    expect(r.view.data.id).toBe(missingCaseId);
    const keys = Object.keys(r.view.data);
    expect(keys).not.toContain("child");
    expect(keys).not.toContain("contact_phone");
    expect(keys).not.toContain("draft");
  });

  it("staff sees its own found case and not another staff member's case", async () => {
    const principal = userPrincipal({ id: staffUserId, role: "staff", verified: false, is_active: true });
    expect(principal).not.toBeNull();
    const own = await getAs(principal!, staffFoundCaseId);
    expect(own.status).toBe(200);
    const ownBody = await own.json() as Record<string, unknown>;
    expect(ownBody.id).toBe(staffFoundCaseId);
    expect(ownBody.kind).toBe("found");
    expect(ownBody).not.toHaveProperty("candidate_id");
    const other = await getAs(principal!, foundCaseId);
    expect(other.status).toBe(404);
    expect(errorEnvelopeSchema.parse(await other.json()).error.id).toBe("E-004");
    const denied = await getPool().query<{ case_id: string }>(
      `SELECT case_id FROM audit_log WHERE action = 'access.denied' AND actor_user_id = $1 ORDER BY id DESC LIMIT 1`,
      [staffUserId],
    );
    expect(denied.rows[0]?.case_id).toBe(foundCaseId);
  });

  it("an unverified officer is scoped to its own found case as staff", async () => {
    const principal = userPrincipal({ id: unverifiedOfficerId, role: "officer", verified: false, is_active: true });
    expect(principal).not.toBeNull();
    const own = await getAs(principal!, unverifiedFoundCaseId);
    expect(own.status).toBe(200);
    const ownBody = await own.json() as Record<string, unknown>;
    expect(ownBody.id).toBe(unverifiedFoundCaseId);
    expect(ownBody.kind).toBe("found");
    expect(ownBody).not.toHaveProperty("candidate_id");
    const other = await getAs(principal!, staffFoundCaseId);
    expect(other.status).toBe(404);
    expect(errorEnvelopeSchema.parse(await other.json()).error.id).toBe("E-004");
    const denied = await getPool().query<{ case_id: string }>(
      `SELECT case_id FROM audit_log WHERE action = 'access.denied' AND actor_user_id = $1 ORDER BY id DESC LIMIT 1`,
      [unverifiedOfficerId],
    );
    expect(denied.rows[0]?.case_id).toBe(staffFoundCaseId);
  });

  // TC-052: the real GET route returns E-004 and audits a NULL FK for unknown IDs.
  it("unknown case id → access.denied audit row with NULL case FK (TC-052)", async () => {
    const session = { id: parentSessionId, expires_at: "2099-01-01T00:00:00+06:00", revoked_at: null };
    const principal = parentPrincipal(session);
    expect(principal).not.toBeNull();
    const fakeId = "00000000-0000-4000-8000-0000000000ff";
    expect(isUuid(fakeId)).toBe(true);
    const res = await getAs(principal!, fakeId);
    expect(res.status).toBe(404);
    expect(errorEnvelopeSchema.parse(await res.json()).error.id).toBe("E-004");
    const after = await getPool().query<{ details: { error_id?: string; api?: string }; case_id: string | null }>(
      `SELECT details, case_id FROM audit_log WHERE action = 'access.denied' AND actor_session_id = $1 ORDER BY id DESC LIMIT 1`,
      [parentSessionId],
    );
    expect(after.rows.length).toBeGreaterThan(0);
    expect(after.rows[0].case_id).toBeNull();
    expect(after.rows[0].details.error_id).toBe("E-004");
    expect(after.rows[0].details.api).toBe("API-004");
    // No child payload, no free text — strict allowlist only.
    expect(Object.keys(after.rows[0].details).sort()).toEqual(["api", "error_id"]);
  });

  // TC-052: a real GET for another party's case audits the case's safe FK.
  it("existing-but-other-party case id → access.denied audit row with the real FK", async () => {
    const principal = parentPrincipal({ id: otherParentSessionId, expires_at: "2099-01-01T00:00:00+06:00", revoked_at: null });
    expect(principal).not.toBeNull();
    const res = await getAs(principal!, missingCaseId);
    expect(res.status).toBe(404);
    expect(errorEnvelopeSchema.parse(await res.json()).error.id).toBe("E-004");
    const { rows } = await getPool().query<{ case_id: string; details: { api?: string; error_id?: string } }>(
      `SELECT case_id, details FROM audit_log WHERE action = 'access.denied' AND actor_session_id = $1 ORDER BY id DESC LIMIT 1`,
      [otherParentSessionId],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].case_id).toBe(missingCaseId);
    expect(rows[0].details.api).toBe("API-004");
    expect(rows[0].details.error_id).toBe("E-004");
  });

  // TC-052: actor_for checks (a parent session, no user ID).
  it("actor_for on a parent principal is parent/session, no user ID", () => {
    const session = { id: parentSessionId, expires_at: "2099-01-01T00:00:00+06:00", revoked_at: null };
    const principal = parentPrincipal(session);
    expect(principal).not.toBeNull();
    const actor = actorFor(principal!);
    expect(actor.type).toBe("parent");
    expect(actor.userId).toBeNull();
    expect(actor.sessionId).toBe(parentSessionId);
  });
});
