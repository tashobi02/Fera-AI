// Follow-up round counter and decision wrapper (TASK-020, FR-005/026, BR-015/023, TC-003/017/043).
//
// The follow-up round counter is the only authoritative counter for "how many
// questions has the parent answered?". It is held on the draft row, NOT in the
// signed token (D2A §9.4: opaque token counter is never authority). It increments
// atomically whenever the orchestrator issues a question, including a protected
// exact-source cache hit; answers, complete drafts, and manual fallback do not
// increment it. This matches the user-delegated decision on 18 Oct.
//
// The threshold for the unresolvable handoff to SCREEN-005 is four distinct
// required fields remaining missing after the four follow-up rounds (manual form
// path; never guess). The threshold for the rounds_exhausted selector is
// LIMITS.followUpRounds (4), which is the contract-level limit, not the unresolvable
// rule. The two are independent: rounds_exhausted happens at round 4, the manual
// form handoff at 4 unresolved required fields.
import { LIMITS, type CaseDraft, type DraftFieldPath, type NextQuestion } from "@/contracts";
import { isManualFallback, nextQuestion, type NextQuestionResult, type NextQuestionTagged } from "./questions";
import { UNRESOLVABLE_THRESHOLD, type OrchestrationDecision } from "./runtime";

// Required submission fields from BR-015/016. `child.sex=unknown` is an allowed
// explicit selection and `child.name` is optional. A found-child description is
// represented as event.circumstances in the selector; the actual submission
// validator accepts any description of at least three characters across clothing,
// marks, and circumstances.
const REQUIRED_FIELDS_MISSING: readonly DraftFieldPath[] = Object.freeze([
  "child.age_years",
  "event.district_code",
  "event.place_text",
  "event.at",
  "reporter.phone",
]);

const REQUIRED_FIELDS_FOUND: readonly DraftFieldPath[] = Object.freeze([
  "event.circumstances",
  "event.district_code",
  "event.place_text",
  "event.at",
  "reporter.phone",
]);

export function requiredFieldsFor(kind: CaseDraft["kind"]): readonly DraftFieldPath[] {
  return kind === "missing" ? REQUIRED_FIELDS_MISSING : REQUIRED_FIELDS_FOUND;
}

export function isFieldMissing(draft: CaseDraft, path: DraftFieldPath): boolean {
  switch (path) {
    case "child.name":
      return draft.child.name === null;
    case "child.name_latin":
      return draft.child.name_latin === null;
    case "child.age_years":
      return draft.child.age_years === null && (draft.child.age_min === null || draft.child.age_max === null);
    case "child.sex":
      // BR-015 permits the explicit `unknown` value; never guess or re-ask it.
      return false;
    case "event.district_code":
      return draft.event.district_code === null;
    case "event.at":
      return draft.event.at === null || draft.event.at_lower === null || draft.event.at_upper === null;
    case "reporter.phone":
      return draft.reporter.phone === null;
    case "event.circumstances":
      return draft.kind === "found"
        ? Array.from([draft.child.clothing, draft.child.marks, draft.event.circumstances]
          .filter((value): value is string => value !== null)
          .join(" ").trim()).length < 3
        : draft.event.circumstances === null;
    case "event.place_text":
      return draft.event.place_text === null;
    case "child.clothing":
      return draft.child.clothing === null;
    case "child.marks":
      return draft.child.marks === null;
    case "child.height_cm":
      return draft.child.height_cm === null;
    case "reporter.relation":
      return draft.reporter.relation === null;
    default:
      return false;
  }
}

export function missingFieldsFor(draft: CaseDraft): readonly DraftFieldPath[] {
  const out: DraftFieldPath[] = [];
  for (const path of requiredFieldsFor(draft.kind)) if (isFieldMissing(draft, path)) out.push(path);
  return out;
}

// Maps the contract selector to the orchestrator's tagged decision. Every returned
// question is accounted for by the caller, whether it came from a provider or the
// protected exact-source cache.
export function orchestrationFromSelector(
  result: NextQuestionResult,
  followUpRound: number,
  missing: readonly DraftFieldPath[],
): OrchestrationDecision {
  if (result === null) return { kind: "complete" };
  if (isManualFallback(result)) {
    if (missing.length >= UNRESOLVABLE_THRESHOLD) {
      return { kind: "manual", reason: "unresolvable" };
    }
    return { kind: "manual", reason: result.reason };
  }
  if (followUpRound >= LIMITS.followUpRounds) {
    return { kind: "manual", reason: "rounds_exhausted" };
  }
  return { kind: "question", question: { field: result.field, bn: result.bn, en: result.en } };
}

// Question selection does not depend on whether extraction was paid or cached.
export type OrchestratorInput = {
  draft: CaseDraft;
  followUpRound: number;
};

export function decideNext(input: OrchestratorInput): OrchestrationDecision {
  const missing = missingFieldsFor(input.draft);
  if (missing.length === 0) return { kind: "complete" };
  const result = nextQuestion({ missing, round: input.followUpRound });
  return orchestrationFromSelector(result, input.followUpRound, missing);
}

// Increment the orchestrator's round counter only when a question is issued.
export function shouldAdvanceRound(decision: OrchestrationDecision): boolean {
  return decision.kind === "question";
}

// Compiles a "tagged question" the route can serialise. The contract shape and the
// internal tagged shape stay strictly equal so tests can compare them with toEqual.
export type TaggedOrchestrationDecision =
  | { readonly kind: "question"; readonly field: DraftFieldPath; readonly text: { readonly bn: string; readonly en: string } }
  | { readonly kind: "manual"; readonly reason: Extract<OrchestrationDecision, { readonly kind: "manual" }>['reason'] }
  | null;

export function toTaggedDecision(decision: OrchestrationDecision): TaggedOrchestrationDecision {
  if (decision.kind === "complete") return null;
  if (decision.kind === "manual") return decision;
  return { kind: "question", field: decision.question.field, text: { bn: decision.question.bn, en: decision.question.en } };
}

// Public NextQuestion contract: the exact contract shape the route returns.
export function asContractQuestion(decision: OrchestrationDecision): NextQuestion | null {
  return decision.kind === "question" ? decision.question : null;
}
