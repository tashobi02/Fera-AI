// Desk shells (staff / officer / admin). The root layout already provides <html>, the
// shared AppHeader and <main>, so this layout only adds the per-account strip that each
// signed-in desk needs: who you are and the sign-out control (ACT-029, COMP-047).
//
// It reads the principal with currentPrincipal() purely to decide whether to render the
// strip. It never grants access — every page below still calls requireRole() itself, and a
// signed-out visitor (or the wrong role) is still redirected by that guard. currentPrincipal
// returns null instead of throwing, so a signed-out /staff request renders no strip and then
// the page guard sends them to sign-in as before.
//
// The parent (no-login) screens live under (parent) and are deliberately untouched: parents
// have no desk session, so they keep the plain header with no sign-out control.
import type { ReactNode } from "react";
import { SignOutButton } from "@/app/components/sign-out-button";
// @/contracts/access is the client-safe permission barrel (it re-exports effectiveRole
// and Principal); @/contracts/server is off-limits to UI/layer code by the lint rule.
import { effectiveRole } from "@/contracts/access";
import { getLocale } from "@/lib/locale-server";
import { currentPrincipal } from "@/server/auth/require-role";
import { locales } from "@/locales";

export default async function DeskLayout({ children }: { children: ReactNode }) {
  const [principal, locale] = await Promise.all([currentPrincipal(), getLocale()]);
  const t = locales[locale];
  const role = effectiveRole(principal);
  // Only credential (staff/officer/admin) desks show the strip; a parent principal never
  // reaches a desk route, and an anonymous one gets no control to click.
  const showStrip = role === "staff" || role === "officer" || role === "admin";
  const roleLabel = role === "admin" ? t.roleAdmin : role === "officer" ? t.roleOfficer : role === "staff" ? t.roleStaff : "";

  return (
    <>
      {showStrip && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline-soft bg-elevated px-4 py-1.5">
          <span className="text-body-sm text-mute">
            <span lang="en" translate="no" className="font-medium text-ink">
              {roleLabel}
            </span>
          </span>
          <SignOutButton locale={locale} />
        </div>
      )}
      {children}
    </>
  );
}