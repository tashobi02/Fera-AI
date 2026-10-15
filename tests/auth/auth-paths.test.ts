// TASK-031: SCREEN-008 destinations (D3 §1 role homes, §6 "return to the same URL";
// BR-024 unverified officer → staff home) and the shared return-path helpers.
import { describe, expect, it } from "vitest";
import { effectiveRole } from "@/contracts/access";
import {
  DESK_ENTRY_PATHS,
  destinationAfterSignIn,
  homeForSession,
  parseSignedInSession,
  returnTarget,
  roleHome,
  safeReturnPath,
  signInAudience,
  signInPath,
  type SignedInSession,
} from "@/lib/auth-paths";
import * as guards from "@/server/auth/require-role";
import { testUser } from "../support/principals";

const ID = "6b1f3c2a-4d5e-4f60-8a71-0000000000c1";

const staff: SignedInSession = { role: "staff", verified: false };
const officer: SignedInSession = { role: "officer", verified: true };
const pendingOfficer: SignedInSession = { role: "officer", verified: false };
const admin: SignedInSession = { role: "admin", verified: false };

describe("role → home after sign-in (D3 §1)", () => {
  it("maps each session to its D3 home, the unverified officer to the staff home", () => {
    expect(homeForSession(staff)).toBe("/staff");
    expect(homeForSession(officer)).toBe("/officer");
    expect(homeForSession(pendingOfficer)).toBe("/staff");
    expect(homeForSession(admin)).toBe("/admin");
  });

  it("agrees with the contracts' effectiveRole for every session shape", () => {
    for (const s of [staff, officer, pendingOfficer, admin, { role: "staff", verified: true } as const, { role: "admin", verified: true } as const]) {
      const role = effectiveRole(testUser(ID, s.role, { verified: s.verified }));
      expect(role).not.toBeNull();
      expect(homeForSession(s)).toBe(roleHome(role!));
    }
  });

  it("sends a plain entry (no next, /, /sign-in or a desk entry root) to the role home", () => {
    for (const next of [null, undefined, "", "/", "/sign-in", "/sign-in?next=%2Fofficer", ...DESK_ENTRY_PATHS, "/officer/", "/admin?x=1"]) {
      expect(destinationAfterSignIn(officer, next)).toBe("/officer");
      expect(destinationAfterSignIn(pendingOfficer, next)).toBe("/staff");
    }
    // The D3 §1 journey: an unverified officer enters at /officer and lands on the staff home.
    expect(destinationAfterSignIn(pendingOfficer, "/officer")).toBe("/staff");
  });

  it("returns to the same URL after an expired session (D3 §6)", () => {
    expect(destinationAfterSignIn(officer, "/officer/case/abc?tab=audit")).toBe("/officer/case/abc?tab=audit");
    expect(destinationAfterSignIn(staff, "/staff/found/new")).toBe("/staff/found/new");
    expect(returnTarget("/officer/queue")).toBe("/officer/queue");
  });

  it("reopens a path only inside the signed-in role's own area (OD-031-7)", () => {
    expect(destinationAfterSignIn(pendingOfficer, "/officer/case/abc")).toBe("/staff"); // no S-016 + access.denied
    expect(destinationAfterSignIn(staff, "/admin/users")).toBe("/staff");
    // D3 §1: admins read S-011 and S-012 under /officer, but nothing else there.
    expect(destinationAfterSignIn(admin, "/officer/map")).toBe("/officer/map");
    expect(destinationAfterSignIn(admin, "/officer/case/abc?tab=audit")).toBe("/officer/case/abc?tab=audit");
    expect(destinationAfterSignIn(admin, "/officer/queue")).toBe("/admin");
    expect(destinationAfterSignIn(admin, "/officer/mapping")).toBe("/admin");
    expect(destinationAfterSignIn(staff, "/officer/map")).toBe("/staff");
    expect(destinationAfterSignIn(pendingOfficer, "/officer/case/abc")).toBe("/staff");
    expect(destinationAfterSignIn(admin, "/admin/users?x=1")).toBe("/admin/users?x=1");
  });

  it("never returns to an API route or a build asset", () => {
    for (const next of ["/api", "/api/auth/sign-out", "/_next", "/_next/static/chunks/x.js", "/staff/../api/x"]) {
      expect(returnTarget(next)).toBeNull();
      expect(destinationAfterSignIn(staff, next)).toBe("/staff");
    }
    expect(returnTarget("/apiary")).toBe("/apiary"); // prefix match is by segment
  });

  it.each([
    "https://evil.example/",
    "//evil.example/x",
    "/\\evil.example",
    "/a/..//evil.com",
    "/%2e//evil.com",
    "/.%2e//evil.com",
    "javascript:alert(1)",
    "/x\u0000y",
    `/${"a".repeat(600)}`,
  ])("never follows an unsafe next %j: role home instead", (next) => {
    expect(returnTarget(next)).toBeNull();
    expect(destinationAfterSignIn(staff, next)).toBe("/staff");
  });
});

describe("SCREEN-008 title audience (D4 §14)", () => {
  it.each([
    ["/officer", "officer"],
    ["/officer/case/abc", "officer"],
    ["/staff", "staff"],
    ["/admin/users?x=1", "admin"],
    ["/", null],
    ["/officers", null],
    [null, null],
    ["//evil.example/officer", null],
  ] as const)("signInAudience(%j) = %j", (next, expected) => {
    expect(signInAudience(next)).toBe(expected);
  });
});

describe("API-020 success body", () => {
  it("accepts only a desk role with a boolean verified flag", () => {
    expect(parseSignedInSession({ user_id: ID, role: "officer", verified: false })).toEqual(pendingOfficer);
    expect(parseSignedInSession({ role: "parent", verified: false })).toBeNull();
    expect(parseSignedInSession({ role: "officer", verified: "true" })).toBeNull();
    expect(parseSignedInSession({ role: "officer" })).toBeNull();
    expect(parseSignedInSession(null)).toBeNull();
    expect(parseSignedInSession("officer")).toBeNull();
  });
});

describe("shared helpers", () => {
  it("the page guards re-export the same implementations", () => {
    expect(guards.safeReturnPath).toBe(safeReturnPath);
    expect(guards.signInPath).toBe(signInPath);
    expect(guards.roleHome).toBe(roleHome);
    expect(guards.SIGN_IN_PATH).toBe("/sign-in");
  });
});
