// TASK-006: signed cookie values, cookie names/attributes and key loading (D2A §9.1/§9.4).
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CookieJar, secureCookiesFor } from "@/app/api/_shared";
import { get, noParams, testFactory } from "../api/fakes";
import { z } from "zod";
import { SecretConfigError, decodeSecret, loadSecret, subkey } from "@/server/auth";
import {
  SESSION_TTL_SECONDS,
  cookieNames,
  cookieSourceFromHeader,
  signParentToken,
  signSessionToken,
  singleCookie,
  verifyParentToken,
  verifySessionToken,
} from "@/server/auth/tokens";
import { KEYS, fakeAuth } from "./fakes";

const NOW = Date.parse("2026-10-15T10:00:00+06:00");
const HASH = "$argon2id$v=19$m=19456,t=2,p=1$synthetic";

const setCookies = (jar: CookieJar) => {
  const headers = new Headers();
  jar.applyTo(headers);
  return headers.getSetCookie();
};

describe("credential session token", () => {
  const id = randomUUID();

  it("round-trips and lasts exactly 8 hours", () => {
    const { token, expiresAt } = signSessionToken(KEYS.session, id, HASH, NOW);
    expect(token).toMatch(/^u1\.[0-9a-f-]{36}\.\d+\.\d+\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/);
    expect(expiresAt * 1000 - Math.floor(NOW / 1000) * 1000).toBe(SESSION_TTL_SECONDS * 1000);
    expect(verifySessionToken(KEYS.session, token, NOW)?.userId).toBe(id);
    expect(verifySessionToken(KEYS.session, token, NOW + SESSION_TTL_SECONDS * 1000 - 1000)).not.toBeNull();
  });

  it("expires after 8 hours and refuses a token issued in the future", () => {
    const { token } = signSessionToken(KEYS.session, id, HASH, NOW);
    expect(verifySessionToken(KEYS.session, token, NOW + SESSION_TTL_SECONDS * 1000)).toBeNull();
    expect(verifySessionToken(KEYS.session, token, NOW - 5 * 60_000)).toBeNull();
  });

  it("refuses any edited field, a longer lifetime, another key or another purpose", () => {
    const { token } = signSessionToken(KEYS.session, id, HASH, NOW);
    const parts = token.split(".");
    const edit = (i: number, v: string) => parts.map((p, j) => (j === i ? v : p)).join(".");
    expect(verifySessionToken(KEYS.session, edit(1, randomUUID()), NOW)).toBeNull();
    expect(verifySessionToken(KEYS.session, edit(3, String(Number(parts[3]) + 3600)), NOW)).toBeNull();
    expect(verifySessionToken(KEYS.session, edit(4, "A".repeat(22)), NOW)).toBeNull();
    expect(verifySessionToken(KEYS.session, edit(5, "A".repeat(43)), NOW)).toBeNull();
    expect(verifySessionToken(KEYS.session, `${token}.role=officer`, NOW)).toBeNull();
    expect(verifySessionToken(KEYS.parent, token, NOW)).toBeNull();
    expect(verifySessionToken(KEYS.session, edit(1, parts[1].toUpperCase()), NOW)).toBeNull();
    expect(verifySessionToken(KEYS.session, "", NOW)).toBeNull();
  });
});

describe("parent session token", () => {
  it("binds one session ID and a client fingerprint (SYS-BUG-11)", () => {
    const id = randomUUID();
    const fp = "203.0.113.7|Mozilla/5.0 (test)";
    const token = signParentToken(KEYS.parent, id, fp);
    expect(token).toMatch(/^p1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/);
    expect(verifyParentToken(KEYS.parent, token, fp)).toBe(id);
    // A captured token replayed from a different browser/network fails.
    expect(verifyParentToken(KEYS.parent, token, "198.51.100.1|curl/8")).toBeNull();
    expect(verifyParentToken(KEYS.parent, token, "")).toBeNull();
    // Edited id or key is refused.
    expect(verifyParentToken(KEYS.parent, token.replace(id, randomUUID()), fp)).toBeNull();
    expect(verifyParentToken(KEYS.session, token, fp)).toBeNull();
    // Old 3-part tokens (pre-fingerprint) are no longer accepted.
    const legacy = `p1.${id}.${"A".repeat(43)}`;
    expect(verifyParentToken(KEYS.parent, legacy, fp)).toBeNull();
  });
});

