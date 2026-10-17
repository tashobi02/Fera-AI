// COMP-011 (TASK-016): the text that gets embedded for a case.
//
// This file must stay self-contained (no relative imports, only erasable TypeScript
// syntax): scripts/reembed.mjs loads it directly with Node's type stripping.
//
// WHAT IS EMBEDDED, AND WHY
//   included  clothing, marks, circumstances, place_text, plus age and sex as words.
//             The TASK-004 spike (docs/execution/evidence/embedding-spike.md) found the
//             structured description fields beat raw source_text on the synthetic set,
//             and mixed-language source_text under-performs. That result is an upper
//             bound (clothing is identical in 80/80 synthetic true pairs). Age and sex
//             words were NOT in the spike's description arm, so their effect on ranking
//             is UNKNOWN until eval:match; they are included because the brief asks for
//             them, and they are cheap to drop (bump TEXT_RECIPE in model.ts).
//   EXCLUDED  child_name / child_name_latin: the matcher scores names separately
//             (A-028 weights name 0.15), so embedding them would count the name twice
//             and let a shared first name outrank a real description match.
//   EXCLUDED  reporter phone, relation, GD number, thana, raw_text / source_text,
//             free-form district text. None of these describe the child, and the phone
//             and raw text can carry identifying details; they never enter a vector.
//
// Sex and age words are Bangla (ছেলে / মেয়ে, "বয়স ৭–১০ বছর") with Bangla digits, the
// same script as the description fields, because mixed-script text under-performed.
// Unknown sex and unknown age are left out; nothing is guessed.

export interface CaseTextFields {
  sex?: string | null;
  age_years?: number | null;
  age_min?: number | null;
  age_max?: number | null;
  clothing?: string | null;
  marks?: string | null;
  circumstances?: string | null;
  place_text?: string | null;
}

// A submission draft (src/contracts/draft) nests the same fields under child/event.
// Extra keys (name, phone, source_text...) are accepted and ignored.
export interface DraftLike {
  child?: Partial<CaseTextFields> | null;
  event?: Partial<CaseTextFields> | null;
}

export type CaseTextInput = CaseTextFields | DraftLike;

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
const bn = (n: number) => String(n).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);

function fieldsOf(input: CaseTextInput): CaseTextFields {
  const d = input as DraftLike & CaseTextFields;
  if (d.child || d.event) {
    const c = d.child ?? {};
    const e = d.event ?? {};
    return {
      sex: c.sex,
      age_years: c.age_years,
      age_min: c.age_min,
      age_max: c.age_max,
      clothing: c.clothing,
      marks: c.marks,
      circumstances: e.circumstances,
      place_text: e.place_text,
    };
  }
  return d;
}

const clean = (s: string | null | undefined): string =>
  typeof s === "string" ? s.normalize("NFC").replace(/\s+/g, " ").trim() : "";

function ageWords(f: CaseTextFields): string {
  const lo = f.age_min ?? f.age_years ?? null;
  const hi = f.age_max ?? f.age_years ?? null;
  if (lo === null || hi === null) return "";
  return lo === hi ? `বয়স ${bn(lo)} বছর` : `বয়স ${bn(lo)}–${bn(hi)} বছর`;
}

function sexWord(sex: string | null | undefined): string {
  if (sex === "male") return "ছেলে";
  if (sex === "female") return "মেয়ে";
  return "";
}

// Parts are joined with the danda used by the spike's description arm.
export function caseEmbeddingText(input: CaseTextInput): string {
  const f = fieldsOf(input);
  const parts = [sexWord(f.sex), ageWords(f), clean(f.clothing), clean(f.marks), clean(f.circumstances), clean(f.place_text)].filter(
    (p) => p !== "",
  );
  return parts.join("। ").normalize("NFC");
}
