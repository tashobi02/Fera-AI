// npm run seed:users — synthetic staff/officer/admin accounts (TASK-006; D2B §15.5:
// 1 admin, 2 verified officers, 1 unverified officer, 2 staff; FR-035 [MOCK] verification).
//
// Local only: it connects with the owner/admin URL (FERA_DB_ADMIN_URL, default the local
// fera-db container) to database FERA_DB_NAME (default `fera`), through guard.mjs, which
// refuses any non-loopback host. fera_app cannot insert users, so seeding is owner work.
// Re-running resets each seeded account (password, role, verification, active) — the
// D2A §9.5 "re-seed" recovery path. Other accounts are untouched.
//
// Passwords: SEED_ADMIN_PASSWORD for the admin, SEED_USER_PASSWORD for the five desk
// accounts, each 16–200 characters (NFC-normalised, as the app verifies them);
// SEED_ADMIN_USER renames the admin. The committed local defaults below apply only to
// a plain local dev run: the default admin URL and database, without DEMO_MODE=1 or
// NODE_ENV=production. Anything else — the finale laptop (DEMO_MODE=1), a production
// build, an overridden FERA_DB_ADMIN_URL or FERA_DB_NAME — needs both passwords set
// explicitly in the environment. Passwords are never printed.
import { hash } from "@node-rs/argon2";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { DEFAULT_DATABASE_URL, assertDatabaseName, assertLocalDatabaseUrl, withDatabase } from "./guard.mjs";

// Must equal ARGON2_PARAMS in src/server/auth/password.ts (verifyPassword accepts no other).
const ARGON2_PARAMS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 };

export const LOCAL_SEED_PASSWORDS = {
  SEED_ADMIN_PASSWORD: "fera-local-admin-pass",
  SEED_USER_PASSWORD: "fera-local-desk-pass",
};
const MIN_PASSWORD = 16;
const USERNAME = /^[a-z0-9._-]{3,32}$/;

export function seedAccounts(env = process.env) {
  const admin = env.SEED_ADMIN_USER || "admin.demo";
  if (!USERNAME.test(admin)) throw new Error("SEED_ADMIN_USER must match ^[a-z0-9._-]{3,32}$");
  return [
    { username: admin, display_name: "[MOCK] অ্যাডমিন", role: "admin", verified: false, secret: "SEED_ADMIN_PASSWORD" },
    { username: "officer.demo", display_name: "[MOCK] কর্মকর্তা এক", role: "officer", verified: true, secret: "SEED_USER_PASSWORD" },
    { username: "officer2.demo", display_name: "[MOCK] কর্মকর্তা দুই", role: "officer", verified: true, secret: "SEED_USER_PASSWORD" },
    { username: "officer.pending", display_name: "[MOCK] অযাচাইকৃত কর্মকর্তা", role: "officer", verified: false, secret: "SEED_USER_PASSWORD" },
    { username: "staff.demo", display_name: "[MOCK] স্টাফ এক", role: "staff", verified: false, secret: "SEED_USER_PASSWORD" },
    { username: "staff2.demo", display_name: "[MOCK] স্টাফ দুই", role: "staff", verified: false, secret: "SEED_USER_PASSWORD" },
  ];
}

// Why the committed defaults may not be used, or null when they may.
export function defaultsRefusedBecause(env = process.env) {
  if (env.DEMO_MODE === "1") return "DEMO_MODE=1";
  if (env.NODE_ENV === "production") return "NODE_ENV=production";
  if (env.FERA_DB_ADMIN_URL) return "FERA_DB_ADMIN_URL is set";
  if (env.FERA_DB_NAME) return "FERA_DB_NAME is set";
  return null;
}

export function seedPasswords(env = process.env) {
  const refused = defaultsRefusedBecause(env);
  const out = {};
  for (const [key, fallback] of Object.entries(LOCAL_SEED_PASSWORDS)) {
    if (!env[key] && refused) throw new Error(`${key} must be set explicitly (${refused}); the local defaults are for plain local dev only`);
    const value = (env[key] || fallback).normalize("NFC");
    if (value.length < MIN_PASSWORD || value.length > 200) throw new Error(`${key} must be 16–200 characters`);
    out[key] = value;
  }
  return out;
}

async function main() {
  const server = assertLocalDatabaseUrl(process.env.FERA_DB_ADMIN_URL ?? DEFAULT_DATABASE_URL);
  const target = withDatabase(server, assertDatabaseName(process.env.FERA_DB_NAME ?? "fera"));
  const passwords = seedPasswords();
  const accounts = seedAccounts();
  const client = new pg.Client({ connectionString: target.href, connectionTimeoutMillis: 10_000 });
  await client.connect();
  try {
    await client.query("BEGIN");
    for (const a of accounts) {
      const passwordHash = await hash(passwords[a.secret], ARGON2_PARAMS);
      await client.query(
        `INSERT INTO users (username, display_name, password_hash, role, verified, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (username) DO UPDATE SET display_name = EXCLUDED.display_name,
           password_hash = EXCLUDED.password_hash, role = EXCLUDED.role,
           verified = EXCLUDED.verified, is_active = true`,
        [a.username, a.display_name, passwordHash, a.role, a.verified],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    await client.end();
  }
  const source = (key) => (process.env[key] ? "env" : "local default");
  console.log(JSON.stringify({
    database: target.pathname.slice(1),
    accounts: accounts.map(({ username, role, verified }) => ({ username, role, verified })),
    passwords: { admin: source("SEED_ADMIN_PASSWORD"), desk: source("SEED_USER_PASSWORD") },
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    // pg errors can echo parameters; print the error code or the guard message only.
    const code = err && typeof err === "object" && "code" in err ? ` (code ${String(err.code)})` : "";
    const message = err instanceof Error && !code ? err.message : "database error";
    console.error(`seed:users failed: ${message}${code}`);
    process.exit(1);
  });
}
