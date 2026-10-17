"use client";

// COMP-025 voice record button with timer (D4 §8–§9, §13; D3 D-001/D-002, §7 row 14).
// Tap to start, tap to stop, auto-stop at 120 s, no press-and-hold. The first tap
// triggers the browser permission prompt. No microphone, no MediaRecorder or a
// refused permission → onUnavailable (E-022); the text box stays the way in.
// Recording state is a static dot + word + timer: no red, no pulsing, no countdown.
import { useEffect, useId, useReducer, useRef, useState } from "react";
import { ERROR_CATALOGUE, LIMITS } from "@/contracts";
import {
  AUDIO_BITS_PER_SECOND,
  createRecordingSession,
  initialRecorderState,
  pickMimeType,
  recorderReducer,
  recorderSupported,
} from "@/lib/intake/recorder";
import { intakeEpoch, noticeAcknowledged } from "@/lib/intake/handoff";
import { clock } from "@/lib/intake/machine";
import { localizeDigits } from "@/lib/numerals";
import { locales, type Locale } from "@/locales";
import { CircleAlertIcon, LoaderCircleIcon } from "@/app/components/icons";
import { MicIcon, MicOffIcon, SquareIcon } from "../parent-ui";

type Props = {
  locale: Locale;
  busy: boolean; // a transcript or extraction is in flight ("uploading")
  off: "E-011" | "E-022" | null; // voice switched off for this page load
  onRecorded: (audio: Blob, durationS: number) => void;
  onUnavailable: () => void;
  cancelSignal?: AbortSignal;
  onActivityChange?: (active: boolean) => void;
};

const buzz = () => navigator.vibrate?.(10); // D4 §9 haptic tick where supported

