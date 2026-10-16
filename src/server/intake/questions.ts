// Follow-up question templates and next-question selector (COMP-009, TASK-020 part 1).
// Pure library: selects one question at a time for missing mandatory fields or directs
// to manual form completion when rounds are exhausted.
// Cites D3 SCREEN-002 lines 79-88 (COMP-009), D1 BR-015, BR-023 and STORY-003 AC1/AC2.
//
// Non-negotiables:
// - Review before submit: no child payload or text stored server-side.
// - AI assists, people decide: never guess missing fields; ask or fall back to manual form.
// - At most LIMITS.followUpRounds (4) conversational questions before manual completion.
import {
  LIMITS,
  type DraftFieldPath,
  type NextQuestion,
} from "@/contracts";

export type QuestionTemplate = {
  readonly bn: string | null;
  readonly en: string | null;
};

// D3 lines 79-88 (COMP-009) follow-up question template table.
// Text is copied character-for-character from D3. Markdown enclosing quotes are
// stripped to preserve clean display copy (see OD-020-1).
// Fields without a template in the V2 spec pack get NO entry here.
export const QUESTION_TEMPLATES: Readonly<Partial<Record<DraftFieldPath, QuestionTemplate>>> = {
  // docs/spec/D3_App_Flow_V2.md:83
  "child.age_years": {
    bn: "{নাম}-এর বয়স কত?",
    en: "How old is {name}?",
  },
  // docs/spec/D3_App_Flow_V2.md:84
  "child.sex": {
    bn: "শিশুটি ছেলে না মেয়ে?",
    en: "Is the child a boy or a girl?",
  },
  // docs/spec/D3_App_Flow_V2.md:85
  "event.district_code": {
    bn: "{নাম}-কে শেষবার কোন জেলায় দেখা গিয়েছিল?",
    en: "In which district was {name} last seen?",
  },
  // docs/spec/D3_App_Flow_V2.md:86
  "event.at": {
    bn: "শেষবার কবে, কখন দেখা গিয়েছিল?",
    en: "When was {name} last seen?",
  },
  // docs/spec/D3_App_Flow_V2.md:87
  "reporter.phone": {
    bn: "আপনার মোবাইল নম্বর দিন, যাতে খবর পেলে যোগাযোগ করা যায়।",
    en: "Your mobile number, so you can be contacted.",
  },
} as const;

// Order of follow-up questions following the D3 table (lines 83-87).
// Documented in OD-020-5.
export const QUESTION_ORDER: readonly DraftFieldPath[] = [
  "child.age_years",
  "child.sex",
  "event.district_code",
  "event.at",
  "reporter.phone",
] as const;

export type NextQuestionManual = {
  readonly kind: "manual";
  readonly reason: "rounds_exhausted" | "no_template";
};

// Return shape for nextQuestion:
// Matches the contract NextQuestion schema ({ field, bn, en }) when asking a question,
// returns NextQuestionManual ({ kind: "manual", reason }) when manual completion is needed,
// or null when missing is empty.
export type NextQuestionResult =
  | NextQuestion
  | NextQuestionManual
  | null;

export type NextQuestionTagged =
  | { readonly kind: "question"; readonly field: DraftFieldPath; readonly text: { readonly bn: string; readonly en: string } }
  | NextQuestionManual
  | null;

export type NextQuestionInput = {
  readonly missing: readonly (DraftFieldPath | string)[];
  readonly round: number;
};

/**
 * Select the next follow-up question for missing draft fields, or transition to manual form.
 *
 * Rules (BR-023, D1 STORY-003):
 * 1. If `missing` is empty, return null (draft has no unresolved missing fields).
 * 2. If `round >= LIMITS.followUpRounds` (4), return { kind: "manual", reason: "rounds_exhausted" }.
 * 3. Otherwise, select the first missing field that has a template, using D3 table order.
 * 4. If none of the missing fields has a template, return { kind: "manual", reason: "no_template" }.
 * 5. Asks exactly one question per call.
 * 6. The returned question shape matches the contract `NextQuestion` schema ({ field, bn, en })
 *    so it parses with `nextQuestionSchema` without transformation (OD-020-2).
 */
export function nextQuestion({ missing, round }: NextQuestionInput): NextQuestionResult {
  if (missing.length === 0) {
    return null;
  }

  // Fail-closed guard for BR-023.
  if (!Number.isInteger(round) || round < 0 || round >= LIMITS.followUpRounds) {
    return { kind: "manual", reason: "rounds_exhausted" };
  }

  // Find the first missing field that has a valid template, using the D3 table order.
  for (const field of QUESTION_ORDER) {
    if (missing.includes(field)) {
      const template = QUESTION_TEMPLATES[field];
      if (template && template.bn !== null && template.en !== null) {
        return {
          field,
          bn: template.bn,
          en: template.en,
        };
      }
    }
  }

  // If missing fields exist but none have an available template
  return { kind: "manual", reason: "no_template" };
}

/**
 * Convert a NextQuestionResult to the tagged shape { kind: "question", field, text: { bn, en } }
 * for callers or tests that inspect the tagged union format.
 */
export function toTaggedQuestion(result: NextQuestionResult): NextQuestionTagged {
  if (result === null) {
    return null;
  }
  if ("kind" in result) {
    return result;
  }
  return {
    kind: "question",
    field: result.field,
    text: {
      bn: result.bn,
      en: result.en,
    },
  };
}

/**
 * Type guard for checking if the result is a NextQuestion object.
 */
export function isNextQuestion(result: NextQuestionResult): result is NextQuestion {
  return result !== null && "field" in result;
}

/**
 * Type guard for checking if the result is a manual fallback.
 */
export function isManualFallback(result: NextQuestionResult): result is NextQuestionManual {
  return result !== null && "kind" in result && result.kind === "manual";
}
