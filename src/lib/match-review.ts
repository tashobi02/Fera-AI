// SCREEN-010 match review (TASK-028, COMP-037/038, FR-015–FR-017). Pure and client-safe:
// the side-by-side field comparison, the confirm/reject request builders and the outcome
// mapping. The decision itself is the already merged one-transaction `decideCandidate`;
// nothing here decides anything.
//
// Honesty rules (D4, BR-001/005):
// - "agree / differs / unknown" is only computed from structured fields where a verdict is
//   deterministic (sex, age, same district). Free text, measurements and a different
//   district are shown side by side
//   with the label "compare by eye": no invented tolerance, no similarity of text claimed.
// - The score is "similarity", never a probability or proof of identity.
import {
  decisionRequestSchema,
  decisionResponseSchema,
  type CandidateDecisionView,
  type DecisionRequest,
  type DecisionResponse,
  type OfficerCaseView,
} from "@/contracts";
import districtData from "../../data/districts.json";
import { retryAfterSeconds } from "@/lib/sign-in-errors";
import { visibleLength } from "@/lib/visible-text";

export type Verdict = "agree" | "differ" | "unknown" | "review";
export type CompareField = "sex" | "age" | "height" | "district" | "place" | "time" | "clothing" | "marks" | "circumstances";
export type ComparisonRow = {
  field: CompareField;
  missing: string | null; // display text; null = not known
  found: string | null;
  verdict: Verdict;
};

type ChildAge = Pick<OfficerCaseView["child"], "age_years" | "age_min" | "age_max">;
function ageRange(c: ChildAge): [number, number] | null {
  if (c.age_min !== null && c.age_max !== null) return [c.age_min, c.age_max];
  if (c.age_years !== null) return [c.age_years, c.age_years];
  return null;
}
const ageText = (r: [number, number] | null) => (r === null ? null : r[0] === r[1] ? String(r[0]) : `${r[0]}–${r[1]}`);
const text = (v: string | null | undefined) => (v === null || v === undefined || v.trim() === "" ? null : v.trim());

function freeText(a: string | null, b: string | null): Verdict {
  return a === null || b === null ? "unknown" : "review";
}

const DISTRICT_EN = new Map<number, string>(districtData.districts.map((d) => [d.code, d.name_en]));
// bn: the server-resolved Bangla name; en: the English name from the bundled district list.
// The code is only a last resort, so a number never replaces a name silently.
function districtLabel(code: number | null, nameBn: string | null | undefined, locale: "bn" | "en"): string | null {
  if (code === null) return null;
  if (locale === "en") return DISTRICT_EN.get(code) ?? nameBn ?? String(code);
  return nameBn ?? DISTRICT_EN.get(code) ?? String(code);
}

// Display rounding only: the stored score keeps its precision. Score is 0-100, components 0-1.
// Rounded DOWN so only a stored 100 / 1 can read as full; 99.6 must not look like certainty.
export const displayScore = (n: number): number => Math.floor(n);
export const displayComponent = (n: number): number => Math.floor(n * 100 + 1e-9) / 100;

