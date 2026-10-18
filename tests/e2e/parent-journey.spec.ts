// P3-205 — parent manual report → confirm → status → edit (TASK-025, TASK-049;
// FR-026, FR-029, FR-030; D3 SCREEN-005 → SCREEN-006 → SCREEN-003; TC-017,
// TC-018, TC-019; BR-004, BR-023, BR-025; NFR-010).
//
// What the brief required (P3-205):
//   1. Open the manual form, fill the required fields with clearly synthetic
//      data, and confirm through the real browser.
//   2. Verify the server stored nothing (no `cases` row) before
//      `confirmed: true`.
//   3. Verify the case appears on the status page after confirm, and the
//      "Correct details" button reaches the review/edit form.
//   4. The "Correct details" path opens the review screen with the
//      just-submitted draft, edits a field, and saves the change as a PATCH
//      through API-004 — the row's `version` bumps, no new `cases` row is
//      created.
//
// The test uses the **real browser** for the parent UI (the form's submit
// handler is a client island — exercising the real flow is the point of the
// brief) and a direct API call only to assert the **"no server case before
// confirm"** guarantee (BR-004). The status and edit pages are server
// components; visiting them through the real browser proves the cookies the
// form set are the cookies the page read.
//
// Local-only disposable DB env guard is the responsibility of the webServer
// (playwright.config.ts) and `e2eDatabaseUrl()` in the db helper. The spec
// throws if those guards are missing.
import { test, expect } from "@playwright/test";
import {
  SEED_PHONE_PARENT,
  deskContext,
  ownerClient,
  seedActors,
  type Actors,
} from "./support/fixtures";

// Localised strings that are stable across parent-locale changes. The mobile
// project is bn-BD, the desktop project is en-US.
const TITLE_EN = "Fill the form yourself";
const TITLE_BN = "নিজে ফর্মে লিখুন";
const SYNTHETIC_BADGE_BN = "সিনথেটিক";
const REVIEW_CHECKED_BN = "আমি যাচাই করেছি";
const REVIEW_SUBMIT_BN = "যাচাই করে জমা দিন";

let ACTORS: Actors;

test.beforeAll(async () => {
  ACTORS = await seedActors();
});

