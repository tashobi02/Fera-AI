// TASK-025: SCREEN-005 lifecycle on the Node hook harness (no DOM). Hand-off pre-fill,
// [MOCK] honesty, inline required errors with no navigation, save → S-003, the
// attempted-draft guard and ACT-015 discard. Nothing here ever calls the server.
import type { FormEvent, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { caseDraftSchema } from "@/contracts";
import { clientExamples } from "@/contracts/client-examples";
import { createDeviceDraft, loadDraft, saveDraft, type DeviceDraft } from "@/lib/intake/draft-store";
import { clearIntakeMemory, handOff, REVIEW_PATH, type IntakeHandoff } from "@/lib/intake/handoff";
import { locales } from "@/locales";
import { content, elements, mountHooks } from "../../intake-ui/fakes/hook-harness";
import { memoryStorage } from "../review/storage";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), ...(await import("../../intake-ui/fakes/hook-harness")).testHooks }));
const { ManualForm } = await import("@/app/(parent)/intake/form/manual-form");
const { ReviewFields } = await import("@/app/(parent)/intake/review/review-fields");

const WORDS = "আমার মেয়ে মিতু, বয়স ৭ বছর। গতকাল বিকেলে বাস টার্মিনালের কাছে শেষ দেখা গেছে।";
const realDraft = caseDraftSchema.parse({ ...clientExamples.createMissingRequest.draft, event: { ...clientExamples.createMissingRequest.draft.event, district_text: null } });
const handoff = (over: Partial<IntakeHandoff> = {}): IntakeHandoff => ({
  to: "manual", sourceText: WORDS, missing: [], asked: 2, cached: false, mock: false,
  response: { ...clientExamples.extractResponse, draft: realDraft, expires_at: new Date(Date.now() + 60_000).toISOString() },
  ...over,
});
const node = (tree: ReactNode, type: unknown) => elements(tree).find((n) => n.type === type)!;
const next = (tree: ReactNode) => (node(tree, "form").props.onSubmit as (e: FormEvent) => void)({ preventDefault() {} } as FormEvent);
const recordOf = (tree: ReactNode) => node(tree, ReviewFields).props.record as DeviceDraft;
const edit = (tree: ReactNode, path: string, value: string) => (node(tree, ReviewFields).props.onEdit as (p: string, v: string) => void)(path, value);

let storage: ReturnType<typeof memoryStorage>;
let confirmAnswer = true;
beforeEach(() => {
  storage = memoryStorage();
  confirmAnswer = true;
  vi.stubGlobal("window", { localStorage: storage, confirm: () => confirmAnswer });
  vi.stubGlobal("document", { getElementById: () => null });
  push.mockClear();
  clearIntakeMemory();
});
afterEach(() => { clearIntakeMemory(); vi.unstubAllGlobals(); });
const mount = (locale: "bn" | "en" = "bn") => mountHooks(() => ManualForm({ locale }));

describe("SCREEN-005 manual form", () => {
  it("never calls the server", () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const h = mount(); next(h.tree); h.render();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("opens empty without a hand-off, with the synthetic warning and ACT-005 'পরের ধাপ'", () => {
    const h = mount();
    const text = content(h.tree);
    expect(text).toContain(locales.bn.manualFormTitle);
    expect(text).toContain(locales.bn.manualSyntheticNote);
    expect(text).toContain("পরের ধাপ");
    expect(recordOf(h.tree).draft.child.name).toBeNull();
    expect(loadDraft(storage)?.mock).toBe(false); // saved on the device as the parent's own draft
  });

  it("pre-fills a real AI hand-off and says so (TC-017)", () => {
    handOff(handoff()); const h = mount();
    expect(recordOf(h.tree).draft).toEqual(realDraft);
    expect(content(h.tree)).toContain(locales.bn.manualPrefilledAi);
  });

  it("drops [MOCK] values, keeps the parent's words and says so", () => {
    handOff(handoff({ mock: true })); const h = mount();
    const record = recordOf(h.tree);
    expect(record.draft.child.name).toBeNull();
    expect(record.edits["event.circumstances"]).toBe(WORDS);
    expect(record.mock).toBe(false);
    const text = content(h.tree);
    expect(text).toContain(locales.bn.manualMockNotUsed);
    expect(text).toContain(WORDS); // "আপনি যা লিখেছিলেন" block
  });

  it("shows inline required errors and does not navigate while fields are missing (E-001 inline)", () => {
    const h = mount(); next(h.tree); h.render();
    expect(push).not.toHaveBeenCalled();
    const text = content(h.tree);
    expect(text).toContain(locales.bn.reviewErrorSummary);
    expect(node(h.tree, ReviewFields).props.errors).toEqual(expect.arrayContaining(["event.place_text", "event.district_code", "reporter.phone"]));
  });

  it("saves every edit on the device and opens S-003 once the required fields are filled", () => {
    const h = mount();
    for (const [path, value] of [["child.age_years", "৭"], ["event.at", "2026-10-16T15:00:00+06:00"], ["event.at_lower", "2026-10-16T15:00:00+06:00"], ["event.at_upper", "2026-10-16T15:00:00+06:00"], ["event.place_text", "বাস টার্মিনালের কাছে"], ["event.district_code", "২৬"], ["reporter.phone", "০১৭০০০০০০০১"]]) {
      edit(h.tree, path!, value!); h.render();
    }
    expect(loadDraft(storage)?.edits["reporter.phone"]).toBe("০১৭০০০০০০০১");
    next(h.tree); h.render();
    expect(push).toHaveBeenCalledWith(REVIEW_PATH);
  });

  it("never overwrites an attempted submission: points to S-003 instead", () => {
    const attempted = { ...createDeviceDraft(handoff())!, attempted: true };
    saveDraft(attempted, storage);
    handOff(handoff({ mock: true })); const h = mount();
    expect(content(h.tree)).toContain(locales.bn.manualAttemptedPending);
    expect(elements(h.tree).some((n) => n.props.href === REVIEW_PATH)).toBe(true);
    expect(loadDraft(storage)?.client_submission_id).toBe(attempted.client_submission_id);
  });

  it("ACT-015 discard clears the device draft after confirmation and goes home; cancel keeps it", () => {
    const h = mount();
    const discard = () => (elements(h.tree).find((n) => n.type === "button" && content(n).includes(locales.bn.discardAction))!.props.onClick as () => void)();
    confirmAnswer = false; discard();
    expect(loadDraft(storage)).not.toBeNull(); expect(push).not.toHaveBeenCalled();
    confirmAnswer = true; discard();
    expect(loadDraft(storage)).toBeNull(); expect(push).toHaveBeenCalledWith("/");
  });

  it("explains in English mode that the draft text is the parent's (strings exist in both languages)", () => {
    const h = mount("en");
    expect(content(h.tree)).toContain(locales.en.manualFormTitle);
    expect(content(h.tree)).toContain("Next");
  });
});
