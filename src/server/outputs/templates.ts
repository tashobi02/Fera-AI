// Output templates (COMP-010, TASK-023; FR-008/009, BR-022, DECISION-007). Fixed Bangla
// text filled only with reporter-reviewed fields, the fixed instructions and 13219. No
// LLM. A missing field prints "অজানা", never a guess. `source_text` and `circumstances`
// are never copied in (D2A COMP-016 scope); the reviewed field values that are copied go
// through the wording guard with the rest of the text (guard.ts).
//
// The wording here is not from the spec pack (D7 OQ-016: the official GD field list is
// open), so it needs a Bangla review. The draft label and the 13219 line reuse D3/D4 copy.
import { toDhakaIso, type CaseDraft, type OutputType, type Sex } from "@/contracts";
import { toBanglaDigits } from "@/lib/numerals";

export type TemplateType = OutputType;

export type TemplateInput = {
  refCode: string;
  draft: CaseDraft;
  districtNameBn: string | null; // from the reviewed district code; null when unknown
};

export const UNKNOWN_BN = "অজানা";
// D3 S-004: every output card carries this label; it contains OUTPUT_DRAFT_LABEL_BN.
export const DRAFT_HEADER_BN = "খসড়া — নিজে জমা দিন · সিনথেটিক তথ্য";
const NO_FILING_BN = "ফেরা পুলিশে জিডি জমা দেয় না।"; // D4 §15.1 "Before submit"
const HELPLINE_BN = "জরুরি হলে ১৩২১৯-এ কল করুন।"; // D4 §10 "State Fera's limits"

const SEX_BN: Record<Sex, string> = { female: "মেয়ে", male: "ছেলে", other: "অন্যান্য", unknown: UNKNOWN_BN };
const MONTHS_BN = [
  "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
  "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর",
] as const;

const or = (v: string | null) => (v === null || v === "" ? UNKNOWN_BN : v);

function ageBn(c: CaseDraft["child"]): string {
  if (c.age_years !== null) return `${toBanglaDigits(c.age_years)} বছর`;
  if (c.age_min !== null && c.age_max !== null) {
    return `${toBanglaDigits(c.age_min)}–${toBanglaDigits(c.age_max)} বছর (আনুমানিক)`;
  }
  return UNKNOWN_BN;
}

function dayPart(hour: number): string {
  if (hour >= 4 && hour < 6) return "ভোর";
  if (hour >= 6 && hour < 12) return "সকাল";
  if (hour >= 12 && hour < 15) return "দুপুর";
  if (hour >= 15 && hour < 18) return "বিকেল";
  if (hour >= 18 && hour < 20) return "সন্ধ্যা";
  return "রাত";
}

// Fixed format in Asia/Dhaka, not Intl: ICU versions differ, and cached text must not.
function parts(iso: string) {
  const local = toDhakaIso(Date.parse(iso)); // "YYYY-MM-DDTHH:mm:ss+06:00"
  const [y, m, d] = local.slice(0, 10).split("-").map(Number);
  const [h, min] = local.slice(11, 16).split(":").map(Number);
  return { date: `${toBanglaDigits(d)} ${MONTHS_BN[m - 1]} ${toBanglaDigits(y)}`, h, min };
}

