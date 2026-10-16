// TASK-021 round 3 (F1): the [MOCK] fake accepts a field only when a whole clause has a strict shape.
// Anything else, including lookalikes, negations and corrections, stays unknown (BR-008).
import { describe, expect, it } from "vitest";
import type { DraftFieldPath } from "@/contracts";
import { fakeExtract, understand } from "@/lib/intake/fakes/fake-client";

const read = (text: string) => {
  const d = fakeExtract({ kind: "missing", text }, 1).draft;
  return { age: d.child.age_years, ageMin: d.child.age_min, sex: d.child.sex, name: d.child.name, latin: d.child.name_latin, phone: d.reporter.phone, evidence: Object.keys(d.evidence) };
};
const UNKNOWN = { age: null, ageMin: null, sex: "unknown", name: null, latin: null, phone: null, evidence: [] };

describe("lookalikes and corrections give unknown for every field", () => {
  it.each([
    "my son's friend", "my son’s friend", "my son-in-law", "my son-in-law Karim", "আমার ছেলে-মেয়ে দুজনই",
    "আমার ছেলে না, ভাগ্নি", "আমার ছেলে নয়, মেয়ে", "আমার ছেলে নয়, মেয়ে", "not my son, my daughter Mina",
    "বয়স ৭, না ৮", "বয়স ৭ না, ৮", "Age 7, no 8", "teen-age 5", "under-age 7,", "my friend's age 9,", "সম‌বয়স ৭,",
    "village 7,", "page 12.", "Garage 3;", "teenage 5", "stage 3,", "my daughter’s friend Mina", "my son Rafiq’s",
    "আমার ছেলেটা রাফি", "my sons friend", "আমার ছেলের বন্ধু",
  ])("%s", (text) => {
    expect(read(text)).toEqual(UNKNOWN);
  });
});

describe("strict shapes are still read", () => {
  it("sex and name from 'আমার মেয়ে নুসরাত'", () => {
    const r = read("আমার মেয়ে নুসরাত");
    expect(r.sex).toBe("female");
    expect(r.name).toBe("নুসরাত");
  });
  it.each([["বয়স ৭", 7], ["age 7", 7], ["৭ বছর", 7], ["Age: 9 years", 9], ["7 years old", 7], ["বয়স ৭ বছর।", 7], ["৭ বছর বয়সী", 7]])("age %s", (text, years) => {
    expect(read(text).age).toBe(years);
  });
  it.each([["লিঙ্গ: মেয়ে", "female"], ["sex male", "male"], ["my son", "male"], ["our daughter", "female"]])("sex %s", (text, sex) => {
    expect(read(text).sex).toBe(sex);
  });
  it("name label and a name clause beside an age clause", () => {
    expect(read("নাম: নুসরাত জাহান").name).toBe("নুসরাত জাহান");
    const r = read("my daughter Mina, age 7");
    expect([r.sex, r.latin, r.age]).toEqual(["female", "Mina", 7]);
  });
  it("evidence spans point at the literal quote", () => {
    const text = "আমার মেয়ে নুসরাত, বয়স ৭";
    const d = fakeExtract({ kind: "missing", text }, 1).draft;
    for (const e of Object.values(d.evidence)) expect(text.slice(e.start_utf16, e.end_utf16)).toBe(e.quote);
  });
});

describe("a clause that is not exactly a shape yields nothing", () => {
  it.each(["বয়স ৭ এর মতো", "age 7 or 8", "age 7 months", "my daughter is 7", "name is Mina and she is lost", "নাম একজন দুজন তিনজন"])("%s", (text) => {
    expect(read(text)).toEqual(UNKNOWN);
  });
});

