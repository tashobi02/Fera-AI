// SCREEN-007 found-child log (TASK-026, COMP-034, ACT-019 → API-007). Pure and
// client-safe: values → request via the frozen contract, outcome mapping and the state
// machine. The form (found-log-form.tsx) only wires this to the DOM; copy is in src/locales.
//
// - The staff's own entries are the review: Save is the explicit confirmation, so the
//   request always carries confirmed: true only from that action (BR-004, ACT-019).
// - Unknown stays unknown: blank age, name, height and marks are sent as null, never guessed.
// - The client submission UUID is kept for a retry of the SAME payload (the server replays
//   the same report) and renewed when the payload changed or after a success, so an edited
//   retry is a new submission, never a permanent E-006 (see submissionFor).
// - No photo, no exact coordinates: district and a free-text place only (BR-006, DECISION-013).
import {
  createFoundRequestSchema,
  createFoundResponseSchema,
  toDhakaIso,
  type CreateFoundRequest,
  type CreateFoundResponse,
} from "@/contracts";
import { localizeDigits, toLatinDigits } from "@/lib/numerals";
import { INVISIBLE, visibleLength } from "@/lib/visible-text";
import { retryAfterSeconds } from "@/lib/sign-in-errors";
import { locales, type Locale, type MessageKey } from "@/locales";

export const FOUND_LOG_API = "/api/found-cases";
export const FOUND_LOG_TIMEOUT_MS = 25_000;

export const SEX_OPTIONS = ["unknown", "male", "female", "other"] as const;
export type FoundLogSex = (typeof SEX_OPTIONS)[number];

export type FoundLogValues = {
  circumstances: string;
  clothing: string;
  marks: string;
  sex: FoundLogSex;
  ageYears: string;
  ageMin: string;
  ageMax: string;
  heightCm: string;
  place: string;
  thana: string;
  district: string; // district code as typed in the select; "" = not chosen
  foundAt: string; // datetime-local, Dhaka wall time
  phone: string;
  relation: string;
};
export type FoundLogField = keyof FoundLogValues;
export type FieldReason = "required" | "invalid" | "description" | "future";
export type FieldErrors = Partial<Record<FoundLogField, FieldReason>>;

const DHAKA_OFFSET_MS = 6 * 3_600_000; // Bangladesh has no DST
const pad = (n: number) => String(n).padStart(2, "0");

