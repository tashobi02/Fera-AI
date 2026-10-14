// TASK-006: page guards for server components (D3 §1 role homes, S-008 return URL,
// S-016 for wrong role; BR-024). next/headers and next/navigation are mocked.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testParent, testUser } from "../support/principals";

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

const { PageAuditUnavailableError, decideAccess, requireRole, roleHome, safeReturnPath, setPageAuditDenied, signInPath } = await import(
  "@/server/auth/require-role"
);
const { signSessionToken } = await import("@/server/auth/tokens");
const { subkey, loadSecret } = await import("@/server/auth/secrets");
const { defaultAuthStore } = await import("@/server/auth/default");

const ID = "6b1f3c2a-4d5e-4f60-8a71-0000000000a1";

describe("decideAccess", () => {
  it("allows the effective role and maps an unverified officer to staff", () => {
    expect(decideAccess(testUser(ID, "officer", { verified: true }), ["officer"]).kind).toBe("ok");
    expect(decideAccess(testUser(ID, "officer", { verified: false }), ["officer"]).kind).toBe("not-found");
    const staff = decideAccess(testUser(ID, "officer", { verified: false }), ["staff"]);
    expect(staff.kind === "ok" && staff.role).toBe("staff");
  });

  it("sends signed-out desk visitors to sign-in and wrong roles to not-found", () => {
    expect(decideAccess(null, ["officer", "admin"]).kind).toBe("sign-in");
    expect(decideAccess(testUser(ID, "staff", { isActive: false }), ["staff"]).kind).toBe("sign-in");
    expect(decideAccess(testUser(ID, "admin"), ["officer"]).kind).toBe("not-found");
    expect(decideAccess(testParent(ID), ["staff"]).kind).toBe("not-found");
  });

  it("never sends a parent to the sign-in page", () => {
    expect(decideAccess(null, ["parent"]).kind).toBe("not-found");
    expect(decideAccess(testParent(ID), ["parent"]).kind).toBe("ok");
  });
});

describe("return URL and role homes", () => {
  it.each([
    ["/officer/case/abc?tab=audit", "/officer/case/abc?tab=audit"],
    ["/staff", "/staff"],
    ["https://evil.example/", null],
    ["//evil.example/x", null],
    ["/\\evil.example", null],
    ["/a\\b", null],
    ["/a b", null],
    ["/x\u0000", null],
    ["relative", null],
    // Dot segments that URL normalisation would collapse into a protocol-relative "//host".
    ["/.//evil.com", null],
    ["/a/..//evil.com", null],
    ["/..//evil.com", null],
    ["/%2e//evil.com", null],
    ["/.%2e//evil.com", null],
    ["/%2E%2E//evil.com", null],
    ["/a/./b", null],
    ["/a/%2e%2e/b", null],
    ["/a.b/c..d/.well-known", "/a.b/c..d/.well-known"],
    ["/x?next=/..//evil.com", "/x?next=/..//evil.com"],
    ["", null],
    [`/${"a".repeat(600)}`, null],
  ])("safeReturnPath(%j) = %j", (raw, expected) => {
    expect(safeReturnPath(raw)).toBe(expected);
  });

  it("builds the sign-in path with an encoded, same-origin next", () => {
    expect(signInPath("/officer/case/abc?x=1")).toBe("/sign-in?next=%2Fofficer%2Fcase%2Fabc%3Fx%3D1");
    expect(signInPath("//evil.example")).toBe("/sign-in");
    expect(signInPath("/sign-in")).toBe("/sign-in");
  });

  it("maps effective roles to D3 homes", () => {
    expect([roleHome("staff"), roleHome("officer"), roleHome("admin"), roleHome("parent")]).toEqual(["/staff", "/officer", "/admin", "/"]);
  });
});

