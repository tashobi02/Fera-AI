// TASK-006 / T009: server-derived roles through the real principal resolver and the
// API layer (BR-007/010/024, FR-035/037, D2A §9.1–9.3; TC-023, plus the role and
// parent-ownership parts of TC-022/044/052). The record-level E-004 views and the
// access.denied audit row itself are TASK-015 (API-004); here the layer's denial hook
// is checked to receive the server-derived principal. Synthetic accounts, fake store.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ERROR_CATALOGUE, errorEnvelopeSchema, type ServerErrorId } from "@/contracts";
import { API_ACCESS, API_IDS, type ApiId } from "@/contracts/server";
import { CookieJar, PUBLIC_APIS } from "@/app/api/_shared";
import { MINTING_APIS, MINTING_IF_NO_PARENT_COOKIE, cookieNames } from "@/server/auth";
import { signParentToken, signSessionToken } from "@/server/auth/tokens";
import { get, jsonPost, noParams, testFactory } from "../api/fakes";
import { DAY_MS, KEYS, cookieHeaderFrom, fakeAuth } from "./fakes";

const HASH = "$argon2id$v=19$m=19456,t=2,p=1$c3ludGhldGljc2FsdDAwMQ$c3ludGhldGljLWhhc2gtbm90LXJlYWwtMDAwMDAwMDAwMDAw";
const echo = z.strictObject({ role: z.string(), id: z.string() });

function setup(opts: { secure?: boolean; now?: () => number } = {}) {
  const fixed = Date.now();
  const { store, auth } = fakeAuth(opts.now ?? (() => fixed));
  const factory = testFactory(null, { resolvePrincipal: auth.resolvePrincipal, secureCookies: opts.secure ?? false });
  const reached: ApiId[] = [];
  const route = (api: ApiId) =>
    factory.defineRoute({
      api,
      response: echo,
      handler: async ({ principal, role }) => {
        reached.push(api);
        if (!principal || !role) throw new Error("public route in test");
        return { role, id: principal.kind === "parent" ? principal.sessionId : principal.userId };
      },
    });
  const names = cookieNames(opts.secure ?? false);
  const session = (userId: string, passwordHash = HASH) => `${names.session}=${signSessionToken(KEYS.session, userId, passwordHash, Date.now()).token}`;
  const parent = (sessionId: string) => `${names.parent}=${signParentToken(KEYS.parent, sessionId)}`;
  const users = {
    officer: store.addUser("officer.demo", "officer", HASH, { verified: true }),
    pending: store.addUser("officer.pending", "officer", HASH, { verified: false }),
    staff: store.addUser("staff.demo", "staff", HASH),
    admin: store.addUser("admin.demo", "admin", HASH),
    inactive: store.addUser("officer.gone", "officer", HASH, { verified: true, isActive: false }),
  };
  return { store, auth, factory, route, reached, session, parent, users, names };
}

async function call(route: ReturnType<ReturnType<typeof setup>["route"]>, cookie?: string, extra: Record<string, string> = {}) {
  return route(get("/api/x", { ...(cookie ? { cookie } : {}), ...extra }), noParams);
}

async function expectError(res: Response, id: ServerErrorId) {
  expect(res.status).toBe(ERROR_CATALOGUE[id].http);
  expect(errorEnvelopeSchema.parse(await res.json()).error.id).toBe(id);
}

