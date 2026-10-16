#!/usr/bin/env node
// npm run spend (TASK-059 / DECISION-017 / NFR-016 / D2B §14, §15.1, §16).
// Read-only report of the global AI spend budget against the local PostgreSQL
// cluster. Never changes the cap, never inserts or settles reservations, never
// reads .env* or prints the connection string.
//
// Exit codes
//   0  spend is below the cap
//   2  committed + reserved >= cap  (DECISION-017 hard cap; the API refuses
//                                  further paid calls with E-023)
//   4  configuration / connection / usage error
//
// The exit codes never replace the existing npm script failure semantics: a
// real failure (non-local host, missing URL, etc.) still exits 4 so CI shells
// and `npm test` runners can distinguish "over budget" from "script error".
import { createRequire } from "node:module";
import { assertLocalDatabaseUrl, assertDatabaseName, withDatabase, DEFAULT_DATABASE_URL } from "./db/guard.mjs";
import {
  STATUS,
  evaluateBudget,
  exitCodeForStatus,
  formatReport,
  isUsdString,
  safeUrl,
  toJsonReport,
  TODAY_SPEND_SQL,
  usdToMicros,
} from "./spend/lib.mjs";

const require = createRequire(import.meta.url);
const { Client } = require("pg");

const USAGE = "Usage: npm run spend [--json] [--explain]";

const SPEND_CAP_ENV = "AI_SPEND_CAP_USD";
const SPEND_CAP_LABEL = "AI_SPEND_CAP_USD";

function parseArgs(argv) {
  const out = { json: false, explain: false, help: false, errors: [] };
  for (const arg of argv.slice(2)) {
    if (arg === "--json") out.json = true;
    else if (arg === "--explain") out.explain = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    // Arguments may be credentials or private text, including positional
    // values and malformed flags. Never echo any unrecognised input.
    else out.errors.push("unknown argument");
  }
  return out;
}

function helpText() {
  return [
    "npm run spend — Fera AI spend report (TASK-059 / DECISION-017 / NFR-016)",
    "",
    "Reads the ai_budget row from a local PostgreSQL database and prints",
    "cap, committed, reserved, today (settled spend in Asia/Dhaka), remaining,",
    "and a status line. Exits 2 when committed + reserved reaches the cap, or",
    "4 on a configuration/connection/usage error.",
    "",
    "Environment:",
    "  FERA_DB_NAME         database name (default 'fera'; must match ^fera[a-z0-9_]*$)",
    `  ${SPEND_CAP_ENV}     if set, the CLI compares this six-decimal USD string with`,
    "                        ai_budget.cap_usd and exits 4 with a mismatch message;",
    "                        the database value stays the enforced authority (OD-059-3).",
    "                        Unset = no comparison. NOT read from any .env* file.",
    "  DATABASE_URL         NOT read; spend always uses the FERA_DB_ADMIN_URL fallback",
    "                        or the local default 127.0.0.1:54322 (guarded by assertLocalDatabaseUrl).",
    "",
    "Flags:",
    "  --json     emit a single JSON object on stdout",
    "  --explain  print this help and exit 0",
    "  --help     same as --explain",
    "",
    "Exit codes:",
    "  0  ok (under the cap)",
    "  2  at or above the cap (spend cannot proceed; manual form per BR-023)",
    "  4  usage / connection / configuration error",
    "",
  ].join("\n");
}

async function readBudget(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 10_000 });
  await client.connect();
  try {
    // We never read .env* or use libpq env vars here; connection parameters
    // in the URL are refused by guard.mjs. The read is a single non-locking
    // SELECT: the schema's CHECK invariants are the authority, and any
    // concurrent reservation is committed before being reported as "reserved".
    //
    // D2B §14: "today's and total spend vs `AI_SPEND_CAP_USD`". Today's spend
    // is the sum of settled `actual_usd` for reservations whose `settled_at`
    // falls on the current date in Asia/Dhaka; the SQL `AT TIME ZONE` keeps
    // the boundary in the spec's timezone, not the server's. `::text` returns
    // numeric(10,6) as an exact string so the lib can stay floating-point-free.
    const { rows } = await client.query(
      "SELECT cap_usd::text AS cap, committed_usd::text AS committed, reserved_usd::text AS reserved, " +
        `${TODAY_SPEND_SQL} AS today ` +
        "FROM ai_budget WHERE id = true",
    );
    if (rows.length !== 1) throw new Error("ai_budget row not found; run `npm run db:reset` first");
    return { cap: rows[0].cap, committed: rows[0].committed, reserved: rows[0].reserved, today: rows[0].today };
  } finally {
    await client.end().catch(() => undefined);
  }
}

