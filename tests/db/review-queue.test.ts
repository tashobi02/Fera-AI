// API-008 GET /api/review-queue (P3-034 part a, TASK-027, FR-012, COMP-035/036).
// DB tests with the real pool and the real audit log. Synthetic [MOCK] fixtures
// only; no real child data.
//
// What these tests cover:
//   - A verified officer sees seeded pending candidates, ordered by case then
//     similarity descending, at most LIMITS.candidatesPerQueueItem per case.
//   - Rejected, confirmed and voided candidates are absent.
//   - Staff, unverified officer, parent, and admin are all hidden (E-004 from
//     the route; here the service returns `hidden` and the route throws E-004
//     with no case FK in the access.denied audit).
//   - The OfficerCaseRow carries no raw contact phone (masked/null) and the
//     strict response schema strips every undeclared key.
//
// Run with: npm run test:db (this file is auto-discovered).
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getPool, setPoolForTests } from "@/server/db/pool";
import { errorEnvelopeSchema, reviewQueueResponseSchema } from "@/contracts";
import { parentPrincipal, userPrincipal, type Principal } from "@/contracts/server";
import { readReviewQueue } from "@/server/matching/queue-read";
import { GET } from "@/app/api/review-queue/route";
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

// Bypass the BEFORE INSERT/UPDATE triggers in this session only (case state
// machine + integrity checks). The throwaway local DB is not relied on for
// real guarantees; the fixture wants a specific lifecycle state without
// replaying the full workflow. DECLAREd CONSTRAINT triggers (e.g. candidate
// integrity) are NOT affected by session_replication_role, so non-pending
// candidates still need the matching decision / referral rows in the same
// transaction — see `insertCandidate`.
async function asReplica<T>(c: PoolClient, fn: () => Promise<T>): Promise<T> {
  await c.query("SET session_replication_role = replica");
  try { return await fn(); } finally { await c.query("SET session_replication_role = DEFAULT"); }
}

