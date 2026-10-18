// P3-024 / TASK-016 / COMP-011 / TC-059 — re-embed every non-redacted case row.
//
// What this test proves against the real PostgreSQL 16 database, with a
// fake (deterministic, offline) Embedder:
//   * Each non-redacted case row ends up with a non-NULL embedding and the
//     embedder's model / revision / space, stamped together (BR-018).
//   * Two cases get distinct vectors when their canonical texts differ.
//   * Redacted rows (anonymised_at IS NOT NULL) are left alone.
//   * TC-059 — when a row already holds a different embedding_space, the
//     whole batch is rewritten in one transaction so the table ends with
//     exactly one space. No row is left in the old space after the run.
//   * When the in-row emoji-free body is empty (only the prefix remains),
//     `skippedEmpty` accounts for that row but the table still holds the
//     zero-body vector; the model's contract forbids a literal empty input.
//
// Synthetic data only. The fixture names do not contain digit runs; phone
// numbers come from the reserved `0170000xxxx` range. Run with
// `npm run test:db` (it is auto-discovered) or `/tmp/dbtest.sh "$(pwd)"
// tests/db/reembed.test.ts` against a fresh throwaway DB.
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool, PoolClient } from "pg";
import {
  createFakeEmbedder,
  EMBEDDING_DIM,
  makeEmbeddingSpace,
} from "@/server/embeddings/model";
import { reembedAll } from "@/server/embeddings";
import {
  MOCK_DISTRICT,
  connect,
  dbTestsEnabled,
  fakePhone,
  pool,
  seedReference,
} from "./support/db";

let fixturePool: Pool;
let appPool: Pool;
let admin: Awaited<ReturnType<typeof connect>> | undefined;

async function asFixtureOwner<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await fixturePool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

// Run a single fixture UPDATE in replica mode so a state-machine guard or
// trigger does not block us from jumping straight to a terminal / redacted
// state. The whole purpose is to seed rows the workflow would otherwise
// require multiple steps to reach; the DB is throwaway.
async function asReplica<T>(c: PoolClient, fn: () => Promise<T>): Promise<T> {
  await c.query("SET session_replication_role = replica");
  try {
    return await fn();
  } finally {
    await c.query("SET session_replication_role = DEFAULT");
  }
}

// Insert one synthetic missing case row. Owner-connection because the
// runtime role has no INSERT on cases.user/created_by_user_id column grants
// for every required column and we want to avoid round-tripping through the
// public API for setup.
async function seedMissing(opts: { status?: string } = {}): Promise<string> {
  return asFixtureOwner(async (c) => {
    const ref = `M-${randomUUID().slice(0, 6).toUpperCase()}`;
    const session = (
      await c.query<{ id: string }>("INSERT INTO parent_sessions DEFAULT VALUES RETURNING id")
    ).rows[0]!.id;
    const at = new Date(Date.now() - 86400_000).toISOString();
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO cases (ref_code, kind, status, source, is_synthetic, reporter_session_id,
                          client_submission_id, submission_payload_hash, sex, event_at,
                          event_at_lower, event_at_upper, place_text, district_code, contact_phone,
                          provenance, child_name, age_min, age_max, clothing, marks, circumstances)
       VALUES ($1, 'missing', $2, 'parent', true, $3, $4, $5, 'female', $6, $6, $6,
               $7, $8, $9, '{}'::jsonb, $10, 7, 7, $11, $12, $13)
       RETURNING id`,
      [
        ref,
        opts.status ?? "submitted",
        session,
        randomUUID(),
        randomBytes(32).toString("hex"),
        at,
        `[MOCK] place ${ref}`,
        MOCK_DISTRICT,
        fakePhone(),
        `[MOCK] Child ${ref}`,
        `[MOCK] clothing ${ref}`,
        `[MOCK] marks ${ref}`,
        `[MOCK] circumstances ${ref}`,
      ],
    );
    return rows[0]!.id;
  });
}

// Insert a synthetic redacted row (anonymised_at IS NOT NULL) so we can
// assert the reembed skips redacted data.
//
// The schema requires a redacted case to be in a terminal state ('closed' or
// 'referred') with closed_at and outcome set, AND all identifying fields
// (place_text, clothing, etc.) must be NULL once anonymised_at is set (the
// redactor CHECK). We INSERT a found case directly into the redacted+closed
// state in replica mode so the state-machine trigger, the
// "non-redacted must carry place_text" CHECK, and the kind='found' field
// CHECK are all bypassed — the DB is throwaway and we only need the
// resulting state.
async function seedRedacted(): Promise<string> {
  // A valid payload-redacted case: terminal status, every payload column NULL, submission id and
  // hash cleared (the redaction CHECK in db/schema_v2.sql). A missing case may only be INSERTed
  // as 'submitted', so the terminal status needs the replica-mode fixture trick.
  return asFixtureOwner(async (c) =>
    asReplica(c, async () => {
      const ref = `M-${randomUUID().slice(0, 6).toUpperCase()}`;
      const at = new Date(Date.now() - 86400_000).toISOString();
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO cases (ref_code, kind, status, source, is_synthetic, sex, event_at,
                            event_at_lower, event_at_upper, provenance, closed_at, outcome,
                            anonymised_at)
         VALUES ($1, 'missing', 'closed', 'parent', true, 'male', $2, $2, $2,
                 '{}'::jsonb, now(), 'resolved_outside_fera', now())
         RETURNING id`,
        [ref, at],
      );
      return rows[0]!.id;
    }),
  );
}

