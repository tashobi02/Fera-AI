import { locales, type Locale } from "@/locales";

export const DEFAULT_LOCALE: Locale = "bn";
export const LOCALE_COOKIE = "fera-lang";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// Own keys only, so prototype names such as "constructor" or "__proto__" never pass.
export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && Object.hasOwn(locales, value);
}

export const supportedLocales: readonly Locale[] = Object.keys(locales).filter(isLocale);

// Anything other than an exact supported code falls back to Bangla (FR-033).
export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

// UI language preference only, not identity: the parent session cookie must not
// copy these options. `secure` is off for the finale laptop stack (DEMO_MODE=1),
// which may be reached over plain HTTP on the local network.
export function localeCookieOptions(env: NodeJS.ProcessEnv = process.env) {
  return {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
    httpOnly: true,
    secure: env.NODE_ENV === "production" && env.DEMO_MODE !== "1",
  } as const;
}
