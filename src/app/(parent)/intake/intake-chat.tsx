"use client";

// SCREEN-002 intake chat (TASK-021; D3 SCREEN-002, §4, §7; D4 §9–§15.1). Wires the pure
// state (src/lib/intake/machine.ts) to the DOM, the recorder and an IntakeClient.
//
// Regions in reading order (D4 §15): processing notice + synthetic/[MOCK]/cached labels;
// conversation (COMP-024, labelled region; questions announced by focus);
// what was understood (draft fields or "অজানা");
// status (COMP-046); error (catalogue copy, neutral surface); voice (COMP-025); text or
// editable transcript (COMP-026) with quick replies (COMP-027); manual fallback; discard.
//
// Safeguards: capture controls exist only after the notice is acknowledged, and the
// client refuses calls before it (noticeGated). The draft stays in this component's
// memory and is handed to S-003/S-005 in device memory; nothing here submits a report.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useReducer, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent, type ReactNode, type Ref, type RefObject } from "react";
import { LIMITS, errorEnvelope, type DraftFieldPath, type ExtractResponse, type TranscribeResponse } from "@/contracts";
import { CircleAlertIcon, InfoIcon, LoaderCircleIcon } from "@/app/components/icons";
import { createHttpIntakeClient, failure, noticeGated, type IntakeResult } from "@/lib/intake/client";
import { diagnose } from "@/lib/intake/recorder";
import { createFakeIntakeClient } from "@/lib/intake/fakes/fake-client";
import { missingLabels, summaryRows, textLang } from "@/lib/intake/draft-summary";
import {
  MANUAL_FORM_PATH,
  REVIEW_PATH,
  acknowledgeNotice,
  clearIntakeMemory,
  handOff,
  intakeEpoch,
  invalidateIntakeEpoch,
  isPlainClick,
  noticeAcknowledged,
} from "@/lib/intake/handoff";
import {
  BUSY_SLOW_MS,
  BUSY_VISIBLE_MS,
  REQUEST_TIMEOUT_MS,
  busyStage,
  extractBody,
  initialIntakeState,
  intakeReducer,
  recordingProblem,
  textProblem,
  type Busy,
  type Message,
} from "@/lib/intake/machine";
import { sweepDrafts } from "@/lib/intake/draft-store";
import { locales, type Locale, type MessageKey } from "@/locales";
import {
  ArrowRightIcon,
  CircleCheckIcon,
  FileTextIcon,
  GHOST_BUTTON,
  HonestLabel,
  PRIMARY_BUTTON,
  RotateCcwIcon,
  SendIcon,
  TERTIARY_BUTTON,
  TrashIcon,
} from "../parent-ui";
import { ProviderNotice } from "../provider-notice";
import { VoiceRecorder } from "./voice-recorder";

export type IntakeClientMode = "fake" | "live";

const SEX_CHIPS: readonly MessageKey[] = ["sexMale", "sexFemale", "sexOther", "sexUnknown"];
const INPUT_MODE: Partial<Record<DraftFieldPath, "numeric" | "tel">> = {
  "child.age_years": "numeric",
  "child.age_min": "numeric",
  "child.age_max": "numeric",
  "reporter.phone": "tel",
};

// COMP-046: the verb after 300 ms, "still working" at 10 s; reset when the run ends.
function useBusyStage(busy: Busy) {
  const [stage, setStage] = useState<"quiet" | "working" | "slow">("quiet");
  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const update = () => setStage(busyStage(Date.now() - started));
    const timers = [setTimeout(update, BUSY_VISIBLE_MS), setTimeout(update, BUSY_SLOW_MS)];
    return () => {
      timers.forEach(clearTimeout);
      setStage("quiet");
    };
  }, [busy]);
  return busy ? stage : "quiet";
}

