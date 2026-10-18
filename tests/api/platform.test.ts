// TASK-007 shared API layer through the route composer (COMP-004/021): envelope,
// request ID, input helpers, role guard and denial audit, per-role DTO fail-closed,
// cookies, rate limits, no-store and logging.
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import * as contracts from "@/contracts";
import {
  CLIENT_ONLY_ERROR_IDS,
  ERROR_CATALOGUE,
  ERROR_IDS,
  LIMITS,
  caseKindSchema,
  createMissingRequestSchema,
  errorEnvelopeSchema,
  healthResponseSchema,
  phoneSchema,
  uuidSchema,
  type ServerErrorId,
} from "@/contracts";
import { canIntake, type Principal } from "@/contracts/server";
import { IDS, PRINCIPALS, exampleCreateMissingRequest, exampleMissingDraft } from "@/contracts/examples";
import {
  ApiError,
  MemoryRateLimitStore,
  RATE_LIMITS,
  RateLimiter,
  Reply,
  createRouteFactory,
  errorResponse,
  isStrictResponseSchema,
  type RateLimitStore,
} from "@/app/api/_shared";
import { testUser } from "../support/principals";
import { ORIGIN, captureLogs, get, jsonPost, noParams, reachCounter, sameOriginHeaders, testFactory } from "./fakes";

// This suite tests route composition; readiness probes have their own injected
// unit suite and offline model/DB integration checks. Do not depend on a local cache.
vi.mock("@/server/health/readiness", () => ({
  createHealthReadiness: () => async () => ({ db: "unavailable", embeddings: "unavailable" }),
}));

const RID = "0b9f6a1e-3c4d-4e5f-8a7b-9c0d1e2f3a4b";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Synthetic sensitive-looking values; none may appear in a response body or log line.
const NAME = "রাফি হাসান";
const PHONE = "01712345678";
const TOKEN = "tok_ZXhhbXBsZS1zZWNyZXQtdG9rZW4";

const SERVER_IDS = ERROR_IDS.filter((id) => !(CLIENT_ONLY_ERROR_IDS as readonly string[]).includes(id)) as ServerErrorId[];
const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);
const okSchema = z.strictObject({ ok: z.literal(true) });
const ok = async () => ({ ok: true as const });
const inactiveOfficer = testUser(IDS.officerUser, "officer", { verified: true, isActive: false });
const unverifiedOfficer = testUser(IDS.officerUser, "officer", { verified: false });

async function expectError(res: Response, id: ServerErrorId) {
  expect(res.status).toBe(ERROR_CATALOGUE[id].http);
  const body = await res.json();
  expect(errorEnvelopeSchema.parse(body).error.id).toBe(id);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(res.headers.get("x-request-id")).toMatch(UUID);
  return body;
}

describe("error envelope responses (D2A §5.2, D2B §13)", () => {
  it.each(SERVER_IDS.filter((id) => id !== "E-007").map((id) => [id]))("%s has the catalogue HTTP status and bilingual envelope", async (id) => {
    const { response, id: resolved } = errorResponse(RID, new ApiError(id));
    expect(resolved).toBe(id);
    const body = await expectError(response, id);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("x-request-id")).toBe(RID);
    expect(Object.keys(body)).toEqual(["error"]);
    expect(body.error.message_bn).toBe(ERROR_CATALOGUE[id].bn);
    expect(body.error.message_en).toBe(ERROR_CATALOGUE[id].en);
  });

  it("E-007 fills seconds (Bangla numerals in message_bn) and sets Retry-After", async () => {
    const { response } = errorResponse(RID, new ApiError("E-007", { seconds: 42 }));
    const body = await expectError(response, "E-007");
    expect(response.headers.get("retry-after")).toBe("42");
    expect(body.error.message_bn).toBe("৪২ সেকেন্ড পরে আবার চেষ্টা করুন।");
    expect(body.error.message_en).toBe("Please try again in 42 seconds.");
  });

  it("E-007 without valid seconds falls back to E-021 and reports the original ID", async () => {
    const result = errorResponse(RID, new ApiError("E-007" as ServerErrorId));
    expect(result).toMatchObject({ id: "E-021", fallbackFrom: "E-007" });
    await expectError(result.response, "E-021");
    expect(result.response.headers.get("retry-after")).toBeNull();
  });

  it.each(CLIENT_ONLY_ERROR_IDS.map((id) => [id]))("client-only %s is never emitted; it becomes E-021", async (id) => {
    // @ts-expect-error client-only IDs are not ServerErrorId
    const result = errorResponse(RID, new ApiError(id));
    expect(result.fallbackFrom).toBe(id);
    await expectError(result.response, "E-021");
  });

  it("uses a static E-021 body if building any envelope throws", async () => {
    const result = errorResponse(RID, new ApiError("E-005"), () => {
      throw new Error("boom");
    });
    expect(result).toMatchObject({ id: "E-021", fallbackFrom: "E-005" });
    await expectError(result.response, "E-021");
  });

  it("ApiError carries only its ID as message", () => {
    expect(new ApiError("E-004", { caseId: IDS.missingCase }).message).toBe("E-004");
  });

  it("logs envelope.fallback with the original error ID through a route", async () => {
    const { defineRoute, logs } = testFactory(PRINCIPALS.officer);
    const route = defineRoute({
      api: "API-022",
      response: okSchema,
      handler: async () => {
        throw new ApiError("E-007" as ServerErrorId);
      },
    });
    await expectError(await route(get("/api/x"), noParams), "E-021");
    expect(logs.parsed()).toContainEqual(expect.objectContaining({ event: "envelope.fallback", original_error_id: "E-007", error_id: "E-021" }));
    expect(logs.parsed().at(-1)).toMatchObject({ event: "request", error_id: "E-021", status: 500 });
  });
});

