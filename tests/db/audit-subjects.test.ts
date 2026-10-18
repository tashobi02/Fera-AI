// BR-010 / Constitution V: immutable audits identify the affected account or link.
import type { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setOfficerVerified } from "@/server/admin";
import { decideDuplicate } from "@/server/duplicates/decision";
import { readCaseAudit } from "@/server/audit/safe-read";
import { testUser } from "../support/principals";
import { connect, pool, seedReference, createActors, insertMissing, dbTestsEnabled, type Actors } from "./support/db";

describe.skipIf(!dbTestsEnabled)("BR-010 audit subject traceability", () => {
  let admin: Client;
  let app: Client;
  let appPool: Pool;
  let actors: Actors;
  beforeAll(async () => {
    admin = await connect("admin"); app = await connect("app"); appPool = pool("app");
    await seedReference(admin); actors = await createActors(admin);
  });
  afterAll(async () => { await Promise.all([admin?.end(), app?.end(), appPool?.end()]); });

  it("identifies two different officers verified by the same admin", async () => {
    const other = await createActors(admin);
    const principal = testUser(actors.admin, "admin");
    const targets = [actors.unverifiedOfficer, other.unverifiedOfficer];
    for (const id of targets) await setOfficerVerified(principal, id, { verified: true }, { pool: appPool });
    const { rows } = await app.query<{ details: Record<string, unknown> }>(
      "SELECT details FROM audit_log WHERE action='user.verification_changed' ORDER BY id",
    );
    expect(rows.map((row) => row.details.target_user_id)).toEqual(targets);
    expect(rows[0].details).not.toEqual(rows[1].details);
  });

  it("identifies duplicate decisions sharing the lower endpoint without expanding public DTOs", async () => {
    const cases = [await insertMissing(app), await insertMissing(app), await insertMissing(app)].sort((a, b) => a.id.localeCompare(b.id));
    const links: string[] = [];
    for (const other of cases.slice(1)) {
      const { rows } = await admin.query<{ id: string }>(
        "INSERT INTO duplicate_links(case_a,case_b,score,rule) VALUES($1,$2,82.5,'profile') RETURNING id", [cases[0].id, other.id],
      );
      links.push(rows[0].id);
    }
    const officer = testUser(actors.officer, "officer", { verified: true });
    for (const id of links) await decideDuplicate(officer, id, {
      status: "dismissed", reason: "[MOCK] profile differs", profile_evidence_reviewed: true,
    }, { pool: appPool });
    const { rows } = await app.query<{ details: Record<string, unknown> }>(
      "SELECT details FROM audit_log WHERE action='duplicate.reviewed' ORDER BY id",
    );
    expect(rows.map((row) => row.details.duplicate_link_id)).toEqual(links);
    for (const principal of [officer, testUser(actors.admin, "admin")]) {
      const result = await readCaseAudit(principal, cases[0].id, { db: app });
      expect(result.kind).toBe("ok");
      if (result.kind !== "ok") throw new Error("expected an authorized audit projection");
      expect(result.view.entries).toHaveLength(2);
      expect(result.view.withheld).toBe(0);
      expect(JSON.stringify(result.view)).not.toContain("duplicate_link_id");
      for (const id of links) expect(JSON.stringify(result.view)).not.toContain(id);
    }
  });
});
