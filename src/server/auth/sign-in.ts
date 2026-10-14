// API-020 credential sign-in (D2A §5.5, §9.4; D3 SCREEN-008; FR-037).
//
// - Every failure is the same generic E-002: malformed body, wrong content type, unknown
//   username, wrong password, inactive account (parseSignInRequest never yields E-001).
// - Unknown user and wrong password cost the same: one lookup and one argon2 verify each
//   (verifyPassword uses a dummy hash when there is no usable stored hash).
// - E-007 after five failures per minute per hashed network key. Only failures count:
//   `peek` before the attempt, `hit` after a failure (RATE_LIMITS.signInFailures). This
//   limiter is in-memory per instance (API-OD-1).
// - No audit row: the contracts' audit actions have no sign-in event; the request log
//   line records the outcome with error ID and reason only.
import { LIMITS, type SessionView } from "@/contracts";
import { parseSignInRequest } from "@/contracts/server";
import type { CookieJar } from "@/app/api/_shared/cookies";
import { ApiError } from "@/app/api/_shared/envelope";
import { MemoryRateLimitStore, RATE_LIMITS, RateLimiter, createKeyer, type Keyer, type RateLimitRule } from "@/app/api/_shared/limit";
import { clientAddress, readJsonBody, trustProxyFromEnv } from "@/app/api/_shared/request";
import { z } from "zod";
import { verifyPassword } from "./password";
import type { Auth } from "./session";
import type { AuthStore } from "./store";

export type SignInDeps = {
  auth: Auth;
  store: AuthStore;
  limiter?: RateLimiter;
  keyer?: Keyer;
  rule?: RateLimitRule;
  trustProxy?: boolean;
};

const anyJson = z.unknown();

export function createSignIn(deps: SignInDeps) {
  const limiter = deps.limiter ?? new RateLimiter(new MemoryRateLimitStore());
  const keyer = deps.keyer ?? createKeyer();
  const rule = deps.rule ?? RATE_LIMITS.signInFailures;
  const trustProxy = deps.trustProxy ?? trustProxyFromEnv();

  return async function signIn(req: Request, cookies: CookieJar): Promise<SessionView> {
    deps.auth.checkKeys();
    const subject = keyer.network(clientAddress(req, trustProxy));
    const gate = await limiter.peek(rule, subject);
    if (!gate.ok && gate.reason === "limited") throw new ApiError("E-007", { seconds: gate.retryAfterSeconds, reason: "ratelimit" });

    const fail = async (): Promise<never> => {
      await limiter.hit(rule, subject);
      throw new ApiError("E-002", { reason: "credentials" });
    };

    let body: unknown;
    try {
      body = await readJsonBody(req, anyJson, LIMITS.jsonBodyBytes);
    } catch {
      return fail();
    }
    const parsed = parseSignInRequest(body);
    if (!parsed.ok) return fail();

    const user = await deps.store.userByUsername(parsed.data.username);
    const passwordOk = await verifyPassword(user?.password_hash, parsed.data.password);
    if (!user || !passwordOk || !user.is_active) return fail();
    return deps.auth.startSession(user, cookies);
  };
}
