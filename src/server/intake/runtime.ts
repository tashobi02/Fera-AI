// Intake runtime helpers (TASK-014/020/033, FR-002/003/004/005/027/032, TC-002/003/043/060/061).
//
// This file is the seam between the route handlers and the spend / auth / cache
// machinery. The actual draft row state, follow-up question selector and the
// provider dispatch wrapper are kept in their own modules so the runtime here is a
// pure orchestration layer.
import { createHash } from "node:crypto";
import { LIMITS, draftTokenSchema, errorEnvelope, toDhakaIso, type CaseDraft, type DraftFieldPath, type ErrorEnvelope, type NextQuestion, type ServerErrorId } from "@/contracts";
import { runPaidCall, type PaidCallResult, type SpendContext } from "@/server/spend";
import type { Principal } from "@/contracts/server";

export type ProviderNoticeError = "E-021" | "E-003";

// D2A §9.4 and BR-004: the reporter acknowledges the versioned notice explicitly
// before any intake provider dispatch. This is a fixed version marker, not a
// server-minted nonce or a draft token.
export const PROVIDER_NOTICE_HEADER = "x-fera-provider-notice";
export const PROVIDER_NOTICE_VERSION = "v1";

// Reject any dispatch that lacks the explicit versioned acknowledgment.
export class ProviderNoticeMissingError extends Error {
  constructor() {
    super("provider notice missing");
    this.name = "ProviderNoticeMissingError";
  }
}

export function assertProviderNotice(headers: Headers): void {
  const got = headers.get(PROVIDER_NOTICE_HEADER);
  if (got !== PROVIDER_NOTICE_VERSION) throw new ProviderNoticeMissingError();
}

// Follow-up round counter (TASK-020). The counter is a smallint 0..4 on the draft row;
// it is NOT authoritative from the signed token (D2A §9.4: opaque token counter is
// never authority). The follow-up round increments atomically whenever the
// orchestrator issues a question, including an exact-source cache hit; answers and
// already-satisfied flows do not increment it.
export const FOLLOW_UP_ROUNDS_MAX = LIMITS.followUpRounds; // 4

// The orchestrator's compiled answer to "what next?": a question, a manual-fallback
// decision, or "nothing missing" (null). Mirrors nextQuestion()'s return shape and
// stays strict to the contract NextQuestion schema.
export type OrchestrationDecision =
  | { readonly kind: "question"; readonly question: NextQuestion }
  | { readonly kind: "manual"; readonly reason: "rounds_exhausted" | "no_template" | "unresolvable" }
  | { readonly kind: "complete" };

// "unresolvable" is a server-side decision separate from the contract selector:
// when ≥ 4 distinct required fields stay missing across 4 rounds, the draft is
// unresolvable through automation, never the parent's failure.
export const UNRESOLVABLE_THRESHOLD = 4;

// Result of running a paid call through runPaidCall, normalised so the route can
// serialise an error envelope without leaking provider details.
export type DispatchResult<T> =
  | { readonly ok: true; readonly value: T; readonly settlement: "settled" | "retained" | "unsettled" }
  | { readonly ok: false; readonly error: ErrorEnvelope; readonly spent: boolean };

// Map a typed dispatch error to the same envelope the route would build.
export function dispatchResultFromPaid<T>(result: PaidCallResult<T>): DispatchResult<T> {
  return { ok: true, value: result.value, settlement: result.settlement };
}

export function dispatchError(errorId: ServerErrorId): DispatchResult<never> {
  return { ok: false, error: errorEnvelope(errorId), spent: true };
}

export function dispatchResultFromError<T>(err: unknown, spent = true): DispatchResult<T> {
  if (err && typeof err === "object" && "id" in err) {
    const id = (err as { id?: ServerErrorId }).id;
    if (typeof id === "string") return { ok: false, error: errorEnvelope(id as ServerErrorId), spent };
  }
  return { ok: false, error: errorEnvelope("E-021"), spent };
}

// Provider notice acknowledgment is carried on the incoming request. It cannot
// stand in for the signed draft token, which remains bound to owner and draft.
export type RuntimeContext = SpendContext & {
  principal: Principal;
  draftId: string;
  upperUsd: import("@/server/spend").UpperUsdEstimate;
  timeoutMs: number;
  headers: Headers;
  logger: import("@/app/api/_shared/log").Logger;
};

// Read-only views that the orchestrator and rounds helpers receive.
export type IntakeInput = Readonly<{
  draft: CaseDraft;
  missing: readonly DraftFieldPath[];
  followUpRound: number;
}>;

export function expiryFor(createdMs: number, ttlMs: number = 24 * 60 * 60 * 1000): string {
  return toDhakaIso(createdMs + ttlMs);
}

// Stable cache key for the source text (NFC + ascii digits, mirrors normalise).
export function canonicalSourceHash(text: string): string {
  return createHash("sha256").update(text.normalize("NFC")).digest("hex");
}

// Strict-allowlist redaction of free-form provider text: never log it.
export const PROVIDER_TEXT_DROP = "[MOCK] provider payload withheld";

export const PROVIDER_OK = { ok: true } as const;

export const DRAFT_TOKEN_REGEX = /^[A-Za-z0-9._~-]+$/;

export function parseDraftToken(value: string): { ok: true; token: string } | { ok: false; errorId: ServerErrorId } {
  const result = draftTokenSchema.safeParse(value);
  if (!result.success) return { ok: false, errorId: "E-001" };
  if (!DRAFT_TOKEN_REGEX.test(value)) return { ok: false, errorId: "E-001" };
  return { ok: true, token: value };
}

// used by tests and the orchestrator; re-exports the contract error.
export const ERR_E013: ErrorEnvelope = errorEnvelope("E-013");
export const ERR_E023: ErrorEnvelope = errorEnvelope("E-023");
