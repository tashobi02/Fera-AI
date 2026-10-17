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
// FREE-TEXT SAFETY
//   Only the name and phone FIELDS are left out. Free-text fields are scrubbed of phone-like
//   numbers (01 + 9 digits, ASCII or Bangla digits, common separators, optional +880).
//   Names typed into free text (for example in circumstances) are NOT detected.
//
// SUBMITTED CASES ONLY
//   caseEmbeddingText and `npm run reembed` must only run on submitted cases (rows of
//   `cases`). Unreviewed intake drafts must never be embedded: they live in intake_drafts,
//   which reembed never reads (tested).
//
// KEEP STALE VECTORS OUT
//   Any code path that changes an embedded field (clothing, marks, circumstances, place_text,
//   sex, age_*) MUST clear embedding, embedding_model, embedding_revision and embedding_space
//   in the same UPDATE. editMissingCase (src/server/case/commands.ts) does. Anything that
//   changes this file's output must bump TEXT_RECIPE in model.ts (a golden test pins it).
//
// SIMILARITY IS NOT A MATCH SIGNAL ALONE
//   Top-1 cosine does not separate a true no-match: in the TASK-004 spike no-match top-1
//   cosine reached 0.96 while the weakest true pair was 0.90. Similarity is not a
//   probability and must never be shown or used as one.
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

// Bangladeshi mobile numbers: 01 + 9 digits, or +880 / 880 + 1 + 9 digits, with ASCII or
// Bangla digits and space, dot or hyphen separators between digits.
const D = "[0-9০-৯]";
const SEP = "[\\s.\\-]?";
const PHONE_LIKE = new RegExp(
  `(?<!${D})(?:\\+?(?:880|৮৮০)${SEP}[1১]|[0০]${SEP}[1১])(?:${SEP}${D}){9}(?!${D})`,
  "gu",
);

export function scrubPhones(s: string): string {
  return s.replace(PHONE_LIKE, " ");
}

const clean = (s: string | null | undefined): string =>
  typeof s === "string" ? scrubPhones(s.normalize("NFC")).replace(/\s+/g, " ").trim() : "";

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
