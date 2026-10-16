// TASK-023 templates (COMP-010): TC-005 GD draft, poster text (FR-009), BR-022.
import { describe, expect, it } from "vitest";
import { OUTPUT_DRAFT_LABEL_BN, countWords, type CaseDraft } from "@/contracts";
import {
  exampleMissingDraft,
  exampleOwnerCaseView,
} from "@/contracts/examples";
import { FIELD_MAX_CHARS } from "@/contracts";
import { findBannedGroup, renderOutput } from "@/server/outputs";
import {
  TEMPLATES,
  UNKNOWN_BN,
  type TemplateInput,
} from "@/server/outputs/templates";

const input = (
  over: Partial<CaseDraft> = {},
  districtNameBn: string | null = null,
): TemplateInput => ({
  refCode: exampleOwnerCaseView.ref_code,
  draft: { ...exampleMissingDraft, ...over } as CaseDraft,
  districtNameBn,
});

const blank: CaseDraft = {
  ...exampleMissingDraft,
  child: {
    ...exampleMissingDraft.child,
    name: null,
    name_latin: null,
    age_years: null,
    age_min: null,
    age_max: null,
    sex: "unknown",
    clothing: null,
  },
  event: {
    ...exampleMissingDraft.event,
    at: null,
    at_lower: null,
    at_upper: null,
    place_text: null,
    district_code: null,
  },
  reporter: { relation: null, phone: null },
  evidence: {},
};

const valueOf = (text: string, label: string) =>
  text
    .split("\n")
    .find((l) => l.startsWith(`${label}: `))
    ?.slice(label.length + 2);

describe("GD draft (TC-005, FR-008)", () => {
  const gd = TEMPLATES.gd(input());

  it("has name, age, place, time and phone, plus the draft label", () => {
    expect(gd).toContain(OUTPUT_DRAFT_LABEL_BN);
    expect(valueOf(gd, "শিশুর নাম")).toBe("মিতু");
    expect(valueOf(gd, "বয়স")).toBe("৭ বছর");
    expect(valueOf(gd, "শেষবার দেখা গিয়েছিল")).toBe("বাস টার্মিনালের কাছে");
    expect(valueOf(gd, "সময়")).toBe(
      "১২ অক্টোবর ২০২৬, বিকেল ৩:০০ থেকে সন্ধ্যা ৬:০০-এর মধ্যে (আনুমানিক)",
    );
    expect(valueOf(gd, "ফোন")).toBe("০১৭০০০০০০০১");
  });

  it("adds nothing beyond template text and case fields (TC-005, BR-022)", () => {
    // Every line either is template text (identical in a render with every field unknown)
    // or is a labelled line whose value comes from the case.
    const empty = new Set(
      TEMPLATES.gd({ ...input(), draft: blank }).split("\n"),
    );
    const fromCase = gd.split("\n").filter((l) => !empty.has(l));
    expect(fromCase.map((l) => l.split(": ")[0])).toEqual([
      "শিশুর নাম",
      "বয়স",
      "লিঙ্গ",
      "পরনে ছিল",
      "শেষবার দেখা গিয়েছিল",
      "সময়",
      "ফোন",
    ]);
    expect(valueOf(gd, "লিঙ্গ")).toBe("মেয়ে");
    expect(valueOf(gd, "পরনে ছিল")).toBe("লাল জামা");
  });

  it("never copies the parent's own free text", () => {
    const own = "সে বাড়ি থেকে পালিয়ে গেছে";
    const out = TEMPLATES.gd(
      input({ event: { ...exampleMissingDraft.event, circumstances: own } }),
    );
    expect(out).not.toContain(own);
    expect(out).not.toContain("গতকাল"); // only in source_text
    expect(findBannedGroup(out)).toBeNull();
  });

  it("prints অজানা for every missing field, never a guess", () => {
    const out = TEMPLATES.gd({ ...input(), draft: blank });
    for (const label of [
      "শিশুর নাম",
      "বয়স",
      "লিঙ্গ",
      "উচ্চতা",
      "পরনে ছিল",
      "শনাক্তকরণ চিহ্ন",
      "শেষবার দেখা গিয়েছিল",
      "জেলা",
      "সময়",
      "ফোন",
      "থানা",
      "শিশুর সঙ্গে সম্পর্ক",
    ]) {
      expect(valueOf(out, label), label).toBe(UNKNOWN_BN);
    }
  });

  it("formats an age range, an exact time and the reviewed district name", () => {
    const out = TEMPLATES.gd(
      input(
        {
          child: {
            ...exampleMissingDraft.child,
            age_years: null,
            age_min: 6,
            age_max: 8,
            height_cm: 110,
          },
          event: {
            ...exampleMissingDraft.event,
            at: "2026-10-12T09:05:00+06:00",
            at_approx: false,
            at_lower: null,
            at_upper: null,
            district_text: "ঢাকা",
          },
        },
        "চট্টগ্রাম",
      ),
    );
    expect(valueOf(out, "বয়স")).toBe("৬–৮ বছর (আনুমানিক)");
    expect(valueOf(out, "উচ্চতা")).toBe("১১০ সেমি");
    expect(valueOf(out, "সময়")).toBe("১২ অক্টোবর ২০২৬, সকাল ৯:০৫");
    expect(valueOf(out, "জেলা")).toBe("চট্টগ্রাম"); // reviewed code wins over the raw words
  });

  it("converts UTC input to Dhaka time and spans dates", () => {
    const out = TEMPLATES.gd(
      input({
        event: {
          ...exampleMissingDraft.event,
          at: null,
          at_lower: "2026-10-11T17:30:00Z",
          at_upper: "2026-10-12T03:00:00+06:00",
        },
      }),
    );
    expect(valueOf(out, "সময়")).toBe(
      "১১ অক্টোবর ২০২৬, রাত ১১:৩০ থেকে ১২ অক্টোবর ২০২৬, রাত ৩:০০-এর মধ্যে (আনুমানিক)",
    );
  });
});

