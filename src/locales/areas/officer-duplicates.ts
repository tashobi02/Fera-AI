// S-014 duplicate review copy (TASK-051; FR-023; SCREEN-014). Bangla parent default per
// FR-033; desk screens are bilingual. Exact D3 strings are reused where they exist; new
// strings are added here so the shared locales root stays untouched. The page is a
// compare-and-decide surface: profile evidence on the left and right, two buttons
// (same child / different) and a required reason on the form. "Similarity" is the
// score label, never probability (D4 §score). Synthetic and [MOCK] labels are kept
// visible at all times (AGENTS honest-copy rule).
export const officerDuplicatesBn = {
  // List page
  duplicateListPageTitle: "সম্ভাব্য একই শিশু",
  duplicateListHeading: "পতাকাযুক্ত সম্ভাব্য একই শিশু",
  duplicateListEmpty: "এখনও কোনো সম্ভাব্য একই শিশু নেই।",
  duplicateListIntro: "প্রতিটি লিঙ্কে দুটি একই ধরনের প্রতিবেদন রয়েছে। পর্যালোচনা করে ‘একই শিশু’ বা ‘আলাদা’ চিহ্নিত করুন।",
  duplicateSeparateVisible: "আলাদা প্রতিবেদন দৃশ্যমান",
  // Detail page
  duplicateDetailPageTitle: "সম্ভাব্য একই শিশু — পর্যালোচনা",
  duplicateDetailHeading: "এই দুটি প্রতিবেদন কি একই শিশুর?",
  duplicateDetailIntro: "প্রতিটি ক্ষেত্র পাশাপাশি দেখুন। সিদ্ধান্ত নিজে নিন — স্কোর কখনো প্রমাণ নয়।",
  duplicateRuleProfile: "প্রোফাইল মিল",
  duplicateRuleSamePhone: "শুধু ফোন নম্বর মিল",
  duplicateRuleSamePhoneWarn: "শুধুমাত্র ফোন নম্বরের ভিত্তিতে ‘একই শিশু’ নিশ্চিত করা যাবে না।",
  duplicateAlreadyResolved: "এই লিঙ্ক ইতিমধ্যে সমাধান করা হয়েছে।",
  duplicateScore: "মিলের মাত্রা",
  // Form
  duplicateReasonLabel: "কারণ (৩–৫০০ অক্ষর)",
  duplicateReasonRequired: "সিদ্ধান্তের কারণ লিখুন।",
  duplicateReasonLength: "কারণ ৩ থেকে ৫০০ অক্ষরের মধ্যে হতে হবে।",
  duplicateProfileEvidenceLabel: "আমি প্রোফাইল প্রমাণ পর্যালোচনা করেছি",
  duplicateProfileEvidenceRequired: "প্রোফাইল প্রমাণ পর্যালোচনা না করে ‘একই শিশু’ বা ‘আলাদা’ নিশ্চিত করা যাবে না।",
  duplicateConfirmSame: "একই শিশু",
  duplicateDismiss: "আলাদা",
  duplicateSamePhoneCannotConfirm: "শুধু ফোন নম্বরের ভিত্তিতে ‘একই শিশু’ নিশ্চিত করা যাবে না।",
  duplicateSubmitting: "জমা হচ্ছে…",
  duplicateDecided: "সিদ্ধান্ত নথিভুক্ত হয়েছে।",
  duplicateBack: "তালিকায় ফিরুন",
  // Failure messages
  duplicateStale: "এই লিঙ্কটি আর পতাকাযুক্ত নেই। পাতা রিফ্রেশ করুন।",
  duplicateHidden: "তথ্যটি পাওয়া যায়নি।",
  duplicateForbidden: "এই পাতা দেখার অনুমতি নেই।",
  duplicateValidation: "ফর্মে সমস্যা আছে।",
  duplicateSession: "সেশনের মেয়াদ শেষ। আবার সাইন ইন করুন।",
  duplicateOffline: "ইন্টারনেট সংযোগ নেই।",
  duplicateUncertain: "অনিশ্চিত উত্তর। আবার চেষ্টা করুন।",
  duplicateRateLimited: "{s} সেকেন্ড পরে আবার চেষ্টা করুন।",
  duplicateRateLimitedSoon: "একটু পরে আবার চেষ্টা করুন।",
  duplicateGeneric: "কিছু একটা ভুল হয়েছে। আবার চেষ্টা করুন।",
  duplicateReload: "পাতা রিফ্রেশ করুন",
  // Compare table
  duplicateCompareField: "ক্ষেত্র",
  duplicateCompareResult: "ফলাফল",
  duplicateCompareAgree: "মিলছে",
  duplicateCompareDiffer: "ভিন্ন",
  duplicateCompareUnknown: "অজানা",
  duplicateCompareReview: "পর্যালোচনা",
  duplicateFieldName: "নাম",
  // Synthetic / honest labels
  duplicateMockLabel: "[MOCK]",
  duplicateDemoBanner: "সিনথেটিক তথ্য · কর্মকর্তা যাচাই সিমুলেশন",
  // Phone-only refusal (BR-021)
  duplicatePhoneOnlyRefusal: "শুধু ফোন নম্বর মিললে ‘একই শিশু’ নিশ্চিত করা যাবে না।",
} as const;