export function VoiceRecorder({ locale, busy, off, onRecorded, onUnavailable, cancelSignal, onActivityChange }: Props) {
  const t = locales[locale];
  const uid = useId();
  const [state, dispatch] = useReducer(recorderReducer, initialRecorderState);
  const [announcement, setAnnouncement] = useState<"" | "recordingStopped">("");
  const [failed, setFailed] = useState(false);
  const [dropped, setDropped] = useState(false); // a hidden tab ended the recording: say so calmly
  const mounted = useRef(false);
  const lifecycle = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const session = useRef<ReturnType<typeof createRecordingSession> | null>(null);
  const callbacks = useRef({ onRecorded, onUnavailable, onActivityChange });
  useEffect(() => {
    callbacks.current = { onRecorded, onUnavailable, onActivityChange };
  });

  // Unmount (discard, navigation): stop the microphone without sending anything.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // This scalar must advance from its current value, including intervening taps.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      lifecycle.current++;
      session.current?.cancel();
      session.current = null;
      if (timer.current !== null) clearInterval(timer.current);
      timer.current = null;
    };
  }, []);

  useEffect(() => {
    const cancel = () => {
      lifecycle.current++;
      session.current?.cancel();
      session.current = null;
      dispatch({ type: "stopped" });
      setAnnouncement("");
      callbacks.current.onActivityChange?.(false);
    };
    cancelSignal?.addEventListener("abort", cancel, { once: true });
    return () => cancelSignal?.removeEventListener("abort", cancel);
  }, [cancelSignal]);

  // Privacy: leaving the page or hiding the tab stops the microphone and drops the audio
  // unsent (BR-004), like discard does.
  useEffect(() => {
    const drop = (notify = false) => {
      if (!session.current) return;
      if (notify) setDropped(true);
      lifecycle.current++;
      session.current.cancel();
      session.current = null;
      dispatch({ type: "stopped" });
      setAnnouncement("");
      callbacks.current.onActivityChange?.(false);
    };
    const onPageHide = () => drop();
    const hidden = () => { if (document.visibilityState === "hidden") drop(true); };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);

  function unavailable() {
    dispatch({ type: "unavailable" });
    callbacks.current.onUnavailable();
  }

  function stop() {
    session.current?.stop();
    buzz();
  }

  function start() {
    if (session.current || !mounted.current || cancelSignal?.aborted || !noticeAcknowledged()) return;
    if (!recorderSupported()) return unavailable();
    const consent = intakeEpoch();
    const mine = ++lifecycle.current;
    const alive = () => mounted.current && mine === lifecycle.current && consent === intakeEpoch() && noticeAcknowledged() && !cancelSignal?.aborted;
    setFailed(false);
    setDropped(false);
    setAnnouncement("");
    dispatch({ type: "request" });
    callbacks.current.onActivityChange?.(true);
    const capture = createRecordingSession({
      getUserMedia: () => navigator.mediaDevices.getUserMedia({ audio: true }),
      createRecorder: (stream) => {
        const mimeType = pickMimeType((type) => MediaRecorder.isTypeSupported(type));
        return new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: AUDIO_BITS_PER_SECOND });
      },
      now: () => performance.now(),
      timer,
    }, {
      alive,
      onStarted: () => { dispatch({ type: "started" }); buzz(); },
      onTick: (elapsed) => dispatch({ type: "tick", elapsed }),
      onRecorded: (audio, durationS) => {
        session.current = null;
        callbacks.current.onActivityChange?.(false);
        dispatch({ type: "stopped" });
        setAnnouncement("recordingStopped");
        if (alive()) callbacks.current.onRecorded(audio, durationS);
      },
      onFailed: (kind) => {
        session.current = null;
        callbacks.current.onActivityChange?.(false);
        if (kind === "unavailable") unavailable();
        else { dispatch({ type: "stopped" }); setFailed(true); }
      },
    });
    session.current = capture;
    void capture.start();
  }

  const recording = state.status === "recording";
  const offId = state.status === "unavailable" ? "E-022" : off;
  const timerText = `${clock(state.elapsed)} / ${clock(LIMITS.audioSeconds.max)}`;
  const status =
    state.status === "requesting" ? t.micRequesting : recording ? t.listening : announcement ? `${t[announcement]}${busy ? ` ${t.sending}` : ""}` : busy ? t.sending : "";

  const disabled = busy || state.status === "requesting";
  return (
    <div className="flex flex-col gap-1">
      {offId ? <p role="alert" className="flex items-start gap-3 rounded-lg border border-dashed border-hairline-strong bg-card px-4 py-3 text-body-md text-body">
        <MicOffIcon className="mt-[0.25em] size-5 text-mute" />
        <span>{ERROR_CATALOGUE[offId][locale]}</span>
      </p> : <>
      {/* aria-disabled, not disabled: focus stays on the button while a note uploads. */}
      <button
        type="button"
        onClick={() => (recording ? stop() : disabled ? undefined : void start())}
        aria-disabled={(disabled && !recording) || undefined}
        aria-labelledby={`${uid}-label`}
        aria-describedby={recording || busy ? undefined : `${uid}-hint`}
        className={[
          "group flex min-h-20 w-full cursor-pointer flex-col items-center gap-3 rounded-lg border bg-surface p-3 text-start min-[24rem]:flex-row min-[24rem]:gap-4",
          "transition-[border-color,background-color,transform] duration-(--duration-fast) ease-out active:scale-[0.99]",
          recording ? "border-primary" : "border-control hover:border-control-strong",
          "aria-disabled:cursor-progress aria-disabled:border-hairline aria-disabled:bg-elevated aria-disabled:text-disabled aria-disabled:active:scale-100",
        ].join(" ")}
      >
        <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-full border border-control text-ink group-hover:bg-hover group-aria-disabled:border-hairline group-aria-disabled:text-disabled">
          {recording ? <SquareIcon className="size-5" /> : <MicIcon className="size-6" />}
        </span>
        <span className="flex min-w-0 flex-col text-center min-[24rem]:text-start">
          <span
            id={`${uid}-label`}
            className={busy ? "sr-only" : "text-body-lg font-semibold text-ink group-aria-disabled:text-disabled"}
          >
            {recording ? t.stopAction : t.recordAction}
          </span>
          {recording ? (
            <span className="flex flex-wrap items-center justify-center min-[24rem]:justify-start gap-x-2 text-body-md text-body">
              <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
              <span>{t.listening}</span>
              <span role="timer" aria-label={t.recordingTime} className="tabular-nums [&:lang(en)]:font-mono">
                {localizeDigits(timerText, locale)}
              </span>
            </span>
          ) : busy ? (
            <span className="flex flex-wrap items-center justify-center min-[24rem]:justify-start gap-x-2 text-body-lg text-body">
              <LoaderCircleIcon className="size-4 animate-spin text-info" />
              <span>{t.sending}</span>
            </span>
          ) : (
            <span id={`${uid}-hint`} className="text-body-lg text-body group-aria-disabled:text-disabled">
              {t.recordHint}
            </span>
          )}
        </span>
      </button>
      <div role="alert" className={failed || dropped ? "flex items-start gap-2 text-body-md text-ink" : "sr-only"}>
        {(failed || dropped) && <><CircleAlertIcon className="mt-[0.3em] size-4 text-info" /><span>{failed ? ERROR_CATALOGUE["E-021"][locale] : t.recordingNotSent}</span></>}
      </div>
      </>}
      <p aria-live="polite" className="sr-only">
        {status}
      </p>
    </div>
  );
}
