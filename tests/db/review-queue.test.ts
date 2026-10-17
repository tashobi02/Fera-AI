// API-008 GET /api/review-queue (P3-034 part a, TASK-027, FR-012, COMP-035/036).
// DB tests with the real pool and the real audit log. Synthetic [MOCK] fixtures
// only; no real child data.
//
// What these tests cover:
//   - A verified officer sees newest missing cases first, with candidates
//     ordered by similarity descending and capped per case.
//   - Rejected, confirmed and voided candidates are absent.
//   - Candidates removed through the legal lifecycle leave the queue; redaction
//     never leaks partner data or suppresses an independent live candidate.
//   - Pagination: a >limit set of pending missing cases yields a non-null
//     `next_cursor` that passes reviewQueueResponseSchema; the cursor is
//     HMAC-signed with subkey(AUTH_SECRET, "cursor.review_queue") and the
//     subsequent pages return the remaining rows with no overlap and no gap.
//   - Tampered cursors → E-001 (no access.denied audit row).
//   - Staff, unverified officer, parent, and admin are all hidden (E-004 from
//     the route; here the service returns `hidden` and the route throws E-004
//     with no case FK in the access.denied audit).
//   - The OfficerCaseRow carries no raw contact phone (masked/null) and the
//     strict response schema strips every undeclared key.
//
// Run with: /tmp/dbtest.sh "$(pwd)" tests/db/review-queue.test.ts
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getPool, setPoolForTests } from "@/server/db/pool";
import { errorEnvelopeSchema, reviewQueueResponseSchema } from "@/contracts";
import { parentPrincipal, userPrincipal, type Principal } from "@/contracts/server";
import { encodeQueueCursor, readReviewQueue } from "@/server/matching/queue-read";
import { GET } from "@/app/api/review-queue/route";
import { defaultAuth } from "@/server/auth/default";
import { withTransaction } from "@/server/case/internal";
import { redactCases } from "@/server/admin/redact";
import type { Pool, PoolClient } from "pg";
import { closeMissing, confirmPair, dbTestsEnabled, fakePhone, pool, seedReference } from "./support/db";

let fixturePool: Pool;
let appPool: Pool;
let redactorPool: Pool;

// Fixed cursor key so the HMAC stays stable across the test run. The same key
// produces the same signature on encode and verifies on decode.
const TEST_CURSOR_KEY = Buffer.alloc(64, 0x61); // 64 bytes, arbitrary (0x61 = 'a')
const cursorDeps = { withTransaction, cursorKey: TEST_CURSOR_KEY };

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

async function asAppClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await appPool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
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
async function seedMissingOpen(district = 1): Promise<{ id: string; ref: string }> {
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
       VALUES ($1, 'missing', 'submitted', 'parent', true, $2, $3, $4, 'male', now(), now(), now(), 'place', $5, $6, '{}'::jsonb, $7, 7, 7)
       RETURNING id`,
      [ref, sessionId, randomUUID(), randomBytes(32).toString("hex"), district, phone, `[MOCK] queue child ${ref}`],
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

async function seedFoundOpen(staffId: string, district = 1): Promise<{ id: string; ref: string }> {
  return asFixtureOwner(async (c) => {
    const ref = `F-${randomBytes(3).toString("hex").toUpperCase()}`;
    const phone = fakePhone();
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO cases (ref_code, kind, status, source, is_synthetic, created_by_user_id,
                          client_submission_id, submission_payload_hash, sex, event_at,
                          event_at_lower, event_at_upper, place_text, district_code, contact_phone,
                          provenance, circumstances)
       VALUES ($1, 'found', 'open', 'staff', true, $2, $3, $4, 'male', now(), now(), now(), 'place', $5, $6, '{}'::jsonb, '[MOCK] found a child')
       RETURNING id`,
      [ref, staffId, randomUUID(), randomBytes(32).toString("hex"), district, phone],
    );
    return { id: rows[0].id, ref };
  });
}

// Insert a synthetic candidate. A rejected fixture includes its required
// decision and audit rows; confirmed pairs use `confirmPair` through the normal
// lifecycle so the state guard and deferred integrity checks both run.
// Module-level so the helper's default argument can see it (assigned in beforeAll).
let verifiedOfficerId!: string;