// "2026-10-15T23:30" in Asia/Dhaka (no DST) for a datetime-local input.
export function dhakaLocalInput(nowMs: number): string {
  const d = new Date(nowMs + DHAKA_OFFSET_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function emptyValues(nowMs: number): FoundLogValues {
  return {
    circumstances: "", clothing: "", marks: "", sex: "unknown", ageYears: "", ageMin: "", ageMax: "",
    heightCm: "", place: "", thana: "", district: "", foundAt: dhakaLocalInput(nowMs), phone: "", relation: "",
  };
}

const FIELDS = Object.keys(emptyValues(0)) as FoundLogField[];

export function valuesFromFormData(data: FormData, nowMs: number): FoundLogValues {
  const out = emptyValues(nowMs);
  for (const key of FIELDS) {
    const raw = data.get(key);
    if (typeof raw === "string") (out as Record<FoundLogField, string>)[key] = raw;
  }
  if (!(SEX_OPTIONS as readonly string[]).includes(out.sex)) out.sex = "unknown";
  return out;
}

const intOrNull = (v: string): number | null | "bad" => {
  const t = toLatinDigits(v).trim(); // staff in Bangla mode type Bangla digits
  if (t === "") return null;
  return /^\d{1,3}$/.test(t) ? Number(t) : "bad";
};
// Free text is stored as NFC. A zero-width space is a word break (pasted text often uses it
// between words), so it becomes one space; BOM and soft hyphen are removed. ZWNJ/ZWJ are
// kept: Bangla words need them.
const cleanText = (v: string) =>
  v.normalize("NFC").replace(/\u200B/g, " ").replace(/[\uFEFF\u00AD]/g, "").replace(/ {2,}/g, " ").trim();
const textOrNull = (v: string) => {
  const t = cleanText(v);
  return t === "" ? null : t;
};

// +8801XXXXXXXXX / 8801XXXXXXXXX (country code) → 01XXXXXXXXX. Anything else is left for the
// contract's own phone rule to accept or refuse.
// Whitespace and every invisible format character, brackets, dots, hyphen-minus, the Unicode
// dashes U+2010-U+2015 and the minus sign U+2212.
const cleanPhone = (raw: string) => toLatinDigits(raw).replace(INVISIBLE, "").replace(/[().\-\u2010-\u2015\u2212]/g, "");
export function localPhone(raw: string): string {
  // Pasted numbers carry spaces, brackets, hyphens, non-breaking/en dashes and zero-width characters.
  const digits = cleanPhone(raw);
  const m = /^(?:\+?88)?(01[0-9]{9})$/.exec(digits);
  return m ? m[1]! : raw;
}

export type BuildResult =
  | { ok: true; request: CreateFoundRequest }
  | { ok: false; fields: FieldErrors; unmapped?: string[] }; // unmapped: contract paths no form field owns

export function buildFoundRequest(values: FoundLogValues, ids: { clientSubmissionId: string; nowMs: number }): BuildResult {
  // Keep callers honest: the id is always supplied, never invented here.
  const fields: FieldErrors = {};
  // Visible characters only: zero-width spaces must not satisfy the description rule.
  const description = [values.circumstances, values.clothing, values.marks].map(cleanText).join(" ");
  if (visibleLength(description) < 3) fields.circumstances = "description";

  if (visibleLength(cleanText(values.place)) === 0) fields.place = "required";
  if (values.district.trim() === "") fields.district = "required";
  if (cleanPhone(values.phone) === "") fields.phone = "required";

  let atMs = NaN;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(values.foundAt)) fields.foundAt = "required";
  else {
    atMs = Date.parse(`${values.foundAt}:00+06:00`);
    if (Number.isNaN(atMs)) fields.foundAt = "invalid";
    // Zero skew on purpose: the contract rejects at_lower later than now, and at_lower = at here.
    else if (atMs > ids.nowMs) fields.foundAt = "future";
  }

  const years = intOrNull(values.ageYears);
  const min = intOrNull(values.ageMin);
  const max = intOrNull(values.ageMax);
  const height = intOrNull(values.heightCm);
  if (years === "bad") fields.ageYears = "invalid";
  if (min === "bad") fields.ageMin = "invalid";
  if (max === "bad") fields.ageMax = "invalid";
  if (height === "bad" || (typeof height === "number" && (height < 40 || height > 220))) fields.heightCm = "invalid";
  if (typeof years === "number" && years > 17) fields.ageYears = "invalid";
  if (typeof years === "number" && (min !== null || max !== null)) fields.ageYears = "invalid";
  if ((min === null) !== (max === null) && !fields.ageMin && !fields.ageMax) fields[min === null ? "ageMin" : "ageMax"] = "required";
  if (typeof min === "number" && typeof max === "number" && (min > max || max > 25)) fields.ageMax = "invalid";

  if (Object.keys(fields).length > 0) return { ok: false, fields };

  const district = Number(values.district);
  const at = toDhakaIso(atMs);
  const parsed = createFoundRequestSchema.safeParse({
    draft: {
      kind: "found",
      source_text: "",
      child: {
        name: null,
        name_latin: null,
        sex: values.sex,
        age_years: typeof years === "number" ? years : null,
        age_min: typeof min === "number" ? min : null,
        age_max: typeof max === "number" ? max : null,
        height_cm: typeof height === "number" ? height : null,
        clothing: textOrNull(values.clothing),
        marks: textOrNull(values.marks),
      },
      event: {
        at,
        at_lower: at,
        at_upper: at,
        at_approx: false,
        place_text: cleanText(values.place),
        district_code: district,
        thana: textOrNull(values.thana),
        circumstances: textOrNull(values.circumstances),
      },
      reporter: { relation: textOrNull(values.relation), phone: localPhone(values.phone) },
      evidence: {},
    },
    confirmed: true,
    client_submission_id: ids.clientSubmissionId,
  });
  if (parsed.success) return { ok: true, request: parsed.data };
  // Anything the contract rejects that the checks above did not name is mapped by EXACT
  // path. An issue with no mapped field is a contract mismatch, not something the staff can
  // fix by editing the description, so it is reported as such (never blamed on a field).
  const mapped: FieldErrors = {};
  const unmapped: string[] = [];
  for (const issue of parsed.error.issues) {
    const path = issue.path.join(".");
    const field = ISSUE_FIELD[path];
    if (!field) unmapped.push(path === "" ? "(root)" : path);
    else if (!mapped[field]) mapped[field] = path.endsWith("event.at") || path.endsWith("event.at_lower") ? "future" : "invalid";
  }
  return { ok: false, fields: mapped, ...(unmapped.length > 0 ? { unmapped } : {}) };
}

const ISSUE_FIELD: Record<string, FoundLogField> = {
  "draft.child.sex": "sex",
  "draft.child.age_years": "ageYears",
  "draft.child.age_min": "ageMin",
  "draft.child.age_max": "ageMax",
  "draft.child.height_cm": "heightCm",
  "draft.child.clothing": "clothing",
  "draft.child.marks": "marks",
  "draft.event.at": "foundAt",
  "draft.event.at_lower": "foundAt",
  "draft.event.at_upper": "foundAt",
  "draft.event.place_text": "place",
  "draft.event.district_code": "district",
  "draft.event.thana": "thana",
  "draft.event.circumstances": "circumstances",
  "draft.reporter.phone": "phone",
  "draft.reporter.relation": "relation",
};

/* ---------- submission id (idempotency key) ---------- */

// Browsers without crypto.randomUUID (plain-http LAN origins, older engines) still get a v4.
export function newClientId(c: Pick<Crypto, "getRandomValues"> & { randomUUID?: () => string } = globalThis.crypto): string {
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export type SubmissionMemo = { id: string; fingerprint: string } | null;

// Same payload as the last attempt → the same id (a safe replay). Changed payload → a new id,
// because the server would otherwise answer E-006 for ever (same key, different payload).
export function submissionFor(memo: SubmissionMemo, draft: unknown, makeId: () => string = newClientId): { id: string; fingerprint: string } {
  const fingerprint = JSON.stringify(draft);
  return memo && memo.fingerprint === fingerprint ? memo : { id: makeId(), fingerprint };
}

/* ---------- API call and outcome ---------- */

export type FoundLogFailure =
  | { kind: "validation" }
  | { kind: "conflict" } // E-006: same submission id, different payload
  | { kind: "rate-limited"; seconds: number | null }
  | { kind: "session" } // E-002: sign in again
  | { kind: "forbidden" } // E-003 / E-004
  | { kind: "offline" } // E-024: nothing reached the server
  | { kind: "uncertain" } // unreadable or timed-out: it may have been saved; a retry is safe
  | { kind: "generic" };

export type FoundLogOutcome = { kind: "saved"; response: CreateFoundResponse } | { kind: "failure"; failure: FoundLogFailure };

function errorIdOf(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("error" in body)) return null;
  const e = (body as { error: unknown }).error;
  if (typeof e !== "object" || e === null || !("id" in e)) return null;
  return typeof (e as { id: unknown }).id === "string" ? (e as { id: string }).id : null;
}

export function classifyFoundLogFailure(input: { status: number; body?: unknown; retryAfter?: string | null }): FoundLogFailure {
  const id = errorIdOf(input.body);
  if (id === "E-007" || input.status === 429) return { kind: "rate-limited", seconds: retryAfterSeconds(input.retryAfter) };
  if (id === "E-006") return { kind: "conflict" }; // E-005 (same-key race) is not "different data"
  if (id === "E-001" || input.status === 400) return { kind: "validation" };
  if (id === "E-002" || input.status === 401) return { kind: "session" };
  if (id === "E-003" || id === "E-004" || input.status === 403) return { kind: "forbidden" };
  // The write may have committed before a gateway or server error: say so; a retry is safe.
  if (input.status >= 500 || id === "E-005" || id === "E-021") return { kind: "uncertain" };
  return { kind: "generic" };
}

export async function requestFoundLog(
  request: CreateFoundRequest,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<FoundLogOutcome> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? FOUND_LOG_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("timed out", "TimeoutError")), timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(FOUND_LOG_API, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(request),
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const name = err instanceof Error ? err.name : "";
    const timedOut = name === "TimeoutError" || name === "AbortError";
    // "Offline" only when the browser itself says so; any other rejection may have followed a
    // committed write (connection reset, proxy drop), so it is "uncertain" (a retry is safe).
    const offline = !timedOut && typeof navigator !== "undefined" && navigator.onLine === false;
    return { kind: "failure", failure: { kind: offline ? "offline" : "uncertain" } };
  }
  clearTimeout(timer);
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (res.ok) {
    const parsed = createFoundResponseSchema.safeParse(body);
    if (parsed.success) return { kind: "saved", response: parsed.data };
    // The report is probably saved but the confirmation is unreadable: a contract mismatch,
    // not a flaky network. Log the field paths only (never values) so it is not invisible.
    console.error("found-log: unreadable API-007 response", parsed.error.issues.map((i) => i.path.join(".")));
    return { kind: "failure", failure: { kind: "uncertain" } };
  }
  return { kind: "failure", failure: classifyFoundLogFailure({ status: res.status, body, retryAfter: res.headers.get("retry-after") }) };
}

