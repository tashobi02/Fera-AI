import { z } from "zod";
import { caseDraftSchema, evidenceSpanSchema, toAsciiDigits, type CaseDraft, type EvidenceSpan } from "@/contracts";
import { evidenceForRange, normalisePhone, normaliseTime, type NormalisedText } from "@/server/normalise";
import type { AiDropped, AiDropReason, AiInvalidReason } from "./types";
import { emptyDraft, EXTRACT_FIELDS, extractOutputSchema, outputStructureSchema, type ExtractField, type ExtractInput } from "./contract";

const AGE_LABEL = "(?:age|বয়স|বয়স)";
const HEIGHT_LABEL = "(?:height|উচ্চতা)";
const PHONE_LABEL = "phone\\s+no|phone|number|ফোন|নম্বর";
const LABEL_SEPARATOR = "(?:\\s*[:=]\\s*|\\s+)";
// One hedge list, matched as whole tokens (NFC, Unicode boundaries). Bare "no" and "না" are not hedges:
// "phone no:" is a label; qualifiers now apply sentence-wide (lead decision 2026-10-16, BLOCK 1).
// Spelling variants (round 7/8 follow-ups): হয়ত without final ো, মনেহয় without space, জানিনা one word.
const HEDGE_WORDS = ["বা", "অথবা", "কিংবা", "নাকি", "সম্ভবত", "বোধহয়", "বোধ\\s+হয়", "মনে\\s*হয়", "মনে\\s+হচ্ছে", "হতে\\s+পারে", "হতে\\s+পারে", "নিশ্চিত\\s+(?:না|নই)", "জানি\\s*না", "ঠিক\\s*জানি\\s*না", "প্রায়", "আনুমানিক", "আনু", "আন্দাজ", "মতো", "মত",
  "হয়তো", "হয়ত", "হবে", "শিওর\\s+না", "sure\\s+না", "ধারণা", "or", "maybe", "may\\s+be", "could\\s+be", "probably", "prob", "perhaps", "likely", "approximately", "approx", "ca", "c", "est", "abt",
  "roughly", "about", "around", "guess", "think", "might", "unsure", "uncertain", "not\\s+sure", "possibly", "believe", "certain"];
