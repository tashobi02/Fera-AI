// COMP-025 voice record button (D4 §8–§9; D3 D-001/D-002): the button state reducer and
// the recording session that owns the microphone. "uploading" is the intake state's
// busy === "transcribing", so it is not repeated here.
import { LIMITS } from "@/contracts";

export type RecorderStatus = "idle" | "requesting" | "recording" | "unavailable";
export type RecorderState = { status: RecorderStatus; elapsed: number };
export type RecorderEvent =
  | { type: "request" }
  | { type: "started" }
  | { type: "tick"; elapsed: number }
  | { type: "stopped" } // also after a recorder error: back to a usable button
  | { type: "unavailable" };

export const initialRecorderState: RecorderState = { status: "idle", elapsed: 0 };

export function recorderReducer(s: RecorderState, e: RecorderEvent): RecorderState {
  if (s.status === "unavailable") return s; // E-022 is final for this page load
  switch (e.type) {
    case "request":
      return s.status === "idle" ? { status: "requesting", elapsed: 0 } : s;
    case "started":
      return s.status === "requesting" ? { status: "recording", elapsed: 0 } : s;
    case "tick":
      return s.status === "recording" && s.elapsed !== e.elapsed ? { ...s, elapsed: e.elapsed } : s;
    case "stopped":
      return { status: "idle", elapsed: 0 };
    case "unavailable":
      return { status: "unavailable", elapsed: 0 };
  }
}

// Tap to start, tap to stop, auto-stop at 120 s (D4 §9).
export const shouldAutoStop = (elapsedS: number) => elapsedS >= LIMITS.audioSeconds.max;

type RecorderGlobals = { MediaRecorder?: unknown; navigator?: { mediaDevices?: { getUserMedia?: unknown } } };
export function recorderSupported(g: RecorderGlobals = globalThis as RecorderGlobals): boolean {
  return typeof g.MediaRecorder === "function" && typeof g.navigator?.mediaDevices?.getUserMedia === "function";
}

// Opus first: small enough that 120 s stays far under 2 MB; Safari falls back to mp4.
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/mp4"];
export function pickMimeType(isTypeSupported: (type: string) => boolean): string | undefined {
  return MIME_TYPES.find((type) => isTypeSupported(type));
}
export const AUDIO_BITS_PER_SECOND = 32_000;

// Some browsers (Firefox, Safari) never settle getUserMedia when the prompt is dismissed.
// No pack value exists for this wait: 15 s is a local choice (OD-021-10).
export const PERMISSION_TIMEOUT_MS = 15_000;
// Only these mean "no microphone for this page load" (E-022). Anything else is retryable.
const FINAL_ERRORS = ["NotAllowedError", "NotFoundError", "SecurityError"];
// Diagnostics carry the error name only, never a message, payload or audio.
const errorName = (err: unknown) => (err instanceof Error || (typeof err === "object" && err !== null && "name" in err) ? String((err as { name: unknown }).name) : "unknown");
export const diagnose = (where: string, err: unknown) => console.warn(`intake ${where}: ${errorName(err)}`);

/* ---------- Recording session (privacy: BR-004, review round 1 items 1 and 14) ----------
 * One session per tap. `alive()` is the consent check: the caller captures the intake
 * epoch when the tap happens and the component's mount state. Every async step
 * (permission resolving, each timer tick, auto-stop, onstop) re-checks it. When it is
 * false the session stops the tracks, clears the timer and drops the audio unsent.
 */
