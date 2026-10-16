// COMP-033 status badge (D3 SCREEN-004/006): icon + text + colour, never colour alone.
// D3 labels: খোলা / যাচাই চলছে / বন্ধ. Parent screens have no red (DESIGN.md Fera
// overrides), so "closed" is neutral, not a success or danger tone.
import type { StatusGroup } from "@/contracts";
import { STATUS_KEY } from "@/lib/outputs-client";
import { locales, type Locale } from "@/locales";
import { CircleCheckIcon, CircleDotIcon, GitCompareIcon } from "./icons";

const STYLE: Record<
  StatusGroup,
  { Icon: typeof CircleDotIcon; className: string }
> = {
  open: { Icon: CircleDotIcon, className: "bg-info-soft text-info-text" },
  matched: { Icon: GitCompareIcon, className: "bg-info-soft text-info-text" },
  closed: {
    Icon: CircleCheckIcon,
    className: "border border-hairline-strong bg-elevated text-body",
  },
};

export function StatusBadge({
  group,
  locale,
}: {
  group: StatusGroup;
  locale: Locale;
}) {
  const t = locales[locale];
  const { Icon, className } = STYLE[group];
  return (
    <span
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-sm px-2.5 text-body-sm font-medium ${className}`}
    >
      <span className="sr-only">{t.colStatus}: </span>
      <Icon className="size-4" />
      {t[STATUS_KEY[group]]}
    </span>
  );
}
