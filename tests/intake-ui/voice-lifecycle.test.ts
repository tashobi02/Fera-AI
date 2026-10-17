import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acknowledgeNotice, clearIntakeMemory } from "@/lib/intake/handoff";
import { ERROR_CATALOGUE } from "@/contracts";
import { locales } from "@/locales";
import { PERMISSION_TIMEOUT_MS } from "@/lib/intake/recorder";
import { button, click, content, elements, mountHooks, settle } from "./fakes/hook-harness";
import { deferred, fakeMedia } from "./fakes/media";

vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), ...(await import("./fakes/hook-harness")).testHooks }));
const { VoiceRecorder } = await import("@/app/(parent)/intake/voice-recorder");

let win: EventTarget;
let doc: EventTarget & { visibilityState: string };
beforeEach(() => {
  vi.useFakeTimers(); acknowledgeNotice();
  win = new EventTarget(); doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  vi.stubGlobal("window", win); vi.stubGlobal("document", doc);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); clearIntakeMemory(); });

function mount() {
  const onRecorded = vi.fn();
  const onUnavailable = vi.fn();
  const h = mountHooks(() => VoiceRecorder({ locale: "bn", busy: false, off: null, onRecorded, onUnavailable }));
  click(button(h.tree, locales.bn.recordAction));
  return { h, onRecorded, onUnavailable };
}

