// TASK-019: the seed loader's rows must equal what the case service writes for the same
// draft (column by column, and the audit actions and detail keys). Guards against drift
// between db/seed/cases.mjs and src/server/case/commands.ts. Runs under `npm run test:db`.
import { randomUUID } from "node:crypto";
import type { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFoundRequestSchema, createMissingRequestSchema } from "../../src/contracts";
import { createFoundCase, createMissingCase, openCase } from "../../src/server/case";
import { setPoolForTests } from "../../src/server/db/pool";
// @ts-expect-error -- plain ESM module without type declarations
import { loadSyntheticSet, seedCases } from "../../db/seed/cases.mjs";
// @ts-expect-error -- plain ESM module without type declarations
import { loadDistrictData, seedDistricts } from "../../db/seed/districts.mjs";
import { testParent, testUser } from "../support/principals";
import { connect, dbTestsEnabled, pool } from "./support/db";

type Rec = { record_id: string; kind: "missing" | "found"; draft: Record<string, unknown> };
const IGNORED = ["id", "ref_code", "created_at", "updated_at", "reporter_session_id", "created_by_user_id", "client_submission_id"];

describe.skipIf(!dbTestsEnabled)("seed rows equal service rows (TASK-019)", () => {
  let admin: Client;
  let admin2: Client;
  let app: Pool;

  beforeAll(async () => {
    admin = await connect("admin");
    admin2 = await connect("admin");
    app = pool("app");
    setPoolForTests(app);
    await seedDistricts(admin, loadDistrictData());
    await admin.query(
      `INSERT INTO users (username, display_name, password_hash, role) VALUES
         ('staff.demo', '[MOCK] স্টাফ এক', '$argon2id$v=19$m=19456,t=2,p=1$aaaaaaaaaaaaaaaaaaaaaa$bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'staff'),
         ('staff2.demo', '[MOCK] স্টাফ দুই', '$argon2id$v=19$m=19456,t=2,p=1$aaaaaaaaaaaaaaaaaaaaaa$bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'staff')`,
    );
  });
  afterAll(async () => {
    setPoolForTests(null);
    await app?.end();
    await admin?.end();
    await admin2?.end();
  });

  const shape = async (caseId: string) => {
    const row = (await admin.query("SELECT to_jsonb(c) AS j FROM cases c WHERE id = $1", [caseId])).rows[0].j as Record<string, unknown>;
    for (const k of IGNORED) delete row[k];
    const audit = (await admin.query("SELECT actor_type, action, details FROM audit_log WHERE case_id = $1 ORDER BY id", [caseId])).rows;
    return {
      row,
      audit: audit.map((a) => ({ actor_type: a.actor_type, action: a.action, keys: Object.keys(a.details).sort(), details: { ...a.details, ref_code: "-" } })),
    };
  };
  const seededId = async (recordId: string) => (await admin.query("SELECT id FROM cases WHERE client_submission_id = $1", [recordId])).rows[0].id as string;

  it("two simultaneous seed runs serialise: all 200 inserted once, no unique violation", async () => {
    const [a, b] = await Promise.all([seedCases(admin, { set: "full" }), seedCases(admin2, { set: "full" })]);
    expect(a.inserted + b.inserted).toBe(200);
    expect(a.skipped + b.skipped).toBe(200);
    expect((await admin.query("SELECT count(*)::int AS n FROM cases")).rows[0].n).toBe(200);
  });

  // One record per property combination present in the committed set, plus the shortest text.
  // The set has no empty source_text and no null phone (the loader refuses a phone outside the block).
  const sample = (kind: Rec["kind"]) => {
    const all = (loadSyntheticSet("full") as Rec[]).filter((r) => r.kind === kind);
    const key = (r: Rec) => {
      const d = r.draft as { child: { name: unknown; age_years: unknown }; event: { at_approx: boolean } };
      return [d.child.age_years !== null ? "years" : "range", d.event.at_approx ? "approx" : "exact", d.child.name === null ? "noname" : "name"].join("/");
    };
    const picked = new Map<string, Rec>();
    for (const r of all) if (!picked.has(key(r))) picked.set(key(r), r);
    const shortest = all.reduce((m, r) => ((r.draft.source_text as string).length < (m.draft.source_text as string).length ? r : m));
    return [...new Set([...picked.values(), shortest])];
  };

  it("missing samples: service create + open gives the seeded row and audit trail", async () => {
    const samples = sample("missing");
    expect(samples.length).toBeGreaterThanOrEqual(2);
    for (const rec of samples) {
      const session = (await admin.query("INSERT INTO parent_sessions DEFAULT VALUES RETURNING id")).rows[0].id as string;
      const parent = testParent(session);
      const request = createMissingRequestSchema.parse({ client_submission_id: randomUUID(), confirmed: true, draft: rec.draft });
      const created = await createMissingCase(parent, request, { pool: app });
      await openCase(parent, created.case.id, { pool: app });
      const viaService = await shape(created.case.id);
      const seeded = await shape(await seededId(rec.record_id));
      expect(seeded.row).toEqual(viaService.row);
      expect(seeded.audit).toEqual(viaService.audit);
      expect(viaService.row.raw_text).not.toBeNull();
      expect(viaService.audit.map((a) => a.action)).toEqual(["case.created", "case.state_changed"]);
    }
  });

  it("found samples: service create gives the seeded row and audit trail", async () => {
    const samples = sample("found");
    expect(samples.length).toBeGreaterThanOrEqual(2);
    const staffId = (await admin.query("SELECT id FROM users WHERE username = 'staff.demo'")).rows[0].id as string;
    for (const rec of samples) {
      const request = createFoundRequestSchema.parse({ client_submission_id: randomUUID(), confirmed: true, draft: rec.draft });
      const created = await createFoundCase(testUser(staffId, "staff"), request, { pool: app });
      const viaService = await shape(created.case.id);
      const seeded = await shape(await seededId(rec.record_id));
      expect(seeded.row).toEqual(viaService.row);
      expect(seeded.audit).toEqual(viaService.audit);
      expect(viaService.audit.map((a) => a.action)).toEqual(["case.created"]);
    }
  });
});