export type TrackLike = { stop(): void };
export type StreamLike = { getTracks(): TrackLike[] };
export type RecorderLike = {
  readonly state: string; // "inactive" | "recording" | "paused"
  readonly mimeType: string;
  ondataavailable: ((event: BlobEvent) => void) | null;
  onstop: ((event: Event) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  start(timeslice?: number): void;
  stop(): void;
};
export type SessionDeps<S extends StreamLike> = {
  getUserMedia: () => Promise<S>;
  createRecorder: (stream: S) => RecorderLike;
  now: () => number; // milliseconds
  timer: { current: ReturnType<typeof setInterval> | null };
  permissionTimeoutMs?: number;
};
export type SessionHandlers = {
  alive: () => boolean;
  onStarted: () => void;
  onTick: (elapsedS: number) => void;
  onRecorded: (audio: Blob, durationS: number) => void;
  onFailed: (kind: "unavailable" | "error") => void;
};

export function createRecordingSession<S extends StreamLike>(deps: SessionDeps<S>, h: SessionHandlers) {
  let stream: S | null = null;
  let recorder: RecorderLike | null = null;
  let ownTimer: ReturnType<typeof setInterval> | null = null;
  let cancelled = false;
  let stopRequested = false;
  let permissionTimer: ReturnType<typeof setTimeout> | null = null;
  const live = () => !cancelled && h.alive();

  function clearTimer() {
    if (ownTimer !== null) clearInterval(ownTimer);
    // A cancelled permission can resolve after a newer session started. It owns
    // only its own interval; it must never clear the newer session's ref.
    if (deps.timer.current === ownTimer) deps.timer.current = null;
    ownTimer = null;
  }

  function release() {
    clearTimer();
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  function detach(rec: RecorderLike) {
    rec.onstop = null;
    rec.onerror = null;
    rec.ondataavailable = null;
    if (recorder === rec) recorder = null;
  }

  function clearPermissionTimer() {
    if (permissionTimer !== null) clearTimeout(permissionTimer);
    permissionTimer = null;
  }

  function cancel() {
    cancelled = true;
    clearPermissionTimer();
    const rec = recorder;
    if (rec) {
      detach(rec);
      if (rec.state !== "inactive") {
        try {
          rec.stop();
        } catch {
          // already stopped; the tracks are released below
        }
      }
    }
    release();
  }

  function stop() {
    if (!live()) return cancel();
    if (stopRequested || recorder?.state !== "recording") return;
    stopRequested = true;
    clearTimer();
    try {
      recorder.stop();
    } catch {
      cancel();
      h.onFailed("error");
    }
  }

  async function start() {
    let granted: S;
    permissionTimer = setTimeout(() => {
      permissionTimer = null;
      const ok = live();
      cancel(); // a stream that arrives later is released by the live() check below
      if (ok) h.onFailed("error");
    }, deps.permissionTimeoutMs ?? PERMISSION_TIMEOUT_MS);
    try {
      granted = await deps.getUserMedia();
    } catch (err) {
      clearPermissionTimer();
      diagnose("getUserMedia", err);
      if (live()) h.onFailed(FINAL_ERRORS.includes(errorName(err)) ? "unavailable" : "error");
      return;
    }
    clearPermissionTimer();
    stream = granted;
    if (!live()) return release(); // discarded or unmounted while the prompt was open

    let rec: RecorderLike;
    try {
      rec = deps.createRecorder(granted);
    } catch (err) {
      diagnose("createRecorder", err);
      release();
      if (live()) h.onFailed("unavailable");
      return;
    }
    recorder = rec;
    const chunks: Blob[] = [];
    const startedAt = deps.now();
    rec.ondataavailable = (event) => {
      if (!live()) return cancel();
      if (event.data.size > 0) chunks.push(event.data);
    };
    rec.onerror = (event) => {
      diagnose("recorder", (event as ErrorEvent).error);
      const ok = live();
      cancel();
      if (ok) h.onFailed("error");
    };
    rec.onstop = () => {
      const ok = live();
      cancelled = true; // terminal: a queued duplicate event cannot send twice
      const seconds = Math.min((deps.now() - startedAt) / 1000, LIMITS.audioSeconds.max);
      detach(rec);
      release();
      if (ok) h.onRecorded(new Blob(chunks, { type: rec.mimeType || "audio/webm" }), seconds);
    };
    try {
      rec.start(1000);
    } catch (err) {
      diagnose("start", err);
      detach(rec);
      release();
      if (live()) h.onFailed("error");
      return;
    }
    if (!live()) return cancel();
    h.onStarted();
    ownTimer = setInterval(() => {
      if (!live()) return cancel();
      const elapsed = (deps.now() - startedAt) / 1000;
      h.onTick(Math.floor(elapsed));
      if (shouldAutoStop(elapsed)) stop();
    }, 250);
    deps.timer.current = ownTimer;
  }

  return { start, stop, cancel };
}
