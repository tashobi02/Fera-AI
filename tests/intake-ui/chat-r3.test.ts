// TASK-021 round 3: F2 retry blocked while the discard confirmation is open, F3 hidden-tab drop notice,
// F4 focus effects skipped while the confirmation is open.
import type { FormEvent, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientExamples } from "@/contracts/client-examples";
import { errorEnvelope } from "@/contracts";
import { acknowledgeNotice, clearIntakeMemory } from "@/lib/intake/handoff";
import { locales } from "@/locales";
import { button, click, content, elements, mountHooks, settle } from "./fakes/hook-harness";
import { deferred, fakeMedia } from "./fakes/media";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), ...(await import("./fakes/hook-harness")).testHooks }));
const { IntakeChat } = await import("@/app/(parent)/intake/intake-chat");
const { VoiceRecorder } = await import("@/app/(parent)/intake/voice-recorder");

const changeText = (tree: ReactNode, text: string) => {
  const node = elements(tree).find((n) => n.type === "textarea")!;
  (node.props.onChange as (e: { target: { value: string } }) => void)({ target: { value: text } });
};
const submit = (tree: ReactNode) => {
  const form = elements(tree).find((n) => n.type === "form")!;
  (form.props.onSubmit as (e: FormEvent) => void)({ preventDefault() {} } as FormEvent);
};
let doc: EventTarget & { visibilityState: string };
beforeEach(() => {
  vi.useFakeTimers(); push.mockClear(); acknowledgeNotice();
  doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("document", doc);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); clearIntakeMemory(); });

const TEXT = "আমার মেয়ে নুসরাত, বয়স ৭ বছর।";
function chat(fetchImpl: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchImpl);
  const h = mountHooks(() => IntakeChat({ locale: "bn", mode: "live" }));
  changeText(h.tree, TEXT); h.render(); submit(h.tree); h.render();
  return h;
}

describe("F2 retry while the discard confirmation is open", () => {
  it("does nothing", async () => {
    const first = deferred<Response>();
    const fetchImpl = vi.fn(() => first.promise);
    const h = chat(fetchImpl);
    first.resolve(Response.json(errorEnvelope("E-021"), { status: 500 })); await settle(); h.render();
    click(button(h.tree, locales.bn.discardAction)); h.render();
    click(button(h.tree, locales.bn.retryAction)); await settle(); h.render();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    h.unmount();
  });
});

describe("F4 focus effects while the discard confirmation is open", () => {
  it("a late reply does not move focus away from the confirmation", async () => {
    const first = deferred<Response>(); const second = deferred<Response>();
    const fetchImpl = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const h = chat(fetchImpl);
    first.resolve(Response.json(clientExamples.extractResponse)); await settle(); h.render();
    const focus = vi.fn();
    const q = elements(h.tree).find((n) => n.props.focusRef !== undefined);
    if (!q) throw new Error("no focused question");
    (q.props.focusRef as { current: unknown }).current = { focus };
    changeText(h.tree, "ঢাকা"); h.render(); submit(h.tree); h.render();
    click(button(h.tree, locales.bn.discardAction)); h.render();
    focus.mockClear();
    second.resolve(Response.json({ ...clientExamples.extractResponse, draft_revision: 9 })); await settle(); h.render();
    expect(focus).not.toHaveBeenCalled();
    h.unmount();
  });
});

describe("F3 a recording dropped by a hidden tab is announced calmly", () => {
  it("shows recordingNotSent for visibilitychange but not for pagehide", async () => {
    for (const how of ["visibility", "pagehide"] as const) {
      fakeMedia();
      const h = mountHooks(() => VoiceRecorder({ locale: "bn", busy: false, off: null, onRecorded: vi.fn(), onUnavailable: vi.fn() }));
      click(button(h.tree, locales.bn.recordAction)); await settle(); h.render();
      if (how === "visibility") { doc.visibilityState = "hidden"; doc.dispatchEvent(new Event("visibilitychange")); }
      else window.dispatchEvent(new Event("pagehide"));
      h.render();
      expect(content(h.tree).includes(locales.bn.recordingNotSent)).toBe(how === "visibility");
      h.unmount();
      doc.visibilityState = "visible";
    }
  });
});
