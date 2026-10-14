import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACTOR_TYPES,
  CANDIDATE_STATUSES,
  CASE_KINDS,
  CASE_SOURCES,
  CASE_STATUSES,
  DECISION_TYPES,
  DUPLICATE_RULES,
  DUPLICATE_STATUSES,
  FOUND_STATUSES,
  FOUND_TRANSITIONS,
  LIMITS,
  MATCHING_STATES,
  MISSING_STATUSES,
  MISSING_TRANSITIONS,
  OUTCOMES,
  OUTPUT_TYPES,
  PHONE_PATTERN,
  REF_CODE_PATTERN,
  SEXES,
  USER_ROLES,
  caseDraftSchema,
  intakeDraftMetadataSchema,
  isLegalTransition,
  refCodeSchema,
} from "@/contracts";
import { exampleMissingDraft } from "@/contracts/examples";

// The SQL companion is the source of truth for enums; it is read, never edited.
const sql = readFileSync(join(import.meta.dirname, "..", "..", "docs", "code", "schema_v2.sql"), "utf8");
const quoted = (list: string) => [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);

const sqlEnums = Object.fromEntries(
  [...sql.matchAll(/CREATE TYPE (\w+)\s+AS ENUM \(([^)]*)\)/g)].map((m) => [m[1], quoted(m[2])]),
);

describe("state enums equal schema_v2.sql", () => {
  it.each([
    ["case_kind", CASE_KINDS],
    ["case_status", CASE_STATUSES],
    ["sex_t", SEXES],
    ["source_t", CASE_SOURCES],
    ["user_role", USER_ROLES],
    ["candidate_status", CANDIDATE_STATUSES],
    ["decision_t", DECISION_TYPES],
    ["outcome_t", OUTCOMES],
    ["duplicate_status", DUPLICATE_STATUSES],
    ["matching_state_t", MATCHING_STATES],
    ["output_t", OUTPUT_TYPES],
    ["actor_t", ACTOR_TYPES],
  ] as const)("%s", (name, values) => {
    expect([...values]).toEqual(sqlEnums[name]);
  });

  it("covers every SQL enum", () => {
    expect(Object.keys(sqlEnums)).toHaveLength(12);
  });

  it("duplicate rules equal the rule CHECK", () => {
    expect([...DUPLICATE_RULES]).toEqual(quoted(sql.match(/rule\s+text NOT NULL CHECK \(rule IN \(([^)]*)\)\)/)![1]));
  });

  it("missing and found status subsets follow the kind CHECKs", () => {
    const notFound = quoted(sql.match(/CHECK \(kind = 'missing' OR status NOT IN \(([^)]*)\)\)/)![1]);
    const notMissing = quoted(sql.match(/CHECK \(kind = 'found' OR status <> ('[^']+')\)/)![1]);
    expect([...FOUND_STATUSES]).toEqual(CASE_STATUSES.filter((s) => !notFound.includes(s)));
    expect([...MISSING_STATUSES]).toEqual(CASE_STATUSES.filter((s) => !notMissing.includes(s)));
  });
});

describe("lifecycle transitions equal enforce_case_transition()", () => {
  const steps = (kind: string) =>
    quoted(sql.match(new RegExp(`OLD\\.kind = '${kind}' AND step = ANY \\(ARRAY\\[([\\s\\S]*?)\\]\\)`))![1]);

  it("missing (BR-012)", () => {
    expect(MISSING_TRANSITIONS.map(([a, b]) => `${a}>${b}`)).toEqual(steps("missing"));
  });

  it("found (BR-013)", () => {
    expect(FOUND_TRANSITIONS.map(([a, b]) => `${a}>${b}`)).toEqual(steps("found"));
  });

  it("rejects backward and skipped steps (TC-032)", () => {
    expect(isLegalTransition("missing", "closed", "open")).toBe(false);
    expect(isLegalTransition("missing", "open", "confirmed")).toBe(false);
    expect(isLegalTransition("found", "open", "referred")).toBe(false);
    expect(isLegalTransition("found", "matched_pending_review", "referred")).toBe(true);
  });
});

describe("field bounds equal the cases CHECKs", () => {
  it("ref_code and phone patterns", () => {
    expect(sql).toContain(`ref_code ~ '${REF_CODE_PATTERN.source}'`);
    expect(sql).toContain(`contact_phone ~ '${PHONE_PATTERN.source}'`);
    expect(refCodeSchema.safeParse("M-7K2Q9A").success).toBe(true);
    expect(refCodeSchema.safeParse("X-7K2Q9A").success).toBe(false);
    expect(sql).toContain("code        smallint PRIMARY KEY CHECK (code BETWEEN 1 AND 64)");
  });

  it("age bounds: exact age 0–17, estimated bounds 0–25", () => {
    expect(sql).toContain("age_years           smallint CHECK (age_years BETWEEN 0 AND 17)");
    expect(sql).toContain("age_max             smallint CHECK (age_max BETWEEN 0 AND 25)");
    const child = (patch: object) => caseDraftSchema.safeParse({ ...exampleMissingDraft, child: { ...exampleMissingDraft.child, ...patch } });
    expect(child({ age_years: 18 }).success).toBe(false);
    expect(child({ age_years: null, age_min: 20, age_max: 25 }).success).toBe(true);
    expect(child({ age_years: null, age_min: 20, age_max: 26 }).success).toBe(false);
  });

  it("per-draft paid-call limit", () => {
    expect(sql).toContain(`ai_calls_used BETWEEN 0 AND ${LIMITS.aiCallsPerDraft}`);
  });
});

describe("TC-060 pre-submit server metadata holds no payload", () => {
  const table = sql.match(/CREATE TABLE intake_drafts \(([\s\S]*?)\n\);/)![1];
  const columns = [...table.matchAll(/^\s+([a-z_]+)\s+(?:uuid|text|smallint|integer|timestamptz|case_kind)\b/gm)].map((m) => m[1]);

  it("metadata schema keys are exactly the intake_drafts columns", () => {
    expect(Object.keys(intakeDraftMetadataSchema.shape).sort()).toEqual(columns.sort());
  });

  it("contains no transcript, reviewed field or child payload", () => {
    for (const key of Object.keys(intakeDraftMetadataSchema.shape)) {
      expect(key).not.toMatch(/text|transcript|child|name|phone|place|draft$|audio|evidence/);
    }
  });
});
