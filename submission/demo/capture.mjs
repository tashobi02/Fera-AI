// Phase 4 — Round 2 demo video capture.
//
// Runs against a fresh, dedicated loopback-only test DB that the root
// playwright.config.ts builds when its webServer boots. The capture uses the
// real browser (Playwright Chromium) against the real Next.js production
// build, reusing the same fixtures, helpers and selectors as the existing
// tests/e2e/{parent-journey,officer-lifecycle}.spec.ts. No mock HTML, no
// storyboard. The output is a per-run .webm and a sequence of PNGs.
//
// Run via `node submission/demo/capture.mjs`. The root config honours
// FERA_E2E_PORT (this script overrides it to 3115 so it never collides with
// the normal e2e run). FERA_MODEL_CACHE pins the offline embedding model.
// FERA_DEMO_CAPTURE_DIR points at the per-run directory.
//
// Intentionally no audio recording; the script overlays captions later via
// ffmpeg. The persistent 'SYNTHETIC LOCAL DEMO | [MOCK] officer verification
// | Timing edited' label is added by the post-process step.

import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_DATABASE_URL,
  assertLocalDatabaseUrl,
} from "../../scripts/db/guard.mjs";

// ---- configuration --------------------------------------------------------

const PORT = Number(process.env.FERA_E2E_PORT ?? 3115);
const BASE = `http://127.0.0.1:${PORT}`;
const RAW_DIR = process.env.FERA_DEMO_CAPTURE_DIR ?? join(process.cwd(), "submission", "demo", "raw");
mkdirSync(RAW_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// 1) database reset + admin role (mirrors tests/e2e/support/fixtures.ts ownerClient)
// ---------------------------------------------------------------------------

const adminRaw = process.env.FERA_DB_ADMIN_URL ?? DEFAULT_DATABASE_URL;
const adminUrl = assertLocalDatabaseUrl(adminRaw, "demo:admin");
const dbName = process.env.FERA_E2E_DB_NAME;
if (!dbName || !/^fera_e2e_demo_[a-z0-9_]{1,40}$/.test(dbName)) {
  throw new Error("FERA_E2E_DB_NAME must be set by playwright.config.ts webServer env");
}
const e2eUrl = new URL(adminUrl.href);
e2eUrl.pathname = `/${dbName}`;
e2eUrl.username = "postgres";

// ---------------------------------------------------------------------------
// 2) fixtures (identical shape to tests/e2e/support/fixtures.ts)
// ---------------------------------------------------------------------------

const SEED_PHONE_PARENT = "01700000101";
const SEED_PHONE_FOUND = "01700000102";
const DESK_PASSWORD = "fera-e2e-desk-pass";
const STAFF_DISPLAY = "[MOCK] Browser Staff One";
const UNVERIFIED_DISPLAY = "[MOCK] Browser Officer Pending";
const VERIFIED_DISPLAY = "[MOCK] Browser Officer Verified";
const SEED_PARENT_NAME = "[MOCK] Browser Reporter One";
const SEED_CHILD_NAME = "[MOCK] Browser Child One";

async function hashDeskPassword() {
  const { hash } = await import("@node-rs/argon2");
  return hash(DESK_PASSWORD, { memoryCost: 19_456, timeCost: 2, parallelism: 1, outputLen: 32 });
}

async function pgAdminClient() {
  const { Client } = await import("pg");
  const c = new Client({ connectionString: e2eUrl.href, connectionTimeoutMillis: 10_000 });
  await c.connect();
  return c;
}

async function seedReferenceDistrict(admin) {
  const { default: reference } = await import("../../data/districts.json", { with: { type: "json" } });
  for (const d of reference.districts) {
    await admin.query(
      `INSERT INTO districts(code,name_en,name_bn,division_en,lat,lng) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
      [d.code, d.name_en, d.name_bn, d.division_en, d.lat, d.lng],
    );
  }
}

// Build a fresh actor set (mirror of seedActors() in fixtures.ts).
async function seedActors() {
  const { randomBytes, randomUUID } = await import("node:crypto");
  const admin = await pgAdminClient();
  try {
    await seedReferenceDistrict(admin);
    const passwordHash = await hashDeskPassword();
    await admin.query("BEGIN");
    try {
      const staffUserId = randomUUID();
      const unverifiedOfficerId = randomUUID();
      const verifiedOfficerId = randomUUID();
      const staffUsername = `staff.demo.${staffUserId.slice(0, 8)}`;
      const unverifiedUsername = `officer.pending.demo.${unverifiedOfficerId.slice(0, 8)}`;
      const verifiedUsername = `officer.verified.demo.${verifiedOfficerId.slice(0, 8)}`;
      for (const row of [
        { id: staffUserId, role: "staff", display: STAFF_DISPLAY, verified: false, username: staffUsername },
        { id: unverifiedOfficerId, role: "officer", display: UNVERIFIED_DISPLAY, verified: false, username: unverifiedUsername },
        { id: verifiedOfficerId, role: "officer", display: VERIFIED_DISPLAY, verified: true, username: verifiedUsername },
      ]) {
        await admin.query(
          `INSERT INTO users (id, username, display_name, password_hash, role, verified, is_active, district_code)
           VALUES ($1, $2, $3, $4, $5::user_role, $6, true, 1)`,
          [row.id, row.username, row.display, passwordHash, row.role, row.verified],
        );
      }
      const parentSessionId = randomUUID();
      await admin.query(`INSERT INTO parent_sessions (id) VALUES ($1)`, [parentSessionId]);
      const missingCaseId = randomUUID();
      const missingSubmissionId = randomUUID();
      const missingHash = randomBytes(32).toString("hex");
      const missingRefCode = `M-${randomBytes(3).toString("hex").slice(0, 6).toUpperCase()}`;
      await admin.query(
        `INSERT INTO cases (id, ref_code, kind, status, source, is_synthetic, reporter_session_id,
                            client_submission_id, submission_payload_hash, raw_text, child_name,
                            age_years, age_min, age_max, sex, clothing, circumstances,
                            event_at, event_at_lower, event_at_upper, place_text, district_code,
                            contact_phone, reporter_relation, provenance)
         VALUES ($1, $2, 'missing', 'submitted', 'parent', true, $3, $4, $5, $6, $7,
                 8, 8, 8, 'female', $8, $9, now(), now(), now(), $10, 1,
                 $11, 'mother', '{}'::jsonb)`,
        [missingCaseId, missingRefCode, parentSessionId, missingSubmissionId, missingHash,
         `${SEED_PARENT_NAME} raw text`, SEED_CHILD_NAME,
         "[MOCK] clothing", "[MOCK] circumstances",
         "[MOCK] place", SEED_PHONE_PARENT],
      );
      await admin.query("UPDATE cases SET status = 'open' WHERE id = $1", [missingCaseId]);
      const foundCaseId = randomUUID();
      const foundSubmissionId = randomUUID();
      const foundHash = randomBytes(32).toString("hex");
      const foundRefCode = `F-${randomBytes(3).toString("hex").slice(0, 6).toUpperCase()}`;
      await admin.query(
        `INSERT INTO cases (id, ref_code, kind, status, source, is_synthetic, created_by_user_id,
                            client_submission_id, submission_payload_hash, raw_text, child_name,
                            age_min, age_max, sex, clothing, circumstances,
                            event_at, event_at_lower, event_at_upper, place_text, district_code,
                            contact_phone, provenance)
         VALUES ($1, $2, 'found', 'open', 'staff', true, $3, $4, $5, $6, $7,
                 7, 9, 'female', $8, $9, now(), now(), now(), $10, 1,
                 $11, '{}'::jsonb)`,
        [foundCaseId, foundRefCode, verifiedOfficerId, foundSubmissionId, foundHash,
         `${SEED_PARENT_NAME} found raw text`, SEED_CHILD_NAME,
         "[MOCK] found clothing", "[MOCK] found circumstances",
         "[MOCK] found place", SEED_PHONE_FOUND],
      );
      const candidateId = randomUUID();
      await admin.query(
        `INSERT INTO match_candidates (id, missing_case_id, found_case_id, missing_version, found_version,
                                       score, rank, reason_bn, reason_en, components, status)
         VALUES ($1, $2, $3, 1, 1, 72.5, 1, $4, $5, $6::jsonb, 'pending')`,
        [candidateId, missingCaseId, foundCaseId,
         "Seeded synthetic candidate for workflow demonstration",
         "Seeded synthetic candidate for workflow demonstration",
         JSON.stringify({ text: 0.7, age: 1 })],
      );
      await admin.query(
        `UPDATE cases SET status = 'matched_pending_review' WHERE id = ANY($1) AND status = 'open'`,
        [[missingCaseId, foundCaseId]],
      );
      await admin.query("COMMIT");
      return {
        staffUserId, staffUsername, staffPassword: DESK_PASSWORD,
        unverifiedOfficerId, unverifiedUsername,
        verifiedOfficerId, verifiedUsername,
        missingCaseId, missingRefCode, foundCaseId, foundRefCode, candidateId,
      };
    } catch (err) {
      await admin.query("ROLLBACK").catch(() => undefined);
      throw err;
    }
  } finally {
    await admin.end();
  }
}

async function freshSeedPair() {
  return seedActors();
}

// ---------------------------------------------------------------------------
// helpers: tagging, waits
// ---------------------------------------------------------------------------

const beats = [];
let beatStart = Date.now();
function beat(name) {
  const now = Date.now();
  beats.push({ name, tMs: now - beatStart });
  beatStart = now;
}
async function settle(page, ms) {
  if (ms) await page.waitForTimeout(ms);
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// 3) main capture loop
// ---------------------------------------------------------------------------

async function main() {
  rmSync(join(RAW_DIR, "proof"), { recursive: true, force: true });
  mkdirSync(join(RAW_DIR, "proof"), { recursive: true });
  // 3.1 — create the actor set BEFORE the browser opens.
  const ACTORS = await seedActors();
  const FRESH = await freshSeedPair();
  beat("seed actors");

  // 3.2 — open browser, set viewport to 1280x720 per the brief.
  const browser = await chromium.launch({ headless: true });
  const videoDir = join(RAW_DIR, "videos");
  mkdirSync(videoDir, { recursive: true });
  const ctx = await browser.newContext({
    baseURL: BASE,
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } },
    locale: "bn-BD",
  });
  const page = await ctx.newPage();
  beat("browser open");

  // Persist ACTORS ids for the post-process step + caption manifest.
  writeFileSync(
    join(RAW_DIR, "actors.json"),
    JSON.stringify(
      {
        capture_at: new Date().toISOString(),
        base_url: BASE,
        actors: ACTORS,
        fresh_actor_for_reject: FRESH,
        beats: [],
      },
      null,
      2,
    ),
  );

  // ----- Title beat --------------------------------------------------------
  await page.goto("/");
  await page.evaluate(() => {
    document.title = "Fera — Phase 4 demo";
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(RAW_DIR, "proof", "01-home.png"), fullPage: false });
  beat("title screen");

  // ----- Parent manual form + submit --------------------------------------
  await page.goto("/intake/form");
  await page.locator('[id="review-child.name"]').fill("রাফি");
  await page.locator('[id="review-child.age_years"]').fill("8");
  await page.locator('[id="review-event.date"]').fill("2025-12-31");
  await page.locator('input[name="review-event.part"][value="afternoon"]').check();
  await page.locator('[id="review-event.place_text"]').fill("মাদ্রাসা");
  await page.locator('[id="review-event.district_code-search"]').fill("Cumilla");
  await page.locator('[id="review-event.district_code"]').selectOption("13");
  await page.locator('[id="review-reporter.phone"]').fill(SEED_PHONE_PARENT);
  await page.screenshot({ path: join(RAW_DIR, "proof", "02-form-filled.png"), fullPage: false });
  beat("form filled");

  const REVIEW_CHECKED_BN = "আমি যাচাই করেছি";
  const REVIEW_SUBMIT_BN = "যাচাই করে জমা দিন";
  const checkbox = page.getByRole("checkbox", { name: REVIEW_CHECKED_BN });
  await checkbox.check();
  await settle(page, 800);
  await page.screenshot({ path: join(RAW_DIR, "proof", "03-form-review-ticked.png"), fullPage: false });
  beat("review ticked");

  const submit = page.getByRole("button", { name: REVIEW_SUBMIT_BN });
  const createdResponse = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/cases");
  await submit.click();
  const created = await createdResponse;
  if (![200, 201].includes(created.status())) throw new Error("parent submit failed");
  const own = await created.json();
  await page.goto("/status");
  await page.getByText(own.ref_code).first().waitFor({ state: "visible" });
  await settle(page, 1200);
  await page.screenshot({ path: join(RAW_DIR, "proof", "04-status.png"), fullPage: false });
  beat("status page");

  // ----- Officer: sign in via the API (same-origin + extra Origin header) -
  // The page renders the sign-in form, but for the demo we sign in via the
  // API to keep the recording focused on the review UI, not on the form.
  // (Form behaviour is exercised separately in tests/e2e.)
  const { request: factory } = await import("@playwright/test");
  const signInCtx = await factory.newContext({
    baseURL: BASE,
    extraHTTPHeaders: { origin: BASE },
  });
  let signInRes;
  try {
    signInRes = await signInCtx.post("/api/auth/sign-in", {
      data: { username: ACTORS.verifiedUsername, password: ACTORS.staffPassword },
    });
  } finally {
    // The storage state holds the auth cookie; dispose the temp context.
  }
  if (signInRes.status() !== 200) throw new Error("synthetic officer sign-in failed");
  const officerState = await signInCtx.storageState();
  await page.context().addCookies(officerState.cookies);
  await signInCtx.dispose();
  // We are already API-logged-in.  Land on /officer/queue to show the
  // authenticated landing page.  /auth/sign-in does not exist in this
  // app (the route is /sign-in) and would 404; we use the valid route.
  await page.goto("/sign-in");
  await settle(page, 800);
  await page.screenshot({ path: join(RAW_DIR, "proof", "05-signin.png"), fullPage: false });
  beat("sign-in");

  // ----- Seeded officer review (Seeded synthetic candidate) ---------------
  await page.goto(`/officer/match/${ACTORS.candidateId}`);
  await settle(page, 1500);
  await page.screenshot({ path: join(RAW_DIR, "proof", "06-officer-review.png"), fullPage: false });
  beat("officer review seeded");

  const rejectBtn = page.getByRole("button", { name: /মিল নয়|reject/i });
  await page.getByLabel(/কারণ|reason/i).first().fill("[MOCK] Synthetic descriptions differ.");
  await page.screenshot({ path: join(RAW_DIR, "proof", "07-reject-dialog.png"), fullPage: false });
  beat("reject prompt");
  const rejectedWait = page.waitForResponse(r => r.request().method() === "POST" && r.url().includes("/decision"));
  await rejectBtn.click();
  const rejected = await rejectedWait;
  if (rejected.status() !== 200 || (await rejected.json()).candidate_status !== "rejected") throw new Error("synthetic rejection failed");

  await page.goto(`/officer/match/${FRESH.candidateId}`);
  await settle(page, 1200);
  await page.screenshot({ path: join(RAW_DIR, "proof", "08-fresh-confirm-open.png"), fullPage: false });
  beat("confirm open");
  await page.getByRole("button", { name: /মিল নিশ্চিত করুন|confirm/i }).click();
  const dialog = page.locator("dialog");
  await dialog.waitFor({ state: "visible" });
  const boxes = dialog.getByRole("checkbox");
  if (await boxes.count() !== 4) throw new Error("officer checklist must have exactly four items");
  for (let i = 0; i < 4; i++) await boxes.nth(i).check();
  await page.screenshot({ path: join(RAW_DIR, "proof", "09-confirm-dialog.png"), fullPage: false });
  beat("confirm dialog");
  const confirmedWait = page.waitForResponse(r => r.request().method() === "POST" && r.url().includes("/decision"));
  await dialog.getByRole("button", { name: /হ্যাঁ, নিশ্চিত করুন|yes, confirm/i }).click();
  const confirmed = await confirmedWait;
  if (confirmed.status() !== 200 || (await confirmed.json()).candidate_status !== "confirmed") throw new Error("synthetic confirmation failed");
  await settle(page, 800);
  await page.screenshot({ path: join(RAW_DIR, "proof", "10-confirmed.png"), fullPage: false });
  beat("confirmed");

  await page.goto(`/officer/case/${FRESH.missingCaseId}`);
  const closeForm = page.locator("form").filter({ has: page.locator('textarea[name="note"]') });
  await closeForm.locator('input[value="coordination_recorded"]').check();
  await closeForm.locator('textarea[name="note"]').fill("[MOCK] Synthetic coordination record closed for this demonstration.");
  await closeForm.locator('button[type="submit"]').click();
  const closedWait = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname.endsWith("/close"));
  await closeForm.locator('button[type="submit"]').click();
  const closed = await closedWait;
  if (closed.status() !== 200) throw new Error("synthetic coordination closure failed");
  await settle(page, 800);
  await page.screenshot({ path: join(RAW_DIR, "proof", "11-closed.png"), fullPage: false });
  beat("closed");
  await page.goto("/officer/map");
  await settle(page, 800);
  await page.screenshot({ path: join(RAW_DIR, "proof", "12-counts.png"), fullPage: false });
  beat("counts");
  await page.waitForTimeout(1200);

  // 3.3 — close browser, locate the recorded video.
  await page.close();
  const videoPath = await page.video()?.path();
  await ctx.close();
  await browser.close();

  writeFileSync(
    join(RAW_DIR, "capture-meta.json"),
    JSON.stringify(
      {
        capture_at: new Date().toISOString(),
        base_url: BASE,
        video_path: videoPath ?? null,
        beats,
        actors: {
          verified_username: ACTORS.verifiedUsername,
          verified_password: ACTORS.staffPassword,
          candidate_id: ACTORS.candidateId,
          fresh_candidate_id: FRESH.candidateId,
        },
      },
      null,
      2,
    ),
  );

  // Move the per-context video to a stable name.
  if (videoPath) {
    const fs = await import("node:fs/promises");
    const dest = join(RAW_DIR, "capture.webm");
    try {
      await fs.rename(videoPath, dest);
      console.log(JSON.stringify({ ok: true, video: dest, beats }));
    } catch (err) {
      console.log(JSON.stringify({ ok: false, video: videoPath, err: String(err), beats }));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
