// Intake orchestrator (TASK-020, COMP-009, FR-005/026, BR-015/023, TC-003/017/043).
//
// The orchestrator compiles the answer to "what next?" for a single API-002 call.
// It owns the COMP-008 normaliser pass, the COMP-007 LLM dispatch (behind the
// runtime helper, with a real provider call through runPaidCall), the per-call
// replay-guard (payload_hash + draft_revision), and the follow-up question selector
// (rounds.ts). It never stores child payload before confirmation; exact-source cache
// hits bypass spend reservation but still count any question the route issues.
//
// Per-attempt paid-call discipline: the adapter owns the primary/repair/fallback
// schedule, and the orchestrator owns the brand — the dispatch closure passed
// to the adapter wraps each adapter-attempt dispatch in its own runPaidCall so
// every branded dispatch reserves a separate ai_reservation. SQL reserve_ai_call
// is the sole authority for the paid-call counter and revision; the orchestrator
// reloads the row after each successful or failed reservation to read the
// authoritative next revision before any subsequent operation.
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
import type { Pool } from "pg";
import { errorEnvelope, toDhakaIso, type CaseDraft, type ErrorEnvelope, type TranscribeResponse, type ExtractResponse, type CaseKind, type TranscribeFields, type ExtractRequest } from "@/contracts";
import { runPaidCall, PaidCallError, estimateUpperUsd, type UpperUsdEstimate, type PriceSheet } from "@/server/spend";
import { ApiError } from "@/app/api/_shared/envelope";
import { findExtractFixture } from "@/server/cache";
import { assertProviderNotice, type OrchestrationDecision, type RuntimeContext, ERR_E023 } from "./runtime";
import {
  type DraftRegistry,
  type DraftRow,
  payloadHash,
  verifyDraftToken,
  estimateExtractInputTokens,
  createInMemoryDraftRegistry,
} from "./registry";
import { decideNext, missingFieldsFor, asContractQuestion, shouldAdvanceRound } from "./rounds";
import { canIntake, type Principal } from "@/contracts/server";
import {
  createSttAdapter,
  DispatchRefused as SttDispatchRefused,
  SttFailure,
  brandSttDispatch,
  type SttProvider,
  type SttDispatch,
} from "@/server/speech";
import {
  createLlmAdapter,
  ProviderFailure,
  brandProviderDispatch,
  DispatchRefused,
  type LLMProvider,
  type ProviderDispatch,
  type ProviderOptions,
  type ExtractionResult,
} from "@/server/ai";
import { emptyDraft, extractInputSchema } from "@/server/ai/contract";
import type { ExtractInput } from "@/server/ai/contract";
import { verifyAudioMetadata, type AudioMetadataResult } from "./audio-metadata";
import { providerRequest } from "@/server/ai/prompt";
import { normaliseText } from "@/server/normalise";

type SpendPool = Pick<Pool, "query" | "connect">;

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

type LlmPriceSlot = "primary" | "fallback" | "repair";
type SttPriceSlot = "primary" | "fallback";

function llmPriceIdFor(slot: LlmPriceSlot): string {
  if (slot === "primary") return "llm.primary";
  if (slot === "fallback") return "llm.fallback";
  return "llm.primary"; // repair reserves against the primary's price
}

function sttPriceIdFor(slot: SttPriceSlot): string {
  if (slot === "primary") return "stt.primary";
  return "stt.fallback";
}

// The branded dispatch closure: every adapter-driven attempt (primary, repair,
// fallback for LLM; primary, fallback for STT) calls this once. The closure
// reserves a separate ai_call, runs the real provider through deps.*.dispatch,
// and returns the raw provider output. The adapter already owns the
// primary/repair/fallback schedule; the orchestrator owns the brand.
function makeLlmBrandedDispatch(
  deps: OrchestratorDeps,
  ctx: { principal: Principal; row: DraftRow; headers: Headers; spendPool?: SpendPool },
): ProviderDispatch {
  return brandProviderDispatch(async (provider, request, options) => {
    const slot: LlmPriceSlot = provider === deps.llmDeps.primary ? "primary" : "fallback";
    let upperUsd: UpperUsdEstimate;
    try {
      upperUsd = estimateUpperUsd(deps.priceSheet, {
        priceId: llmPriceIdFor(slot),
        operation: "extract",
        inputTokens: estimateExtractInputTokens(request.messages),
        maxOutputTokens: 1024,
      });
    } catch { throw new DispatchRefused("E-023"); }
    const current = ctx.row;
    const runtime: RuntimeContext = {
      principal: ctx.principal,
      draftId: current.id,
      upperUsd,
      timeoutMs: deps.llmDeps.timeoutMs,
      headers: ctx.headers,
      logger: { info() {}, warn() {}, error() {} } as RuntimeContext["logger"],
    };
    try {
      const paid = await runPaidCall<unknown>(ctx.principal, {
        apiId: "API-002",
        draftId: current.id,
        expectedRevision: current.revision,
        upperUsd,
        kind: current.kind,
      }, async ({ signal }) => ({
        value: await deps.llmDeps.dispatch(provider, request, { signal: mergeSignal(options.signal, signal) } as ProviderOptions),
        actualUsd: null,
      }), { ...runtime, timeoutMs: deps.llmDeps.timeoutMs, ...(ctx.spendPool ? { pool: ctx.spendPool } : {}) });
      ctx.row = (await deps.registry.reload(current.id)) ?? current;
      return paid.value as unknown;
    } catch (err) {
      if (err instanceof ApiError && (err.id === "E-019" || err.id === "E-023")) throw new DispatchRefused(err.id);
      if (err instanceof PaidCallError) {
        ctx.row = (await deps.registry.reload(current.id)) ?? current;
        throw new ProviderFailure();
      }
      throw err;
    }
  });
}

