// Principal resolution and credential sessions (TASK-006; D2A §9.1–9.4; BR-024).
//
// Every request rebuilds the Principal from database rows through the contracts'
// userPrincipal()/parentPrincipal(): the user row (role, verified, is_active, password
// fingerprint) or the parent_sessions row (unexpired, unrevoked) is read each time.
// Cookies only carry a signed ID; role, owner and verification flags from the browser
// (cookies, headers or body) have no authority.
//
// Precedence: a credential-session cookie, if present, decides alone. A present but
// invalid one (bad signature, expired, inactive, password changed, duplicated) gives no
// principal (E-002, sign in again) and never falls back to a parent session.
// Without one, a valid parent cookie gives the parent principal. The parent session is
// minted only on API-001/002 (first intake call, D2A §9.1) when no usable parent
// session exists; an expired, revoked, unknown or forged parent cookie counts as none.
import { toDhakaIso, type SessionView } from "@/contracts";
import { parentPrincipal, userPrincipal, type ApiId, type Principal } from "@/contracts/server";
import type { CookieJar } from "@/app/api/_shared/cookies";
import type { PrincipalResolver } from "@/app/api/_shared/compose";
import type { AuthStore, AuthUserRow } from "./store";
import {
  PARENT_COOKIE_MAX_AGE_SECONDS,
  SESSION_TTL_SECONDS,
  cookieNames,
  cookieSourceFromHeader,
  fingerprintMatches,
  signParentToken,
  signSessionToken,
  singleCookie,
  verifyParentToken,
  verifySessionToken,
  type CookieSource,
} from "./tokens";

export const MINTING_APIS: readonly ApiId[] = ["API-001", "API-002"];

// Each key is loaded on use from the environment, and only where it is needed, so a
// missing PARENT_COOKIE_KEY never breaks staff sign-in and vice versa.
export type AuthKeys = { session: () => Buffer; parent: () => Buffer };

export type AuthDeps = {
  store: AuthStore;
  keys: AuthKeys;
  now?: () => number;
};

export function createAuth(deps: AuthDeps) {
  const now = deps.now ?? Date.now;

  async function userFromToken(token: string): Promise<Principal | null> {
    const key = deps.keys.session();
    const claims = verifySessionToken(key, token, now());
    if (!claims) return null;
    const row = await deps.store.userById(claims.userId);
    if (!row || !row.is_active || !fingerprintMatches(key, row.password_hash, claims.fp)) return null;
    return userPrincipal(row);
  }

  async function parentFromToken(token: string): Promise<Principal | null> {
    const sessionId = verifyParentToken(deps.keys.parent(), token);
    if (!sessionId) return null;
    return parentPrincipal(await deps.store.parentSession(sessionId), now());
  }

  // Read-only resolution (server components and every non-minting route).
  async function principalFrom(source: CookieSource, secure: boolean): Promise<Principal | null> {
    const names = cookieNames(secure);
    const session = singleCookie(source, names.session);
    if (session.state !== "absent") return session.state === "one" ? userFromToken(session.value) : null;
    const parent = singleCookie(source, names.parent);
    return parent.state === "one" ? parentFromToken(parent.value) : null;
  }

  async function mintParent(cookies: CookieJar): Promise<Principal | null> {
    const row = await deps.store.createParentSession();
    const principal = parentPrincipal(row, now());
    if (!principal) return null;
    const remaining = Math.floor((Date.parse(row.expires_at) - now()) / 1000);
    cookies.set(cookieNames(cookies.secure).parent, signParentToken(deps.keys.parent(), row.id), {
      maxAgeSeconds: Math.max(0, Math.min(PARENT_COOKIE_MAX_AGE_SECONDS, remaining)),
    });
    return principal;
  }

  // The API layer's resolver seam ({ req, api, cookies }, compose.ts).
  const resolvePrincipal: PrincipalResolver = async ({ req, api, cookies }) => {
    const source = cookieSourceFromHeader(req.headers.get("cookie"));
    const principal = await principalFrom(source, cookies.secure);
    if (principal || !MINTING_APIS.includes(api)) return principal;
    // A credential cookie that failed means "sign in again", never "become a parent".
    if (singleCookie(source, cookieNames(cookies.secure).session).state !== "absent") return null;
    return mintParent(cookies);
  };

  // Starts an 8-hour credential session for an already verified account.
  function startSession(user: AuthUserRow, cookies: CookieJar): SessionView {
    const { token, expiresAt } = signSessionToken(deps.keys.session(), user.id, user.password_hash, now());
    cookies.set(cookieNames(cookies.secure).session, token, { maxAgeSeconds: SESSION_TTL_SECONDS });
    const p = userPrincipal(user);
    return {
      user_id: user.id.toLowerCase(),
      display_name: user.display_name,
      role: user.role,
      verified: p?.kind === "user" ? p.verified : false,
      expires_at: toDhakaIso(expiresAt * 1000),
    };
  }

  // Throws when the session key is missing or short, so a misconfigured server fails the
  // same way for right and wrong credentials (no password oracle).
  function checkKeys(): void {
    deps.keys.session();
  }

  function endSession(cookies: CookieJar): void {
    cookies.clear(cookieNames(cookies.secure).session);
  }

  return { resolvePrincipal, principalFrom, startSession, endSession, checkKeys };
}

export type Auth = ReturnType<typeof createAuth>;
