// S-005 manual form copy (TASK-025, P3-013). Bangla parent default per FR-033.
// Strings live here so the wave can edit them without touching the shared
// locales root (PHASE_3_PLAN.md §5). Exact D3 wording where it exists: the
// intro, the synthetic badge and the local-only notice are reused from S-003
// (reviewEmpty / reviewLocal / syntheticBadge / reviewStorageFailed /
// reviewStorageUnreadable / reviewClearFailed / reviewCorruptAttempted) so the
// surfaces stay identical.
export const parentFormBn = {
  // D3 SCREEN-005 (rows 121–133): title, intro and the local-only notice come
  // straight from the catalogue. The intro names what Fera does and does not do
  // (synthetic only, no photo).
  manualFormTitle: "নিজে ফর্মে লিখুন", // D3:121, ACT-014 entry
  manualFormIntro: "এখানে যা জানেন লিখুন। জানা না থাকলে ঘর ফাঁকা রাখুন — ফেরা আন্দাজ করবে না।", // D3 SCREEN-005
} as const;

export const parentFormEn = {
  manualFormTitle: "Fill the form yourself", // D3:121, ACT-014 entry
  manualFormIntro: "Fill in what you know. Leave fields empty if you don't know — Fera will not guess.", // D3 SCREEN-005
} as const;
