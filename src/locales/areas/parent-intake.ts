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
  reviewDistrictNeedSelection: "জমা দিতে একটি জেলা বাছাই করুন।",
  reviewDistrictHelpLink: "সাহায্যের জন্য ১৩২১৯-এ কল করুন",
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
  reviewEditGone: "এই রিপোর্ট আর পাওয়া যাচ্ছে না। সাহায্য লাগলে ১৩২১৯-এ কল করুন।",
  reviewEditOffline: "ইন্টারনেট সংযোগ নেই। সংযোগ ফিরলে আবার চাপুন — আপনার সংশোধন রাখা আছে।",
  reviewEditMockBlocked: "এই সংশোধন পাঠানো যাবে না — সংরক্ষিত নমুনা তথ্য।",
  reviewEditSubmitting: "সংশোধন জমা হচ্ছে…",
  reviewEditSubmitted: "সংশোধন জমা হয়েছে",
  reviewEditRetry: "আবার চেষ্টা করুন",
  reviewEditReload: "বর্তমান তথ্য আবার দেখুন",
  reviewEditRefreshing: "বর্তমান তথ্য দেখা হচ্ছে…",
  reviewEditBack: "আমার রিপোর্টে ফিরে যান",
  reviewEditDiscard: "সংশোধন বাতিল",
  reviewEditDiscardTitle: "এই সংশোধন বাতিল করবেন?",
  reviewEditDiscardBody: "সংশোধন বাতিল হলে আপনার পরিবর্তনগুলো আর রাখা হবে না।",
  reviewEditCheckLabel: "আমি যা বদলেছি তা যাচাই করেছি",
  // "Start with new details" replace dialog: shown when a fresh handoff
  // arrives but an older attempted draft is still on the device. The user
  // must confirm before the older draft is replaced.
  replaceTitle: "নতুন তথ্য দিয়ে শুরু করবেন?",
  replaceBody: "আগের খসড়া মুছে নতুন তথ্য দিয়ে শুরু হবে।",
  replaceYes: "নতুন দিয়ে শুরু করুন",
  replaceNo: "আগেরটি রাখুন",
  // Cached draft clock notice (S-002 / S-003 / S-005, BR-026, COMP-048). The
  // three prepared cached drafts (Mitu, Rafi, Mim) use fixed `event.at`
  // values while the source text contains relative words like "গতকাল" /
  // "আজ সকালে". The dates are NOT recalculated from today, so a parent
  // reviewing a cached draft must check or correct the date before
  // submitting. The D4 cached badge ("ক্যাশ · পূর্বপ্রস্তুত সিনথেটিক
  // উদাহরণ") is shown unchanged; this notice sits next to it on the same
  // surface and only renders when the draft was retained from the cache.
  // Pending human Bangla review (OD-021-3) — the wording below is the
  // responsible-disclosure copy the safeguarding pass asked for.
  cachedClockTitle: "ক্যাশ খসড়ার সময় স্থির আছে", // new; needs human Bangla review
  cachedClockBody: "এই খসড়াটি ক্যাশ থেকে এসেছে। কথায় \"গতকাল\" বা \"আজ সকালে\" থাকলেও তারিখ ও সময় আজকের হিসেবে বদলায়নি — পূর্বপ্রস্তুত ডেমো উদাহরণের জন্য নির্দিষ্ট রাখা আছে।", // new; needs human Bangla review
  cachedClockReviewPrompt: "জমা দেওয়ার আগে তারিখ ও সময় যাচাই করে ঠিক করে দিন।", // new; needs human Bangla review
  cachedClockPendingReview: "এই লেখাটি এখনো কোনো বাংলাভাষী ব্যক্তি যাচাই করেননি।", // new; needs human Bangla review
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
  reviewEditDiscardTitle: "Cancel this correction?",
  reviewEditDiscardBody: "Cancelling will discard the changes you just made on this device.",
  reviewEditCheckLabel: "I have reviewed my changes",
  // "Start with new details" replace dialog: shown when a fresh handoff
  // arrives but an older attempted draft is still on the device.
  replaceTitle: "Start with new details?",
  replaceBody: "The earlier draft will be replaced by the new details.",
  replaceYes: "Start with new",
  replaceNo: "Keep earlier draft",
  // Cached draft clock notice (S-002 / S-003 / S-005, BR-026, COMP-048). The
  // three prepared cached drafts (Mitu, Rafi, Mim) use fixed `event.at`
  // values while the source text contains relative words like "yesterday"
  // and "this morning". The dates are NOT recalculated from today, so the
  // reporter must check or correct the date before submitting. The D4
  // cached badge is shown unchanged; this notice sits next to it and only
  // renders when the draft was retained from the cache.
  cachedClockTitle: "Cached draft keeps a fixed date",
  cachedClockBody: "This draft came from the cache. Even when the words say \"yesterday\" or \"this morning\", the date and time were not recalculated from today — they are fixed for the scripted demo scenario.",
  cachedClockReviewPrompt: "Review and correct the date and time before you submit.",
  cachedClockPendingReview: "Human Bangla review of this copy is still pending.",
} as const;
