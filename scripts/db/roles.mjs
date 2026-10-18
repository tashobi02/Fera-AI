// Runtime role passwords for db/roles.sql (TASK-062). The defaults are for the local,
// loopback-only, synthetic dev cluster and are not secrets; a hosted database sets its
// own values through the operator procedure in docs/execution/evidence/platform-db-invariants.md.
import { DEFAULT_DATABASE_URL, assertLocalDatabaseUrl } from "./guard.mjs";

export const LOCAL_ROLE_PASSWORDS = {
  FERA_APP_DB_PASSWORD: "fera_app_local_dev",
  FERA_REDACTOR_DB_PASSWORD: "fera_redactor_local_dev",
};

// An empty value counts as unset. The local defaults are only handed out when the admin
// connection is local, so they can never be applied to a hosted cluster by accident.
export function rolePasswordEnv(env = process.env) {
  const out = {};
  for (const [key, fallback] of Object.entries(LOCAL_ROLE_PASSWORDS)) {
    const value = env[key];
    if (value) {
      out[key] = value;
      continue;
    }
    if (value === "") console.warn(`${key} is empty; treating it as unset`);
    assertLocalDatabaseUrl(env.FERA_DB_ADMIN_URL ?? DEFAULT_DATABASE_URL);
    out[key] = fallback;
  }
  return out;
}
