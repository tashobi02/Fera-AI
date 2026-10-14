// Scoped submission idempotency (FR-031, D2A API-003/007, TC-042). The key is the
// principal scope plus the client UUID; the canonical reviewed-payload hash decides
// replay versus conflict.
//
// - Hash the *parsed* (post-transform) draft: Bangla digits, blank text, exact ages,
//   time offsets and district_text are already normalised, so equivalent
//   submissions hash equally.
// - A unique-violation (23505) on (scope, client_submission_id) during insert is a
//   race with the same key: re-read the row and classify again.
import { createHash } from "node:crypto";
import type { FoundSubmissionDraft, MissingSubmissionDraft } from "../draft";
import { sameId, sha256HexSchema } from "../primitives";
import { effectiveRole, type Principal } from "./principal";

export type SubmissionScope =
  | { principal: "parent_session"; sessionId: string }
  | { principal: "user"; userId: string };

export type SubmissionKey = { scope: SubmissionScope; clientSubmissionId: string };

// Parents submit missing reports under their session; staff and officers submit found
// reports under their user. Admins and inactive accounts have no submission scope.
export function submissionScopeFor(p: Principal | null): SubmissionScope | null {
  const role = effectiveRole(p);
  if (role === "parent" && p?.kind === "parent") return { principal: "parent_session", sessionId: p.sessionId };
  if ((role === "staff" || role === "officer") && p?.kind === "user") return { principal: "user", userId: p.userId };
  return null;
}

function sameScope(a: SubmissionScope, b: SubmissionScope): boolean {
  if (a.principal === "parent_session" && b.principal === "parent_session") return sameId(a.sessionId, b.sessionId);
  if (a.principal === "user" && b.principal === "user") return sameId(a.userId, b.userId);
  return false;
}

export type ExistingSubmission = SubmissionKey & { caseId: string; payloadHash: string };

export type SubmissionOutcome =
  | { kind: "create" } // new UUID in this scope: a new report, even with an identical payload
  | { kind: "replay"; caseId: string } // same UUID + same hash: 200 with the same ref, replayed: true
  | { kind: "conflict" }; // same UUID + different hash: E-006, no second report

// Throws on a malformed hash or an `existing` row from a different key (a lookup bug).
export function classifySubmission(
  requested: SubmissionKey,
  existing: ExistingSubmission | null,
  incomingHash: string,
): SubmissionOutcome {
  sha256HexSchema.parse(incomingHash);
  if (!existing) return { kind: "create" };
  sha256HexSchema.parse(existing.payloadHash);
  if (!sameScope(requested.scope, existing.scope) || !sameId(requested.clientSubmissionId, existing.clientSubmissionId)) {
    throw new Error("existing submission does not belong to the requested key");
  }
  return existing.payloadHash === incomingHash ? { kind: "replay", caseId: existing.caseId } : { kind: "conflict" };
}

// Canonical JSON: sorted keys, no whitespace, undefined object members dropped (as
// JSON.stringify does). Throws on anything JSON cannot represent exactly.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite number is not canonical JSON");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value
      .map((v) => {
        if (v === undefined) throw new Error("undefined array element is not canonical JSON");
        return canonicalJson(v);
      })
      .join(",")}]`;
  }
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  throw new Error(`${typeof value} is not canonical JSON`);
}

// SHA-256 of the canonical *parsed* draft (output of the submission schemas only).
// district_text is excluded (no column, CN-06).
export function submissionPayloadHash(parsedDraft: MissingSubmissionDraft | FoundSubmissionDraft): string {
  const event = Object.fromEntries(Object.entries(parsedDraft.event).filter(([k]) => k !== "district_text"));
  return createHash("sha256").update(canonicalJson({ ...parsedDraft, event }), "utf8").digest("hex");
}