/* ---------- state machine ---------- */

export type FoundLogState = {
  status: "idle" | "saving" | "saved";
  failure: FoundLogFailure | null;
  fields: FieldErrors;
  saved: CreateFoundResponse | null;
  attempt: number; // bumped on each save press so a repeated identical error is announced again
};
export const initialFoundLogState: FoundLogState = { status: "idle", failure: null, fields: {}, saved: null, attempt: 0 };

export type FoundLogAction =
  | { type: "invalid"; fields: FieldErrors }
  | { type: "save" }
  | { type: "outcome"; outcome: FoundLogOutcome }
  | { type: "input"; field: FoundLogField }
  | { type: "interrupted" } // a bfcache restore while saving: the result is unknown
  | { type: "another" };

export function foundLogReducer(state: FoundLogState, action: FoundLogAction): FoundLogState {
  switch (action.type) {
    case "invalid":
      return { ...state, status: "idle", failure: null, fields: action.fields, attempt: state.attempt + 1 };
    case "save":
      return { ...state, status: "saving", failure: null, fields: {}, attempt: state.attempt + 1 };
    case "outcome":
      return action.outcome.kind === "saved"
        ? { ...state, status: "saved", failure: null, fields: {}, saved: action.outcome.response }
        : { ...state, status: "idle", failure: action.outcome.failure };
    case "input": {
      if (!state.fields[action.field]) return state;
      const rest = { ...state.fields };
      delete rest[action.field];
      return { ...state, fields: rest };
    }
    case "interrupted":
      return state.status === "saving" ? { ...state, status: "idle", failure: { kind: "uncertain" } } : state;
    case "another":
      return { ...initialFoundLogState, attempt: state.attempt + 1 };
  }
}