describe("requireRole", () => {
  const officerId = "6b1f3c2a-4d5e-4f60-8a71-0000000000b2";
  const staffId = "6b1f3c2a-4d5e-4f60-8a71-0000000000b3";
  const HASH = "$argon2id$v=19$m=19456,t=2,p=1$c3ludGhldGljc2FsdDAwMQ$c3ludGhldGljLWhhc2gtbm90LXJlYWwtMDAwMDAwMDAwMDAw";
  const store = defaultAuthStore();
  const users: Record<string, { id: string; role: "staff" | "officer"; verified: boolean; is_active: boolean; display_name: string; password_hash: string }> = {
    [officerId]: { id: officerId, role: "officer", verified: true, is_active: true, display_name: "[MOCK] কর্মকর্তা", password_hash: HASH },
    [staffId]: { id: staffId, role: "staff", verified: false, is_active: true, display_name: "[MOCK] স্টাফ", password_hash: HASH },
  };
  const sessionFor = (id: string) => `fera_session=${signSessionToken(subkey(loadSecret("AUTH_SECRET"), "user-session.v1"), id, HASH, Date.now()).token}`;

  beforeEach(() => {
    cookieHeader = null;
    setPageAuditDenied(null);
    vi.spyOn(store, "userById").mockImplementation(async (id: string) => users[id] ?? null);
  });

  it("redirects a signed-out visitor to sign-in with the return path, without audit", async () => {
    const audit = vi.fn(async () => undefined);
    await expect(requireRole(["officer"], "/officer/queue", { auditDenied: audit })).rejects.toMatchObject({ url: "/sign-in?next=%2Fofficer%2Fqueue" });
    expect(audit).not.toHaveBeenCalled();
  });

  it("treats a garbage session cookie as signed out without touching the database", async () => {
    cookieHeader = "fera_session=garbage";
    await expect(requireRole(["staff"], "/staff")).rejects.toMatchObject({ url: "/sign-in?next=%2Fstaff" });
    expect(store.userById).not.toHaveBeenCalled();
  });

  it("refuses a duplicated session cookie like the route handlers do", async () => {
    cookieHeader = `${sessionFor(officerId)}; ${sessionFor(officerId)}`;
    await expect(requireRole(["officer"], "/officer")).rejects.toMatchObject({ url: "/sign-in?next=%2Fofficer" });
  });

  it("lets the right role through", async () => {
    cookieHeader = sessionFor(officerId);
    await expect(requireRole(["officer"], "/officer")).resolves.toMatchObject({ role: "officer" });
  });

  it("audits a signed-in wrong-role visit as access.denied input, then shows not-found (BR-010)", async () => {
    cookieHeader = sessionFor(staffId);
    const audit = vi.fn(async () => undefined);
    await expect(requireRole(["officer"], "/officer/case/abc?tab=x", { auditDenied: audit })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls[0]).toEqual([
      expect.objectContaining({ role: "staff", path: "/officer/case/abc", errorId: "E-004", reason: "role", caseId: null }),
    ]);
  });

  it("uses the installed page-denial hook when no option is given", async () => {
    cookieHeader = sessionFor(staffId);
    const audit = vi.fn(async () => undefined);
    setPageAuditDenied(audit);
    await expect(requireRole(["admin"], "/admin")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(audit).toHaveBeenCalledTimes(1);
  });

  it("fails closed without a hook: throws (error page), not SCREEN-016", async () => {
    cookieHeader = sessionFor(staffId);
    await expect(requireRole(["officer"], "/officer")).rejects.toBeInstanceOf(PageAuditUnavailableError);
  });

  it("fails closed when the audit write throws", async () => {
    cookieHeader = sessionFor(staffId);
    const audit = vi.fn(async () => {
      throw new Error("audit down");
    });
    await expect(requireRole(["officer"], "/officer", { auditDenied: audit })).rejects.toThrow("audit down");
  });

  it("shows not-found on a parent-only page without a parent session, without audit", async () => {
    await expect(requireRole(["parent"], "/my-reports")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
