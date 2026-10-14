// Display-only numeral conversion for rendered text. Never apply it to stored
// values, form values sent to the server, tel: hrefs, UUIDs, reference codes
// used as keys, or extraction source spans: those keep their original digits.
import type { Locale } from "@/locales";

const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";
const BANGLA_ZERO = 0x09e6;

// NaN and Infinity are bugs upstream, not something to print in either script.
function text(value: string | number): string {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new RangeError(`numerals: non-finite number ${value}`);
  }
  return String(value);
}

export function toBanglaDigits(value: string | number): string {
  return text(value).replace(/[0-9]/g, (digit) => BANGLA_DIGITS[Number(digit)]);
}

export function toLatinDigits(value: string): string {
  return value.replace(/[০-৯]/g, (digit) => String(digit.charCodeAt(0) - BANGLA_ZERO));
}

// Parent screens in Bangla mode use Bangla numerals (D4 §6.3, DESIGN.md overrides).
export function localizeDigits(value: string | number, locale: Locale): string {
  return locale === "bn" ? toBanglaDigits(value) : toLatinDigits(text(value));
}

// Officer screens show both where space allows: "১৩ / 13".
export function dualNumerals(value: string | number): string {
  const latin = toLatinDigits(text(value));
  const bangla = toBanglaDigits(latin);
  return bangla === latin ? latin : `${bangla} / ${latin}`;
}
