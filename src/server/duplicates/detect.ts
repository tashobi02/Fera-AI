// COMP-013 duplicate detector (TASK-018; BR-021, FR-022, TC-013, TC-038).
//
// DETECTION ONLY. A link is a flag for a verified officer to look at. This module never merges,
// hides, suppresses, confirms or changes the status of a report: both reports stay independently
// visible, and it writes nothing but a `duplicate_links` row with status 'flagged'. Confirming or
// dismissing a link is a human, audited act (FR-023, TASK-051), not done here.
//
// A SHARED PHONE IS A WEAK CUE AND NOTHING MORE. It adds a few points to a score that already
// qualified on other evidence; it can never create a link, never decide, never confirm (the
// schema also forbids `same_phone` + `confirmed_same`). Siblings and shelters share phones.
//
// EVERYTHING NUMERIC BELOW IS UNCALIBRATED. A-014 (+-1 year, 72 h) is provisional; A-029 says there
// is no fixed raw-cosine identity threshold and one must be calibrated on identity-grouped DEV hard
// negatives and frozen before test (TASK-064 manifest + TASK-039). None of that has happened, so
// DUPLICATE_PARAMS are experimental starting values, chosen a priori and NOT fitted to the 200
// seeded records. Do not quote any accuracy from them as a result.
//
// FILE LAYOUT: this file is deliberately self-contained (type-only imports, erasable TypeScript
// only) so `scripts/dedupe.mjs` can load it with Node's built-in type stripping like reembed does.
// Section 1 is pure (no I/O, unit-tested); section 2 is SQL.
import type { Queryable } from "../db/queryable";

// ---------------------------------------------------------------------------------------------
// 1. PURE RULES
// ---------------------------------------------------------------------------------------------

export const DUPLICATE_PARAMS = {
  calibration: "UNCALIBRATED / EXPERIMENTAL: A-014 windows are provisional and A-029 cosine is not calibrated (dev split only; TASK-064, TASK-039).",
  ageToleranceYears: 1, // A-014 provisional
  eventWindowHours: 72, // A-014 provisional
  // Fire line for the embedding cosine cue. NOT an identity threshold (A-029). The TASK-004 spike
  // saw no-match top-1 cosine up to 0.96, so a high cosine is a cue worth a few points, never a
  // decider; 0.85 is a placeholder below the weakest true spike pair (0.90) on structured text.
  cosineCue: 0.85,
  tokenOverlap: { clothing: 0.6, marks: 0.6, place_text: 0.5 }, // Jaccard of words, uncalibrated
  weights: { name: 25, clothing: 20, marks: 15, place_text: 10, district: 10, embedding_cosine: 10, sex: 5, age_overlap: 5, phoneWeak: 5 },
  linkMinNonPhone: 45, // score WITHOUT the phone must reach this
  minIdentityCues: 2, // of name, clothing, marks, place_text (sex/age/district/cosine/phone are not enough)
} as const;

export type DuplicateCueCode =
  | "name" | "clothing" | "marks" | "place_text" | "district" | "embedding_cosine" | "sex" | "age_overlap" | "phone_shared_weak";
export type DuplicateCue = { cue: DuplicateCueCode; points: number };
export type RejectReason = "same_case" | "kind" | "not_live" | "sex_conflict" | "age_window" | "time_window";

export interface CaseProfile {
  id: string;
  refCode: string;
  kind: "missing" | "found";
  status: string;
  anonymised: boolean;
  sex: string | null;
  ageMin: number | null;
  ageMax: number | null;
  nameBn: string | null;
  nameLatin: string | null;
  clothing: string | null;
  marks: string | null;
  placeText: string | null;
  districtCode: number | null;
  // Event time as an interval. An exact time is lower = upper. Approximate times carry their
  // own lower/upper. Null on either bound means the time is unknown.
  eventLower: Date | null;
  eventUpper: Date | null;
  phone: string | null;
}

