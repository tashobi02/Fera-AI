// npm run seed [-- --set demo|full] [--allow-recode] — loads the synthetic reference/demo data (TASK-009).
//
// Today this loads the 64 districts and their adjacency only. The synthetic case set and
// demo users arrive with TASK-010/TASK-019; `--set` is accepted so the command line is
// already stable, and it does not load records yet (it says so).
//
// Local only, like seed-users: it connects with the owner URL (FERA_DB_ADMIN_URL, default
// the local fera-db container) to FERA_DB_NAME (default `fera`) through guard.mjs, which
// refuses any non-loopback host. Re-running is safe (upsert + replace adjacency).
import { pathToFileURL } from "node:url";
import pg from "pg";
import { DEFAULT_DATABASE_URL, assertDatabaseName, assertLocalDatabaseUrl, withDatabase } from "../../scripts/db/guard.mjs";
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
  try {
    counts = await seedDistricts(client, data, { allowRecode });
  } finally {
    await client.end();
  }
  console.log(JSON.stringify({
    database: target.pathname.slice(1),
    loaded: counts,
    set: set ?? null,
    note: set ? "records for --set are not loaded yet (TASK-010/TASK-019); districts only" : undefined,
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
