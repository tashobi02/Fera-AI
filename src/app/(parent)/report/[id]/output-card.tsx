"use client";

// COMP-030 output card (SCREEN-004 ACT-009/011/012; D3 states). API-006 is called only
// when the parent taps the card's action. The state machine and copy live in
// src/lib/outputs-client.ts; shared pieces in ./ui.tsx and ./use-output.ts.
//
// - Every card carries the draft label "খসড়া — নিজে জমা দিন" (BR-002).
// - The action button unmounts when the load ends, so focus moves on: to the text block
//   when it is ready (announced "লেখা তৈরি হয়েছে"), to the failure when it fails.
// - "তৈরি হচ্ছে…", "লেখা তৈরি হয়েছে" and "কপি হয়েছে" go to one polite region that is
//   cleared and re-set, so a second copy is announced again. Failures go to an
//   always-mounted alert region.
// - Errors use a neutral surface with an icon and catalogue copy: no red on parent
//   screens. E-004/E-019/E-020 offer no retry.
import { useEffect, useId, useRef } from "react";
import type { OutputType } from "@/contracts";
import { CopyIcon, LoaderCircleIcon } from "@/app/components/icons";
import { locales, type Locale } from "@/locales";
import { copyText } from "./copy";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  CardShell,
  FailureBox,
  OutputText,
  TITLE_KEY,
} from "./ui";
import { useAnnouncer, useOutput } from "./use-output";

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
  const [message, announce] = useAnnouncer();

  useEffect(() => {
    if (state.status === "ready") {
      announce(t.outputReady);
      blockRef.current?.focus();
    } else if (state.status === "failed") {
      failureRef.current?.focus();
    }
  }, [state.status, announce, t.outputReady]);

  async function onCopy(text: string) {
    const result = await copyText(text, blockRef.current);
    dispatch({ type: "copied" });
    announce(result === "copied" ? t.copied : t.copyManual);
  }

  return (
    <CardShell type={type} locale={locale} titleId={titleId}>
      <div role="status" aria-live="polite" aria-atomic="true">
        {state.status === "loading" ? (
          <p className="flex items-center gap-2 text-body-md text-body">
            <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
            <span>{t.outputPreparing}</span>
          </p>
        ) : (
          message && <p className="text-body-md text-body">{message}</p>
        )}
      </div>
      <div role="alert" aria-atomic="true">
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
          type="button"
          onClick={load}
          aria-disabled={state.status === "loading" || undefined}
          className={`${BUTTON_PRIMARY} self-start`}
        >
          {t[TITLE_KEY[type]]}
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
