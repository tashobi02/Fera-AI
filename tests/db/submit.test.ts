// TASK-022 / API-003 on PostgreSQL 16 as fera_app. The real exported route uses
// signed synthetic parent cookies, the database auth store and the case service.
// TC-004/030/031/042 and submission audit coverage from TC-016; synthetic only.
import { randomUUID } from "node:crypto";
import type { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/cases/route";
import { createMissingResponseSchema, errorEnvelopeSchema, type CreateMissingRequest } from "@/contracts";
import { exampleCreateMissingRequest } from "@/contracts/examples";
import { defaultAuth } from "@/server/auth/default";
import { createAuth } from "@/server/auth/session";
import { pgAuthStore } from "@/server/auth/store";
import { cookieNames, signParentToken, signSessionToken } from "@/server/auth/tokens";
import { setPoolForTests } from "@/server/db/pool";
import { jsonPost, noParams } from "../api/fakes";
import { KEYS, KEY_SOURCE } from "../auth/fakes";
import { MOCK_DISTRICT, connect, dbTestsEnabled, one, pool, seedReference } from "./support/db";

describe.skipIf(!dbTestsEnabled)("API-003 on PostgreSQL 16 (TASK-022)", () => {
  let admin: Client;
  let appClient: Client;
  let app: Pool;

  beforeAll(async () => {
    admin = await connect("admin");
    appClient = await connect("app");
    app = pool("app");
    setPoolForTests(app);
    await seedReference(admin);
    const auth = createAuth({ store: pgAuthStore(() => app), keys: KEY_SOURCE });
    vi.spyOn(defaultAuth(), "resolvePrincipal").mockImplementation(auth.resolvePrincipal);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    setPoolForTests(null);
    await Promise.all([admin?.end(), appClient?.end(), app?.end()]);
  });

  const newParent = async () => {
    const { id } = await one<{ id: string }>(appClient, "INSERT INTO parent_sessions DEFAULT VALUES RETURNING id");
    return { id, cookie: `${cookieNames(false).parent}=${signParentToken(KEYS.parent, id)}` };
  };
  const manualRequest = (): CreateMissingRequest => ({
    confirmed: true,
    client_submission_id: randomUUID(),
    draft: {
      ...structuredClone(exampleCreateMissingRequest.draft),
      source_text: "",
      evidence: {},
      child: { ...exampleCreateMissingRequest.draft.child, clothing: "[MOCK] reporter-reviewed clothing" },
      event: { ...exampleCreateMissingRequest.draft.event, district_text: null, district_code: MOCK_DISTRICT },
    },
  });
  const submit = (body: unknown, cookie?: string) => POST(jsonPost("/api/cases", body, cookie ? { cookie } : {}), noParams);
  const counts = () => one<{ cases: number; audit: number; candidates: number }>(appClient,
    `SELECT (SELECT count(*)::int FROM cases) AS cases,
            (SELECT count(*)::int FROM audit_log) AS audit,
            (SELECT count(*)::int FROM match_candidates) AS candidates`);
  const actionsFor = async (id: string) => (await appClient.query("SELECT action FROM audit_log WHERE case_id = $1 ORDER BY id", [id])).rows.map((row) => row.action);
  const errorId = async (response: Response) => errorEnvelopeSchema.parse(await response.json()).error.id;

  it("runs the submission commands as the restricted fera_app role", async () => {
    expect((await app.query<{ role: string }>("SELECT current_user AS role")).rows[0].role).toBe("fera_app");
  });

  it("stores nothing for unconfirmed review, then saves the edited manual values as open with create/state audit rows", async () => {
    const parent = await newParent();
    const body = manualRequest();
    const before = await counts();
    const refused = await submit({ ...body, confirmed: false }, parent.cookie);
    expect(refused.status).toBe(400);
    expect(await errorId(refused)).toBe("E-001");
    expect(await counts()).toEqual(before);

    const response = await submit(body, parent.cookie);
    expect(response.status).toBe(201);
    const view = createMissingResponseSchema.parse(await response.json());
    expect(view).toMatchObject({ status: "open", matching_state: "queued", replayed: false, outputs_available: [], is_synthetic: true });
    const stored = await one<{ status: string; reporter_session_id: string; clothing: string; is_synthetic: boolean; matching_state: string }>(appClient,
      "SELECT status, reporter_session_id, clothing, is_synthetic, matching_state FROM cases WHERE id = $1", [view.id]);
    expect(stored).toEqual({ status: "open", reporter_session_id: parent.id, clothing: body.draft.child.clothing, is_synthetic: true, matching_state: "queued" });
    expect(await actionsFor(view.id)).toEqual(["case.created", "case.state_changed"]);
    const audit = await appClient.query("SELECT actor_type, details, request_id FROM audit_log WHERE case_id = $1 ORDER BY id", [view.id]);
    expect(audit.rows).toEqual([
      { actor_type: "parent", details: { ref_code: view.ref_code, version: 1, to_status: "submitted", api: "API-003", replayed: false }, request_id: response.headers.get("x-request-id") },
      { actor_type: "system", details: { ref_code: view.ref_code, version: 1, from_status: "submitted", to_status: "open", api: "API-003" }, request_id: response.headers.get("x-request-id") },
    ]);
    expect(JSON.stringify(audit.rows)).not.toContain(body.draft.child.name);
    expect(JSON.stringify(audit.rows)).not.toContain(body.draft.reporter.phone);
    expect(JSON.stringify(audit.rows)).not.toContain(body.draft.child.clothing);
    expect((await counts()).candidates).toBe(before.candidates);
  });

  it("replays the identical UUID and payload as 200 with the same ref, one row and case.submission_replayed", async () => {
    const parent = await newParent();
    const body = manualRequest();
    const first = createMissingResponseSchema.parse(await (await submit(body, parent.cookie)).json());
    const response = await submit(body, parent.cookie);
    expect(response.status).toBe(200);
    expect(createMissingResponseSchema.parse(await response.json())).toMatchObject({ id: first.id, ref_code: first.ref_code, status: "open", replayed: true });
    expect((await one<{ n: number }>(appClient, "SELECT count(*)::int AS n FROM cases WHERE reporter_session_id = $1 AND client_submission_id = $2", [parent.id, body.client_submission_id])).n).toBe(1);
    expect(await actionsFor(first.id)).toEqual(["case.created", "case.state_changed", "case.submission_replayed"]);
  });

  it("serialises concurrent identical submissions into one 201 and one 200 with a stable reference (TC-031/042)", async () => {
    const parent = await newParent();
    const body = manualRequest();
    const responses = await Promise.all([submit(body, parent.cookie), submit(body, parent.cookie)]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
    const views = await Promise.all(responses.map(async (response) => createMissingResponseSchema.parse(await response.json())));
    expect(views[0].id).toBe(views[1].id);
    expect(views[0].ref_code).toBe(views[1].ref_code);
    expect(views.every((view) => view.status === "open")).toBe(true);
    expect(views.map((view) => view.replayed).sort()).toEqual([false, true]);
    expect((await one<{ n: number }>(appClient, "SELECT count(*)::int AS n FROM cases WHERE reporter_session_id = $1", [parent.id])).n).toBe(1);
    const actions = await actionsFor(views[0].id);
    expect(actions.filter((action) => action === "case.created")).toHaveLength(1);
    expect(actions.filter((action) => action === "case.state_changed")).toHaveLength(1);
    expect(actions.filter((action) => action === "case.submission_replayed")).toHaveLength(1);
  });

  it("refuses changed-payload replay with E-006 and leaves payload, versions and audit unchanged", async () => {
    const parent = await newParent();
    const body = manualRequest();
    const created = createMissingResponseSchema.parse(await (await submit(body, parent.cookie)).json());
    const before = await counts();
    const rowBefore = await one(appClient, "SELECT clothing, version, updated_at, submission_payload_hash FROM cases WHERE id = $1", [created.id]);
    const response = await submit({ ...body, draft: { ...body.draft, child: { ...body.draft.child, clothing: "[MOCK] conflicting reviewed clothing" } } }, parent.cookie);
    expect(response.status).toBe(409);
    expect(await errorId(response)).toBe("E-006");
    expect(await counts()).toEqual(before);
    expect(await one(appClient, "SELECT clothing, version, updated_at, submission_payload_hash FROM cases WHERE id = $1", [created.id])).toEqual(rowBefore);
  });

  it.each(["missing confirmation", "invalid draft"])("writes nothing on refusal: %s", async (refusal) => {
    const parent = await newParent();
    const body = manualRequest();
    const before = await counts();
    const refusedBody = refusal === "missing confirmation" ? { ...body, confirmed: undefined }
      : { ...body, draft: { ...body.draft, reporter: { ...body.draft.reporter, phone: "0171" } } };
    const response = await submit(refusedBody, parent.cookie);
    expect(response.status).toBe(400);
    expect(await errorId(response)).toBe("E-001");
    expect(await counts()).toEqual(before);
  });

  it("accepts a schema-valid draft token but ignores it until the signer exists", async () => {
    // flip to verification when TASK-014/020 add the signer
    const parent = await newParent();
    const token = exampleCreateMissingRequest.draft_token;
    const before = await counts();
    const response = await submit({ ...manualRequest(), draft_token: token }, parent.cookie);
    expect(response.status).toBe(201);
    const view = createMissingResponseSchema.parse(await response.json());
    expect(view).toMatchObject({ status: "open", replayed: false, is_synthetic: true });
    expect(view).not.toHaveProperty("draft_token");
    expect(await counts()).toEqual({ ...before, cases: before.cases + 1, audit: before.audit + 2 });
    expect(await actionsFor(view.id)).toEqual(["case.created", "case.state_changed"]);
    const audit = await appClient.query("SELECT details FROM audit_log WHERE case_id = $1 ORDER BY id", [view.id]);
    expect(JSON.stringify(audit.rows)).not.toContain(token);
  });

  // OD-022-5 (Mahim, 2026-10-17): a browser with no parent cookie gets one new
  // anonymous session at submit (S-005 manual form; S-002 before API-001/002 exist).
  it("mints one parent session for a browser with no parent cookie, owns the case by it, and replays with it", async () => {
    const before = await counts();
    const sessionsBefore = await one<{ n: number }>(appClient, "SELECT count(*)::int AS n FROM parent_sessions");
    const body = manualRequest();
    const response = await submit(body);
    expect(response.status).toBe(201);
    const created = createMissingResponseSchema.parse(await response.json());
    const setCookie = response.headers.getSetCookie();
    expect(setCookie).toHaveLength(1);
    expect(setCookie[0]).toMatch(new RegExp(`^${cookieNames(false).parent}=p1\\.`));
    expect((await one<{ n: number }>(appClient, "SELECT count(*)::int AS n FROM parent_sessions")).n).toBe(sessionsBefore.n + 1);
    const owner = await one<{ reporter_session_id: string }>(appClient, "SELECT reporter_session_id FROM cases WHERE id = $1", [created.id]);
    const { id: newest } = await one<{ id: string }>(appClient, "SELECT id FROM parent_sessions ORDER BY created_at DESC, id DESC LIMIT 1");
    expect(owner.reporter_session_id).toBe(newest);
    expect((await counts()).cases).toBe(before.cases + 1);
    // The same browser (now carrying the cookie) replays the same report, no new session.
    const cookie = setCookie[0]!.split(";")[0]!;
    const replay = await submit(body, cookie);
    expect(replay.status).toBe(200);
    expect(createMissingResponseSchema.parse(await replay.json()).ref_code).toBe(created.ref_code);
    expect((await one<{ n: number }>(appClient, "SELECT count(*)::int AS n FROM parent_sessions")).n).toBe(sessionsBefore.n + 1);
  });

  it("does not replace a present but expired parent session: E-002, no new session, nothing stored", async () => {
    const { id } = await one<{ id: string }>(appClient, "INSERT INTO parent_sessions (created_at, expires_at) VALUES (now() - interval '31 days', now() - interval '1 minute') RETURNING id");
    const before = await counts();
    const sessionsBefore = await one(appClient, "SELECT count(*)::int AS n FROM parent_sessions");
    const response = await submit(manualRequest(), `${cookieNames(false).parent}=${signParentToken(KEYS.parent, id)}`);
    expect(response.status).toBe(401);
    expect(await errorId(response)).toBe("E-002");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await counts()).toEqual(before);
    expect(await one(appClient, "SELECT count(*)::int AS n FROM parent_sessions")).toEqual(sessionsBefore);
  });

  it("denies a credential principal with E-003 and writes only the safe access.denied audit", async () => {
    const user = await one<{ id: string }>(admin,
      "INSERT INTO users (username, display_name, password_hash, role) VALUES ($1, '[MOCK] submit staff', 'synthetic-not-a-hash', 'staff') RETURNING id", [`submit.${randomUUID().slice(0, 8)}`]);
    const cookie = `${cookieNames(false).session}=${signSessionToken(KEYS.session, user.id, "synthetic-not-a-hash", Date.now()).token}`;
    const before = await counts();
    const response = await submit(manualRequest(), cookie);
    expect(response.status).toBe(403);
    expect(await errorId(response)).toBe("E-003");
    expect(await counts()).toEqual({ ...before, audit: before.audit + 1 });
    expect((await one<{ details: unknown }>(appClient, "SELECT details FROM audit_log WHERE actor_user_id = $1", [user.id])).details).toEqual({ error_id: "E-003", api: "API-003" });
  });
});
