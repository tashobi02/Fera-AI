// Error catalogue E-001–E-024: keys and HTTP from D2A §5.2, messages from D2B §13.
import { z } from "zod";
import { toBanglaDigits } from "./primitives";
import { draftFieldPathSchema, isDraftFieldPath, type DraftFieldPath } from "./states";

type CatalogueEntry = {
  key: string;
  http: number | null; // null = client-only state, never an HTTP response
  bn: string;
  en: string;
  retryable: boolean; // true only where D2B recovery retries the same action
  fallback?: "manual_form";
  placeholder?: true; // message not in D2B; open decision in contract-notes.md
};

export const ERROR_CATALOGUE = {
  "E-001": { key: "VALIDATION_FAILED", http: 400, retryable: false,
    bn: "কিছু তথ্য ঠিক নেই। চিহ্নিত ঘরগুলো দেখুন।", en: "Some details need fixing. Check the marked fields." },
  "E-002": { key: "UNAUTHENTICATED", http: 401, retryable: false,
    bn: "আবার সাইন ইন করুন।", en: "Please sign in again." },
  "E-003": { key: "FORBIDDEN_ACTION", http: 403, retryable: false,
    bn: "এই কাজের অনুমতি আপনার নেই।", en: "You don't have permission for this action." },
  "E-004": { key: "NOT_FOUND", http: 404, retryable: false,
    bn: "তথ্যটি পাওয়া যায়নি।", en: "We couldn't find that." },
  "E-005": { key: "ILLEGAL_TRANSITION", http: 409, retryable: false,
    bn: "কেসটির অবস্থা বদলে গেছে। পাতাটি আবার খুলুন।", en: "This case has changed. Reload the page." },
  "E-006": { key: "SUBMISSION_PAYLOAD_CONFLICT", http: 409, retryable: false,
    bn: "এই জমা নম্বরের তথ্য বদলেছে। তথ্য যাচাই করে আবার জমা দিন।",
    en: "This submission key has different details. Review before submitting again." },
  "E-007": { key: "RATE_LIMITED", http: 429, retryable: true,
    bn: "{s} সেকেন্ড পরে আবার চেষ্টা করুন।", en: "Please try again in {s} seconds." },
  "E-008": { key: "AUDIO_TOO_LARGE", http: 413, retryable: false,
    bn: "রেকর্ডিং অনেক বড়। ২ মিনিটের কম রেকর্ড করুন।", en: "The recording is too large. Keep it under 2 minutes." },
  "E-009": { key: "AUDIO_LENGTH_OUT_OF_RANGE", http: 422, retryable: false,
    bn: "রেকর্ডিং ৫ সেকেন্ড থেকে ২ মিনিটের মধ্যে হতে হবে।", en: "Recordings must be 5 seconds to 2 minutes." },
  "E-010": { key: "SPEECH_UNINTELLIGIBLE", http: 422, retryable: false,
    bn: "কথাগুলো পরিষ্কার শোনা যায়নি। আবার বলুন বা লিখে দিন।", en: "We couldn't hear that clearly. Try again or type instead." },
  "E-011": { key: "SPEECH_UNAVAILABLE", http: 503, retryable: false,
    bn: "এখন ভয়েস কাজ করছে না। লিখে জানান।", en: "Voice isn't working right now. Please type." },
  "E-012": { key: "LLM_INVALID_OUTPUT", http: 422, retryable: false, fallback: "manual_form",
    bn: "সহকারী তথ্য গুছাতে পারেনি। নিচের ফর্মটি পূরণ করুন — আপনার লেখা রাখা আছে।",
    en: "The assistant couldn't organise this. Please fill the form — your text is kept." },
  "E-013": { key: "LLM_UNAVAILABLE", http: 503, retryable: false, fallback: "manual_form",
    bn: "সহকারী এখন সাড়া দিচ্ছে না। ফর্মে তথ্য দিন।", en: "The assistant isn't responding. Please use the form." },
  "E-014": { key: "AI_TIMEOUT", http: 504, retryable: true, fallback: "manual_form",
    bn: "অনেক সময় লাগছে। আবার চেষ্টা করুন বা ফর্ম ব্যবহার করুন।", en: "This is taking too long. Try again or use the form." },
  "E-015": { key: "UNSUPPORTED_LANGUAGE", http: 422, retryable: false,
    bn: "বাংলা বা ইংরেজিতে বলুন বা লিখুন।", en: "Please speak or write in Bangla or English." },
  "E-016": { key: "OUTPUT_BLOCKED", http: 422, retryable: true,
    bn: "এই লেখাটি তৈরি করা যায়নি। আবার চেষ্টা করুন।", en: "We couldn't create this text. Please try again." },
  "E-017": { key: "REFERRAL_REQUIRED", http: 409, retryable: false,
    bn: "রেফারেল ছাড়া কেস বন্ধ করা যাবে না।", en: "A referral is needed before closing." },
  "E-018": { key: "EDIT_LOCKED", http: 409, retryable: false,
    bn: "মিল নিশ্চিত হওয়ার পর কেস বদলানো যায় না।", en: "This case can't be edited after a match is confirmed." },
  "E-019": { key: "SESSION_EXPIRED", http: 401, retryable: false,
    bn: "আপনার খসড়ার সময় শেষ। নতুন করে শুরু করুন।", en: "Your draft has expired. Please start again." },
  "E-020": { key: "OUTPUT_REQUEST_LIMIT_RESERVED", http: 429, retryable: false, placeholder: true,
    bn: "এখন নতুন লেখা তৈরি করা যাবে না। বর্তমান লেখাটি ব্যবহার করুন।",
    en: "A new text can't be created right now. Please use the current one." },
  "E-021": { key: "INTERNAL", http: 500, retryable: true,
    bn: "কিছু একটা ভুল হয়েছে। আবার চেষ্টা করুন।", en: "Something went wrong. Please try again." },
  "E-022": { key: "MIC_UNAVAILABLE", http: null, retryable: false,
    bn: "মাইক্রোফোন চালু করা যায়নি। আপনি লিখে জানাতে পারেন।", en: "The microphone isn't available. You can type instead." },
  "E-023": { key: "AI_BUDGET_CAP", http: 429, retryable: false, fallback: "manual_form",
    bn: "সহকারীর সীমা শেষ। বাকি তথ্য ফর্মে দিন।", en: "The assistant's limit is reached. Add the rest in the form." },
  "E-024": { key: "NETWORK_OFFLINE", http: null, retryable: true,
    bn: "ইন্টারনেট সংযোগ নেই। আপনার তথ্য রাখা আছে — সংযোগ ফিরলে আবার পাঠান।",
    en: "No internet connection. Your details are saved — send again when you're back online." },
} as const satisfies Record<string, CatalogueEntry>;

