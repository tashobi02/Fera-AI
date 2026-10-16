import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { clientExamples } from "@/contracts/client-examples";
import { ReviewFields, ConfirmBar } from "@/app/(parent)/intake/review/review-fields";
import { createDeviceDraft } from "@/lib/intake/draft-store";
import { editField } from "@/lib/intake/review";

function record() {
  return createDeviceDraft({ to: "review", response: clientExamples.extractResponse, sourceText: clientExamples.extractResponse.draft.source_text, missing: ["child.height_cm"], asked: 4, mock: true, cached: false })!;
}
const noop = () => {};
describe("SCREEN-003 static markup (no browser)", () => {
  it("labels every draft field and renders null as Bangla unknown text", () => {
    const r = record(); r.draft.child.height_cm = null;
    const html = renderToStaticMarkup(createElement(ReviewFields, { record: r, locale: "bn", errors: [], onEdit: noop, onApprox: noop, onBlur: noop, locked: false }));
    expect(html).toContain("অজানা"); expect(html).toContain('for="review-child.height_cm"'); expect(html).toContain('lang="bn"');
    expect(html).toContain("min-h-11"); expect(html).not.toMatch(/(?:red-|danger|#[fF]{2}0000)/);
  });
  it("shows FULL original source next to each unedited known field with its exact evidence highlighted", () => {
    const r = record(); const html = renderToStaticMarkup(createElement(ReviewFields, { record: r, locale: "en", errors: [], onEdit: noop, onApprox: noop, onBlur: noop, locked: false }));
    expect(html.match(/data-source="full"/g)!.length).toBeGreaterThan(1);
    expect(html).toContain("<mark"); expect(html).toContain(r.draft.evidence["child.name"].quote);
    expect(html.replace(/<[^>]*>/g, "")).toContain(r.draft.source_text);
  });
  it("keeps additional unprocessed handoff words beside each prefilled field", () => {
    const r = record(); r.sourceText = `${r.draft.source_text}\n[MOCK] additional unprocessed words`;
    const html = renderToStaticMarkup(createElement(ReviewFields, { record: r, locale: "en", errors: [], onEdit: noop, onApprox: noop, onBlur: noop, locked: false }));
    expect(html.match(/additional unprocessed words/g)!.length).toBeGreaterThan(1);
  });
  it("renders parent-edited status and field errors connected to the input", () => {
    const r = editField(record(), "reporter.phone", "");
    const html = renderToStaticMarkup(createElement(ReviewFields, { record: r, locale: "en", errors: ["reporter.phone"], onEdit: noop, onApprox: noop, onBlur: noop, locked: false }));
    expect(html).toContain("Edited by you"); expect(html).toContain('aria-invalid="true"'); expect(html).toContain('aria-describedby="review-reporter.phone-error"');
  });
  it.each([[false, true, false], [true, false, false], [true, true, true]])("submit eligibility checked=%s valid=%s", (checked, valid, enabled) => {
    const html = renderToStaticMarkup(createElement(ConfirmBar, { locale: "bn", checked, valid, busy: false, blocked: false, onCheck: noop }));
    expect(html.includes('disabled=""')).toBe(!enabled);
    expect(html).toContain("আমি যাচাই করেছি"); expect(html).toContain("যাচাই করে জমা দিন");
  });
});
