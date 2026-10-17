// Intake orchestrator (TASK-020, COMP-009, FR-005/026, BR-015/023, TC-003/017/043).
//
// The orchestrator compiles the answer to "what next?" for a single API-002 call.
// It owns the COMP-008 normaliser pass, the COMP-007 LLM dispatch (behind the
// runtime helper, with a real provider call through runPaidCall), the per-call
// replay-guard (payload_hash + draft_revision), and the follow-up question selector
// (rounds.ts). It never stores child payload before confirmation; exact-source cache
// hits bypass spend reservation but still count any question the route issues.
//
// Failure semantics:
//   - E-001: schema mismatch (covered by route Zod)
//   - E-007: rate limit (covered by route limits)
//   - E-013: AI provider unavailable (runtime maps PaidCallError to E-013)
//   - E-014: AI provider timeout (runtime maps PaidCallError to E-014)
//   - E-019: draft expired or unknown token
//   - E-023: budget / six-call cap reached (covers also UNKNOWN price sheet)
//
// The orchestrator's public entry points: transcribe() and extract().
import { errorEnvelope, toDhakaIso, type CaseDraft, type ErrorEnvelope, type TranscribeResponse, type ExtractResponse, type CaseKind, type TranscribeFields, type ExtractRequest } from "@/contracts";
import { runPaidCall, PaidCallError, estimateUpperUsd, type UpperUsdEstimate, type PriceSheet } from "@/server/spend";
import { ApiError } from "@/app/api/_shared/envelope";
import { findExtractFixture } from "@/server/cache";
import { assertProviderNotice, type OrchestrationDecision, type RuntimeContext, ERR_E023 } from "./runtime";
import { type DraftRegistry, type DraftRow, payloadHash, verifyDraftToken } from "./drafts";
import { decideNext, missingFieldsFor, asContractQuestion, shouldAdvanceRound } from "./rounds";
import type { Principal } from "@/contracts/server";
import { createSttAdapter, type SttProvider, type SttDispatch, type TranscribeResult } from "@/server/speech";
import { createLlmAdapter, type LLMProvider, type ProviderDispatch, type ExtractionResult } from "@/server/ai";
import { emptyDraft, extractInputSchema } from "@/server/ai/contract";
import type { ExtractInput } from "@/server/ai/contract";
import { verifyAudioMetadata, type AudioMetadataResult } from "./audio-metadata";

// The orchestrator's input is the parsed request plus the principal and the draft
// registry. Routes hold the registry, the secret for the token signer, and the
// price sheet.
export type OrchestratorDeps = {
  registry: DraftRegistry;
  draftSecret: Buffer;
  priceSheet: PriceSheet;
  audioMetadataVerifier?: (bytes: Uint8Array, mime: string, claimedDurationSeconds?: number) => AudioMetadataResult;
  speechDeps: {
    primary: SttProvider;
    fallback: SttProvider;
    dispatch: SttDispatch;
    timeoutMs: number;
  };
  llmDeps: {
    primary: LLMProvider;
    fallback: LLMProvider;
    dispatch: ProviderDispatch;
    timeoutMs: number;
  };
};

// ---------- API-001 transcribe ----------

export type TranscribeOrchestration =
  | { ok: true; response: TranscribeResponse }
  | { ok: false; error: ErrorEnvelope };

export type TranscribeOrchestratorInput = {
  fields: TranscribeFields;
  audio: { bytes: Uint8Array; mime: string };
  fixtureId: string | null;
  headers: Headers;
  principal: Principal;
  requestId: string;
  now?: () => number;
};

function errorFromThrown(error: unknown): ErrorEnvelope {
  return errorEnvelope(error instanceof ApiError ? error.id : "E-013");
}

