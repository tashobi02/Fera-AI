// Shared pieces for the parent screens (Paper surface; D4 §2, §13; DESIGN.md Fera
// overrides): Lucide icons not yet in the shared icon set, button classes and the
// dashed "not real yet" label.
// ponytail: these icons copy the src/app/components/icons.tsx wrapper; move them there
// when the shell owner (TASK-008) takes the change.
import type { ReactNode } from "react";
import { locales, type Locale } from "@/locales";
import { InfoIcon } from "@/app/components/icons";

function Icon({ children, className = "size-4" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

type IconProps = { className?: string };

export const MicIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M12 19v3" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <rect x="9" y="2" width="6" height="13" rx="3" />
  </Icon>
);

export const MicOffIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M12 19v3" />
    <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
    <path d="M16.95 16.95A7 7 0 0 1 5 12v-2" />
    <path d="M18.89 13.23A7 7 0 0 0 19 12v-2" />
    <path d="m2 2 20 20" />
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
  </Icon>
);

export const SquareIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <rect width="18" height="18" x="3" y="3" rx="2" />
  </Icon>
);

export const SendIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
    <path d="m21.854 2.147-10.94 10.939" />
  </Icon>
);

export const PhoneIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384" />
  </Icon>
);

export const TrashIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </Icon>
);

export const ArrowRightIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </Icon>
);

export const CircleCheckIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <circle cx="12" cy="12" r="10" />
    <path d="m9 12 2 2 4-4" />
  </Icon>
);

export const FileTextIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M10 9H8" />
    <path d="M16 13H8" />
    <path d="M16 17H8" />
  </Icon>
);

export const RotateCcwIcon = ({ className }: IconProps) => (
  <Icon className={className}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </Icon>
);

const PRESS = "transition-[background-color,border-color,transform] duration-(--duration-fast) ease-out active:scale-[0.97]";

// One primary per view (DESIGN.md). Parent targets are >= 44 px; the start button 48 px.
export const PRIMARY_BUTTON = [
  "inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-5",
  "text-body-lg font-medium text-on-primary no-underline hover:bg-primary-pressed",
  "border border-transparent aria-disabled:cursor-progress aria-disabled:active:scale-100 aria-disabled:border-hairline-strong aria-disabled:bg-card aria-disabled:text-mute aria-disabled:hover:bg-card",
  PRESS,
].join(" ");

// Tertiary: control border >= 3:1 (D4 §13), used for chips and secondary actions.
export const TERTIARY_BUTTON = [
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-control bg-elevated px-4",
  "text-body-md font-medium text-ink no-underline hover:border-control-strong hover:bg-hover",
  "aria-disabled:cursor-progress aria-disabled:active:scale-100 aria-disabled:border-dashed aria-disabled:bg-card aria-disabled:text-mute aria-disabled:hover:bg-card aria-disabled:hover:border-control",
  PRESS,
].join(" ");

export const GHOST_BUTTON = [
  "inline-flex min-h-11 cursor-pointer flex-wrap items-center gap-2 rounded-md px-3 text-body-md text-body no-underline",
  "hover:bg-hover hover:text-ink",
  PRESS,
].join(" ");

// Dashed border = "not real yet": synthetic, [MOCK], cached, planned (DESIGN.md).
export function HonestLabel({ children, lang }: { children: ReactNode; lang?: string }) {
  return (
    <span
      lang={lang}
      className="inline-flex items-center rounded-xs border border-dashed border-hairline-strong px-2 text-body-sm font-medium text-body"
    >
      {children}
    </span>
  );
}

// Cached draft clock notice (S-002 / S-003 / S-005, BR-026, COMP-048). The
// three prepared cached drafts (Mitu, Rafi, Mim) use fixed `event.at`
// values while the source text contains relative words like "গতকাল" /
// "আজ সকালে". The dates are NOT recalculated from today, so the reporter
// must check or correct the date before submitting. This notice sits next
// to the D4 cached badge on the same surface; the badge label itself
// stays unchanged. Renders nothing when `cached` is false so live drafts
// are not affected.
export function CachedClockNotice({ locale, cached }: { locale: Locale; cached: boolean }) {
  if (!cached) return null;
  const t = locales[locale];
  return (
    <aside
      role="note"
      aria-label={t.cachedClockTitle}
      className="flex flex-col gap-2 rounded-md border border-hairline bg-card px-3 py-2.5 text-body-lg text-body"
    >
      <p className="flex items-start gap-2 font-medium text-ink">
        <InfoIcon className="mt-[0.3em] size-4 text-info" />
        <span>{t.cachedClockTitle}</span>
      </p>
      <p>{t.cachedClockBody}</p>
      <p>{t.cachedClockReviewPrompt}</p>
    </aside>
  );
}
