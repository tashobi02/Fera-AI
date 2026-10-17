// API-005 PATCH /api/cases/:id (TASK-049, P3-102; FR-029, BR-025; TC-018). DB tests
// with the real pool (fera_test_<pid>_<n>, see scripts/db/test-db.mjs) and the real
// audit log. Modelled on tests/db/case-close-route.test.ts (P3-018).
//
// What these tests cover:
//   (a) a parent's reviewed draft with confirmed=true and the correct
//       expected_version → 200 with the new OwnerCaseView (version+1), and the
//       case is updated: status unchanged, a case.edited audit row was written;
//   (b) a parent session for another case → E-004 envelope and one
//       `access.denied` audit row with the real case FK (BR-010, TC-052);
//   (c) stale expected_version → E-005 envelope and no case.edited row;
//   (d) terminal status (closed) → E-018 envelope and no case.edited row;
//   (e) malformed id in the path → E-004 and the access.denied audit has a
//       null case FK.
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setPoolForTests, getPool } from "@/server/db/pool";
import { errorEnvelopeSchema, type MissingSubmissionDraft, type UpdateCaseRequest } from "@/contracts";
import { parentPrincipal, type Principal } from "@/contracts/server";
import { PATCH } from "@/app/api/cases/[id]/route";
import { defaultAuth } from "@/server/auth/default";
import type { Pool, PoolClient } from "pg";
import { dbTestsEnabled, fakePhone, pool, seedReference } from "./support/db";

let fixturePool: Pool;
let appPool: Pool;

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

// Insert a minimal synthetic missing case in `submitted` status, the only state
// where INSERT is accepted; tests transition to `open` if needed.
async function insertSubmittedMissingCase(sessionId: string): Promise<{ id: string; version: number }> {
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
    return rows[0]!;
  });
}

async function insertParentSession(): Promise<string> {
  return asFixtureOwner(async (c) => {
    const s = randomUUID();
    await c.query(`INSERT INTO parent_sessions (id) VALUES ($1)`, [s]);
    return s;
  });
}

// Transition a case to a specific status under the app pool (the case service
// is what owns the state machine; we use a single direct UPDATE for fixtures).
async function forceStatus(caseId: string, status: "open" | "matched_pending_review" | "confirmed" | "closed"): Promise<void> {
  const c = await appPool.connect();
  try { await c.query("UPDATE cases SET status = $1 WHERE id = $2", [status, caseId]); }
  finally { c.release(); }
}

const DRAFT: MissingSubmissionDraft = {
  kind: "missing",
  source_text: "[MOCK] update",
  child: {
    name: "[MOCK] Updated",
    name_latin: null,
    age_years: 8,
    age_min: 8,
    age_max: 8,
    sex: "male",
    height_cm: 120,
    clothing: "green shirt",
    marks: null,
  },
  event: {
    at: "2026-10-15T08:00:00+06:00",
    at_approx: false,
    at_lower: "2026-10-15T08:00:00+06:00",
    at_upper: "2026-10-15T08:00:00+06:00",
    place_text: "school gate",
    district_text: null,
    district_code: 1,
    thana: null,
    circumstances: "[MOCK] on the way to school",
  },
  reporter: { relation: "father", phone: "01700000001" },
  evidence: {},
};

const REQUEST = (expected_version: number): UpdateCaseRequest => ({
  draft: DRAFT,
  confirmed: true,
  expected_version,
});

