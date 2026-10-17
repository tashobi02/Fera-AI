import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { duplicateBannerFor } from "../../src/server/duplicates";

const A = "00000000-0000-4000-8000-000000000001";
const B = "00000000-0000-4000-8000-000000000002";
const link = (status: "flagged" | "confirmed_same" | "dismissed") => ({ caseA: A, caseB: B, status, refCodeA: "M-AAAAAA", refCodeB: "M-BBBBBB" });

describe("duplicate banner (D3 flow row 5, D4 duplicate cue)", () => {
  it("uses the exact D3/D4 strings", () => {
    const d3 = readFileSync("docs/spec/D3_App_Flow_V2.md", "utf8");
    const d4 = readFileSync("docs/spec/D4_Design_Brief_V2.md", "utf8");
    expect(d3).toContain("সম্ভাব্য একই শিশু: M-…");
    expect(d3).toContain("Possible same child: M-…");
    expect(d4).toContain("সম্ভাব্য একই শিশু · আলাদা প্রতিবেদন দৃশ্যমান");
    expect(d4).toContain("Possible duplicate · separate reports remain visible");
    const [bn] = duplicateBannerFor([link("flagged")], A, "bn");
    expect(bn.text).toBe("সম্ভাব্য একই শিশু: M-BBBBBB");
    expect(bn.note).toBe("আলাদা প্রতিবেদন দৃশ্যমান");
    const [en] = duplicateBannerFor([link("flagged")], B, "en");
    expect(en.text).toBe("Possible same child: M-AAAAAA");
    expect(en.note).toBe("separate reports remain visible");
  });
  it("points at the other report, whichever side the case is on", () => {
    expect(duplicateBannerFor([link("flagged")], A, "en")[0].otherCaseId).toBe(B);
    expect(duplicateBannerFor([link("flagged")], B, "en")[0].otherCaseId).toBe(A);
  });
  it("shows nothing for an unrelated case or a dismissed link, and still shows a confirmed one", () => {
    expect(duplicateBannerFor([link("flagged")], "00000000-0000-4000-8000-000000000003", "bn")).toEqual([]);
    expect(duplicateBannerFor([link("dismissed")], A, "bn")).toEqual([]);
    expect(duplicateBannerFor([link("confirmed_same")], A, "bn")).toHaveLength(1);
  });
});
