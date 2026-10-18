// TASK-006: API-020 sign-in through the API layer (D2A API-020, D3 SCREEN-008, FR-037,
// D2B §10.2 A07). Generic E-002 for every failure, failure-only E-007, server-derived
// session view. Synthetic accounts and passwords, fake store, real argon2id.
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { ERROR_CATALOGUE, errorEnvelopeSchema, sessionViewSchema } from "@/contracts";
import { MemoryRateLimitStore, RATE_LIMITS, RateLimiter, createKeyer, type RateLimitRule } from "@/app/api/_shared";
import { createAuth, createSignIn, hashPassword } from "@/server/auth";
import { jsonPost, noParams, testFactory } from "../api/fakes";
import { MemoryAuthStore, cookieHeaderFrom, fakeAuth } from "./fakes";

const PASSWORD = "synthetic-officer-pass";
let officerHash: string;

beforeAll(async () => {
  officerHash = await hashPassword(PASSWORD);
});

function setup(rule: RateLimitRule = RATE_LIMITS.signInFailures) {
  const { store, auth } = fakeAuth();
  const officer = store.addUser("officer.demo", "officer", officerHash, { verified: true });
  const inactive = store.addUser("officer.gone", "officer", officerHash, { verified: true, isActive: false });
  const signIn = createSignIn({
    auth,
    store,
    rule,
    limiter: new RateLimiter(new MemoryRateLimitStore()),
    keyer: createKeyer("test-secret"),
    trustProxy: true,
  });
  const factory = testFactory(null, { resolvePrincipal: auth.resolvePrincipal });
  const route = factory.defineRoute({ api: "API-020", response: sessionViewSchema, handler: ({ req, cookies }) => signIn(req, cookies) });
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    route(jsonPost("/api/auth/sign-in", body, { "x-forwarded-for": "198.51.100.7", ...headers }), noParams);
  return { store, officer, inactive, route, post, factory };
}

async function errorOf(res: Response) {
  const body = await res.json();
  return { status: res.status, body: errorEnvelopeSchema.parse(body), retryAfter: res.headers.get("retry-after"), cookies: res.headers.getSetCookie() };
}

const many = { ...RATE_LIMITS.signInFailures, limit: 1000 };

