import type { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { persistDuplicateFlags } from "@/server/duplicates";
import { decideDuplicate } from "@/server/duplicates/decision";
import { testUser } from "../support/principals";
import { connect, createActors, dbTestsEnabled, insertMissing, openMissing, pool, seedReference, type Actors } from "./support/db";

describe.skipIf(!dbTestsEnabled)("persisted duplicate flags on PostgreSQL 16", () => {
  let owner: Client;
  let app: Pool;
  let actors: Actors;
  beforeAll(async () => {
    owner = await connect("admin");
    app = pool("app");
    await seedReference(owner);
    actors = await createActors(owner);
  });
  afterAll(async () => { await Promise.all([owner?.end(), app?.end()]); });

  it("inserts and audits once, preserves officer decisions and leaves both reports visible", async () => {
    const a = await insertMissing(owner);
    const b = await insertMissing(owner);
    await openMissing(owner, a.id);
    await openMissing(owner, b.id);
    const before = (await owner.query("SELECT id, status, version FROM cases WHERE id = ANY($1::uuid[]) ORDER BY id", [[a.id, b.id]])).rows;
    const first = await persistDuplicateFlags(a.id, { pool: app });
    expect(first.inserted).toBe(1);
    expect(first.auditIds).toHaveLength(1);
    expect((await persistDuplicateFlags(b.id, { pool: app })).inserted).toBe(0);
    const link = (await owner.query<{ id: string }>("SELECT id FROM duplicate_links WHERE case_a = $1 AND case_b = $2", [[a.id, b.id].sort()[0], [a.id, b.id].sort()[1]])).rows[0]!;
    await decideDuplicate(testUser(actors.officer, "officer", { verified: true }), link.id, {
      status: "dismissed", reason: "[MOCK] reviewed profiles differ", profile_evidence_reviewed: true,
    }, { pool: app });
    expect((await persistDuplicateFlags(a.id, { pool: app })).inserted).toBe(0);
    expect((await owner.query("SELECT status FROM duplicate_links WHERE id=$1", [link.id])).rows[0].status).toBe("dismissed");
    const audits = (await owner.query("SELECT actor_type, candidate_id, details FROM audit_log WHERE action='duplicate.flagged' AND case_id=ANY($1::uuid[])", [[a.id, b.id]])).rows;
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actor_type: "system", candidate_id: null });
    expect(JSON.stringify(audits)).not.toContain(a.phone);
    expect(JSON.stringify(audits)).not.toContain(a.name);
    expect((await owner.query("SELECT id, status, version FROM cases WHERE id = ANY($1::uuid[]) ORDER BY id", [[a.id, b.id]])).rows).toEqual(before);
  });

  it("does not flag siblings who share a phone and vector but have contradicting profiles", async () => {
    const a = await insertMissing(owner);
    const b = await insertMissing(owner);
    await openMissing(owner, a.id);
    await openMissing(owner, b.id);
    await owner.query("UPDATE cases SET sex='male', age_years=10, age_min=10, age_max=10 WHERE id=$1", [a.id]);
    await owner.query("UPDATE cases SET sex='female', age_years=4, age_min=4, age_max=4, contact_phone=$2 WHERE id=$1", [b.id, a.phone]);
    await persistDuplicateFlags(a.id, { pool: app });
    await persistDuplicateFlags(b.id, { pool: app });
    expect((await owner.query("SELECT id FROM duplicate_links WHERE case_a=$1 AND case_b=$2", [[a.id, b.id].sort()[0], [a.id, b.id].sort()[1]])).rows).toHaveLength(0);
  });
});