describe("credential principals are rebuilt from the user row (TC-023, BR-024)", () => {
  it("an active verified officer gets officer permissions", async () => {
    const t = setup();
    const res = await call(t.route("API-008"), t.session(t.users.officer.id));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ role: "officer", id: t.users.officer.id });
    expect((await call(t.route("API-010"), t.session(t.users.officer.id))).status).toBe(200);
  });

  it("an unverified officer has staff permissions only: no officer route, no confirm (TC-023)", async () => {
    const t = setup();
    const cookie = t.session(t.users.pending.id);
    await expectError(await call(t.route("API-008"), cookie), "E-003");
    await expectError(await call(t.route("API-010"), cookie), "E-004");
    expect(t.reached).toEqual([]);
    expect(t.factory.audit.map((a) => [a.api, a.errorId, a.principal.kind === "user" && a.principal.userId])).toEqual([
      ["API-008", "E-003", t.users.pending.id],
      ["API-010", "E-004", t.users.pending.id],
    ]);
    const res = await call(t.route("API-007"), cookie);
    expect(await res.json()).toEqual({ role: "staff", id: t.users.pending.id });
  });

  it("staff cannot confirm or open officer routes; admin gets metadata routes only", async () => {
    const t = setup();
    await expectError(await call(t.route("API-010"), t.session(t.users.staff.id)), "E-004");
    await expectError(await call(t.route("API-009"), t.session(t.users.admin.id)), "E-004");
    expect(await (await call(t.route("API-012"), t.session(t.users.admin.id))).json()).toEqual({ role: "admin", id: t.users.admin.id });
    expect(t.reached).toEqual(["API-012"]);
  });

  it("an inactive account gets E-002 even with a correctly signed, unexpired token", async () => {
    const t = setup();
    await expectError(await call(t.route("API-008"), t.session(t.users.inactive.id)), "E-002");
    expect(t.factory.audit).toEqual([]);
  });

  it("verification, role and activity are read on every request, not frozen at sign-in", async () => {
    const t = setup();
    const cookie = t.session(t.users.officer.id);
    expect((await call(t.route("API-008"), cookie)).status).toBe(200);
    t.store.users.get(t.users.officer.id)!.verified = false; // admin un-verifies [MOCK]
    await expectError(await call(t.route("API-008"), cookie), "E-003");
    t.store.users.get(t.users.officer.id)!.is_active = false;
    await expectError(await call(t.route("API-007"), cookie), "E-002");
  });

  it("a password reset or a deleted account ends existing sessions", async () => {
    const t = setup();
    const cookie = t.session(t.users.staff.id);
    t.store.users.get(t.users.staff.id)!.password_hash = HASH.replace("c3ludGhldGljLWhh", "cmVzZXQtcGFzc3dv");
    await expectError(await call(t.route("API-007"), cookie), "E-002");
    const admin = t.session(t.users.admin.id);
    t.store.users.delete(t.users.admin.id);
    await expectError(await call(t.route("API-012"), admin), "E-002");
  });

  it("browser-supplied role, verified or owner flags have no authority", async () => {
    const t = setup();
    const staff = t.session(t.users.staff.id);
    const res = await call(t.route("API-007"), `${staff}; role=officer; verified=true; user_id=${t.users.officer.id}`, {
      "x-role": "officer",
      "x-verified": "true",
    });
    expect(await res.json()).toEqual({ role: "staff", id: t.users.staff.id });
    const withBody = t.factory.defineRoute({
      api: "API-007",
      body: z.object({ note: z.string().optional() }),
      response: echo,
      handler: async ({ role, principal }) => ({ role, id: principal.kind === "user" ? principal.userId : "" }),
    });
    const posted = await withBody(jsonPost("/api/x", { role: "officer", verified: true, created_by_user_id: t.users.officer.id }, { cookie: staff }), noParams);
    expect(await posted.json()).toEqual({ role: "staff", id: t.users.staff.id });
  });

  it("a token edited to another user ID, duplicated, or signed with another key gives E-002", async () => {
    const t = setup();
    const token = t.session(t.users.staff.id);
    await expectError(await call(t.route("API-008"), token.replace(t.users.staff.id, t.users.officer.id)), "E-002");
    await expectError(await call(t.route("API-007"), `${token}; ${token}`), "E-002");
    const foreign = `${t.names.session}=${signSessionToken(Buffer.alloc(32, 9), t.users.officer.id, HASH, Date.now()).token}`;
    await expectError(await call(t.route("API-008"), foreign), "E-002");
  });

  it("an invalid credential cookie never falls back to a parent session", async () => {
    const t = setup();
    const row = t.store.addSession();
    await expectError(await call(t.route("API-003"), `${t.names.session}=garbage; ${t.parent(row.id)}`), "E-002");
    const minting = await call(t.route("API-001"), `${t.names.session}=garbage`);
    await expectError(minting, "E-002");
    expect(minting.headers.getSetCookie()).toEqual([]);
    expect(t.store.created).toBe(0);
  });

  it("a request without cookies resolves to no principal without touching the database", async () => {
    const t = setup();
    await expectError(await call(t.route("API-008")), "E-002");
    expect(t.store.reads).toBe(0);
  });
});

