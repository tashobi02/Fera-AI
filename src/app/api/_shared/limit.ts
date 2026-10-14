// Fixed-window rate limiter (COMP-021; D1 NFR-009, BR-023; D2A API-020).
//
// COMP-021 plans Postgres `rate_limits` counters. This lane ships the store interface
// and an in-memory store only: each server instance counts on its own, so a
// multi-instance deploy (Vercel) needs the shared Postgres store before limits hold
// across instances (open decision, no Redis).
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
} as const satisfies Record<string, RateLimitRule>;

export interface RateLimitStore {
  increment(key: string, windowStartMs: number, windowMs: number): Promise<number>;
  peek(key: string, windowStartMs: number): Promise<number>;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly windows = new Map<string, { start: number; expires: number; count: number }>();

  constructor(
    private readonly maxKeys = 10_000,
    private readonly now: () => number = Date.now,
  ) {}

  async increment(key: string, windowStartMs: number, windowMs: number): Promise<number> {
    const entry = this.windows.get(key);
    if (entry && entry.start === windowStartMs) return ++entry.count;
    if (this.windows.size >= this.maxKeys) this.sweep();
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

  private sweep(): void {
    const now = this.now();
    for (const [key, entry] of this.windows) if (entry.expires <= now) this.windows.delete(key);
  }
}

export type LimitDecision =
  | { ok: true; degraded?: true } // degraded: store failed and the rule fails open
  | { ok: false; reason: "limited"; retryAfterSeconds: number }
  | { ok: false; reason: "unavailable" };

// Keys never hold a raw network address: it is HMAC-hashed (BR-023). The in-memory
// store lives in one process, so a per-process random secret is enough; the shared
// store will need a configured secret (open decision).
export function createKeyer(secret: string | Buffer = randomBytes(32)) {
  const hash = (value: string) => createHmac("sha256", secret).update(value).digest("base64url").slice(0, 32);
  return {
    principal(p: Principal): string {
      return `p:${hash(p.kind === "parent" ? `s:${p.sessionId}` : `u:${p.userId}`)}`;
    },
    network(address: string | null): string {
      return `n:${hash(address ?? "unknown")}`;
    },
  };
}
export type Keyer = ReturnType<typeof createKeyer>;

export class RateLimiter {
  constructor(
    private readonly store: RateLimitStore,
    private readonly now: () => number = Date.now,
  ) {}

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
    let count: number;
    try {
      count = await read(`${rule.id}:${subject}`, windowStart);
    } catch {
      return rule.onStoreError === "allow" ? { ok: true, degraded: true } : { ok: false, reason: "unavailable" };
    }
    if (!over(count)) return { ok: true };
    return { ok: false, reason: "limited", retryAfterSeconds: Math.max(1, Math.ceil((windowStart + rule.windowMs - now) / 1000)) };
  }
}
