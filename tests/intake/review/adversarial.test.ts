// Adapted from the supplied Sonnet break suite: bug-observation assertions updated
// to A8 recovery requirements; external source remains unchanged. Node harness only.
import type { FormEvent, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientExamples } from "@/contracts/client-examples";
import { caseDraftSchema, errorEnvelope } from "@/contracts";
import { clearIntakeMemory, handOff } from "@/lib/intake/handoff";
import { DRAFT_KEY, createDeviceDraft, loadDraft, readDraft, saveDraft } from "@/lib/intake/draft-store";
import { buildSubmission, createSubmitter, editField } from "@/lib/intake/review";
import { button, click, content, elements, mountHooks, settle } from "../../intake-ui/fakes/hook-harness";
import { memoryStorage } from "./storage";
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), ...(await import("../../intake-ui/fakes/hook-harness")).testHooks }));
const { ReviewScreen } = await import("@/app/(parent)/intake/review/review-screen");
const { ReviewFields, ConfirmBar } = await import("@/app/(parent)/intake/review/review-fields");
import { locales } from "@/locales";

function handoff(ttl = 60_000, source?: string) {
  const d = caseDraftSchema.parse({ ...clientExamples.createMissingRequest.draft, event: { ...clientExamples.createMissingRequest.draft.event, district_text: null } });
  return { to: "review" as const, sourceText: source ?? d.source_text, response: { ...clientExamples.extractResponse, draft: d, expires_at: new Date(Date.now() + ttl).toISOString() }, missing: [], asked: 4, cached: false, mock: false };
}
const node = (tree: ReactNode, type: unknown) => elements(tree).find((n) => n.type === type)!;
const confirm = (tree: ReactNode) => (node(tree, ConfirmBar).props.onCheck as (v: boolean) => void)(true);
const submit = (tree: ReactNode) => (node(tree, "form").props.onSubmit as (e: FormEvent) => void)({ preventDefault() {} } as FormEvent);
let storage: ReturnType<typeof memoryStorage>;
beforeEach(() => { storage = memoryStorage(); vi.stubGlobal("window", { localStorage: storage, confirm: () => true }); vi.stubGlobal("document", { getElementById: () => null }); push.mockClear(); clearIntakeMemory(); });
afterEach(() => { clearIntakeMemory(); vi.unstubAllGlobals(); });
const mount = () => mountHooks(() => ReviewScreen({ locale: "bn" }));

describe("B1 corrupted / old-version draft", () => {
  it.each([["garbage", "{not json"], ["v0", JSON.stringify({ version: 0, draft: {} })], ["null", "null"], ["extra key", JSON.stringify({ ...createDeviceDraft(handoff())!, extra: 1 })], ["array", "[]"]])("%s -> no crash, empty state, key removed", (_n, raw) => {
    storage.setItem(DRAFT_KEY, raw); const h = mount();
    expect(content(h.tree)).toContain(locales.bn.reviewEmpty); expect(storage.getItem(DRAFT_KEY)).toBeNull();
  });
  it("corrupt attempted identity is kept with a calm notice", () => {
    const r = { ...createDeviceDraft(handoff())!, attempted: true }; const raw = JSON.stringify(r).replace('"version":1', '"version":2');
    storage.setItem(DRAFT_KEY, raw); const h = mount();
    expect(content(h.tree)).toContain(locales.bn.reviewCorruptAttempted); expect(storage.getItem(DRAFT_KEY)).not.toBeNull();
  });
  it("OD-022-10: clock-stepped attempted draft is cleared (shared 24 h bound)", () => {
    const r = { ...createDeviceDraft(handoff())!, attempted: true, savedAt: Date.now() + 1000 }; storage.setItem(DRAFT_KEY, JSON.stringify(r));
    expect(loadDraft(storage)).toBeNull(); expect(storage.getItem(DRAFT_KEY)).toBeNull();
  });
  it("OD-022-10: an expired attempted draft is cleared; the original 2xx-retry reference is lost on this device", () => {
    const r = { ...createDeviceDraft(handoff())!, attempted: true, expiresAt: Date.now() - 1 }; storage.setItem(DRAFT_KEY, JSON.stringify(r));
    expect(loadDraft(storage)).toBeNull(); expect(storage.getItem(DRAFT_KEY)).toBeNull();
  });
  it("OD-022-10: an expired non-attempted draft is cleared on read (no PII lingering)", () => {
    const r = createDeviceDraft(handoff())!; r.expiresAt = Date.now() - 1; storage.setItem(DRAFT_KEY, JSON.stringify(r));
    expect(readDraft(storage).draft).toBeNull();
    expect(storage.getItem(DRAFT_KEY)).toBeNull();
  });
});

