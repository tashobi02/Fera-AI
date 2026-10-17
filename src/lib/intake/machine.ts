// SCREEN-002 intake state (TASK-021; D3 SCREEN-002, §7; BR-004, BR-023). Pure, so it is
// unit-tested without a browser; intake-chat.tsx wires it to the DOM and the client.
//
//   notice   → provider notice not yet acknowledged on this page load: no capture
//   compose  → text box (or the editable transcript after a voice note, `heard`)
//   question → one follow-up question (COMP-027), at most LIMITS.followUpRounds
//   complete → D-004 complete: hand the device-held draft to SCREEN-003
//   manual   → rounds used up, or E-012/E-013/E-014×2/E-023: hand off to SCREEN-005
//
// The draft lives only in this state (device memory). Nothing here submits a report.
import {
  LIMITS,
  type ErrorEnvelope,
  type ErrorId,
  type ExtractRequestInput,
  type ExtractResponse,
  type NextQuestion,
  type TranscribeResponse,
} from "@/contracts";

export type Phase = "notice" | "compose" | "question" | "complete" | "manual";
export type Busy = "transcribing" | "extracting" | null;
export type MessageStatus = "sending" | "sent" | "error"; // COMP-024 states

export type Message =
  | { id: number; from: "parent"; text: string; status: MessageStatus }
  | { id: number; from: "fera"; question: NextQuestion; n: number };

export type IntakeState = {
  phase: Phase;
  busy: Busy;
  messages: Message[];
  text: string; // composer value; after a voice note, the editable transcript (COMP-026)
  heard: boolean; // `text` came from API-001
  token: string | null; // latest opaque draft_token
  latest: ExtractResponse | null; // device-held draft with its revision
  asked: number; // follow-up questions shown so far
  question: NextQuestion | null;
  error: ErrorEnvelope | null;
  timeouts: number; // E-014s in a row: retry once, then the form (D3 §7 row 10)
  voiceOff: VoiceOffId | null; // E-022 or E-011: text path only
  cached: boolean; // any reply came from the demo cache (COMP-048)
};

export type IntakeEvent =
  | { type: "acknowledge" }
  | { type: "edit"; text: string }
  | { type: "transcribe" }
  | { type: "transcribed"; data: TranscribeResponse }
  | { type: "extract"; text: string }
  | { type: "extracted"; data: ExtractResponse }
  | { type: "retry"; busy: Exclude<Busy, null> }
  | { type: "cancel" }
  | { type: "failed"; error: ErrorEnvelope }
  | { type: "reset"; error?: ErrorEnvelope; acknowledged?: boolean };

const MANUAL_ERRORS: readonly ErrorId[] = ["E-012", "E-013", "E-023"];
export type VoiceOffId = "E-011" | "E-022";
const isVoiceOff = (id: ErrorId): id is VoiceOffId => id === "E-011" || id === "E-022";

export function initialIntakeState(acknowledged: boolean): IntakeState {
  return {
    phase: acknowledged ? "compose" : "notice",
    busy: null,
    messages: [],
    text: "",
    heard: false,
    token: null,
    latest: null,
    asked: 0,
    question: null,
    error: null,
    timeouts: 0,
    voiceOff: null,
    cached: false,
  };
}

// BR-023: a question is shown only while fewer than four have been asked; otherwise,
// or when the server has no question but fields are still missing, the form takes over.
export function nextStep(res: ExtractResponse, asked: number): "question" | "complete" | "manual" {
  if (res.next_question !== null) return asked < LIMITS.followUpRounds ? "question" : "manual";
  return res.missing_fields.length === 0 ? "complete" : "manual";
}

// A first report sends `text`; once a draft exists every message is an `answer` with
// the device-held draft, token and revision (extractRequestSchema).
export function extractBody(s: IntakeState, text: string): ExtractRequestInput {
  if (s.latest) {
    return {
      kind: "missing",
      answer: text,
      draft: s.latest.draft,
      draft_token: s.token ?? s.latest.draft_token,
      draft_revision: s.latest.draft_revision,
    };
  }
  return { kind: "missing", text, ...(s.token ? { draft_token: s.token } : {}) };
}

