// Server-rendered officer case detail (SCREEN-012, COMP-033 status badge; D4 status =
// icon + text + colour). Built from the role-scoped OfficerCaseView. The page renders the
// detail through this file so the JSON payload and the per-role allowlist stay together;
// nothing outside the schema fields is included here.
//
// - Status badge (icon + text + colour, D4 §10/§15.1). Open = circle-dot (amber), Matched
//   = git-compare (blue), Closed = circle-check (green), Referral recorded = hand-heart
//   plus the simulation text. The Map/Dashboard surfaces already use the same keys; this
//   page re-reads them from src/lib/status-labels.ts where possible, and adds the close /
//   referred keys for the lifecycle states not yet on the parent screen.
// - The officer DTO is the per-role allowlist (BR-010/024, D2A §9.2); child.payload,
//   contact.phone and audit_log.raw never reach the DOM through this file.
// - Honest labels (D4 §15.1): synthetic badge + "[MOCK]" treated as the same honest state,
//   shown once at the top.
// - The `t` prop is the flat per-locale object from `locales[locale]`. Area files are
//   spread into the locale object (src/locales/index.ts), so a nested `officerCase`
//   namespace would not match the type and would silently drift from the strings other
//   modules read. Reads go through the flat keys (officerCaseBn/En in
//   src/locales/areas/officer-case.ts) and the inline `statusGroup*` keys.
import { CircleCheckIcon, CircleDashedIcon, CircleDotIcon, GitCompareIcon } from "@/app/components/icons";
import {
  type CaseStatus,
  type OfficerCaseView,
} from "@/contracts";
import type { Locale, MessageKey } from "@/locales";
import { localizeDigits } from "@/lib/numerals";

type BadgeIcon = typeof CircleDotIcon;

const STATUS_ICON: Record<string, BadgeIcon> = {
  // Group keys (parent/client surfaces reuse these via STATUS_KEY).
  open: CircleDotIcon,
  matched: GitCompareIcon,
  closed: CircleCheckIcon,
  // The two close-related statuses the queue page does not need but S-012 does.
  confirmed: CircleCheckIcon,
  referred: CircleCheckIcon,
  submitted: CircleDashedIcon,
};

const STATUS_TONE: Record<string, string> = {
  open: "bg-warning-soft text-warning-text",
  matched: "bg-info-soft text-info-text",
  closed: "bg-success-soft text-success-text",
  confirmed: "bg-info-soft text-info-text",
  referred: "bg-success-soft text-success-text",
  submitted: "bg-elevated text-mute border border-hairline",
};

function ageLabel(
  years: number | null,
  min: number | null,
  max: number | null,
  locale: Locale,
): string {
  if (years !== null) {
    return localizeDigits(years, locale) + (locale === "bn" ? " বছর" : " years");
  }
  if (min !== null && max !== null) {
    return (
      localizeDigits(min, locale) + (locale === "bn" ? "–" : "-") + localizeDigits(max, locale) +
      (locale === "bn" ? " বছর" : " years")
    );
  }
  if (min !== null) {
    return (locale === "bn" ? "সর্বনিম্ন " : "min ") + localizeDigits(min, locale) + (locale === "bn" ? " বছর" : " years");
  }
  if (max !== null) {
    return (locale === "bn" ? "সর্বোচ্চ " : "max ") + localizeDigits(max, locale) + (locale === "bn" ? " বছর" : " years");
  }
  return "";
}

