import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("matcher runner imports", () => {
  it("does not retain the removed dynamic import in run.ts", () => {
    const source = readFileSync(join(process.cwd(), "src/server/matching/run.ts"), "utf8");
    expect(source).not.toMatch(/\bawait\s+import\s*\(/);
  });
});