export async function orchestrateTranscribe(
  deps: OrchestratorDeps,
  input: TranscribeOrchestratorInput,
): Promise<TranscribeOrchestration> {
  if (!input.principal) return { ok: false, error: errorEnvelope("E-002") };
  const principal = input.principal;
  const kind = input.fields.kind;

  // A transcript fixture is deliberately unavailable until exact synthetic audio
  // bytes are checked in. Never substitute a canned transcript for uploaded audio.
  if (input.fixtureId !== null) return { ok: false, error: errorEnvelope("E-023") };

  try { assertProviderNotice(input.headers); }
  catch { return { ok: false, error: errorEnvelope("E-021") }; }

  const verifiedAudio = (deps.audioMetadataVerifier ?? verifyAudioMetadata)(
    input.audio.bytes,
    input.audio.mime,
    input.fields.duration_s,
  );
  if (!verifiedAudio.ok) return { ok: false, error: errorEnvelope(verifiedAudio.errorId) };
  const durationSeconds = verifiedAudio.durationSeconds;

  const now = input.now ?? Date.now;
  let row: DraftRow;
  let token: string;
  if (input.fields.draft_token !== undefined) {
    const payload = verifyDraftToken(deps.draftSecret, input.fields.draft_token, kind, principal);
    if (!payload) return { ok: false, error: errorEnvelope("E-019") };
    const found = deps.registry.get(payload.draftId);
    const principalKey = principal.kind === "parent" ? `s:${principal.sessionId}` : `u:${principal.userId}`;
    if (!found || found.token !== input.fields.draft_token || found.principalKey !== principalKey || found.kind !== kind || Date.parse(found.expires_at) <= now()) {
      return { ok: false, error: errorEnvelope("E-019") };
    }
    row = found;
    token = input.fields.draft_token;
  } else {
    const created = deps.registry.create({ kind, principal, payloadHash: null });
    if (!created.ok) return { ok: false, error: errorEnvelope(created.errorId) };
    row = created.row;
    token = created.token;
  }

  // 3. Upper-bound estimate. The price sheet is the team-approved source of
  // truth; UNKNOWN → E-023 (production fail-closed).
  let upperUsd: UpperUsdEstimate;
  try {
    upperUsd = estimateUpperUsd(deps.priceSheet, {
      priceId: "stt.primary",
      operation: "transcribe",
      maxBillableSeconds: Math.ceil(durationSeconds),
    });
  } catch { return { ok: false, error: ERR_E023 }; }

  // 4. Provider dispatch via runPaidCall. The dispatcher closes over the notice
  // check; runPaidCall advances the row's revision on COMMIT.
  const ctx: RuntimeContext = {
    principal,
    draftId: row.id,
    upperUsd,
    timeoutMs: deps.speechDeps.timeoutMs,
    headers: input.headers,
    logger: { info() {}, warn() {}, error() {} } as RuntimeContext["logger"],
  };
  let result: { ok: true; text: string; cached: false } | { ok: false; error: ErrorEnvelope };
  try {
    const paid = await runPaidCall<TranscribeResult>(principal, {
      apiId: "API-001",
      draftId: row.id,
      expectedRevision: row.revision,
      upperUsd,
    }, async () => {
      // The branded dispatch enforces the notice header itself.
      const adapter = createSttAdapter({
        primary: deps.speechDeps.primary,
        fallback: deps.speechDeps.fallback,
        dispatch: deps.speechDeps.dispatch,
        timeoutMs: deps.speechDeps.timeoutMs,
      });
      const r = await adapter.transcribe({ bytes: input.audio.bytes, mime: input.audio.mime });
      if (r.ok) return { value: r, actualUsd: "0.000000" };
      return { value: r, actualUsd: null };
    }, { ...ctx, timeoutMs: deps.speechDeps.timeoutMs });
    if (paid.value.ok) {
      result = { ok: true, text: paid.value.text, cached: false };
    } else {
      result = { ok: false, error: paid.value.error };
    }
  } catch (err) {
    if (err instanceof PaidCallError) {
      const counted = deps.registry.recordPaidCall(row.id, row.revision);
      if (!counted.ok) return { ok: false, error: errorEnvelope(counted.errorId) };
    }
    return { ok: false, error: errorFromThrown(err) };
  }

  const counted = deps.registry.recordPaidCall(row.id, row.revision);
  if (!counted.ok) return { ok: false, error: errorEnvelope(counted.errorId) };
  row = counted.row;

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  // The response reflects server-verified duration and the metadata-only row.
  return {
    ok: true,
    response: {
      draft_id: row.id,
      draft_token: token,
      transcript: result.text,
      language: detectLanguage(result.text),
      duration_s: durationSeconds,
      cached: false,
      ai_calls_used: row.ai_calls_used,
    },
  };
}

function detectLanguage(text: string): "bn" | "mixed" {
  return /[ঀ-৿]/.test(text) ? "bn" : "mixed";
}

// ---------- API-002 extract ----------

