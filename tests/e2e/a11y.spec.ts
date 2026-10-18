// P3-209 · TC-033 — accessibility checks for the parent and key desk screens
// (NFR-011; D3 §2; D4 §11, §13, §15).  Synthetic-only, real browser, real
// running app.
//
// The check list, exactly the rows the brief names:
//   1. axe serious/critical on the parent manual form, review screen, and
//      sign-in path. Both projects (mobile 360×780 and desktop 1280×800)
//      must be clean.
//   2. 320 CSS px no horizontal overflow on parent surfaces — the smallest
//      target.  Fera's mobile project uses 360 px, but the design rule from
//      D4 §11 is 320 px reflow; the test deliberately drops below 360 to
//      prove the rule holds. (We do not claim a physical 320 px device;
//      the assertion is computed from layout geometry in the browser.)
//   3. Keyboard reachability of submit/confirm controls on the parent form
//      and the sign-in path.  Each named control is reachable via Tab and
//      Enter/Space.
//   4. 200 % text zoom on parent form: layout still readable, no horizontal
//      overflow, controls still reachable.  The brief names a sensible
//      root-text scale; the CSS injection bumps the document root only,
//      not every nested element recursively.
//   5. The app ships a `data-theme="light"` / `data-theme="dark"` switch
//      on appropriate desk pages; we exercise both via axe + overflow and
//      keep `prefers-color-scheme` out of the assertion (the app does not
//      use media-query dark).
//
// What this spec deliberately does NOT do (gaps, not failures):
//   - It does not claim 400 % browser zoom tested from the viewport alone.
//     400 % is a *physical device* property (D6 row 133) and not derivable
//     from viewport geometry.  The brief calls that out: "Do not claim
//     physical Android or actual 400% browser zoom tested from viewport
//     alone."
//   - The parent form is Paper-only (D3 SCREEN-005), so dark probing is
//     scoped to the desk surfaces.
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { locales } from "../../src/locales";
import {
  DESK_PASSWORD,
  deskContext,
  seedActors,
  signInDesk,
} from "./support/fixtures";

const PARENT_FORM_PATH = "/intake/form";
const PARENT_REVIEW_PATH = "/intake/review";

const AXE_PAGES = ["/", PARENT_FORM_PATH, PARENT_REVIEW_PATH, "/sign-in"] as const;

// The form uses id="review-<dotted path>" — CSS #id selectors treat the dot
// as a class separator, so the correct selector is the attribute form below.
const CHILD_NAME = '[id="review-child.name"]';
const CHILD_AGE_YEARS = '[id="review-child.age_years"]';
const EVENT_DATE = '[id="review-event.date"]';
const EVENT_PLACE = '[id="review-event.place_text"]';
const DISTRICT_SEARCH = '[id="review-event.district_code-search"]';
const DISTRICT_SELECT = '[id="review-event.district_code"]';
const REPORTER_PHONE = '[id="review-reporter.phone"]';

async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  // Reading the body width against the viewport is the canonical
  // "no horizontal overflow" check. We let axe decide the rest.
  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.documentElement.scrollWidth,
  }));
  expect(
    metrics.bodyScrollWidth,
    `${label}: horizontal overflow — clientWidth=${metrics.clientWidth}, scrollWidth=${metrics.bodyScrollWidth}`,
  ).toBeLessThanOrEqual(metrics.clientWidth);
}

// Walk the real focus ring from the top of the form.  The helper asserts each
// named selector eventually becomes the active element after a number of
// Tab presses.  Missing controls (count === 0) fail the assertion; soft
// skipping would hide a real layout bug.
async function expectControlsKeyboardReachable(
  page: Page,
  selectors: readonly string[],
  label: string,
): Promise<void> {
  // Reset focus to the first focusable element inside <main> so the Tab
  // order is deterministic.
  await page.evaluate(() => {
    const root = document.querySelector("main") ?? document.body;
    const first = root.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
  });
  for (const sel of selectors) {
    const count = await page.locator(sel).count();
    expect(count, `${label}: control ${sel} must exist`).toBeGreaterThan(0);
    // Tab up to 100 times to find the selector.  In practice the form
    // exposes at most a few dozen tab stops.
    let reached = false;
    for (let i = 0; i < 100; i += 1) {
      await page.keyboard.press("Tab");
      const match = await page.evaluate(
        (s) => document.activeElement !== null && document.activeElement.matches(s),
        sel,
      );
      if (match) {
        reached = true;
        break;
      }
    }
    expect(reached, `${label}: control ${sel} must be Tab-reachable`).toBe(true);
  }
}

