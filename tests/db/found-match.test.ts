// TASK-026 / TASK-028 on PostgreSQL 16 as fera_app: found-child log idempotency, candidate
// read visibility, contact_viewed atomicity, snapshot consistency and decision staleness
// (TC-008/010/011). Synthetic data only. Runs under `npm run test:db`; skipped otherwise.
import { randomUUID } from "node:crypto";
import type { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiError } from "@/app/api/_shared";
import { createFoundRequestSchema, createMissingRequestSchema, decisionRequestSchema } from "@/contracts";
import { exampleConfirmDecisionRequest, exampleCreateFoundRequest, exampleCreateMissingRequest } from "@/contracts/examples";
import type { Principal } from "@/contracts/server";
import { createMissingCase, decideCandidate, editMissingCase, openCase } from "@/server/case";
import { setPoolForTests } from "@/server/db/pool";
import { logFoundCase } from "@/server/found/log-found";
import { readCandidate, type CandidateReadDeps } from "@/server/matching/candidate-read";
import { testParent, testUser } from "../support/principals";
import { MOCK_DISTRICT, createActors, connect, dbTestsEnabled, fakePhone, one, pool, seedReference, addCandidate, insertFound, type Actors } from "./support/db";

describe.skipIf(!dbTestsEnabled)("found log and match read on PostgreSQL 16 (TASK-026, TASK-028)", () => {
  let admin: Client;
  let appClient: Client;
  let app: Pool;
  let app2: Pool;
  let actors: Actors;
  let officer: Principal;
  let staff: Principal;
  const ctx = () => ({ pool: app });
  const REQ_OK = randomUUID();
  const REQ_FAIL = randomUUID();

  beforeAll(async () => {
    admin = await connect("admin");
    appClient = await connect("app");
    app = pool("app");
    app2 = pool("app");
    setPoolForTests(app);
    await seedReference(admin);
    actors = await createActors(admin);
    officer = testUser(actors.officer, "officer", { verified: true });
    staff = testUser(actors.staff, "staff");
  });

  afterAll(async () => {
    setPoolForTests(null);
    await Promise.all([admin?.end(), appClient?.end(), app?.end(), app2?.end()]);
  });

  const foundRequest = () =>
    createFoundRequestSchema.parse({
      ...exampleCreateFoundRequest,
      client_submission_id: randomUUID(),
      draft: {
        ...exampleCreateFoundRequest.draft,
        event: { ...exampleCreateFoundRequest.draft.event, district_code: MOCK_DISTRICT },
        reporter: { ...exampleCreateFoundRequest.draft.reporter, phone: fakePhone() },
      },
    });

  const missingRequest = () =>
    createMissingRequestSchema.parse({
      ...exampleCreateMissingRequest,
      client_submission_id: randomUUID(),
      draft: {
        ...exampleCreateMissingRequest.draft,
        event: { ...exampleCreateMissingRequest.draft.event, district_code: MOCK_DISTRICT },
        reporter: { ...exampleCreateMissingRequest.draft.reporter, phone: fakePhone() },
      },
    });

  // A live pending candidate: a service-created open missing report plus a found report.
  const pair = async () => {
    const parentId = (await one<{ id: string }>(appClient, "INSERT INTO parent_sessions DEFAULT VALUES RETURNING id")).id;
    const parent = testParent(parentId);
    const req = missingRequest();
    const created = await createMissingCase(parent, req, ctx());
    await openCase(parent, created.case.id, ctx());
    const found = await insertFound(appClient, actors.staff);
    const candidateId = await addCandidate(appClient, created.case.id, found.id);
    return { parent, req, missingId: created.case.id, foundId: found.id, candidateId };
  };

  const errorId = async (work: Promise<unknown>) =>
    work.then(
      () => null,
      (e: unknown) => (e instanceof ApiError ? e.id : String(e)),
    );

  it("logFoundCase stores one found case for the same client_submission_id and reports the replay (TC-008)", async () => {
    const req = foundRequest();
    const first = await logFoundCase(staff, req, ctx());
    const again = await logFoundCase(staff, req, ctx());
    expect(first.replayed).toBe(false);
    expect(again).toMatchObject({ id: first.id, ref_code: first.ref_code, replayed: true });
    expect((await one<{ n: number }>(appClient, "SELECT count(*)::int AS n FROM cases WHERE client_submission_id = $1", [req.client_submission_id])).n).toBe(1);
  });

  it("readCandidate is hidden for an unverified officer, a staff user, a parent and a malformed id", async () => {
    const { candidateId } = await pair();
    const before = (await one<{ n: number }>(appClient, "SELECT count(*)::int AS n FROM audit_log WHERE action = 'case.contact_viewed'")).n;
    expect(await readCandidate(testUser(actors.unverifiedOfficer, "officer"), candidateId, {}, undefined)).toEqual({ kind: "hidden", caseId: null });
    expect(await readCandidate(staff, candidateId)).toEqual({ kind: "hidden", caseId: null });
    expect(await readCandidate(testParent(randomUUID()), candidateId)).toEqual({ kind: "hidden", caseId: null });
    expect(await readCandidate(officer, "not-a-uuid")).toEqual({ kind: "hidden", caseId: null });
    expect(await readCandidate(officer, randomUUID(), { pool: app })).toEqual({ kind: "hidden", caseId: null });
    expect((await one<{ n: number }>(appClient, "SELECT count(*)::int AS n FROM audit_log WHERE action = 'case.contact_viewed'")).n).toBe(before);
  });

  it("serves the raw phones and writes case.contact_viewed for both reports in the same transaction", async () => {
    const { candidateId, missingId, foundId } = await pair();
    const r = await readCandidate(officer, candidateId, { pool: app, requestId: REQ_OK });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.view).toMatchObject({ qualified: true, identity_probability: false });
    const rows = await appClient.query("SELECT case_id FROM audit_log WHERE action = 'case.contact_viewed' AND request_id = $1", [REQ_OK]);
    expect(rows.rows.map((x) => x.case_id).sort()).toEqual([missingId, foundId].sort());
  });

  it("fails the read when the contact_viewed audit insert fails, and nothing is written", async () => {
    const { candidateId } = await pair();
    await admin.query(`CREATE FUNCTION pg_temp_fail_contact() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action = 'case.contact_viewed' THEN RAISE EXCEPTION 'forced audit failure'; END IF; RETURN NEW; END $$`);
    await admin.query("CREATE TRIGGER fail_contact BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION pg_temp_fail_contact()");
    try {
      await expect(readCandidate(officer, candidateId, { pool: app, requestId: REQ_FAIL, attempts: 1 })).rejects.toBeDefined();
    } finally {
      await admin.query("DROP TRIGGER fail_contact ON audit_log");
      await admin.query("DROP FUNCTION pg_temp_fail_contact()");
    }
    expect((await one<{ n: number }>(appClient, "SELECT count(*)::int AS n FROM audit_log WHERE request_id = $1", [REQ_FAIL])).n).toBe(0);
  });

  it("never serves a stale qualified candidate when the missing report changes between its reads (one snapshot, then retry)", async () => {
    const { parent, req, missingId, candidateId } = await pair();
    let edited = false;
    const deps: CandidateReadDeps = {
      withTransaction: (fn, opts) =>
        import("@/server/case/internal").then(({ withTransaction }) =>
          withTransaction(async (client) => {
            const original = client.query.bind(client) as (...args: unknown[]) => Promise<unknown>;
            (client as { query: unknown }).query = async (...args: unknown[]) => {
              const out = await original(...args);
              if (!edited && /FROM cases WHERE id/.test(String(args[0]))) {
                edited = true;
                await editMissingCase(parent, missingId, {
                  draft: { ...req.draft, child: { ...req.draft.child, marks: "[MOCK] changed between reads" } },
                  confirmed: true,
                  expected_version: 1,
                }, { pool: app2 });
              }
              return out;
            };
            return fn(client);
          }, opts),
        ),
    };
    const r = await readCandidate(officer, candidateId, { pool: app }, deps);
    expect(edited).toBe(true);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    // Read committed would serve the candidate row read before the edit (pending) next to the
    // pre-edit missing row as qualified. Under one snapshot the audit insert meets the concurrent
    // update (40001), the transaction retries and the officer sees the edited report, no longer qualified.
    expect(r.view.qualified).toBe(false);
    expect(r.view.missing.version).toBe(2);
  });

  it("refuses a decision with E-005 when the missing report changed after the candidate was read", async () => {
    const { parent, req, missingId, candidateId } = await pair();
    const r = await readCandidate(officer, candidateId, { pool: app });
    expect(r.kind === "ok" && r.view.qualified).toBe(true);
    await editMissingCase(parent, missingId, {
      draft: { ...req.draft, child: { ...req.draft.child, marks: "[MOCK] changed after the read" } },
      confirmed: true,
      expected_version: 1,
    }, { pool: app2 });
    const decision = decisionRequestSchema.parse({ ...exampleConfirmDecisionRequest, expected_missing_version: 1, expected_found_version: 1 });
    expect(await errorId(decideCandidate(officer, candidateId, decision, ctx()))).toBe("E-005");
    const state = await one<{ status: string }>(appClient, "SELECT status FROM match_candidates WHERE id = $1", [candidateId]);
    expect(state.status).not.toBe("confirmed");
  });
});