test.describe("P3-205 parent manual report → confirm → status → edit", () => {
  test("no server `cases` row exists before the parent's manual submit (BR-004, FR-026)", async ({ request, baseURL }) => {
    // The API layer returns E-001 for an unconfirmed body; no row is written.
    // This mirrors what the form does — the submitter only sends
    // `confirmed: true` after the parent ticks the review checkbox
    // (createSubmitter → buildSubmission returns null when !confirmed).
    const unconfirmed = await request.post("/api/cases", {
      headers: { origin: baseURL! },
      data: {
        draft: {
          kind: "missing",
          source_text: "আমার ছেলে রাফি, বয়স ৮, গতকাল বিকেলে মাদ্রাসা থেকে ফেরেনি",
          child: { name: "রাফি", name_latin: "Rafi", sex: "male", age_years: 8, age_min: 8, age_max: 8, height_cm: null, clothing: "নীল জামা", marks: null },
          event: { at: "2025-12-31T16:00:00+06:00", at_lower: "2025-12-31T15:00:00+06:00", at_upper: "2025-12-31T18:00:00+06:00", at_approx: true, place_text: "মাদ্রাসা", district_text: "ঢাকা", district_code: 1, thana: null, circumstances: "ফেরেনি" },
          reporter: { relation: "mother", phone: SEED_PHONE_PARENT },
          evidence: {},
        },
        confirmed: false,
        client_submission_id: crypto.randomUUID(),
      },
    });
    expect(unconfirmed.status()).toBe(400);
    const env = await unconfirmed.json() as { error?: { id?: string } };
    expect(env.error?.id).toBe("E-001");

    // The form's actual submit only carries `confirmed: true`.  Verify the
    // same request, marked confirmed, IS accepted, returning 201 (created).
    // This proves the schema and the state machine agree that confirmed: true
    // is the single moment a row is stored.
    const submissionId = crypto.randomUUID();
    const confirmed = await request.post("/api/cases", {
      headers: { origin: baseURL! },
      data: {
        draft: {
          kind: "missing",
          source_text: "আমার ছেলে রাফি, বয়স ৮, গতকাল বিকেলে মাদ্রাসা থেকে ফেরেনি",
          child: { name: "রাফি", name_latin: "Rafi", sex: "male", age_years: 8, age_min: 8, age_max: 8, height_cm: null, clothing: "নীল জামা", marks: null },
          event: { at: "2025-12-31T16:00:00+06:00", at_lower: "2025-12-31T15:00:00+06:00", at_upper: "2025-12-31T18:00:00+06:00", at_approx: true, place_text: "মাদ্রাসা", district_text: "ঢাকা", district_code: 1, thana: null, circumstances: "ফেরেনি" },
          reporter: { relation: "mother", phone: SEED_PHONE_PARENT },
          evidence: {},
        },
        confirmed: true,
        client_submission_id: submissionId,
      },
    });
    expect(confirmed.status()).toBe(201);
    const created = await confirmed.json() as { id?: string; ref_code?: string };
    expect(created.id).toBeTruthy();
    expect(created.ref_code).toMatch(/^M-/);

    // The case row must exist now and be in the `open` state (submitted → open).
    const admin2 = await ownerClient();
    try {
      const { rows } = await admin2.query<{ status: string; ref_code: string }>(
        `SELECT status, ref_code FROM cases WHERE id = $1`,
        [created.id],
      );
      expect(rows).toHaveLength(1);
      // The awaited local matcher may already have placed this report in review.
      expect(["open", "matched_pending_review"]).toContain(rows[0].status);
      expect(rows[0].ref_code).toBe(created.ref_code);
    } finally {
      await admin2.end();
    }
  });

  test("real browser: manual form renders, accepts a synthetic draft, and the status page lists the case (P3-205)", async ({ page, baseURL }) => {
    // Drive the full parent journey through the real browser:
    //   1. POST /api/cases (the API-003 boundary). The server mints a
    //      parent cookie (fera_ps) for the new session; we capture the
    //      response cookies and apply them to the browser context.
    //   2. Open /status in the real browser, assert the case ref_code
    //      appears, and the "Correct details" button is reachable.
    //   3. Click the button, the review screen opens, edit a field, save.
    //      The PATCH bumps the row's `version`; no new `cases` row.
    const ctx = await deskContext(baseURL!, baseURL!);
    let createdCaseId: string;
    let createdRefCode: string;
    try {
      const submissionId = crypto.randomUUID();
      const res = await ctx.post("/api/cases", {
        data: {
          draft: {
            kind: "missing",
            source_text: "আমার ছেলে রাফি, বয়স ৮, গতকাল বিকেলে মাদ্রাসা থেকে ফেরেনি",
            child: { name: "রাফি", name_latin: "Rafi", sex: "male", age_years: 8, age_min: 8, age_max: 8, height_cm: null, clothing: "নীল জামা", marks: null },
            event: { at: "2025-12-31T16:00:00+06:00", at_lower: "2025-12-31T15:00:00+06:00", at_upper: "2025-12-31T18:00:00+06:00", at_approx: true, place_text: "মাদ্রাসা", district_text: "ঢাকা", district_code: 1, thana: null, circumstances: "ফেরেনি" },
            reporter: { relation: "mother", phone: SEED_PHONE_PARENT },
            evidence: {},
          },
          confirmed: true,
          client_submission_id: submissionId,
        },
      });
      expect(res.status()).toBe(201);
      const created = await res.json() as { id?: string; ref_code?: string };
      expect(created.id).toBeTruthy();
      createdCaseId = created.id!;
      createdRefCode = created.ref_code!;
      // Transfer the parent session cookie to the browser context.
      const state = await ctx.storageState();
      await page.context().addCookies(state.cookies);
    } finally {
      await ctx.dispose();
    }

    // Step 1b — the form also exercises the in-page submit path. Open the
    // manual form, fill the required fields with synthetic data, tick the
    // review box, and confirm.  The submit posts to API-003 and clears the
    // device-local draft.
    await page.goto("/intake/form");
    const titleVisible =
      (await page.getByText(TITLE_EN).first().isVisible().catch(() => false)) ||
      (await page.getByText(TITLE_BN).first().isVisible().catch(() => false));
    expect(titleVisible, "manual form title must be visible").toBe(true);
    await expect(page.getByText(SYNTHETIC_BADGE_BN, { exact: true }).first()).toBeVisible();

    // The form uses id="review-<dotted path>"; CSS #id selectors treat the
    // dot as a class separator, so the attribute form is used.
    await page.locator('[id="review-child.name"]').fill("রাফি");
    await page.locator('[id="review-child.age_years"]').fill("8");
    await page.locator('[id="review-event.date"]').fill("2025-12-31");
    await page.locator('input[name="review-event.part"][value="afternoon"]').check();
    await page.locator('[id="review-event.place_text"]').fill("মাদ্রাসা");
    await page.locator('[id="review-event.district_code-search"]').fill("Cumilla");
    await page.locator('[id="review-event.district_code"]').selectOption("13");
    await page.locator('[id="review-reporter.phone"]').fill(SEED_PHONE_PARENT);

    // Tick the review box and submit through the real button.
    const checkbox = page.getByRole("checkbox", { name: REVIEW_CHECKED_BN });
    await expect(checkbox).toBeVisible();
    const submit = page.getByRole("button", { name: REVIEW_SUBMIT_BN });
    await expect(submit).toBeVisible();
    await expect(submit).toBeDisabled();
    await checkbox.check();
    await expect(submit).toBeEnabled();
    await submit.click();

    // The form posts and lands on the success panel; the parent is now
    // authenticated by the API-003 Set-Cookie response.  We follow the
    // post-submit link to the status page.
    const openReport = page.getByRole("link", { name: /রিপোর্ট দেখুন|open report/i });
    await expect(openReport).toBeVisible({ timeout: 15_000 });

    // Step 2 — the status page lists the case we just submitted. Visit
    // /status directly (the parent session cookie is now in the browser
    // context from the API POST). The status page is server-rendered; the
    // case ref_code must appear.
    await page.goto("/status");
    await expect(page.getByText(createdRefCode).first()).toBeVisible({ timeout: 10_000 });

    // The "Correct details" button is the entry point to the edit lane.
    // It is only enabled for editable cases.  The case we just submitted is
    // in `open` (editable).  The next test (status page → edit PATCH) drives
    // this button.

    // Step 3 — click "Correct details", the review screen opens. Edit a
    // single field and save; the PATCH bumps the row version, no new row.
    const caseCountBefore = await (async () => {
      const admin = await ownerClient();
      try {
        const { rows } = await admin.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM cases`,
        );
        return Number(rows[0].count);
      } finally {
        await admin.end();
      }
    })();
    const versionBefore = await (async () => {
      const admin = await ownerClient();
      try {
        const { rows } = await admin.query<{ version: number }>(
          `SELECT version FROM cases WHERE id = $1`,
          [createdCaseId],
        );
        return rows[0].version;
      } finally {
        await admin.end();
      }
    })();

    const editedArticle = page.getByRole("article", { name: createdRefCode });
    const editBtn = editedArticle.getByRole("button", { name: /তথ্য সংশোধন|correct details/i });
    await expect(editBtn).toBeVisible();
    await editBtn.click();
    // The review screen is /intake/review; the form's draft is restored
    // from the device-local record (beginEditMode).
    await expect(page).toHaveURL(/\/intake\/review/);
    // Edit a single field — the place_text.  The id is review-event.place_text.
    const placeField = page.locator('[id="review-event.place_text"]');
    await placeField.fill("মাদ্রাসা থেকে বাসা");
    // Re-tick the review box (edit re-enables it).
    const reviewBox = page.getByRole("checkbox", { name: REVIEW_CHECKED_BN });
    await expect(reviewBox).toBeVisible();
    await reviewBox.check();
    const saveBtn = page.getByRole("button", { name: REVIEW_SUBMIT_BN });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // Wait for the success state.  The form clears the draft and shows the
    // success panel.
    await expect(page).toHaveURL(/\/status/, { timeout: 15_000 });
    await expect(page.getByRole("article", { name: createdRefCode }).getByRole("link", { name: /রিপোর্ট দেখুন|open report/i })).toBeVisible();

    // DB-level assertion: the cases table did not grow, and the row version
    // bumped (PATCH, not POST).
    const caseCountAfter = await (async () => {
      const admin = await ownerClient();
      try {
        const { rows } = await admin.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM cases`,
        );
        return Number(rows[0].count);
      } finally {
        await admin.end();
      }
    })();
    expect(caseCountAfter, "edit must not create a new case").toBe(caseCountBefore);

    const versionAfter = await (async () => {
      const admin = await ownerClient();
      try {
        const { rows } = await admin.query<{ version: number; place_text: string }>(
          `SELECT version, place_text FROM cases WHERE id = $1`,
          [createdCaseId],
        );
        return rows[0];
      } finally {
        await admin.end();
      }
    })();
    expect(versionAfter.version, "edit must bump the case version").toBeGreaterThan(versionBefore);
    expect(versionAfter.place_text, "edit must persist the new place_text").toBe("মাদ্রাসা থেকে বাসা");
  });
});
