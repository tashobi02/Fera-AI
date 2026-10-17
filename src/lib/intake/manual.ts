// SCREEN-005 manual form drafts (TASK-025; FR-026, STORY-018, TC-017, BR-023). Pure: no
// DOM, so it is unit-tested in Node. S-005 edits a device-local draft with the same
// fields as S-003, saves it on the device and opens S-003, where the parent confirms
// and submits (review-before-submit, BR-004). Nothing here talks to the server.
//
// Honesty rule: values from the [MOCK] client are never carried into the form. A [MOCK]
// hand-off keeps only the parent's own words; a real API-002 response pre-fills its
// parsed fields with their evidence (TC-017 "pre-filled with any parsed fields").
import { FIELD_MAX_CHARS, type CaseDraft } from "@/contracts";
import type { DeviceDraft } from "./draft-store";
import type { IntakeHandoff } from "./handoff";

const DAY_MS = 24 * 60 * 60 * 1000;

export type Prefill = "ai" | "own-words" | "none";

export function emptyMissingDraft(sourceText = ""): CaseDraft {
  return {
    kind: "missing",
    source_text: sourceText.slice(0, FIELD_MAX_CHARS.raw_text),
    child: { name: null, name_latin: null, sex: "unknown", height_cm: null, clothing: null, marks: null, age_years: null, age_min: null, age_max: null },
    event: {
      at_approx: false, thana: null, circumstances: null, at: null, at_lower: null, at_upper: null,
      place_text: null, district_text: null, district_code: null,
    },
    reporter: { relation: null, phone: null },
    evidence: {},
  };
}

function fresh(draft: CaseDraft, sourceText: string, now: number, extra: Partial<DeviceDraft> = {}): DeviceDraft {
  return {
    version: 1, draft, sourceText, client_submission_id: crypto.randomUUID(), savedAt: now,
    expiresAt: now + DAY_MS, edits: {}, approximate: draft.event.at_approx, attempted: false,
    mock: false, cached: false, ...extra,
  };
}

// The parent's own words fill "কী ঘটেছিল (আপনার কথায়)" when they fit; longer text is
// kept whole beside the form instead of being cut.
function ownWords(sourceText: string, now: number): DeviceDraft {
  const words = sourceText.trim();
  const record = fresh(emptyMissingDraft(words), words, now);
  return words && words.length <= FIELD_MAX_CHARS.circumstances ? { ...record, edits: { "event.circumstances": words } } : record;
}

export function manualDraft(handoff: IntakeHandoff | null, now = Date.now()): { record: DeviceDraft; prefill: Prefill } {
  if (!handoff) return { record: fresh(emptyMissingDraft(), "", now), prefill: "none" };
  const response = handoff.response;
  if (!handoff.mock && response && response.draft.kind === "missing") {
    const serverExpiry = Date.parse(response.expires_at);
    const expiresAt = Number.isFinite(serverExpiry) ? Math.min(serverExpiry, now + DAY_MS) : now + DAY_MS;
    return {
      record: fresh(response.draft, handoff.sourceText, now, { expiresAt, draftToken: response.draft_token, cached: handoff.cached }),
      prefill: "ai",
    };
  }
  const record = ownWords(handoff.sourceText, now);
  return { record, prefill: record.sourceText ? "own-words" : "none" };
}

// A stored device draft made from [MOCK] values is restarted from the parent's words.
export function manualFromStored(stored: DeviceDraft, now = Date.now()): { record: DeviceDraft; prefill: Prefill } {
  if (!stored.mock) return { record: stored, prefill: "none" };
  const record = ownWords(stored.sourceText, now);
  return { record, prefill: record.sourceText ? "own-words" : "none" };
}
