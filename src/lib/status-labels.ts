// COMP-033 status badge and matching-line copy keys (D3 SCREEN-004/006, D4 §10/§15.1).
// Shared by server components; no runtime dependencies beyond the locale key type.
import type { MatchingState, StatusGroup } from "@/contracts";
import type { MessageKey } from "@/locales";

// D3 SCREEN-006 status labels: খোলা / যাচাই চলছে / বন্ধ.
export const STATUS_KEY: Record<StatusGroup, MessageKey> = {
  open: "statusGroupOpen",
  matched: "statusGroupMatched",
  closed: "statusGroupClosed",
};

// D4 §10: never promise an outcome ("মিল খোঁজা হবে"); D4 §15.1 matching failure.
export const MATCHING_KEY: Record<MatchingState, MessageKey> = {
  queued: "matchingWillCheck",
  running: "matchingRunning",
  complete: "matchingChecked",
  failed: "matchingFailed",
};
