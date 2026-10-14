// Shared scalar validators and limits (D2A §5.1/§7, D1 BR-016/023).
import { z } from "zod";

export const uuidSchema = z.uuid();
// ISO 8601 with an explicit offset; Fera serialises Asia/Dhaka as +06:00.
export const isoDateTimeSchema = z.iso.datetime({ offset: true });
export const sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/);
// Patterns copied from the cases CHECKs in schema_v2.sql.
export const REF_CODE_PATTERN = /^[MF]-[0-9A-Z]{6}$/;
export const PHONE_PATTERN = /^01[0-9]{9}$/;
export const refCodeSchema = z.string().regex(REF_CODE_PATTERN);
export const versionSchema = z.int().min(1);
export const districtCodeSchema = z.int().min(1).max(64);

// Opaque signed draft/principal/expiry binding. Clients never read it and its
// embedded counters are not authoritative (D2A §9.4).
export const draftTokenSchema = z.string().min(16).max(2048).regex(/^[A-Za-z0-9._~-]+$/);

export const LIMITS = {
  textChars: { min: 20, max: 2000 },
  audioSeconds: { min: 5, max: 120 },
  audioMaxBytes: 2 * 1024 * 1024, // "≤2 MB"; MiB reading is an open decision
  aiCallsPerDraft: 6,
  followUpRounds: 4,
  pageSize: { min: 1, max: 50 },
  importBatch: { min: 1, max: 50 },
  reasonChars: { min: 3, max: 500 },
  helplineWords: 80,
  candidatesPerQueueItem: 5,
} as const;

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

export const reasonSchema = z.string().trim().min(LIMITS.reasonChars.min).max(LIMITS.reasonChars.max);

export const pageLimitSchema = z.coerce.number().int().min(LIMITS.pageSize.min).max(LIMITS.pageSize.max);
export const cursorSchema = z.string().min(1).max(512);
