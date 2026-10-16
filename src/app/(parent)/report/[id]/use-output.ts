// SCREEN-004 client hooks (COMP-030/031). No "use client": only the client cards call
// them.
import { useCallback, useReducer, useRef, useState } from "react";
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

// A polite status message that is cleared first and set on the next frame, so the same
// text ("কপি হয়েছে" twice) is announced again rather than coalesced.
export function useAnnouncer(): [string, (message: string) => void] {
  const [message, setMessage] = useState("");
  const announce = useCallback((next: string) => {
    setMessage("");
    requestAnimationFrame(() => setMessage(next));
  }, []);
  return [message, announce];
}