describe("request ID (D2A §5.1)", () => {
  const { defineRoute, logs } = testFactory(null);
  const route = defineRoute({ api: "API-019", response: okSchema, handler: ok });

  it("is always generated by the server; a valid client UUID is only logged separately", async () => {
    const res = await route(get("/api/x", { "x-request-id": RID.toUpperCase() }), noParams);
    const id = res.headers.get("x-request-id");
    expect(id).toMatch(UUID);
    expect(id).not.toBe(RID);
    expect(logs.parsed().at(-1)).toMatchObject({ request_id: id, client_request_id: RID });
  });

  // Non-hex probes: a random server request ID can contain any short hex run (e.g. "abc").
  it.each([["not-a-uuid"], [PHONE], ["<script>alert(1)</script>"], [`${RID} extra`], ["x".repeat(500)]])("does not log unsafe client ID %s", async (bad) => {
    const res = await route(get("/api/x", { "x-request-id": bad }), noParams);
    expect(res.headers.get("x-request-id")).toMatch(UUID);
    expect(logs.parsed().at(-1).client_request_id).toBeUndefined();
    for (const line of logs.lines) expect(line).not.toContain(bad);
  });

  it("differs per request", async () => {
    const a = (await route(get("/api/x"), noParams)).headers.get("x-request-id");
    const b = (await route(get("/api/x"), noParams)).headers.get("x-request-id");
    expect(a).not.toBe(b);
  });
});

describe("JSON body helper", () => {
  const bodySchema = z.object({ name: z.string().max(5), phone: phoneSchema });
  const { defineRoute, logs } = testFactory(PRINCIPALS.staff);
  const route = defineRoute({
    api: "API-007",
    body: bodySchema,
    response: z.strictObject({ phone: z.string() }),
    handler: async ({ body }) => ({ phone: body.phone }),
  });
  const lastRequest = () => logs.parsed().filter((l) => l.event === "request").at(-1);

  it("accepts a valid body, normalises it and strips unknown keys", async () => {
    const res = await route(jsonPost("/api/x", { name: "রাফি", phone: "০১৭১২৩৪৫৬৭৮", owner: "x" }), noParams);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ phone: PHONE });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("schema failure is E-001: no echoed values or Zod messages", async () => {
    const res = await route(jsonPost("/api/x", { name: NAME, phone: "12345", token: TOKEN }), noParams);
    const text = JSON.stringify(await expectError(res, "E-001"));
    for (const leak of [NAME, "12345", TOKEN, "Too big", "Invalid"]) expect(text).not.toContain(leak);
    for (const line of logs.lines) for (const leak of [NAME, "12345", TOKEN]) expect(line).not.toContain(leak);
    expect(lastRequest()).toMatchObject({ error_id: "E-001", reason: "schema", stage: "input", level: 40 });
  });

  it("malformed JSON → E-001 (reason json) without echoing input", async () => {
    const raw = `{"name": "${NAME}", "phone": "${PHONE}",`;
    const text = JSON.stringify(await expectError(await route(jsonPost("/api/x", raw), noParams), "E-001"));
    expect(text).not.toContain(PHONE);
    expect(text).not.toContain(NAME);
    expect(text).not.toMatch(/JSON|Unexpected|position/);
    expect(lastRequest().reason).toBe("json");
  });

  it.each([["text/plain"], ["application/x-www-form-urlencoded"], ["application/json; charset=latin1"], [""]])("content-type %j → E-001", async (ct) => {
    await expectError(await route(jsonPost("/api/x", { name: "a", phone: PHONE }, { "content-type": ct }), noParams), "E-001");
    expect(lastRequest().reason).toBe("content_type");
  });

  it("accepts application/json with utf-8 charset", async () => {
    const res = await route(jsonPost("/api/x", { name: "a", phone: PHONE }, { "content-type": "application/json; charset=UTF-8" }), noParams);
    expect(res.status).toBe(200);
  });

  it("declared Content-Length over 64 KiB → E-001 before reading", async () => {
    const req = jsonPost("/api/x", { name: "a", phone: PHONE }, { "content-length": String(64 * 1024 + 1) });
    await expectError(await route(req, noParams), "E-001");
    expect(lastRequest().reason).toBe("too_large");
  });

  const streamed = (chunks: (Uint8Array | Error)[]) =>
    new Request(`${ORIGIN}/api/x`, {
      method: "POST",
      headers: { "content-type": "application/json", ...sameOriginHeaders },
      body: new ReadableStream({
        start(c) {
          for (const chunk of chunks) {
            if (chunk instanceof Error) c.error(chunk);
            else c.enqueue(chunk);
          }
          if (!chunks.some((x) => x instanceof Error)) c.close();
        },
      }),
      duplex: "half",
    } as RequestInit);

  it("streamed body over 64 KiB without Content-Length → E-001", async () => {
    const big = JSON.stringify({ name: "a", phone: PHONE, pad: "x".repeat(64 * 1024) });
    await expectError(await route(streamed([new TextEncoder().encode(big)]), noParams), "E-001");
  });

  it("a client abort mid-stream is E-001 (reason abort, warn), not E-021", async () => {
    await expectError(await route(streamed([new TextEncoder().encode('{"name":'), new Error("aborted")]), noParams), "E-001");
    expect(lastRequest()).toMatchObject({ reason: "abort", stage: "input", level: 40 });
  });

  it("a body exactly at the limit is read", async () => {
    const base = JSON.stringify({ name: "a", phone: PHONE, pad: "" });
    const body = JSON.stringify({ name: "a", phone: PHONE, pad: "x".repeat(64 * 1024 - base.length) });
    expect(new TextEncoder().encode(body).byteLength).toBe(64 * 1024);
    expect((await route(jsonPost("/api/x", body), noParams)).status).toBe(200);
  });

  it("invalid UTF-8 and empty bodies → E-001", async () => {
    const bad = new Request(`${ORIGIN}/api/x`, {
      method: "POST",
      headers: { "content-type": "application/json", ...sameOriginHeaders },
      body: new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]),
    });
    await expectError(await route(bad, noParams), "E-001");
    expect(lastRequest().reason).toBe("utf8");
    await expectError(await route(jsonPost("/api/x", ""), noParams), "E-001");
  });

  it("maxBodyBytes raises the cap per route (API-015 import)", async () => {
    const { defineRoute: d } = testFactory(PRINCIPALS.admin);
    const spec = { body: z.object({ pad: z.string() }), response: okSchema, handler: ok };
    const importRoute = d({ api: "API-015", maxBodyBytes: LIMITS.importBodyBytes, ...spec });
    const defaultRoute = d({ api: "API-015", ...spec });
    const body = { pad: "x".repeat(100 * 1024) };
    expect((await importRoute(jsonPost("/api/x", body), noParams)).status).toBe(200);
    await expectError(await defaultRoute(jsonPost("/api/x", body), noParams), "E-001");
  });
});

