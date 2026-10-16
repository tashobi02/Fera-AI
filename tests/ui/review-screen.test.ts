import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DRAFT_FIELD_PATHS } from "@/contracts";
import { clientExamples } from "@/contracts/client-examples";
import { ReviewFields, ConfirmBar } from "@/app/(parent)/intake/review/review-fields";
import { createDeviceDraft } from "@/lib/intake/draft-store";
import { editField, fieldValue } from "@/lib/intake/review";

function record() {
  return createDeviceDraft({ to: "review", response: clientExamples.extractResponse, sourceText: clientExamples.extractResponse.draft.source_text, missing: ["child.height_cm"], asked: 4, mock: true, cached: false })!;
}
const noop = () => {};
describe("SCREEN-003 static markup (no browser)", () => {
  it("labels every draft field and renders null as Bangla unknown text", () => {
    const r = record(); r.draft.child.height_cm = null;
    const html = renderToStaticMarkup(createElement(ReviewFields, { record: r, locale: "bn", errors: [], onEdit: noop, onBatch: noop, onApprox: noop, onBlur: noop, locked: false }));
    expect(html).toContain("অজানা"); expect(html).toContain('for="review-child.height_cm"'); expect(html).toContain('lang="bn"');
    expect(html).toContain("min-h-11"); expect(html).not.toMatch(/(?:red-|danger|#[fF]{2}0000)/);
  });
  it("SC1: wraps field label and required badge with flex-wrap and no ml-2", () => {
    const r = record();
    const html = renderToStaticMarkup(createElement(ReviewFields, { record: r, locale: "bn", errors: [], onEdit: noop, onBatch: noop, onApprox: noop, onBlur: noop, locked: false }));
    expect(html).toContain("flex flex-wrap items-baseline gap-x-2");
    expect(html).not.toContain("ml-2");
  });
  it("shows FULL source beside every non-empty unedited field, including age and times, without a top block", () => {
    const r = record();
    r.draft = { ...structuredClone(clientExamples.createMissingRequest.draft), event: { ...clientExamples.createMissingRequest.draft.event, district_text: null } };
    r.draft.child.height_cm = 120; r.draft.child.marks = "[MOCK] mark";
    r.draft.reporter.relation = "[MOCK] parent";
    const html = renderToStaticMarkup(createElement(ReviewFields, { record: r, locale: "en", errors: [], onEdit: noop, onBatch: noop, onApprox: noop, onBlur: noop, locked: false }));
    for (const path of DRAFT_FIELD_PATHS.filter(path => !["event.district_text", "child.age_min", "child.age_max"].includes(path) && fieldValue(r, path) !== "")) {
      const block = html.split(`data-field-source="${path}"`)[1]?.split("</div>")[0];
      expect(block, path).toBeDefined();
      expect(block!.replace(/<[^>]+>/g, ""), path).toContain(r.draft.source_text);
    }
    expect(html).toContain("<mark");
    expect(html).not.toContain('id="review-source-full"');
    expect(html).not.toContain('data-source="excerpt"');
  });
  it("keeps additional unprocessed handoff words once at the bottom", () => {
    const r = record(); r.sourceText = `${r.draft.source_text}\n[MOCK] additional unprocessed words`;
    const html = renderToStaticMarkup(createElement(ReviewFields, { record: r, locale: "en", errors: [], onEdit: noop, onBatch: noop, onApprox: noop, onBlur: noop, locked: false }));
    expect(html.match(/additional unprocessed words/g)!.length).toBe(1);
  });
  it("renders parent-edited status and field errors connected to the input", () => {
    const r = editField(record(), "reporter.phone", "");
    const html = renderToStaticMarkup(createElement(ReviewFields, { record: r, locale: "en", errors: ["reporter.phone"], onEdit: noop, onBatch: noop, onApprox: noop, onBlur: noop, locked: false }));
    expect(html).toContain("Edited by you"); expect(html).toContain('aria-invalid="true"'); expect(html).toContain('aria-describedby="review-reporter.phone-error"');
  });
  it.each([[false, true, false], [true, false, false], [true, true, true]])("submit eligibility checked=%s valid=%s", (checked, valid, enabled) => {
    const html = renderToStaticMarkup(createElement(ConfirmBar, { locale: "bn", checked, valid, busy: false, blocked: false, onCheck: noop }));
    expect(html.includes('disabled=""')).toBe(!enabled);
    expect(html).toContain("আমি যাচাই করেছি"); expect(html).toContain("যাচাই করে জমা দিন");
  });
});


describe("R3 review accessibility markup", () => {
  it("every describedby resolves; age/time errors, edited statuses and sources render", () => {
    let r = record();
    r = editField(r, "child.age_years", "99"); r = editField(r, "event.at", "");
    const html = renderToStaticMarkup(createElement(ReviewFields, { record: r, locale: "en", errors: ["child.age_years", "event.at", "event.at_lower", "event.at_upper"], onEdit: noop, onBatch: noop, onApprox: noop, onBlur: noop, locked: false }));
    const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]));
    for (const m of html.matchAll(/aria-describedby="([^"]+)"/g)) for (const id of m[1].split(" ")) expect(ids.has(id), id).toBe(true);
    for (const path of ["child.age_years", "event.at", "event.at_lower", "event.at_upper"]) {
      expect(html).toContain(`id="review-${path}-error"`);
      expect(html).toMatch(new RegExp(`id="review-${path}"[^>]*aria-invalid="true"`));
    }
    expect(html.match(/Edited by you/g)!.length).toBeGreaterThanOrEqual(2);
    expect(html).toMatch(/<input[^>]+id="review-child.sex"/);
  });
  it("prefilled age and all time fields have full sources", () => {
    const html = renderToStaticMarkup(createElement(ReviewFields, { record: record(), locale: "en", errors: [], onEdit: noop, onBatch: noop, onApprox: noop, onBlur: noop, locked: false }));
    for (const path of ["child.age_years", "event.at", "event.at_lower", "event.at_upper"]) expect(html).toContain(`data-field-source="${path}"`);
  });
});


