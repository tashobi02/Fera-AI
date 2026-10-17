// SCREEN-013 / COMP-043 import panel pure helpers (TASK-048; API-015).
//
// The typed-confirmation guard, the import state machine, the error and
// success copy and the API-015 call. Pure (no DOM, no server modules), so it
// is unit-tested in Node. Copy lives in src/locales/areas/admin-import.ts;
// error text comes from the contract catalogue, never from the response body.
import { z } from "zod";
import {
  ERROR_CATALOGUE,
  importRequestSchema,
  importResponseSchema,
  type ImportResponse,
} from "@/contracts";
import { localizeDigits } from "@/lib/numerals";
import { locales, type Locale, type MessageKey } from "@/locales";

/* ---------- typed confirmation (D3 SCREEN-013 accessibility row) ---------- */

// The exact word the import form requires (D3 ACT-026 typed confirmation: an
// explicit "synthetic" label so an admin cannot treat this as a real
// public-child data import). The English value stays in Latin so the form
// surfaces the same label in both locales.
export const ADMIN_IMPORT_CONFIRMATION = "Synthetic";

// Invisible format characters a paste from chat or the web can carry.
const INVISIBLE = /[\u00AD\u200B-\u200F\u2060\u2066-\u2069\uFEFF]/g;

export function confirmationMatchesImport(input: string): boolean {
  return (
    input.normalize("NFC").replace(INVISIBLE, "").trim().toLowerCase() ===
    ADMIN_IMPORT_CONFIRMATION.toLowerCase()
  );
}

/* ---------- limits ---------- */

// The contract is 1..50; the UI caps the textarea at 5 because admins read
// every text they import. The route's Zod body still enforces 1..50, so a
// request that bypasses the UI is caught at the boundary.
export const IMPORT_MAX_TEXTS = 5;

// The shared URL field is optional. When it is blank, assign stable reserved
// URLs in the browser; the server stores these values but never fetches them.
export function syntheticImportSourceUrl(value: string, lineIndex: number): string {
  const shared = value.trim();
  return shared || `https://example.invalid/fixture/line-${lineIndex + 1}`;
}

/* ---------- failures ---------- */

export const ADMIN_IMPORT_ERROR_IDS = [
  "E-001",
  "E-002",
  "E-003",
  "E-004",
  "E-007",
  "E-013",
  "E-021",
  "E-023",
] as const;
export type AdminImportErrorId = (typeof ADMIN_IMPORT_ERROR_IDS)[number];
export type AdminImportFailure = { id: AdminImportErrorId; seconds: number | null };

function errorIdOf(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("error" in body)) return null;
  const error = (body as { error: unknown }).error;
  if (typeof error !== "object" || error === null || !("id" in error)) return null;
  const id = (error as { id: unknown }).id;
  return typeof id === "string" ? id : null;
}

const BY_STATUS: Record<number, AdminImportErrorId> = {
  400: "E-001",
  401: "E-002",
  403: "E-003",
  404: "E-004",
  413: "E-001",
  422: "E-001",
  429: "E-007",
  500: "E-021",
  503: "E-013",
};

function retryAfter(header: string | null | undefined): number | null {
  if (typeof header !== "string" || !/^\s*\d{1,6}\s*$/.test(header)) return null;
  const n = Number(header.trim());
  return n >= 1 && n <= 3600 ? n : null;
}

export function classifyAdminImportFailure(input: {
  status: number;
  body?: unknown;
  retryAfter?: string | null;
}): AdminImportFailure {
  const fromBody = errorIdOf(input.body);
  const id = (ADMIN_IMPORT_ERROR_IDS as readonly string[]).includes(fromBody ?? "")
    ? (fromBody as AdminImportErrorId)
    : (BY_STATUS[input.status] ?? "E-021");
  return { id, seconds: id === "E-007" ? retryAfter(input.retryAfter) : null };
}

export function adminImportFailureText(
  failure: AdminImportFailure,
  locale: Locale,
): string {
  if (failure.id === "E-007" && failure.seconds === null) {
    return locales[locale].signInErrorRateLimitedSoon;
  }
  const entry = ERROR_CATALOGUE[failure.id];
  if (!entry) return locales[locale].adminImportErrorGeneric;
  const text = locale === "bn" ? entry.bn : entry.en;
  const key: MessageKey = keyForImportError(failure.id);
  const localised = locales[locale][key] ?? text;
  return failure.seconds === null ? localised : localised.replace("{s}", localizeDigits(failure.seconds, locale));
}

function keyForImportError(id: AdminImportErrorId): MessageKey {
  switch (id) {
    case "E-001":
      return "adminImportErrorValidation";
    case "E-002":
      return "adminImportErrorSession";
    case "E-003":
      return "adminImportErrorForbidden";
    case "E-007":
      return "adminImportErrorRateLimited";
    case "E-013":
    case "E-023":
      return "adminImportErrorBudget";
    case "E-021":
      return "adminImportErrorGeneric";
    default:
      return "adminImportErrorGeneric";
  }
}

/* ---------- copy ---------- */

const fill = (key: MessageKey, locale: Locale, values: Record<string, string>) =>
  Object.entries(values).reduce<string>(
    (text, [k, v]) => text.replace(`{${k}}`, () => v),
    locales[locale][key],
  );

