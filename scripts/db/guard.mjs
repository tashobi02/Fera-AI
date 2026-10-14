// db:reset drops a database, so it only ever runs against this machine (CLAUDE.md:
// never db:reset against a non-local database).
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export const DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export function assertLocalDatabaseUrl(raw) {
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
    throw new Error("db:reset refuses a non-local database host");
  }
  return url;
}

export function maskUrl(url) {
  const copy = new URL(url.href);
  if (copy.password) copy.password = "***";
  return copy.href;
}

// The maintenance URL connects to the server's `postgres` database so `fera` can be dropped.
export function withDatabase(url, name) {
  const copy = new URL(url.href);
  copy.pathname = `/${name}`;
  return copy;
}
