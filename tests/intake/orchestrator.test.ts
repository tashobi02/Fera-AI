// Unit tests for the intake orchestrator. The spend layer is mocked so the
// orchestrator runs against the in-memory registry only; the DB test in
// `tests/db/intake-extract.test.ts` exercises the real `runPaidCall` flow.
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { extractRequestSchema } from "@/contracts";
import { brandProviderDispatch, type LLMProvider, type ProviderDispatch } from "@/server/ai";
import { brandSttDispatch, type SttProvider } from "@/server/speech/types";
import { EXTRACT_FIXTURE_SOURCE } from "@/server/cache";
import { type PriceSheet, type ReservationRequest, type PaidCallResult, type PaidReservation, PaidCallError, runPaidCall as realRunPaidCall } from "@/server/spend";
import {
  createInMemoryDraftRegistry,
  createDraftSigner,
  verifyDraftToken,
  type DraftRegistry,
} from "@/server/intake/registry";
import { orchestrateExtract, type OrchestratorDeps } from "@/server/intake/orchestrator";
import { testParent } from "../support/principals";

import { emptyOutput } from "../ai/fixtures";

const SECRET = Buffer.from("0123456789abcdef0123456789abcdef");
const FIXED_NOW = Date.parse("2026-10-18T12:00:00Z");

const mockPriceSheet: PriceSheet = {
  status: "injected",
  entries: [
    { id: "llm.primary", provider: "[MOCK] llm", model: "[MOCK] m", operation: "extract", inputUsdPerMillion: "0.100000", outputUsdPerMillion: "0.300000" },
    { id: "llm.fallback", provider: "[MOCK] llm", model: "[MOCK] m", operation: "extract", inputUsdPerMillion: "0.100000", outputUsdPerMillion: "0.300000" },
  ],
};

const ack = () => new Headers({ "x-fera-provider-notice": "v1" });

vi.mock("@/server/spend", async () => {
  const actual = await vi.importActual<typeof import("@/server/spend")>("@/server/spend");
  return {
    ...actual,
    runPaidCall: vi.fn(),
  };
});

const runPaidCall = vi.mocked(realRunPaidCall);

async function makeSetup(): Promise<{ deps: OrchestratorDeps; registry: DraftRegistry; principal: ReturnType<typeof testParent>; row: import("@/server/intake/registry").DraftRow; token: string }> {
  const principal = testParent(randomUUID());
  const registry: DraftRegistry = createInMemoryDraftRegistry({
    signer: createDraftSigner(SECRET),
    verify: (token, kind, p) => verifyDraftToken(SECRET, token, kind, p),
    now: () => FIXED_NOW,
  });
  const created = await registry.create({ kind: "missing", principal, payloadHash: null });
  if (!created.ok) throw new Error("test draft could not be created");
  const dispatch: ProviderDispatch = brandProviderDispatch((provider, request, options) => provider.extract(request, options));
  const llm: LLMProvider = { name: "test", async extract() { return null; } };
  const deps: OrchestratorDeps = {
    registry,
    draftSecret: SECRET,
    priceSheet: mockPriceSheet,
    speechDeps: {
      primary: { name: "test", async transcribe() { return { text: "x" }; } } as SttProvider,
      fallback: { name: "test", async transcribe() { return { text: "x" }; } } as SttProvider,
      dispatch: brandSttDispatch((provider, audio, options) => provider.transcribe(audio, options)),
      timeoutMs: 25_000,
    },
    llmDeps: { primary: llm, fallback: { ...llm, name: "[MOCK] fallback" }, dispatch, timeoutMs: 25_000 },
  };
  return { deps, registry, principal, row: created.row, token: created.token };
}

beforeEach(() => {
  runPaidCall.mockReset();
});