function clock(h: number, min: number): string {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${dayPart(h)} ${toBanglaDigits(h12)}:${toBanglaDigits(String(min).padStart(2, "0"))}`;
}

function whenBn(e: CaseDraft["event"]): string {
  if (e.at_lower !== null && e.at_upper !== null && Date.parse(e.at_lower) !== Date.parse(e.at_upper)) {
    const lo = parts(e.at_lower);
    const hi = parts(e.at_upper);
    const end = lo.date === hi.date ? clock(hi.h, hi.min) : `${hi.date}, ${clock(hi.h, hi.min)}`;
    return `${lo.date}, ${clock(lo.h, lo.min)} থেকে ${end}-এর মধ্যে (আনুমানিক)`;
  }
  const at = e.at ?? e.at_lower;
  if (at === null) return UNKNOWN_BN;
  const p = parts(at);
  return `${p.date}, ${clock(p.h, p.min)}${e.at_approx ? " (আনুমানিক)" : ""}`;
}

function childLines(input: TemplateInput): string[] {
  const { child, event } = input.draft;
  return [
    `শিশুর নাম: ${or(child.name)}`,
    `বয়স: ${ageBn(child)}`,
    `লিঙ্গ: ${SEX_BN[child.sex]}`,
    `উচ্চতা: ${child.height_cm === null ? UNKNOWN_BN : `${toBanglaDigits(child.height_cm)} সেমি`}`,
    `পরনে ছিল: ${or(child.clothing)}`,
    `শনাক্তকরণ চিহ্ন: ${or(child.marks)}`,
    `শেষবার দেখা গিয়েছিল: ${or(event.place_text)}`, // D4 §10 neutral wording
    `জেলা: ${input.districtNameBn ?? or(event.district_text)}`,
    `সময়: ${whenBn(event)}`,
  ];
}

const phoneBn = (d: CaseDraft) => (d.reporter.phone ? toBanglaDigits(d.reporter.phone) : UNKNOWN_BN);

// Free text is cut to 8 words per field, because the helpline limit counts words. Worst case:
// header 8 + four cut fields (labels 2+2+3+1, values 8 + "(সংক্ষেপিত)" each) 44 + age
// range/sex 6 + cross-date time range 14 + phone 3 (one token: the DB CHECKs
// contact_phone '^01[0-9]{9}$') + reference 2 = 77 ≤ 80 (LIMITS.helplineWords). The
// worst-case test pins 77.
const HELPLINE_FIELD_WORDS = 8;
function cutWords(v: string | null): string {
  const words = (v ?? "").trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return UNKNOWN_BN;
  if (words.length <= HELPLINE_FIELD_WORDS) return words.join(" ");
  // Said aloud on the call: a cut can drop a clause-final "না", so the cut must be audible.
  return `${words.slice(0, HELPLINE_FIELD_WORDS).join(" ")}… (সংক্ষেপিত)`;
}

function gd(input: TemplateInput): string {
  const { draft } = input;
  return [
    DRAFT_HEADER_BN,
    NO_FILING_BN,
    `রেফারেন্স: ${input.refCode}`,
    "",
    "বরাবর",
    "ভারপ্রাপ্ত কর্মকর্তা",
    draft.event.thana ? `${draft.event.thana} থানা` : `থানা: ${UNKNOWN_BN}`,
    "",
    "বিষয়: শিশু নিখোঁজ হওয়া সম্পর্কে সাধারণ ডায়েরি (জিডি)",
    "",
    "জনাব,",
    "বিনীত নিবেদন এই যে, নিচের তথ্য অনুযায়ী একটি শিশু নিখোঁজ হওয়ার বিষয়টি সাধারণ ডায়েরিভুক্ত করার অনুরোধ করছি।",
    "",
    ...childLines(input),
    "",
    "নিবেদক",
    "(নিজের নাম, স্বাক্ষর ও তারিখ নিজে লিখুন)", // not case fields: Fera stores no reporter name
    `শিশুর সঙ্গে সম্পর্ক: ${or(draft.reporter.relation)}`,
    `ফোন: ${phoneBn(draft)}`,
  ].join("\n");
}

function poster(input: TemplateInput): string {
  return [
    DRAFT_HEADER_BN,
    "",
    "নিখোঁজ শিশু",
    "এই শিশুটিকে দেখেছেন?",
    ...childLines(input),
    "",
    `তথ্য থাকলে যোগাযোগ করুন: ${phoneBn(input.draft)}`,
    HELPLINE_BN,
    `রেফারেন্স: ${input.refCode}`,
  ].join("\n");
}

// FR-010 (TC-007): a short spoken-style summary for a 13219 call, at most 80 words.
function helpline(input: TemplateInput): string {
  const { child, event } = input.draft;
  return [
    DRAFT_HEADER_BN,
    `শিশুর নাম: ${cutWords(child.name)}`,
    `বয়স: ${ageBn(child)}, লিঙ্গ: ${SEX_BN[child.sex]}`,
    `পরনে ছিল: ${cutWords(child.clothing)}`,
    `শেষবার দেখা গিয়েছিল: ${cutWords(event.place_text)}`, // D4 §10 neutral wording
    `জেলা: ${cutWords(input.districtNameBn ?? event.district_text)}`,
    `সময়: ${whenBn(event)}`,
    `যোগাযোগের ফোন: ${phoneBn(input.draft)}`,
    `রেফারেন্স: ${input.refCode}`,
  ].join("\n");
}

export const TEMPLATES: Readonly<Record<TemplateType, (input: TemplateInput) => string>> = { gd, poster, helpline };
