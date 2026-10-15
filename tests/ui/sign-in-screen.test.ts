// TASK-031: SCREEN-008 / COMP-047 markup, server-rendered in Node (no browser here;
// the TC-022 browser journey is TASK-038 Playwright). next/headers is mocked for the
// locale cookie.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

let localeCookie: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "fera-lang" && localeCookie ? { value: localeCookie } : undefined) }),
}));

const { SignInForm } = await import("@/app/(auth)/sign-in/sign-in-form");
const { default: SignInPage } = await import("@/app/(auth)/sign-in/page");
const { demoAccounts } = await import("@/server/auth/demo-accounts");

function form(locale: "bn" | "en", demo = demoAccounts({})) {
  return renderToStaticMarkup(createElement(SignInForm, { locale, next: null, titleId: "t", demo }));
}

async function page(searchParams: Record<string, string | string[] | undefined>) {
  return renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve(searchParams) }));
}

afterEach(() => {
  localeCookie = undefined;
  vi.unstubAllEnvs();
});

describe("COMP-047 sign-in form", () => {
  it("has labelled inputs with the autocomplete tokens and a password type", () => {
    const html = form("en");
    const username = html.match(/<input[^>]*name="username"[^>]*>/)?.[0] ?? "";
    const password = html.match(/<input[^>]*name="password"[^>]*>/)?.[0] ?? "";
    expect(username).toMatch(/autocomplete="username"/i);
    expect(password).toMatch(/autocomplete="current-password"/i);
    expect(password).toContain('type="password"');
    for (const input of [username, password]) {
      const id = input.match(/id="([^"]+)"/)?.[1];
      expect(id).toBeTruthy();
      expect(html).toContain(`for="${id}"`);
      expect(input).toContain('aria-required="true"');
      expect(input).not.toMatch(/\saria-invalid="/); // nothing is wrong before an attempt
    }
  });

  it("posts (never GET, so no password in a URL) and validates with its own messages", () => {
    const html = form("bn");
    expect(html).toMatch(/<form[^>]*method="post"/);
    expect(html).toMatch(/<form[^>]*noValidate=""|<form[^>]*novalidate=""/i);
    expect(html).toContain('aria-labelledby="t"');
  });

  it("has a show/hide password toggle that is a separate, non-submitting button", () => {
    const bn = form("bn");
    const toggle = bn.match(/<button[^>]*aria-controls="[^"]*password"[^>]*>/)?.[0] ?? "";
    expect(toggle).toContain('type="button"');
    expect(toggle).toContain('aria-label="পাসওয়ার্ড দেখান"');
    expect(bn).toContain("দেখান");
    expect(form("en")).toContain('aria-label="Show password"');
  });

  it("has one primary submit named with the D3 action and an always-mounted alert region", () => {
    const bn = form("bn");
    expect(bn.match(/type="submit"/g)).toHaveLength(1);
    expect(bn).toContain("<span>সাইন ইন</span>");
    expect(form("en")).toContain("<span>Sign in</span>");
    expect(bn).toMatch(/role="alert"[^>]*aria-atomic="true"/);
    expect(bn).not.toMatch(/<button[^>]*\sdisabled=""/); // aria-disabled only, so focus is kept
  });

  it("gives every control a 44 px minimum target", () => {
    const html = form("en", demoAccounts({ DEMO_MODE: "1" }));
    const controls = html.match(/<(button|input)[^>]*>/g) ?? [];
    // 2 inputs + toggle + submit + 4 demo rows: an empty match must not pass vacuously.
    expect(controls).toHaveLength(8);
    for (const control of controls) expect(control, control).toContain("min-h-11");
  });

  it("draws input boundaries with the >= 3:1 control token, hairlines only on the card (D4 §13)", () => {
    const html = form("en");
    for (const input of html.match(/<input[^>]*>/g) ?? []) {
      expect(input).toMatch(/\bborder-control\b/);
      expect(input).toContain("hover:border-control-strong");
      expect(input).toContain("focus:border-control-strong");
      expect(input).not.toMatch(/\bborder-hairline\b/);
    }
    expect(html).toMatch(/<form[^>]*border-hairline/);
  });

  it("lets the password row wrap at 320 px / 200 % text", () => {
    const html = form("en");
    const row = html.match(/<div class="flex flex-wrap gap-2">(<input[^>]*>)/)?.[1] ?? "";
    expect(row).toContain('name="password"');
    expect(row).toContain("min-w-[min(10rem,100%)] flex-1");
  });

  it("steps Bangla captions up to 14 px and keeps the [MOCK] label English", () => {
    const html = form("bn", demoAccounts({ DEMO_MODE: "1" }));
    expect(html).toMatch(/<span lang="en" translate="no"[^>]*>\[MOCK\]<\/span>/);
    expect(html.match(/text-caption-md \[&amp;:lang\(bn\)\]:text-body-sm/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it("demo rows are plain buttons (no aria-controls) with an sr-only verb", () => {
    const rows = form("en", demoAccounts({ DEMO_MODE: "1" })).match(/<li[^>]*><button[^>]*>/g) ?? [];
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row).toContain('type="button"');
      expect(row).not.toContain("aria-controls");
    }
  });

  it("shows no demo hint without demo accounts", () => {
    const html = form("en", null);
    expect(html).not.toContain("Demo accounts");
    expect(html).not.toContain("officer.demo");
  });

  it("shows a dashed [MOCK] hint with usernames only when given demo accounts", () => {
    const html = form("bn", demoAccounts({ DEMO_MODE: "1" }));
    expect(html).toContain("ডেমো অ্যাকাউন্ট");
    expect(html).toContain("[MOCK]");
    expect(html).toContain("border-dashed");
    for (const u of ["staff.demo", "officer.demo", "officer.pending", "admin.demo"]) expect(html).toContain(u);
    expect(html).toContain("অযাচাইকৃত কর্মকর্তা · স্টাফের সমান অনুমতি");
    expect(html).not.toMatch(/fera-local-/);
  });
});

describe("SCREEN-008 page", () => {
  it("renders on the desk surface (Cockpit), Bangla by default", async () => {
    const html = await page({});
    expect(html).toContain('data-surface="desk"');
    expect(html).toContain(">সাইন ইন</h1>");
  });

  it("names the role in the title from the area being entered (D4 §14)", async () => {
    expect(await page({ next: "/officer" })).toContain(">কর্মকর্তা সাইন ইন</h1>");
    expect(await page({ next: "/staff" })).toContain(">স্টাফ সাইন ইন</h1>");
    expect(await page({ next: "/admin" })).toContain(">অ্যাডমিন সাইন ইন</h1>");
    localeCookie = "en";
    expect(await page({ next: "/officer/case/abc" })).toContain(">Officer sign-in</h1>");
    expect(await page({ next: "//evil.example/officer" })).toContain(">Sign in</h1>");
  });

  it("explains the return only when a deeper page will be reopened", async () => {
    localeCookie = "en";
    const note = "After signing in, you&#x27;ll go back to the page you opened.";
    expect(await page({ next: "/officer/case/abc" })).toContain(note);
    expect(await page({ next: "/officer" })).not.toContain(note);
    expect(await page({ next: "https://evil.example/x" })).not.toContain(note);
    expect(await page({ next: ["/officer/case/a", "/officer/case/b"] })).not.toContain(note);
  });

  it("shows the demo hint only when DEMO_MODE=1 on the server", async () => {
    vi.stubEnv("DEMO_MODE", "");
    expect(await page({})).not.toContain("officer.demo");
    vi.stubEnv("DEMO_MODE", "1");
    vi.stubEnv("VERCEL", "");
    expect(await page({})).toContain("officer.demo");
    vi.stubEnv("VERCEL", "1");
    expect(await page({})).not.toContain("officer.demo");
  });
});
