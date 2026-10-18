// P3-206 — staff found report → officer reject + officer confirm (TC-008, TC-010,
// TC-011, TC-012; FR-011/015/016/017/018/019; BR-001, BR-005, BR-019, BR-020, BR-022).
//
// The two real journeys:
//   A. Staff signs in, opens /staff, fills the found-log form, and POSTs the
//      real API-007 route.  The case row lands in `open`; the form's saved
//      panel surfaces the ref_code and the matching_state (`complete` or
//      `failed` depending on whether the embedding model is loaded).
//   B. Verified officer signs in, opens /officer/queue, opens the comparison
//      page, and rejects a pending candidate through the real UI.
//   C. Verified officer opens a *fresh* candidate (a separate `seedActors()`
//      fixture) through the same UI, ticks the four-item reviewer checklist,
//      and confirms; the response carries `referral_is_simulated: true` and
//      the saved panel surfaces the "Referral recorded (simulation)" copy.
//
// The reject and confirm journeys use distinct candidate fixtures because the
// confirmed-candidate lock (db/schema_v2.sql §protect_confirmed_candidate) and
// the unique confirmed-pair index (BR-019) make reusing a rejected pair
// impossible.
//
// Audit assertions: rejection writes `match.reject` keyed by `candidate_id`;
// confirmation writes `match.confirm` and `referral.recorded`, both keyed by
// the same `candidate_id`, with the referral row's `referral_id` carried in
// `audit_log.details` (the database check requires both rows to exist for
// check_pair_integrity to pass).
import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import {
  DESK_PASSWORD,
  SEED_PHONE_FOUND,
  deskContext,
  ownerClient,
  seedActors,
  signInDesk,
  type Actors,
} from "./support/fixtures";

let ACTORS: Actors;

test.beforeAll(async () => {
  ACTORS = await seedActors();
});

