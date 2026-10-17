// Typed [MOCK] IntakeClient until API-001/002 exist (TASK-014/020).
// BR-008: a complete message must consist only of supported, explicit clauses.
// Names use a finite synthetic vocabulary; conflicting claims stay unknown.
// Unsupported narrative/negation yields no new fields; unsupported continuations
// clear extracted facts and offer the form, preserving all original words.
// No place, district, clothing or time lookup; no invented speech (E-011).
// Source and evidence stay in the parent's original UTF-16 text.
import {
  FIELD_MAX_CHARS,
  LIMITS,
  caseDraftSchema,
  extractResponseSchema,
  toAsciiDigits,
  type CaseDraft,
  type DraftFieldPath,
  type EvidenceSpan,
  type ExtractRequestInput,
  type NextQuestion,
} from "@/contracts";
import { clientExamples } from "@/contracts/client-examples";
import { locales } from "@/locales";
import { failure, type IntakeClient } from "../client";
import { formatQuestion } from "../questions";

function wait(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(false);
    const abort = () => { clearTimeout(timer); resolve(false); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(true); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

const BLANK: CaseDraft = {
  kind: "missing",
  source_text: "",
  child: { name: null, name_latin: null, sex: "unknown", age_years: null, age_min: null, age_max: null, height_cm: null, clothing: null, marks: null },
  event: { at: null, at_approx: false, at_lower: null, at_upper: null, place_text: null, district_text: null, district_code: null, thana: null, circumstances: null },
  reporter: { relation: null, phone: null },
  evidence: {},
};

// Mandatory for a missing report (BR-015), in the order the fake asks.
const REQUIRED: DraftFieldPath[] = ["child.age_years", "event.district_code", "event.at", "reporter.phone", "event.place_text"];

// Age/district/time/phone: D3 COMP-009. Place is local copy pending human review.
// formatQuestion supplies a known name or the fallback.
const QUESTIONS: Partial<Record<DraftFieldPath, Omit<NextQuestion, "field">>> = {
  "child.age_years": { bn: locales.bn.questionAge, en: locales.en.questionAge },
  "event.district_code": { bn: locales.bn.questionDistrict, en: locales.en.questionDistrict },
  "event.at": { bn: locales.bn.questionAt, en: locales.en.questionAt },
  "reporter.phone": { bn: locales.bn.questionPhone, en: locales.en.questionPhone },
  "event.place_text": { bn: locales.bn.questionPlace, en: locales.en.questionPlace },
};

const span = (quote: string, start: number, derivation: EvidenceSpan["derivation"]): EvidenceSpan => ({
  quote,
  start_utf16: start,
  end_utf16: start + quote.length,
  derivation,
});

type Found = { child: Partial<CaseDraft["child"]>; reporter: Partial<CaseDraft["reporter"]>; evidence: Record<string, EvidenceSpan> };

// A deliberately finite synthetic vocabulary: arbitrary letter-only words can be
// narrative ("my daughter vanished"), so a stop-word denylist is not a safe name parser.
// Compare NFC only; keep the exact original text and UTF-16 evidence offsets.
const SYNTHETIC_NAMES = new Set([
  "নুসরাত", "নুসরাত জাহান", "মীম", "রফিক", "কোয়েল", "Mina", "Rafiq", "Mim",
].map((name) => name.normalize("NFC").toLowerCase()));
const NAME = String.raw`[\p{L}\p{M}]+(?:[ \t]+[\p{L}\p{M}]+)?`;
const YA = String.raw`(?:য়|য়)`;
const SEX_WORD = `ছেলে|মে${YA}ে|son|daughter|boy|girl`;
const FEMALE = new RegExp(`^(?:মে${YA}ে|daughter|girl|female)$`, "iu");
const AGE_WORD = `ব${YA}স|age`;
const AGED = `ব${YA}সী`;
const YEARS = String.raw`(?:বছর|years?)`;
const DIGITS = "[০-৯0-9]+";
const NUMBER = "[0০][1১][0-9০-৯]{9}";
// A label must be separated from its value. Zero-width characters are not separators.
const SEP = String.raw`(?:[ \t]*:[ \t]*|[ \t]+)`;
const phoneLabel = new RegExp(
  `^(?:my\\s+(?:phone\\s+|mobile\\s+)?(?:number|phone|mobile)|আমার\\s+(?:ফোন\\s+|মোবাইল\\s+)?(?:নম্বর|নাম্বার|ফোন|মোবাইল))${SEP}(?:(?:is|হলো|হল)\\s+)?(${NUMBER})$`,
  "iu",
);

type Claim = { group: "child" | "reporter"; key: string; value: string | number; evidence: EvidenceSpan };
const comparable = (value: string | number) => typeof value === "string" ? value.normalize("NFC").toLowerCase() : value;

// Strict mode reads a complete supported message, never a fact detached from its
// narrative/negation elsewhere. Non-strict mode is ONLY used to veto conflicting
// historical claims; it never supplies a value to a draft.
function claimsIn(text: string, offset: number, asked?: DraftFieldPath | null, strict = true): Claim[] | null {
  if (strict && /[?؟]/u.test(text)) return null; // a question is not an assertion
  const claims: Claim[] = [];
  const clauses = [...text.matchAll(/(?:\.(?!\s|$)|[^,।;!?\n.])+/gu)];
  for (const m of clauses) {
    const body = m[0].trim();
    if (!body) continue;
    const at = m.index + m[0].length - m[0].trimStart().length;
    const add = (group: Claim["group"], key: string, value: Claim["value"], quote: string, derivation: EvidenceSpan["derivation"] = "direct") => {
      claims.push({ group, key, value, evidence: span(quote, offset + at + body.lastIndexOf(quote), derivation) });
    };
    const isName = (name: string) => SYNTHETIC_NAMES.has(name.normalize("NFC").toLowerCase());
    const addName = (name: string) => add("child", /^[A-Za-z\s]+$/.test(name) ? "name_latin" : "name", name, name);
    const label = new RegExp(`^(?:নাম|name)${SEP}(${NAME})$`, "iu").exec(body);
    if (label && isName(label[1])) { addName(label[1]); continue; }
    const relation = new RegExp(`^(?:আমার|আমাদের|my|our)\\s+(${SEX_WORD})(?:\\s+(${NAME}))?$`, "iu").exec(body);
    if (relation && (!relation[2] || isName(relation[2]))) {
      add("child", "sex", FEMALE.test(relation[1]) ? "female" : "male", relation[1]);
      if (relation[2]) addName(relation[2]);
      continue;
    }
    const sex = new RegExp(`^(?:লিঙ্গ|sex)${SEP}(${SEX_WORD}|male|female)$`, "iu").exec(body);
    if (sex) { add("child", "sex", FEMALE.test(sex[1]) ? "female" : "male", sex[1]); continue; }
    const age = new RegExp(`^(?:(?:${AGE_WORD})${SEP}(${DIGITS})(?:\\s+${YEARS})?|(${DIGITS})\\s+${YEARS}(?:\\s+(?:${AGED}|old))?)$`, "iu").exec(body);
    if (age) {
      const isUnlabelled = age[2] !== undefined;
      const allowAge = !isUnlabelled || asked === undefined || asked === "child.age_years" || !strict;
      if (allowAge) {
        const digits = age[1] ?? age[2];
        const years = Number(toAsciiDigits(digits));
        if (years <= 17) {
          for (const key of ["age_years", "age_min", "age_max"]) add("child", key, years, digits);
          continue;
        }
      }
    }
    const labelled = phoneLabel.exec(body);
    const answeringPhone = asked === "reporter.phone" || !strict;
    const bare = answeringPhone ? new RegExp(`^${NUMBER}$`, "u").exec(body) : null;
    const phone = labelled?.[1] ?? bare?.[0];
    if (phone) { add("reporter", "phone", toAsciiDigits(phone), phone, "digits"); continue; }
    if (strict) return null; // unsupported clause: no guessed context, names or negations
  }
  return claims;
}

function resolveClaims(claims: Claim[], history: Claim[] = []): Found {
  const found: Found = { child: {}, reporter: {}, evidence: {} };
  for (const claim of claims) {
    // Never choose a winner between conflicting labels, including earlier turns.
    if ([...claims, ...history].some((other) => other.group === claim.group && other.key === claim.key && comparable(other.value) !== comparable(claim.value))) continue;
    Object.assign(found[claim.group], { [claim.key]: claim.value });
    found.evidence[`${claim.group}.${claim.key}`] = claim.evidence;
  }
  return found;
}

// Preserve the exported boolean phone-context seam used before round 4. Internal
// extraction passes the explicit field; null means a continuation with no question.
export function understand(text: string, offset: number, asked?: DraftFieldPath | boolean): Found {
  const field = typeof asked === "boolean" ? (asked ? "reporter.phone" : undefined) : asked;
  return resolveClaims(claimsIn(text, offset, field) ?? []);
}

function unknownIn(d: CaseDraft, path: string): boolean {
  const [group, key] = path.split(".") as ["child" | "event" | "reporter", string];
  const value = (d[group] as Record<string, unknown>)[key];
  return value === null || value === "unknown";
}

function combinedSource(body: ExtractRequestInput): string {
  return `${body.draft ? `${body.draft.source_text}\n` : ""}${(body.answer ?? body.text ?? "").trim()}`;
}

// Only these complete answers mean "leave the current question unknown". Any other
// unsupported continuation may retract earlier facts: drop extracted values and
// offer the manual form rather than attempting an open-ended correction parser.
const UNKNOWN_ANSWERS = new Set(["জানি না", "অজানা", "unknown", "i don't know", "i don’t know", "don't know", "do not know"]);

// `skipped`: questions already asked and left unanswered, so they are not asked again.
export function fakeExtract(body: ExtractRequestInput, aiCallsUsed: number, skipped: Set<DraftFieldPath> = new Set()) {
  const base = body.draft ? caseDraftSchema.parse(body.draft) : BLANK;
  const prefix = body.draft ? `${base.source_text}\n` : "";
  const source_text = combinedSource(body);
  // Undefined is reserved for the first message. An exhausted continuation must
  // not reopen the initial-message permission to infer unlabelled age.
  const asked = body.draft ? REQUIRED.find((f) => unknownIn(base, f) && !skipped.has(f)) ?? null : undefined;
  const input = source_text.slice(prefix.length);
  const current = claimsIn(input, prefix.length, asked);
  const unsupportedReply = Boolean(body.draft && current === null && !UNKNOWN_ANSWERS.has(input.normalize("NFC").toLowerCase()));
  const carry = unsupportedReply ? BLANK : base;
  const history = claimsIn(base.source_text, 0, undefined, false) ?? [];
  const found = resolveClaims(current ?? [], history);
  const draft: CaseDraft = {
    ...carry,
    source_text,
    child: { ...carry.child, ...found.child },
    reporter: { ...carry.reporter, ...found.reporter },
    evidence: { ...carry.evidence, ...found.evidence },
  };
  for (const claim of current ?? []) {
    const path = `${claim.group}.${claim.key}` as DraftFieldPath;
    const old = (base[claim.group] as Record<string, unknown>)[claim.key];
    const conflict = [...(current ?? []), ...history].some((other) => other.group === claim.group && other.key === claim.key && comparable(other.value) !== comparable(claim.value))
      || (old !== null && old !== "unknown" && old !== undefined && comparable(old as string | number) !== comparable(claim.value));
    if (conflict) {
      Object.assign(draft[claim.group], { [claim.key]: claim.key === "sex" ? "unknown" : null });
      delete draft.evidence[path];
    }
  }
  const missing_fields = REQUIRED.filter((f) => unknownIn(draft, f));
  if (asked && missing_fields.includes(asked)) skipped.add(asked); // answered, still unknown: move on
  const next = unsupportedReply ? undefined : missing_fields.find((f) => !skipped.has(f));
  const q = next ? QUESTIONS[next] : undefined;
  const childNameBn = draft.child.name ?? draft.child.name_latin;
  const childNameEn = draft.child.name_latin ?? draft.child.name;
  const next_question: NextQuestion | null = next && q ? {
    field: next,
    bn: formatQuestion(q.bn, childNameBn),
    en: formatQuestion(q.en, childNameEn),
  } : null;
  return extractResponseSchema.parse({
    ...clientExamples.extractResponse,
    draft_revision: (body.draft_revision ?? 0) + 1,
    draft,
    missing_fields,
    next_question,
    ai_calls_used: Math.min(LIMITS.aiCallsPerDraft, aiCallsUsed),
    cached: false,
    expires_at: new Date(Date.now() + (24 + 6) * 60 * 60 * 1000).toISOString().replace("Z", "+06:00"),
  });
}

export function createFakeIntakeClient({ delayMs = 900 }: { delayMs?: number } = {}): IntakeClient {
  let calls = 0;
  const skipped = new Set<DraftFieldPath>();
  return {
    mock: true,
    async transcribe(_input, signal) {
      if (!(await wait(delayMs, signal))) return failure("E-014");
      return failure("E-011");
    },
    async extract(body, signal) {
      if (!(await wait(delayMs, signal))) return failure("E-014");
      // Keep whole source/spans. Manual handoff preserves overflow; slicing could
      // cut a conjunct, emoji or evidence quote.
      if (combinedSource(body).length > FIELD_MAX_CHARS.raw_text) return failure("E-012");
      calls++;
      if (!body.draft) skipped.clear(); // a new report starts fresh
      return { ok: true, data: fakeExtract(body, calls, skipped) };
    },
  };
}
