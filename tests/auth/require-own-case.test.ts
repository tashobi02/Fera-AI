// TASK-024: the SCREEN-004 page guard. Owner view only; everything else is SCREEN-016
// with one access.denied row, failing closed when that row cannot be written (BR-010).
import { describe, expect, it, vi } from "vitest";
import { exampleOwnerCaseView } from "@/contracts/examples";
import type { AuditDeniedInput } from "@/app/api/_shared/compose";
import type { ReadResult } from "@/server/case";
import { testParent } from "../support/principals";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const { requireOwnCase } = await import("@/server/auth/require-own-case");
const { PageAuditUnavailableError } =
  await import("@/server/auth/require-role");

const PARENT = testParent("6b1f3c2a-4d5e-4f60-8a71-0000000000b1");
const CASE = exampleOwnerCaseView.id;

function deps(
  result: ReadResult,
  audit: (i: AuditDeniedInput) => Promise<void> = async () => undefined,
) {
  const roleCalls: unknown[][] = [];
  const audits: AuditDeniedInput[] = [];
  return {
    roleCalls,
    audits,
    deps: {
      role: (async (...args: unknown[]) => {
        roleCalls.push(args);
        return { principal: PARENT, role: "parent" };
      }) as never,
      read: (async () => result) as never,
      auditDenied: async (i: AuditDeniedInput) => {
        audits.push(i);
        await audit(i);
      },
    },
  };
}

describe("requireOwnCase", () => {
  it("returns the owner view after requireRole(['parent'])", async () => {
    const d = deps({
      kind: "ok",
      view: { view: "owner", data: exampleOwnerCaseView },
    });
    await expect(
      requireOwnCase(CASE, `/report/${CASE}`, d.deps),
    ).resolves.toEqual({ principal: PARENT, view: exampleOwnerCaseView });
    expect(d.roleCalls).toEqual([[["parent"], `/report/${CASE}`]]);
    expect(d.audits).toEqual([]);
  });

  it.each([
    [
      "absent or malformed",
      { kind: "hidden", caseId: null } as ReadResult,
      null,
    ],
    [
      "another parent's report",
      { kind: "hidden", caseId: CASE } as ReadResult,
      CASE,
    ],
  ])(
    "%s → not found with one access.denied row",
    async (_label, result, caseId) => {
      const d = deps(result);
      await expect(requireOwnCase(CASE, "/report/x", d.deps)).rejects.toThrow(
        "NEXT_NOT_FOUND",
      );
      expect(d.audits).toHaveLength(1);
      expect(d.audits[0]).toMatchObject({
        principal: PARENT,
        api: "API-004",
        errorId: "E-004",
        reason: "authorize",
        caseId,
      });
      expect(d.audits[0]!.requestId).toMatch(/^[0-9a-f-]{36}$/);
    },
  );

  it("never returns a non-owner projection", async () => {
    const d = deps({ kind: "ok", view: { view: "admin", data: {} } } as never);
    await expect(requireOwnCase(CASE, "/report/x", d.deps)).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(d.audits[0]).toMatchObject({ caseId: CASE });
  });

  it("checks the parent role before reading anything", async () => {
    const reads: unknown[] = [];
    const denied = requireOwnCase(CASE, "/report/x", {
      role: (async () => {
        throw new Error("NEXT_NOT_FOUND");
      }) as never,
      read: (async (...args: unknown[]) => {
        reads.push(args);
        return { kind: "hidden", caseId: null };
      }) as never,
    });
    await expect(denied).rejects.toThrow("NEXT_NOT_FOUND");
    expect(reads).toEqual([]);
  });

  it("fails closed when the denial cannot be audited", async () => {
    const d = deps({ kind: "hidden", caseId: null }, async () => {
      throw new Error("db down");
    });
    await expect(
      requireOwnCase(CASE, "/report/x", d.deps),
    ).rejects.toBeInstanceOf(PageAuditUnavailableError);
  });
});
