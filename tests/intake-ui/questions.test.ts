import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { locales } from "@/locales";
import { formatQuestion } from "@/lib/intake/questions";
import type { DraftFieldPath } from "@/contracts";
import { fakeExtract } from "@/lib/intake/fakes/fake-client";

describe("formatQuestion helper (TASK-021, D3 COMP-009)", () => {
  describe("known-name interpolation", () => {
    it("interpolates Bangla name into district question", () => {
      expect(formatQuestion(locales.bn.questionDistrict, "নুসরাত")).toBe("নুসরাত-কে শেষবার কোন জেলায় দেখা গিয়েছিল?");
    });

    it("interpolates Bangla name into age question", () => {
      expect(formatQuestion(locales.bn.questionAge, "মীম")).toBe("মীম-এর বয়স কত?");
    });

    it("interpolates Bangla name into place question", () => {
      expect(formatQuestion(locales.bn.questionPlace, "রফিক")).toBe("রফিক-কে শেষবার কোথায় দেখা গিয়েছিল?");
    });

    it("interpolates English name into district question", () => {
      expect(formatQuestion(locales.en.questionDistrict, "Mina")).toBe("In which district was Mina last seen?");
    });

    it("interpolates English name into when question", () => {
      expect(formatQuestion(locales.en.questionAt, "Mina")).toBe("When was Mina last seen?");
    });

    it("interpolates English name into age question", () => {
      expect(formatQuestion(locales.en.questionAge, "Mina")).toBe("How old is Mina?");
    });

    it("interpolates English name into place question", () => {
      expect(formatQuestion(locales.en.questionPlace, "Mina")).toBe("Where was Mina last seen?");
    });
  });

  describe("unknown-name fallback", () => {
    it.each([null, undefined, "", "   "])("falls back to শিশুটিকে for district question when name is %s", (name) => {
      expect(formatQuestion(locales.bn.questionDistrict, name)).toBe("শিশুটিকে শেষবার কোন জেলায় দেখা গিয়েছিল?");
    });

    it.each([null, undefined, "", "   "])("falls back to শিশুটির for age question when name is %s", (name) => {
      expect(formatQuestion(locales.bn.questionAge, name)).toBe("শিশুটির বয়স কত?");
    });

    it.each([null, undefined, "", "   "])("falls back to শিশুটিকে for place question when name is %s", (name) => {
      expect(formatQuestion(locales.bn.questionPlace, name)).toBe("শিশুটিকে শেষবার কোথায় দেখা গিয়েছিল?");
    });

    it.each([null, undefined, "", "   "])("falls back to the child for English district question when name is %s", (name) => {
      expect(formatQuestion(locales.en.questionDistrict, name)).toBe("In which district was the child last seen?");
    });

    it.each([null, undefined, "", "   "])("falls back to the child for English when question when name is %s", (name) => {
      expect(formatQuestion(locales.en.questionAt, name)).toBe("When was the child last seen?");
    });

    it.each([null, undefined, "", "   "])("falls back to the child for English age question when name is %s", (name) => {
      expect(formatQuestion(locales.en.questionAge, name)).toBe("How old is the child?");
    });

    it.each([null, undefined, "", "   "])("falls back to the child for English place question when name is %s", (name) => {
      expect(formatQuestion(locales.en.questionPlace, name)).toBe("Where was the child last seen?");
    });
  });

  describe("templates without placeholders", () => {
    it("leaves Bangla event-time question intact", () => {
      expect(formatQuestion(locales.bn.questionAt, "নুসরাত")).toBe("শেষবার কবে, কখন দেখা গিয়েছিল?");
      expect(formatQuestion(locales.bn.questionAt, null)).toBe("শেষবার কবে, কখন দেখা গিয়েছিল?");
    });

    it("leaves phone questions intact", () => {
      expect(formatQuestion(locales.bn.questionPhone, "মীম")).toBe(locales.bn.questionPhone);
      expect(formatQuestion(locales.en.questionPhone, "Mina")).toBe(locales.en.questionPhone);
    });
  });

  describe("integration with fakeExtract", () => {
    it("uses the child name in follow-up questions when the name was extracted", () => {
      const skipped = new Set<DraftFieldPath>();
      const r1 = fakeExtract({ kind: "missing", text: "আমার মেয়ে নুসরাত" }, 1, skipped);
      expect(r1.draft.child.name).toBe("নুসরাত");
      expect(r1.next_question?.field).toBe("child.age_years");
      expect(r1.next_question?.bn).toBe("নুসরাত-এর বয়স কত?");
      expect(r1.next_question?.en).toBe("How old is নুসরাত?");

      const r2 = fakeExtract({
        kind: "missing",
        draft: r1.draft,
        draft_token: r1.draft_token,
        draft_revision: 1,
        answer: "জানি না",
      }, 2, skipped);
      expect(r2.next_question?.field).toBe("event.district_code");
      expect(r2.next_question?.bn).toBe("নুসরাত-কে শেষবার কোন জেলায় দেখা গিয়েছিল?");
      expect(r2.next_question?.en).toBe("In which district was নুসরাত last seen?");
    });

    it("uses the fallback in follow-up questions when the child name is unknown", () => {
      const skipped = new Set<DraftFieldPath>();
      const r1 = fakeExtract({ kind: "missing", text: "my son" }, 1, skipped);
      expect(r1.draft.child.name).toBeNull();
      expect(r1.next_question?.field).toBe("child.age_years");
      expect(r1.next_question?.bn).toBe("শিশুটির বয়স কত?");
      expect(r1.next_question?.en).toBe("How old is the child?");

      const r2 = fakeExtract({
        kind: "missing",
        draft: r1.draft,
        draft_token: r1.draft_token,
        draft_revision: 1,
        answer: "জানি না",
      }, 2, skipped);
      expect(r2.next_question?.field).toBe("event.district_code");
      expect(r2.next_question?.bn).toBe("শিশুটিকে শেষবার কোন জেলায় দেখা গিয়েছিল?");
      expect(r2.next_question?.en).toBe("In which district was the child last seen?");
    });
  });
});

it("keeps user-visible unknown-name fallback words in the bilingual locale catalogue", () => {
  const helper = readFileSync("src/lib/intake/questions.ts", "utf8");
  // Placeholders are syntax; fallback words are copy and must be translatable.
  expect(helper).not.toMatch(/"(?:শিশুটিকে|শিশুটির|শিশু|the child)"/u);
  expect(locales.bn).toMatchObject({ questionChildObject: "শিশুটিকে", questionChildPossessive: "শিশুটির", questionChild: "শিশু" });
  expect(locales.en).toMatchObject({ questionChildObject: "the child", questionChildPossessive: "the child", questionChild: "the child" });
});
