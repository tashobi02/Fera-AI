// SCREEN-012 officer case detail (TASK-029; FR-018, FR-021; TC-010). Server-rendered
// from the same services the API uses (readCase → OfficerCaseView, readCaseAudit →
// OfficerAuditResponse), so the per-role allowlist and the version recheck are honoured
// here too. Active verified officer only: any other role gets the SCREEN-016 not-found
// page that the rest of the desk uses, via requireRole (BR-010/024, AGENTS.md table).
//
// - The detail and the close form are split into client islands; this server component
//   holds the data flow and the locale, so the islands stay small and the page does not
//   fetch via HTTP from a server component.
// - Loading, empty and error states all carry bn + en copy (PHASE_3_PLAN §4 quality bar).
// - The "synthetic" badge is always visible (DESIGN.md honest labels), never hidden.
// - The audit section never shows raw details; only the safe projection entries reach
//   the client island.
import type { Metadata } from "next";
import { CircleAlertIcon, InfoIcon, LoaderCircleIcon } from "@/app/components/icons";
import { createLogger, describeError } from "@/app/api/_shared/log";
import { getLocale } from "@/lib/locale-server";
import { locales, type Locale, type MessageKey } from "@/locales";
import { readCase } from "@/server/case";
import { readCaseAudit } from "@/server/audit/safe-read";
import { requireRole } from "@/server/auth/require-role";
import { allowedCloseOutcome, isMissingStatus } from "@/contracts";
import { notFound } from "next/navigation";
import { OfficerCaseDetail } from "./case-detail";
import { CloseForm } from "./close-form";
import { AuditList } from "./audit-list";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: locales[locale].caseTitle };
}

const logger = createLogger();

export default async function OfficerCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Verified officer only. requireRole writes the access.denied audit row when a signed-in
  // staff or unverified officer visits (BR-010), then notFound() shows SCREEN-016.
  const { principal } = await requireRole(["officer"], "/officer/case");
  const { id } = await params;
  const locale = await getLocale();
  const t = locales[locale] as Record<MessageKey, string>;

  // Read the case and the safe audit projection in parallel. The audit service is
  // read-only and never returns raw details; a null is a 404, not a permission error.
  const [caseResult, auditResult] = await Promise.all([
    safeRead(() => readCase(principal, id)),
    safeRead(() => readCaseAudit(principal, id)),
  ]);

  if (!caseResult.ok) {
    // Genuine error: 500/log path, not 404. E-021 path stays open (D2B §13).
    return renderError(locale, t.errorUnavailable);
  }
  if (caseResult.value.kind === "hidden") {
    // Service already returns "hidden" for unknown UUIDs and the wrong owner, so this
    // is the same as E-004 from the route. SCREEN-016 keeps the response identical.
    notFound();
  }
  const view = caseResult.value.view.view;
  if (view !== "officer") {
    // Service should never hand back a non-officer DTO here, but the contract is strict.
    notFound();
  }
  const officerView = caseResult.value.view.data;

  const audit = auditResult.ok && auditResult.value.kind === "ok" && auditResult.value.view.view === "officer"
    ? auditResult.value.view
    : null;

  const closeOutcome = isMissingStatus(officerView.status)
    ? allowedCloseOutcome(officerView.status)
    : null;

  return (
    <div
      data-surface="desk"
      className="flex flex-1 justify-center px-[16px] py-8 sm:px-6 sm:py-12"
    >
      <div className="flex w-full max-w-[64rem] flex-col gap-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-heading-3 font-semibold text-ink [&:lang(en)]:font-bold [&:lang(en)]:tracking-[-0.25px]">
            {t.caseTitle}
          </h1>
          <p className="text-body-sm text-mute">{t.caseReferenceLabel}: {officerView.ref_code}</p>
          <p className="flex flex-wrap items-center gap-2">
            <span
              lang="en"
              translate="no"
              className="inline-flex min-h-6 items-center rounded-xs border border-dashed border-hairline-strong px-2 text-caption-md font-medium text-body"
            >
              {t.mockLabel}
            </span>
            <span className="inline-flex min-h-6 items-center rounded-xs border border-dashed border-hairline-strong px-2 text-caption-md font-medium text-body">
              {t.syntheticLabel}
            </span>
          </p>
        </header>

        <OfficerCaseDetail
          locale={locale}
          view={officerView}
          t={t}
        />

        {officerView.kind === "missing" ? (
          <CloseForm
            locale={locale}
            caseId={officerView.id}
            allowedOutcome={closeOutcome}
            expectedVersion={officerView.version}
          />
        ) : null}

        {audit ? (
          <AuditList locale={locale} view={audit} />
        ) : (
          <p
            role="status"
            data-state="audit-unavailable"
            className="flex items-start gap-2 rounded-md border border-hairline bg-elevated px-3 py-3 text-body-sm text-mute"
          >
            <InfoIcon className="mt-0.5 size-4 text-faint" aria-hidden="true" />
            <span>{t.errorUnavailable}</span>
          </p>
        )}
      </div>
    </div>
  );
}

function renderError(locale: Locale, message: string) {
  const t = locales[locale] as Record<MessageKey, string>;
  return (
    <div
      data-surface="desk"
      data-state="error"
      className="flex flex-1 justify-center px-[16px] py-8 sm:px-6 sm:py-12"
    >
      <div className="flex w-full max-w-[52rem] flex-col gap-4">
        <h1 className="text-heading-3 font-semibold text-ink">
          {t.caseTitle}
        </h1>
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-hairline bg-elevated px-3 py-3 text-body-sm text-ink"
        >
          <CircleAlertIcon className="mt-0.5 size-4 text-faint" aria-hidden="true" />
          <span>{message}</span>
        </p>
        <p className="flex items-start gap-2 text-caption-md text-mute">
          <LoaderCircleIcon className="mt-0.5 size-3.5 text-faint" aria-hidden="true" />
          <span>{t.loadingCase}</span>
        </p>
      </div>
    </div>
  );
}

type SafeRead<T> =
  | { ok: true; value: T }
  | { ok: false };

async function safeRead<T>(work: () => Promise<T>): Promise<SafeRead<T>> {
  try {
    const value = await work();
    return { ok: true, value };
  } catch (err) {
    logger.error({
      event: "page.data_unavailable",
      error_id: "E-021",
      ...describeError(err),
    });
    return { ok: false };
  }
}