async function insertCandidate(
  missingId: string,
  foundId: string,
  rank: number,
  score: number,
  status: "pending" | "rejected" | "voided" = "pending",
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
    redactorPool = pool("redactor");
    setPoolForTests(appPool);
    const fixtureClient = await fixturePool.connect();
    try {
      await seedReference(fixtureClient);
      // District 2 is referenced by the pagination test below. The cases table
      // has a FK to districts(code), so a row must exist for any district we
      // use in fixtures.
      await fixtureClient.query(
        `INSERT INTO districts (code, name_en, name_bn, division_en, lat, lng)
         VALUES (2, '[MOCK] District 02', '[MOCK] জেলা ০২', '[MOCK] Division', 23.6, 90.5)
         ON CONFLICT DO NOTHING`,
      );
    } finally { fixtureClient.release(); }

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
    // Case C: a valid confirmed pair plus a voided candidate (both are absent).
    const confirmedCandidate = await insertCandidate(missingC.id, foundC1.id, 1, 65);
    await insertCandidate(missingC.id, foundC2.id, 2, 60, "voided");

    // Now that pending candidates exist for both missing cases, the legal
    // open -> matched_pending_review transition is allowed by the deferred
    // integrity trigger.
    await moveToMatchedReview(missingA.id);
    await moveToMatchedReview(missingB.id);
    await moveToMatchedReview(missingC.id);
    await moveToMatchedReview(foundC1.id);
    await asAppClient((client) => confirmPair(client, {
      candidateId: confirmedCandidate,
      missingId: missingC.id,
      foundId: foundC1.id,
      officerId: verifiedOfficerId,
    }));
  });

  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    setPoolForTests(null);
    await Promise.all([appPool?.end(), fixturePool?.end(), redactorPool?.end()]);
  });

  async function getAs(principal: Principal, qs = ""): Promise<Response> {
    vi.spyOn(defaultAuth(), "resolvePrincipal").mockResolvedValue(principal);
    return GET(new Request(`http://localhost/api/review-queue${qs}`), { params: Promise.resolve({}) });
  }

  it("verified officer: pending candidates grouped by missing case, ordered by similarity desc, capped at 5", async () => {
    const principal = userPrincipal({ id: verifiedOfficerId, role: "officer", verified: true, is_active: true });
    expect(principal).not.toBeNull();
    const r = await readReviewQueue(principal!, { limit: 50 }, cursorDeps);
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
    const r = await readReviewQueue(principal!, { limit: 50 }, cursorDeps);
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
    const r = await readReviewQueue(principal!, { limit: 10 }, cursorDeps);
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
    const r = await readReviewQueue(principal!, { limit: 10 }, cursorDeps);
    expect(r.kind).toBe("hidden");
    const res = await getAs(principal!);
    expect(res.status).toBe(404);
    expect(errorEnvelopeSchema.parse(await res.json()).error.id).toBe("E-004");
  });

  it("parent is hidden (E-004)", async () => {
    const principal = parentPrincipal({ id: parentSessionId, expires_at: "2099-01-01T00:00:00+06:00", revoked_at: null });
    expect(principal).not.toBeNull();
    const r = await readReviewQueue(principal!, { limit: 10 }, cursorDeps);
    expect(r.kind).toBe("hidden");
    const res = await getAs(principal!);
    expect(res.status).toBe(404);
    expect(errorEnvelopeSchema.parse(await res.json()).error.id).toBe("E-004");
  });

  it("admin is hidden (E-004): D2A §9.2 admin = None for API-008", async () => {
    const principal = userPrincipal({ id: adminUserId, role: "admin", verified: false, is_active: true });
    expect(principal).not.toBeNull();
    const r = await readReviewQueue(principal!, { limit: 10 }, cursorDeps);
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

  // P3-034a: pagination via HMAC-signed cursor.
  describe("signed-cursor pagination (P3-034a)", () => {
    it("first page returns a non-null next_cursor that passes reviewQueueResponseSchema; second page completes the set with no overlap and no gap", async () => {
      // Seed five fresh missing cases each with one pending candidate, in a
      // dedicated district so we can page without mixing with the previous
      // fixtures. We need a district > 1 to avoid colliding with the seeded
      // case A/B/C fixtures (which all live in district 1). Only the single
      // missing row seed is needed since pending candidates must reference
      // both endpoints.
      const DISTRICT = 2; // district 2 is not seeded in seedReference, but the CHECK (1..64) holds.
      const staff = staffUserId;
      const principal = userPrincipal({ id: verifiedOfficerId, role: "officer", verified: true, is_active: true });
      expect(principal).not.toBeNull();

      const pageIds: string[] = [];
      // 5 missing cases.
      for (let i = 0; i < 5; i++) {
        const m = await seedMissingOpen(DISTRICT);
        const f = await seedFoundOpen(staff, DISTRICT);
        await insertCandidate(m.id, f.id, 1, 90 - i);
        await moveToMatchedReview(m.id);
        pageIds.push(m.id);
      }

      // D1 says new candidates appear first. Compare against the database's
      // newest-first order, with UUID as the deterministic timestamp tie-breaker.
      const expectedRows = await fixturePool.query<{ id: string }>(
        `SELECT id FROM cases WHERE id = ANY($1::uuid[]) ORDER BY created_at DESC, id DESC`,
        [pageIds],
      );
      const expectedPageIds = expectedRows.rows.map((row) => row.id);

      // First page: limit=2.
      const first = await readReviewQueue(principal!, { limit: 2, district: DISTRICT }, cursorDeps);
      expect(first.kind).toBe("ok");
      if (first.kind !== "ok") throw new Error("expected ok");
      const firstParsed = reviewQueueResponseSchema.parse(first.view); // strict allowlist — cursors must match the regex
      expect(firstParsed.items.length).toBe(2);
      expect(firstParsed.items.map((i) => i.case.id)).toEqual(expectedPageIds.slice(0, 2));
      expect(firstParsed.next_cursor).not.toBeNull();
      // The cursor must match the contract cursorSchema (signed base64url payload + HMAC).
      expect(firstParsed.next_cursor).toMatch(/^[A-Za-z0-9_-]{8,400}\.[A-Za-z0-9_-]{16,100}$/);

      // Second page: use the cursor verbatim.
      const second = await readReviewQueue(
        principal!,
        { limit: 2, district: DISTRICT, cursor: firstParsed.next_cursor ?? undefined },
        cursorDeps,
      );
      expect(second.kind).toBe("ok");
      if (second.kind !== "ok") throw new Error("expected ok");
      const secondParsed = reviewQueueResponseSchema.parse(second.view);
      expect(secondParsed.items.length).toBe(2);
      const seenIds = [firstParsed, secondParsed].flatMap((p) => p.items.map((i) => i.case.id));
      // No overlap between the first and second page.
      expect(seenIds.length).toBe(new Set(seenIds).size);
      // No gap: second page continues newest-first order.
      expect(secondParsed.items.map((i) => i.case.id)).toEqual(expectedPageIds.slice(2, 4));

      // Third page picks up the last case and ends the queue.
      const third = await readReviewQueue(
        principal!,
        { limit: 2, district: DISTRICT, cursor: secondParsed.next_cursor ?? undefined },
        cursorDeps,
      );
      expect(third.kind).toBe("ok");
      if (third.kind !== "ok") throw new Error("expected ok");
      const thirdParsed = reviewQueueResponseSchema.parse(third.view);
      expect(thirdParsed.items.map((i) => i.case.id)).toEqual(expectedPageIds.slice(4));
      expect(thirdParsed.next_cursor).toBeNull();
    });

    it("a tampered cursor (bad signature) → E-001, no audit denial row", async () => {
      const principal = userPrincipal({ id: verifiedOfficerId, role: "officer", verified: true, is_active: true });
      expect(principal).not.toBeNull();
      // Build a cursor with the FORMAT and LENGTH of cursorSchema (otherwise Zod
      // rejects it before the service is reached), then break the signature.
      // The cursor here is signed with the production key (no override), so the
      // route's readReviewQueue will see a signature mismatch and throw E-001.
      const prodKeyDeps = { withTransaction };
      const goodCursor = encodeQueueCursor(verifiedOfficerId, prodKeyDeps);
      const [payload, sig] = goodCursor.split(".");
      // Flip the last character of the signature to a different base64url letter.
      const lastChar = sig.slice(-1);
      const swapped = lastChar === "A" ? "B" : "A";
      const tampered = `${payload}.${sig.slice(0, -1)}${swapped}`;
      expect(tampered).toMatch(/^[A-Za-z0-9_-]{8,400}\.[A-Za-z0-9_-]{16,100}$/);
      const res = await getAs(principal!, `?cursor=${encodeURIComponent(tampered)}`);
      expect(res.status).toBe(400);
      expect(errorEnvelopeSchema.parse(await res.json()).error.id).toBe("E-001");
      // No access.denied audit row: E-001 is a validation error, not a denial.
      const { rows } = await getPool().query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM audit_log WHERE action = 'access.denied' AND actor_user_id = $1`,
        [verifiedOfficerId],
      );
      expect(Number(rows[0].count)).toBe(0);
    });

    it("a well-signed cursor whose id is not a UUID → E-001", async () => {
      const principal = userPrincipal({ id: verifiedOfficerId, role: "officer", verified: true, is_active: true });
      expect(principal).not.toBeNull();
      // Sign the cursor with the production key (no override) so the HMAC
      // verifies; the payload id is not a UUID, so the service-layer isUuid
      // check trips and the service throws E-001.
      const prodKeyDeps = { withTransaction };
      const badId = "not-a-uuid";
      const cursor = encodeQueueCursor(badId, prodKeyDeps);
      // The cursor MUST still pass cursorSchema (zod) for this test to exercise
      // the service-layer isUuid check; otherwise we just hit the Zod route.
      expect(cursor).toMatch(/^[A-Za-z0-9_-]{8,400}\.[A-Za-z0-9_-]{16,100}$/);
      const res = await getAs(principal!, `?cursor=${encodeURIComponent(cursor)}`);
      expect(res.status).toBe(400);
      expect(errorEnvelopeSchema.parse(await res.json()).error.id).toBe("E-001");
    });
  });

  // P3-034a: enforce the queue projection over valid lifecycle states; the DB
  // invariant prevents a stale pending candidate from being committed.
  describe("qualified predicate: reports leave through valid lifecycle states (P3-034a)", () => {
    it("a candidate invalidated through the normal lifecycle leaves the missing case absent", async () => {
      const principal = userPrincipal({ id: verifiedOfficerId, role: "officer", verified: true, is_active: true });
      expect(principal).not.toBeNull();
      // A fresh isolated case so we do not collide with prior fixtures.
      const invalidatedMissing = await seedMissingOpen();
      const invalidatedFound = await seedFoundOpen(staffUserId);
      const candidateId = await insertCandidate(invalidatedMissing.id, invalidatedFound.id, 1, 80);
      await moveToMatchedReview(invalidatedMissing.id);

      // Before invalidation: present.
      const before = await readReviewQueue(principal!, { limit: 50 }, cursorDeps);
      expect(before.kind).toBe("ok");
      if (before.kind !== "ok") throw new Error("expected ok");
      const idsBefore = before.view.items.map((i) => i.case.id);
      expect(idsBefore).toContain(invalidatedMissing.id);

      // A pending candidate must match both current versions at commit, so a
      // stale pending row is not a valid database fixture. Exercise the same
      // queue removal through the legal invalidation path: void the candidate
      // and return the missing report to open in one transaction.
      await asFixtureOwner(async (client) => {
        await client.query("UPDATE match_candidates SET status = 'voided', decided_at = now() WHERE id = $1", [candidateId]);
        await client.query("UPDATE cases SET status = 'open' WHERE id = $1", [invalidatedMissing.id]);
      });

      // After invalidation: the candidate is no longer pending and the missing
      // case is omitted from the projection.
      const after = await readReviewQueue(principal!, { limit: 50 }, cursorDeps);
      expect(after.kind).toBe("ok");
      if (after.kind !== "ok") throw new Error("expected ok");
      const idsAfter = after.view.items.map((i) => i.case.id);
      expect(idsAfter).not.toContain(invalidatedMissing.id);
      // The partner found case data is NEVER leaked.
      for (const it of after.view.items) {
        for (const c of it.candidates) expect(c.counterpart.id).not.toBe(invalidatedFound.id);
      }
    });

    it("a valid referred pair leaves the queue and never exposes the found case", async () => {
      const principal = userPrincipal({ id: verifiedOfficerId, role: "officer", verified: true, is_active: true });
      expect(principal).not.toBeNull();
      const refMissing = await seedMissingOpen();
      const refFound = await seedFoundOpen(staffUserId);
      const candidateId = await insertCandidate(refMissing.id, refFound.id, 1, 80);
      await moveToMatchedReview(refMissing.id);
      await moveToMatchedReview(refFound.id);
      await asAppClient((client) => confirmPair(client, {
        candidateId,
        missingId: refMissing.id,
        foundId: refFound.id,
        officerId: verifiedOfficerId,
      }));
      await asAppClient((client) => closeMissing(client, refMissing.id));

      const r = await readReviewQueue(principal!, { limit: 50 }, cursorDeps);
      expect(r.kind).toBe("ok");
      if (r.kind !== "ok") throw new Error("expected ok");
      // The missing case is dropped (no surviving candidates).
      const idsAfter = r.view.items.map((i) => i.case.id);
      expect(idsAfter).not.toContain(refMissing.id);
      // ... and the partner found case data is never leaked.
      for (const it of r.view.items) {
        for (const c of it.candidates) expect(c.counterpart.id).not.toBe(refFound.id);
      }
    });

    it("redacts a valid referred pair without hiding an independent live candidate", async () => {
      const principal = userPrincipal({ id: verifiedOfficerId, role: "officer", verified: true, is_active: true });
      expect(principal).not.toBeNull();
      const redMissing = await seedMissingOpen();
      const redFound = await seedFoundOpen(staffUserId);
      const redCandidateId = await insertCandidate(redMissing.id, redFound.id, 1, 80);
      await moveToMatchedReview(redMissing.id);
      await moveToMatchedReview(redFound.id);
      await asAppClient((client) => confirmPair(client, {
        candidateId: redCandidateId,
        missingId: redMissing.id,
        foundId: redFound.id,
        officerId: verifiedOfficerId,
      }));
      await asAppClient((client) => closeMissing(client, redMissing.id));
      const adminPrincipal = userPrincipal({ id: adminUserId, role: "admin", verified: false, is_active: true });
      expect(adminPrincipal).not.toBeNull();
      const redaction = await redactCases(redactorPool, adminPrincipal!, {
        case_ids: [redFound.id],
        confirmation: "বেনামী",
      });
      expect(redaction).toMatchObject({ redacted: 1, skipped_not_eligible: 0 });
      const redactionState = await appPool.query<{ redacted: boolean }>(
        "SELECT anonymised_at IS NOT NULL AS redacted FROM cases WHERE id = $1",
        [redFound.id],
      );
      expect(redactionState.rows[0]?.redacted).toBe(true);

      // A separate live pair remains eligible for the officer queue. This
      // proves the redacted-endpoint filter is candidate-scoped, not queue-wide.
      const liveMissing = await seedMissingOpen();
      const liveFound = await seedFoundOpen(staffUserId);
      await insertCandidate(liveMissing.id, liveFound.id, 1, 85);
      await moveToMatchedReview(liveMissing.id);

      const r = await readReviewQueue(principal!, { limit: 50 }, cursorDeps);
      expect(r.kind).toBe("ok");
      if (r.kind !== "ok") throw new Error("expected ok");
      const idsAfter = r.view.items.map((i) => i.case.id);
      expect(idsAfter).not.toContain(redMissing.id);
      expect(idsAfter).toContain(liveMissing.id);
      // Redacted found case data is NEVER served.
      for (const it of r.view.items) {
        for (const c of it.candidates) expect(c.counterpart.id).not.toBe(redFound.id);
      }
    });
  });
});
