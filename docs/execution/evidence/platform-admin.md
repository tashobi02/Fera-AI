# TASK-032 evidence — SCREEN-013 admin data tools, API-016/017/021

Owner: Mahim · Lane: `mahim-admin` (Claude Code), branch `phase2--mahim-admin` from `origin/phase2` at `51857d8` · Date: 2026-10-15 (Asia/Dhaka) · Code commit: `0bbb798` · Links: TASK-032, COMP-019, COMP-043, COMP-045, STORY-016, FR-025, FR-035, FR-037, BR-009, BR-010, BR-024, BR-025, TC-015, D3 SCREEN-013 (and line 481), D2A API-016/017/021, D2B §10.1/§13, D4 §14/§15 Admin row.

All accounts and data are synthetic. Nothing was deployed and no hosted database was touched. Redaction is pseudonymisation of retained metadata, not legal anonymisation, and the UI says so.

## Status against "Done when TC-015 passes"

**TC-015 passes locally** (`tests/db/admin.test.ts`, first test, PostgreSQL 16 + pgvector 0.8.1 in the local `fera-db` container, run as the restricted `fera_redactor` and `fera_app` roles):

- Set-up: 3 closed/referred reports — a closed missing report and its referred found report, plus a referred found report whose confirmed missing report is not closed yet (active linked evidence) — and 1 open report. The confirmed missing report (the other end of the active pair) is also present, because "active linked evidence" needs it; it is not terminal.
- Action: API-016 route handler (real route pipeline, real `redactCases` on the `fera_redactor` pool) with `{ all_eligible: true, confirmation: "বেনামী" }` as an admin.
- Observed: HTTP 200 `{ redacted: 2, skipped_not_eligible: 1, mode: "pseudonymisation", external_copies_removed: false }`. The eligible pair has `child_name`, `contact_phone`, `clothing` null and `anonymised_at` set; the active found report, its missing report and the open report keep their payload. Related payload cleared: candidate `reason_bn`/`reason_en` = `[REDACTED]`, `components` = `{}`, decision reason `[REDACTED]`, referral note null; the active pair's referral note and candidate reason are untouched. Counts by kind, status, district and outcome are identical before and after. Exactly 2 new audit rows, both `case.payload_redacted` by the admin with `{ mode, external_copies_removed }` (written by `redact_case()`). The eligible count is 2 before and 0 after; a repeat run gives `{ redacted: 0, skipped_not_eligible: 1 }`.

The browser step (an admin pressing ACT-027 on S-013) was exercised by hand in the built-app smoke below, not by Playwright (TASK-038).

## What was built

