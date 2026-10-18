// Pre-main test-journeys — unit tests for the runner helper contract.
//
// The runner (`scripts/rehearsal/run-automated-repeats.mjs`) consumes
// the same helpers the unit tests exercise. Keeping the contract
// unit-tested means:
//   * --runs validation: positive integer only, bounded by MAX_RUNS.
//   * Unknown CLI args are refused (no silent typo "fallback").
//   * replaceSection is idempotent, preserves surrounding H2s and
//     throws when the heading is missing.
//   * dropRehearsalDb refuses to drop anything outside the
//     `fera_e2e_premainjourney_` prefix, and refuses a non-loopback
//     admin host.
//
// The runner's main() path is intentionally NOT re-imported in these
// tests (it spawns `npx`); the helper module is pure and side-effect
// free, so the unit tests can assert the contract directly.

import { describe, it, expect, vi } from "vitest";
import {
  parseArgs,
  parseRuns,
  replaceSection,
  truthy,
  dropRehearsalDb,
  MAX_RUNS,
  KNOWN_FLAGS,
  DEFAULT_DATABASE_URL,
  LOOPBACK_ADMIN_URL,
  // @ts-expect-error -- the untyped .mjs helper is re-typed locally
} from "../../scripts/rehearsal/runner-helpers.mjs";

describe("parseArgs", () => {
  it("accepts every known flag and parses its value", () => {
    const parsed = parseArgs([
      "--runs", "5",
      "--config", "playwright.offline.config.ts",
      "--project", "offline-desktop",
      "--keep-going", "1",
      "--no-cleanup",
      "--help",
    ]);
    expect(parsed.runs).toBe("5");
    expect(parsed.config).toBe("playwright.offline.config.ts");
    expect(parsed.project).toBe("offline-desktop");
    expect(parsed["keep-going"]).toBe("1");
    expect(parsed["no-cleanup"]).toBe("1");
    expect(parsed.help).toBe("1");
  });

  it("treats a flag with no value as boolean '1'", () => {
    const parsed = parseArgs(["--keep-going", "--no-cleanup"]);
    expect(parsed["keep-going"]).toBe("1");
    expect(parsed["no-cleanup"]).toBe("1");
  });

  it("refuses an unknown flag", () => {
    expect(() => parseArgs(["--secret", "1"])).toThrow(/unknown flag: --secret/);
  });

  it("captures positional arguments in `_`", () => {
    const parsed = parseArgs(["--runs", "1", "pos-a", "pos-b"]);
    expect(parsed._).toEqual(["pos-a", "pos-b"]);
  });

  it("captures everything after `--` as positional", () => {
    const parsed = parseArgs(["--runs", "1", "--", "--weird"]);
    expect(parsed._).toEqual(["--weird"]);
  });

  it("exposes the known-flags allowlist", () => {
    // The known flags are the contract: the unit test pins the
    // surface so a future contributor can extend it intentionally.
    expect(KNOWN_FLAGS.has("runs")).toBe(true);
    expect(KNOWN_FLAGS.has("config")).toBe(true);
    expect(KNOWN_FLAGS.has("project")).toBe(true);
    expect(KNOWN_FLAGS.has("keep-going")).toBe(true);
    expect(KNOWN_FLAGS.has("no-cleanup")).toBe(true);
    expect(KNOWN_FLAGS.has("help")).toBe(true);
  });
});

describe("parseRuns", () => {
  it("returns the fallback when --runs is missing", () => {
    expect(parseRuns(undefined)).toBe(5);
    expect(parseRuns(undefined, 3)).toBe(3);
  });

  it("accepts positive integers in range", () => {
    expect(parseRuns("1")).toBe(1);
    expect(parseRuns("5")).toBe(5);
    expect(parseRuns("50")).toBe(MAX_RUNS);
  });

  it("rejects zero, negative, fractional, and non-numeric values", () => {
    expect(() => parseRuns("0")).toThrow(/--runs must be >= 1/);
    expect(() => parseRuns("-1")).toThrow(/--runs must be a positive integer/);
    expect(() => parseRuns("1.5")).toThrow(/--runs must be a positive integer/);
    expect(() => parseRuns("abc")).toThrow(/--runs must be a positive integer/);
    expect(() => parseRuns("")).toThrow(/--runs must be a positive integer/);
    expect(() => parseRuns(" ")).toThrow(/--runs must be a positive integer/);
  });

  it("rejects values above the cap", () => {
    expect(() => parseRuns(String(MAX_RUNS + 1))).toThrow(/--runs must be <= 50/);
  });
});

describe("truthy", () => {
  it("returns true for 1, true, yes", () => {
    expect(truthy("1")).toBe(true);
    expect(truthy("true")).toBe(true);
    expect(truthy("yes")).toBe(true);
  });
  it("returns false for anything else, including undefined", () => {
    expect(truthy("0")).toBe(false);
    expect(truthy("no")).toBe(false);
    expect(truthy("")).toBe(false);
    expect(truthy(undefined)).toBe(false);
  });
});

