// Exercise the production post-commit runner, never a replacement of its logic.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureLogs } from "../api/fakes";
const mocks = vi.hoisted(() => ({ missing:vi.fn(), found:vi.fn(), tx:vi.fn(), locks:vi.fn(), query:vi.fn() }));
vi.mock("@/server/matching/run",()=>({runMatcherForCase:mocks.missing,runMatcherForFoundCase:mocks.found}));
vi.mock("@/server/case/internal",()=>({withTransaction:mocks.tx,lockCases:mocks.locks}));
describe("production post-commit failure boundary",()=>{
  beforeEach(()=>{vi.resetModules();vi.clearAllMocks();});
  it.each(["API-003","API-007"] as const)("%s returns a soft failure after a matcher exception and attempts durable marking",async(api)=>{
    const cap=captureLogs();
    mocks.missing.mockRejectedValue(new Error("private synthetic name and model path"));
    mocks.found.mockRejectedValue(new Error("private synthetic name and model path"));
    mocks.locks.mockResolvedValue(new Map([["case-1",{kind:api==="API-007"?"found":"missing",anonymised_at:null}]]));
    mocks.tx.mockImplementation(async(fn)=>fn({query:mocks.query}));
    const {fireMatcherPostcommit}=await import("@/server/case/postcommit");
    await expect(fireMatcherPostcommit("case-1",{logger:cap.logger},api)).resolves.toMatchObject({state:"failed",errorId:"E-021"});
    expect(mocks.tx).toHaveBeenCalledOnce();expect(mocks.query).toHaveBeenCalledOnce();
    expect(cap.parsed().some(e=>e.event==="matcher.postcommit_failed")).toBe(true);
    expect(cap.lines.join(" ")).not.toContain("private synthetic");
  });
  it("a secondary durability-write failure does not reject an already committed report",async()=>{
    const cap=captureLogs();mocks.missing.mockRejectedValue(new Error("private matcher failure"));
    mocks.tx.mockRejectedValue(new Error("private database connection"));
    const {fireMatcherPostcommit}=await import("@/server/case/postcommit");
    await expect(fireMatcherPostcommit("case-2",{logger:cap.logger},"API-003")).resolves.toMatchObject({state:"failed",errorId:"E-021"});
    expect(cap.parsed().map(e=>e.event)).toEqual(["matcher.postcommit_failed","matcher.failure_state_unavailable"]);
    expect(cap.lines.join(" ")).not.toContain("private");
  });
});
