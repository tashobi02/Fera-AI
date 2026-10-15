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

  it("follows SEED_ADMIN_USER the way the seed does, and ignores an invalid one", () => {
    expect(demoAccounts({ DEMO_MODE: "1", SEED_ADMIN_USER: "desk.admin" })?.at(-1)).toEqual({ username: "desk.admin", role: "admin" });
    expect((seedAccounts({ SEED_ADMIN_USER: "desk.admin" }) as SeedAccount[])[0].username).toBe("desk.admin");
    expect(demoAccounts({ DEMO_MODE: "1", SEED_ADMIN_USER: "Bad Name!" })?.at(-1)?.username).toBe("admin.demo");
  });

  it("carries no password, not even the committed local defaults", () => {
    const json = JSON.stringify(demoAccounts({ DEMO_MODE: "1" }));
    expect(json).not.toMatch(/pass/i);
    for (const value of Object.values(LOCAL_SEED_PASSWORDS as Record<string, string>)) expect(json).not.toContain(value);
    for (const account of demoAccounts({ DEMO_MODE: "1" }) ?? []) expect(Object.keys(account).sort()).toEqual(["role", "username"]);
  });
});
