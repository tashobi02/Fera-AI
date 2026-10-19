// P3-013: SCREEN-005 manual form lifecycle (TASK-025; D3 SCREEN-005, FR-026, TC-017).
// The form is a thin, maintainable path over S-003: it reuses review fields,
// validation and the same submit seam, but it works with no handoff and no
// stored draft. Empty fields stay unknown; the submitter blocks on a review
// checkbox and on validation.
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientExamples } from "@/contracts/client-examples";
import { errorEnvelope, type DraftFieldPath } from "@/contracts";
import { clearIntakeMemory, handOff, takeHandoff } from "@/lib/intake/handoff";
import { DRAFT_KEY, clearDraft, createDeviceDraft, loadDraft, saveDraft } from "@/lib/intake/draft-store";
import { buildSubmission, editField, validateReview } from "@/lib/intake/review";
import { localizeDigits } from "@/lib/numerals";
import { locales } from "@/locales";
import { button, click, content, elements, mountHooks, settle } from "./fakes/hook-harness";
import { memoryStorage } from "../intake/review/storage";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), ...(await import("./fakes/hook-harness")).testHooks }));
const { ManualFormScreen } = await import("@/app/(parent)/intake/form/manual-form");
const { ReviewFields, ConfirmBar } = await import("@/app/(parent)/intake/review/review-fields");

function handoff() {
  return {
    to: "review" as const,
    sourceText: clientExamples.createMissingRequest.draft.source_text,
    response: { ...clientExamples.extractResponse, expires_at: new Date(Date.now() + 60_000).toISOString() },
    missing: [],
    asked: 4,
    cached: false,
    mock: false,
  };
}
function node<P extends object>(tree: ReactNode, type: React.ElementType<P>): ReactElement<P> {
  const found = elements(tree).find((element) => element.type === type);
  if (!found) throw new Error(`Element not found: ${String(type)}`);
  return found as ReactElement<P>;
}
function confirm(tree: ReactNode) { node(tree, ConfirmBar).props.onCheck(true); }
function submit(tree: ReactNode) {
  const event = { preventDefault() {} } as Parameters<NonNullable<ComponentProps<"form">["onSubmit"]>>[0];
  node<ComponentProps<"form">>(tree, "form").props.onSubmit?.(event);
}

let storage: ReturnType<typeof memoryStorage>;
beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal("window", { localStorage: storage, confirm: () => true });
  vi.stubGlobal("document", { getElementById: () => null });
  push.mockClear();
  clearIntakeMemory();
});
afterEach(() => { clearIntakeMemory(); vi.unstubAllGlobals(); });

function mount() { return mountHooks(() => ManualFormScreen({ locale: "bn" })); }
const minimumManualEdits: readonly (readonly [DraftFieldPath, string])[] = [
  ["child.name", "মীম"],
  ["child.clothing", "[MOCK] parent edit"],
  ["child.age_years", "7"],
  ["event.place_text", "স্কুলের কাছে"],
  ["event.district_code", "26"],
  ["event.at", "2025-10-12T16:00:00+06:00"],
  ["event.at_lower", "2025-10-12T16:00:00+06:00"],
  ["event.at_upper", "2025-10-12T16:00:00+06:00"],
  ["reporter.phone", "01700000001"],
];
function edit(h: ReturnType<typeof mount>, path: DraftFieldPath, value: string) {
  node(h.tree, ReviewFields).props.onEdit(path, value);
  h.render();
}
function fillMinimumManualEntry(h: ReturnType<typeof mount>) {
  for (const [path, value] of minimumManualEdits) edit(h, path, value);
}
function completeManualRecord() {
  const record = createDeviceDraft(handoff());
  if (!record) throw new Error("Expected the test handoff to produce a device draft");
  return minimumManualEdits.reduce((current, [path, value]) => editField(current, path, value), record);
}

