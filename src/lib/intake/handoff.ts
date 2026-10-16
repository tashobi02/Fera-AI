// Device memory shared by SCREEN-001 → SCREEN-002 → SCREEN-003/005 (TASK-021).
// Module memory only, no storage: it survives client-side navigation and is gone on
// reload, so a reloaded S-002 asks for the notice again and a draft never outlives
// the tab. Durable device-local draft persistence is TASK-022's decision.
import type { DraftFieldPath, ExtractResponse } from "@/contracts";
import { sweepDrafts } from "./draft-store";

let acknowledged = false;
// Consent epoch: bumped on every acknowledgement and every discard. A recording or
// request started under an older epoch is dropped unsent (review round 1, item 14).
let epoch = 0;

// Entry components sweep on mount. S-003 owns its read so it can render the
// expired notice on a cold reload before discarding the record.

// Called by SCREEN-001 "শুরু করুন" (or S-002's own notice) after the notice is shown.
// Only call it from a client event handler (a click), never during render or on the
// server: module memory on the server is shared by every request.
export function acknowledgeNotice(): void {
  acknowledged = true;
  epoch++;
  try { sweepDrafts(); } catch {}
}
export function intakeEpoch(): number {
  return epoch;
}
// Cancel ongoing work while retaining the notice (e.g. opening discard confirmation).
export function invalidateIntakeEpoch(): void {
  epoch++;
}
export function noticeAcknowledged(): boolean {
  return acknowledged;
}

export const INTAKE_PATH = "/intake"; // SCREEN-002
// Planned routes owned by other tasks: S-003 review (TASK-022), S-005 form (TASK-025).
export const REVIEW_PATH = "/intake/review";
export const MANUAL_FORM_PATH = "/intake/form";

export type IntakeHandoff = {
  to: "review" | "manual";
  sourceText: string; // the parent's own words, kept for the form even without a draft
  response: ExtractResponse | null; // draft + draft_token/revision/expiry from API-002
  missing: DraftFieldPath[]; // unknown mandatory fields to complete by hand
  asked: number; // follow-up questions used (BR-023)
  cached: boolean;
  mock: boolean;
};

let pending: IntakeHandoff | null = null;

export function handOff(handoff: IntakeHandoff): void {
  pending = handoff;
}

// S-003/S-005 MUST be client components. Consume once per mounted consumer, caching
// even a null result. A guarded lazy initializer survives StrictMode's repeated
// initializer/render calls without consuming a later hand-off:
//
// const read = useRef<{ value: IntakeHandoff | null } | null>(null);
// const [handoff] = useState(() => {
//   if (read.current === null) read.current = { value: takeHandoff() };
//   return read.current.value;
// });
//
// Do not call takeHandoff unguarded in the component body or an effect. Refresh and
// aborted navigation recovery/persistence remain TASK-022/025 (OD-021-4).
export function takeHandoff(): IntakeHandoff | null {
  const handoff = pending;
  pending = null;
  return handoff;
}

// ACT-015 discard: forget the draft and the acknowledgement.
export function clearIntakeMemory(): void {
  pending = null;
  acknowledged = false;
  epoch++;
  try { sweepDrafts(); } catch {}
}

// Hand-off links act only on a plain primary click; a middle or modified click opens a
// new tab, which has no module memory, so nothing is handed over (review item 9).
export function isPlainClick(e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}