| Area | Files | Notes |
|---|---|---|
| API-016 route | `src/app/api/admin/admin-routes.ts` (`anonymiseRoute`), `src/app/api/admin/anonymise/route.ts` | `defineRoute` with `anonymiseRequestSchema` / `anonymiseResponseSchema` (strict). Calls the existing `redactCases` (no duplicated logic). `RedactionForbiddenError` → E-003 (the layer writes `access.denied`); `RedactionDbError` → E-021 after one `db.refusal` log line with the SQLSTATE only. Rate limit `admin.redaction` 5/min per principal, fails closed (OD-032-4). |
| API-017 route + service | `admin-routes.ts` (`verifyRoute`), `src/app/api/admin/users/[id]/verify/route.ts`, `src/server/admin/verify.ts` | `setOfficerVerified(principal, userId, body, ctx)`: E-003 unless the principal is an active admin; in one `withTransaction`: admin row re-read `FOR SHARE` (deactivated → E-003), target row `FOR UPDATE` (unknown or not an officer → E-004), `UPDATE users SET verified`, `appendAudit` `user.verification_changed` (actor admin, details `{ api: "API-017", verified, target_role: "officer" }`, request ID). Same value again writes nothing (OD-032-7). Rate limit `admin.verify` 30/min, fails open. |
| API-021 route + service | `admin-routes.ts` (`usersRoute`), `src/app/api/admin/users/route.ts`, `src/server/admin/users.ts` | Selects only `id, username, display_name, role, verified, is_active`; parsed with the strict `adminUsersResponseSchema`. Keyset pages by username with an HMAC-signed cursor (OD-032-3); a forged or tampered cursor is E-001. |
| Eligible summary | `src/server/admin/redact.ts` (`countEligibleCases`) | Same `ELIGIBLE_WHERE` fragment as the per-case pre-check (now shared, unchanged logic); count only, admin only, on the redactor pool, checks `current_user`. |
| Redactor pool | `src/server/admin/pool.ts` | Lazy pool from `FERA_REDACTOR_DATABASE_URL` (max 2), test seam `setRedactorPoolForTests`. |
| Barrel | `src/server/admin/index.ts` | What the routes and page import. |
| Audit action | `src/server/audit/actions.ts` | New `user.verification_changed`, `ACTION_ACTORS` = `["admin"]`. Redaction needs no new action: `redact_case()` writes `case.payload_redacted` per case in the same transaction (confirmed in TC-015 and `tests/db/redaction.test.ts`). |
| Limits / log | `src/app/api/_shared/limit.ts`, `log.ts` | `RATE_LIMITS.adminRedaction`, `adminVerify`; log event `page.data_unavailable`. |
| SCREEN-013 page | `src/app/(desk)/admin/page.tsx` | `requireRole(["admin"], "/admin")`. Cockpit desk surface. Header with dashed `সিনথেটিক` and `[MOCK]` chips. Reads only the eligible count and the AdminUserView page; each source fails on its own panel with an "unavailable" message and a `page.data_unavailable` log line (error class/code only). |
| COMP-043 redaction panel | `src/app/(desk)/admin/redaction-form.tsx` | Eligible count (Bangla numerals in bn); three honest facts (what is kept — pseudonymisation, not full anonymisation; copies outside Fera not removed; found evidence kept until its missing report closes). Typed confirmation input labelled "নিশ্চিত করতে লিখুন: বেনামী", hint linked by `aria-describedby`; a mismatch sets `aria-invalid`, links the message and refocuses. One soft-danger submit with the exact ACT-027 label, `aria-disabled` while busy plus a synchronous guard. Progress text and success in a polite status region; failures (catalogue copy) in an always-mounted alert region. D3 empty state when nothing is eligible; after success the server count refreshes and the success message stays. |
| COMP-043 verify panel | `src/app/(desk)/admin/verify-officers-form.tsx` | `[MOCK]` in the heading, on every toggle and in a dashed simulation note. Status = icon + text + colour (verified: success; not verified, inactive, not applicable: neutral; no red). Toggle only on officer rows, 44 px, described by the account name, label text unchanged by ARIA. Outcome announced politely ("{name}: যাচাইকৃত [MOCK]"). "Show more" pages through API-021. |
| Import slot | `page.tsx` | Dashed "পরিকল্পিত" panel: "সিনথেটিক ইমপোর্ট — এখনো তৈরি হয়নি" (ACT-026 is Should, TASK-048). No import UI or API. |
| Pure helpers | `src/lib/admin-tools.ts` | Typed-confirmation guard (NFC + trim, exact word), redaction reducer, failure classification (envelope ID, else status, else E-021) and catalogue copy, success/skipped copy, user status mapping, the three fetch calls (15 s timeout, strict response parse). |
| Strings | `src/locales/index.ts` | 40 keys, each in bn and en. Exact D3: `redactAction`, `redactEmpty`, `redactSuccess`. |
| Icons | `src/app/components/icons.tsx` | Lucide circle-check, circle-dashed, circle-slash, minus, eraser, shield-check, shield-off, inbox, chevron-down. |
| DB test runner | `scripts/db/test-db.mjs` | Registers `tests/db/admin.test.ts`. |

Design: `impeccable` shape → build in the established Cockpit world, Operate mode. No human answered the shape questions (sub-agent run); assumptions are under Open decisions. `impeccable detect --json` on the three UI files returned `[]`. No impeccable finish review was run.

## Verification (2026-10-15, local)

| Command | Exit | Result |
|---|---|---|
| `npm run lint` | 0 | clean |
| `npm run typecheck` | 0 | clean |
| `npm test` | 0 | 1021 passed, 128 skipped (the DB suites); 44 files passed, 5 skipped |
| `npm run test:db` | 0 | 128/128: platform 48, redaction 18, auth 13, case 38, **admin 11** |
| `npm run build` | 0 | new routes `/admin`, `/api/admin/anonymise`, `/api/admin/users`, `/api/admin/users/[id]/verify`; `.next` removed afterwards |