const TOKEN_EDGE = "(?<![\\p{L}\\p{M}\\p{N}_])";
const TOKEN_END = "(?![\\p{L}\\p{M}\\p{N}_])";
const HEDGE = new RegExp(`${TOKEN_EDGE}(?:${HEDGE_WORDS.join("|")})${TOKEN_END}`.normalize("NFC"), "iu");
const CORRECTION_WORDS = ["মানে", "actually", "sorry", "I\\s+mean", "I\\s+meant", "না\\s+না", "আসলে", "দুঃখিত", "ভুল\\s+বললাম", "ভুল(?:ে|ভাবে|ই)?", "নাহ", "wait", "oops", "correction", "শুধরে", "scratch\\s+that", "my\\s+mistake", "rather"];
const CORRECTION = new RegExp(`${TOKEN_EDGE}(?:${CORRECTION_WORDS.join("|")})${TOKEN_END}`.normalize("NFC"), "iu");
// English negation forms: "n't" with ASCII or curly U+2019 apostrophe, or apostrophe-less spelling.
// Whole-token boundaries keep "cant" out of "cantonment". `idk` is slang. Bare "cant"/"wont" are
// excluded from the apostrophe-less list (round 10): they overmatched "Dhaka Cant" (Cantonment)
// and "as is his wont". The apostrophe forms (`can't`, `won't`, `can’t`, `won’t`) and every
// other token are kept.
const APOS = "(?:'|’)";
const ENGLISH_NT = new RegExp(`${TOKEN_EDGE}(?:don't|doesn't|didn't|isn't|can't|won't|aren't|wasn't|haven't|hasn't|hadn't|shouldn't|wouldn't|couldn't|don${APOS}t|doesn${APOS}t|didn${APOS}t|isn${APOS}t|can${APOS}t|won${APOS}t|aren${APOS}t|wasn${APOS}t|haven${APOS}t|hasn${APOS}t|hadn${APOS}t|shouldn${APOS}t|wouldn${APOS}t|couldn${APOS}t|dont|doesnt|didnt|isnt|arent|wasnt|havent|hasnt|hadnt|shouldnt|wouldnt|couldnt|idk)${TOKEN_END}`.normalize("NFC"), "iu");
const SEX: Readonly<Record<string, string>> = { male: "male", boy: "male", ছেলে: "male", female: "female", girl: "female", মেয়ে: "female", other: "other" };
const SEX_WORD = /(?<![\p{L}\p{M}\p{N}_])(?:male|female|boy|girl|ছেলে|মেয়ে|other)(?![\p{L}\p{M}\p{N}_])/giu;
const TIMES = ["event.at", "event.at_lower", "event.at_upper"] as const;
const TEXT_LABELS: Partial<Record<ExtractField, string>> = {
  "child.name": "name|নাম", "child.clothing": "clothing|পোশাক|পরনে", "child.marks": "marks|চিহ্ন",
  "event.place_text": "place|স্থান", "event.district_text": "district|জেলা", "event.thana": "thana|থানা",
  "event.circumstances": "circumstances|description|বিবরণ", "reporter.relation": "relation|সম্পর্ক",
};
const POSSESSIVE = "(?:আমার|my|our|আমাদের)";
const RELATIONSHIP_WORDS = ["জামাই", "বউ", "বৌ", "স্বামী", "স্ত্রী", "বন্ধু", "friend", "boyfriend", "girlfriend", "husband", "wife", "in-law", "in\\s*-\\s*law", "শাশুড়ি", "শ্বশুর", "ননদ", "দেবর", "ভাবি", "নাতি", "নাতনি", "চাচা", "মামা", "খালা", "ফুপু", "bf", "gf"];
const KIN_WITH_RELATION = new RegExp(`(?:ছেলে|মেয়ে|son|daughter|boy|girl)\\s+(?:${RELATIONSHIP_WORDS.join("|")})(?:এর|য়ের|র|'s)?(?![\\p{L}\\p{M}\\p{N}_])`.normalize("NFC"), "iu");
// Possessive kin word may be followed directly by a name word (letters only, no digits, BLOCK 4).
const SEX_CLAUSE = new RegExp(`^(?:${POSSESSIVE}\\s+(?:ছেলে|মেয়ে|boy|girl)(?:\\s+[\\p{L}\\p{M}\\u200c\\u200d]+)?|(?:(?:sex|লিঙ্গ)${LABEL_SEPARATOR})?(?:male|female|boy|girl|other))$`.normalize("NFC"), "iu");
// Negation applies sentence-wide (lead decision 2026-10-16, BLOCK 1). Bare "no" is not a hedge (phone no).
// নাই is a whole token (not a substring of নম্বর / নিশ্চিত / ফেরেনি) and is a real Bangla negation.
const NEGATION = new RegExp(`${TOKEN_EDGE}(?:no|not|never|না|নয়|নই|নেই|নাই)${TOKEN_END}`.normalize("NFC"), "iu");
// A Bangla or ASCII number followed by ও ("also") and then a hedge word is uncertain (e.g. "১১ও হয়", "১১ও হতে পারে").
// Tested against `uncertaintyText(rawSentence)`, the NFC-normalised text, so the precomposed য়
// form of `১১ও হয়` and the decomposed য+virama+া+য় form both match.
const NUMBER_OW_HEDGE = /(?:[\d০-৯]+)\s*ও\s*(?:হয়|হতে\s*পারে|হবে|হয়তো)/iu;
const grammarClause = (s: string) => s.normalize("NFC").replace(/^\s*(?:\[MOCK\]\s*)+/u, "").trim();
// Ignore default-ignorable characters only for uncertainty detection; source spans and accepted values stay untouched.
const uncertaintyText = (s: string) => s.replace(/\p{Default_Ignorable_Code_Point}/gu, "").normalize("NFC");
const labelPrefix = (label: string) => `(?<![\\p{L}\\p{N}_])(?:${label})${LABEL_SEPARATOR}`;

function hasLabelContext(source: string, span: EvidenceSpan, label: string): boolean {
  const [a, b] = clauseBounds(source, span.start_utf16, span.end_utf16);
  const prefix = grammarClause(source.slice(a, span.start_utf16));
  // Anchor the complete clause: "father's name:" cannot lend its name to the child.
  return new RegExp(`^(?:${label})\\s*[:=]?$`.normalize("NFC"), "iu").test(prefix)
    && source.slice(span.end_utf16, b).trim() === "";
}

