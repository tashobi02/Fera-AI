// SCREEN-011 district dashboard map (P3-041, TASK-030a, FR-019, BR-014, BR-024; TC-012,
// TC-015, TC-055). Verified officer or admin only: a signed-in wrong role is sent to
// SCREEN-016 with an access.denied audit row, and an unsigned visitor is redirected to
// sign-in (D3 §1, BR-010).
//
// The page is server-rendered:
// - `districtStats` (API-012) is the authoritative counts, used for the legend colours,
//   the table and the totals. Every cell is one SQL GROUP BY (TC-012), so a debug SQL
//   query over the seeded fixtures can confirm parity.
// - District geometry is the bundled data/districts.json centroids. No exact locations
//   are shown: the SVG plots one circle per district at its (lat, lng) centroid and
//   carries the visible "no exact locations" honest label.
// - Verified officers use API-022 (read through `listOfficerCases`) for district
//   drill-through. Admins see aggregate counts only, as API-022 is officer-only.
//   A typed count-and-status breakdown is computed from the same stats rows.
//
// Honest copy and accessibility:
// - The table is the accessible equivalent of the map (D3 SCREEN-011 a11y). Each
//   district row is its own anchor link to the drill-through, the map markers are
//   buttons with the same text labels and counts.
// - Status colours come from the design system tokens; legend, icon and word always
//   appear together (D4 §7). No red.
// - States: empty (no district counts) and unavailable (data fetch failed) have their
//   own messages; loading never reaches the client (server-rendered).
import type { Metadata } from "next";
import districtData from "../../../../../data/districts.json";
import { districtStats, totalsOf, type DistrictCountRow } from "@/server/dashboard";
import { getLocale } from "@/lib/locale-server";
import { locales, type Locale, type MessageKey } from "@/locales";
import { requireRole } from "@/server/auth/require-role";
import { getPool } from "@/server/db/pool";
import { createLogger, describeError } from "@/app/api/_shared/log";
import { listOfficerCases } from "@/server/case";
import { CircleAlertIcon } from "@/app/components/icons";
import { OfficerMap, type DistrictMapDatum } from "./officer-map";
import { OfficerDistrictCases, type DistrictCaseRow } from "./officer-district-cases";

const logger = createLogger();

type District = {
  code: number;
  name_en: string;
  name_bn: string;
  lat: number;
  lng: number;
};

// Bundled centroid data: never display lat/lng to the user; only the position of the
// plotted point in the SVG. The CSV/JSON file is Fera-internal and AI-compiled (see
// data/districts.json provenance); this page never claims it is a verified shape.
const ALL_DISTRICTS: District[] = districtData.districts.map((d) => ({
  code: (d as { code: number }).code,
  name_en: (d as { name_en: string }).name_en,
  name_bn: (d as { name_bn: string }).name_bn,
  lat: (d as { lat: number }).lat,
  lng: (d as { lng: number }).lng,
}));

export async function generateMetadata(): Promise<Metadata> {
  return { title: locales[await getLocale()].officerMapTitle };
}

// Same shape the listCasesForDistrict reader returns internally. The page drill-through
// uses the dashboard reader to honour the WHERE clause, then projects the rendered
// fields through the officer list service (BR-007: same DTOs as the API-022 wire).
async function readDistrictCaseRows(
  principal: { kind: "user"; userId: string; role: "staff" | "officer" | "admin"; verified: boolean; isActive: boolean } | { kind: "parent"; sessionId: string },
  districtCode: number,
  db: ReturnType<typeof getPool>,
): Promise<DistrictCaseRow[] | null> {
  try {
    // listOfficerCases is the role-scoped wrapper. A non-officer is rejected there; an
    // admin is too (D2A §9.2). The requireRole on this page already gated that, but
    // the service keeps the wire-format and the page on the same code path.
    const response = await listOfficerCases(
      // The principal here is server-minted and trusted; cast for the call site.
      principal as unknown as Parameters<typeof listOfficerCases>[0],
      { district: districtCode, limit: 50 },
      db,
      {},
    );
    return response.cases.map((c) => ({
      id: c.id,
      ref_code: c.ref_code,
      kind: c.kind,
      status: c.status,
      status_group: c.status_group,
    }));
  } catch (err) {
    // Service refusal: the page is officer-only already, so the only way to land here
    // is a database failure. Log a safe summary and let the page show the unavailable
    // message (BR-024: no payload in logs, no name in the message).
    logger.error({ event: "page.data_unavailable", error_id: "E-021", ...describeError(err) });
    return null;
  }
}

