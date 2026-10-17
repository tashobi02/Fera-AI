// TASK-018 duplicate detector (COMP-013, FR-022/FR-023, BR-021). Owner: Masnun.
// Public surface for the duplicate detector module.
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
