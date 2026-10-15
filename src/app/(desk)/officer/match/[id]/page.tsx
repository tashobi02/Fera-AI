// SCREEN-010 match review (TASK-028; D3 SCREEN-010, FR-015–FR-017). Verified officers only:
// requireRole sends anyone else to sign-in or SCREEN-016, and an unverified officer has staff
// permissions, so they never reach a candidate. Absent, malformed and forbidden candidates are
// the same not-found page (BR-010). Reading is audited when a raw phone is shown.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "@/lib/locale-server";
import { locales } from "@/locales";
import { requireRole } from "@/server/auth/require-role";
import { readCandidate } from "@/server/matching/candidate-read";
import { MatchReview } from "./match-review";

export async function generateMetadata(): Promise<Metadata> {
  return { title: locales[await getLocale()].matchReviewPageTitle };
}

export default async function MatchReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { principal } = await requireRole(["officer"], `/officer/match/${id}`);
  const result = await readCandidate(principal, id);
  if (result.kind === "hidden") notFound();
  const locale = await getLocale();
  const t = locales[locale];
  return (
    <div data-surface="desk" className="mx-auto flex w-full max-w-[64rem] flex-1 flex-col gap-6 px-[16px] py-8 sm:py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-heading-3 font-semibold text-ink [&:lang(en)]:font-bold [&:lang(en)]:tracking-[-0.25px]">{t.matchReviewTitle}</h1>
        <p className="text-body-sm text-mute">{t.matchReviewIntro}</p>
        <p className="mt-1 flex w-fit items-baseline gap-x-2 rounded-md border border-dashed border-hairline-strong px-3 py-2 text-body-sm text-body">
          <span className="rounded-xs border border-dashed border-hairline-strong px-2 text-caption-md font-medium [&:lang(bn)]:text-body-sm">{t.mockLabel}</span>
          <span>{t.demoBanner}</span>
        </p>
      </div>
      <MatchReview view={result.view} locale={locale} queueHref="/officer/queue" />
    </div>
  );
}
