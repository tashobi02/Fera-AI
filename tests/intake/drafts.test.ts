import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createDraftRegistry, createDraftSigner, verifyDraftToken } from "@/server/intake/drafts";
import { testParent } from "../support/principals";

const SECRET = Buffer.from("0123456789abcdef0123456789abcdef");
const KIND = "missing" as const;

function makeRegistry(clock: { now: number }) {
  return createDraftRegistry({
    signer: createDraftSigner(SECRET),
    verify: (token, kind, principal) => verifyDraftToken(SECRET, token, kind, principal),
    now: () => clock.now,
  });
}

describe("intake draft metadata counters", () => {
  it("verifies the complete signed token against its kind and principal", () => {
    const clock = { now: Date.parse("2026-10-18T12:00:00Z") };
    const principal = testParent(randomUUID());
    const registry = makeRegistry(clock);
    const created = registry.create({ kind: KIND, principal, payloadHash: null });
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

  it("issues a question by atomically advancing only follow-up round and revision", () => {
    const clock = { now: Date.parse("2026-10-18T12:00:00Z") };
    const principal = testParent(randomUUID());
    const registry = makeRegistry(clock);
    const created = registry.create({ kind: KIND, principal, payloadHash: null });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const issued = registry.issueQuestion(created.row.id, created.row.revision);

    expect(issued).toMatchObject({
      ok: true,
      row: { follow_up_round: 1, ai_calls_used: 0, revision: 2, payload_hash: null },
    });
  });

  it("rejects stale, expired, and fifth-question updates without mutating metadata", () => {
    const clock = { now: Date.parse("2026-10-18T12:00:00Z") };
    const principal = testParent(randomUUID());
    const registry = makeRegistry(clock);
    const created = registry.create({ kind: KIND, principal, payloadHash: null });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const stale = registry.issueQuestion(created.row.id, created.row.revision + 1);
    expect(stale).toMatchObject({ ok: false, errorId: "E-005" });
    expect(created.row.follow_up_round).toBe(0);

    for (let round = 0; round < 4; round++) {
      const issued = registry.issueQuestion(created.row.id, created.row.revision);
      expect(issued.ok).toBe(true);
      if (!issued.ok) return;
    }
    const exhausted = registry.issueQuestion(created.row.id, created.row.revision);
    expect(exhausted).toMatchObject({ ok: false, errorId: "E-023" });
    expect(created.row).toMatchObject({ follow_up_round: 4, ai_calls_used: 0, revision: 5 });

    clock.now += 25 * 60 * 60 * 1000;
    const expired = registry.issueQuestion(created.row.id, created.row.revision);
    expect(expired).toMatchObject({ ok: false, errorId: "E-019" });
  });

  it("keeps paid-call usage independent from question rounds", () => {
    const clock = { now: Date.parse("2026-10-18T12:00:00Z") };
    const principal = testParent(randomUUID());
    const registry = makeRegistry(clock);
    const created = registry.create({ kind: KIND, principal, payloadHash: null });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const paid = registry.recordPaidCall(created.row.id, created.row.revision);
    expect(paid).toMatchObject({ ok: true, row: { ai_calls_used: 1, follow_up_round: 0, revision: 2 } });
    if (!paid.ok) return;

    const asked = registry.issueQuestion(created.row.id, paid.row.revision);
    expect(asked).toMatchObject({ ok: true, row: { ai_calls_used: 1, follow_up_round: 1, revision: 3 } });
  });
});
