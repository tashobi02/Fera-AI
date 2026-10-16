// SCREEN-004 client helpers (TASK-024, COMP-030): the API-006 call, error mapping and
// the output card state machine. Pure (no DOM, no server modules), so they are
// unit-tested in Node. Error copy comes from the contract catalogue, never from the
// response body; an expired parent cookie gets S-004's own copy (OD-024-2).
import {
  ERROR_CATALOGUE,
  outputResponseSchema,
  type OutputResponse,
  type OutputType,
} from "@/contracts";
import { localizeDigits } from "@/lib/numerals";
import { locales, type Locale } from "@/locales";

/* ---------- failures ---------- */

export const OUTPUT_ERROR_IDS = [
  "E-004",
  "E-007",
  "E-016",
  "E-019",
  "E-020",
  "E-021",
  "E-024",
] as const;
export type OutputErrorId = (typeof OUTPUT_ERROR_IDS)[number];
export type OutputFailure = { id: OutputErrorId; seconds: number | null };

const BY_STATUS: Record<number, OutputErrorId> = {
  401: "E-019",
  404: "E-004",
  422: "E-016",
  429: "E-007",
};

function errorIdOf(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("error" in body))
    return null;
  const error = (body as { error: unknown }).error;
  if (typeof error !== "object" || error === null || !("id" in error))
    return null;
  const id = (error as { id: unknown }).id;
  return typeof id === "string" ? id : null;
}

const isOutputErrorId = (id: string | null): id is OutputErrorId =>
  id !== null &&
  id !== "E-024" &&
  (OUTPUT_ERROR_IDS as readonly string[]).includes(id);

function retryAfter(header: string | null | undefined): number | null {
  if (typeof header !== "string" || !/^\s*\d{1,6}\s*$/.test(header))
    return null;
  const n = Number(header.trim());
  return n >= 1 && n <= 3600 ? n : null;
}

export function classifyOutputFailure(input: {
  status: number;
  body?: unknown;
  retryAfter?: string | null;
}): OutputFailure {
  const fromBody = errorIdOf(input.body);
  const id = isOutputErrorId(fromBody)
    ? fromBody
    : (BY_STATUS[input.status] ?? "E-021");
  return { id, seconds: id === "E-007" ? retryAfter(input.retryAfter) : null };
}

export function outputFailureText(
  failure: OutputFailure,
  locale: Locale,
): string {
  if (failure.id === "E-007" && failure.seconds === null)
    return locales[locale].signInErrorRateLimitedSoon;
  // The report is already submitted: "start again" would invite a duplicate (OD-024-2).
  if (failure.id === "E-019") return locales[locale].outputsSessionExpired;
  const entry = ERROR_CATALOGUE[failure.id];
  const text = locale === "bn" ? entry.bn : entry.en;
  return failure.seconds === null
    ? text
    : text.replace("{s}", () => localizeDigits(failure.seconds ?? 0, locale));
}

// E-020 (reserved) and E-007 are "limit reached" (COMP-030); E-004/E-019 cannot be retried.
export const isLimit = (f: OutputFailure): boolean =>
  f.id === "E-020" || f.id === "E-007";
export const canRetry = (f: OutputFailure): boolean =>
  !["E-004", "E-019", "E-020"].includes(f.id);

/* ---------- API-006 ---------- */

export type OutputOutcome =
  | { kind: "ok"; data: OutputResponse }
  | { kind: "failed"; failure: OutputFailure };
export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;
export const OUTPUT_TIMEOUT_MS = 15_000;

// AbortSignal.timeout is missing on older Safari and Android WebViews; without this
// fallback every call there would fail as E-021.
export function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export async function requestOutput(
  caseId: string,
  type: OutputType,
  opts: {
    fetchImpl?: FetchLike;
    online?: () => boolean;
    timeoutMs?: number;
  } = {},
): Promise<OutputOutcome> {
  const online =
    opts.online ??
    (() => (typeof navigator === "undefined" ? true : navigator.onLine));
  if (!online())
    return { kind: "failed", failure: { id: "E-024", seconds: null } };
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(
      `/api/cases/${encodeURIComponent(caseId)}/outputs`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type }),
        credentials: "same-origin",
        cache: "no-store",
        signal: timeoutSignal(opts.timeoutMs ?? OUTPUT_TIMEOUT_MS),
      },
    );
  } catch {
    // A rejected fetch while the browser reports offline is E-024; a timeout is E-021.
    return {
      kind: "failed",
      failure: { id: online() ? "E-021" : "E-024", seconds: null },
    };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok)
    return {
      kind: "failed",
      failure: classifyOutputFailure({
        status: res.status,
        body,
        retryAfter: res.headers.get("retry-after"),
      }),
    };
  const parsed = outputResponseSchema.safeParse(body);
  if (!parsed.success || parsed.data.type !== type)
    return { kind: "failed", failure: { id: "E-021", seconds: null } };
  return { kind: "ok", data: parsed.data };
}

/* ---------- output card state machine (COMP-030) ---------- */

export type CardState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; output: OutputResponse; copies: number }
  | { status: "failed"; failure: OutputFailure };

export type CardEvent =
  | { type: "request" }
  | { type: "outcome"; outcome: OutputOutcome }
  | { type: "copied" };

export const initialCardState: CardState = { status: "idle" };

export function cardReducer(state: CardState, event: CardEvent): CardState {
  switch (event.type) {
    case "request":
      return state.status === "loading" || state.status === "ready"
        ? state
        : { status: "loading" };
    case "outcome":
      if (state.status !== "loading") return state;
      return event.outcome.kind === "ok"
        ? { status: "ready", output: event.outcome.data, copies: 0 }
        : { status: "failed", failure: event.outcome.failure };
    case "copied":
      return state.status === "ready"
        ? { ...state, copies: state.copies + 1 }
        : state;
  }
}

// OD-023-2: an edit-locked or redacted report has no owner draft; API-006 would answer
// E-016, so the output actions are hidden instead.
export const outputsAvailable = (view: {
  editable: boolean;
  hasDraft: boolean;
}): boolean => view.editable && view.hasDraft;
