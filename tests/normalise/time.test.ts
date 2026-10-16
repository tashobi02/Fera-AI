import { describe, expect, it, vi } from "vitest";
import { CLOCK_SKEW_MS, inputDateTimeSchema, toDhakaIso } from "@/contracts";
import { normaliseTime } from "@/server/normalise";

const fromFixture = (phrase: string, nowIso = "2026-10-09T12:00:00+06:00") => {
  const source = `[MOCK] ${phrase}`;
  return normaliseTime(source, { start_utf16: 7, end_utf16: source.length }, nowIso);
};

describe("normaliseTime", () => {
  // FR-003, TC-002: yesterday afternoon has a 16:00 display point and ±2 h bounds.
  it("anchors TC-002 to the explicit intake clock", () => {
    expect(fromFixture("গতকাল বিকেলে")).toEqual({
      status: "known",
      value: { at: "2026-10-08T16:00:00+06:00", at_lower: "2026-10-08T14:00:00+06:00", at_upper: "2026-10-08T18:00:00+06:00", at_approx: true },
      evidence: [{ quote: "গতকাল বিকেলে", start_utf16: 7, end_utf16: 19, derivation: "time_interval" }],
    });
  });

  // D2A A-035, FR-003: only the five specified centres and ±2 h widths are allowed.
  it.each([
    ["সকাল", "08:00", "06:00", "10:00"], // A-035: morning.
    ["দুপুর", "13:00", "11:00", "15:00"], // A-035: noon.
    ["বিকেল", "16:00", "14:00", "18:00"], // A-035: afternoon.
    ["সন্ধ্যা", "18:30", "16:30", "20:30"], // A-035: evening.
    ["রাত", "21:00", "19:00", "23:00"], // A-035: night.
  ])("keeps গতকাল %s approximate", (word, centre, lower, upper) => {
    const result = fromFixture(`গতকাল ${word}`);
    expect(result).toMatchObject({ status: "known", value: {
      at: `2026-10-08T${centre}:00+06:00`, at_lower: `2026-10-08T${lower}:00+06:00`, at_upper: `2026-10-08T${upper}:00+06:00`, at_approx: true,
    } });
    if (result.status === "known") {
      for (const iso of [result.value.at, result.value.at_lower, result.value.at_upper]) expect(inputDateTimeSchema.safeParse(iso).success).toBe(true);
    }
  });

  // FR-003, BR-016: yesterday is a Dhaka calendar date, not the clock minus 24 h.
  it("handles the instant before and after Dhaka midnight", () => {
    expect(fromFixture("গতকাল বিকেলে", "2026-10-08T17:59:59.999Z")).toMatchObject({ status: "known", value: { at: "2026-10-07T16:00:00+06:00" } });
    expect(fromFixture("গতকাল বিকেলে", "2026-10-08T18:00:00Z")).toMatchObject({ status: "known", value: { at: "2026-10-08T16:00:00+06:00" } });
  });

  // FR-003: relative time crosses calendar month boundaries correctly.
  it("rolls back to the previous month", () => {
    expect(fromFixture("গতকাল বিকেলে", "2026-11-01T00:00:00+06:00")).toMatchObject({ status: "known", value: { at: "2026-10-31T16:00:00+06:00" } });
  });

  // FR-003: relative time crosses calendar year boundaries correctly.
  it("rolls back to the previous year", () => {
    expect(fromFixture("গতকাল বিকেলে", "2026-01-01T00:00:00+06:00")).toMatchObject({ status: "known", value: { at: "2025-12-31T16:00:00+06:00" } });
  });

  // FR-003, inputDateTimeSchema: calendar arithmetic respects leap years.
  it("retains leap day", () => {
    expect(fromFixture("গতকাল বিকেলে", "2024-03-01T00:00:00+06:00")).toMatchObject({ status: "known", value: { at: "2024-02-29T16:00:00+06:00" } });
  });

  // D2A §5.1, BR-016: an explicit ISO instant has equal bounds and +06:00 output.
  it.each(["2026-10-08T10:00:00Z", "2026-10-08T12:00:00+02:00", "২০২৬-১০-০৮T১০:০০:০০Z"])("labels the conversion of %s as time_interval", (phrase) => {
    expect(fromFixture(phrase)).toMatchObject({ status: "known", value: {
      at: "2026-10-08T16:00:00+06:00", at_lower: "2026-10-08T16:00:00+06:00", at_upper: "2026-10-08T16:00:00+06:00", at_approx: false,
    }, evidence: [{ quote: phrase, derivation: "time_interval" }] });
  });

  // BR-008: already canonical ISO input requires no time or digit conversion.
  it("labels a canonical exact instant as direct", () => {
    expect(fromFixture("2026-10-08T16:00:00+06:00")).toMatchObject({ status: "known", evidence: [{ derivation: "direct" }] });
  });

  // FR-003, D2A §5.1: Bangla digits in a supported explicit ISO format are normalised.
  it("normalises digits in an exact instant and keeps the original quote", () => {
    const phrase = "২০২৬-১০-০৮T১৬:০০:০০+০৬:০০";
    expect(fromFixture(phrase)).toMatchObject({ status: "known", value: { at: "2026-10-08T16:00:00+06:00", at_approx: false }, evidence: [{ quote: phrase, derivation: "digits" }] });
  });

  // TC-030, BR-016: the normaliser's exact-instant check uses shared CLOCK_SKEW_MS, inclusive.
  it.each([1, CLOCK_SKEW_MS - 1, CLOCK_SKEW_MS])("accepts an exact instant %s ms ahead within the clock tolerance", (ahead) => {
    const phrase = toDhakaIso(Date.parse("2026-10-09T12:00:00+06:00") + ahead);
    expect(fromFixture(phrase)).toMatchObject({ status: "known", value: { at: phrase, at_lower: phrase, at_upper: phrase, at_approx: false } });
  });

  // TC-030, BR-016: one millisecond beyond the shared tolerance still requires clarification.
  it("leaves exact instants beyond CLOCK_SKEW_MS unknown", () => {
    const phrase = toDhakaIso(Date.parse("2026-10-09T12:00:00+06:00") + CLOCK_SKEW_MS + 1);
    expect(fromFixture(phrase)).toEqual({ status: "unknown", value: null, reason: "future", evidence: [] });
  });

  // BR-016: the explicit intake instant itself is not in the future.
  it("accepts an event equal to the intake clock", () => {
    expect(fromFixture("2026-10-09T12:00:00+06:00")).toMatchObject({ status: "known", value: { at_approx: false } });
  });

  // FR-003, BR-008: no date is inferred from a bare part of day.
  it("keeps date-ambiguous time words unknown", () => {
    for (const phrase of ["সকাল", "দুপুর", "বিকেল", "সন্ধ্যা", "রাত", "গতকাল"]) {
      expect(fromFixture(phrase)).toEqual({ status: "unknown", value: null, reason: "ambiguous", evidence: [] });
    }
  });

  // BR-008, OD-012-5: only A-035 base words and TC-002's বিকেলে are specified; no suffix stripping.
  it.each([
    ["গতকাল বিকাল", "unsupported"], ["গতকাল সকালে", "unsupported"],
    ["গতকাল দুপুরে", "unsupported"], ["গতকাল সন্ধ্যায়", "unsupported"],
    ["গতকাল রাতে", "unsupported"], ["গতকাল সন্ধা", "unsupported"],
    ["বিকেলে", "ambiguous"], ["সন্ধ্যায়", "unsupported"],
  ] as const)("keeps %s unknown with reason %s", (phrase, reason) => {
    expect(fromFixture(phrase)).toEqual({ status: "unknown", value: null, reason, evidence: [] });
  });

  // COMP-008, BR-008: unsupported relative words, suffixes and qualifiers are not guessed.
  it("does not infer unlisted phrases or select a substring of a contradiction", () => {
    for (const phrase of ["আগামীকাল বিকেলে", "আজ বিকেলে", "পরশু", "yesterday afternoon", "গতকাল সকালে", "গতকাল বিকেলে নয়", "গতকাল বিকেলে অথবা রাতে", "গতকাল রাত ১২টায়", "প্রায় 2026-10-08T16:00:00+06:00"]) {
      expect(fromFixture(phrase)).toMatchObject({ status: "unknown", evidence: [] });
    }
  });

  // D2A §2.1 nowIso and BR-016: an explicit valid offset clock is mandatory.
  it("rejects invalid, impossible and offset-free intake clocks", () => {
    for (const clock of ["", "now", "2026-02-30T12:00:00+06:00", "2026-10-09T12:00:00", "2026-10-09T12:00:00.0001+06:00"]) {
      expect(fromFixture("গতকাল বিকেলে", clock)).toMatchObject({ status: "unknown", reason: "invalid_clock" });
    }
  });

  // Frozen datetime contract: unsupported date notation and impossible dates stay unknown.
  it("rejects date formats the pack does not define", () => {
    for (const phrase of ["08/10/2026", "2026-02-30T16:00:00+06:00", "2026-10-08T16:00:00", "2026-10-08"]) {
      expect(fromFixture(phrase)).toMatchObject({ status: "unknown" });
    }
  });

  // FR-003: intake anchoring never consults the process clock.
  it("does not depend on Date.now", () => {
    const now = vi.spyOn(Date, "now").mockImplementation(() => { throw new Error("ambient clock accessed"); });
    try { expect(fromFixture("গতকাল বিকেলে")).toMatchObject({ status: "known" }); } finally { now.mockRestore(); }
  });

  // Frozen four-digit year bounds: relative derivation cannot emit an invalid earlier year.
  it("leaves out-of-contract derived dates unknown", () => {
    expect(fromFixture("গতকাল বিকেলে", "1000-01-01T00:00:00+06:00")).toMatchObject({ status: "unknown" });
  });
});