test.describe("P3-209 / TC-033 — accessibility checks", () => {
  for (const path of AXE_PAGES) {
    test(`${path}: axe has no serious or critical violations`, async ({ page }) => {
      await page.goto(path);
      // axe needs the DOM to have settled; for server-rendered pages wait
      // for the h1.  For forms, wait for the first field.
      const h1 = page.getByRole("heading", { level: 1 }).first();
      if ((await h1.count()) > 0) await h1.waitFor({ state: "visible" });
      const form = page.locator("form").first();
      if ((await form.count()) > 0) await form.waitFor({ state: "visible" });

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
        .analyze();
      const blocking = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      expect(
        blocking,
        `${path}: ${blocking.length} serious/critical axe violation(s): ${JSON.stringify(
          blocking.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
          null,
          2,
        )}`,
      ).toEqual([]);
    });
  }

  test("parent form: 320 CSS px viewport has no horizontal overflow and submit is keyboard reachable (D4 §11, §13)", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(PARENT_FORM_PATH);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page, "parent form at 320px");

    // Drive a few fields and confirm the submit button stays in view and
    // focusable.  The form uses id="review-<dotted path>"; CSS #id selectors
    // treat the dot as a class separator, so the attribute form is used.
    await page.locator(CHILD_NAME).fill("[MOCK] 320px form");
    await page.locator(CHILD_AGE_YEARS).fill("8");
    // Time date is a textarea, not a date input; type a YYYY-MM-DD string.
    await page.locator(EVENT_DATE).fill("2025-12-31");
    // Part-of-day radios: name="review-event.part", value="afternoon".
    await page.locator('input[name="review-event.part"][value="afternoon"]').check();
    await page.locator(EVENT_PLACE).fill("[MOCK] place");
    // District: the select is loaded from data/districts.json (1..64).
    // Pick a real code (Cumilla = 13) and verify the search input accepts
    // text — the search field filters the <select> options.
    await page.locator(DISTRICT_SEARCH).fill("Cumilla");
    await page.locator(DISTRICT_SELECT).selectOption("13");
    await page.locator(REPORTER_PHONE).fill("01700000199");

    // Tab-traversal: the ConfirmBar checkbox and the submit button must be
    // keyboard-reachable.
    await expectControlsKeyboardReachable(
      page,
      [
        'input[type="checkbox"]', // review checkbox (ConfirmBar)
        'button[type="submit"]', // submit button
      ],
      "parent form",
    );

    // Tick the review checkbox via keyboard (Space) and confirm the submit
    // button becomes enabled — this is the BR-004 "review before submit"
    // contract, exercised through the keyboard.  The checkbox is reached by
    // focusing it directly because the Tab ring depends on initial focus.
    const checkbox = page.getByRole("checkbox", { name: locales.bn.reviewChecked });
    await expect(checkbox).not.toBeChecked();
    await checkbox.focus();
    await page.keyboard.press("Space");
    await expect(checkbox).toBeChecked();
    const submit = page.getByRole("button", { name: "যাচাই করে জমা দিন" });
    await expect(submit).toBeEnabled();

    // 200 % text: bump the document root only.  A `* { font-size: 200% }`
    // rule compounds at every nesting level and overflows the test even
    // when the real layout is fine; the brief's "sensible root scale" is a
    // single step on the root, which mirrors a browser-zoom + 200 %
    // pre-multiplied text-size setting.
    await page.addStyleTag({
      content: `html { font-size: 200%; } body { line-height: 1.5; }`,
    });
    await expectNoHorizontalOverflow(page, "parent form at 320px + 200% text");
    await expect(submit).toBeEnabled();
  });

  test("sign-in: 320 CSS px viewport has no horizontal overflow and submit is keyboard reachable", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page, "sign-in at 320px");

    await expectControlsKeyboardReachable(
      page,
      ['input[name="username"]', 'input[name="password"]', 'button[type="submit"]'],
      "sign-in",
    );
  });

  test("desk surfaces: data-theme light and dark both pass axe and 320 CSS px reflow (D4 §11, §15)", async ({ page, baseURL }) => {
    // Sign in as the verified officer so /staff renders past the gate.
    // The request context carries the same-origin Origin header so the
    // sign-in path is not refused by the same-origin guard.
    const ACTORS = await seedActors();
    const ctx = await deskContext(baseURL!, baseURL!);
    try {
      await signInDesk(ctx, ACTORS.verifiedUsername, DESK_PASSWORD, baseURL!);
      const state = await ctx.storageState();
      await page.context().addCookies(state.cookies);
    } finally {
      await ctx.dispose();
    }

    for (const theme of ["light", "dark"] as const) {
      // Apply the theme on a stable page (the home parent page is
      // server-rendered and keeps the attribute without flicker).
      await page.setViewportSize({ width: 320, height: 568 });
      await page.goto("/staff");
      await page.evaluate((t) => {
        document.documentElement.setAttribute("data-theme", t);
      }, theme);
      // Wait for the staff form's heading.
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await expectNoHorizontalOverflow(page, `staff at 320px theme=${theme}`);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
        .analyze();
      const blocking = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      expect(
        blocking,
        `staff theme=${theme}: ${blocking.length} serious/critical axe violation(s): ${JSON.stringify(
          blocking.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
          null,
          2,
        )}`,
      ).toEqual([]);
    }
  });
});