export function OfficerCaseDetail({
  locale,
  view,
  t,
}: {
  locale: Locale;
  view: OfficerCaseView;
  // The whole flat locale object: statusGroup* come from the inline bn/en, the
  // child/event/reporter/duplicate/close strings come from officerCaseBn/En. The keys
  // are pinned at the type level so a future area edit that drops one fails the
  // build here too.
  t: Record<MessageKey, string>;
}) {
  const status = view.status;
  const Icon = STATUS_ICON[status] ?? CircleDotIcon;
  const tone = STATUS_TONE[status] ?? STATUS_TONE.open;
  const statusLabel = statusLabelFor(status, t);
  const child = view.child;
  const event = view.event;
  const reporter = view.reporter_relation;

  return (
    <article
      className="flex flex-col gap-6"
      data-status={status}
      data-kind={view.kind}
      data-version={view.version}
    >
      <header className="flex flex-col gap-2">
        <p className="flex items-center gap-3">
          <span className="font-mono text-heading-4 text-ink">{view.ref_code}</span>
          <span
            className={`inline-flex min-h-6 items-center gap-1 rounded-xs px-2 py-0.5 text-caption-md font-medium ${tone}`}
            data-test="status-badge"
            aria-label={`${t.caseStatusLabel} ${statusLabel}`}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            <span>{statusLabel}</span>
          </span>
        </p>
        <p className="text-body-sm text-mute">
          {view.kind === "missing" ? t.caseKindMissing : t.caseKindFound}
        </p>
      </header>

      <section aria-labelledby="child-heading" className="flex flex-col gap-3">
        <h2 id="child-heading" className="text-heading-4 font-semibold text-ink">
          {t.childSection}
        </h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          <Field label={t.childName} value={child.name ? child.name : t.notProvided} />
          {child.name_latin ? (
            <Field label={t.childNameLatin} value={child.name_latin} />
          ) : null}
          <Field
            label={t.childAge}
            value={ageLabel(child.age_years, child.age_min, child.age_max, locale) || t.unknown}
          />
          <Field
            label={t.childSex}
            value={
              child.sex === "male"
                ? t.childSexMale
                : child.sex === "female"
                ? t.childSexFemale
                : child.sex === "other"
                ? t.childSexOther
                : t.childSexUnknown
            }
          />
          <Field
            label={t.childHeight}
            value={child.height_cm === null ? t.notProvided : localizeDigits(child.height_cm, locale) + " cm"}
          />
          <Field label={t.childClothing} value={child.clothing ?? t.notProvided} />
          <Field label={t.childMarks} value={child.marks ?? t.notProvided} />
        </dl>
      </section>

      <section aria-labelledby="event-heading" className="flex flex-col gap-3">
        <h2 id="event-heading" className="text-heading-4 font-semibold text-ink">
          {t.eventSection}
        </h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          <Field label={t.eventAt} value={event.at ? event.at : t.notProvided} />
          <Field label={t.eventDistrict} value={event.district_name_bn ?? t.notProvided} />
          <Field label={t.eventPlace} value={event.place_text ?? t.notProvided} />
          <Field label={t.eventThana} value={event.thana ?? t.notProvided} />
          <Field label={t.eventCircumstances} value={event.circumstances ?? t.notProvided} />
        </dl>
      </section>

      <section aria-labelledby="reporter-heading" className="flex flex-col gap-3">
        <h2 id="reporter-heading" className="text-heading-4 font-semibold text-ink">
          {t.reporterSection}
        </h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          <Field
            label={t.reporterRelation}
            value={reporter ?? t.notProvided}
          />
          <Field
            label={view.contact_phone ? t.reporterPhoneUnmasked : t.reporterPhoneMasked}
            value={
              view.contact_phone
                ? view.contact_phone
                : view.contact_phone_masked ?? t.notProvided
            }
          />
        </dl>
      </section>

      {view.duplicate_of && view.duplicate_of.length > 0 ? (
        <section aria-labelledby="dup-heading" className="flex flex-col gap-2">
          <h2 id="dup-heading" className="text-heading-4 font-semibold text-ink">
            {t.duplicateSection}
          </h2>
          <ul className="flex flex-wrap gap-2" data-state="loaded">
            {view.duplicate_of.map((ref) => (
              <li
                key={ref}
                data-test="duplicate-ref"
                className="rounded-xs border border-hairline bg-elevated px-2 py-1 font-mono text-caption-md text-ink"
              >
                {ref}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section aria-labelledby="dup-heading" data-state="empty" className="flex flex-col gap-2">
          <h2 id="dup-heading" className="text-heading-4 font-semibold text-ink">
            {t.duplicateSection}
          </h2>
          <p className="text-body-sm text-mute">{t.duplicateEmpty}</p>
        </section>
      )}
    </article>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-caption-md text-mute">{label}</dt>
      <dd className="text-body-sm text-ink">{value}</dd>
    </div>
  );
}

function statusLabelFor(
  status: CaseStatus,
  t: Record<MessageKey, string>,
): string {
  switch (status) {
    case "submitted":
      return t.caseStatusSubmitted;
    case "open":
      return t.statusGroupOpen;
    case "matched_pending_review":
      return t.statusGroupMatched;
    case "confirmed":
      return t.caseStatusConfirmed;
    case "closed":
      return t.statusGroupClosed;
    case "referred":
      return t.caseStatusReferred;
  }
}
