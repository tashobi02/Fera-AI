import type { FormEvent, MouseEvent, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientExamples } from "@/contracts/client-examples";
import { errorEnvelope } from "@/contracts";
import { acknowledgeNotice, clearIntakeMemory, MANUAL_FORM_PATH, takeHandoff } from "@/lib/intake/handoff";
import { locales } from "@/locales";
import { PERMISSION_TIMEOUT_MS } from "@/lib/intake/recorder";
import { button, click, content, elements, mountHooks, settle } from "./fakes/hook-harness";
import { deferred, fakeMedia } from "./fakes/media";

const { push, thrower } = vi.hoisted(() => ({ push: vi.fn(), thrower: { on: false } }));
vi.mock("@/lib/intake/machine", async (original) => {
  const real = await original<typeof import("@/lib/intake/machine")>();
  return { ...real, intakeReducer: (s: Parameters<typeof real.intakeReducer>[0], e: Parameters<typeof real.intakeReducer>[1]) => {
    if (thrower.on && e.type === "extracted") throw new Error("secret payload");
    return real.intakeReducer(s, e);
  } };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), ...(await import("./fakes/hook-harness")).testHooks }));
const { IntakeChat } = await import("@/app/(parent)/intake/intake-chat");
const { VoiceRecorder } = await import("@/app/(parent)/intake/voice-recorder");

const plainClick = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false } as MouseEvent<HTMLAnchorElement>;
const changeText = (tree: ReactNode, text: string) => {
  const node = elements(tree).find((n) => n.type === "textarea")!;
  (node.props.onChange as (e: { target: { value: string } }) => void)({ target: { value: text } });
};
const submit = (tree: ReactNode) => {
  const form = elements(tree).find((n) => n.type === "form")!;
  (form.props.onSubmit as (e: FormEvent) => void)({ preventDefault() {} } as FormEvent);
};

beforeEach(() => {
  vi.useFakeTimers(); push.mockClear(); acknowledgeNotice();
  vi.stubGlobal("window", Object.assign(new EventTarget(), { confirm: () => true })); // old implementation may call it
  vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); clearIntakeMemory(); });

function request() {
  const response = deferred<Response>();
  const fetchImpl = vi.fn((url: unknown, init?: RequestInit) => { void url; void init; return response.promise; });
  vi.stubGlobal("fetch", fetchImpl);
  const h = mountHooks(() => IntakeChat({ locale: "bn", mode: "live" }));
  changeText(h.tree, "আমার মেয়ে নুসরাত, বয়স ৭ বছর।"); h.render(); submit(h.tree); h.render();
  const signal = fetchImpl.mock.calls[0][1]!.signal!;
  return { h, fetchImpl, response, signal };
}