describe("GD details", () => {
  it("addresses the thana by name when it is known", () => {
    const out = TEMPLATES.gd(
      input({ event: { ...exampleMissingDraft.event, thana: "কোতোয়ালি" } }),
    );
    expect(out).toContain("ভারপ্রাপ্ত কর্মকর্তা\nকোতোয়ালি থানা\n");
  });

  it("stays under the 3000-character column limit with every field at its maximum", () => {
    const long = (n: number) => "ক".repeat(n);
    const draft: CaseDraft = {
      ...exampleMissingDraft,
      child: {
        ...exampleMissingDraft.child,
        name: long(FIELD_MAX_CHARS.child_name),
        height_cm: 150,
        clothing: long(FIELD_MAX_CHARS.clothing),
        marks: long(FIELD_MAX_CHARS.marks),
      },
      event: {
        ...exampleMissingDraft.event,
        place_text: long(FIELD_MAX_CHARS.place_text),
        district_text: long(80),
        thana: long(FIELD_MAX_CHARS.thana),
      },
      reporter: {
        relation: long(FIELD_MAX_CHARS.reporter_relation),
        phone: "0".repeat(32),
      },
    };
    for (const t of ["gd", "poster"] as const) {
      expect(
        TEMPLATES[t]({ refCode: "M-7K2Q9A", draft, districtNameBn: long(80) })
          .length,
      ).toBeLessThan(FIELD_MAX_CHARS.text_bn);
    }
  });

  it.each([
    ["marks", "পলায়নকারী শিশু"],
    ["marks", "run-away child"],
    ["clothing", "Runaway T-shirt"],
  ] as const)(
    "blocks a rendered poster whose reviewed %s says %j (BR-003)",
    (field, value) => {
      const draft = {
        ...exampleMissingDraft,
        child: { ...exampleMissingDraft.child, [field]: value },
      } as CaseDraft;
      expect(() =>
        renderOutput("poster", {
          refCode: "M-7K2Q9A",
          draft,
          districtNameBn: null,
        }),
      ).toThrow("E-016");
    },
  );

  it("blocks the output when a reviewed field value carries a banned term (OD-023-5)", () => {
    const err = (() => {
      try {
        renderOutput(
          "poster",
          input({
            event: {
              ...exampleMissingDraft.event,
              place_text: "উদ্ধার কেন্দ্রের পাশে",
            },
          }),
        );
      } catch (e) {
        return e as { id?: string };
      }
    })();
    expect(err?.id).toBe("E-016");
  });
});

