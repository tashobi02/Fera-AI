// TASK-021: COMP-025 recorder state (src/lib/intake/recorder.ts).
import { describe, expect, it } from "vitest";
import {
  initialRecorderState,
  pickMimeType,
  recorderReducer,
  recorderSupported,
  shouldAutoStop,
  type RecorderEvent,
  type RecorderState,
} from "@/lib/intake/recorder";

const play = (s: RecorderState, ...events: RecorderEvent[]) => events.reduce(recorderReducer, s);

describe("recorder transitions", () => {
  it("idle → requesting → recording → ticks → idle", () => {
    let s = play(initialRecorderState, { type: "request" });
    expect(s.status).toBe("requesting");
    s = play(s, { type: "started" }, { type: "tick", elapsed: 38 });
    expect(s).toEqual({ status: "recording", elapsed: 38 });
    expect(play(s, { type: "stopped" })).toEqual(initialRecorderState);
  });

  it("ignores out-of-order events", () => {
    expect(play(initialRecorderState, { type: "started" })).toBe(initialRecorderState);
    expect(play(initialRecorderState, { type: "tick", elapsed: 3 })).toBe(initialRecorderState);
    const recording = play(initialRecorderState, { type: "request" }, { type: "started" });
    expect(play(recording, { type: "request" })).toBe(recording);
  });

  it("a refused permission or missing API is final for the page (E-022)", () => {
    const s = play(initialRecorderState, { type: "request" }, { type: "unavailable" });
    expect(s.status).toBe("unavailable");
    expect(play(s, { type: "request" }, { type: "started" }, { type: "stopped" })).toBe(s);
  });

  it("auto-stops at 120 s", () => {
    expect(shouldAutoStop(119.9)).toBe(false);
    expect(shouldAutoStop(120)).toBe(true);
  });
});

describe("browser support", () => {
  it("needs both MediaRecorder and getUserMedia", () => {
    const getUserMedia = () => undefined;
    expect(recorderSupported({})).toBe(false);
    expect(recorderSupported({ MediaRecorder: class {} })).toBe(false);
    expect(recorderSupported({ navigator: { mediaDevices: { getUserMedia } } })).toBe(false);
    expect(recorderSupported({ MediaRecorder: class {}, navigator: { mediaDevices: { getUserMedia } } })).toBe(true);
  });

  it("prefers Opus and falls back to mp4 or the browser default", () => {
    expect(pickMimeType(() => true)).toBe("audio/webm;codecs=opus");
    expect(pickMimeType((t) => t === "audio/mp4")).toBe("audio/mp4");
    expect(pickMimeType(() => false)).toBeUndefined();
  });
});
