// S-001 welcome and S-002 intake copy (TASK-021). Bangla parent default per FR-033.
// Strings move here from src/locales/index.ts so waves can edit this file without
// touching the shared locales root (PHASE_3_PLAN.md §5).
export const parentIntakeBn = {
  // District select on the review screen (TASK-024 / S-003 / SCREEN-003).
  // The empty placeholder is first; the 64 district options are named in the
  // local script (Bangla in bn, English in en) so the select stays a real
  // select rather than a code-typed input. The code in parentheses is the
  // Fera-internal number, kept visible so a parent can confirm the choice
  // when the name is ambiguous.
  reviewDistrictOptionUnknown: "জেলা বাছাই করুন",
  reviewDistrictOptionLabel: "{name} ({code})",
  reviewDistrictNeedSelection: "জেলা বাছাই করা জরুরি।",
  reviewDistrictHelpLink: "সহায়তার জন্য ১৩২১৯-এ কল করুন",
  // Success link copy: the device-local copy used to just go back to the
  // intake conversation; now it points at the submitted report page.
  reviewOpenReport: "জমা দেওয়া রিপোর্ট দেখুন",
} as const;

export const parentIntakeEn = {
  reviewDistrictOptionUnknown: "Choose a district",
  reviewDistrictOptionLabel: "{name} ({code})",
  reviewDistrictNeedSelection: "Choose a district to submit.",
  reviewDistrictHelpLink: "Call 13219 for help",
  reviewOpenReport: "Open the submitted report",
} as const;
