// SCREEN-009 queue list rendering (TASK-027; D3 SCREEN-009, COMP-035/036).
//
// Server component: the queue payload is server-rendered with the per-role DTO
// projection, so there is no client-side data fetching and no raw row leakage.
// Each row is a missing case with up to LIMITS.candidatesPerQueueItem ranked
// candidates; each candidate links to /officer/match/[candidate_id] (TASK-028).
//
// - One card per missing case (no raw contact phone; officerCaseRow masks it).
// - Each candidate row shows its rank, similarity, ref_code and district.
// - The table is keyboard friendly: every link is a real anchor, the whole
//   list is a `<ul>`, and the candidate links have a visible focus ring
//   (the global :focus-visible rule applies the ring token from DESIGN.md).
// - Empty and loading: empty is rendered as a sentence with an icon; the
//   loading skeleton is a CSS-only placeholder to avoid an unnecessary client
//   bundle. (The page itself is server-rendered, so loading is a non-state.)
//
// MapPinIcon is inlined here (Lucide outline, same 24×24 / 2 px stroke / round
// caps and joins as the rest of the icon set in @/app/components/icons) so the
// queue card keeps a geographic cue without depending on a non-owned module.
import { GitCompareIcon, Icon as BaseIcon, InfoIcon } from "@/app/components/icons";
import { localizeDigits } from "@/lib/numerals";
import { locales, type Locale } from "@/locales";
import type { ReviewQueueResponse } from "@/contracts";

const REF_CODE = "font-mono";

function MapPinIcon({ className }: { className?: string }) {
  return (
    <BaseIcon className={className}>
      <path d="M20 10c0 7-8 13-8 13s-8-6-8-13a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </BaseIcon>
  );
}

function refLabel(ref: string) {
  return (
    <span lang="en" translate="no" className={REF_CODE}>
      {ref}
    </span>
  );
}

type DistrictEvent = Pick<
  ReviewQueueResponse["items"][number]["candidates"][number]["counterpart"]["event"],
  "district_name_bn" | "district_code"
>;

function districtName(event: DistrictEvent): string {
  // district_name_bn is null for unknown; fall back to the numeric district
  // code so the officer still sees the geographic cue.
  const name = event.district_name_bn ?? event.district_code?.toString();
  return name === null || name === undefined ? "—" : String(name);
}

function showScore(score: number, locale: Locale): string {
  return `${localizeDigits(Math.round(score), locale)} / ${localizeDigits(100, locale)}`;
}

export function OfficerQueueList({ locale, view }: { locale: Locale; view: ReviewQueueResponse }) {
  const t = locales[locale];
  if (view.items.length === 0) {
    return (
      <section
        aria-labelledby="officer-queue-empty"
        className="flex flex-col items-start gap-3 rounded-lg border border-hairline bg-surface px-[16px] py-6 sm:px-6"
      >
        <h2 id="officer-queue-empty" className="text-heading-sm font-semibold text-ink">
          <span className="inline-flex items-baseline gap-x-2">
            <InfoIcon className="mt-[0.15em] size-4 text-mute" aria-hidden />
            <span>{t.officerQueueEmptyTitle}</span>
          </span>
        </h2>
        <p className="text-body-sm text-body">{t.officerQueueEmptyBody}</p>
      </section>
    );
  }
  return (
    <ul aria-label={t.officerQueueListLabel} className="flex flex-col gap-4">
      {view.items.map((item) => {
        const childName = item.case.child.name;
        const heading = childName === null ? t.matchReviewUnknownValue : childName;
        return (
          <li
            key={item.case.id}
            className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface px-[16px] py-5 sm:px-6"
          >
            <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div className="flex flex-col gap-1">
                <span className="text-caption-md uppercase tracking-wide text-faint">
                  {t.officerQueueMissingLabel}
                </span>
                <h2 className="text-heading-sm font-semibold text-ink">
                  {refLabel(item.case.ref_code)} <span className="text-mute">—</span>{" "}
                  <span>{heading}</span>
                </h2>
                <p className="flex flex-wrap items-center gap-x-3 text-body-sm text-mute">
                  <span className="inline-flex items-center gap-1.5">
                    <MapPinIcon className="size-4" aria-hidden />
                    <span>{districtName(item.case.event)}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <GitCompareIcon className="size-4" aria-hidden />
                    <span>
                      {localizeDigits(item.candidates.length, locale)} {t.officerQueueCandidatesSuffix}
                    </span>
                  </span>
                </p>
              </div>
            </header>
            <ul aria-label={t.officerQueueCandidateListLabel} className="flex flex-col">
              {item.candidates.map((c) => (
                <li
                  key={c.candidate_id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-hairline-soft py-3 first:border-t-0 first:pt-0"
                >
                  <a
                    href={`/officer/match/${c.candidate_id}`}
                    className="group inline-flex min-h-11 items-center gap-2 rounded-md text-body-md text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  >
                    <span className="inline-flex size-7 items-center justify-center rounded-md border border-hairline-strong text-caption-md font-semibold text-ink">
                      {localizeDigits(c.rank, locale)}
                    </span>
                    <span className="inline-flex flex-col">
                      <span className="text-body-md font-semibold text-ink">
                        {refLabel(c.counterpart.ref_code)}
                      </span>
                      <span className="text-caption-md text-mute">
                        {t.officerQueueFoundLabel}: {districtName(c.counterpart.event)}
                      </span>
                    </span>
                  </a>
                  <span className="inline-flex items-baseline gap-x-2 text-body-sm text-mute">
                    <span className="text-caption-md uppercase tracking-wide text-faint">
                      {t.officerQueueSimilarityLabel}
                    </span>
                    <span className="text-body-md font-semibold text-ink">{showScore(c.score, locale)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}
