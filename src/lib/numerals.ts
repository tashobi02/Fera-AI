import type { Locale } from "@/locales";

const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";
const BANGLA_ZERO = 0x09e6;

export function toBanglaDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (digit) => BANGLA_DIGITS[Number(digit)]);
}

export function toLatinDigits(value: string): string {
  return value.replace(/[০-৯]/g, (digit) => String(digit.charCodeAt(0) - BANGLA_ZERO));
}

// Parent screens in Bangla mode use Bangla numerals (D4 §6.3, DESIGN.md overrides).
export function localizeDigits(value: string | number, locale: Locale): string {
  return locale === "bn" ? toBanglaDigits(value) : toLatinDigits(String(value));
}

// Officer screens show both where space allows: "১৩ / 13".
export function dualNumerals(value: string | number): string {
  const latin = toLatinDigits(String(value));
  const bangla = toBanglaDigits(latin);
  return bangla === latin ? latin : `${bangla} / ${latin}`;
}
