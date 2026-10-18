import { expect, it } from "vitest";
import { ESLint } from "eslint";
import { resolve } from "node:path";

it("ignores nested agent worktrees while retaining active application lint coverage", async () => {
  const eslint = new ESLint({ cwd: process.cwd() });
  expect(await eslint.isPathIgnored(resolve(".worktrees/synthetic-lane/src/app/page.tsx"))).toBe(true);
  expect(await eslint.isPathIgnored(resolve("src/server/audit/write.ts"))).toBe(false);
});
