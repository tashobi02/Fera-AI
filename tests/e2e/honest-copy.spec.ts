// P3-208 — honest copy: no actual return/delivery/reunification/alert claim
// (constitution VI; BR-002, BR-005, BR-011, BR-022, BR-026).  The brief
// requires the spec to fail loudly if a UI surface claims that a child
// was returned, reunified, delivered, rescued, or that an alert was sent
// to police or CID.
//
// Scope: every public surface the parent or the desk might see, walked
// through the real browser.  The desk pages are reached through the
// sign-in flow so the cookie path is exercised.  The sign-in form lives
// on the `sign-in` path; the queue and review screens are protected by
// the verified-officer role (requireRole → /officer/queue).  The match
// review path is exercised by visiting it with a candidate id — for
// this honesty check we use the candidate id from the shared fixtures.
//
// Local-only disposable DB env guard: enforced by the webServer config
// (playwright.config.ts) and `e2eDatabaseUrl()`.  No secrets are read.
import { test, expect } from "@playwright/test";
import { locales } from "../../src/locales";
import {
  DESK_PASSWORD,
  deskContext,
  seedActors,
  signInDesk,
  type Actors,
} from "./support/fixtures";

// Forbidden phrases per BR-005 / constitution VI.  Matched as substrings
// against the visible text of each page.  The case-domain copy uses
// "রেফারেল নথিভুক্ত (সিমুলেশন)" ("referral recorded (simulation)") which
// is the only correct phrasing.
const FORBIDDEN = [
  "delivered",
  "returned to family",
  "reunified",
  "rescued",
  "alerted police",
  "notified cid",
  "sent to cid",
  "case closed and child",
  "successful return",
] as const;

// The verified officer's queue, found-log, status, and match-review pages
// are reached after sign-in.  The match review URL is /officer/match/<id>;
// we use the seed candidate id.
const PUBLIC_PAGES = ["/", "/intake", "/intake/form", "/intake/review", "/status", "/sign-in"] as const;

let ACTORS: Actors;
test.beforeAll(async () => {
  ACTORS = await seedActors();
});

async function assertNoForbiddenCopy(page: import("@playwright/test").Page, label: string): Promise<void> {
  const body = (await page.locator("body").innerText()).toLowerCase();
  for (const phrase of FORBIDDEN) {
    expect(
      body.includes(phrase),
      `${label}: forbidden honest-copy claim "${phrase}" was found in body text`,
    ).toBe(false);
  }
}

test.describe("P3-208 honest copy — no delivery/return/reunification/alert claims", () => {
  for (const path of PUBLIC_PAGES) {
    test(`public page ${path} has no forbidden claim`, async ({ page }) => {
      await page.goto(path);
      // Some pages are dynamic; wait for either a heading or the form to
      // settle before sampling the body text.
      const h1 = page.getByRole("heading", { level: 1 }).first();
      const form = page.locator("form").first();
      if ((await h1.count()) > 0) await h1.waitFor({ state: "visible" });
      else if ((await form.count()) > 0) await form.waitFor({ state: "visible" });
      await assertNoForbiddenCopy(page, path);
    });
  }

  test("desk pages: queue, found log, match review, and case detail have no forbidden claim", async ({ page, baseURL }) => {
    // Sign in as the verified officer; the cookie is set on the browser
    // context. We use the API route directly to keep the test focused on
    // the page assertions, not the form behaviour. The request context
    // carries the same-origin Origin header so the sign-in path and any
    // follow-up read both satisfy the same-origin check.
    const ctx = await deskContext(baseURL!, baseURL!);
    try {
      await signInDesk(ctx, ACTORS.verifiedUsername, DESK_PASSWORD, baseURL!);
      const state = await ctx.storageState();
      await page.context().addCookies(state.cookies);
    } finally {
      await ctx.dispose();
    }

    const deskPaths = [
      "/officer/queue",
      "/officer/map",
      "/officer/duplicates",
      "/officer/case/00000000-0000-4000-8000-000000000000", // SCREEN-016 notFound path
      "/admin",
      "/staff",
    ];
    for (const path of deskPaths) {
      const response = await page.goto(path);
      expect([200, 404], `Unexpected response while checking ${path}`).toContain(response?.status());
      // Wait for the page to render — some paths are notFound; others are
      // full surfaces.  We accept either.
      await page.waitForLoadState("domcontentloaded");
      if (path === "/officer/queue") {
        await expect(page.getByRole("heading", { level: 1, name: locales.bn.officerQueueTitle, exact: true })).toBeVisible();
      }
      await assertNoForbiddenCopy(page, path);
    }

    // The match review screen is per-candidate. The shared `seedActors()` fixture
    // (tests/e2e/support/fixtures.ts) already inserts a `pending` candidate on
    // the pair; reuse that one so the (missing_case_id, found_case_id, version)
    // unique constraint cannot conflict with a duplicate insert from a previous
    // run. The pair sits in `matched_pending_review` after the seed.
    const candidateId = ACTORS.candidateId;

    await page.goto(`/officer/match/${candidateId}`);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await assertNoForbiddenCopy(page, `/officer/match/${candidateId}`);

    // The confirm dialog exposes the "referral is a simulation" copy when
    // opened; this is the canonical honest copy and must appear, while the
    // forbidden phrases must not.
    const confirmBtn = page.getByRole("button", { name: "মিল নিশ্চিত করুন" });
    await expect(confirmBtn).toBeVisible();
    {
      await confirmBtn.click();
      const dialog = page.locator("dialog");
      await expect(dialog).toBeVisible();
      const dialogText = (await dialog.innerText()).toLowerCase();
      expect(dialogText, "match confirm dialog must say simulation").toContain("সিমুলেশন");
      for (const phrase of FORBIDDEN) {
        expect(
          dialogText.includes(phrase),
          `match confirm dialog must not contain "${phrase}"`,
        ).toBe(false);
      }
      await page.keyboard.press("Escape");
    }
  });
});
