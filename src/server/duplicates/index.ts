// TASK-018 duplicate detector + persister (COMP-013, FR-022/FR-023, BR-021). Owner: Masnun.
// Public surface for the duplicate detector and the detect-and-persist service.
// The persister is the write half; the matcher orchestrator calls it AFTER a
// submitted case has been confirmed and embedded.
export {
  CANDIDATE_LIMIT,
  DUPLICATE_CONFIG,
  SIMILARITY_THRESHOLD,
  agesAgree,
  computeAgreement,
  countAgreeingProfileFields,
  decideDuplicateRule,
  detectDuplicates,
  districtsAgree,
  namesAgree,
  phonesAgree,
  profilesContradict,
  sexesAgree,
  timesAgree,
  type DuplicateFlag,
  type FieldAgreement,
  type SimilarCase,
  type SourceCase,
} from "./detect";
export {
  PERSIST_HOOK,
  persistDuplicateFlags,
  wasInserted,
  type PersistContext,
  type PersistHook,
  type PersistResult,
} from "./persist";
