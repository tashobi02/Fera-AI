import { vi } from "vitest";
import type { SttProvider } from "@/server/speech";

export type StepHandler = (
  audio: { bytes: Uint8Array; mime: string },
  opts: { signal: AbortSignal },
) => Promise<{ text: string }>;

export type ScriptedStep = string | { text: string } | Error | StepHandler;

/**
 * Scriptable in-memory fake STT provider for deterministic testing.
 * Named with `[MOCK]` prefix to enforce honest synthetic testing.
 *
 * Supports:
 * - ok text: string (e.g. "আমার ছেলে রাফি") or { text: string }
 * - empty text: "" or "   " or { text: "" }
 * - provider down: new SttFailure(503)
 * - hang until aborted/timed out: () => new Promise(...)
 * - random bug: new TypeError("[MOCK] unexpected property read")
 */
export function fakeSttProvider(
  slot: "primary" | "fallback",
  steps: readonly ScriptedStep[],
) {
  let next = 0;
  const transcribe = vi.fn<SttProvider["transcribe"]>(async (audio, opts) => {
    if (next >= steps.length) {
      throw new Error("[MOCK] script exhausted");
    }
    const step = steps[next++];
    if (step instanceof Error) {
      throw step;
    }
    if (typeof step === "function") {
      return step(audio, opts);
    }
    if (typeof step === "string") {
      return { text: step };
    }
    return step;
  });

  return {
    name: `[MOCK] ${slot}`,
    transcribe,
  };
}

export function sampleAudio(
  bytes: Uint8Array = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]),
  mime = "audio/webm;codecs=opus",
): { bytes: Uint8Array; mime: string } {
  return { bytes, mime };
}
