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
  let app: Pool;

  beforeAll(async () => {
    admin = await connect("admin");
    app = pool("app");
    setPoolForTests(app);
    await seedDistricts(admin, loadDistrictData());
    await admin.query(
      `INSERT INTO users (username, display_name, password_hash, role) VALUES
         ('staff.demo', '[MOCK] স্টাফ এক', 'x', 'staff'), ('staff2.demo', '[MOCK] স্টাফ দুই', 'x', 'staff')`,
    );
    await seedCases(admin, { set: "demo" });
  });
  afterAll(async () => {
    setPoolForTests(null);
    await app?.end();
    await admin?.end();
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

  it("missing: service create + open gives the seeded row and audit trail", async () => {
    const rec = (loadSyntheticSet("demo") as Rec[]).find((r) => r.kind === "missing")!;
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
  });

  it("found: service create gives the seeded row and audit trail", async () => {
    const rec = (loadSyntheticSet("demo") as Rec[]).find((r) => r.kind === "found")!;
    const staffId = (await admin.query("SELECT id FROM users WHERE username = 'staff.demo'")).rows[0].id as string;
    const request = createFoundRequestSchema.parse({ client_submission_id: randomUUID(), confirmed: true, draft: rec.draft });
    const created = await createFoundCase(testUser(staffId, "staff"), request, { pool: app });
    const viaService = await shape(created.case.id);
    const seeded = await shape(await seededId(rec.record_id));
    expect(seeded.row).toEqual(viaService.row);
    expect(seeded.audit).toEqual(viaService.audit);
    expect(viaService.audit.map((a) => a.action)).toEqual(["case.created"]);
  });
});
