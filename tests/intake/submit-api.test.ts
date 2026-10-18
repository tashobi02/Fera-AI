// TASK-022 / API-003: exercise the exported route with the real case service and
// scripted PostgreSQL fakes (FR-031; BR-004/024; TC-004/016/030/031).
import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/cases/route";
import { ApiError } from "@/app/api/_shared";
import { createMissingRequestSchema, createMissingResponseSchema, errorEnvelopeSchema } from "@/contracts";
import { IDS, exampleCreateMissingRequest, exampleMissingRow } from "@/contracts/examples";
import { submissionPayloadHash, type CaseRow } from "@/contracts/server";
import { defaultAuth } from "@/server/auth/default";
import { cookieNames, signParentToken } from "@/server/auth/tokens";
import { setPoolForTests } from "@/server/db/pool";
import { fakeResolver, jsonPost, noParams } from "../api/fakes";
import { fakeAuth, KEYS } from "../auth/fakes";
import { fakePool, pgError } from "../case/fakes";
import { testParent, testUser } from "../support/principals";
import * as postcommit from "@/server/case/postcommit";

const parent = testParent(IDS.parentSession);
const requestBody = () => ({
  draft: structuredClone(exampleCreateMissingRequest.draft),
  confirmed: true as const,
  client_submission_id: IDS.missingSubmission,
});
const requestHash = () => submissionPayloadHash(createMissingRequestSchema.parse(requestBody()).draft);

function installDb(opts: { existing?: boolean; hash?: string; status?: CaseRow["status"]; matchingState?: CaseRow["matching_state"]; failOpen?: boolean; failAudit?: boolean } = {}) {
  let exists = opts.existing ?? false;
  let failOpen = opts.failOpen ?? false;
  let row: CaseRow = {
    ...exampleMissingRow,
    status: opts.status ?? (exists ? "open" : "submitted"),
    matching_state: opts.matchingState ?? "queued",
    matched_at: null,
    submission_payload_hash: opts.hash ?? requestHash(),
  };
  const db = fakePool([
    { match: /FROM cases WHERE reporter_session_id = \$1 AND client_submission_id = \$2/, reply: () => exists ? [row] : [] },
    { match: /^INSERT INTO cases/, reply: () => { exists = true; return [row]; } },
    { match: /FROM cases WHERE id = \$1/, reply: () => exists ? [row] : [] },
    { match: /^UPDATE cases SET status/, reply: (values) => {
      if (failOpen) { failOpen = false; return pgError("58000"); }
      row = { ...row, status: values[1] as CaseRow["status"] };
      return [row];
    } },
    { match: /^INSERT INTO audit_log/, reply: () => opts.failAudit ? pgError("42501") : [{ id: "1" }] },
  ]);
  // The denial hook uses pool.query rather than a service transaction.
  setPoolForTests({ ...db.pool, query: async (text: string, values: unknown[] = []) => {
    const client = await db.pool.connect();
    try { return await client.query(text, values); } finally { client.release(); }
  } } as unknown as Pool);
  return db;
}

const actions = (db: ReturnType<typeof installDb>) => db.sent(/^INSERT INTO audit_log/).map((q) => q.values[3]);
const submit = (body: unknown = requestBody(), headers: Record<string, string> = {}) => POST(jsonPost("/api/cases", body, headers), noParams);
const errorId = async (response: Response) => errorEnvelopeSchema.parse(await response.json()).error.id;

