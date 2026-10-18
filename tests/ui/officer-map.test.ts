// SCREEN-011 map and API-022 district drill-through. Server-rendered acceptance
// checks for aggregate counts, officer-only case rows, bilingual empty copy and the
// visible synthetic-data label.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import districtData from "../../data/districts.json";
import { locales, type Locale } from "@/locales";
import { PRINCIPALS } from "@/contracts/examples";
import type { DistrictCountRow } from "@/server/dashboard";
import type { CaseListResponse } from "@/contracts";

const pageMocks = vi.hoisted(() => ({
  locale: "en" as Locale,
  role: "officer" as "officer" | "admin",
  principal: null as unknown,
  stats: [] as unknown[],
  cases: [] as unknown[],
  db: {},
}));

vi.mock("@/lib/locale-server", () => ({ getLocale: async () => pageMocks.locale }));
vi.mock("@/server/auth/require-role", () => ({
  requireRole: async () => ({ principal: pageMocks.principal, role: pageMocks.role }),
}));
vi.mock("@/server/db/pool", () => ({ getPool: () => pageMocks.db }));
vi.mock("@/server/case", () => ({
  listOfficerCases: vi.fn(async () => ({ cases: pageMocks.cases, next_cursor: null })),
}));
vi.mock("@/server/dashboard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/dashboard")>();
  return { ...actual, districtStats: async () => pageMocks.stats };
});
vi.mock("@/app/api/_shared/log", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
  describeError: () => ({}),
}));

const { default: OfficerMapPage } = await import("@/app/(desk)/officer/map/page");
const { listOfficerCases } = await import("@/server/case");

const CASE_ID = "11111111-1111-4111-8111-111111111111";
const OFFICER_CASE = {
  id: CASE_ID,
  ref_code: "M-ABC123",
  kind: "missing",
  status: "open",
  status_group: "open",
} as CaseListResponse["cases"][number];

function makeStats(): DistrictCountRow[] {
  return districtData.districts.map((district) => ({
    code: district.code,
    name_bn: district.name_bn,
    name_en: district.name_en,
    lat: district.lat,
    lng: district.lng,
    missing_reports: district.code === 1
      ? { open: 2, matched: 1, closed: 3 }
      : { open: 0, matched: 0, closed: 0 },
    found_reports: district.code === 1
      ? { open: 4, matched: 5, referral_recorded: 6 }
      : { open: 0, matched: 0, referral_recorded: 0 },
    confirmed_pairs: district.code === 1 ? 7 : 0,
  }));
}

async function render(locale: Locale, district?: number): Promise<string> {
  pageMocks.locale = locale;
  const page = await OfficerMapPage({
    searchParams: Promise.resolve(district === undefined ? {} : { district: String(district) }),
  });
  return renderToStaticMarkup(createElement(() => page));
}

function districtOneTableCounts(html: string): string[] {
  const row = [...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)]
    .map(([value]) => value)
    .find((value) => value.includes('href="/officer/map?district=1"'));
  if (!row) throw new Error("district 1 row was not rendered");
  return [...row.matchAll(/<td\b[^>]*>(.*?)<\/td>/g)].map(([, value]) => value);
}

describe("SCREEN-011 officer map and district drill-through", () => {
  beforeEach(() => {
    pageMocks.locale = "en";
    pageMocks.role = "officer";
    pageMocks.principal = PRINCIPALS.officer;
    pageMocks.stats = makeStats();
    pageMocks.cases = [OFFICER_CASE];
    vi.clearAllMocks();
  });

  it("renders aggregate map and table totals, then drills through to officer case references", async () => {
    const html = await render("en", 1);

    expect(html).toContain(locales.en.mockLabel);
    expect(html).toContain(locales.en.officerMapCentroidNote);
    // Centroid SVG is presentation-only; the HTML table/list provides the links.
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('href="/officer/map?district=1"');
    expect(html).toContain("min-h-11 min-w-11");
    expect(districtOneTableCounts(html)).toEqual(["6", "6", "9", "7"]);
    expect(html).toContain("Total: 21");
    expect(html).toContain("Open 6 · Being checked 6 · Closed 9");
    expect(html).toContain("Confirmed match: 7");
    expect(html).toContain('href="/officer/case/' + CASE_ID + '"');
    expect(html).toContain("M-ABC123");
    expect(html).not.toContain("[MOCK] Synthetic Child");
    expect(listOfficerCases).toHaveBeenCalledWith(
      PRINCIPALS.officer,
      { district: 1, limit: 50 },
      pageMocks.db,
      {},
    );
  });

  it.each(["en", "bn"] as const)("shows the localized empty-state copy and synthetic label for %s", async (locale) => {
    pageMocks.cases = [];

    const html = await render(locale, 2);

    expect(html).toContain(locales[locale].mockLabel);
    expect(html).toContain(locales[locale].officerMapCasesEmpty);
    expect(html).toContain(locale === "bn" ? "মোট: ০" : "Total: 0");
    expect(html).toContain(locale === "bn" ? "কোনো রিপোর্ট নেই" : "No reports");
  });

  it("keeps admin map access aggregate-only and does not request API-022 case rows", async () => {
    pageMocks.role = "admin";
    pageMocks.principal = PRINCIPALS.admin;

    const html = await render("en", 1);

    expect(html).toContain("Total: 21");
    expect(html).toContain("Open 6 · Being checked 6 · Closed 9");
    expect(html).not.toContain("M-ABC123");
    expect(html).not.toContain(locales.en.officerMapCasesUnavailable);
    expect(listOfficerCases).not.toHaveBeenCalled();
  });
});
