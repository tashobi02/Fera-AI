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
// minted on API-001/002 (first intake call, D2A §9.1) when no usable parent session
// exists; an expired, revoked, unknown or forged parent cookie counts as none there.
// OD-022-5 (decided by Mahim, 2026-10-17): API-003 also mints, but only when the
// browser sends no parent cookie at all: a parent who submits without an intake call
// (the S-005 manual form, or S-002 before API-001/002 exist). A present but unusable
// parent cookie on API-003 stays E-002, so a dead session is never silently replaced;
// that response also clears the dead cookie, so the parent's next submit starts a new
// session instead of being locked out until the cookie expires (security review W2).
// Phone OTP for parents stays deferred (D6; OQ-020, after the finale).
import { toDhakaIso, type SessionView } from "@/contracts";
import { parentPrincipal, userPrincipal, type ApiId, type Principal } from "@/contracts/server";
import type { CookieJar } from "@/app/api/_shared/cookies";
import type { PrincipalResolver } from "@/app/api/_shared/compose";
import { clientAddress, trustProxyFromEnv } from "@/app/api/_shared/request";
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
// Mint only when no parent cookie is present (OD-022-5).
export const MINTING_IF_NO_PARENT_COOKIE: readonly ApiId[] = ["API-003"];

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
  const trustProxy = trustProxyFromEnv();

  // Parent cookies bind to User-Agent and the normalized trusted-proxy address
  // (exact IPv4; IPv6 /64; null without a trusted proxy). A changed fingerprint
  // invalidates the cookie. Headers are not proof of identity; this supplements
  // the signature and DB session checks. Only its keyed hash enters the cookie.
  const parentFingerprintFor = (req: Request | null): string => {
    const ip = clientAddress(req ?? new Request("http://x/"), trustProxy);
    const ua = req?.headers.get("user-agent") ?? "";
    return `${ip}|${ua}`;
  };

  async function userFromToken(token: string): Promise<Principal | null> {
    const key = deps.keys.session();
    const claims = verifySessionToken(key, token, now());
    if (!claims) return null;
    const row = await deps.store.userById(claims.userId);
    if (!row || !row.is_active || !fingerprintMatches(key, row.password_hash, claims.fp)) return null;
    return userPrincipal(row);
  }

  async function parentFromToken(token: string, fingerprint: string): Promise<Principal | null> {
    const sessionId = verifyParentToken(deps.keys.parent(), token, fingerprint);
    if (!sessionId) return null;
    return parentPrincipal(await deps.store.parentSession(sessionId), now());
  }

  // Read-only resolution (server components and every non-minting route).
  async function principalFrom(
    source: CookieSource,
    secure: boolean,
    fingerprint: string,
  ): Promise<Principal | null> {
    const names = cookieNames(secure);
    const session = singleCookie(source, names.session);
    if (session.state !== "absent") return session.state === "one" ? userFromToken(session.value) : null;
    const parent = singleCookie(source, names.parent);
    return parent.state === "one" ? parentFromToken(parent.value, fingerprint) : null;
  }

  async function mintParent(req: Request, cookies: CookieJar): Promise<Principal | null> {
    const row = await deps.store.createParentSession();
    const principal = parentPrincipal(row, now());
    if (!principal) return null;
    const remaining = Math.floor((Date.parse(row.expires_at) - now()) / 1000);
    cookies.set(
      cookieNames(cookies.secure).parent,
      signParentToken(deps.keys.parent(), row.id, parentFingerprintFor(req)),
      {
        maxAgeSeconds: Math.max(0, Math.min(PARENT_COOKIE_MAX_AGE_SECONDS, remaining)),
      },
    );
    return principal;
  }

  // The API layer's resolver seam ({ req, api, cookies }, compose.ts).
  const resolvePrincipal: PrincipalResolver = async ({ req, api, cookies }) => {
    const source = cookieSourceFromHeader(req.headers.get("cookie"));
    const fingerprint = parentFingerprintFor(req);
    const principal = await principalFrom(source, cookies.secure, fingerprint);
    if (principal) return principal;
    const names = cookieNames(cookies.secure);
    // A credential cookie that failed means "sign in again", never "become a parent",
    // and never touch the parent cookie: it may still be valid (the credential cookie
    // decided alone, so the parent cookie was not even read).
    if (singleCookie(source, names.session).state !== "absent") return null;
    if (MINTING_IF_NO_PARENT_COOKIE.includes(api) && singleCookie(source, names.parent).state !== "absent") {
      cookies.clear(names.parent); // dead parent cookie: E-002 now; the next submit mints (OD-022-5)
      return null;
    }
    const mints = MINTING_APIS.includes(api) || MINTING_IF_NO_PARENT_COOKIE.includes(api);
    if (!mints) return null;
    return mintParent(req, cookies);
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
