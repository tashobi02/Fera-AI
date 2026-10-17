import type { FormEvent, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientExamples } from "@/contracts/client-examples";
import { caseDraftSchema, errorEnvelope } from "@/contracts";
import { clearIntakeMemory, handOff, noticeAcknowledged, acknowledgeNotice, takeHandoff } from "@/lib/intake/handoff";
import { clearDraft, createDeviceDraft, DRAFT_KEY, loadDraft, saveDraft } from "@/lib/intake/draft-store";
import { createFakeIntakeClient } from "@/lib/intake/fakes/fake-client";
import { buildSubmission, editField } from "@/lib/intake/review";
import { locales } from "@/locales";
import { button, click, content, elements, mountHooks, settle } from "../../intake-ui/fakes/hook-harness";
import { memoryStorage } from "./storage";
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), ...(await import("../../intake-ui/fakes/hook-harness")).testHooks }));
const { ReviewScreen } = await import("@/app/(parent)/intake/review/review-screen");
const { ReviewFields, ConfirmBar } = await import("@/app/(parent)/intake/review/review-fields");
function handoff() {
  return { to: "review" as const, sourceText: clientExamples.createMissingRequest.draft.source_text, response: { ...clientExamples.extractResponse, draft: caseDraftSchema.parse({ ...clientExamples.createMissingRequest.draft, event: { ...clientExamples.createMissingRequest.draft.event, district_text: null } }), expires_at: new Date(Date.now() + 60_000).toISOString() }, missing: [], asked: 4, cached: false, mock: false };
}
const node = (tree: ReactNode, type: unknown) => elements(tree).find((n) => n.type === type)!;
function confirm(tree: ReactNode) { (node(tree, ConfirmBar).props.onCheck as (v: boolean) => void)(true); }
function submit(tree: ReactNode) { (node(tree, "form").props.onSubmit as (e: FormEvent) => void)({ preventDefault() {} } as FormEvent); }
let storage: ReturnType<typeof memoryStorage>;
beforeEach(() => { storage = memoryStorage(); vi.stubGlobal("window", { localStorage: storage, confirm: () => true }); vi.stubGlobal("document", { getElementById: () => null }); push.mockClear(); clearIntakeMemory(); });
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
    expect(loadDraft(storage)).toBeNull(); expect(push).not.toHaveBeenCalled();
    expect(content(h.tree)).toContain(clientExamples.createMissingResponse.ref_code /* identifier: never localised (same as S-004) */);
    expect(content(h.tree)).toContain(locales.bn.reviewOpenReport);
    expect(elements(h.tree).map((e) => e.props.href)).toContain(`/report/${clientExamples.createMissingResponse.id}`); // OD-022-12 → S-004
  });
  it("persists submitted reference on 2xx so unmount mid-request displays it on return (W2 + SG1)", async () => {
    handOff(handoff()); let finish!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
    const h = mount(); confirm(h.tree); h.render(); submit(h.tree);
    h.unmount();
    finish(Response.json(clientExamples.createMissingResponse, { status: 201 })); await settle();
    const h2 = mount();
    expect(content(h2.tree)).toContain(clientExamples.createMissingResponse.ref_code /* identifier: never localised (same as S-004) */);
    expect(content(h2.tree)).toContain(locales.bn.reviewOpenReport);
    expect(elements(h2.tree).map((e) => e.props.href)).toContain(`/report/${clientExamples.createMissingResponse.id}`); // OD-022-12 → S-004
    expect(push).not.toHaveBeenCalled();
  });
  it.each(["E-002"] as const)("retains draft and offers intake recovery for %s", async (id) => {
    handOff(handoff()); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(errorEnvelope(id), { status: 401 }))); const h = mount();
    confirm(h.tree); h.render(); submit(h.tree); await settle(); h.render();
    expect(loadDraft(storage)).not.toBeNull(); expect(content(h.tree)).toContain(locales.bn.reviewSession); expect(push).not.toHaveBeenCalled();
  });
  it("OD-022-10: E-019 clears the device record and shows the catalogue E-019 copy", async () => {
    handOff(handoff()); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(errorEnvelope("E-019"), { status: 401 }))); const h = mount();
    confirm(h.tree); h.render(); submit(h.tree); await settle(); h.render();
    expect(loadDraft(storage)).toBeNull();
    expect(storage.getItem(DRAFT_KEY)).toBeNull();
    const env = errorEnvelope("E-019");
    expect(content(h.tree)).toContain(env.error.message_bn);
    expect(push).not.toHaveBeenCalled();
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
  it("SW3: when an older frozen attempted draft blocks a fresh handoff, offers D3:309 choice and never silently drops handoff", () => {
    const old = { ...createDeviceDraft(handoff())!, attempted: true }; saveDraft(old, storage);
    handOff({ ...handoff(), sourceText: "[MOCK] newer intake words" }); const h = mount();
    expect(content(h.tree)).toContain(locales.bn.earlierDraftFound);
    expect(content(h.tree)).toContain(locales.bn.earlierDraftContinue);
    expect(content(h.tree)).toContain(locales.bn.earlierDraftReplace);
    click(button(h.tree, locales.bn.earlierDraftReplace)); h.render();
    expect((node(h.tree, ReviewFields).props.record as typeof old).sourceText).toBe("[MOCK] newer intake words");
    expect(loadDraft(storage)?.sourceText).toBe("[MOCK] newer intake words");
    expect(content(h.tree)).not.toContain(locales.bn.reviewStorageFailed);
  });
  it("SW1: default-fake draft reaching S-003 is NOT expired", async () => {
    const client = createFakeIntakeClient({ delayMs: 0 });
    const res = await client.extract({ kind: "missing", text: "[MOCK] আমার মেয়ে মীম, বয়স ১১, ঢাকা" }, new AbortController().signal);
    expect(res.ok).toBe(true);
    if (!res.ok) throw Error();
    const expiry = Date.parse(res.data.expires_at);
    expect(res.data.expires_at).toMatch(/\+06:00$/);
    expect(expiry).toBeGreaterThan(Date.now() + 23 * 3600 * 1000);
    handOff({ to: "review", sourceText: "আমার মেয়ে মীম", response: res.data, missing: [], asked: 0, cached: false, mock: true });
    const h = mount();
    expect(content(h.tree)).not.toContain(locales.bn.reviewExpired);
  });
  it("SW2: in-screen expiry timer clears the stored draft for a non-attempted record", () => {
    vi.useFakeTimers();
    try {
      handOff(handoff());
      const h = mount();
      expect(loadDraft(storage)).not.toBeNull();
      vi.advanceTimersByTime(65_000);
      h.render();
      expect(content(h.tree)).toContain(locales.bn.reviewExpired);
      expect(loadDraft(storage)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
  it("N4: restores focus after new id is clicked", async () => {
    handOff(handoff()); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(errorEnvelope("E-006"), { status: 409 }))); const h = mount();
    confirm(h.tree); h.render(); submit(h.tree); await settle(); h.render();
    const focused = vi.fn();
    const el = { focus: focused };
    vi.stubGlobal("document", { getElementById: (id: string) => id === "review-child.name" ? el : null });
    click(button(h.tree, locales.bn.reviewNewId)); h.render();
    expect(focused).toHaveBeenCalled();
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
  it("N1: shows calm notice when corrupt attempted record exists", () => {
    const r = { ...createDeviceDraft(handoff())!, attempted: true };
    const raw = JSON.stringify(r).replace('"version":1', '"version":2');
    storage.setItem(DRAFT_KEY, raw);
    const h = mount();
    expect(content(h.tree)).toContain(locales.bn.reviewCorruptAttempted);
  });
});

describe("A8 Sol recovery regressions", () => {
  it("OD-022-10: an expired attempted snapshot is cleared; device retry reference is gone", async () => {
    vi.useFakeTimers();
    try {
      const r = { ...createDeviceDraft(handoff())!, attempted: true, expiresAt: Date.now() - 1 };
      saveDraft(r, storage);
      const fetcher = vi.fn().mockResolvedValue(Response.json(clientExamples.createMissingResponse));
      vi.stubGlobal("fetch", fetcher);
      const h = mount();
      h.render();
      expect(content(h.tree)).toContain(locales.bn.reviewExpired);
      expect(loadDraft(storage)).toBeNull();
      expect(storage.getItem(DRAFT_KEY)).toBeNull();
      vi.advanceTimersByTime(1); h.render();
      expect(fetcher).not.toHaveBeenCalled();
      h.unmount();
    } finally { vi.useRealTimers(); }
  });
  it("corrupt attempted identity survives intake entry and blocks replacement until explicit discard", () => {
    const r = { ...createDeviceDraft(handoff())!, attempted: true, version: 2 };
    storage.setItem(DRAFT_KEY, JSON.stringify(r));
    acknowledgeNotice();
    handOff(handoff()); const h = mount();
    expect(content(h.tree)).toContain(locales.bn.reviewCorruptAttempted);
    expect(storage.getItem(DRAFT_KEY)).toBe(JSON.stringify(r));
    expect(node(h.tree, "form")).toBeUndefined();
    click(button(h.tree, locales.bn.reviewDiscardDevice)); h.render();
    expect(storage.getItem(DRAFT_KEY)).toBeNull();
  });
  it("focuses the new-ID field only after the field has been unlocked", async () => {
    handOff(handoff()); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(errorEnvelope("E-006"), { status: 409 })));
    const h = mount(); confirm(h.tree); h.render(); submit(h.tree); await settle(); h.render();
    const unlocked: unknown[] = [];
    vi.stubGlobal("document", { getElementById: () => ({ focus: () => unlocked.push(node(h.tree, ReviewFields).props.locked) }) });
    click(button(h.tree, locales.bn.reviewNewId)); h.render();
    expect(unlocked).toEqual([false]);
  });
  it("offline retry dispatches once on double tap and keeps the visible reference without navigation", async () => {
    handOff(handoff()); let finish!: (r: Response) => void;
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError("offline")).mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
    vi.stubGlobal("fetch", fetcher); const h = mount(); confirm(h.tree); h.render(); submit(h.tree); await settle(); h.render();
    submit(h.tree); submit(h.tree); await settle();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[0][1].body);
    finish(Response.json(clientExamples.createMissingResponse)); await settle(); h.render();
    expect(push).not.toHaveBeenCalled();
    expect(content(h.tree)).toContain(clientExamples.createMissingResponse.ref_code /* identifier: never localised (same as S-004) */);
  });
});

