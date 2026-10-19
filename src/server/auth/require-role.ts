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
// - The hook is TASK-015's audit writer (src/server/audit/denied.ts), installed as the
//   default below; setPageAuditDenied or the `auditDenied` option replace it. With no
//   hook (setPageAuditDenied(null)), or when it throws, the guard fails closed: it throws,
//   so the visitor sees the error page rather than SCREEN-016 — mirroring the API layer,
//   where a signed-in denial without audit is E-021 (compose.ts). A hook failure is
//   logged as audit.unavailable and rethrown as PageAuditUnavailableError.
// - Reads the raw Cookie header, so duplicated cookies are refused exactly as in route
//   handlers. It never mints a parent session (that happens on API-001/002).
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { effectiveRole, type EffectiveRole, type Principal } from "@/contracts/server";
import { isProductionEnv, secureCookiesFor } from "@/app/api/_shared/cookies";
import { createLogger, describeError } from "@/app/api/_shared/log";
import { clientAddress, trustProxyFromEnv } from "@/app/api/_shared/request";
import { safeReturnPath, signInPath } from "@/lib/auth-paths";
import { auditPageDenied } from "@/server/audit/denied";
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

// TASK-015: the access.denied writer is installed by default (one audit_log row as fera_app).
let pageAuditDenied: PageAuditDenied | null = auditPageDenied;
const logger = createLogger();

// Replaces the installed hook; null removes it, so a denial fails closed.
export function setPageAuditDenied(hook: PageAuditDenied | null): void {
  pageAuditDenied = hook;
}

export async function currentPrincipal(): Promise<Principal | null> {
  // SYS-BUG-11: parent tokens are bound to a client fingerprint, so page
  // guards compute the same one as the route layer. Server components only
  // expose the request headers (no `Request` object), so we rebuild a stub
  // Request from them; trustProxy resolves the same way as in routes.
  const requestHeaders = await headers();
  const stub = new Request("http://x/", { headers: requestHeaders });
  const fingerprint = `${clientAddress(stub, trustProxyFromEnv())}|${requestHeaders.get("user-agent") ?? ""}`;
  const cookieHeader = requestHeaders.get("cookie");
  return defaultAuth().principalFrom(cookieSourceFromHeader(cookieHeader), secureCookiesFor(isProductionEnv()), fingerprint);
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
      try {
        await hook({ principal, role, path, errorId: "E-004", reason: "role", caseId: null });
      } catch (err) {
        // Safe facts only (class, code, frame), then fail closed to the error page.
        logger.error({ event: "audit.unavailable", stage: "audit", error_id: "E-021", original_error_id: "E-004", ...describeError(err) });
        throw new PageAuditUnavailableError();
      }
    }
    notFound();
  }
  return { principal: decision.principal, role: decision.role };
}
