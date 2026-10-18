// S-012 case detail, close, and audit copy (TASK-029; D3 SCREEN-012, D4 status rules).
// Bangla parent default per FR-033; strings live here so waves can edit them without
// touching the shared locales root (PHASE_3_PLAN.md §5). Every new Bangla string carries
// a trailing `needs human Bangla review` comment for the labelling pass.
//
// Copy sources:
//   - D3 SCREEN-012 "Case closed" success / audit timeline
//   - D3 SCREEN-012 "কেস বন্ধ করুন" / Close case (ACT-023)
//   - D3 SCREEN-012 close outcomes: "শনাক্ত, রেফারেল হয়েছে" / Located, referred and
//     "ফেরার বাইরে নিষ্পত্তি" / Resolved outside Fera
//   - DESIGN.md Fera overrides: status = icon + text + colour, "honest labels"
//   - Constitution: no rescue/return/reunification wording anywhere; the wording guard
//     covers generated output but every new UI string here is checked in a test too
//     (test reads through src/server/outputs/guard.ts findBannedGroup).
export const officerCaseBn = {
  caseTitle: "কেস বিস্তারিত", // needs human Bangla review
  caseReferenceLabel: "রেফারেন্স", // needs human Bangla review
  caseKindLabel: "রিপোর্টের ধরন", // needs human Bangla review
  caseKindMissing: "নিখোঁজ রিপোর্ট", // needs human Bangla review
  caseKindFound: "খুঁজে পাওয়া রিপোর্ট", // needs human Bangla review
  caseStatusLabel: "অবস্থা", // needs human Bangla review
  caseStatusOpen: "খোলা",
  caseStatusMatched: "যাচাই চলছে",
  caseStatusConfirmed: "যাচাই হয়েছে", // needs human Bangla review
  caseStatusClosed: "বন্ধ",
  caseStatusReferred: "রেফারেল নথিভুক্ত (সিমুলেশন)", // needs human Bangla review
  caseStatusSubmitted: "জমা হয়েছে", // needs human Bangla review
  childSection: "শিশুর তথ্য", // needs human Bangla review
  childName: "নাম",
  childNameLatin: "নাম (ইংরেজি অক্ষরে)",
  childAge: "বয়স",
  childSex: "লিঙ্গ", // needs human Bangla review
  childSexMale: "ছেলে",
  childSexFemale: "মেয়ে",
  childSexOther: "অন্য কিছু",
  childSexUnknown: "জানি না",
  childClothing: "পোশাক",
  childMarks: "চেনার চিহ্ন",
  childHeight: "উচ্চতা (সেমি)", // needs human Bangla review
  eventSection: "কখন ও কোথায়", // needs human Bangla review
  eventAt: "শেষবার দেখা", // needs human Bangla review
  eventPlace: "স্থান", // needs human Bangla review
  eventDistrict: "জেলা",
  eventThana: "থানা",
  eventCircumstances: "পরিস্থিতি", // needs human Bangla review
  reporterSection: "অভিভাবক ও যোগাযোগ", // needs human Bangla review
  reporterRelation: "শিশুর সাথে সম্পর্ক", // needs human Bangla review
  reporterPhoneMasked: "ফোন (মাস্ক করা)", // needs human Bangla review
  reporterPhoneUnmasked: "ফোন (যাচাইকৃত)", // needs human Bangla review
  duplicateSection: "সম্ভাব্য একই রিপোর্ট", // needs human Bangla review
  duplicateEmpty: "সম্ভাব্য একই রিপোর্ট পাওয়া যায়নি", // needs human Bangla review
  matchingSection: "মিল খোঁজা", // needs human Bangla review
  auditSection: "কার্যক্রমের ইতিহাস", // needs human Bangla review
  auditEmpty: "এই কেসের জন্য কোনো কার্যক্রম নথিভুক্ত নেই", // needs human Bangla review
  auditWithheldNote: "কিছু নথিভুক্ত কার্যক্রম অনুমতির বাইরে থাকায় দেখানো হচ্ছে না", // needs human Bangla review
  auditActor: "কে", // needs human Bangla review
  auditAction: "কী হয়েছে", // needs human Bangla review
  auditAt: "কখন", // needs human Bangla review
  closeTitle: "কেস বন্ধ করুন", // needs human Bangla review
  closeIntro: "বন্ধ করলে সমন্বয়ের রেকর্ড তৈরি হবে (সিমুলেশন)। কোনো দাবি করা হবে না।", // needs human Bangla review
  closeOutcomeLabel: "ফলাফল", // needs human Bangla review
  closeOutcomeCoordination: "শনাক্ত, রেফারেল হয়েছে", // needs human Bangla review
  closeOutcomeResolvedOutside: "ফেরার বাইরে নিষ্পত্তি", // needs human Bangla review
  closeNoteLabel: "নোট (আবশ্যক)", // needs human Bangla review
  closeNoteHint: "আপনার নিজের কথায় — রেফারেল নথিভুক্তির সিমুলেশনের বর্ণনা", // needs human Bangla review
  closeNoteRequired: "পর্যালোচিত নোট লিখুন (৩–৫০০ অক্ষর)।", // needs human Bangla review
  closeStep1: "প্রথম ধাপ", // needs human Bangla review
  closeConfirm1: "পর্যালোচনা শেষ", // needs human Bangla review
  closeStep2: "দ্বিতীয় ধাপ (চূড়ান্ত)", // needs human Bangla review
  closeConfirm2: "সমন্বয়ের রেকর্ড বন্ধ করুন", // needs human Bangla review
  closeSubmitting: "বন্ধ হচ্ছে…", // needs human Bangla review
  closeSuccessTitle: "কেস বন্ধ হয়েছে", // needs human Bangla review
  // D3 SCREEN-012 success — exact copy required by P3-018 / P3-019 inputs
  closeSuccessBody: "সমন্বয়ের সিদ্ধান্ত ও রেফারেল নথিভুক্ত (সিমুলেশন)",
  closeReload: "পাতা আবার লোড করুন", // needs human Bangla review
  closeStaleVersion: "এই কেসের তথ্য অন্য কোথাও বদলে গেছে। নতুন তথ্য পেতে পাতা আবার লোড করুন।", // needs human Bangla review
  closeMissingNote: "আপনার নোট এখানে ছিল:", // needs human Bangla review
  closeErrorGeneric: "কিছু একটা ভুল হয়েছে। আবার চেষ্টা করুন।", // needs human Bangla review
  closeClosedNotice: "এই কেস ইতিমধ্যে বন্ধ হয়ে গেছে।", // needs human Bangla review
  closeNotAllowed: "এই অবস্থায় কেস বন্ধ করা যাবে না", // needs human Bangla review
  loadingCase: "কেসের তথ্য লোড হচ্ছে…", // needs human Bangla review
  loadingAudit: "কার্যক্রমের ইতিহাস লোড হচ্ছে…", // needs human Bangla review
  errorUnavailable: "এই কেসের তথ্য এখন দেখানো যাচ্ছে না। পরে আবার চেষ্টা করুন।", // needs human Bangla review
  unknown: "অজানা", // D3 SCREEN-003
  notProvided: "দেওয়া হয়নি", // needs human Bangla review
} as const;