describe("B2 draft from another session/tab", () => {
  it("different anonymous session sees the previous parent's PII + token (no session binding)", () => {
    const r = createDeviceDraft(handoff())!; saveDraft(r, storage); // 'session A'
    const h = mount(); // 'session B' (new cookie) -> still restored
    const rec = node(h.tree, ReviewFields).props.record as typeof r;
    expect(rec.draft.reporter.phone).toBe(r.draft.reporter.phone); expect(rec.draftToken).toBe(r.draftToken);
  });
  it("tab B submit after tab A succeeded and cleared: no dispatch", async () => {
    handOff(handoff()); const f = vi.fn(); vi.stubGlobal("fetch", f); const h = mount(); confirm(h.tree); h.render();
    storage.removeItem(DRAFT_KEY); submit(h.tree); await settle(); h.render();
    expect(f).not.toHaveBeenCalled();
  });
  it("two tabs editing same unattempted id: last writer wins, lost update (no storage event)", () => {
    const r = createDeviceDraft(handoff())!; saveDraft(r, storage);
    saveDraft(editField(r, "child.clothing", "[MOCK] A"), storage); // tab A
    saveDraft(editField(r, "child.name", "[MOCK] B"), storage);     // tab B (stale base)
    const cur = loadDraft(storage)!; expect(cur.edits["child.clothing"]).toBeUndefined();
  });
});

describe("B3 offline -> online, double tap", () => {
  it("offline reject then online retry reuses id; double tap during retry dispatches once", async () => {
    handOff(handoff()); let finish!: (r: Response) => void;
    const f = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockImplementationOnce(() => new Promise<Response>((r) => { finish = r; }));
    vi.stubGlobal("fetch", f); const h = mount(); confirm(h.tree); h.render(); submit(h.tree); await settle(); h.render();
    expect(content(h.tree)).toContain(errorEnvelope("E-024").error.message_bn);
    expect(node(h.tree, ConfirmBar).props.checked).toBe(true);
    submit(h.tree); submit(h.tree); submit(h.tree); await settle();
    expect(f).toHaveBeenCalledTimes(2); expect(f.mock.calls[1][1].body).toBe(f.mock.calls[0][1].body);
    finish(Response.json(clientExamples.createMissingResponse, { status: 201 })); await settle(); h.render();
    expect(loadDraft(storage)).toBeNull(); expect(push).not.toHaveBeenCalled();
  });
  it("hard double tap in same tick dispatches once", async () => {
    handOff(handoff()); const f = vi.fn(() => new Promise<Response>(() => {})); vi.stubGlobal("fetch", f);
    const h = mount(); confirm(h.tree); h.render(); const s = node(h.tree, "form").props.onSubmit as (e: FormEvent) => void;
    s({ preventDefault() {} } as FormEvent); s({ preventDefault() {} } as FormEvent); await settle();
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("B4 E-006 / 409 after editing", () => {
  it("E-006 -> new id keeps edits; fresh UUID; old attempted state replaced", async () => {
    handOff(handoff()); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(errorEnvelope("E-006"), { status: 409 })));
    const h = mount(); (node(h.tree, ReviewFields).props.onEdit as (p: string, v: string) => void)("child.clothing", "[MOCK] x"); h.render();
    confirm(h.tree); h.render(); submit(h.tree); await settle(); h.render(); const old = loadDraft(storage)!;
    expect(old.attempted).toBe(true);
    click(button(h.tree, locales.bn.reviewNewId)); h.render();
    const n = loadDraft(storage)!; expect(n.client_submission_id).not.toBe(old.client_submission_id); expect(n.edits["child.clothing"]).toBe("[MOCK] x"); expect(n.attempted).toBe(false);
  });
  it("refresh while E-006 shown: reload restores locked attempted draft with the OLD id (conflict banner gone)", async () => {
    handOff(handoff()); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(errorEnvelope("E-006"), { status: 409 })));
    const h = mount(); confirm(h.tree); h.render(); submit(h.tree); await settle();
    const h2 = mount(); // reload
    expect(node(h2.tree, ReviewFields).props.locked).toBe(true);
    expect(content(h2.tree)).not.toContain(locales.bn.reviewNewId); // stuck?
  });
});

