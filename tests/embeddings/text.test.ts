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
