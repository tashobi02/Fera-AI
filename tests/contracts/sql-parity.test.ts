import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACTOR_TYPES,
  AGE,
  AUDIT_ACTIONS,
  AUDIT_ACTION_PATTERN,
  CANDIDATE_STATUSES,
  CASE_KINDS,
  CASE_SOURCES,
  CASE_STATUSES,
  DECISION_TYPES,
  DUPLICATE_RULES,
  DUPLICATE_STATUSES,
  EDIT_LOCKED_STATUSES,
  FIELD_MAX_CHARS,
  FOUND_STATUSES,
  FOUND_TRANSITIONS,
  HEIGHT_CM,
  INITIAL_STATUS,
  LIMITS,
  MATCHING_STATES,
  MISSING_STATUSES,
  MISSING_TRANSITIONS,
  OUTCOMES,
  OUTPUT_TYPES,
  PHONE_PATTERN,
  REDACTABLE_STATUSES,
  REF_CODE_PATTERN,
  SEXES,
  SHA256_HEX_PATTERN,
  USERNAME_PATTERN,
  USER_ROLES,
  caseDraftSchema,
  isLegalTransition,
  refCodeSchema,
} from "@/contracts";
import { intakeDraftMetadataSchema } from "@/contracts/server";
import { exampleMissingDraft } from "@/contracts/examples";

// The SQL companion is the source of truth for enums and CHECKs; it is read, never
// edited. Trigger functions referenced: enforce_case_transition(), check_pair_integrity()
// (via the *_integrity constraint triggers) and redact_case(). Every check runs on whitespace-collapsed SQL, so reformatting the file
// cannot break a test while a changed constraint still does.
const root = join(import.meta.dirname, "..", "..");
const raw = readFileSync(join(root, "docs", "code", "schema_v2.sql"), "utf8");
const sql = raw.replace(/--[^\n]*/g, "").replace(/\s+/g, " ");
const has = (fragment: string) => sql.includes(fragment.replace(/\s+/g, " "));
const quoted = (list: string) => [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);
const match = (re: RegExp) => {
  const m = sql.match(re);
  if (!m) throw new Error(`SQL fragment not found: ${re}`);
  return m;
};
const table = (name: string) => match(new RegExp(`CREATE TABLE ${name} \\((.*?)\\);`))[1];

describe("state enums equal schema_v2.sql", () => {
  const sqlEnums = Object.fromEntries([...sql.matchAll(/CREATE TYPE (\w+) AS ENUM \(([^)]*)\)/g)].map((m) => [m[1], quoted(m[2])]));
  const ours: Record<string, readonly string[]> = {
    case_kind: CASE_KINDS,
    case_status: CASE_STATUSES,
    sex_t: SEXES,
    source_t: CASE_SOURCES,
    user_role: USER_ROLES,
    candidate_status: CANDIDATE_STATUSES,
    decision_t: DECISION_TYPES,
    outcome_t: OUTCOMES,
    duplicate_status: DUPLICATE_STATUSES,
    matching_state_t: MATCHING_STATES,
    output_t: OUTPUT_TYPES,
    actor_t: ACTOR_TYPES,
  };

  it("the set of SQL enums is exactly the set the contracts mirror", () => {
    expect(Object.keys(sqlEnums).sort()).toEqual(Object.keys(ours).sort());
  });

  it.each(Object.keys(ours).map((k) => [k] as const))("%s", (name) => {
    expect([...ours[name]]).toEqual(sqlEnums[name]);
  });

  it("duplicate rules equal the rule CHECK", () => {
    expect([...DUPLICATE_RULES]).toEqual(quoted(match(/rule text NOT NULL CHECK \(rule IN \(([^)]*)\)\)/)[1]));
  });

  it("missing and found status subsets follow the kind CHECKs", () => {
    const notFound = quoted(match(/CHECK \(kind = 'missing' OR status NOT IN \(([^)]*)\)\)/)[1]);
    const notMissing = quoted(match(/CHECK \(kind = 'found' OR status <> ('[^']+')\)/)[1]);
    expect([...FOUND_STATUSES]).toEqual(CASE_STATUSES.filter((s) => !notFound.includes(s)));
    expect([...MISSING_STATUSES]).toEqual(CASE_STATUSES.filter((s) => !notMissing.includes(s)));
    expect(has("CHECK ((ref_code LIKE 'M-%') = (kind = 'missing'))")).toBe(true);
  });
});

