// Pre-main test-journeys — runner helpers (pure, unit-testable).
//
// Why a separate module:
//   The runner (`run-automated-repeats.mjs`) needs to validate args
//   and refuse unknown flags; it also needs to drop per-run DBs and
//   merge evidence. Those functions are small, side-effect-free, and
//   the brief asks for unit tests in `tests/rehearsal/**/*.test.ts`.
//   Keeping the helpers here lets vitest import them directly
//   without spawning the runner.
//
// Contract:
//   * `parseArgs(argv)` — tokenise CLI flags; refuse unknown flags.
//   * `parseRuns(raw, fallback)` — validate the --runs value (positive
//     integer, capped at MAX_RUNS).
//   * `truthy(raw)` — coerce a CLI flag value to boolean.
//   * `replaceSection(text, startHeader, body)` — surgical markdown
//     section replacement; preserves the H2 heading and any
//     subsequent H2 sections.
//   * `dropRehearsalDb(rawName, adminUrl)` — guarded DB drop; refuses
//     anything outside the `fera_e2e_premainjourney_` prefix and
//     non-loopback admin hosts.
//   * `MAX_RUNS`, `KNOWN_FLAGS`, `DEFAULT_DATABASE_URL` — constants
//     shared with the runner main path and the unit tests.

/** Maximum allowed number of repeat runs. The brief says "five"; we cap
 *  far above that so a human can ask for more, but reject absurd values
 *  (negative, zero, fractional, or so large the runner would never
 *  finish) with a clear error rather than a vacuous pass. */
export const MAX_RUNS = 50;

/** Known arguments. Unknown flags are refused. */
export const KNOWN_FLAGS = new Set([
  "runs",
  "config",
  "project",
  "keep-going",
  "no-cleanup",
  "help",
]);

/** Default admin URL. The runner never reads `.env*`; the env override
 *  the Playwright config sets is the only source. The default targets
 *  the same loopback pg the existing `scripts/db/guard.mjs` uses
 *  (port 54322, db `postgres`) so a misconfigured env does not point
 *  at the wrong server. */
export const DEFAULT_DATABASE_URL =
  process.env.FERA_DB_ADMIN_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** Tokenise CLI args. Throws on an unknown flag. */
export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--") {
      out._.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const key = a.slice(2);
      if (!KNOWN_FLAGS.has(key)) {
        throw new Error(`unknown flag: --${key} (known: ${[...KNOWN_FLAGS].join(", ")})`);
      }
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        out[key] = "1";
      } else {
        out[key] = next;
        i += 1;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

/** Validate the `--runs` argument. Throws on invalid input. */
export function parseRuns(raw, fallback = 5) {
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(String(raw))) {
    throw new Error(`--runs must be a positive integer (got: ${raw})`);
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`--runs must be >= 1 (got: ${n})`);
  }
  if (n > MAX_RUNS) {
    throw new Error(`--runs must be <= ${MAX_RUNS} (got: ${n})`);
  }
  return n;
}

/** Coerce a CLI flag value to boolean. */
export function truthy(raw) {
  return raw === "1" || raw === "true" || raw === "yes";
}

/**
 * Drop a single rehearsal DB by name. The prefix is the same hard
 * allowlist the Playwright config enforces. Any name outside the
 * allowlist is refused so a misconfigured env cannot delete an
 * unrelated DB. The OWNER connection comes from the env the
 * existing wrapper uses.
 *
 * `pg` is a runtime dependency of the runner; importing it lazily
 * here keeps the helper unit-testable without a live database.
 *
 * Implementation note: we connect to the admin (`postgres`) database
 * FIRST so the target DB is not "currently open" by our own
 * connection. Then we terminate other backends, then DROP. If we
 * connected to the target DB, pg would refuse the DROP with
 * `cannot drop the currently open database`.
 */
export async function dropRehearsalDb(rawName, adminUrlRaw = DEFAULT_DATABASE_URL) {
  if (typeof rawName !== "string" || !/^fera_e2e_premainjourney_[a-z0-9_]{1,32}$/.test(rawName)) {
    throw new Error(`refusing to drop DB with non-rehearsal name: ${rawName}`);
  }
  const admin = new URL(adminUrlRaw);
  if (!["127.0.0.1", "localhost", "[::1]", "::1"].includes(admin.hostname) || !["postgres:", "postgresql:"].includes(admin.protocol) || admin.search || admin.hash) {
    throw new Error(`refusing to drop DB against non-loopback host: ${admin.hostname}`);
  }
  // The admin connection is to the `postgres` database; we never
  // connect to the target rehearsal DB directly.
  const { Client } = await import("pg");
  const client = new Client({ connectionString: admin.href, connectionTimeoutMillis: 10_000 });
  try {
    await client.connect();
    // Terminate every other backend connected to the target DB
    // before DROP. We do not include our own pid because we are
    // connected to `postgres`, not the target.
    await client.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1",
      [rawName],
    );
    await client.query(`DROP DATABASE IF EXISTS "${rawName.replace(/"/g, '""')}"`);
  } finally {
    await client.end();
  }
}

/**
 * Replace a markdown section body in `text`. `startHeader` is a
 * regex that matches the H2 heading (e.g. /^## Run-by-run results.*$/m).
 * The replacement covers the header line and everything until the
 * next `## ` heading. The next `## ` heading itself is preserved.
 *
 * `body` may be a literal block (the replacement preserves the H2
 * heading itself by deriving it from the matched line). Pass
 * `body` as the full section content WITHOUT the leading heading.
 */
export function replaceSection(text, startHeader, body) {
  const start = text.search(startHeader);
  if (start < 0) return text;
  const headerEnd = text.indexOf("\n", start);
  if (headerEnd < 0) return text;
  const headingLine = text.slice(start, headerEnd);
  const after = text.slice(headerEnd + 1);
  const nextHeader = after.search(/^##\s/m);
  const sectionEnd = nextHeader < 0 ? text.length : headerEnd + 1 + nextHeader;
  const before = text.slice(0, start);
  const after_ = text.slice(sectionEnd);
  const merged = `${before}${headingLine}\n\n${body.trimEnd()}\n\n${after_}`.replace(
    /\n{4,}/g,
    "\n\n\n",
  );
  return merged;
}
