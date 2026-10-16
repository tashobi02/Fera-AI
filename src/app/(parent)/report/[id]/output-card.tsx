"use client";

// COMP-030 output card (SCREEN-004 ACT-009/011/012; D3 states). API-006 is called only
// when the parent taps the card's action. The state machine and copy live in
// src/lib/outputs-client.ts; this file wires them to the DOM.
//
// - Every card carries the draft label "খসড়া — নিজে জমা দিন" (BR-002).
// - Loading is progress text in a polite status region; "কপি হয়েছে" is announced in the
//   same region, re-keyed per copy so a second copy is announced again.
// - Output text sits in a selectable, focusable <pre lang="bn"> block (D3 accessibility).
// - Errors use a neutral surface with an icon and catalogue copy: no red on parent
//   screens. E-004/E-019/E-020 offer no retry.
import { useId, useReducer, useRef, useState, type ReactNode } from "react";
import type { OutputType } from "@/contracts";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  CopyIcon,
  FileTextIcon,
  LayoutTemplateIcon,
  LoaderCircleIcon,
  PhoneIcon,
} from "@/app/components/icons";
import {
  canRetry,
  cardReducer,
  initialCardState,
  outputFailureText,
  requestOutput,
  type CardState,
  type OutputFailure,
} from "@/lib/outputs-client";
import { locales, type Locale, type MessageKey } from "@/locales";
import { copyText } from "./copy";

const TITLE_KEY: Record<OutputType, MessageKey> = {
  gd: "outputGd",
  poster: "outputPoster",
  helpline: "outputHelpline",
};
const ICON: Record<OutputType, typeof FileTextIcon> = {
  gd: FileTextIcon,
  poster: LayoutTemplateIcon,
  helpline: PhoneIcon,
};

export const BUTTON_PRIMARY = [
  "inline-flex min-h-11 max-w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-5 py-2 text-start",
  "text-body-md font-medium text-on-primary transition-[transform,background-color] duration-(--duration-fast) ease-out",
  "hover:bg-primary-pressed active:scale-[0.97] aria-disabled:cursor-progress aria-disabled:active:scale-100",
].join(" ");

export const BUTTON_SECONDARY = [
  "inline-flex min-h-11 max-w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-hairline-strong bg-transparent px-4 py-2 text-start",
  "text-body-md font-medium text-ink transition-colors duration-(--duration-fast) ease-out hover:bg-hover",
].join(" ");

// The card frame: icon, title and the fixed draft label.
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
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-4 rounded-lg border border-hairline bg-surface p-[16px] sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          aria-hidden="true"
          className="inline-flex size-9 items-center justify-center rounded-md bg-card text-mute"
        >
          <Icon />
        </span>
        <h3 id={titleId} className="text-title font-semibold text-ink">
          {t[TITLE_KEY[type]]}
        </h3>
        <span className="rounded-xs border border-dashed border-hairline-strong px-2 text-body-sm font-medium text-body">
          {t.outputDraftLabel}
        </span>
      </div>
      {children}
    </section>
  );
}

export function FailureBox({
  failure,
  locale,
  onRetry,
}: {
  failure: OutputFailure;
  locale: Locale;
  onRetry: () => void;
}) {
  const t = locales[locale];
  return (
    <div className="flex flex-col items-start gap-3 rounded-md border border-hairline-strong bg-card px-3 py-3">
      <p className="flex items-start gap-2 text-body-md text-ink">
        <CircleAlertIcon className="mt-[0.35em] size-4 text-mute" />
        <span>{outputFailureText(failure, locale)}</span>
      </p>
      {canRetry(failure) && (
        <button type="button" onClick={onRetry} className={BUTTON_SECONDARY}>
          {t.retry}
        </button>
      )}
    </div>
  );
}

export function OutputText({
  text,
  blockRef,
}: {
  text: string;
  blockRef: React.RefObject<HTMLPreElement | null>;
}) {
  return (
    <pre
      ref={blockRef}
      lang="bn"
      tabIndex={0}
      className="max-h-[28rem] overflow-auto rounded-md border border-hairline bg-elevated px-3 py-3 font-sans text-body-md whitespace-pre-wrap text-ink [overflow-wrap:anywhere] select-text"
    >
      {text}
    </pre>
  );
}

// Loads one output on demand; shared by the text cards and the poster card.
export function useOutput(caseId: string, type: OutputType) {
  const [state, dispatch] = useReducer(cardReducer, initialCardState);
  const inFlight = useRef(false);
  async function load() {
    if (inFlight.current) return;
    inFlight.current = true;
    dispatch({ type: "request" });
    try {
      dispatch({ type: "outcome", outcome: await requestOutput(caseId, type) });
    } finally {
      inFlight.current = false;
    }
  }
  return { state, dispatch, load };
}

export function OutputCard({
  caseId,
  type,
  locale,
}: {
  caseId: string;
  type: Exclude<OutputType, "poster">;
  locale: Locale;
}) {
  const t = locales[locale];
  const uid = useId();
  const { state, dispatch, load } = useOutput(caseId, type);
  const blockRef = useRef<HTMLPreElement>(null);
  const [copyResult, setCopyResult] = useState<"copied" | "manual" | null>(
    null,
  );

  async function onCopy(s: Extract<CardState, { status: "ready" }>) {
    const result = await copyText(s.output.text_bn, blockRef.current);
    setCopyResult(result);
    dispatch({ type: "copied" });
  }

  return (
    <CardShell type={type} locale={locale} titleId={`${uid}-title`}>
      <div role="status" aria-live="polite" aria-atomic="true">
        {state.status === "loading" && (
          <p className="flex items-center gap-2 text-body-md text-body">
            <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
            <span>{t.outputPreparing}</span>
          </p>
        )}
        {state.status === "ready" && copyResult && (
          <p
            key={state.copies}
            className="flex items-center gap-2 text-body-md text-body"
          >
            <CircleCheckIcon className="size-4 text-success" />
            <span>{copyResult === "copied" ? t.copied : t.copyManual}</span>
          </p>
        )}
      </div>

      {(state.status === "idle" || state.status === "loading") && (
        <button
          type="button"
          onClick={load}
          aria-disabled={state.status === "loading" || undefined}
          className={`${BUTTON_PRIMARY} self-start`}
        >
          {t[TITLE_KEY[type]]}
        </button>
      )}
      {state.status === "failed" && (
        <FailureBox failure={state.failure} locale={locale} onRetry={load} />
      )}
      {state.status === "ready" && (
        <>
          <OutputText text={state.output.text_bn} blockRef={blockRef} />
          <button
            type="button"
            onClick={() => onCopy(state)}
            className={`${BUTTON_SECONDARY} self-start`}
          >
            <CopyIcon />
            <span>{t.copyAction}</span>
          </button>
        </>
      )}
    </CardShell>
  );
}