describe("replaceSection", () => {
  it("replaces the body of the matched H2 and preserves the heading", () => {
    const text = [
      "## Run-by-run results",
      "",
      "old table",
      "",
      "## Offline network proof",
      "",
      "old network",
      "",
    ].join("\n");
    const next = replaceSection(text, /^## Run-by-run results.*$/m, "new table");
    expect(next).toContain("## Run-by-run results");
    expect(next).toContain("new table");
    expect(next).not.toContain("old table");
    expect(next).toContain("## Offline network proof");
    expect(next).toContain("old network");
  });

  it("throws when the heading is not present (stale evidence must not be stamped)", () => {
    const text = "## Other section\n\nbody\n";
    expect(() => replaceSection(text, /^## Run-by-run results.*$/m, "anything")).toThrow(
      /evidence section heading not found/,
    );
  });

  it("replaces a heading that is the last line with no trailing newline", () => {
    const next = replaceSection("intro\n\n## A", /^## A.*$/m, "new A");
    expect(next).toContain("## A\n\nnew A");
  });

  it("preserves a trailing H2 when it is the last section", () => {
    const text = "## A\n\nold A\n\n## B\n\nold B\n";
    const next = replaceSection(text, /^## A.*$/m, "new A");
    expect(next).toContain("## A");
    expect(next).toContain("new A");
    expect(next).toContain("## B");
    expect(next).toContain("old B");
  });
});

describe("dropRehearsalDb (guard only; no live DB)", () => {
  it("refuses a name outside the rehearsal prefix", async () => {
    await expect(dropRehearsalDb("fera_app_local_dev")).rejects.toThrow(
      /refusing to drop DB with non-rehearsal name/,
    );
    await expect(dropRehearsalDb("postgres")).rejects.toThrow(
      /refusing to drop DB with non-rehearsal name/,
    );
    await expect(dropRehearsalDb("")).rejects.toThrow(
      /refusing to drop DB with non-rehearsal name/,
    );
    await expect(dropRehearsalDb("fera_e2e_premainjourney_DROP TABLE x;--")).rejects.toThrow(
      /refusing to drop DB with non-rehearsal name/,
    );
  });

  it("refuses a non-loopback admin host", async () => {
    await expect(
      dropRehearsalDb(
        "fera_e2e_premainjourney_xyz",
        "postgresql://u:p@db.example.com:5432/postgres",
      ),
    ).rejects.toThrow(/refusing to drop DB against non-loopback host/);
  });

  it.each(["localhost.attacker.example", "127.attacker.example", "127.0.0.2"])("refuses deceptive host %s before connecting", async host => {
    await expect(dropRehearsalDb("fera_e2e_premainjourney_abc", `postgresql://u:p@${host}:1/postgres`)).rejects.toThrow(/non-loopback/);
  });
  it("accepts the pinned prefix and a loopback admin host (does not connect)", async () => {
    // We only assert the guard accepts the input shape; the actual
    // DROP DATABASE would require a live pg server. The function
    // will attempt to connect, which fails fast with a connection
    // error (the test environment has no pg), and the connection
    // error is NOT a "refusing" error — it is a real failure. To
    // keep the test hermetic, we monkey-patch the lazy pg import
    // by hitting a port nothing listens on; the connect call will
    // reject and the rejection must NOT be the prefix/host refusal.
    let captured: Error | null = null;
    try {
      await dropRehearsalDb(
        "fera_e2e_premainjourney_abc",
        "postgresql://u:p@127.0.0.1:1/postgres",
      );
    } catch (err) {
      captured = err as Error;
    }
    expect(captured).not.toBeNull();
    expect(captured!.message).not.toMatch(/refusing to drop DB/);
  });
});

describe("constants", () => {
  it("MAX_RUNS is 50 (a documented cap, not arbitrary)", () => {
    expect(MAX_RUNS).toBe(50);
  });
  it("LOOPBACK_ADMIN_URL targets the loopback postgres at 54322", () => {
    // Assert the shape so a future contributor cannot ship a
    // non-loopback default by accident. The port matches the
    // project's local pg (see scripts/db/guard.mjs).
    expect(LOOPBACK_ADMIN_URL).toMatch(/^postgresql:\/\/[^@]+@127\.0\.0\.1:54322\/postgres$/);
  });
  it("DEFAULT_DATABASE_URL is FERA_DB_ADMIN_URL or the loopback default, never DATABASE_URL", async () => {
    expect(DEFAULT_DATABASE_URL).toBe(process.env.FERA_DB_ADMIN_URL ?? LOOPBACK_ADMIN_URL);
    // Re-import with only DATABASE_URL set: the admin default must ignore it.
    vi.stubEnv("FERA_DB_ADMIN_URL", undefined);
    vi.stubEnv("DATABASE_URL", "postgresql://fera_app:x@127.0.0.1:54322/fera_app_db");
    try {
      // @ts-expect-error -- the untyped .mjs helper is re-typed locally
      const fresh = await import("../../scripts/rehearsal/runner-helpers.mjs?admin-default");
      expect(fresh.DEFAULT_DATABASE_URL).toBe(LOOPBACK_ADMIN_URL);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
