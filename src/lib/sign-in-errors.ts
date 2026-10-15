// SCREEN-008 / COMP-047 error mapping (D3 SCREEN-008 states; D2B §13 E-002, E-007).
// Pure, so it is unit-tested without a browser. The copy lives in src/locales.
//
// - E-002 (any 401): one generic message that never says which field was wrong.
// - E-007 (any 429): the wait in whole seconds from Retry-After, shown with Bangla
//   numerals in Bangla mode; without a usable header, a wait-a-little message.
// - Anything else (E-003 cross-site, E-021, a non-JSON body, a network failure): a safe
//   generic message. Server text is never shown, so nothing unexpected reaches the page.
import { localizeDigits } from "@/lib/numerals";
import { locales, type Locale } from "@/locales";

export type SignInFailure =
  | { kind: "credentials" }
  | { kind: "rate-limited"; seconds: number | null }
  | { kind: "generic" };

const MAX_WAIT_SECONDS = 3600;

function errorIdOf(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("error" in body)) return null;
  const error = (body as { error: unknown }).error;
  if (typeof error !== "object" || error === null || !("id" in error)) return null;
  const id = (error as { id: unknown }).id;
  return typeof id === "string" ? id : null;
}

// Whole seconds only (RFC 9110 delay-seconds); an HTTP date or junk gives null.
export function retryAfterSeconds(header: string | null | undefined): number | null {
  if (typeof header !== "string" || !/^\s*\d{1,6}\s*$/.test(header)) return null;
  const seconds = Number(header.trim());
  return seconds >= 1 && seconds <= MAX_WAIT_SECONDS ? seconds : null;
}

export function classifySignInFailure(input: { status: number; body?: unknown; retryAfter?: string | null }): SignInFailure {
  const id = errorIdOf(input.body);
  if (id === "E-007" || input.status === 429) return { kind: "rate-limited", seconds: retryAfterSeconds(input.retryAfter) };
  if (id === "E-002" || input.status === 401) return { kind: "credentials" };
  return { kind: "generic" };
}

export function signInFailureText(failure: SignInFailure, locale: Locale): string {
  const t = locales[locale];
  switch (failure.kind) {
    case "credentials":
      return t.signInErrorCredentials;
    case "rate-limited":
      return failure.seconds === null
        ? t.signInErrorRateLimitedSoon
        : t.signInErrorRateLimited.replace("{s}", localizeDigits(failure.seconds, locale));
    case "generic":
      return t.signInErrorGeneric;
  }
}
