// Page guards for server components (S-008/S-012/S-013 and the desk pages; D3 §1).
//
//   const { principal, role } = await requireRole(["officer"], "/officer/case/abc");
//
// - No principal → redirect to /sign-in?next=<same-origin path> (E-002 → SCREEN-008 →
//   return to the same URL), except on parent-only pages: parents have no account, so
//   they get the not-found page instead.
// - Signed in with the wrong effective role → an `access.denied` audit through the
//   page-denial hook, then notFound() (SCREEN-016, same as E-004), so a page never
//   confirms that a record or an area exists (BR-010, D2B E-004). An unverified officer
//   has staff permissions (BR-024).
// - The hook is TASK-015's audit writer (setPageAuditDenied, or the `auditDenied` option).
//   Until one is installed, or when it throws, the guard fails closed: it throws, so the
//   visitor sees the error page rather than SCREEN-016 — mirroring the API layer, where a
//   signed-in denial without audit is E-021 (compose.ts).
// - Reads the raw Cookie header, so duplicated cookies are refused exactly as in route
//   handlers. It never mints a parent session (that happens on API-001/002).
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { effectiveRole, type EffectiveRole, type Principal } from "@/contracts/server";
import { isProductionEnv, secureCookiesFor } from "@/app/api/_shared/cookies";
import { safeReturnPath, signInPath } from "@/lib/auth-paths";
import { defaultAuth } from "./default";
import { cookieSourceFromHeader } from "./tokens";

// Return-path and role-home helpers live in src/lib/auth-paths.ts (pure, shared with the
// SCREEN-008 client form) and are re-exported here for the page guards' callers.
export { SIGN_IN_PATH, roleHome, safeReturnPath, signInPath } from "@/lib/auth-paths";

export type AccessDecision = { kind: "ok"; principal: Principal; role: EffectiveRole } | { kind: "sign-in" } | { kind: "not-found" };

export function decideAccess(principal: Principal | null, allowed: readonly EffectiveRole[]): AccessDecision {
  const role = effectiveRole(principal);
  if (principal && role && allowed.includes(role)) return { kind: "ok", principal, role };
  if (role) return { kind: "not-found" };
  const parentOnly = allowed.length > 0 && allowed.every((r) => r === "parent");
  return parentOnly ? { kind: "not-found" } : { kind: "sign-in" };
}

export type PageDeniedInput = {
  principal: Principal;
  role: EffectiveRole;
  path: string; // pathname only, no query
  errorId: "E-004";
  reason: "role";
  caseId: null; // a page guard denies before any record is loaded
};
// Writes the `access.denied` audit row for a page denial (TASK-015). A throw fails closed.
export type PageAuditDenied = (input: PageDeniedInput) => Promise<void>;

export class PageAuditUnavailableError extends Error {
  constructor() {
    super("page denial audit unavailable");
    this.name = "PageAuditUnavailableError";
  }
}

let pageAuditDenied: PageAuditDenied | null = null;

// TASK-015 installs the audit writer here at server start.
export function setPageAuditDenied(hook: PageAuditDenied | null): void {
  pageAuditDenied = hook;
}

export async function currentPrincipal(): Promise<Principal | null> {
  const cookieHeader = (await headers()).get("cookie");
  return defaultAuth().principalFrom(cookieSourceFromHeader(cookieHeader), secureCookiesFor(isProductionEnv()));
}

export async function requireRole(
  allowed: readonly EffectiveRole[],
  returnTo: string,
  opts: { auditDenied?: PageAuditDenied } = {},
): Promise<{ principal: Principal; role: EffectiveRole }> {
  const principal = await currentPrincipal();
  const decision = decideAccess(principal, allowed);
  if (decision.kind === "sign-in") redirect(signInPath(returnTo));
  if (decision.kind === "not-found") {
    const role = effectiveRole(principal);
    if (principal && role) {
      const hook = opts.auditDenied ?? pageAuditDenied;
      if (!hook) throw new PageAuditUnavailableError();
      const path = safeReturnPath(returnTo)?.split("?", 1)[0] ?? "/";
      await hook({ principal, role, path, errorId: "E-004", reason: "role", caseId: null });
    }
    notFound();
  }
  return { principal: decision.principal, role: decision.role };
}
