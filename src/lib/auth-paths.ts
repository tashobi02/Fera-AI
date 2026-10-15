// Pure sign-in routing helpers (TASK-006/031; D3 §1 role homes, §6 auth flow, SCREEN-008).
// No next/* or server imports, so the SCREEN-008 client form and the server page guards
// share one implementation. src/server/auth/require-role.ts re-exports these.
import type { EffectiveRole } from "@/contracts/access";
import type { UserRole } from "@/contracts";

export const SIGN_IN_PATH = "/sign-in";
const RETURN_MAX_CHARS = 512;

// Only a same-origin absolute path survives; anything else returns to the role home.
// Dot segments are refused before parsing (also as %2e), because URL normalisation can
// turn "/a/..//evil.example" into "//evil.example"; the normalised result must still
// start with exactly one "/".
const DOT_SEGMENT = /^(?:\.|%2e){1,2}$/i;

export function safeReturnPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > RETURN_MAX_CHARS) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  // Control characters, whitespace and backslashes are refused outright.
  if (/[\u0000-\u0020\u007f\\]/.test(raw)) return null;
  const path = raw.split(/[?#]/, 1)[0];
  if (path.split("/").some((segment) => DOT_SEGMENT.test(segment))) return null;
  const parsed = new URL(raw, "http://fera.invalid");
  if (parsed.origin !== "http://fera.invalid") return null;
  const out = `${parsed.pathname}${parsed.search}`;
  if (!out.startsWith("/") || out.startsWith("//") || out.startsWith("/\\")) return null;
  return out;
}

export function signInPath(returnTo: string | null | undefined): string {
  const next = safeReturnPath(returnTo);
  return next && next !== SIGN_IN_PATH ? `${SIGN_IN_PATH}?next=${encodeURIComponent(next)}` : SIGN_IN_PATH;
}

// D3 §1 role homes; an unverified officer works the staff desk (BR-024). The desk homes
// S-007 (/staff), S-009 (/officer) and S-013 (/admin) are planned paths owned elsewhere.
export function roleHome(role: EffectiveRole): string {
  return role === "parent" ? "/" : `/${role}`;
}

// The SessionView API-020 returns (role and verified are server-derived).
export type SignedInSession = { role: UserRole; verified: boolean };

export function homeForSession(session: SignedInSession): string {
  if (session.role === "officer") return roleHome(session.verified ? "officer" : "staff");
  return roleHome(session.role);
}

// D3 §1 desk entry points: they lead to S-008, and from there to the role home.
export const DESK_ENTRY_PATHS: readonly string[] = ["/staff", "/officer", "/admin"];

function pathnameOf(safe: string): string {
  const pathname = safe.split("?", 1)[0];
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

// The page the visitor opened before sign-in (session expiry, D3 §6), or null when the
// visit was a plain entry (/, /sign-in or a desk entry root), which lands on the role home.
// API routes and build assets are never pages to return to.
const NOT_PAGES = ["/api", "/_next"];

export function returnTarget(next: string | null | undefined): string | null {
  const safe = safeReturnPath(next);
  if (!safe) return null;
  const pathname = pathnameOf(safe);
  if (pathname === "/" || pathname === SIGN_IN_PATH || DESK_ENTRY_PATHS.includes(pathname)) return null;
  if (NOT_PAGES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return null;
  return safe;
}

const firstSegment = (path: string) => pathnameOf(path).split("/")[1] ?? "";

// D3 §1: admins also read S-011 (map) and S-012 (case detail), which live under /officer.
const ADMIN_READ_PATHS = ["/officer/map", "/officer/case"];

const within = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

// After API-020 succeeds: back to the same URL (D3 §6) when the signed-in role may open
// it (its own area, plus the admin read pages), else the role home. So an unverified
// officer whose session expired on /officer/... lands on /staff instead of a SCREEN-016
// plus an access.denied row (OD-031-7).
export function destinationAfterSignIn(session: SignedInSession, next: string | null | undefined): string {
  const home = homeForSession(session);
  const target = returnTarget(next);
  if (!target) return home;
  if (firstSegment(target) === firstSegment(home)) return target;
  const adminRead = session.role === "admin" && ADMIN_READ_PATHS.some((prefix) => within(pathnameOf(target), prefix));
  return adminRead ? target : home;
}

export type SignInAudience = "staff" | "officer" | "admin";

// D4 §14: SCREEN-008 names the role in its title, taken from the area being entered.
export function signInAudience(next: string | null | undefined): SignInAudience | null {
  const safe = safeReturnPath(next);
  if (!safe) return null;
  const first = pathnameOf(safe).split("/")[1];
  return first === "staff" || first === "officer" || first === "admin" ? first : null;
}

// Reads role and verified from an API-020 success body. Anything else gives null, and the
// form shows the generic error rather than guessing a destination.
export function parseSignedInSession(body: unknown): SignedInSession | null {
  if (typeof body !== "object" || body === null) return null;
  const { role, verified } = body as Record<string, unknown>;
  if ((role === "staff" || role === "officer" || role === "admin") && typeof verified === "boolean") return { role, verified };
  return null;
}
