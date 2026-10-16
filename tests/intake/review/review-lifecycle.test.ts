import type { FormEvent, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientExamples } from "@/contracts/client-examples";
import { caseDraftSchema, errorEnvelope } from "@/contracts";
import { clearIntakeMemory, handOff, noticeAcknowledged, acknowledgeNotice, takeHandoff } from "@/lib/intake/handoff";
import { clearDraft, createDeviceDraft, loadDraft, saveDraft } from "@/lib/intake/draft-store";
import { buildSubmission, editField } from "@/lib/intake/review";
import { localizeDigits } from "@/lib/numerals";
import { locales } from "@/locales";
import { button, click, content, elements, mountHooks, settle } from "../../intake-ui/fakes/hook-harness";
import { memoryStorage } from "./storage";
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), ...(await import("../../intake-ui/fakes/hook-harness")).testHooks }));
const { ReviewScreen } = await import("@/app/(parent)/intake/review/review-screen");
const { ReviewFields, ConfirmBar } = await import("@/app/(parent)/intake/review/review-fields");
function handoff() {
  return { to: "review" as const, sourceText: clientExamples.createMissingRequest.draft.source_text, response: { ...clientExamples.extractResponse, draft: caseDraftSchema.parse({ ...clientExamples.createMissingRequest.draft, event: { ...clientExamples.createMissingRequest.draft.event, district_text: null } }), expires_at: new Date(Date.now() + 60_000).toISOString() }, missing: [], asked: 4, cached: false, mock: true };
}
const node = (tree: ReactNode, type: unknown) => elements(tree).find((n) => n.type === type)!;
function confirm(tree: ReactNode) { (node(tree, ConfirmBar).props.onCheck as (v: boolean) => void)(true); }
function submit(tree: ReactNode) { (node(tree, "form").props.onSubmit as (e: FormEvent) => void)({ preventDefault() {} } as FormEvent); }
let storage: ReturnType<typeof memoryStorage>;
beforeEach(() => { storage = memoryStorage(); vi.stubGlobal("window", { localStorage: storage, confirm: () => true }); push.mockClear(); clearIntakeMemory(); });
afterEach(() => { clearIntakeMemory(); vi.unstubAllGlobals(); });
function mount() { return mountHooks(() => ReviewScreen({ locale: "bn" })); }

