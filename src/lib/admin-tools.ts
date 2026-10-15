// SCREEN-013 / COMP-043 pure helpers (TASK-032): the typed-confirmation guard, the
// redaction state machine, error and success copy, and the API-016/017/021 calls. Pure
// (no DOM, no server modules), so it is unit-tested in Node. Copy lives in src/locales;
// error text comes from the contract catalogue, never from the response body.
import type { z } from "zod";
import {
  ERROR_CATALOGUE,
  adminUsersResponseSchema,
  anonymiseResponseSchema,
  verifyUserResponseSchema,
  type AdminUsersResponse,
  type AnonymiseResponse,
  type UserRole,
  type VerifyUserResponse,
} from "@/contracts";
import { localizeDigits } from "@/lib/numerals";
import { locales, type Locale, type MessageKey } from "@/locales";

/* ---------- typed confirmation (D3 SCREEN-013 accessibility row) ---------- */

// The exact word the API-016 contract accepts (anonymiseRequestSchema.confirmation).
export const REDACTION_CONFIRMATION = "বেনামী";

// Invisible format characters a paste from chat or the web can carry (zero-width space,
// joiners, direction marks, word joiner, bidi isolates, BOM, soft hyphen).
const INVISIBLE = /[\u00AD\u200B-\u200F\u2060\u2066-\u2069\uFEFF]/g;

// NFC, invisible characters and surrounding whitespace are forgiven; anything else
// (another word, a partial word, the বেনামি spelling, Latin "benami") is not: D3 pins the
// word. The request always sends the constant, never the input.
export function confirmationMatches(input: string): boolean {
  return (
    input.normalize("NFC").replace(INVISIBLE, "").trim() ===
    REDACTION_CONFIRMATION
  );
}

/* ---------- failures ---------- */

export const ADMIN_ERROR_IDS = [
  "E-001",
  "E-002",
  "E-003",
  "E-004",
  "E-007",
  "E-021",
] as const;
export type AdminErrorId = (typeof ADMIN_ERROR_IDS)[number];
export type AdminFailure = { id: AdminErrorId; seconds: number | null };

function errorIdOf(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("error" in body))
    return null;
  const error = (body as { error: unknown }).error;
  if (typeof error !== "object" || error === null || !("id" in error))
    return null;
  const id = (error as { id: unknown }).id;
  return typeof id === "string" ? id : null;
}

const BY_STATUS: Record<number, AdminErrorId> = {
  400: "E-001",
  401: "E-002",
  403: "E-003",
  404: "E-004",
  429: "E-007",
};

function retryAfter(header: string | null | undefined): number | null {
  if (typeof header !== "string" || !/^\s*\d{1,6}\s*$/.test(header))
    return null;
  const n = Number(header.trim());
  return n >= 1 && n <= 3600 ? n : null;
}

export function classifyAdminFailure(input: {
  status: number;
  body?: unknown;
  retryAfter?: string | null;
}): AdminFailure {
  const fromBody = errorIdOf(input.body);
  const id = (ADMIN_ERROR_IDS as readonly string[]).includes(fromBody ?? "")
    ? (fromBody as AdminErrorId)
    : (BY_STATUS[input.status] ?? "E-021");
  return { id, seconds: id === "E-007" ? retryAfter(input.retryAfter) : null };
}

export function adminFailureText(
  failure: AdminFailure,
  locale: Locale,
): string {
  if (failure.id === "E-007" && failure.seconds === null)
    return locales[locale].signInErrorRateLimitedSoon;
  const entry = ERROR_CATALOGUE[failure.id];
  const text = locale === "bn" ? entry.bn : entry.en;
  return failure.seconds === null
    ? text
    : text.replace("{s}", localizeDigits(failure.seconds, locale));
}

/* ---------- copy ---------- */

export const countText = (n: number, locale: Locale) =>
  localizeDigits(n, locale);

const fill = (
  key: MessageKey,
  locale: Locale,
  values: Record<string, string>,
) =>
  Object.entries(values).reduce<string>(
    (text, [k, v]) => text.replace(`{${k}}`, () => v),
    locales[locale][key],
  );

export const redactionSuccessText = (
  result: Pick<AnonymiseResponse, "redacted">,
  locale: Locale,
) => fill("redactSuccess", locale, { n: countText(result.redacted, locale) });

export const redactionSkippedText = (
  result: Pick<AnonymiseResponse, "skipped_not_eligible">,
  locale: Locale,
) =>
  result.skipped_not_eligible > 0
    ? fill("redactSkipped", locale, {
        n: countText(result.skipped_not_eligible, locale),
      })
    : null;

export const verifiedText = (name: string, verified: boolean, locale: Locale) =>
  fill(verified ? "verifyDone" : "unverifyDone", locale, { name });

export const moreUsersText = (n: number, locale: Locale) =>
  fill("usersLoaded", locale, { n: countText(n, locale) });

// Seeded display names may be Bangla inside the English UI (WCAG 3.1.2).
export const nameLang = (name: string): "bn" | undefined =>
  /[\u0980-\u09FF]/.test(name) ? "bn" : undefined;

