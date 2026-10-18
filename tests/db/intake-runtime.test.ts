import { randomBytes } from "node:crypto";
import type { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDbDraftRegistry, createDraftSigner, verifyDraftToken } from "@/server/intake/registry";
import { orchestrateExtract, type OrchestratorDeps } from "@/server/intake/orchestrator";
import { brandProviderDispatch } from "@/server/ai";
import { brandSttDispatch } from "@/server/speech";
import { estimateUpperUsd, runPaidCall, type PriceSheet } from "@/server/spend";
import { setPoolForTests } from "@/server/db/pool";
import { emptyOutput } from "../ai/fixtures";
import { testParent } from "../support/principals";
import { connect, dbTestsEnabled, pool } from "./support/db";

const secret = randomBytes(32);
const prices: PriceSheet = { status: "injected", entries: ["primary", "fallback"].map(slot => ({
  id: `llm.${slot}`, provider: "[MOCK] database acceptance", model: "[MOCK] fixture", operation: "extract" as const,
  inputUsdPerMillion: "0.100000", outputUsdPerMillion: "0.300000",
})) };

describe.skipIf(!dbTestsEnabled)("intake metadata and reserved fake dispatch on PostgreSQL", () => {
  let owner: Client;
  let app: Pool;
  beforeAll(async () => { owner = await connect("admin"); app = pool("app"); setPoolForTests(app); });
  afterAll(async () => { setPoolForTests(null); await Promise.all([owner?.end(), app?.end()]); });
  const registry = () => createDbDraftRegistry({ pool: app, signer: createDraftSigner(secret), verify: (token, kind, principal) => verifyDraftToken(secret, token, kind, principal) });
  async function parent() {
    const row = (await owner.query<{ id: string }>("INSERT INTO parent_sessions DEFAULT VALUES RETURNING id")).rows[0]!;
    return testParent(row.id);
  }

  it("resumes in another registry and enforces the active cap and revisioned question limit", async () => {
    const principal = await parent();
    const a = registry();
    const created = await Promise.all(Array.from({ length: 4 }, () => a.create({ kind: "missing", principal, payloadHash: null })));
    expect(created.filter(result => result.ok)).toHaveLength(3);
    const first = created.find(result => result.ok)!;
    if (!first.ok) throw new Error("fixture draft absent");
    const b = registry();
    let row = (await b.get(first.row.id))!;
    expect(b.tokenFor(row, principal)).toBe(first.token);
    for (let round = 0; round < 4; round++) {
      const issued = await b.issueQuestion(row.id, row.revision);
      expect(issued.ok).toBe(true);
      if (issued.ok) row = issued.row;
    }
    expect(await b.issueQuestion(row.id, row.revision)).toMatchObject({ ok: false, errorId: "E-023" });
    expect(b.tokenFor(row, principal)).toBe(first.token);
    expect(row.ai_calls_used).toBe(0);
    expect(await b.setPayloadHash(row.id, "a".repeat(64), row.revision - 1)).toMatchObject({ ok: false, errorId: "E-005" });
    const columns = (await owner.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name='intake_drafts'")).rows.map(row => row.column_name);
    expect(columns.sort()).toEqual(["id", "session_id", "user_id", "kind", "created_at", "expires_at", "payload_hash", "ai_calls_used", "revision", "follow_up_round"].sort());
  });

  it("reserves separately for primary, repair and fallback with actual SQL counters", async () => {
    const principal = await parent();
    let calls = 0;
    const primary = { name: "[MOCK] primary", extract: async () => { calls++; return "not-json"; } };
    const fallback = { name: "[MOCK] fallback", extract: async () => { calls++; return emptyOutput(); } };
    const speech = { name: "[MOCK] unused", transcribe: async () => ({ text: "[MOCK] unused" }) };
    const deps: OrchestratorDeps = {
      registry: registry(), draftSecret: secret, priceSheet: prices,
      llmDeps: { primary, fallback, dispatch: brandProviderDispatch((provider, request, options) => provider.extract(request, options)), timeoutMs: 25_000 },
      speechDeps: { primary: speech, fallback: speech, dispatch: brandSttDispatch((provider, audio, options) => provider.transcribe(audio, options)), timeoutMs: 25_000 },
    };
    const result = await orchestrateExtract(deps, { principal, body: { kind: "missing", text: "[MOCK] A synthetic child description with unknown details." }, headers: new Headers({ "x-fera-provider-notice": "v1" }), requestId: "intake-db-acceptance" });
    expect(result.ok).toBe(true);
    expect(calls).toBe(3);
    if (!result.ok) throw new Error("fake provider acceptance failed");
    expect(result.response.ai_calls_used).toBe(3);
    const reservations = await owner.query("SELECT reserved_usd, settled_at FROM ai_reservations WHERE draft_id=$1", [result.response.draft_id]);
    expect(reservations.rows).toHaveLength(3);
    expect(reservations.rows.every(row => row.settled_at === null)).toBe(true);
    const metadata = await deps.registry.get(result.response.draft_id);
    expect(metadata?.payload_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("refuses a seventh fake dispatch before it runs", async () => {
    const principal = await parent();
    const store = registry();
    const draft = await store.create({ kind: "missing", principal, payloadHash: null });
    if (!draft.ok) throw new Error("fixture draft absent");
    const upperUsd = estimateUpperUsd(prices, { priceId: "llm.primary", operation: "extract", inputTokens: 64, maxOutputTokens: 1024 });
    let calls = 0;
    for (let i = 0; i < 6; i++) {
      const row = (await store.get(draft.row.id))!;
      await runPaidCall(principal, { apiId: "API-002", kind: "missing", draftId: row.id, expectedRevision: row.revision, upperUsd }, async () => { calls++; return { value: "[MOCK]", actualUsd: null }; }, { pool: app, timeoutMs: 25_000 });
    }
    const row = (await store.get(draft.row.id))!;
    await expect(runPaidCall(principal, { apiId: "API-002", kind: "missing", draftId: row.id, expectedRevision: row.revision, upperUsd }, async () => { calls++; return { value: "[MOCK]", actualUsd: null }; }, { pool: app, timeoutMs: 25_000 })).rejects.toMatchObject({ id: "E-023" });
    expect(calls).toBe(6);
  });
});
