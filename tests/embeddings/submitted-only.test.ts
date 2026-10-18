// reembed must only ever read submitted cases (table `cases`), never
// unreviewed drafts. The reembed-lib source is the single place this
// guarantee is enforced; the test is a guard against a refactor that
// adds `intake_drafts` to the query.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("reembed reads submitted cases only", () => {
  const src = readFileSync("scripts/embeddings/reembed-lib.mjs", "utf8").replace(/^\s*\/\/.*$/gm, ""); // code only
  it("selects FROM cases and never touches intake_drafts", () => {
    expect(src).toMatch(/FROM cases\b/);
    expect(src).not.toContain("intake_drafts");
  });
  it("filters anonymised_at IS NULL and non-terminal rows", () => {
    expect(src).toContain("anonymised_at IS NULL");
    expect(src).toContain("status <> ALL($4)");
  });
  it("re-export the submitted-only helpers for completeness", () => {
    // The reembed CLI imports assertCacheReady, which the runtime
    // path uses to fail closed if the local cache is missing or
    // tampered. A regression that drops the export would leave the
    // CLI calling a non-existent function.
    expect(src).toMatch(/export\s+async\s+function\s+assertCacheReady/);
  });
});