describe("SCREEN-005 manual form lifecycle (P3-013 / TASK-025 / FR-026 / TC-017)", () => {
  it("mounts with an empty device-local draft when there is no handoff and no stored draft", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const h = mount();
    expect(node(h.tree, ReviewFields)).toBeDefined();
    const record = node(h.tree, ReviewFields).props.record as { draft: { source_text: string; child: { sex: string } }; client_submission_id: string };
    // Empty, unknown fields: every contract path is null except the boolean/time markers.
    expect(record.draft.source_text).toBe("");
    expect(record.draft.child.sex).toBe("unknown");
    expect(node(h.tree, ConfirmBar).props.valid).toBe(false);
    expect(content(h.tree)).toContain(locales.bn.manualFormTitle);
    expect(content(h.tree)).toContain(locales.bn.manualFormIntro);
    expect(content(h.tree)).toContain(locales.bn.syntheticBadge);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["", "[MOCK] typed report kept after E-023"])("TC-017/036: a text-only manual handoff creates editable unknown fields (%s)", (sourceText) => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    handOff({ ...handoff(), to: "manual", response: null, sourceText });
    const h = mount();
    const record = node(h.tree, ReviewFields).props.record;
    expect(record.sourceText).toBe(sourceText);
    expect(record.draft.source_text).toBe(sourceText);
    expect(record.draft.child).toMatchObject({ name: null, sex: "unknown", age_years: null });
    expect(record.draft.event).toMatchObject({ district_code: null, place_text: null, at: null });
    expect(record.draft.evidence).toEqual({});
    expect(record.draftToken).toBeUndefined();
    expect(node(h.tree, ConfirmBar).props.valid).toBe(false);
    expect(loadDraft(storage)?.sourceText).toBe(sourceText);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("shows the retained original text even when every structured field is unknown", () => {
    const sourceText = "[MOCK] first extraction failed, keep these words visible";
    handOff({ ...handoff(), to: "manual", response: null, sourceText });
    const h = mount();
    const props = node(h.tree, ReviewFields).props;
    const fields = mountHooks(() => ReviewFields(props));
    expect(content(fields.tree)).toContain(sourceText);
    expect(content(fields.tree)).toContain(locales.bn.reviewSource);
  });

  it("keeps the full text-only handoff locally when source history exceeds the submission text limit", () => {
    const sourceText = "[MOCK] " + "ক".repeat(5000);
    handOff({ ...handoff(), to: "manual", response: null, sourceText });
    const h = mount();
    expect(node(h.tree, ReviewFields).props.record.sourceText).toBe(sourceText);
    expect(loadDraft(storage)?.sourceText).toBe(sourceText);
    expect(node(h.tree, ReviewFields).props.record.draft.source_text.length).toBeLessThanOrEqual(4000);
  });

  it("requires explicit replacement before a text-only handoff can replace an attempted submission", () => {
    const earlier = { ...completeManualRecord(), attempted: true };
    saveDraft(earlier, storage);
    const sourceText = "[MOCK] new manual report";
    handOff({ ...handoff(), to: "manual", response: null, sourceText });
    const h = mount();
    expect(content(h.tree)).toContain(locales.bn.earlierDraftFound);
    expect(loadDraft(storage)?.client_submission_id).toBe(earlier.client_submission_id);
    click(button(h.tree, locales.bn.earlierDraftReplace)); h.render();
    const dialog = elements(h.tree).find((e) => e.props["aria-labelledby"] === "manual-replace-title");
    if (!dialog) throw new Error("expected replacement dialog");
    click(button(dialog, locales.bn.discardYes)); h.render();
    expect(node(h.tree, ReviewFields).props.record.sourceText).toBe(sourceText);
    expect(loadDraft(storage)?.attempted).toBe(false);
    expect(loadDraft(storage)?.client_submission_id).not.toBe(earlier.client_submission_id);
  });

  it("writes the empty draft to device storage on mount so a refresh restores it", () => {
    const h = mount();
    const stored = loadDraft(storage);
    expect(stored).not.toBeNull();
    expect(stored?.draft.source_text).toBe("");
    expect(stored?.attempted).toBe(false);
  });

  // SYS-BUG-01 / SYS-BUG-10 regression: a handoff with no extract response
  // (e.g. extraction failed or was never attempted) used to produce null from
  // createDeviceDraft(), which left the manual form with no editable record.
  // The form now retains the source text and an empty, editable draft.
  it("retains sourceText and an editable draft when the handoff has no extract response (SYS-BUG-01/10)", () => {
    const text = "আমার মেয়ে হারিয়ে গেছে, কাল সন্ধ্যায়";
    handOff({
      to: "manual",
      sourceText: text,
      response: null,
      missing: [],
      asked: 0,
      cached: false,
      mock: false,
    });
    const record = createDeviceDraft(takeHandoff()!);
    expect(record).not.toBeNull();
    expect(record?.sourceText).toBe(text);
    expect(record?.draft.source_text).toBe(text);
    expect(record?.draftToken).toBeUndefined();
    // Every structured field stays unknown; the parent fills by hand.
    expect(record?.draft.child.name).toBeNull();
    expect(record?.draft.event.district_code).toBeNull();
    expect(record?.mock).toBe(false);
  });

  it("restores a previously edited manual draft from device storage with the same UUID", () => {
    // First mount: edit a field so the UUID is persisted.
    const first = mount();
    const idBefore = node(first.tree, ReviewFields).props.record.client_submission_id as string;
    (node(first.tree, ReviewFields).props.onEdit as (p: string, v: string) => void)("child.clothing", "[MOCK] parent edit");
    first.render();
    expect(loadDraft(storage)?.edits["child.clothing"]).toBe("[MOCK] parent edit");
    first.unmount();
    // Second mount: same UUID, edit preserved.
    const second = mount();
    expect(node(second.tree, ReviewFields).props.record.client_submission_id).toBe(idBefore);
    expect((node(second.tree, ReviewFields).props.record as { edits: Record<string, string> }).edits["child.clothing"]).toBe("[MOCK] parent edit");
  });

  it("consumes a handoff exactly once and adopts the extracted draft over a stored empty one", () => {
    // The hand-off replaces the freshly written empty draft with the extracted
    // one. The form is then re-anchored on that draft's UUID.
    const first = mount();
    const emptyId = node(first.tree, ReviewFields).props.record.client_submission_id as string;
    handOff(handoff());
    const second = mount();
    const next = node(second.tree, ReviewFields).props.record as { client_submission_id: string; sourceText: string };
    expect(next.client_submission_id).not.toBe(emptyId);
    expect(next.sourceText).toBe(handoff().sourceText);
    // The pending handoff is then consumed; mounting again with no handoff
    // should fall back to the now-stored extracted record, not a new empty draft.
    second.unmount();
    const third = mount();
    expect(node(third.tree, ReviewFields).props.record.client_submission_id).toBe(next.client_submission_id);
  });

  it("blocks the submit button before the parent checks the review box and never dispatches without it", () => {
    const h = mount();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    fillMinimumManualEntry(h);
    submit(h.tree);
    h.render();
    expect(fetcher).not.toHaveBeenCalled();
    expect(node(h.tree, ConfirmBar).props.checked).toBe(false);
    // The form remains usable; it does not silently drop the parent's text.
    expect(loadDraft(storage)?.edits["child.clothing"]).toBe("[MOCK] parent edit");
  });

  it("sends a complete parent-reviewed manual entry to API-003 with the device-local UUID", async () => {
    const h = mount();
    const fetcher = vi.fn().mockResolvedValue(Response.json(clientExamples.createMissingResponse));
    vi.stubGlobal("fetch", fetcher);
    fillMinimumManualEntry(h);
    confirm(h.tree); h.render();
    submit(h.tree); await settle(); h.render();
    expect(fetcher).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.draft.child.name).toBe("মীম");
    expect(body.draft.child.age_years).toBe(7);
    expect(body.draft.reporter.phone).toBe("01700000001");
    expect(body.confirmed).toBe(true);
    // The device-local draft is cleared on a 2xx and the success card is shown.
    expect(loadDraft(storage)).toBeNull();
    expect(content(h.tree)).toContain(localizeDigits(clientExamples.createMissingResponse.ref_code, "bn"));
    expect(content(h.tree)).toContain(locales.bn.reviewOpenReport);
  });

  it("retries the same UUID and payload when the server returns E-021 and refuses a double submit", async () => {
    const h = mount();
    const fetcher = vi.fn().mockResolvedValue(Response.json(errorEnvelope("E-021"), { status: 500 }));
    vi.stubGlobal("fetch", fetcher);
    fillMinimumManualEntry(h);
    confirm(h.tree); h.render();
    submit(h.tree); submit(h.tree); await settle(); h.render();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(node(h.tree, ReviewFields).props.locked).toBe(true);
    submit(h.tree); await settle(); h.render();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[0][1].body);
  });

  it("keeps the parent's typed text on E-001 validation errors and unlocks correction", async () => {
    const h = mount();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(errorEnvelope("E-001", { fields: ["reporter.phone"] }), { status: 400 })));
    (node(h.tree, ReviewFields).props.onEdit as (p: string, v: string) => void)("child.clothing", "[MOCK] parent edit");
    h.render(); confirm(h.tree); h.render(); submit(h.tree); await settle(); h.render();
    expect(node(h.tree, ReviewFields).props.errors).toContain("reporter.phone");
    expect(node(h.tree, ReviewFields).props.locked).toBe(false);
    expect((node(h.tree, ReviewFields).props.record as { edits: Record<string, string> }).edits["child.clothing"]).toBe("[MOCK] parent edit");
  });

  it("mounted mock guard: a stored mock:true manual draft never fetches on submit", async () => {
    // A mock draft can land in storage via the previous-intake-session handoff.
    const r = createDeviceDraft({ ...handoff(), mock: true })!;
    saveDraft(r, storage);
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const h = mount(); confirm(h.tree); h.render(); submit(h.tree); await settle(); h.render();
    expect(fetcher).not.toHaveBeenCalled();
    expect(loadDraft(storage)?.attempted).toBe(false);
  });

  it("clears the device draft on confirmed discard and refuses if the parent cancels the confirm", () => {
    handOff(handoff()); const h = mount();
    // 1) Open the dialog and cancel — nothing mutates.
    click(button(h.tree, locales.bn.reviewDiscardDevice)); h.render();
    click(button(h.tree, locales.bn.discardNo)); h.render();
    expect(loadDraft(storage)).not.toBeNull();
    // 2) Open the dialog and confirm — draft clears and router pushes.
    click(button(h.tree, locales.bn.reviewDiscardDevice)); h.render();
    click(button(h.tree, locales.bn.discardYes)); h.render();
    expect(loadDraft(storage)).toBeNull();
    expect(push).toHaveBeenCalledWith("/intake");
  });

  it("ignores a corrupt attempted record on mount and lets the parent clear it explicitly", () => {
    const r = { ...createDeviceDraft(handoff())!, attempted: true, version: 2 };
    storage.setItem(DRAFT_KEY, JSON.stringify(r));
    const h = mount();
    expect(content(h.tree)).toContain(locales.bn.reviewCorruptAttempted);
    expect(storage.getItem(DRAFT_KEY)).toBe(JSON.stringify(r));
    expect(elements(h.tree).some((element) => element.type === "form")).toBe(false);
    click(button(h.tree, locales.bn.reviewDiscardDevice)); h.render();
    click(button(h.tree, locales.bn.discardYes)); h.render();
    expect(storage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("treats empty fields as unknown: nothing is sent unless the parent fills it in", () => {
    const r = buildSubmission(editField(completeManualRecord(), "child.clothing", ""), true);
    // The edited "" value is omitted from the payload, matching S-003's
    // "unknown stays unknown" rule for the manual form.
    expect(r).not.toBeNull();
    expect(r?.draft.child.clothing).toBeNull();
  });

  it("rejects a manual submit that does not satisfy the contract: empty fields stay unknown", () => {
    const r = createDeviceDraft(handoff())!;
    const errors = validateReview(r);
    // A fresh intake draft with no phone / no place / no district / no time
    // fails review validation, so the form must show a missing-field summary.
    expect(errors.length).toBeGreaterThan(0);
  });
});
