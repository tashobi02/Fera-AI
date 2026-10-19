// TASK-028: SCREEN-010 markup, server-rendered in Node (no browser here; the TC-010/011
// browser journey is TASK-038 Playwright). Synthetic data only.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { exampleCandidateDecisionView } from "@/contracts/examples";
import { locales } from "@/locales";

const { MatchReview } = await import("@/app/(desk)/officer/match/[id]/match-review");
const view = exampleCandidateDecisionView;
const render = (locale: "bn" | "en", v = view) => renderToStaticMarkup(createElement(MatchReview, { view: v, locale, queueHref: "/officer/queue" }));

describe("COMP-037/038 match review", () => {
  it("labels the score as similarity, out of 100, and not a probability or proof", () => {
    for (const locale of ["bn", "en"] as const) {
      const html = render(locale);
      expect(html).toContain(locales[locale].matchReviewSimilarity);
      expect(html).toContain(locales[locale].matchReviewSimilarityNote);
    }
    expect(locales.bn.matchReviewSimilarity).toBe("মিলের মাত্রা"); // D3
    // No probability wording at all (the wording guard bans it); no percentage-match or "identical" claim.
    const prose = render("en").replace(locales.en.matchReviewSimilarityNote, "");
    expect(prose).not.toMatch(/probab|%\s*match|identical/i);
  });

  it("renders a real table with column and row headers and an icon-plus-word result per row", () => {
    const html = render("en");
    expect(html).toContain("<caption");
    expect((html.match(/<th scope="col"/g) ?? []).length).toBe(4);
    expect((html.match(/<th scope="row"/g) ?? []).length).toBe(9);
    // every result cell carries a visible word next to its icon (never colour alone)
    const words = [locales.en.matchVerdictAgree, locales.en.matchVerdictDiffer, locales.en.matchVerdictUnknown, locales.en.matchVerdictReview];
    expect(words.some((w) => html.includes(`<span>${w}</span>`))).toBe(true);
    expect(html).not.toMatch(/<svg(?![^>]*aria-hidden="true")/);
  });

  it("has Confirm and Not-a-match with the D3 labels, and a dialog with the four checklist items and the simulation sentence", () => {
    const html = render("bn");
    expect(html).toContain("মিল নিশ্চিত করুন"); // ACT-021
    expect(html).toContain("মিল নয়"); // ACT-022
    expect(html).toContain("<dialog");
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(4);
    expect(html).toContain("রেফারেল নথিভুক্ত হবে (সিমুলেশন)");
  });

  it("stacks the rows for narrow screens and gives the dialog checklist a legend", () => {
    const html = render("en");
    expect(html).toContain("sm:hidden");
    expect(html).toContain('role="region"');
    expect(html).toContain("<legend");
    expect(html).toContain(locales.en.matchReviewChecklistLegend);
  });

  it("notes that a different district is not unusual instead of calling it a contradiction", () => {
    const other = { ...view, found: { ...view.found, event: { ...view.found.event, district_code: 61, district_name_bn: "সিলেট" } } };
    const html = render("en", other);
    expect(html).toContain(locales.en.matchReviewDifferentDistrictNote);
  });

  it("never claims the child is returned, rescued or that a referral was delivered", () => {
    const keys = Object.keys(locales.en).filter((k) => k.startsWith("matchReview") || k.startsWith("matchField") || k.startsWith("matchVerdict")) as (keyof typeof locales.en)[];
    for (const k of keys) {
      expect(locales.en[k], k).not.toMatch(/rescu|alert|runaway|police|delivered|returned to/i);
      expect(locales.bn[k], k).not.toMatch(/উদ্ধার|সতর্ক|পালিয়ে|পুলিশ|পৌঁছে/);
    }
    expect(locales.en.matchReviewConfirmed).toMatch(/simulation/i);
    expect(locales.bn.matchReviewConfirmed).toMatch(/সিমুলেশন/);
  });

  it("shows the duplicate banner only when the reports carry duplicate cues", () => {
    expect(render("en")).not.toContain(locales.en.matchReviewDuplicate);
    const withDup = { ...view, missing: { ...view.missing, duplicate_of: [{ id: "6b1f3c2a-4d5e-4f60-8a71-000000000099", ref: "M-2026-0099", status: "open" as const }] } };
    expect(render("en", withDup)).toContain(locales.en.matchReviewDuplicate);
    expect(render("en", withDup)).toContain("M-2026-0099");
  });

  it("disables both decisions and says why when the candidate no longer qualifies", () => {
    const html = render("en", { ...view, qualified: false });
    expect(html).toContain(locales.en.matchReviewNotQualified.replaceAll("'", "&#x27;"));
    expect((html.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe("display rounding and district language", () => {
  it("rounds the similarity score and components", () => {
    const v = { ...view, score: 72.456789, components: { age: 0.123456, sex: 1 } };
    const html = render("en", v);
    expect(html).toContain("72 <");
    expect(render("en", { ...view, score: 99.6 })).toContain("99 <");
    expect(html).not.toContain("72.45");
    expect(html).toContain("0.12");
    expect(html).not.toContain("0.1234");
  });
  it("names the district in English in English mode", () => {
    const v = { ...view, missing: { ...view.missing, event: { ...view.missing.event, district_code: 14, district_name_bn: "ঢাকা" } } };
    const en = render("en", v);
    expect(en).toContain("Dhaka");
    expect(en).not.toContain("ঢাকা");
    expect(render("bn", v)).toContain("ঢাকা");
  });
});
