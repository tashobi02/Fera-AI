// reembed must only ever read submitted cases (table `cases`), never unreviewed drafts.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("reembed reads submitted cases only", () => {
  const src = readFileSync("scripts/embeddings/reembed-lib.mjs", "utf8").replace(/^\s*\/\/.*$/gm, ""); // code only
  it("selects FROM cases and never touches intake_drafts", () => {
    expect(src).toMatch(/FROM cases\b/);
    expect(src).not.toContain("intake_drafts");
  });
  it("embeds only anonymised_at IS NULL, non-terminal rows", () => {
    expect(src).toContain("anonymised_at IS NULL");
    expect(src).toContain("status <> ALL($4)");
  });
});
