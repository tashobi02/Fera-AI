// TASK-023 API-006 service (COMP-010/016): ownership, cache per (case, type, version),
// TC-024 injected banned wording, and the response contract.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/app/api/_shared";
import { outputResponseSchema, type OwnerCaseView } from "@/contracts";
import { IDS, exampleOwnerCaseView } from "@/contracts/examples";
import { readCase, type ReadResult } from "@/server/case";
import { getOutput } from "@/server/outputs";
import { TEMPLATES } from "@/server/outputs/templates";
import { testParent } from "../support/principals";
import { fakePool, type Handler } from "../case/fakes";

vi.mock("@/server/case", () => ({ readCase: vi.fn() }));
const mockedRead = vi.mocked(readCase);

const parent = testParent(IDS.parentSession);
const CREATED = new Date("2026-10-12T14:10:00Z");

const owner = (view: Partial<OwnerCaseView> = {}): ReadResult => ({
  kind: "ok",
  view: { view: "owner", data: { ...exampleOwnerCaseView, ...view } },
});

const select = (rows: () => unknown[]): Handler => ({ match: /^SELECT text_bn/, reply: rows });
const live = (ok = true): Handler => ({ match: /FROM cases .*FOR SHARE$/, reply: () => (ok ? [{ "?column?": 1 }] : []) });
const district: Handler = { match: /FROM districts/, reply: () => [{ name_bn: "ঢাকা" }] };
const insert = (rows: (values: unknown[]) => unknown[]): Handler => ({ match: /^INSERT INTO generated_outputs/, reply: rows });

async function errorOf(p: Promise<unknown>): Promise<ApiError> {
  const err = await p.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(ApiError);
  return err as ApiError;
}

beforeEach(() => mockedRead.mockReset());

describe("getOutput (API-006)", () => {
  it("answers E-004 for a hidden case and sends no query", async () => {
    mockedRead.mockResolvedValue({ kind: "hidden", caseId: IDS.missingCase });
    const db = fakePool([]);
    const err = await errorOf(getOutput(parent, IDS.missingCase, "gd", { pool: db.pool }));
    expect(err.id).toBe("E-004");
    expect(err.caseId).toBe(IDS.missingCase);
    expect(db.calls).toHaveLength(0);
  });

  it("renders, stores at the current version and returns a valid OutputResponse", async () => {
    mockedRead.mockResolvedValue(owner({ version: 3 }));
    const db = fakePool([live(), select(() => []), district, insert((v) => [{ text_bn: v[2], created_at: CREATED }])]);
    const out = await getOutput(parent, IDS.missingCase, "gd", { pool: db.pool, requestId: "r1" });

    expect(outputResponseSchema.parse(out)).toEqual(out);
    expect(out).toMatchObject({ type: "gd", label_bn: "খসড়া", generated_at: "2026-10-12T20:10:00+06:00" });
    expect(out.text_bn).toContain("জেলা: ঢাকা");
    expect(mockedRead).toHaveBeenCalledWith(parent, IDS.missingCase, { pool: db.pool, requestId: "r1" });
    const [ins] = db.sent(/^INSERT/);
    expect(ins.values).toEqual([IDS.missingCase, "gd", out.text_bn, 3]);
    expect(db.sent(/FOR SHARE$/)[0].values).toEqual([IDS.missingCase, 3, ["submitted", "open", "matched_pending_review"]]);
  });

  it("serves the cached row for the same version without rendering again", async () => {
    mockedRead.mockResolvedValue(owner());
    const db = fakePool([live(), select(() => [{ text_bn: "খসড়া · আগের লেখা", created_at: CREATED }])]);
    const out = await getOutput(parent, IDS.missingCase, "poster", { pool: db.pool });
    expect(out.text_bn).toBe("খসড়া · আগের লেখা");
    expect(db.sent(/^INSERT/)).toHaveLength(0);
    expect(db.sent(/^SELECT text_bn/)[0].values).toEqual([IDS.missingCase, "poster", 1]);
  });

  it("serves the winner's row when a concurrent insert got there first", async () => {
    mockedRead.mockResolvedValue(owner());
    let selects = 0;
    const db = fakePool([
      live(),
      select(() => (++selects === 1 ? [] : [{ text_bn: "খসড়া · প্রথম", created_at: CREATED }])),
      district,
      insert(() => []),
    ]);
    const out = await getOutput(parent, IDS.missingCase, "gd", { pool: db.pool });
    expect(out.text_bn).toBe("খসড়া · প্রথম");
  });

  it("answers E-016 without reading any cache when the owner view hides the draft (OD-023-2, BR-025)", async () => {
    mockedRead.mockResolvedValue(owner({ draft: null, editable: false, status: "confirmed", status_group: "matched" }));
    const db = fakePool([live(), select(() => [{ text_bn: "খসড়া · লুকানো তথ্য", created_at: CREATED }])]);
    expect((await errorOf(getOutput(parent, IDS.missingCase, "gd", { pool: db.pool }))).id).toBe("E-016");
    expect(db.calls).toHaveLength(0);
  });

  it("writes nothing when the report was redacted, edited or locked after the read", async () => {
    mockedRead.mockResolvedValue(owner());
    const db = fakePool([live(false), select(() => [{ text_bn: "খসড়া · আগের লেখা", created_at: CREATED }]), district, insert(() => [])]);
    expect((await errorOf(getOutput(parent, IDS.missingCase, "gd", { pool: db.pool }))).id).toBe("E-016");
    expect(db.sent(/^SELECT text_bn/)).toHaveLength(0);
    expect(db.sent(/^INSERT/)).toHaveLength(0);
  });

  it("blocks a cached row that holds a banned term", async () => {
    mockedRead.mockResolvedValue(owner());
    const db = fakePool([live(), select(() => [{ text_bn: "খসড়া · সতর্কবার্তা", created_at: CREATED }])]);
    expect((await errorOf(getOutput(parent, IDS.missingCase, "gd", { pool: db.pool }))).id).toBe("E-016");
  });

  describe("TC-024: a template with পালিয়ে injected", () => {
    const original = TEMPLATES.gd;
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("is blocked with E-016, never stored and never returned", async () => {
      vi.spyOn(TEMPLATES, "gd").mockImplementation((input) => `${original(input)}\nশিশুটি পালিয়ে গেছে`);
      mockedRead.mockResolvedValue(owner());
      const db = fakePool([live(), select(() => []), district, insert(() => [])]);
      const err = await errorOf(getOutput(parent, IDS.missingCase, "gd", { pool: db.pool }));
      expect(err.id).toBe("E-016");
      expect(err.message).toBe("E-016");
      expect(db.sent(/^INSERT/)).toHaveLength(0);
      expect(db.sent(/^ROLLBACK/)).toHaveLength(1);
    });
  });
});