describe("cookie source", () => {
  it("parses the header and keeps duplicates so they can be refused", () => {
    const source = cookieSourceFromHeader("a=1; fera_ps=x; fera_ps=y; role=officer");
    expect(singleCookie(source, "a")).toEqual({ state: "one", value: "1" });
    expect(singleCookie(source, "fera_ps")).toEqual({ state: "ambiguous" });
    expect(singleCookie(source, "fera_session")).toEqual({ state: "absent" });
    expect(singleCookie(cookieSourceFromHeader(null), "a")).toEqual({ state: "absent" });
  });

  it("uses __Host- names only with Secure cookies", () => {
    expect(cookieNames(true)).toEqual({ session: "__Host-fera_session", parent: "__Host-fera_ps" });
    expect(cookieNames(false)).toEqual({ session: "fera_session", parent: "fera_ps" });
  });
});

describe("cookie attributes (D2A §9.4)", () => {
  const user = { id: randomUUID(), role: "officer" as const, verified: true, is_active: true, display_name: "[MOCK] কর্মকর্তা", password_hash: HASH };

  it("production: __Host-, Secure, HttpOnly, SameSite=Lax, Path=/, no Domain, 8 h", () => {
    const jar = new CookieJar(true);
    fakeAuth(() => NOW).auth.startSession(user, jar);
    const [line] = setCookies(jar);
    expect(line).toMatch(/^__Host-fera_session=u1\./);
    for (const attr of ["Path=/", "SameSite=Lax", "HttpOnly", "Secure", `Max-Age=${SESSION_TTL_SECONDS}`]) expect(line).toContain(attr);
    expect(line).not.toMatch(/Domain=/i);
  });

  it("DEMO_MODE=1 / local HTTP: no prefix and no Secure, still HttpOnly and SameSite=Lax", () => {
    const jar = new CookieJar(false);
    fakeAuth(() => NOW).auth.startSession(user, jar);
    const [line] = setCookies(jar);
    expect(line).toMatch(/^fera_session=u1\./);
    expect(line).toContain("HttpOnly");
    expect(line).toContain("SameSite=Lax");
    expect(line).not.toContain("Secure");
  });

  it("sign-out clears the session cookie with the same name and attributes", () => {
    const jar = new CookieJar(true);
    fakeAuth(() => NOW).auth.endSession(jar);
    expect(setCookies(jar)).toEqual(["__Host-fera_session=; Path=/; SameSite=Lax; Max-Age=0; HttpOnly; Secure"]);
  });

  it("the session view is server-derived and expires with the token", () => {
    const view = fakeAuth(() => NOW).auth.startSession(user, new CookieJar(false));
    expect(view).toEqual({
      user_id: user.id,
      display_name: user.display_name,
      role: "officer",
      verified: true,
      expires_at: "2026-10-15T18:00:00+06:00",
    });
    const staff = fakeAuth(() => NOW).auth.startSession({ ...user, role: "staff", verified: true }, new CookieJar(false));
    expect(staff.verified).toBe(false);
  });
});

