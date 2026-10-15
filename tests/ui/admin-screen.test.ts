// TASK-032: SCREEN-013 markup, server-rendered in Node (no browser here). Checks labels,
// typed-confirmation wiring, states (empty, unavailable, populated), honest labels,
// status icon + text + colour, 44 px targets and that the page never renders payload.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminUsersResponse } from "@/contracts";

let localeCookie: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "fera-lang" && localeCookie ? { value: localeCookie } : undefined) }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const pageData = vi.hoisted(() => ({
  eligible: 3 as number | Error,
  users: null as unknown,
  roleCalls: [] as unknown[][],
}));
vi.mock("@/server/auth/require-role", () => ({
  requireRole: async (...args: unknown[]) => {
    pageData.roleCalls.push(args);
    return { principal: { kind: "user" }, role: "admin" };
  },
}));
vi.mock("@/server/admin", () => ({
  getRedactorPool: () => ({}),
  countEligibleCases: async () => {
    if (pageData.eligible instanceof Error) throw pageData.eligible;
    return pageData.eligible;
  },
  listAdminUsers: async () => {
    if (pageData.users instanceof Error) throw pageData.users;
    return pageData.users;
  },
}));

const { RedactionForm } = await import("@/app/(desk)/admin/redaction-form");
const { VerifyOfficersForm } = await import("@/app/(desk)/admin/verify-officers-form");
const { default: AdminPage } = await import("@/app/(desk)/admin/page");

const USERS: AdminUsersResponse = {
  users: [
    { id: "6b1f3c2a-4d5e-4f60-8a71-000000000031", username: "admin.demo", display_name: "[MOCK] অ্যাডমিন", role: "admin", verified: false, is_active: true },
    { id: "6b1f3c2a-4d5e-4f60-8a71-000000000021", username: "officer.demo", display_name: "[MOCK] কর্মকর্তা", role: "officer", verified: true, is_active: true },
    { id: "6b1f3c2a-4d5e-4f60-8a71-000000000022", username: "officer.pending", display_name: "[MOCK] অপেক্ষমাণ কর্মকর্তা", role: "officer", verified: false, is_active: true },
    { id: "6b1f3c2a-4d5e-4f60-8a71-000000000011", username: "staff.demo", display_name: "[MOCK] স্টাফ", role: "staff", verified: false, is_active: true },
  ],
  next_cursor: null,
};

const redaction = (locale: "bn" | "en", eligible: number | null) => renderToStaticMarkup(createElement(RedactionForm, { locale, eligible }));
const verify = (locale: "bn" | "en", initial: AdminUsersResponse | null) => renderToStaticMarkup(createElement(VerifyOfficersForm, { locale, initial }));

afterEach(() => {
  localeCookie = undefined;
  pageData.eligible = 3;
  pageData.users = null;
  pageData.roleCalls = [];
});

describe("COMP-043 redaction panel", () => {
  it("labels the typed-confirmation input and links its hint", () => {
    const html = redaction("bn", 3);
    const input = html.match(/<input[^>]*name="confirmation"[^>]*>/)?.[0] ?? "";
    const id = input.match(/id="([^"]+)"/)?.[1];
    expect(html).toContain(`for="${id}"`);
    expect(html).toContain("নিশ্চিত করতে লিখুন: বেনামী");
    expect(input).toContain('aria-required="true"');
    expect(input).toContain('lang="bn"');
    expect(input).toMatch(/autocomplete="off"/i);
    const hintId = input.match(/aria-describedby="([^"]+)"/)?.[1];
    expect(html).toContain(`id="${hintId}"`);
    expect(input).not.toMatch(/\saria-invalid="/);
    expect(input).toContain("border-control");
  });

  it("has one destructive submit with the D3 ACT-027 label, soft danger, 44 px, never `disabled`", () => {
    for (const [locale, label] of [["bn", "বন্ধ কেস বেনামী করুন"], ["en", "Redact identifying payloads from eligible terminal cases"]] as const) {
      const html = redaction(locale, 3);
      const buttons = html.match(/<button[^>]*>/g) ?? [];
      expect(buttons).toHaveLength(1);
      expect(buttons[0]).toContain('type="submit"');
      expect(buttons[0]).toContain("min-h-11");
      expect(buttons[0]).toContain("bg-danger-soft");
      expect(buttons[0]).not.toMatch(/bg-danger[^-]|\sdisabled/);
      expect(html).toContain(label);
    }
  });

  it("shows the eligible count with Bangla numerals in Bangla mode, Latin in English", () => {
    expect(redaction("bn", 12)).toContain(">১২<");
    expect(redaction("en", 12)).toContain(">12<");
  });

  it("states pseudonymisation, the external-copy limit and the evidence rule", () => {
    const html = redaction("en", 3);
    expect(html).toContain("pseudonymisation, not full anonymisation");
    expect(html).toContain("Copies outside Fera");
    expect(html).toContain("kept until its missing report is closed");
  });

  it("shows the D3 empty state and no form when nothing is eligible", () => {
    const bn = redaction("bn", 0);
    expect(bn).toContain("পরিচয় তথ্য অপসারণের জন্য উপযুক্ত রিপোর্ট নেই");
    expect(bn).not.toContain("<form");
    expect(redaction("en", 0)).toContain("No eligible reports for payload redaction");
  });

  it("shows an unavailable message and no form when the count could not be read", () => {
    const html = redaction("en", null);
    expect(html).toContain("eligible report count isn");
    expect(html).not.toContain("<form");
  });

  it("keeps both live regions mounted (status polite, alert)", () => {
    const html = redaction("bn", 3);
    expect(html).toMatch(/role="status"[^>]*aria-live="polite"/);
    expect(html).toContain('role="alert"');
  });
});