// Checked on send, never per keystroke (D4 §11). Lengths in code points, like Zod.
export function textProblem(text: string, answering: boolean): "short" | "empty" | null {
  const length = [...text.trim()].length;
  if (answering) return length === 0 ? "empty" : null;
  return length < LIMITS.textChars.min ? "short" : null;
}

// D-002 on the device, before any upload (E-008 size, E-009 length).
export function recordingProblem(durationS: number, bytes: number): "E-008" | "E-009" | null {
  if (bytes > LIMITS.audioMaxBytes) return "E-008";
  if (durationS < LIMITS.audioSeconds.min || bytes === 0) return "E-009";
  return null;
}

// D4 §12 / COMP-046: nothing for 300 ms, then the verb, then "still working" at 10 s.
// The request itself is abandoned at 25 s (E-014, D3 §7 row 10).
export const BUSY_VISIBLE_MS = 300;
export const BUSY_SLOW_MS = 10_000;
export const REQUEST_TIMEOUT_MS = 25_000;
export function busyStage(elapsedMs: number): "quiet" | "working" | "slow" {
  return elapsedMs < BUSY_VISIBLE_MS ? "quiet" : elapsedMs < BUSY_SLOW_MS ? "working" : "slow";
}

const markLastParent = (messages: Message[], status: MessageStatus): Message[] => {
  const i = messages.findLastIndex((m) => m.from === "parent");
  return i < 0 ? messages : messages.map((m, j) => (j === i ? { ...m, status } : m));
};

export function intakeReducer(s: IntakeState, e: IntakeEvent): IntakeState {
  switch (e.type) {
    case "cancel":
      return { ...s, busy: null, messages: s.busy === "extracting" ? markLastParent(s.messages, "error") : s.messages };
    case "acknowledge":
      return s.phase === "notice" ? { ...s, phase: "compose" } : s;
    case "edit":
      return { ...s, text: e.text };
    case "transcribe":
      return s.busy || s.phase === "notice" ? s : { ...s, busy: "transcribing", error: null };
    case "transcribed":
      return {
        ...s,
        busy: null,
        text: e.data.transcript,
        heard: true,
        token: e.data.draft_token,
        cached: s.cached || e.data.cached,
        timeouts: 0,
      };
    case "extract": {
      if (s.busy || s.phase === "notice") return s;
      const id = s.messages.length + 1;
      return {
        ...s,
        busy: "extracting",
        error: null,
        messages: [...s.messages, { id, from: "parent", text: e.text, status: "sending" }],
      };
    }
    case "extracted": {
      const step = nextStep(e.data, s.asked);
      const messages = markLastParent(s.messages, "sent");
      const question = step === "question" ? e.data.next_question : null;
      return {
        ...s,
        phase: step,
        busy: null,
        text: "",
        heard: false,
        token: e.data.draft_token,
        latest: e.data,
        asked: question ? s.asked + 1 : s.asked,
        question,
        messages: question ? [...messages, { id: messages.length + 1, from: "fera", question, n: s.asked + 1 }] : messages,
        cached: s.cached || e.data.cached,
        timeouts: 0,
      };
    }
    case "retry":
      return {
        ...s,
        busy: e.busy,
        error: null,
        messages: e.busy === "extracting" ? markLastParent(s.messages, "sending") : s.messages,
      };
    case "failed": {
      const id = e.error.error.id;
      const base = {
        ...s,
        busy: null,
        error: e.error,
        messages: s.busy === "extracting" ? markLastParent(s.messages, "error") : s.messages,
      };
      if (id === "E-019") return { ...initialIntakeState(true), error: e.error, voiceOff: s.voiceOff };
      if (isVoiceOff(id)) return { ...base, voiceOff: id };
      if (MANUAL_ERRORS.includes(id)) return { ...base, phase: "manual" };
      if (id === "E-014") {
        const timeouts = s.timeouts + 1;
        return { ...base, timeouts, phase: timeouts >= 2 ? "manual" : s.phase };
      }
      return base;
    }
    case "reset":
      return { ...initialIntakeState(e.acknowledged ?? true), error: e.error ?? null };
  }
}

// D4 §9 timer "০:৩৮ / ২:০০": m:ss, digits localised by the caller.
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
