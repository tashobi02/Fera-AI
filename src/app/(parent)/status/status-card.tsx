// SCREEN-006 per-row card (TASK-049/050, P3-102/103; D3 §3 row 135–148; D4 §13).
// Reference card, status badge, last-updated copy, "View report" / "Correct
// details" actions. Server component: the only client island is the
// "Correct details" button, which writes the device-local edit-mode pointer and
// navigates to S-003 (TASK-049).
//
// - Reference in large mono digits as the focal element (D4 §14), never split
//   across lines; status badge with icon + text + colour (D4 §13).
// - Paper surface only, no red, ≥ 44 px targets, 18 px / 1.7 reading text, Bangla
//   default (DESIGN.md Fera overrides).
// - View report → /report/<id> (S-004, the existing page); the per-row link
//   goes through the same path the submit-success card uses (TASK-024, review
//   screen Link href="/report/<id>").
// - Correct details → /intake/review (S-003) via the edit-mode device-local
//   pointer (no child payload in URL; the review screen pulls the canonical
//   owner view through API-004). Disabled while editable: false; the disabled
//   copy is the same D3 row 144 wording as SCREEN-006's locked copy.
import type { MyCaseResponse } from "@/contracts";
import { StatusBadge } from "@/app/components/status-badge";
import { localizeDigits } from "@/lib/numerals";
import { locales, type Locale } from "@/locales";
import { EditDetailsButton } from "./edit-button";

type Entry = MyCaseResponse["reports"][number];

export function StatusCard({ entry, locale }: { entry: Entry; locale: Locale }) {
  const t = locales[locale];
  const updatedCopy = t.statusUpdatedAt.replace("{t}", localizeDigits(formatDate(entry.updated_at), locale));
  return (
    <article
      aria-labelledby={`status-card-${entry.id}-ref`}
      className="flex w-full flex-col gap-4 rounded-lg border border-hairline bg-surface p-[16px] sm:p-5"
    >
      <div className="flex flex-col gap-2">
        <p className="flex flex-col gap-1">
          <span className="text-body-sm text-mute">{t.reportReference}</span>
          <span
            id={`status-card-${entry.id}-ref`}
            lang="en"
            translate="no"
            className="font-mono text-[clamp(1.5rem,7vw,2.5rem)] leading-none font-medium tracking-[-0.03em] whitespace-nowrap text-ink tabular-nums"
          >
            {entry.ref_code}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <StatusBadge group={entry.status_group} locale={locale} />
        </div>
        <p className="text-body-sm text-mute">{updatedCopy}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <a
          href={`/report/${encodeURIComponent(entry.id)}`}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-control bg-elevated px-4 text-body-md font-medium text-ink no-underline hover:border-control-strong hover:bg-hover"
        >
          {t.statusViewReport}
        </a>
        <EditDetailsButton
          locale={locale}
          caseId={entry.id}
          refCode={entry.ref_code}
          editable={entry.editable}
        />
      </div>
    </article>
  );
}

// Date-only: a Bangla parent copy prefers an exact date for "last updated" so
// we hand back the date portion of the +06:00 ISO string. The audit-friendly
// tone of S-004's reference card is preserved (no relative time).
function formatDate(iso: string): string {
  return iso.slice(0, 10);
}