// App Router not-found for every route, desk routes included (TASK-031; D3 SCREEN-016).
// It renders for unknown URLs and for every notFound() call: requireRole's wrong-role
// denial (after its access.denied audit), parent-only pages without a parent session,
// and record pages that hide a case (E-004). Next answers with HTTP 404.
//
// The only input is the viewer: their effective role picks the surface and the home link.
// The reason for the refusal is never an input, so E-003 and E-004 look the same.
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { createLogger, describeError } from "@/app/api/_shared/log";
import { NotFoundScreen } from "@/app/components/not-found-screen";
import { effectiveRole, type EffectiveRole } from "@/contracts/access";
import { getLocale } from "@/lib/locale-server";
import { notFoundView } from "@/lib/not-found";
import { locales } from "@/locales";
import { currentPrincipal } from "@/server/auth/require-role";

const logger = createLogger();

// SC 2.4.2: the tab title names the outcome, in the current language.
export async function generateMetadata(): Promise<Metadata> {
  return { title: locales[await getLocale()].notFoundTitle };
}

// A failed session lookup (database down, missing key) only changes the surface and home
// link, so it falls back to the signed-out view instead of replacing a 404 with a 500.
// It is logged by event and error class only: no cookie, path or principal.
async function viewerRole(): Promise<EffectiveRole | null> {
  try {
    return effectiveRole(await currentPrincipal());
  } catch (err) {
    unstable_rethrow(err); // keep Next's own control-flow errors (dynamic rendering)
    logger.warn({ event: "page.viewer_lookup_failed", ...describeError(err) });
    return null;
  }
}

export default async function NotFound() {
  const [locale, role] = await Promise.all([getLocale(), viewerRole()]);
  return <NotFoundScreen locale={locale} view={notFoundView(role)} />;
}
