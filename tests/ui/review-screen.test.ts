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
  it("lists all 64 districts with bilingual names, search, and a clearable unknown choice", () => {
    const r = record();
    const bn = renderToStaticMarkup(createElement(ReviewFields, { record: r, locale: "bn", errors: [], onEdit: noop, onBatch: noop, onApprox: noop, onBlur: noop, locked: false }));
    const en = renderToStaticMarkup(createElement(ReviewFields, { record: r, locale: "en", errors: [], onEdit: noop, onBatch: noop, onApprox: noop, onBlur: noop, locked: false }));
    for (const [locale, html] of [["bn", bn], ["en", en]] as const) {
      const select = html.split('<select id="review-event.district_code"')[1]?.split("</select>")[0];
      expect(select).toBeDefined();
      expect(select!.match(/<option /g)).toHaveLength(65);
      expect(select).toContain('<option value=""');
      expect(select).not.toContain('<option value="" disabled');
      expect(html).toContain('id="review-event.district_code-search"');
      expect(select).toContain(locale === "bn" ? "চট্টগ্রাম / Chattogram / Chittagong" : "Chattogram / চট্টগ্রাম / Chittagong");
    }
    expect(bn).toContain('lang="bn"');
    expect(bn).toContain("(১৭)");
    expect(en).toContain('lang="en"');
    expect(en).toContain("(17)");
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

it("district has a named select and every unknown card invites adding a value", () => {
  const r = record(); r.draft.child.height_cm = null; r.draft.child.sex = "unknown";
  const html = renderToStaticMarkup(createElement(ReviewFields, { record: r, locale: "bn", errors: [], onEdit: noop, onBatch: noop, onApprox: noop, onBlur: noop, locked: false }));
  expect(html).toContain('<select id="review-event.district_code"');
  expect(html.split('id="review-event.district_code-label"')[1]?.split("</label>")[0]).not.toContain("[MOCK]");
  expect(html.split('for="review-child.height_cm"')[1]?.split("<input")[0]).toContain("অজানা — যোগ করুন");
  // Polish round: the sex radio's empty option now uses the plain "অজানা" label
  // (item 1), not the "add" copy that empty text inputs keep.
  const sexEmpty = html.split('id="review-child.sex"')[1]?.split("</label>")[0];
  expect(sexEmpty).toContain("অজানা");
  expect(sexEmpty).not.toContain("অজানা — যোগ করুন");
});

it("estimated age has full source beside both unedited bounds", () => {
  const r = record(); r.draft.child.age_years = null; r.draft.child.age_min = 7; r.draft.child.age_max = 9;
  const html = renderToStaticMarkup(createElement(ReviewFields, { record: r, locale: "en", errors: [], onEdit: noop, onBatch: noop, onApprox: noop, onBlur: noop, locked: false }));
  for (const path of ["child.age_min", "child.age_max"]) expect(html.split(`data-field-source="${path}"`)[1]?.split("</div>")[0].replace(/<[^>]+>/g, "")).toContain(r.draft.source_text);
});

describe("Polish round 2026-10-16 (TASK-022)", () => {
  it("PR1: sex radio unknown option is plain অজানা / Unknown, not অজানা — যোগ করুন", () => {
    for (const locale of ["bn", "en"] as const) {
      const r = record(); r.draft.child.sex = "unknown" as typeof r.draft.child.sex;
      const html = renderToStaticMarkup(createElement(ReviewFields, { record: r, locale, errors: [], onEdit: noop, onBatch: noop, onApprox: noop, onBlur: noop, locked: false }));
      const sexBlock = html.split('id="review-child.sex"')[1]?.split("</fieldset>")[0];
      expect(sexBlock, locale).toBeDefined();
      const label = locale === "bn" ? "অজানা" : "Unknown";
      const wrong = locale === "bn" ? "অজানা — যোগ করুন" : "Unknown — add";
      expect(sexBlock).toContain(`>${label}<`);
      expect(sexBlock).not.toContain(wrong);
    }
  });
  it("PR2: chip date label is the long form, group dates use the short label exactly once each", () => {
    for (const locale of ["bn", "en"] as const) {
      const r = record();
      const html = renderToStaticMarkup(createElement(ReviewFields, { record: r, locale, errors: [], onEdit: noop, onBatch: noop, onApprox: noop, onBlur: noop, locked: false }));
      const longLabel = locale === "bn" ? "শেষবার দেখার তারিখ" : "Date last seen";
      const shortLabel = locale === "bn" ? "তারিখ" : "Date";
      // The chip date label precedes `for="review-event.date"`.
      const chipLabelMatch = new RegExp(`<label[^>]*for="review-event\\.date"[^>]*>${longLabel}</label>`).exec(html);
      expect(chipLabelMatch, locale).not.toBeNull();
      // Each of the three group dates uses the short label inside its fieldset.
      for (const path of ["event.at", "event.at_lower", "event.at_upper"]) {
        const shortLabelMatch = new RegExp(`<label[^>]*for="review-${path.replace(/\./g, "\\.")}"[^>]*>${shortLabel}</label>`).exec(html);
        expect(shortLabelMatch, `${path} ${locale}`).not.toBeNull();
      }
      // The long label appears only for the chip date.
      expect(html.match(new RegExp(longLabel, "g"))?.length ?? 0).toBe(1);
      // The short label appears at least three times for the three group dates.
      expect(html.match(new RegExp(`>${shortLabel}<`, "g"))?.length ?? 0).toBeGreaterThanOrEqual(3);
    }
  });
  it("PR3: name, phone and place are inputs; district is a select", () => {
    const r = record();
    const html = renderToStaticMarkup(createElement(ReviewFields, { record: r, locale: "en", errors: [], onEdit: noop, onBatch: noop, onApprox: noop, onBlur: noop, locked: false }));
    for (const path of ["child.name", "reporter.phone", "event.place_text"]) {
      const tag = new RegExp(`<(input|textarea)[^>]*id="review-${path.replace(/\./g, "\\.")}"`).exec(html);
      expect(tag, path).toBeDefined();
      expect(tag![1], path).toBe("input");
    }
    expect(html).toContain('<select id="review-event.district_code"');
    // The phone input is a self-closing tag; renderToStaticMarkup expands it to <input ...></input>.
    const phoneBlock = html.match(/<input\b[^>]*id="review-reporter\.phone"[^>]*>(?:<\/input>)?/)?.[0];
    expect(phoneBlock).toBeDefined();
    expect(phoneBlock).toMatch(/inputmode="tel"/i);
    expect(phoneBlock).toMatch(/autocomplete="tel"/i);
  });
  it("PR4: one responsive submit bar escapes the confirmation card; checkbox stays in flow", () => {
    const html = renderToStaticMarkup(createElement(ConfirmBar, { locale: "en", checked: true, valid: true, busy: false, blocked: false, onCheck: noop }));
    const sticky = html.split('data-review-sticky-bar')[1]?.split("</div>")[0];
    expect(sticky).toBeDefined();
    expect(html.match(/<button[^>]*type="submit"/g)).toHaveLength(1);
    // display:contents removes the short containing box only below 600px.
    expect(html.split('data-review-sticky-bar')[0]).toContain("max-[599px]:contents");
    expect(sticky).toContain("max-[599px]:sticky");
    expect(sticky).toContain("max-[599px]:bottom-0");
    expect(sticky).toContain("min-[600px]:contents");
    expect(sticky).toContain("safe-area-inset-bottom");
    expect(sticky).not.toContain('type="checkbox"');
    expect(sticky).not.toContain("I have checked");
    expect(html.indexOf('type="checkbox"')).toBeLessThan(html.indexOf('data-review-sticky-bar'));
    const submit = html.match(/<button[^>]*type="submit"[^>]*>/)![0];
    expect(submit).toMatch(/min-h-(?:11|12)\b/);
    expect(submit).not.toContain("min-[600px]:block");
  });
});
