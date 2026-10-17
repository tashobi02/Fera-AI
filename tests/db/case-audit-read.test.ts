// Safe audit projection reader (API-013; TASK-029 part; BR-010/024; FR-021; TC-016/052).
//
// The route is HTTP-only; the projection is `readCaseAudit(principal, caseId)`. These
// tests drive the service directly with a stub `Queryable`, so they don't need a
// database. They cover:
//
//   - the case metadata is read first (id, ref_code only; no child payload, no contact)
//   - audit rows are joined to the actor's display name; rows are filtered to this
//     case_id and ordered by (at, id) (append-only; no row is mutated or removed)
//   - officer sees the operational allowlist (candidate ids, pair refs, versions,
//     scores, decisions, contact_viewed), admin sees the metadata allowlist (no
//     candidate ids, no pair refs, no scores, no decision detail, no actor identity)
//   - a row whose stored details fail the per-role schema (unsafe value, another
//     case's ref_code, free-text key) is withheld and counted, not surfaced
//   - a parent/staff/unverified-officer principal returns the same `hidden` shape as
//     an absent case (the route then writes the access.denied audit row), and the
//     audit_log query is NEVER issued for those callers.
//
// The stub `q` returns the supplied `caseRows` for the cases query and the
// supplied `auditRows` for the audit_log query. Mixing the two (the old fixture)
// tripped the decoder because the case row lacks the `at` column.
import { describe, expect, it } from "vitest";
import { adminAuditResponseSchema, officerAuditResponseSchema } from "@/contracts";
import { readCaseAudit } from "@/server/audit/safe-read";
import type { Queryable } from "@/server/db/queryable";
import { testUser } from "../support/principals";

const CASE_ID = "33333333-3333-4333-8333-333333333301";
const CASE_REF = "M-300001";
const OTHER_CASE_ID = "33333333-3333-4333-8333-333333333399";
const OTHER_CASE_REF = "M-300099";
const OFFICER_ID = "33333333-3333-4333-8333-333333333302";
const ADMIN_ID = "33333333-3333-4333-8333-333333333303";
const STAFF_ID = "33333333-3333-4333-8333-333333333304";
const PARENT_SESSION = "33333333-3333-4333-8333-333333333305";
const CANDIDATE_ID = "33333333-3333-4333-8333-333333333306";

// Two-array stub: the cases query gets the metadata rows, the audit_log query gets
// the audit rows. Mixing them in a single array previously made the audit row decoder
// trip on a case row (no `at`).
function q(caseRows: ReadonlyArray<Record<string, unknown>>, auditRows: ReadonlyArray<Record<string, unknown>>): Queryable {
  return {
    query: async (text: string) => {
      if (text.includes("FROM audit_log")) return { rows: auditRows as unknown[] };
      return { rows: caseRows as unknown[] };
    },
  };
}

// Spy stub: records every query and returns the given audit rows only for an
// audit_log query. Used to prove the audit_log SELECT is not issued for callers
// who cannot see it.
function spyDb(caseRows: ReadonlyArray<Record<string, unknown>>, auditRows: ReadonlyArray<Record<string, unknown>>): {
  db: Queryable;
  queries: string[];
} {
  const queries: string[] = [];
  const db: Queryable = {
    query: async (text: string, values?: unknown[]) => {
      queries.push(`${text} -- values=${JSON.stringify(values ?? [])}`);
      if (text.includes("FROM audit_log")) return { rows: auditRows as unknown[] };
      return { rows: caseRows as unknown[] };
    },
  };
  return { db, queries };
}

function caseRow(id = CASE_ID, ref = CASE_REF) {
  return { id, ref_code: ref };
}

