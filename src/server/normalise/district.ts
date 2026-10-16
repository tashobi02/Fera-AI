import { districtCodeSchema } from "@/contracts";
import { sourceValue } from "./source";
import { known, unknown, type DistrictLookup, type Normalisation, type Utf16Range } from "./types";

export function normaliseDistrict(source: string, range: Utf16Range, lookup: DistrictLookup): Normalisation<number> {
  const raw = sourceValue(source, range, "district_mapping");
  if (raw.status === "unknown") return raw;
  const matches = lookup.lookup(raw.value.normalize("NFC").trim().toLowerCase());
  const codes = new Set<number>();
  for (const match of matches) {
    const code = districtCodeSchema.safeParse(match.code);
    if (!code.success) return unknown("invalid_district");
    codes.add(code.data);
  }
  if (codes.size === 0) return unknown("unresolved");
  if (codes.size !== 1) return unknown("ambiguous");
  return known([...codes][0], raw.evidence);
}
