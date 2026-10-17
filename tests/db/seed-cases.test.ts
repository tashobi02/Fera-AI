// TASK-019: `npm run seed -- --set demo|full` loads the synthetic reports as cases.
// Runs under `npm run test:db` only (fresh per-run database); skipped in plain `npm test`.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { foundSubmissionDraftSchema, missingSubmissionDraftSchema } from "../../src/contracts/draft";
import { submissionPayloadHash } from "../../src/contracts/server";
// @ts-expect-error -- plain ESM module without type declarations
import { DEMO_ROLES, loadSyntheticSet, seedCases } from "../../db/seed/cases.mjs";
// @ts-expect-error -- plain ESM module without type declarations
import { loadDistrictData, seedDistricts } from "../../db/seed/districts.mjs";
import { connect, dbTestsEnabled } from "./support/db";

type Rec = { record_id: string; kind: "missing" | "found"; draft: Record<string, unknown> };
const records: Rec[] = readFileSync(join(process.cwd(), "data/synthetic/records.jsonl"), "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));
const MISSING = records.filter((r) => r.kind === "missing").length; // 90 in this revision
const FOUND = records.length - MISSING;
const truth: { records: Array<{ record_id: string; demo_role: string | null }> } = JSON.parse(
  readFileSync(join(process.cwd(), "data/synthetic/ground_truth.json"), "utf8"),
);

describe.skipIf(!dbTestsEnabled)("case seed (TASK-019)", () => {
  let admin: Client;
  const count = async (sql: string) => (await admin.query(sql)).rows[0].n as number;

  beforeAll(async () => {
    admin = await connect("admin");
    await seedDistricts(admin, loadDistrictData());
    await admin.query(
      `INSERT INTO users (username, display_name, password_hash, role) VALUES
         ('staff.demo', '[MOCK] স্টাফ এক', 'x', 'staff'), ('staff2.demo', '[MOCK] স্টাফ দুই', 'x', 'staff')`,
    );
  });
  afterAll(async () => {
    await admin?.end();
  });

  it("documents the demo set: five records, Rafi withheld (OD-010-4)", () => {
    const demo = truth.records.filter((r) => r.demo_role && r.demo_role !== "rafi").map((r) => r.demo_role).sort();
    expect(demo).toEqual(["kamalapur_boy", "mim", "mim_public_post", "narayanganj_decoy", "sabbir"]);
    expect([...DEMO_ROLES].sort()).toEqual(demo);
    expect(loadSyntheticSet("demo")).toHaveLength(5);
    expect(loadSyntheticSet("demo").map((r: Rec) => r.record_id)).not.toContain(
      truth.records.find((r) => r.demo_role === "rafi")?.record_id,
    );
    expect(loadSyntheticSet("full")).toHaveLength(200);
  });

  it("refuses to run when the staff accounts are missing (run npm run seed:users)", async () => {
    await admin.query("UPDATE users SET username = 'x.' || username WHERE username IN ('staff.demo','staff2.demo')");
    try {
      await expect(seedCases(admin, { set: "demo" })).rejects.toThrow(/seed:users/);
      expect(await count("SELECT count(*)::int AS n FROM cases")).toBe(0);
    } finally {
      await admin.query("UPDATE users SET username = substr(username, 3) WHERE username LIKE 'x.staff%'");
    }
  });

  // Smoke bound only: the real run takes tens of milliseconds, so this cannot catch a mild regression.
  it("loads the demo set under two minutes without Rafi", async () => {
    const t0 = Date.now();
    const result = await seedCases(admin, { set: "demo" });
    expect(Date.now() - t0).toBeLessThan(120_000);
    expect(result).toEqual({ inserted: 5, skipped: 0 });
    expect(await count("SELECT count(*)::int AS n FROM cases")).toBe(5);
    const rafi = truth.records.find((r) => r.demo_role === "rafi")!.record_id;
    expect(await count(`SELECT count(*)::int AS n FROM cases WHERE client_submission_id = '${rafi}'`)).toBe(0);
  });

  it("full adds the rest (Rafi included), leaving 200 synthetic cases and no other", async () => {
    const result = await seedCases(admin, { set: "full" });
    expect(result).toEqual({ inserted: 195, skipped: 5 });
    expect(await count("SELECT count(*)::int AS n FROM cases")).toBe(200);
    expect(await count("SELECT count(*)::int AS n FROM cases WHERE is_synthetic")).toBe(200);
    expect(await count("SELECT count(*)::int AS n FROM cases WHERE NOT is_synthetic")).toBe(0);
    expect(await count("SELECT count(*)::int AS n FROM cases WHERE kind = 'missing'")).toBe(MISSING);
    expect(await count("SELECT count(*)::int AS n FROM cases WHERE kind = 'found'")).toBe(FOUND);
  });

  it("a second run inserts nothing new", async () => {
    const before = await count("SELECT count(*)::int AS n FROM audit_log");
    expect(await seedCases(admin, { set: "full" })).toEqual({ inserted: 0, skipped: 200 });
    expect(await count("SELECT count(*)::int AS n FROM cases")).toBe(200);
    expect(await count("SELECT count(*)::int AS n FROM audit_log")).toBe(before);
  });

  it("owners follow the service rules: one anonymous session per missing report, staff for found", async () => {
    expect(await count("SELECT count(*)::int AS n FROM cases WHERE kind='missing' AND source='parent' AND status='open' AND reporter_session_id IS NOT NULL AND created_by_user_id IS NULL")).toBe(MISSING);
    expect(await count("SELECT count(*)::int AS n FROM cases WHERE kind='found' AND source='staff' AND status='open' AND reporter_session_id IS NULL AND created_by_user_id IS NOT NULL")).toBe(FOUND);
    expect(await count("SELECT count(DISTINCT reporter_session_id)::int AS n FROM cases WHERE kind='missing'")).toBe(MISSING);
  });

  it("writes real audit rows: case.created for all, a system open step for missing", async () => {
    expect(await count("SELECT count(*)::int AS n FROM audit_log WHERE action='case.created'")).toBe(200);
    expect(await count("SELECT count(*)::int AS n FROM audit_log WHERE action='case.state_changed' AND actor_type='system'")).toBe(MISSING);
    expect(await count("SELECT count(*)::int AS n FROM cases c WHERE NOT EXISTS (SELECT 1 FROM audit_log a WHERE a.case_id=c.id AND a.action='case.created')")).toBe(0);
    const bad = await admin.query("SELECT details FROM audit_log WHERE action='case.created' AND (details ? 'raw_text' OR details ? 'child_name' OR details ? 'contact_phone') LIMIT 1");
    expect(bad.rowCount).toBe(0);
  });

  it("stores the service's payload hash, version 1, and keys the case by record_id", async () => {
    const { rows } = await admin.query("SELECT client_submission_id, submission_payload_hash, version FROM cases");
    const byId = new Map(rows.map((r) => [r.client_submission_id as string, r]));
    for (const rec of records) {
      const parsed = (rec.kind === "missing" ? missingSubmissionDraftSchema : foundSubmissionDraftSchema).parse(rec.draft);
      const row = byId.get(rec.record_id)!;
      expect(row.submission_payload_hash).toBe(submissionPayloadHash(parsed));
      expect(row.version).toBe(1);
    }
  });

  it("fails closed when a stored payload hash differs, writing nothing new", async () => {
    const casesBefore = await count("SELECT count(*)::int AS n FROM cases");
    const auditBefore = await count("SELECT count(*)::int AS n FROM audit_log");
    const victim = records[0].record_id;
    const { rows } = await admin.query("SELECT submission_payload_hash AS h FROM cases WHERE client_submission_id = $1", [victim]);
    await admin.query("UPDATE cases SET submission_payload_hash = repeat('0', 64) WHERE client_submission_id = $1", [victim]);
    try {
      await expect(seedCases(admin, { set: "full" })).rejects.toThrow(/differs from the committed record/);
      expect(await count("SELECT count(*)::int AS n FROM cases")).toBe(casesBefore);
      expect(await count("SELECT count(*)::int AS n FROM audit_log")).toBe(auditBefore);
    } finally {
      await admin.query("UPDATE cases SET submission_payload_hash = $2 WHERE client_submission_id = $1", [victim, rows[0].h]);
    }
  });

  it("leaves embeddings NULL and the matcher queue untouched", async () => {
    expect(await count("SELECT count(*)::int AS n FROM cases WHERE embedding IS NOT NULL OR embedding_model IS NOT NULL")).toBe(0);
    expect(await count("SELECT count(*)::int AS n FROM cases WHERE matching_state <> 'queued'")).toBe(0);
  });

});
