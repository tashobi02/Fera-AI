import { vi } from "vitest";
import type { LLMProvider } from "@/server/ai";

export function fakeProvider(slot: "primary" | "fallback", steps: readonly unknown[]) {
  let next = 0;
  const extract = vi.fn<LLMProvider["extract"]>(async (request, options) => {
    if (next >= steps.length) throw new Error("[MOCK] script exhausted");
    const step = steps[next++];
    if (step instanceof Error) throw step;
    return typeof step === "function" ? step(request, options) : step;
  });
  return { name: `[MOCK] ${slot}`, extract };
}