describe("API-020 sign-in", () => {
  it("signs in an active account and returns the server-derived session view", async () => {
    const t = setup();
    const res = await t.post({ username: "  Officer.Demo ", password: PASSWORD, role: "admin", verified: false });
    expect(res.status).toBe(200);
    const view = sessionViewSchema.parse(await res.json());
    expect(view).toMatchObject({ user_id: t.officer.id, role: "officer", verified: true });
    const [cookie] = res.headers.getSetCookie();
    expect(cookie).toMatch(/^fera_session=u1\..*; HttpOnly$/);
    expect(cookie).toContain("Max-Age=28800");
    expect(Date.parse(view.expires_at) - Date.now()).toBeGreaterThan(8 * 3600_000 - 60_000);
  });

  it("the issued cookie authenticates the next request as the same account", async () => {
    const t = setup();
    const res = await t.post({ username: "officer.demo", password: PASSWORD });
    const route = t.factory.defineRoute({
      api: "API-008",
      response: z.strictObject({ user_id: z.string() }),
      handler: async ({ principal }) => ({ user_id: principal.kind === "user" ? principal.userId : "" }),
    });
    const next = await route(new Request("http://fera.test/api/x", { headers: { host: "fera.test", cookie: cookieHeaderFrom(res) } }), noParams);
    expect(await next.json()).toEqual({ user_id: t.officer.id });
  });

  it("answers the same generic E-002 for unknown user, wrong password, inactive account and any malformed input", async () => {
    const t = setup(many);
    const attempts: Array<[string, Request]> = [
      ["unknown user", jsonPost("/api/auth/sign-in", { username: "nobody.demo", password: PASSWORD })],
      ["wrong password", jsonPost("/api/auth/sign-in", { username: "officer.demo", password: "wrong-password-0" })],
      ["inactive", jsonPost("/api/auth/sign-in", { username: "officer.gone", password: PASSWORD })],
      ["bad username", jsonPost("/api/auth/sign-in", { username: "x", password: PASSWORD })],
      ["no password", jsonPost("/api/auth/sign-in", { username: "officer.demo" })],
      ["long password", jsonPost("/api/auth/sign-in", { username: "officer.demo", password: "p".repeat(201) })],
      ["not json", jsonPost("/api/auth/sign-in", "{not json")],
      ["array", jsonPost("/api/auth/sign-in", [])],
      ["form post", new Request("http://fera.test/api/auth/sign-in", { method: "POST", headers: { host: "fera.test", "sec-fetch-site": "same-origin", "content-type": "application/x-www-form-urlencoded" }, body: "username=officer.demo" })],
    ];
    const bodies = [];
    for (const [label, req] of attempts) {
      const res = await t.route(req, noParams);
      const out = await errorOf(res);
      expect(out.status, label).toBe(ERROR_CATALOGUE["E-002"].http);
      expect(out.body.error.id, label).toBe("E-002");
      expect(out.cookies, label).toEqual([]);
      bodies.push(JSON.stringify(out.body));
    }
    expect(new Set(bodies).size).toBe(1);
  });

  it("unknown user and wrong password take about the same time", async () => {
    const t = setup(many);
    await t.post({ username: "nobody.demo", password: "warm-up-password" });
    const time = async (username: string) => {
      const started = performance.now();
      for (let i = 0; i < 6; i++) await t.post({ username, password: "wrong-password-0" });
      return performance.now() - started;
    };
    const ratio = (await time("nobody.demo")) / (await time("officer.demo"));
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(2);
  });

  it("gives E-007 after five failures a minute per network key, even for the right password", async () => {
    const t = setup();
    for (let i = 0; i < 5; i++) expect((await t.post({ username: "officer.demo", password: "wrong-password-0" })).status).toBe(401);
    const limited = await errorOf(await t.post({ username: "officer.demo", password: PASSWORD }));
    expect(limited.body.error.id).toBe("E-007");
    expect(Number(limited.retryAfter)).toBeGreaterThan(0);
    expect(limited.cookies).toEqual([]);
    // Another network key is not affected.
    expect((await t.post({ username: "officer.demo", password: PASSWORD }, { "x-forwarded-for": "198.51.100.8" })).status).toBe(200);
  });

  it("counts failures only: successful sign-ins never use up the limit", async () => {
    const t = setup();
    for (let i = 0; i < 8; i++) expect((await t.post({ username: "officer.demo", password: PASSWORD })).status).toBe(200);
  });

  it("refuses a cross-site sign-in before checking credentials (login CSRF)", async () => {
    const t = setup();
    const res = await t.post({ username: "officer.demo", password: PASSWORD }, { "sec-fetch-site": "cross-site" });
    expect((await errorOf(res)).body.error.id).toBe("E-003");
    expect(t.store.reads).toBe(0);
  });

  it("with a missing session key it fails the same way (E-021) for right and wrong passwords, before any lookup", async () => {
    const store = new MemoryAuthStore();
    store.addUser("officer.demo", "officer", officerHash, { verified: true });
    const auth = createAuth({
      store,
      keys: {
        session: () => {
          throw new Error("AUTH_SECRET must be set");
        },
        parent: () => Buffer.alloc(32, 2),
      },
    });
    const signIn = createSignIn({ auth, store, limiter: new RateLimiter(new MemoryRateLimitStore()), keyer: createKeyer("k") });
    const route = testFactory(null).defineRoute({ api: "API-020", response: sessionViewSchema, handler: ({ req, cookies }) => signIn(req, cookies) });
    for (const password of [PASSWORD, "wrong-password-0"]) {
      const res = await route(jsonPost("/api/auth/sign-in", { username: "officer.demo", password }), noParams);
      expect((await errorOf(res)).body.error.id).toBe("E-021");
    }
    expect(store.reads).toBe(0);
  });

  it("does not need PARENT_COOKIE_KEY: staff sign-in works with only the session key", async () => {
    const store = new MemoryAuthStore();
    store.addUser("officer.demo", "officer", officerHash, { verified: true });
    const auth = createAuth({
      store,
      keys: {
        session: () => Buffer.alloc(32, 1),
        parent: () => {
          throw new Error("PARENT_COOKIE_KEY must be set");
        },
      },
    });
    const signIn = createSignIn({ auth, store, limiter: new RateLimiter(new MemoryRateLimitStore()), keyer: createKeyer("k") });
    const route = testFactory(null, { resolvePrincipal: auth.resolvePrincipal }).defineRoute({
      api: "API-020",
      response: sessionViewSchema,
      handler: ({ req, cookies }) => signIn(req, cookies),
    });
    const res = await route(jsonPost("/api/auth/sign-in", { username: "officer.demo", password: PASSWORD }), noParams);
    expect(res.status).toBe(200);
  });

  it("a parallel burst runs at most five credential checks per key; the rest get E-007 without a lookup", async () => {
    const t = setup();
    const results = await Promise.all(
      Array.from({ length: 12 }, () => t.post({ username: "officer.demo", password: "wrong-password-0" })),
    );
    const ids = await Promise.all(results.map(async (r) => (await errorOf(r)).body.error.id));
    expect(ids.filter((id) => id === "E-002")).toHaveLength(5);
    expect(ids.filter((id) => id === "E-007")).toHaveLength(7);
    expect(t.store.reads).toBe(5);
    // The slots are released: the window now holds 5 stored failures, so the next try is limited too.
    expect((await errorOf(await t.post({ username: "officer.demo", password: PASSWORD }))).body.error.id).toBe("E-007");
  });

  it("in-flight successes hold a slot only while running", async () => {
    const t = setup();
    const burst = await Promise.all(Array.from({ length: 5 }, () => t.post({ username: "officer.demo", password: PASSWORD })));
    expect(burst.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect((await t.post({ username: "officer.demo", password: PASSWORD })).status).toBe(200);
  });
});
