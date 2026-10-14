// Shared scalar validators and limits (D2A §5.1/§7, D1 BR-016/023).
import { z } from "zod";

export type Uuid = string;
export type IsoDateTime = string; // ISO 8601 with +06:00

// Postgres accepts any 8-4-4-4-12 hex value (fixed seed IDs such as 0000…0001), so
// the contract does too, and lowercases it: sorted-UUID lock order and the
// duplicate_links case_a < case_b CHECK compare lowercase text.
export const uuidSchema = z.guid().transform((v) => v.toLowerCase());

export function isUuid(value: unknown): value is Uuid {
  return typeof value === "string" && z.guid().safeParse(value).success;
}

// Same ID only when both are valid UUIDs (undefined === undefined never matches).
export function sameId(a: unknown, b: unknown): boolean {
  return isUuid(a) && isUuid(b) && a.toLowerCase() === b.toLowerCase();
}

/* ---------- Time (D2A §5.1 "Times ISO 8601 with +06:00") ---------- */

export const DHAKA_OFFSET = "+06:00";
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
// Future-time checks allow this much client clock skew.
export const CLOCK_SKEW_MS = 2 * 60 * 1000;

// Canonical Fera form: YYYY-MM-DDTHH:mm:ss[.sss]+06:00 (milliseconds only when non-zero).
export function toDhakaIso(epochMs: number): IsoDateTime {
  const shifted = new Date(epochMs + DHAKA_OFFSET_MS).toISOString(); // wall time in Dhaka, "Z" suffix
  const [date, rest] = shifted.split("T");
  const [hms, frac] = rest.replace("Z", "").split(".");
  return `${date}T${hms}${frac && frac !== "000" ? `.${frac}` : ""}${DHAKA_OFFSET}`;
}

// Server/response values: must already carry +06:00; up to microsecond digits (timestamptz).
export const isoDateTimeSchema = z.iso
  .datetime({ offset: true })
  .refine((v) => v.endsWith(DHAKA_OFFSET), "times are serialised with +06:00")
  .refine((v) => !/\.\d{7,}/.test(v), "at most microsecond precision");

// Client-entered times: any explicit offset, at most millisecond precision so JS
// comparisons are exact; canonicalised to +06:00 before validation and hashing.
export const inputDateTimeSchema = z.iso
  .datetime({ offset: true })
  .refine((v) => !/\.\d{4,}/.test(v), "at most millisecond precision")
  .transform((v) => toDhakaIso(Date.parse(v)));

/* ---------- Identifiers and patterns copied from schema_v2.sql CHECKs ---------- */

export const REF_CODE_PATTERN = /^[MF]-[0-9A-Z]{6}$/;
export const PHONE_PATTERN = /^01[0-9]{9}$/;
export const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
export const AUDIT_ACTION_PATTERN = /^[a-z_.]{3,60}$/;
export const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

export const refCodeSchema = z.string().regex(REF_CODE_PATTERN);
export const sha256HexSchema = z.string().regex(SHA256_HEX_PATTERN);
export const versionSchema = z.int().min(1);
export const districtCodeSchema = z.int().min(1).max(64);

// Opaque signed draft/principal/expiry binding. Clients never read it and its
// embedded counters are not authoritative (D2A §9.4).
export const draftTokenSchema = z.string().min(16).max(2048).regex(/^[A-Za-z0-9._~-]+$/);

/* ---------- Limits ---------- */

// Column caps from schema_v2.sql. SQL `length()` counts code points and `.max()`
// counts UTF-16 units, so the contract is never looser than the database.
export const FIELD_MAX_CHARS = {
  raw_text: 4000,
  child_name: 80,
  child_name_latin: 80,
  clothing: 300,
  marks: 300,
  circumstances: 500,
  place_text: 200,
  thana: 80,
  reporter_relation: 40,
  gd_number: 40,
  outcome_note: 500,
  agency_name: 120,
  reason: 500,
  reason_bn: 200,
  reason_en: 200,
  text_bn: 3000,
  display_name: 80,
} as const;