describe("signing keys", () => {
  const good = Buffer.alloc(32, 7).toString("base64");

  it("accepts 32+ bytes of base64 or base64url and refuses short or non-base64 values", () => {
    expect(decodeSecret(good)?.length).toBe(32);
    expect(decodeSecret(Buffer.alloc(48, 9).toString("base64url"))?.length).toBe(48);
    expect(decodeSecret(Buffer.alloc(16, 7).toString("base64"))).toBeNull();
    expect(decodeSecret("not base64 at all!")).toBeNull();
    expect(decodeSecret(undefined)).toBeNull();
  });

  it("requires a configured key in production (including NODE_ENV=production for DEMO_MODE=1)", () => {
    expect(() => loadSecret("AUTH_SECRET", { NODE_ENV: "production" })).toThrow(SecretConfigError);
    expect(() => loadSecret("AUTH_SECRET", { VERCEL: "1" })).toThrow(SecretConfigError);
    expect(() => loadSecret("AUTH_SECRET", { NODE_ENV: "production", DEMO_MODE: "1" })).toThrow(SecretConfigError);
    expect(loadSecret("AUTH_SECRET", { NODE_ENV: "production", AUTH_SECRET: good }).length).toBe(32);
  });

  it("refuses a short configured key in development, and never echoes it", () => {
    const short = Buffer.alloc(8, 3).toString("base64");
    let message = "";
    try {
      loadSecret("PARENT_COOKIE_KEY", { NODE_ENV: "development", PARENT_COOKIE_KEY: short });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toMatch(/PARENT_COOKIE_KEY/);
    expect(message).not.toContain(short);
  });

  it("DRAFT_SIGNING_KEY fails closed when missing in every env, validates length, and never falls back to AUTH_SECRET", () => {
    const short = Buffer.alloc(8, 3).toString("base64");
    expect(loadSecret("DRAFT_SIGNING_KEY", { NODE_ENV: "production", DRAFT_SIGNING_KEY: good }).length).toBe(32);
    expect(() => loadSecret("DRAFT_SIGNING_KEY", { NODE_ENV: "production", AUTH_SECRET: good })).toThrow(SecretConfigError);
    expect(() => loadSecret("DRAFT_SIGNING_KEY", { NODE_ENV: "development", DRAFT_SIGNING_KEY: short })).toThrow(/DRAFT_SIGNING_KEY/);
    expect(() => loadSecret("DRAFT_SIGNING_KEY", { NODE_ENV: "test", AUTH_SECRET: good })).toThrow(SecretConfigError);
    expect(() => loadSecret("DRAFT_SIGNING_KEY", { NODE_ENV: "test" })).toThrow(SecretConfigError);
    expect(() => loadSecret("DRAFT_SIGNING_KEY", { NODE_ENV: "development", AUTH_SECRET: good })).toThrow(SecretConfigError);
    expect(() => loadSecret("DRAFT_SIGNING_KEY", { NODE_ENV: "test", DRAFT_SIGNING_KEY: short })).toThrow(SecretConfigError);
    expect(loadSecret("DRAFT_SIGNING_KEY", { NODE_ENV: "test", DRAFT_SIGNING_KEY: good }).length).toBe(32);
  });

  it("uses one stable random key per process in development when unset", () => {
    const a = loadSecret("PARENT_COOKIE_KEY", { NODE_ENV: "test" });
    expect(a.length).toBe(32);
    expect(loadSecret("PARENT_COOKIE_KEY", { NODE_ENV: "test" }).equals(a)).toBe(true);
  });

  it("derives distinct subkeys per purpose", () => {
    const secret = Buffer.alloc(32, 5);
    expect(subkey(secret, "user-session.v1").equals(subkey(secret, "parent-session.v1"))).toBe(false);
  });
});

describe("Secure cookie mode", () => {
  it("is on in production, off for the DEMO_MODE=1 laptop, and always on for Vercel", () => {
    expect(secureCookiesFor(true, {})).toBe(true);
    expect(secureCookiesFor(true, { DEMO_MODE: "1" })).toBe(false);
    expect(secureCookiesFor(true, { DEMO_MODE: "1", VERCEL: "1" })).toBe(true);
    expect(secureCookiesFor(false, { VERCEL: "1" })).toBe(true);
    expect(secureCookiesFor(false, {})).toBe(false);
  });

  it("logs auth.insecure_cookies once at error when a production server runs without Secure", async () => {
    const { defineRoute, logs } = testFactory(null, { production: true, secureCookies: false });
    const route = defineRoute({ api: "API-019", response: z.strictObject({ ok: z.literal(true) }), handler: async () => ({ ok: true as const }) });
    await route(get("/api/health"), noParams);
    await route(get("/api/health"), noParams);
    const hits = logs.parsed().filter((l) => l.event === "auth.insecure_cookies");
    expect(hits).toHaveLength(1);
    expect(hits[0].level).toBe(50);
    const dev = testFactory(null, { production: false, secureCookies: false });
    await dev.defineRoute({ api: "API-019", response: z.strictObject({ ok: z.literal(true) }), handler: async () => ({ ok: true as const }) })(get("/api/health"), noParams);
    expect(dev.logs.parsed().some((l) => l.event === "auth.insecure_cookies")).toBe(false);
  });
});
