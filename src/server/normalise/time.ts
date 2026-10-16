import { CLOCK_SKEW_MS, inputDateTimeSchema, toAsciiDigits, toDhakaIso } from "@/contracts";
import { sourceValue } from "./source";
import { known, unknown, type EventInterval, type Normalisation, type Utf16Range } from "./types";

// D2A A-035; only TC-002 additionally specifies the inflected form বিকেলে.
const PART_OF_DAY: Readonly<Record<string, number>> = {
  সকাল: 8 * 60, দুপুর: 13 * 60, বিকেল: 16 * 60, বিকেলে: 16 * 60, সন্ধ্যা: 18 * 60 + 30, রাত: 21 * 60,
};
const HOUR_MS = 60 * 60 * 1000;

export function normaliseTime(source: string, range: Utf16Range, nowIso: string): Normalisation<EventInterval> {
  const raw = sourceValue(source, range);
  if (raw.status === "unknown") return raw;
  const clock = inputDateTimeSchema.safeParse(nowIso);
  if (!clock.success) return unknown("invalid_clock");
  const now = Date.parse(clock.data);
  const asciiQuote = toAsciiDigits(raw.value);
  const phrase = asciiQuote.normalize("NFC").trim();
  const exact = inputDateTimeSchema.safeParse(phrase);
  if (exact.success) {
    if (Date.parse(exact.data) > now + CLOCK_SKEW_MS) return unknown("future");
    // Offset/ISO canonicalisation takes precedence over digit-only conversion.
    const derivation = exact.data !== asciiQuote ? "time_interval" : asciiQuote !== raw.value ? "digits" : "direct";
    return known({ at: exact.data, at_lower: exact.data, at_upper: exact.data, at_approx: false }, raw.evidence.map((span) => ({ ...span, derivation })));
  }

  const relative = /^গতকাল\s+(সকাল|দুপুর|বিকেল|বিকেলে|সন্ধ্যা|রাত)$/u.exec(phrase);
  if (!relative) return unknown(phrase === "গতকাল" || Object.hasOwn(PART_OF_DAY, phrase) ? "ambiguous" : "unsupported");
  const date = clock.data.slice(0, 10);
  const yesterday = Date.parse(`${date}T00:00:00+06:00`) - 24 * HOUR_MS;
  const at = yesterday + PART_OF_DAY[relative[1]] * 60 * 1000;
  const lower = at - 2 * HOUR_MS;
  const upper = at + 2 * HOUR_MS;
  // The latest specified window ends yesterday at 23:00, before the intake's Dhaka date.
  const interval: EventInterval = { at: toDhakaIso(at), at_lower: toDhakaIso(lower), at_upper: toDhakaIso(upper), at_approx: true };
  if (![interval.at, interval.at_lower, interval.at_upper].every((iso) => inputDateTimeSchema.safeParse(iso).success)) return unknown("unsupported");
  return known(interval, raw.evidence.map((span) => ({ ...span, derivation: "time_interval" })));
}