describe("parent sessions (D2A §9.1, BR-007 ownership)", () => {
  it("a valid parent cookie resolves to exactly that parent_sessions row", async () => {
    const t = setup();
    const mine = t.store.addSession();
    const theirs = t.store.addSession();
    expect(await (await call(t.route("API-003"), t.parent(mine.id))).json()).toEqual({ role: "parent", id: mine.id });
    expect(await (await call(t.route("API-018"), t.parent(theirs.id))).json()).toEqual({ role: "parent", id: theirs.id });
  });

  it("a forged, unknown, expired or revoked parent session gives no principal", async () => {
    const t = setup();
    const row = t.store.addSession();
    const forged = `${t.names.parent}=${signParentToken(KEYS.parent, row.id).replace(row.id, randomUUID())}`;
    await expectError(await call(t.route("API-003"), forged), "E-002");
    await expectError(await call(t.route("API-003"), t.parent(randomUUID())), "E-002");
    await expectError(await call(t.route("API-003"), t.parent(t.store.addSession({ expiresInMs: -DAY_MS }).id)), "E-002");
    await expectError(await call(t.route("API-003"), t.parent(t.store.addSession({ revoked: true }).id)), "E-002");
    await expectError(await call(t.route("API-003"), `${t.parent(row.id)}; ${t.parent(row.id)}`), "E-002");
  });

  it.each(MINTING_APIS.map((api) => [api]))("%s mints one revocable parent session when none exists, then reuses it", async (api) => {
    const t = setup();
    const first = await call(t.route(api));
    expect(first.status).toBe(200);
    const body = (await first.json()) as { role: string; id: string };
    expect(body.role).toBe("parent");
    expect(t.store.created).toBe(1);
    expect(t.store.sessions.has(body.id)).toBe(true);
    const [line] = first.headers.getSetCookie();
    expect(line).toMatch(/^fera_ps=p1\./);
    for (const attr of ["Path=/", "SameSite=Lax", "HttpOnly", `Max-Age=${30 * 86_400}`]) expect(line).toContain(attr);

    const again = await call(t.route(api), cookieHeaderFrom(first));
    expect(await again.json()).toEqual(body);
    expect(again.headers.getSetCookie()).toEqual([]);
    expect(t.store.created).toBe(1);
  });

  it("API-001 replaces an expired or revoked parent session with a new one", async () => {
    const t = setup();
    for (const row of [t.store.addSession({ expiresInMs: -1000 }), t.store.addSession({ revoked: true })]) {
      const res = await call(t.route("API-001"), t.parent(row.id));
      const body = (await res.json()) as { id: string };
      expect(body.id).not.toBe(row.id);
    }
    expect(t.store.created).toBe(2);
  });

  it("a signed-in staff member on API-001 stays staff and gets no parent cookie", async () => {
    const t = setup();
    const res = await call(t.route("API-001"), t.session(t.users.staff.id));
    expect(await res.json()).toEqual({ role: "staff", id: t.users.staff.id });
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(t.store.created).toBe(0);
  });

  // OD-022-5: API-003 mints only for a browser with no parent cookie at all.
  it.each(MINTING_IF_NO_PARENT_COOKIE.map((api) => [api]))("%s mints when no parent cookie is present, then reuses it", async (api) => {
    const t = setup();
    const first = await call(t.route(api));
    expect(first.status).toBe(200);
    const body = (await first.json()) as { role: string; id: string };
    expect(body.role).toBe("parent");
    expect(t.store.created).toBe(1);
    const again = await call(t.route(api), cookieHeaderFrom(first));
    expect(await again.json()).toEqual(body);
    expect(again.headers.getSetCookie()).toEqual([]);
    expect(t.store.created).toBe(1);
  });

  it("only API-003 mints without a parent cookie", () => {
    expect(MINTING_IF_NO_PARENT_COOKIE).toEqual(["API-003"]);
  });

  it.each(MINTING_IF_NO_PARENT_COOKIE.map((api) => [api]))("%s never replaces a present but unusable parent cookie: E-002 and the dead cookie is cleared", async (api) => {
    const t = setup();
    for (const cookie of [
      `${t.names.parent}=p1.${randomUUID()}.AAAA`,
      t.parent(randomUUID()),
      t.parent(t.store.addSession({ expiresInMs: -DAY_MS }).id),
      t.parent(t.store.addSession({ revoked: true }).id),
      (() => { const row = t.store.addSession(); return `${t.parent(row.id)}; ${t.parent(row.id)}`; })(), // duplicated
    ]) {
      const res = await call(t.route(api), cookie);
      await expectError(res, "E-002");
      const cleared = res.headers.getSetCookie();
      expect(cleared).toHaveLength(1);
      expect(cleared[0]).toMatch(new RegExp(`^${t.names.parent}=; .*Max-Age=0`));
    }
    expect(t.store.created).toBe(0);
  });

  it("after the dead cookie is cleared, the next (cookieless) submit mints a new session", async () => {
    const t = setup();
    const dead = t.parent(t.store.addSession({ revoked: true }).id);
    await expectError(await call(t.route("API-003"), dead), "E-002");
    const next = await call(t.route("API-003"));
    expect(((await next.json()) as { role: string }).role).toBe("parent");
    expect(t.store.created).toBe(1);
  });

  it("API-003 with an invalid credential cookie and no parent cookie stays E-002 and never becomes a parent", async () => {
    const t = setup();
    for (const cookie of [`${t.names.session}=garbage`, t.session(t.users.staff.id, "stale-password-hash")]) {
      const res = await call(t.route("API-003"), cookie);
      await expectError(res, "E-002");
      expect(res.headers.getSetCookie()).toEqual([]);
    }
    expect(t.store.created).toBe(0);
  });

  it("with Secure cookies, API-003 ignores an unprefixed fera_ps and mints a __Host- session", async () => {
    const t = setup({ secure: true });
    const row = t.store.addSession();
    const res = await call(t.route("API-003"), `fera_ps=${signParentToken(KEYS.parent, row.id)}`);
    expect(((await res.json()) as { role: string; id: string }).id).not.toBe(row.id);
    expect(res.headers.getSetCookie()[0]).toMatch(/^__Host-fera_ps=p1\..*; Secure$/);
    expect(t.store.created).toBe(1);
  });

  it("a signed-in staff member on API-003 gets no parent cookie", async () => {
    const t = setup();
    const res = await call(t.route("API-003"), t.session(t.users.staff.id));
    await expectError(res, "E-003");
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(t.store.created).toBe(0);
  });

  const nonMinting = API_IDS.filter(
    (api) => !MINTING_APIS.includes(api) && !MINTING_IF_NO_PARENT_COOKIE.includes(api) && !(PUBLIC_APIS as readonly ApiId[]).includes(api),
  );
  it.each(nonMinting.map((api) => [api]))("%s never mints a parent session (no session → E-002)", async (api) => {
    const t = setup();
    const res = await call(t.route(api));
    await expectError(res, "E-002");
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(t.store.created).toBe(0);
    expect(API_ACCESS[api]).not.toContain("public");
  });

  it("with Secure cookies the parent cookie is __Host- and an unprefixed one is ignored", async () => {
    const t = setup({ secure: true });
    const first = await call(t.route("API-001"));
    expect(first.headers.getSetCookie()[0]).toMatch(/^__Host-fera_ps=p1\..*; Secure$/);
    const row = t.store.addSession();
    await expectError(await call(t.route("API-004"), `fera_ps=${signParentToken(KEYS.parent, row.id)}`), "E-002");
    expect(await (await call(t.route("API-004"), t.parent(row.id))).json()).toEqual({ role: "parent", id: row.id });
  });
});

describe("default API layer resolver", () => {
  it("is the database resolver: no cookie means E-002 without a database or keys", async () => {
    const { defineRoute } = await import("@/app/api/_shared");
    const route = defineRoute({ api: "API-008", response: echo, handler: async () => ({ role: "x", id: "x" }) });
    await expectError(await route(get("/api/x"), noParams), "E-002");
  });

  it("CookieJar exposes its Secure default for cookie naming", () => {
    expect(new CookieJar(true).secure).toBe(true);
    expect(new CookieJar(false).secure).toBe(false);
  });
});

