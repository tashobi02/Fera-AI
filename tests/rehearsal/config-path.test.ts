import { beforeEach, expect, it, vi } from "vitest";
import { resolve } from "node:path";
const { stopBeforeWrites, mkdir } = vi.hoisted(() => ({ stopBeforeWrites: new Error("stop before evidence writes"), mkdir: vi.fn() }));
vi.mock("node:fs/promises", async (original) => ({ ...await original<typeof import("node:fs/promises")>(), mkdir }));
// @ts-expect-error -- the rehearsal CLI is an untyped ESM module.
import { runRepeatSuite } from "../../scripts/rehearsal/run-automated-repeats.mjs";
beforeEach(() => { mkdir.mockReset(); mkdir.mockRejectedValue(stopBeforeWrites); });
it.each(["playwright.offline.config.ts", resolve("playwright.offline.config.ts")])("accepts an existing config path before starting a rehearsal: %s", async (config) => {
  await expect(runRepeatSuite({ argv: ["--runs", "1", "--config", config] })).rejects.toBe(stopBeforeWrites);
  expect(mkdir).toHaveBeenCalledOnce();
});
it("still refuses a missing absolute config before writing evidence", async () => {
  await expect(runRepeatSuite({ argv: ["--config", resolve("missing-system-test.config.ts")] })).rejects.toThrow("missing config");
  expect(mkdir).not.toHaveBeenCalled();
});
