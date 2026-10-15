// SCREEN-008 demo account hint (D3: visible only when DEMO_MODE=1, read on the server).
//
// - Only on the finale laptop stack: DEMO_MODE=1 and not on Vercel, so a hosted deploy
//   that sets DEMO_MODE never advertises account names.
// - Usernames only, one per role, from scripts/db/seed-users.mjs (tests/auth/demo-accounts
//   keeps them in step). Passwords are never shown: outside plain local dev the seed
//   requires SEED_ADMIN_PASSWORD / SEED_USER_PASSWORD chosen on the day, so no password is
//   documented as demo-safe.
// - The admin row is the fixed seed default `admin.demo`. A configured SEED_ADMIN_USER is
//   never shown; when it renames the admin, the admin row is left out instead.
import type { DemoAccount } from "@/lib/demo-accounts";

export type { DemoAccount, DemoAccountRole } from "@/lib/demo-accounts";

const DEFAULT_ADMIN = "admin.demo";

export function demoAccounts(env: Record<string, string | undefined> = process.env): readonly DemoAccount[] | null {
  if (env.DEMO_MODE !== "1" || env.VERCEL) return null;
  const adminRenamed = Boolean(env.SEED_ADMIN_USER) && env.SEED_ADMIN_USER !== DEFAULT_ADMIN;
  return [
    { username: "staff.demo", role: "staff" },
    { username: "officer.demo", role: "officer" },
    { username: "officer.pending", role: "officer-unverified" },
    ...(adminRenamed ? [] : [{ username: DEFAULT_ADMIN, role: "admin" } as const]),
  ];
}
