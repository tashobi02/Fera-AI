// P3-014 — Playwright smoke test. The minimum check required by D6 §7: open
// `/` and assert (1) the Bangla welcome title renders and (2) the synthetic
// badge is visible. Runs on both the mobile (360×780) and desktop (1280×800)
// projects. Welcome copy and the badge live in src/locales/index.ts and are
// rendered by the parent welcome page; the badge text is the i18n key
// `syntheticBadge` ("সিনথেটিক"). D3 SCREEN-001 / D4 §15.1.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { e2eDatabaseUrl } from "./support/db";

// SCREEN-001 Bangla welcome title from src/locales/index.ts (welcomeLead, D3).
const BANGLA_WELCOME = "ফেরা আপনার কথা থেকে নিখোঁজ শিশুর রিপোর্ট তৈরি করে।";
// SCREEN-001 synthetic badge (D3 COMP-023, D4 §15.1).
const SYNTHETIC_BADGE = "সিনথেটিক";

test.describe("smoke", () => {
  test.beforeAll(() => {
    // Refuse to run unless the URL is loopback-only (guard.mjs).
    const url = e2eDatabaseUrl();
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost" && url.hostname !== "::1") {
      throw new Error(`test:e2e refuses non-loopback host: ${url.hostname}`);
    }
  });

  test("home page renders Bangla welcome title and synthetic badge", async ({ page }) => {
    await page.goto("/");

    // The <h1> from src/app/(parent)/page.tsx carries the Bangla welcome.
    const heading = page.getByRole("heading", { name: BANGLA_WELCOME, level: 1 });
    await expect(heading).toBeVisible();

    // The synthetic badge is rendered by ProviderNotice as an HonestLabel.
    await expect(page.getByText(SYNTHETIC_BADGE, { exact: true })).toBeVisible();
  });

  test("home page has no serious or critical axe violations", async ({ page }) => {
    await page.goto("/");
    // The welcome page is fully server-rendered, so wait for hydration to
    // finish before running axe so it inspects the real DOM.
    await page.getByRole("heading", { level: 1 }).first().waitFor();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(
      blocking,
      `axe blocking violations: ${JSON.stringify(blocking.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })), null, 2)}`,
    ).toEqual([]);
  });
});
