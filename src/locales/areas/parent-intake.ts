// S-001 welcome and S-002/S-003 intake copy (TASK-021; P3-035/ACT017). Bangla
// parent default per FR-033. Strings move here from src/locales/index.ts so
// waves can edit this file without touching the shared locales root
// (PHASE_3_PLAN.md §5).
export const parentIntakeBn = {
  // District select on the review screen (TASK-024 / S-003 / SCREEN-003).
  // The empty placeholder is first; the 64 district options are named in the
  // local script (Bangla in bn, English in en) so the select stays a real
  // select rather than a code-typed input. The code in parentheses is the
  // Fera-internal number, kept visible so a parent can confirm the choice
  // when the name is ambiguous.
  reviewDistrictOptionUnknown: "জেলা বাছাই করুন",
  reviewDistrictOptionLabel: "{name} ({code})",
  reviewDistrictSearch: "জেলা খুঁজুন — বাংলা, ইংরেজি বা অন্য নাম",
  reviewDistrictNoResults: "কোনো জেলা মেলেনি। অন্য বানান লিখুন।",
  reviewDistrictResults: "{count}টি জেলা মিলেছে।",
  reviewDistrictNeedSelection: "জেলা বাছাই করা জরুরি।",
  reviewDistrictHelpLink: "সহায়তার জন্য ১৩২১৯-এ কল করুন",
  // Success link copy: the device-local copy used to just go back to the
  // intake conversation; now it points at the submitted report page.
  reviewOpenReport: "জমা দেওয়া রিপোর্ট দেখুন",
  // P3-021 link replacement: the unbuilt S-005 form used to render as a
  // planned-only label on S-003. The form now exists, so this is a real link
  // to /intake/form with no child payload in the URL.
  reviewManualLink: "নিজে পূরণ করার ফর্মে যান",
  // ACT017 (P3-035/ACT017): edit-mode copy on S-003. The "Correct details" lane
  // hydrates API-004 into a device-local review draft before PATCHing API-005.
  // None of this is a success path: review + confirm + PATCH is the only flow.
  reviewEditTitle: "তথ্য সংশোধন",
  reviewEditIntro: "আপনার রিপোর্টের তথ্য সংশোধন করুন। যা বদলাতে চান তা ঠিক করে নিচের চেকবক্সে চাপ দিন।",
  reviewEditLoading: "আপনার রিপোর্টের তথ্য প্রস্তুত হচ্ছে…",
  reviewEditEmpty: "এই রিপোর্টে এখন সংশোধন করা যাবে না।",
  reviewEditLocked: "এই রিপোর্টে আর সংশোধন করা যাবে না",
  reviewEditLockedNote: "মিল নিশ্চিত হওয়ার পর কেস বদলানো যায় না।",
  reviewEditStale: "এই রিপোর্টের অবস্থা বদলে গেছে। পাতাটি নতুন করে লোড করুন।",
  reviewEditConflict: "এই রিপোর্টের তথ্য বদলেছে। যাচাই করে আবার জমা দিন।",
  reviewEditForbidden: "এই রিপোর্ট আপনার জন্য নয়।",
  reviewEditGone: "এই রিপোর্ট আর পাওয়া যাচ্ছে না। সাহায়তা লাগলে ১৩২১৯-এ কল করুন।",
  reviewEditOffline: "ইন্টারনেট সংযোগ নেই। সংযোগ ফিরলে আবার চাপুন — আপনার সংশোধন রাখা আছে।",
  reviewEditMockBlocked: "এই সংশোধন পাঠানো যাবে না — সংরক্ষিত নকল তথ্য।",
  reviewEditSubmitting: "সংশোধন জমা হচ্ছে…",
  reviewEditSubmitted: "সংশোধন জমা হয়েছে",
  reviewEditRetry: "আবার চেষ্টা করুন",
  reviewEditReload: "বর্তমান তথ্য আবার দেখুন",
  reviewEditRefreshing: "বর্তমান তথ্য দেখা হচ্ছে…",
  reviewEditBack: "আমার রিপোর্টে ফিরে যান",
  reviewEditDiscard: "সংশোধন বাতিল",
  reviewEditCheckLabel: "আমি যা বদলেছি তা যাচাই করেছি",
} as const;

export const parentIntakeEn = {
  reviewDistrictOptionUnknown: "Choose a district",
  reviewDistrictOptionLabel: "{name} ({code})",
  reviewDistrictSearch: "Search districts by Bangla, English, or alternate name",
  reviewDistrictNoResults: "No district matches. Try another spelling.",
  reviewDistrictResults: "{count} districts match.",
  reviewDistrictNeedSelection: "Choose a district to submit.",
  reviewDistrictHelpLink: "Call 13219 for help",
  reviewOpenReport: "Open the submitted report",
  reviewManualLink: "Open the manual form",
  // ACT017 (P3-035/ACT017): edit-mode copy on S-003.
  reviewEditTitle: "Correct details",
  reviewEditIntro: "Edit the details of your report. Update what changed, then confirm below.",
  reviewEditLoading: "Preparing your report's details…",
  reviewEditEmpty: "This report can no longer be edited.",
  reviewEditLocked: "This report can no longer be edited",
  reviewEditLockedNote: "Can't edit after a match is confirmed.",
  reviewEditStale: "This report's status has changed. Reload the page.",
  reviewEditConflict: "This report's details changed. Review and try again.",
  reviewEditForbidden: "This report is not available to you.",
  reviewEditGone: "This report is no longer available. Call 13219 if you need help.",
  reviewEditOffline: "No internet connection. Press again when you're back — your correction is kept.",
  reviewEditMockBlocked: "This correction can't be sent — the saved details are a sample.",
  reviewEditSubmitting: "Submitting correction…",
  reviewEditSubmitted: "Correction submitted",
  reviewEditRetry: "Try again",
  reviewEditReload: "Reload current details",
  reviewEditRefreshing: "Reloading current details…",
  reviewEditBack: "Back to my reports",
  reviewEditDiscard: "Cancel correction",
  reviewEditCheckLabel: "I have reviewed my changes",
} as const;