// One-conn transaction: `reembedAll(db, embedder, deps)` calls
// `deps.withTransaction(fn)` and the function receives a `Queryable`.
// We give it a single client so all UPDATE statements share the same
// session (the schema CHECK invariants read `embedding_model` etc., and
// we exercise SET CONSTRAINTS inside the loop in production).
async function withOneTx<T>(app: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await app.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

function arrRepr(s: string | null): string {
  if (s === null) return "NULL";
  return s.length > 80 ? `${s.slice(0, 77)}...` : s;
}

describe.skipIf(!dbTestsEnabled)("reembedAll on PostgreSQL 16 (P3-024, TASK-016, TC-059)", () => {
  beforeAll(async () => {
    fixturePool = pool("admin");
    appPool = pool("app");
    admin = await connect("admin");
    const client = await fixturePool.connect();
    try {
      await seedReference(client);
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await admin?.end();
    await appPool?.end();
    await fixturePool?.end();
  });

  it("embeds every non-redacted row and stores model+revision+space", async () => {
    const a = await seedMissing();
    const b = await seedMissing();
    const c = await seedMissing();
    // Sanity: the three rows were inserted.
    expect(a).not.toEqual(b);
    expect(b).not.toEqual(c);

    const embedder = createFakeEmbedder();
    const summary = await reembedAll(appPool, embedder, {
      withTransaction: (fn) => withOneTx(appPool, fn),
    });

    expect(summary.considered).toBe(3);
    expect(summary.embedded).toBe(3);
    expect(summary.skippedEmpty).toBe(0);
    expect(summary.previousSpace).toBeNull();
    expect(summary.previousConflicting).toBe(0);
    expect(summary.newSpace).toBe(embedder.space);
    expect(summary.newModel).toBe(embedder.model);

    const { rows } = await appPool.query<{
      id: string;
      embedding: string;
      embedding_model: string;
      embedding_revision: string;
      embedding_space: string;
    }>(
      `SELECT id, embedding::text AS embedding, embedding_model, embedding_revision, embedding_space
       FROM cases WHERE id = ANY($1) ORDER BY created_at, id`,
      [[a, b, c]],
    );
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.embedding_model).toBe(embedder.model);
      expect(row.embedding_revision).toBe(embedder.revision);
      expect(row.embedding_space).toBe(embedder.space);
      // The vector column comes back as `[v0,v1,…]` text; it must be 384 finite numbers.
      const m = row.embedding.match(/^\[([-\d.,eE]+)\]$/);
      expect(m, `vector repr: ${arrRepr(row.embedding)}`).not.toBeNull();
      const parts = m![1]!.split(",");
      expect(parts).toHaveLength(EMBEDDING_DIM);
      for (const p of parts) {
        const n = Number(p);
        expect(Number.isFinite(n)).toBe(true);
      }
    }
  });

  it("leaves redacted rows alone", async () => {
    const live = await seedMissing();
    const dead = await seedRedacted();

    const summary = await reembedAll(appPool, createFakeEmbedder(), {
      withTransaction: (fn) => withOneTx(appPool, fn),
    });

    expect(summary.considered).toBeGreaterThanOrEqual(1);
    // The dead row must NEVER be reported as considered (the SELECT filters
    // `anonymised_at IS NULL`).
    const included = (await appPool.query<{ id: string }>(
      `SELECT id FROM cases WHERE id = $1`,
      [dead],
    )).rows;
    expect(included).toHaveLength(1);
    // And its embedding columns must still be NULL after the reembed.
    const { rows } = await appPool.query<{
      embedding: string | null;
      embedding_model: string | null;
    }>(
      `SELECT embedding::text AS embedding, embedding_model FROM cases WHERE id = $1`,
      [dead],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.embedding).toBeNull();
    expect(rows[0]!.embedding_model).toBeNull();

    // The live row IS embedded in this run.
    const liveRow = (
      await appPool.query<{ embedding_model: string | null }>(
        `SELECT embedding_model FROM cases WHERE id = $1`,
        [live],
      )
    ).rows[0]!;
    expect(liveRow.embedding_model).not.toBeNull();
  });

  it("TC-059: a row in another space is rewritten with the new one", async () => {
    const a = await seedMissing();
    const b = await seedMissing();

    // Pre-set row b's embedding_space to a STALE value so the run has to
    // rewrite the whole table (TC-059: "rewrite all rows in one transaction
    // or abort untouched"). We keep the model and revision columns
    // populated so the existing CHECK constraint is satisfied. We run the
    // UPDATE through the OWNER connection (not appPool) so it commits
    // independently of the reembed transaction and is visible to reembedAll
    // — fixture setup must always go through the owner per AGENTS.md.
    const staleSpace = "model=old;dtype=fp32;pool=mean;normalize=true;query=\"query: \";passage=\"passage: \"";
    await asFixtureOwner(async (c) => {
      await asReplica(c, () =>
        c.query(
          `UPDATE cases SET embedding = $1::vector, embedding_model = 'old', embedding_revision = 'old-rev', embedding_space = $2 WHERE id = $3`,
          [`[${Array(EMBEDDING_DIM).fill(0.01).join(",")}]`, staleSpace, b],
        ),
      );
    });

    const embedder = createFakeEmbedder();
    const summary = await reembedAll(appPool, embedder, {
      withTransaction: (fn) => withOneTx(appPool, fn),
    });

    // Both rows were considered; at least one was already in a different
    // space. We do NOT assert `previousSpace === staleSpace` because earlier
    // tests in this file may have left rows in embedder.space that come
    // before `b` in the SELECT order — the signal we actually want is that
    // `b` (and the rest of the table) got rewritten.
    expect(summary.considered).toBeGreaterThanOrEqual(2);
    expect(summary.previousConflicting).toBeGreaterThanOrEqual(1);

    // After the run, NO row may still carry the stale space.
    const stale = await appPool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM cases WHERE embedding_space = $1`,
      [staleSpace],
    );
    expect(stale.rows[0]!.count).toBe("0");

    // The row that was in the stale space MUST now be in the new space —
    // this is the load-bearing assertion that the rewrite happened for THIS
    // row specifically (not just for some other row).
    const { rows } = await appPool.query<{ id: string; embedding_space: string }>(
      `SELECT id, embedding_space FROM cases WHERE id = ANY($1)`,
      [[a, b]],
    );
    expect(rows).toHaveLength(2);
    const bRow = rows.find((r) => r.id === b)!;
    expect(bRow.embedding_space).toBe(embedder.space);
    // And so must `a`: TC-059 forbids mixed spaces at the end.
    const aRow = rows.find((r) => r.id === a)!;
    expect(aRow.embedding_space).toBe(embedder.space);
    // summary.counts are still reliable: 2 embedded, 0 skipped empty.
    expect(summary.embedded).toBeGreaterThanOrEqual(2);
  });

  it("skippedEmpty counts rows whose body is empty and keeps their embedding NULL", async () => {
    // One row has no embeddable structured fields at all, so its canonical
    // text is just the prefix. SECURITY HARDENING (P3-024): a bare-prefix
    // vector would be generic and identical across rows, so we MUST NOT
    // embed it. The fix: skip the UPDATE; the row keeps `embedding=NULL`
    // (the schema CHECK `embedding IS NULL OR (embedding_model IS NOT
    // NULL AND ...)` is satisfied) and the summary records the count.
    //
    // The cases table requires a non-redacted row to carry at least
    // place_text (cases_check10: anonymised_at IS NOT NULL OR (place_text
    // IS NOT NULL AND length(place_text) >= 1 ...)). We satisfy the
    // schema CHECK with a whitespace-only place_text (raw length > 0),
    // while `structuredCaseText`'s `pick` trims whitespace and treats the
    // field as empty. That gives us a prefix-only canonical text without
    // bypassing any constraint.
    const emptyId = await asFixtureOwner(async (c) => {
      const ref = `M-${randomUUID().slice(0, 6).toUpperCase()}`;
      const session = (
        await c.query<{ id: string }>("INSERT INTO parent_sessions DEFAULT VALUES RETURNING id")
      ).rows[0]!.id;
      const at = new Date(Date.now() - 86400_000).toISOString();
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO cases (ref_code, kind, status, source, is_synthetic, reporter_session_id,
                            client_submission_id, submission_payload_hash, sex, event_at,
                            event_at_lower, event_at_upper, place_text, district_code, contact_phone,
                            provenance, age_min, age_max)
         VALUES ($1, 'missing', 'submitted', 'parent', true, $2, $3, $4, 'female', $5, $5, $5,
                 $6, $7, $8, '{}'::jsonb, 7, 7)
         RETURNING id`,
        [
          ref,
          session,
          randomUUID(),
          randomBytes(32).toString("hex"),
          at,
          "   ", // whitespace-only: passes length>=1 CHECK, trims to empty in `pick`.
          MOCK_DISTRICT,
          fakePhone(),
        ],
      );
      return rows[0]!.id;
    });
    expect(emptyId).toBeTruthy();

    const summary = await reembedAll(appPool, createFakeEmbedder(), {
      withTransaction: (fn) => withOneTx(appPool, fn),
    });
    expect(summary.skippedEmpty).toBeGreaterThanOrEqual(1);

    // The skipped row MUST keep embedding=NULL and embedding_model=NULL —
    // we MUST NOT have written a bare-prefix vector. The schema CHECK
    // permits this (embedding IS NULL OR (embedding_model IS NOT NULL
    // AND ...)).
    const { rows } = await appPool.query<{
      embedding: string | null;
      embedding_model: string | null;
      embedding_revision: string | null;
      embedding_space: string | null;
    }>(
      `SELECT embedding::text AS embedding, embedding_model, embedding_revision, embedding_space
       FROM cases WHERE id = $1`,
      [emptyId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.embedding).toBeNull();
    expect(rows[0]!.embedding_model).toBeNull();
    expect(rows[0]!.embedding_revision).toBeNull();
    expect(rows[0]!.embedding_space).toBeNull();
  });

  it("two distinct rows produce two distinct vectors (FakeEmbedder is content-aware)", async () => {
    const x = await seedMissing();
    const y = await seedMissing();
    const embedder = createFakeEmbedder();
    await reembedAll(appPool, embedder, {
      withTransaction: (fn) => withOneTx(appPool, fn),
    });
    const { rows } = await appPool.query<{ id: string; embedding: string }>(
      `SELECT id, embedding::text AS embedding FROM cases WHERE id = ANY($1)`,
      [[x, y]],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]!.embedding).not.toEqual(rows[1]!.embedding);
  });

  it("rejects an embedder with the wrong dimension before reading rows (TC-059 fast-path)", async () => {
    const wrongDim = createFakeEmbedder({ dimension: 16 });
    // The dimension check is the first thing reembedAll does, so even an
    // empty table would short-circuit.
    await expect(
      reembedAll(appPool, wrongDim, {
        withTransaction: (fn) => withOneTx(appPool, fn),
      }),
    ).rejects.toThrow(/dimension 16/);
    // The summary is not returned, so the table has not been touched.
  });

  it("reuses an existing embedding_space; previousSpace is recorded, conflicts=0", async () => {
    // Run the reembed twice with the same FakeEmbedder. The second run
    // must see rows already in its space and not count them as conflicts.
    const embedder = createFakeEmbedder();
    await reembedAll(appPool, embedder, {
      withTransaction: (fn) => withOneTx(appPool, fn),
    });
    const summary = await reembedAll(appPool, embedder, {
      withTransaction: (fn) => withOneTx(appPool, fn),
    });
    expect(summary.previousSpace).toBe(embedder.space);
    // existing rows in the matching space are NOT counted as conflicts
    expect(summary.previousConflicting).toBe(0);
    expect(summary.newSpace).toBe(embedder.space);
    // The space tag must mention every component that distinguishes it
    // (defence against a "space = just the model name" regression).
    // The fake embedder pins its own revision (fake-rev-1) so the
    // canonical space string must include it, not the production
    // EMBEDDING.revision. Reading embedder.revision keeps the test in
    // sync with the actual injected embedder.
    expect(embedder.space).toBe(
      makeEmbeddingSpace({
        model: embedder.model,
        revision: embedder.revision,
        dtype: "fake",
        pooling: "mean",
        normalize: true,
        queryPrefix: "query: ",
        passagePrefix: "passage: ",
      }),
    );
  });
});