export const officerCaseEn = {
  caseTitle: "Case detail",
  caseReferenceLabel: "Reference",
  caseKindLabel: "Report type",
  caseKindMissing: "Missing report",
  caseKindFound: "Found report",
  caseStatusLabel: "Status",
  caseStatusOpen: "Open",
  caseStatusMatched: "Being checked",
  caseStatusConfirmed: "Confirmed",
  caseStatusClosed: "Closed",
  caseStatusReferred: "Referral recorded (simulation)",
  caseStatusSubmitted: "Submitted",
  childSection: "Child details",
  childName: "Name",
  childNameLatin: "Name (Latin letters)",
  childAge: "Age",
  childSex: "Sex",
  childSexMale: "Boy",
  childSexFemale: "Girl",
  childSexOther: "Other",
  childSexUnknown: "Don't know",
  childClothing: "Clothing",
  childMarks: "Identifying marks",
  childHeight: "Height (cm)",
  eventSection: "When and where",
  eventAt: "Last seen",
  eventPlace: "Place",
  eventDistrict: "District",
  eventThana: "Thana (police station area)",
  eventCircumstances: "Circumstances",
  reporterSection: "Reporter and contact",
  reporterRelation: "Relation to the child",
  reporterPhoneMasked: "Phone (masked)",
  reporterPhoneUnmasked: "Phone (verified)",
  duplicateSection: "Likely same report",
  duplicateEmpty: "No likely same report found",
  matchingSection: "Matching",
  auditSection: "Activity log",
  auditEmpty: "No activity is recorded for this case",
  auditWithheldNote: "Some recorded activity is withheld because your permissions don't cover it",
  auditActor: "Who",
  auditAction: "What",
  auditAt: "When",
  closeTitle: "Close case",
  closeIntro: "Closing records a coordination outcome (simulation). No outcome is claimed beyond that.",
  closeOutcomeLabel: "Outcome",
  closeOutcomeCoordination: "Located, referral recorded",
  closeOutcomeResolvedOutside: "Resolved outside Fera",
  closeNoteLabel: "Note (required)",
  closeNoteHint: "In your own words — description of the simulated referral record",
  closeNoteRequired: "Enter a reviewed note (3–500 characters).",
  closeStep1: "Step 1",
  closeConfirm1: "Review complete",
  closeStep2: "Step 2 (final)",
  closeConfirm2: "Close coordination record",
  closeSubmitting: "Closing…",
  closeSuccessTitle: "Case closed",
  closeSuccessBody: "Coordination decision and referral recorded (simulation)",
  closeReload: "Reload the page",
  closeStaleVersion: "This case was changed somewhere else. Reload to see the latest details.",
  closeMissingNote: "Your note was here:",
  closeErrorGeneric: "Something went wrong. Please try again.",
  closeClosedNotice: "This case is already closed.",
  closeNotAllowed: "This case cannot be closed in its current state",
  loadingCase: "Loading case details…",
  loadingAudit: "Loading activity log…",
  errorUnavailable: "This case's details aren't available right now. Try again later.",
  unknown: "Unknown",
  notProvided: "Not provided",
} as const;
