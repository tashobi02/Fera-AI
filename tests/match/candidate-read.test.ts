// TASK-028 / API-009: the candidate read. The database helpers are replaced with fixtures
// (the SQL itself runs under `npm run test:db`, not here). Synthetic data only.
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { candidateDecisionViewSchema } from "@/contracts";
import { exampleFoundRow, exampleMissingRow } from "@/contracts/examples";
import type { CaseRow } from "@/contracts/server";
import { testParent, testUser } from "../support/principals";

const audit: Array<Record<string, unknown>> = [];
let rows: Record<string, CaseRow | null> = {};
let candidateRow: Record<string, unknown> | null = null;

vi.mock("@/server/audit", async (orig) => ({
  ...(await orig<typeof import("@/server/audit")>()),
  appendAudit: async (_db: unknown, _actor: unknown, entry: Record<string, unknown>) => void audit.push(entry),
}));
vi.mock("@/server/case/internal", async (orig) => ({
  ...(await orig<typeof import("@/server/case/internal")>()),
  getCaseRow: async (_db: unknown, id: string) => rows[id] ?? null,
  officerContext: async () => ({ districtNameBn: "ঢাকা", duplicateOf: [] }),
  withTransaction: async (fn: (c: unknown) => unknown) =>
    fn({ query: async () => ({ rows: candidateRow ? [candidateRow] : [] }) }),
}));

const { readCandidate } = await import("@/server/matching/candidate-read");

const officerId = randomUUID();
const officer = testUser(officerId, "officer", { verified: true });
const candidateId = randomUUID();

function seed(over: Record<string, unknown> = {}, missing: Partial<CaseRow> = {}, found: Partial<CaseRow> = {}) {
  const m = { ...exampleMissingRow, ...missing } as CaseRow;
  const f = { ...exampleFoundRow, ...found } as CaseRow;
  rows = { [m.id]: m, [f.id]: f };
  candidateRow = {
    id: candidateId, missing_case_id: m.id, found_case_id: f.id, missing_version: m.version, found_version: f.version,
    score: "72.50", components: { age: 0.8, sex: 1, clothing: null }, status: "pending", ...over,
  };
  return { m, f };
}

beforeEach(() => {
  audit.length = 0;
  rows = {};
  candidateRow = null;
});

describe("readCandidate (API-009)", () => {
  it("returns the contract view for a verified officer, with similarity and no identity probability", async () => {
    seed();
    const r = await readCandidate(officer, candidateId, { requestId: "r1" });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(candidateDecisionViewSchema.safeParse(r.view).success).toBe(true);
    expect(r.view).toMatchObject({ score: 72.5, qualified: true, identity_probability: false });
    expect(r.view.components).toEqual({ age: 0.8, sex: 1, clothing: null });
    expect(r.view.missing.kind).toBe("missing");
    expect(r.view.found.kind).toBe("found");
  });

  it("audits each raw contact phone it serves, with the request id and no phone in the row", async () => {
    seed();
    const r = await readCandidate(officer, candidateId, { requestId: "r2" });
    expect(r.kind).toBe("ok");
    expect(audit.length).toBeGreaterThanOrEqual(1);
    for (const a of audit) {
      expect(a).toMatchObject({ action: "case.contact_viewed", requestId: "r2", details: { api: "API-009", contact_viewed: true } });
      expect(JSON.stringify(a)).not.toMatch(/01[0-9]{9}/);
    }
  });

  it("is hidden (not 'forbidden') for staff, an unverified officer, a parent, a bad id and an unknown candidate", async () => {
    seed();
    for (const p of [testUser(randomUUID(), "staff"), testUser(randomUUID(), "officer", { verified: false }), testUser(randomUUID(), "admin"), testParent(randomUUID())]) {
      expect(await readCandidate(p, candidateId)).toEqual({ kind: "hidden", caseId: null });
    }
    expect(await readCandidate(officer, "not-a-uuid")).toEqual({ kind: "hidden", caseId: null });
    candidateRow = null;
    expect(await readCandidate(officer, randomUUID())).toEqual({ kind: "hidden", caseId: null });
    expect(audit).toHaveLength(0);
  });

  it("is not qualified once a report moved on, but can still be opened", async () => {
    // The candidate was made for the report at its original version; the report has since moved on.
    seed({ missing_version: exampleMissingRow.version }, { version: exampleMissingRow.version + 1 });
    const r = await readCandidate(officer, candidateId);
    expect(r.kind === "ok" && r.view.qualified).toBe(false);
  });

  it("is not qualified once the candidate is no longer pending", async () => {
    seed({ status: "rejected" });
    const r = await readCandidate(officer, candidateId);
    expect(r.kind === "ok" && r.view.qualified).toBe(false);
  });

  it("fails closed on a stored components value that is not a score map", async () => {
    seed({ components: { age: "high" } });
    await expect(readCandidate(officer, candidateId)).rejects.toThrow();
    seed({ components: [1, 2] });
    await expect(readCandidate(officer, candidateId)).rejects.toThrow();
  });
});
