// S-006 status and edit copy. Bangla parent default per FR-033.
// Strings move here from src/locales/index.ts so waves can edit this file without
// touching the shared locales root (PHASE_3_PLAN.md §5).
//
// P3-102/P3-103/P3-104 (TASK-049/050): SCREEN-006 status page and the "তথ্য সংশোধন" /
// "Correct details" lane. Submitted/open → Open ("খোলা"), pending/confirmed → Being
// checked ("যাচাই চলছে"), closed → Closed ("বন্ধ"); no closure reason. The referred
// follow uses the canonical "খোলা" group (the StatusGroup enum is shared with
// SCREEN-004). Strings are the D3 copy where it exists, otherwise new (OD-022-13
// human Bangla review pattern).
export const parentStatusBn = {
  // S-006 page (TASK-050, P3-103). D3 §3 row 144: title is in reportTitle's locale
  // field — we keep the same SCREEN-004 title so the parent sees the same
  // reference card.
  statusTitle: "আমার রিপোর্টের অবস্থা",
  statusEmpty: "এই ফোনে কোনো রিপোর্ট নেই",
  statusEmptyAction: "নতুন রিপোর্ট শুরু করুন",
  statusListHeading: "আপনার রিপোর্ট",
  statusListLabel: "এই ফোনে জমা দেওয়া রিপোর্টগুলো",
  statusUpdatedAt: "সর্বশেষ হালনাগাদ: {t}",
  // The D3 copy for the success notice of the parent correction lane.
  statusCorrectionSubmitted: "সংশোধন জমা হয়েছে",
  // Edit-lane copy. D3 §3 row 142: ACT-017 "তথ্য সংশোধন" / "Correct details".
  statusEditAction: "তথ্য সংশোধন",
  statusEditBlocked: "এই রিপোর্টে এখন আর সংশোধন করা যাবে না",
  statusEditLoading: "আপনার রিপোর্টের তথ্য প্রস্তুত হচ্ছে…",
  statusEditFailed: "এই রিপোর্টে এখন সংশোধন করা যাবে না। সাহায্য লাগলে ১৩২১৯-এ কল করুন।",
  // The "no reports on this phone" empty state is its own label, also used on the
  // status page.
  statusNoReports: "এই ফোনে কোনো রিপোর্ট নেই",
  // When the parent returns after redaction, the row stays; copy keeps neutral
  // honest tone (BR-024).
  statusRedacted: "এই রিপোর্টের পরিচয় তথ্য আগেই অপসারণ করা হয়েছে।",
  // E-018 from API-005 — copy for an already-terminal case where the route still
  // returns 200 with editable: false. (No closure reason in our copy; SPEC D3 §3.)
  statusLockedTitle: "এই রিপোর্টে আর সংশোধন করা যাবে না",
  statusLockedNote: "মিল নিশ্চিত হওয়ার পর কেস বদলানো যায় না।", // D3:338
  // Used when the local edit-mode record no longer matches the server's view
  // (E-005 stale version, E-019, or a different device). The page just stops and
  // tells the parent the page should be reloaded.
  statusStale: "এই রিপোর্টের অবস্থা বদলে গেছে। পাতাটি নতুন করে লোড করুন।",
  // E-019 (session expired) and E-004 (case not found or not yours) — distinct copy.
  statusForbidden: "এই রিপোর্ট আপনার জন্য নয়।",
  statusUncertain: "সংশোধন সংরক্ষিত হয়েছে কি না নিশ্চিত নয়। আবার চাপার আগে পাতাটি নতুন করে লোড করুন।",
  statusErrorGeneric: "কিছু একটা ভুল হয়েছে। পাতাটি নতুন করে লোড করুন।",
  // SCREEN-006 D3 row 144 says the success copy is "সংশোধন জমা হয়েছে"; we expose
  // the same key the success region uses.
  statusEditedAt: "শেষ সংশোধন: {t}",
  // Open report (start a new report) on the empty state and the "back to status" link.
  statusOpenIntake: "নতুন রিপোর্ট শুরু করুন",
  // Server-side error: case hidden or redacted; copy mirrors outputsLocked.
  statusGone: "এই রিপোর্ট আর পাওয়া যাচ্ছে না। সাহায্য লাগলে ১৩২১৯-এ কল করুন।",
  // "View report" link from the status list row.
  statusViewReport: "রিপোর্ট দেখুন",
  // Edit-mode device-local: the parent tapped "Correct details" and the page is
  // waiting on the new draft. The next route is S-003 (intake/review), with the
  // server's existing draft pre-filled; we hand off a thin pointer.
  statusEditPreparing: "পরিবর্তনের জন্য আপনার রিপোর্ট প্রস্তুত হচ্ছে…",
  statusEditCancel: "সংশোধন বাতিল",
  // SCREEN-006 server-failure boundary: shown when listMyCases rejects (DB
  // outage, auth, etc.). We never replace a successful empty list with this
  // copy; it only appears on a thrown failure (the page catches and renders
  // it). The retry button reloads the page; "synthetic" stays in the
  // label per the demo-mode policy.
  statusListErrorTitle: "রিপোর্টের তালিকা এখন দেখানো যাচ্ছে না",
  statusListErrorBody: "আবার চেষ্টা করুন। সাহায্য লাগলে ১৩২১৯-এ কল করুন।",
  statusListErrorRetry: "আবার চেষ্টা করুন",
  statusListErrorSynthetic: "[MOCK] সিনথেটিক — সার্ভার থেকে তালিকা আসেনি",
} as const;

export const parentStatusEn = {
  statusTitle: "Status of your reports",
  statusEmpty: "No reports on this phone",
  statusEmptyAction: "Start a new report",
  statusListHeading: "Your reports",
  statusListLabel: "Reports submitted on this phone",
  statusUpdatedAt: "Last updated: {t}",
  statusCorrectionSubmitted: "Correction submitted",
  statusEditAction: "Correct details",
  statusEditBlocked: "This report can no longer be edited",
  statusEditLoading: "Preparing your report's details…",
  statusEditFailed: "This report can't be edited right now. Call 13219 if you need help.",
  statusNoReports: "No reports on this phone",
  statusRedacted: "The identifying details for this report have already been removed.",
  statusLockedTitle: "This report can no longer be edited",
  statusLockedNote: "Can't edit after a match is confirmed.",
  statusStale: "This report's status has changed. Reload the page.",
  statusForbidden: "This report is not available to you.",
  statusUncertain: "We can't confirm the correction was stored. Reload before pressing again.",
  statusErrorGeneric: "Something went wrong. Reload the page.",
  statusEditedAt: "Last correction: {t}",
  statusOpenIntake: "Start a new report",
  statusGone: "This report is no longer available. Call 13219 if you need help.",
  statusViewReport: "View report",
  statusEditPreparing: "Preparing your report for editing…",
  statusEditCancel: "Cancel correction",
  // SCREEN-006 server-failure boundary. Bilingual retry copy and a
  // "[MOCK] synthetic" honest label so a parent (or a reviewer) can tell the
  // boundary fired, not a successful empty list.
  statusListErrorTitle: "The report list isn't available right now",
  statusListErrorBody: "Try again. Call 13219 if you need help.",
  statusListErrorRetry: "Try again",
  statusListErrorSynthetic: "[MOCK] synthetic — list did not come from the server",
} as const;
