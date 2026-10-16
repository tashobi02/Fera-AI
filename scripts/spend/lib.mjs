// TASK-059 / DECISION-017 / NFR-016 / D2B §14, §15.1, §16 DECISION-017.
// Read-only USD exact-decimal formatting and exit-code policy for `npm run spend`.
// This module never reads the filesystem (no .env*, no connection strings); the CLI
// passes in a pre-guarded local database URL and the already-read budget row.
const USD_RE = /^(0|[1-9][0-9]{0,3})(\.[0-9]{1,6})?$/;

// The boundary expression for "today" in Asia/Dhaka (D2B §14). The CLI and
// boundary test both rely on this exact phrase; exporting it keeps the test
// honest (it exercises the same SQL the CLI uses) and makes future timezone
// changes a one-line edit. Kept as a named constant so callers cannot
// accidentally drift the production boundary from the test boundary.
export const DHAKA_TODAY_DATE_EXPR = "(now() AT TIME ZONE 'Asia/Dhaka')::date";

// The today-spend SQL fragment. Exported so the CLI and the boundary test can
// reuse it byte-for-byte; the test (`tests/db/spend-cli.test.ts` boundary case)
// exercises the CLI's own SQL rather than a re-typed copy.
export const TODAY_SPEND_SQL = `COALESCE((SELECT SUM(actual_usd)::text FROM ai_reservations WHERE state = 'settled' AND (settled_at AT TIME ZONE 'Asia/Dhaka')::date = ${DHAKA_TODAY_DATE_EXPR}), '0.000000')`;

// Pure: like `maskUrl` (in scripts/db/guard.mjs), but also strips the username.
// Used for DB-error messages so that even the username (a piece of identifying
// information, not a secret) is never echoed back. Output is
// `host:port/dbname` only.
export function safeUrl(url) {
  return `${url.host}${url.pathname}`;
}

// Six-decimal USD strings, matching numeric(10,6) in db/schema_v2.sql. We use the
// exact same regex the SQL functions accept; a wider tolerance would silently
// misrepresent the budget.
export function isUsdString(value) {
  return typeof value === "string" && USD_RE.test(value);
}

// Numeric(10,6) USD strings come back from SQL as exact text: pg sends them as
// strings when the column is read with ::text (see readBudget in scripts/spend.mjs),
// so the value is trusted as-is and no floating point work is done here.
export function usdToMicros(value) {
  if (!isUsdString(value)) throw new Error(`not a numeric(10,6) USD string: ${JSON.stringify(value)}`);
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}

// Always render six decimal places, matching the budget row.
export function formatUsd(value) {
  if (!isUsdString(value)) throw new Error(`not a numeric(10,6) USD string: ${JSON.stringify(value)}`);
  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${fraction.padEnd(6, "0")}`;
}

// Status names drive both the human-readable output and the exit code. They
// stay identical across plain text, JSON and machine consumers.
export const STATUS = Object.freeze({
  OK: "ok",
  AT_CAP: "at_cap",
});

// A read-only budget row plus today's spend (USD). `cap`/`committed`/`reserved`
// are the exact six-decimal strings from the `ai_budget` table; `today` is the
// sum of settled `actual_usd` for reservations whose `settled_at` falls on the
// current date in Asia/Dhaka (D2B §14: "today's and total spend").
export function evaluateBudget({ cap, committed, reserved, today }) {
  if (!isUsdString(cap)) throw new Error(`cap is not a numeric(10,6) USD string: ${JSON.stringify(cap)}`);
  if (!isUsdString(committed)) throw new Error(`committed is not a numeric(10,6) USD string: ${JSON.stringify(committed)}`);
  if (!isUsdString(reserved)) throw new Error(`reserved is not a numeric(10,6) USD string: ${JSON.stringify(reserved)}`);
  if (today === undefined || today === null) {
    today = "0.000000";
  } else if (!isUsdString(today)) {
    throw new Error(`today is not a numeric(10,6) USD string: ${JSON.stringify(today)}`);
  }
  const capMicros = usdToMicros(cap);
  const committedMicros = usdToMicros(committed);
  const reservedMicros = usdToMicros(reserved);
  const todayMicros = usdToMicros(today);
  // The schema's CHECK enforces committed+reserved <= cap; the SQL invariant is
  // the only authority. We still compute remaining here for reporting.
  const usedMicros = committedMicros + reservedMicros;
  const remainingMicros = capMicros - usedMicros;
  if (remainingMicros < 0n) {
    // The bigint-safe micros formatter (six decimal places) avoids any floating
    // point on the broken invariant; formatUsd would reject a non-numeric(10,6)
    // BigInt input it has not seen before.
    throw new Error(`ai_budget invariant broken: committed+reserved > cap (${formatUsdFromMicros(usedMicros)} > ${formatUsdFromMicros(capMicros)})`);
  }
  const remaining = formatUsdFromMicros(remainingMicros);
  const status = usedMicros >= capMicros ? STATUS.AT_CAP : STATUS.OK;
  return Object.freeze({
    cap: formatUsd(cap),
    committed: formatUsd(committed),
    reserved: formatUsd(reserved),
    used: formatUsdFromMicros(usedMicros),
    remaining,
    today: formatUsdFromMicros(todayMicros),
    status,
  });
}

function formatUsdFromMicros(micros) {
  if (micros < 0n) throw new Error(`USD micros cannot be negative: ${micros}`);
  if (micros > 9_999_999_999n) throw new Error(`USD micros out of numeric(10,6) range: ${micros}`);
  return `${micros / 1_000_000n}.${String(micros % 1_000_000n).padStart(6, "0")}`;
}

// Exit codes match status names. The CLI maps the 4/usage code separately; this
// function is only for the budget decision.
export function exitCodeForStatus(status) {
  if (status === STATUS.AT_CAP) return 2;
  if (status === STATUS.OK) return 0;
  throw new Error(`unknown spend status: ${status}`);
}

// Plain-text report. Each amount is rendered on its own line so a CI log or a
// printed sheet is unambiguous. The "spend" CLI prints this by default.
export function formatReport(budget) {
  return [
    `cap_usd=${budget.cap}`,
    `committed_usd=${budget.committed}`,
    `reserved_usd=${budget.reserved}`,
    `used_usd=${budget.used}`,
    `today_usd=${budget.today}`,
    `remaining_usd=${budget.remaining}`,
    `status=${budget.status}`,
  ].join("\n") + "\n";
}

// JSON shape. The CLI emits this with --json so dashboards or FER can ingest it.
// Keys are snake_case to match the SQL row.
export function toJsonReport(budget) {
  return {
    cap_usd: budget.cap,
    committed_usd: budget.committed,
    reserved_usd: budget.reserved,
    used_usd: budget.used,
    today_usd: budget.today,
    remaining_usd: budget.remaining,
    status: budget.status,
  };
}
