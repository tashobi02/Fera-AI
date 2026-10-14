// TASK-062 / T007: eligible terminal payload redaction through redact_case() and
// src/server/admin/redact.ts, run as the restricted fera_redactor role on PostgreSQL 16
// (BR-009/010/025; TC-015/050/051/052). Redaction is pseudonymisation of retained
// metadata, not anonymisation. Synthetic data only; runs under `npm run test:db`.
import type { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RedactionForbiddenError, redactCases } from "@/server/admin/redact";
import { testUser } from "../support/principals";
import {
  addCandidate, closeMissing, closedPair, confirmPair, connect, createActors, dbTestsEnabled, expectPgError,
  insertFound, insertMissing, one, openMissing, pool, seedReference, tx, type Actors, type CaseRef,
} from "./support/db";

const PSEUDONYMISATION = { mode: "pseudonymisation", external_copies_removed: false };

describe.skipIf(!dbTestsEnabled)("payload redaction (TASK-062 / T007)", () => {
  let admin: Client;
  let app: Client;
  let redactor: Client;
  let redactorPool: Pool;
  let actors: Actors;
  const asAdmin = () => testUser(actors.admin, "admin");

  beforeAll(async () => {
    admin = await connect("admin");
    app = await connect("app");
    redactor = await connect("redactor");
    redactorPool = pool("redactor");
    await seedReference(admin);
    actors = await createActors(app);
  });

  afterAll(async () => {
    await Promise.all([admin?.end(), app?.end(), redactor?.end(), redactorPool?.end()]);
  });

  const statusCounts = async () =>
    (await app.query("SELECT kind, status, district_code, count(*)::int AS n FROM cases GROUP BY 1, 2, 3 ORDER BY 1, 2, 3")).rows;
  const anonymised = async (ids: string[]) =>
    Object.fromEntries(
      (await app.query("SELECT id, anonymised_at IS NOT NULL AS done FROM cases WHERE id = ANY($1)", [ids])).rows.map((r) => [r.id, r.done]),
    );

  // Runs first, on this file's fresh database, so all_eligible sees only these rows.
  it("TC-015: all eligible redacts closed/referred payloads, skips active linked evidence and keeps counts", async () => {
    const p1 = await closedPair(app, actors);
    const m3 = await insertMissing(app);
    await openMissing(app, m3.id);
    const f2 = await insertFound(app, actors.staff);
    const c = await addCandidate(app, m3.id, f2.id);
    await confirmPair(app, { candidateId: c, missingId: m3.id, foundId: f2.id, officerId: actors.officer });
    const open = await insertMissing(app);
    await openMissing(app, open.id);

    const before = await statusCounts();
    const result = await redactCases(redactorPool, asAdmin(), { all_eligible: true, confirmation: "বেনামী" });
    expect(result).toEqual({ redacted: 2, skipped_not_eligible: 1, ...PSEUDONYMISATION });
    expect(await anonymised([p1.missing.id, p1.found.id, f2.id, m3.id, open.id])).toEqual({
      [p1.missing.id]: true, [p1.found.id]: true, [f2.id]: false, [m3.id]: false, [open.id]: false,
    });
    expect(await statusCounts()).toEqual(before);
  });

  describe("direct and related payload (TC-050, BR-009/025)", () => {
    let missing: CaseRef;
    let found: CaseRef;
    let confirmedCandidate: string;
    let rejectedCandidate: string;
    let auditBefore: unknown[];

    // A closed missing report with a prior version snapshot, a generated output, a
    // rejected candidate with a reason, a resolved duplicate link and a confirmed pair.
    beforeAll(async () => {
      missing = await insertMissing(app);
      await openMissing(app, missing.id);
      await tx(app, async () => {
        await app.query(
          "INSERT INTO case_versions (case_id, version, snapshot, edited_by) VALUES ($1, 1, $2, 'parent')",
          [missing.id, JSON.stringify({ child_name: missing.name, contact_phone: missing.phone })],
        );
        await app.query("UPDATE cases SET clothing = $2, version = 2 WHERE id = $1", [missing.id, `[MOCK] clothing ${missing.ref} v2`]);
      });
      await app.query(
        "INSERT INTO generated_outputs (case_id, type, text_bn, case_version) VALUES ($1, 'poster', $2, 2)",
        [missing.id, `[MOCK] poster for ${missing.name}, call ${missing.phone}`],
      );

      const other = await insertFound(app, actors.staff);
      rejectedCandidate = await addCandidate(app, missing.id, other.id);
      await tx(app, async () => {
        await app.query("UPDATE match_candidates SET status = 'rejected', decided_at = now() WHERE id = $1", [rejectedCandidate]);
        await app.query(
          "INSERT INTO review_decisions (candidate_id, officer_id, decision, reason) VALUES ($1, $2, 'reject', $3)",
          [rejectedCandidate, actors.officer, `[MOCK] not ${missing.name}`],
        );
        await app.query(
          "INSERT INTO audit_log (actor_type, actor_user_id, action, case_id, candidate_id) VALUES ('officer', $1, 'match.reject', $2, $3)",
          [actors.officer, missing.id, rejectedCandidate],
        );
        await app.query("UPDATE cases SET status = 'open' WHERE id = ANY($1)", [[missing.id, other.id]]);
      });

      const twin = await insertMissing(app);
      const [a, b] = missing.id < twin.id ? [missing.id, twin.id] : [twin.id, missing.id];
      await app.query(
        "INSERT INTO duplicate_links (case_a, case_b, score, rule, status, resolved_by, resolved_at, reason) VALUES ($1, $2, 88, 'profile', 'dismissed', $3, now(), $4)",
        [a, b, actors.officer, `[MOCK] ${missing.name} differs from twin`],
      );

      found = await insertFound(app, actors.staff);
      confirmedCandidate = await addCandidate(app, missing.id, found.id);
      await confirmPair(app, { candidateId: confirmedCandidate, missingId: missing.id, foundId: found.id, officerId: actors.officer });
      await closeMissing(app, missing.id);
      auditBefore = (await app.query("SELECT id, at, action, details FROM audit_log WHERE case_id = $1 ORDER BY id", [missing.id])).rows;

      const result = await redactCases(redactorPool, asAdmin(), { case_ids: [missing.id], confirmation: "বেনামী" });
      expect(result).toEqual({ redacted: 1, skipped_not_eligible: 0, ...PSEUDONYMISATION });
    });

    it("clears every direct identifier, coarsens age and keeps pseudonymous ID, date, district and lifecycle", async () => {
      const row = await one(admin, "SELECT * FROM cases WHERE id = $1", [missing.id]);
      for (const col of [
        "child_name", "child_name_latin", "age_years", "height_cm", "clothing", "marks", "circumstances", "contact_phone",
        "raw_text", "place_text", "thana", "reporter_relation", "gd_number", "source_url", "outcome_note", "embedding",
        "embedding_model", "embedding_revision", "embedding_space", "input_hash",
      ]) {
        expect(row[col], col).toBeNull();
      }
      expect(row.provenance).toEqual({});
      expect({ age_min: row.age_min, age_max: row.age_max }).toEqual({ age_min: 6, age_max: 7 });
      expect(row).toMatchObject({
        id: missing.id, ref_code: missing.ref, kind: "missing", status: "closed", outcome: "coordination_recorded",
        district_code: 1, sex: "female", version: 2, is_synthetic: true,
      });
      expect(row.event_at).toBeInstanceOf(Date);
      expect(row.closed_at).toBeInstanceOf(Date);
      expect(row.anonymised_at).toBeInstanceOf(Date);
    });

    it("drops the submission idempotency key and reporter link (OD-3)", async () => {
      const row = await one(admin, "SELECT client_submission_id, submission_payload_hash, reporter_session_id, created_by_user_id FROM cases WHERE id = $1", [missing.id]);
      expect(row).toEqual({ client_submission_id: null, submission_payload_hash: null, reporter_session_id: null, created_by_user_id: null });
    });

    it("clears related snapshots, outputs, candidate/decision reasons, referral note and duplicate reason", async () => {
      expect((await admin.query("SELECT snapshot FROM case_versions WHERE case_id = $1", [missing.id])).rows).toEqual([{ snapshot: null }]);
      expect((await admin.query("SELECT 1 FROM generated_outputs WHERE case_id = $1", [missing.id])).rowCount).toBe(0);
      const candidates = await admin.query(
        "SELECT status, reason_bn, reason_en, components FROM match_candidates WHERE missing_case_id = $1 ORDER BY status",
        [missing.id],
      );
      expect(candidates.rows).toEqual([
        { status: "confirmed", reason_bn: "[REDACTED]", reason_en: "[REDACTED]", components: {} },
        { status: "rejected", reason_bn: "[REDACTED]", reason_en: "[REDACTED]", components: {} },
      ]);
      const reasons = await admin.query("SELECT decision, reason FROM review_decisions WHERE candidate_id = ANY($1) ORDER BY decision", [[confirmedCandidate, rejectedCandidate]]);
      expect(reasons.rows).toEqual([{ decision: "confirm", reason: "[REDACTED]" }, { decision: "reject", reason: "[REDACTED]" }]);
      expect((await one(admin, "SELECT note FROM referrals WHERE candidate_id = $1", [confirmedCandidate])).note).toBeNull();
      expect((await one(admin, "SELECT reason FROM duplicate_links WHERE case_a = $1 OR case_b = $1", [missing.id])).reason).toBe("[REDACTED]");
    });

    it("leaves none of the report's identifying strings in any table", async () => {
      const needles = [missing.name, `Synthetic Latin ${missing.ref}`, `raw text for ${missing.ref}`, `clothing ${missing.ref}`,
        `marks ${missing.ref}`, `circumstances ${missing.ref}`, `place ${missing.ref}`, `GD-${missing.ref}`, missing.phone];
      const tables = (await admin.query("SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' ORDER BY 1")).rows;
      const hits: string[] = [];
      for (const { relname } of tables) {
        const { rows } = await admin.query(
          `SELECT count(*)::int AS n FROM public.${relname} t WHERE to_jsonb(t)::text LIKE ANY ($1)`,
          [needles.map((n) => `%${n}%`)],
        );
        if (rows[0].n > 0) hits.push(relname);
      }
      expect(hits).toEqual([]);
    });

    it("keeps prior audit rows untouched and appends one safe pseudonymisation event", async () => {
      const after = (await app.query("SELECT id, at, action, details, actor_type, actor_user_id FROM audit_log WHERE case_id = $1 ORDER BY id", [missing.id])).rows;
      expect(after.slice(0, auditBefore.length).map(({ id, at, action, details }) => ({ id, at, action, details }))).toEqual(auditBefore);
      expect(after.slice(auditBefore.length)).toEqual([
        expect.objectContaining({ action: "case.payload_redacted", actor_type: "admin", actor_user_id: actors.admin, details: PSEUDONYMISATION }),
      ]);
    });

    it("makes the redacted row immutable and a repeat redaction a no-op", async () => {
      await expectPgError(app.query("UPDATE cases SET matching_state = 'failed' WHERE id = $1", [missing.id]), "23514", /redacted case is immutable/);
      const count = async () => (await one<{ n: number }>(app, "SELECT count(*)::int AS n FROM audit_log WHERE case_id = $1", [missing.id])).n;
      const n = await count();
      expect(await redactCases(redactorPool, asAdmin(), { case_ids: [missing.id, missing.id], confirmation: "বেনামী" }))
        .toEqual({ redacted: 0, skipped_not_eligible: 1, ...PSEUDONYMISATION });
      await redactor.query("SELECT redact_case($1, $2)", [missing.id, actors.admin]);
      expect(await count()).toBe(n);
    });

    it("then redacts the referred found report and the confirmed pair stays consistent", async () => {
      expect(await redactCases(redactorPool, asAdmin(), { case_ids: [found.id], confirmation: "বেনামী" }))
        .toEqual({ redacted: 1, skipped_not_eligible: 0, ...PSEUDONYMISATION });
      const row = await one(admin, "SELECT status, closed_at IS NOT NULL AS has_closed_at, child_name, contact_phone, clothing FROM cases WHERE id = $1", [found.id]);
      expect(row).toEqual({ status: "referred", has_closed_at: true, child_name: null, contact_phone: null, clothing: null });
      expect((await one(admin, "SELECT status FROM match_candidates WHERE id = $1", [confirmedCandidate])).status).toBe("confirmed");
    });
  });

  describe("eligibility and authority", () => {
    it("refuses non-terminal reports and leaves their payload intact", async () => {
      const open = await insertMissing(app);
      await openMissing(app, open.id);
      await expectPgError(redactor.query("SELECT redact_case($1, $2)", [open.id, actors.admin]), "P0001", /not eligible for redaction/);
      expect(await redactCases(redactorPool, asAdmin(), { case_ids: [open.id, "00000000-0000-4000-8000-000000000000"], confirmation: "বেনামী" }))
        .toEqual({ redacted: 0, skipped_not_eligible: 2, ...PSEUDONYMISATION });
      expect((await one(app, "SELECT child_name FROM cases WHERE id = $1", [open.id])).child_name).toBe(open.name);
    });

    it("retains found evidence while the linked missing report is confirmed but not closed (BR-009)", async () => {
      const missing = await insertMissing(app);
      await openMissing(app, missing.id);
      const found = await insertFound(app, actors.staff);
      const c = await addCandidate(app, missing.id, found.id);
      await confirmPair(app, { candidateId: c, missingId: missing.id, foundId: found.id, officerId: actors.officer });
      await expectPgError(redactor.query("SELECT redact_case($1, $2)", [missing.id, actors.admin]), "P0001", /not eligible/);
      await expectPgError(redactor.query("SELECT redact_case($1, $2)", [found.id, actors.admin]), "P0001", /retain found evidence/);
      expect(await redactCases(redactorPool, asAdmin(), { case_ids: [found.id], confirmation: "বেনামী" }))
        .toEqual({ redacted: 0, skipped_not_eligible: 1, ...PSEUDONYMISATION });
      await closeMissing(app, missing.id);
      expect(await redactCases(redactorPool, asAdmin(), { case_ids: [found.id], confirmation: "বেনামী" }))
        .toEqual({ redacted: 1, skipped_not_eligible: 0, ...PSEUDONYMISATION });
    });

    it("refuses a non-admin principal before touching the database", async () => {
      for (const p of [testUser(actors.staff, "staff"), testUser(actors.officer, "officer", { verified: true }), testUser(actors.admin, "admin", { isActive: false }), null]) {
        await expect(redactCases(redactorPool, p, { all_eligible: true, confirmation: "বেনামী" })).rejects.toBeInstanceOf(RedactionForbiddenError);
      }
    });

    it("lets the database refuse an admin who is no longer active, and propagates it", async () => {
      const { missing } = await closedPair(app, actors);
      const formerAdmin = (await one<{ id: string }>(app, "INSERT INTO users (username, display_name, password_hash, role) VALUES ('former.admin.' || substr(md5(random()::text), 1, 6), '[MOCK] Former admin', 'synthetic-not-a-hash', 'admin') RETURNING id")).id;
      await app.query("UPDATE users SET is_active = false WHERE id = $1", [formerAdmin]);
      await expect(redactCases(redactorPool, testUser(formerAdmin, "admin"), { case_ids: [missing.id], confirmation: "বেনামী" }))
        .rejects.toMatchObject({ code: "42501" });
      await expectPgError(redactor.query("SELECT redact_case($1, $2)", [missing.id, actors.staff]), "42501", /requires active admin/);
      expect((await one(app, "SELECT anonymised_at FROM cases WHERE id = $1", [missing.id])).anonymised_at).toBeNull();
    });
  });

  describe("recorded gaps (reported, schema unchanged)", () => {
    it("redact_case runs as the caller, so fera_redactor's column grants also allow a direct identifying-field write", async () => {
      const open = await insertMissing(app);
      await redactor.query("UPDATE cases SET gd_number = NULL WHERE id = $1", [open.id]);
      expect((await one(app, "SELECT gd_number FROM cases WHERE id = $1", [open.id])).gd_number).toBeNull();
    });

    it("a duplicate link resolved by an officer who was later deactivated blocks redaction", async () => {
      const closed = await insertMissing(app);
      await openMissing(app, closed.id);
      await closeMissing(app, closed.id, "resolved_outside_fera");
      const twin = await insertMissing(app);
      const officer = (await one<{ id: string }>(app, "INSERT INTO users (username, display_name, password_hash, role, verified) VALUES ('leaving.officer.' || substr(md5(random()::text), 1, 6), '[MOCK] Leaving officer', 'synthetic-not-a-hash', 'officer', true) RETURNING id")).id;
      const [a, b] = closed.id < twin.id ? [closed.id, twin.id] : [twin.id, closed.id];
      await app.query(
        "INSERT INTO duplicate_links (case_a, case_b, score, rule, status, resolved_by, resolved_at, reason) VALUES ($1, $2, 80, 'profile', 'dismissed', $3, now(), '[MOCK] different')",
        [a, b, officer],
      );
      await app.query("UPDATE users SET is_active = false WHERE id = $1", [officer]);
      await expectPgError(redactor.query("SELECT redact_case($1, $2)", [closed.id, actors.admin]), "42501", /duplicate resolution requires verified officer/);
    });
  });
});