export const HEIGHT_CM = { min: 40, max: 220 } as const;
export const AGE = { exactMax: 17, missingMax: 17, estimateMax: 25 } as const;

export const LIMITS = {
  textChars: { min: 20, max: 2000 },
  audioSeconds: { min: 5, max: 120 },
  audioMaxBytes: 2 * 1024 * 1024, // "≤2 MB"; MiB reading is an open decision
  jsonBodyBytes: 64 * 1024, // routes reject larger JSON bodies before parsing
  aiCallsPerDraft: 6,
  followUpRounds: 4,
  pageSize: { min: 1, max: 50 },
  importBatch: { min: 1, max: 50 },
  reasonChars: { min: 3, max: 500 },
  quoteChars: 500,
  sourceUrlChars: 500,
  helplineWords: 80,
  candidatesPerQueueItem: 5,
} as const;

/* ---------- Text ---------- */

// Raw input is capped at 2× the post-trim maximum before trimming, so a huge
// whitespace-padded value is rejected without further work.
const preTrimCap = (max: number) => max * 2;

// Required text: trimmed, then length-checked.
export function trimmedText(min: number, max: number) {
  return z.string().max(preTrimCap(max)).trim().min(min).max(max);
}

// Optional reviewed text: trimmed; blank becomes null ("unknown stays unknown").
export function optionalText(max: number) {
  return z
    .string()
    .max(preTrimCap(max))
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable();
}

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

export function toAsciiDigits(value: string): string {
  return value.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
}

export function toBanglaDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

// Format check only, not ownership verification (BR-016).
export function normalisePhone(value: string): string {
  return toAsciiDigits(value).replace(/[\s().-]/g, "");
}

export const phoneSchema = z
  .string()
  .max(32)
  .transform(normalisePhone)
  .pipe(z.string().regex(PHONE_PATTERN, "phone must be 11 digits starting 01"));

export function maskPhone(phone: string): string {
  return `${phone.slice(0, 3)}••••••${phone.slice(-2)}`;
}
export const MASKED_PHONE_PATTERN = /^01[0-9]••••••[0-9]{2}$/;

const PHONE_LIKE = /(?:01|০১)[0-9০-৯]{9}/;
const LONG_DIGIT_RUN = /[0-9০-৯]{5,}/;

// users.display_name is 2–80 in SQL. Tightened so a name can never carry a phone or
// long number into session, admin-user or audit views. Seed accounts must comply.
export const displayNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(FIELD_MAX_CHARS.display_name)
  .refine((v) => !PHONE_LIKE.test(v) && !LONG_DIGIT_RUN.test(v), "display name must not carry a number");

export const reasonSchema = trimmedText(LIMITS.reasonChars.min, LIMITS.reasonChars.max);

/* ---------- URLs, cursors and query integers ---------- */

// Synthetic fixture URLs only: https, no credentials, host example.invalid or a subdomain.
export const syntheticSourceUrlSchema = z
  .string()
  .max(LIMITS.sourceUrlChars)
  .refine((u) => {
    if (!URL.canParse(u)) return false;
    const url = new URL(u);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      (host === "example.invalid" || host.endsWith(".example.invalid"))
    );
  }, "source_url must be an https example.invalid URL");

// Opaque server-signed cursor: base64url payload, optional "." + base64url signature.
// The server verifies the signature; the contract only bounds the charset and size.
export const cursorSchema = z.string().regex(/^[A-Za-z0-9_-]{8,400}(\.[A-Za-z0-9_-]{16,100})?$/);

// Query-string integers: plain decimal digits only ("0x1A", "1e1", " 5 ", "5.0" fail).
export const queryIntSchema = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,8})$/, "expected a plain integer")
  .transform(Number);

export const pageLimitSchema = queryIntSchema.pipe(z.int().min(LIMITS.pageSize.min).max(LIMITS.pageSize.max));
export const districtQuerySchema = queryIntSchema.pipe(districtCodeSchema);