export function compareCases(missing: OfficerCaseView, found: OfficerCaseView, locale: "bn" | "en" = "bn"): ComparisonRow[] {
  const rows: ComparisonRow[] = [];

  const sm = missing.child.sex === "unknown" ? null : missing.child.sex;
  const sf = found.child.sex === "unknown" ? null : found.child.sex;
  rows.push({ field: "sex", missing: sm, found: sf, verdict: sm === null || sf === null ? "unknown" : sm === sf ? "agree" : "differ" });

  const am = ageRange(missing.child);
  const af = ageRange(found.child);
  rows.push({
    field: "age",
    missing: ageText(am),
    found: ageText(af),
    verdict: am === null || af === null ? "unknown" : am[0] <= af[1] && af[0] <= am[1] ? "agree" : "differ",
  });

  const hm = missing.child.height_cm;
  const hf = found.child.height_cm;
  rows.push({ field: "height", missing: hm === null ? null : String(hm), found: hf === null ? null : String(hf), verdict: hm === null || hf === null ? "unknown" : "review" });

  const dm = missing.event.district_code;
  const df = found.event.district_code;
  rows.push({
    field: "district",
    missing: districtLabel(dm, missing.event.district_name_bn, locale),
    found: districtLabel(df, found.event.district_name_bn, locale),
    // A found child often turns up in another district than the one reported missing, so a
    // different district is "review", never a contradiction (district is a bonus, BR-017).
    verdict: dm === null || df === null ? "unknown" : dm === df ? "agree" : "review",
  });

  const pm = text(missing.event.place_text);
  const pf = text(found.event.place_text);
  rows.push({ field: "place", missing: pm, found: pf, verdict: freeText(pm, pf) });

  rows.push({
    field: "time",
    missing: missing.event.at ?? missing.event.at_lower,
    found: found.event.at ?? found.event.at_lower,
    verdict: (missing.event.at ?? missing.event.at_lower) === null || (found.event.at ?? found.event.at_lower) === null ? "unknown" : "review",
  });

  for (const [field, a, b] of [
    ["clothing", text(missing.child.clothing), text(found.child.clothing)],
    ["marks", text(missing.child.marks), text(found.child.marks)],
    ["circumstances", text(missing.event.circumstances), text(found.event.circumstances)],
  ] as const) {
    rows.push({ field, missing: a, found: b, verdict: freeText(a, b) });
  }
  return rows;
}

export function summarise(rows: readonly ComparisonRow[]) {
  const pick = (v: Verdict) => rows.filter((r) => r.verdict === v).map((r) => r.field);
  return { agree: pick("agree"), differ: pick("differ"), unknown: pick("unknown"), review: pick("review") };
}

// Score components arrive as { key: number | null } (null = unknown cue). Sorted for a stable
// table; the key is only a label fallback, never interpreted here.
export function componentEntries(components: CandidateDecisionView["components"]): Array<{ key: string; value: number | null }> {
  return Object.entries(components)
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/* ---------- requests ---------- */

export const CHECKLIST_KEYS = [
  "descriptions_reviewed",
  "contradictions_reviewed",
  "identity_not_proven_by_score",
  "referral_is_simulated",
] as const;
export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];
export type Checklist = Record<ChecklistKey, boolean>;
export const emptyChecklist = (): Checklist => ({
  descriptions_reviewed: false,
  contradictions_reviewed: false,
  identity_not_proven_by_score: false,
  referral_is_simulated: false,
});

export type DecisionBuild = { ok: true; request: DecisionRequest } | { ok: false; reason: "checklist" | "reason-required" | "reason-length" | "invalid" };

export const REJECT_REASON_MIN = 3;
export const REJECT_REASON_MAX = 500;

// The versions are the ones the officer is looking at; a stale view is E-005, never a silent write.
export function buildConfirm(view: CandidateDecisionView, checklist: Checklist, note: string): DecisionBuild {
  if (!CHECKLIST_KEYS.every((k) => checklist[k])) return { ok: false, reason: "checklist" };
  const parsed = decisionRequestSchema.safeParse({
    decision: "confirm",
    reason: note,
    expected_missing_version: view.missing.version,
    expected_found_version: view.found.version,
    reviewer_checklist: {
      descriptions_reviewed: true,
      contradictions_reviewed: true,
      identity_not_proven_by_score: true,
      referral_is_simulated: true,
    },
  });
  return parsed.success ? { ok: true, request: parsed.data } : { ok: false, reason: "invalid" };
}