type FieldValue = string | number | null;
const record = (value: unknown): Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function fieldValue(draft: CaseDraft, field: ExtractField): FieldValue {
  const [group, key] = field.split(".") as ["child" | "event" | "reporter", string];
  return Reflect.get(draft[group], key) as FieldValue;
}

function setField(draft: CaseDraft, field: ExtractField, value: FieldValue) {
  const [group, key] = field.split(".") as ["child" | "event" | "reporter", string];
  Object.assign(draft[group], { [key]: value });
}

function drop(draft: CaseDraft, field: ExtractField) {
  setField(draft, field, field === "child.sex" ? "unknown" : null);
  delete draft.evidence[field];
}

const isDigit = (c?: string) => c !== undefined && /[\d০-৯]/u.test(c);
const ABBREV_TOKENS = ["approx", "ca", "c", "prob", "est", "abt", "আনু", "not", "dr", "mr", "mrs", "ms", "st"];
const DOT_ABBREV = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}_])(?:${ABBREV_TOKENS.join("|")})$`.normalize("NFC"), "iu");

function isDotBoundary(s: string, i: number): boolean {
  if (isDigit(s[i - 1]) && isDigit(s[i + 1])) return false;
  if (DOT_ABBREV.test(s.slice(0, i))) return false;
  if (i + 1 < s.length && !/\s/u.test(s[i + 1])) return false;
  return true;
}

// Clause delimiters: , । ; newline and "." (unless between digits, after an abbreviation, or not followed by whitespace).
function isDelimiter(s: string, i: number): boolean {
  const c = s[i];
  return c === "," || c === "।" || c === ";" || c === "\n" || c === "\r" || (c === "." && isDotBoundary(s, i));
}
function clauseBounds(s: string, from: number, to: number): [number, number] {
  let a = from;
  let b = to;
  while (a > 0 && !isDelimiter(s, a - 1)) a--;
  while (b < s.length && !isDelimiter(s, b)) b++;
  return [a, b];
}

function clauseAt(source: string, span: EvidenceSpan): string {
  const [a, b] = clauseBounds(source, span.start_utf16, span.end_utf16);
  return source.slice(a, b).normalize("NFC");
}

// Sentence delimiters: । ! ? ？ … newline and "." (unless between digits, after an abbreviation, or not followed by whitespace).
function isSentenceDelimiter(s: string, i: number): boolean {
  const c = s[i];
  return c === "।" || c === "!" || c === "?" || c === "？" || c === "…" || c === "\n" || c === "\r" || (c === "." && isDotBoundary(s, i));
}
function sentenceBounds(s: string, from: number, to: number): [number, number] {
  let a = from;
  let b = to;
  while (a > 0 && !isSentenceDelimiter(s, a - 1)) a--;
  while (b < s.length && !isSentenceDelimiter(s, b)) b++;
  return [a, b];
}

const WHOLE_TEXT_REF_WORDS = ["উপরের", "নিচের", "পরের", "সব\\s+তথ্য", "সবকিছু", "above", "below", "following", "what\\s+follows", "all\\s+of\\s+this", "everything", "any\\s+of\\s+the\\s+above"];
const WHOLE_TEXT_REF = new RegExp(`${TOKEN_EDGE}(?:${WHOLE_TEXT_REF_WORDS.join("|")})${TOKEN_END}`.normalize("NFC"), "iu");

function hasWholeTextRetraction(sentenceText: string): boolean {
  const norm = uncertaintyText(sentenceText);
  if (!WHOLE_TEXT_REF.test(norm)) return false;
  const assertion = grammarClause(norm).replace(/(?<![\p{L}\p{N}_])phone\s+no(?=\s*[:=]|\s)/giu, "phone");
  return HEDGE.test(norm) || NEGATION.test(assertion) || CORRECTION.test(norm);
}

function hasAnyWholeTextRetraction(source: string): boolean {
  let a = 0;
  for (let i = 0; i <= source.length; i++) {
    if (i === source.length || isSentenceDelimiter(source, i)) {
      if (i > a) {
        const s = source.slice(a, i).trim();
        if (s.length > 0 && hasWholeTextRetraction(s)) return true;
      }
      a = i + 1;
    }
  }
  return false;
}

const NUMBER_SLASH = /(?<![\p{L}\p{M}])[\d০-৯]+(?:\.[\d০-৯]+)?\s*\/\s*[\d০-৯]+(?:\.[\d০-৯]+)?(?![\p{L}\p{M}])/u;

function isSentenceUncertain(rawSentence: string, delimiter = ""): boolean {
  if (delimiter === "?" || delimiter === "？" || delimiter === "…" || rawSentence.includes("?") || rawSentence.includes("？") || rawSentence.includes("…")) return true;
  if (NUMBER_SLASH.test(rawSentence)) return true;
  const sentence = uncertaintyText(rawSentence);
  if (NUMBER_OW_HEDGE.test(sentence)) return true;
  // "no" is a negation in a value, but part of the explicit "phone no" label.
  const assertion = grammarClause(sentence).replace(/(?<![\p{L}\p{N}_])phone\s+no(?=\s*[:=]|\s)/giu, "phone");
  return HEDGE.test(sentence) || NEGATION.test(assertion) || ENGLISH_NT.test(sentence) || CORRECTION.test(sentence);
}

function hasOwnFieldLabel(field: ExtractField | undefined, sentence: string): boolean {
  sentence = sentence.normalize("NFC");
  if (!field) return false;
  if (field === "child.age_years" || field === "child.age_min" || field === "child.age_max") {
    return new RegExp(`(?<![\\p{L}\\p{M}\\p{N}_])${AGE_LABEL}(?![\\p{L}\\p{M}\\p{N}_])`, "iu").test(sentence);
  }
  if (field === "child.height_cm") {
    return new RegExp(`(?<![\\p{L}\\p{M}\\p{N}_])${HEIGHT_LABEL}(?![\\p{L}\\p{M}\\p{N}_])`, "iu").test(sentence);
  }
  if (field === "child.sex") {
    return new RegExp(`(?<![\\p{L}\\p{M}\\p{N}_])(?:sex|লিঙ্গ)(?![\\p{L}\\p{M}\\p{N}_])`, "iu").test(sentence);
  }
  if (field === "reporter.phone") {
    return new RegExp(`(?<![\\p{L}\\p{M}\\p{N}_])(?:${PHONE_LABEL})(?![\\p{L}\\p{M}\\p{N}_])`, "iu").test(sentence);
  }
  if (field.startsWith("event.at")) {
    return false;
  }
  const label = TEXT_LABELS[field];
  if (label) {
    return new RegExp(`(?<![\\p{L}\\p{M}\\p{N}_])(?:${label})(?![\\p{L}\\p{M}\\p{N}_])`, "iu").test(sentence);
  }
  return false;
}

// Forward scope (user decision 2026-10-16): a fact becomes unknown (drop reason "uncertain")
// when its own sentence, or ANY later sentence in the same text, contains a hedge, negation,
// correction token, or question delimiter. Earlier-sentence qualifiers do not taint later facts
// UNLESS the earlier sentence names the SAME field's label (lead refinement 2026-10-16, BR-008
// conservative direction: e.g. "বয়স নিয়ে নিশ্চিত না। বয়স ১০ বছর।" drops age 10; "পোশাক নিয়ে
// নিশ্চিত না। বয়স ১০।" keeps age 10). If any sentence contains a whole-text reference together
// with a hedge or negation, the whole text is uncertain.
// Fix round 6: when the fact's own sentence contains no field label (unit-only age/height, bare time, kin-only sex),
// also run isSentenceUncertain on the immediately previous sentence.
function hedged(source: string, span: EvidenceSpan, field?: ExtractField): boolean {
  if (hasAnyWholeTextRetraction(source)) return true;

  const afterSpan = source.slice(span.end_utf16);
  if (/^\s*(?:\?|？|…)/u.test(afterSpan)) return true;

  const [a, b] = sentenceBounds(source, span.start_utf16, span.end_utf16);
  const ownDelim = b < source.length ? source[b] : "";
  const ownSentence = source.slice(a, b);
  if (isSentenceUncertain(ownSentence, ownDelim)) return true;

  // When the fact's OWN sentence contains no field label, also check immediately previous sentence
  if (!hasOwnFieldLabel(field, ownSentence)) {
    let prevEnd = a;
    while (prevEnd > 0 && (isSentenceDelimiter(source, prevEnd - 1) || /\s/u.test(source[prevEnd - 1]))) {
      prevEnd--;
    }
    let prevStart = prevEnd;
    while (prevStart > 0 && !isSentenceDelimiter(source, prevStart - 1)) {
      prevStart--;
    }
    // Preserve trailing spaces and punctuation: trimming "10 years ?" must not hide its question marker.
    if (isSentenceUncertain(source.slice(prevStart, a))) return true;
  }

  // Same-field earlier qualifier (lead refinement 2026-10-16, extended round 9): if an EARLIER
  // sentence is uncertain AND names the same field's label, the later fact for that field is
  // unknown. The scan runs for both labelled and unlabelled (unit-only) facts; the field label
  // match happens in the earlier sentence. The lead control "পোশাক নিয়ে নিশ্চিত না। বয়স ১০।"
  // is preserved because the earlier sentence names a DIFFERENT field's label.
  {
    let cursor = a;
    while (cursor > 0) {
      // Walk back to the previous sentence's text; preserve any trailing delimiters so that
      // a question mark ending an earlier sentence ("not sure about the age?") is not lost.
      const sentRight = cursor;
      let sentEnd = sentRight;
      while (sentEnd > 0 && (isSentenceDelimiter(source, sentEnd - 1) || /\s/u.test(source[sentEnd - 1]))) {
        sentEnd--;
      }
      let sentStart = sentEnd;
      while (sentStart > 0 && !isSentenceDelimiter(source, sentStart - 1)) {
        sentStart--;
      }
      if (sentStart >= sentEnd) break;
      const earlierSentence = source.slice(sentStart, sentRight);
      if (isSentenceUncertain(earlierSentence) && hasOwnFieldLabel(field, earlierSentence)) return true;
      cursor = sentStart;
      // Skip delimiters/spaces between sentences
      while (cursor > 0 && (isSentenceDelimiter(source, cursor - 1) || /\s/u.test(source[cursor - 1]))) {
        cursor--;
      }
      if (cursor === sentStart) break;
    }
  }

  // Check every later sentence in the text
  let curr = b;
  while (curr < source.length) {
    while (curr < source.length && (isSentenceDelimiter(source, curr) || /\s/u.test(source[curr]))) {
      // A punctuation-only later sentence still qualifies earlier facts under forward scope.
      if (/[?？…]/u.test(source[curr])) return true;
      curr++;
    }
    if (curr >= source.length) break;
    const sentStart = curr;
    while (curr < source.length && !isSentenceDelimiter(source, curr)) {
      curr++;
    }
    const sentEnd = curr;
    const delim = curr < source.length ? source[curr] : "";
    const laterSentence = source.slice(sentStart, sentEnd);
    if (isSentenceUncertain(laterSentence, delim)) return true;
  }

  return false;
}

function sourceSpan(text: NormalisedText, value: unknown): EvidenceSpan | null {
  const parsed = evidenceSpanSchema.safeParse(value);
  if (!parsed.success) return null;
  const span = parsed.data;
  if (text.sourceText.slice(span.start_utf16, span.end_utf16) !== span.quote) return null;
  const joinsToken = (left: string, right: string) => /[\p{L}\p{M}\p{N}_]$/u.test(left) && /^[\p{L}\p{M}\p{N}_]/u.test(right);
  // Whole graphemes alone still permit cutting a name, number or unit mid-word.
  if (joinsToken(text.sourceText.slice(0, span.start_utf16), span.quote) || joinsToken(span.quote, text.sourceText.slice(span.end_utf16))) return null;
  const start_utf16 = text.offsetMap.findIndex((range) => range.start_utf16 === span.start_utf16);
  const end_utf16 = text.offsetMap.findLastIndex((range) => range.end_utf16 === span.end_utf16) + 1;
  const mapped = evidenceForRange(text, { start_utf16, end_utf16 });
  if (mapped.status !== "known") return null;
  const raw = mapped.evidence[0];
  return raw.start_utf16 === span.start_utf16 && raw.end_utf16 === span.end_utf16 ? raw : null;
}

// Strict shapes only (OD-013-10): [label] number [unit] [old|বয়সী|বয়স] and nothing else in the clause.
// age_min/age_max accept only the range shape "lo-hi".
function numericFact(field: ExtractField, value: number, span: EvidenceSpan, source: string): "ok" | AiDropReason {
  const range = field === "child.age_min" || field === "child.age_max";
  const height = field === "child.height_cm";
  const label = height ? HEIGHT_LABEL : AGE_LABEL;
  const unit = height ? "(?:cm|সেমি|সেন্টিমিটার)" : "(?:years?|yrs?|বছর)";
  const tail = height ? "" : "(?:\\s+(?:old|বয়সী|বয়স))?";
  const number = range ? "(\\d{1,3})\\s*[-–]\\s*(\\d{1,3})" : "(\\d{1,3})";
  const parse = (text: string, withTail: boolean) => {
    const plain = toAsciiDigits(text.normalize("NFC")).replace(/^\s*(?:\[MOCK\]\s*)+/u, "").trim();
    const shape = new RegExp(`^(?:(?<label>${label})\\s*[:=]?\\s*)?${number}(?:\\s*(?<unit>${unit}))?${withTail ? tail : ""}$`.normalize("NFC"), "iu");
    const match = shape.exec(plain);
    if (!match) return null;
    const lo = Number(match[2]);
    // Height must have an explicit unit (BLOCK 2); age may be anchored by label or unit.
    const anchored = height ? Boolean(match.groups?.unit) : Boolean(match.groups?.label || match.groups?.unit);
    return { lo, hi: range ? Number(match[3]) : lo, anchored };
  };
  const clause = parse(clauseAt(source, span), true);
  const quote = parse(span.quote, false);
  if (!clause || !clause.anchored || !quote || quote.lo !== clause.lo || quote.hi !== clause.hi) return "span_mismatch";
  const { lo, hi } = clause;
  if (range ? lo >= hi : false) return "span_mismatch";
  if (value !== (field === "child.age_max" ? hi : lo)) return "span_mismatch";
  const before = toAsciiDigits(source.slice(0, span.start_utf16));
  const after = toAsciiDigits(source.slice(span.end_utf16));
  if (/\d$/u.test(before) || /^(?:\d|[.,]\d)/u.test(after)) return "span_mismatch";
  const claimNumber = "(\\d{1,3})(?:\\s*[-–]\\s*(\\d{1,3}))?";
  const normalised = toAsciiDigits(source.normalize("NFC"));
  const labelled = height
    ? new RegExp(`${labelPrefix(label)}${claimNumber}\\s*${unit}(?![\\p{L}\\p{M}\\p{N}_])`, "giu")
    : new RegExp(`${labelPrefix(label)}${claimNumber}(?:\\s*${unit}(?![\\p{L}\\p{M}\\p{N}_]))?(?![\\p{L}\\p{M}\\p{N}_])`, "giu");
  const withUnit = new RegExp(`(?<![\\p{L}\\p{N}_.–-])${claimNumber}\\s*${unit}(?![\\p{L}\\p{M}\\p{N}_])`, "giu");
  const claims = new Set([...normalised.matchAll(labelled), ...normalised.matchAll(withUnit)].map((claim) => `${Number(claim[1])}:${Number(claim[2] ?? claim[1])}`));
  if (claims.size > 1) return "conflict";
  return claims.size === 1 && claims.has(`${lo}:${hi}`) ? "ok" : "span_mismatch";
}

function rawMatches(text: NormalisedText, pattern: RegExp, group = 0): EvidenceSpan[] {
  const spans: EvidenceSpan[] = [];
  for (const match of text.normalisedText.matchAll(pattern)) {
    const range = match.indices?.[group];
    if (!range) continue;
    const value = text.normalisedText.slice(range[0], range[1]);
    const start_utf16 = range[0] + value.length - value.trimStart().length;
    const end_utf16 = range[1] - value.length + value.trimEnd().length;
    const mapped = evidenceForRange(text, { start_utf16, end_utf16 });
    if (mapped.status === "known") spans.push(mapped.evidence[0]);
  }
  return spans;
}

function containsSpan(whole: EvidenceSpan, part: EvidenceSpan): boolean {
  const start = part.start_utf16 + part.quote.length - part.quote.trimStart().length;
  const end = part.end_utf16 - part.quote.length + part.quote.trimEnd().length;
  return start >= whole.start_utf16 && end <= whole.end_utf16;
}

function phoneHasSingleClaim(input: ExtractInput, text: NormalisedText, span: EvidenceSpan, value: string): boolean {
  const spans = rawMatches(text, new RegExp(`${labelPrefix(PHONE_LABEL)}([^,;।\\n]+)`, "dgiu"), 1);
  const claims = spans.flatMap((source) => {
    const phone = normalisePhone(input.sourceText, source);
    return phone.status === "known" ? [{ source, value: phone.value }] : [];
  });
  return new Set(claims.map((claim) => claim.value)).size === 1 && claims.some((claim) => claim.value === value && containsSpan(claim.source, span));
}

function timeHasSingleClaim(input: ExtractInput, text: NormalisedText, span: EvidenceSpan, signature: string): boolean {
  // Enumerates COMP-008's current grammar; normaliseTime remains the authority.
  const relative = "গতকাল\\s+(?:সকাল|দুপুর|বিকেলে|বিকেল|সন্ধ্যা|রাত)";
  const iso = "\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?(?:Z|[+-]\\d{2}:\\d{2})";
  const spans = rawMatches(text, new RegExp(`(?<![\\p{L}\\p{N}_])(?:${relative}|${iso})(?![\\p{L}\\p{N}_])`, "dgu"));
  const claims = spans.flatMap((source) => {
    const time = normaliseTime(input.sourceText, source, input.nowIso);
    return time.status === "known" ? [{ source, signature: JSON.stringify(time.value) }] : [];
  });
  return new Set(claims.map((claim) => claim.signature)).size === 1 && claims.some((claim) => claim.signature === signature && containsSpan(claim.source, span));
}

function checkedSpan(input: ExtractInput, text: NormalisedText, field: ExtractField, value: string | number, evidence: unknown): EvidenceSpan | AiDropReason {
  const span = sourceSpan(text, evidence);
  if (!span) return "span_mismatch";
  if (hedged(input.sourceText, span, field)) return "uncertain";
  if (field === "reporter.phone") {
    if (!hasLabelContext(input.sourceText, span, PHONE_LABEL)) return "span_mismatch";
    const phone = normalisePhone(input.sourceText, span);
    if (phone.status !== "known" || phone.value !== value) return "span_mismatch";
    return phoneHasSingleClaim(input, text, span, phone.value) ? phone.evidence[0] : "conflict";
  }
  if (field === "event.at" || field === "event.at_lower" || field === "event.at_upper") {
    // A time mentioned in another person's narrative/appointment is not an event assertion.
    // TC-002 narrative allows time words followed by narrative in the clause (BLOCK 4).
    if (!grammarClause(clauseAt(input.sourceText, span)).startsWith(grammarClause(span.quote))) return "span_mismatch";
    const time = normaliseTime(input.sourceText, span, input.nowIso);
    const key = field.slice("event.".length) as "at" | "at_lower" | "at_upper";
    if (time.status !== "known" || time.value[key] !== value) return "span_mismatch";
    return timeHasSingleClaim(input, text, span, JSON.stringify(time.value)) ? time.evidence[0] : "conflict";
  }
  if (typeof value === "number") {
    const fact = numericFact(field, value, span, input.sourceText);
    if (fact !== "ok") return fact;
    return { ...span, derivation: toAsciiDigits(span.quote) === span.quote ? "direct" : "digits" };
  }
  const quote = span.quote.normalize("NFC").trim();
  if (field === "child.sex") {
    const clause = grammarClause(clauseAt(input.sourceText, span));
    if (KIN_WITH_RELATION.test(clause)) return "span_mismatch";
    const facts = new Set(Array.from(input.sourceText.normalize("NFC").matchAll(SEX_WORD), (match) => SEX[match[0].toLowerCase()]));
    if (SEX[quote.toLowerCase()] !== value) return "span_mismatch";
    if (!SEX_CLAUSE.test(clause)) return "span_mismatch";
    return facts.size === 1 ? { ...span, derivation: "direct" } : "conflict";
  }
  const label = TEXT_LABELS[field];
  if (label) {
    if (!hasLabelContext(input.sourceText, span, label)) return "span_mismatch";
    // The value runs to the next clause delimiter; a decimal point inside digits is not one.
    const claims = new Set(Array.from(input.sourceText.normalize("NFC").matchAll(new RegExp(`${labelPrefix(label)}((?:[^,;\\n\\r।.]|(?<=[\\d০-৯])\\.(?=[\\d০-৯]))+)`, "giu")), (match) => match[1].trim()));
    if (claims.size > 1) return "conflict";
    if (![...claims].some((claim) => value.normalize("NFC") === claim || value.normalize("NFC") === toAsciiDigits(claim))) return "span_mismatch";
    // A name is a label-stated, digit-free value (ছেলে/মেয়ে are never a name source).
    if (field === "child.name") {
      // Names allow letter/mark words and joiners, but reject digits, label punctuation and repeated labels.
      if (!/^[\p{L}\p{M}\u200c\u200d]+(?:[\s'’–-]+[\p{L}\p{M}\u200c\u200d]+)*$/u.test(value.normalize("NFC"))
        || new RegExp(`${labelPrefix(label)}`, "iu").test(value.normalize("NFC"))) return "span_mismatch";
    }
  }
  if (value.normalize("NFC") === quote) return { ...span, derivation: "direct" };
  return value.normalize("NFC") === toAsciiDigits(quote) ? { ...span, derivation: "digits" } : "span_mismatch";
}

export function reconcileFacts(draft: CaseDraft, input: ExtractInput): CaseDraft {
  const { age_years: age, age_min: lo, age_max: hi } = draft.child;
  if ((lo !== null && hi !== null && lo > hi) || (age !== null && ((lo !== null && lo !== age) || (hi !== null && hi !== age)))) {
    for (const field of ["child.age_years", "child.age_min", "child.age_max"] as const) drop(draft, field);
  }
  const intervals = TIMES.filter((field) => fieldValue(draft, field) !== null).map((field) => {
    const span = draft.evidence[field];
    return normaliseTime(input.sourceText, span, input.nowIso);
  });
  const signatures = new Set(intervals.map((time) => time.status === "known" ? JSON.stringify(time.value) : null));
  if (signatures.size > 1 || signatures.has(null)) for (const field of TIMES) drop(draft, field);
  const at = draft.evidence["event.at"];
  const time = at && normaliseTime(input.sourceText, at, input.nowIso);
  draft.event.at_approx = time?.status === "known" ? time.value.at_approx : false;
  return caseDraftSchema.parse(draft);
}

// Even a structurally invalid response may contain independently checked partial
// fields for manual completion. It never becomes a successful extraction.
// `dropped` lists provider-asserted facts that failed a check; never-extracted fields are absent.
export function checkOutput(output: unknown, input: ExtractInput, text: NormalisedText): { valid: boolean; invalidReason?: AiInvalidReason; draft: CaseDraft; dropped: AiDropped[] } {
  let raw: unknown = output;
  let invalidReason: AiInvalidReason | undefined;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { raw = null; invalidReason = "non_json"; }
  }
  const valid = outputStructureSchema.safeParse(raw).success;
  const body = record(raw);
  const evidence = record(body.evidence);
  const draft = emptyDraft(input);
  const dropped: AiDropped[] = [];
  const kept: ExtractField[] = [];
  for (const field of EXTRACT_FIELDS) {
    const [group, key] = field.split(".") as ["child" | "event" | "reporter", string];
    const fields: Readonly<Record<string, z.ZodType>> = extractOutputSchema.shape[group].shape;
    const schema = fields[key];
    const asserted = record(body[group])[key];
    const parsed = schema.safeParse(asserted);
    if (!parsed.success) {
      if (asserted !== undefined) dropped.push({ field, reason: "type_mismatch" });
      continue;
    }
    if (parsed.data === "unknown" || (typeof parsed.data !== "string" && typeof parsed.data !== "number")) continue;
    const value = parsed.data;
    const span = checkedSpan(input, text, field, value, evidence[field]);
    if (typeof span === "string") { dropped.push({ field, reason: span }); continue; }
    setField(draft, field, value);
    draft.evidence[field] = span;
    kept.push(field);
  }
  const reconciled = reconcileFacts(draft, input);
  for (const field of kept) if (fieldValue(reconciled, field) === null) dropped.push({ field, reason: "conflict" });
  return { valid, ...(!valid ? { invalidReason: invalidReason ?? "schema_mismatch" } : {}), draft: reconciled, dropped };
}

export function mergePartials(previous: CaseDraft, next: CaseDraft, conflicts: Set<ExtractField>, input: ExtractInput): CaseDraft {
  for (const field of EXTRACT_FIELDS) {
    const value = fieldValue(next, field);
    if (value === null || value === "unknown") continue;
    const old = fieldValue(previous, field);
    if (old !== null && old !== "unknown" && old !== value) conflicts.add(field);
    if (conflicts.has(field)) drop(previous, field);
    else { setField(previous, field, value); previous.evidence[field] = next.evidence[field]; }
  }
  return reconcileFacts(previous, input);
}
