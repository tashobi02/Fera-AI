import { describe, expect, it } from "vitest";
import { exampleFoundDraft, exampleMissingDraft } from "@/contracts/examples";
import { missingFieldsFor, decideNext } from "@/server/intake/rounds";
import { EXTRACT_FIXTURE_DRAFT } from "@/server/cache";
import { createInMemoryDraftRegistry, createDraftSigner, verifyDraftToken } from "@/server/intake/registry";
import { testParent } from "../support/principals";
import { randomUUID } from "node:crypto";
import type { Principal } from "@/contracts/server";

describe("BR-015 intake missing fields and follow-up limits", () => {
  it("does not require a name or treat the allowed unknown sex as missing", () => {
    const draft = {
      ...exampleMissingDraft,
      child: { ...exampleMissingDraft.child, name: null, sex: "unknown" as const },
      reporter: { ...exampleMissingDraft.reporter, phone: null },
      event: { ...exampleMissingDraft.event, district_code: null },
    };

    expect(missingFieldsFor(draft)).toEqual(["event.district_code", "reporter.phone"]);
  });

  it("uses found-report BR-015 fields while allowing an unknown age and nullable name", () => {
    const draft = {
      ...exampleFoundDraft,
      child: { ...exampleFoundDraft.child, name: null, age_years: null, age_min: null, age_max: null, sex: "unknown" as const, clothing: null, marks: null },
      event: { ...exampleFoundDraft.event, at: null, at_lower: null, at_upper: null, place_text: null, district_code: null, circumstances: null },
      reporter: { ...exampleFoundDraft.reporter, phone: null },
    };

    expect(missingFieldsFor(draft)).toEqual([
      "event.circumstances",
      "event.district_code",
      "event.place_text",
      "event.at",
      "reporter.phone",
    ]);
  });

  it("caps every issued question at four, regardless of payment", async () => {
    const secret = Buffer.from("0123456789abcdef0123456789abcdef");
    const principal = testParent(randomUUID());
    const registry = createInMemoryDraftRegistry({
      signer: createDraftSigner(secret),
      verify: (token: string, kind: "missing" | "found", owner: Principal) => verifyDraftToken(secret, token, kind, owner),
    });
    const created = await registry.create({ kind: "missing", principal, payloadHash: null });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    for (let n = 0; n < 4; n++) {
      const decision = decideNext({ draft: EXTRACT_FIXTURE_DRAFT, followUpRound: created.row.follow_up_round });
      expect(decision.kind).toBe("question");
      const issued = await registry.issueQuestion(created.row.id, created.row.revision);
      expect(issued.ok).toBe(true);
      if (!issued.ok) return;
    }

    const exhausted = decideNext({ draft: EXTRACT_FIXTURE_DRAFT, followUpRound: created.row.follow_up_round });
    expect(exhausted).toEqual({ kind: "manual", reason: "rounds_exhausted" });
    expect(created.row).toMatchObject({ follow_up_round: 4, ai_calls_used: 0 });
  });
});
