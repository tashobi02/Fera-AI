// TASK-006 on PostgreSQL 16 (TC-023; FR-035/037; BR-024; D2A §9.1–9.4, API-020).
// Seeds the synthetic accounts with scripts/db/seed-users.mjs, then exercises the real
// sign-in/sign-out route modules and the database principal resolver as fera_app.
// Runs under `npm run test:db` on a fresh per-run database; skipped in plain `npm test`.
import { execFileSync } from "node:child_process";
import type { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { displayNameSchema, errorEnvelopeSchema, sessionViewSchema } from "@/contracts";
import type { ApiId } from "@/contracts/server";
import { MemoryRateLimitStore, RATE_LIMITS, RateLimiter, createKeyer } from "@/app/api/_shared";
import { createSignIn, defaultAuth, defaultAuthStore, isCurrentHash } from "@/server/auth";
import { setPoolForTests } from "@/server/db/pool";
import { get, jsonPost, noParams, testFactory } from "../api/fakes";
import { connect, dbTestsEnabled, one, pool } from "./support/db";

const PASSWORDS = { SEED_ADMIN_PASSWORD: "synthetic-admin-test-pass", SEED_USER_PASSWORD: "synthetic-desk-test-pass" };
const DESK = PASSWORDS.SEED_USER_PASSWORD;
const echo = z.strictObject({ role: z.string(), id: z.string() });

const seed = () =>
  execFileSync("node", ["scripts/db/seed-users.mjs"], { encoding: "utf8", env: { ...process.env, ...PASSWORDS }, stdio: ["ignore", "pipe", "pipe"] });

const cookieOf = (res: Response) => res.headers.getSetCookie().map((l) => l.split(";")[0]).join("; ");

describe.skipIf(!dbTestsEnabled)("auth on PostgreSQL 16 (TASK-006)", () => {
  let admin: Client;
  let app: Pool;
  let signInPost: (req: Request, ctx: typeof noParams) => Promise<Response>;
  let signOutPost: (req: Request, ctx: typeof noParams) => Promise<Response>;
  let intake: (req: Request, ctx: typeof noParams) => Promise<Response>;
  const factory = () => testFactory(null, { resolvePrincipal: defaultAuth().resolvePrincipal });
  const route = (f: ReturnType<typeof factory>, api: ApiId) =>
    f.defineRoute({
      api,
      response: echo,
      handler: async ({ principal, role }) => {
        if (!principal || !role) throw new Error("public route in test");
        return { role, id: principal.kind === "parent" ? principal.sessionId : principal.userId };
      },
    });

  const signIn = (username: string, password: string) => signInPost(jsonPost("/api/auth/sign-in", { username, password }), noParams);
  const sessionCount = async () => (await one<{ n: number }>(admin, "SELECT count(*)::int AS n FROM parent_sessions")).n;
  const userId = async (username: string) => (await one<{ id: string }>(admin, "SELECT id FROM users WHERE username = $1", [username])).id;

  beforeAll(async () => {
    admin = await connect("admin");
    app = pool("app");
    setPoolForTests(app);
    seed();
    signInPost = (await import("@/app/api/auth/sign-in/route")).POST;
    signOutPost = (await import("@/app/api/auth/sign-out/route")).POST;
    intake = route(factory(), "API-001");
  });

  afterAll(async () => {
    setPoolForTests(null);
    await Promise.all([admin?.end(), app?.end()]);
  });

  describe("seeded synthetic accounts", () => {
    it("seeds 1 admin, 2 verified officers, 1 unverified officer and 2 staff with argon2id hashes", async () => {
      const { rows } = await admin.query("SELECT username, display_name, role, verified, is_active, password_hash FROM users ORDER BY username");
      expect(rows.map((r) => [r.username, r.role, r.verified, r.is_active])).toEqual([
        ["admin.demo", "admin", false, true],
        ["officer.demo", "officer", true, true],
        ["officer.pending", "officer", false, true],
        ["officer2.demo", "officer", true, true],
        ["staff.demo", "staff", false, true],
        ["staff2.demo", "staff", false, true],
      ]);
      for (const r of rows) {
        expect(isCurrentHash(r.password_hash)).toBe(true);
        expect(r.display_name).toMatch(/^\[MOCK\] /);
        expect(displayNameSchema.safeParse(r.display_name).success).toBe(true);
      }
    });

    it("re-seeding is idempotent and resets the seeded accounts; it prints no password", async () => {
      await admin.query("UPDATE users SET verified = false WHERE username = 'officer2.demo'");
      const out = seed();
      expect(out).not.toContain(PASSWORDS.SEED_USER_PASSWORD);
      expect(out).not.toContain(PASSWORDS.SEED_ADMIN_PASSWORD);
      expect(JSON.parse(out).passwords).toEqual({ admin: "env", desk: "env" });
      expect((await one<{ n: number }>(admin, "SELECT count(*)::int AS n FROM users")).n).toBe(6);
      expect((await one<{ verified: boolean }>(admin, "SELECT verified FROM users WHERE username = 'officer2.demo'")).verified).toBe(true);
    });

    it("refuses a non-local database and short passwords", () => {
      const run = (env: Record<string, string>) => () =>
        execFileSync("node", ["scripts/db/seed-users.mjs"], { env: { ...process.env, ...PASSWORDS, ...env }, stdio: "pipe" });
      expect(run({ FERA_DB_ADMIN_URL: "postgresql://postgres:x@db.example.invalid:5432/postgres" })).toThrow(/non-local/);
      expect(run({ SEED_USER_PASSWORD: "too-short" })).toThrow(/16/);
      // FERA_DB_NAME is set here (per-run database), so the committed defaults are refused.
      expect(run({ SEED_USER_PASSWORD: "", SEED_ADMIN_PASSWORD: "" })).toThrow(/must be set explicitly/);
    });
  });

  describe("sign-in and roles (TC-023)", () => {
    it("an active verified officer signs in and gets officer permissions", async () => {
      const res = await signIn("officer.demo", DESK);
      expect(res.status).toBe(200);
      const view = sessionViewSchema.parse(await res.json());
      expect(view).toMatchObject({ role: "officer", verified: true, user_id: await userId("officer.demo") });
      const f = factory();
      expect(await (await route(f, "API-008")(get("/api/x", { cookie: cookieOf(res) }), noParams)).json()).toEqual({ role: "officer", id: view.user_id });
    });

    it("an unverified officer gets staff permissions only (E-003 on officer routes, E-004 on confirm)", async () => {
      const res = await signIn("officer.pending", DESK);
      expect(sessionViewSchema.parse(await res.json())).toMatchObject({ role: "officer", verified: false });
      const f = factory();
      const cookie = cookieOf(res);
      expect(errorEnvelopeSchema.parse(await (await route(f, "API-008")(get("/api/x", { cookie }), noParams)).json()).error.id).toBe("E-003");
      expect(errorEnvelopeSchema.parse(await (await route(f, "API-010")(get("/api/x", { cookie }), noParams)).json()).error.id).toBe("E-004");
      expect(await (await route(f, "API-007")(get("/api/x", { cookie }), noParams)).json()).toMatchObject({ role: "staff" });
      expect(f.audit.map((a) => a.errorId)).toEqual(["E-003", "E-004"]);
    });

    it("verification is re-read per request: un-verifying through fera_app downgrades the next request", async () => {
      const cookie = cookieOf(await signIn("officer2.demo", DESK));
      const f = factory();
      expect((await route(f, "API-008")(get("/api/x", { cookie }), noParams)).status).toBe(200);
      await app.query("UPDATE users SET verified = false WHERE username = 'officer2.demo'"); // API-017 [MOCK] path
      expect((await route(f, "API-008")(get("/api/x", { cookie }), noParams)).status).toBe(403);
      await app.query("UPDATE users SET verified = true WHERE username = 'officer2.demo'");
    });

    it("an inactive account gets E-002 for its existing session and at sign-in", async () => {
      const cookie = cookieOf(await signIn("staff2.demo", DESK));
      await admin.query("UPDATE users SET is_active = false WHERE username = 'staff2.demo'");
      try {
        const f = factory();
        expect((await route(f, "API-007")(get("/api/x", { cookie }), noParams)).status).toBe(401);
        const again = await signIn("staff2.demo", DESK);
        expect(errorEnvelopeSchema.parse(await again.json()).error.id).toBe("E-002");
        expect(again.headers.getSetCookie()).toEqual([]);
      } finally {
        await admin.query("UPDATE users SET is_active = true WHERE username = 'staff2.demo'");
      }
    });

    it("a role flag in a cookie, header or body has no authority", async () => {
      const cookie = `${cookieOf(await signIn("staff.demo", DESK))}; role=officer; verified=true`;
      const f = factory();
      const res = await route(f, "API-007")(get("/api/x", { cookie, "x-role": "admin" }), noParams);
      expect(await res.json()).toEqual({ role: "staff", id: await userId("staff.demo") });
      const view = await signInPost(jsonPost("/api/auth/sign-in", { username: "staff.demo", password: DESK, role: "admin", verified: true }), noParams);
      expect(sessionViewSchema.parse(await view.json())).toMatchObject({ role: "staff", verified: false });
    });

    it("wrong password and unknown user are indistinguishable: status, body and timing", async () => {
      const { auth, store } = { auth: defaultAuth(), store: defaultAuthStore() };
      const signInFn = createSignIn({
        auth,
        store,
        rule: { ...RATE_LIMITS.signInFailures, limit: 1000 },
        limiter: new RateLimiter(new MemoryRateLimitStore()),
        keyer: createKeyer("test-secret"),
      });
      const f = testFactory(null, { resolvePrincipal: auth.resolvePrincipal });
      const post = f.defineRoute({ api: "API-020", response: sessionViewSchema, handler: ({ req, cookies }) => signInFn(req, cookies) });
      const attempt = async (username: string) => {
        const started = performance.now();
        const res = await post(jsonPost("/api/auth/sign-in", { username, password: "wrong-password-0" }), noParams);
        return { ms: performance.now() - started, status: res.status, body: await res.text(), cookies: res.headers.getSetCookie() };
      };
      await attempt("nobody.demo"); // warm-up: dummy hash
      const wrong = [];
      const unknown = [];
      for (let i = 0; i < 6; i++) {
        wrong.push(await attempt("officer.demo"));
        unknown.push(await attempt("nobody.demo"));
      }
      expect(new Set([...wrong, ...unknown].map((a) => `${a.status} ${a.body}`)).size).toBe(1);
      expect(wrong[0].status).toBe(401);
      expect([...wrong, ...unknown].every((a) => a.cookies.length === 0)).toBe(true);
      const mean = (xs: { ms: number }[]) => xs.reduce((s, x) => s + x.ms, 0) / xs.length;
      const ratio = mean(unknown) / mean(wrong);
      expect(ratio).toBeGreaterThan(0.5);
      expect(ratio).toBeLessThan(2);
    });

    it("sign-out clears the session cookie", async () => {
      const res = await signOutPost(jsonPost("/api/auth/sign-out", {}), noParams);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ signed_out: true });
      expect(res.headers.getSetCookie()).toEqual(["fera_session=; Path=/; SameSite=Lax; Max-Age=0; HttpOnly"]);
    });
  });

  describe("parent sessions (D2A §9.1)", () => {
    it("API-001 mints one parent_sessions row and cookie; the cookie is reused", async () => {
      const before = await sessionCount();
      const first = await intake(get("/api/x"), noParams);
      const body = echo.parse(await first.json());
      expect(body.role).toBe("parent");
      expect(await sessionCount()).toBe(before + 1);
      const again = await intake(get("/api/x", { cookie: cookieOf(first) }), noParams);
      expect(echo.parse(await again.json())).toEqual(body);
      expect(again.headers.getSetCookie()).toEqual([]);
      expect(await sessionCount()).toBe(before + 1);
    });

    it("other routes never mint: no session → E-002 and no new row", async () => {
      const before = await sessionCount();
      const f = factory();
      for (const api of ["API-003", "API-004", "API-018", "API-007"] as const) {
        const res = await route(f, api)(get("/api/x"), noParams);
        expect(res.status).toBe(401);
        expect(res.headers.getSetCookie()).toEqual([]);
      }
      expect(await sessionCount()).toBe(before);
    });

    it("a parent cookie resolves to its own row only; expired and revoked sessions give no principal", async () => {
      const f = factory();
      const a = await intake(get("/api/x"), noParams);
      const b = await intake(get("/api/x"), noParams);
      const aId = echo.parse(await a.json()).id;
      const bId = echo.parse(await b.json()).id;
      expect(aId).not.toBe(bId);
      expect(echo.parse(await (await route(f, "API-003")(get("/api/x", { cookie: cookieOf(a) }), noParams)).json()).id).toBe(aId);

      await admin.query("UPDATE parent_sessions SET created_at = now() - interval '40 days', expires_at = now() - interval '1 day' WHERE id = $1", [aId]);
      expect((await route(f, "API-003")(get("/api/x", { cookie: cookieOf(a) }), noParams)).status).toBe(401);
      const fresh = echo.parse(await (await intake(get("/api/x", { cookie: cookieOf(a) }), noParams)).json());
      expect(fresh.id).not.toBe(aId);

      await app.query("UPDATE parent_sessions SET revoked_at = now() WHERE id = $1", [bId]);
      expect((await route(f, "API-018")(get("/api/x", { cookie: cookieOf(b) }), noParams)).status).toBe(401);
    });
  });
});