describe("unlabelled age shape answering a non-age question stays unknown (BR-008)", () => {
  it.each(["২ বছর", "2 years", "৫ বছর", "3 years old"])(
    "answer %s to the last-seen question must not become age",
    (answer) => {
      const skipped = new Set<DraftFieldPath>();
      let r = fakeExtract({ kind: "missing", text: "my son" }, 1, skipped);
      for (const a of ["জানি না", "জানি না"]) {
        r = fakeExtract({ kind: "missing", draft: r.draft, draft_token: r.draft_token, draft_revision: 1, answer: a }, 2, skipped);
      }
      expect(r.next_question?.field).toBe("event.at");
      r = fakeExtract({ kind: "missing", draft: r.draft, draft_token: r.draft_token, draft_revision: 3, answer }, 4, skipped);
      expect(r.draft.child.age_years).toBeNull();
      expect(r.draft.child.age_min).toBeNull();
      expect(r.draft.child.age_max).toBeNull();
      expect(r.draft.evidence["child.age_years"]).toBeUndefined();
    },
  );
});


// Round-4 reviewer: preserve the pre-existing exported phone-context seam.
describe("phone context compatibility", () => {
  it("accepts a complete phone answer through the existing boolean context", () => {
    expect(understand("01700000001", 0, true).reporter.phone).toBe("01700000001");
  });
  it("accepts a complete phone answer through the field context", () => {
    expect(understand("01700000001", 0, "reporter.phone").reporter.phone).toBe("01700000001");
  });
});

const AGE_FORMS = ["২ বছর", "2 years", "৫ বছর", "3 years old"] as const;
const AGE_PATHS = ["child.age_years", "child.age_min", "child.age_max"] as const;
const REQUIRED: DraftFieldPath[] = ["child.age_years", "event.district_code", "event.at", "reporter.phone", "event.place_text"];
function atQuestion(field: DraftFieldPath) {
  const skipped = new Set<DraftFieldPath>(REQUIRED.slice(0, REQUIRED.indexOf(field)));
  return { skipped, first: fakeExtract({ kind: "missing", text: "my son" }, 1, skipped) };
}
function reply(first: ReturnType<typeof fakeExtract>, answer: string, skipped: Set<DraftFieldPath>) {
  return fakeExtract({ kind: "missing", draft: first.draft, draft_token: first.draft_token, draft_revision: first.draft_revision, answer }, 2, skipped);
}

describe("round-4 age context coverage (BR-008)", () => {
  for (const form of AGE_FORMS) {
    it(`accepts ${form} initially and as an age answer, with all evidence spans`, () => {
      const { first, skipped } = atQuestion("child.age_years");
      for (const result of [fakeExtract({ kind: "missing", text: form }, 1), reply(first, form, skipped)]) {
        expect(result.draft.child.age_years).not.toBeNull();
        for (const path of AGE_PATHS) {
          const evidence = result.draft.evidence[path]!;
          expect(evidence).toBeDefined();
          expect(result.draft.source_text.slice(evidence.start_utf16, evidence.end_utf16)).toBe(evidence.quote);
        }
      }
    });
    it.each(REQUIRED.slice(1))(`rejects ${form} when answering %s`, (field) => {
      const { first, skipped } = atQuestion(field);
      expect(first.next_question?.field).toBe(field);
      const { draft } = reply(first, form, skipped);
      expect([draft.child.age_years, draft.child.age_min, draft.child.age_max]).toEqual([null, null, null]);
      for (const path of AGE_PATHS) expect(draft.evidence[path]).toBeUndefined();
    });
  }
  it.each(REQUIRED.slice(1))("keeps labelled age valid when answering %s", (field) => {
    for (const answer of ["age 7", "বয়স ৭"]) {
      const { first, skipped } = atQuestion(field);
      expect(reply(first, answer, skipped).draft.child.age_years).toBe(7);
    }
  });
  it("does not treat a continuation without a current question as the initial message", () => {
    const skipped = new Set(REQUIRED);
    const first = fakeExtract({ kind: "missing", text: "my son" }, 1, skipped);
    expect(first.next_question).toBeNull();
    const { draft } = reply(first, "2 years", skipped);
    expect([draft.child.age_years, draft.child.age_min, draft.child.age_max]).toEqual([null, null, null]);
    for (const path of AGE_PATHS) expect(draft.evidence[path]).toBeUndefined();
  });
});