export const officerDuplicatesEn = {
  // List page
  duplicateListPageTitle: "Possible duplicates",
  duplicateListHeading: "Flagged possible duplicates",
  duplicateListEmpty: "No flagged possible duplicates yet.",
  duplicateListIntro: "Each link pairs two same-kind reports. Review and mark them as the same child or different.",
  duplicateSeparateVisible: "separate reports remain visible",
  // Detail page
  duplicateDetailPageTitle: "Possible duplicate — review",
  duplicateDetailHeading: "Are these two reports the same child?",
  duplicateDetailIntro: "Compare every field side by side. The decision is yours — the score is never proof.",
  duplicateRuleProfile: "Profile match",
  duplicateRuleSamePhone: "Shared phone only",
  duplicateRuleSamePhoneWarn: "A shared phone number alone cannot confirm same child.",
  duplicateAlreadyResolved: "This link has already been resolved.",
  duplicateScore: "Similarity",
  // Form
  duplicateReasonLabel: "Reason (3–500 characters)",
  duplicateReasonRequired: "Enter a reason for the decision.",
  duplicateReasonLength: "Reason must be 3 to 500 characters.",
  duplicateProfileEvidenceLabel: "I have reviewed the profile evidence",
  duplicateProfileEvidenceRequired: "You must confirm you reviewed the profile evidence before deciding same child or different.",
  duplicateConfirmSame: "Same child",
  duplicateDismiss: "Different",
  duplicateSamePhoneCannotConfirm: "A shared phone alone cannot confirm same child.",
  duplicateSubmitting: "Submitting…",
  duplicateDecided: "Decision recorded.",
  duplicateBack: "Back to list",
  // Failure messages
  duplicateStale: "This link is no longer flagged. Reload the page.",
  duplicateHidden: "We couldn't find that.",
  duplicateForbidden: "You are not allowed to view this page.",
  duplicateValidation: "There is a problem with the form.",
  duplicateSession: "Your session has ended. Sign in again.",
  duplicateOffline: "No internet connection.",
  duplicateUncertain: "Uncertain reply. Please try again.",
  duplicateRateLimited: "Try again in {s} seconds.",
  duplicateRateLimitedSoon: "Try again in a moment.",
  duplicateGeneric: "Something went wrong. Please try again.",
  duplicateReload: "Reload the page",
  // Compare table
  duplicateCompareField: "Field",
  duplicateCompareResult: "Result",
  duplicateCompareAgree: "Agree",
  duplicateCompareDiffer: "Differ",
  duplicateCompareUnknown: "Unknown",
  duplicateCompareReview: "Review",
  duplicateFieldName: "Name",
  // Synthetic / honest labels
  duplicateMockLabel: "[MOCK]",
  duplicateDemoBanner: "Synthetic data · officer verification simulation",
  // Phone-only refusal (BR-021)
  duplicatePhoneOnlyRefusal: "A shared phone alone cannot confirm same child.",
} as const;