it("missing estimated age bounds show inline errors and unknown guidance", () => {
  const r = record(); r.draft.child.age_years = null; r.draft.child.age_min = 7; r.draft.child.age_max = null;
  const html = renderToStaticMarkup(createElement(ReviewFields, { record: r, locale: "en", errors: ["child.age_max"], onEdit: noop, onBatch: noop, onApprox: noop, onBlur: noop, locked: false }));
  expect(html).toContain('id="review-child.age_max-error"'); expect(html).toContain("Unknown — add");
});

it("an exact-age card exposes errors from inconsistent prefilled age bounds", () => {
  const r = record(); r.draft.child.age_years = 7; r.draft.child.age_min = 9; r.draft.child.age_max = 7;
  const html = renderToStaticMarkup(createElement(ReviewFields, { record: r, locale: "en", errors: ["child.age_max"], onEdit: noop, onBatch: noop, onApprox: noop, onBlur: noop, locked: false }));
  expect(html).toContain('id="review-child.age_years-error"');
  expect(html).toMatch(/id="review-child.age_years"[^>]*aria-invalid="true"/);
});

it.each([
  ["ঠিক জানি না। রাফি। ১০ বছর", "child.age_years", "১০", 10],
  ["বাবার তথ্য। পোশাক: নীল জামা", "child.clothing", "নীল জামা", "নীল জামা"],
] as const)("TASK-013 residual full context: %s", (text, path, quote, value) => {
  const r = record(); r.draft.source_text = text; r.sourceText = text;
  if (path === "child.age_years") r.draft.child.age_years = value as number;
  else r.draft.child.clothing = value as string;
  r.draft.evidence[path] = { start_utf16: text.indexOf(quote), end_utf16: text.indexOf(quote) + quote.length, quote, derivation: "direct" };
  const html = renderToStaticMarkup(createElement(ReviewFields, { record: r, locale: "bn", errors: [], onEdit: noop, onBatch: noop, onApprox: noop, onBlur: noop, locked: false }));
  const block = html.split(`data-field-source="${path}"`)[1]?.split("</div>")[0];
  expect(block?.replace(/<[^>]+>/g, "")).toContain(text);
  expect(block).toContain(`<mark class="rounded-xs bg-info-soft text-ink">${quote}</mark>`);
});
it("mock submission status has an icon as well as its visible label", () => {
  const html = renderToStaticMarkup(createElement(ConfirmBar, { locale: "bn", checked: true, valid: true, busy: false, blocked: false, mock: true, onCheck: noop }));
  expect(html).toMatch(/<p[^>]*role="status"[^>]*>.*?<svg/);
  expect(html).toContain("[MOCK]");
});

it("district is labelled MOCK and every unknown card invites adding a value", () => {
  const r = record(); r.draft.child.height_cm = null; r.draft.child.sex = "unknown";
  const html = renderToStaticMarkup(createElement(ReviewFields, { record: r, locale: "bn", errors: [], onEdit: noop, onBatch: noop, onApprox: noop, onBlur: noop, locked: false }));
  expect(html.split('id="review-event.district_code-label"')[1]?.split("</label>")[0]).toContain("[MOCK]");
  expect(html.split('for="review-child.height_cm"')[1]?.split("<input")[0]).toContain("অজানা — যোগ করুন");
  expect(html.split('id="review-child.sex"')[1]?.split("</label>")[0]).toContain("অজানা — যোগ করুন");
});

it("estimated age has full source beside both unedited bounds", () => {
  const r = record(); r.draft.child.age_years = null; r.draft.child.age_min = 7; r.draft.child.age_max = 9;
  const html = renderToStaticMarkup(createElement(ReviewFields, { record: r, locale: "en", errors: [], onEdit: noop, onBatch: noop, onApprox: noop, onBlur: noop, locked: false }));
  for (const path of ["child.age_min", "child.age_max"]) expect(html.split(`data-field-source="${path}"`)[1]?.split("</div>")[0].replace(/<[^>]+>/g, "")).toContain(r.draft.source_text);
});