export interface PairAssessment {
  rejected: RejectReason | null;
  link: boolean;
  score: number; // 0..100, includes the weak phone points
  nonPhoneScore: number; // what decides
  evidence: DuplicateCue[];
  unknown: ("age" | "time")[];
}

// Terminal states lock report fields (cases_transition_guard); they are not "live". NOTE: this list
// duplicates the trigger's terminal states, as scripts/embeddings/reembed-lib.mjs does.
export const TERMINAL_STATUSES = ["confirmed", "closed", "referred"] as const;

const norm = (s: string | null): string => (s ?? "").normalize("NFC").toLowerCase().replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/g, " ").trim();
const words = (s: string | null): Set<string> => new Set(norm(s).split(" ").filter((w) => w !== ""));
function jaccard(a: string | null, b: string | null): number | null {
  const x = words(a);
  const y = words(b);
  if (x.size === 0 || y.size === 0) return null; // unknown stays unknown
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both);
}

function reject(reason: RejectReason): PairAssessment {
  return { rejected: reason, link: false, score: 0, nonPhoneScore: 0, evidence: [], unknown: [] };
}

// Age ranges (age_years is stored as min = max). Gap 0 = ranges overlap.
function ageGap(a: CaseProfile, b: CaseProfile): number | null {
  if (a.ageMin === null || a.ageMax === null || b.ageMin === null || b.ageMax === null) return null;
  return Math.max(0, Math.max(a.ageMin, b.ageMin) - Math.min(a.ageMax, b.ageMax));
}

// Event time as intervals: distance between nearest edges, 0 when they overlap. So an approximate
// "between 13:00 and 17:00" report and an exact 14:00 report are 0 h apart.
function timeGapHours(a: CaseProfile, b: CaseProfile): number | null {
  if (!a.eventLower || !a.eventUpper || !b.eventLower || !b.eventUpper) return null;
  const gapMs = Math.max(0, Math.max(a.eventLower.getTime(), b.eventLower.getTime()) - Math.min(a.eventUpper.getTime(), b.eventUpper.getTime()));
  return gapMs / 3_600_000;
}

export function assessPair(a: CaseProfile, b: CaseProfile, cosine: number | null): PairAssessment {
  const P = DUPLICATE_PARAMS;
  if (a.id === b.id) return reject("same_case");
  if (a.kind !== b.kind) return reject("kind");
  const live = (c: CaseProfile) => !c.anonymised && !(TERMINAL_STATUSES as readonly string[]).includes(c.status);
  if (!live(a) || !live(b)) return reject("not_live");
  const known = (s: string | null) => s !== null && s !== "unknown";
  if (known(a.sex) && known(b.sex) && a.sex !== b.sex) return reject("sex_conflict");

  const unknown: ("age" | "time")[] = [];
  const gap = ageGap(a, b);
  if (gap === null) unknown.push("age");
  else if (gap > P.ageToleranceYears) return reject("age_window");
  const hours = timeGapHours(a, b);
  if (hours === null) unknown.push("time");
  else if (hours > P.eventWindowHours) return reject("time_window");

  const evidence: DuplicateCue[] = [];
  const add = (cue: DuplicateCueCode, points: number) => evidence.push({ cue, points });
  let identityCues = 0;
  const identity = (cue: DuplicateCueCode, points: number) => { add(cue, points); identityCues++; };

  const sameName = (x: string | null, y: string | null) => norm(x) !== "" && norm(x) === norm(y);
  if (sameName(a.nameBn, b.nameBn) || sameName(a.nameLatin, b.nameLatin)) identity("name", P.weights.name);
  const j = (f: "clothing" | "marks") => jaccard(a[f], b[f]);
  const jc = j("clothing"); if (jc !== null && jc >= P.tokenOverlap.clothing) identity("clothing", P.weights.clothing);
  const jm = j("marks"); if (jm !== null && jm >= P.tokenOverlap.marks) identity("marks", P.weights.marks);
  const jp = jaccard(a.placeText, b.placeText); if (jp !== null && jp >= P.tokenOverlap.place_text) identity("place_text", P.weights.place_text);
  // Supporting cue only: it adds points but does NOT count as an identity cue. First smoke with the
  // real model (docs/execution/evidence/duplicates.md): e5 cosines of same-kind reports sit in a
  // narrow high band, so cosine >= 0.85 fired for almost every pair and let "clothing + cosine"
  // link different children. An uncalibrated signal (A-029) must not supply a deciding vote.
  if (cosine !== null && cosine >= P.cosineCue) add("embedding_cosine", P.weights.embedding_cosine);

  if (a.districtCode !== null && a.districtCode === b.districtCode) add("district", P.weights.district);
  if (known(a.sex) && a.sex === b.sex) add("sex", P.weights.sex);
  if (gap === 0) add("age_overlap", P.weights.age_overlap);

  const nonPhoneScore = evidence.reduce((n, e) => n + e.points, 0);
  const link = nonPhoneScore >= P.linkMinNonPhone && identityCues >= P.minIdentityCues;

  // The phone is added last and is never consulted by `link`.
  if (a.phone !== null && a.phone === b.phone) add("phone_shared_weak", P.weights.phoneWeak);
  const score = Math.min(100, evidence.reduce((n, e) => n + e.points, 0));
  return { rejected: null, link, score, nonPhoneScore: Math.min(100, nonPhoneScore), evidence, unknown };
}

