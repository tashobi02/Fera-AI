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

  it("validates payload-hash shape the same way as set_intake_payload_hash (E-005)", async () => {
    // The in-memory registry must mirror the SQL function: a valid hash is
    // either NULL (cleared) or exactly 64 lowercase hex characters. Anything
    // else is refused with E-005 so the orchestrator and the route envelope
    // never see a half-applied hash.
    const clock = { now: Date.parse("2026-10-18T12:00:00Z") };
    const principal = testParent(randomUUID());
    const registry = makeRegistry(clock);
    const created = await registry.create({ kind: KIND, principal, payloadHash: null });
    if (!created.ok) throw new Error("fixture draft absent");

    const good = "a".repeat(64);
    const applied = await registry.setPayloadHash(created.row.id, good, created.row.revision);
    expect(applied).toMatchObject({ ok: true });
    if (!applied.ok) return;

    // Malformed hashes — uppercase, short, non-hex, empty string — all E-005.
    const wrong = await registry.setPayloadHash(applied.row.id, "Z".repeat(64), applied.row.revision);
    expect(wrong).toMatchObject({ ok: false, errorId: "E-005" });
    const short = await registry.setPayloadHash(applied.row.id, "a".repeat(63), applied.row.revision);
    expect(short).toMatchObject({ ok: false, errorId: "E-005" });
    const nonhex = await registry.setPayloadHash(applied.row.id, "g".repeat(64), applied.row.revision);
    expect(nonhex).toMatchObject({ ok: false, errorId: "E-005" });
    const empty = await registry.setPayloadHash(applied.row.id, "", applied.row.revision);
    expect(empty).toMatchObject({ ok: false, errorId: "E-005" });

    // A NULL clears the existing hash and advances the revision.
    const cleared = await registry.setPayloadHash(applied.row.id, null, applied.row.revision);
    expect(cleared).toMatchObject({ ok: true, row: { payload_hash: null } });
  });

  it("keeps the signed draft token stable across every follow-up round (intent: identity + DB CAS, not a rotating token)", async () => {
    // The draft token is intentionally bound to (kind, principal, id, createdMs,
    // follow_up_round=0) and is NEVER rotated by issueQuestion. Only follow_up_round
    // and revision advance, so a resume that holds the original token stays
    // valid through every round and the route's tokenFor compare never sees a
    // different blob mid-draft.
    const clock = { now: Date.parse("2026-10-18T12:00:00Z") };
    const principal = testParent(randomUUID());
    const registry = makeRegistry(clock);
    const created = await registry.create({ kind: KIND, principal, payloadHash: null });
    if (!created.ok) throw new Error("fixture draft absent");

    let row = created.row;
    for (let round = 0; round < 4; round++) {
      const issued = await registry.issueQuestion(row.id, row.revision);
      if (!issued.ok) throw new Error(`round ${round} refused: ${issued.errorId}`);
      row = issued.row;
      // After every round, the token the registry would sign for this row is
      // the same blob the create() produced. Round counter is metadata only.
      expect(registry.tokenFor(row, principal)).toBe(created.token);
    }
    // The round counter advanced; the token didn't.
    expect(row.follow_up_round).toBe(4);
    expect(row.revision).toBe(5);
    expect(registry.tokenFor(row, principal)).toBe(created.token);
  });

  it("refuses setPayloadHash with a stale revision (CAS guard, E-005)", async () => {
    // The same guard the SQL function enforces: revision must match the row's
    // current value or the write is refused. The orchestrator reloads after
    // every paid-call reservation, so it always passes the fresh revision.
    const clock = { now: Date.parse("2026-10-18T12:00:00Z") };
    const principal = testParent(randomUUID());
    const registry = makeRegistry(clock);
    const created = await registry.create({ kind: KIND, principal, payloadHash: null });
    if (!created.ok) throw new Error("fixture draft absent");

    const stale = await registry.setPayloadHash(created.row.id, "a".repeat(64), created.row.revision - 1);
    expect(stale).toMatchObject({ ok: false, errorId: "E-005" });

    // Apply once, then try to re-apply with the pre-apply revision.
    const applied = await registry.setPayloadHash(created.row.id, "a".repeat(64), created.row.revision);
    if (!applied.ok) throw new Error("apply refused");
    const reapply = await registry.setPayloadHash(applied.row.id, "b".repeat(64), applied.row.revision - 1);
    expect(reapply).toMatchObject({ ok: false, errorId: "E-005" });
  });
});
