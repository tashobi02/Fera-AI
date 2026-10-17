#!/usr/bin/env node
// eval:audit — audit coverage (D2B §17 GOAL-008; TC-016, TC-020 part).
//
// Audit coverage over the LOCAL database only (use scripts/db/guard.mjs the way
// scripts/spend.mjs does; refuse non-loopback URLs). Counts the number of
// "case decisions" (match_candidates decided, referral rows, case closures)
// and the share that have a matching audit_log row; prints numerator and
// denominator. Zero decisions -> "not measured (0 decisions)" and exit 0.
//
// Definitions (read from db/schema_v2.sql and src/server/case/*.ts; do NOT
// guess action names):
//
//   - match_candidates row is a human "decision" when status is 'confirmed' or
//     'rejected'. 'voided' rows are system invalidations (audited as match.voided)
//     and 'superseded' has no writer or audit action, so neither is a decision. It is considered audited when an audit_log row with
//     action = 'match.confirm' (for status='confirmed') or
//     'match.reject' (for status='rejected') exists and refers to the same
//     candidate_id (candidate_id equality only, so another candidate's row on the
//     same case cannot cover it; the writer is src/server/case/decision.ts:193/220).
//
//   - referrals row is audited when an audit_log row with
//     action = 'referral.recorded' exists for the same candidate_id.
//
//   - case closure is a case with status IN ('closed','referred'). It is
//     audited when an audit_log row with action = 'case.closed' (for
//     status='closed') or 'referral.recorded' (for status='referred') exists
//     for that case_id (case_id equality only). The contract names the actions; the only state
//     transition that lands a case in 'referred' is the confirm path which
//     audits referral.recorded (see decision.ts:235-241); 'closed' is
//     recorded by API-011 with action = 'case.closed' (close.ts:68).
//
// Exit codes: 0 on success (including "not measured"), 1 on database error.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { Client } = require("pg");

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const { DEFAULT_DATABASE_URL, assertLocalDatabaseUrl, assertDatabaseName, withDatabase } = require(resolve(REPO_ROOT, "scripts/db/guard.mjs"));

const USAGE = "Usage: node eval/audit.mjs [--help]";

const COVERAGE_SQL = `
  WITH decisions AS (
    -- Decided match_candidates
    SELECT
      mc.id::text AS decision_id,
      'match_candidate'::text AS decision_kind,
      mc.missing_case_id::text AS case_id,
      mc.found_case_id::text AS case_id_alt,
      mc.id::text AS candidate_id,
      CASE WHEN mc.status = 'confirmed' THEN 'match.confirm'
           WHEN mc.status = 'rejected' THEN 'match.reject'
           ELSE NULL END AS required_action
    FROM match_candidates mc
    WHERE mc.status IN ('confirmed', 'rejected')

    UNION ALL

    -- Referral rows
    SELECT
      r.id::text,
      'referral',
      r.missing_case_id::text,
      r.found_case_id::text,
      r.candidate_id::text,
      'referral.recorded'
    FROM referrals r

    UNION ALL

    -- Case closures
    SELECT
      c.id::text,
      'case_closure',
      c.id::text,
      NULL,
      NULL,
      CASE WHEN c.status = 'closed' THEN 'case.closed'
           WHEN c.status = 'referred' THEN 'referral.recorded'
           ELSE NULL END
    FROM cases c
    WHERE c.status IN ('closed', 'referred')
  )
  SELECT
    d.decision_kind,
    d.required_action,
    COUNT(*)::bigint AS total,
    COUNT(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM audit_log a
      WHERE a.action = d.required_action
        AND CASE d.decision_kind
              WHEN 'case_closure' THEN a.case_id = d.case_id::uuid
              ELSE a.candidate_id = d.candidate_id::uuid
            END
    ))::bigint AS covered
  FROM decisions d
  GROUP BY d.decision_kind, d.required_action
  ORDER BY d.decision_kind, d.required_action;
`;

function parseArgs(argv) {
  const out = { help: false, errors: [] };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else out.errors.push(`unknown argument: ${arg}`);
  }
  return out;
}

function helpText() {
  return [
    "node eval/audit.mjs — Audit coverage (D2B §17, GOAL-008).",
    "",
    "Reads a local PostgreSQL database (default: 127.0.0.1:54322, database 'fera')",
    "and counts case decisions (decided match_candidates, referral rows, case",
    "closures) plus the share with a matching audit_log row. Exits 0 on success",
    "and on empty inputs (prints 'not measured').",
    "",
    "Environment:",
    "  FERA_DB_ADMIN_URL  admin URL (default local)",
    "  FERA_DB_NAME       database name (default 'fera')",
    "",
  ].join("\n");
}

function notMeasured(reason) {
  return `eval:audit: not measured (${reason})`;
}

function fail(message, code = 1) {
  process.stderr.write(`eval:audit: ${message}\n`);
  process.exit(code);
}

async function readCoverage(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 10_000 });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const { rows } = await client.query(COVERAGE_SQL);
    return rows;
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end().catch(() => undefined);
  }
}

function summarise(rows) {
  let total = 0;
  let covered = 0;
  for (const r of rows) {
    total += Number(r.total);
    covered += Number(r.covered);
  }
  return { total, covered, missing: total - covered };
}

function report({ rows, total, covered, missing }) {
  const lines = [];
  lines.push("eval:audit summary");
  for (const r of rows) {
    const t = Number(r.total);
    const c = Number(r.covered);
    lines.push(
      `  ${r.decision_kind} (${r.required_action}): covered=${c}/${t}`,
    );
  }
  if (total === 0) {
    lines.push("  numerator: n/a");
    lines.push("  denominator: 0");
  } else {
    const pct = ((covered / total) * 100).toFixed(2);
    lines.push(`  numerator:   ${covered}`);
    lines.push(`  denominator: ${total}`);
    lines.push(`  audit-row presence: ${pct}% (${missing} without a matching audit row)`);
    lines.push("  note: counts records, not decisions: one confirm yields a candidate, a referral and a referred-case record; actor role and review_decisions are not checked");
  }
  return lines.join("\n");
}

export async function run({ databaseUrl, stdout = process.stdout.write.bind(process.stdout) }) {
  const rows = await readCoverage(databaseUrl);
  const summary = summarise(rows);
  if (summary.total === 0) {
    stdout(notMeasured("0 decisions") + "\n");
    return { measured: false, reason: "empty", rows: [] };
  }
  stdout(
    report({
      rows,
      total: summary.total,
      covered: summary.covered,
      missing: summary.missing,
    }) + "\n",
  );
  return { measured: true, ...summary, rows };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    process.stdout.write(helpText());
    process.exit(0);
  }
  if (args.errors.length) {
    process.stderr.write(`${args.errors.join("; ")}\n${USAGE}\n`);
    process.exit(2);
  }
  let target;
  try {
    const admin = assertLocalDatabaseUrl(process.env.FERA_DB_ADMIN_URL ?? DEFAULT_DATABASE_URL, "eval:audit");
    const dbName = assertDatabaseName(process.env.FERA_DB_NAME ?? "fera");
    target = withDatabase(admin, dbName).href;
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err), 1);
  }
  try {
    await run({ databaseUrl: target });
    process.exit(0);
  } catch (err) {
    // pg errors may echo the connection string; print only the code.
    const code = err && typeof err === "object" && "code" in err ? ` (code ${String(err.code)})` : "";
    return fail(`database error${code}`, 1);
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(process.argv[1], "file://").href;
if (invokedDirectly) {
  main();
}

export const __test = { parseArgs, summarise, helpText, COVERAGE_SQL };