// ---------------------------------------------------------------------------------------------
// 2. SQL (reads cases, writes duplicate_links; nothing else)
// ---------------------------------------------------------------------------------------------

export interface DuplicateLink {
  id: string;
  caseA: string; // case_a < case_b, as the schema requires
  caseB: string;
  refCodeA: string;
  refCodeB: string;
  score: number;
  rule: "profile"; // 'same_phone' is never written: a phone-only match is not a link
  status: "flagged" | "confirmed_same" | "dismissed";
  evidence: DuplicateCue[]; // recomputed from the current reports; the table has no evidence column
  created: boolean; // true only when this call inserted the row
}

const PROFILE_COLUMNS = `c.id, c.ref_code, c.kind, c.status, (c.anonymised_at IS NOT NULL) AS anonymised, c.sex::text AS sex,
  c.age_min, c.age_max, c.child_name, c.child_name_latin, c.clothing, c.marks, c.place_text, c.district_code,
  COALESCE(c.event_at_lower, c.event_at) AS event_lower, COALESCE(c.event_at_upper, c.event_at) AS event_upper, c.contact_phone`;

// Same-kind, non-redacted, live cases other than the anchor, with the cosine to the anchor when both
// carry a vector from the same space. The age/time/sex windows are applied in assessPair (one place).
const CANDIDATES_SQL = `
  SELECT ${PROFILE_COLUMNS},
         CASE WHEN a.embedding IS NOT NULL AND c.embedding IS NOT NULL AND a.embedding_space = c.embedding_space
              THEN 1 - (a.embedding <=> c.embedding) END AS cosine
    FROM cases a JOIN cases c ON c.kind = a.kind AND c.id <> a.id
   WHERE a.id = $1 AND c.anonymised_at IS NULL AND c.status <> ALL($2::case_status[])
   ORDER BY c.id`;
const ANCHOR_SQL = `SELECT ${PROFILE_COLUMNS} FROM cases c WHERE c.id = $1`;

const INSERT_SQL = `
  INSERT INTO duplicate_links (case_a, case_b, score, rule, status) VALUES ($1, $2, $3, 'profile', 'flagged')
  ON CONFLICT (case_a, case_b) DO NOTHING RETURNING id`;
const EXISTING_SQL = `SELECT id, score::float8 AS score, rule, status FROM duplicate_links WHERE case_a = $1 AND case_b = $2`;