describe("E-001 field paths (D6 TC-030, CN-15)", () => {
  const { defineRoute } = testFactory(PRINCIPALS.parent);
  const route = defineRoute({ api: "API-003", body: createMissingRequestSchema, response: okSchema, handler: ok });

  it("returns the four invalid draft paths and no values or messages", async () => {
    const future = "2099-01-01T10:00:00+06:00";
    const bad = {
      ...exampleCreateMissingRequest,
      draft: {
        ...exampleMissingDraft,
        child: { ...exampleMissingDraft.child, age_years: 19, age_min: null, age_max: null },
        event: { ...exampleMissingDraft.event, at: future, at_lower: future, at_upper: future, at_approx: false, district_code: "XYZ" },
        reporter: { ...exampleMissingDraft.reporter, phone: "0171" },
      },
    };
    const body = await expectError(await route(jsonPost("/api/x", bad), noParams), "E-001");
    expect(body.error.fields).toEqual(["child.age_years", "event.at", "event.district_code", "reporter.phone"]);
    // Checked on the envelope's error object only, never on a random request ID.
    const text = JSON.stringify(body.error);
    for (const leak of ["0171", "XYZ", "2099", "Too big", "Invalid"]) expect(text).not.toContain(leak);
  });

  it("non-draft failures carry no fields", async () => {
    const body = await expectError(await route(jsonPost("/api/x", { confirmed: false }), noParams), "E-001");
    expect(body.error.fields).toBeUndefined();
  });
});

describe("query and route params", () => {
  const { defineRoute } = testFactory(PRINCIPALS.officer);
  const route = defineRoute({
    api: "API-009",
    params: z.object({ id: uuidSchema }),
    query: z.object({ limit: z.string().regex(/^\d+$/).transform(Number).optional() }),
    response: z.strictObject({ id: z.string(), limit: z.number().nullable(), keys: z.array(z.string()) }),
    handler: async ({ params, query }) => ({ id: params.id, limit: query.limit ?? null, keys: Object.keys(query) }),
  });
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it("parses valid params and query", async () => {
    const res = await route(get("/api/x?limit=5"), ctx(RID));
    expect(await res.json()).toEqual({ id: RID, limit: 5, keys: ["limit"] });
  });

  // D2A §5.5 dynamic segments: `:id` (cases, candidates, users, duplicates) and `:caseId` (API-014).
  it.each([
    ["id", "API-004"],
    ["caseId", "API-014"],
  ] as const)("validates the %s segment (%s)", async (name, api) => {
    const r = testFactory(PRINCIPALS.officer).defineRoute({
      api,
      params: z.object({ [name]: uuidSchema }),
      response: z.strictObject({ value: z.string() }),
      handler: async ({ params }) => ({ value: (params as Record<string, string>)[name] }),
    });
    const res = await r(get("/api/x"), { params: Promise.resolve({ [name]: RID.toUpperCase() }) });
    expect(await res.json()).toEqual({ value: RID });
    await expectError(await r(get("/api/x"), { params: Promise.resolve({ [name]: "nope" }) }), "E-001");
    await expectError(await r(get("/api/x"), { params: Promise.resolve({}) }), "E-001");
  });

  it("invalid param → E-001", async () => {
    await expectError(await route(get("/api/x"), ctx("not-a-uuid")), "E-001");
  });

  it("invalid or repeated query key → E-001", async () => {
    await expectError(await route(get("/api/x?limit=0x1A"), ctx(RID)), "E-001");
    await expectError(await route(get("/api/x?limit=1&limit=2"), ctx(RID)), "E-001");
  });

  it("__proto__ is an ordinary key: repeated → E-001, single → stripped without pollution", async () => {
    await expectError(await route(get("/api/x?__proto__=a&__proto__=b"), ctx(RID)), "E-001");
    const res = await route(get("/api/x?__proto__=a&limit=2"), ctx(RID));
    expect(await res.json()).toEqual({ id: RID, limit: 2, keys: ["limit"] });
    expect(({} as Record<string, unknown>).a).toBeUndefined();
  });
});