describe("SCREEN-003 lifecycle (Node hook harness, no DOM/browser)", () => {
  it("has an honest no-draft state and never fetches", () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); const h = mount();
    expect(content(h.tree)).toContain(locales.bn.reviewEmpty); expect(fetcher).not.toHaveBeenCalled();
  });
  it("restores persisted edits and UUID without a handoff", () => {
    const r = editField(createDeviceDraft(handoff())!, "child.clothing", "[MOCK] changed"); saveDraft(r, storage);
    const h = mount(); expect(node(h.tree, ReviewFields).props.record).toEqual(r);
    expect(loadDraft(storage)?.client_submission_id).toBe(r.client_submission_id);
  });
  it("consumes the handoff once and survives effect replay without generating another UUID", () => {
    handOff(handoff()); const h = mount(); const id = loadDraft(storage)?.client_submission_id;
    handOff({ ...handoff(), sourceText: "[MOCK] later" }); h.replayEffects();
    expect(loadDraft(storage)?.client_submission_id).toBe(id); expect(takeHandoff()?.sourceText).toBe("[MOCK] later");
  });
  it("accepts incomplete handoff; nothing dispatches on mounting, editing, ticking, or invalid submit", () => {
    const incoming = handoff(); incoming.response.draft = { ...incoming.response.draft, reporter: { ...incoming.response.draft.reporter, phone: null } };
    handOff(incoming); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); const h = mount();
    confirm(h.tree); h.render(); submit(h.tree); h.render();
    expect(fetcher).not.toHaveBeenCalled(); expect(content(h.tree)).toContain(locales.bn.reviewErrorSummary);
  });
  it("resets confirmation after an edit and sends only parent-reviewed edits on explicit submit", async () => {
    handOff(handoff()); const fetcher = vi.fn().mockResolvedValue(Response.json(clientExamples.createMissingResponse)); vi.stubGlobal("fetch", fetcher); const h = mount();
    confirm(h.tree); h.render();
    (node(h.tree, ReviewFields).props.onEdit as (p: string, v: string) => void)("child.clothing", "[MOCK] parent edit"); h.render();
    expect(node(h.tree, ConfirmBar).props.checked).toBe(false); expect(fetcher).not.toHaveBeenCalled();
    confirm(h.tree); h.render(); submit(h.tree); await settle(); h.render();
    expect(JSON.parse(fetcher.mock.calls[0][1].body).draft.child.clothing).toBe("[MOCK] parent edit");
    expect(loadDraft(storage)).toBeNull(); expect(push).toHaveBeenCalledWith(`/report/${clientExamples.createMissingResponse.id}`);
    expect(content(h.tree)).toContain(localizeDigits(clientExamples.createMissingResponse.ref_code, "bn"));
  });
  it.each(["E-002", "E-019"] as const)("retains draft and offers intake recovery for %s", async (id) => {
    handOff(handoff()); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(errorEnvelope(id), { status: 401 }))); const h = mount();
    confirm(h.tree); h.render(); submit(h.tree); await settle(); h.render();
    expect(loadDraft(storage)).not.toBeNull(); expect(content(h.tree)).toContain(locales.bn.reviewSession); expect(push).not.toHaveBeenCalled();
  });
  it("E-021 retry keeps UUID/payload, blocks editing and prevents double submit", async () => {
    handOff(handoff()); const fetcher = vi.fn().mockResolvedValue(Response.json(errorEnvelope("E-021"), { status: 500 })); vi.stubGlobal("fetch", fetcher); const h = mount();
    confirm(h.tree); h.render(); submit(h.tree); submit(h.tree); await settle(); h.render();
    expect(fetcher).toHaveBeenCalledTimes(1); expect(node(h.tree, ReviewFields).props.locked).toBe(true);
    submit(h.tree); await settle(); h.render();
    expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[0][1].body);
  });
  it("E-006 new ID action unlocks review, resets consent and persists a new UUID", async () => {
    handOff(handoff()); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(errorEnvelope("E-006"), { status: 409 }))); const h = mount();
    confirm(h.tree); h.render(); submit(h.tree); await settle(); h.render(); const old = loadDraft(storage)!.client_submission_id;
    click(button(h.tree, locales.bn.reviewNewId)); h.render();
    expect(loadDraft(storage)!.client_submission_id).not.toBe(old); expect(node(h.tree, ConfirmBar).props.checked).toBe(false); expect(node(h.tree, ReviewFields).props.locked).toBe(false);
  });
  it("E-001 maps server field errors and unlocks correction", async () => {
    handOff(handoff()); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(errorEnvelope("E-001", { fields: ["reporter.phone"] }), { status: 400 }))); const h = mount();
    confirm(h.tree); h.render(); submit(h.tree); await settle(); h.render();
    expect(node(h.tree, ReviewFields).props.errors).toContain("reporter.phone"); expect(node(h.tree, ReviewFields).props.locked).toBe(false);
  });
  it("cancelled discard keeps data; confirmed discard clears storage and intake consent before navigation", () => {
    acknowledgeNotice(); handOff(handoff()); const h = mount();
    vi.stubGlobal("window", { localStorage: storage, confirm: () => false }); click(button(h.tree, locales.bn.reviewDiscardDevice)); h.render(); expect(loadDraft(storage)).not.toBeNull();
    vi.stubGlobal("window", { localStorage: storage, confirm: () => true }); click(button(h.tree, locales.bn.reviewDiscardDevice)); h.render();
    expect(loadDraft(storage)).toBeNull(); expect(noticeAcknowledged()).toBe(false); expect(push).toHaveBeenCalledWith("/intake");
  });
  it("storage failures are visible while review remains usable", () => {
    vi.stubGlobal("window", { get localStorage() { throw Error(); } }); handOff(handoff()); const h = mount();
    expect(content(h.tree)).toContain(locales.bn.reviewStorageFailed); expect(node(h.tree, ReviewFields)).toBeTruthy();
  });
  it("a fresh handoff never replaces an unresolved persisted submission", () => {
    const old = { ...createDeviceDraft(handoff())!, attempted: true }; saveDraft(old, storage);
    handOff({ ...handoff(), sourceText: "[MOCK] newer intake words" }); const h = mount();
    expect((node(h.tree, ReviewFields).props.record as typeof old).client_submission_id).toBe(old.client_submission_id);
    expect(loadDraft(storage)?.client_submission_id).toBe(old.client_submission_id);
  });
  it("shows mandatory completion guidance before any blur or unreachable disabled submit", () => {
    const r = createDeviceDraft(handoff())!; r.draft.reporter.phone = null; saveDraft(r, storage); const h = mount();
    expect(content(h.tree)).toContain(locales.bn.reviewRequiredSummary);
    expect(node(h.tree, ConfirmBar).props.valid).toBe(false);
  });
  it("stale-tab edits and discard do not replace or clear another draft", () => {
    handOff(handoff()); const h = mount(); const old = loadDraft(storage)!;
    const other = createDeviceDraft(handoff())!; saveDraft(other, storage, old.client_submission_id);
    (node(h.tree, ReviewFields).props.onEdit as (p: string, v: string) => void)("child.clothing", "[MOCK] stale edit"); h.render();
    expect(loadDraft(storage)?.client_submission_id).toBe(other.client_submission_id);
    click(button(h.tree, locales.bn.reviewDiscardDevice)); h.render();
    expect(loadDraft(storage)?.client_submission_id).toBe(other.client_submission_id);
  });
  it("late E-001 leaves a newer stored draft intact", async () => {
    handOff(handoff()); let finish!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; }))); const h = mount();
    confirm(h.tree); h.render(); submit(h.tree);
    const other = createDeviceDraft(handoff())!; clearDraft(storage); saveDraft(other, storage);
    finish(Response.json(errorEnvelope("E-001", { fields: ["reporter.phone"] }), { status: 400 })); await settle(); h.render();
    expect(loadDraft(storage)?.client_submission_id).toBe(other.client_submission_id);
  });
  it("reports unavailable storage distinctly from an empty draft", () => {
    vi.stubGlobal("window", { get localStorage() { throw Error(); } }); const h = mount();
    expect(content(h.tree)).toContain(locales.bn.reviewStorageUnreadable);
  });
  it("shows approximation errors on blur after its checkbox changes", () => {
    const r = createDeviceDraft(handoff())!; r.approximate = true; r.edits["event.at_upper"] = "2026-10-12T20:00:00+06:00";
    saveDraft(r, storage); const h = mount();
    (node(h.tree, ReviewFields).props.onApprox as (v: boolean) => void)(false); h.render();
    (node(h.tree, ReviewFields).props.onBlur as (p: string) => void)("event.at"); h.render();
    expect(node(h.tree, ReviewFields).props.errors).toContain("event.at");
  });
  it("a stale same-ID tab cannot overwrite another tab's frozen payload", () => {
    handOff(handoff()); const h = mount(); const original = loadDraft(storage)!; saveDraft({ ...original, attempted: true }, storage);
    (node(h.tree, ReviewFields).props.onEdit as (p: string, v: string) => void)("child.clothing", "[MOCK] changed from stale tab"); h.render();
    expect(loadDraft(storage)?.attempted).toBe(true); expect(loadDraft(storage)?.edits["child.clothing"]).toBeUndefined();
  });
  it("persisted attempted payload survives remount and remains identical", () => {
    const r = { ...createDeviceDraft(handoff())!, attempted: true }; saveDraft(r, storage); const h = mount();
    expect(node(h.tree, ReviewFields).props.locked).toBe(true);
    expect(buildSubmission(node(h.tree, ReviewFields).props.record as typeof r, true)).toEqual(buildSubmission(r, true));
  });
});
