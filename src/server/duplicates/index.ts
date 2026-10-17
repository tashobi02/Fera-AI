// COMP-013 duplicate detector (TASK-018). Detection only; see detect.ts.
export { DUPLICATE_PARAMS, TERMINAL_STATUSES, assessPair, detectDuplicates, listLinksFor } from "./detect";
export type { CaseProfile, DuplicateCue, DuplicateCueCode, DuplicateLink, PairAssessment, RejectReason } from "./detect";
export { duplicateBannerFor } from "./banner";
export type { BannerLink, DuplicateBanner } from "./banner";
