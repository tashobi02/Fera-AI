import type { Locale } from "@/locales";

export const DEFAULT_LOCALE: Locale = "bn";
export const LOCALE_COOKIE = "fera-lang";
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return value === "bn" || value === "en";
}

// Anything other than an exact supported code falls back to Bangla (FR-033).
export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
