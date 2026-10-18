// TC-021 (D6 §9.4 / D3 §7 row 14): when the browser reports offline, the parent
// may still be on a loopback/local network. The intake chat must let the
// request attempt and trust a real 2xx reply rather than short-circuiting on
// `navigator.onLine` (D7 §3.4 "Venue internet down → restart the labelled
// scenario on the local stack").
//
// This test is focused on the navigator.onLine-vs-actual-reach bug, the
// labelled fake client under offline, the preserved typed E-024 manual
// fallback, and the DEMO_MODE gate. The real server / payment path stays
// in the e2e lane.
import type { FormEvent, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientExamples } from "@/contracts/client-examples";
import { errorEnvelope } from "@/contracts";
import { acknowledgeNotice, clearIntakeMemory } from "@/lib/intake/handoff";
import { locales } from "@/locales";
import { button, content, elements, mountHooks, settle } from "./fakes/hook-harness";
import { deferred } from "./fakes/media";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), ...(await import("./fakes/hook-harness")).testHooks }));
const { IntakeChat } = await import("@/app/(parent)/intake/intake-chat");

const changeText = (tree: ReactNode, text: string) => {
  const node = elements(tree).find((n) => n.type === "textarea")!;
  (node.props.onChange as (e: { target: { value: string } }) => void)({ target: { value: text } });
};
const submit = (tree: ReactNode) => {
  const form = elements(tree).find((n) => n.type === "form")!;
  (form.props.onSubmit as (e: FormEvent) => void)({ preventDefault() {} } as FormEvent);
};

function setNavigatorOnline(value: boolean | undefined) {
  // jsdom's navigator may already be stubbed; rebuild it with the requested
  // online flag and an empty mediaDevices surface.
  vi.stubGlobal("navigator", { mediaDevices: {}, onLine: value });
}

beforeEach(() => {
  vi.useFakeTimers();
  acknowledgeNotice();
  vi.stubGlobal("window", Object.assign(new EventTarget(), { confirm: () => true }));
  vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); clearIntakeMemory(); });

describe("offline local-loopback (TC-021, D3 §7 row 14)", () => {
  it("does NOT short-circuit the request when the browser reports offline: a real local 2xx still delivers the draft", async () => {
    setNavigatorOnline(false);
    const response = deferred<Response>();
    const fetchImpl = vi.fn((_url: unknown, _init?: RequestInit) => response.promise);
    vi.stubGlobal("fetch", fetchImpl);
    const h = mountHooks(() => IntakeChat({ locale: "bn", mode: "live" }));
    changeText(h.tree, "আমার মেয়ে নুসরাত, বয়স ৭ বছর।"); h.render();
    submit(h.tree); await settle(); h.render();
    // The whole point of TC-021: the local stack is reachable even though the
    // browser says offline. The chat must NOT pre-empt the call with E-024.
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(content(h.tree)).not.toContain(errorEnvelope("E-024").error.message_bn);
    // The local server returns the cached-shaped payload; the screen receives it.
    response.resolve(Response.json(clientExamples.extractResponse));
    await settle(); h.render();
    expect(content(h.tree)).toContain(locales.bn.understoodTitle);
    h.unmount();
  });

  it("the labelled fake client is not blocked when the browser reports offline (no network round-trip)", async () => {
    setNavigatorOnline(false);
    const fetchImpl = vi.fn();
    vi.stubGlobal("fetch", fetchImpl);
    const h = mountHooks(() => IntakeChat({ locale: "bn", mode: "fake" }));
    changeText(h.tree, "আমার মেয়ে নুসরাত, বয়স ৭ বছর।"); h.render();
    submit(h.tree);
    // The fake client uses an internal 900 ms delay; advance fake timers.
    await vi.advanceTimersByTimeAsync(1000); h.render();
    // The fake client does not touch the network, so offline must not pre-empt.
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(content(h.tree)).toContain(locales.bn.understoodTitle);
    h.unmount();
  });

  it("a real network failure still maps to E-024 and the manual fallback link remains available", async () => {
    setNavigatorOnline(false);
    const fetchImpl = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    vi.stubGlobal("fetch", fetchImpl);
    const h = mountHooks(() => IntakeChat({ locale: "bn", mode: "live" }));
    changeText(h.tree, "আমার মেয়ে নুসরাত, বয়স ৭ বছর।"); h.render();
    submit(h.tree); await settle(); h.render();
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(content(h.tree)).toContain(errorEnvelope("E-024").error.message_bn);
    // The retry button is on the screen (E-024 is retryable per the catalogue).
    expect(button(h.tree, locales.bn.retryAction)).toBeDefined();
    // And the manual form link survives (D3 §7 row 14 / D6 §9.4 backup path).
    const manual = elements(h.tree).find((n) => n.props.href === "/intake/form" && content(n).includes(locales.bn.openFormAction));
    expect(manual).toBeDefined();
    h.unmount();
  });

  it("online and offline both run the same code path; an online request still succeeds", async () => {
    setNavigatorOnline(true);
    const response = deferred<Response>();
    const fetchImpl = vi.fn((_url: unknown, _init?: RequestInit) => response.promise);
    vi.stubGlobal("fetch", fetchImpl);
    const h = mountHooks(() => IntakeChat({ locale: "bn", mode: "live" }));
    changeText(h.tree, "আমার মেয়ে নুসরাত, বয়স ৭ বছর।"); h.render();
    submit(h.tree); await settle(); h.render();
    expect(fetchImpl).toHaveBeenCalledOnce();
    response.resolve(Response.json(clientExamples.extractResponse));
    await settle(); h.render();
    expect(content(h.tree)).toContain(locales.bn.understoodTitle);
    h.unmount();
  });
});

describe("DEMO_MODE gate + offline (TASK-033 / TC-021)", () => {
  it("does not pre-empt calls when DEMO_MODE is unset and the browser reports offline", () => {
    // The intake chat honours navigator.onLine=false only at the result layer
    // (i.e. when the real fetch actually fails). It must not invent a cache hit.
    setNavigatorOnline(false);
    const h = mountHooks(() => IntakeChat({ locale: "bn", mode: "live" }));
    // The chat renders the compose UI even with offline reported; no early E-024.
    expect(content(h.tree)).toContain(locales.bn.textLabel);
    h.unmount();
  });
});
