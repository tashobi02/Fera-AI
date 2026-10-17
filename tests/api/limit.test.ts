// COMP-021 fixed-window limiter: window, reset, E-007 seconds, store failure modes, hashed keys.
import { describe, expect, it } from "vitest";
import { PRINCIPALS } from "@/contracts/examples";
import { MemoryRateLimitStore, RATE_LIMITS, RateLimiter, createKeyer, hasPaidLimits, type RateLimitRule, type RateLimitStore } from "@/app/api/_shared";

const rule: RateLimitRule = { id: "test.rule", limit: 3, windowMs: 60_000, scope: "principal", onStoreError: "deny" };
const T0 = Date.parse("2026-10-14T10:00:00Z");

function setup(start = T0) {
  let t = start;
  const store = new MemoryRateLimitStore(10_000, () => t);
  return { limiter: new RateLimiter(store, () => t), store, advance: (ms: number) => (t += ms) };
}

describe("RateLimiter.hit", () => {
  it("allows up to the limit, then reports the seconds left in the window", async () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < 3; i++) expect(await limiter.hit(rule, "k")).toEqual({ ok: true });
    advance(12_300);
    expect(await limiter.hit(rule, "k")).toEqual({ ok: false, reason: "limited", retryAfterSeconds: 48 });
  });

  it("resets at the next fixed window", async () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < 4; i++) await limiter.hit(rule, "k");
    advance(60_000);
    expect(await limiter.hit(rule, "k")).toEqual({ ok: true });
  });

  it("never reports fewer than one second", async () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < 3; i++) await limiter.hit(rule, "k");
    advance(59_999);
    expect(await limiter.hit(rule, "k")).toEqual({ ok: false, reason: "limited", retryAfterSeconds: 1 });
  });

  it("keeps subjects and rules apart", async () => {
    const { limiter } = setup();
    for (let i = 0; i < 3; i++) await limiter.hit(rule, "a");
    expect((await limiter.hit(rule, "a")).ok).toBe(false);
    expect((await limiter.hit(rule, "b")).ok).toBe(true);
    expect((await limiter.hit({ ...rule, id: "other.rule" }, "a")).ok).toBe(true);
  });
});

describe("RateLimiter.peek (failure-only limits such as API-020)", () => {
  it("does not count and blocks once failures reach the limit", async () => {
    const { limiter } = setup();
    const signIn = RATE_LIMITS.signInFailures;
    for (let i = 0; i < 10; i++) expect((await limiter.peek(signIn, "n")).ok).toBe(true);
    for (let i = 0; i < 5; i++) await limiter.hit(signIn, "n");
    expect(await limiter.peek(signIn, "n")).toMatchObject({ ok: false, reason: "limited" });
  });
});

describe("store failure modes (COMP-021 vs BR-023)", () => {
  const failing: RateLimitStore = {
    increment: () => Promise.reject(new Error("down")),
    peek: () => Promise.reject(new Error("down")),
  };

  it("deny rules (paid AI calls) fail closed", async () => {
    const limiter = new RateLimiter(failing);
    expect(await limiter.hit(RATE_LIMITS.aiPrincipal, "k")).toEqual({ ok: false, reason: "unavailable" });
    expect(await limiter.hit(RATE_LIMITS.aiNetwork, "k")).toEqual({ ok: false, reason: "unavailable" });
  });

  it("allow rules fail open and flag the decision as degraded", async () => {
    const limiter = new RateLimiter(failing);
    expect(await limiter.peek(RATE_LIMITS.signInFailures, "k")).toEqual({ ok: true, degraded: true });
  });

  it.each([[undefined], [null], [-1], [1.5], [Number.NaN], ["3"]])("a store returning %s is a store error", async (bad) => {
    const odd = { increment: async () => bad, peek: async () => bad } as unknown as RateLimitStore;
    const limiter = new RateLimiter(odd);
    expect(await limiter.hit(RATE_LIMITS.aiPrincipal, "k")).toEqual({ ok: false, reason: "unavailable" });
    expect(await limiter.peek(RATE_LIMITS.signInFailures, "k")).toEqual({ ok: true, degraded: true });
  });
});

