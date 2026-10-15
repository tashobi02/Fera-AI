// Wording guard (COMP-016, TASK-023; FR-034, BR-002/003/011, D4 §3/§10 and the V2
// release contract). Every Fera-generated text passes through it before it is stored or
// served. A hit is E-016: the text is never shown, and the request log records the error
// ID (never the text or the matched term, which could echo case content).
//
// Scope (D2A COMP-016): the whole Fera-generated text, including the reviewed field values
// it quotes (name, place, clothing…), because a poster is shared publicly under Fera's
// draft label. A field value that contains a banned term therefore blocks that output
// (OD-023-5). `circumstances` and `source_text` are never copied in.
//
// Matching is substring on a normalised skeleton (see below), so "পালিয়ে" matches whether
// য় is typed as U+09DF or য + nukta, and spacing, punctuation, invisible or fullwidth
// characters cannot split a term. Substrings are deliberate: "alert" also catches
// "alerted". "amber" is not listed on its own ("Chamber Road"); "alert" covers it.
import { ApiError } from "@/app/api/_shared/envelope";

// Each group names the rule it enforces. Bangla and English for every concept.
export const BANNED_TERMS = {
  // BR-002: no issuing or broadcasting alerts. Bare "সতর্ক" also catches সতর্কবার্তা/সতর্কসংকেত.
  alert: ["সতর্ক", "অ্যালার্ট", "এ্যালার্ট", "এলার্ট", "সম্প্রচার", "alert", "broadcast"],
  // BR-003: no runaway labels, inferred absence reasons or rescue promises.
  runaway: ["পালিয়ে", "পালায়", "পালাচ্ছে", "পালাল", "পলাতক", "পালাতক", "পলায়ন", "runaway", "ranaway", "ran away", "run away", "running away"],
  rescue: ["উদ্ধার", "উদ্বার", "রেসকিউ", "rescue"],
  // V2 contract: no physical return or reunification is performed or claimed.
  returned: ["ফিরিয়ে দেওয়া", "ফিরিয়ে দেয়া", "ফিরিয়ে আনা", "ফেরত দেওয়া", "ফেরত দেয়া", "ফেরত পাঠানো", "পুনর্মিলন", "return", "reunit", "reunif"],
  // V2 contract: a referral is recorded, never delivered or acknowledged.
  delivered: ["পৌঁছে দেওয়া", "পৌঁছে দেয়া", "পৌছে দেওয়া", "পৌঁছে গেছে", "পৌঁছানো হয়েছে", "delivered"],
  // "Similarity", not probability (D4 §9).
  probability: ["সম্ভাবনা", "শতাংশ", "%", "probability", "likelihood", "percent"],
  // BR-011: no unsupported legal-compliance claim.
  legal: ["আইনসম্মত", "আইন মেনে", "আইন অনুযায়ী অনুমোদিত", "comply", "complian", "legally approved"],
} as const satisfies Record<string, readonly string[]>;

export type BannedGroup = keyof typeof BANNED_TERMS;

// Comparison runs on a skeleton of the text: NFKC (fullwidth and compatibility forms fold
// to plain letters), every Unicode default-ignorable character removed (ZWJ/ZWNJ, CGJ,
// invisible separators, soft hyphen…), lower-cased, and then only letters, marks and
// digits kept. "r u n-a/w a y", "ＲＵＮＡＷＡＹ" and "run\u034Faway" all become "runaway".
// Dropping spaces can over-block across word boundaries; for this guard that is the safe
// side (OD-023-5). Symbol-only terms ("%") are matched on the NFKC text instead.
// ponytail: cross-script homoglyphs (Cyrillic "а" in "runаway") are not folded; that needs a
// confusables table — add one if a reviewed field ever exploits it.
const IGNORABLE = /\p{Default_Ignorable_Code_Point}/gu;
// Combining marks outside the Bengali block are decoration here ("run\u0332away"); Bangla
// vowel signs, nukta and hasanta carry meaning and stay.
const DECORATION = /(?![\u0980-\u09FF])\p{M}/gu;
const NOT_WORD = /[^\p{L}\p{M}\p{N}]/gu;

const nfkc = (text: string) => text.normalize("NFKC").replace(IGNORABLE, "").toLowerCase();

// Decompose first (NFKD) so accents become separate marks ("rúnaway"), strip them, then
// recompose (NFKC) so a Bangla vowel sign split by junk ("পে-ৗঁছে") becomes ৌ again.
export function normaliseForGuard(text: string): string {
  return text.normalize("NFKD").replace(IGNORABLE, "").toLowerCase()
    .replace(DECORATION, "").replace(NOT_WORD, "").normalize("NFKC");
}

const NORMALISED = Object.entries(BANNED_TERMS).flatMap(([group, terms]) =>
  terms.map((t) => {
    const skeleton = normaliseForGuard(t);
    return { group: group as BannedGroup, term: skeleton || nfkc(t), onSkeleton: skeleton !== "" };
  }),
);

// The first banned group found, or null when the text is allowed.
export function findBannedGroup(text: string): BannedGroup | null {
  const plain = nfkc(text);
  const skeleton = normaliseForGuard(text);
  for (const { group, term, onSkeleton } of NORMALISED) {
    if ((onSkeleton ? skeleton : plain).includes(term)) return group;
  }
  return null;
}

export function assertAllowedWording(text: string): void {
  if (findBannedGroup(text) !== null) throw new ApiError("E-016");
}
