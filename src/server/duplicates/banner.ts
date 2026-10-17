// Officer-side duplicate banner data (COMP-049; SCREEN-010 / SCREEN-012). Copy comes from the
// locale files; the wording is D3 flow row 5 ("সম্ভাব্য একই শিশু: M-…" / "Possible same child: M-…")
// plus the D4 duplicate cue suffix ("আলাদা প্রতিবেদন দৃশ্যমান" / "separate reports remain visible").
// Officer screens only: the other report's reference code is the other party's data (BR-014).
import { locales, type Locale } from "@/locales";

export interface BannerLink {
  caseA: string;
  caseB: string;
  refCodeA: string;
  refCodeB: string;
  status: "flagged" | "confirmed_same" | "dismissed";
}
export interface DuplicateBanner {
  text: string; // "সম্ভাব্য একই শিশু: M-XXXXXX"
  note: string; // both reports stay visible
  otherCaseId: string;
  otherRefCode: string;
}

// A dismissed link is a human "different children" call and shows nothing.
export function duplicateBannerFor(links: readonly BannerLink[], caseId: string, locale: Locale): DuplicateBanner[] {
  const t = locales[locale];
  const out: DuplicateBanner[] = [];
  for (const l of links) {
    if (l.status === "dismissed") continue;
    if (l.caseA !== caseId && l.caseB !== caseId) continue;
    const mine = l.caseA === caseId;
    const otherCaseId = mine ? l.caseB : l.caseA;
    const otherRefCode = mine ? l.refCodeB : l.refCodeA;
    out.push({ text: `${t.matchReviewDuplicate}: ${otherRefCode}`, note: t.duplicateSeparateVisible, otherCaseId, otherRefCode });
  }
  return out;
}