describe("API-003 missing-report submission (TASK-022)", () => {
  beforeEach(() => {
    vi.spyOn(postcommit, "fireMatcherPostcommit").mockResolvedValue({ caseId: IDS.missingCase, state: "queued", candidates: [], considered: 0, abstained: false });
    vi.spyOn(defaultAuth(), "resolvePrincipal").mockImplementation(fakeResolver(parent));
  });
  afterEach(() => {
    setPoolForTests(null);
    vi.restoreAllMocks();
  });

  it("returns 201 and a strict owner DTO only after create → open, carrying the request ID into both audits", async () => {
    const db = installDb();
    const response = await submit();
    expect(response.status).toBe(201);
    const body = createMissingResponseSchema.parse(await response.json());
    expect(body).toMatchObject({ id: IDS.missingCase, ref_code: exampleMissingRow.ref_code, status: "open", replayed: false, is_synthetic: true, matching_state: "queued", outputs_available: [] });
    expect(body.draft?.child.name).toBe(exampleCreateMissingRequest.draft.child.name);
    expect(body).not.toHaveProperty("reporter_session_id");
    expect(body).not.toHaveProperty("submission_payload_hash");
    expect(body).not.toHaveProperty("candidates");
    expect(actions(db)).toEqual(["case.created", "case.state_changed"]);
    const audit = db.sent(/^INSERT INTO audit_log/);
    expect(audit.map((q) => q.values[7])).toEqual([response.headers.get("x-request-id"), response.headers.get("x-request-id")]);
    expect(audit.map((q) => q.values[0])).toEqual(["parent", "system"]);
    expect(db.sent(/^COMMIT$/).length).toBeGreaterThanOrEqual(2);
    expect(db.sent(/^COMMIT$/)).toHaveLength(db.sent(/^BEGIN$/).length);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("returns 200, replayed=true and the stable ref on an identical retry without another insert or state change", async () => {
    const db = installDb();
    const first = createMissingResponseSchema.parse(await (await submit()).json());
    const replay = await submit();
    expect(replay.status).toBe(200);
    const body = createMissingResponseSchema.parse(await replay.json());
    expect(body).toMatchObject({ id: first.id, ref_code: first.ref_code, replayed: true, status: "open" });
    expect(db.sent(/^INSERT INTO cases/)).toHaveLength(1);
    expect(db.sent(/^UPDATE cases/)).toHaveLength(1);
    expect(actions(db)).toEqual(["case.created", "case.state_changed", "case.submission_replayed"]);
  });

  it("returns E-006 for the same UUID with a changed payload and writes nothing", async () => {
    const db = installDb({ existing: true });
    const body = requestBody();
    body.draft.child.marks = "[MOCK] reviewed change";
    const response = await submit(body);
    expect(response.status).toBe(409);
    expect(await errorId(response)).toBe("E-006");
    expect(db.sent(/^(INSERT|UPDATE)/)).toHaveLength(0);
    expect(db.sent(/^ROLLBACK$/)).toHaveLength(1);
  });

  it("returns E-001 with the four TC-030 draft field paths and no values or writes", async () => {
    const db = installDb();
    const body = requestBody();
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const response = await submit({ ...body, draft: {
      ...body.draft,
      child: { ...body.draft.child, age_years: 19, age_min: null, age_max: null },
      event: { ...body.draft.event, at: future, at_lower: future, at_upper: future, district_code: "XYZ" },
      reporter: { ...body.draft.reporter, phone: "0171" },
    } });
    expect(response.status).toBe(400);
    const envelope = errorEnvelopeSchema.parse(await response.json());
    expect(envelope.error.id).toBe("E-001");
    expect(envelope.error.fields?.sort()).toEqual(["child.age_years", "event.at", "event.district_code", "reporter.phone"]);
    expect(db.calls).toHaveLength(0);
    expect(JSON.stringify(envelope)).not.toContain("XYZ");
  });

  it.each([undefined, false])("refuses confirmed=%s with E-001 before any database access", async (confirmed) => {
    const db = installDb();
    const response = await submit({ ...requestBody(), confirmed });
    expect(response.status).toBe(400);
    expect(await errorId(response)).toBe("E-001");
    expect(db.calls).toHaveLength(0);
  });

  it.each([
    testUser(IDS.staffUser, "staff"),
    testUser(IDS.officerUser, "officer", { verified: false }),
    testUser(IDS.officerUser, "officer", { verified: true }),
    testUser(IDS.adminUser, "admin"),
  ])("denies a non-parent principal with E-003 and audits only the denial ($kind)", async (principal) => {
    vi.mocked(defaultAuth().resolvePrincipal).mockImplementation(fakeResolver(principal));
    const db = installDb();
    const response = await submit();
    expect(response.status).toBe(403);
    expect(await errorId(response)).toBe("E-003");
    expect(db.sent(/\bcases\b/)).toHaveLength(0);
    expect(actions(db)).toEqual(["access.denied"]);
    expect(JSON.parse(String(db.sent(/^INSERT INTO audit_log/)[0].values[6]))).toEqual({ error_id: "E-003", api: "API-003" });
  });

  // OD-022-5: no parent cookie at all mints a session at submit (tested on PostgreSQL in
  // tests/db/submit.test.ts); a present but expired one is still refused here.
  it("an expired parent session gets the auth layer's E-002, clears the dead cookie and writes nothing", async () => {
    const { auth, store } = fakeAuth();
    vi.mocked(defaultAuth().resolvePrincipal).mockImplementation(auth.resolvePrincipal);
    const db = installDb();
    const session = store.addSession({ expiresInMs: -1 });
    // SYS-BUG-11: parent cookies are bound to a client fingerprint. In
    // tests the resolver sees no x-forwarded-for (null IP) and no UA
    // header (empty UA) → the live fingerprint is "null|". The cookie
    // is signed with the same value so verification succeeds.
    const headers: Record<string, string> = { cookie: `${cookieNames(false).parent}=${signParentToken(KEYS.parent, session.id, "null|")}` };
    const response = await submit(requestBody(), headers);
    expect(response.status).toBe(401);
    expect(await errorId(response)).toBe("E-002");
    expect(response.headers.get("set-cookie")).toMatch(/^fera_ps=; .*Max-Age=0/);
    expect(store.created).toBe(0);
    expect(db.calls).toHaveLength(0);
  });

  it("preserves a resolver's E-019 in the standard envelope", async () => {
    vi.mocked(defaultAuth().resolvePrincipal).mockRejectedValue(new ApiError("E-019"));
    const db = installDb();
    const response = await submit();
    expect(response.status).toBe(401);
    expect(await errorId(response)).toBe("E-019");
    expect(db.calls).toHaveLength(0);
  });

  it("accepts a schema-valid draft token but ignores it until the signer exists (OD-022-1)", async () => {
    // flip to verification when TASK-014/020 add the signer
    const db = installDb();
    const logLines: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => (logLines.push(String(chunk)), true));
    const token = exampleCreateMissingRequest.draft_token;
    const response = await submit({ ...requestBody(), draft_token: token });
    expect(response.status).toBe(201);
    const body = createMissingResponseSchema.parse(await response.json());
    expect(body).toMatchObject({ status: "open", replayed: false });
    expect(body).not.toHaveProperty("draft_token");
    expect(db.sent(/^INSERT INTO cases/)).toHaveLength(1);
    expect(JSON.stringify(db.calls)).not.toContain(token);

    const logEntries = logLines.flatMap((line) => line.split("\n")).flatMap((line) => {
      try { return [JSON.parse(line) as { event?: string; [key: string]: unknown }]; } catch { return []; }
    });
    const tokenEvents = logEntries.filter((entry) => entry.event === "submit.draft_token_unverified");
    expect(tokenEvents).toHaveLength(1);
    expect(tokenEvents[0]).toMatchObject({ route: "API-003", method: "POST", role: "parent" });
    expect(JSON.stringify(logLines)).not.toContain(token);
  });

  it("returns E-001 for a structurally invalid draft token before persistence", async () => {
    const db = installDb();
    const response = await submit({ ...requestBody(), draft_token: "invalid" });
    expect(response.status).toBe(400);
    expect(await errorId(response)).toBe("E-001");
    expect(db.calls).toHaveLength(0);
  });

  it.each(["queued", "running", "complete", "failed"] as const)("keeps the service's matching_state=%s on replay without starting matching", async (matchingState) => {
    const db = installDb({ existing: true, matchingState });
    const response = await submit();
    expect(response.status).toBe(200);
    expect(createMissingResponseSchema.parse(await response.json()).matching_state).toBe(matchingState);
    expect(db.sent(/^UPDATE/)).toHaveLength(0);
    expect(db.sent(/\b(embedding|match_candidates)\b/).filter((q) => !q.text.startsWith("SELECT"))).toHaveLength(0);
  });

  it("does not reopen a terminal case on replay or expose its locked draft", async () => {
    const db = installDb({ existing: true, status: "closed" });
    const response = await submit();
    expect(response.status).toBe(200);
    expect(createMissingResponseSchema.parse(await response.json())).toMatchObject({ status: "closed", draft: null, editable: false, replayed: true });
    expect(db.sent(/^UPDATE/)).toHaveLength(0);
  });

  it("ignores client-supplied authority and persists only server-derived ownership and synthetic status", async () => {
    const db = installDb();
    const response = await submit({ ...requestBody(), reporter_session_id: IDS.otherParentSession, role: "officer", is_synthetic: false, status: "confirmed" });
    expect(response.status).toBe(201);
    const [insert] = db.sent(/^INSERT INTO cases/);
    expect(insert.values.slice(1, 5)).toEqual(["missing", "submitted", "parent", IDS.parentSession]);
    expect(insert.text).toContain("true, $5");
  });

  it("awaits opening, answers E-021 on its failure, and recovers the committed submitted row on an identical retry", async () => {
    const db = installDb({ failOpen: true });
    const failure = await submit();
    expect(failure.status).toBe(500);
    expect(await errorId(failure)).toBe("E-021");
    const replay = await submit();
    expect(replay.status).toBe(200);
    expect(createMissingResponseSchema.parse(await replay.json())).toMatchObject({ status: "open", replayed: true });
    expect(db.sent(/^INSERT INTO cases/)).toHaveLength(1);
    expect(actions(db)).toEqual(["case.created", "case.submission_replayed", "case.state_changed"]);
  });

  it("fails closed with E-021 when the creation audit is unavailable", async () => {
    const db = installDb({ failAudit: true });
    const response = await submit();
    expect(response.status).toBe(500);
    expect(await errorId(response)).toBe("E-021");
    expect(db.sent(/^COMMIT$/)).toHaveLength(0);
    expect(db.sent(/^UPDATE cases/)).toHaveLength(0);
  });

  it("rejects a cross-origin submission before resolving the principal or accessing the database", async () => {
    const db = installDb();
    const response = await submit(requestBody(), { "sec-fetch-site": "cross-site", origin: "https://example.invalid" });
    expect(response.status).toBe(403);
    expect(await errorId(response)).toBe("E-003");
    expect(defaultAuth().resolvePrincipal).not.toHaveBeenCalled();
    expect(db.calls).toHaveLength(0);
  });
});