New tests (98):
- `tests/admin/admin-tools.test.ts` (32): the contract accepts the guard's word; exact word, spaces and NFD accepted; 8 near-misses refused; reducer (mismatch, clear on correct input, busy guard, success, failure, stray outcome); exact D3 strings; Bangla numerals in the success text; skipped text only when > 0; no legal-anonymisation wording; `[MOCK]` in outcomes; catalogue error copy (never response text); classification; status mapping; the three requests (method, body, path, strict parse, leaky body refused); `adminUserViewSchema` refuses hash/session/case fields.
- `tests/admin/routes.test.ts` (26): API-016 strict 200; five E-001 bodies before the service; E-003 for staff/officer/unverified officer with one `access.denied` call; E-002 signed out/inactive; forbidden → E-003; DB error → E-021 with SQLSTATE-only log; extra key → E-021; 6th call → E-007 with Retry-After; cross-site → E-003. API-017 strict 200 with the request ID; E-001 bad ID/body; E-003 non-admins; service E-004 enveloped and audited without a case FK; non-contract response → E-021. API-021 strict page and query parsing; E-001 limit/cursor; E-003/E-002; hash/session/extra field → E-021.
- `tests/admin/service.test.ts` (15): scripted pg fakes. Non-admins refused before any query; statement order BEGIN → admin FOR SHARE → target FOR UPDATE → UPDATE → audit INSERT → COMMIT and the audit values; no-op writes nothing; staff/admin targets E-004 with rollback; unknown/malformed target E-004; deactivated admin E-003; an audit failure rolls the update back; listing selects no hash; cursor round trip; forged/tampered cursor E-001; invalid rows fail closed; eligible count refuses non-admins and non-redactor pools.
- `tests/ui/admin-screen.test.ts` (14): server render. Labelled, described input with `border-control`; one 44 px soft-danger submit with the ACT-027 label, no `disabled`; Bangla/Latin numerals; the three honest facts; D3 empty state; unavailable state; live regions mounted; `[MOCK]` in heading, note and both officer toggles only; toggles described by the name; icon + text + colour with no danger class; no IDs, hashes or passwords as text; empty/unavailable/paged list; the page calls `requireRole(["admin"], "/admin")`, renders both panels and the planned import slot; one failing source keeps the other panel.
- `tests/db/admin.test.ts` (11): TC-015 (above); non-admin through the route → E-003 + one `access.denied` row, nothing redacted; wrong word → E-001; verify then un-verify through the route and service with exactly two audit rows (actor admin, no case/candidate FK, request ID stored); no-op writes no row; an un-verified officer with a stale "verified" session gets E-004 from `decideCandidate` (BR-024); non-admins refused at route and service; deactivated admin E-003; staff, admin and unknown targets → E-004 with an `access.denied` row `{ error_id: "E-004", api: "API-017" }` and no change; API-021 pages through every account with exactly the six fields and no hash; non-admin listing refused.

### Built-app smoke (`next start`, headless Chrome over CDP)

Throwaway local database `fera_admin_smoke` (`db:reset`, `seed:users` with explicit passwords, then 2 closed pairs, 1 confirmed-not-closed pair and 1 open report from the test fixtures); random `AUTH_SECRET`/`PARENT_COOKIE_KEY` in the process environment; `DATABASE_URL` and `FERA_REDACTOR_DATABASE_URL` pointing at the local `fera_app` / `fera_redactor` roles. **`fera_admin_smoke` was dropped afterwards**; only `fera` remains. Screenshots are in the session scratchpad (`…/scratchpad/shots/admin-*.png`), not committed.