export type ExtractOrchestration =
  | { ok: true; response: ExtractResponse }
  | { ok: false; error: ErrorEnvelope };

export type ExtractOrchestratorInput = {
  body: ExtractRequest;
  headers: Headers;
  principal: Principal;
  requestId: string;
  now?: () => number;
};

export async function orchestrateExtract(
  deps: OrchestratorDeps,
  input: ExtractOrchestratorInput,
): Promise<ExtractOrchestration> {
  if (!input.principal) return { ok: false, error: errorEnvelope("E-002") };
  const principal = input.principal;
  const body = input.body;
  const kind = body.kind;

  try { assertProviderNotice(input.headers); }
  catch { return { ok: false, error: errorEnvelope("E-021") }; }

  // Continue an existing draft vs. start a fresh one.
  let row: DraftRow;
  let token: string;
  const now = input.now ?? Date.now;
  if (body.draft_token !== undefined) {
    const payload = verifyDraftToken(deps.draftSecret, body.draft_token, kind, principal);
    if (!payload) return { ok: false, error: errorEnvelope("E-019") };
    const found = deps.registry.get(payload.draftId);
    const principalKey = principal.kind === "parent" ? `s:${principal.sessionId}` : `u:${principal.userId}`;
    if (!found || found.token !== body.draft_token || found.principalKey !== principalKey || found.kind !== kind || Date.parse(found.expires_at) <= now()) {
      return { ok: false, error: errorEnvelope("E-019") };
    }
    if (body.draft_revision !== undefined && body.draft_revision !== found.revision) {
      return { ok: false, error: errorEnvelope("E-005") };
    }
    // Text plus a token is the first extraction after transcription. A row that
    // already has an extraction hash requires the revisioned answer path.
    if (body.text !== undefined && found.payload_hash !== null) return { ok: false, error: errorEnvelope("E-005") };
    row = found;
    token = body.draft_token;
  } else {
    // New draft: text-only first call, metadata-only row.
    const created = deps.registry.create({ kind, principal, payloadHash: null });
    if (!created.ok) return { ok: false, error: errorEnvelope(created.errorId) };
    row = created.row;
    token = created.token;
  }

  // Replay guard: a (principal, draft_id, payload_hash) replay returns the same
  // answer; a different payload_hash for the same key is E-005 (changed payload).
  const nextDraft: CaseDraft = body.draft ?? composeEmptyDraft(kind, body.text ?? "");
  if (body.draft) {
    if (row.payload_hash !== null && row.payload_hash !== payloadHash(body.draft)) {
      return { ok: false, error: errorEnvelope("E-005") };
    }
  }

  // API-002's frozen request has no fixture_id. Only a fresh, exact text match in
  // DEMO_MODE may use the protected cache; continuation answers never do. Cache
  // hits happen before price estimation/reservation and still issue counted
  // questions using the authoritative metadata row.
  const fixture = body.text !== undefined ? findExtractFixture(body.text) : null;
  if (fixture && fixture.draft.kind === kind) {
    const fixturePayloadHash = payloadHash(fixture.draft);
    if (row.payload_hash !== null && row.payload_hash !== fixturePayloadHash) {
      return { ok: false, error: errorEnvelope("E-005") };
    }
    deps.registry.setPayloadHash(row.id, fixturePayloadHash);
    const decision = decideNext({ draft: fixture.draft, followUpRound: row.follow_up_round });
    if (shouldAdvanceRound(decision)) {
      const issued = deps.registry.issueQuestion(row.id, row.revision);
      if (!issued.ok) return { ok: false, error: errorEnvelope(issued.errorId) };
      row = issued.row;
    }
    const missing = missingFieldsFor(fixture.draft);
    return {
      ok: true,
      response: {
        draft_id: row.id,
        draft_token: token,
        draft_revision: row.revision,
        expires_at: row.expires_at,
        draft: fixture.draft,
        missing_fields: [...missing],
        next_question: asContractQuestion(decision),
        ai_calls_used: row.ai_calls_used,
        cached: true,
      },
    };
  }

  // Upper-bound cost.
  let upperUsd: UpperUsdEstimate;
  try {
    upperUsd = estimateUpperUsd(deps.priceSheet, {
      priceId: "llm.primary",
      operation: "extract",
      inputTokens: Math.max(64, (body.text ?? nextDraft.source_text).length * 2),
      maxOutputTokens: 1024,
    });
  } catch { return { ok: false, error: ERR_E023 }; }

  const ctx: RuntimeContext = {
    principal,
    draftId: row.id,
    upperUsd,
    timeoutMs: deps.llmDeps.timeoutMs,
    headers: input.headers,
    logger: { info() {}, warn() {}, error() {} } as RuntimeContext["logger"],
  };

  // Cache misses reach the provider only after the versioned notice, owner,
  // revision, payload replay guard, and cost limit have all been checked.
  let dispatch: { ok: true; draft: CaseDraft; dropped: readonly unknown[] } | { ok: false; error: ErrorEnvelope };
  try {
    const paid = await runPaidCall<ExtractionResult>(principal, {
      apiId: "API-002",
      draftId: row.id,
      expectedRevision: row.revision,
      upperUsd,
    }, async () => {
      const adapter = createLlmAdapter({
        primary: deps.llmDeps.primary,
        fallback: deps.llmDeps.fallback,
        dispatch: deps.llmDeps.dispatch,
      });
      const extractInput: ExtractInput = extractInputSchema.parse({
        kind,
        sourceText: body.text ?? nextDraft.source_text,
        normalisedText: body.text ?? nextDraft.source_text,
        nowIso: toDhakaIso(Date.now()),
      });
      const r = await adapter.extract(extractInput);
      if (r.ok) return { value: r, actualUsd: "0.000000" };
      return { value: r, actualUsd: null };
    }, { ...ctx, timeoutMs: deps.llmDeps.timeoutMs });
    if (paid.value.ok) dispatch = { ok: true, draft: paid.value.draft, dropped: paid.value.dropped };
    else dispatch = { ok: false, error: paid.value.error };
  } catch (err) {
    if (err instanceof PaidCallError) {
      const counted = deps.registry.recordPaidCall(row.id, row.revision);
      if (!counted.ok) return { ok: false, error: errorEnvelope(counted.errorId) };
    }
    return { ok: false, error: errorFromThrown(err) };
  }

  // Paid-call usage and issued-question rounds are separate row counters. The
  // paid reservation has already advanced the database revision once.
  const counted = deps.registry.recordPaidCall(row.id, row.revision);
  if (!counted.ok) return { ok: false, error: errorEnvelope(counted.errorId) };
  row = counted.row;
  if (!dispatch.ok) return { ok: false, error: dispatch.error };
  deps.registry.setPayloadHash(row.id, payloadHash(dispatch.draft));
  const decision = decideNext({ draft: dispatch.draft, followUpRound: row.follow_up_round });
  if (shouldAdvanceRound(decision)) {
    const issued = deps.registry.issueQuestion(row.id, row.revision);
    if (!issued.ok) return { ok: false, error: errorEnvelope(issued.errorId) };
    row = issued.row;
  }
  const missing = missingFieldsFor(dispatch.draft);
  const nextQuestion = asContractQuestion(decision);
  const response: ExtractResponse = {
    draft_id: row.id,
    draft_token: token,
    draft_revision: row.revision,
    expires_at: row.expires_at,
    draft: dispatch.draft,
    missing_fields: [...missing],
    next_question: nextQuestion,
    ai_calls_used: row.ai_calls_used,
    cached: false,
  };
  return { ok: true, response };
}

function composeEmptyDraft(kind: CaseKind, sourceText: string): CaseDraft {
  return emptyDraft(extractInputSchema.parse({
    kind,
    sourceText,
    normalisedText: sourceText,
    nowIso: toDhakaIso(Date.now()),
  })) as CaseDraft;
}

// Re-exports kept so the route handler and tests can use them without reaching
// into the runtime helper.
export { assertProviderNotice, PROVIDER_NOTICE_HEADER } from "./runtime";
export { createDraftSigner, verifyDraftToken, createDraftRegistry, ACTIVE_DRAFTS_PER_PRINCIPAL, ACTIVE_DRAFT_WINDOW_MS, TOKEN_COUNTER_NOT_AUTHORITY, type DraftSigner, type DraftRegistry, type DraftRow } from "./drafts";
export { decideNext, missingFieldsFor, asContractQuestion, shouldAdvanceRound, toTaggedDecision, requiredFieldsFor, isFieldMissing } from "./rounds";
export type { OrchestrationDecision, RuntimeContext } from "./runtime";