describe("role guard (D2A §5.3, §9.2; BR-024)", () => {
  const officerOnly = (p: Principal | null) => {
    const f = testFactory(p);
    return { ...f, route: f.defineRoute({ api: "API-008", response: okSchema, handler: ok }) };
  };

  it.each([
    ["no session", null],
    ["inactive officer", inactiveOfficer],
  ] as const)("%s → E-002, not audited", async (_l, p) => {
    const { route, audit } = officerOnly(p);
    await expectError(await route(get("/api/x"), noParams), "E-002");
    expect(audit).toHaveLength(0);
  });

  it("logs auth.principal_invalid when a principal has no effective role", async () => {
    const { route, logs } = officerOnly(inactiveOfficer);
    await route(get("/api/x"), noParams);
    expect(logs.parsed().some((l) => l.event === "auth.principal_invalid" && l.level === 40)).toBe(true);
  });

  it.each([
    ["parent", PRINCIPALS.parent],
    ["staff", PRINCIPALS.staff],
    ["unverified officer", unverifiedOfficer],
    ["admin", PRINCIPALS.admin],
  ] as const)("%s on an officer-only list route → E-003 with access.denied audit", async (_l, p) => {
    const { route, audit } = officerOnly(p);
    await expectError(await route(get("/api/x"), noParams), "E-003");
    expect(audit).toEqual([expect.objectContaining({ api: "API-008", errorId: "E-003", reason: "role", caseId: null })]);
  });

  it("verified active officer passes", async () => {
    const { route, audit } = officerOnly(PRINCIPALS.officer);
    const res = await route(get("/api/x"), noParams);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(audit).toHaveLength(0);
  });

  it("public routes skip the resolver", async () => {
    let called = 0;
    const { defineRoute } = testFactory(null, { resolvePrincipal: async () => (called++, null) });
    const route = defineRoute({ api: "API-019", response: okSchema, handler: ok });
    expect((await route(get("/api/x"), noParams)).status).toBe(200);
    expect(called).toBe(0);
  });

  it("resolver gets the request, API ID and cookie jar", async () => {
    const seen: string[] = [];
    const { defineRoute } = testFactory(null, {
      resolvePrincipal: async ({ req, api, cookies }) => {
        seen.push(api, new URL(req.url).pathname, typeof cookies.set);
        return PRINCIPALS.parent;
      },
    });
    await defineRoute({ api: "API-018", response: okSchema, handler: ok })(get("/api/my-case"), noParams);
    expect(seen).toEqual(["API-018", "/api/my-case", "function"]);
  });

  it("resolver ApiError (E-019) passes through; other resolver errors are E-021 at stage resolver", async () => {
    const expired = testFactory(null, { resolvePrincipal: async () => Promise.reject(new ApiError("E-019")) });
    const broken = testFactory(null, { resolvePrincipal: async () => Promise.reject(new Error(`db down for ${PHONE}`)) });
    const spec = { api: "API-018" as const, response: okSchema, handler: ok };
    await expectError(await expired.defineRoute(spec)(get("/api/x"), noParams), "E-019");
    const text = JSON.stringify(await expectError(await broken.defineRoute(spec)(get("/api/x"), noParams), "E-021"));
    expect(text).not.toContain(PHONE);
    expect(broken.logs.parsed()).toContainEqual(expect.objectContaining({ event: "handler.threw", stage: "resolver", err_name: "Error" }));
    expect(broken.logs.parsed().at(-1)).toMatchObject({ reason: "resolver", stage: "resolver" });
    for (const line of broken.logs.lines) expect(line).not.toContain(PHONE);
  });

  it("non-public handlers receive a non-null principal and role (compile-time)", () => {
    const { defineRoute } = testFactory(PRINCIPALS.officer);
    defineRoute({
      api: "API-008",
      response: z.strictObject({ kind: z.string(), role: z.string() }),
      handler: async ({ principal, role }) => ({ kind: principal.kind, role }),
    });
    defineRoute({
      api: "API-019",
      response: z.strictObject({ kind: z.string() }),
      // @ts-expect-error public routes may have no principal
      handler: async ({ principal }) => ({ kind: principal.kind }),
    });
  });

  describe("authorize hook with canIntake (API-002)", () => {
    const intake = (p: Principal) =>
      testFactory(p).defineRoute({
        api: "API-002",
        body: z.object({ kind: caseKindSchema }),
        authorize: (principal, { body }) => canIntake(principal, body.kind),
        response: okSchema,
        handler: ok,
      });

    it.each([
      ["parent", PRINCIPALS.parent, "missing", 200],
      ["parent", PRINCIPALS.parent, "found", 403],
      ["staff", PRINCIPALS.staff, "found", 200],
      ["staff", PRINCIPALS.staff, "missing", 403],
      ["officer", PRINCIPALS.officer, "missing", 403],
    ] as const)("%s intake %s → %i", async (_l, p, kind, status) => {
      expect((await intake(p)(jsonPost("/api/x", { kind }), noParams)).status).toBe(status);
    });
  });
});

