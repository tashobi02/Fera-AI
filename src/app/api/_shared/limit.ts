// Fixed-window rate limiter (COMP-021; D1 NFR-009, BR-023; D2A API-020).
//
// COMP-021 plans Postgres `rate_limits` counters. This lane ships the store interface
// and an in-memory store only: each server instance counts on its own, so a
// multi-instance deploy (Vercel) needs the shared Postgres store before limits hold
// across instances. Gate: no paid route ships on the memory store (open decision).
import { createHmac, randomBytes } from "node:crypto";
import type { Principal } from "@/contracts/server";

export type RateLimitRule = {
  id: string;
  limit: number;
  windowMs: number;
  scope: "principal" | "network";
  // COMP-021 fails open when the store is down; BR-023 fails closed for paid calls.
  onStoreError: "allow" | "deny";
};

export const RATE_LIMITS = {
  aiPrincipal: { id: "ai.principal", limit: 10, windowMs: 60_000, scope: "principal", onStoreError: "deny" },
  aiNetwork: { id: "ai.network", limit: 30, windowMs: 60_000, scope: "network", onStoreError: "deny" },
  // API-020 counts failures only: `peek` before the attempt, `hit` after a failure.
  signInFailures: { id: "signin.failure", limit: 5, windowMs: 60_000, scope: "network", onStoreError: "allow" },
  // Cheap flood guard before the principal is resolved. Not from the spec pack: a
  // generous documented default (300/min per network key).
  preAuthNetwork: { id: "preauth.network", limit: 300, windowMs: 60_000, scope: "network", onStoreError: "allow" },
  // TASK-032 admin writes. Not from the spec pack (OD-032-4): documented defaults. API-016
  // is destructive and batch-wide, so it is tight; API-017 [MOCK] is a reversible flag
  // change per officer. Both grant or remove authority, so both fail closed.
  adminRedaction: { id: "admin.redaction", limit: 5, windowMs: 60_000, scope: "principal", onStoreError: "deny" },
  adminVerify: { id: "admin.verify", limit: 30, windowMs: 60_000, scope: "principal", onStoreError: "deny" },
  // OD-022-5/OD-022-6: API-003 can write a case without any prior call, so it gets its
  // own network limit. It does not cover minting: the resolver mints before route limits
  // run (only preAuthNetwork bounds session rows). Not from the spec pack: a documented default.
  // Fails open, like the pre-auth guard, so a store fault never blocks the manual-form
  // fallback (BR-023).
  submitNetwork: { id: "submit.network", limit: 30, windowMs: 60_000, scope: "network", onStoreError: "allow" },
} as const satisfies Record<string, RateLimitRule>;

export interface RateLimitStore {
  increment(key: string, windowStartMs: number, windowMs: number): Promise<number>;
  peek(key: string, windowStartMs: number): Promise<number>;
}

// Bounded: expired windows are swept at most once per sweep interval; if the map is
// still full, the oldest entry (Map insertion order) is evicted.
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly windows = new Map<string, { start: number; expires: number; count: number }>();
  private lastSweep = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly maxKeys = 10_000,
    private readonly now: () => number = Date.now,
    private readonly sweepIntervalMs = 60_000,
  ) {}

  async increment(key: string, windowStartMs: number, windowMs: number): Promise<number> {
    const entry = this.windows.get(key);
    if (entry && entry.start === windowStartMs) return ++entry.count;
    this.windows.delete(key);
    if (this.windows.size >= this.maxKeys) this.makeRoom();
    this.windows.set(key, { start: windowStartMs, expires: windowStartMs + windowMs, count: 1 });
    return 1;
  }

  async peek(key: string, windowStartMs: number): Promise<number> {
    const entry = this.windows.get(key);
    return entry && entry.start === windowStartMs ? entry.count : 0;
  }

  get size(): number {
    return this.windows.size;
  }

  private makeRoom(): void {
    const now = this.now();
    if (now - this.lastSweep >= this.sweepIntervalMs) {
      this.lastSweep = now;
      for (const [key, entry] of this.windows) if (entry.expires <= now) this.windows.delete(key);
    }
    while (this.windows.size >= this.maxKeys) {
      const oldest = this.windows.keys().next();
      if (oldest.done) break;
      this.windows.delete(oldest.value);
    }
  }
}

export type LimitDecision =
  | { ok: true; degraded?: true } // degraded: store failed and the rule fails open
  | { ok: false; reason: "limited"; retryAfterSeconds: number }
  | { ok: false; reason: "unavailable" };

// Network subject used when no trusted address is known: all such clients share it.
export const UNKNOWN_ADDRESS = "unknown";

// Keys never hold a raw network address or ID: they are HMAC-hashed (BR-023). The
// in-memory store lives in one process, so a per-process random secret is enough; the
// shared store needs a configured secret (open decision).
export function createKeyer(secret: string | Buffer = randomBytes(32)) {
  const hash = (value: string) => createHmac("sha256", secret).update(value).digest("base64url").slice(0, 32);
  return {
    principal(p: Principal): string {
      return `p:${hash(p.kind === "parent" ? `s:${p.sessionId}` : `u:${p.userId}`)}`;
    },
    network(address: string | null): string {
      return `n:${hash(address ?? UNKNOWN_ADDRESS)}`;
    },
  };
}
export type Keyer = ReturnType<typeof createKeyer>;

const validCount = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0;

export class RateLimiter {
  constructor(
    private readonly store: RateLimitStore,
    private readonly now: () => number = Date.now,
  ) {}

  get usesMemoryStore(): boolean {
    return this.store instanceof MemoryRateLimitStore;
  }

  hit(rule: RateLimitRule, subject: string): Promise<LimitDecision> {
    return this.decide(rule, subject, (key, start) => this.store.increment(key, start, rule.windowMs), (n) => n > rule.limit);
  }

  // Checks without counting (for limits that count only failures).
  peek(rule: RateLimitRule, subject: string): Promise<LimitDecision> {
    return this.decide(rule, subject, (key, start) => this.store.peek(key, start), (n) => n >= rule.limit);
  }

  private async decide(
    rule: RateLimitRule,
    subject: string,
    read: (key: string, windowStart: number) => Promise<number>,
    over: (count: number) => boolean,
  ): Promise<LimitDecision> {
    const now = this.now();
    const windowStart = Math.floor(now / rule.windowMs) * rule.windowMs;
    let count: unknown;
    try {
      count = await read(`${rule.id}:${subject}`, windowStart);
    } catch {
      count = undefined;
    }
    // A throw or a nonsense count (non-integer, negative, missing) is a store error.
    if (!validCount(count)) return rule.onStoreError === "allow" ? { ok: true, degraded: true } : { ok: false, reason: "unavailable" };
    if (!over(count)) return { ok: true };
    return { ok: false, reason: "limited", retryAfterSeconds: Math.max(1, Math.ceil((windowStart + rule.windowMs - now) / 1000)) };
  }
}

// Paid routes (BR-023) must carry both AI limits, failing closed.
export function hasPaidLimits(rules: readonly RateLimitRule[] | undefined): boolean {
  const has = (want: RateLimitRule) =>
    (rules ?? []).some((r) => r.id === want.id && r.scope === want.scope && r.limit <= want.limit && r.onStoreError === "deny");
  return has(RATE_LIMITS.aiPrincipal) && has(RATE_LIMITS.aiNetwork);
}
