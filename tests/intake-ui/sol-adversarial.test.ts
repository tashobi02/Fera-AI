// TASK-021 Sol review: BR-008, literal facts only, including ambiguity across turns.
import { describe, expect, it } from "vitest";
import { fakeExtract, understand } from "@/lib/intake/fakes/fake-client";

const draft = (text: string) => fakeExtract({ kind: "missing", text }, 1).draft;
const blank = (text: string) => {
  const d = draft(text);
  expect(d.child).toMatchObject({ name: null, name_latin: null, sex: "unknown", age_years: null, age_min: null, age_max: null });
  expect(d.reporter.phone).toBeNull();
  expect(d.evidence).toEqual({});
};

describe("Sol: ambiguity must not become facts", () => {
  it.each([
    "age 7, sex female, not sure about that age",
    "বয়স ৭, নাম নুসরাত, না আসলে মনে নেই",
    "age 7, name Mina, n\u200bot certain",
    "বয়স ৭, লিঙ্গ মেয়ে, ন\u200cয় নিশ্চিত",
    "age 7, age 8", "বয়স ৭; বয়স ৮", "age 7, বয়স ৮",
    "sex male; sex female", "লিঙ্গ ছেলে; লিঙ্গ মেয়ে",
    "name Mina; name Rafiq", "নাম নুসরাত; নাম মীম",
    "my daughter vanished", "my son drowned", "আমার মেয়ে অসুস্থ", "আমার ছেলে মারা গেছে",
    "name unknown", "নাম অজানা", "my daughter friend", "my son friend Rafiq",
    "nameMina", "নামনুসরাত", "age7", "বয়স৭",
    "my number is not 01700000001", "not my number 01700000001",
    "আমার নম্বর ০১৭০০০০০০০১ নয়", "my number 01700000001, no 01700000002",
    "my number 01700000001; my number 01700000002",
    "my number 01700000001, age 7, not my number",
    "my number 01700000001abc", "my number 01700000001.5",
    "my number 01700000001\u200b2", "my number 01700000001٢",
    "my number 01700000001 isn't correct", "my number 01700000001 isn’t correct",
    "my son’s name Rafiq", "আমার মেয়ে\u200cর নাম নুসরাত",
    "age ৭\u200b৮", "age 7.8 years", "বয়স ৭.৮ বছর",
  ])("leaves the unsupported or conflicting message unknown: %s", blank);

  it.each([
    "not 01700000001", "০১৭০০০০০০০১ নয়", "01700000001 or 01700000002",
    "01700000001\u200b2", "01700000001٢", "friend’s 01700000001",
  ])("phone-question answer must itself be unambiguous: %s", (text) => {
    expect(understand(text, 0, true).reporter.phone).toBeUndefined();
  });

  it.each(["age 7?", "sex female?", "name Mina?", "বয়স ৭؟"])("a question is not an assertion: %s", blank);

  it.each(["age is not 7", "age 8, not sure", "that is wrong", "আগের তথ্য ভুল", "my daughter Mina?"])("an unsupported continuation retracts facts and offers the form: %s", (answer) => {
    const first = fakeExtract({ kind: "missing", text: "my daughter Mina, age 7" }, 1);
    const next = fakeExtract({ kind: "missing", draft: first.draft, draft_token: first.draft_token, draft_revision: 1, answer }, 2);
    expect([next.draft.child.name_latin, next.draft.child.sex, next.draft.child.age_years]).toEqual([null, "unknown", null]);
    expect(next.draft.evidence).toEqual({});
    expect(next.next_question).toBeNull();
    expect(next.draft.source_text).toContain(answer);
    expect(next.draft.source_text).toContain("my daughter Mina, age 7");
  });

  it("a contradictory follow-up retracts the earlier age and its evidence", () => {
    const first = fakeExtract({ kind: "missing", text: "age 7" }, 1);
    const next = fakeExtract({ kind: "missing", draft: first.draft, draft_token: first.draft_token, draft_revision: 1, answer: "age 8" }, 2);
    expect([next.draft.child.age_years, next.draft.child.age_min, next.draft.child.age_max]).toEqual([null, null, null]);
    expect(next.draft.evidence["child.age_years"]).toBeUndefined();
  });
});

describe("Sol: strict positives and original UTF-16 evidence survive", () => {
  it.each([
    ["আমার মেয়ে নুসরাত, বয়স ৭", "name", "নুসরাত"],
    ["আমার মেয়ে মীম".normalize("NFD"), "name", "মীম".normalize("NFD")],
    ["my daughter Mina, age 7", "name_latin", "Mina"],
    ["নাম: নুসরাত জাহান", "name", "নুসরাত জাহান"],
    ["নাম: কোয়েল".normalize("NFD"), "name", "কোয়েল".normalize("NFD")],
  ] as const)("%s", (text, field, value) => {
    const d = draft(text);
    expect(d.child[field]).toBe(value);
    for (const e of Object.values(d.evidence)) expect(text.slice(e.start_utf16, e.end_utf16)).toBe(e.quote);
  });
  it.each(["বয়স: ০7 বছর", "age 1৭", "৭ বছর", "Age: 9 years", "বয়স ৭".normalize("NFD")])("reads explicit mixed-script digits: %s", (text) => {
    expect(draft(text).child.age_years).toBe(Number(text.match(/[0-9০-৯]+/)![0].replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6))));
  });
  it.each(["my number 0১৭০০০০০০০১", "আমার নম্বর: ০1৭০০০০০০০১", "my phone is 01700000001."])("reads a complete explicit phone: %s", (text) => {
    const d = draft(text);
    expect(d.reporter.phone).toBe("01700000001");
    const e = d.evidence["reporter.phone"]!;
    expect(text.slice(e.start_utf16, e.end_utf16)).toBe(e.quote);
  });
  it("identical repeated claims do not introduce a conflict", () => {
    expect(draft("age 7; বয়স ৭").child.age_years).toBe(7);
  });
});