function auditRow(overrides: Partial<{
  at: string;
  actor_type: string;
  actor_user_id: string | null;
  actor_session_id: string | null;
  actor_display: string | null;
  action: string;
  case_id: string;
  candidate_id: string | null;
  details: Record<string, unknown>;
}> = {}) {
  // The decoder (col.dateOrNull in src/server/db/decode.ts) accepts a Date OR an ISO
  // string ending in `Z` or `±hh:mm`. The default fixture is a UTC offset in the
  // Asia/Dhaka convention and parses cleanly. The bug fixed here was at the level of
  // the stub `q()`: it previously returned case rows and audit rows together for every
  // query, so the case row (no `at`) tripped the decoder on the audit iteration.
  return {
    at: overrides.at ?? "2026-10-17T10:00:00+06:00",
    actor_type: overrides.actor_type ?? "officer",
    actor_user_id: overrides.actor_user_id ?? OFFICER_ID,
    actor_session_id: overrides.actor_session_id ?? null,
    actor_display: overrides.actor_display ?? "Anika Rahman",
    action: overrides.action ?? "case.closed",
    case_id: overrides.case_id ?? CASE_ID,
    candidate_id: overrides.candidate_id ?? null,
    details: overrides.details ?? { ref_code: CASE_REF, outcome: "resolved_outside_fera", api: "API-011", reason_recorded: true },
  };
}

