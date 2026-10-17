import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { extractRequestSchema } from "@/contracts";
import { brandProviderDispatch, type LLMProvider } from "@/server/ai";
import { brandSttDispatch, type SttProvider } from "@/server/speech/types";
import { EXTRACT_FIXTURE_SOURCE } from "@/server/cache";
import { UNKNOWN_PRICE_SHEET } from "@/server/spend";
import { createDraftRegistry, createDraftSigner, verifyDraftToken } from "@/server/intake/drafts";
import { orchestrateExtract, type OrchestratorDeps } from "@/server/intake/orchestrator";
import { testParent } from "../support/principals";

const SECRET = Buffer.from("0123456789abcdef0123456789abcdef");
const FIXED_NOW = Date.parse("2026-10-18T12:00:00Z");

function setup(now = FIXED_NOW, initialFollowUpRound = 0) {
  const registry = createDraftRegistry({
    signer: createDraftSigner(SECRET),
    verify: (token, kind, principal) => verifyDraftToken(SECRET, token, kind, principal),
    now: () => now,
  });
  const dispatchCounts = { speech: 0, llm: 0 };
  const speech: SttProvider = {
    name: "test speech",
    async transcribe() { dispatchCounts.speech++; return { text: "unreachable" }; },
  };
  const llm: LLMProvider = {
    name: "test llm",
    async extract() { dispatchCounts.llm++; return null; },
  };
  const deps: OrchestratorDeps = {
    registry,
    draftSecret: SECRET,
    priceSheet: UNKNOWN_PRICE_SHEET,
    speechDeps: {
      primary: speech,
      fallback: speech,
      dispatch: brandSttDispatch((provider, audio, options) => provider.transcribe(audio, options)),
      timeoutMs: 25_000,
    },
    llmDeps: {
      primary: llm,
      fallback: llm,
      dispatch: brandProviderDispatch((provider, request, options) => provider.extract(request, options)),
      timeoutMs: 25_000,
    },
  };
  const principal = testParent(randomUUID());
  const created = registry.create({ kind: "missing", principal, payloadHash: null, initialFollowUpRound });
  if (!created.ok) throw new Error("test draft could not be created");
  return { deps, dispatchCounts, principal, registry, row: created.row, token: created.token };
}

const request = (body: unknown) => extractRequestSchema.parse(body);
const ack = () => new Headers({ "x-fera-provider-notice": "v1" });

describe("intake extract orchestrator safeguards", () => {
  it("requires explicit v1 notice before creating metadata or dispatching", async () => {
    vi.stubEnv("DEMO_MODE", "1");
    const state = setup();
    const result = await orchestrateExtract(state.deps, {
      body: request({ kind: "missing", text: EXTRACT_FIXTURE_SOURCE }),
      headers: new Headers(),
      principal: state.principal,
      requestId: "req-test",
      now: () => FIXED_NOW,
    });

    expect(result).toMatchObject({ ok: false, error: { error: { id: "E-021" } } });
    expect(state.registry._rows.size).toBe(1); // setup's row only
    expect(state.dispatchCounts).toEqual({ speech: 0, llm: 0 });
  });

  it("serves an exact DEMO_MODE cache hit before price reservation and counts its question", async () => {
    vi.stubEnv("DEMO_MODE", "1");
    const state = setup();
    for (let round = 0; round < 3; round++) {
      const issued = state.registry.issueQuestion(state.row.id, state.row.revision);
      if (!issued.ok) throw new Error("test follow-up counter did not advance");
    }

    const result = await orchestrateExtract(state.deps, {
      body: request({ kind: "missing", text: EXTRACT_FIXTURE_SOURCE, draft_token: state.token }),
      headers: ack(),
      principal: state.principal,
      requestId: "req-test",
      now: () => FIXED_NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.response).toMatchObject({ cached: true, ai_calls_used: 0, draft_revision: 5, next_question: { field: "event.district_code" } });
    expect(state.registry.get(state.row.id)).toMatchObject({ follow_up_round: 4, ai_calls_used: 0, revision: 5 });
    expect(state.dispatchCounts).toEqual({ speech: 0, llm: 0 });
  });

  it("does not fall back to a provider when source text misses the exact protected cache", async () => {
    vi.stubEnv("DEMO_MODE", "1");
    const state = setup();
    const result = await orchestrateExtract(state.deps, {
      body: request({ kind: "missing", text: `${EXTRACT_FIXTURE_SOURCE} X` }),
      headers: ack(),
      principal: state.principal,
      requestId: "req-test",
      now: () => FIXED_NOW,
    });

    expect(result).toMatchObject({ ok: false, error: { error: { id: "E-023" } } });
    expect(state.dispatchCounts.llm).toBe(0);
  });

  it("rejects foreign, expired, stale-revision, and changed-payload continuations", async () => {
    vi.stubEnv("DEMO_MODE", "0");
    const state = setup();
    const body = (draftToken: string, draftRevision: number) => request({
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

    const foreign = await orchestrateExtract(state.deps, {
      body: body(state.token, state.row.revision), headers: ack(), principal: testParent(randomUUID()),
      requestId: "req-test", now: () => FIXED_NOW,
    });
    expect(foreign).toMatchObject({ ok: false, error: { error: { id: "E-019" } } });

    const expired = await orchestrateExtract(state.deps, {
      body: body(state.token, state.row.revision), headers: ack(), principal: state.principal,
      requestId: "req-test", now: () => FIXED_NOW + 25 * 60 * 60 * 1000,
    });
    expect(expired).toMatchObject({ ok: false, error: { error: { id: "E-019" } } });

    const stale = await orchestrateExtract(state.deps, {
      body: body(state.token, state.row.revision + 1), headers: ack(), principal: state.principal,
      requestId: "req-test", now: () => FIXED_NOW,
    });
    expect(stale).toMatchObject({ ok: false, error: { error: { id: "E-005" } } });

    state.registry.setPayloadHash(state.row.id, "a".repeat(64));
    const replay = await orchestrateExtract(state.deps, {
      body: body(state.token, state.row.revision), headers: ack(), principal: state.principal,
      requestId: "req-test", now: () => FIXED_NOW,
    });
    expect(replay).toMatchObject({ ok: false, error: { error: { id: "E-005" } } });
    expect(state.dispatchCounts.llm).toBe(0);
  });
});