describe("record routes deny with E-004 and audit (D2A API-009, D6 TC-022/052, D2B E-004)", () => {
  const candidateRoute = (p: Principal, auditDenied?: () => Promise<void>) => {
    const reach = reachCounter();
    const f = testFactory(p, auditDenied ? { auditDenied } : {});
    const route = f.defineRoute({
      api: "API-009",
      params: z.object({ id: uuidSchema }).refine(() => reach.mark("parse")),
      authorize: () => reach.mark("authorize"),
      response: okSchema,
      handler: async () => (reach.mark("handler"), { ok: true as const }),
    });
    return { ...f, route, hits: reach.hits };
  };
  const ctx = { params: Promise.resolve({ id: IDS.candidate }) };

  it.each([
    ["parent", PRINCIPALS.parent],
    ["staff", PRINCIPALS.staff],
    ["unverified officer", unverifiedOfficer],
    ["admin", PRINCIPALS.admin],
  ] as const)("%s → 404 E-004, audited, input/authorize/handler not reached", async (_l, p) => {
    const { route, audit, hits } = candidateRoute(p);
    const body = await expectError(await route(get("/api/candidates/x"), ctx), "E-004");
    expect(body.error.message_en).toBe(ERROR_CATALOGUE["E-004"].en);
    expect(audit).toEqual([expect.objectContaining({ api: "API-009", errorId: "E-004", reason: "role", caseId: null, principal: p })]);
    expect(audit[0].requestId).toMatch(UUID);
    expect(hits).toEqual({ parse: 0, authorize: 0, handler: 0 });
  });

  it("a hidden record (handler E-004) is audited with its case ID and looks identical to an absent one", async () => {
    const { defineRoute, audit } = testFactory(PRINCIPALS.officer);
    const route = (caseId?: string) =>
      defineRoute({
        api: "API-004",
        response: okSchema,
        handler: async () => {
          throw new ApiError("E-004", { caseId });
        },
      });
    const hidden = await expectError(await route(IDS.missingCase.toUpperCase())(get("/api/x"), noParams), "E-004");
    const absent = await expectError(await route()(get("/api/x"), noParams), "E-004");
    expect(hidden).toEqual(absent);
    expect(audit.map((a) => a.caseId)).toEqual([IDS.missingCase, null]);
  });

  it("an invalid caseId never reaches the audit", async () => {
    const { defineRoute, audit } = testFactory(PRINCIPALS.officer);
    const route = defineRoute({
      api: "API-004",
      response: okSchema,
      handler: async () => {
        throw new ApiError("E-004", { caseId: PHONE });
      },
    });
    await expectError(await route(get("/api/x"), noParams), "E-004");
    expect(audit[0].caseId).toBeNull();
  });

  it("authorize failure on a record route is E-004 with reason authorize", async () => {
    const { defineRoute, audit } = testFactory(PRINCIPALS.officer);
    const route = defineRoute({ api: "API-010", body: z.object({}), authorize: () => false, response: okSchema, handler: ok });
    await expectError(await route(jsonPost("/api/x", {}), noParams), "E-004");
    expect(audit).toEqual([expect.objectContaining({ errorId: "E-004", reason: "authorize" })]);
  });

  it("an audit failure fails closed with E-021 and logs audit.unavailable", async () => {
    const { route, logs, hits } = candidateRoute(PRINCIPALS.staff, () => Promise.reject(new Error(`audit ${PHONE}`)));
    await expectError(await route(get("/api/x"), ctx), "E-021");
    expect(logs.parsed()).toContainEqual(expect.objectContaining({ event: "audit.unavailable", level: 50, original_error_id: "E-004" }));
    expect(logs.parsed().at(-1)).toMatchObject({ error_id: "E-021", reason: "audit", stage: "audit" });
    expect(hits.handler).toBe(0);
    for (const line of logs.lines) expect(line).not.toContain(PHONE);
  });

  it("with no audit dependency (until TASK-015) a signed-in denial is E-021, never silently skipped", async () => {
    const logs = captureLogs();
    const defineRoute = createRouteFactory({ resolvePrincipal: async () => PRINCIPALS.staff, logger: logs.logger, preAuthLimit: null });
    await expectError(await defineRoute({ api: "API-009", response: okSchema, handler: ok })(get("/api/x"), noParams), "E-021");
    expect(logs.parsed()).toContainEqual(expect.objectContaining({ event: "audit.unavailable", err_name: "AuditUnavailableError" }));
  });

  it("record routes cannot opt into E-003", () => {
    const { defineRoute } = testFactory(PRINCIPALS.officer);
    expect(() => defineRoute({ api: "API-011", deny: "E-003", response: okSchema, handler: ok })).toThrow(/E-004/);
  });

  it("a non-record route may deny with E-004", async () => {
    const { defineRoute } = testFactory(PRINCIPALS.staff);
    await expectError(await defineRoute({ api: "API-017", deny: "E-004", response: okSchema, handler: ok })(jsonPost("/api/x", {}), noParams), "E-004");
  });
});

describe("same-origin state changes (D2A §9.4, D2B §10.1 CSRF)", () => {
  const reach = reachCounter();
  const { defineRoute } = testFactory(PRINCIPALS.staff, { preAuthLimit: RATE_LIMITS.preAuthNetwork });
  const route = defineRoute({ api: "API-007", body: z.object({}), response: okSchema, handler: async () => (reach.mark("handler"), { ok: true as const }) });
  const send = (method: string, headers: Record<string, string>) =>
    new Request(`${ORIGIN}/api/x`, {
      method,
      headers: { "content-type": "application/json", ...headers },
      body: SAFE.has(method) ? undefined : "{}",
    });

  it.each([
    ["cross-site fetch", { host: "fera.test", "sec-fetch-site": "cross-site" }],
    ["same-site subdomain", { host: "fera.test", "sec-fetch-site": "same-site" }],
    ["foreign Origin", { host: "fera.test", origin: "https://evil.example" }],
    ["same host, other scheme", { host: "fera.test", origin: "https://fera.test" }],
    ["no Origin or Sec-Fetch-Site", { host: "fera.test" }],
  ])("%s → E-003 before anything else runs", async (_l, headers) => {
    const before = reach.hits.handler;
    await expectError(await route(send("POST", headers), noParams), "E-003");
    expect(reach.hits.handler).toBe(before);
  });

  it.each([
    ["Sec-Fetch-Site same-origin", { host: "fera.test", "sec-fetch-site": "same-origin" }],
    ["matching Origin and scheme", { host: "fera.test", origin: ORIGIN }],
  ])("%s passes", async (_l, headers) => {
    expect((await route(send("POST", headers), noParams)).status).toBe(200);
  });

  it.each([["HEAD"], ["OPTIONS"], ["GET"]])("%s skips the same-origin check", async (method) => {
    const { defineRoute: d } = testFactory(PRINCIPALS.staff);
    const r = d({ api: "API-007", response: okSchema, handler: ok });
    expect((await r(send(method, { host: "fera.test", origin: "https://evil.example" }), noParams)).status).toBe(200);
  });
});