function makeSttBrandedDispatch(
  deps: OrchestratorDeps,
  ctx: { principal: Principal; row: DraftRow; headers: Headers; durationSeconds: number; spendPool?: SpendPool },
): SttDispatch {
  return brandSttDispatch(async (provider, audio, options) => {
    const slot: SttPriceSlot = provider === deps.speechDeps.primary ? "primary" : "fallback";
    let upperUsd: UpperUsdEstimate;
    try {
      upperUsd = estimateUpperUsd(deps.priceSheet, {
        priceId: sttPriceIdFor(slot),
        operation: "transcribe",
        maxBillableSeconds: Math.ceil(ctx.durationSeconds),
      });
    } catch { throw new SttDispatchRefused("E-023"); }
    const current = ctx.row;
    const runtime: RuntimeContext = {
      principal: ctx.principal,
      draftId: current.id,
      upperUsd,
      timeoutMs: deps.speechDeps.timeoutMs,
      headers: ctx.headers,
      logger: { info() {}, warn() {}, error() {} } as RuntimeContext["logger"],
    };
    try {
      const paid = await runPaidCall<{ text: string }>(ctx.principal, {
        apiId: "API-001",
        draftId: current.id,
        expectedRevision: current.revision,
        upperUsd,
        kind: current.kind,
      }, async ({ signal }) => ({
        value: await deps.speechDeps.dispatch(provider, audio, { signal: mergeSignal(options.signal, signal) }),
        actualUsd: null,
      }), { ...runtime, timeoutMs: deps.speechDeps.timeoutMs, ...(ctx.spendPool ? { pool: ctx.spendPool } : {}) });
      ctx.row = (await deps.registry.reload(current.id)) ?? current;
      return paid.value;
    } catch (err) {
      if (err instanceof ApiError && (err.id === "E-019" || err.id === "E-023")) throw new SttDispatchRefused(err.id);
      if (err instanceof PaidCallError) {
        ctx.row = (await deps.registry.reload(current.id)) ?? current;
        throw new SttFailure();
      }
      throw err;
    }
  });
}

// Combine adapter-internal and spend-layer signals. Either side aborting must
// abort the underlying fetch.
function mergeSignal(adapter: AbortSignal | undefined, spend: AbortSignal | undefined): AbortSignal {
  if (!adapter) return spend ?? new AbortController().signal;
  if (!spend) return adapter;
  const controller = new AbortController();
  const onAbort = () => { try { controller.abort(); } catch { /* already aborted */ } };
  if (adapter.aborted || spend.aborted) onAbort();
  else {
    adapter.addEventListener("abort", onAbort, { once: true });
    spend.addEventListener("abort", onAbort, { once: true });
  }
  return controller.signal;
}

