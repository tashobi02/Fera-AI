// SYS-BUG-01 / TC-017/036/060: a manual handoff does not require an AI response.
import { test, expect } from "@playwright/test";
import { errorEnvelope } from "../../src/contracts";

const acknowledge = /বুঝেছি, চালিয়ে যান|I understand, continue/;
const openForm = /^ফর্ম খুলুন$|^Open the form$/;

test("TC-017: manual entry before any extraction opens editable unknown fields", async ({ page }) => {
  let submissions = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/cases") submissions++;
  });
  await page.goto("/intake");
  await page.getByRole("button", { name: acknowledge }).click();
  await page.getByRole("link", { name: openForm }).first().click();
  await expect(page).toHaveURL(/\/intake\/form$/);
  await expect(page.locator('[id="review-child.name"]')).toBeVisible();
  await expect(page.locator('[id="review-child.name"]')).toHaveValue("");
  await expect(page.locator('[id="review-reporter.phone"]')).toHaveValue("");
  expect(submissions).toBe(0);
});

for (const error of ["E-013", "E-023"] as const) {
  test(`TC-017/036/060: first extraction ${error} retains typed text in the editable manual form`, async ({ page }) => {
    let dispatches = 0;
    await page.route("**/api/intake/extract", async (route) => {
      dispatches++;
      // Exercise the real HTTP-client/fallback seam with a canonical error;
      // provider dispatch and budget exhaustion themselves are DB/unit-tested.
      await route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify(errorEnvelope(error)) });
    });
    await page.goto("/intake");
    await expect(page.getByRole("button", { name: acknowledge })).toBeVisible();
    expect(dispatches).toBe(0);
    await expect(page.locator('textarea[name="text"]')).toHaveCount(0);
    await page.getByRole("button", { name: acknowledge }).click();
    const sourceText = `[MOCK] synthetic report retained after ${error}`;
    await page.locator('textarea[name="text"]').fill(sourceText);
    await page.getByRole("button", { name: /^পাঠান$|^Send$/ }).click();
    await expect(page.getByRole("heading", { name: /বাকি তথ্য ফর্মে দিন|Add the rest in the form/ })).toBeVisible();
    expect(dispatches).toBe(1);
    await page.getByRole("link", { name: openForm }).first().click();
    await expect(page).toHaveURL(/\/intake\/form$/);
    await expect(page.locator('[id="review-child.name"]')).toBeVisible();
    await expect(page.locator("body")).toContainText(sourceText);
    await expect(page.locator('[id="review-child.age_years"]')).toHaveValue("");
    await expect(page.locator('[id="review-reporter.phone"]')).toHaveValue("");
  });
}
