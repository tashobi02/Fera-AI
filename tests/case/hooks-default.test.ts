// TASK-015: the access.denied writers are the installed defaults (behavioural check, not
// a source grep). A staff session is resolved through the real default resolver; the
// fera_app pool is replaced by a recording fake.
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

let cookieHeader: string | null = null;
vi.mock("next/headers", () => ({
  headers: async () => new Headers(cookieHeader ? { cookie: cookieHeader } : {}),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const { defineRoute } = await import("@/app/api/_shared");
const { requireRole } = await import("@/server/auth/require-role");
const { defaultAuthStore } = await import("@/server/auth/default");
const { signSessionToken } = await import("@/server/auth/tokens");
const { subkey, loadSecret } = await import("@/server/auth/secrets");
const { setPoolForTests } = await import("@/server/db/pool");

const STAFF = "6b1f3c2a-4d5e-4f60-8a71-000000000011";
const HASH = "$argon2id$v=19$m=19456,t=2,p=1$c3ludGhldGlj$c3ludGhldGljaGFzaA";
const inserts: unknown[][] = [];
const fakePool = {
  async query(text: string, values: unknown[] = []) {
    if (text.startsWith("INSERT INTO audit_log")) {
      inserts.push(values);
      return { rows: [{ id: String(inserts.length) }] };
    }
    return { rows: [] };
  },
};

describe("default denial hooks", () => {
  beforeAll(() => {
    setPoolForTests(fakePool as unknown as Pool);
    vi.spyOn(defaultAuthStore(), "userById").mockImplementation(async (id: string) =>
      id === STAFF ? { id, role: "staff", verified: false, is_active: true, display_name: "[MOCK] staff", password_hash: HASH } : null,
    );
    cookieHeader = `fera_session=${signSessionToken(subkey(loadSecret("AUTH_SECRET"), "user-session.v1"), STAFF, HASH, Date.now()).token}`;
  });
  afterAll(() => {
    setPoolForTests(null);
    vi.restoreAllMocks();
  });

  it("defineRoute writes access.denied for a signed-in role denial", async () => {
    const route = defineRoute({ api: "API-008", response: z.strictObject({}), handler: async () => ({}) });
    const res = await route(new Request("http://fera.test/api/review-queue", { headers: { host: "fera.test", cookie: cookieHeader! } }), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(403);
    expect(inserts.at(-1)?.slice(0, 7)).toEqual(["staff", STAFF, null, "access.denied", null, null, '{"error_id":"E-003","api":"API-008"}']);
  });

  it("requireRole writes access.denied for a wrong-role page visit, then shows not-found", async () => {
    const before = inserts.length;
    await expect(requireRole(["officer"], "/officer/queue")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(inserts.length).toBe(before + 1);
    expect(inserts.at(-1)?.slice(3, 7)).toEqual(["access.denied", null, null, '{"error_id":"E-004"}']);
  });
});
