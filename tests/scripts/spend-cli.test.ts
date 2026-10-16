// TASK-059. Pure unit tests for the spend CLI's parseArgs helper.
// No network or DB; help subprocesses reject DB configuration. The full flow is exercised by
// `tests/db/spend-cli.test.ts` (integration) and by `npm run spend` against a
// real database.
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM script without type declarations
import { SPEND_CAP_ENV, USAGE, parseArgs } from "../../scripts/spend.mjs";

describe("spend CLI argument parsing (TASK-059)", () => {
  it("returns defaults for no arguments", () => {
    expect(parseArgs(["node", "spend.mjs"])).toEqual({ json: false, explain: false, help: false, errors: [] });
  });

  it("parses --json and --explain", () => {
    expect(parseArgs(["node", "spend.mjs", "--json"])).toMatchObject({ json: true });
    expect(parseArgs(["node", "spend.mjs", "--explain"])).toMatchObject({ explain: true });
    expect(parseArgs(["node", "spend.mjs", "--help"])).toMatchObject({ help: true });
    expect(parseArgs(["node", "spend.mjs", "-h"])).toMatchObject({ help: true });
  });

  it("collects unknown arguments in errors", () => {
    const r = parseArgs(["node", "spend.mjs", "--json", "--bogus"]);
    expect(r.json).toBe(true);
    expect(r.errors).toEqual(["unknown argument"]);
  });

  it("does not echo unknown name=value arguments", () => {
    const r = parseArgs(["node", "spend.mjs", "--password=hunter2"]);
    expect(r.errors).toEqual(["unknown argument"]);
    expect(r.errors.join("\n")).not.toContain("hunter2");
  });

  it("USAGE is non-empty", () => {
    expect(USAGE.length).toBeGreaterThan(0);
  });

  it("exposes the spec'd cap env var name", () => {
    expect(SPEND_CAP_ENV).toBe("AI_SPEND_CAP_USD");
  });
});

describe("spend CLI safe diagnostics and help (TASK-059)", () => {
  it.each(["--help", "--explain"])("%s exits before database configuration", (flag) => {
    const result = spawnSync(process.execPath, ["scripts/spend.mjs", flag], {
      encoding: "utf8",
      env: { ...process.env, FERA_DB_ADMIN_URL: "invalid-synthetic-url" },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Fera AI spend report");
    expect(result.stderr).toBe("");
  });

  it("does not echo positional credentials or payloads in usage errors", () => {
    for (const arg of [
      "postgresql://sekrit:s3cret@127.0.0.1:1/fera",
      "synthetic-private-text",
      "synthetic-private-text=value",
    ]) {
      const result = parseArgs(["node", "spend.mjs", arg]);
      expect(result.errors).toEqual(["unknown argument"]);
      const child = spawnSync(process.execPath, ["scripts/spend.mjs", arg], {
        encoding: "utf8",
        env: { ...process.env, FERA_DB_ADMIN_URL: "invalid-synthetic-url" },
      });
      expect(child.status).toBe(4);
      expect(child.stdout).toBe("");
      expect(child.stderr).toBe(`unknown argument\n${USAGE}\n`);
    }
  });
});
