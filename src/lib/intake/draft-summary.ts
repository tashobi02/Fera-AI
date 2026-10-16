// "What we understood so far" rows for SCREEN-002 (D4 principle 3; BR-008: unknown
// stays unknown). One row per field of the missing-report draft contract, each with
// a value or null; the screen prints null as "অজানা".
// Display only: values sent back to API-002 keep their original digits.
import type { CaseDraft, DraftFieldPath, Sex } from "@/contracts";
import { localizeDigits } from "@/lib/numerals";
import { locales, type Locale, type MessageKey } from "@/locales";

export type SummaryRow = { key: string; label: string; value: string | null; lang?: "bn" | "en" };

const SEX_KEY: Record<Sex, MessageKey | null> = {
  male: "sexMale",
  female: "sexFemale",
  other: "sexOther",
  unknown: null, // "unknown" is shown as অজানা, not as an answer
};

// Every draft path → its row label. A full Record, so a new contract path fails the build.
export const FIELD_LABEL: Record<DraftFieldPath, MessageKey> = {
  "child.name": "fieldName",
  "child.name_latin": "fieldNameLatin",
  "child.age_years": "fieldAge",
  "child.age_min": "fieldAge",
  "child.age_max": "fieldAge",
  "child.sex": "fieldSex",
  "child.height_cm": "fieldHeight",
  "child.clothing": "fieldClothing",
  "child.marks": "fieldMarks",
  "event.at": "fieldLastSeenAt",
  "event.at_lower": "fieldLastSeenAt",
  "event.at_upper": "fieldLastSeenAt",
  "event.place_text": "fieldPlace",
  "event.district_text": "fieldDistrict",
  "event.district_code": "fieldDistrict",
  "event.thana": "fieldThana",
  "event.circumstances": "fieldCircumstances",
  "reporter.relation": "fieldRelation",
  "reporter.phone": "fieldPhone",
};

// Distinct labels for a missing-field list, in the order given.
export function missingLabels(paths: readonly DraftFieldPath[], locale: Locale): string[] {
  const t = locales[locale];
  return [...new Set(paths.map((p) => FIELD_LABEL[p]))].map((k) => t[k]);
}

// The script of free text the parent or the extraction supplied, for `lang` (D4 §13).
// Mixed text containing Bangla is tagged bn; digits and punctuation alone get no tag.
export function textLang(text: string): "bn" | "en" | undefined {
  if (/[ঀ-৿]/.test(text)) return "bn";
  if (/[A-Za-z]/.test(text)) return "en";
  return undefined;
}

// Date and time formatted apart: bn-BD then reads "১২ অক্টোবর, ৪:০০ বিকাল" (no Latin "PM").
function when(iso: string, locale: Locale): string {
  const tag = locale === "bn" ? "bn-BD" : "en-GB";
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat(tag, { timeZone: "Asia/Dhaka", day: "numeric", month: "long" }).format(date);
  const time = new Intl.DateTimeFormat(tag, { timeZone: "Asia/Dhaka", hour: "numeric", minute: "2-digit", dayPeriod: "short" }).format(date);
  return localizeDigits(`${day}, ${time}`, locale);
}

export function summaryRows(draft: CaseDraft, locale: Locale): SummaryRow[] {
  const t = locales[locale];
  const n = (value: number) => localizeDigits(value, locale);
  const { child, event, reporter } = draft;
  const free = (key: string, label: string, value: string | null): SummaryRow => ({
    key,
    label,
    value,
    lang: value === null ? undefined : textLang(value),
  });

  let age: string | null = null;
  if (child.age_years !== null) age = t.ageYears.replace("{n}", n(child.age_years));
  else if (child.age_min !== null && child.age_max !== null)
    age = t.ageRange.replace("{min}", n(child.age_min)).replace("{max}", n(child.age_max));

  let at: string | null = null;
  if (event.at !== null) at = event.at_approx ? t.approxTime.replace("{t}", when(event.at, locale)) : when(event.at, locale);
  else if (event.at_lower !== null && event.at_upper !== null)
    at = t.timeWindow.replace("{from}", when(event.at_lower, locale)).replace("{to}", when(event.at_upper, locale));
  else if (event.at_lower !== null) at = t.timeAfter.replace("{t}", when(event.at_lower, locale));
  else if (event.at_upper !== null) at = t.timeBefore.replace("{t}", when(event.at_upper, locale));

  const sexKey = SEX_KEY[child.sex];
  return [
    free("name", t.fieldName, child.name),
    free("nameLatin", t.fieldNameLatin, child.name_latin),
    { key: "age", label: t.fieldAge, value: age },
    { key: "sex", label: t.fieldSex, value: sexKey ? t[sexKey] : null },
    { key: "height", label: t.fieldHeight, value: child.height_cm === null ? null : t.heightCm.replace("{n}", n(child.height_cm)) },
    free("clothing", t.fieldClothing, child.clothing),
    free("marks", t.fieldMarks, child.marks),
    { key: "at", label: t.fieldLastSeenAt, value: at },
    free("place", t.fieldPlace, event.place_text),
    free("thana", t.fieldThana, event.thana),
    // Known only once resolved to one of the 64 codes; the text is shown as its name.
    // ponytail: the client has no district names yet (TASK-009 data), so a code without
    // text shows as unknown rather than "district code 26" (OD-021-9).
    free("district", t.fieldDistrict, event.district_code === null ? null : event.district_text),
    free("circumstances", t.fieldCircumstances, event.circumstances),
    free("relation", t.fieldRelation, reporter.relation),
    { key: "phone", label: t.fieldPhone, value: reporter.phone === null ? null : localizeDigits(reporter.phone, locale) },
  ];
}
