// TASK-014/020/033 (D6 §9.2, TC-021/056, BR-026). The protected DEMO_MODE cache
// holds exact-source fixtures and only matches by SHA-256. Live cache must
// remain unreachable; the fixtures are synthetic-only, source-bound and
// backwards compatible with the original Mitu example.
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { caseDraftSchema } from "@/contracts";
import {
  EXTRACT_FIXTURE_DRAFT,
  EXTRACT_FIXTURE_MIM_DRAFT,
  EXTRACT_FIXTURE_MIM_SOURCE,
  EXTRACT_FIXTURE_RAFI_DRAFT,
  EXTRACT_FIXTURE_RAFI_SOURCE,
  EXTRACT_FIXTURE_SOURCE,
  EXTRACT_FIXTURES,
  findExtractFixture,
  findTranscriptFixture,
} from "@/server/cache";

const SCRIPTED = [
  { id: "mitu" as const, source: EXTRACT_FIXTURE_SOURCE, draft: EXTRACT_FIXTURE_DRAFT },
  { id: "rafi" as const, source: EXTRACT_FIXTURE_RAFI_SOURCE, draft: EXTRACT_FIXTURE_RAFI_DRAFT },
  { id: "mim" as const, source: EXTRACT_FIXTURE_MIM_SOURCE, draft: EXTRACT_FIXTURE_MIM_DRAFT },
];

describe("protected intake cache fixtures", () => {
  it("keeps the original Mitu fixture backwards compatible and exact-source", () => {
    vi.stubEnv("DEMO_MODE", "1");
    const hash = createHash("sha256").update(EXTRACT_FIXTURE_SOURCE).digest("hex");
    expect(EXTRACT_FIXTURES).toHaveLength(3);
    expect(EXTRACT_FIXTURES[0]?.sourceHash).toBe(hash);
    expect(EXTRACT_FIXTURES[0]?.sourceHash).not.toBe("0".repeat(64));
    expect(findExtractFixture(EXTRACT_FIXTURE_SOURCE)).toMatchObject({ sourceHash: hash });
    expect(caseDraftSchema.safeParse(EXTRACT_FIXTURE_DRAFT).success).toBe(true);
    for (const span of Object.values(EXTRACT_FIXTURE_DRAFT.evidence)) {
      expect(EXTRACT_FIXTURE_SOURCE.slice(span.start_utf16, span.end_utf16)).toBe(span.quote);
    }
  });

  it("covers all 3 scripted demo cases from D6 §9.2 with valid spans and matching hashes", () => {
    vi.stubEnv("DEMO_MODE", "1");
    for (const { source, draft } of SCRIPTED) {
      const hash = createHash("sha256").update(source).digest("hex");
      const found = findExtractFixture(source);
      expect(found, source).not.toBeNull();
      expect(found?.sourceHash).toBe(hash);
      expect(caseDraftSchema.safeParse(draft).success, source).toBe(true);
      for (const [path, span] of Object.entries(draft.evidence)) {
        expect(source.slice(span.start_utf16, span.end_utf16), `${path} ${source}`).toBe(span.quote);
      }
    }
  });

  it("keeps every non-quoted field null and excludes invented current time / source fields", () => {
    vi.stubEnv("DEMO_MODE", "1");
    for (const { source, draft } of SCRIPTED) {
      // Every quoted span lives in its source, and every provenanced path maps to
      // a real, supported value. Unknowns stay unknown.
      for (const [path, span] of Object.entries(draft.evidence)) {
        expect(source.includes(span.quote), `${path} ${source}`).toBe(true);
        expect(span.start_utf16).toBeGreaterThanOrEqual(0);
        expect(span.end_utf16).toBeLessThanOrEqual(source.length);
      }
      // No fixture invents a district code, height, marks, thana, circumstances,
      // or relation. Those arrive later (district via the question loop).
      expect(draft.event.district_code).toBeNull();
      expect(draft.child.height_cm).toBeNull();
      expect(draft.child.marks).toBeNull();
      expect(draft.event.thana).toBeNull();
      expect(draft.event.circumstances).toBeNull();
      expect(draft.reporter.relation).toBeNull();
      expect(draft.source_text).toBe(source);
    }
  });

  it("returns null for any other text, regardless of DEMO_MODE, and never matches by prefix or substring", () => {
    vi.stubEnv("DEMO_MODE", "1");
    for (const miss of [
      "",
      EXTRACT_FIXTURE_SOURCE.slice(0, -1),
      `${EXTRACT_FIXTURE_SOURCE} `,
      "আমার ছেলে রফিক, বয়স ১৩, হারিয়ে গেছে।",
      "আমার মেয়ে মিতু",
    ]) {
      expect(findExtractFixture(miss), miss).toBeNull();
    }
  });

  it("never matches outside DEMO_MODE=1 (live cache must stay unreachable, zero paid-slot hits)", () => {
    vi.stubEnv("DEMO_MODE", "0");
    expect(findExtractFixture(EXTRACT_FIXTURE_SOURCE)).toBeNull();
    expect(findExtractFixture(EXTRACT_FIXTURE_RAFI_SOURCE)).toBeNull();
    expect(findExtractFixture(EXTRACT_FIXTURE_MIM_SOURCE)).toBeNull();
  });

  it("has no transcript fixture until matching audio bytes are present", () => {
    vi.stubEnv("DEMO_MODE", "1");
    expect(findTranscriptFixture("demo.rafi.transcript", "0".repeat(64))).toBeNull();
    expect(findTranscriptFixture("demo.mim.transcript", "0".repeat(64))).toBeNull();
  });
});