function fail(code, message) {
  // Failures go to stderr in plain text; the JSON consumer is told via --json
  // and never gets here (script errors exit before JSON output).
  process.stderr.write(`spend: ${message}\n`);
  process.exit(code);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || args.explain) {
    process.stdout.write(helpText());
    process.exit(0);
  }
  if (args.errors.length) {
    process.stderr.write(`${args.errors.join("\n")}\n${USAGE}\n`);
    process.exit(4);
  }

  let targetForPg;
  let targetForDisplay;
  let envCapRaw;
  try {
    // guard.mjs never reads .env* and never prints credentials; assertLocalDatabaseUrl
    // throws on any non-loopback host and on any connection parameter in the query
    // string. assertDatabaseName restricts the target to the fera-prefixed family.
    const admin = assertLocalDatabaseUrl(process.env.FERA_DB_ADMIN_URL ?? DEFAULT_DATABASE_URL, "spend");
    const dbName = assertDatabaseName(process.env.FERA_DB_NAME ?? "fera");
    const target = withDatabase(admin, dbName);
    // pg needs the real URL (with password) to authenticate. The safe URL
    // (host:port/dbname only, no userinfo) is used for DB-error messages: we
    // never write either form to stdout.
    targetForPg = target.href;
    targetForDisplay = safeUrl(target);
    envCapRaw = process.env[SPEND_CAP_ENV];
  } catch (err) {
    return fail(4, err instanceof Error ? err.message : String(err));
  }

  let budgetRow;
  try {
    budgetRow = await readBudget(targetForPg);
  } catch (err) {
    // The error code (e.g. ECONNREFUSED, 28000 invalid authorization) is safe;
    // the message may carry the URL or a server hint we don't want to surface.
    // We print only `host:port/dbname` (safeUrl strips username and password)
    // and the pg error code, or a generic label if the driver gave us none.
    const code = err && typeof err === "object" && "code" in err && err.code ? ` (code ${String(err.code)})` : "";
    return fail(4, `database error (${targetForDisplay})${code}`);
  }

  // OD-059-3: the app does not read AI_SPEND_CAP_USD; DECISION-017's "raise cap
  // via env" is not implemented. The CLI only compares the env var with the DB
  // cap so an operator can spot drift. Unset = silent. Invalid format or
  // mismatch is an error, because silent acceptance is the kind of thing the
  // spec pack warns against. The comparison is numeric (usdToMicros) so that
  // "25" and "25.0" and "25.000000" all agree with the DB value 25.000000.
  if (envCapRaw !== undefined && envCapRaw !== "") {
    if (!isUsdString(envCapRaw)) {
      return fail(4, `invalid ${SPEND_CAP_LABEL} (not a USD amount); the database value is enforced`);
    }
    if (usdToMicros(envCapRaw) !== usdToMicros(budgetRow.cap)) {
      return fail(
        4,
        `cap mismatch: ${SPEND_CAP_LABEL}=${envCapRaw} but database cap_usd=${budgetRow.cap}; the database value is enforced`,
      );
    }
  }

  let report;
  try {
    report = evaluateBudget(budgetRow);
  } catch (err) {
    return fail(4, err instanceof Error ? err.message : String(err));
  }

  if (args.json) {
    process.stdout.write(JSON.stringify(toJsonReport(report)) + "\n");
  } else {
    process.stdout.write(formatReport(report));
  }
  process.exit(exitCodeForStatus(report.status));
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(process.argv[1], "file://").href;
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`spend: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(4);
  });
}

export {
  parseArgs,
  readBudget,
  helpText,
  SPEND_CAP_ENV,
  // Re-exported for tests
  USAGE,
  STATUS,
};