export function buildReject(view: CandidateDecisionView, reason: string): DecisionBuild {
  const trimmed = reason.trim();
  if (trimmed === "") return { ok: false, reason: "reason-required" };
  const length = [...trimmed].length;
  // Invisible characters (zero-width spaces) must not satisfy the 3-character minimum.
  if (visibleLength(trimmed) < REJECT_REASON_MIN || length > REJECT_REASON_MAX) return { ok: false, reason: "reason-length" };
  const parsed = decisionRequestSchema.safeParse({
    decision: "reject",
    reason: trimmed,
    expected_missing_version: view.missing.version,
    expected_found_version: view.found.version,
  });
  return parsed.success ? { ok: true, request: parsed.data } : { ok: false, reason: "invalid" };
}

/* ---------- API call and outcome ---------- */

export type DecisionFailure =
  | { kind: "stale" } // E-005: not pending any more, or the reports changed — reload the stored state
  | { kind: "hidden" } // E-004
  | { kind: "forbidden" } // E-003: signed in, but this role may not decide
  | { kind: "validation" } // E-001
  | { kind: "session" } // E-002
  | { kind: "rate-limited"; seconds: number | null }
  | { kind: "offline" }
  | { kind: "uncertain" } // unreadable or lost reply: the decision may be stored — reload before deciding again
  | { kind: "generic" };

export type DecisionOutcome = { kind: "decided"; response: DecisionResponse } | { kind: "failure"; failure: DecisionFailure };

function errorIdOf(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("error" in body)) return null;
  const e = (body as { error: unknown }).error;
  if (typeof e !== "object" || e === null || !("id" in e)) return null;
  const id = (e as { id: unknown }).id;
  return typeof id === "string" ? id : null;
}

export function classifyDecisionFailure(input: { status: number; body?: unknown; retryAfter?: string | null }): DecisionFailure {
  const id = errorIdOf(input.body);
  if (id === "E-007" || input.status === 429) return { kind: "rate-limited", seconds: retryAfterSeconds(input.retryAfter) };
  if (id === "E-005" || input.status === 409) return { kind: "stale" };
  if (id === "E-003" || input.status === 403) return { kind: "forbidden" };
  if (id === "E-004" || input.status === 404) return { kind: "hidden" };
  if (id === "E-001" || input.status === 400) return { kind: "validation" };
  if (id === "E-002" || input.status === 401) return { kind: "session" };
  if (input.status >= 500 || id === "E-021") return { kind: "uncertain" };
  return { kind: "generic" };
}

export const candidateDecisionApi = (candidateId: string) => `/api/candidates/${encodeURIComponent(candidateId)}/decision`;
export const DECISION_TIMEOUT_MS = 25_000;

export async function requestDecision(
  candidateId: string,
  request: DecisionRequest,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number; parse?: (body: unknown) => DecisionResponse | null } = {},
): Promise<DecisionOutcome> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const parse =
    opts.parse ??
    ((body: unknown) => {
      const r = decisionResponseSchema.safeParse(body);
      return r.success ? r.data : null;
    });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("timed out", "TimeoutError")), opts.timeoutMs ?? DECISION_TIMEOUT_MS);
  // The timer covers the whole exchange including reading the body: a stalled body must not
  // leave the officer on "submitting" for ever.
  try {
    let res: Response;
    try {
      res = await fetchImpl(candidateDecisionApi(candidateId), {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(request),
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (err) {
      return { kind: "failure", failure: { kind: offlineOrUncertain(err) } };
    }
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      if (controller.signal.aborted) return { kind: "failure", failure: { kind: "uncertain" } };
      body = null;
    }
    if (res.ok) {
      const response = parse(body);
      return response ? { kind: "decided", response } : { kind: "failure", failure: { kind: "uncertain" } };
    }
    return { kind: "failure", failure: classifyDecisionFailure({ status: res.status, body, retryAfter: res.headers.get("retry-after") }) };
  } finally {
    clearTimeout(timer);
  }
}

// "Offline" only when the browser says so; any other lost reply may follow a stored decision.
function offlineOrUncertain(err: unknown): "offline" | "uncertain" {
  const name = err instanceof Error ? err.name : "";
  const timedOut = name === "TimeoutError" || name === "AbortError";
  return !timedOut && typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "uncertain";
}
