// API-023 decision integration (TASK-051; BR-020/021; TC-038).
// Uses the real restricted app role and a fresh synthetic-only database from
// scripts/db/test-db.mjs. The audit rows are append-only, so this isolated DB is
// dropped by the runner after the file completes.
import type { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testUser } from "../support/principals";
import { decideDuplicate } from "@/server/duplicates/decision";
import { connect, createActors, dbTestsEnabled, insertMissing, one, pool, seedReference, type CaseRef, type Actors } from "./support/db";

type PairLink = {
  id: string;
  caseA: CaseRef;
  caseB: CaseRef;
};

describe.skipIf(!dbTestsEnabled)("API-023 duplicate decisions (BR-020/021; TC-038)", () => {
  let admin: Client;
  let appClient: Client;
  let appPool: Pool;
  let actors: Actors;

  beforeAll(async () => {
    admin = await connect("admin");
    appClient = await connect("app");
    appPool = pool("app");
    await seedReference(admin);
    actors = await createActors(admin);
  });

  afterAll(async () => {
    await Promise.all([admin?.end(), appClient?.end(), appPool?.end()]);
  });

  async function createLink(left: CaseRef, right: CaseRef, rule: "profile" | "same_phone"): Promise<PairLink> {
    const [caseA, caseB] = [left, right].sort((a, b) => a.id.localeCompare(b.id));
    const link = await one<{ id: string }>(admin,
      `INSERT INTO duplicate_links (case_a, case_b, score, rule)
       VALUES ($1, $2, 82.5, $3) RETURNING id`,
      [caseA.id, caseB.id, rule]);
    return { id: link.id, caseA, caseB };
  }

  async function makePair(): Promise<[CaseRef, CaseRef]> {
    return [await insertMissing(appClient), await insertMissing(appClient)];
  }

  it("records confirmed-same and dismissed outcomes with one officer audit each while leaving reports unchanged", async () => {
    const samePair = await makePair();
    const differentPair = await makePair();
    const sameLink = await createLink(...samePair, "profile");
    const differentLink = await createLink(...differentPair, "profile");
    const officer = testUser(actors.officer, "officer", { verified: true });

    const before = await admin.query<{ id: string; status: string; version: number }>(
      "SELECT id, status, version FROM cases WHERE id = ANY($1::uuid[]) ORDER BY id",
      [[...samePair, ...differentPair].map((x) => x.id)],
    );
    const sameReason = "[MOCK] profile comparison supports same child";
    const differentReason = "[MOCK] profile comparison shows different children";
    const sameResult = await decideDuplicate(officer, sameLink.id, {
      status: "confirmed_same", reason: sameReason, profile_evidence_reviewed: true,
    }, { pool: appPool });
    const differentResult = await decideDuplicate(officer, differentLink.id, {
      status: "dismissed", reason: differentReason, profile_evidence_reviewed: true,
    }, { pool: appPool });

    expect(sameResult.response.status).toBe("confirmed_same");
    expect(differentResult.response.status).toBe("dismissed");
    expect(sameResult.response.audit_id).toBeGreaterThan(0);
    expect(differentResult.response.audit_id).toBeGreaterThan(sameResult.response.audit_id);

    const links = await admin.query<{ id: string; status: string; resolved_by: string; reason: string }>(
      "SELECT id, status, resolved_by, reason FROM duplicate_links WHERE id = ANY($1::uuid[]) ORDER BY id",
      [[sameLink.id, differentLink.id]],
    );
    expect(links.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: sameLink.id, status: "confirmed_same", resolved_by: actors.officer, reason: sameReason }),
      expect.objectContaining({ id: differentLink.id, status: "dismissed", resolved_by: actors.officer, reason: differentReason }),
    ]));

    const after = await admin.query<{ id: string; status: string; version: number }>(
      "SELECT id, status, version FROM cases WHERE id = ANY($1::uuid[]) ORDER BY id",
      [[...samePair, ...differentPair].map((x) => x.id)],
    );
    expect(after.rows).toEqual(before.rows);

    const audits = await admin.query<{
      id: string;
      action: string;
      actor_type: string;
      actor_user_id: string;
      case_id: string;
      details: Record<string, unknown>;
    }>(
      `SELECT id, action, actor_type, actor_user_id, case_id, details
       FROM audit_log WHERE id = ANY($1::bigint[]) ORDER BY id`,
      [[sameResult.auditId, differentResult.auditId]],
    );
    expect(audits.rows).toHaveLength(2);
    expect(audits.rows[0]).toMatchObject({
      id: String(sameResult.auditId), action: "duplicate.reviewed", actor_type: "officer",
      actor_user_id: actors.officer, case_id: sameLink.caseA.id,
      // BR-021: duplicate_link_id is the safe subject identifier so two
      // links sharing the same lower endpoint stay distinguishable.
      details: { api: "API-023", duplicate_status: "confirmed_same", duplicate_rule: "profile", duplicate_link_id: sameLink.id, missing_ref: sameLink.caseA.ref, reason_recorded: true },
    });
    expect(audits.rows[1]).toMatchObject({
      id: String(differentResult.auditId), action: "duplicate.reviewed", actor_type: "officer",
      actor_user_id: actors.officer, case_id: differentLink.caseA.id,
      details: { api: "API-023", duplicate_status: "dismissed", duplicate_rule: "profile", duplicate_link_id: differentLink.id, missing_ref: differentLink.caseA.ref, reason_recorded: true },
    });
    expect(JSON.stringify(audits.rows)).not.toContain(sameReason);
    expect(JSON.stringify(audits.rows)).not.toContain(differentReason);
    expect(JSON.stringify(audits.rows)).not.toContain(sameLink.caseB.ref);
  });

  it("refuses a same-phone confirmation and leaves the flag and audit trail unchanged", async () => {
    const [first, second] = await makePair();
    const link = await createLink(first, second, "same_phone");
    const officer = testUser(actors.officer, "officer", { verified: true });

    await expect(decideDuplicate(officer, link.id, {
      status: "confirmed_same", reason: "[MOCK] phone-only evidence", profile_evidence_reviewed: true,
    }, { pool: appPool })).rejects.toMatchObject({ id: "E-005" });

    const after = await one<{ status: string; resolved_by: string | null; resolved_at: string | null }>(
      admin,
      "SELECT status, resolved_by, resolved_at FROM duplicate_links WHERE id = $1",
      [link.id],
    );
    expect(after).toEqual({ status: "flagged", resolved_by: null, resolved_at: null });
    const audit = await admin.query("SELECT id FROM audit_log WHERE case_id = $1 AND action = 'duplicate.reviewed'", [link.caseA.id]);
    expect(audit.rows).toHaveLength(0);
  });

  // SYS-BUG-03 regression: two duplicate links sharing the same lower endpoint
  // (case_a) must produce audit rows with distinguishable subjects. Before the
  // fix the details only carried the lower endpoint's case_id, which collapsed
  // the two audits; the duplicate_link_id key in details is the safe subject.
  it("distinguishes two links sharing the same lower endpoint via duplicate_link_id (SYS-BUG-03)", async () => {
    const all = await Promise.all([insertMissing(appClient), insertMissing(appClient), insertMissing(appClient)]);
    const sorted = [...all].sort((a, b) => a.id.localeCompare(b.id));
    const lower = sorted[0]!; // smallest UUID = caseA for both links
    const upper1 = sorted[1]!;
    const upper2 = sorted[2]!;
    const linkAB = await createLink(lower, upper1, "profile");
    const linkAC = await createLink(lower, upper2, "profile");
    // Both links must share the same case_a (the smallest UUID of the three).
    expect(linkAB.caseA.id).toBe(linkAC.caseA.id);
    expect(linkAB.caseA.id).toBe(lower.id);

    const officer = testUser(actors.officer, "officer", { verified: true });
    const reason = "[MOCK] SYS-BUG-03 regression evidence";
    const r1 = await decideDuplicate(officer, linkAB.id, {
      status: "dismissed", reason, profile_evidence_reviewed: true,
    }, { pool: appPool });
    const r2 = await decideDuplicate(officer, linkAC.id, {
      status: "dismissed", reason, profile_evidence_reviewed: true,
    }, { pool: appPool });

    const audits = await admin.query<{ id: string; details: Record<string, unknown> }>(
      `SELECT id, details FROM audit_log
         WHERE action = 'duplicate.reviewed' AND id = ANY($1::bigint[]) ORDER BY id`,
      [[r1.auditId, r2.auditId]],
    );
    expect(audits.rows).toHaveLength(2);
    const linkIds = audits.rows.map((row) => row.details.duplicate_link_id);
    expect(new Set(linkIds).size).toBe(2);
    expect(linkIds).toEqual(expect.arrayContaining([linkAB.id, linkAC.id]));
  });
});
