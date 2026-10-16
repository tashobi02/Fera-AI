// TASK-021: "what we understood" rows and the device-memory hand-off.
import { afterEach, describe, expect, it } from "vitest";
import type { CaseDraft } from "@/contracts";
import { clientExamples } from "@/contracts/client-examples";
import { missingLabels, summaryRows } from "@/lib/intake/draft-summary";
import { acknowledgeNotice, clearIntakeMemory, handOff, noticeAcknowledged, takeHandoff } from "@/lib/intake/handoff";

const draft: CaseDraft = clientExamples.extractResponse.draft;
const value = (rows: ReturnType<typeof summaryRows>, key: string) => rows.find((r) => r.key === key)?.value;

describe("summaryRows (BR-008: unknown stays unknown)", () => {
  it("shows every field, with null for unknowns", () => {
    const rows = summaryRows(draft, "en");
    expect(rows.map((r) => r.key)).toEqual(["name", "nameLatin", "age", "sex", "height", "clothing", "marks", "at", "place", "thana", "district", "circumstances", "relation", "phone"]);
    expect(value(rows, "marks")).toBeNull();
    expect(value(rows, "district")).toBeNull();
    expect(value(rows, "age")).toBe("7 years");
    expect(value(rows, "sex")).toBe("Girl");
    expect(value(rows, "phone")).toBe("01700000001");
    expect(value(rows, "at")).toBe("About 12 October, 16:00");
  });

  it("shows the one known bound of a one-sided window, never unknown (R5)", () => {
    const base = { ...draft, event: { ...draft.event, at: null, at_approx: false } };
    const after = summaryRows({ ...base, event: { ...base.event, at_lower: draft.event.at, at_upper: null } }, "en");
    const before = summaryRows({ ...base, event: { ...base.event, at_lower: null, at_upper: draft.event.at } }, "en");
    expect(value(after, "at")).toMatch(/^After 12 October, .*\(approximate\)$/);
    expect(value(before, "at")).toMatch(/^Before 12 October, .*\(approximate\)$/);
    expect(value(summaryRows({ ...base, event: { ...base.event, at_lower: draft.event.at, at_upper: null } }, "bn"), "at")).toMatch(/-এর পরে \(আনুমানিক\)$/);
    expect(value(summaryRows({ ...base, event: { ...base.event, at_lower: null, at_upper: null } }, "en"), "at")).toBeNull();
  });

  it("uses Bangla numerals in Bangla mode without changing the draft", () => {
    const rows = summaryRows(draft, "bn");
    expect(value(rows, "age")).toBe("৭ বছর");
    expect(value(rows, "phone")).toBe("০১৭০০০০০০০১");
    expect(value(rows, "at")).toMatch(/^আনুমানিক ১২ অক্টোবর, ৪:০০ /);
    expect(value(rows, "at")).not.toMatch(/[0-9A-Za-z]/);
    expect(draft.reporter.phone).toBe("01700000001");
  });

  it("shows an age range, a time window and unknown when only a district code is known", () => {
    const rows = summaryRows(
      {
        ...draft,
        child: { ...draft.child, age_years: null, age_min: 6, age_max: 8, sex: "unknown" },
        event: { ...draft.event, district_code: 26, at: null },
      },
      "bn",
    );
    expect(value(rows, "age")).toBe("৬–৮ বছর");
    expect(value(rows, "district")).toBeNull();
    expect(value(rows, "sex")).toBeNull();
    expect(value(rows, "at")).toContain("আনুমানিক");
    expect(value(rows, "at")).toContain("১২ অক্টোবর");
    expect(value(rows, "at")).not.toMatch(/[0-9A-Za-z]/);
  });

  it("shows height, thana, parent's own circumstances and relation; no known value is hidden", () => {
    const rows = summaryRows({ ...draft, child: { ...draft.child, height_cm: 115 }, event: { ...draft.event, thana: "মিরপুর", circumstances: "স্কুল থেকে ফেরেনি" }, reporter: { ...draft.reporter, relation: "মা" } }, "bn");
    expect(value(rows, "name")).toBe(draft.child.name);
    expect(value(rows, "nameLatin")).toBe(draft.child.name_latin);
    expect(value(rows, "height")).toBe("১১৫ সেমি");
    expect(value(rows, "thana")).toBe("মিরপুর");
    expect(value(rows, "circumstances")).toBe("স্কুল থেকে ফেরেনি");
    expect(rows.find((r) => r.key === "circumstances")?.label).toContain("আপনার কথায়");
    expect(value(rows, "relation")).toBe("মা");
  });

  it("names missing fields once each", () => {
    expect(missingLabels(["event.district_code", "event.district_text", "reporter.phone"], "en")).toEqual(["District", "Your mobile number"]);
  });
});

describe("device-memory hand-off", () => {
  afterEach(clearIntakeMemory);

  it("acknowledges the notice and forgets it on discard", () => {
    expect(noticeAcknowledged()).toBe(false);
    acknowledgeNotice();
    expect(noticeAcknowledged()).toBe(true);
    clearIntakeMemory();
    expect(noticeAcknowledged()).toBe(false);
  });

  it("hands the draft to S-003/S-005 exactly once", () => {
    const handoff = {
      to: "review" as const,
      sourceText: draft.source_text,
      response: clientExamples.extractResponse,
      missing: [],
      asked: 1,
      cached: false,
      mock: true,
    };
    handOff(handoff);
    expect(takeHandoff()).toBe(handoff);
    expect(takeHandoff()).toBeNull();
  });
});