describe("A8 Sol success recovery precedence", () => {
  it("a new handoff is not hidden by a previous success reference", async () => {
    handOff(handoff()); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(clientExamples.createMissingResponse)));
    const h = mount(); confirm(h.tree); h.render(); submit(h.tree); await settle(); h.render(); h.unmount();
    handOff({ ...handoff(), sourceText: "[MOCK] fresh report" });
    const next = mount();
    expect(node(next.tree, ReviewFields)).toBeDefined();
    expect(loadDraft(storage)?.sourceText).toBe("[MOCK] fresh report");
  });
});

describe("A8 Sol cross-tab expiry", () => {
  it("OD-022-10: an editable tab's expiry now clears the same-ID attempted snapshot in storage", () => {
    vi.useFakeTimers();
    try {
      handOff(handoff()); const h = mount(); const r = loadDraft(storage)!;
      saveDraft({ ...r, attempted: true }, storage);
      vi.advanceTimersByTime(65_000); h.render();
      expect(storage.getItem(DRAFT_KEY)).toBeNull();
      h.unmount();
    } finally { vi.useRealTimers(); }
  });
  it("offers collision choice even for identical incoming text with a new extraction token", () => {
    const r = { ...createDeviceDraft(handoff())!, attempted: true }; saveDraft(r, storage);
    handOff(handoff()); const h = mount();
    expect(content(h.tree)).toContain(locales.bn.earlierDraftFound);
  });
});