describe("recorder privacy and recovery (items 1 and 14)", () => {
  it("unmount during pending permission stops the granted tracks without constructing or sending", async () => {
    const media = fakeMedia();
    const permission = deferred<MediaStream>();
    media.getUserMedia.mockReturnValueOnce(permission.promise);
    const { h, onRecorded } = mount();
    h.unmount();
    expect(vi.getTimerCount()).toBe(0);
    permission.resolve(media.stream);
    await settle();
    expect(media.stopTrack).toHaveBeenCalled();
    expect(media.records).toHaveLength(0);
    expect(onRecorded).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("constructor failure releases every track and offers the text path", async () => {
    const media = fakeMedia();
    media.failConstructor();
    const { h, onUnavailable } = mount();
    await settle(); h.render();
    expect(media.stopTrack).toHaveBeenCalled();
    expect(onUnavailable).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    h.unmount();
  });

  it("unmount while recording clears the interval and tracks, and drops a queued stop", async () => {
    const media = fakeMedia();
    const { h, onRecorded } = mount();
    await settle(); h.render();
    const queuedStop = media.records[0].onstop;
    expect(vi.getTimerCount()).toBe(1);
    h.unmount();
    expect(vi.getTimerCount()).toBe(0);
    queuedStop?.(new Event("stop"));
    vi.advanceTimersByTime(121_000);
    expect(vi.getTimerCount()).toBe(0);
    expect(media.stopTrack).toHaveBeenCalled();
    expect(onRecorded).not.toHaveBeenCalled();
  });

  it("a late cancelled permission cannot clear a newer recording's auto-stop timer", async () => {
    const media = fakeMedia();
    const permission = deferred<MediaStream>();
    media.getUserMedia.mockReturnValueOnce(permission.promise);
    let controller = new AbortController();
    const onRecorded = vi.fn();
    const h = mountHooks(() => VoiceRecorder({ locale: "bn", busy: false, off: null, onRecorded, onUnavailable: vi.fn(), cancelSignal: controller.signal }));
    click(button(h.tree, locales.bn.recordAction));
    controller.abort(); h.render();
    controller = new AbortController(); h.render();
    click(button(h.tree, locales.bn.recordAction)); await settle(); h.render();
    expect(vi.getTimerCount()).toBe(1);
    permission.resolve(media.stream); await settle();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(120_000);
    expect(onRecorded).toHaveBeenCalledOnce();
    h.unmount();
  });

  it("a queued old stop after a successful recording cannot send twice", async () => {
    const media = fakeMedia();
    const { h, onRecorded } = mount(); await settle(); h.render();
    const queued = media.records[0].onstop;
    vi.advanceTimersByTime(6000); click(button(h.tree, locales.bn.stopAction)); h.render();
    queued?.(new Event("stop"));
    expect(onRecorded).toHaveBeenCalledOnce();
    h.unmount();
  });

  it("does not duplicate the no-microphone catalogue message", async () => {
    const media = fakeMedia();
    media.getUserMedia.mockRejectedValueOnce(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
    const { h } = mount(); await settle(); h.render();
    expect(content(h.tree).split(ERROR_CATALOGUE["E-022"].bn)).toHaveLength(2);
    expect(elements(h.tree).filter((node) => node.props["aria-live"] === "polite")).toHaveLength(1);
    h.unmount();
  });

  it("start failure releases resources and leaves a recoverable button", async () => {
    const media = fakeMedia();
    media.failStart();
    const { h, onRecorded } = mount();
    await settle(); h.render();
    expect(media.stopTrack).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(button(h.tree, locales.bn.recordAction)).toBeDefined();
    expect(content(h.tree)).toContain(ERROR_CATALOGUE["E-021"].bn);
    expect(onRecorded).not.toHaveBeenCalled();
    h.unmount();
  });

  it("onerror stops resources and allows another attempt without sending partial audio", async () => {
    const media = fakeMedia();
    const { h, onRecorded } = mount();
    await settle(); h.render();
    media.records[0].onerror?.(new Event("error"));
    h.render();
    expect(media.stopTrack).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(button(h.tree, locales.bn.recordAction)).toBeDefined();
    expect(content(h.tree)).toContain(ERROR_CATALOGUE["E-021"].bn);
    expect(onRecorded).not.toHaveBeenCalled();
    h.unmount();
  });

  it("discard → acknowledge a new intake → permission resolves: old audio never auto-sends", async () => {
    const media = fakeMedia();
    const permission = deferred<MediaStream>();
    media.getUserMedia.mockReturnValueOnce(permission.promise);
    const { h, onRecorded } = mount();
    clearIntakeMemory();
    acknowledgeNotice();
    permission.resolve(media.stream);
    await settle(); h.render();
    vi.advanceTimersByTime(121_000);
    expect(media.stopTrack).toHaveBeenCalled();
    expect(media.records).toHaveLength(0);
    expect(onRecorded).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    h.unmount();
  });

  it("announces recording stopped/sending after an ordinary stop", async () => {
    const media = fakeMedia();
    const { h, onRecorded } = mount();
    await settle(); h.render();
    vi.advanceTimersByTime(6000);
    click(button(h.tree, locales.bn.stopAction));
    h.render();
    expect(onRecorded).toHaveBeenCalledOnce();
    expect(content(h.tree)).toContain(locales.bn.recordingStopped);
    expect(media.stopTrack).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    h.unmount();
  });

  it("does not announce sending a short clip that the parent rejects locally", async () => {
    fakeMedia();
    const { h } = mount(); await settle(); h.render();
    vi.advanceTimersByTime(1000); click(button(h.tree, locales.bn.stopAction)); h.render();
    expect(content(h.tree)).not.toContain(locales.bn.sending);
    h.unmount();
  });
});

describe("round 2: permission, diagnostics and page hide (B1, W1, N2, R4)", () => {
  const rejectWith = (name: string) => Object.assign(new Error("secret message text"), { name });

  it("a permission prompt that never settles times out into a retryable error and releases the late stream", async () => {
    const media = fakeMedia();
    const permission = deferred<MediaStream>();
    media.getUserMedia.mockReturnValueOnce(permission.promise);
    const onActivityChange = vi.fn();
    const onUnavailable = vi.fn();
    const h = mountHooks(() => VoiceRecorder({ locale: "bn", busy: false, off: null, onRecorded: vi.fn(), onUnavailable, onActivityChange }));
    click(button(h.tree, locales.bn.recordAction)); h.render();
    vi.advanceTimersByTime(PERMISSION_TIMEOUT_MS - 1); h.render();
    expect(onActivityChange).toHaveBeenLastCalledWith(true);
    vi.advanceTimersByTime(1); h.render();
    expect(onActivityChange).toHaveBeenLastCalledWith(false);
    expect(onUnavailable).not.toHaveBeenCalled();
    expect(content(h.tree)).toContain(ERROR_CATALOGUE["E-021"].bn);
    expect(button(h.tree, locales.bn.recordAction)).toBeDefined();
    permission.resolve(media.stream); await settle();
    expect(media.stopTrack).toHaveBeenCalled();
    expect(media.records).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    h.unmount();
  });

  it("a prompt answered in time does not time out later", async () => {
    const media = fakeMedia();
    const { h } = mount(); await settle(); h.render();
    vi.advanceTimersByTime(PERMISSION_TIMEOUT_MS + 1000); h.render();
    expect(media.records).toHaveLength(1);
    expect(content(h.tree)).not.toContain(ERROR_CATALOGUE["E-021"].bn);
    h.unmount();
  });

  it.each(["NotAllowedError", "NotFoundError", "SecurityError"])("%s is final for the page (E-022)", async (name) => {
    const media = fakeMedia();
    media.getUserMedia.mockRejectedValueOnce(rejectWith(name));
    const { h, onUnavailable } = mount(); await settle(); h.render();
    expect(onUnavailable).toHaveBeenCalledOnce();
    h.unmount();
  });

  it.each(["AbortError", "NotReadableError", "OverconstrainedError", "TypeError"])("%s is retryable (E-021), not final", async (name) => {
    const media = fakeMedia();
    media.getUserMedia.mockRejectedValueOnce(rejectWith(name));
    const { h, onUnavailable } = mount(); await settle(); h.render();
    expect(onUnavailable).not.toHaveBeenCalled();
    expect(content(h.tree)).toContain(ERROR_CATALOGUE["E-021"].bn);
    click(button(h.tree, locales.bn.recordAction)); await settle(); h.render();
    expect(media.records).toHaveLength(1);
    h.unmount();
  });

  it("diagnostics carry the error name only", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const media = fakeMedia();
    media.getUserMedia.mockRejectedValueOnce(rejectWith("NotReadableError"));
    const { h } = mount(); await settle(); h.render();
    click(button(h.tree, locales.bn.recordAction)); await settle(); h.render();
    media.records[0].onerror?.(Object.assign(new Event("error"), { error: rejectWith("UnknownError") }));
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("NotReadableError");
    expect(logged).not.toContain("secret message text");
    expect(warn.mock.calls.length).toBeGreaterThanOrEqual(2);
    warn.mockRestore(); h.unmount();
  });

  for (const [label, fire] of [
    ["pagehide", (w: EventTarget) => w.dispatchEvent(new Event("pagehide"))],
    ["visibilitychange to hidden", (_w: EventTarget, d: { visibilityState: string; dispatchEvent: (e: Event) => boolean }) => { d.visibilityState = "hidden"; d.dispatchEvent(new Event("visibilitychange")); }],
  ] as const) {
    it(`${label} stops and drops a recording unsent`, async () => {
      const media = fakeMedia();
      const onActivityChange = vi.fn();
      const onRecorded = vi.fn();
      const h = mountHooks(() => VoiceRecorder({ locale: "bn", busy: false, off: null, onRecorded, onUnavailable: vi.fn(), onActivityChange }));
      click(button(h.tree, locales.bn.recordAction)); await settle(); h.render();
      vi.advanceTimersByTime(6000);
      fire(win, doc); h.render();
      expect(media.stopTrack).toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
      expect(onActivityChange).toHaveBeenLastCalledWith(false);
      expect(onRecorded).not.toHaveBeenCalled();
      expect(button(h.tree, locales.bn.recordAction)).toBeDefined();
      h.unmount();
      win.dispatchEvent(new Event("pagehide")); // listener removed on unmount: nothing throws
    });
  }
});
