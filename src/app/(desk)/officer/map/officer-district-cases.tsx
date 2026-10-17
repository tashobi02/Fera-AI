// District drill-through (SCREEN-011 ACT-024 → API-022; P3-041, TASK-030a, FR-019,
// BR-007/024; TC-012, TC-015). Server-rendered table of the rows the service returned.
// No client-side fetch: the page already read the rows through listOfficerCases (the
// same call the API-022 route uses), so the wire and the page agree exactly.
//
// - The strict `caseListResponseSchema` allowlist (BR-007) is the only field set
//   served. No child name, no contact, no payload, no candidate data — those belong
//   to the detail view (API-004).
// - Status is icon + text + colour (D4 §7). The same bucket copy the map legend uses,
//   so the table and the map speak the same language.
// - Empty / unavailable / error states are independent messages; an unavailable list
//   does not block the table or the map from rendering.
import { CircleAlertIcon, CircleCheckIcon, CircleDashedIcon } from "@/app/components/icons";
import { CircleHelpIcon } from "@/app/components/status-icons";
import type { Locale, MessageKey } from "@/locales";

export type DistrictCaseRow = {
  id: string;
  ref_code: string;
  kind: "missing" | "found";
  status: string;
  status_group: "open" | "matched" | "closed";
};

const STATUS_ICON = {
  open: CircleDashedIcon,
  matched: CircleCheckIcon,
  closed: CircleHelpIcon,
} as const;

const STATUS_CLASS = {
  open: "text-info-text",
  matched: "text-warning-text",
  closed: "text-success-text",
} as const;

const KIND_CLASS = {
  missing: "text-info-text",
  found: "text-warning-text",
} as const;

const bn = "০১২৩৪৫৬৭৮৯";
function locN(n: number, locale: Locale): string {
  if (locale === "bn") return String(n).replace(/[0-9]/g, (d) => bn[Number(d)]);
  return String(n);
}

export function OfficerDistrictCases({
  districtCode,
  districtName,
  rows,
  locale,
  t,
}: {
  districtCode: number;
  districtName: string;
  rows: DistrictCaseRow[] | null;
  locale: Locale;
  t: Record<MessageKey, string>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-body-md font-semibold text-ink">
        {t.officerMapCasesTitle} · {districtName} ({locN(districtCode, locale)})
      </h3>
      <p className="text-caption-md text-mute [&:lang(bn)]:text-body-sm">{t.officerMapCasesIntro}</p>

      {rows === null ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2.5 text-body-sm text-warning-text"
        >
          <CircleAlertIcon className="mt-[0.2em] size-4" />
          <span>{t.officerMapCasesUnavailable}</span>
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-hairline-strong px-3 py-2.5 text-body-sm text-mute">
          {t.officerMapCasesEmpty}
        </p>
      ) : (
        <div className="min-w-0 overflow-x-auto" tabIndex={0} role="region" aria-label={t.officerMapCasesTitle}>
          <table className="w-full border-collapse text-left text-body-sm">
            <caption className="sr-only">{t.officerMapCasesTitle}</caption>
            <thead>
              <tr className="border-b border-hairline">
                <th scope="col" className="py-2 pr-3 font-medium text-mute">{t.officerMapRefLabel}</th>
                <th scope="col" className="py-2 pr-3 font-medium text-mute">{t.officerMapKindMissing}/{t.officerMapKindFound}</th>
                <th scope="col" className="py-2 pr-3 font-medium text-mute">{t.officerMapStatusOpen}/{t.officerMapStatusMatched}/{t.officerMapStatusClosed}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const Icon = STATUS_ICON[r.status_group];
                const statusLabel =
                  r.status_group === "open" ? t.officerMapStatusOpen
                  : r.status_group === "matched" ? t.officerMapStatusMatched
                  : t.officerMapStatusClosed;
                const kindLabel = r.kind === "missing" ? t.officerMapKindMissing : t.officerMapKindFound;
                return (
                  <tr key={r.id} className="border-b border-hairline align-top">
                    <th scope="row" className="py-2 pr-3 font-medium text-body">
                      <a
                        href={`/officer/case/${r.id}`}
                        className="text-ink underline-offset-2 hover:underline focus:underline"
                        lang="en"
                        translate="no"
                      >
                        {r.ref_code}
                      </a>
                    </th>
                    <td className={["py-2 pr-3", KIND_CLASS[r.kind]].join(" ")}>{kindLabel}</td>
                    <td className={["py-2 pr-3", STATUS_CLASS[r.status_group]].join(" ")}>
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <Icon className="size-4" />
                        <span>{statusLabel}</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