describe("A8 Sol collision lifecycle", () => {
  function collision() {
    const old = { ...createDeviceDraft(handoff())!, attempted: true }; saveDraft(old, storage);
    handOff({ ...handoff(), sourceText: "[MOCK] new handoff" }); return mount();
  }
  it("cannot replace a frozen draft while its retry is in flight", async () => {
    const h = collision();
    const staleReplace = button(h.tree, locales.bn.earlierDraftReplace);
    click(button(h.tree, locales.bn.earlierDraftContinue)); h.render();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    confirm(h.tree); h.render(); submit(h.tree); h.render();
    const oldId = loadDraft(storage)!.client_submission_id;
    click(staleReplace); h.render();
    expect(loadDraft(storage)?.client_submission_id).toBe(oldId);
  });
  it("late success after collision unmount cannot discard a newer pending handoff", async () => {
    const h = collision(); let finish!: (r: Response) => void;
    click(button(h.tree, locales.bn.earlierDraftContinue)); h.render();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
    confirm(h.tree); h.render(); submit(h.tree); h.unmount();
    handOff({ ...handoff(), sourceText: "[MOCK] later session" });
    finish(Response.json(clientExamples.createMissingResponse)); await settle();
    expect(takeHandoff()?.sourceText).toBe("[MOCK] later session");
  });
  it("failed new-ID save keeps the conflict and old identity until a successful retry", async () => {
    handOff(handoff()); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(errorEnvelope("E-006"), { status: 409 })));
    const h = mount(); confirm(h.tree); h.render(); submit(h.tree); await settle(); h.render();
    const oldId = loadDraft(storage)!.client_submission_id;
    const spy = vi.spyOn(storage, "setItem").mockImplementation(() => { throw Error("quota"); });
    click(button(h.tree, locales.bn.reviewNewId)); h.render();
    expect((node(h.tree, ReviewFields).props.record as {client_submission_id:string}).client_submission_id).toBe(oldId);
    expect(content(h.tree)).toContain(locales.bn.reviewConflict);
    expect(content(h.tree)).toContain(locales.bn.reviewStorageFailed);
    spy.mockRestore(); click(button(h.tree, locales.bn.reviewNewId)); h.render();
    expect(loadDraft(storage)?.client_submission_id).not.toBe(oldId);
  });
});

