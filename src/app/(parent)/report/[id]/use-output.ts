// SCREEN-004 client hooks (COMP-030/031). No "use client": only the client cards call
// them.
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { OutputType } from "@/contracts";
import {
  cardReducer,
  initialCardState,
  requestOutput,
} from "@/lib/outputs-client";

// Loads one output on demand (API-006 only when the parent taps the card's action).
export function useOutput(caseId: string, type: OutputType) {
  const [state, dispatch] = useReducer(cardReducer, initialCardState);
  const inFlight = useRef(false);
  async function load(): Promise<void> {
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

// A polite status message. announce() clears first and sets on the next frame, so the
// same text ("কপি হয়েছে" twice) is announced again; clear() removes a message that no
// longer holds (for example "poster ready" after the choice changed).
export function useAnnouncer() {
  const [message, setMessage] = useState("");
  const frame = useRef(0);
  const clear = useCallback(() => {
    cancelAnimationFrame(frame.current);
    setMessage("");
  }, []);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const announce = useCallback((next: string) => {
    cancelAnimationFrame(frame.current);
    setMessage("");
    frame.current = requestAnimationFrame(() => setMessage(next));
  }, []);
  return { message, announce, clear };
}

// Runs `effect` only when `value` changes after mount: a re-render for another reason
// (the language toggle re-renders every card) neither moves focus nor re-announces.
export function useOnChange<T>(value: T, effect: (value: T) => void): void {
  const previous = useRef(value);
  const latest = useRef(effect);
  useEffect(() => {
    latest.current = effect;
  });
  useEffect(() => {
    if (Object.is(previous.current, value)) return;
    previous.current = value;
    latest.current(value);
  }, [value]);
}
