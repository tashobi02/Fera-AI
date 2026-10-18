// TASK-021: SCREEN-001 / SCREEN-002 markup, server-rendered in Node (no browser here;
// phone and Playwright journeys are TASK-038). next/headers and next/navigation mocked.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { locales } from "@/locales";

let localeCookie: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "fera-lang" && localeCookie ? { value: localeCookie } : undefined) }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { default: WelcomePage } = await import("@/app/(parent)/page");
const { default: IntakePage } = await import("@/app/(parent)/intake/page");
const { IntakeChat } = await import("@/app/(parent)/intake/intake-chat");
const { acknowledgeNotice, clearIntakeMemory } = await import("@/lib/intake/handoff");

afterEach(() => {
  localeCookie = undefined;
  clearIntakeMemory();
});

const chat = (locale: "bn" | "en") => renderToStaticMarkup(createElement(IntakeChat, { locale, mode: "fake" }));

// D4 §2 rule 4 / DESIGN.md overrides: no red, countdowns or flashing on parent screens.
function expectParentSafe(html: string) {
  expect(html).toContain('data-surface="parent"');
  expect(html).not.toMatch(/danger|signal-|animate-(pulse|ping|bounce)/);
  expect(html).not.toMatch(/type="file"|accept="image/); // TC-026: no photo inputs
  expect(html).not.toMatch(/পালিয়ে|runaway|rescue|উদ্ধার/i);
}

describe("SCREEN-001 welcome", () => {
  it("states what Fera does and does not do, with the exact provider notice", async () => {
    const html = renderToStaticMarkup(await WelcomePage());
    expect(html.match(/<h1/g)).toHaveLength(1);
    for (const key of ["welcomeLead", "welcomeNoAlerts", "providerNotice", "noticeReviewFirst", "noticeWhoSees", "syntheticBadge"] as const) {
      expect(html).toContain(locales.bn[key]);
    }
    expectParentSafe(html);
  });

  it("starts intake with a 48 px link described by a short notice line, and offers tel:13219", async () => {
    const html = renderToStaticMarkup(await WelcomePage());
    const start = html.match(/<a[^>]*href="\/intake"[^>]*>/)?.[0] ?? "";
    expect(start).toContain("min-h-12");
    const describedBy = start.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(html).toContain(`id="${describedBy}"`);
    expect(html).not.toContain(`<ul id="${describedBy}"`);
    expect(html).toContain(locales.bn.startAction);
    expect(html).toMatch(/<a[^>]*href="tel:13219"[^>]*min-h-11/);
    expect(html).toContain("১৩২১৯-এ কল করুন");
  });

  it("follows the language cookie", async () => {
    localeCookie = "en";
    const html = renderToStaticMarkup(await WelcomePage());
    expect(html).toContain(locales.en.providerNotice);
    expect(html).toContain("Call 13219");
  });
});

describe("SCREEN-002 before the notice is acknowledged (BR-004)", () => {
  it("shows the notice and no way to record or type", () => {
    const html = chat("bn");
    expect(html).toContain(locales.bn.providerNotice);
    expect(html).toContain(locales.bn.noticeAckAction);
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain(locales.bn.recordAction);
    expect(html).not.toContain('role="log"');
    expectParentSafe(html);
  });

  it("is what a direct load of /intake renders", async () => {
    const html = renderToStaticMarkup(await IntakePage());
    expect(html).toContain(locales.bn.noticeAckAction);
    expect(html).not.toContain("<textarea");
  });
});

describe("SCREEN-002 after acknowledgement", () => {
  it("has the D4 §15 regions: notice, labels, conversation, voice, text, fallback", () => {
    acknowledgeNotice();
    const html = chat("bn");
    const order = [locales.bn.providerNotice, locales.bn.syntheticBadge, 'aria-label="কথোপকথন"', locales.bn.recordAction, "<textarea", locales.bn.openFormAction, locales.bn.discardAction];
    const at = order.map((needle) => html.indexOf(needle));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(html).toContain(locales.bn.intakeEmptyPrompt); // D3 empty state
    expect(html).toContain(locales.bn.intakeExample); // D3 §4 example sentence
    const conversation = html.match(/<section[^>]*aria-label="কথোপকথন"[^>]*>[\s\S]*?<\/section>/)?.[0] ?? "";
    expect(conversation).toContain('aria-live="off"');
    expect(conversation).not.toContain(locales.bn.intakeExample);
    expectParentSafe(html);
  });

  it("keeps the example in the textarea description and links the manual form", () => {
    acknowledgeNotice();
    const html = chat("bn");
    const textarea = html.match(/<textarea[^>]*>/)?.[0] ?? "";
    const hint = textarea.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(html).toContain(`id="${hint}"`);
    expect(html).toMatch(new RegExp(`id="${hint}"[^>]*>${locales.bn.intakeExample}`));
    const fallback = html.match(/<a[^>]*href="\/intake\/form"[^>]*>[\s\S]*?<\/a>/)?.[0];
    expect(fallback).toContain(locales.bn.openFormAction);
    expect(fallback).not.toContain(locales.bn.plannedLabel);
  });

  it("labels the fake replies [MOCK] (honest labels)", () => {
    acknowledgeNotice();
    const html = chat("en");
    expect(html).toContain("[MOCK]");
    expect(html).toContain(locales.en.mockReplies);
  });

  it("labels the text box, keeps targets at 44 px or more and has live regions", () => {
    acknowledgeNotice();
    const html = chat("en");
    const id = html.match(/<textarea[^>]*id="([^"]+)"/)?.[1];
    expect(html).toContain(`for="${id}"`);
    expect(html).toMatch(/<textarea[^>]*maxLength="2000"/i);
    for (const control of html.match(/<(button|a)\b[^>]*>/g) ?? []) expect(control).toMatch(/min-h-(11|12|20)/);
    expect(html).toContain('role="status"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toMatch(/<button[^>]*\sdisabled=""/); // aria-disabled only, focus is kept
  });
});