export const importActionText = (locale: Locale) => locales[locale].adminImportAction;
export const importImportedText = (n: number, locale: Locale) =>
  fill("adminImportImported", locale, { n: localizeDigits(n, locale) });
export const importSkippedText = (n: number, locale: Locale) =>
  fill("adminImportSkipped", locale, { n: localizeDigits(n, locale) });
export const importDuplicatesText = (n: number, locale: Locale) =>
  fill("adminImportDuplicates", locale, { n: localizeDigits(n, locale) });
export const syntheticBadgeText = (locale: Locale) => locales[locale].adminImportSimulated;

export const importEmpty = (lineCount: number) => lineCount === 0;
export const importErrorText = (kind: "mismatch" | "too_few" | "too_many" | null, locale: Locale) => {
  if (kind === null) return "";
  const key: MessageKey = kind === "mismatch" ? "adminImportErrorValidation" : "adminImportEmpty";
  return locales[locale][key];
};

/* ---------- state machine ---------- */

export type AdminImportRequestInput = z.input<typeof importRequestSchema>;
export type AdminImportRequest = z.output<typeof importRequestSchema>;
export type AdminImportOutcome<T> = { kind: "ok"; data: T } | { kind: "failed"; failure: AdminImportFailure };

export type ImportFormState = {
  texts: string;
  sourceUrl: string;
  kind: "missing" | "found";
  fixtureIntakeAt: string;
  status: "idle" | "submitting";
  confirmError: boolean;
  confirmAttempts: number;
  lastError: "mismatch" | "too_few" | "too_many" | null;
  result: ImportResponse | null;
  failure: AdminImportFailure | null;
};

const NOW_ISO = (() => {
  // Stable per-process; refreshed on submit so a long-lived form still
  // records a sensible "fixture intake at" timestamp.
  let t = new Date().toISOString();
  return () => {
    const next = new Date().toISOString();
    if (next !== t) t = next;
    return t;
  };
})();

export const initialImportState: ImportFormState = {
  texts: "",
  sourceUrl: "",
  kind: "missing",
  fixtureIntakeAt: NOW_ISO(),
  status: "idle",
  confirmError: false,
  confirmAttempts: 0,
  lastError: null,
  result: null,
  failure: null,
};

export type ImportFormEvent =
  | { type: "input_texts"; value: string }
  | { type: "input_url"; value: string }
  | { type: "set_kind"; value: "missing" | "found" }
  | { type: "input_confirm"; value: string }
  | { type: "submit"; value: string; lineCount: number }
  | { type: "outcome"; outcome: AdminImportOutcome<ImportResponse> };

export function importReducer(state: ImportFormState, event: ImportFormEvent): ImportFormState {
  switch (event.type) {
    case "input_texts":
      return { ...state, texts: event.value };
    case "input_url":
      return { ...state, sourceUrl: event.value };
    case "set_kind":
      return { ...state, kind: event.value };
    case "input_confirm":
      if (state.confirmError && confirmationMatchesImport(event.value)) {
        return { ...state, confirmError: false };
      }
      return state;
    case "submit": {
      if (state.status === "submitting") return state;
      if (event.lineCount === 0) {
        return { ...state, confirmError: true, confirmAttempts: state.confirmAttempts + 1, lastError: "too_few", failure: null };
      }
      if (event.lineCount > IMPORT_MAX_TEXTS) {
        return { ...state, confirmError: true, confirmAttempts: state.confirmAttempts + 1, lastError: "too_many", failure: null };
      }
      if (!confirmationMatchesImport(event.value)) {
        return { ...state, confirmError: true, confirmAttempts: state.confirmAttempts + 1, lastError: "mismatch", failure: null };
      }
      return { ...state, status: "submitting", confirmError: false, lastError: null, fixtureIntakeAt: NOW_ISO(), result: null, failure: null };
    }
    case "outcome": {
      if (state.status !== "submitting") return state;
      return event.outcome.kind === "ok"
        ? { ...state, status: "idle", confirmError: false, result: event.outcome.data, failure: null, lastError: null }
        : { ...state, status: "idle", confirmError: false, result: null, failure: event.outcome.failure };
    }
  }
}

/* ---------- API call ---------- */

export type ImportFetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

const TIMEOUT_MS = 25_000;

async function call<S extends z.ZodType>(
  url: string,
  init: RequestInit,
  schema: S,
  fetchImpl: ImportFetchLike,
): Promise<AdminImportOutcome<z.output<S>>> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      ...init,
    });
  } catch {
    return { kind: "failed", failure: { id: "E-021", seconds: null } };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    return {
      kind: "failed",
      failure: classifyAdminImportFailure({
        status: res.status,
        body,
        retryAfter: res.headers.get("retry-after"),
      }),
    };
  }
  const parsed = schema.safeParse(body);
  return parsed.success ? { kind: "ok", data: parsed.data } : { kind: "failed", failure: { id: "E-021", seconds: null } };
}

const postJson = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export function requestSyntheticImport(
  body: AdminImportRequestInput,
  fetchImpl: ImportFetchLike = fetch,
): Promise<AdminImportOutcome<ImportResponse>> {
  return call(
    "/api/admin/import",
    postJson(body),
    importResponseSchema,
    fetchImpl,
  );
}
