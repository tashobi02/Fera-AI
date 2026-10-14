// TASK-007 shared API layer: envelope, request ID, input helpers, role guard, DTO
// fail-closed, no-store and logging through the route composer (COMP-004/021).
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  CLIENT_ONLY_ERROR_IDS,
  ERROR_CATALOGUE,
  ERROR_IDS,
  caseKindSchema,
  errorEnvelopeSchema,
  healthResponseSchema,
  phoneSchema,
  type ServerErrorId,
} from "@/contracts";
import { canIntake, type Principal } from "@/contracts/server";
import { PRINCIPALS } from "@/contracts/examples";
import { ApiError, RATE_LIMITS, RateLimiter, Reply, createRouteFactory, errorResponse } from "@/app/api/_shared";
import { GET as healthGET } from "@/app/api/health/route";
import { ORIGIN, captureLogs, get, jsonPost, noParams, sameOriginHeaders, testFactory } from "./fakes";

const RID = "0b9f6a1e-3c4d-4e5f-8a7b-9c0d1e2f3a4b";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Synthetic sensitive-looking values; none may appear in a response body or log line.
const NAME = "রাফি হাসান";
const PHONE = "01712345678";
const TOKEN = "tok_ZXhhbXBsZS1zZWNyZXQtdG9rZW4";

const SERVER_IDS = ERROR_IDS.filter((id) => !(CLIENT_ONLY_ERROR_IDS as readonly string[]).includes(id)) as ServerErrorId[];
const okSchema = z.strictObject({ ok: z.literal(true) });

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
    const res = errorResponse(RID, new ApiError(id as Exclude<ServerErrorId, "E-007">));
    const body = await expectError(res, id);
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(res.headers.get("x-request-id")).toBe(RID);
    expect(Object.keys(body)).toEqual(["error"]);
    expect(body.error.message_bn).toBe(ERROR_CATALOGUE[id].bn);
    expect(body.error.message_en).toBe(ERROR_CATALOGUE[id].en);
  });

  it("E-007 fills seconds (Bangla numerals in message_bn) and sets Retry-After", async () => {
    const res = errorResponse(RID, new ApiError("E-007", { seconds: 42 }));
    const body = await expectError(res, "E-007");
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("42");
    expect(body.error.message_bn).toBe("৪২ সেকেন্ড পরে আবার চেষ্টা করুন।");
    expect(body.error.message_en).toBe("Please try again in 42 seconds.");
  });

  it("E-007 without valid seconds falls back to E-021", async () => {
    const res = errorResponse(RID, new ApiError("E-007", { seconds: 0 }));
    await expectError(res, "E-021");
    expect(res.headers.get("retry-after")).toBeNull();
  });

  it.each(CLIENT_ONLY_ERROR_IDS.map((id) => [id]))("client-only %s is never emitted; it becomes E-021", async (id) => {
    // @ts-expect-error client-only IDs are not ServerErrorId
    const res = errorResponse(RID, new ApiError(id));
    await expectError(res, "E-021");
  });

  it("ApiError carries only its ID as message", () => {
    expect(new ApiError("E-004").message).toBe("E-004");
  });
});

