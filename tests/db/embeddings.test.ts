// TASK-016: `npm run reembed` logic against a real PostgreSQL 16 (fresh per-run database)
// with the deterministic fake embedder. Runs under `npm run test:db`.
import type { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { EMBEDDING, setEmbedder } from "../../src/server/embeddings";
// @ts-expect-error -- plain ESM module without type declarations
import { seedCases } from "../../db/seed/cases.mjs";
// @ts-expect-error -- plain ESM module without type declarations
import { loadDistrictData, seedDistricts } from "../../db/seed/districts.mjs";
// @ts-expect-error -- plain ESM module without type declarations
import { reembedCases } from "../../scripts/embeddings/reembed-lib.mjs";
import { fakeEmbedder, seen } from "../embeddings/support";
import { connect, dbTestsEnabled } from "./support/db";

describe.skipIf(!dbTestsEnabled)("reembed (TASK-016)", () => {
  let admin: Client;
  const count = async (sql: string) => (await admin.query(sql)).rows[0].n as number;

  beforeAll(async () => {
    admin = await connect("admin");
    await seedDistricts(admin, loadDistrictData());
    await admin.query(
      `INSERT INTO users (username, display_name, password_hash, role) VALUES
         ('staff.demo', '[MOCK] স্টাফ এক', 'x', 'staff'), ('staff2.demo', '[MOCK] স্টাফ দুই', 'x', 'staff')`,
    );
    await seedCases(admin, { set: "full" });
    setEmbedder(fakeEmbedder());
  });
  afterEach(() => {
    seen.length = 0;
  });
  afterAll(async () => {
    setEmbedder(null);
    await admin?.end();
  });

  it("starts with 200 seeded cases and no embeddings", async () => {
    expect(await count("SELECT count(*)::int AS n FROM cases")).toBe(200);
    expect(await count("SELECT count(*)::int AS n FROM cases WHERE embedding IS NOT NULL")).toBe(0);
  });

  it("fills all 200 with model, revision and space set together (CHECK holds), 384-d", async () => {
    const counts = await reembedCases(admin, { batchSize: 30 });
    expect(counts).toMatchObject({ embedded: 200, skipped_empty: 0, stale_retry: 0 });
    expect(counts.batches).toBe(7);
    expect(await count(`SELECT count(*)::int AS n FROM cases WHERE embedding IS NOT NULL AND embedding_model = '${EMBEDDING.model}'
      AND embedding_revision = '${EMBEDDING.revision}' AND embedding_space = '${EMBEDDING.space}'`)).toBe(200);
    expect(await count("SELECT count(*)::int AS n FROM cases WHERE vector_dims(embedding) = 384")).toBe(200);
  });

  it("uses query: for missing and passage: for found, and never embeds a name or phone", async () => {
    await admin.query("UPDATE cases SET embedding = NULL, embedding_model = NULL, embedding_revision = NULL, embedding_space = NULL");
    await reembedCases(admin);
    const missing = seen.filter((t) => t.startsWith("query: ")).length;
    const found = seen.filter((t) => t.startsWith("passage: ")).length;
    expect(missing).toBe(await count("SELECT count(*)::int AS n FROM cases WHERE kind = 'missing'"));
    expect(found).toBe(await count("SELECT count(*)::int AS n FROM cases WHERE kind = 'found'"));
    const { rows } = await admin.query("SELECT child_name, contact_phone FROM cases WHERE child_name IS NOT NULL OR contact_phone IS NOT NULL");
    for (const r of rows) {
      for (const t of seen) {
        if (r.child_name) expect(t).not.toContain(r.child_name);
        expect(t).not.toContain(r.contact_phone);
      }
    }
  });

  it("a second run changes 0 rows and embeds nothing", async () => {
    const before = await admin.query("SELECT max(updated_at) AS u FROM cases");
    seen.length = 0;
    expect(await reembedCases(admin)).toMatchObject({ embedded: 0, batches: 0 });
    expect(seen).toHaveLength(0);
    expect((await admin.query("SELECT max(updated_at) AS u FROM cases")).rows[0].u).toEqual(before.rows[0].u);
  });

  it("a changed model constant re-embeds everything", async () => {
    const changed = { ...EMBEDDING, revision: "f".repeat(40) };
    expect(await reembedCases(admin, { embedding: changed })).toMatchObject({ embedded: 200 });
    expect(await count(`SELECT count(*)::int AS n FROM cases WHERE embedding_revision = '${changed.revision}'`)).toBe(200);
    expect(await reembedCases(admin, { embedding: changed })).toMatchObject({ embedded: 0 });
    // and a changed space too
    expect(await reembedCases(admin, { embedding: { ...changed, space: "other-space" } })).toMatchObject({ embedded: 200 });
  });

  it("skips terminal (closed) and redacted cases, leaving their embedding NULL", async () => {
    const { rows } = await admin.query("SELECT id FROM cases WHERE kind = 'missing' ORDER BY id LIMIT 2");
    const [closedId, redactedId] = rows.map((r) => r.id as string);
    const adminUser = (
      await admin.query("INSERT INTO users (username, display_name, password_hash, role) VALUES ('admin.demo', '[MOCK] admin', 'x', 'admin') RETURNING id")
    ).rows[0].id as string;
    await admin.query("UPDATE cases SET embedding = NULL, embedding_model = NULL, embedding_revision = NULL, embedding_space = NULL");
    for (const id of [closedId, redactedId]) {
      await admin.query("UPDATE cases SET status = 'closed', outcome = 'resolved_outside_fera', closed_at = now() WHERE id = $1", [id]);
    }
    await admin.query("SELECT redact_case($1, $2)", [redactedId, adminUser]);
    expect(await count("SELECT count(*)::int AS n FROM cases WHERE anonymised_at IS NOT NULL")).toBe(1);

    const counts = await reembedCases(admin);
    expect(counts.embedded).toBe(198);
    const skipped = await admin.query("SELECT id FROM cases WHERE embedding IS NULL ORDER BY id");
    expect(skipped.rows.map((r) => r.id).sort()).toEqual([closedId, redactedId].sort());
    expect(await count("SELECT count(*)::int AS n FROM cases WHERE anonymised_at IS NOT NULL AND embedding IS NOT NULL")).toBe(0);
  });
});
