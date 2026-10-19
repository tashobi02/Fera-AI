import type { ChangeEvent, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { clientExamples } from "@/contracts/client-examples";
import type { DraftFieldPath } from "@/contracts";
import { createDeviceDraft } from "@/lib/intake/draft-store";
import { buildSubmission, editField } from "@/lib/intake/review";
import { localizeDigits } from "@/lib/numerals";
import { content, elements, mountHooks } from "../../intake-ui/fakes/hook-harness";
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), ...(await import("../../intake-ui/fakes/hook-harness")).testHooks }));
const { ReviewFields, ConfirmBar, DistrictSelect } = await import("@/app/(parent)/intake/review/review-fields");
function fixture() {
  const r = createDeviceDraft({ to: "review", response: clientExamples.extractResponse, sourceText: clientExamples.extractResponse.draft.source_text, missing: [], asked: 4, mock: false, cached: false })!;
  r.draft = { ...structuredClone(clientExamples.createMissingRequest.draft), event: { ...clientExamples.createMissingRequest.draft.event, district_text: null } };
  return r;
}
const input = (tree: ReactNode, id: string) => elements(tree).find(n => (n.type === "input" || n.type === "textarea") && n.props.id === id)!;
function change(tree: ReactNode, id: string, value: string) {
  const n = input(tree, id); expect(n, id).toBeDefined();
  (n.props.onChange as (e: ChangeEvent<HTMLInputElement>) => void)({ target: { value, checked: true } } as ChangeEvent<HTMLInputElement>);
}
function harness(r = fixture()) {
  let record = r;
  const h = mountHooks(() => ReviewFields({ record, locale: "bn", errors: [], locked: false, onBlur() {}, onEdit(p, v) { record = editField(record, p, v); }, onApprox(v) { record = { ...record, approximate: v }; }, onBatch(edits, approximate) { record = { ...record, edits: { ...record.edits, ...edits }, ...(approximate === undefined ? {} : { approximate }) }; } }));
  return { h, record: () => record };
}
describe("R3 age/time review controls", () => {
  it("always exposes all mandatory time inputs, even with missing bounds", () => {
    const r = fixture(); r.draft.event.at_lower = null; r.draft.event.at_upper = null;
    const { h } = harness(r);
    for (const p of ["event.at", "event.at_lower", "event.at_upper"]) expect(input(h.tree, `review-${p}`)).toBeDefined();
  });
  it("a parent with no prefilled age chooses estimate and submits Bangla 7–9 without an exact age", () => {
    const r = fixture(); r.draft.child.age_years = null; r.draft.child.age_min = null; r.draft.child.age_max = null;
    const { h, record } = harness(r);
    change(h.tree, "review-age-estimate", "estimate"); h.render();
    change(h.tree, "review-child.age_min", "৭"); h.render();
    change(h.tree, "review-child.age_max", "৯"); h.render();
    expect(buildSubmission(record(), true)?.draft.child).toMatchObject({ age_years: null, age_min: 7, age_max: 9 });
  });
  it.each([
    ["morning", "2025-01-31", "2025-01-31T06:00:00+06:00", "2025-01-31T12:00:00+06:00"],
    ["midday", "2025-01-31", "2025-01-31T12:00:00+06:00", "2025-01-31T15:00:00+06:00"],
    ["afternoon", "2025-01-31", "2025-01-31T15:00:00+06:00", "2025-01-31T18:00:00+06:00"],
    ["evening", "2025-01-31", "2025-01-31T18:00:00+06:00", "2025-01-31T20:00:00+06:00"],
    ["night", "2025-01-31", "2025-01-31T20:00:00+06:00", "2025-02-01T06:00:00+06:00"],
    ["night", "2025-12-31", "2025-12-31T20:00:00+06:00", "2026-01-01T06:00:00+06:00"],
  ])("date + %s maps bounds across %s", (part, date, lower, upper) => {
    const { h, record } = harness();
    change(h.tree, "review-event.date", localizeDigits(date, "bn")); h.render();
    change(h.tree, `review-event.part-${part}`, part); h.render();
    expect(record().approximate).toBe(true);
    const body = buildSubmission(record(), true);
    expect(body?.draft.event).toMatchObject({ at: lower, at_lower: lower, at_upper: upper, at_approx: true });
    for (const p of ["event.at", "event.at_lower", "event.at_upper"] as DraftFieldPath[]) {
      const n = input(h.tree, `review-${p}`); expect(n.props.disabled).toBe(false);
      expect(n.props.value).not.toMatch(/[0-9]/);
    }
    change(h.tree, "review-event.at_upper-time", "০৫:০০"); h.render();
    expect(record().edits["event.at_upper"]).toContain("T05:00:00+06:00");
  });
  it("selecting a chip before entering the date also maps the range", () => {
    const { h, record } = harness();
    change(h.tree, "review-event.part-night", "night"); h.render();
    change(h.tree, "review-event.date", "২০২৫-১২-৩১"); h.render();
    expect(buildSubmission(record(), true)?.draft.event.at_upper).toBe("2026-01-01T06:00:00+06:00");
  });
});