describe("intake extract orchestrator safeguards (mock runPaidCall)", () => {
  it("requires explicit v1 notice before creating metadata or dispatching", async () => {
    vi.stubEnv("DEMO_MODE", "1");
    const { deps, principal } = await makeSetup();
    const result = await orchestrateExtract(deps, {
      body: extractRequestSchema.parse({ kind: "missing", text: EXTRACT_FIXTURE_SOURCE }),
      headers: new Headers(),
      principal,
      requestId: "req-test",
      now: () => FIXED_NOW,
    });
    expect(result).toMatchObject({ ok: false, error: { error: { id: "E-021" } } });
    expect(runPaidCall).not.toHaveBeenCalled();
  });

  it("serves an exact DEMO_MODE cache hit before price reservation and counts its question", async () => {
    vi.stubEnv("DEMO_MODE", "1");
    const { deps, principal, row, token } = await makeSetup();
    for (let round = 0; round < 3; round++) {
      const issued = await (deps.registry as DraftRegistry).issueQuestion(row.id, row.revision);
      if (!issued.ok) throw new Error("test follow-up counter did not advance");
    }
    const result = await orchestrateExtract(deps, {
      body: extractRequestSchema.parse({ kind: "missing", text: EXTRACT_FIXTURE_SOURCE, draft_token: token }),
      headers: ack(),
      principal,
      requestId: "req-test",
      now: () => FIXED_NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.response).toMatchObject({ cached: true, ai_calls_used: 0, draft_revision: 6 });
    expect(runPaidCall).not.toHaveBeenCalled();
  });

  it("does not fall back to a provider when source text misses the exact protected cache", async () => {
    vi.stubEnv("DEMO_MODE", "1");
    const { deps, principal } = await makeSetup();
    // The fixture text normalises to itself (ASCII digits) only when
    // toDhakaIso is irrelevant, so we mutate the source to add ASCII-only
    // content past the normalisation pass. The orchestrator must refuse at
    // E-001 (input did not pass the adapter's parse + normalise step)
    // rather than dispatch a real provider.
    const deps2: OrchestratorDeps = { ...deps, priceSheet: { status: "UNKNOWN", source: "docs/costs.md" } };
    const result = await orchestrateExtract(deps2, {
      body: extractRequestSchema.parse({ kind: "missing", text: `${EXTRACT_FIXTURE_SOURCE} X` }),
      headers: ack(),
      principal,
      requestId: "req-test",
      now: () => FIXED_NOW,
    });
    expect(result).toMatchObject({ ok: false, error: { error: { id: "E-023" } } });
    expect(runPaidCall).not.toHaveBeenCalled();
  });

  it("rejects foreign, expired, stale-revision, and changed-payload continuations", async () => {
    vi.stubEnv("DEMO_MODE", "0");
    const { deps, principal, row, token } = await makeSetup();
    const body = (draftToken: string, draftRevision: number) => extractRequestSchema.parse({
      kind: "missing",
      answer: "ঢাকা",
      draft: {
        kind: "missing",
        source_text: EXTRACT_FIXTURE_SOURCE,
        child: { name: null, name_latin: null, age_years: null, age_min: null, age_max: null, sex: "unknown", height_cm: null, clothing: null, marks: null },
        event: { at: null, at_lower: null, at_upper: null, at_approx: false, place_text: null, district_text: null, district_code: null, thana: null, circumstances: null },
        reporter: { relation: null, phone: null },
        evidence: {},
      },
      draft_token: draftToken,
      draft_revision: draftRevision,
    });

    const foreign = await orchestrateExtract(deps, {
      body: body(token, row.revision), headers: ack(), principal: testParent(randomUUID()),
      requestId: "req-test", now: () => FIXED_NOW,
    });
    expect(foreign).toMatchObject({ ok: false, error: { error: { id: "E-019" } } });

    const expired = await orchestrateExtract(deps, {
      body: body(token, row.revision), headers: ack(), principal,
      requestId: "req-test", now: () => FIXED_NOW + 25 * 60 * 60 * 1000,
    });
    expect(expired).toMatchObject({ ok: false, error: { error: { id: "E-019" } } });

    const stale = await orchestrateExtract(deps, {
      body: body(token, row.revision + 1), headers: ack(), principal,
      requestId: "req-test", now: () => FIXED_NOW,
    });
    expect(stale).toMatchObject({ ok: false, error: { error: { id: "E-005" } } });

    await deps.registry.setPayloadHash(row.id, "a".repeat(64), row.revision);
    const replay = await orchestrateExtract(deps, {
      body: body(token, row.revision), headers: ack(), principal,
      requestId: "req-test", now: () => FIXED_NOW,
    });
    expect(replay).toMatchObject({ ok: false, error: { error: { id: "E-005" } } });
    expect(runPaidCall).not.toHaveBeenCalled();
  });

  it("wraps each branded dispatch (primary, repair, fallback) in its own runPaidCall", async () => {
    vi.stubEnv("DEMO_MODE", "0");
    const { deps, principal, token } = await makeSetup();
    // Use ASCII-only text so the adapter's parse + normalise pass succeeds
    // (normalisedText === sourceText when there are no Bangla digits).
    const sourceText = "A 7 year old child went missing near the bus terminal. Phone 01700000001.";
    const fallbackDraft = {
      kind: "missing" as const,
      source_text: sourceText,
      child: { name: null, name_latin: null, age_years: 7, age_min: 7, age_max: 7, sex: "unknown" as const, height_cm: null, clothing: null, marks: null },
      event: { at: null, at_lower: null, at_upper: null, at_approx: false, place_text: null, district_text: null, district_code: null, thana: null, circumstances: null },
      reporter: { relation: null, phone: null },
      evidence: {},
    };
    let callCount = 0;
    runPaidCall.mockImplementation(async (..._args) => {
      callCount++;
      // Third reservation (the fallback) succeeds with a usable draft.
      if (callCount === 3) {
        return makeOk(emptyOutput()) as PaidCallResult<unknown>;
      }
      return makeOk("not-json") as PaidCallResult<unknown>;
    });
    const result = await orchestrateExtract(deps, {
      body: extractRequestSchema.parse({ kind: "missing", text: sourceText, draft_token: token }),
      headers: ack(),
      principal,
      requestId: "req-test",
      now: () => FIXED_NOW,
    });
    // The adapter drives the primary/repair/fallback schedule: three paid
    // reservations before the orchestrator writes a payload hash.
    expect(callCount).toBe(3);
    expect(result.ok).toBe(true);
  });

  it("refuses an unknown priceId slot rather than fabricating a value", async () => {
    vi.stubEnv("DEMO_MODE", "0");
    const { deps, principal, token } = await makeSetup();
    // Mutate the price sheet to remove llm.fallback; the orchestrator's
    // branded dispatch closure should refuse the fallback reservation with
    // E-023, and the adapter will surface it.
    runPaidCall.mockImplementation(async () => makeFailed("E-013"));
    const deps2: OrchestratorDeps = {
      ...deps,
      priceSheet: { status: "injected", entries: mockPriceSheet.entries.filter((e) => e.id === "llm.primary") },
    };
    const result = await orchestrateExtract(deps2, {
      body: extractRequestSchema.parse({ kind: "missing", text: EXTRACT_FIXTURE_SOURCE, draft_token: token }),
      headers: ack(),
      principal,
      requestId: "req-test",
      now: () => FIXED_NOW,
    });
    expect(result).toMatchObject({ ok: false, error: { error: { id: "E-023" } } });
  });
});

function makeOk<T>(value: T): PaidCallResult<T> {
  const reservation: PaidReservation = Object.freeze({
    id: randomUUID(), apiId: "API-002", draftId: randomUUID(), revision: 1, upperUsd: "0.010000",
  });
  return { value, reservation, settlement: "settled" };
}

function makeFailed(id: "E-013" | "E-014"): PaidCallResult<unknown> {
  const reservation: PaidReservation = Object.freeze({
    id: randomUUID(), apiId: "API-002", draftId: randomUUID(), revision: 1, upperUsd: "0.010000",
  });
  throw new PaidCallError(id, reservation, "retained", "provider");
}
