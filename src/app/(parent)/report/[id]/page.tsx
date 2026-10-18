// SCREEN-004 case submitted and outputs (TASK-024; D3 SCREEN-004, D4 §10/§14/§15.1;
// FR-008/009/010, BR-002/006/022/025, TC-006). Route /report/<id> (OD-024-1).
//
// - requireOwnCase: the parent cookie's own report through the owner projection, or
//   SCREEN-016 with an access.denied row. The draft never goes to the client: the cards
//   fetch their text from API-006 when the parent taps them.
// - Reference card: the reference in large mono digits as the focal element (D4 §14),
//   never split across lines; COMP-033 status badge; matching state in D4 wording
//   ("মিল খোঁজা হবে", never a promise).
// - The no-filing note and the tel:13219 link sit in the header, so the call link stays
//   near the top however far the cards expand.
// - Output cards (GD draft, poster, 13219 summary) only while the owner view still has a
//   draft and is editable (OD-023-2); otherwise a neutral note.
// - Paper surface only, no red, ≥ 44 px targets, 18 px / 1.7 reading text, Bangla
//   default (DESIGN.md Fera overrides).
import type { Metadata } from "next";
import { CircleDashedIcon, InfoIcon, PhoneIcon } from "@/app/components/icons";
import { StatusBadge } from "@/app/components/status-badge";
import { getLocale } from "@/lib/locale-server";
import { outputsAvailable } from "@/lib/outputs-client";
import { MATCHING_KEY } from "@/lib/status-labels";
import { locales } from "@/locales";
import { requireOwnCase } from "@/server/auth/require-own-case";
import { OutputCard } from "./output-card";
import { PosterShare } from "./poster-share";
import { READ } from "./ui";

export async function generateMetadata(): Promise<Metadata> {
  return { title: locales[await getLocale()].reportTitle };
}

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getLocale();
  const t = locales[locale];
  const { view } = await requireOwnCase(
    id,
    `/report/${encodeURIComponent(id)}`,
  );
  const available = outputsAvailable({
    editable: view.editable,
    hasDraft: view.draft !== null,
  });
  const matchingFailed = view.matching_state === "failed";

  return (
    <div
      data-surface="parent"
      className="mx-auto flex w-full max-w-[36rem] flex-col gap-6 px-4 py-8"
    >
      <header className="flex flex-col gap-4">
        <h1 className="text-heading-2 font-semibold text-ink">
          {t.reportTitle}
        </h1>
        <div className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface p-[16px] sm:p-5">
          <p className="flex flex-col gap-1">
            <span className="text-body-sm text-mute">{t.reportReference}</span>
            <span
              lang="en"
              translate="no"
              className="font-mono text-[clamp(1.75rem,9vw,3.5rem)] leading-none font-medium tracking-[-0.03em] whitespace-nowrap text-ink tabular-nums"
            >
              {view.ref_code}
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <StatusBadge group={view.status_group} locale={locale} />
            <span className={`flex items-center gap-1.5 ${READ} text-body`}>
              {matchingFailed ? (
                <InfoIcon className="size-4 shrink-0 text-mute" />
              ) : (
                <CircleDashedIcon className="size-4 shrink-0 text-mute" />
              )}
              <span className="min-w-0">
                {t[MATCHING_KEY[view.matching_state]]}
              </span>
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <p className={`flex items-start gap-2 ${READ} text-body`}>
            <InfoIcon className="mt-[0.45em] size-4 shrink-0 text-info" />
            <span className="min-w-0">{t.noFiling}</span>
          </p>
          <a
            href="tel:13219"
            className="inline-flex min-h-12 max-w-full items-center justify-center gap-2 rounded-md border border-control bg-surface px-5 py-2 text-body-lg font-semibold text-ink hover:border-control-strong hover:bg-hover"
          >
            <PhoneIcon className="size-5 shrink-0" />
            <span>{t.callHelpline}</span>
          </a>
        </div>
      </header>

      {available ? (
        <div className="flex flex-col gap-4">
          <h2 className="text-heading-3 font-semibold text-ink">
            {t.outputsHeading}
          </h2>
          <OutputCard caseId={view.id} type="gd" locale={locale} />
          <PosterShare
            caseId={view.id}
            refCode={view.ref_code}
            locale={locale}
          />
          <OutputCard caseId={view.id} type="helpline" locale={locale} />
        </div>
      ) : (
        <p
          className={`flex items-start gap-2 rounded-lg border border-hairline-strong bg-card px-4 py-3 ${READ} text-ink`}
        >
          <InfoIcon className="mt-[0.45em] size-4 shrink-0 text-mute" />
          <span className="min-w-0">{t.outputsLocked}</span>
        </p>
      )}
    </div>
  );
}
