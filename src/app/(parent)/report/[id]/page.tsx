// SCREEN-004 case submitted and outputs (TASK-024; D3 SCREEN-004, D4 §10/§14/§15.1;
// FR-008/009/010, BR-002/006/022/025, TC-006). Route /report/<id> (OD-024-1).
//
// - requireOwnCase: the parent cookie's own report through the owner projection, or
//   SCREEN-016 with an access.denied row. The draft never goes to the client: the cards
//   fetch their text from API-006 when the parent taps them.
// - Reference card: large mono reference, COMP-033 status badge, matching state in
//   D4 wording ("মিল খোঁজা হবে", never a promise).
// - Output cards (GD draft, poster, 13219 summary) only while the owner view still has a
//   draft and is editable (OD-023-2); otherwise a neutral note and the 13219 call link.
// - Paper surface only, no red, ≥ 44 px targets, Bangla default (DESIGN.md Fera overrides).
import type { Metadata } from "next";
import { CircleDashedIcon, InfoIcon, PhoneIcon } from "@/app/components/icons";
import { StatusBadge } from "@/app/components/status-badge";
import { getLocale } from "@/lib/locale-server";
import { MATCHING_KEY, outputsAvailable } from "@/lib/outputs-client";
import { locales } from "@/locales";
import { requireOwnCase } from "@/server/auth/require-own-case";
import { OutputCard } from "./output-card";
import { PosterShare } from "./poster-share";

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
              className="font-mono text-heading-2 font-semibold tracking-wide text-ink [overflow-wrap:anywhere]"
            >
              {view.ref_code}
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <StatusBadge group={view.status_group} locale={locale} />
            <span className="flex items-center gap-1.5 text-body-md text-body">
              {matchingFailed ? (
                <InfoIcon className="size-4 text-mute" />
              ) : (
                <CircleDashedIcon className="size-4 text-mute" />
              )}
              <span>{t[MATCHING_KEY[view.matching_state]]}</span>
            </span>
          </div>
        </div>
        <p className="flex items-start gap-2 text-body-md text-body">
          <InfoIcon className="mt-[0.35em] size-4 text-info" />
          <span>{t.noFiling}</span>
        </p>
      </header>

      {available ? (
        <section
          aria-labelledby="report-outputs"
          className="flex flex-col gap-4"
        >
          <h2
            id="report-outputs"
            className="text-heading-3 font-semibold text-ink"
          >
            {t.outputsHeading}
          </h2>
          <OutputCard caseId={view.id} type="gd" locale={locale} />
          <PosterShare
            caseId={view.id}
            refCode={view.ref_code}
            locale={locale}
          />
          <OutputCard caseId={view.id} type="helpline" locale={locale} />
        </section>
      ) : (
        <p className="flex items-start gap-2 rounded-lg border border-hairline-strong bg-card px-4 py-3 text-body-md text-ink">
          <InfoIcon className="mt-[0.35em] size-4 text-mute" />
          <span>{t.outputsLocked}</span>
        </p>
      )}

      <a
        href="tel:13219"
        className="inline-flex min-h-12 items-center justify-center gap-2 self-start rounded-md border border-hairline-strong bg-surface px-5 py-2 text-body-lg font-semibold text-ink hover:bg-hover"
      >
        <PhoneIcon className="size-5" />
        <span>{t.callHelpline}</span>
      </a>
    </div>
  );
}
