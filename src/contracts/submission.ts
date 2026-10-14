// Scoped submission idempotency (FR-031, D2A API-003/007, TC-042). The key is the
// principal plus client UUID; the canonical reviewed-payload hash decides replay.
export type SubmissionScope =
  | { principal: "parent_session"; sessionId: string }
  | { principal: "user"; userId: string };

export type SubmissionKey = { scope: SubmissionScope; clientSubmissionId: string };

export type SubmissionOutcome =
  | { kind: "create" } // new UUID in this scope: a new report, even with an identical payload
  | { kind: "replay"; caseId: string } // same UUID + same hash: 200 with the same ref, replayed: true
  | { kind: "conflict" }; // same UUID + different hash: E-006, no second report

export function classifySubmission(
  existing: { caseId: string; payloadHash: string } | null,
  incomingHash: string,
): SubmissionOutcome {
  if (!existing) return { kind: "create" };
  return existing.payloadHash === incomingHash ? { kind: "replay", caseId: existing.caseId } : { kind: "conflict" };
}
