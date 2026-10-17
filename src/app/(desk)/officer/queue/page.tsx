// SCREEN-009 review queue list (TASK-027; FR-012, FR-014; D3 SCREEN-009, COMP-035/036).
// Verified officers only: requireRole sends anyone else to sign-in or SCREEN-016, and
// an unverified officer has staff permissions, so they never see the queue (D1 BR-024).
// The page is server-rendered: one snapshot of the queue at request time, the strict
// per-role DTO projection (no raw row leakage), and the linked `/officer/match/[id]`
// detail per candidate (TASK-028). Loading and error states are described in D3 and
// use the same honest copy as the desk surface.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "@/lib/locale-server";
import { locales } from "@/locales";
import { auditPageDenied } from "@/server/audit";
import { requireRole } from "@/server/auth/require-role";
import { readReviewQueue } from "@/server/matching/queue-read";
import { OfficerQueueList } from "./queue-list";

export async function generateMetadata(): Promise<Metadata> {
  return { title: locales[await getLocale()].officerQueuePageTitle };
}

export default async function OfficerQueuePage() {
  const { principal, role } = await requireRole(["officer"], "/officer/queue");
  const result = await readReviewQueue(principal, { limit: 20 });
  if (result.kind === "hidden") {
    // The route would be E-004: write a null-FK denial (BR-010, TC-052) and notFound().
    await auditPageDenied({ principal, role, path: "/officer/queue", errorId: "E-004", reason: "role", caseId: null });
    notFound();
  }
  const locale = await getLocale();
  const t = locales[locale];
  const view = result.kind === "ok" ? result.view : { items: [], next_cursor: null };
  return (
    <div data-surface="desk" className="mx-auto flex w-full max-w-[64rem] flex-1 flex-col gap-6 px-[16px] py-8 sm:py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-heading-3 font-semibold text-ink [&:lang(en)]:font-bold [&:lang(en)]:tracking-[-0.25px]">
          {t.officerQueueTitle}
        </h1>
        <p className="text-body-sm text-mute">{t.officerQueueIntro}</p>
        <p className="mt-1 flex w-fit items-baseline gap-x-2 rounded-md border border-dashed border-hairline-strong px-3 py-2 text-body-sm text-body">
          <span className="rounded-xs border border-dashed border-hairline-strong px-2 text-caption-md font-medium [&:lang(bn)]:text-body-sm">{t.mockLabel}</span>
          <span>{t.officerQueueSyntheticNote}</span>
        </p>
      </div>
      <OfficerQueueList locale={locale} view={view} />
    </div>
  );
}