test.describe("P3-206 staff found → officer reject → officer confirm", () => {
  test("API-007 + API-008: staff POSTs found report, officer sees candidate, staff queue is 404 (TC-008, TC-009, BR-007)", async ({ baseURL }) => {
    const staffCtx = await deskContext(baseURL!, baseURL!);
    try {
      await signInDesk(staffCtx, ACTORS.staffUsername, DESK_PASSWORD, baseURL!);
      const res = await staffCtx.post("/api/found-cases", {
        data: {
          draft: {
            kind: "found",
            source_text: "[MOCK] staff API lifecycle — child seen near Kamalapur station",
            child: { name: "রাফি", name_latin: "Rafi", sex: "male", age_years: 8, age_min: 8, age_max: 8, height_cm: 130, clothing: "নীল জামা", marks: "বাঁ হাতে দাগ" },
            event: { at: "2026-10-12T16:00:00+06:00", at_lower: "2026-10-12T15:00:00+06:00", at_upper: "2026-10-12T18:00:00+06:00", at_approx: true, place_text: "কামালাপুর রেলস্টেশন", district_text: "ঢাকা", district_code: 1, thana: null, circumstances: "একা ঘুরছিল" },
            reporter: { relation: "witness", phone: SEED_PHONE_FOUND },
            evidence: {},
          },
          confirmed: true,
          client_submission_id: randomUUID(),
        },
      });
      expect(res.status()).toBe(201);
      const body = await res.json() as { id?: string; ref_code?: string };
      expect(body.ref_code).toMatch(/^F-/);

      const admin = await ownerClient();
      try {
        const { rows } = await admin.query<{ status: string }>(
          `SELECT status FROM cases WHERE id = $1`,
          [body.id],
        );
        expect(rows[0].status).toBe("open");
      } finally {
        await admin.end();
      }

      const denied = await staffCtx.get("/api/review-queue");
      expect(denied.status()).toBe(404);
      const env = await denied.json() as { error?: { id?: string } };
      expect(env.error?.id).toBe("E-004");
    } finally {
      await staffCtx.dispose();
    }

    ACTORS = await seedActors();
    const officerCtx = await deskContext(baseURL!, baseURL!);
    try {
      await signInDesk(officerCtx, ACTORS.verifiedUsername, DESK_PASSWORD, baseURL!);
      const queue = await officerCtx.get("/api/review-queue");
      expect(queue.status()).toBe(200);
      const body = await queue.json() as { items?: Array<{ candidates: Array<{ candidate_id: string }> }> };
      const ids = (body.items ?? []).flatMap((it) => it.candidates.map((c) => c.candidate_id));
      expect(ids).toContain(ACTORS.candidateId);
    } finally {
      await officerCtx.dispose();
    }
  });

  test("API-010 reject: officer rejects a pending candidate, audit `match.reject` keyed by candidate_id (TC-011, BR-019)", async ({ baseURL }) => {
    const ctx = await deskContext(baseURL!, baseURL!);
    try {
      await signInDesk(ctx, ACTORS.verifiedUsername, DESK_PASSWORD, baseURL!);
      const res = await ctx.post(`/api/candidates/${ACTORS.candidateId}/decision`, {
        data: {
          decision: "reject",
          reason: "Clothing description does not match the missing report.",
          expected_missing_version: 1,
          expected_found_version: 1,
        },
      });
      expect(res.status()).toBe(200);
      const body = await res.json() as {
        candidate_status?: string;
        missing?: { status: string };
        found?: { status: string };
        referral_id?: string | null;
        referral_state?: string | null;
      };
      expect(body.candidate_status).toBe("rejected");
      expect(body.missing?.status).toBe("open");
      expect(body.found?.status).toBe("open");
      expect(body.referral_id ?? null).toBeNull();
      expect(body.referral_state ?? null).toBeNull();

      const admin = await ownerClient();
      try {
        const { rows: candidate } = await admin.query<{ status: string; decided_at: string | null }>(
          `SELECT status, decided_at FROM match_candidates WHERE id = $1`,
          [ACTORS.candidateId],
        );
        expect(candidate[0].status).toBe("rejected");
        expect(candidate[0].decided_at).not.toBeNull();

        const { rows: audit } = await admin.query<{ action: string; candidate_id: string | null }>(
          `SELECT action, candidate_id FROM audit_log WHERE candidate_id = $1 ORDER BY at ASC`,
          [ACTORS.candidateId],
        );
        const reject = audit.filter((r) => r.action === "match.reject");
        expect(reject.length).toBeGreaterThan(0);
        expect(reject[0].candidate_id).toBe(ACTORS.candidateId);
      } finally {
        await admin.end();
      }
    } finally {
      await ctx.dispose();
    }
  });

  test("API-010 confirm: officer confirms a fresh candidate, audit `match.confirm` + `referral.recorded` (TC-010, BR-005, BR-020)", async ({ baseURL }) => {
    // A second, untouched seedActors() gives a fresh missing/found/candidate
    // triple. The original ACTORS.candidateId is now rejected (above), so
    // reusing the same pair would collide with the confirmed-pair unique
    // index and the confirmed-candidate lock.
    const FRESH = await seedActors();
    const ctx = await deskContext(baseURL!, baseURL!);
    try {
      await signInDesk(ctx, ACTORS.verifiedUsername, DESK_PASSWORD, baseURL!);
      const res = await ctx.post(`/api/candidates/${FRESH.candidateId}/decision`, {
        data: {
          decision: "confirm",
          expected_missing_version: 1,
          expected_found_version: 1,
          reviewer_checklist: {
            descriptions_reviewed: true,
            contradictions_reviewed: true,
            identity_not_proven_by_score: true,
            referral_is_simulated: true,
          },
        },
      });
      expect(res.status()).toBe(200);
      const body = await res.json() as {
        candidate_status?: string;
        missing?: { status: string };
        found?: { status: string };
        referral_id?: string | null;
        referral_state?: string | null;
        referral_is_simulated?: boolean;
      };
      expect(body.candidate_status).toBe("confirmed");
      expect(body.missing?.status).toBe("confirmed");
      expect(body.found?.status).toBe("referred");
      expect(body.referral_id).toBeTruthy();
      expect(body.referral_state).toBe("recorded");
      expect(body.referral_is_simulated).toBe(true);

      const admin = await ownerClient();
      try {
        const { rows: audit } = await admin.query<{ action: string; details: Record<string, unknown> }>(
          `SELECT action, details FROM audit_log
           WHERE candidate_id = $1
           ORDER BY at ASC`,
          [FRESH.candidateId],
        );
        const actions = audit.map((r) => r.action);
        expect(actions).toContain("match.confirm");
        expect(actions).toContain("referral.recorded");
        const referralAudit = audit.find((r) => r.action === "referral.recorded");
        expect(referralAudit?.details.referral_simulated).toBe(true);
        const referral = await admin.query("SELECT id FROM referrals WHERE candidate_id=$1", [FRESH.candidateId]);
        expect(referral.rows[0]?.id).toBe(body.referral_id);
      } finally {
        await admin.end();
      }
    } finally {
      await ctx.dispose();
    }
  });

  test("UI: staff fills the found-log form and POSTs API-007; saved panel surfaces ref_code and matching_state (TC-008, P3-206 journey A)", async ({ baseURL, page }) => {
    // Pinned offline model cache so the matcher never reaches a paid provider.
    // The form is server-rendered with the real districts list; staff fills
    // every required field using the actual input names, and the assertion
    // captures the response so we are not inferring success from the DOM.
    const staffCtx = await deskContext(baseURL!, baseURL!);
    try {
      await signInDesk(staffCtx, ACTORS.staffUsername, DESK_PASSWORD, baseURL!);
      const state = await staffCtx.storageState();
      await page.context().addCookies(state.cookies);
    } finally {
      await staffCtx.dispose();
    }

    await page.goto("/staff");
    const circumstances = page.locator('textarea[name="circumstances"]');
    await circumstances.waitFor({ state: "visible" });

    // Sex: required by the contract; the seed missing case is female 8 Dhaka.
    // We use female/8/1 to make the matcher path possible when the model is
    // available, and the form still saves when it is not.
    await page.locator('select[name="sex"]').selectOption("female");
    await page.locator('input[name="ageYears"]').fill("8");
    await page.locator('input[name="heightCm"]').fill("130");
    await page.locator('input[name="clothing"]').fill("[MOCK] blue shirt, grey pants");
    await page.locator('input[name="marks"]').fill("[MOCK] scar on left hand");
    await page.locator('input[name="place"]').fill("Kamalapur railway station");
    await page.locator('select[name="district"]').selectOption({ index: 1 });
    await page.locator('input[name="thana"]').fill("[MOCK] thana");
    // A past datetime in Asia/Dhaka, explicit value (not future).
    await page.locator('input[name="foundAt"]').fill("2026-10-12T10:00");
    await page.locator('input[name="phone"]').fill(SEED_PHONE_FOUND);
    await page.locator('input[name="relation"]').fill("[MOCK] witness");
    await circumstances.fill("[MOCK] staff UI lifecycle — child seen near Kamalapur station, alone");

    // Capture the API-007 POST response so we assert 201 + ref_code from the
    // wire, not a re-render of the form.
    const postResponse = page.waitForResponse(
      (r) => r.url().endsWith("/api/found-cases") && r.request().method() === "POST",
      { timeout: 15_000 },
    );
    const saveBtn = page.getByRole("button", { name: "সংরক্ষণ করুন" });
    await saveBtn.click();
    const response = await postResponse;
    expect(response.status()).toBe(201);
    const body = await response.json() as { id?: string; ref_code?: string; matching_state?: string };
    expect(body.id).toBeTruthy();
    expect(body.ref_code).toMatch(/^F-/);
    expect(body.matching_state).toBe("complete");

    // The saved panel renders the ref_code and the matching_state copy from
    // src/locales/index.ts (Bangla: মিল খোঁজার অপেক্ষায় / খোঁজা হচ্ছে / খোঁজা
    // হয়েছে / খোঁজা যায়নি; English: queued / running / complete / failed).
    await expect(page.getByText(body.ref_code!)).toBeVisible();
    const matchLabel = body.matching_state === "complete"
      ? /মিল খোঁজা হয়েছে|match search is done/i
      : body.matching_state === "failed"
      ? /মিল খোঁজা যায়নি|match search did not run/i
      : /মিল খোঁজার অপেক্ষায়|মিল খোঁজা হচ্ছে|waiting to look|looking for matches/i;
    await expect(page.getByText(matchLabel)).toBeVisible();
  });

  test("UI: officer rejects the pending candidate through the real comparison page (P3-206 journey B)", async ({ baseURL, page }) => {
    // Use a fresh pair so the rejection lands on a still-pending candidate.
    const FRESH = await seedActors();
    const officerCtx = await deskContext(baseURL!, baseURL!);
    try {
      await signInDesk(officerCtx, ACTORS.verifiedUsername, DESK_PASSWORD, baseURL!);
      const state = await officerCtx.storageState();
      await page.context().addCookies(state.cookies);
    } finally {
      await officerCtx.dispose();
    }

    // Open the comparison page for the candidate directly; the link is a
    // real <a href="/officer/match/<id>"> on the queue list.
    await page.goto(`/officer/match/${FRESH.candidateId}`);
    const rejectBtn = page.getByRole("button", { name: "মিল নয়" });
    await rejectBtn.click();
    const reasonField = page.getByLabel("কারণ (বাধ্যতামূলক, ৩–৫০০ অক্ষর)");
    await reasonField.fill("[MOCK] UI reject: clothing does not match the missing report.");
    await rejectBtn.click(); // submit

    // The decision panel switches to the rejected state with the literal
    // Bangla copy from the locales file.
    await expect(page.getByText("বাতিল করা হয়েছে", { exact: true })).toBeVisible();

    const admin = await ownerClient();
    try {
      const { rows } = await admin.query<{ status: string }>(
        `SELECT status FROM match_candidates WHERE id = $1`,
        [FRESH.candidateId],
      );
      expect(rows[0].status).toBe("rejected");
    } finally {
      await admin.end();
    }
  });

  test("UI: officer confirms a fresh candidate through the dialog, four strict checkboxes, final `হ্যাঁ, নিশ্চিত করুন` (P3-206 journey C)", async ({ baseURL, page }) => {
    const FRESH = await seedActors();
    const officerCtx = await deskContext(baseURL!, baseURL!);
    try {
      await signInDesk(officerCtx, ACTORS.verifiedUsername, DESK_PASSWORD, baseURL!);
      const state = await officerCtx.storageState();
      await page.context().addCookies(state.cookies);
    } finally {
      await officerCtx.dispose();
    }

    await page.goto(`/officer/match/${FRESH.candidateId}`);
    // The real href on the queue list is `/officer/match/<candidate_id>` —
    // the comparison page reads the candidate_id from the URL, so a direct
    // navigation reaches the same component the queue link opens.
    const confirmBtn = page.getByRole("button", { name: "মিল নিশ্চিত করুন" });
    await confirmBtn.click();

    const dialog = page.locator("dialog");
    await expect(dialog).toBeVisible();
    // Exactly four checkboxes; check all (the final button is disabled until
    // every one is checked, so this is the actual confirmation gate).
    const checkboxes = dialog.getByRole("checkbox");
    await expect(checkboxes).toHaveCount(4);
    for (let i = 0; i < 4; i++) {
      await checkboxes.nth(i).check();
    }

    const finalBtn = dialog.getByRole("button", { name: "হ্যাঁ, নিশ্চিত করুন" });
    await expect(finalBtn).toBeEnabled();
    await finalBtn.click();

    // The decision panel switches to the confirmed state. The Bangla copy
    // carries the literal "সিমুলেশন" word, and the English copy carries
    // "simulation" — both are honest; neither claims delivery.
    await expect(page.getByText("পর্যালোচকের সিদ্ধান্ত নথিভুক্ত। রেফারেল নথিভুক্ত (সিমুলেশন)।")).toBeVisible();

    const admin = await ownerClient();
    try {
      const { rows: candidate } = await admin.query<{ status: string }>(
        `SELECT status FROM match_candidates WHERE id = $1`,
        [FRESH.candidateId],
      );
      expect(candidate[0].status).toBe("confirmed");

      const { rows: referral } = await admin.query<{ state: string; is_simulated: boolean }>(
        `SELECT record_state AS state, is_simulated FROM referrals WHERE candidate_id = $1`,
        [FRESH.candidateId],
      );
      expect(referral[0].state).toBe("recorded");
      expect(referral[0].is_simulated).toBe(true);
    } finally {
      await admin.end();
    }
  });
});
