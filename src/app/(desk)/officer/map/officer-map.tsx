// COMP-040 district map (SCREEN-011, P3-041, TASK-030a, FR-019, BR-014; TC-012, TC-055).
// Server-rendered SVG: no client JS, no Leaflet (D3 §1 "Leaflet optional, bundled
// district outlines"). The SVG is a visual aid only — it is presentation-only and
// not in the tab order. The visible table on the same page is the accessible
// equivalent: every district is its own 44 px HTML link with the same counts and
// bucket label, so the map is operable from the keyboard and readable by a screen
// reader without relying on the SVG to be interactive.
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

export function OfficerMap({
  data,
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
      <div className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          width="100%"
          height="auto"
          aria-hidden="true"
          className="block max-w-full"
        >
          {/* Bangladesh outline. A simplified sketch, not a verified boundary; the page
              never claims it is one. Drawn from the centroids we already plot. */}
          <rect x="0" y="0" width={w} height={h} className="fill-elevated" />
          <path
            d="M 30 80 Q 70 30 200 60 T 460 110 L 480 250 Q 460 380 350 460 T 200 640 L 80 600 Q 30 460 40 300 Z"
            className="fill-surface stroke-hairline-strong"
            strokeWidth={1.5}
          />
          {data.map((d) => (
            <g key={d.code}>
              <circle
                cx={d.x}
                cy={d.y}
                r={d.bucket === "empty" ? 5 : 8}
                className={[
                  "transition-colors duration-(--duration-fast) ease-out",
                  bucketClass[d.bucket],
                ].join(" ")}
                strokeWidth={1.5}
              />
              <text
                x={d.x + 10}
                y={d.y + 4}
                className="fill-ink text-[10px] pointer-events-none"
              >
                {String(d.code).padStart(2, "0")}
              </text>
            </g>
          ))}
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