export type ErrorId = keyof typeof ERROR_CATALOGUE;
export type ClientOnlyErrorId = "E-022" | "E-024";
export type ServerErrorId = Exclude<ErrorId, ClientOnlyErrorId>;

export const ERROR_IDS = Object.keys(ERROR_CATALOGUE) as ErrorId[];
export const CLIENT_ONLY_ERROR_IDS: readonly ClientOnlyErrorId[] = ["E-022", "E-024"];

const noPlaceholder = (v: string) => !v.includes("{s}");

// E-001 may name the fields to highlight (D6 TC-030 "E-001 with 4 paths", D2B E-001
// "Zod issue paths; highlight fields"). Dotted draft paths only: no messages, no values.
export const MAX_ERROR_FIELDS = 32;
export const errorFieldsSchema = z.array(draftFieldPathSchema).min(1).max(MAX_ERROR_FIELDS);

export const errorEnvelopeSchema = z.strictObject({
  error: z
    .strictObject({
      id: z.enum(ERROR_IDS as [ErrorId, ...ErrorId[]]),
      key: z.string().min(1),
      message_bn: z.string().min(1).refine(noPlaceholder, "unfilled placeholder"),
      message_en: z.string().min(1).refine(noPlaceholder, "unfilled placeholder"),
      retryable: z.boolean(),
      fallback: z.literal("manual_form").optional(),
      fields: errorFieldsSchema.optional(),
    })
    .refine((e) => ERROR_CATALOGUE[e.id].key === e.key, { message: "key does not match id", path: ["key"] })
    .refine((e) => e.fields === undefined || e.id === "E-001", { message: "fields only on E-001", path: ["fields"] }),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

// Request bodies nest the draft (`draft.child.age_years`); the envelope names the draft field.
const REQUEST_PREFIXES = ["draft"];

// Maps Zod issue paths to known dotted draft paths, dropping anything unknown and
// never reading issue messages or input values. Returns undefined when none match.
export function fieldsFromZodIssues(issues: readonly { path: readonly PropertyKey[] }[]): DraftFieldPath[] | undefined {
  const out: DraftFieldPath[] = [];
  for (const issue of issues) {
    const segments = issue.path.map(String);
    const trimmed = REQUEST_PREFIXES.includes(segments[0]) ? segments.slice(1) : segments;
    const path = trimmed.join(".");
    if (isDraftFieldPath(path) && !out.includes(path)) out.push(path);
    if (out.length === MAX_ERROR_FIELDS) break;
  }
  return out.length > 0 ? out : undefined;
}

export type ErrorParams = { seconds?: number; fields?: readonly DraftFieldPath[] };

// Bilingual envelope. E-007 requires the retry delay in whole seconds (message_bn
// shows Bangla numerals); E-001 may carry `fields`. The general overload lets error
// mappers pass any ID; the E-007 rule is still enforced at runtime.
export function errorEnvelope(id: "E-007", params: { seconds: number }): ErrorEnvelope;
export function errorEnvelope(id: "E-001", params?: { fields?: readonly DraftFieldPath[] }): ErrorEnvelope;
export function errorEnvelope(id: ErrorId, params?: ErrorParams): ErrorEnvelope;
export function errorEnvelope(id: ErrorId, params: ErrorParams = {}): ErrorEnvelope {
  const entry: CatalogueEntry = ERROR_CATALOGUE[id];
  let fill = (text: string) => text;
  if (id === "E-007") {
    const seconds = params.seconds;
    if (seconds === undefined || !Number.isInteger(seconds) || seconds < 1) {
      throw new Error("E-007 needs a positive whole number of seconds");
    }
    fill = (text: string) => text.replace("{s}", text === entry.bn ? toBanglaDigits(seconds) : String(seconds));
  }
  if (params.fields !== undefined && id !== "E-001") throw new Error("fields are only allowed on E-001");
  const fields = params.fields && params.fields.length > 0 ? [...new Set(params.fields)].slice(0, MAX_ERROR_FIELDS) : undefined;
  return errorEnvelopeSchema.parse({
    error: {
      id,
      key: entry.key,
      message_bn: fill(entry.bn),
      message_en: fill(entry.en),
      retryable: entry.retryable,
      ...(entry.fallback ? { fallback: entry.fallback } : {}),
      ...(fields ? { fields } : {}),
    },
  });
}

export function httpStatusFor(id: ServerErrorId): number {
  return ERROR_CATALOGUE[id].http;
}
