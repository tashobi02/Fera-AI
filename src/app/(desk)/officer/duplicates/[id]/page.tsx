// SCREEN-014 link detail (TASK-051; FR-023; SCREEN-014). Owner: Masnun.
//
// Verified officer opens a flagged duplicate link: a compare-and-decide view that
// shows the two same-kind reports side by side through the safe OfficerCaseRow
// DTOs (masked phone, the documented allowlist), the link's own similarity +
// rule, and the form to record same child or different. The page never sees a
// raw row, never a raw contact phone, and never a child payload beyond the
// compare shape. Other roles reach SCREEN-016 via the page guard (BR-010,
// TC-052), with an access.denied audit through the page-denial hook.
//
// Honest-copy rules:
//   - "Similarity" label, never probability (D4 §score).
//   - The "shared phone only" rule disables the "Same child" button (BR-021).
//   - Synthetic and [MOCK] labels are kept visible at all times.
//   - The note "shared phone alone cannot confirm same child" is shown for
//     phone-only links even when the "Different" path remains usable.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "@/lib/locale-server";
import { locales } from "@/locales";
import { newRequestId } from "@/app/api/_shared";
import { auditPageDenied } from "@/server/audit";
import { requireRole } from "@/server/auth/require-role";
import { readDuplicate } from "@/server/duplicates/read";
import { DuplicateReview } from "./duplicate-review";

export async function generateMetadata(): Promise<Metadata> {
  return { title: locales[await getLocale()].duplicateDetailPageTitle };
}

export default async function DuplicateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { principal, role } = await requireRole(["officer"], `/officer/duplicates/${id}`);
  const result = await readDuplicate(principal, id, { requestId: newRequestId() });
  if (result.kind === "hidden") {
    // Same as the API route (BR-010, TC-052): an absent or unreadable link leaves a
    // safe access.denied row with a null FK. A failing audit throws, so the page
    // fails closed.
    await auditPageDenied({ principal, role, path: "/officer/duplicates/[id]", errorId: "E-004", reason: "role", caseId: null });
    notFound();
  }
  const locale = await getLocale();
  const t = locales[locale];
  return (
    <div data-surface="desk" className="mx-auto flex w-full max-w-[64rem] flex-1 flex-col gap-6 px-[16px] py-8 sm:py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-heading-3 font-semibold text-ink [&:lang(en)]:font-bold [&:lang(en)]:tracking-[-0.25px]">{t.duplicateDetailHeading}</h1>
        <p className="text-body-sm text-mute">{t.duplicateDetailIntro}</p>
        <p className="mt-1 flex w-fit items-baseline gap-x-2 rounded-md border border-dashed border-hairline-strong px-3 py-2 text-body-sm text-body">
          <span className="rounded-xs border border-dashed border-hairline-strong px-2 text-caption-md font-medium [&:lang(bn)]:text-body-sm">{t.duplicateMockLabel}</span>
          <span>{t.duplicateDemoBanner}</span>
        </p>
      </div>
      <DuplicateReview view={result.view} locale={locale} listHref="/officer/duplicates" />
    </div>
  );
}
