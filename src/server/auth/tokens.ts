// Cookie names and HMAC-signed cookie values (D2A §9.1, §9.4).
//
// Credential session `fera_session`: u1.<user uuid>.<iat s>.<exp s>.<fp>.<mac>
//   - exp − iat is exactly 8 h; the server checks exp, it does not trust Max-Age.
//   - fp is an HMAC fingerprint of the user's current password hash, so a password reset
//     ends every session for that account. Role, verified and is_active are NOT in the
//     token: they are read from `users` on every request (D2A §9.3).
// Parent session `fera_ps`: p1.<parent_sessions uuid>.<mac> — an opaque, signed session
//   ID; expiry and revocation live in the parent_sessions row.
// With Secure cookies (production, not DEMO_MODE=1) both names carry the `__Host-`
// prefix and only the prefixed name is read, so a non-Secure or Domain cookie set by
// another origin can never stand in for it.
import { createHmac, timingSafeEqual } from "node:crypto";
import { isUuid } from "@/contracts";

export const SESSION_TTL_SECONDS = 8 * 60 * 60;
export const PARENT_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // parent_sessions default expiry
const CLOCK_SKEW_SECONDS = 60;

export type CookieNames = { session: string; parent: string };

export function cookieNames(secure: boolean): CookieNames {
  return secure ? { session: "__Host-fera_session", parent: "__Host-fera_ps" } : { session: "fera_session", parent: "fera_ps" };
}

// Every value a request carries for `name` (duplicates are kept so callers can refuse them).
export type CookieSource = (name: string) => readonly string[];

export function cookieSourceFromHeader(header: string | null): CookieSource {
  const jar = new Map<string, string[]>();
  for (const part of (header ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    const list = jar.get(name);
    if (list) list.push(value);
    else jar.set(name, [value]);
  }
  return (name) => jar.get(name) ?? [];
}

// The single value of a cookie; absent or duplicated cookies are "absent" / "ambiguous".
export function singleCookie(source: CookieSource, name: string): { state: "absent" } | { state: "ambiguous" } | { state: "one"; value: string } {
  const values = source(name);
  if (values.length === 0) return { state: "absent" };
  if (values.length > 1) return { state: "ambiguous" };
  return { state: "one", value: values[0] };
}

const mac = (key: Buffer, payload: string) => createHmac("sha256", key).update(payload).digest("base64url");

function equalMac(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const B64URL = /^[A-Za-z0-9_-]+$/;
const SECONDS = /^[1-9][0-9]{0,11}$/;

/* ---------- credential session ---------- */

export function passwordFingerprint(key: Buffer, passwordHash: string): string {
  return mac(key, `fp|${passwordHash}`).slice(0, 22);
}

export function fingerprintMatches(key: Buffer, passwordHash: string, fp: string): boolean {
  return equalMac(passwordFingerprint(key, passwordHash), fp);
}

export type SessionClaims = { userId: string; issuedAt: number; expiresAt: number; fp: string };

export function signSessionToken(key: Buffer, userId: string, passwordHash: string, nowMs: number): { token: string; expiresAt: number } {
  if (!isUuid(userId)) throw new Error("invalid user id");
  const issuedAt = Math.floor(nowMs / 1000);
  const expiresAt = issuedAt + SESSION_TTL_SECONDS;
  const body = `u1.${userId.toLowerCase()}.${issuedAt}.${expiresAt}.${passwordFingerprint(key, passwordHash)}`;
  return { token: `${body}.${mac(key, body)}`, expiresAt };
}

// Signature, shape and time checks only; the caller still loads and checks the user row.
export function verifySessionToken(key: Buffer, token: string, nowMs: number): SessionClaims | null {
  const parts = token.split(".");
  if (parts.length !== 6 || parts[0] !== "u1") return null;
  const [, userId, iat, exp, fp, sig] = parts;
  if (!isUuid(userId) || userId !== userId.toLowerCase() || !SECONDS.test(iat) || !SECONDS.test(exp)) return null;
  if (fp.length !== 22 || !B64URL.test(fp) || !B64URL.test(sig)) return null;
  if (!equalMac(mac(key, parts.slice(0, 5).join(".")), sig)) return null;
  const issuedAt = Number(iat);
  const expiresAt = Number(exp);
  const now = nowMs / 1000;
  if (expiresAt - issuedAt !== SESSION_TTL_SECONDS) return null;
  if (issuedAt > now + CLOCK_SKEW_SECONDS || expiresAt <= now) return null;
  return { userId, issuedAt, expiresAt, fp };
}

/* ---------- parent session ---------- */

// SYS-BUG-11: the parent cookie is now bound to a stable client fingerprint
// (User-Agent + IP/24). A token captured by XSS or screenshot replayed from a
// different browser/network key returns no session. The token format gains a
// 5th dot-separated part: `p1.<sessionId>.<fp>.<mac>`, where `fp` is the
// truncated HMAC of the fingerprint material. Existing tokens issued before
// this change (3-part) keep working when the fingerprint verify is permissive
// during the deprecation window — see `parentTokenFingerprint` callers and
// `verifyParentToken` for the reject path.
export function parentTokenFingerprint(key: Buffer, fingerprint: string): string {
  return mac(key, `pfp|${fingerprint}`).slice(0, 22);
}

export function signParentToken(key: Buffer, sessionId: string, fingerprint: string): string {
  if (!isUuid(sessionId)) throw new Error("invalid session id");
  const fp = parentTokenFingerprint(key, fingerprint);
  const body = `p1.${sessionId.toLowerCase()}.${fp}`;
  return `${body}.${mac(key, body)}`;
}

export function verifyParentToken(
  key: Buffer,
  token: string,
  fingerprint: string,
): string | null {
  const parts = token.split(".");
  // New 4-part shape (SYS-BUG-11) is the only accepted form going forward;
  // old 3-part tokens minted before the upgrade are invalid so they cannot
  // be replayed from a captured surface without fingerprint binding.
  if (parts.length !== 4 || parts[0] !== "p1") return null;
  const [, sessionId, fp, sig] = parts;
  if (!isUuid(sessionId) || sessionId !== sessionId.toLowerCase()) return null;
  if (fp.length !== 22 || !B64URL.test(fp) || !B64URL.test(sig)) return null;
  if (!equalMac(mac(key, `p1.${sessionId}.${fp}`), sig)) return null;
  // The token's fingerprint must match the live request's. A captured
  // cookie replayed from a different browser/network fails here.
  if (!equalMac(parentTokenFingerprint(key, fingerprint), fp)) return null;
  return sessionId;
}