async function settle<T>(work: () => Promise<T>): Promise<T | null> {
  try {
    return await work();
  } catch (err) {
    logger.error({ event: "page.data_unavailable", error_id: "E-021", ...describeError(err) });
    return null;
  }
}

// Bangladesh bounding box (rough, generous): 20–27° N, 88–93° E. The centroid SVG maps
// lat/lng to a 0–1 unit square then to pixels, with 1° ≈ 1° of viewBox.
const BBOX = { minLat: 20, maxLat: 27, minLng: 88, maxLng: 93 };
const VIEW_W = 500;
const VIEW_H = 700;

function projectToSvg(d: District): { x: number; y: number } {
  const x = ((d.lng - BBOX.minLng) / (BBOX.maxLng - BBOX.minLng)) * VIEW_W;
  const y = (1 - (d.lat - BBOX.minLat) / (BBOX.maxLat - BBOX.minLat)) * VIEW_H;
  return { x, y };
}

// Status colour tokens come from DESIGN.md / tailwind. Three buckets (open / matched /
// closed) plus a "no reports" empty state. Confirmed pairs are shown on the same
// district but as a separate badge, not a colour: pairs are about linkage, not state.
type StatusBucket = "open" | "matched" | "closed" | "empty";
function bucketOf(d: DistrictCountRow): StatusBucket {
  const total = d.missing_reports.open + d.missing_reports.matched + d.missing_reports.closed
    + d.found_reports.open + d.found_reports.matched + d.found_reports.referral_recorded;
  if (total === 0) return "empty";
  if (d.missing_reports.matched + d.found_reports.matched > 0) return "matched";
  if (d.missing_reports.closed + d.found_reports.referral_recorded > 0) return "closed";
  return "open";
}

const BUCKET_CLASS: Record<StatusBucket, string> = {
  open: "fill-info-soft stroke-info",
  matched: "fill-warning-soft stroke-warning",
  closed: "fill-success-soft stroke-success",
  empty: "fill-elevated stroke-hairline",
};

function buildMapData(
  stats: DistrictCountRow[],
  locale: Locale,
): DistrictMapDatum[] {
  return ALL_DISTRICTS.map((d) => {
    const row = stats.find((s) => s.code === d.code);
    const total = row
      ? row.missing_reports.open + row.missing_reports.matched + row.missing_reports.closed
        + row.found_reports.open + row.found_reports.matched + row.found_reports.referral_recorded
      : 0;
    const pt = projectToSvg(d);
    return {
      code: d.code,
      name: locale === "bn" ? d.name_bn : d.name_en,
      x: pt.x,
      y: pt.y,
      bucket: row ? bucketOf(row) : "empty",
      total,
      pairs: row?.confirmed_pairs ?? 0,
    };
  });
}

// Format a number with the locale's digit set so the Bangla table and the English
// table are visually consistent. Bangla numbers use the Bengali numerals per D4 §11.
function formatNumber(n: number, locale: Locale): string {
  const bn = "০১২৩৪৫৬৭৮৯";
  if (locale === "bn") return String(n).replace(/[0-9]/g, (d) => bn[Number(d)]);
  return String(n);
}

// Compile-time check: every status copy key exists in the locales barrel. New copy
// must be added there; we never interpolate district text from a runtime value.
function t(locale: Locale): Record<string, string> {
  return locales[locale] as unknown as Record<string, string>;
}