describe("per-role DTO allowlist: response schemas fail closed", () => {
  const dto = z.strictObject({ ref_code: z.string() });

  it("a raw row with extra keys becomes E-021, logs safe issue tokens and leaks nothing", async () => {
    const { defineRoute, logs } = testFactory(PRINCIPALS.officer);
    const route = defineRoute({
      api: "API-022",
      response: dto,
      // Simulates a handler returning a raw row instead of a projection.
      handler: async () => ({ ref_code: "M-ABC123", child_name: NAME, contact_phone: PHONE }) as unknown as { ref_code: string },
    });
    const text = JSON.stringify(await expectError(await route(get("/api/x"), noParams), "E-021"));
    for (const leak of [NAME, PHONE, "M-ABC123"]) expect(text).not.toContain(leak);
    const invalid = logs.parsed().find((l) => l.event === "response.invalid");
    expect(invalid.issues).toEqual([{ code: "unrecognized_keys", path: "" }]);
    for (const line of logs.lines) for (const leak of [NAME, PHONE, "M-ABC123"]) expect(line).not.toContain(leak);
  });

  it("per-role schemas: each role gets its own DTO; a role without a schema is E-021", async () => {
    const officerDto = z.strictObject({ view: z.literal("officer"), score: z.number() });
    const adminDto = z.strictObject({ view: z.literal("admin") });
    const route = (p: Principal) =>
      testFactory(p).defineRoute({
        api: "API-013",
        response: { officer: officerDto, admin: adminDto },
        // Always returns the officer shape, so the admin schema must reject it.
        handler: async () => ({ view: "officer" as const, score: 87 }),
      });
    expect(await (await route(PRINCIPALS.officer)(get("/api/x"), noParams)).json()).toEqual({ view: "officer", score: 87 });
    await expectError(await route(PRINCIPALS.admin)(get("/api/x"), noParams), "E-021");
    const staffOnly = testFactory(PRINCIPALS.staff).defineRoute({ api: "API-007", response: { officer: officerDto }, handler: async () => ({ view: "officer" as const, score: 1 }) });
    await expectError(await staffOnly(get("/api/x"), noParams), "E-021");
  });

  it.each([
    ["z.object (strips)", z.object({ a: z.string() })],
    ["z.looseObject", z.looseObject({ a: z.string() })],
    ["transform pipe", z.strictObject({ a: z.string() }).transform((v) => v)],
    ["array", z.array(z.strictObject({ a: z.string() }))],
    ["union with a non-strict member", z.union([z.strictObject({ a: z.string() }), z.object({ b: z.string() })])],
  ])("rejects a non-strict response schema at definition: %s", (_l, schema) => {
    const { defineRoute } = testFactory(PRINCIPALS.officer);
    expect(() => defineRoute({ api: "API-022", response: schema as z.ZodType, handler: async () => ({}) as never })).toThrow(/strict/);
    expect(() => defineRoute({ api: "API-022", response: { officer: schema as z.ZodType }, handler: async () => ({}) as never })).toThrow(/strict/);
  });

  it("every contracts response and view schema is strict", () => {
    const schemas = Object.entries(contracts).filter(([k]) => /(Response|View)Schema$/.test(k));
    expect(schemas.length).toBeGreaterThan(20);
    for (const [name, schema] of schemas) expect([name, isStrictResponseSchema(schema as z.ZodType)]).toEqual([name, true]);
  });

  it("sends the parsed output, not the handler's object", async () => {
    const { defineRoute } = testFactory(PRINCIPALS.officer);
    const route = defineRoute({ api: "API-022", response: z.strictObject({ id: uuidSchema }), handler: async () => ({ id: RID.toUpperCase() }) });
    expect(await (await route(get("/api/x"), noParams)).json()).toEqual({ id: RID });
  });

  it("a thrown error becomes a generic E-021; logs name, code and top frame only", async () => {
    const { defineRoute, logs } = testFactory(PRINCIPALS.officer);
    const route = defineRoute({
      api: "API-022",
      response: dto,
      handler: async () => {
        throw Object.assign(new TypeError(`cannot read ${NAME} ${PHONE}`), { code: "23505" });
      },
    });
    const text = JSON.stringify(await expectError(await route(get("/api/x"), noParams), "E-021"));
    for (const leak of [NAME, PHONE, "TypeError", "cannot read", "at "]) expect(text).not.toContain(leak);
    const threw = logs.parsed().find((l) => l.event === "handler.threw");
    expect(threw).toMatchObject({ err_name: "TypeError", err_code: "23505", error_id: "E-021", stage: "handler", level: 50 });
    expect(threw.err_frame).toMatch(/^platform\.test\.ts:\d+$/);
    for (const line of logs.lines) for (const leak of [NAME, PHONE, "cannot read"]) expect(line).not.toContain(leak);
  });

  it("spec.status and Reply set the success status; Reply headers cannot override protected ones", async () => {
    const { defineRoute } = testFactory(PRINCIPALS.officer);
    const created = defineRoute({ api: "API-022", status: 201, response: dto, handler: async () => ({ ref_code: "M-ABC123" }) });
    expect((await created(get("/api/x"), noParams)).status).toBe(201);
    const replied = defineRoute({
      api: "API-022",
      response: dto,
      handler: async () => new Reply({ ref_code: "M-ABC123" }, 202, { location: "/api/cases/x", "cache-control": "max-age=60", "X-Request-Id": "spoof" }),
    });
    const res = await replied(get("/api/x"), noParams);
    expect(res.status).toBe(202);
    expect(res.headers.get("location")).toBe("/api/cases/x");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-request-id")).toMatch(UUID);
  });
});