// "Show more": append the next page, skipping rows already shown.
export function mergeUsersPage<U extends { id: string }>(
  list: readonly U[],
  page: readonly U[],
): { users: U[]; added: number } {
  const seen = new Set(list.map((u) => u.id));
  const fresh = page.filter((u) => !seen.has(u.id));
  return { users: [...list, ...fresh], added: fresh.length };
}

/* ---------- user rows (status = icon + text + colour) ---------- */

export type UserStatus = "verified" | "unverified" | "inactive" | "not-officer";

export function userStatus(user: {
  role: UserRole;
  verified: boolean;
  is_active: boolean;
}): UserStatus {
  if (!user.is_active) return "inactive";
  if (user.role !== "officer") return "not-officer";
  return user.verified ? "verified" : "unverified";
}

export const USER_STATUS_KEY: Record<UserStatus, MessageKey> = {
  verified: "statusVerified",
  unverified: "statusUnverified",
  inactive: "statusInactive",
  "not-officer": "statusNotOfficer",
};

export const ROLE_KEY: Record<UserRole, MessageKey> = {
  staff: "roleStaff",
  officer: "roleOfficer",
  admin: "roleAdmin",
};

// Only officers carry the verified flag (users CHECK, API-017 E-004 otherwise).
export const canToggleVerification = (user: { role: UserRole }) =>
  user.role === "officer";

/* ---------- redaction state machine ---------- */

export type RedactionState = {
  status: "idle" | "submitting";
  confirmError: boolean; // the typed word did not match on the last attempt
  confirmAttempts: number; // failed attempts, so a repeated mismatch is announced again
  result: AnonymiseResponse | null;
  failure: AdminFailure | null;
};

export const initialRedactionState: RedactionState = {
  status: "idle",
  confirmError: false,
  confirmAttempts: 0,
  result: null,
  failure: null,
};

export type RedactionEvent =
  | { type: "input"; value: string }
  | { type: "submit"; value: string }
  | { type: "outcome"; outcome: AdminOutcome<AnonymiseResponse> };

export function redactionReducer(
  state: RedactionState,
  event: RedactionEvent,
): RedactionState {
  switch (event.type) {
    case "input":
      return state.confirmError && confirmationMatches(event.value)
        ? { ...state, confirmError: false }
        : state;
    case "submit":
      if (state.status === "submitting") return state;
      if (!confirmationMatches(event.value))
        return {
          ...state,
          confirmError: true,
          confirmAttempts: state.confirmAttempts + 1,
          failure: null,
        };
      return {
        ...state,
        status: "submitting",
        confirmError: false,
        result: null,
        failure: null,
      };
    case "outcome":
      if (state.status !== "submitting") return state;
      return event.outcome.kind === "ok"
        ? {
            ...state,
            status: "idle",
            confirmError: false,
            result: event.outcome.data,
            failure: null,
          }
        : {
            ...state,
            status: "idle",
            confirmError: false,
            result: null,
            failure: event.outcome.failure,
          };
  }
}

/* ---------- API calls ---------- */

export type AdminOutcome<T> =
  { kind: "ok"; data: T } | { kind: "failed"; failure: AdminFailure };
export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

const TIMEOUT_MS = 15_000;
// API-016 redacts case by case in one request (61 s server query backstop), so the client
// waits longer than the server can work; a timeout then means "outcome unknown" and the
// form refreshes the count either way.
const REDACTION_TIMEOUT_MS = 70_000;

async function call<S extends z.ZodType>(
  url: string,
  init: RequestInit,
  schema: S,
  fetchImpl: FetchLike,
  timeoutMs = TIMEOUT_MS,
): Promise<AdminOutcome<z.output<S>>> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
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
  if (!res.ok)
    return {
      kind: "failed",
      failure: classifyAdminFailure({
        status: res.status,
        body,
        retryAfter: res.headers.get("retry-after"),
      }),
    };
  const parsed = schema.safeParse(body);
  return parsed.success
    ? { kind: "ok", data: parsed.data }
    : { kind: "failed", failure: { id: "E-021", seconds: null } };
}

const postJson = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

// ACT-027 always redacts "all eligible" (TC-015); the typed word was checked before.
export function requestRedaction(
  fetchImpl: FetchLike = fetch,
): Promise<AdminOutcome<AnonymiseResponse>> {
  return call(
    "/api/admin/anonymise",
    postJson({ all_eligible: true, confirmation: REDACTION_CONFIRMATION }),
    anonymiseResponseSchema,
    fetchImpl,
    REDACTION_TIMEOUT_MS,
  );
}

export function requestVerification(
  userId: string,
  verified: boolean,
  fetchImpl: FetchLike = fetch,
): Promise<AdminOutcome<VerifyUserResponse>> {
  return call(
    `/api/admin/users/${encodeURIComponent(userId)}/verify`,
    postJson({ verified }),
    verifyUserResponseSchema,
    fetchImpl,
  );
}

export function requestUsersPage(
  cursor: string,
  fetchImpl: FetchLike = fetch,
): Promise<AdminOutcome<AdminUsersResponse>> {
  return call(
    `/api/admin/users?cursor=${encodeURIComponent(cursor)}`,
    { method: "GET" },
    adminUsersResponseSchema,
    fetchImpl,
  );
}
