// Page guards for server components (S-008/S-012/S-013 and the desk pages; D3 §1).
//
//   const { principal, role } = await requireRole(["officer"], "/officer/case/abc");
//
// - No principal → redirect to /sign-in?next=<same-origin path> (E-002 → SCREEN-008 →
//   return to the same URL), except on parent-only pages: parents have no account, so
//   they get the not-found page instead.
// - Signed in with the wrong effective role → notFound() (SCREEN-016, same as E-004), so a
//   page never confirms that a record or an area exists. An unverified officer has staff
//   permissions (BR-024).
// - Reads cookies only; it never mints a parent session (that happens on API-001/002).
// A page that loads a specific record still owes the access.denied audit for a hidden
// record through the case service (TASK-015).
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { effectiveRole, type EffectiveRole, type Principal } from "@/contracts/server";
import { isProductionEnv, secureCookiesFor } from "@/app/api/_shared/cookies";
import { defaultAuth } from "./default";

export const SIGN_IN_PATH = "/sign-in";
const RETURN_MAX_CHARS = 512;

// Only a same-origin absolute path survives; anything else returns to the role home.
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > RETURN_MAX_CHARS) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  // Control characters, whitespace and backslashes are refused outright.
  if (/[\u0000- \u007f\\]/.test(raw)) return null;
  const parsed = new URL(raw, "http://fera.invalid");
  if (parsed.origin !== "http://fera.invalid") return null;
  return `${parsed.pathname}${parsed.search}`;
}

export function signInPath(returnTo: string | null | undefined): string {
  const next = safeReturnPath(returnTo);
  return next && next !== SIGN_IN_PATH ? `${SIGN_IN_PATH}?next=${encodeURIComponent(next)}` : SIGN_IN_PATH;
}

// D3 §1 role homes; an unverified officer works the staff desk.
export function roleHome(role: EffectiveRole): string {
  return role === "parent" ? "/" : `/${role}`;
}

export type AccessDecision = { kind: "ok"; principal: Principal; role: EffectiveRole } | { kind: "sign-in" } | { kind: "not-found" };

export function decideAccess(principal: Principal | null, allowed: readonly EffectiveRole[]): AccessDecision {
  const role = effectiveRole(principal);
  if (principal && role && allowed.includes(role)) return { kind: "ok", principal, role };
  if (role) return { kind: "not-found" };
  const parentOnly = allowed.length > 0 && allowed.every((r) => r === "parent");
  return parentOnly ? { kind: "not-found" } : { kind: "sign-in" };
}

export async function currentPrincipal(): Promise<Principal | null> {
  const store = await cookies();
  return defaultAuth().principalFrom((name) => store.getAll(name).map((c) => c.value), secureCookiesFor(isProductionEnv()));
}

export async function requireRole(
  allowed: readonly EffectiveRole[],
  returnTo: string,
): Promise<{ principal: Principal; role: EffectiveRole }> {
  const decision = decideAccess(await currentPrincipal(), allowed);
  if (decision.kind === "sign-in") redirect(signInPath(returnTo));
  if (decision.kind === "not-found") notFound();
  return { principal: decision.principal, role: decision.role };
}
