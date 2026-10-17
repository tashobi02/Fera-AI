"use client";

// COMP-030 output card (SCREEN-004 ACT-009/011/012; D3 states). API-006 is called only
// when the parent taps the card's action. The state machine and copy live in
// src/lib/outputs-client.ts; shared pieces in ./ui.tsx and ./use-output.ts.
//
// - Every card carries the draft label "খসড়া — নিজে জমা দিন" (BR-002).
// - On a status change only (not on a language toggle): ready → focus the text block and
//   announce "লেখা তৈরি হয়েছে"; failed → focus the failure; a retry keeps focus on the
//   card's (loading) button.
// - Progress, ready and "কপি হয়েছে" share one polite region (re-announced each copy);
//   failures go to an always-mounted alert region. Empty regions take no space.
// - Errors use a neutral surface with an icon and catalogue copy: no red on parent
//   screens. E-004/E-019/E-020 offer no retry.
import { useId, useRef } from "react";
import type { OutputType } from "@/contracts";
import { CopyIcon, LoaderCircleIcon } from "@/app/components/icons";
import { locales, type Locale } from "@/locales";
import { copyText } from "./copy";
import {
  ACTION_KEY,
  BUTTON_SECONDARY,
  CardShell,
  FailureBox,
  LIVE_EMPTY,
  OutputText,
  READ,
} from "./ui";
import { useAnnouncer, useOnChange, useOutput } from "./use-output";

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
  const titleId = `${uid}-title`;
  const { state, dispatch, load } = useOutput(caseId, type);
  const blockRef = useRef<HTMLPreElement>(null);
  const failureRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const { message, announce, clear } = useAnnouncer();

  useOnChange(state.status, (status) => {
    if (status === "ready") {
      announce(t.outputReady);
      blockRef.current?.focus();
    } else if (status === "failed") {
      clear();
      failureRef.current?.focus();
    } else if (status === "loading") {
      clear();
      actionRef.current?.focus(); // a retry unmounts the failure box
    }
  });

  // A message in the previous language no longer holds after a language toggle.
  useOnChange(locale, clear);

  async function onCopy(text: string) {
    const result = await copyText(text, blockRef.current);
    dispatch({ type: "copied" });
    announce(result === "copied" ? t.copied : t.copyManual);
  }

  return (
    <CardShell type={type} locale={locale} titleId={titleId}>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={LIVE_EMPTY}
      >
        {state.status === "loading" ? (
          <p className={`flex items-center gap-2 ${READ} text-body`}>
            <LoaderCircleIcon className="size-4 shrink-0 animate-spin motion-reduce:animate-none" />
            <span>{t.outputPreparing}</span>
          </p>
        ) : (
          message && <p className={`${READ} text-body`}>{message}</p>
        )}
      </div>
      <div role="alert" aria-atomic="true" className={LIVE_EMPTY}>
        {state.status === "failed" && (
          <FailureBox
            failure={state.failure}
            locale={locale}
            onRetry={load}
            focusRef={failureRef}
          />
        )}
      </div>

      {(state.status === "idle" || state.status === "loading") && (
        <button
          ref={actionRef}
          type="button"
          onClick={load}
          aria-disabled={state.status === "loading" || undefined}
          className={`${BUTTON_SECONDARY} self-start`}
        >
          {t[ACTION_KEY[type]]}
        </button>
      )}
      {state.status === "ready" && (
        <>
          <OutputText
            text={state.output.text_bn}
            labelledBy={titleId}
            blockRef={blockRef}
          />
          <button
            type="button"
            onClick={() => onCopy(state.output.text_bn)}
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
