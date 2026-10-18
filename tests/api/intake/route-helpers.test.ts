// Regression tests for the transcribe Content-Type allowlist (TASK-014, FR-002,
// BR-023). The route helper splits the Content-Type on ";" and checks the bare
// base type against an exact allowlist so a substring match cannot accept an
// arbitrary `audio/…` value. A missing/empty Content-Type is E-001 too — we
// never silently default to webm. The downstream audio-metadata verifier
// decides whether the declared codec is actually supported and returns E-011.
import { describe, expect, it } from "vitest";
import { __test__ } from "@/app/api/intake/route-helpers";
import { ApiError } from "@/app/api/_shared";

const { parseAudioCt } = __test__;

const allowed = [
  "audio/webm;codecs=opus",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/amr",
  "audio/aac",
  "audio/mpeg",
];

describe("parseAudioCt", () => {
  it.each(allowed)("accepts known base type with codec param: %s", (ct) => {
    expect(parseAudioCt(ct)).toBe(ct.split(";", 1)[0]!.trim());
  });

  it("accepts the same base types without parameters (case-insensitive)", () => {
    expect(parseAudioCt("AUDIO/WAV")).toBe("audio/wav");
    expect(parseAudioCt("audio/ogg")).toBe("audio/ogg");
  });

  it("rejects a missing/empty Content-Type with E-001 (never assumes webm)", () => {
    expect(() => parseAudioCt("")).toThrowError(ApiError);
    expect(() => parseAudioCt("   ")).toThrowError(ApiError);
    try { parseAudioCt(""); } catch (e) { expect((e as ApiError).id).toBe("E-001"); }
  });

  it("rejects non-audio base types with E-001", () => {
    for (const ct of ["video/webm", "image/png", "application/octet-stream", "text/plain", "audioz/webm"]) {
      expect(() => parseAudioCt(ct), ct).toThrowError(ApiError);
    }
  });

  it("rejects arbitrary audio/* base types that a substring match would have accepted", () => {
    // A naive /audio\//|webm|.../ test would accept these because "wav" or
    // "webm" is a substring of the path-like base. The allowlist refuses them.
    for (const ct of [
      "audio/arbitrary",
      "audio/x-matroska",
      "audio/wavish",
      "audio/not-webm",
      "audio/mp4-stuff",
      "audio/ogg+theora",
    ]) {
      expect(() => parseAudioCt(ct), ct).toThrowError(ApiError);
    }
  });

  it("ignores an extra ;params segment after splitting", () => {
    expect(parseAudioCt("audio/wav ; rate=8000")).toBe("audio/wav");
    expect(parseAudioCt("audio/ogg;codecs=opus;channels=2")).toBe("audio/ogg");
  });

  it("returns the canonical base type so the verifier can decide E-011 later", () => {
    // The helper is an allowlist gate, not a format gate. The actual E-011 for
    // an unsupported codec is raised by verifyAudioMetadata in
    // src/server/intake/audio-metadata.ts after the route accepts the base.
    expect(parseAudioCt("audio/webm;codecs=opus")).toBe("audio/webm");
  });
});