describe("B5 lost 2xx response", () => {
  it("response lost (network error) then retry returns 200 replay -> cleared once", async () => {
    const r = createDeviceDraft(handoff())!; saveDraft(r, storage);
    const f = vi.fn().mockRejectedValueOnce(new TypeError("lost")).mockResolvedValueOnce(Response.json({ ...clientExamples.createMissingResponse, replayed: true }, { status: 200 }));
    const s = createSubmitter(f, storage);
    expect(await s(r, true, true)).toMatchObject({ ok: false });
    const res = await s(loadDraft(storage)!, true, true);
    expect(res).toMatchObject({ ok: true, cleared: true }); expect(f.mock.calls[0][1].body).toBe(f.mock.calls[1][1].body);
  });
  it("2xx with unparseable/HTML body treated as error but case exists -> retry id same", async () => {
    const r = createDeviceDraft(handoff())!; saveDraft(r, storage);
    const f = vi.fn().mockResolvedValue(new Response("<html>", { status: 200 }));
    const res = await createSubmitter(f, storage)(r, true, true); expect(res).toMatchObject({ ok: false });
    expect(loadDraft(storage)?.attempted).toBe(true);
  });
  it("success while component unmounted: draft cleared but reference never shown", async () => {
    handOff(handoff()); let finish!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => { finish = r; })));
    const h = mount(); confirm(h.tree); h.render(); submit(h.tree); h.unmount();
    finish(Response.json(clientExamples.createMissingResponse, { status: 201 })); await settle();
    expect(loadDraft(storage)).toBeNull(); expect(push).not.toHaveBeenCalled();
  });
  it("memory-only success has no false cleanup warning", async () => {
    vi.stubGlobal("window", { get localStorage() { throw Error(); }, confirm: () => true });
    handOff(handoff()); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(clientExamples.createMissingResponse, { status: 201 })));
    const h = mount(); confirm(h.tree); h.render(); submit(h.tree); await settle(); h.render();
    expect(content(h.tree)).not.toContain(locales.bn.reviewClearFailed); expect(push).not.toHaveBeenCalled();
  });
});

describe("B6 XSS-like source text", () => {
  const evil = `<img src=x onerror=alert(1)></mark><script>alert(1)</script> "'\`&amp; ‮`;
  it("renders as escaped text (fields + extra source)", () => {
    const r = createDeviceDraft(handoff())!; r.sourceText = evil; r.draft = { ...r.draft, source_text: r.draft.source_text };
    const html = renderToStaticMarkup(mountHooks(() => ReviewFields({ record: r, locale: "en", errors: [], onEdit() {}, onBatch() {}, onApprox() {}, onBlur() {}, locked: false })).tree);
    expect(html).not.toContain("<script"); expect(html).not.toContain("<img"); expect(html).toContain("&lt;script&gt;");
  });
  it("evil value in an edited field is a controlled input value (escaped)", () => {
    const r = editField(createDeviceDraft(handoff())!, "child.clothing", evil);
    const html = renderToStaticMarkup(mountHooks(() => ReviewFields({ record: r, locale: "en", errors: [], onEdit() {}, onBatch() {}, onApprox() {}, onBlur() {}, locked: false })).tree);
    expect(html).not.toContain("<script"); expect(html).not.toContain("<img");
    expect(buildSubmission(r, true)?.draft.child.clothing).toBe(evil);
  });
  it("evil text in the canonical source highlighted region", () => {
    const d = handoff(); const src = `<b>x</b> ${d.response.draft.source_text}`; const shift = 10;
    const draft = structuredClone(d.response.draft); draft.source_text = src;
    for (const k of Object.keys(draft.evidence)) { const e = draft.evidence[k as keyof typeof draft.evidence]!; e.start_utf16 += shift; e.end_utf16 += shift; }
    const r = createDeviceDraft({ ...d, response: { ...d.response, draft } })!;
    const html = renderToStaticMarkup(mountHooks(() => ReviewFields({ record: r, locale: "en", errors: [], onEdit() {}, onBatch() {}, onApprox() {}, onBlur() {}, locked: false })).tree);
    expect(html).not.toContain("<b>x"); expect(html).toContain("&lt;b&gt;");
  });
});

describe("B7 expiry timer", () => {
  it("long expiry is capped and cannot overflow setTimeout", () => {
    const spy = vi.spyOn(globalThis, "setTimeout"); handOff(handoff(40 * 24 * 3600 * 1000)); mount();
    const delays = spy.mock.calls.map((c) => c[1] as number); expect(Math.max(...delays)).toBeLessThanOrEqual(24 * 3600 * 1000);
  });
});