describe("A8 Sol collision focus", () => {
  it.each(["earlierDraftContinue", "earlierDraftReplace"] as const)("restores focus after %s removes the focused choice", (key) => {
    const old = { ...createDeviceDraft(handoff())!, attempted: true }; saveDraft(old, storage);
    handOff({ ...handoff(), sourceText: "[MOCK] new text" }); const h = mount();
    const focused = vi.fn(); vi.stubGlobal("document", { getElementById: () => ({focus: focused}) });
    click(button(h.tree, locales.bn[key])); h.render();
    expect(focused).toHaveBeenCalledOnce();
  });
});

describe("A8 Sol explicit collision decision", () => {
  it("cannot submit the older attempt before choosing Continue or Replace", async () => {
    const old = { ...createDeviceDraft(handoff())!, attempted: true }; saveDraft(old, storage);
    handOff({ ...handoff(), sourceText: "[MOCK] incoming words" }); const h = mount();
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    confirm(h.tree); h.render(); submit(h.tree); await settle(); h.render();
    expect(fetcher).not.toHaveBeenCalled();
    expect(node(h.tree, ConfirmBar).props.blocked).toBe(true);
    expect(content(h.tree)).toContain(locales.bn.earlierDraftFound);
  });
  it("shows a cleanup warning if persistence recovers at submit but reference save then fails", async () => {
    const originalSet = storage.setItem.bind(storage); let draftSaves = 0;
    vi.spyOn(storage, "setItem").mockImplementation((key, value) => {
      if (key === "fera.intake.submitted.v1" || (key === DRAFT_KEY && ++draftSaves === 1)) throw Error("quota");
      originalSet(key, value);
    });
    handOff(handoff()); const h = mount();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(clientExamples.createMissingResponse)));
    confirm(h.tree); h.render(); submit(h.tree); await settle(); h.render();
    expect(loadDraft(storage)?.attempted).toBe(true);
    expect(content(h.tree)).toContain(locales.bn.reviewClearFailed);
  });
});