describe("lifecycle constants equal enforce_case_transition() and the redaction rules", () => {
  const steps = (kind: string) => quoted(match(new RegExp(`OLD\\.kind = '${kind}' AND step = ANY \\(ARRAY\\[(.*?)\\]\\)`))[1]);

  it("missing (BR-012) and found (BR-013) transitions", () => {
    expect(MISSING_TRANSITIONS.map(([a, b]) => `${a}>${b}`)).toEqual(steps("missing"));
    expect(FOUND_TRANSITIONS.map(([a, b]) => `${a}>${b}`)).toEqual(steps("found"));
  });

  it("rejects backward and skipped steps (TC-032)", () => {
    expect(isLegalTransition("missing", "closed", "open")).toBe(false);
    expect(isLegalTransition("missing", "open", "confirmed")).toBe(false);
    expect(isLegalTransition("found", "open", "referred")).toBe(false);
    expect(isLegalTransition("found", "matched_pending_review", "referred")).toBe(true);
  });

  it("initial statuses", () => {
    const m = match(/\(NEW\.kind = 'missing' AND NEW\.status <> '(\w+)'\) OR \(NEW\.kind = 'found' AND NEW\.status <> '(\w+)'\)/);
    expect(INITIAL_STATUS).toEqual({ missing: m[1], found: m[2] });
  });

  it("edit-locked statuses", () => {
    expect([...EDIT_LOCKED_STATUSES]).toEqual(quoted(match(/IF OLD\.status IN \(([^)]*)\) AND NEW\.anonymised_at IS NULL AND \(to_jsonb\(NEW\) - ARRAY/)[1]));
  });

  it("redactable statuses (cases CHECK and redaction function)", () => {
    expect([...REDACTABLE_STATUSES]).toEqual(quoted(match(/CHECK \(anonymised_at IS NULL OR status IN \(([^)]*)\)\)/)[1]));
    expect([...REDACTABLE_STATUSES]).toEqual(quoted(match(/rec\.status NOT IN \(([^)]*)\)/)[1]));
  });

  it("trigger-required audit actions", () => {
    expect(has("a.action=('match.' || d.decision::text)")).toBe(true);
    expect(DECISION_TYPES.map((d) => `match.${d}`)).toEqual([AUDIT_ACTIONS.matchConfirm, AUDIT_ACTIONS.matchReject]);
    expect(has(`'${AUDIT_ACTIONS.payloadRedacted}'`)).toBe(true);
    const d2b = readFileSync(join(root, "docs", "spec", "D2_TRD_PartB_V2.md"), "utf8");
    expect(d2b).toContain(`\`${AUDIT_ACTIONS.accessDenied}\``);
    for (const action of Object.values(AUDIT_ACTIONS)) expect(action).toMatch(AUDIT_ACTION_PATTERN);
  });
});

describe("patterns equal the SQL CHECK regexes", () => {
  it.each([
    ["ref_code", REF_CODE_PATTERN],
    ["contact_phone", PHONE_PATTERN],
    ["username", USERNAME_PATTERN],
    ["action", AUDIT_ACTION_PATTERN],
  ] as const)("%s", (column, pattern) => {
    expect(match(new RegExp(`${column} ~ '([^']+)'`))[1]).toBe(pattern.source);
  });

  it("every SHA-256 column uses the contract pattern", () => {
    const hashes = [...sql.matchAll(/(\w*hash) ~ '([^']+)'/g)];
    expect(hashes.map((m) => m[1]).sort()).toEqual(["input_hash", "payload_hash", "submission_payload_hash"]);
    for (const m of hashes) expect(m[2]).toBe(SHA256_HEX_PATTERN.source);
  });

  it("ref codes parse", () => {
    expect(refCodeSchema.safeParse("M-7K2Q9A").success).toBe(true);
    expect(refCodeSchema.safeParse("X-7K2Q9A").success).toBe(false);
  });
});

