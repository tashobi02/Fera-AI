// TASK-052 / SCREEN-015 / FR-036 / TC-035: disaster mode page. Server-rendered in
// Node (no browser here). Mocks next/headers for the locale cookie and
// requireRole so the page can be rendered without an auth store.
//
// Coverage:
// - banner text in bn and en ("পরিকল্পিত সম্প্রসারণ" / "Planned expansion")
// - honest intro in both languages
// - the S-007 found-log form is rendered (Save button label, the districts)
// - status is icon + text, with a dashed border (the "not real yet" pattern)
// - touch targets in the form are >= 44 px (the found-log form already enforces this)
// - locale keys exist in both bn and en for every new key
// - new strings pass the wording guard (no alert/rescue/return/police/probability)
// - the page does not load the form action button with a danger styling
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findBannedGroup } from "@/server/outputs";
import { locales } from "@/locales";

let localeCookie: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "fera-lang" && localeCookie ? { value: localeCookie } : undefined),
  }),
}));

const pageData = vi.hoisted(() => ({ roleCalls: [] as unknown[][] }));
vi.mock("@/server/auth/require-role", () => ({
  requireRole: async (...args: unknown[]) => {
    pageData.roleCalls.push(args);
    return { principal: { kind: "user" }, role: "staff" };
  },
}));

const { default: DisasterPage } = await import("@/app/(desk)/staff/disaster/page");
const { staffDisasterBn, staffDisasterEn } = await import("@/locales/areas/staff-disaster");

afterEach(() => {
  localeCookie = undefined;
  pageData.roleCalls = [];
});

async function page(locale: "bn" | "en") {
  localeCookie = locale;
  return renderToStaticMarkup(await DisasterPage());
}

describe("SCREEN-015 disaster mode page", () => {
  it("is staff or officer only (requireRole) and lives on the desk surface", async () => {
    const html = await page("en");
    expect(pageData.roleCalls).toEqual([[["staff", "officer"], "/staff/disaster"]]);
    expect(html).toContain('data-surface="desk"');
    expect(html).toContain("<h1");
  });

  it("shows the planned-expansion banner in bn and en with icon + text + dashed border", async () => {
    const en = await page("en");
    const bn = await page("bn");
    for (const html of [en, bn]) {
      // status region exposes the banner name to assistive tech
      expect(html).toMatch(/role="status"[^>]*aria-label="[^"]*[Pp]lanned[^"]*"|role="status"[^>]*aria-label="[^"]*পরিকল্পিত[^"]*"/);
      // an icon next to the banner (CircleDashedIcon is the planned marker)
      const banner = html.match(/<p[^>]*role="status"[^>]*>[\s\S]*?<\/p>/)?.[0] ?? "";
      expect(banner).toMatch(/<svg[^>]*aria-hidden="true"/);
      expect(banner).toMatch(/border-dashed/);
    }
    expect(en).toContain("Planned expansion");
    expect(en).toContain("Flood and cyclone shelters");
    expect(bn).toContain("পরিকল্পিত সম্প্রসারণ");
    expect(bn).toContain("বন্যা ও ঘূর্ণিঝড় আশ্রয়কেন্দ্র");
  });

  it("shows the honest intro and the synthetic-data note in both languages", async () => {
    const en = await page("en");
    const bn = await page("bn");
    expect(en).toContain("This mode is not live yet");
    expect(en).toContain("Synthetic data");
    expect(bn).toContain("এই মোড এখনো চালু নেই");
    expect(bn).toContain("সিনথেটিক তথ্য");
    // the [MOCK] badge is reused from the shared locale
    expect(en).toContain("[MOCK]");
    expect(bn).toContain("[MOCK]");
  });

  it("renders the S-007 found-log form so a save hits API-007 (TC-035)", async () => {
    for (const locale of ["bn", "en"] as const) {
      const html = await page(locale);
      // Save button label comes from the found-log keys
      expect(html).toContain(locales[locale].foundLogSave);
      // district select is the same component
      expect(html).toMatch(/<select[^>]*name="district"/);
      // all 64 districts are listed
      expect((html.match(/<option value="\d+"/g) ?? []).length).toBe(64);
    }
  });

  it("keeps the form's 44 px touch targets and the form posts without danger styling", async () => {
    const html = await page("en");
    // the form save button is the only primary action on the page
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    expect(buttons.length).toBeGreaterThanOrEqual(1);
    const save = buttons.find((b) => b.includes('type="submit"')) ?? "";
    expect(save).toMatch(/min-h-11/); // 44 px target (DESIGN.md sizes)
    expect(save).not.toMatch(/bg-danger/);
  });
});

describe("SCREEN-015 staff-disaster locale keys", () => {
  it("exports matching bn and en keys", () => {
    expect(Object.keys(staffDisasterBn).sort()).toEqual(Object.keys(staffDisasterEn).sort());
  });

  it("every key is reachable from the shared locales object", () => {
    for (const key of Object.keys(staffDisasterBn) as (keyof typeof staffDisasterBn)[]) {
      expect(locales.bn[key]).toBe(staffDisasterBn[key]);
      expect(locales.en[key]).toBe(staffDisasterEn[key]);
    }
  });

  it("passes the wording guard (BR-002/003/011, D4 §3) in both languages", () => {
    for (const key of Object.keys(staffDisasterBn) as (keyof typeof staffDisasterBn)[]) {
      expect(findBannedGroup(staffDisasterBn[key]), `bn ${key}`).toBeNull();
      expect(findBannedGroup(staffDisasterEn[key]), `en ${key}`).toBeNull();
    }
  });
});