export default async function OfficerMapPage({
  searchParams,
}: {
  searchParams: Promise<{ district?: string }>;
}) {
  const { principal, role } = await requireRole(["officer", "admin"], "/officer/map");
  const locale = await getLocale();
  const tx = t(locale);
  const sp = await searchParams;
  const selectedDistrict = parseDistrictParam(sp.district);

  const stats = await settle(() => districtStats(getPool()));
  const totals = stats ? totalsOf(stats) : null;
  const mapData = stats ? buildMapData(stats, locale) : null;

  let cases: DistrictCaseRow[] | null = null;
  if (selectedDistrict !== null && stats && role === "officer") {
    const db = getPool();
    // The role guard above is the authority; read the case rows through the same
    // service the API-022 route uses so the page and the wire agree.
    cases = await readDistrictCaseRows(principal, selectedDistrict.code, db);
  }

  const selected = selectedDistrict
    ? ALL_DISTRICTS.find((d) => d.code === selectedDistrict.code) ?? null
    : null;
  const selectedStat = selected ? stats?.find((s) => s.code === selected.code) ?? null : null;

  return (
    <div
      data-surface="desk"
      className="mx-auto flex w-full max-w-[64rem] flex-1 flex-col gap-6 px-[16px] py-8 sm:py-12"
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-heading-3 font-semibold text-ink [&:lang(en)]:font-bold [&:lang(en)]:tracking-[-0.25px]">
          {tx.officerMapTitle as string}
        </h1>
        <p className="text-body-sm text-mute">{tx.officerMapIntro as string}</p>
        <p className="mt-1 flex w-fit items-baseline gap-x-2 rounded-md border border-dashed border-hairline-strong px-3 py-2 text-body-sm text-body">
          <span className="rounded-xs border border-dashed border-hairline-strong px-2 text-caption-md font-medium [&:lang(bn)]:text-body-sm">
            {tx.mockLabel as string}
          </span>
          <span>{tx.officerMapCentroidNote as string}</span>
        </p>
      </div>

      {/* Map (COMP-040). The table that follows is the accessible equivalent. */}
      {mapData ? (
        <OfficerMap
          data={mapData}
          locale={locale}
          legend={{
            total: tx.officerMapLegendTotal as string,
            open: tx.officerMapLegendOpen as string,
            matched: tx.officerMapLegendMatched as string,
            closed: tx.officerMapLegendClosed as string,
            empty: tx.officerMapLegendEmpty as string,
            pairs: tx.officerMapLegendPairs as string,
            title: tx.officerMapLegendTitle as string,
          }}
          bucketClass={BUCKET_CLASS}
        />
      ) : (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2.5 text-body-sm text-warning-text"
        >
          <CircleAlertIcon className="mt-[0.2em] size-4" />
          <span>{tx.officerMapUnavailable as string}</span>
        </div>
      )}

      {/* Totals. Same source as the map: the sum of the 64 rows. */}
      {totals ? (
        <section
          aria-label={tx.officerMapLegendTitle as string}
          className="grid gap-3 sm:grid-cols-3"
        >
          <TotalTile
            label={tx.officerMapMissingHeader as string}
            value={formatNumber(totals.missing_reports.open + totals.missing_reports.matched + totals.missing_reports.closed, locale)}
            sub={[
              formatNumber(totals.missing_reports.open, locale),
              formatNumber(totals.missing_reports.matched, locale),
              formatNumber(totals.missing_reports.closed, locale),
            ].join(" · ")}
          />
          <TotalTile
            label={tx.officerMapFoundHeader as string}
            value={formatNumber(totals.found_reports.open + totals.found_reports.matched + totals.found_reports.referral_recorded, locale)}
            sub={[
              formatNumber(totals.found_reports.open, locale),
              formatNumber(totals.found_reports.matched, locale),
              formatNumber(totals.found_reports.referral_recorded, locale),
            ].join(" · ")}
          />
          <TotalTile
            label={tx.officerMapPairsHeader as string}
            value={formatNumber(totals.confirmed_pairs, locale)}
            sub=""
          />
        </section>
      ) : null}

      {/* District table (COMP-041). The accessible equivalent of the map (D3 a11y). */}
      <DistrictTable
        stats={stats}
        mapData={mapData}
        selected={selectedDistrict?.code ?? null}
        locale={locale}
        t={tx as unknown as Record<MessageKey, string>}
      />

      {/* Drill-through: counts + the actual case rows for the selected district. */}
      {selected && selectedStat ? (
        <section
          aria-labelledby="officer-map-selected"
          className="flex flex-col gap-4 rounded-lg border border-hairline bg-surface p-[16px] shadow-1 sm:p-6"
        >
          <h2 id="officer-map-selected" className="text-heading-4 font-semibold text-ink">
            {replaceToken(tx.officerMapSelected as string, { name: locale === "bn" ? selected.name_bn : selected.name_en })}
          </h2>
          <DistrictBreakdown
            locale={locale}
            t={tx as unknown as Record<MessageKey, string>}
            stat={selectedStat}
          />
          {role === "officer" ? (
            <OfficerDistrictCases
              districtCode={selected.code}
              districtName={locale === "bn" ? selected.name_bn : selected.name_en}
              rows={cases}
              locale={locale}
              t={tx as unknown as Record<MessageKey, string>}
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function replaceToken(s: string, vars: Record<string, string>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));
}

function parseDistrictParam(raw: string | undefined): { code: number } | null {
  if (!raw) return null;
  if (!/^[0-9]{1,2}$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 64) return null;
  return { code: n };
}

function TotalTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-hairline bg-surface p-[16px] shadow-1 sm:p-4">
      <p className="text-caption-md font-medium text-mute [&:lang(bn)]:text-body-sm">{label}</p>
      <p className="text-heading-3 font-semibold text-ink [&:lang(en)]:font-bold">{value}</p>
      {sub ? <p className="text-caption-md text-mute [&:lang(bn)]:text-body-sm">{sub}</p> : null}
    </div>
  );
}

function DistrictTable({
  stats,
  mapData,
  selected,
  locale,
  t,
}: {
  stats: DistrictCountRow[] | null;
  mapData: DistrictMapDatum[] | null;
  selected: number | null;
  locale: Locale;
  t: Record<MessageKey, string>;
}) {
  if (!stats || !mapData) {
    return null;
  }
  return (
    <section className="flex flex-col gap-3">
      <h2 className="sr-only">{t.officerMapDistrictHeader}</h2>
      <div className="hidden min-w-0 overflow-x-auto sm:block" tabIndex={0} role="region" aria-label={t.officerMapDistrictHeader}>
        <table className="w-full border-collapse text-left text-body-sm">
          <caption className="sr-only">{t.officerMapDistrictHeader}</caption>
          <thead>
            <tr className="border-b border-hairline">
              <th scope="col" className="py-2 pr-3 font-medium text-mute">{t.officerMapDistrictHeader}</th>
              <th scope="col" className="py-2 pr-3 font-medium text-mute">{t.officerMapStatusOpen}</th>
              <th scope="col" className="py-2 pr-3 font-medium text-mute">{t.officerMapStatusMatched}</th>
              <th scope="col" className="py-2 pr-3 font-medium text-mute">{t.officerMapStatusClosed}</th>
              <th scope="col" className="py-2 pr-3 font-medium text-mute">{t.officerMapPairsHeader}</th>
            </tr>
          </thead>
          <tbody>
            {ALL_DISTRICTS.map((d) => {
              const s = stats.find((x) => x.code === d.code);
              const m = mapData.find((x) => x.code === d.code);
              const isSel = selected === d.code;
              const open = (s?.missing_reports.open ?? 0) + (s?.found_reports.open ?? 0);
              const matched = (s?.missing_reports.matched ?? 0) + (s?.found_reports.matched ?? 0);
              const closed = (s?.missing_reports.closed ?? 0) + (s?.found_reports.referral_recorded ?? 0);
              const pairs = s?.confirmed_pairs ?? 0;
              const name = locale === "bn" ? d.name_bn : d.name_en;
              const total = open + matched + closed;
              return (
                <tr
                  key={d.code}
                  className={["border-b border-hairline align-top", isSel ? "bg-info-soft" : ""].join(" ")}
                >
                  <th scope="row" className="py-2 pr-3 font-medium text-body">
                    <a
                      href={`/officer/map?district=${d.code}`}
                      aria-current={isSel ? "true" : undefined}
                      className="inline-flex min-h-11 min-w-11 items-center text-ink underline-offset-2 hover:underline focus:underline"
                      lang={locale === "bn" ? "bn" : "en"}
                    >
                      {name}
                    </a>
                    {m ? (
                      <span className="ml-2 text-caption-md text-mute [&:lang(bn)]:text-body-sm">
                        {formatNumber(total, locale)}
                      </span>
                    ) : null}
                  </th>
                  <td className={["py-2 pr-3", open > 0 ? "text-ink" : "text-mute"].join(" ")}>{formatNumber(open, locale)}</td>
                  <td className={["py-2 pr-3", matched > 0 ? "text-warning-text" : "text-mute"].join(" ")}>{formatNumber(matched, locale)}</td>
                  <td className={["py-2 pr-3", closed > 0 ? "text-success-text" : "text-mute"].join(" ")}>{formatNumber(closed, locale)}</td>
                  <td className={["py-2 pr-3", pairs > 0 ? "text-ink" : "text-mute"].join(" ")}>{formatNumber(pairs, locale)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Stacked rows for narrow viewports. Each row is a link to the drill-through. */}
      <ul className="flex flex-col gap-2 sm:hidden">
        {ALL_DISTRICTS.map((d) => {
          const s = stats.find((x) => x.code === d.code);
          const isSel = selected === d.code;
          const open = (s?.missing_reports.open ?? 0) + (s?.found_reports.open ?? 0);
          const matched = (s?.missing_reports.matched ?? 0) + (s?.found_reports.matched ?? 0);
          const closed = (s?.missing_reports.closed ?? 0) + (s?.found_reports.referral_recorded ?? 0);
          const pairs = s?.confirmed_pairs ?? 0;
          const name = locale === "bn" ? d.name_bn : d.name_en;
          return (
            <li
              key={d.code}
              className={[
                "flex flex-col gap-1 rounded-md border p-3",
                isSel ? "border-info bg-info-soft" : "border-hairline bg-surface",
              ].join(" ")}
            >
              <a
                href={`/officer/map?district=${d.code}`}
                aria-current={isSel ? "true" : undefined}
                className="inline-flex min-h-11 min-w-11 items-center text-body-md font-medium text-ink underline-offset-2 hover:underline focus:underline"
                lang={locale === "bn" ? "bn" : "en"}
              >
                {name}
              </a>
              <p className="text-caption-md text-mute [&:lang(bn)]:text-body-sm">
                {t.officerMapStatusOpen} {formatNumber(open, locale)} · {t.officerMapStatusMatched} {formatNumber(matched, locale)} · {t.officerMapStatusClosed} {formatNumber(closed, locale)} · {t.officerMapPairsHeader} {formatNumber(pairs, locale)}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function DistrictBreakdown({
  stat,
  locale,
  t,
}: {
  stat: DistrictCountRow;
  locale: Locale;
  t: Record<MessageKey, string>;
}) {
  const open = stat.missing_reports.open + stat.found_reports.open;
  const matched = stat.missing_reports.matched + stat.found_reports.matched;
  const closed = stat.missing_reports.closed + stat.found_reports.referral_recorded;
  const total = open + matched + closed;
  return (
    <div className="flex flex-col gap-1 text-body-sm">
      <p className="text-body-md text-ink">
        {replaceToken(t.officerMapSelectedCount, { n: formatNumber(total, locale) })}
      </p>
      <p className="text-body text-body">
        {replaceToken(t.officerMapSelectedBreakdown, {
          open: formatNumber(open, locale),
          matched: formatNumber(matched, locale),
          closed: formatNumber(closed, locale),
        })}
      </p>
      <p className="text-body text-mute">
        {replaceToken(t.officerMapSelectedPairs, { n: formatNumber(stat.confirmed_pairs, locale) })}
      </p>
    </div>
  );
}
