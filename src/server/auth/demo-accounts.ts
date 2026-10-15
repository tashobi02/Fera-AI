// SCREEN-008 demo account hint (D3: visible only when DEMO_MODE=1, read on the server).
//
// Usernames only, one per role, from scripts/db/seed-users.mjs (tests/auth/demo-accounts
// keeps them in step). Passwords are never shown: outside plain local dev the seed
// requires SEED_ADMIN_PASSWORD / SEED_USER_PASSWORD chosen on the day, so no password is
// documented as demo-safe.
export type DemoAccountRole = "staff" | "officer" | "officer-unverified" | "admin";
export type DemoAccount = { username: string; role: DemoAccountRole };

// Same rule and default as seedAccounts() in scripts/db/seed-users.mjs.
const USERNAME = /^[a-z0-9._-]{3,32}$/;
const DEFAULT_ADMIN = "admin.demo";

export function demoAccounts(env: Record<string, string | undefined> = process.env): readonly DemoAccount[] | null {
  if (env.DEMO_MODE !== "1") return null;
  const admin = env.SEED_ADMIN_USER && USERNAME.test(env.SEED_ADMIN_USER) ? env.SEED_ADMIN_USER : DEFAULT_ADMIN;
  return [
    { username: "staff.demo", role: "staff" },
    { username: "officer.demo", role: "officer" },
    { username: "officer.pending", role: "officer-unverified" },
    { username: admin, role: "admin" },
  ];
}