describe("poster text (FR-009, BR-006)", () => {
  const poster = TEMPLATES.poster(input());

  it("has the draft label, 13219, the contact phone and the case fields", () => {
    expect(poster).toContain(OUTPUT_DRAFT_LABEL_BN);
    expect(poster).toContain("১৩২১৯");
    expect(poster).toContain("০১৭০০০০০০০১");
    expect(valueOf(poster, "শিশুর নাম")).toBe("মিতু");
    expect(poster).toContain("\nনিখোঁজ শিশু\n");
  });

  it("passes the wording guard, as does the GD", () => {
    expect(findBannedGroup(poster)).toBeNull();
    expect(findBannedGroup(TEMPLATES.gd(input()))).toBeNull();
    expect(
      findBannedGroup(TEMPLATES.gd({ ...input(), draft: blank })),
    ).toBeNull();
  });
});

describe("helpline summary (TC-007, FR-010)", () => {
  const helpline = TEMPLATES.helpline(input());
  // Word-dense values filling each field's character limit, so the worst case counts words, not characters.
  const dense = (n: number) => "ক ".repeat(Math.floor(n / 2)).trim();

  it("has the draft label, the child's name, age, last-seen place and time", () => {
    expect(helpline).toContain(OUTPUT_DRAFT_LABEL_BN);
    expect(helpline).toContain("মিতু");
    expect(helpline).toContain("৭ বছর");
    expect(helpline).toContain("বাস টার্মিনালের কাছে");
    expect(helpline).toContain(
      "১২ অক্টোবর ২০২৬, বিকেল ৩:০০ থেকে সন্ধ্যা ৬:০০-এর মধ্যে (আনুমানিক)",
    );
    expect(countWords(helpline)).toBeLessThanOrEqual(80);
  });

  it("stays at most 80 words with every field at its maximum length", () => {
    const draft: CaseDraft = {
      ...exampleMissingDraft,
      child: {
        ...exampleMissingDraft.child,
        name: dense(FIELD_MAX_CHARS.child_name),
        age_years: null,
        age_min: 6,
        age_max: 8,
        height_cm: 150,
        clothing: dense(FIELD_MAX_CHARS.clothing),
        marks: dense(FIELD_MAX_CHARS.marks),
      },
      event: {
        ...exampleMissingDraft.event,
        place_text: dense(FIELD_MAX_CHARS.place_text),
        district_text: dense(80),
        thana: dense(FIELD_MAX_CHARS.thana),
        at: null,
        at_lower: "2026-10-11T17:30:00Z",
        at_upper: "2026-10-12T03:00:00+06:00",
      },
      reporter: {
        relation: dense(FIELD_MAX_CHARS.reporter_relation),
        phone: "0".repeat(32),
      },
    };
    const out = TEMPLATES.helpline({
      refCode: "M-7K2Q9A",
      draft,
      districtNameBn: dense(80),
    });
    expect(countWords(out)).toBe(77); // the derived bound in templates.ts
    expect(countWords(out)).toBeLessThanOrEqual(80);
    expect(out).toContain("… (সংক্ষেপিত)"); // a cut is spoken, not only shown
  });

  it("prints অজানা for missing fields", () => {
    const out = TEMPLATES.helpline({ ...input(), draft: blank });
    expect(valueOf(out, "শিশুর নাম")).toBe(UNKNOWN_BN);
    expect(valueOf(out, "শেষবার দেখা গিয়েছিল")).toBe(UNKNOWN_BN);
  });

  it("passes the wording guard", () => {
    expect(findBannedGroup(helpline)).toBeNull();
    expect(
      findBannedGroup(TEMPLATES.helpline({ ...input(), draft: blank })),
    ).toBeNull();
  });
});