describe("cookie seam for the parent session (D2A §9.1, §9.4)", () => {
  it("cookies set by the resolver are sent on success and on error responses", async () => {
    const { defineRoute } = testFactory(null, {
      secureCookies: true,
      resolvePrincipal: async ({ api, cookies }) => {
        if (api === "API-002") cookies.set("__Host-fera_ps", "c2Vzc2lvbg.sig", { maxAgeSeconds: 30 * 24 * 3600 });
        return PRINCIPALS.parent;
      },
    });
    const route = defineRoute({ api: "API-002", body: z.object({ kind: caseKindSchema }), response: okSchema, handler: ok });
    const good = await route(jsonPost("/api/x", { kind: "missing" }), noParams);
    expect(good.headers.get("set-cookie")).toBe("__Host-fera_ps=c2Vzc2lvbg.sig; Path=/; SameSite=Lax; Max-Age=2592000; HttpOnly; Secure");
    const bad = await route(jsonPost("/api/x", { kind: "nope" }), noParams);
    expect(bad.status).toBe(400);
    expect(bad.headers.get("set-cookie")).toContain("__Host-fera_ps=");
  });

  it("handlers can set cookies too; invalid cookies fail closed", async () => {
    const { defineRoute } = testFactory(PRINCIPALS.parent);
    const good = defineRoute({ api: "API-018", response: okSchema, handler: async ({ cookies }) => (cookies.clear("fera_draft"), { ok: true as const }) });
    expect((await good(get("/api/x"), noParams)).headers.get("set-cookie")).toBe("fera_draft=; Path=/; SameSite=Lax; Max-Age=0; HttpOnly");
    const bad = defineRoute({ api: "API-018", response: okSchema, handler: async ({ cookies }) => (cookies.set("x", `${NAME};`), { ok: true as const }) });
    await expectError(await bad(get("/api/x"), noParams), "E-021");
    const insecureHost = defineRoute({ api: "API-018", response: okSchema, handler: async ({ cookies }) => (cookies.set("__Host-x", "v"), { ok: true as const }) });
    await expectError(await insecureHost(get("/api/x"), noParams), "E-021");
  });
});

describe("rate limits through the route (NFR-009, BR-023)", () => {
  const paidSpec = { rateLimit: [RATE_LIMITS.aiPrincipal, RATE_LIMITS.aiNetwork], paid: true, response: okSchema } as const;

  it("11th AI call per principal in a minute → E-007 with seconds; handler not reached; window resets", async () => {
    let t = Date.parse("2026-10-14T10:00:10Z");
    const reach = reachCounter();
    const { defineRoute, store } = testFactory(PRINCIPALS.parent, { now: () => t });
    const route = defineRoute({ api: "API-002", ...paidSpec, handler: async () => (reach.mark("handler"), { ok: true as const }) });
    const req = () => jsonPost("/api/x", {}, { "x-forwarded-for": "203.0.113.7" });
    for (let i = 0; i < 10; i++) expect((await route(req(), noParams)).status).toBe(200);
    const res = await route(req(), noParams);
    const body = await expectError(res, "E-007");
    expect(reach.hits.handler).toBe(10);
    expect(res.headers.get("retry-after")).toBe("50");
    expect(body.error.message_en).toBe("Please try again in 50 seconds.");
    expect(body.error.message_bn).toBe("৫০ সেকেন্ড পরে আবার চেষ্টা করুন।");
    t += 50_000;
    expect((await route(req(), noParams)).status).toBe(200);
    expect(store.size).toBeGreaterThan(0);
  });

  it("network limit counts per address across principals", async () => {
    const t = Date.parse("2026-10-14T10:00:00Z");
    const { defineRoute } = testFactory(PRINCIPALS.parent, { now: () => t });
    const route = defineRoute({ api: "API-002", rateLimit: [RATE_LIMITS.aiNetwork], response: okSchema, handler: ok });
    const from = (ip: string) => jsonPost("/api/x", {}, { "x-forwarded-for": ip });
    for (let i = 0; i < 30; i++) expect((await route(from("203.0.113.9"), noParams)).status).toBe(200);
    await expectError(await route(from("203.0.113.9"), noParams), "E-007");
    await expectError(await route(from("::ffff:203.0.113.9"), noParams), "E-007");
    expect((await route(from("198.51.100.1"), noParams)).status).toBe(200);
  });

  it("requests with no trusted address share one bucket and log ratelimit.unknown_address", async () => {
    const t = Date.parse("2026-10-14T10:00:00Z");
    const { defineRoute, logs } = testFactory(PRINCIPALS.parent, { now: () => t });
    const route = defineRoute({ api: "API-002", rateLimit: [RATE_LIMITS.aiNetwork], response: okSchema, handler: ok });
    for (let i = 0; i < 30; i++) await route(jsonPost("/api/x", {}), noParams);
    await expectError(await route(jsonPost("/api/x", {}, { "x-forwarded-for": "not-an-ip" }), noParams), "E-007");
    expect(logs.parsed().some((l) => l.event === "ratelimit.unknown_address" && l.level === 40)).toBe(true);
  });

  it("without a trusted proxy x-forwarded-for is ignored (cannot be spoofed to dodge limits)", async () => {
    const t = Date.parse("2026-10-14T10:00:00Z");
    const { defineRoute } = testFactory(PRINCIPALS.parent, { now: () => t, trustProxy: false });
    const route = defineRoute({ api: "API-002", rateLimit: [RATE_LIMITS.aiNetwork], response: okSchema, handler: ok });
    for (let i = 0; i < 30; i++) await route(jsonPost("/api/x", {}, { "x-forwarded-for": `203.0.113.${i}` }), noParams);
    await expectError(await route(jsonPost("/api/x", {}, { "x-forwarded-for": "198.51.100.77" }), noParams), "E-007");
  });

  const downStore: RateLimitStore = { increment: () => Promise.reject(new Error("store down")), peek: async () => 0 };

  it("paid route with the limiter down → E-013 with the manual-form fallback (BR-023)", async () => {
    const { defineRoute, logs } = testFactory(PRINCIPALS.parent, { limiter: new RateLimiter(downStore) });
    const route = defineRoute({ api: "API-002", ...paidSpec, handler: ok });
    const body = await expectError(await route(jsonPost("/api/x", {}), noParams), "E-013");
    expect(body.error.fallback).toBe("manual_form");
    expect(logs.parsed().some((l) => l.event === "ratelimit.unavailable" && l.rule === "ai.principal")).toBe(true);
  });

  it("non-paid fail-closed rule with the limiter down → E-021", async () => {
    const { defineRoute } = testFactory(PRINCIPALS.parent, { limiter: new RateLimiter(downStore) });
    const route = defineRoute({ api: "API-018", rateLimit: [RATE_LIMITS.aiPrincipal], response: okSchema, handler: ok });
    await expectError(await route(get("/api/x"), noParams), "E-021");
  });

  it.each([
    ["no limits", []],
    ["principal only", [RATE_LIMITS.aiPrincipal]],
    ["fail-open network", [RATE_LIMITS.aiPrincipal, { ...RATE_LIMITS.aiNetwork, onStoreError: "allow" as const }]],
    ["looser principal limit", [{ ...RATE_LIMITS.aiPrincipal, limit: 50 }, RATE_LIMITS.aiNetwork]],
  ])("paid route with %s is rejected at definition", (_l, rateLimit) => {
    const { defineRoute } = testFactory(PRINCIPALS.parent);
    expect(() => defineRoute({ api: "API-001", paid: true, rateLimit, response: okSchema, handler: ok })).toThrow(/paid/);
  });

  it("the pre-auth network limit runs before the resolver", async () => {
    let resolved = 0;
    const t = Date.parse("2026-10-14T10:00:00Z");
    const { defineRoute } = testFactory(null, {
      now: () => t,
      preAuthLimit: { ...RATE_LIMITS.preAuthNetwork, limit: 2 },
      resolvePrincipal: async () => (resolved++, PRINCIPALS.officer),
    });
    const route = defineRoute({ api: "API-008", response: okSchema, handler: ok });
    for (let i = 0; i < 2; i++) expect((await route(get("/api/x", { "x-forwarded-for": "203.0.113.1" }), noParams)).status).toBe(200);
    await expectError(await route(get("/api/x", { "x-forwarded-for": "203.0.113.1" }), noParams), "E-007");
    expect(resolved).toBe(2);
  });

  it("logs ratelimit.memory_store once at error in production", async () => {
    const { defineRoute, logs } = testFactory(null, { production: true, limiter: new RateLimiter(new MemoryRateLimitStore()) });
    const route = defineRoute({ api: "API-019", response: okSchema, handler: ok });
    await route(get("/api/x"), noParams);
    await route(get("/api/x"), noParams);
    expect(logs.parsed().filter((l) => l.event === "ratelimit.memory_store")).toEqual([expect.objectContaining({ level: 50 })]);
  });
});