it("invalid calendar dates do not silently normalize or change the draft", () => {
  const { h, record } = harness(); const before = record();
  change(h.tree, "review-event.date", "২০২৫-০২-৩০"); h.render();
  change(h.tree, "review-event.part-night", "night"); h.render();
  expect(record()).toEqual(before);
});

it("editing a prefilled exact age clears old normalized bounds before submission", () => {
  const r = fixture(); r.draft.child.age_years = 11; r.draft.child.age_min = 11; r.draft.child.age_max = 11;
  const { h, record } = harness(r);
  change(h.tree, "review-child.age_years", "৭"); h.render();
  expect(buildSubmission(record(), true)?.draft.child).toMatchObject({ age_years: 7, age_min: 7, age_max: 7 });
});


it("each mandatory time has localized date and HH:mm controls with composed Dhaka offset", () => {
  const { h, record } = harness();
  for (const path of ["event.at", "event.at_lower", "event.at_upper"]) {
    expect(input(h.tree, `review-${path}`).props.value).toMatch(/^[০-৯]{4}-[০-৯]{2}-[০-৯]{2}$/);
    expect(input(h.tree, `review-${path}-time`).props.value).toMatch(/^[০-৯]{2}:[০-৯]{2}$/);
    change(h.tree, `review-${path}`, "২০২৫-০১-৩১"); h.render();
    change(h.tree, `review-${path}-time`, "০৫:৪৫"); h.render();
    expect(record().edits[path as DraftFieldPath]).toBe("2025-01-31T05:45:00+06:00");
  }
  expect(content(h.tree)).not.toContain("T০৬:০০:০০+");
});
it("a chip date entered without a chip says plainly that it has not been applied", () => {
  const { h, record } = harness(); const before = record();
  change(h.tree, "review-event.date", "২০২৫-১২-৩১"); h.render();
  expect(record()).toEqual(before);
  expect(content(h.tree)).toContain("এই তারিখ এখনো প্রয়োগ হয়নি");
});
it("night clamps its future upper bound to now and displays clarification (BR-016)", () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2026-10-16T22:15:00+06:00"));
    const { h, record } = harness();
    change(h.tree, "review-event.date", "২০২৬-১০-১৬"); h.render();
    change(h.tree, "review-event.part-night", "night"); h.render();
    expect(record().edits["event.at_upper"]).toBe("2026-10-16T22:15:00+06:00");
    expect(record().edits["event.at_lower"]).toBe("2026-10-16T20:00:00+06:00");
    expect(content(h.tree)).toContain("ভবিষ্যতের অংশ বাদ দিয়ে");
    expect(buildSubmission(record(), true)?.draft.event.at_upper).toBe("2026-10-16T22:15:00+06:00");
  } finally { vi.useRealTimers(); }
});

it("HH:mm can be cleared and typed one character at a time without suffix leakage", () => {
  const { h, record } = harness();
  const id = "review-event.at-time";
  expect(input(h.tree, id).props.inputMode).toBe("text");
  for (const value of ["", "০", "০৯", "০৯:", "০৯:৩", "০৯:৩০"]) {
    change(h.tree, id, value); h.render();
    expect(input(h.tree, id).props.value).toBe(value);
    expect(input(h.tree, id).props["aria-invalid"]).toBeUndefined();
  }
  expect(record().edits["event.at"]).toContain("T09:30:00+06:00");
});

it("entering a date on an empty bound keeps its clock empty until typed", () => {
  const r = fixture(); r.draft.event.at_upper = null;
  const { h, record } = harness(r);
  change(h.tree, "review-event.at_upper", "২০২৫-১২-৩১"); h.render();
  expect(input(h.tree, "review-event.at_upper-time").props.value).toBe("");
  for (const value of ["০", "০৬", "০৬:", "০৬:০", "০৬:০০"]) {
    change(h.tree, "review-event.at_upper-time", value); h.render();
    expect(input(h.tree, "review-event.at_upper-time").props.value).toBe(value);
  }
  expect(record().edits["event.at_upper"]).toBe("2025-12-31T06:00:00+06:00");
});