describe("COMP-043 verify officers [MOCK] panel", () => {
  it("shows [MOCK] in the heading, on every toggle and the simulation note", () => {
    const html = verify("en", USERS);
    expect(html).toMatch(/Verify officers[^]*?\[MOCK\]/);
    expect(html).toContain("Simulation: verifying here only sets a flag on a seeded account");
    const buttons = html.match(/<button[^]*?<\/button>/g) ?? [];
    expect(buttons).toHaveLength(2); // the two officers only
    for (const b of buttons) {
      expect(b).toContain("[MOCK]");
      expect(b).toContain("min-h-11");
      expect(b).toContain('type="button"');
    }
    expect(buttons[0]).toContain("Remove verification");
    expect(buttons[1]).toContain(">Verify<");
  });

  it("describes each toggle with the account name (no aria-label hiding the visible text)", () => {
    const html = verify("bn", USERS);
    for (const b of html.match(/<button[^>]*>/g) ?? []) {
      const ref = b.match(/aria-describedby="([^"]+)"/)?.[1];
      expect(ref).toBeTruthy();
      expect(html).toContain(`id="${ref}"`);
      expect(b).not.toContain("aria-label");
    }
  });

  it("shows status as icon + text + colour, with no red", () => {
    const html = verify("bn", USERS);
    expect(html).toMatch(/bg-success-soft text-success-text[^>]*>[^]*?<svg[^]*?যাচাইকৃত/);
    expect(html).toContain("অযাচাইকৃত");
    expect(html).toContain("প্রযোজ্য নয়");
    expect(html).not.toMatch(/danger/);
    expect((html.match(/<svg/g) ?? []).length).toBeGreaterThanOrEqual(USERS.users.length + 3);
  });

  it("renders only AdminUserView fields", () => {
    const html = verify("en", USERS);
    for (const u of USERS.users) {
      expect(html).toContain(u.username);
      expect(html).not.toContain(u.id.slice(0, 18) + "\""); // IDs are keys, never text
    }
    expect(html).not.toMatch(/password|hash/i);
  });

  it("empty, unavailable and paged states", () => {
    expect(verify("en", { users: [], next_cursor: null })).toContain("No users");
    expect(verify("bn", null)).toContain("ব্যবহারকারীর তালিকা এখন দেখানো যাচ্ছে না");
    const paged = verify("en", { ...USERS, next_cursor: "abcdefgh.abcdefghijklmnop" });
    expect(paged).toContain("Show more");
    expect(verify("en", USERS)).not.toContain("Show more");
  });
});

describe("SCREEN-013 page", () => {
  it("is admin only (requireRole) and renders both panels plus the planned import slot", async () => {
    pageData.users = USERS;
    localeCookie = "en";
    const html = renderToStaticMarkup(await AdminPage());
    expect(pageData.roleCalls).toEqual([[["admin"], "/admin"]]);
    expect(html).toContain('data-surface="desk"');
    expect(html).toContain("<h1");
    expect(html).toContain("Admin data tools");
    expect(html).toContain("Redact identifying payloads");
    expect(html).toContain("Verify officers");
    expect(html).toMatch(/Synthetic import[^]*Planned[^]*Not built yet/);
    expect(html).toContain("border-dashed");
    expect(html).not.toMatch(/import text|<textarea/i);
  });

  it("each data source fails on its own panel", async () => {
    pageData.eligible = new Error("redactor down");
    pageData.users = USERS;
    const html = renderToStaticMarkup(await AdminPage());
    expect(html).toContain("উপযুক্ত রিপোর্টের সংখ্যা এখন দেখানো যাচ্ছে না");
    expect(html).toContain("officer.demo");
    expect(html).not.toContain("redactor down");
  });
});