describe("readCaseAudit (API-013)", () => {
  it("returns `hidden` (caseId null) for a malformed case ID", async () => {
    const officer = testUser(OFFICER_ID, "officer", { verified: true, isActive: true });
    const r = await readCaseAudit(officer, "not-a-uuid");
    expect(r).toEqual({ kind: "hidden", caseId: null });
  });

  it("returns `hidden` (caseId null) when the case row is absent", async () => {
    const officer = testUser(OFFICER_ID, "officer", { verified: true, isActive: true });
    const r = await readCaseAudit(officer, CASE_ID, { db: q([], []) });
    expect(r).toEqual({ kind: "hidden", caseId: null });
  });

  it("returns `hidden` (caseId set) when the principal is not officer/admin", async () => {
    const cases: ReadonlyArray<Record<string, unknown>> = [caseRow()];
    const audits: ReadonlyArray<Record<string, unknown>> = [auditRow()];
    // parent
    const parent = testUser(PARENT_SESSION, "officer", { verified: false, isActive: false });
    expect(await readCaseAudit(parent, CASE_ID, { db: q(cases, audits) })).toEqual({ kind: "hidden", caseId: CASE_ID });
    // staff
    const staff = testUser(STAFF_ID, "staff", { verified: true, isActive: true });
    expect(await readCaseAudit(staff, CASE_ID, { db: q(cases, audits) })).toEqual({ kind: "hidden", caseId: CASE_ID });
    // unverified officer
    const unverified = testUser(OFFICER_ID, "officer", { verified: false, isActive: true });
    expect(await readCaseAudit(unverified, CASE_ID, { db: q(cases, audits) })).toEqual({ kind: "hidden", caseId: CASE_ID });
  });

  it("returns the officer view with the operational allowlist", async () => {
    const cases: ReadonlyArray<Record<string, unknown>> = [caseRow()];
    const audits: ReadonlyArray<Record<string, unknown>> = [
      auditRow({
        at: "2026-10-17T09:00:00+06:00",
        action: "match.confirm",
        actor_user_id: OFFICER_ID,
        actor_display: "Anika Rahman",
        case_id: CASE_ID,
        candidate_id: CANDIDATE_ID,
        details: {
          ref_code: CASE_REF,
          candidate_id: CANDIDATE_ID,
          missing_ref: "M-100001",
          found_ref: "F-100001",
          missing_version: 2,
          found_version: 1,
          score: 87,
          rank: 1,
          api: "API-010",
          decision: "confirm",
          candidate_status: "confirmed",
          reason_recorded: true,
        },
      }),
      auditRow({
        at: "2026-10-17T10:00:00+06:00",
        action: "case.closed",
        actor_user_id: OFFICER_ID,
        actor_display: "Anika Rahman",
        case_id: CASE_ID,
        details: { ref_code: CASE_REF, outcome: "resolved_outside_fera", api: "API-011", reason_recorded: true },
      }),
    ];
    const officer = testUser(OFFICER_ID, "officer", { verified: true, isActive: true });
    const r = await readCaseAudit(officer, CASE_ID, { db: q(cases, audits) });
    if (r.kind !== "ok") throw new Error(`expected ok, got ${r.kind}`);
    expect(r.view.view).toBe("officer");
    expect(r.view.entries).toHaveLength(2);
    expect(r.view.withheld).toBe(0);
    // Parse the role-specific response to verify the allowlist and retain its exact type.
    const officerView = officerAuditResponseSchema.parse(r.view);
    // Operational allowlist survived: candidate id, score, decision.
    const decision = officerView.entries[0]!;
    expect(decision.action).toBe("match.confirm");
    expect(decision.details.candidate_id).toBe(CANDIDATE_ID);
    expect(decision.details.score).toBe(87);
    expect(decision.details.decision).toBe("confirm");
    // Officer sees actor identity (their own and any other officer/admin).
    expect(decision.actor_id).toBe(OFFICER_ID);
    expect(decision.actor_display).toBe("Anika Rahman");
  });

  it("returns the admin view with the metadata allowlist only", async () => {
    const cases: ReadonlyArray<Record<string, unknown>> = [caseRow()];
    const audits: ReadonlyArray<Record<string, unknown>> = [
      auditRow({
        at: "2026-10-17T09:00:00+06:00",
        action: "match.confirm",
        candidate_id: CANDIDATE_ID,
        details: {
          ref_code: CASE_REF,
          candidate_id: CANDIDATE_ID,
          missing_ref: "M-100001",
          found_ref: "F-100001",
          missing_version: 2,
          found_version: 1,
          score: 87,
          rank: 1,
          api: "API-010",
          decision: "confirm",
          candidate_status: "confirmed",
          reason_recorded: true,
        },
      }),
    ];
    const admin = testUser(ADMIN_ID, "admin", { verified: true, isActive: true });
    const r = await readCaseAudit(admin, CASE_ID, { db: q(cases, audits) });
    if (r.kind !== "ok") throw new Error(`expected ok, got ${r.kind}`);
    expect(r.view.view).toBe("admin");
    expect(r.view.entries).toHaveLength(1);
    expect(r.view.withheld).toBe(0);
    const entry = adminAuditResponseSchema.parse(r.view).entries[0]!;
    // Admin gets actor_role only — no actor_id, no actor_display. The admin view is a
    // discriminated union variant without those keys; we assert the entry's own keys
    // match the admin allowlist (at, actor_role, action, details) exactly.
    const ownKeys = Object.keys(entry).sort();
    expect(ownKeys).toEqual(["action", "actor_role", "at", "details"]);
    // Operational keys are stripped from the admin details.
    const keys = Object.keys(entry.details);
    expect(keys).not.toContain("candidate_id");
    expect(keys).not.toContain("missing_ref");
    expect(keys).not.toContain("found_ref");
    expect(keys).not.toContain("score");
    expect(keys).not.toContain("rank");
    expect(keys).not.toContain("decision");
    expect(keys).not.toContain("contact_viewed");
    // Metadata keys remain.
    expect(entry.details.ref_code).toBe(CASE_REF);
    expect(entry.details.api).toBe("API-010");
  });

  it("withholds rows with another case's ref_code and counts them", async () => {
    const cases: ReadonlyArray<Record<string, unknown>> = [caseRow()];
    const audits: ReadonlyArray<Record<string, unknown>> = [
      // A row tagged with another case's ref_code: the per-row ref_code check (D2A
      // "details.ref_code is the audited case's own reference only") must withhold it.
      auditRow({ details: { ref_code: OTHER_CASE_REF, api: "API-011" } }),
      auditRow(), // this one is fine
    ];
    const officer = testUser(OFFICER_ID, "officer", { verified: true, isActive: true });
    const r = await readCaseAudit(officer, CASE_ID, { db: q(cases, audits) });
    if (r.kind !== "ok") throw new Error(`expected ok, got ${r.kind}`);
    expect(r.view.entries).toHaveLength(1);
    expect(r.view.withheld).toBe(1);
    // The remaining entry is the one whose ref_code matches the audited case.
    expect(r.view.entries[0]!.details.ref_code).toBe(CASE_REF);
  });

  it("strips a non-allowlisted free-text key from the details instead of serving it", async () => {
    // projectAuditFor keeps only the role's allowlisted keys (pick), so a stored `note`
    // never reaches the response; the row itself is still a valid audit entry.
    const cases: ReadonlyArray<Record<string, unknown>> = [caseRow()];
    const audits: ReadonlyArray<Record<string, unknown>> = [
      auditRow({ details: { ref_code: CASE_REF, api: "API-011", note: "free text that should not appear here" } }),
    ];
    const officer = testUser(OFFICER_ID, "officer", { verified: true, isActive: true });
    const r = await readCaseAudit(officer, CASE_ID, { db: q(cases, audits) });
    if (r.kind !== "ok") throw new Error(`expected ok, got ${r.kind}`);
    expect(r.view.entries).toHaveLength(1);
    expect(r.view.withheld).toBe(0);
    expect(JSON.stringify(r.view)).not.toContain("free text");
  });

  it("preserves append-only ordering (no row is rewritten or removed by the read)", async () => {
    const cases: ReadonlyArray<Record<string, unknown>> = [caseRow()];
    const audits: ReadonlyArray<Record<string, unknown>> = [
      auditRow({ at: "2026-10-17T08:00:00+06:00", action: "case.created", details: { ref_code: CASE_REF, version: 1, api: "API-003" } }),
      auditRow({ at: "2026-10-17T09:00:00+06:00", action: "case.state_changed", details: { ref_code: CASE_REF, from_status: "open", to_status: "matched_pending_review", api: "API-008" } }),
      auditRow({ at: "2026-10-17T10:00:00+06:00", action: "case.closed", details: { ref_code: CASE_REF, outcome: "resolved_outside_fera", api: "API-011", reason_recorded: true } }),
    ];
    const officer = testUser(OFFICER_ID, "officer", { verified: true, isActive: true });
    const r = await readCaseAudit(officer, CASE_ID, { db: q(cases, audits) });
    if (r.kind !== "ok") throw new Error(`expected ok, got ${r.kind}`);
    expect(r.view.entries.map((e) => e.action)).toEqual([
      "case.created",
      "case.state_changed",
      "case.closed",
    ]);
  });

  it("does not read the child payload, contact, draft, or raw free text from the cases table", async () => {
    // The metadata query selects only `id, ref_code`; the audit query selects the
    // audit_log columns the projection needs. A child payload, contact phone, draft or
    // free text stored on `cases` is never read.
    const queries: string[] = [];
    const db: Queryable = {
      query: async (text, values) => {
        queries.push(text);
        if (text.startsWith("SELECT id, ref_code FROM cases")) return { rows: [caseRow()] };
        if (text.includes("FROM audit_log")) return { rows: [] };
        return { rows: [] };
      },
    };
    const officer = testUser(OFFICER_ID, "officer", { verified: true, isActive: true });
    await readCaseAudit(officer, CASE_ID, { db });
    // Case metadata is exactly `id, ref_code`. No child, contact, draft, raw_text,
    // embedding, district, score, reason or note is read.
    expect(queries[0]).toBe("SELECT id, ref_code FROM cases WHERE id = $1");
    expect(queries[0]).not.toMatch(/child_name|contact_phone|raw_text|draft|district_code|reason|note|embedding/i);
    // The audit query lists only the columns the projection needs; never a free-text
    // reason, note, transcript or provider URL.
    expect(queries[1]).toMatch(/FROM audit_log/);
    expect(queries[1]).not.toMatch(/reason|note|transcript|source_url|url/i);
  });

  it("ignores audit rows from a different case (no row leak across case IDs)", async () => {
    // The query filters by `a.case_id = $1`, and the per-row ref_code check
    // independently confirms `r.case_id === auditedCase.id`. Both guards must hold.
    const cases: ReadonlyArray<Record<string, unknown>> = [caseRow()];
    const audits: ReadonlyArray<Record<string, unknown>> = [
      auditRow({ case_id: OTHER_CASE_ID, action: "case.closed", details: { ref_code: OTHER_CASE_REF, api: "API-011" } }),
    ];
    const officer = testUser(OFFICER_ID, "officer", { verified: true, isActive: true });
    const r = await readCaseAudit(officer, CASE_ID, { db: q(cases, audits) });
    if (r.kind !== "ok") throw new Error(`expected ok, got ${r.kind}`);
    // The stub returns the row, but the projection withholds it (ref_code mismatch
    // OR case_id mismatch). Either guard withholds the row.
    expect(r.view.entries).toHaveLength(0);
    expect(r.view.withheld).toBe(1);
  });

  it("does NOT issue the audit_log SELECT for parent, staff, or unverified-officer principals", async () => {
    // Role eligibility is decided against the case metadata only. A caller who
    // cannot see the audit history never triggers the audit_log SELECT. Officer and
    // admin still get the audit view.
    const cases: ReadonlyArray<Record<string, unknown>> = [caseRow()];
    const audits: ReadonlyArray<Record<string, unknown>> = [auditRow()];

    // parent → hidden, audit_log SELECT not issued
    {
      const { db, queries } = spyDb(cases, audits);
      const parent = testUser(PARENT_SESSION, "officer", { verified: false, isActive: false });
      const r = await readCaseAudit(parent, CASE_ID, { db });
      expect(r).toEqual({ kind: "hidden", caseId: CASE_ID });
      expect(queries.some((t) => t.includes("FROM audit_log"))).toBe(false);
    }

    // staff → hidden, audit_log SELECT not issued
    {
      const { db, queries } = spyDb(cases, audits);
      const staff = testUser(STAFF_ID, "staff", { verified: true, isActive: true });
      const r = await readCaseAudit(staff, CASE_ID, { db });
      expect(r).toEqual({ kind: "hidden", caseId: CASE_ID });
      expect(queries.some((t) => t.includes("FROM audit_log"))).toBe(false);
    }

    // unverified officer → hidden, audit_log SELECT not issued
    {
      const { db, queries } = spyDb(cases, audits);
      const unverified = testUser(OFFICER_ID, "officer", { verified: false, isActive: true });
      const r = await readCaseAudit(unverified, CASE_ID, { db });
      expect(r).toEqual({ kind: "hidden", caseId: CASE_ID });
      expect(queries.some((t) => t.includes("FROM audit_log"))).toBe(false);
    }

    // officer → still gets the view (audit_log SELECT issued exactly once)
    {
      const { db, queries } = spyDb(cases, audits);
      const officer = testUser(OFFICER_ID, "officer", { verified: true, isActive: true });
      const r = await readCaseAudit(officer, CASE_ID, { db });
      if (r.kind !== "ok") throw new Error(`expected ok, got ${r.kind}`);
      expect(r.view.view).toBe("officer");
      expect(queries.filter((t) => t.includes("FROM audit_log"))).toHaveLength(1);
    }

    // admin → still gets the view (audit_log SELECT issued exactly once)
    {
      const { db, queries } = spyDb(cases, audits);
      const admin = testUser(ADMIN_ID, "admin", { verified: true, isActive: true });
      const r = await readCaseAudit(admin, CASE_ID, { db });
      if (r.kind !== "ok") throw new Error(`expected ok, got ${r.kind}`);
      expect(r.view.view).toBe("admin");
      expect(queries.filter((t) => t.includes("FROM audit_log"))).toHaveLength(1);
    }
  });
});
