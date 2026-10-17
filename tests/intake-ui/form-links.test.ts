// P3-021: S-002 and S-003 must link to /intake/form with no planned label and
// no child payload in the URL. The form reads the device-local draft on
// mount; the link itself is just a navigation event.
import type { MouseEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientExamples } from "@/contracts/client-examples";
import { errorEnvelope } from "@/contracts";
import {
  acknowledgeNotice,
  clearIntakeMemory,
  handOff,
  MANUAL_FORM_PATH,
  takeHandoff,
} from "@/lib/intake/handoff";
import { locales } from "@/locales";
import { content, elements, mountHooks } from "./fakes/hook-harness";
import { memoryStorage } from "../intake/review/storage";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), ...(await import("./fakes/hook-harness")).testHooks }));

beforeEach(() => {
  push.mockClear(); acknowledgeNotice();
  vi.stubGlobal("window", { localStorage: memoryStorage(), confirm: () => true });
  vi.stubGlobal("document", { visibilityState: "visible", getElementById: () => null });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); clearIntakeMemory(); });

const plainClick = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false } as MouseEvent<HTMLAnchorElement>;
async function submitText(h: ReturnType<typeof mountHooks>, text: string) {
  const textArea = elements(h.tree).find((node) => node.type === "textarea");
  if (!textArea) return;
  (textArea.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: text } });
  h.render();
  const form = elements(h.tree).find((node) => node.type === "form");
  if (!form) throw new Error("Expected the intake composer while the parent can still answer");
  (form.props.onSubmit as (event: { preventDefault: () => void }) => void)({ preventDefault() {} });
  h.render();
  await vi.advanceTimersByTimeAsync(1_000);
  h.render();
}
async function reachManualPhase(h: ReturnType<typeof mountHooks>, initialText: string) {
  await submitText(h, initialText);
  for (let answer = 0; answer < 6 && elements(h.tree).some((node) => node.type === "textarea"); answer++) {
    await submitText(h, "জানি না");
  }
}

describe("S-002 (intake chat) manual form link is real, not planned", () => {
  it("the slow useFormLink points at the manual form with no child payload in the URL", async () => {
    const { IntakeChat } = await import("@/app/(parent)/intake/intake-chat");
    vi.useFakeTimers();
    try {
      // Keep the live HTTP request pending in-process so the actual slow-state
      // affordance is rendered without making a provider or network call.
      const fetcher = vi.fn(() => new Promise<Response>(() => {}));
      vi.stubGlobal("fetch", fetcher);
      const h = mountHooks(() => IntakeChat({ locale: "bn", mode: "live" }));
      const textArea = elements(h.tree).find((n) => n.type === "textarea")!;
      (textArea.props.onChange as (e: { target: { value: string } }) => void)({ target: { value: "আমার মেয়ে নুসরাত, বয়স ৭" } });
      h.render();
      const form = elements(h.tree).find((n) => n.type === "form")!;
      (form.props.onSubmit as (e: { preventDefault: () => void }) => void)({ preventDefault() {} });
      h.render();
      await vi.advanceTimersByTimeAsync(10_001); h.render();
      const link = elements(h.tree).find((n) => n.props.href === MANUAL_FORM_PATH && content(n).includes(locales.bn.useFormLink))!;
      expect(link).toBeDefined();
      expect(fetcher).toHaveBeenCalledTimes(1);
      // The link text no longer wraps a planned label; the manual form is built.
      expect(content(link)).not.toContain(locales.bn.plannedLabel);
      expect(String(link.props.href)).toBe(MANUAL_FORM_PATH);
      h.unmount();
    } finally { vi.useRealTimers(); }
  });

  it("the manual phase renders an openFormAction link to /intake/form, not a planned label", async () => {
    const { IntakeChat } = await import("@/app/(parent)/intake/intake-chat");
    vi.useFakeTimers();
    const h = mountHooks(() => IntakeChat({ locale: "bn", mode: "fake" }));
    try {
      await reachManualPhase(h, "আমার মেয়ে নুসরাত");
      const formLinks = elements(h.tree).filter((n) => n.props.href === MANUAL_FORM_PATH);
      expect(formLinks.length).toBeGreaterThan(0);
      for (const link of formLinks) {
        expect(content(link)).not.toContain(locales.bn.plannedLabel);
        expect(content(link)).toContain(locales.bn.openFormAction);
      }
    } finally { h.unmount(); vi.useRealTimers(); }
  });

  it("a click on the manual form link hands off nothing in the URL — the device-local draft carries the source", async () => {
    const { IntakeChat } = await import("@/app/(parent)/intake/intake-chat");
    vi.useFakeTimers();
    const h = mountHooks(() => IntakeChat({ locale: "bn", mode: "fake" }));
    const source = "আমার মেয়ে নুসরাত, বয়স ৭ বছর।";
    try {
      await reachManualPhase(h, source);
      const link = elements(h.tree).find((n) => n.props.href === MANUAL_FORM_PATH);
      expect(link).toBeDefined();
      (link!.props.onClick as (event: MouseEvent<HTMLAnchorElement>) => void)(plainClick);
      // The handoff is in module memory, not the URL: no child payload, no query string.
      expect(String(link!.props.href)).toBe(MANUAL_FORM_PATH);
      expect(String(link!.props.href)).not.toContain("?");
      const pending = takeHandoff();
      expect(pending?.to).toBe("manual");
      expect(pending?.sourceText).toContain(source);
    } finally { h.unmount(); vi.useRealTimers(); }
  });
});

describe("S-003 (review screen) manual form link is real, not planned", () => {
  it("renders a real /intake/form link without a planned label wrapper", async () => {
    const { ReviewScreen } = await import("@/app/(parent)/intake/review/review-screen");
    handOff({
      to: "review",
      sourceText: clientExamples.createMissingRequest.draft.source_text,
      response: { ...clientExamples.extractResponse, expires_at: new Date(Date.now() + 60_000).toISOString() },
      missing: [],
      asked: 4,
      cached: false,
      mock: false,
    });
    const h = mountHooks(() => ReviewScreen({ locale: "bn" }));
    const link = elements(h.tree).find((n) => n.props.href === MANUAL_FORM_PATH);
    expect(link).toBeDefined();
    expect(content(link!)).toBe(locales.bn.reviewManualLink);
    expect(content(h.tree)).not.toContain(locales.bn.plannedLabel);
    h.unmount();
  });

  it("the manual link on S-003 is a tertiary action, not a planned label", async () => {
    const { ReviewScreen } = await import("@/app/(parent)/intake/review/review-screen");
    handOff({
      to: "review",
      sourceText: clientExamples.createMissingRequest.draft.source_text,
      response: { ...clientExamples.extractResponse, expires_at: new Date(Date.now() + 60_000).toISOString() },
      missing: [],
      asked: 4,
      cached: false,
      mock: false,
    });
    const h = mountHooks(() => ReviewScreen({ locale: "bn" }));
    const link = elements(h.tree).find((n) => n.props.href === MANUAL_FORM_PATH)!;
    expect(String(link.props.className)).toContain("min-h-11");
    h.unmount();
  });
});
