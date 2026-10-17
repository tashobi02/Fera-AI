// db:reset drops a database, so it only ever runs against this machine (CLAUDE.md:
// never db:reset against a non-local database). The optional `label` parameter
// names the caller (`db:reset` keeps the existing message byte-for-byte; "spend"
// mentions the AI spend CLI). scripts/db/ owner not listed in AGENTS.md (UNKNOWN);
// shared tooling, flagged for Mahim (lead) in the PR. This is the smallest
// possible change.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const DEFAULT_LABEL = "db:reset";

export const DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export function assertLocalDatabaseUrl(raw, label = DEFAULT_LABEL) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL");
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("DATABASE_URL must use the postgresql: scheme");
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`${label} refuses a non-local database host`);
  }
  // libpq lets ?host=, ?hostaddr= and ?service= override the authority host, so any
  // connection parameter in the query string is refused outright.
  if (url.search !== "" || url.hash !== "") {
    throw new Error(`${label} refuses connection parameters in DATABASE_URL`);
  }
  return url;
}

// psql inherits the environment, and PGHOST/PGHOSTADDR/PGSERVICE/PGSERVICEFILE (or any
// other PG* setting) could redirect it. Only the guarded URL may decide the target.
export function scrubbedEnv(env = process.env) {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith("PG")));
}

export function maskUrl(url) {
  const copy = new URL(url.href);
  if (copy.password) copy.password = "***";
  return copy.href;
}

// Only fera-prefixed names, so tests can use per-run databases (fera_test_<n>) safely.
export function assertDatabaseName(name) {
  if (typeof name !== "string" || !/^fera[a-z0-9_]{0,40}$/.test(name)) {
    throw new Error("FERA_DB_NAME must match ^fera[a-z0-9_]*$");
  }
  return name;
}

// The maintenance URL connects to the server's `postgres` database so `fera` can be dropped.
export function withDatabase(url, name) {
  const copy = new URL(url.href);
  copy.pathname = `/${name}`;
  return copy;
}
