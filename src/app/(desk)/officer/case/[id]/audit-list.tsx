"use client";

// COMP-042 audit timeline (SCREEN-012). Server-side, this reads the safe audit projection
// through readCaseAudit() and passes the allowed entries down; the component never sees
// raw `audit_log.details` (D2A §5.4 / §9.2). Only the project-allowlisted keys are
// rendered, so the timeline cannot echo a child name, a phone, a note text or any
// free-text string. Withheld entries are counted and announced once.
//
// - The timeline is an ordered list with times in BST (D3 SCREEN-012 accessibility row).
// - Each row names the action (D2A case.* / match.* / referral.recorded / etc.), the actor
//   and the wall-clock time. "Officer X" / "Parent (session)" are the only actor shapes
//   the projection exposes; the audit_log actor is hidden for parent sessions (BR-010).
// - When the projection withholds any row, a single "withheld" note is shown so an
//   officer never assumes a missing row means no activity happened.
import { CircleAlertIcon, InboxIcon } from "@/app/components/icons";
import type { OfficerAuditResponse } from "@/contracts";
import { locales, type Locale, type MessageKey } from "@/locales";
import { localizeDigits } from "@/lib/numerals";

type Entry = OfficerAuditResponse["entries"][number];

const ACTION_LABEL: Record<Locale, Record<string, string>> = {
  bn: {
    "case.created": "কেস তৈরি",
    "case.submission_replayed": "একই জমা আবার এসেছে",
    "case.state_changed": "অবস্থা বদলেছে",
    "case.edited": "অভিভাবক সংশোধন করেছেন",
    "case.close": "কেস বন্ধ",
    "case.closed": "কেস বন্ধ",
    "case.close.refused": "বন্ধ করতে গিয়ে প্রত্যাখ্যাত",
    "case.edit.refused": "সংশোধন প্রত্যাখ্যাত",
    "match.confirm": "মিল নিশ্চিত",
    "match.reject": "মিল বাতিল",
    "match.refused": "সিদ্ধান্ত প্রত্যাখ্যাত",
    "match.voided": "মিল বাতিল হয়েছে",
    "referral.recorded": "রেফারেল নথিভুক্ত",
    "case.contact_viewed": "যোগাযোগের তথ্য দেখা হয়েছে",
    "case.payload_redacted": "পরিচয় তথ্য অপসারিত",
    "access.denied": "অনুমতি নেই",
    "user.verification_changed": "কর্মকর্তা যাচাই বদলেছে",
  },
  en: {
    "case.created": "Case created",
    "case.submission_replayed": "Same submission replayed",
    "case.state_changed": "Status changed",
    "case.edited": "Reporter edited the case",
    "case.close": "Case closed",
    "case.closed": "Case closed",
    "case.close.refused": "Close attempt refused",
    "case.edit.refused": "Edit refused",
    "match.confirm": "Match confirmed",
    "match.reject": "Match rejected",
    "match.refused": "Decision refused",
    "match.voided": "Match voided",
    "referral.recorded": "Referral recorded",
    "case.contact_viewed": "Contact details viewed",
    "case.payload_redacted": "Identifying payload redacted",
    "access.denied": "Access denied",
    "user.verification_changed": "Officer verification changed",
  },
};

const ACTOR_LABEL: Record<Locale, Record<Entry["actor_role"], string>> = {
  bn: {
    parent: "অভিভাবক (সেশন)",
    staff: "স্টাফ",
    officer: "কর্মকর্তা",
    admin: "অ্যাডমিন",
    system: "সিস্টেম",
  },
  en: {
    parent: "Parent (session)",
    staff: "Staff",
    officer: "Officer",
    admin: "Admin",
    system: "System",
  },
};

// Dhaka time, "YYYY-MM-DD HH:mm" — never a UTC offset. The audit_log rows are stored in
// UTC and serialised to +06:00 by the contract, so the date part is in BST by definition
// (toDhakaIso() in src/contracts/primitives.ts).
function formatAt(iso: string, locale: Locale): string {
  // The serialised form is "YYYY-MM-DDTHH:mm:ss+06:00"; we want a clean wall-clock label.
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!match) return iso;
  const [, y, mo, d, h, mi] = match;
  const core = `${y}-${mo}-${d} ${h}:${mi}`;
  return locale === "bn" ? localizeDigits(core, "bn") : core;
}

function actorLabel(entry: Entry, locale: Locale): string {
  if (entry.actor_role === "parent") return ACTOR_LABEL[locale].parent;
  if (entry.actor_display) return entry.actor_display;
  return ACTOR_LABEL[locale][entry.actor_role];
}

export function AuditList({
  locale,
  view,
}: {
  locale: Locale;
  view: OfficerAuditResponse;
}) {
  const t = locales[locale] as Record<MessageKey, string>;
  const labels = ACTION_LABEL[locale];
  const actors = ACTOR_LABEL[locale];
  return (
    <section aria-labelledby="audit-heading" className="flex flex-col gap-3">
      <h2 id="audit-heading" className="text-heading-4 font-semibold text-ink">
        {t.auditSection}
      </h2>
      {view.entries.length === 0 ? (
        <p
          data-state="empty"
          className="flex items-start gap-2 rounded-md border border-hairline bg-elevated px-3 py-3 text-body-sm text-mute"
        >
          <InboxIcon className="mt-0.5 size-4 text-faint" aria-hidden="true" />
          <span>{t.auditEmpty}</span>
        </p>
      ) : (
        <ol
          className="flex flex-col gap-2"
          data-state="loaded"
          data-count={view.entries.length}
        >
          {view.entries.map((entry, i) => {
            const action = labels[entry.action] ?? entry.action;
            const actor = actorLabel(entry, locale);
            const at = formatAt(entry.at, locale);
            return (
              <li
                key={`${entry.at}-${i}`}
                data-action={entry.action}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md border border-hairline bg-elevated px-3 py-2"
              >
                <span className="font-mono text-caption-md text-mute">{at}</span>
                <span className="text-body-sm font-medium text-ink">{action}</span>
                {entry.is_synthetic ? (
                  <span lang="en" translate="no" data-test="synthetic-badge" className="rounded-xs border border-dashed border-hairline-strong px-1.5 text-caption-sm font-medium text-mute">
                    {t.mockLabel} {t.syntheticBadge}
                  </span>
                ) : null}
                <span className="text-body-sm text-mute" lang={/[\u0980-\u09FF]/.test(actor) ? "bn" : undefined}>
                  {actor}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {view.withheld > 0 ? (
        <p
          role="status"
          data-state="withheld"
          data-count={view.withheld}
          className="flex items-start gap-2 rounded-md border border-hairline bg-elevated px-3 py-2 text-caption-md text-mute"
        >
          <CircleAlertIcon className="mt-0.5 size-3.5 text-faint" aria-hidden="true" />
          <span>
            {t.auditWithheldNote}
          </span>
        </p>
      ) : null}
    </section>
  );
}