- 1280 px bn/en, 360 px bn: horizontal overflow 0. Tab title "অ্যাডমিন ডেটা টুল · ফেরা" / "Admin data tools · Fera".
- 320 px with a 200 % root font: first pass overflowed (en 112 px: "pseudonymisation" and the toggle's `[MOCK]` chip; bn 34 px). Fixed in the same round (wrapping facts and toggles); after the fix 0 px in both languages.
- Typed "বেনাম" then submit: `aria-invalid="true"`, `aria-describedby` = hint + error, focus on the input.
- Typed "বেনামী" then submit: status "৪টি রিপোর্টের পরিচয় তথ্য অপসারণ করা হয়েছে" + "১টি রিপোর্ট বাদ পড়েছে…"; the count refreshed to ০ and the D3 empty state appeared under the kept success message. DB: 4 reports `anonymised_at` set, 1 referred report kept, 4 `case.payload_redacted` rows.
- Verify on `officer.pending`: announced "[MOCK] অযাচাইকৃত কর্মকর্তা: যাচাইকৃত [MOCK]"; DB `verified = t`, 1 `user.verification_changed` row.
- Only the Cockpit theme was captured: desk screens default to Cockpit and no theme toggle exists yet.

## Not done

- No fera-review (safeguarding, security, database, react, a11y, bengali reviewers) and no impeccable finish review: needed before the PR.
- Playwright journey for S-013 (TASK-038). No screen-reader or forced-colours walk; only server-render tests and the screenshots above.
- ACT-026 import (API-015, TASK-048, Masnun): only the planned slot.
- No admin navigation or sign-out in the shell (no desk shell yet); `/admin` is reached directly or through sign-in's role home.
- `.env.example` was not read or updated (`.env*` rule). Whether it lists `FERA_REDACTOR_DATABASE_URL` is **UNKNOWN**; Vercel and the finale laptop need it, or S-013 shows "count unavailable" and API-016 answers E-021.
- The admin view of API-013 (audit timeline) was not checked for the new `user.verification_changed` rows; its details keys are all in the admin allowlist.
- After a partial batch failure (OD-062-4) the UI shows only the generic E-021 and does not refresh the count.

## Open decisions

- **OD-032-1 Verification audit has no target.** The strict audit details schema (contracts, protected) has no user-ID key and `audit_log` has no target column, so a `user.verification_changed` row records the admin, `verified`, `target_role`, `api` and the request ID, but not which officer. A contracts change (for example `target_user_id`) needs an all-owner review.
- **OD-032-2 No batch-level redaction audit.** Each redacted case is audited by `redact_case()`; a run that redacts nothing leaves only the request log line. `fera_redactor` cannot insert audit rows, and a second (fera_app) write would not be in the same transaction.
- **OD-032-3 Cursor key.** The contract says the server verifies cursor signatures but names no key. API-021 uses an HMAC subkey of `AUTH_SECRET` (`cursor.admin_users`), so rotating `AUTH_SECRET` invalidates open cursors (E-001, reload).
- **OD-032-4 Rate limits not in the spec pack.** API-016 5/min per admin, fails closed (destructive, batch-wide); API-017 30/min, fails open; API-021 only the pre-auth flood guard. In-memory store per instance (existing limiter caveat).
- **OD-032-5 Redactor URL name.** `FERA_REDACTOR_DATABASE_URL` follows the earlier note in `src/server/db/pool.ts`; D2B §15.1 does not list it.
- **OD-032-6 Non-officer target → E-004.** D2A lists E-001/E-003/E-004 for API-017 without a mapping; E-004 avoids confirming which accounts exist or their roles.
- **OD-032-7 No-op verification writes no audit row** (no state change). Inactive officers can still be toggled; the flag has no effect while inactive.
- **OD-032-8 Typed word in English mode.** The contract literal is "বেনামী", so English-mode admins must type or paste Bangla; the English label says "Type বেনামী to confirm".
- **OD-032-9 First user page rendered on the server** through the same service and contract projection as API-021 (D3 line 481); "Show more" calls API-021.
- **OD-032-10 Import slot.** D3 lists an "import text area" component and D4 §14 "three panels"; a dashed planned panel is shown instead of an input.
- **OD-032-11 Strings without a D3/D4 source**, for Bengali review: title, intro, eligible label, the three facts, confirm label/hint/mismatch, progress, skipped, unavailable messages, verify title, simulation note, roles, statuses, toggle labels and outcomes, list states, import slot.
- **OD-032-12 Status tones.** "Not verified" is neutral, not warning: an unverified officer is a valid seeded state (staff permissions, BR-024), not a fault.
- Shape assumptions without a human answer: Operate mode; one column ≤ 52 rem; redaction panel first (Must, primary ACT-027); always "all eligible" (no per-case picker, which would need case IDs on an admin screen).