export async function orchestrateTranscribe(
  deps: OrchestratorDeps,
  input: TranscribeOrchestratorInput,
): Promise<TranscribeOrchestration> {
  if (!input.principal) return { ok: false, error: errorEnvelope("E-002") };
  const principal = input.principal;
  const kind = input.fields.kind;
  if (!canIntake(principal, kind)) return { ok: false, error: errorEnvelope("E-003") };

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
    const found = await deps.registry.get(payload.draftId);
    const principalKey = principal.kind === "parent" ? `s:${principal.sessionId}` : `u:${principal.userId}`;
    if (!found || found.principalKey !== principalKey || found.kind !== kind || Date.parse(found.expires_at) <= now()) {
      return { ok: false, error: errorEnvelope("E-019") };
    }
    if (found.payload_hash !== null) return { ok: false, error: errorEnvelope("E-005") };
    row = found;
    token = input.fields.draft_token;
  } else {
    const created = await deps.registry.create({ kind, principal, payloadHash: null });
    if (!created.ok) return { ok: false, error: errorEnvelope(created.errorId) };
    row = created.row;
    token = created.token;
  }

  const adapter = createSttAdapter({
    primary: deps.speechDeps.primary,
    fallback: deps.speechDeps.fallback,
    dispatch: makeSttBrandedDispatch(deps, { principal, row, headers: input.headers, durationSeconds }),
    timeoutMs: deps.speechDeps.timeoutMs,
  });
  const result = await adapter.transcribe({ bytes: input.audio.bytes, mime: input.audio.mime });

  // Reload the row to observe the SQL-driven revision/ai_calls_used advance.
  const refreshed = await deps.registry.get(row.id);
  if (!refreshed) return { ok: false, error: errorEnvelope("E-019") };
  row = refreshed;

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

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

// The orchestrator delegates the primary/repair/fallback schedule to the
// adapter. It owns the brand: the dispatch closure passed to the adapter
// reserves a separate ai_call for every adapter-driven attempt. There is no
// outer attempt loop in the orchestrator; the adapter's own plan is the
// schedule. The orchestrator reloads the row after the call to observe the
// SQL-driven revision advance.
async function runLlmOnce(
  deps: OrchestratorDeps,
  input: {
    principal: Principal;
    kind: CaseKind;
    row: DraftRow;
    headers: Headers;
    sourceText: string;
    nowIso: string;
  },
): Promise<{ row: DraftRow; result: ExtractionResult }> {
  const extractInput: ExtractInput = extractInputSchema.parse({
    kind: input.kind,
    sourceText: input.sourceText,
    normalisedText: normalizedSource(input.sourceText),
    nowIso: input.nowIso,
  });
  const adapter = createLlmAdapter({
    primary: deps.llmDeps.primary,
    fallback: deps.llmDeps.fallback,
    dispatch: makeLlmBrandedDispatch(deps, { principal: input.principal, row: input.row, headers: input.headers }),
  });
  const r = await adapter.extract(extractInput);
  const refreshed = await deps.registry.reload(input.row.id);
  return { row: refreshed ?? input.row, result: r };
}

// Append a parent answer to the existing source text using a truthful
// separator, and re-normalise via the existing normalise pass so the combined
// source is what the provider and the evidence offsets see. Parent fields
// already on the row are preserved verbatim (the parent's resume contains the
// already-known draft; we only extend its source text).
function appendAnswerToSource(prior: string, answer: string): string {
  return `${prior}\n\nANSWER: ${answer}`;
}