describe("R3 release safeguarding regressions", () => {
  it("mock records refuse direct form submission even after confirmation", async () => {
    handOff({ ...handoff(), mock: true });
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const h = mount(); confirm(h.tree); h.render(); submit(h.tree); await settle(); h.render();
    expect(fetcher).not.toHaveBeenCalled(); expect(loadDraft(storage)?.attempted).toBe(false);
  });
  it("a fresh handoff supersedes an expired stored draft", () => {
    const r = createDeviceDraft(handoff())!; saveDraft({ ...r, expiresAt: Date.now() - 1 }, storage);
    handOff({ ...handoff(), sourceText: "[MOCK] fresh after expiry" }); const h = mount();
    expect(node(h.tree, ReviewFields)).toBeDefined();
    expect(loadDraft(storage)?.sourceText).toBe("[MOCK] fresh after expiry");
  });
  it.each([false, true])("timer expiry removes fields and form (attempted=%s)", (attempted) => {
    vi.useFakeTimers();
    try {
      saveDraft({ ...createDeviceDraft(handoff())!, attempted }, storage); const h = mount();
      expect(node(h.tree, ReviewFields)).toBeDefined(); vi.advanceTimersByTime(60_000); h.render();
      expect(node(h.tree, ReviewFields)).toBeUndefined(); expect(node(h.tree, "form")).toBeUndefined();
      expect(storage.getItem(DRAFT_KEY)).toBeNull(); h.unmount();
    } finally { vi.useRealTimers(); }
  });
  it("visibilitychange expiry removes fields without running the timer", () => {
    vi.useFakeTimers();
    try {
      const listeners = new Map<string, () => void>();
      vi.stubGlobal("document", { visibilityState: "visible", getElementById: () => null,
        addEventListener: (name: string, cb: () => void) => listeners.set(name, cb), removeEventListener: (name: string) => listeners.delete(name) });
      handOff(handoff()); const h = mount(); vi.setSystemTime(Date.now() + 60_000);
      listeners.get("visibilitychange")!(); h.render();
      expect(node(h.tree, ReviewFields)).toBeUndefined(); expect(node(h.tree, "form")).toBeUndefined();
      expect(storage.getItem(DRAFT_KEY)).toBeNull(); h.unmount();
    } finally { vi.useRealTimers(); }
  });
  it("pre-submit expiry refuses an attempted retry before its timer fires", async () => {
    vi.useFakeTimers();
    try {
      saveDraft({ ...createDeviceDraft(handoff())!, attempted: true }, storage);
      const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); const h = mount(); confirm(h.tree); h.render();
      vi.setSystemTime(Date.now() + 60_000); submit(h.tree); await settle(); h.render();
      expect(fetcher).not.toHaveBeenCalled(); expect(node(h.tree, ReviewFields)).toBeUndefined();
      expect(storage.getItem(DRAFT_KEY)).toBeNull(); h.unmount();
    } finally { vi.useRealTimers(); }
  });
});


