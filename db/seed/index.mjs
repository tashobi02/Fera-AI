// npm run seed [-- --set demo|full] [--allow-recode] — loads the synthetic reference/demo data (TASK-009).
//
// Always loads the 64 districts and their adjacency. With `--set demo|full` it then loads the
// synthetic cases (db/seed/cases.mjs, TASK-019): `demo` = Kamalapur boy, Narayanganj decoy,
// Mim, Mim's public-post duplicate and Sabbir (Rafi is created live by voice, OD-010-4);
// `full` = all 200 records. It needs the staff accounts from `npm run seed:users`. Re-running
// inserts no case twice. Without `--set` no case is loaded.
//
// Local only, like seed-users: it connects with the owner URL (FERA_DB_ADMIN_URL, default
// the local fera-db container) to FERA_DB_NAME (default `fera`) through guard.mjs, which
// refuses any non-loopback host. Re-running is safe (upsert + replace adjacency).
import { pathToFileURL } from "node:url";
import pg from "pg";
import { DEFAULT_DATABASE_URL, assertDatabaseName, assertLocalDatabaseUrl, withDatabase } from "../../scripts/db/guard.mjs";
import { seedCases } from "./cases.mjs";
import { loadDistrictData, seedDistricts } from "./districts.mjs";

const SETS = new Set(["demo", "full"]);

export function parseArgs(argv) {
  let set = null;
  let allowRecode = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--allow-recode") {
      allowRecode = true;
      continue;
    }
    if (arg === "--set") {
      set = argv[++i];
    } else if (arg.startsWith("--set=")) {
      set = arg.slice("--set=".length);
    } else {
      throw new Error(`unknown argument ${arg}`);
    }
    if (!SETS.has(set)) throw new Error("--set must be demo or full");
  }
  return { set, allowRecode };
}

async function main() {
  const { set, allowRecode } = parseArgs(process.argv.slice(2));
  const server = assertLocalDatabaseUrl(process.env.FERA_DB_ADMIN_URL ?? DEFAULT_DATABASE_URL);
  const target = withDatabase(server, assertDatabaseName(process.env.FERA_DB_NAME ?? "fera"));
  const data = loadDistrictData();
  const client = new pg.Client({ connectionString: target.href, connectionTimeoutMillis: 10_000 });
  await client.connect();
  let counts;
  let cases;
  const started = Date.now();
  try {
    counts = await seedDistricts(client, data, { allowRecode });
    if (set) cases = await seedCases(client, { set });
  } finally {
    await client.end();
  }
  console.log(JSON.stringify({
    database: target.pathname.slice(1),
    loaded: counts,
    set: set ?? null,
    cases,
    elapsed_ms: Date.now() - started,
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    // pg errors can echo parameters; print the error code or the guard message only.
    const code = err && typeof err === "object" && "code" in err ? ` (code ${String(err.code)})` : "";
    const message = err instanceof Error && !code ? err.message : "database error";
    console.error(`seed failed: ${message}${code}`);
    process.exit(1);
  });
}