describe("request logging", () => {
  it("logs one allowlisted request line per call", async () => {
    const { defineRoute, logs } = testFactory(PRINCIPALS.staff);
    const route = defineRoute({ api: "API-007", body: z.object({}).passthrough(), response: okSchema, handler: ok });
    const res = await route(jsonPost("/api/x", { child_name: NAME, contact_phone: PHONE, token: TOKEN }, { cookie: `fera_ps=${TOKEN}`, "x-request-id": RID }), noParams);
    const lines = logs.parsed().filter((l) => l.event === "request");
    expect(lines).toEqual([
      {
        level: 30,
        time: 0,
        event: "request",
        request_id: res.headers.get("x-request-id"),
        client_request_id: RID,
        route: "API-007",
        method: "POST",
        role: "staff",
        status: 200,
        duration_ms: expect.any(Number),
      },
    ]);
    for (const line of logs.lines) for (const leak of [NAME, PHONE, TOKEN, "fera_ps"]) expect(line).not.toContain(leak);
  });

  it("logs the error ID, reason, stage and D2B level for failures", async () => {
    const { defineRoute, logs } = testFactory(null);
    await defineRoute({ api: "API-008", response: okSchema, handler: ok })(get("/api/x"), noParams);
    expect(logs.parsed().at(-1)).toMatchObject({ event: "request", status: 401, error_id: "E-002", reason: "role", stage: "resolver", role: "anonymous", level: 30 });
  });
});

describe("default factory and API-019 health route", () => {
  afterEach(() => vi.restoreAllMocks());

  it("health is public, schema-valid, no-store and honest about readiness", async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => (writes.push(String(chunk)), true));
    const { GET } = await import("@/app/api/health/route");
    const res = await GET(new Request(`${ORIGIN}/api/health`), noParams);
    expect(res.status).toBe(200);
    const body = healthResponseSchema.parse(await res.json());
    expect(body).toMatchObject({ synthetic_only: true, db: "unavailable", embeddings: "unavailable" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-request-id")).toMatch(UUID);
    expect(writes.some((w) => w.includes('"route":"API-019"'))).toBe(true);
  });

  it("the stub resolver fails closed with E-002 and logs auth.resolver_stub once", async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => (writes.push(String(chunk)), true));
    const { createRouteFactory, stubResolver } = await import("@/app/api/_shared");
    const defineRoute = createRouteFactory({ resolvePrincipal: stubResolver });
    const route = defineRoute({ api: "API-008", response: okSchema, handler: ok });
    await expectError(await route(get("/api/x"), noParams), "E-002");
    await expectError(await route(get("/api/x"), noParams), "E-002");
    expect(writes.filter((w) => w.includes("auth.resolver_stub"))).toHaveLength(1);
  });
});
