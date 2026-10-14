// TASK-006: page guards for server components (D3 §1 role homes, S-008 return URL,
// S-016 for wrong role; BR-024). next/headers and next/navigation are mocked.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testParent, testUser } from "../support/principals";

const cookieValues = new Map<string, string[]>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: (name: string) => (cookieValues.get(name) ?? []).map((value) => ({ name, value })) }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const { decideAccess, requireRole, roleHome, safeReturnPath, signInPath } = await import("@/server/auth/require-role");

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
  beforeEach(() => cookieValues.clear());

  it("redirects a signed-out visitor to sign-in with the return path", async () => {
    await expect(requireRole(["officer"], "/officer/queue")).rejects.toMatchObject({ url: "/sign-in?next=%2Fofficer%2Fqueue" });
  });

  it("treats a garbage session cookie as signed out without touching the database", async () => {
    cookieValues.set("fera_session", ["garbage"]);
    await expect(requireRole(["staff"], "/staff")).rejects.toMatchObject({ url: "/sign-in?next=%2Fstaff" });
  });

  it("shows not-found on a parent-only page without a parent session", async () => {
    await expect(requireRole(["parent"], "/my-reports")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
