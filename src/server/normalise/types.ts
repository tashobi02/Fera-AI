import type { EvidenceSpan } from "@/contracts";

export type Utf16Range = Readonly<{ start_utf16: number; end_utf16: number }>;

export type UnknownReason =
  | "empty" | "invalid_source" | "invalid_range" | "unsupported" | "ambiguous"
  | "unresolved" | "invalid_phone" | "invalid_clock" | "invalid_district" | "future"
  | "romanisation_unspecified";

export type Unknown = Readonly<{ status: "unknown"; value: null; evidence: readonly []; reason: UnknownReason }>;
export type Normalisation<T> = Readonly<{ status: "known"; value: T; evidence: readonly EvidenceSpan[] }> | Unknown;

export type NormalisedToken = Utf16Range & Readonly<{ text: string; evidence: EvidenceSpan }>;
export type NormalisedText = Readonly<{
  sourceText: string;
  normalisedText: string;
  // Each normalised UTF-16 code unit maps to its complete original grapheme.
  offsetMap: readonly Utf16Range[];
  tokens: readonly NormalisedToken[];
}>;

export type EventInterval = Readonly<{ at: string; at_lower: string; at_upper: string; at_approx: boolean }>;

// A synchronous lookup over caller-supplied, preloaded names and aliases; no I/O.
export interface DistrictLookup {
  /** Keys are NFC-normalised, trimmed, then lower-cased; build names/alias indexes the same way. */
  lookup(normalisedName: string): readonly Readonly<{ code: number }>[];
}

export const unknown = (reason: UnknownReason): Unknown => ({ status: "unknown", value: null, evidence: [], reason });
export const known = <T>(value: T, evidence: readonly EvidenceSpan[]): Normalisation<T> => ({ status: "known", value, evidence });
