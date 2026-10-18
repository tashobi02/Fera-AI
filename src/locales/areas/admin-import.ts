// S-013 admin synthetic import copy (TASK-048; API-015; FR-024; TC-014; D3 SCREEN-013
// ACT-026). Bangla parent default per FR-033; new copy pending human Bangla review
// (OD-021-3). Honest labels: every state is clearly simulated and never confused with
// real public-child data. The UI shows counts only (imported/skipped/duplicates_flagged),
// never a child or candidate payload, and never a created reference list.
export const adminImportBn = {
  adminImportSyntheticLabel: "সিনথেটিক নমুনা",
  adminImportTitle: "সিনথেটিক টেক্সট ইমপোর্ট",
  adminImportIntro:
    "১ থেকে ৫টি উদ্ভাবিত টেক্সট আলাদা আলাদা লাইনে লিখুন। প্রতিটির একটি example.invalid ঠিকানা থাকতে হবে। এগুলো সিনথেটিক — আসল শিশুর তথ্য দেবেন না।",
  adminImportTextareaLabel: "ইনভেন্টেড টেক্সট (প্রতি লাইনে একটি)",
  adminImportTextareaHint:
    "প্রতিটি লাইন ২০ থেকে ২,০০০ অক্ষরের মধ্যে হতে হবে। ইনপুট ডেটা হিসেবে বিবেচিত — পূর্বের নির্দেশনা ইত্যাদি এড়িয়ে যাওয়া হবে।",
  adminImportFixtureLabel: "সুরক্ষিত সিনথেটিক নমুনা থেকে বেছে নিন",
  adminImportFixtureHint:
    "ডেমো ইমপোর্ট শুধু এই হুবহু টেক্সটগুলোই গ্রহণ করে। অন্য কোনো লেখা, পরিবর্তিত নমুনা বা প্রম্পট-ইনজেকশন এড়িয়ে যাবে।",
  adminImportSourceUrlLabel: "উৎস ঠিকানা (ঐচ্ছিক, example.invalid)",
  adminImportSourceUrlHint:
    "একটি example.invalid ঠিকানা দিলে সেটি সব লাইনে ব্যবহার হবে। না দিলে ব্রাউজার প্রতিটি লাইনের জন্য আলাদা example.invalid ঠিকানা বসাবে।",
  adminImportFixtureToggle: "পরিচিত সিনথেটিক নমুনা ব্যবহার করুন (ডেমো মোড)",
  adminImportFixtureNote:
    "ডেমো মোডে চিহ্নিত: এই নমুনাগুলো নির্ধারিত — সেগুলোকে লাইভ এক্সট্রাকশনের ফলাফল হিসেবে দেখানো হবে না।",
  adminImportKindLabel: "রিপোর্টের ধরন",
  adminImportKindMissing: "নিখোঁজ",
  adminImportKindFound: "খুঁজে পাওয়া",
  adminImportAction: "সিনথেটিক ইমপোর্ট করুন",
  adminImportImporting: "ইমপোর্ট হচ্ছে…",
  adminImportImported: "{n}টি সিনথেটিক কেস ইমপোর্ট হয়েছে",
  adminImportSkipped: "{n}টি টেক্সট বাদ পড়েছে (পার্স বা যাচাই ব্যর্থ)",
  adminImportDuplicates: "{n}টি সম্ভাব্য ডুপ্লিকেট চিহ্নিত",
  adminImportErrorValidation: "কিছু তথ্য ঠিক নয়। চিহ্নিত ঘরগুলো দেখুন।",
  adminImportErrorBudget: "সহকারীর সীমা শেষ। সিনথেটিক ইমপোর্ট স্থগিত।",
  adminImportErrorForbidden: "এই কাজের অনুমতি আপনার নেই।",
  adminImportErrorSession: "সেশন শেষ হয়েছে। আবার সাইন ইন করুন।",
  adminImportErrorOffline: "ইন্টারনেট নেই। সংযোগ ফিরলে আবার চেষ্টা করুন।",
  adminImportErrorGeneric: "কিছু একটা ভুল হয়েছে। আবার চেষ্টা করুন।",
  adminImportErrorRateLimited: "{s} সেকেন্ড পরে আবার চেষ্টা করুন।",
  adminImportErrorRateLimitedSoon: "একটু পরে আবার চেষ্টা করুন।",
  adminImportEmpty: "কোনো ইনভেন্টেড টেক্সট দেওয়া হয়নি।",
  adminImportSimulated: "সিমুলেটেড",
  adminImportNoPayload: "শুধু সারাংশ গণনা দেখানো হয়।",
  adminImportNoFetch: "উৎস ঠিকানা কখনো আনা হয় না।",
  adminImportLabel: "সিনথেটিক",
  adminImportNoLiveExtraction: "ডেমো ইমপোর্টে নির্ধারিত সিমুলেশন চলে; লাইভ এআই এক্সট্রাকশন চলে না।",
  adminImportAdminOnly: "শুধু অ্যাডমিন।",
} as const;

export const adminImportEn = {
  adminImportSyntheticLabel: "Synthetic sample",
  adminImportTitle: "Import synthetic texts",
  adminImportIntro:
    "Write 1 to 5 invented texts, one per line. Each one needs an example.invalid URL. These are synthetic — do not enter real child details.",
  adminImportTextareaLabel: "Invented texts (one per line)",
  adminImportTextareaHint:
    "Each line must be 20 to 2,000 characters. Treated as input data — instructions like 'ignore previous' are ignored.",
  adminImportFixtureLabel: "Choose from the protected synthetic samples",
  adminImportFixtureHint:
    "Demo import accepts only these exact texts. Any other wording, altered sample or prompt-injection text is skipped.",
  adminImportSourceUrlLabel: "Source URL (optional, example.invalid)",
  adminImportSourceUrlHint:
    "If you give one example.invalid URL, it is used for every line. If you leave it empty, the browser assigns a distinct example.invalid URL to each line.",
  adminImportFixtureToggle: "Use the known synthetic sample (demo mode)",
  adminImportFixtureNote:
    "Labelled simulated: those samples are deterministic — they are not shown as live extraction results.",
  adminImportKindLabel: "Report kind",
  adminImportKindMissing: "Missing",
  adminImportKindFound: "Found",
  adminImportAction: "Run synthetic import",
  adminImportImporting: "Importing…",
  adminImportImported: "{n} synthetic cases imported",
  adminImportSkipped: "{n} texts skipped (parse or validation failed)",
  adminImportDuplicates: "{n} possible duplicates flagged",
  adminImportErrorValidation: "Some details need fixing. Check the marked fields.",
  adminImportErrorBudget: "The assistant's limit is reached. Synthetic import paused.",
  adminImportErrorForbidden: "You don't have permission for this action.",
  adminImportErrorSession: "Your session ended. Sign in again.",
  adminImportErrorOffline: "No internet. Try again when you're back online.",
  adminImportErrorGeneric: "Something went wrong. Please try again.",
  adminImportErrorRateLimited: "Please try again in {s} seconds.",
  adminImportErrorRateLimitedSoon: "Please try again in a little while.",
  adminImportEmpty: "No invented texts were given.",
  adminImportSimulated: "Simulated",
  adminImportNoPayload: "Only summary counts are shown.",
  adminImportNoFetch: "Source URLs are never fetched.",
  adminImportLabel: "Synthetic",
  adminImportNoLiveExtraction: "Demo imports use deterministic simulation; live AI extraction does not run.",
  adminImportAdminOnly: "Admin only.",
} as const;
