// Runtime role passwords for db/roles.sql (TASK-062). The defaults are for the local,
// loopback-only, synthetic dev cluster and are not secrets; a hosted database sets its
// own values through the operator procedure in docs/execution/evidence/platform-db-invariants.md.
export const LOCAL_ROLE_PASSWORDS = {
  FERA_APP_DB_PASSWORD: "fera_app_local_dev",
  FERA_REDACTOR_DB_PASSWORD: "fera_redactor_local_dev",
};

export function rolePasswordEnv(env = process.env) {
  return Object.fromEntries(Object.entries(LOCAL_ROLE_PASSWORDS).map(([key, fallback]) => [key, env[key] || fallback]));
}