describe("intake cancellation and discard (items 2, 7, 9, 12)", () => {
  it("discard during an in-flight request aborts the signal only once deletion is confirmed (R3)", () => {
    const { h, signal } = request();
    click(button(h.tree, locales.bn.discardAction)); h.render();
    expect(signal.aborted).toBe(false);
    click(button(h.tree, locales.bn.discardYes));
    expect(signal.aborted).toBe(true);
    h.unmount();
  });

  it("Keep after discard leaves the request running and its answer is delivered (R3)", async () => {
    const { h, signal, response } = request();
    click(button(h.tree, locales.bn.discardAction)); h.render();
    click(button(h.tree, locales.bn.discardNo)); h.render();
    expect(signal.aborted).toBe(false);
    response.resolve(Response.json(clientExamples.extractResponse));
    await settle(); h.render();
    expect(content(h.tree)).not.toContain(locales.bn.messageFailed);
    expect(content(h.tree)).toContain(locales.bn.understoodTitle);
    h.unmount();
  });

  it("a cancelled request cannot be retried, so cancelled audio or text is never resent (N1)", async () => {
    const { h, fetchImpl, response } = request();
    response.resolve(Response.json(errorEnvelope("E-021"), { status: 500 }));
    await settle(); h.render();
    const retry = button(h.tree, locales.bn.retryAction);
    const link = elements(h.tree).find((n) => n.props.href === MANUAL_FORM_PATH)!;
    (link.props.onClick as (e: MouseEvent<HTMLAnchorElement>) => void)(plainClick);
    click(retry); await settle();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    h.unmount();
  });

  it("unmount aborts the request and ignores a late response", async () => {
    const { h, signal, response } = request();
    h.unmount();
    expect(signal.aborted).toBe(true);
    response.resolve(Response.json(clientExamples.extractResponse));
    await settle();
    expect(h.dirty).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("manual navigation aborts the request and preserves the parent's text", () => {
    const { h, signal } = request();
    const link = elements(h.tree).find((n) => n.props.href === MANUAL_FORM_PATH)!;
    (link.props.onClick as (e: MouseEvent<HTMLAnchorElement>) => void)(plainClick);
    expect(signal.aborted).toBe(true);
    expect(takeHandoff()?.sourceText).toBe("আমার মেয়ে নুসরাত, বয়স ৭ বছর।");
    h.unmount();
  });

  it("a modified hand-off click leaves the current request and memory alone", () => {
    const { h, signal } = request();
    const link = elements(h.tree).find((n) => n.props.href === MANUAL_FORM_PATH)!;
    (link.props.onClick as (e: MouseEvent<HTMLAnchorElement>) => void)({ ...plainClick, ctrlKey: true });
    expect(signal.aborted).toBe(false);
    expect(takeHandoff()).toBeNull();
    h.unmount();
  });

  it("confirms a non-empty discard in-page, and Keep preserves the text", () => {
    const { h } = request();
    click(button(h.tree, locales.bn.discardAction)); h.render();
    expect(content(h.tree)).toContain(locales.bn.discardConfirm);
    click(button(h.tree, locales.bn.discardNo)); h.render();
    expect(push).not.toHaveBeenCalled();
    expect(elements(h.tree).find((n) => n.type === "textarea")?.props.value).toContain("নুসরাত");
    click(button(h.tree, locales.bn.discardAction)); h.render();
    click(button(h.tree, locales.bn.discardYes));
    expect(push).toHaveBeenCalledWith("/");
    h.unmount();
  });

  it("skips confirmation when nothing has been entered", () => {
    const h = mountHooks(() => IntakeChat({ locale: "bn", mode: "fake" }));
    click(button(h.tree, locales.bn.discardAction)); h.render();
    expect(push).toHaveBeenCalledWith("/");
    expect(content(h.tree)).not.toContain(locales.bn.discardConfirm);
    h.unmount();
  });

  it("Escape keeps the draft, and reaching maxLength announces the limit", () => {
    const h = mountHooks(() => IntakeChat({ locale: "bn", mode: "fake" }));
    changeText(h.tree, "ক".repeat(2000)); h.render();
    expect(content(h.tree)).toContain(locales.bn.textLimitReached);
    click(button(h.tree, locales.bn.discardAction)); h.render();
    const panel = elements(h.tree).find((n) => n.props.role === "group" && n.props.onKeyDown)!;
    const preventDefault = vi.fn();
    (panel.props.onKeyDown as (e: unknown) => void)({ key: "Escape", preventDefault }); h.render();
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(elements(h.tree).find((n) => n.type === "textarea")?.props.value).toHaveLength(2000);
    expect(push).not.toHaveBeenCalled();
    h.unmount();
  });

  it("the slow form link also aborts the current request", () => {
    const { h, signal } = request(); vi.advanceTimersByTime(10_000); h.render();
    const slow = elements(h.tree).find((n) => n.props.href === MANUAL_FORM_PATH && content(n).includes(locales.bn.useFormLink))!;
    (slow.props.onClick as (e: MouseEvent<HTMLAnchorElement>) => void)(plainClick);
    expect(signal.aborted).toBe(true);
    h.unmount();
  });

  it("discard → new intake acknowledgement → old permission resolves never uploads audio (item 14)", async () => {
    const media = fakeMedia();
    const permission = deferred<MediaStream>(); media.getUserMedia.mockReturnValueOnce(permission.promise);
    const fetchImpl = vi.fn(); vi.stubGlobal("fetch", fetchImpl);
    const h = mountHooks(() => IntakeChat({ locale: "bn", mode: "live" }));
    const props = elements(h.tree).find((n) => n.type === VoiceRecorder)!.props as Parameters<typeof VoiceRecorder>[0];
    const recorder = mountHooks(() => VoiceRecorder(props));
    click(button(recorder.tree, locales.bn.recordAction)); h.render();
    click(button(h.tree, locales.bn.discardAction)); h.render(); recorder.unmount();
    click(button(h.tree, locales.bn.discardYes)); h.unmount();
    const next = mountHooks(() => IntakeChat({ locale: "bn", mode: "live" }));
    click(button(next.tree, locales.bn.noticeAckAction)); next.render();
    permission.resolve(media.stream); await settle(); vi.advanceTimersByTime(121_000);
    expect(media.records).toHaveLength(0);
    expect(media.stopTrack).toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    next.unmount();
  });

  it("disables retry and blocks repeat activation while a request is in flight", async () => {
    const { h, fetchImpl, response } = request();
    response.resolve(Response.json(errorEnvelope("E-021"), { status: 500 }));
    await settle(); h.render();
    const next = deferred<Response>(); fetchImpl.mockReturnValue(next.promise);
    const retry = button(h.tree, locales.bn.retryAction);
    click(retry); click(retry); h.render();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const retryNow = elements(h.tree).find((n) => n.type === "button" && content(n) === locales.bn.retryAction);
    expect(retryNow === undefined || retryNow.props["aria-disabled"] === true).toBe(true);
    h.unmount();
  });

  it("effect setup/cleanup/setup replay leaves microphone capture usable (StrictMode)", async () => {
    const media = fakeMedia();
    const h = mountHooks(() => IntakeChat({ locale: "bn", mode: "live" }));
    h.replayEffects();
    const props = elements(h.tree).find((n) => n.type === VoiceRecorder)!.props as Parameters<typeof VoiceRecorder>[0];
    expect(props.cancelSignal?.aborted).toBe(false);
    const recorder = mountHooks(() => VoiceRecorder(props)); recorder.replayEffects();
    click(button(recorder.tree, locales.bn.recordAction)); await settle();
    expect(media.records).toHaveLength(1);
    recorder.unmount(); h.unmount();
  });

  it("E-019 → Start again → notice → acknowledgement permits a fresh request", async () => {
    const { h, fetchImpl, response } = request();
    response.resolve(Response.json(errorEnvelope("E-019"), { status: 401 }));
    await settle(); h.render();
    click(button(h.tree, locales.bn.startAgainAction)); h.render();
    expect(elements(h.tree).some((n) => n.type === "textarea")).toBe(false);
    click(button(h.tree, locales.bn.noticeAckAction)); h.render();
    changeText(h.tree, "আমার মেয়ে নুসরাত, বয়স ৭ বছর।"); h.render();
    submit(h.tree); await settle(); h.render();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    h.unmount();
  });

  it("manual handoff keeps an unsent follow-up alongside the extracted source", async () => {
    const { h, response } = request(); response.resolve(Response.json(clientExamples.extractResponse));
    await settle(); h.render();
    changeText(h.tree, "মিরপুরের বাসস্ট্যান্ডের পাশে"); h.render();
    const link = elements(h.tree).find((n) => n.props.href === MANUAL_FORM_PATH)!;
    (link.props.onClick as (e: MouseEvent<HTMLAnchorElement>) => void)(plainClick);
    const handoff = takeHandoff();
    expect(handoff?.sourceText).toContain(clientExamples.extractResponse.draft.source_text);
    expect(handoff?.sourceText).toContain("মিরপুরের বাসস্ট্যান্ডের পাশে");
    h.unmount();
  });
});

describe("round 2: failures are visible, not silent (W2-W5, B1)", () => {
  it("an exception while applying a reply ends busy with a retryable error and logs the name only", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { h, response } = request();
    thrower.on = true;
    response.resolve(Response.json(clientExamples.extractResponse));
    await settle(); h.render();
    thrower.on = false;
    expect(content(h.tree)).toContain(errorEnvelope("E-021").error.message_bn);
    expect(elements(h.tree).find((n) => n.type === "button" && content(n) === locales.bn.retryAction)).toBeDefined();
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("Error");
    expect(logged).not.toContain("secret payload");
    warn.mockRestore(); h.unmount();
  });

  it("a send after the notice was cleared returns to the notice instead of doing nothing (W4)", async () => {
    const fetchImpl = vi.fn(); vi.stubGlobal("fetch", fetchImpl);
    const h = mountHooks(() => IntakeChat({ locale: "bn", mode: "live" }));
    changeText(h.tree, "আমার মেয়ে নুসরাত, বয়স ৭ বছর।"); h.render();
    clearIntakeMemory();
    submit(h.tree); await settle(); h.render();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(button(h.tree, locales.bn.noticeAckAction)).toBeDefined();
    h.unmount();
  });

  it("a finished recording that cannot be sent says so (W5)", () => {
    const { h } = request();
    const props = elements(h.tree).find((n) => n.type === VoiceRecorder)!.props as Parameters<typeof VoiceRecorder>[0];
    props.onRecorded(new Blob(["synthetic audio"]), 30); h.render();
    expect(content(h.tree)).toContain(locales.bn.recordingNotSent);
    h.unmount();
  });

  it("sending while a recording is open explains why nothing was sent", () => {
    const fetchImpl = vi.fn(); vi.stubGlobal("fetch", fetchImpl);
    const h = mountHooks(() => IntakeChat({ locale: "bn", mode: "live" }));
    const props = elements(h.tree).find((n) => n.type === VoiceRecorder)!.props as Parameters<typeof VoiceRecorder>[0];
    props.onActivityChange?.(true); h.render();
    changeText(h.tree, "আমার মেয়ে নুসরাত, বয়স ৭ বছর।"); h.render(); submit(h.tree); h.render();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(content(h.tree)).toContain(locales.bn.finishRecordingFirst);
    h.unmount();
  });

  it("a microphone prompt that never settles frees the composer after the timeout (B1)", async () => {
    const media = fakeMedia();
    media.getUserMedia.mockReturnValueOnce(new Promise(() => {}));
    const fetchImpl = vi.fn(); vi.stubGlobal("fetch", fetchImpl);
    const h = mountHooks(() => IntakeChat({ locale: "bn", mode: "live" }));
    const props = elements(h.tree).find((n) => n.type === VoiceRecorder)!.props as Parameters<typeof VoiceRecorder>[0];
    const recorder = mountHooks(() => VoiceRecorder(props));
    click(button(recorder.tree, locales.bn.recordAction)); h.render();
    vi.advanceTimersByTime(PERMISSION_TIMEOUT_MS); recorder.render(); h.render();
    changeText(h.tree, "আমার মেয়ে নুসরাত, বয়স ৭ বছর।"); h.render(); submit(h.tree);
    expect(fetchImpl).toHaveBeenCalledOnce();
    recorder.unmount(); h.unmount();
  });
});
