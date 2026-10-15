// TASK-031: SCREEN-008 demo account hint. Only with DEMO_MODE=1, usernames only, and
// only accounts that scripts/db/seed-users.mjs actually seeds.
import { describe, expect, it } from "vitest";
import { demoAccounts } from "@/server/auth/demo-accounts";
// @ts-expect-error -- plain ESM script without type declarations
import { LOCAL_SEED_PASSWORDS, seedAccounts } from "../../scripts/db/seed-users.mjs";

type SeedAccount = { username: string; role: string; verified: boolean };

describe("demoAccounts", () => {
  it("is off unless DEMO_MODE is exactly 1", () => {
    for (const DEMO_MODE of [undefined, "", "0", "true", "yes", " 1"]) expect(demoAccounts({ DEMO_MODE })).toBeNull();
  });

  it("lists one seeded username per role, matching the seed's role and verification", () => {
    const seeded = new Map((seedAccounts({}) as SeedAccount[]).map((a) => [a.username, a]));
    const shown = demoAccounts({ DEMO_MODE: "1" });
    expect(shown?.map((a) => a.role)).toEqual(["staff", "officer", "officer-unverified", "admin"]);
    for (const account of shown ?? []) {
      const seed = seeded.get(account.username);
      expect(seed, account.username).toBeDefined();
      const role = seed!.role === "officer" ? (seed!.verified ? "officer" : "officer-unverified") : seed!.role;
      expect(role).toBe(account.role);
    }
  });

  it("is off on Vercel even with DEMO_MODE=1 (hosted deploys never list accounts)", () => {
    expect(demoAccounts({ DEMO_MODE: "1", VERCEL: "1" })).toBeNull();
  });

  it("never shows a configured SEED_ADMIN_USER: the admin row is the fixed default or absent", () => {
    expect(demoAccounts({ DEMO_MODE: "1" })?.at(-1)).toEqual({ username: "admin.demo", role: "admin" });
    expect(demoAccounts({ DEMO_MODE: "1", SEED_ADMIN_USER: "admin.demo" })?.at(-1)).toEqual({ username: "admin.demo", role: "admin" });
    const renamed = demoAccounts({ DEMO_MODE: "1", SEED_ADMIN_USER: "desk.admin" });
    expect(JSON.stringify(renamed)).not.toContain("desk.admin");
    expect(renamed?.some((a) => a.role === "admin")).toBe(false);
  });

  it("carries no password, not even the committed local defaults", () => {
    const json = JSON.stringify(demoAccounts({ DEMO_MODE: "1" }));
    expect(json).not.toMatch(/pass/i);
    for (const value of Object.values(LOCAL_SEED_PASSWORDS as Record<string, string>)) expect(json).not.toContain(value);
    for (const account of demoAccounts({ DEMO_MODE: "1" }) ?? []) expect(Object.keys(account).sort()).toEqual(["role", "username"]);
  });
});
