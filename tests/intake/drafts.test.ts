import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createInMemoryDraftRegistry,
  createDraftSigner,
  verifyDraftToken,
  ACTIVE_DRAFTS_PER_PRINCIPAL,
  ACTIVE_DRAFT_WINDOW_MS,
  type DraftRegistry,
} from "@/server/intake/registry";
import { testParent } from "../support/principals";

const SECRET = Buffer.from("0123456789abcdef0123456789abcdef");
const KIND = "missing" as const;

function makeRegistry(clock: { now: number }): DraftRegistry {
  return createInMemoryDraftRegistry({
    signer: createDraftSigner(SECRET),
    verify: (token, kind, principal) => verifyDraftToken(SECRET, token, kind, principal),
    now: () => clock.now,
  });
}

describe("intake draft metadata counters", () => {
  it("verifies the complete signed token against its kind and principal", async () => {
    const clock = { now: Date.parse("2026-10-18T12:00:00Z") };
    const principal = testParent(randomUUID());
    const registry = makeRegistry(clock);
    const created = await registry.create({ kind: KIND, principal, payloadHash: null });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(verifyDraftToken(SECRET, created.token, KIND, principal)).toEqual({
      draftId: created.row.id,
      createdMs: clock.now,
      followUpRound: 0,
    });
    expect(verifyDraftToken(SECRET, created.token, "found", principal)).toBeNull();
    expect(verifyDraftToken(SECRET, created.token, KIND, testParent(randomUUID()))).toBeNull();
    expect(verifyDraftToken(SECRET, `${created.token.slice(0, -1)}x`, KIND, principal)).toBeNull();
  });

  it("issues a question by atomically advancing only follow-up round and revision", async () => {
    const clock = { now: Date.parse("2026-10-18T12:00:00Z") };
    const principal = testParent(randomUUID());
    const registry = makeRegistry(clock);
    const created = await registry.create({ kind: KIND, principal, payloadHash: null });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const issued = await registry.issueQuestion(created.row.id, created.row.revision);

    expect(issued).toMatchObject({
      ok: true,
      row: { follow_up_round: 1, ai_calls_used: 0, revision: 2, payload_hash: null },
    });
  });

  it("rejects stale, expired, and fifth-question updates without mutating metadata", async () => {
    const clock = { now: Date.parse("2026-10-18T12:00:00Z") };
    const principal = testParent(randomUUID());
    const registry = makeRegistry(clock);
    const created = await registry.create({ kind: KIND, principal, payloadHash: null });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const stale = await registry.issueQuestion(created.row.id, created.row.revision + 1);
    expect(stale).toMatchObject({ ok: false, errorId: "E-005" });

    for (let round = 0; round < 4; round++) {
      const issued = await registry.issueQuestion(created.row.id, created.row.revision);
      expect(issued.ok).toBe(true);
      if (!issued.ok) return;
    }
    const exhausted = await registry.issueQuestion(created.row.id, created.row.revision);
    expect(exhausted).toMatchObject({ ok: false, errorId: "E-023" });

    clock.now += 25 * 60 * 60 * 1000;
    const expired = await registry.issueQuestion(created.row.id, created.row.revision);
    expect(expired).toMatchObject({ ok: false, errorId: "E-019" });
  });

  it("rejects the 4th active draft per principal inside the 24h window", async () => {
    const clock = { now: Date.parse("2026-10-18T12:00:00Z") };
    const principal = testParent(randomUUID());
    const registry = makeRegistry(clock);
    for (let i = 0; i < ACTIVE_DRAFTS_PER_PRINCIPAL; i++) {
      const r = await registry.create({ kind: KIND, principal, payloadHash: null });
      expect(r.ok).toBe(true);
    }
    const fourth = await registry.create({ kind: KIND, principal, payloadHash: null });
    expect(fourth).toMatchObject({ ok: false, errorId: "E-019" });

    // Outside the window: a fresh draft is allowed (we advance the clock by
    // the full window + 1 ms; the existing drafts fall outside since the
    // registry uses now() - WINDOW as the cutoff).
    clock.now += ACTIVE_DRAFT_WINDOW_MS + 1;
    const after = await registry.create({ kind: KIND, principal, payloadHash: null });
    expect(after).toMatchObject({ ok: true });
  });
});