it("batch age/time edits persist together and reset confirmation", () => {
  handOff(handoff()); const h = mount(); confirm(h.tree); h.render();
  (node(h.tree, ReviewFields).props.onBatch as (v: Record<string, string>, a: boolean) => void)({ "event.at": "2025-12-31T20:00:00+06:00", "event.at_lower": "2025-12-31T20:00:00+06:00", "event.at_upper": "2026-01-01T06:00:00+06:00" }, true); h.render();
  expect(loadDraft(storage)?.edits).toMatchObject({ "event.at_lower": "2025-12-31T20:00:00+06:00", "event.at_upper": "2026-01-01T06:00:00+06:00" });
  expect(loadDraft(storage)?.approximate).toBe(true); expect(node(h.tree, ConfirmBar).props.checked).toBe(false);
});

it("extra handoff words render once across the whole review screen", () => {
  const incoming = { ...handoff(), sourceText: "[MOCK] additional handoff words" };
  handOff(incoming); const h = mount();
  const props = node(h.tree, ReviewFields).props as Parameters<typeof ReviewFields>[0];
  const fields = mountHooks(() => ReviewFields(props));
  const visible = content(h.tree) + content(fields.tree);
  expect(visible.match(/additional handoff words/g)).toHaveLength(1);
  fields.unmount(); h.unmount();
});

it("the sex error-summary link focuses the first radio", async () => {
  handOff(handoff());
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(errorEnvelope("E-001", { fields: ["child.sex"] }), { status: 400 })));
  const h = mount(); confirm(h.tree); h.render(); submit(h.tree); await settle(); h.render();
  const link = elements(h.tree).find(n => n.props.href === "#review-child.sex")!;
  expect(link).toBeDefined();
  const focus = vi.fn(); const getElementById = vi.fn(() => ({ focus }));
  vi.stubGlobal("document", { getElementById });
  (link.props.onClick as (e: { preventDefault(): void }) => void)({ preventDefault() {} });
  expect(getElementById).toHaveBeenCalledWith("review-child.sex"); expect(focus).toHaveBeenCalledOnce();
});

it("expiry gives the replacement notice a focus target after removing the fields", () => {
  vi.useFakeTimers();
  try {
    handOff(handoff()); const h = mount();
    vi.advanceTimersByTime(60_000); h.render();
    const notice = elements(h.tree).find(n => n.props.role === "alert" && content(n).includes(locales.bn.reviewExpired))!;
    expect(notice.props.tabIndex).toBe(-1); expect(notice.props.ref).toBeDefined(); h.unmount();
  } finally { vi.useRealTimers(); }
});
it.each(["timer", "submit", "E-019"])("%s expiry reports failed storage deletion and removes fields", async (trigger) => {
  vi.useFakeTimers();
  try {
    handOff(handoff()); const h = mount();
    vi.spyOn(storage, "removeItem").mockImplementation(() => { throw Error("unavailable"); });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(errorEnvelope("E-019"), { status: 401 })));
    if (trigger === "timer") vi.advanceTimersByTime(60_000);
    else { confirm(h.tree); h.render(); if (trigger === "submit") vi.setSystemTime(Date.now() + 60_000); submit(h.tree); await settle(); }
    h.render();
    expect(node(h.tree, ReviewFields)).toBeUndefined();
    expect(content(h.tree)).toContain(locales.bn.reviewClearFailed);
    expect(storage.getItem(DRAFT_KEY)).not.toBeNull(); h.unmount();
  } finally { vi.useRealTimers(); }
});


it("R4: mounting a stored mock:true draft and submitting never fetches", async () => {
  const r = createDeviceDraft({ ...handoff(), mock: true })!; saveDraft(r, storage);
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const h = mount(); confirm(h.tree); h.render(); submit(h.tree); await settle(); h.render();
  expect(fetcher).not.toHaveBeenCalled(); expect(loadDraft(storage)?.attempted).toBe(false);
});
it("R4: synthetic badge appears once on success", async () => {
  handOff(handoff()); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(clientExamples.createMissingResponse)));
  const h = mount(); confirm(h.tree); h.render(); submit(h.tree); await settle(); h.render();
  expect(content(h.tree).split(locales.bn.syntheticBadge).length - 1).toBe(1);
});
