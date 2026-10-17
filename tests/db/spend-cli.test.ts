// TASK-059 / DECISION-017 / NFR-016 / TC-036 (service level).
// Integration test: invoke `node scripts/spend.mjs` as a subprocess against the
// per-run fresh test database (the same setup `npm run test:db` uses). This
// proves the CLI end-to-end: connects via guard.mjs, reads the ai_budget row
// and today's settle-date total, formats six-decimal output, exits 0/2/4 per
// the documented contract.
// The CLI does NOT exercise the service-level cap refusal (that's TASK-063
// in `tests/db/spend.test.ts`); it is a read-only report.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { connect, dbTestsEnabled, one } from "./support/db";
// @ts-expect-error -- plain ESM script without type declarations
import { DHAKA_TODAY_DATE_EXPR, TODAY_SPEND_SQL } from "../../scripts/spend/lib.mjs";

describe.skipIf(!dbTestsEnabled)("spend CLI end-to-end against PostgreSQL 16 (TASK-059)", () => {
  let admin: Awaited<ReturnType<typeof connect>>;
  // fileURLToPath, not URL.pathname: pathname keeps %20 for spaces in the checkout path.
  const cliPath = fileURLToPath(new URL("../../scripts/spend.mjs", import.meta.url));

  beforeAll(async () => {
    admin = await connect("admin");
  });
  afterAll(async () => { await admin?.end(); });

  beforeEach(async () => {
    // Reset to the schema default before each test, and wipe any settled
    // reservations whose date could otherwise leak into a later run.
    await admin.query("UPDATE ai_budget SET cap_usd = 25, committed_usd = 0, reserved_usd = 0");
    await admin.query("DELETE FROM ai_reservations WHERE state = 'settled'");
  });

  // The CLI's local-only guard requires a loopback host. test-db.mjs provisions
  // a per-run database `fera_test_<pid>_<n>` on 127.0.0.1:54322; FERA_DB_ADMIN_URL
  // defaults to the same local default in guard.mjs, so we do not need to set it
  // here.
  const env = () => ({
    ...process.env,
    FERA_DB_NAME: process.env.FERA_DB_NAME,
    FERA_DB_TESTS: "1",
  });

  const runCli = (args: string[], extra: Record<string, string | undefined> = {}) => {
    // Inherit the test environment, then apply per-case overrides.
    const childEnv: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(env())) {
      if (typeof v === "string") childEnv[k] = v;
    }
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined) delete childEnv[k];
      else childEnv[k] = v;
    }
    return spawnSync("node", [cliPath, ...args], {
      encoding: "utf8",
      env: childEnv as NodeJS.ProcessEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
  };

  it("exits 0 with the default 25 cap, committed 0, reserved 0 (text)", () => {
    const result = runCli([]);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      "cap_usd=25.000000\ncommitted_usd=0.000000\nreserved_usd=0.000000\nused_usd=0.000000\ntoday_usd=0.000000\nremaining_usd=25.000000\nstatus=ok\n",
    );
    expect(result.stderr).toBe("");
  });

  it("emits a JSON object with --json including today_usd and used_usd", () => {
    const result = runCli(["--json"]);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toEqual({
      cap_usd: "25.000000",
      committed_usd: "0.000000",
      reserved_usd: "0.000000",
      used_usd: "0.000000",
      today_usd: "0.000000",
      remaining_usd: "25.000000",
      status: "ok",
    });
  });

  it("exits 2 with status=at_cap at the cap (CLI-level only; TC-036 end to end needs TASK-020 + TASK-025)", async () => {
    await admin.query("UPDATE ai_budget SET committed_usd = cap_usd, reserved_usd = 0");
    const result = runCli([]);
    expect(result.status).toBe(2);
    expect(result.stdout).toContain("status=at_cap\n");
    expect(result.stdout).toContain("remaining_usd=0.000000\n");
  });

  it("DB CHECK rejects committed > cap", async () => {
    // The schema's CHECK forbids this state, so the UPDATE itself fails.
    await expect(
      admin.query("UPDATE ai_budget SET committed_usd = cap_usd + 1, reserved_usd = 0"),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("exits 4 with a usage error on an unknown flag", () => {
    const result = runCli(["--bogus"]);
    expect(result.status).toBe(4);
    expect(result.stderr).toMatch(/unknown argument/);
  });

  it("redacts the value after `=` when echoing an unknown argument", () => {
    const result = runCli(["--api-key=hunter2"]);
    expect(result.status).toBe(4);
    expect(result.stderr).toMatch(/unknown argument/);
    expect(result.stderr).not.toContain("hunter2");
    expect(result.stdout).not.toContain("hunter2");
  });

  it("exits 0 on --help/--explain and writes the help text", () => {
    const result = runCli(["--help"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/Fera AI spend report/);
    expect(result.stdout).toMatch(/AI_SPEND_CAP_USD/);
  });

  it("refuses a non-local host (exits 4, no .env*, no credentials)", () => {
    const result = runCli([], { FERA_DB_ADMIN_URL: "postgresql://postgres:postgres@db.example.supabase.co:5432/postgres" });
    expect(result.status).toBe(4);
    expect(result.stderr).toMatch(/non-local/);
    // Never echo the password.
    expect(result.stderr).not.toContain("postgres");
    expect(result.stdout).not.toContain("postgres");
  });

  it("refuses connection parameters in the URL", () => {
    const result = runCli([], { FERA_DB_ADMIN_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres?host=db.example.supabase.co" });
    expect(result.status).toBe(4);
    expect(result.stderr).toMatch(/connection parameters/);
  });

  it("exits 4 on a non-fera database name", () => {
    const result = runCli([], { FERA_DB_NAME: "postgres" });
    expect(result.status).toBe(4);
    expect(result.stderr).toMatch(/FERA_DB_NAME must match/);
  });

  it("masks the password when the connection fails (never logs the secret)", () => {
    const result = runCli([], { FERA_DB_ADMIN_URL: "postgresql://postgres:s3cret@127.0.0.1:1/postgres" });
    expect(result.status).toBe(4);
    // No form of the password should ever appear in either stream. The path
    // through DB error uses safeUrl (host:port/dbname only), which never has
    // a password to redact; this still asserts broadly in case a future error
    // path uses the masked form.
    expect(result.stdout).not.toContain("s3cret");
    expect(result.stderr).not.toContain("s3cret");
  });

  it("on any DB error, prints only host:port/dbname and the error code (never the raw message)", async () => {
    // Force a real DB error by connecting to a dead port; the pg error has a
    // code (ECONNREFUSED) and a message. Only the code should leak.
    const result = runCli([], { FERA_DB_ADMIN_URL: "postgresql://postgres:s3cret@127.0.0.1:1/postgres" });
    expect(result.status).toBe(4);
    // safeUrl strips the scheme and userinfo, leaving `127.0.0.1:1/<dbname>`
    // (no username, no password).
    expect(result.stderr).toMatch(/database error \(127\.0\.0\.1:1\/[a-z0-9_]+\) \(code [A-Z0-9_]+\)/);
    expect(result.stderr).not.toContain("s3cret");
  });

  it("on any DB error, never writes the username (userinfo) to either stream", () => {
    // The username is also identifying information, not just a password; the
    // DB-error path strips userinfo entirely (`host:port/dbname` only) so that
    // neither the username nor the password ever lands in stdout/stderr.
    const result = runCli([], { FERA_DB_ADMIN_URL: "postgresql://sekrit@127.0.0.1:1/postgres" });
    expect(result.status).toBe(4);
    expect(result.stdout).not.toContain("sekrit");
    expect(result.stderr).not.toContain("sekrit");
  });

  it("today_usd sums settled reservations whose settled_at is today in Asia/Dhaka only", async () => {
    // Insert one settled reservation today, one yesterday, one in 'reserved'
    // (not yet settled) — only today's settled one should be summed.
    const session = await one<{ id: string }>(admin, "INSERT INTO parent_sessions DEFAULT VALUES RETURNING id");
    const draft = await one<{ id: string }>(admin, "INSERT INTO intake_drafts (session_id, kind) VALUES ($1, 'missing') RETURNING id", [session.id]);
    // Today's settled reservation (Dhaka).
    const todayReserved = await one<{ id: string }>(admin, "SELECT reserve_ai_call($1::uuid, $2::numeric) AS id", [draft.id, "0.050000"]);
    await admin.query("SELECT settle_ai_call($1::uuid, $2::numeric)", [todayReserved.id, "0.030000"]);
    // Yesterday's settled reservation (we backdate settled_at directly in the
    // test fixture; reserve_ai_call is the real entry path, but we need
    // yesterday's settled_at, which the production API never produces).
    const yesterdayReserved = await one<{ id: string }>(admin, "SELECT reserve_ai_call($1::uuid, $2::numeric) AS id", [draft.id, "0.040000"]);
    await admin.query("SELECT settle_ai_call($1::uuid, $2::numeric)", [yesterdayReserved.id, "0.020000"]);
    await admin.query(
      "UPDATE ai_reservations SET settled_at = now() - interval '1 day' WHERE id = $1",
      [yesterdayReserved.id],
    );
    // A still-reserved (unsettled) row must NOT count toward today's settled spend.
    await one<{ id: string }>(admin, "SELECT reserve_ai_call($1::uuid, $2::numeric) AS id", [draft.id, "0.010000"]);

    const result = runCli(["--json"]);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    // Only the 0.030000 (today) reservation counts; the 0.020000 row from
    // yesterday is excluded, and the still-reserved row is not yet settled.
    expect(parsed.today_usd).toBe("0.030000");
  });

  it("pins the Dhaka day edge with fixed timestamps (boundary test, independent of now())", async () => {
    // Evaluate the production expression itself at fixed instants. An imported
    // expression in an unasserted SELECT column does not prove its timezone.
    const dateAtInstant = DHAKA_TODAY_DATE_EXPR.replace("now()", "$1::timestamptz");
    for (const [instant, expected] of [
      ["2026-10-15 17:59:59+00", "2026-10-15"],
      ["2026-10-15 18:00:00+00", "2026-10-16"],
    ]) {
      const row = await one<{ d: string }>(admin, `SELECT (${dateAtInstant})::text AS d`, [instant]);
      expect(row.d).toBe(expected);
    }

    // Also exercise the full production SUM/filter, including the settled_at
    // conversion, so changing either side's timezone breaks this regression.
    for (const [instant, cost] of [
      ["2026-10-15 17:59:59+00", "0.030000"],
      ["2026-10-15 18:00:00+00", "0.040000"],
    ]) {
      const reservation = await one<{ id: string }>(admin, "SELECT reserve_ai_call(NULL, $1::numeric) AS id", [cost]);
      await admin.query("SELECT settle_ai_call($1::uuid, $2::numeric)", [reservation.id, cost]);
      await admin.query("UPDATE ai_reservations SET settled_at = $1::timestamptz WHERE id = $2", [instant, reservation.id]);
    }
    const spendAtInstant = TODAY_SPEND_SQL.replace("now()", "$1::timestamptz");
    for (const [instant, expected] of [
      ["2026-10-15 17:59:59+00", "0.030000"],
      ["2026-10-15 18:00:00+00", "0.040000"],
    ]) {
      const row = await one<{ today: string }>(admin, `SELECT ${spendAtInstant} AS today`, [instant]);
      expect(row.today).toBe(expected);
    }
  });

  it("refuses a malformed AI_SPEND_CAP_USD (OD-059-3)", async () => {
    await admin.query("UPDATE ai_budget SET cap_usd = 25, committed_usd = 0, reserved_usd = 0");
    const result = runCli([], { AI_SPEND_CAP_USD: "5.0.0" });
    expect(result.status).toBe(4);
    expect(result.stderr).toMatch(/invalid AI_SPEND_CAP_USD \(not a USD amount\); the database value is enforced/);
    // The raw env value is never echoed back; a malformed input is not a place
    // to leak it.
    expect(result.stderr).not.toContain("5.0.0");
    expect(result.stdout).not.toContain("5.0.0");
  });

  it("refuses when AI_SPEND_CAP_USD differs from the DB cap (OD-059-3)", async () => {
    await admin.query("UPDATE ai_budget SET cap_usd = 25, committed_usd = 0, reserved_usd = 0");
    const result = runCli([], { AI_SPEND_CAP_USD: "30.000000" });
    expect(result.status).toBe(4);
    expect(result.stderr).toMatch(/cap mismatch: AI_SPEND_CAP_USD=30\.000000 but database cap_usd=25\.000000; the database value is enforced/);
  });

  it("passes when AI_SPEND_CAP_USD matches the DB cap (OD-059-3)", async () => {
    await admin.query("UPDATE ai_budget SET cap_usd = 25, committed_usd = 0, reserved_usd = 0");
    const result = runCli([], { AI_SPEND_CAP_USD: "25.000000" });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("passes when AI_SPEND_CAP_USD has no decimals (25) and the DB cap is 25.000000", async () => {
    await admin.query("UPDATE ai_budget SET cap_usd = 25, committed_usd = 0, reserved_usd = 0");
    const result = runCli([], { AI_SPEND_CAP_USD: "25" });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("passes when AI_SPEND_CAP_USD has one decimal (25.0) and the DB cap is 25.000000", async () => {
    await admin.query("UPDATE ai_budget SET cap_usd = 25, committed_usd = 0, reserved_usd = 0");
    const result = runCli([], { AI_SPEND_CAP_USD: "25.0" });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it.each([undefined, ""])("is silent when AI_SPEND_CAP_USD is %s (OD-059-3)", async (cap) => {
    await admin.query("UPDATE ai_budget SET cap_usd = 25, committed_usd = 0, reserved_usd = 0");
    const result = runCli([], { AI_SPEND_CAP_USD: cap });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("reads the live ai_budget row after TASK-063 reservations/settlements", async () => {
    // The DB schema enforces numeric(10,6). Insert a fresh intake_draft and
    // reserve + settle a tiny cost using the same SQL the TASK-063 service
    // uses, then read it back through the CLI. This proves the CLI integrates
    // with the real TASK-063 path.
    const session = await one<{ id: string }>(admin, "INSERT INTO parent_sessions DEFAULT VALUES RETURNING id");
    const draft = await one<{ id: string }>(admin, "INSERT INTO intake_drafts (session_id, kind) VALUES ($1, 'missing') RETURNING id", [session.id]);
    const reserved = await one<{ id: string }>(admin, "SELECT reserve_ai_call($1::uuid, $2::numeric) AS id", [draft.id, "0.030000"]);
    // settle_ai_call drops the full reserved upper bound; only the actual cost
    // moves into committed_usd (db/schema_v2.sql:575). The CLI sees that here.
    await admin.query("SELECT settle_ai_call($1::uuid, $2::numeric)", [reserved.id, "0.012000"]);
    const result = runCli(["--json"]);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.committed_usd).toBe("0.012000");
    expect(parsed.reserved_usd).toBe("0.000000");
    expect(parsed.used_usd).toBe("0.012000");
    expect(parsed.remaining_usd).toBe("24.988000");
    expect(parsed.today_usd).toBe("0.012000");
    expect(parsed.status).toBe("ok");
  });
});