// Same synchronous in-flight guard idea as sign-in: a second press is ignored.
export function createSaveGuard() {
  let busy = false;
  return {
    get busy() {
      return busy;
    },
    enter() {
      if (busy) return false;
      busy = true;
      return true;
    },
    leave() {
      busy = false;
    },
  };
}

/* ---------- copy ---------- */

const FAILURE_KEY: Record<Exclude<FoundLogFailure["kind"], "rate-limited">, MessageKey> = {
  validation: "foundLogErrorValidation",
  conflict: "foundLogErrorConflict",
  session: "foundLogErrorSession",
  forbidden: "foundLogErrorForbidden",
  offline: "foundLogErrorOffline",
  uncertain: "foundLogErrorUncertain",
  generic: "foundLogErrorGeneric",
};

// Server text is never shown; every failure maps to our own bilingual copy (D2B §13).
export function foundLogFailureText(failure: FoundLogFailure, locale: Locale): string {
  const t = locales[locale];
  if (failure.kind === "rate-limited") {
    return failure.seconds === null
      ? t.foundLogRateLimitedSoon
      : t.foundLogRateLimited.replace("{s}", localizeDigits(failure.seconds, locale));
  }
  return t[FAILURE_KEY[failure.kind]];
}

const FIELD_KEY: Record<FieldReason, MessageKey> = {
  required: "foundLogFieldRequired",
  invalid: "foundLogFieldInvalid",
  description: "foundLogFieldDescription",
  future: "foundLogFieldFuture",
};
export const foundLogFieldText = (reason: FieldReason, locale: Locale): string => locales[locale][FIELD_KEY[reason]];

// D3 SCREEN-007: matching state is explicit, never implied (no candidate details).
const MATCH_KEY: Record<CreateFoundResponse["matching_state"], MessageKey> = {
  queued: "foundLogMatchQueued",
  running: "foundLogMatchRunning",
  complete: "foundLogMatchComplete",
  failed: "foundLogMatchFailed",
};
export const foundLogMatchText = (state: CreateFoundResponse["matching_state"], locale: Locale): string =>
  locales[locale][MATCH_KEY[state]];

// First field with an error, in on-screen order, for focus after a failed Save.
export const FIELD_ORDER: readonly FoundLogField[] = [
  "circumstances", "clothing", "marks", "sex", "ageYears", "ageMin", "ageMax", "heightCm",
  "place", "thana", "district", "foundAt", "phone", "relation",
];
export function firstErrorField(errors: FieldErrors): FoundLogField | null {
  return FIELD_ORDER.find((f) => errors[f]) ?? null;
}
