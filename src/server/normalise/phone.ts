import { phoneSchema } from "@/contracts";
import { sourceValue } from "./source";
import { known, unknown, type Normalisation, type Utf16Range } from "./types";

export function normalisePhone(source: string, range: Utf16Range): Normalisation<string> {
  const raw = sourceValue(source, range);
  if (raw.status === "unknown") return raw;
  // phoneSchema applies the contract's toAsciiDigits and permitted separator rules.
  const phone = phoneSchema.safeParse(raw.value);
  if (!phone.success) return unknown("invalid_phone");
  const derivation = phone.data === raw.value ? "direct" : "digits";
  return known(phone.data, raw.evidence.map((span) => ({ ...span, derivation })));
}
