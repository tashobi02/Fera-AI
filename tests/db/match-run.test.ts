// P3-040 matcher-run acceptance on PostgreSQL 16 as fera_app. Synthetic fixtures only.
import { randomUUID } from "node:crypto";
import type { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMissingRequestSchema, decisionRequestSchema } from "@/contracts";
import { exampleCreateMissingRequest, exampleRejectDecisionRequest } from "@/contracts/examples";
import { createFakeEmbedder, EMBEDDING_DIM, type Embedder } from "@/server/embeddings/model";
import { createMissingCase, decideCandidate, editMissingCase, openCase } from "@/server/case";
import { withTransaction } from "@/server/case/internal";
import { setPoolForTests } from "@/server/db/pool";
import { runMatcherForCase } from "@/server/matching/run";
import { testParent, testUser } from "../support/principals";
import { connect, createActors, dbTestsEnabled, fakePhone, insertFound, one, pool, seedReference, type Actors } from "./support/db";

describe.skipIf(!dbTestsEnabled)("P3-040 matcher run on PostgreSQL 16", () => {
  let admin: Client;
  let appClient: Client;
  let app: Pool;
  let app2: Pool;
  let actors: Actors;
  let officer: ReturnType<typeof testUser>;

  beforeAll(async () => {
    admin = await connect("admin");
    appClient = await connect("app");
    app = pool("app");
    app2 = pool("app");
    setPoolForTests(app);
    await seedReference(admin);
    actors = await createActors(admin);
    officer = testUser(actors.officer, "officer", { verified: true });
  });

  afterAll(async () => {
    setPoolForTests(null);
    await Promise.all([admin?.end(), appClient?.end(), app?.end(), app2?.end()]);
  });

  const constantEmbedder = (): Embedder => {
    const base = createFakeEmbedder({ space: "synthetic-space" });
    return {
      ...base,
      async embed(texts) {
        return texts.map(() => {
          const vector = new Float32Array(EMBEDDING_DIM);
          vector[0] = 1;
          return vector;
        });
      },
    };
  };

  const setSyntheticVector = async (caseId: string, space = "synthetic-space") => {
    const vectorParts = new Array<string>(EMBEDDING_DIM).fill("0");
    vectorParts[0] = "1";
    const vector = `[${vectorParts.join(",")}]`;
    await app.query(
      `UPDATE cases SET embedding = $1::vector, embedding_model = 'multilingual-e5-small',
         embedding_revision = 'synthetic-rev', embedding_space = $2 WHERE id = $3`,
      [vector, space, caseId],
    );
  };

  const newOpenMissing = async (opts: { unmatchedByTime?: boolean } = {}) => {
    const session = await one<{ id: string }>(appClient, "INSERT INTO parent_sessions DEFAULT VALUES RETURNING id");
    const principal = testParent(session.id);
    const ordinaryEvent = exampleCreateMissingRequest.draft.event;
    const recentAt = new Date(Date.now() - 5 * 60_000).toISOString();
    const request = createMissingRequestSchema.parse({
      ...exampleCreateMissingRequest,
      client_submission_id: randomUUID(),
      draft: {
        ...exampleCreateMissingRequest.draft,
        event: {
          ...ordinaryEvent,
          district_code: 1,
          ...(opts.unmatchedByTime ? { at: recentAt, at_approx: false, at_lower: recentAt, at_upper: recentAt } : {}),
        },
        reporter: { ...exampleCreateMissingRequest.draft.reporter, phone: fakePhone() },
      },
    });
    const created = await createMissingCase(principal, request, { pool: app });
    await openCase(principal, created.case.id, { pool: app });
    return { id: created.case.id, principal, request };
  };

  const pair = async () => {
    const missing = await newOpenMissing();
    const found = await insertFound(appClient, actors.staff);
    await setSyntheticVector(found.id);
    return { missing, found };
  };

  it("writes one qualified pair at current versions under the endpoint lock set", async () => {
    const { missing, found } = await pair();
    const result = await runMatcherForCase(missing.id, { embedder: constantEmbedder(), api: "API-014", pool: app });
    expect(result).toMatchObject({ state: "complete", considered: 1, abstained: false });
    expect(result.candidates).toHaveLength(1);
    const candidate = await one<{ missing_version: number; found_version: number; status: string; rank: number }>(
      appClient,
      "SELECT missing_version, found_version, status, rank FROM match_candidates WHERE missing_case_id = $1 AND found_case_id = $2",
      [missing.id, found.id],
    );
    expect(candidate).toEqual({ missing_version: 1, found_version: 1, status: "pending", rank: 1 });
  });

  it("does not resuggest a rejected pair at the same versions", async () => {
    const { missing, found } = await pair();
    const first = await runMatcherForCase(missing.id, { embedder: constantEmbedder(), api: "API-014", pool: app });
    const { id: candidateId } = await one<{ id: string }>(appClient,
      "SELECT id FROM match_candidates WHERE missing_case_id = $1 AND found_case_id = $2 AND missing_version = 1 AND found_version = 1",
      [missing.id, found.id]);
    expect(first.candidates.some((candidate) => candidate.id === candidateId)).toBe(true);
    await decideCandidate(officer, candidateId, decisionRequestSchema.parse({
      ...exampleRejectDecisionRequest,
      expected_missing_version: 1,
      expected_found_version: 1,
    }), { pool: app });

    const second = await runMatcherForCase(missing.id, { embedder: constantEmbedder(), api: "API-014", pool: app });
    expect(second.state).toBe("complete");
    expect(second.candidates.some((candidate) => candidate.id === candidateId)).toBe(false);
    expect((await one<{ status: string; count: number }>(appClient,
      `SELECT status, (SELECT count(*)::int FROM match_candidates
         WHERE missing_case_id = $1 AND found_case_id = $2) AS count
       FROM match_candidates WHERE missing_case_id = $1 AND found_case_id = $2`, [missing.id, found.id]))).toEqual({ status: "rejected", count: 1 });
  });

  it("rechecks the missing version after a concurrent edit before inserting a candidate", async () => {
    const { missing, found } = await pair();
    const { id: missingId, principal: parent, request } = missing;
    const originalWithTransaction = withTransaction;
    let edited = false;
    const runWithRace: typeof withTransaction = (fn, txOpts) => originalWithTransaction(async (client) => {
      const target = client as unknown as { query: typeof client.query };
      const originalQuery = client.query.bind(client);
      target.query = (async (...args: Parameters<typeof client.query>) => {
        const out = await originalQuery(...args);
        if (!edited && String(args[0]).includes("WITH missing AS")) {
          edited = true;
          await editMissingCase(parent, missingId, {
            draft: { ...request.draft, child: { ...request.draft.child, marks: "[MOCK] changed in match version race" } },
            confirmed: true,
            expected_version: 1,
          }, { pool: app2 });
        }
        return out;
      }) as typeof client.query;
      try {
        return await fn(client);
      } finally {
        target.query = originalQuery as typeof client.query;
      }
    }, txOpts);
    const embedder: Embedder = { ...constantEmbedder(), space: "race-space" };
    await setSyntheticVector(found.id, "race-space");
    const result = await runMatcherForCase(missingId, {
      embedder,
      api: "API-014",
      pool: app,
      withTransaction: runWithRace,
    });
    expect(edited).toBe(true);
    expect(result.state).toBe("complete");
    expect((await one<{ missing_version: number; found_version: number }>(appClient,
      "SELECT missing_version, found_version FROM match_candidates WHERE missing_case_id = $1 AND found_case_id = $2",
      [missingId, found.id]))).toEqual({ missing_version: 2, found_version: 1 });
  });

  it("completes an empty shortlist and records model failure without losing the case", async () => {
    // All fixture found reports are dated one day earlier, so this current-time
    // missing report has a genuinely empty eligible shortlist even after earlier
    // tests created their found rows in the same isolated database.
    const empty = await newOpenMissing({ unmatchedByTime: true });
    const abstain = await runMatcherForCase(empty.id, { embedder: constantEmbedder(), api: "API-014", pool: app });
    expect(abstain).toMatchObject({ state: "complete", candidates: [], considered: 0, abstained: true });
    expect((await one<{ matching_state: string; matched_at: Date | null }>(appClient,
      "SELECT matching_state, matched_at FROM cases WHERE id = $1", [empty.id])).matching_state).toBe("complete");

    const failedCase = await newOpenMissing();
    const failed = await runMatcherForCase(failedCase.id, {
      embedder: createFakeEmbedder({ dimension: 16 }),
      api: "API-014",
      pool: app,
    });
    expect(failed).toMatchObject({ state: "failed", errorId: "E-021" });
    expect(await one<{ status: string; matching_state: string; match_error_id: string }>(appClient,
      "SELECT status, matching_state, match_error_id FROM cases WHERE id = $1", [failedCase.id])).toEqual({
      status: "open",
      matching_state: "failed",
      match_error_id: "E-021",
    });
  });
});
