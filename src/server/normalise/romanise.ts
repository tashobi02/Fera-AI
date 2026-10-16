import { sourceValue } from "./source";
import { unknown, type Normalisation, type Utf16Range } from "./types";

export function romaniseName(source: string, range: Utf16Range): Normalisation<string> {
  const raw = sourceValue(source, range);
  if (raw.status === "unknown") return raw;
  // A-033 calls for a team table but supplies no scheme; OD-012-1 keeps this unknown.
  return unknown("romanisation_unspecified");
}