describe("request ID (D2A §5.1)", () => {
  const { defineRoute } = testFactory(null);
  const route = defineRoute({ api: "API-019", response: okSchema, handler: async () => ({ ok: true as const }) });

  it("echoes a valid incoming UUID, lowercased", async () => {
    const res = await route(get("/api/x", { "x-request-id": RID.toUpperCase() }), noParams);
    expect(res.headers.get("x-request-id")).toBe(RID);
  });

  it.each([["abc"], [PHONE], ["<script>alert(1)</script>"], [`${RID} extra`], ["x".repeat(500)]])("replaces unsafe %s", async (bad) => {
    const res = await route(get("/api/x", { "x-request-id": bad }), noParams);
    const id = res.headers.get("x-request-id")!;
    expect(id).toMatch(UUID);
    expect(id).not.toBe(bad);
  });

  it("generates one when missing", async () => {
    const a = (await route(get("/api/x"), noParams)).headers.get("x-request-id");
    const b = (await route(get("/api/x"), noParams)).headers.get("x-request-id");
    expect(a).toMatch(UUID);
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

  it("accepts a valid body, normalises it and strips unknown keys", async () => {
    const res = await route(jsonPost("/api/x", { name: "রাফি", phone: "০১৭১২৩৪৫৬৭৮", owner: "x" }), noParams);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ phone: PHONE });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("schema failure is a bare E-001: no echoed values, Zod messages or paths", async () => {
    const res = await route(jsonPost("/api/x", { name: NAME, phone: "12345", token: TOKEN }), noParams);
    const text = JSON.stringify(await expectError(res, "E-001"));
    for (const leak of [NAME, "12345", TOKEN, "name", "phone", "Too big", "Invalid"]) expect(text).not.toContain(leak);
    for (const line of logs.lines) for (const leak of [NAME, "12345", TOKEN]) expect(line).not.toContain(leak);
  });

  it("malformed JSON → E-001 without echoing input", async () => {
    const raw = `{"name": "${NAME}", "phone": "${PHONE}",`;
    const text = JSON.stringify(await expectError(await route(jsonPost("/api/x", raw), noParams), "E-001"));
    expect(text).not.toContain(PHONE);
    expect(text).not.toContain(NAME);
    expect(text).not.toMatch(/JSON|Unexpected|position/);
  });

  it.each([["text/plain"], ["application/x-www-form-urlencoded"], ["application/json; charset=latin1"], [""]])("content-type %j → E-001", async (ct) => {
    await expectError(await route(jsonPost("/api/x", { name: "a", phone: PHONE }, { "content-type": ct }), noParams), "E-001");
  });

  it("accepts application/json with utf-8 charset", async () => {
    const res = await route(jsonPost("/api/x", { name: "a", phone: PHONE }, { "content-type": "application/json; charset=UTF-8" }), noParams);
    expect(res.status).toBe(200);
  });

  it("declared Content-Length over 64 KiB → E-001 before reading", async () => {
    const req = jsonPost("/api/x", { name: "a", phone: PHONE }, { "content-length": String(64 * 1024 + 1) });
    await expectError(await route(req, noParams), "E-001");
  });

  it("streamed body over 64 KiB without Content-Length → E-001", async () => {
    const big = JSON.stringify({ name: "a", phone: PHONE, pad: "x".repeat(64 * 1024) });
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(big));
        c.close();
      },
    });
    const req = new Request(`${ORIGIN}/api/x`, {
      method: "POST",
      headers: { "content-type": "application/json", ...sameOriginHeaders },
      body: stream,
      duplex: "half",
    } as RequestInit);
    await expectError(await route(req, noParams), "E-001");
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
    await expectError(await route(jsonPost("/api/x", ""), noParams), "E-001");
  });
});

describe("query and route params", () => {
  const { defineRoute } = testFactory(PRINCIPALS.officer);
  const route = defineRoute({
    api: "API-022",
    params: z.object({ id: z.guid() }),
    query: z.object({ limit: z.string().regex(/^\d+$/).transform(Number).optional() }),
    response: z.strictObject({ id: z.string(), limit: z.number().nullable() }),
    handler: async ({ params, query }) => ({ id: params.id, limit: query.limit ?? null }),
  });
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it("parses valid params and query", async () => {
    const res = await route(get("/api/x?limit=5"), ctx(RID));
    expect(await res.json()).toEqual({ id: RID, limit: 5 });
  });

  it("invalid param → E-001", async () => {
    await expectError(await route(get("/api/x"), ctx("not-a-uuid")), "E-001");
  });

  it("invalid or repeated query key → E-001", async () => {
    await expectError(await route(get("/api/x?limit=0x1A"), ctx(RID)), "E-001");
    await expectError(await route(get("/api/x?limit=1&limit=2"), ctx(RID)), "E-001");
  });
});

