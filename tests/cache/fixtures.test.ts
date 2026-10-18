import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { caseDraftSchema } from "@/contracts";
import { EXTRACT_FIXTURE_DRAFT, EXTRACT_FIXTURE_SOURCE, EXTRACT_FIXTURES, findExtractFixture, findTranscriptFixture } from "@/server/cache";

describe("protected intake cache fixtures", () => {
  it("uses an exact synthetic source hash and evidence spans that point into that source", () => {
    vi.stubEnv("DEMO_MODE", "1");
    const hash = createHash("sha256").update(EXTRACT_FIXTURE_SOURCE).digest("hex");
    expect(EXTRACT_FIXTURES).toHaveLength(1);
    expect(EXTRACT_FIXTURES[0]?.sourceHash).toBe(hash);
    expect(EXTRACT_FIXTURES[0]?.sourceHash).not.toBe("0".repeat(64));
    expect(findExtractFixture(EXTRACT_FIXTURE_SOURCE)).toMatchObject({ sourceHash: hash });
    expect(caseDraftSchema.safeParse(EXTRACT_FIXTURE_DRAFT).success).toBe(true);
    for (const span of Object.values(EXTRACT_FIXTURE_DRAFT.evidence)) {
      expect(EXTRACT_FIXTURE_SOURCE.slice(span.start_utf16, span.end_utf16)).toBe(span.quote);
    }
  });

  it("has no transcript fixture until matching audio bytes are present", () => {
    vi.stubEnv("DEMO_MODE", "1");
    expect(findTranscriptFixture("demo.rafi.transcript", "0".repeat(64))).toBeNull();
  });
});
