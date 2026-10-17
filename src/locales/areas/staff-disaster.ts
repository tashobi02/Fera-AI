// S-015 disaster mode copy (TASK-052, FR-036, TC-035). Bangla parent default per FR-033.
// Strings move here from src/locales/index.ts so waves can edit this file without
// touching the shared locales root (PHASE_3_PLAN.md §5).
//
// The disaster mode page is a planned extension (D3 SCREEN-015 banner). It reuses the
// S-007 found-log form, so it does not need its own field labels. Copy here is the
// banner, the honest note, the planned label, the page title and the document title.
export const staffDisasterBn = {
  staffDisasterTitle: "দুর্যোগকালীন মোড", // needs human Bangla review
  staffDisasterPlannedLabel: "পরিকল্পিত সম্প্রসারণ", // D3 SCREEN-015 banner; needs human Bangla review
  staffDisasterPlannedSubtitle: "বন্যা ও ঘূর্ণিঝড়ের আশ্রয়কেন্দ্র", // D3 SCREEN-015; needs human Bangla review
  staffDisasterIntro:
    "এই মোড এখনো চালু হয়নি। শুধু প্রদর্শনের জন্য: নিচের ফর্মটি একটি নমুনা, আর এখন এটি সাধারণ খুঁজে পাওয়া শিশুর তথ্যের মতোই সংরক্ষণ করে।", // needs human Bangla review
  staffDisasterSyntheticNote: "সিনথেটিক তথ্য। কোনো আসল শিশুর তথ্য দেবেন না।", // needs human Bangla review
  staffDisasterPageTitle: "দুর্যোগকালীন মোড (পরিকল্পিত)", // needs human Bangla review
} as const;

export const staffDisasterEn = {
  staffDisasterTitle: "Disaster mode",
  staffDisasterPlannedLabel: "Planned expansion",
  staffDisasterPlannedSubtitle: "Flood and cyclone shelters",
  staffDisasterIntro:
    "This mode is not live yet. For demonstration only: the form below is a prototype and currently saves a found-child report the same way as the normal log.",
  staffDisasterSyntheticNote: "Synthetic data. Do not enter a real child's details.",
  staffDisasterPageTitle: "Disaster mode (planned)",
} as const;