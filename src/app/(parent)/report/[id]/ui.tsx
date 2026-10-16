// SCREEN-004 shared card pieces (COMP-030/031). No "use client": these are plain
// components and class strings used by the two client cards, so a server component
// importing them gets real values, not client references.
import type { ReactNode, Ref } from "react";
import type { OutputType } from "@/contracts";
import {
  CircleAlertIcon,
  FileTextIcon,
  LayoutTemplateIcon,
  PhoneIcon,
} from "@/app/components/icons";
import {
  canRetry,
  outputFailureText,
  type OutputFailure,
} from "@/lib/outputs-client";
import { locales, type Locale, type MessageKey } from "@/locales";

// ACT-009/010/011 labels (D3) on the buttons; the card titles describe the output.
export const ACTION_KEY: Record<OutputType, MessageKey> = {
  gd: "outputGd",
  poster: "outputPoster",
  helpline: "outputHelpline",
};
const TITLE_KEY: Record<OutputType, MessageKey> = {
  gd: "outputGdTitle",
  poster: "outputPosterTitle",
  helpline: "outputHelplineTitle",
};
const ICON: Record<OutputType, typeof FileTextIcon> = {
  gd: FileTextIcon,
  poster: LayoutTemplateIcon,
  helpline: PhoneIcon,
};

// DESIGN.md Fera overrides: parent reading text is 18 px with line-height 1.7.
export const READ = "text-body-lg leading-[1.7]";

const BUTTON_BASE = `inline-flex min-h-11 max-w-full cursor-pointer items-center justify-center gap-2 rounded-md px-5 py-2 text-start ${READ} font-medium [overflow-wrap:anywhere]`;

// One primary per decision (DESIGN Principle 2): only "prepare poster" / "download".
export const BUTTON_PRIMARY = [
  BUTTON_BASE,
  "bg-primary text-on-primary transition-[transform,background-color] duration-(--duration-fast) ease-out",
  "hover:bg-primary-pressed active:scale-[0.97] aria-disabled:cursor-progress aria-disabled:active:scale-100",
].join(" ");

// D4 §13: control borders ≥ 3:1 (border-control), as on S-008 and S-013.
export const BUTTON_SECONDARY = [
  BUTTON_BASE,
  "border border-control bg-surface text-ink transition-colors duration-(--duration-fast) ease-out",
  "hover:border-control-strong hover:bg-hover aria-disabled:cursor-progress",
].join(" ");

// Live regions stay mounted (so additions are announced) but take no space while empty.
export const LIVE_EMPTY = "empty:absolute";

// The card frame: icon, title and the fixed draft label (BR-002). A group inside the
// page's outputs region, not a second landmark.
export function CardShell({
  type,
  locale,
  titleId,
  children,
}: {
  type: OutputType;
  locale: Locale;
  titleId: string;
  children: ReactNode;
}) {
  const t = locales[locale];
  const Icon = ICON[type];
  return (
    <div
      role="group"
      aria-labelledby={titleId}
      className="flex flex-col gap-4 rounded-lg border border-hairline bg-surface p-[16px] sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          aria-hidden="true"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-card text-mute"
        >
          <Icon />
        </span>
        <h3
          id={titleId}
          className="min-w-0 text-title font-semibold text-ink [overflow-wrap:anywhere]"
        >
          {t[TITLE_KEY[type]]}
        </h3>
        <span className="rounded-xs border border-dashed border-hairline-strong px-2 text-body-sm font-medium text-body">
          {t.outputDraftLabel}
        </span>
      </div>
      {locale === "en" && type !== "poster" && (
        <p className={`text-body-sm text-mute`}>{t.outputBanglaNote}</p>
      )}
      {children}
    </div>
  );
}

// A failed API-006 call: catalogue copy on a neutral surface (no red on parent screens).
// Rendered inside the card's always-mounted alert region; focus moves to it.
export function FailureBox({
  failure,
  locale,
  onRetry,
  focusRef,
}: {
  failure: OutputFailure;
  locale: Locale;
  onRetry: () => void;
  focusRef: Ref<HTMLDivElement>;
}) {
  const t = locales[locale];
  return (
    <div
      ref={focusRef}
      tabIndex={-1}
      className="flex flex-col items-start gap-3 rounded-md border border-hairline-strong bg-card px-3 py-3 outline-none"
    >
      <p className={`flex items-start gap-2 ${READ} text-ink`}>
        <CircleAlertIcon className="mt-[0.45em] size-4 shrink-0 text-mute" />
        <span className="min-w-0">{outputFailureText(failure, locale)}</span>
      </p>
      {canRetry(failure) && (
        <button type="button" onClick={onRetry} className={BUTTON_SECONDARY}>
          {t.retry}
        </button>
      )}
    </div>
  );
}

// Latin runs ("[MOCK]", the reference code) inside Bangla text are marked lang="en" for
// screen readers; the text itself (and what is copied) is unchanged.
const LATIN_RUN = /(\[?[A-Za-z][A-Za-z0-9-]*\]?)/;
export function markLatin(text: string): ReactNode[] {
  return text.split(LATIN_RUN).map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} lang="en" translate="no">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

// Selectable output text (D3: pre-like block, lang="bn"), named by its heading.
export function OutputText({
  text,
  labelledBy,
  id,
  blockRef,
}: {
  text: string;
  labelledBy: string;
  id?: string;
  blockRef: Ref<HTMLPreElement>;
}) {
  return (
    <pre
      ref={blockRef}
      id={id}
      lang="bn"
      role="group"
      aria-labelledby={labelledBy}
      tabIndex={0}
      className={`max-h-[28rem] overflow-auto rounded-md border border-hairline bg-elevated px-3 py-3 font-sans ${READ} whitespace-pre-wrap text-ink [overflow-wrap:anywhere] select-text`}
    >
      {markLatin(text)}
    </pre>
  );
}