export function IntakeChat({ locale, mode }: { locale: Locale; mode: IntakeClientMode }) {
  const t = locales[locale];
  const uid = useId();
  const router = useRouter();
  const client = useMemo(
    () => noticeGated(mode === "live" ? createHttpIntakeClient() : createFakeIntakeClient(), noticeAcknowledged),
    [mode],
  );
  const [state, dispatch] = useReducer(intakeReducer, undefined, () => initialIntakeState(noticeAcknowledged()));
  const [fieldError, setFieldError] = useState<MessageKey | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captureAbort, setCaptureAbort] = useState(() => new AbortController());
  const stage = useBusyStage(state.busy);

  const textRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const focusRef = useRef<HTMLElement | null>(null); // newest question or outcome heading
  const generation = useRef(0); // bumps on discard so late replies are dropped
  const mounted = useRef(false);
  const inFlight = useRef<AbortController | null>(null);
  const requestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const capturingRef = useRef(false);
  const discardRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  const last = useRef<{ busy: "transcribing" | "extracting"; exec: () => Promise<void> } | null>(null);
  const latestState = useRef(state);
  useEffect(() => {
    latestState.current = state;
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // This scalar must advance from the latest request, not its value at mount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      inFlight.current?.abort();
      inFlight.current = null;
      if (requestTimer.current !== null) clearTimeout(requestTimer.current);
      requestTimer.current = null;
      // VoiceRecorder owns capture cleanup. Aborting the state-owned signal here
      // would leave it aborted after StrictMode's setup/cleanup/setup replay.
      invalidateIntakeEpoch();
    };
  }, []);

  // W4: every S-002 mount sweeps readable expired drafts, including attempts.
  // Active attempts, corrupt attempted identities and unreadable storage survive.
  useEffect(() => { try { sweepDrafts(); } catch {} }, []);

  // Arriving from S-001 by client navigation leaves focus on <body>; start at the title.
  useEffect(() => {
    if (noticeAcknowledged()) titleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (confirmingDiscard) keepRef.current?.focus();
    else if (wasConfirming.current) discardRef.current?.focus();
    wasConfirming.current = confirmingDiscard;
  }, [confirmingDiscard]);

  // A new question, the transcript or an outcome takes focus, so keyboard and screen
  // reader users land on what changed (D3: recorder and questions announced).
  useEffect(() => {
    if (confirmingDiscard) return; // the confirmation owns focus
    if (state.asked > 0 || state.phase === "complete" || state.phase === "manual") focusRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-running when the panel closes would steal focus from "Discard"
  }, [state.asked, state.phase]);
  useEffect(() => {
    if (confirmingDiscard) return;
    if (state.heard) textRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as above
  }, [state.heard]);

  async function run<T>(call: (signal: AbortSignal) => Promise<IntakeResult<T>>, ok: (data: T) => void) {
    if (!mounted.current) return;
    // Callers already dispatched busy, so a refusal must end it visibly, never return silently.
    if (!noticeAcknowledged()) return dispatch({ type: "reset", acknowledged: false });
    if (inFlight.current) return dispatch({ type: "failed", error: errorEnvelope("E-021") });
    const mine = ++generation.current;
    const consent = intakeEpoch();
    const controller = new AbortController();
    inFlight.current = controller;
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    requestTimer.current = timeout;
    let result: IntakeResult<T>;
    try {
      result = navigator.onLine === false ? failure("E-024") : await call(controller.signal);
    } catch (err) {
      diagnose("request", err); // error name only: no payload, text or audio
      result = failure("E-021");
    }
    clearTimeout(timeout);
    if (mine !== generation.current || !mounted.current || consent !== intakeEpoch()) return;
    inFlight.current = null;
    requestTimer.current = null;
    if (result.ok) last.current = null; // a finished request keeps no audio or text for a retry
    if (controller.signal.aborted) dispatch({ type: "failed", error: errorEnvelope("E-014") });
    else if (result.ok) {
      try {
        ok(result.data);
      } catch (err) {
        diagnose("apply", err);
        dispatch({ type: "failed", error: errorEnvelope("E-021") });
      }
    } else dispatch({ type: "failed", error: result.error });
  }

  function start(busy: "transcribing" | "extracting", exec: () => Promise<void>) {
    last.current = { busy, exec };
    void exec();
  }

  function sendText(raw: string) {
    const s = latestState.current;
    if (capturingRef.current) {
      setFieldError("finishRecordingFirst");
      textRef.current?.focus();
      return;
    }
    if (s.busy || inFlight.current || confirmingDiscard) return; // busy status is already on screen
    const problem = textProblem(raw, s.latest !== null);
    if (problem) {
      setFieldError(problem === "short" ? "textTooShort" : "answerRequired");
      textRef.current?.focus();
      return;
    }
    const text = raw.trim();
    const body = extractBody(s, text);
    dispatch({ type: "extract", text });
    start("extracting", () => run((signal) => client.extract(body, signal), (data: ExtractResponse) => dispatch({ type: "extracted", data })));
  }

  function onRecorded(audio: Blob, durationS: number) {
    if (!mounted.current || captureAbort.signal.aborted) return; // unmounted or discarded: dropped on purpose
    if (!noticeAcknowledged()) return dispatch({ type: "reset", acknowledged: false });
    if (inFlight.current) {
      setFieldError("recordingNotSent");
      return;
    }
    const problem = recordingProblem(durationS, audio.size);
    if (problem) return dispatch({ type: "failed", error: errorEnvelope(problem) });
    const token = latestState.current.token ?? undefined;
    dispatch({ type: "transcribe" });
    start("transcribing", () =>
      run(
        (signal) => client.transcribe({ audio, durationS, draftToken: token }, signal),
        (data: TranscribeResponse) => dispatch({ type: "transcribed", data }),
      ),
    );
  }

  function onVoiceUnavailable() {
    dispatch({ type: "failed", error: errorEnvelope("E-022") });
    textRef.current?.focus(); // D3 §7 row 14: text box focused
  }

  function retry() {
    if (!last.current || inFlight.current || latestState.current.busy || confirmingDiscard) return;
    dispatch({ type: "retry", busy: last.current.busy });
    void last.current.exec();
  }

  function cancelRequest() {
    last.current = null; // a cancelled request must not be retried: it may hold the audio (privacy)
    generation.current++;
    inFlight.current?.abort();
    inFlight.current = null;
    if (requestTimer.current !== null) clearTimeout(requestTimer.current);
    requestTimer.current = null;
    captureAbort.abort();
    capturingRef.current = false;
    setCapturing(false);
    invalidateIntakeEpoch();
  }

  function handTo(to: "review" | "manual", event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || !isPlainClick(event)) return;
    cancelRequest();
    const firstParent = state.messages.find((m) => m.from === "parent");
    const source = state.latest?.draft.source_text ?? (firstParent?.from === "parent" ? firstParent.text : "");
    const unsent = state.messages.flatMap((m) => m.from === "parent" && m.status !== "sent" ? [m.text] : []);
    handOff({
      to,
      sourceText: [...new Set([source, ...unsent, state.text].filter((text) => text.trim()))].join("\n"),
      response: state.latest,
      missing: state.latest?.missing_fields ?? [],
      asked: state.asked,
      cached: state.cached,
      mock: client.mock,
    });
  }

  function discard() {
    const entered = Boolean(state.text.trim() || state.messages.length || state.latest || state.heard || capturingRef.current);
    if (!entered) return finishDiscard();
    // Only the microphone stops now (its button is hidden while asking). A request in
    // flight keeps running until "মুছুন" is confirmed, so "রাখুন" loses nothing (R3).
    captureAbort.abort();
    capturingRef.current = false;
    setCapturing(false);
    setConfirmingDiscard(true);
  }

  function finishDiscard() {
    cancelRequest();
    dispatch({ type: "cancel" });
    clearIntakeMemory();
    last.current = null;
    dispatch({ type: "reset", acknowledged: false });
    router.push("/");
  }

  function keepDraft() {
    setCaptureAbort(new AbortController());
    setConfirmingDiscard(false);
  }

  function discardKeys(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") { event.preventDefault(); keepDraft(); }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendText(state.text);
  }

  const answering = state.latest !== null;
  const errorId = state.error?.error.id;
  const canRetry = state.error?.error.retryable === true && state.phase !== "manual" && state.phase !== "complete";
  const visibleError = state.error !== null && errorId !== state.voiceOff;
  const busyText = state.busy === "transcribing" ? t.sending : state.busy === "extracting" ? t.understanding : "";
  const capture = state.phase === "compose" || state.phase === "question";
  const ids = { text: `${uid}-text`, textError: `${uid}-text-error`, hint: `${uid}-hint`, limit: `${uid}-limit`, question: `${uid}-question-${state.asked}`, discard: `${uid}-discard`, understood: `${uid}-understood`, outcome: `${uid}-outcome` };
  const atLimit = state.text.length >= LIMITS.textChars.max;
  const showExample = state.latest === null && !state.heard;
  const description = [state.phase === "question" ? ids.question : null, showExample ? ids.hint : null, fieldError ? ids.textError : null, atLimit ? ids.limit : null].filter(Boolean).join(" ") || undefined;

  if (state.phase === "notice") {
    return (
      <Shell title={t.intakeEmptyPrompt} titleRef={titleRef}>
        <ProviderNotice locale={locale} variant="full" mock={client.mock} />
        <button
          type="button"
          onClick={() => {
            acknowledgeNotice();
            setCaptureAbort(new AbortController());
            dispatch({ type: "acknowledge" });
            titleRef.current?.focus(); // the button is about to go; keep focus on the page
          }}
          className={`${PRIMARY_BUTTON} w-full`}
        >
          {t.noticeAckAction}
          <ArrowRightIcon className="size-5" />
        </button>
      </Shell>
    );
  }

  return (
    <Shell title={t.intakeEmptyPrompt} titleRef={titleRef}>
      <ProviderNotice locale={locale} variant="compact" mock={client.mock} cached={state.cached} />

      <section aria-live="off" aria-label={t.conversationLabel} className={state.messages.length ? "flex flex-col gap-3" : "contents"}>
        {state.messages.map((m) => (
          <ChatMessage
            key={m.id}
            message={m}
            locale={locale}
            questionId={m.from === "fera" ? `${uid}-question-${m.n}` : undefined}
            onQuestionKeyDown={(event) => {
              if (event.key === "Tab" && !event.shiftKey) { event.preventDefault(); textRef.current?.focus(); }
            }}
            focusRef={m.from === "fera" && m.n === state.asked && state.phase === "question" ? focusRef : undefined}
          />
        ))}
      </section>

      <div className={(stage === "quiet" || (state.busy === "transcribing" && stage !== "slow")) && !visibleError ? "contents" : "flex flex-col gap-3"}>
        <p role="status" className={stage === "quiet" || (state.busy === "transcribing" && stage !== "slow") ? "sr-only" : "flex items-center gap-2 text-body-md text-body"}>
          {stage !== "quiet" && (stage === "slow" || state.busy !== "transcribing") && (
            <>
              <LoaderCircleIcon className="size-4 animate-spin text-info" />
              <span>{stage === "slow" ? t.stillWorking : busyText}</span>
            </>
          )}
        </p>
        {stage === "slow" && (
          <Link href={MANUAL_FORM_PATH} onClick={(event) => handTo("manual", event)} className="inline-flex min-h-11 items-center self-start text-body-md underline underline-offset-2">
            {t.useFormLink}
          </Link>
        )}

        <div role="alert" aria-atomic="true" className={visibleError ? undefined : "sr-only"}>
          {/* E-011/E-022 are displayed and announced once, by VoiceRecorder. */}
          {visibleError && state.error && (
            <div className="flex flex-col gap-3 rounded-lg border border-control bg-card px-4 py-3">
              <p className="flex items-start gap-2 text-body-md text-ink">
                <CircleAlertIcon className="mt-[0.3em] size-4" />
                <span>{locale === "bn" ? state.error.error.message_bn : state.error.error.message_en}</span>
              </p>
              {(canRetry || errorId === "E-019") && (
                <button
                  type="button"
                  onClick={errorId === "E-019" ? () => {
                    cancelRequest(); clearIntakeMemory(); setCaptureAbort(new AbortController());
                    last.current = null; dispatch({ type: "reset", acknowledged: false });
                  } : retry}
                  aria-disabled={state.busy !== null || confirmingDiscard || undefined}
                  className={`${TERTIARY_BUTTON} self-start`}
                >
                  <RotateCcwIcon />
                  {errorId === "E-019" ? t.startAgainAction : t.retryAction}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {capture && !confirmingDiscard && (
        <div className="flex flex-col gap-4">
          {state.phase === "question" && state.question?.field === "child.sex" && (
            <div role="group" aria-label={state.question[locale]} className="flex flex-wrap gap-2">
              {SEX_CHIPS.map((key) => (
                <button key={key} type="button" onClick={() => sendText(t[key])} aria-disabled={state.busy !== null || undefined} className={TERTIARY_BUTTON}>
                  {t[key]}
                </button>
              ))}
            </div>
          )}

          <VoiceRecorder
            locale={locale}
            busy={state.busy !== null}
            off={state.voiceOff}
            onRecorded={onRecorded}
            onUnavailable={onVoiceUnavailable}
            cancelSignal={captureAbort.signal}
            onActivityChange={(active) => { capturingRef.current = active; setCapturing(active); }}
          />

          <form noValidate onSubmit={onSubmit} className="flex flex-col gap-2">
            <label htmlFor={ids.text} className="text-body-md font-medium text-ink">
              {state.heard ? t.transcriptLabel : answering ? t.answerLabel : state.voiceOff ? t.typeHere : t.textLabel}
            </label>
            <textarea
              ref={textRef}
              id={ids.text}
              name="text"
              value={state.text}
              maxLength={LIMITS.textChars.max}
              inputMode={state.question ? INPUT_MODE[state.question.field] : undefined}
              rows={answering && !state.heard ? 2 : 4}
              aria-invalid={fieldError !== null || undefined}
              aria-describedby={description}
              lang={textLang(state.text)}
              onChange={(event) => {
                dispatch({ type: "edit", text: event.target.value });
                setFieldError(null);
              }}
              className={[
                "w-full resize-none rounded-md border border-control bg-elevated px-3 py-2.5 text-body-lg text-ink [field-sizing:content]",
                "max-h-[60vh] transition-colors duration-(--duration-fast) ease-out",
                "hover:border-control-strong focus:border-control-strong focus:shadow-1",
              ].join(" ")}
            />
            {showExample && <p id={ids.hint} className="text-body-sm text-mute">{t.intakeExample}</p>}
            <p id={ids.limit} role="status" className={atLimit ? "flex items-start gap-1.5 text-body-sm text-body" : "sr-only"}>
              {atLimit && <><InfoIcon className="mt-[0.25em] size-4 text-info" /><span>{t.textLimitReached}</span></>}
            </p>
            {fieldError && (
              <p id={ids.textError} role="alert" className="flex items-start gap-1.5 text-body-sm text-ink">
                <InfoIcon className="mt-[0.25em] size-4 text-info" />
                <span>{t[fieldError]}</span>
              </p>
            )}
            <button type="submit" aria-disabled={state.busy !== null || capturing || undefined} className={`${PRIMARY_BUTTON} self-stretch sm:self-end`}>
              <SendIcon />
              {state.heard ? t.transcriptSend : t.sendAction}
            </button>
          </form>
        </div>
      )}

      {state.phase === "complete" && !confirmingDiscard && (
        <Outcome headingId={ids.outcome} focusRef={focusRef} icon={<CircleCheckIcon className="size-5 text-success-text" />} title={t.readyTitle}>
          <p className="text-body-md text-body">{t.beforeSubmit}</p>
          <Link href={REVIEW_PATH} onClick={(event) => handTo("review", event)} className={PRIMARY_BUTTON}>{t.reviewAction}</Link>
        </Outcome>
      )}

      {state.phase === "manual" && !confirmingDiscard && (
        <Outcome headingId={ids.outcome} focusRef={focusRef} icon={<FileTextIcon className="size-5 text-info" />} title={t.manualTitle}>
          {state.latest && state.latest.missing_fields.length > 0 && (
            <div className="text-body-md text-body">
              <p>{t.stillUnknown}</p>
              <ul className="list-disc ps-5">
                {missingLabels(state.latest.missing_fields, locale).map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            </div>
          )}
          {state.latest && <Link href={REVIEW_PATH} onClick={(event) => handTo("review", event)} className={PRIMARY_BUTTON}>{t.reviewAction}</Link>}
          <Link href={MANUAL_FORM_PATH} onClick={(event) => handTo("manual", event)} className={`${TERTIARY_BUTTON} self-start`}>
            <FileTextIcon />
            {t.openFormAction}
          </Link>
        </Outcome>
      )}

      {state.latest && (
        <section aria-labelledby={ids.understood} className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface p-[16px] shadow-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id={ids.understood} className="text-heading-sm font-semibold text-ink">
              {t.understoodTitle}
            </h2>
            {client.mock && <HonestLabel lang="en">{t.mockLabel}</HonestLabel>}
          </div>
          <dl className="flex flex-col">
            {summaryRows(state.latest.draft, locale).map((row) => (
              <div key={row.key} className="flex flex-wrap justify-between gap-x-4 border-t border-hairline-soft py-2 first:border-t-0">
                <dt className="text-body-md text-mute">{row.label}</dt>
                <dd lang={row.lang} className={`${row.value === null ? "text-body-md text-mute" : "text-body-md font-medium text-ink"} min-w-0 break-words whitespace-pre-wrap`}>
                  {row.value ?? t.unknownValue}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {confirmingDiscard ? (
        <section role="group" aria-labelledby={ids.discard} onKeyDown={discardKeys} className="flex flex-col gap-4 rounded-lg border border-control bg-surface p-4 shadow-1">
          <h2 id={ids.discard} className="text-heading-sm font-semibold text-ink">{t.discardConfirm}</h2>
          <div className="flex flex-wrap gap-3">
            <button ref={keepRef} type="button" onClick={keepDraft} className={TERTIARY_BUTTON}>{t.discardNo}</button>
            <button ref={deleteRef} type="button" onClick={finishDiscard} className={PRIMARY_BUTTON}><TrashIcon />{t.discardYes}</button>
          </div>
        </section>
      ) : <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3">
        {state.phase !== "manual" ? (
          <Link href={MANUAL_FORM_PATH} onClick={(event) => handTo("manual", event)} className={GHOST_BUTTON}>
            <FileTextIcon />{t.openFormAction}
          </Link>
        ) : (
          <span />
        )}
        <button ref={discardRef} type="button" onClick={discard} className={GHOST_BUTTON}>
          <TrashIcon />
          {t.discardAction}
        </button>
      </div>}
    </Shell>
  );
}

function Shell({ title, titleRef, children }: { title: string; titleRef: Ref<HTMLHeadingElement>; children: ReactNode }) {
  return (
    <div data-surface="parent" className="mx-auto flex w-full max-w-[30rem] flex-col gap-6 px-[16px] pt-6 pb-12">
      <h1 ref={titleRef} tabIndex={-1} className="text-heading-3 font-semibold text-ink rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring [&:lang(en)]:font-bold [&:lang(en)]:tracking-[-0.25px]">
        {title}
      </h1>
      {children}
    </div>
  );
}

// COMP-024: Fera on the left, the parent on the right; speaker named for screen readers.
function Bubble({ from, name, children }: { from: "fera" | "parent"; name: string; children: ReactNode }) {
  return (
    <div
      className={[
        "flex max-w-[88%] flex-col gap-1 rounded-lg px-4 py-3 text-body-lg",
        from === "fera" ? "self-start rounded-bl-xs border border-hairline bg-surface text-ink" : "self-end rounded-br-xs bg-info-soft text-ink",
      ].join(" ")}
    >
      <span className="sr-only">{name}: </span>
      {children}
    </div>
  );
}

function ChatMessage({
  message,
  locale,
  focusRef,
  questionId,
  onQuestionKeyDown,
}: {
  message: Message;
  locale: Locale;
  focusRef?: RefObject<HTMLElement | null>;
  questionId?: string;
  onQuestionKeyDown: (event: KeyboardEvent<HTMLParagraphElement>) => void;
}) {
  const t = locales[locale];
  if (message.from === "fera") {
    // COMP-027: the question in the reader's language; it takes focus when it is new.
    return (
      <Bubble from="fera" name={t.appName}>
        <p id={questionId} ref={focusRef as Ref<HTMLParagraphElement>} tabIndex={focusRef ? -1 : undefined} onKeyDown={focusRef ? onQuestionKeyDown : undefined} className="font-medium rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
          {message.question[locale]}
        </p>
      </Bubble>
    );
  }
  return (
    <Bubble from="parent" name={t.speakerParent}>
      <p lang={textLang(message.text)} className="break-words whitespace-pre-wrap">{message.text}</p>
      {message.status !== "sent" && (
        <span className="flex items-center gap-1.5 self-end text-body-sm text-body">
          {message.status === "sending" ? <LoaderCircleIcon className="size-3.5 animate-spin" /> : <CircleAlertIcon className="size-3.5" />}
          {message.status === "sending" ? t.messageSending : t.messageFailed}
        </span>
      )}
    </Bubble>
  );
}

function Outcome({
  headingId,
  focusRef,
  icon,
  title,
  children,
}: {
  headingId: string;
  focusRef: RefObject<HTMLElement | null>;
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface p-[16px] shadow-1">
      <h2
        id={headingId}
        ref={focusRef as Ref<HTMLHeadingElement>}
        tabIndex={-1}
        className="flex items-start gap-2 text-heading-sm font-semibold text-ink rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <span className="mt-[0.15em]">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}
// S-005 manual form is now built (P3-013); the form link in S-002 is a real
// ghost link to /intake/form, with no child payload in the URL. The device-local
// draft (or handoff) carries the parent's words into the form.
