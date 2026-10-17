// TASK-021 round-4 acceptance: Node hook/markup tests, no browser or network.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { errorEnvelope } from "@/contracts";
import { locales, type Locale } from "@/locales";
import { acknowledgeNotice, clearIntakeMemory } from "@/lib/intake/handoff";
import { button, click, content, elements, mountHooks, settle } from "./fakes/hook-harness";
import { deferred, fakeMedia } from "./fakes/media";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), ...(await import("./fakes/hook-harness")).testHooks }));
const { VoiceRecorder } = await import("@/app/(parent)/intake/voice-recorder");
const { IntakeChat } = await import("@/app/(parent)/intake/intake-chat");
const { ProviderNotice } = await import("@/app/(parent)/provider-notice");

beforeEach(() => {
  vi.useFakeTimers(); acknowledgeNotice();
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); clearIntakeMemory(); });

for (const locale of ["bn", "en"] as const satisfies readonly Locale[]) {
  const t = locales[locale];
  describe(`round-4 recorder/composer (${locale})`, () => {
    it("shows sending inside the disabled recorder with an inert control, a spinner, and exactly one visible sending message", () => {
      const getUserMedia = fakeMedia().getUserMedia;
      const h = mountHooks(() => VoiceRecorder({ locale, busy: true, off: null, onRecorded: vi.fn(), onUnavailable: vi.fn() }));
      const control = button(h.tree, t.recordAction);
      expect(control.props["aria-disabled"]).toBe(true);
      const nodes = elements(control);
      const label = nodes.find((n) => n.props.id === control.props["aria-labelledby"]);
      expect(label).toBeDefined();
      expect(content(label)).toBe(t.recordAction);
      expect(String(label?.props.className)).toContain("sr-only");
      expect(content(control)).toContain(t.sending);
      expect(content(control).split(t.sending)).toHaveLength(2); // the label is gone: t.messageSending is a prefix of the English t.sending
      const visibleNodes = nodes.filter((n) => !String(n.props.className ?? "").includes("sr-only"));
      const visibleSending = visibleNodes.filter((n) => [n.props.children].flat().includes(t.sending)); // the text's own element, not its wrappers
      expect(visibleSending).toHaveLength(1);
      const spinnerLine = visibleNodes.find((n) => String(n.props.className).includes("flex-wrap") && content(n).includes(t.sending));
      expect(String(spinnerLine?.props.className)).toContain("text-body-lg text-body");
      expect(String(spinnerLine?.props.className)).not.toContain("text-disabled");
      expect(nodes.some((n) => String(n.props.className).includes("animate-spin"))).toBe(true);
      expect(String(control.props.className)).not.toContain("opacity-70");
      expect(String(control.props.className)).toContain("aria-disabled:text-disabled");
      const liveRegion = elements(h.tree).find((n) => n.props["aria-live"] === "polite");
      expect(liveRegion).toBeDefined();
      expect(content(liveRegion)).toBe(t.sending);
      click(control);
      expect(getUserMedia).not.toHaveBeenCalled();
      h.unmount();
    });

    it("keeps the idle instruction at the 18 px parent body size and centres narrow text", () => {
      const h = mountHooks(() => VoiceRecorder({ locale, busy: false, off: null, onRecorded: vi.fn(), onUnavailable: vi.fn() }));
      const control = button(h.tree, t.recordAction);
      const nodes = elements(control);
      const hint = nodes.find((n) => n.props.id === control.props["aria-describedby"]);
      expect(String(hint?.props.className)).toContain("text-body-lg"); // globals.css: 1.125rem
      expect(nodes.some((n) => String(n.props.className).includes("text-center min-[24rem]:text-start"))).toBe(true);
      h.unmount();
    });

    it("centres the recording status in the narrow layout", async () => {
      fakeMedia();
      const h = mountHooks(() => VoiceRecorder({ locale, busy: false, off: null, onRecorded: vi.fn(), onUnavailable: vi.fn() }));
      click(button(h.tree, t.recordAction)); await settle(); h.render();
      const status = elements(h.tree).find((n) => n.type === "span" && content(n).includes(t.listening) && String(n.props.className).includes("flex-wrap"));
      expect(String(status?.props.className)).toContain("justify-center min-[24rem]:justify-start");
      h.unmount();
    });

    it("uses the text-only label after voice is unavailable", () => {
      const h = mountHooks(() => IntakeChat({ locale, mode: "fake" }));
      const recorder = elements(h.tree).find((n) => n.type === VoiceRecorder)!;
      (recorder.props.onUnavailable as () => void)(); h.render();
      const textarea = elements(h.tree).find((n) => n.type === "textarea")!;
      const label = elements(h.tree).find((n) => n.type === "label" && n.props.htmlFor === textarea.props.id)!;
      expect(content(label)).toBe(t.typeHere);
      h.unmount();
    });

    it("keeps the slow status visible while avoiding duplicate ordinary upload status", async () => {
      const pending = deferred<Response>();
      vi.stubGlobal("fetch", vi.fn(() => pending.promise));
      const h = mountHooks(() => IntakeChat({ locale, mode: "live" }));
      const recorder = elements(h.tree).find((n) => n.type === VoiceRecorder)!;
      (recorder.props.onRecorded as (audio: Blob, duration: number) => void)(new Blob(["synthetic audio"], { type: "audio/webm" }), 6);
      h.render();
      expect(elements(h.tree).find((n) => n.type === VoiceRecorder)?.props.busy).toBe(true);
      expect(content(elements(h.tree).find((n) => n.props.role === "status"))).not.toContain(t.sending);
      vi.advanceTimersByTime(10_000); h.render();
      expect(content(h.tree)).toContain(t.stillWorking);
      pending.resolve(Response.json(errorEnvelope("E-011"), { status: 503 }));
      await settle(); h.render(); h.unmount();
    });
  });
}

it("aligns the full notice icon with the first heading line", () => {
  const html = renderToStaticMarkup(createElement(ProviderNotice, { locale: "bn", variant: "full" }));
  const heading = html.match(/<h2[^>]*>[\s\S]*?<\/h2>/)?.[0] ?? "";
  expect(heading).toContain("items-start");
  expect(heading).toContain("mt-[0.3em]");
});