describe("role guard (D2A §5.3, §9.2; BR-024)", () => {
  const inactive: Principal = { ...PRINCIPALS.officer, isActive: false };
  const unverified: Principal = { ...PRINCIPALS.officer, verified: false };
  const officerOnly = (p: Principal | null) =>
    testFactory(p).defineRoute({ api: "API-008", response: okSchema, handler: async () => ({ ok: true as const }) });

  it.each([
    ["no session", null, "E-002"],
    ["inactive officer", inactive, "E-002"],
    ["parent", PRINCIPALS.parent, "E-003"],
    ["staff", PRINCIPALS.staff, "E-003"],
    ["unverified officer", unverified, "E-003"],
    ["admin", PRINCIPALS.admin, "E-003"],
  ] as const)("%s on an officer-only route → %s", async (_label, p, id) => {
    await expectError(await officerOnly(p)(get("/api/x"), noParams), id);
  });

  it("verified active officer passes", async () => {
    const res = await officerOnly(PRINCIPALS.officer)(get("/api/x"), noParams);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("public routes skip the resolver", async () => {
    let called = false;
    const defineRoute = createRouteFactory({
      resolvePrincipal: async () => {
        called = true;
        return null;
      },
      logger: captureLogs().logger,
    });
    const route = defineRoute({ api: "API-019", response: okSchema, handler: async () => ({ ok: true as const }) });
    expect((await route(get("/api/x"), noParams)).status).toBe(200);
    expect(called).toBe(false);
  });

  it("resolver ApiError (E-019) passes through; other resolver errors are E-021", async () => {
    const logger = captureLogs().logger;
    const expired = createRouteFactory({ logger, resolvePrincipal: async () => Promise.reject(new ApiError("E-019")) });
    const broken = createRouteFactory({ logger, resolvePrincipal: async () => Promise.reject(new Error(`db down for ${PHONE}`)) });
    const spec = { api: "API-018" as const, response: okSchema, handler: async () => ({ ok: true as const }) };
    await expectError(await expired(spec)(get("/api/x"), noParams), "E-019");
    const text = JSON.stringify(await expectError(await broken(spec)(get("/api/x"), noParams), "E-021"));
    expect(text).not.toContain(PHONE);
  });

  describe("authorize hook with canIntake (API-002)", () => {
    const intake = (p: Principal) =>
      testFactory(p).defineRoute({
        api: "API-002",
        body: z.object({ kind: caseKindSchema }),
        authorize: (principal, { body }) => canIntake(principal, body.kind),
        response: okSchema,
        handler: async () => ({ ok: true as const }),
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

describe("same-origin state changes (D2A §9.4, D2B §10.1 CSRF)", () => {
  const { defineRoute } = testFactory(PRINCIPALS.staff);
  const route = defineRoute({ api: "API-007", body: z.object({}), response: okSchema, handler: async () => ({ ok: true as const }) });
  const post = (headers: Record<string, string>) =>
    new Request(`${ORIGIN}/api/x`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: "{}" });

  it.each([
    ["cross-site fetch", { host: "fera.test", "sec-fetch-site": "cross-site" }],
    ["same-site subdomain", { host: "fera.test", "sec-fetch-site": "same-site" }],
    ["foreign Origin", { host: "fera.test", origin: "https://evil.example" }],
    ["no Origin or Sec-Fetch-Site", { host: "fera.test" }],
  ])("%s → E-003", async (_l, headers) => {
    await expectError(await route(post(headers), noParams), "E-003");
  });

  it.each([
    ["Sec-Fetch-Site same-origin", { host: "fera.test", "sec-fetch-site": "same-origin" }],
    ["matching Origin", { host: "fera.test", origin: ORIGIN }],
  ])("%s passes", async (_l, headers) => {
    expect((await route(post(headers), noParams)).status).toBe(200);
  });
});

describe("per-role DTO allowlist: response schema fails closed", () => {
  const { defineRoute, logs } = testFactory(PRINCIPALS.officer);
  const dto = z.strictObject({ ref_code: z.string() });

  it("a raw row with extra keys becomes E-021 and leaks nothing", async () => {
    const route = defineRoute({
      api: "API-022",
      response: dto,
      // Simulates a handler returning a raw row instead of a projection.
      handler: async () => ({ ref_code: "M-ABC123", child_name: NAME, contact_phone: PHONE }) as unknown as { ref_code: string },
    });
    const text = JSON.stringify(await expectError(await route(get("/api/x"), noParams), "E-021"));
    expect(text).not.toContain(NAME);
    expect(text).not.toContain(PHONE);
    expect(text).not.toContain("M-ABC123");
    expect(logs.parsed().some((l) => l.event === "response.invalid")).toBe(true);
  });

  it("a thrown error becomes a generic E-021 without message or stack", async () => {
    const route = defineRoute({
      api: "API-022",
      response: dto,
      handler: async () => {
        throw new TypeError(`cannot read ${NAME} ${PHONE}`);
      },
    });
    const res = await route(get("/api/x"), noParams);
    const text = JSON.stringify(await expectError(res, "E-021"));
    for (const leak of [NAME, PHONE, "TypeError", "cannot read", "at "]) expect(text).not.toContain(leak);
    const threw = logs.parsed().find((l) => l.event === "handler.threw");
    expect(threw).toMatchObject({ err_name: "TypeError", error_id: "E-021", level: 50 });
    for (const line of logs.lines) for (const leak of [NAME, PHONE, "cannot read"]) expect(line).not.toContain(leak);
  });

  it("handler ApiError maps to its envelope (E-004 for hidden or absent)", async () => {
    const route = defineRoute({
      api: "API-022",
      response: dto,
      handler: async () => {
        throw new ApiError("E-004");
      },
    });
    await expectError(await route(get("/api/x"), noParams), "E-004");
  });

  it("Reply sets a success status; the parsed DTO is sent", async () => {
    const route = defineRoute({ api: "API-022", response: dto, handler: async () => new Reply({ ref_code: "M-ABC123" }, 201) });
    const res = await route(get("/api/x"), noParams);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ref_code: "M-ABC123" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("rate limits through the route (NFR-009, BR-023)", () => {
  it("11th AI call per principal in a minute → E-007 with seconds; window resets", async () => {
    let t = Date.parse("2026-10-14T10:00:10Z");
    const { defineRoute, store } = testFactory(PRINCIPALS.parent, { now: () => t });
    const route = defineRoute({
      api: "API-002",
      rateLimit: [RATE_LIMITS.aiPrincipal],
      response: okSchema,
      handler: async () => ({ ok: true as const }),
    });
    const req = () => jsonPost("/api/x", {}, { "x-forwarded-for": "203.0.113.7" });
    for (let i = 0; i < 10; i++) expect((await route(req(), noParams)).status).toBe(200);
    const res = await route(req(), noParams);
    const body = await expectError(res, "E-007");
    expect(res.headers.get("retry-after")).toBe("50");
    expect(body.error.message_en).toBe("Please try again in 50 seconds.");
    expect(body.error.message_bn).toBe("৫০ সেকেন্ড পরে আবার চেষ্টা করুন।");
    t += 50_000;
    expect((await route(req(), noParams)).status).toBe(200);
    expect(store.size).toBeGreaterThan(0);
  });

  it("network limit counts per hashed address across principals", async () => {
    const t = Date.parse("2026-10-14T10:00:00Z");
    const limiterRoute = (p: Principal) =>
      testFactory(p, { now: () => t }).defineRoute({
        api: "API-002",
        rateLimit: [RATE_LIMITS.aiNetwork],
        response: okSchema,
        handler: async () => ({ ok: true as const }),
      });
    const route = limiterRoute(PRINCIPALS.parent);
    for (let i = 0; i < 30; i++) expect((await route(jsonPost("/api/x", {}, { "x-forwarded-for": "203.0.113.9" }), noParams)).status).toBe(200);
    await expectError(await route(jsonPost("/api/x", {}, { "x-forwarded-for": "203.0.113.9" }), noParams), "E-007");
    expect((await route(jsonPost("/api/x", {}, { "x-forwarded-for": "198.51.100.1" }), noParams)).status).toBe(200);
  });

  it("paid-call limit fails closed when the store is down (BR-023)", async () => {
    const limiter = new RateLimiter({
      increment: async () => {
        throw new Error("store down");
      },
      peek: async () => 0,
    });
    const { defineRoute, logs } = testFactory(PRINCIPALS.parent, { limiter });
    const route = defineRoute({ api: "API-002", rateLimit: [RATE_LIMITS.aiPrincipal], response: okSchema, handler: async () => ({ ok: true as const }) });
    await expectError(await route(jsonPost("/api/x", {}), noParams), "E-021");
    expect(logs.parsed().some((l) => l.event === "ratelimit.unavailable" && l.rule === "ai.principal")).toBe(true);
  });
});

describe("request logging", () => {
  it("logs one allowlisted request line per call", async () => {
    const { defineRoute, logs } = testFactory(PRINCIPALS.staff);
    const route = defineRoute({ api: "API-007", body: z.object({}).passthrough(), response: okSchema, handler: async () => ({ ok: true as const }) });
    await route(jsonPost("/api/x", { child_name: NAME, contact_phone: PHONE, token: TOKEN }, { cookie: `fera_ps=${TOKEN}`, "x-request-id": RID }), noParams);
    const lines = logs.parsed().filter((l) => l.event === "request");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({ level: 30, time: 0, event: "request", request_id: RID, route: "API-007", method: "POST", role: "staff", status: 200, duration_ms: expect.any(Number) });
    for (const line of logs.lines) for (const leak of [NAME, PHONE, TOKEN, "fera_ps"]) expect(line).not.toContain(leak);
  });

  it("logs the error ID and level for failures", async () => {
    const { defineRoute, logs } = testFactory(null);
    await defineRoute({ api: "API-008", response: okSchema, handler: async () => ({ ok: true as const }) })(get("/api/x"), noParams);
    expect(logs.parsed().at(-1)).toMatchObject({ event: "request", status: 401, error_id: "E-002", role: "anonymous", level: 30 });
  });
});

describe("API-019 health route", () => {
  it("is public, schema-valid, no-store and carries a request ID", async () => {
    const res = await healthGET(new Request(`${ORIGIN}/api/health`), noParams);
    expect(res.status).toBe(200);
    const body = healthResponseSchema.parse(await res.json());
    expect(body.synthetic_only).toBe(true);
    expect(body.db).toBe("unavailable");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-request-id")).toMatch(UUID);
  });
});