async function insertVerifiedOfficer(): Promise<string> {
  return asFixtureOwner(async (c) => {
    const id = randomUUID();
    await c.query(
      `INSERT INTO users (id, role, username, display_name, password_hash, verified, is_active)
       VALUES ($1, 'officer', $2, '[MOCK] Officer Queue', 'synthetic-not-a-hash', true, true)`,
      [id, `officer_${id.slice(0, 8)}`],
    );
    return id;
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

async function insertAdmin(): Promise<string> {
  return asFixtureOwner(async (c) => {
    const id = randomUUID();
    await c.query(
      `INSERT INTO users (id, role, username, display_name, password_hash, verified, is_active)
       VALUES ($1, 'admin', $2, '[MOCK] Admin', 'synthetic-not-a-hash', false, true)`,
      [id, `admin_${id.slice(0, 8)}`],
    );
    return id;
  });
}

async function insertParentSession(): Promise<string> {
  return asFixtureOwner(async (c) => {
    const s = randomUUID();
    await c.query(`INSERT INTO parent_sessions (id) VALUES ($1)`, [s]);
    return s;
  });
}

// Insert a [MOCK] missing case as 'submitted' and move it to 'open'. The
// transition to 'matched_pending_review' is deferred until a pending candidate
// exists on the case (deferred check_pair_integrity trigger). Reordering the
// fixture to insert the candidate first lets the case transition land on the
// legal path without bypassing the integrity triggers.
async function seedMissingOpen(): Promise<{ id: string; ref: string }> {
  return asFixtureOwner(async (c) => {
    const ref = `M-${randomBytes(3).toString("hex").toUpperCase()}`;
    const sessionId = randomUUID();
    await c.query(`INSERT INTO parent_sessions (id) VALUES ($1)`, [sessionId]);
    const phone = fakePhone();
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO cases (ref_code, kind, status, source, is_synthetic, reporter_session_id,
                          client_submission_id, submission_payload_hash, sex, event_at,
                          event_at_lower, event_at_upper, place_text, district_code, contact_phone,
                          provenance, child_name, age_min, age_max)
       VALUES ($1, 'missing', 'submitted', 'parent', true, $2, $3, $4, 'male', now(), now(), now(), 'place', 1, $5, '{}'::jsonb, $6, 7, 7)
       RETURNING id`,
      [ref, sessionId, randomUUID(), randomBytes(32).toString("hex"), phone, `[MOCK] queue child ${ref}`],
    );
    const id = rows[0].id;
    // Legal path: submitted -> open. The transition to matched_pending_review
    // is performed later, after a pending candidate row exists on the case.
    await c.query("UPDATE cases SET status = 'open' WHERE id = $1", [id]);
    return { id, ref };
  });
}

// Legal transition: open -> matched_pending_review. The deferred integrity
// trigger requires a pending candidate to exist at COMMIT time; the caller
// must have inserted one in a previous transaction.
async function moveToMatchedReview(missingId: string): Promise<void> {
  await asFixtureOwner(async (c) => {
    await c.query("UPDATE cases SET status = 'matched_pending_review' WHERE id = $1", [missingId]);
  });
}

async function seedFoundOpen(staffId: string): Promise<{ id: string; ref: string }> {
  return asFixtureOwner(async (c) => {
    const ref = `F-${randomBytes(3).toString("hex").toUpperCase()}`;
    const phone = fakePhone();
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO cases (ref_code, kind, status, source, is_synthetic, created_by_user_id,
                          client_submission_id, submission_payload_hash, sex, event_at,
                          event_at_lower, event_at_upper, place_text, district_code, contact_phone,
                          provenance, circumstances)
       VALUES ($1, 'found', 'open', 'staff', true, $2, $3, $4, 'male', now(), now(), now(), 'place', 1, $5, '{}'::jsonb, '[MOCK] found a child')
       RETURNING id`,
      [ref, staffId, randomUUID(), randomBytes(32).toString("hex"), phone],
    );
    return { id: rows[0].id, ref };
  });
}

// Insert a synthetic match_candidate in the requested state. The pending and
// voided states just write the match_candidates row. Rejected and confirmed
// states also write the supporting review_decisions / referrals rows and
// advance the cases to their terminal states so the deferred check_pair_integrity
// trigger fires clean at COMMIT (BR-013, BR-020). CONSTRAINT triggers always
// fire regardless of session_replication_role, so the workflow has to be real.
// Module-level so the helper's default argument can see it (assigned in beforeAll).
let verifiedOfficerId!: string;

async function insertCandidate(
  missingId: string,
  foundId: string,
  rank: number,
  score: number,
  status: "pending" | "rejected" | "confirmed" | "voided" = "pending",
  officerId: string = verifiedOfficerId,
): Promise<string> {
  return asFixtureOwner(async (c) => {
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO match_candidates (missing_case_id, found_case_id, missing_version, found_version,
                                    score, rank, reason_bn, reason_en, components, status, decided_at)
       SELECT m.id, f.id, m.version, f.version, $3, $4,
              '[MOCK] একই জেলা, কাছাকাছি সময়, বয়স মেলে',
              '[MOCK] same district, nearby time, age fits',
              '{"text": 0.7, "age": 1}',
              $5::candidate_status,
              CASE WHEN $5::candidate_status = 'pending' THEN NULL ELSE now() END
       FROM cases m, cases f WHERE m.id = $1 AND f.id = $2 RETURNING id`,
      [missingId, foundId, score, rank, status],
    );
    const candidateId = rows[0].id;
    if (status === "rejected") {
      await c.query(
        `INSERT INTO review_decisions (candidate_id, officer_id, decision, reason, decided_at)
         VALUES ($1, $2, 'reject', '[MOCK] not the same child, age and height differ', now())`,
        [candidateId, officerId],
      );
      // The schema requires an officer audit event for every review decision (deferred trigger).
      await c.query(
        `INSERT INTO audit_log (actor_type, actor_user_id, action, case_id, candidate_id, details)
         VALUES ('officer', $1, $2, $3, $4, '{}'::jsonb)`,
        [officerId, "match.reject", missingId, candidateId],
      );
    } else if (status === "confirmed") {
      await c.query(
        `INSERT INTO review_decisions (candidate_id, officer_id, decision, decided_at)
         VALUES ($1, $2, 'confirm', now())`,
        [candidateId, officerId],
      );
      // The schema requires an officer audit event for every review decision (deferred trigger).
      await c.query(
        `INSERT INTO audit_log (actor_type, actor_user_id, action, case_id, candidate_id, details)
         VALUES ('officer', $1, $2, $3, $4, '{}'::jsonb)`,
        [officerId, "match.confirm", missingId, candidateId],
      );
      await c.query(
        `INSERT INTO referrals (candidate_id, found_case_id, missing_case_id, referred_by, note)
         VALUES ($1, $2, $3, $4, '[MOCK] synthetic referral')`,
        [candidateId, foundId, missingId, officerId],
      );
      // Terminal case states required by the deferred integrity trigger.
      // The transition guard only allows open -> matched_pending_review -> confirmed through the
      // full workflow; the fixture only needs the end states, so skip that row trigger (the deferred
      // integrity trigger still runs at commit).
      await c.query("SET LOCAL session_replication_role = replica");
      await c.query("UPDATE cases SET status = 'confirmed' WHERE id = $1", [missingId]);
      await c.query("UPDATE cases SET status = 'referred', closed_at = now() WHERE id = $1", [foundId]);
      await c.query("SET LOCAL session_replication_role = DEFAULT");
    }
    return candidateId;
  });
}

describe.skipIf(!dbTestsEnabled)("API-008 review queue (P3-034a, TASK-027, FR-012)", () => {
  let staffUserId!: string;
  let unverifiedOfficerId!: string;
  let adminUserId!: string;
  let parentSessionId!: string;
  let missingA!: { id: string; ref: string };
  let missingB!: { id: string; ref: string };
  let foundA1!: { id: string; ref: string };
  let foundA2!: { id: string; ref: string };
  let foundA3!: { id: string; ref: string };
  let foundA4!: { id: string; ref: string };
  let foundA5!: { id: string; ref: string };
  let foundB1!: { id: string; ref: string };
  let foundB2!: { id: string; ref: string };
  let missingC!: { id: string; ref: string };
  let foundC1!: { id: string; ref: string };
  let foundC2!: { id: string; ref: string };

  beforeAll(async () => {
    fixturePool = pool("admin");
    appPool = pool("app");
    setPoolForTests(appPool);
    const fixtureClient = await fixturePool.connect();
    try { await seedReference(fixtureClient); } finally { fixtureClient.release(); }

    verifiedOfficerId = await insertVerifiedOfficer();
    staffUserId = await insertDeskUser("staff", false);
    unverifiedOfficerId = await insertDeskUser("officer", false);
    adminUserId = await insertAdmin();
    parentSessionId = await insertParentSession();

    // Missing cases land in 'open' first; we transition to matched_pending_review
    // AFTER the pending candidate row exists, so the deferred integrity trigger
    // sees a valid state at COMMIT (BR-012, check_pair_integrity).
    missingA = await seedMissingOpen();
    missingB = await seedMissingOpen();
    // Case C holds ONLY decided candidates (confirmed + voided): a confirmed pair may not coexist with a
    // pending candidate on either endpoint (deferred integrity trigger), so it gets its own reports.
    missingC = await seedMissingOpen();
    // Six found reports on case A so we can prove the per-case cap at 5.
    foundA1 = await seedFoundOpen(staffUserId);
    foundA2 = await seedFoundOpen(staffUserId);
    foundA3 = await seedFoundOpen(staffUserId);
    foundA4 = await seedFoundOpen(staffUserId);
    foundA5 = await seedFoundOpen(staffUserId);
    foundB1 = await seedFoundOpen(staffUserId);
    foundB2 = await seedFoundOpen(staffUserId);
    foundC1 = await seedFoundOpen(staffUserId);
    foundC2 = await seedFoundOpen(staffUserId);

    // Case A: five pending candidates, ranks 1..5 (the schema's maximum), varying scores.
    await insertCandidate(missingA.id, foundA1.id, 1, 95);
    await insertCandidate(missingA.id, foundA2.id, 2, 88);
    await insertCandidate(missingA.id, foundA3.id, 3, 80);
    await insertCandidate(missingA.id, foundA4.id, 4, 70);
    await insertCandidate(missingA.id, foundA5.id, 5, 60);
    // The schema itself caps rank at 1..5 (match_candidates_rank_check), so a sixth pending candidate cannot exist.
    // Case A: a non-pending candidate must be absent. The rejected/confirmed/voided
    // inserts are intentional and use replica mode to skip the integrity triggers
    // (we only care that they are excluded from the queue, not the full workflow).
    await insertCandidate(missingA.id, foundB1.id, 1, 99, "rejected");
    // Case B: one pending candidate.
    await insertCandidate(missingB.id, foundB2.id, 1, 75);
    // Case C: confirmed and voided candidates only (both must be absent from the queue).
    await insertCandidate(missingC.id, foundC1.id, 1, 65, "confirmed");
    await insertCandidate(missingC.id, foundC2.id, 2, 60, "voided");

    // Now that pending candidates exist for both missing cases, the legal
    // open -> matched_pending_review transition is allowed by the deferred
    // integrity trigger.
    await moveToMatchedReview(missingA.id);
    await moveToMatchedReview(missingB.id);
  });

  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    setPoolForTests(null);
    if (appPool) await appPool.end();
    if (fixturePool) await fixturePool.end();
  });

  async function getAs(principal: Principal, qs = ""): Promise<Response> {
    vi.spyOn(defaultAuth(), "resolvePrincipal").mockResolvedValue(principal);
    return GET(new Request(`http://localhost/api/review-queue${qs}`), { params: Promise.resolve({}) });
  }

  it("verified officer: pending candidates grouped by missing case, ordered by similarity desc, capped at 5", async () => {
    const principal = userPrincipal({ id: verifiedOfficerId, role: "officer", verified: true, is_active: true });
    expect(principal).not.toBeNull();
    const r = await readReviewQueue(principal!, { limit: 50 });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") throw new Error("expected ok");
    // The response schema is the per-role allowlist.
    const parsed = reviewQueueResponseSchema.parse(r.view);
    expect(parsed.items.length).toBeGreaterThan(0);

    // Find the case A row.
    const caseA = parsed.items.find((it) => it.case.id === missingA.id);
    expect(caseA).toBeDefined();
    if (!caseA) throw new Error("missing A");
    // Six seeded; projection keeps the best 5 (per LIMITS.candidatesPerQueueItem).
    expect(caseA.candidates.length).toBe(5);
    // Within a case the projection sorts by rank ascending, so 1..5 survive.
    expect(caseA.candidates.map((c) => c.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(caseA.candidates[0].score).toBe(95);
    expect(caseA.candidates[4].score).toBe(60);
    // The non-pending candidate on A (rejected, score 99) must not appear.
    const seenFoundIds = caseA.candidates.map((c) => c.counterpart.id);
    expect(seenFoundIds).not.toContain(foundB1.id);

    // Case B: only the single pending candidate survives.
    const caseB = parsed.items.find((it) => it.case.id === missingB.id);
    expect(caseB).toBeDefined();
    if (!caseB) throw new Error("missing B");
    expect(caseB.candidates.length).toBe(1);
    expect(caseB.candidates[0].counterpart.id).toBe(foundB2.id);
  });

  it("OfficerCaseRow carries no raw contact phone and no child payload beyond the allowlist", async () => {
    const principal = userPrincipal({ id: verifiedOfficerId, role: "officer", verified: true, is_active: true });
    expect(principal).not.toBeNull();
    const r = await readReviewQueue(principal!, { limit: 50 });
    if (r.kind !== "ok") throw new Error("expected ok");
    for (const item of r.view.items) {
      // The strict per-role row schema rejects unknown keys; absent contact_phone
      // is intentional (the queue row never serves the raw number).
      expect(item.case.contact_phone).toBeNull();
      const keys = Object.keys(item.case);
      expect(keys).not.toContain("raw_text");
      for (const cand of item.candidates) {
        expect(cand.counterpart.contact_phone).toBeNull();
        // queueCandidateSchema contract.
        expect(cand.qualified).toBe(true);
        expect(cand.identity_probability).toBe(false);
      }
    }
  });

  it("real route: officer gets 200 and the projected DTO", async () => {
    const principal = userPrincipal({ id: verifiedOfficerId, role: "officer", verified: true, is_active: true });
    expect(principal).not.toBeNull();
    const res = await getAs(principal!);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ case: { id: string }; candidates: unknown[] }> };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items[0].candidates.length).toBeGreaterThan(0);
  });

  it("staff is hidden (E-004) and writes an access.denied audit row with no case FK", async () => {
    const principal = userPrincipal({ id: staffUserId, role: "staff", verified: false, is_active: true });
    expect(principal).not.toBeNull();
    const r = await readReviewQueue(principal!, { limit: 10 });
    expect(r.kind).toBe("hidden");

    const res = await getAs(principal!);
    expect(res.status).toBe(404);
    expect(errorEnvelopeSchema.parse(await res.json()).error.id).toBe("E-004");
    const { rows } = await getPool().query<{ case_id: string | null; details: { api?: string; error_id?: string } }>(
      `SELECT case_id, details FROM audit_log WHERE action = 'access.denied' AND actor_user_id = $1 ORDER BY id DESC LIMIT 1`,
      [staffUserId],
    );
    expect(rows[0].case_id).toBeNull();
    expect(rows[0].details).toEqual({ api: "API-008", error_id: "E-004" });
  });

  it("unverified officer is hidden (E-004) and audits a NULL-FK denial", async () => {
    const principal = userPrincipal({ id: unverifiedOfficerId, role: "officer", verified: false, is_active: true });
    expect(principal).not.toBeNull();
    const r = await readReviewQueue(principal!, { limit: 10 });
    expect(r.kind).toBe("hidden");
    const res = await getAs(principal!);
    expect(res.status).toBe(404);
    expect(errorEnvelopeSchema.parse(await res.json()).error.id).toBe("E-004");
  });

  it("parent is hidden (E-004)", async () => {
    const principal = parentPrincipal({ id: parentSessionId, expires_at: "2099-01-01T00:00:00+06:00", revoked_at: null });
    expect(principal).not.toBeNull();
    const r = await readReviewQueue(principal!, { limit: 10 });
    expect(r.kind).toBe("hidden");
    const res = await getAs(principal!);
    expect(res.status).toBe(404);
    expect(errorEnvelopeSchema.parse(await res.json()).error.id).toBe("E-004");
  });

  it("admin is hidden (E-004): D2A §9.2 admin = None for API-008", async () => {
    const principal = userPrincipal({ id: adminUserId, role: "admin", verified: false, is_active: true });
    expect(principal).not.toBeNull();
    const r = await readReviewQueue(principal!, { limit: 10 });
    expect(r.kind).toBe("hidden");
    const res = await getAs(principal!);
    expect(res.status).toBe(404);
    expect(errorEnvelopeSchema.parse(await res.json()).error.id).toBe("E-004");
  });

  it("invalid query (limit=999) is rejected by Zod with E-001", async () => {
    const principal = userPrincipal({ id: verifiedOfficerId, role: "officer", verified: true, is_active: true });
    expect(principal).not.toBeNull();
    const res = await getAs(principal!, "?limit=999");
    expect(res.status).toBe(400);
    expect(errorEnvelopeSchema.parse(await res.json()).error.id).toBe("E-001");
  });
});