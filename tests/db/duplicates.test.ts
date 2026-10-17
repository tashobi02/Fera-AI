// TASK-018 duplicate detector (COMP-013, FR-022/FR-023, BR-021; TC-013, TC-038).
// DB tests with the real pool (fera_test_<pid>_<n>, see scripts/db/test-db.mjs).
//
// What these tests cover:
//   TC-013: a parent missing case and a public-import duplicate with close embeddings
//           and matching profile fields are flagged as possible duplicates; both
//           reports remain independently visible (FR-022 / BR-021 — flagging never
//           hides a report).
//   TC-038: two siblings sharing only a phone are NEVER flagged (BR-021; a shared
//           phone ALONE never links two reports and can never support "same child").
//
// Synthetic data only. Run with: npm run test:db (this file is auto-discovered).
import { randomBytes, randomUUID } from "node:crypto";
import type { Client, Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { setPoolForTests } from "@/server/db/pool";
import { detectDuplicates } from "@/server/duplicates";
import { MOCK_DISTRICT, connect, createActors, dbTestsEnabled, fakePhone, one, pool, seedReference, type Actors } from "./support/db";

// 384-d hand-made vectors. They are unit vectors so pgvector's cosine operator
// (`<=>` returns 1 - cosine_similarity) is well defined. The two TC-013 cases
// share the same vector for a distance of 0 (similarity 1.0). The TC-038 siblings
// share a phone but their embeddings are orthogonal to one another.
const vecLiteral = (vals: number[]): string => `[${vals.join(",")}]`;

const unit = (i: number): number[] => {
  // The 384-d standard basis vector e_i (1.0 at index i, 0.0 elsewhere).
  const out = new Array<number>(384).fill(0);
  out[i] = 1;
  return out;
};

const SOURCE = unit(0);
const DUPLICATE = unit(0); // identical to SOURCE: distance 0, similarity 1.0
const ORTHO_1 = unit(1);
const ORTHO_2 = unit(2);

interface CaseFixture {
  id: string;
  ref: string;
}

async function insertMissingCase(
  app: Client,
  opts: {
    name: string;
    age: number;
    sex: "male" | "female" | "other" | "unknown";
    district: number;
    phone: string;
    embedding: number[];
    sessionId: string;
  },
): Promise<CaseFixture> {
  const ref = `M-${randomBytes(6).toString("hex").slice(0, 6).toUpperCase()}`;
  const id = (
    await one<{ id: string }>(
      app,
      `INSERT INTO cases (ref_code, kind, status, source, is_synthetic, reporter_session_id,
                          client_submission_id, submission_payload_hash, input_hash,
                          child_name, age_years, age_min, age_max, sex,
                          event_at, event_at_lower, event_at_upper,
                          place_text, district_code, contact_phone, provenance,
                          embedding, embedding_model, embedding_revision, embedding_space)
       VALUES ($1, 'missing', 'submitted', 'parent', true, $2, $3, $4, $5,
               $6, $7, $7, $7, $8,
               now(), now(), now(),
               $9, $10, $11, '{}'::jsonb,
               $12::vector, 'multilingual-e5-small', 'synthetic-rev', 'synthetic-space')
       RETURNING id`,
      [
        ref, opts.sessionId, randomUUID(),
        randomBytes(32).toString("hex"), randomBytes(32).toString("hex"),
        opts.name, opts.age, opts.sex,
        `[MOCK] place ${ref}`, opts.district, opts.phone,
        vecLiteral(opts.embedding),
      ],
    )
  ).id;
  return { id, ref };
}

async function insertFoundCase(
  app: Client,
  opts: {
    name: string;
    age: number;
    sex: "male" | "female" | "other" | "unknown";
    district: number;
    phone: string;
    embedding: number[];
    staffId: string;
  },
): Promise<CaseFixture> {
  const ref = `F-${randomBytes(6).toString("hex").slice(0, 6).toUpperCase()}`;
  const id = (
    await one<{ id: string }>(
      app,
      `INSERT INTO cases (ref_code, kind, status, source, is_synthetic, created_by_user_id,
                          client_submission_id, submission_payload_hash,
                          child_name, age_min, age_max, sex, clothing, circumstances,
                          event_at, event_at_lower, event_at_upper,
                          place_text, district_code, contact_phone, provenance,
                          embedding, embedding_model, embedding_revision, embedding_space)
       VALUES ($1, 'found', 'open', 'staff', true, $2, $3, $4,
               $5, $6, $7, $8, $9, $10,
               now(), now(), now(),
               $11, $12, $13, '{}'::jsonb,
               $14::vector, 'multilingual-e5-small', 'synthetic-rev', 'synthetic-space')
       RETURNING id`,
      [
        ref, opts.staffId, randomUUID(), randomBytes(32).toString("hex"),
        opts.name, opts.age, opts.age, opts.sex, "[MOCK] clothing", "[MOCK] circumstances",
        `[MOCK] found place ${ref}`, opts.district, opts.phone,
        vecLiteral(opts.embedding),
      ],
    )
  ).id;
  return { id, ref };
}

describe.skipIf(!dbTestsEnabled)("TASK-018 duplicate detector (BR-021, TC-013, TC-038)", () => {
  let admin: Client;
  let app: Pool;
  let appClient: Client;
  let actors: Actors;

  beforeAll(async () => {
    admin = await connect("admin");
    appClient = await connect("app");
    app = pool("app");
    setPoolForTests(app);
    await seedReference(admin);
    actors = await createActors(admin);
  });

  afterEach(async () => {
    // Each test inserts its own fixtures; delete as the owner (fera_app has no
    // DELETE on cases). Order: duplicate_links -> cases.
    await admin.query("DELETE FROM duplicate_links");
    await admin.query("DELETE FROM cases WHERE is_synthetic = true");
  });

  afterAll(async () => {
    setPoolForTests(null);
    await Promise.all([admin?.end(), appClient?.end(), app?.end()]);
  });

  // TC-013: a parent missing case + a public-import duplicate are flagged; both remain
  // independently visible. The detector returns 'profile' (the documented strong rule).
  it("flags a parent missing case and a public-import duplicate with close embedding + matching profile fields (TC-013)", async () => {
    const session = (await one<{ id: string }>(admin, "INSERT INTO parent_sessions DEFAULT VALUES RETURNING id")).id;
    const source = await insertMissingCase(admin, {
      name: "[MOCK] Mim", age: 7, sex: "female",
      district: MOCK_DISTRICT, phone: fakePhone(),
      embedding: SOURCE, sessionId: session,
    });
    const duplicate = await insertMissingCase(admin, {
      name: "[MOCK] Mim", age: 7, sex: "female",
      district: MOCK_DISTRICT, phone: fakePhone(),
      embedding: DUPLICATE, sessionId: session,
    });

    const r = await detectDuplicates(app, source.id);
    expect(r.skipped).toBe(false);
    expect(r.flags).toHaveLength(1);
    const flag = r.flags[0]!;
    expect(flag.source_id).toBe(source.id);
    expect(flag.candidate_id).toBe(duplicate.id);
    expect(flag.rule).toBe("profile");
    // Both reports must remain independently visible: flagging never hides a report.
    const stillThere = await one<{ source_count: number; dup_count: number }>(
      appClient,
      `SELECT
         (SELECT count(*)::int FROM cases WHERE id = $1) AS source_count,
         (SELECT count(*)::int FROM cases WHERE id = $2) AS dup_count`,
      [source.id, duplicate.id],
    );
    expect(stillThere.source_count).toBe(1);
    expect(stillThere.dup_count).toBe(1);
  });

  // TC-038: two siblings sharing a phone remain searchable; the detector does not flag
  // a phone-only link. Embeddings are orthogonal so similarity is far below the threshold.
  it("does not flag two siblings who share only a phone (BR-021, TC-038)", async () => {
    const session = (await one<{ id: string }>(admin, "INSERT INTO parent_sessions DEFAULT VALUES RETURNING id")).id;
    const shared = fakePhone();
    const siblingA = await insertMissingCase(admin, {
      name: "[MOCK] Older sibling", age: 10, sex: "male",
      district: MOCK_DISTRICT, phone: shared,
      embedding: ORTHO_1, sessionId: session,
    });
    const siblingB = await insertMissingCase(admin, {
      name: "[MOCK] Younger sibling", age: 4, sex: "female",
      district: MOCK_DISTRICT, phone: shared,
      embedding: ORTHO_2, sessionId: session,
    });

    const fromA = await detectDuplicates(app, siblingA.id);
    const fromB = await detectDuplicates(app, siblingB.id);
    expect(fromA.flags).toHaveLength(0);
    expect(fromB.flags).toHaveLength(0);
    // Both siblings stay independently visible.
    const stillThere = await one<{ a: number; b: number }>(
      appClient,
      `SELECT
         (SELECT count(*)::int FROM cases WHERE id = $1) AS a,
         (SELECT count(*)::int FROM cases WHERE id = $2) AS b`,
      [siblingA.id, siblingB.id],
    );
    expect(stillThere.a).toBe(1);
    expect(stillThere.b).toBe(1);
  });

  it("skips a report without an embedding and does not error (no embedding -> no pool)", async () => {
    const session = (await one<{ id: string }>(admin, "INSERT INTO parent_sessions DEFAULT VALUES RETURNING id")).id;
    const ref = `M-${randomBytes(6).toString("hex").slice(0, 6).toUpperCase()}`;
    const noEmbed = (
      await one<{ id: string }>(
        admin,
        `INSERT INTO cases (ref_code, kind, status, source, is_synthetic, reporter_session_id,
                            client_submission_id, submission_payload_hash, input_hash,
                            child_name, age_years, age_min, age_max, sex,
                            event_at, event_at_lower, event_at_upper,
                            place_text, district_code, contact_phone, provenance)
         VALUES ($1, 'missing', 'submitted', 'parent', true, $2, $3, $4, $5,
                 '[MOCK] No Embed', 7, 7, 7, 'female',
                 now(), now(), now(),
                 $6, $7, $8, '{}'::jsonb)
         RETURNING id`,
        [ref, session, randomUUID(), randomBytes(32).toString("hex"), randomBytes(32).toString("hex"),
         "[MOCK] place", MOCK_DISTRICT, fakePhone()],
      )
    ).id;
    const r = await detectDuplicates(app, noEmbed);
    expect(r.skipped).toBe(true);
    expect(r.flags).toHaveLength(0);
  });

  it("only considers candidates of the same kind (a missing case is not paired with a found case)", async () => {
    const session = (await one<{ id: string }>(admin, "INSERT INTO parent_sessions DEFAULT VALUES RETURNING id")).id;
    const source = await insertMissingCase(admin, {
      name: "[MOCK] Source", age: 8, sex: "female",
      district: MOCK_DISTRICT, phone: fakePhone(),
      embedding: SOURCE, sessionId: session,
    });
    // A found case with an identical embedding, same profile fields, and a shared phone.
    await insertFoundCase(admin, {
      name: "[MOCK] Source", age: 8, sex: "female",
      district: MOCK_DISTRICT, phone: fakePhone(),
      embedding: SOURCE, staffId: actors.staff,
    });
    const r = await detectDuplicates(app, source.id);
    expect(r.flags).toHaveLength(0);
  });
});