export async function orchestrateExtract(
  deps: OrchestratorDeps,
  input: ExtractOrchestratorInput,
): Promise<ExtractOrchestration> {
  if (!input.principal) return { ok: false, error: errorEnvelope("E-002") };
  const principal = input.principal;
  const body = input.body;
  const kind = body.kind;
  if (!canIntake(principal, kind)) return { ok: false, error: errorEnvelope("E-003") };

  try { assertProviderNotice(input.headers); }
  catch { return { ok: false, error: errorEnvelope("E-021") }; }

  let row: DraftRow;
  let token: string;
  const now = input.now ?? Date.now;
  if (body.draft_token !== undefined) {
    const payload = verifyDraftToken(deps.draftSecret, body.draft_token, kind, principal);
    if (!payload) return { ok: false, error: errorEnvelope("E-019") };
    const found = await deps.registry.get(payload.draftId);
    const principalKey = principal.kind === "parent" ? `s:${principal.sessionId}` : `u:${principal.userId}`;
    if (!found || found.principalKey !== principalKey || found.kind !== kind || Date.parse(found.expires_at) <= now()) {
      return { ok: false, error: errorEnvelope("E-019") };
    }
    // Token verify checks kind/owner + signature only; cross-process re-derivation
    // uses the row's (id, created_at, follow_up_round) so a DB reload must
    // re-derive the same token the parent sent.
    if (deps.registry.tokenFor(found, principal) !== body.draft_token) {
      return { ok: false, error: errorEnvelope("E-019") };
    }
    if (body.draft_revision !== undefined && body.draft_revision !== found.revision) {
      return { ok: false, error: errorEnvelope("E-005") };
    }
    if (body.text !== undefined && found.payload_hash !== null) return { ok: false, error: errorEnvelope("E-005") };
    row = found;
    token = body.draft_token;
  } else {
    const created = await deps.registry.create({ kind, principal, payloadHash: null });
    if (!created.ok) return { ok: false, error: errorEnvelope(created.errorId) };
    row = created.row;
    token = created.token;
  }

  // Follow-up body.answer: append the answer to the existing source text and
  // re-normalise via the existing normalise function so the combined source is
  // what the provider and the evidence offsets see. Preserve the parent's
  // already-known parent fields verbatim; we only extend the source text.
  let providedDraft: CaseDraft | null = body.draft ?? null;
  if (body.answer !== undefined && providedDraft !== null) {
    const extendedText = appendAnswerToSource(providedDraft.source_text, body.answer);
    const normalised = normaliseText(extendedText);
    if (normalised.status !== "known") return { ok: false, error: errorEnvelope("E-001") };
    providedDraft = { ...providedDraft, source_text: extendedText };
  }
  const nextDraft: CaseDraft = providedDraft ?? composeEmptyDraft(kind, body.text ?? "");
  if (providedDraft !== null) {
    if (row.payload_hash !== null && row.payload_hash !== payloadHash(body.draft!)) {
      return { ok: false, error: errorEnvelope("E-005") };
    }
  }

  // Exact-source cache: 0 cost, 0 ai_calls_used slots, but a question still
  // counts. Bypasses the spend layer entirely.
  const fixture = body.text !== undefined ? findExtractFixture(body.text) : null;
  if (fixture && fixture.draft.kind === kind) {
    const fixturePayloadHash = payloadHash(fixture.draft);
    if (row.payload_hash !== null && row.payload_hash !== fixturePayloadHash) {
      return { ok: false, error: errorEnvelope("E-005") };
    }
    const updated = await deps.registry.setPayloadHash(row.id, fixturePayloadHash, row.revision);
    if (!updated.ok) return { ok: false, error: errorEnvelope(updated.errorId) };
    row = updated.row;
    const decision = decideNext({ draft: fixture.draft, followUpRound: row.follow_up_round });
    if (shouldAdvanceRound(decision)) {
      const issued = await deps.registry.issueQuestion(row.id, row.revision);
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

  // Cache miss: a single adapter.extract call. The adapter owns the
  // primary/repair/fallback schedule, and the dispatch closure the orchestrator
  // passes it reserves a separate ai_call for every adapter-driven attempt.
  // The orchestrator reloads the row after the call to read the authoritative
  // post-reservation revision.
  const sourceText = body.text ?? nextDraft.source_text;
  const nowIso = toDhakaIso(Date.now());

  const outcome = await runLlmOnce(deps, {
    principal, kind, row, headers: input.headers, sourceText, nowIso,
  });
  row = outcome.row;
  if (!outcome.result.ok) return { ok: false, error: outcome.result.error };

  const dispatchDraft: CaseDraft = outcome.result.draft;
  const updated = await deps.registry.setPayloadHash(row.id, payloadHash(dispatchDraft), row.revision);
  if (!updated.ok) return { ok: false, error: errorEnvelope(updated.errorId) };
  row = updated.row;
  const decision = decideNext({ draft: dispatchDraft, followUpRound: row.follow_up_round });
  if (shouldAdvanceRound(decision)) {
    const issued = await deps.registry.issueQuestion(row.id, row.revision);
    if (!issued.ok) return { ok: false, error: errorEnvelope(issued.errorId) };
    row = issued.row;
  }
  const missing = missingFieldsFor(dispatchDraft);
  const nextQuestion = asContractQuestion(decision);
  const response: ExtractResponse = {
    draft_id: row.id,
    draft_token: token,
    draft_revision: row.revision,
    expires_at: row.expires_at,
    draft: dispatchDraft,
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
    normalisedText: normalizedSource(sourceText),
    nowIso: toDhakaIso(Date.now()),
  })) as CaseDraft;
}

// Re-exports kept so the route handler and tests can use them without reaching
// into the runtime helper.
export { assertProviderNotice, PROVIDER_NOTICE_HEADER } from "./runtime";
export {
  createDraftSigner,
  verifyDraftToken,
  createInMemoryDraftRegistry,
  createDbDraftRegistry,
  ACTIVE_DRAFTS_PER_PRINCIPAL,
  ACTIVE_DRAFT_WINDOW_MS,
  TOKEN_COUNTER_NOT_AUTHORITY,
  type DraftSigner,
  type DraftRegistry,
  type DraftRow,
} from "./registry";
export { decideNext, missingFieldsFor, asContractQuestion, shouldAdvanceRound, toTaggedDecision, requiredFieldsFor, isFieldMissing } from "./rounds";
export type { OrchestrationDecision, RuntimeContext } from "./runtime";

// keep providerRequest import alive for the bundle
void providerRequest;

function normalizedSource(source: string): string {
  const result = normaliseText(source);
  if (result.status !== "known") throw new ApiError("E-001");
  return result.value.normalisedText;
}
