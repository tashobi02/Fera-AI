import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CLIENT_EXAMPLE_VALUES } from "@/contracts/examples";

// Regenerate after changing examples.ts: UPDATE_CLIENT_EXAMPLES=1 npx vitest run tests/contracts/client-examples.test.ts
const file = join(import.meta.dirname, "..", "..", "src", "contracts", "client-examples.json");
const expected = JSON.parse(JSON.stringify(CLIENT_EXAMPLE_VALUES));
if (process.env.UPDATE_CLIENT_EXAMPLES === "1") writeFileSync(file, `${JSON.stringify(expected, null, 2)}\n`);

describe("client-safe examples (16)", () => {
  it("client-examples.json equals the examples.ts DTO values", () => {
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(expected);
  });

  it("clientExamples validates every value and keeps the same keys and values", async () => {
    const { clientExamples } = await import("@/contracts/client-examples");
    expect(Object.keys(clientExamples).sort()).toEqual(Object.keys(expected).sort());
    expect(JSON.parse(JSON.stringify(clientExamples))).toEqual(expected);
  });

  it("the client module pulls in no server code", () => {
    const source = readFileSync(join(import.meta.dirname, "..", "..", "src", "contracts", "client-examples.ts"), "utf8");
    expect(source).not.toMatch(/from "\.\/(server|examples)/);
    expect(source).not.toMatch(/node:/);
  });

  it("contains no server-only shapes", () => {
    const text = JSON.stringify(expected);
    for (const marker of ["reporter_session_id", "created_by_user_id", "payload_hash", "submission_payload_hash", "actor_session_id"]) {
      expect(text).not.toContain(marker);
    }
  });
});
