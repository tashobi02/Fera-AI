// TASK-021 round 2: word-boundary and label regressions for the typed fake (BR-008, AMD-CLAUDE-1).
// Lookalike text must stay unknown; only literal, labelled values are extracted.
import { describe, expect, it } from "vitest";
import type { DraftFieldPath } from "@/contracts";
import { fakeExtract } from "@/lib/intake/fakes/fake-client";

const ages = (text: string) => fakeExtract({ kind: "missing", text }, 1).draft.child;

describe("age needs its own word (SG1, R1)", () => {
  it.each(["village 7,", "page 12.", "Garage 3;", "Average 9,", "I left a message 8", "this is a page 9, ok", "সমবয়স ৭,", "my age 9,"])("%s stays unknown", (text) => {
    expect(ages(text).age_years).toBeNull();
    expect(ages(text).age_min).toBeNull();
  });

  it.each([["Age: 7.", 7], ["বয়স ৭ বছর।", 7], ["age 12 years", 12]])("%s is still read", (text, years) => {
    expect(ages(text).age_years).toBe(years);
  });
});

describe("relation needs whole words (SG2, R1)", () => {
  it.each(["my sons friend", "my sonia went", "আমার ছেলের বন্ধু", "আমার মেয়েটি", "dummy son", "my daughters school"])("%s sets no sex or name", (text) => {
    const child = ages(text);
    expect(child.sex).toBe("unknown");
    expect(child.name).toBeNull();
    expect(child.name_latin).toBeNull();
  });

  it.each(["আমার মেয়ে নয়, ভাগ্নি", "আমার মেয়ে না, ভাগ্নি", "my son no, nephew", "my daughter not, niece"])("%s does not take the negation as a name", (text) => {
    expect(ages(text).name).toBeNull();
    expect(ages(text).name_latin).toBeNull();
  });

  it("still reads a plain statement", () => {
    const child = ages("my son Rafiq");
    expect([child.sex, child.name_latin]).toEqual(["male", "Rafiq"]);
  });
});

describe("a phone number needs the phone question or a label (SW1)", () => {
  const phone = (text: string) => fakeExtract({ kind: "missing", text }, 1).draft.reporter.phone;

  it.each(["01700000001", "আমার মেয়ে নুসরাত, বয়স ৭, order 01700000001 ok", "ref ০১৭০০০০০০০১ ছিল"])("a bare number in the first message stays unknown: %s", (text) => {
    expect(phone(text)).toBeNull();
  });

  it.each([["my number 01700000001", "01700000001"], ["my phone is 01700000001.", "01700000001"], ["আমার ফোন নম্বর ০১৭০০০০০০০১", "01700000001"], ["আমার নম্বর: 01700000001", "01700000001"]])("%s", (text, expected) => {
    expect(phone(text)).toBe(expected);
  });

  it("is accepted as the answer to the phone question only", () => {
    const skipped = new Set<DraftFieldPath>();
    let res = fakeExtract({ kind: "missing", text: "আমার মেয়ে নুসরাত, বয়স ৭" }, 1, skipped);
    const answer = (text: string) => {
      res = fakeExtract({ kind: "missing", draft: res.draft, draft_token: res.draft_token, draft_revision: res.draft_revision, answer: text }, 1, skipped);
    };
    answer("জানি না"); // district
    answer("জানি না"); // time
    expect(res.next_question?.field).toBe("reporter.phone");
    answer("01700000001");
    expect(res.draft.reporter.phone).toBe("01700000001");
    expect(res.draft.source_text.slice(res.draft.evidence["reporter.phone"]!.start_utf16, res.draft.evidence["reporter.phone"]!.end_utf16)).toBe("01700000001");
  });

  it("an answer to a different question never fills the phone", () => {
    const base = fakeExtract({ kind: "missing", text: "আমার মেয়ে নুসরাত" }, 1);
    expect(base.next_question?.field).toBe("child.age_years");
    const res = fakeExtract({ kind: "missing", draft: base.draft, draft_token: base.draft_token, draft_revision: 1, answer: "01700000001" }, 1);
    expect(res.draft.reporter.phone).toBeNull();
  });
});

describe("a question is not repeated after it was answered (R2)", () => {
  it("asks the district once, then moves on, keeping the district unknown", () => {
    const skipped = new Set<DraftFieldPath>();
    const first = fakeExtract({ kind: "missing", text: "আমার মেয়ে নুসরাত, বয়স ৭ বছর।" }, 1, skipped);
    expect(first.next_question?.field).toBe("event.district_code");
    const second = fakeExtract({ kind: "missing", draft: first.draft, draft_token: first.draft_token, draft_revision: 1, answer: "মিরপুর, ঢাকা" }, 2, skipped);
    expect(second.next_question?.field).not.toBe("event.district_code");
    expect(second.missing_fields).toContain("event.district_code");
    expect(second.draft.event.district_text).toBeNull();
    expect(second.draft.event.district_code).toBeNull();
  });

  it("with every remaining question answered the fake offers none, so the form takes over", () => {
    const skipped = new Set<DraftFieldPath>();
    let res = fakeExtract({ kind: "missing", text: "আমার মেয়ে নুসরাত" }, 1, skipped);
    const seen: string[] = [];
    for (let i = 0; i < 8 && res.next_question; i++) {
      seen.push(res.next_question.field);
      res = fakeExtract({ kind: "missing", draft: res.draft, draft_token: res.draft_token, draft_revision: res.draft_revision, answer: "জানি না" }, 1, skipped);
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(res.next_question).toBeNull();
    expect(res.missing_fields.length).toBeGreaterThan(0);
  });
});