describe("field bounds equal the SQL CHECKs", () => {
  // Capped columns the contracts never accept or serve (internal-only text).
  const UNMAPPED_CAPPED_COLUMNS = ["note"]; // referrals.note: no API carries it

  it("every SQL-capped text column is a FIELD_MAX_CHARS key (or explicitly unmapped) with the same cap", () => {
    const caps = new Map<string, Set<number>>();
    for (const m of sql.matchAll(/(\w+) text (?:NOT NULL )?(?:DEFAULT '[^']*' )?CHECK \(length\(\1\) <= (\d+)\)/g)) {
      caps.set(m[1], (caps.get(m[1]) ?? new Set()).add(Number(m[2])));
    }
    const ours: Record<string, number> = FIELD_MAX_CHARS;
    expect(caps.size).toBeGreaterThanOrEqual(15);
    for (const [column, values] of caps) {
      if (UNMAPPED_CAPPED_COLUMNS.includes(column)) continue;
      expect(column in ours, `${column} has no FIELD_MAX_CHARS entry`).toBe(true);
      expect([...values]).toEqual([ours[column]]);
    }
    expect(has(`display_name text NOT NULL CHECK (length(display_name) BETWEEN 2 AND ${FIELD_MAX_CHARS.display_name})`)).toBe(true);
  });

  it("ages, height, district, coordinates, score and rank", () => {
    expect(has(`age_years smallint CHECK (age_years BETWEEN 0 AND ${AGE.exactMax})`)).toBe(true);
    expect(has(`age_min smallint CHECK (age_min BETWEEN 0 AND ${AGE.estimateMax})`)).toBe(true);
    expect(has(`age_max smallint CHECK (age_max BETWEEN 0 AND ${AGE.estimateMax})`)).toBe(true);
    expect(has(`CHECK (kind = 'found' OR age_min IS NULL OR age_min <= ${AGE.missingMax})`)).toBe(true);
    expect(has(`CHECK (kind = 'found' OR age_max IS NULL OR age_max <= ${AGE.missingMax})`)).toBe(true);
    expect(has(`height_cm smallint CHECK (height_cm BETWEEN ${HEIGHT_CM.min} AND ${HEIGHT_CM.max})`)).toBe(true);
    expect(has("code smallint PRIMARY KEY CHECK (code BETWEEN 1 AND 64)")).toBe(true);
    expect(has("CHECK (lat BETWEEN 20 AND 27)")).toBe(true);
    expect(has("CHECK (lng BETWEEN 88 AND 93)")).toBe(true);
    expect(has(`rank smallint NOT NULL CHECK (rank BETWEEN 1 AND ${LIMITS.candidatesPerQueueItem})`)).toBe(true);
    expect(has("score numeric(5,2) NOT NULL CHECK (score BETWEEN 0 AND 100)")).toBe(true);
    expect(has(`ai_calls_used BETWEEN 0 AND ${LIMITS.aiCallsPerDraft}`)).toBe(true);
  });

  it("age schemas agree with those bounds", () => {
    const child = (patch: object) => caseDraftSchema.safeParse({ ...exampleMissingDraft, child: { ...exampleMissingDraft.child, ...patch } });
    expect(child({ age_years: 18 }).success).toBe(false);
    expect(child({ age_years: null, age_min: 20, age_max: 25 }).success).toBe(true);
    expect(child({ age_years: null, age_min: 20, age_max: 26 }).success).toBe(false);
    expect(child({ height_cm: 39 }).success).toBe(false);
    expect(child({ height_cm: 221 }).success).toBe(false);
  });

  it("interval, exact-time and found-description CHECKs that the submission rules mirror", () => {
    expect(has("CHECK (event_at_lower IS NULL OR event_at_upper IS NULL OR event_at_lower <= event_at_upper)")).toBe(true);
    expect(has("CHECK (event_at IS NULL OR (event_at_lower IS NOT NULL AND event_at_upper IS NOT NULL AND event_at BETWEEN event_at_lower AND event_at_upper))")).toBe(true);
    expect(has("CHECK (event_at_approx OR event_at IS NULL OR (event_at = event_at_lower AND event_at = event_at_upper))")).toBe(true);
    expect(has("length(trim(concat_ws(' ', circumstances, clothing, marks))) >= 3")).toBe(true);
    // SQL only rejects a future lower bound; the contract also rejects a future time/upper bound (CN-12).
    expect(has("NEW.event_at_lower > clock_timestamp()")).toBe(true);
  });

  it("age, required-field and decision CHECKs the submission and decision rules mirror (18)", () => {
    expect(has("CHECK ((age_min IS NULL) = (age_max IS NULL))")).toBe(true);
    expect(has("CHECK (age_min IS NULL OR age_min <= age_max)")).toBe(true);
    expect(has("CHECK (age_years IS NULL OR (age_min IS NOT NULL AND age_min = age_years AND age_max = age_years))")).toBe(true);
    expect(has("CHECK (kind <> 'missing' OR anonymised_at IS NOT NULL OR age_min IS NOT NULL)")).toBe(true);
    expect(
      has(
        "CHECK (anonymised_at IS NOT NULL OR (event_at IS NOT NULL AND event_at_lower IS NOT NULL AND event_at_upper IS NOT NULL AND district_code IS NOT NULL AND contact_phone IS NOT NULL AND place_text IS NOT NULL AND length(place_text) >= 1))",
      ),
    ).toBe(true);
    const min = LIMITS.reasonChars.min;
    expect(has(`CHECK (decision = 'confirm' OR (reason IS NOT NULL AND length(reason) BETWEEN ${min} AND ${LIMITS.reasonChars.max}))`)).toBe(true);
    expect(has(`CHECK (status = 'flagged' OR (reason IS NOT NULL AND length(reason) >= ${min}))`)).toBe(true);
    expect(has("CHECK (rule <> 'same_phone' OR status <> 'confirmed_same')")).toBe(true);
    expect(has("CHECK (status <> 'closed' OR outcome IS NOT NULL)")).toBe(true);
    expect(has("CHECK ((status IN ('closed', 'referred')) = (closed_at IS NOT NULL))")).toBe(true);
  });

  it("identity CHECKs the contract mirrors", () => {
    expect(has("CHECK (role = 'officer' OR verified = false)")).toBe(true);
    const drafts = table("intake_drafts");
    expect(drafts).toContain("CHECK ((session_id IS NOT NULL) <> (user_id IS NOT NULL))");
    expect(drafts).toContain("CHECK (expires_at > created_at)");
  });
});

describe("TC-060 pre-submit server metadata holds no payload", () => {
  const columns = table("intake_drafts")
    .split(/,(?![^(]*\))/)
    .map((c) => c.trim())
    .filter((c) => !c.startsWith("CHECK"))
    .map((c) => c.split(" ")[0]);

  it("metadata schema keys are exactly the intake_drafts columns", () => {
    expect(columns.length).toBeGreaterThan(5);
    expect(new Set(Object.keys(intakeDraftMetadataSchema.shape))).toEqual(new Set(columns));
  });

  it("contains no transcript, reviewed field or child payload", () => {
    for (const key of columns) expect(key).not.toMatch(/text|transcript|child|name|phone|place|draft$|audio|evidence/);
  });
});

describe("runtime schema copy", () => {
  it.runIf(existsSync(join(root, "db", "schema_v2.sql")))("db/schema_v2.sql is byte-equal to docs/code/schema_v2.sql", () => {
    expect(readFileSync(join(root, "db", "schema_v2.sql")).equals(readFileSync(join(root, "docs", "code", "schema_v2.sql")))).toBe(true);
  });
});
