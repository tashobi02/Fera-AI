// npm run test:db — PostgreSQL 16 integration tests (TASK-062). Each test file gets its
// own fresh database `fera_test_<pid>_<n>` (schema_v2.sql + roles.sql via db:reset), so
// runs never touch another lane's `fera` database or each other; it is dropped afterwards.
import { execFileSync, spawnSync } from "node:child_process";
import { DEFAULT_DATABASE_URL, assertDatabaseName, assertLocalDatabaseUrl, scrubbedEnv, withDatabase } from "./guard.mjs";

const FILES = ["tests/db/platform.test.ts", "tests/db/redaction.test.ts", "tests/db/auth.test.ts", "tests/db/case.test.ts", "tests/db/outputs.test.ts", "tests/db/submit.test.ts"];

function dropDatabase(name) {
  const server = withDatabase(assertLocalDatabaseUrl(process.env.FERA_DB_ADMIN_URL ?? DEFAULT_DATABASE_URL), "postgres");
  const password = decodeURIComponent(server.password);
  server.password = "";
  execFileSync("psql", [server.href, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", `DROP DATABASE IF EXISTS ${name} WITH (FORCE)`], {
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...scrubbedEnv(), PGCONNECT_TIMEOUT: "10", ...(password ? { PGPASSWORD: password } : {}) },
  });
}

let failed = false;
for (const [i, file] of FILES.entries()) {
  const name = assertDatabaseName(`fera_test_${process.pid}_${i}`);
  const env = { ...process.env, FERA_DB_NAME: name, FERA_DB_TESTS: "1" };
  try {
    const reset = spawnSync("node", ["scripts/db/reset.mjs"], { stdio: "inherit", env });
    if (reset.status !== 0) throw new Error(`db:reset failed for ${name}`);
    const run = spawnSync("npx", ["vitest", "run", file], { stdio: "inherit", env });
    if (run.status !== 0) failed = true;
  } catch (err) {
    console.error(`test:db: ${err instanceof Error ? err.message : String(err)}`);
    failed = true;
  } finally {
    try {
      dropDatabase(name);
    } catch {
      console.error(`test:db: could not drop ${name}`);
      failed = true;
    }
  }
}
process.exit(failed ? 1 : 0);
