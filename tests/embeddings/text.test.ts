// TASK-016 / COMP-011: the text that is embedded. Synthetic fixtures only.
import { describe, expect, it } from "vitest";
import { caseEmbeddingText } from "../../src/server/embeddings";

const NAME = "রাফি আহমেদ";
const PHONE = "01200000042";

const flat = {
  child_name: NAME,
  child_name_latin: "Rafi Ahmed",
  contact_phone: PHONE,
  raw_text: `আমার ছেলে ${NAME} হারিয়ে গেছে ${PHONE}`,
  sex: "male",
  age_years: 7,
  age_min: 7,
  age_max: 7,
  clothing: "ধূসর পাঞ্জাবি",
  marks: "বাম পায়ে জন্মদাগ",
  circumstances: "মেলায় হারিয়ে যায়",
  place_text: "জামালপুর রেলস্টেশন",
};

const draft = {
  child: { name: NAME, name_latin: "Rafi Ahmed", sex: "male", age_years: 7, age_min: 7, age_max: 7, clothing: flat.clothing, marks: flat.marks },
  event: { circumstances: flat.circumstances, place_text: flat.place_text },
  reporter: { phone: PHONE, relation: "মা" },
  source_text: flat.raw_text,
};

describe("caseEmbeddingText", () => {
  it("includes clothing, marks, circumstances, place and age/sex words", () => {
    const t = caseEmbeddingText(flat);
    for (const part of [flat.clothing, flat.marks, flat.circumstances, flat.place_text, "ছেলে"]) expect(t).toContain(part);
    expect(t).toContain("৭");
  });

  it("never contains the child's name, the phone or the raw text", () => {
    for (const input of [flat, draft]) {
      const t = caseEmbeddingText(input);
      expect(t).not.toContain(NAME);
      expect(t).not.toContain("Rafi");
      expect(t).not.toContain(PHONE);
      expect(t).not.toContain("আমার ছেলে");
    }
  });

  it("gives the same text for a case row and for its submission draft", () => {
    expect(caseEmbeddingText(draft)).toBe(caseEmbeddingText(flat));
  });

  it("renders an age range and leaves unknown sex and age out", () => {
    const t = caseEmbeddingText({ sex: "unknown", age_min: 7, age_max: 10, clothing: "লাল জামা" });
    expect(t).toContain("৭–১০");
    expect(t).not.toMatch(/ছেলে|মেয়ে/);
    expect(caseEmbeddingText({ sex: "unknown", clothing: "লাল জামা" })).toBe("লাল জামা");
  });

  it("is NFC-normalised: U+09DF and U+09AF U+09BC give identical text", () => {
    const a = caseEmbeddingText({ clothing: "য়াকুব" });
    const b = caseEmbeddingText({ clothing: "য়াকুব" });
    expect(a).toBe(b);
    expect(a).toBe(a.normalize("NFC"));
  });

  it("collapses whitespace and returns an empty string when there is nothing to embed", () => {
    expect(caseEmbeddingText({ clothing: "  লাল \n  জামা  " })).toBe("লাল জামা");
    expect(caseEmbeddingText({ sex: "unknown" })).toBe("");
    expect(caseEmbeddingText({})).toBe("");
  });
});

describe("caseEmbeddingText golden output (TEXT_RECIPE pin)", () => {
  // If this test needs updating, the embedded text changed: you MUST bump TEXT_RECIPE in
  // src/server/embeddings/model.ts so every stored vector is re-embedded by `npm run reembed`.
  it("pins the exact text for fixed inputs", () => {
    expect(caseEmbeddingText(flat)).toBe("ছেলে। বয়স ৭ বছর। ধূসর পাঞ্জাবি। বাম পায়ে জন্মদাগ। মেলায় হারিয়ে যায়। জামালপুর রেলস্টেশন");
    expect(
      caseEmbeddingText({ sex: "female", age_min: 7, age_max: 10, clothing: "লাল জামা", place_text: "ঢাকা" }),
    ).toBe("মেয়ে। বয়স ৭–১০ বছর। লাল জামা। ঢাকা");
    expect(caseEmbeddingText({ sex: "unknown", circumstances: "কাঁদছিল" })).toBe("কাঁদছিল");
  });
  it("TEXT_RECIPE is still text-v1 (update together with the golden strings)", async () => {
    const { TEXT_RECIPE } = await import("../../src/server/embeddings");
    expect(TEXT_RECIPE).toBe("text-v1");
  });
});

describe("phone-like numbers are scrubbed from free text (names typed in free text are NOT detected)", () => {
  const cases: Array<[string, string]> = [
    ["ফোন 01200000042 এ জানান", "ফোন এ জানান"],
    ["ফোন ০১২০০০০০০৪২ এ জানান", "ফোন এ জানান"],
    ["call 0120-000-0042 now", "call now"],
    ["call 01200 000 042 now", "call now"],
    ["call 01200.000.042 now", "call now"],
    ["call +8801200000042 now", "call now"],
    ["call 880 1200 000 042 now", "call now"],
    ["নম্বর +৮৮০১২০০০০০০৪২", "নম্বর"],
  ];
  it.each(cases)("scrubs %s", (input, expected) => {
    for (const field of ["clothing", "marks", "circumstances", "place_text"] as const) {
      expect(caseEmbeddingText({ [field]: input })).toBe(expected);
    }
  });
  it("keeps ages, heights and short numbers", () => {
    expect(caseEmbeddingText({ circumstances: "বয়স ৭, উচ্চতা ১১০ সেমি, ২০২৬ সাল" })).toBe("বয়স ৭, উচ্চতা ১১০ সেমি, ২০২৬ সাল");
  });
});