describe.skipIf(!dbTestsEnabled)("API-005 cases edit (P3-102, TC-018)", () => {
  let parentSessionId!: string;
  let otherSessionId!: string;
  let editableCaseId!: string;
  let editableVersion!: number;
  let closedCaseId!: string;
  let closedVersion!: number;

  beforeAll(async () => {
    fixturePool = pool("admin");
    appPool = pool("app");
    setPoolForTests(appPool);
    const fixtureClient = await fixturePool.connect();
    try { await seedReference(fixtureClient); } finally { fixtureClient.release(); }
    parentSessionId = await insertParentSession();
    otherSessionId = await insertParentSession();
    const editable = await insertSubmittedMissingCase(parentSessionId);
    editableCaseId = editable.id;
    editableVersion = editable.version;
    await forceStatus(editableCaseId, "open");
    const closed = await insertSubmittedMissingCase(parentSessionId);
    closedCaseId = closed.id;
    closedVersion = closed.version;
    await forceStatus(closedCaseId, "closed");
  });

  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    setPoolForTests(null);
    if (appPool) await appPool.end();
    if (fixturePool) await fixturePool.end();
  });

  async function patchAs(principal: Principal | null, id: string, body: UpdateCaseRequest): Promise<Response> {
    vi.spyOn(defaultAuth(), "resolvePrincipal").mockResolvedValue(principal);
    const req = new Request(`http://localhost/api/cases/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: JSON.stringify(body),
    });
    return PATCH(req, { params: Promise.resolve({ id }) });
  }

  it("happy path: parent edits own missing report → 200, version+1, case.edited audit row", async () => {
    const principal = parentPrincipal({ id: parentSessionId, expires_at: "2099-01-01T00:00:00+06:00", revoked_at: null });
    expect(principal).not.toBeNull();
    const res = await patchAs(principal, editableCaseId, REQUEST(editableVersion));
    expect(res.status).toBe(200);
    const view = (await res.json()) as Record<string, unknown>;
    expect(view.version).toBe(editableVersion + 1);
    expect(view.status).toBe("open");

    const after = await getPool().query<{ version: number; child_name: string; status: string }>(
      `SELECT version, child_name, status FROM cases WHERE id = $1`,
      [editableCaseId],
    );
    expect(after.rows[0]?.version).toBe(editableVersion + 1);
    expect(after.rows[0]?.child_name).toBe("[MOCK] Updated");
    expect(after.rows[0]?.status).toBe("open");

    const audits = await getPool().query<{ actor_session_id: string | null }>(
      `SELECT actor_session_id FROM audit_log WHERE case_id = $1 AND action = 'case.edited'`,
      [editableCaseId],
    );
    expect(audits.rows.length).toBe(1);
    expect(audits.rows[0]?.actor_session_id).toBe(parentSessionId);
  });

  it("other-party parent → E-004 envelope and access.denied with the real case FK", async () => {
    const principal = parentPrincipal({ id: parentSessionId, expires_at: "2099-01-01T00:00:00+06:00", revoked_at: null });
    expect(principal).not.toBeNull();
    const other = await insertSubmittedMissingCase(otherSessionId);
    await forceStatus(other.id, "open");
    const res = await patchAs(principal, other.id, REQUEST(other.version));
    expect(res.status).toBe(404);
    const envelope = errorEnvelopeSchema.parse(await res.json());
    expect(envelope.error.id).toBe("E-004");
    const denial = await getPool().query<{ case_id: string | null; details: { api?: string; error_id?: string } }>(
      `SELECT case_id, details FROM audit_log WHERE action = 'access.denied' AND actor_session_id = $1 ORDER BY id DESC LIMIT 1`,
      [parentSessionId],
    );
    expect(denial.rows.length).toBe(1);
    expect(denial.rows[0]?.case_id).toBe(other.id);
    expect(denial.rows[0]?.details.api).toBe("API-005");
  });

  it("stale expected_version → E-005 envelope and no case.edited row", async () => {
    const principal = parentPrincipal({ id: parentSessionId, expires_at: "2099-01-01T00:00:00+06:00", revoked_at: null });
    expect(principal).not.toBeNull();
    const res = await patchAs(principal, editableCaseId, REQUEST(99));
    expect(res.status).toBe(409);
    const envelope = errorEnvelopeSchema.parse(await res.json());
    expect(envelope.error.id).toBe("E-005");
    const audits = await getPool().query<{ id: number }>(
      `SELECT id FROM audit_log WHERE case_id = $1 AND action = 'case.edited'`,
      [editableCaseId],
    );
    // Only the happy-path row remains.
    expect(audits.rows.length).toBe(1);
  });

  it("terminal status (closed) → E-018 envelope and no case.edited row", async () => {
    const principal = parentPrincipal({ id: parentSessionId, expires_at: "2099-01-01T00:00:00+06:00", revoked_at: null });
    expect(principal).not.toBeNull();
    const res = await patchAs(principal, closedCaseId, REQUEST(closedVersion));
    expect(res.status).toBe(409);
    const envelope = errorEnvelopeSchema.parse(await res.json());
    expect(envelope.error.id).toBe("E-018");
    const audits = await getPool().query<{ id: number }>(
      `SELECT id FROM audit_log WHERE case_id = $1 AND action = 'case.edited'`,
      [closedCaseId],
    );
    expect(audits.rows.length).toBe(0);
  });

  it("malformed id → E-004 envelope and the access.denied audit has a null case FK", async () => {
    const principal = parentPrincipal({ id: parentSessionId, expires_at: "2099-01-01T00:00:00+06:00", revoked_at: null });
    expect(principal).not.toBeNull();
    const res = await patchAs(principal, "not-a-uuid", REQUEST(1));
    expect(res.status).toBe(404);
    const envelope = errorEnvelopeSchema.parse(await res.json());
    expect(envelope.error.id).toBe("E-004");
    const denial = await getPool().query<{ case_id: string | null; details: { api?: string; error_id?: string } }>(
      `SELECT case_id, details FROM audit_log WHERE action = 'access.denied' AND actor_session_id = $1 ORDER BY id DESC LIMIT 1`,
      [parentSessionId],
    );
    expect(denial.rows.length).toBe(1);
    expect(denial.rows[0]?.case_id).toBeNull();
    expect(denial.rows[0]?.details.api).toBe("API-005");
  });
});
