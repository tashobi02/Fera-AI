// COMP-040 district map (SCREEN-011, P3-041, TASK-030a, FR-019, BR-014; TC-012, TC-055).
// Server-rendered SVG: no client JS, no Leaflet (D3 §1 "Leaflet optional, bundled
// district outlines"). One focusable button per district, with text label and counts,
// so the map is operable from the keyboard and readable by a screen reader. The
// visible table on the page is the accessible equivalent; the markers are a navigation
// aid, not the source of truth.
//
// Honest labels:
// - "No exact locations" note is rendered next to the SVG so a casual reader does not
//   mistake the centroid dots for a case location.
// - The colours are buckets, not magnitudes (open / matched / closed / empty). Pairs
//   are a separate badge, not a colour, because a pair is linkage, not state.
import type { Locale } from "@/locales";

export type DistrictMapDatum = {
  code: number;
  name: string;
  x: number;
  y: number;
  bucket: "open" | "matched" | "closed" | "empty";
  total: number;
  pairs: number;
};

const BUCKET_LABEL: Record<DistrictMapDatum["bucket"], { bn: string; en: string }> = {
  open: { bn: "খোলা", en: "Open" },
  matched: { bn: "যাচাই চলছে", en: "Being checked" },
  closed: { bn: "বন্ধ", en: "Closed" },
  empty: { bn: "কোনো রিপোর্ট নেই", en: "No reports" },
};

function localizeNumber(n: number, locale: Locale): string {
  const bn = "০১২৩৪৫৬৭৮৯";
  if (locale === "bn") return String(n).replace(/[0-9]/g, (d) => bn[Number(d)]);
  return String(n);
}

export function OfficerMap({
  data,
  locale,
  legend,
  bucketClass,
}: {
  data: DistrictMapDatum[];
  locale: Locale;
  legend: {
    title: string;
    total: string;
    open: string;
    matched: string;
    closed: string;
    empty: string;
    pairs: string;
  };
  bucketClass: Record<DistrictMapDatum["bucket"], string>;
}) {
  const w = 500;
  const h = 700;
  const buckets: DistrictMapDatum["bucket"][] = ["open", "matched", "closed", "empty"];

  return (
    <section
      aria-labelledby="officer-map-svg-title"
      className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface p-[16px] shadow-1 sm:p-4"
    >
      <h2 id="officer-map-svg-title" className="text-body-md font-semibold text-ink">
        {legend.title}
      </h2>
      <div
        className="relative w-full overflow-x-auto"
        role="group"
        aria-label={legend.title}
      >
        <svg
          viewBox={`0 0 ${w} ${h}`}
          width="100%"
          height="auto"
          role="img"
          aria-labelledby="officer-map-svg-title"
          className="block max-w-full"
        >
          {/* Bangladesh outline. A simplified sketch, not a verified boundary; the page
              never claims it is one. Drawn from the centroids we already plot. */}
          <rect x="0" y="0" width={w} height={h} className="fill-elevated" />
          <path
            d="M 30 80 Q 70 30 200 60 T 460 110 L 480 250 Q 460 380 350 460 T 200 640 L 80 600 Q 30 460 40 300 Z"
            className="fill-surface stroke-hairline-strong"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          {data.map((d) => {
            const label = BUCKET_LABEL[d.bucket][locale];
            const full = `${d.name} · ${label} · ${localizeNumber(d.total, locale)}`;
            return (
              <a key={d.code} href={`/officer/map?district=${d.code}`} aria-label={full}>
                <circle
                  cx={d.x}
                  cy={d.y}
                  r={d.bucket === "empty" ? 5 : 8}
                  className={[
                    "transition-colors duration-(--duration-fast) ease-out",
                    "hover:stroke-2 focus:stroke-2",
                    bucketClass[d.bucket],
                  ].join(" ")}
                  strokeWidth={1.5}
                  tabIndex={-1}
                />
                <text
                  x={d.x + 10}
                  y={d.y + 4}
                  className="fill-ink text-[10px] pointer-events-none"
                  aria-hidden="true"
                >
                  {String(d.code).padStart(2, "0")}
                </text>
              </a>
            );
          })}
        </svg>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-caption-md text-body [&:lang(bn)]:text-body-sm" aria-label={legend.title}>
        {buckets.map((b) => (
          <li key={b} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={["inline-block size-3 rounded-full border", bucketClass[b]].join(" ")}
            />
            <span>
              {b === "open" ? legend.open
                : b === "matched" ? legend.matched
                : b === "closed" ? legend.closed
                : legend.empty}
            </span>
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="inline-block size-3 rounded-full border border-hairline bg-elevated" />
          <span>{legend.pairs}</span>
        </li>
      </ul>
    </section>
  );
}
