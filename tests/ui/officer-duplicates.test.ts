// SCREEN-014 static render smoke tests (no browser or server write).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { officerCaseRowSchema } from "@/contracts";
import { clientExamples } from "@/contracts/client-examples";
import type { OfficerDuplicateView } from "@/server/duplicates/read";
import { DuplicateReview } from "@/app/(desk)/officer/duplicates/[id]/duplicate-review";

const caseA = officerCaseRowSchema.parse({ ...clientExamples.officerMissingView, contact_phone: null });
const caseB = officerCaseRowSchema.parse({
  ...caseA,
  id: "6b1f3c2a-4d5e-4f60-8a71-0000000000a2",
  ref_code: "M-3D8W1Z",
  child: { ...caseA.child, name: "[MOCK] Synthetic comparison" },
});

function view(rule: "profile" | "same_phone" = "same_phone"): OfficerDuplicateView {
  return {
    link: { id: "6b1f3c2a-4d5e-4f60-8a71-0000000000d1", status: "flagged", rule, score: 82.5 },
    cases: { a: caseA, b: caseB },
  };
}

describe("SCREEN-014 duplicate review UI smoke", () => {
  it("shows a synthetic side-by-side comparison and prevents phone-only confirmation", () => {
    const html = renderToStaticMarkup(createElement(DuplicateReview, { view: view(), locale: "en", listHref: "/en/officer/duplicates" }));

    expect(html).toContain("Are these two reports the same child?");
    expect(html).toContain("Similarity");
    expect(html).toContain("Shared phone only");
    expect(html).toContain("A shared phone number alone cannot confirm same child.");
    expect(html).toContain("[MOCK] Synthetic comparison");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*title="A shared phone alone cannot confirm same child\."/);
    expect(html).not.toContain("01700000001");
    expect(html).not.toContain("Probability");
  });

  it("keeps profile decisions blocked until the evidence checkbox is reviewed", () => {
    const html = renderToStaticMarkup(createElement(DuplicateReview, { view: view("profile"), locale: "en", listHref: "/en/officer/duplicates" }));

    expect(html).toContain("I have reviewed the profile evidence");
    expect(html).toContain("Same child");
    expect(html).toContain("Different");
    expect(html.match(/<button[^>]*disabled=""/g)).toHaveLength(2);
  });
});