describe("paid-route limits (BR-023)", () => {
  it("require both AI limits at spec strength, failing closed", () => {
    expect(hasPaidLimits([RATE_LIMITS.aiPrincipal, RATE_LIMITS.aiNetwork])).toBe(true);
    expect(hasPaidLimits([{ ...RATE_LIMITS.aiPrincipal, limit: 5 }, RATE_LIMITS.aiNetwork])).toBe(true);
    expect(hasPaidLimits(undefined)).toBe(false);
    expect(hasPaidLimits([RATE_LIMITS.aiNetwork])).toBe(false);
    expect(hasPaidLimits([{ ...RATE_LIMITS.aiPrincipal, onStoreError: "allow" }, RATE_LIMITS.aiNetwork])).toBe(false);
    expect(hasPaidLimits([{ ...RATE_LIMITS.aiPrincipal, scope: "network" }, RATE_LIMITS.aiNetwork])).toBe(false);
  });
});

describe("spec limits", () => {
  it("match NFR-009/BR-023 and API-020", () => {
    expect(RATE_LIMITS.aiPrincipal).toMatchObject({ limit: 10, windowMs: 60_000, scope: "principal", onStoreError: "deny" });
    expect(RATE_LIMITS.aiNetwork).toMatchObject({ limit: 30, windowMs: 60_000, scope: "network", onStoreError: "deny" });
    expect(RATE_LIMITS.signInFailures).toMatchObject({ limit: 5, windowMs: 60_000, scope: "network" });
    expect(RATE_LIMITS.preAuthNetwork).toMatchObject({ limit: 300, windowMs: 60_000, scope: "network", onStoreError: "allow" });
    // TASK-032 admin writes (OD-032-4): both fail closed.
    expect(RATE_LIMITS.adminRedaction).toMatchObject({ limit: 5, windowMs: 60_000, scope: "principal", onStoreError: "deny" });
    expect(RATE_LIMITS.adminVerify).toMatchObject({ limit: 30, windowMs: 60_000, scope: "principal", onStoreError: "deny" });
  });
});

describe("keys", () => {
  it("hash network addresses and principal IDs with HMAC", () => {
    const keyer = createKeyer("s1");
    const net = keyer.network("203.0.113.7");
    expect(net).toMatch(/^n:[A-Za-z0-9_-]{32}$/);
    expect(net).not.toContain("203.0.113.7");
    expect(keyer.network("203.0.113.7")).toBe(net);
    expect(createKeyer("s2").network("203.0.113.7")).not.toBe(net);
    expect(keyer.network(null)).toBe(keyer.network(null));
    const p = keyer.principal(PRINCIPALS.parent);
    expect(p).toMatch(/^p:/);
    expect(p).not.toContain(PRINCIPALS.parent.sessionId);
    expect(keyer.principal(PRINCIPALS.officer)).not.toBe(p);
  });
});

describe("MemoryRateLimitStore", () => {
  it("sweeps expired windows when full", async () => {
    let t = T0;
    const store = new MemoryRateLimitStore(2, () => t);
    await store.increment("a", T0, 60_000);
    await store.increment("b", T0, 60_000);
    t += 60_000;
    await store.increment("c", T0 + 60_000, 60_000);
    expect(store.size).toBe(1);
    expect(await store.peek("a", T0)).toBe(0);
  });

  it("stays bounded with many live keys, evicting the oldest first, in bounded time", async () => {
    const store = new MemoryRateLimitStore(1_000, () => T0);
    const started = performance.now();
    for (let i = 0; i < 50_000; i++) await store.increment(`k${i}`, T0, 60_000);
    expect(performance.now() - started).toBeLessThan(2_000);
    expect(store.size).toBe(1_000);
    expect(await store.peek("k0", T0)).toBe(0);
    expect(await store.peek("k49999", T0)).toBe(1);
  });

  it("counts within a window and restarts in the next", async () => {
    const store = new MemoryRateLimitStore(10, () => T0);
    expect(await store.increment("a", T0, 60_000)).toBe(1);
    expect(await store.increment("a", T0, 60_000)).toBe(2);
    expect(await store.increment("a", T0 + 60_000, 60_000)).toBe(1);
    expect(store.size).toBe(1);
  });
});