const LIST_SQL = `
  SELECT l.id, l.case_a, l.case_b, a.ref_code AS ref_a, b.ref_code AS ref_b, l.score::float8 AS score, l.rule, l.status
    FROM duplicate_links l JOIN cases a ON a.id = l.case_a JOIN cases b ON b.id = l.case_b
   WHERE l.case_a = $1 OR l.case_b = $1 ORDER BY l.created_at, l.id`;

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : typeof v === "string" && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const date = (v: unknown): Date | null => (v instanceof Date ? v : null);

function toProfile(r: Row): CaseProfile {
  return {
    id: String(r.id),
    refCode: String(r.ref_code),
    kind: r.kind === "found" ? "found" : "missing",
    status: String(r.status),
    anonymised: r.anonymised === true,
    sex: str(r.sex),
    ageMin: num(r.age_min),
    ageMax: num(r.age_max),
    nameBn: str(r.child_name),
    nameLatin: str(r.child_name_latin),
    clothing: str(r.clothing),
    marks: str(r.marks),
    placeText: str(r.place_text),
    districtCode: num(r.district_code),
    eventLower: date(r.event_lower),
    eventUpper: date(r.event_upper),
    phone: str(r.contact_phone),
  };
}

// Finds same-kind live reports that may be the same child as `caseId` and records a 'flagged' link
// for each pair that clears the (UNCALIBRATED) rules on non-phone evidence. Idempotent: an existing
// row is returned as is (a resolved link is never reopened or rewritten). A redacted, terminal or
// unknown anchor yields []. Does not touch `cases`. Audit: none, because the audit allowlist
// (src/server/audit/actions.ts) has no duplicate action and this task may not edit it; a
// `duplicate.flagged` code is an OPEN DECISION (docs/execution/evidence/duplicates.md).
export async function detectDuplicates(client: Queryable, caseId: string): Promise<DuplicateLink[]> {
  const anchorRow = (await client.query(ANCHOR_SQL, [caseId])).rows[0] as Row | undefined;
  if (!anchorRow) return [];
  const anchor = toProfile(anchorRow);
  const live = !anchor.anonymised && !(TERMINAL_STATUSES as readonly string[]).includes(anchor.status);
  if (!live) return [];

  const { rows } = await client.query(CANDIDATES_SQL, [caseId, [...TERMINAL_STATUSES]]);
  const out: DuplicateLink[] = [];
  for (const raw of rows as Row[]) {
    const other = toProfile(raw);
    const res = assessPair(anchor, other, num(raw.cosine));
    if (!res.link) continue;
    const [a, b] = anchor.id < other.id ? [anchor, other] : [other, anchor];
    const inserted = (await client.query(INSERT_SQL, [a.id, b.id, res.score])).rows[0] as Row | undefined;
    let id = inserted ? String(inserted.id) : null;
    let score = res.score;
    let status: DuplicateLink["status"] = "flagged";
    if (!inserted) {
      const existing = (await client.query(EXISTING_SQL, [a.id, b.id])).rows[0] as Row | undefined;
      if (!existing) continue; // vanished between statements; the next run decides
      id = String(existing.id);
      score = num(existing.score) ?? score;
      status = existing.status === "confirmed_same" || existing.status === "dismissed" ? existing.status : "flagged";
    }
    out.push({ id: id as string, caseA: a.id, caseB: b.id, refCodeA: a.refCode, refCodeB: b.refCode, score, rule: "profile", status, evidence: res.evidence, created: inserted !== undefined });
  }
  return out;
}

// Stored links that involve a case (no evidence: the table has none), for the banner.
export async function listLinksFor(client: Queryable, caseId: string): Promise<Omit<DuplicateLink, "evidence" | "created">[]> {
  const { rows } = await client.query(LIST_SQL, [caseId]);
  return (rows as Row[]).map((r) => ({
    id: String(r.id), caseA: String(r.case_a), caseB: String(r.case_b), refCodeA: String(r.ref_a), refCodeB: String(r.ref_b),
    score: num(r.score) ?? 0, rule: "profile" as const,
    status: r.status === "confirmed_same" || r.status === "dismissed" ? r.status : "flagged",
  }));
}
