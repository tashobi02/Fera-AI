// TASK-026: SCREEN-007 / COMP-034 markup, server-rendered in Node (no browser here; the
// TC-008 browser journey is TASK-038 Playwright). Synthetic data only.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import districtData from "../../data/districts.json";
import { locales } from "@/locales";

const { FoundLogForm } = await import("@/app/(desk)/staff/found-log-form");
const districts = districtData.districts.map(({ code, name_en, name_bn }) => ({ code, name_en, name_bn }));
const render = (locale: "bn" | "en") => renderToStaticMarkup(createElement(FoundLogForm, { locale, districts }));

describe("COMP-034 found-child form", () => {
  it("renders every control with a matching label and the D3 Save label", () => {
    for (const locale of ["bn", "en"] as const) {
      const html = render(locale);
      const controls = [...html.matchAll(/<(?:input|select|textarea)[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
      expect(controls.length).toBeGreaterThanOrEqual(14);
      for (const id of controls) expect(html, `${locale} ${id}`).toContain(`for="${id}"`);
      expect(html).toContain(locales[locale].foundLogSave);
    }
    expect(locales.bn.foundLogSave).toBe("সংরক্ষণ করুন"); // D3 ACT-019
  });

  it("lists all 64 districts and has no photo or coordinate field (BR-006, DECISION-013)", () => {
    const html = render("en");
    expect((html.match(/<option value="\d+"/g) ?? []).length).toBe(64);
    expect(html).not.toMatch(/type="file"|accept="image|latitude|longitude|name="photo"|capture=/i);
  });

  it("marks required fields and keeps phone and age as text inputs for autofill-safe reading", () => {
    const html = render("en");
    for (const name of ["place", "district", "foundAt", "phone"]) {
      expect(html.match(new RegExp(`<[^>]*name="${name}"[^>]*>`))?.[0], name).toMatch(/aria-required="true"/);
    }
    expect(html).toMatch(/name="phone"[^>]*type="tel"|type="tel"[^>]*name="phone"/);
    expect(html).toContain('method="post"');
    expect(html).toContain("noValidate");
  });

  it("shows each district in both languages so type-ahead works in either", () => {
    expect(render("en")).toMatch(/<option value="14">Dhaka \(ঢাকা\)<\/option>/);
    expect(render("bn")).toMatch(/<option value="14">ঢাকা \(Dhaka\)<\/option>/);
  });

  it("is bilingual and names the synthetic/no-photo rule in both languages", () => {
    expect(render("bn")).toContain(locales.bn.foundLogGroupChild);
    expect(render("en")).toContain(locales.en.foundLogGroupChild);
    expect(locales.bn.foundLogSyntheticNote).toMatch(/সিনথেটিক/);
    expect(locales.en.foundLogSyntheticNote).toMatch(/Synthetic/);
  });

  it("never claims an alert, rescue or a delivered referral (honest copy)", () => {
    const keys = Object.keys(locales.en).filter((k) => k.startsWith("foundLog")) as (keyof typeof locales.en)[];
    for (const k of keys) {
      expect(locales.en[k], k).not.toMatch(/alert|rescue|runaway|probab|police|delivered/i);
      expect(locales.bn[k], k).not.toMatch(/সতর্ক|উদ্ধার|পালিয়ে|পুলিশ|সম্ভাবনা|পৌঁছে দেওয়া/);
    }
  });
});

// The saved panel only renders after a successful save (browser journey, TASK-038), so its
// markup is guarded at source level: aria-labelledby needs a role to be announced.
describe("saved panel semantics", () => {
  it("gives the labelled saved panel role=group", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/app/(desk)/staff/found-log-form.tsx", "utf8");
    expect(source).toMatch(/role="group"\s+aria-labelledby=\{`\$\{uid\}-saved-title`\}/);
  });
});