describe("Polish round 2026-10-16 (TASK-022)", () => {
  it("PR3: a newline typed into name or place is stripped, never stored", () => {
    const { h, record: get } = harness();
    change(h.tree, "review-child.name", "রাফি\nমিম"); h.render();
    expect(get().edits["child.name"]).toBe("রাফিমিম");
    expect(get().edits["child.name"]).not.toMatch(/[\r\n]/);
    const { h: h2, record: get2 } = harness();
    change(h2.tree, "review-event.place_text", "স্কুলের সামনে\nবটতলা"); h2.render();
    expect(get2().edits["event.place_text"]).toBe("স্কুলের সামনেবটতলা");
    expect(get2().edits["event.place_text"]).not.toMatch(/[\r\n]/);
  });
  it("PR3: name, phone and place are inputs; phone carries tel attributes", () => {
    const { h } = harness();
    for (const id of ["review-child.name", "review-reporter.phone", "review-event.place_text"]) {
      const n = input(h.tree, id);
      expect(n.type, id).toBe("input");
    }
    const phone = input(h.tree, "review-reporter.phone");
    expect(phone.props.inputMode).toBe("tel");
    expect(phone.props.autoComplete).toBe("tel");
  });
  it("records a selected district code for the final reviewed submission", () => {
    const { h, record } = harness();
    const district = elements(h.tree).find(n => typeof n.type === "function" && n.type.name === "DistrictSelect");
    expect(district).toBeDefined();
    (district!.props.onChange as (value: string) => void)("17");
    h.render();
    expect(record().edits["event.district_code"]).toBe("17");
    expect(buildSubmission(record(), true)?.draft.event.district_code).toBe(17);
  });
  it("finds a district by an English alias in Bangla mode and lets the parent clear it", () => {
    const { h, record } = harness();
    let search = "";
    const picker = mountHooks(() => DistrictSelect({ id: "review-event.district_code", value: "17", search, disabled: false, required: true, invalid: false, locale: "bn", onChange() {}, onSearch(next) { search = next; }, onBlur() {} }));
    change(picker.tree, "review-event.district_code-search", "Chittagong"); picker.render();
    const options = elements(picker.tree).filter(n => n.type === "option" && n.props.value !== "");
    expect(options).toHaveLength(2); // matching alias and the currently selected district
    expect(options.some(n => content(n).includes("Chittagong"))).toBe(true);
    expect(content(picker.tree)).toContain("১টি জেলা মিলেছে।");
    const district = elements(h.tree).find(n => typeof n.type === "function" && n.type.name === "DistrictSelect");
    expect(district).toBeDefined();
    (district!.props.onChange as (value: string) => void)("");
    h.render();
    expect(record().edits["event.district_code"]).toBe("");
    expect(buildSubmission(record(), true)).toBeNull();
  });
});

it("PR4: publishes the measured bar height as --sticky-bottom, tracks resizes, restores the root style on unmount", () => {
  const observe = vi.fn(), disconnect = vi.fn(), rootSet = vi.fn(), rootRemove = vi.fn();
  let position = "sticky", height = 73, resize!: () => void;
  vi.stubGlobal("document", { documentElement: { style: { setProperty: rootSet, removeProperty: rootRemove, getPropertyValue: () => "8px", getPropertyPriority: () => "" } } });
  vi.stubGlobal("getComputedStyle", () => ({ position }));
  vi.stubGlobal("ResizeObserver", class { constructor(cb: () => void) { resize = cb; } observe = observe; disconnect = disconnect; });
  try {
    const h = mountHooks(() => ConfirmBar({ locale: "bn", checked: false, valid: true, busy: false, blocked: false, onCheck() {} }));
    const bar = elements(h.tree).find(n => "data-review-sticky-bar" in n.props)!;
    const element = { getBoundingClientRect: () => ({ height }) };
    (bar.props.ref as { current: unknown }).current = element;
    h.replayEffects();
    expect(observe).toHaveBeenCalledWith(element, { box: "border-box" });
    expect(rootSet).toHaveBeenLastCalledWith("--sticky-bottom", "73px");
    height = 153; resize();
    expect(rootSet).toHaveBeenLastCalledWith("--sticky-bottom", "153px");
    position = "static"; resize();
    expect(rootSet).toHaveBeenLastCalledWith("--sticky-bottom", "0px");
    h.unmount();
    expect(disconnect).toHaveBeenCalled();
    expect(rootSet).toHaveBeenLastCalledWith("--sticky-bottom", "8px", "");
  } finally { vi.unstubAllGlobals(); }
});

it("PR4: unmount removes --sticky-bottom when there was no previous value", () => {
  const rootRemove = vi.fn();
  vi.stubGlobal("document", { documentElement: { style: { setProperty() {}, removeProperty: rootRemove, getPropertyValue: () => "", getPropertyPriority: () => "" } } });
  vi.stubGlobal("getComputedStyle", () => ({ position: "sticky" }));
  try {
    const h = mountHooks(() => ConfirmBar({ locale: "en", checked: false, valid: true, busy: false, blocked: false, onCheck() {} }));
    (elements(h.tree).find(n => "data-review-sticky-bar" in n.props)!.props.ref as { current: unknown }).current = { getBoundingClientRect: () => ({ height: 70 }) };
    h.replayEffects(); h.unmount();
    expect(rootRemove).toHaveBeenCalledWith("--sticky-bottom");
  } finally { vi.unstubAllGlobals(); }
});
