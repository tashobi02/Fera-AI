// Safe audit projection reader (API-013; TASK-015; BR-010/024; FR-021; TC-016/052).
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
//     an absent case (the route then writes the access.denied audit row)
import { describe, expect, it } from "vitest";
import { readCaseAudit } from "@/server/audit/safe-read";
import type { Queryable } from "@/server/db/queryable";
import { testUser } from "../support/principals";

const CASE_ID = "33333333-3333-4333-8333-333333333301";
const CASE_REF = "M-3001";
const OTHER_CASE_ID = "33333333-3333-4333-8333-333333333399";
const OTHER_CASE_REF = "M-3099";
const OFFICER_ID = "33333333-3333-4333-8333-333333333302";
const ADMIN_ID = "33333333-3333-4333-8333-333333333303";
const STAFF_ID = "33333333-3333-4333-8333-333333333304";
const PARENT_SESSION = "33333333-3333-4333-8333-333333333305";
const CANDIDATE_ID = "33333333-3333-4333-8333-333333333306";

function q<T>(rows: T[]): Queryable {
  return { query: async () => ({ rows: rows as unknown[] }) };
}

function date(iso: string): Date {
  return new Date(iso);
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
    const r = await readCaseAudit(officer, CASE_ID, { db: q([]) });
    expect(r).toEqual({ kind: "hidden", caseId: null });
  });

  it("returns `hidden` (caseId set) when the principal is not officer/admin", async () => {
    const cases = [caseRow()];
    const audits = [auditRow()];
    // parent
    const parent = testUser(PARENT_SESSION, "officer", { verified: false, isActive: false });
    expect(await readCaseAudit(parent, CASE_ID, { db: q(cases.concat(audits)) })).toEqual({ kind: "hidden", caseId: CASE_ID });
    // staff
    const staff = testUser(STAFF_ID, "staff", { verified: true, isActive: true });
    expect(await readCaseAudit(staff, CASE_ID, { db: q(cases.concat(audits)) })).toEqual({ kind: "hidden", caseId: CASE_ID });
    // unverified officer
    const unverified = testUser(OFFICER_ID, "officer", { verified: false, isActive: true });
    expect(await readCaseAudit(unverified, CASE_ID, { db: q(cases.concat(audits)) })).toEqual({ kind: "hidden", caseId: CASE_ID });
  });

  it("returns the officer view with the operational allowlist", async () => {
    const cases = [caseRow()];
    const audits = [
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
          missing_ref: "M-2001",
          found_ref: "F-2001",
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
    const r = await readCaseAudit(officer, CASE_ID, { db: q(cases.concat(audits)) });
    if (r.kind !== "ok") throw new Error(`expected ok, got ${r.kind}`);
    expect(r.view.data.view).toBe("officer");
    expect(r.view.data.entries).toHaveLength(2);
    expect(r.view.data.withheld).toBe(0);
    // Operational allowlist survived: candidate id, score, decision.
    const decision = r.view.data.entries[0]!;
    expect(decision.action).toBe("match.confirm");
    expect(decision.details.candidate_id).toBe(CANDIDATE_ID);
    expect(decision.details.score).toBe(87);
    expect(decision.details.decision).toBe("confirm");
    // Officer sees actor identity (their own and any other officer/admin).
    expect(decision.actor_id).toBe(OFFICER_ID);
    expect(decision.actor_display).toBe("Anika Rahman");
  });

  it("returns the admin view with the metadata allowlist only", async () => {
    const cases = [caseRow()];
    const audits = [
      auditRow({
        at: "2026-10-17T09:00:00+06:00",
        action: "match.confirm",
        candidate_id: CANDIDATE_ID,
        details: {
          ref_code: CASE_REF,
          candidate_id: CANDIDATE_ID,
          missing_ref: "M-2001",
          found_ref: "F-2001",
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
    const r = await readCaseAudit(admin, CASE_ID, { db: q(cases.concat(audits)) });
    if (r.kind !== "ok") throw new Error(`expected ok, got ${r.kind}`);
    expect(r.view.data.view).toBe("admin");
    expect(r.view.data.entries).toHaveLength(1);
    expect(r.view.data.withheld).toBe(0);
    const entry = r.view.data.entries[0]!;
    // Admin gets actor_role only — no actor_id, no actor_display.
    expect(entry.actor_id).toBeUndefined();
    expect(entry.actor_display).toBeUndefined();
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
    const cases = [caseRow()];
    const audits = [
      // A row tagged with another case's ref_code: the per-row ref_code check (D2A
      // "details.ref_code is the audited case's own reference only") must withhold it.
      auditRow({ details: { ref_code: OTHER_CASE_REF, api: "API-011" } }),
      auditRow(), // this one is fine
    ];
    const officer = testUser(OFFICER_ID, "officer", { verified: true, isActive: true });
    const r = await readCaseAudit(officer, CASE_ID, { db: q(cases.concat(audits)) });
    if (r.kind !== "ok") throw new Error(`expected ok, got ${r.kind}`);
    expect(r.view.data.entries).toHaveLength(1);
    expect(r.view.data.withheld).toBe(1);
    // The remaining entry is the one whose ref_code matches the audited case.
    expect(r.view.data.entries[0]!.details.ref_code).toBe(CASE_REF);
  });

  it("withholds a row whose stored details contain a free-text key", async () => {
    // The contracts' audit details schemas are strict allowlists; a stored `note`
    // (free text) makes the row's details fail the per-role schema and the row is
    // withheld (D2A "withheld counts stored rows that failed the allowlist and were
    // left out").
    const cases = [caseRow()];
    const audits = [
      auditRow({ details: { ref_code: CASE_REF, api: "API-011", note: "free text that should not appear here" } }),
    ];
    const officer = testUser(OFFICER_ID, "officer", { verified: true, isActive: true });
    const r = await readCaseAudit(officer, CASE_ID, { db: q(cases.concat(audits)) });
    if (r.kind !== "ok") throw new Error(`expected ok, got ${r.kind}`);
    expect(r.view.data.entries).toHaveLength(0);
    expect(r.view.data.withheld).toBe(1);
  });

  it("preserves append-only ordering (no row is rewritten or removed by the read)", async () => {
    const cases = [caseRow()];
    const audits = [
      auditRow({ at: "2026-10-17T08:00:00+06:00", action: "case.created", details: { ref_code: CASE_REF, version: 1, api: "API-003" } }),
      auditRow({ at: "2026-10-17T09:00:00+06:00", action: "case.state_changed", details: { ref_code: CASE_REF, from_status: "open", to_status: "matched_pending_review", api: "API-008" } }),
      auditRow({ at: "2026-10-17T10:00:00+06:00", action: "case.closed", details: { ref_code: CASE_REF, outcome: "resolved_outside_fera", api: "API-011", reason_recorded: true } }),
    ];
    const officer = testUser(OFFICER_ID, "officer", { verified: true, isActive: true });
    const r = await readCaseAudit(officer, CASE_ID, { db: q(cases.concat(audits)) });
    if (r.kind !== "ok") throw new Error(`expected ok, got ${r.kind}`);
    expect(r.view.data.entries.map((e) => e.action)).toEqual([
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
    const cases = [caseRow()];
    const audits = [
      auditRow({ case_id: OTHER_CASE_ID, action: "case.closed", details: { ref_code: OTHER_CASE_REF, api: "API-011" } }),
    ];
    const officer = testUser(OFFICER_ID, "officer", { verified: true, isActive: true });
    const r = await readCaseAudit(officer, CASE_ID, { db: q(cases.concat(audits)) });
    if (r.kind !== "ok") throw new Error(`expected ok, got ${r.kind}`);
    // The stub returns the row, but the projection withholds it (ref_code mismatch
    // OR case_id mismatch). Either guard withholds the row.
    expect(r.view.data.entries).toHaveLength(0);
    expect(r.view.data.withheld).toBe(1);
  });
});
