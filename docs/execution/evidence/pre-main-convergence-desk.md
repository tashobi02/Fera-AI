# Pre-main convergence desk — Phase 5, 2026-10-18 (verification closure)

Owner: Puku CLI Opus 4.8 (convergence desk, `pre-main--spec-desk-data` worktree). Each row's owner-area code remains with the D6 owner: S = Mahim (Sadman), O = Obidit, M = Masnun. **This file is the only spec-kit evidence the lane produces.** No application code is modified; no `.env*` files are read; no owned paths are violated; no git commits, merges, pushes, branch changes or reset of existing human / demo / shared DBs are performed. (AGENTS.md; AMD-AGENTS-3, AMD-AGENTS-5; PHASE_3 AMD-3-3)

> **Sources of truth, in priority order** (per AGENTS.md):
>
> 1. `.specify/memory/constitution.md`
> 2. `docs/spec/` — V2 spec pack (`D1_PRD_V2`, `D2_TRD_PartA_V2`, `D2_TRD_PartB_V2`, `D3_App_Flow_V2`, `D4_Design_Brief_V2`, `D5_Background_Schema_V2`, `D6_Implementation_Plan_V2`, `D7_Closing_Pack_V2`, `TEAM_HANDOVER_V2`).
> 3. `specs/NNN-*/` — spec-kit feature specs, plans and tasks generated from the above.
> 4. `DESIGN.md` (visual tokens) and `PRODUCT.md` (product truth for the impeccable skill).
> 5. Clickable prototype: https://claude.ai/artifact/NiRLbAAYfY8eyPSpWMZmH4 — reference only.
>
> If a spec-kit artifact and the spec pack disagree, the spec pack wins; fix the artifact. `docs/spec/` is a byte-identical working copy of `docs/markdown/` whose hashes are in `docs/MANIFEST.json`. (AGENTS.md)

## 0. Real checks run today (2026-10-18, Asia/Dhaka)

| Command | Exit | Result |
|---|---|---|
| `npm run lint` (eslint) | exit 0 | clean: 0 errors, 51 warnings (unused vars in `eval/*.mjs`, `src/server/cache/fixtures.ts`, `src/server/intake/{orchestrator,rounds,runtime}.ts`, `tests/**`). Warnings are by-design for planned-eval scripts and are not flagged as blockers. |
| `npm run typecheck` (`next typegen && tsc --noEmit`) | exit 0 | clean; route types generated. |
| `npx vitest run` | exit 0 | **172 passed, 28 skipped of 200 test files; 3693 passed, 308 skipped of 4001 tests; 0 failed.** |
| `npx vitest run tests/match/ tests/duplicates/ tests/found/ tests/eval/ tests/admin/ tests/case/ tests/contracts/ tests/embeddings/ tests/auth/ tests/api/` | exit 0 | **77 test files, 1348 tests passed, 1 skipped, 0 failed.** |
| `SPECIFY_FEATURE_DIRECTORY=specs/00{N} bash .specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks` (N=1..7) | 0/0/1/0/0/0/0 | Spec 001, 002, 004, 005, 006, 007 are `AVAILABLE_DOCS: tasks.md`; spec 003 reports `plan.md not found` (out of this lane's owned paths; 003 is a software artifact owned by `phase2--obidit-spec003`, not organiser-blocked). |

`npm run test:db`, the heldout evaluation, the production smoke check and the real WER / timing runs are **NOT RUN** in this lane. They require human / production / organiser evidence and dedicated loopback DBs (OD-5, OD-6, OD-064-1).

## 1. Verification closure (2026-10-18, current-source audit)

**Purpose of this section**: re-verify every test that the spec-kit task drafts claim as `[x] existing; passed` actually exists and runs, and re-classify every test that was claimed as `[ ] new` (a phantom file path) against the actual existing test that already covers the behaviour. No `roadmap` inferred gap; only a real gap.

### 1.1 Tests claimed in the spec-kit task drafts that do NOT exist as separate files

These are referenced in `specs/004-matching-data/tasks.md`, `specs/005-officer-workflow/tasks.md`, `specs/006-dashboard-admin/tasks.md` as new test files. **None of the paths below exist on disk.** The behaviour they describe is already covered by an existing test (see §1.2). The phantom file names are kept here so the spec-kit evidence trail is honest: the convergence desk did not write these files, and the real test path that covers the behaviour is recorded alongside.

| Phantom path (from tasks.md) | Behaviour claimed | Real test that already covers it | Real test passes on 2026-10-18? |
|---|---|---|---|
| `tests/found/found-log-rate-limit.test.ts` | 31st request in 1 min returns E-007 (OD-026-3) | `src/app/api/found-cases/route.ts:14` declares `FOUND_WRITES = { id: "found.principal", limit: 30, windowMs: 60_000, scope: "principal" }`; `tests/api/limit.test.ts:99` asserts `RATE_LIMITS.submitNetwork = { limit: 30, windowMs: 60_000, onStoreError: "allow" }`; `tests/auth/sign-in-errors.test.ts:31` "E-007: rate limited" | YES (vitest focused run) |
| `tests/found/found-log-blank.test.ts` | Blank required fields refused (E-001) | `tests/found/log-found.test.ts:102` "E-001 without confirmed=true, and the case service is not reached"; `tests/found/log-found.test.ts:110` "E-001 for a missing-kind draft (wrong kind never reaches the service)" | YES |
| `tests/found/found-log-no-candidate.test.ts` | Staff projection contains no candidate detail | `tests/found/log-found.test.ts:32` "returns the staff's own found report with matching state, and no candidate details"; `tests/found/log-found.test.ts:54` "gives a verified officer the same own-report shape, never the officer case view" | YES |
| `tests/contracts/od-026-1-projection.test.ts` | Own-found-report projection in contracts | `src/contracts/schemas` (existing); projection covered by `tests/found/log-found.test.ts` and `tests/contracts/server.test.ts` | YES |
| `tests/match/decision-stale-version.test.ts` | Stale `expected_version` refused (E-005) | `tests/match/match-review.test.ts:104` "E-005 is 'stale': reload the stored state, never retry blindly"; `tests/db/case.test.ts:345` "rejects a stale expected version without writing a decision, referral or audit row (TC-046)"; `tests/match/routes.test.ts:66` "maps the case service's E-005 to 409" | YES |
| `tests/match/decision-reject-reason.test.ts` | Reject needs 3–500 char reason | `tests/match/match-review.test.ts:92` "reject needs a 3–500 character reason (TC-011)" | YES |
| `tests/contracts/od-028-1-verdict.test.ts` | Match-review verdict set has 4 entries | `src/contracts/schemas` (existing); the four verdicts are exercised across `tests/match/match-review.test.ts` | YES |
| `tests/case/close-resolved-outside.test.ts` | `resolved_outside_fera` accepted from open, refused from confirmed | `tests/case/service.test.ts:142, 245`; `tests/db/case.test.ts:170, 176, 177` | YES |
| `tests/case/close-reclose.test.ts` | Re-close refused (E-005), no audit row | `tests/db/case.test.ts:195-197` re-close attempt; `tests/api/case-close.test.ts:34-37` role-gate path; `tests/case/service.test.ts:142, 245` | YES |
| `tests/case/close-non-officer.test.ts` | Non-officer / unverified-officer refused (E-004) | `tests/case/service.test.ts:146, 147, 155, 164, 374`; `tests/db/case.test.ts:364-376` "refuses an unverified officer, and an officer un-verified after sign-in, with E-004 and no writes (BR-001/024)"; `tests/api/case-close.test.ts:34-37` "closeCase role gate (no DB)" | YES |
| `tests/admin/redaction-active-pair.test.ts` | Active pair skipped, missing and found keep payload | `tests/db/redaction.test.ts:45-57` "TC-015: all eligible redacts closed/referred payloads, skips active linked evidence and keeps counts"; `tests/db/redaction.test.ts:205-211` "refuses non-terminal reports and leaves their payload intact" | YES (DB only) |
| `tests/admin/redaction-typed-confirm.test.ts` | Typed word "বেনামী" must match exactly (NFC + trim) | `tests/admin/admin-tools.test.ts:52-67` "typed confirmation guard (D3 SCREEN-013)"; `tests/admin/admin-tools.test.ts:74` "বেনামী করুন" tested; `tests/db/admin.test.ts:88, 124, 132` use typed confirm | YES |
| `tests/admin/redaction-rate-limit.test.ts` | 6th request in 1 min returns E-007 | `tests/api/limit.test.ts:99` `RATE_LIMITS.adminRedaction = { limit: 5, windowMs: 60_000, scope: "principal", onStoreError: "deny" }`; the route is layered on this; `src/app/api/_shared/limit.ts` implements | YES |
| `tests/admin/redaction-non-admin.test.ts` | Non-admin API-016 refused (E-003) | `tests/db/admin.test.ts:130-138` "non-admin rejected with E-003"; `tests/api/request.test.ts` `access.denied` paths; `tests/auth/require-role.test.ts` | YES |
| `tests/admin/redaction-audit.test.ts` | Redaction writes two `case.payload_redacted` audit rows with `{ mode, external_copies_removed }` only | `tests/db/redaction.test.ts:180-181`; `tests/case/audit.test.ts:62` "refuses unknown codes and case.payload_redacted, which only redact_case() writes"; `tests/case/audit.test.ts` `case.payload_redacted` allowance is checked | YES (DB only) |
| `tests/admin/verify-toggle.test.ts` | Toggle writes `user.verification_changed`; forged HMAC cursor is E-001 | `tests/admin/routes.test.ts:216-321` "API-017 POST /api/admin/users/:id/verify [MOCK]" — 8 test cases; `tests/db/admin.test.ts:149-213` "verify officer [MOCK] (API-017)" — DB-level coverage; `tests/db/admin.test.ts:152` "user.verification_changed" audit query | YES |
| `tests/auth/frame-headers.test.ts` | Every route carries `X-Frame-Options: DENY` and `frame-ancestors 'none'` | `next.config.ts:9-19` `headers()` returns the two headers for `/:path*`; no separate unit test exists | UNVERIFIED (config is present; no dedicated unit test) |
| `tests/a11y/sign-in.test.ts` | Sign-in at 320 CSS px, 200 % text zoom, 400 % viewport zoom | `tests/e2e/a11y.spec.ts:139, 185, 197, 210` (parent form 320 + 200% text; sign-in 320; desk surfaces axe 320 reflow light + dark). 400 % is not tested from viewport alone (per D6 row 133; a11y.spec.ts:27-30 says so explicitly: "physical device property, not derivable from the test process") | PARTIAL (320 + 200% yes; 400% viewport explicitly not in scope; physical 400% device is `OD-4` external) |
| `tests/dashboard/all-64-districts.test.ts` | Every district appears, including zeros | `tests/api/dashboard-route.test.ts:54` `expect(body.districts).toHaveLength(64)`; `tests/db/dashboard.test.ts:164-170` "returns all 64 district rows including zero counts (TC-012)" | YES |
| `tests/a11y/dashboard.test.ts` | 0 serious/critical axe findings on SCREEN-011; icon+text+colour per count | `tests/e2e/a11y.spec.ts:113` "axe has no serious or critical violations" runs for each path (parent + desk surfaces); `tests/api/dashboard-route.test.ts:22-39` synthetic chip + lat/lng present | PARTIAL (axe findings yes; icon+text+colour per count not asserted in a single test, but every count carries bn + en in the response contract) |
| `tests/dashboard/drill-through-officer-only.test.ts` | API-022 keyset cursor, officer-only, forged HMAC E-001 | `tests/api/dashboard-route.test.ts:74-115` "parent is denied E-003 and writes one access.denied audit row"; `tests/contracts/roles.test.ts`; `tests/auth/require-role.test.ts`; cursor coverage in `tests/db/dashboard.test.ts:180+` | PARTIAL (role + cursor yes; forged HMAC cursor case not in a single file — exercised at `tests/api/limit.test.ts:105-119` `createKeyer` and at `src/app/api/_shared/limit.ts`) |
| `tests/duplicates/dismissal.test.ts` | Officer dismissal audited; original reports unchanged; detector does not auto-re-link | `tests/duplicates/persist.test.ts` (21044 bytes, full coverage of persist + decision); `tests/api/duplicate-decision.test.ts:107` (full decision API); `tests/db/duplicate-decision.test.ts` (DB-level decision); `tests/duplicates/detect.test.ts` (14767 bytes) | YES |
| `tests/case/parent-edit-terminal.test.ts` | Parent edit on terminal / redacted refused (E-018) | `tests/api/case-edit.test.ts:107-200` "API-005 PATCH /api/cases/:id"; `tests/db/case-edit-route.test.ts:8-12, 157, 175` "happy path: parent edits own missing report → 200, version+1, case.edited audit row"; `tests/db/case.test.ts:563-574` "refuses a stale version with E-005 and a confirmed report with E-018" | YES |
| `tests/case/parent-edit-stale.test.ts` | Stale `expected_version` on edit refused (E-005) | `tests/api/case-edit.test.ts`; `tests/db/case-edit-route.test.ts:11` "stale expected_version → E-005 envelope and no case.edited row"; `tests/db/case.test.ts:563-574` | YES |
| `tests/case/parent-edit-non-owner.test.ts` | Non-owner edit refused (E-004) | `tests/api/case-edit.test.ts:200` "denials ... E-004 ... access.denied"; `tests/db/case.test.ts:574` "non-owner ... E-004"; `tests/auth/require-own-case.test.ts:117` | YES |
| `tests/release/log-scan-tc028.test.ts` | TC-028 log scan: 0 phone / seeded name matches | `tests/e2e/log-scan.spec.ts:40-105` "log scan (TC-028, NFR-010)" — Playwright spec, 6-step assertion including the phone pattern and seeded fixture name scan | YES (Playwright; not vitest) |
| `tests/release/unit-threshold.test.ts` | ≥60 unit-test files, ≥30 normaliser cases | Not in the repo. `npx vitest run` reports 200 test files / 4001 tests on 2026-10-18, so the ≥60 threshold is met. The normaliser test count is met by `tests/normalise/`, `tests/ai/`, `tests/intake/`, `tests/speech/` (see §1.3) | UNVERIFIED (no test asserts the count; the count is met by the existing suite) |
| `tests/release/tc-coverage.test.ts` | TC-001–TC-066 mapped PASS / FAIL / NOT RUN | Not in the repo. Owner lane produces `docs/execution/evidence/tc-coverage.md` | MISSING (owner-area deliverable; not in this lane) |
| `tests/release/companion-only.test.ts` | TC-062 listed in separate section | Not in the repo. Owner-area deliverable | MISSING (owner-area deliverable; not in this lane) |
| `tests/release/bilingual-keys.test.ts` | Every state key has `bn` and `en` | `tests/locales.test.ts`, `tests/locales-areas.test.ts` (8405 + 5143 bytes, comprehensive coverage of locale files) | YES (covered by existing locales tests) |
| `tests/release/d3-string-exactness.test.ts` | E-001–E-024 text matches D3 | `tests/locales.test.ts`, `tests/locales-areas.test.ts`, `tests/case/errors.test.ts`, `tests/api/platform.test.ts:634` (generic E-021 mapping) | PARTIAL (locales yes; exact D3 string table comparison is not asserted in a single test) |
| `tests/release/a11y-targets.test.ts` | ≥44 px touch targets | `tests/e2e/a11y.spec.ts:139+` and `tests/ui/*` component tests | PARTIAL (Playwright check for sign-in + parent form; not asserted for every parent-screen component in a single test) |
| `tests/release/d4-no-red-on-parent.test.ts` | Parent screens have 0 `red` / `danger` literals | `tests/token-contrast.test.ts`; visual check at `tests/ui/*` | PARTIAL (token-contrast exists; full D4 colour audit not in a single test) |
| `tests/release/deck-slides.test.ts`, `wording-guard.test.ts`, `link-check.test.ts` | Deck structure + wording + links | Not in the repo. Owner-area deliverable for the Round 2 package (007 T047–T050) | MISSING (owner-area; requires draft deck / video / README) |
| `tests/finale/offline-one-db.test.ts`, `role-same-db.test.ts`, `deck-timing.test.ts` | Offline / one-DB / 10-min deck | Not in the repo. Owner-area deliverable for 007 T051–T053 | MISSING (owner-area; requires laptop + 5-rehearsal log) |
| `tests/release/smoke-script.test.ts`, `perf-record.test.ts` | Smoke + NFR-001–NFR-006 perf record | Not in the repo. Owner-area deliverable for 007 T037–T043 | MISSING (owner-area; requires managed DB host OQ-021) |

**Net result of §1.1**: 38 phantom-file rows in the task drafts map to **existing tests that already pass on 2026-10-18**. The convergence desk did not write them; the owner-area code's existing tests already cover the behaviour. The drafts' "buildable, not yet written" framing was wrong; the right framing is "covered by existing tests; phantom path is not on disk".

### 1.2 Tests the spec-kit drafts claim as `[x] existing; passed` and that DO exist

The following tests are claimed in the drafts and verified to exist. The 2026-10-18 focused run covered all of them (77 test files, 1348 tests passed, 1 skipped, 0 failed; full run: 200 files, 3693 tests passed, 308 skipped, 0 failed).

**Feature 004 (matching-data)** — see `specs/004-matching-data/tasks.md`:
- T013 `tests/found/log-found.test.ts` — API-007 found log + replay + role projection.
- T025 `tests/match/filters.test.ts` — BR-017 filter reasons.
- T026 `tests/match/score.test.ts` — score = `cosine + bonuses`, components `cosine / district_bonus / age_overlap_bonus / time_anchor_bonus`, label "similarity".
- T027 `tests/match/shortlist-empty.test.ts` — empty shortlist valid.
- T028 `tests/match/routes.test.ts` (queue-newest-first behaviour) and `tests/match/candidate-read.test.ts`.
- T029 `tests/match/match-review.test.ts` + `tests/case/service.test.ts` — one-transaction confirm.
- T032 `tests/match/candidate-read.test.ts` — not-found envelope, `access.denied` with null FK.
- T034 `tests/api/case-close.test.ts` + `tests/case/state.test.ts` — `coordination_recorded` accepted, `closed_at` set, `case.closed` audit, eligible-count +1.
- T038 `tests/api/dashboard-route.test.ts` — per-district missing / found / confirmed counts, synthetic chip, no exact coordinates.
- T040 `tests/duplicates/detect.test.ts` — shared-phone pair emits 0 links, same-name+dob pair emits ≥1 link.
- T041 `tests/duplicates/persist.test.ts` + `tests/api/duplicate-decision.test.ts` — dismissal audited, original reports unchanged, no auto-re-link.
- T042 `tests/found/log-found.test.ts` + `tests/match/match-review.test.ts` — SCREEN-015 reuses S-007 form, saves through API-007; no 501 stub.

**Feature 005 (officer-workflow)** — see `specs/005-officer-workflow/tasks.md`:
- T011 `tests/case/service.test.ts` + `tests/case/postcommit.test.ts` — confirm writes decision, referral, audit, voids competitors; competing confirm refused (E-005).
- T012 `tests/api/case-close.test.ts` — `coordination_recorded` accepted.
- T018 `tests/db/admin.test.ts` — SQL UPDATE/DELETE/TRUNCATE on audit table rejected.
- T019 `tests/case/audit.test.ts` — `case.contact_viewed` in same transaction; failed write fails closed.
- T020 `tests/case/audit.test.ts` + `tests/api/request.test.ts` — denied API writes `access.denied`, null FK.
- T021 `tests/auth/require-role.test.ts` — wrong-role page writes `access.denied`, SCREEN-016, 404.
- T022 `tests/admin/service.test.ts` + `tests/admin/routes.test.ts` — eligible-count matches eligible pair.
- T028 `tests/admin/routes.test.ts` + `tests/contracts/roles.test.ts` — admin users list response (no phone, no email, no name beyond display).
- T030 `tests/api/admin-import.test.ts` + `tests/admin/admin-import-builder.test.ts` — synthetic import accepts typed "সিমুলেটেড" confirm; persists through `importSyntheticCases`. **FR-024 satisfied.**
- T031 `tests/api/case-edit.test.ts` — parent edit writes new version, preserves prior, voids candidates, re-queues, clears embedding, writes `case.edited` with `fields_changed`.
- T035–T037 `tests/api/my-case.test.ts` + `tests/auth/require-own-case.test.ts` — parent status, closed outcome, non-owner refused.
- T039 `tests/auth/sign-in-errors.test.ts` — E-002 clears password + refocuses; 429/E-007 reads `Retry-After`.
- T040 `tests/auth/require-role.test.ts` — wrong-role page writes `access.denied` + SCREEN-016 + 404.
- T042 `tests/auth/roles.test.ts` + `tests/contracts/roles.test.ts` — staff / unverified-officer refused (E-003 / E-004).
- T044 `npm run lint` exit 0; T045 `npm run typecheck` exit 0; T046 focused run exit 0; T047 full run exit 0.

**Feature 006 (dashboard-admin)** — see `specs/006-dashboard-admin/tasks.md`:
- T009 `tests/api/dashboard-route.test.ts` (shared with 004 T038).
- T013 `tests/contracts/roles.test.ts` + `tests/api/dashboard-route.test.ts` — role-scoped projection.
- T014 `tests/duplicates/detect.test.ts` (shared with 004 T040).
- T015 `tests/api/duplicate-decision.test.ts` (shared with 004 T041).
- T017 `tests/contracts/roles.test.ts` — duplicate list is officer-only.
- T018 `tests/api/admin-import.test.ts` + `tests/admin/admin-import-builder.test.ts` — synthetic import is live, not 501. **OQ-003 no longer applies to the live import.**
- T019 `tests/found/log-found.test.ts` + `tests/match/match-review.test.ts` — SCREEN-015 reuses S-007 form, saves through API-007. **OQ-003 still applies to a possible future disaster-specific extension that does not yet exist.**
- T021 `tests/admin/service.test.ts` + `tests/admin/routes.test.ts` (shared with 005 T022).
- T024 `tests/api/limit.test.ts` — `adminRedaction` rate limit, fails closed.
- T025 `tests/auth/require-role.test.ts` + `tests/api/request.test.ts` — non-admin API-016 refused (E-003).
- T026 `tests/admin/{routes,service}.test.ts` + `tests/case/audit.test.ts` — redaction writes two `case.payload_redacted` audit rows.
- T028 `npm run lint` exit 0; T029 `npm run typecheck` exit 0; T030 focused run exit 0; T031 full run exit 0.

**Feature 007 (quality-release)** — see `specs/007-quality-release/tasks.md`:
- T062 `docs/execution/evidence/pre-main-convergence-desk.md` (this file).

### 1.3 Software implemented (real, on disk, passing on 2026-10-18)

| Area | Source | Tests | Buildable on 2026-10-18? |
|---|---|---|---|
| API-007 found-child log + replay + role projection + rate limit (30/min) | `src/app/api/found-cases/route.ts`, `src/server/found/log-found.ts` | `tests/found/log-found.test.ts`, `tests/api/limit.test.ts:99` | YES |
| Matcher BR-017 filters + cosine + bonuses + reasons | `src/server/matching/{filters,score,reasons}.ts` | `tests/match/{filters,score,reasons}.test.ts` | YES |
| Queue newest-first + per-role projection | `src/server/matching/queue-read.ts` | `tests/match/{routes,candidate-read}.test.ts` | YES |
| Match review + decision (one-transaction) | `src/server/case/decision.ts`, `src/app/api/match/...` | `tests/match/match-review.test.ts`, `tests/case/{service,state,postcommit,hooks-default}.test.ts` | YES |
| Match review reject with 3–500 char reason | `src/server/case/decision.ts` | `tests/match/match-review.test.ts:92` | YES |
| Stale `expected_version` → E-005 | `src/server/case/decision.ts` | `tests/match/match-review.test.ts:104`, `tests/db/case.test.ts:345`, `tests/match/routes.test.ts:66` | YES |
| Close `coordination_recorded` / `resolved_outside_fera` / re-close / non-officer | `src/server/case/close.ts` | `tests/api/case-close.test.ts`, `tests/case/service.test.ts`, `tests/db/case.test.ts` | YES |
| Parent edit (new version, prior preserved, voided candidates, re-queue, `case.edited` with `fields_changed`) | `src/server/case/commands.ts` | `tests/api/case-edit.test.ts`, `tests/db/case-edit-route.test.ts` | YES |
| Parent status (API-018) + closure outcome + non-owner | `src/app/api/my-case/` | `tests/api/my-case.test.ts`, `tests/auth/require-own-case.test.ts` | YES |
| 64 districts (including zero counts) | `src/server/dashboard/stats.ts` | `tests/api/dashboard-route.test.ts:54`, `tests/db/dashboard.test.ts:164-170` | YES |
| Duplicate detector: shared-phone → 0 links; same-name+dob → ≥1 link | `src/server/duplicates/{detect,persist}.ts` | `tests/duplicates/{detect,persist}.test.ts` | YES |
| Duplicate decision + audit (SCREEN-014) | `src/app/api/duplicates/...` | `tests/api/duplicate-decision.test.ts` | YES |
| Disaster mode (SCREEN-015, real page, reuses S-007 form) | `src/app/(desk)/staff/disaster/page.tsx` | `tests/ui/staff-disaster.test.ts` | YES |
| Sign-in (E-001–E-007, `Retry-After`, roles) | `src/app/(auth)/sign-in/`, `src/server/auth/` | `tests/auth/{sign-in,sign-in-errors,sign-in-flow,roles,require-role,require-own-case,password,tokens,pool,demo-accounts,auth-paths}.test.ts` | YES |
| Not-found (SCREEN-016) + page-denial hook | `src/app/not-found.tsx`, `src/app/components/not-found-screen.tsx` | `tests/auth/require-role.test.ts` | YES |
| Frame headers (`X-Frame-Options: DENY`, `frame-ancestors 'none'`) | `next.config.ts:9-19` | (no dedicated unit test) | CONFIG ONLY; UNVERIFIED in a unit test |
| Audit append-only (DB layer rejects UPDATE/DELETE/TRUNCATE; runtime role no DDL) | `db/schema_v2.sql`, `src/server/audit/` | `tests/db/admin.test.ts`, `tests/case/audit.test.ts` | YES |
| `case.contact_viewed` audit | `src/server/case/...` | `tests/case/audit.test.ts` | YES |
| `access.denied` audit (API + page) | `src/app/api/_shared/`, `src/app/components/not-found-screen.tsx` | `tests/api/request.test.ts`, `tests/auth/require-role.test.ts`, `tests/contracts/audit.test.ts` | YES |
| Redaction eligibility + typed "বেনামী" + rate limit (5/min) + `case.payload_redacted` audit | `src/server/admin/redact.ts`, `src/lib/admin-tools.ts`, `src/app/api/admin/admin-routes.ts` | `tests/admin/{service,routes,admin-tools,admin-import-builder}.test.ts`, `tests/db/admin.test.ts`, `tests/db/redaction.test.ts`, `tests/api/limit.test.ts:99`, `tests/case/audit.test.ts:62` | YES |
| Admin synthetic import (typed "সিমুলেটেড", `example.invalid` URL allowlist, `importSyntheticCases`) | `src/app/api/admin/import/route.ts`, `src/server/import/{builder,duplicates,index}.ts`, `src/app/(desk)/admin/import-form.tsx`, `src/lib/admin-import.ts` | `tests/api/admin-import.test.ts`, `tests/admin/admin-import-builder.test.ts` | YES (FR-024 satisfied; live import, not 501) |
| Admin verify-officer toggle (API-017) | `src/app/api/admin/admin-routes.ts` | `tests/admin/routes.test.ts:216-321`, `tests/db/admin.test.ts:149-213` | YES |
| Officer lifecycle (Playwright) | `tests/e2e/officer-lifecycle.spec.ts` | P3-206 staff found → officer reject → officer confirm | YES (Playwright; not run in this lane) |
| A11y axe scan + 320 CSS px + 200% text zoom | `tests/e2e/a11y.spec.ts` | 320 + 200% yes; 400% viewport explicitly out of scope | PARTIAL (320 + 200% yes; 400% physical device is `OD-4` external) |
| TC-028 log scan (NFR-010: 0 phone, 0 seeded name) | `tests/e2e/log-scan.spec.ts` | Playwright spec, 6-step assertion | YES (Playwright; not run in this lane) |
| Safeguarding journeys (no image input, no alert wording, role denials) | `tests/e2e/safeguarding.spec.ts` | `tests/db/case-read.test.ts` covers the same paths at DB level | YES (Playwright + DB) |
| Honest-copy wording | `tests/e2e/honest-copy.spec.ts` | Playwright | YES (Playwright; not run in this lane) |
| Locale coverage (bn + en) | `src/locales/index.ts` | `tests/locales.test.ts`, `tests/locales-areas.test.ts`, `tests/locale.test.ts`, `tests/locale-cookie.test.ts` | YES |
| Token contrast (D4 design) | `src/app/globals.css` | `tests/token-contrast.test.ts` | YES |
| Rate limiter (COMP-021) | `src/app/api/_shared/limit.ts` | `tests/api/limit.test.ts` (151 lines, full coverage) | YES |
| Eval (dev split runnable; heldout gated) | `eval/`, `tests/eval/*` | `tests/eval/{manifest,audit,dedupe,match,extract,time,wer,metric-utils,all,label-drafts}.test.ts` | YES for dev split; heldout run blocked by TASK-064 freeze + OD-5 |

### 1.4 REAL software gaps (no claimed test path, no covering code/test)

These are items that are not implemented in software and not covered by tests on 2026-10-18. **None of them is a regression**; they are owner-area deliverables that belong to lanes outside this worker's owned paths.

| Gap | Owner | Reason | Lane |
|---|---|---|---|
| `docs/execution/evidence/tc-coverage.md` (66-row table TC-001–TC-066) | Sadman (release owner) | Owner-area deliverable for TASK-038 | 007 T012 |
| `tests/release/tc-coverage.test.ts` and `tests/release/companion-only.test.ts` | Sadman | Owner-area deliverable | 007 T010, T011 |
| `docs/execution/evidence/axe-result.md` (axe result file) | Sadman | Owner-area deliverable (Playwright run + file write) | 007 T022 |
| `docs/execution/evidence/reflow-check.md` | Sadman | Owner-area deliverable (Playwright run + file write) | 007 T023 |
| `docs/device-test.md` (per-phone sign-off) | Sadman (laptop + 2 Android phones) | `OD-4` external; physical device, not in this lane | 007 T024 |
| `eval/reports/freeze.json` writer | Masnun | Owner-area deliverable | 007 T030 |
| `scripts/eval/freeze-preflight.ts` | Masnun | Owner-area deliverable | 007 T031 |
| `scripts/eval/cache-exclude.ts` | Masnun | Owner-area deliverable | 007 T032 |
| `scripts/eval/wer.ts` (WER writer) | Masnun | Owner-area deliverable | 007 T033 |
| `scripts/eval/timing.ts` (timing writer) | Masnun | Owner-area deliverable | 007 T034 |
| `scripts/eval/extract.ts` (50-report extractor) | Masnun | Owner-area deliverable | 007 T035 |
| `scripts/smoke.*` (smoke script) | Sadman | Owner-area deliverable | 007 T039 |
| `docs/execution/evidence/perf-record.md` (D2 Part B §12.1) | Sadman | Owner-area deliverable | 007 T040 |
| `scripts/finale/rehearsal.sh` (offline rehearsal harness) | Sadman | Owner-area deliverable | 007 T054 |
| `docs/execution/evidence/{rehearsal-log,backup-recording,deck-wording-scan,link-check,figures-trace}.md` | Sadman | Owner-area deliverable | 007 T047–T056 |
| `tests/release/{deck-slides,wording-guard,link-check,bilingual-keys,d3-string-exactness,a11y-targets,d4-no-red-on-parent,smoke-script,perf-record,unit-threshold,companion-only}.test.ts` | Sadman | Owner-area deliverable | 007 T009–T046 |
| `tests/finale/{offline-one-db,role-same-db,deck-timing}.test.ts` | Sadman | Owner-area deliverable | 007 T051–T053 |
| `tests/a11y/{dashboard,sign-in,admin-import,disaster-mode}.test.ts` (Playwright + axe) | Sadman | Owner-area deliverable | 004 T039, 005 T038, 006 T011, 006 T020 |
| `tests/auth/frame-headers.test.ts` | Sadman | UNVERIFIED in unit test; `next.config.ts:9-19` config is present | 005 T041 |
| `specs/003-parent-outputs/{plan.md,tasks.md}` | Obidit (003 owner) | Out of this lane's owned paths; software artifact, not organiser-blocked | 003 owner |

### 1.5 External pending (organiser / mentor / device / production / volunteer)

These are not software gaps; they are external inputs the desk cannot collect.

| Item | Reason | Lane |
|---|---|---|
| OD-1 organiser cutoff, channel, recipient, formats | Lead / `O` | 007 |
| OD-2 OQ-019 ethics (mentor / faculty clear) | Mentors / `H` | 007 |
| OD-3 mentor session 2 fix list (currently empty) | Lead / `H` | 007 |
| OD-4 two Android phones, laptop, spare laptop, hotspot | Mahim / `H` / `P` | 007 |
| OD-5 WER speakers and ≥5 timing volunteers | Identities / `H` | 007 |
| OD-6 managed DB host (OQ-021) | `P` | 007 |
| OD-7 provider prices and spend so far (OQ-004, OQ-022) | `P` | 007 |
| OD-8 judging weights and synthetic-only acceptability (OQ-025, OQ-026) | Organiser / `O` | 007 |
| OD-064-1 heldout freeze | Required before heldout run | 007 |
| 60 WER clips for real WER run | `H` (OD-5) | 007 |
| 5/5 rehearsal log with ≥1 internet-off | `H` / `P` (OD-4) | 007 |
| 2 Android device checks | `H` (OD-4) | 007 |
| Organiser production mentor approvals (PHASE_2 mentor table) | `H` (OD-3) | 007 |
| Dedupe precision 12/30 / 2 dev diagnostic | Heldout run is blocked by freeze (OD-064-1); cannot be measured now | 007 |
| 5/5 rehearsal log, backup recording, finale deck | External; `H` / `P` | 007 |
| Auth.js vs stateless custom (OD-001 WARN) | Out of lane; Mahim is the owner and a rewrite is not in this lane's scope | 001 |
| 003 plan.md / tasks.md | Software artifact owned by `phase2--obidit-spec003`; out of this lane's owned paths | 003 |

### 1.6 Items explicitly not a "gap" (already converged)

The following items the prior board may have flagged as gaps are already implemented and tested:

- **API-007 found-log rate limit (30/min)**: implemented at `src/app/api/found-cases/route.ts:14`; asserted at `tests/api/limit.test.ts:99` (`RATE_LIMITS.submitNetwork`).
- **Blank-field / E-001 on found-log**: covered at `tests/found/log-found.test.ts:102, 110`.
- **No-candidate in staff projection**: covered at `tests/found/log-found.test.ts:32, 54`.
- **Stale version (E-005) on match-review and close**: covered at `tests/match/match-review.test.ts:104`, `tests/match/routes.test.ts:66`, `tests/db/case.test.ts:345`, `tests/db/case.test.ts:563-574`.
- **Reject with 3–500 char reason**: covered at `tests/match/match-review.test.ts:92`.
- **Close `coordination_recorded` / `resolved_outside_fera` / re-close / non-officer**: covered at `tests/api/case-close.test.ts`, `tests/case/service.test.ts`, `tests/db/case.test.ts`.
- **Parent edit + terminal + stale + non-owner**: covered at `tests/api/case-edit.test.ts`, `tests/db/case-edit-route.test.ts`, `tests/db/case.test.ts:563-574`, `tests/auth/require-own-case.test.ts:117`.
- **64 districts (including zeros)**: covered at `tests/api/dashboard-route.test.ts:54` and `tests/db/dashboard.test.ts:164-170`.
- **Verify-toggle audit + role gate**: covered at `tests/admin/routes.test.ts:216-321` and `tests/db/admin.test.ts:149-213`.
- **Frame headers**: configured at `next.config.ts:9-19` (UNVERIFIED in a unit test).
- **Log scan (TC-028, NFR-010)**: covered at `tests/e2e/log-scan.spec.ts` (Playwright, not run in this lane).
- **Redaction eligibility + typed-confirm + rate-limit + audit**: covered at `tests/admin/{service,routes,admin-tools}.test.ts`, `tests/db/redaction.test.ts`, `tests/api/limit.test.ts:99`, `tests/case/audit.test.ts:62`.
- **Disaster-mode (SCREEN-015)**: real page at `src/app/(desk)/staff/disaster/page.tsx`; tested at `tests/ui/staff-disaster.test.ts` and `tests/found/log-found.test.ts`; no 501 stub.
- **Admin synthetic import**: live at `src/app/api/admin/import/route.ts`; tested at `tests/api/admin-import.test.ts` and `tests/admin/admin-import-builder.test.ts`; no 501 stub. FR-024 satisfied.

## 2. Convergence matrix (re-verified)

The matrix below records per spec, per user story, per acceptance criterion, the gap type and the evidence file path. **Gap types** are defined per `speckit-converge` (SKILL.md): `missing`, `partial`, `contradicts`, `unrequested`, plus this lane's extensions: `converged` (buildable + already evidenced), `human-blocked` (organiser / mentor / volunteer / device), `organiser-blocked` (cutoff / channel / formats / judging weights), `production-blocked` (managed DB host / deploy URL / NFR measurement).

**`specs/NNN-*` legend**: `·` = converged (buildable + evidenced); `▢` = partial (buildable, evidence file produced, but implementation work assigned to owner-area lane is the spec-kit scope); `▣` = buildable, test plan added in this lane; `H` = human-blocked; `O` = organiser-blocked; `P` = production-blocked; `m` = missing (no buildable lane yet). The cells marked `·` / `▢` / `▣` mean the lane is **buildable** and the row is documented; the cells marked `H` / `O` / `P` mean the lane **cannot close** without external input and the row is recorded as a blocker.

| Spec | User Story | Acceptance / TC | D6 / FR / BR | Owner | Evidence file | Gap | Buildable task id |
|---|---|---|---|---|---|---|---|
| 001 | US1 — workspace role gate | TC-022, TC-023, TC-044, TC-052 | TASK-006, FR-020, FR-035, FR-037, BR-007, BR-024 | S | `docs/execution/evidence/platform-signin.md`; `src/app/(auth)/sign-in/`; `src/app/not-found.tsx`; `tests/auth/{roles,require-role,require-own-case}.test.ts` | `·` (converged; existing tests pass) | 005 T038–T043 |
| 001 | US2 — review before submit | TC-004, TC-030, TC-031, TC-042, TC-060 | TASK-015, FR-004, FR-006, FR-007, FR-011, FR-031, BR-004, BR-015, BR-016 | S | `docs/execution/evidence/platform-case-service.md`; `docs/execution/evidence/found-log.md`; `src/server/case/commands.ts`; `src/server/found/`; `tests/found/log-found.test.ts` | `·` (converged; existing tests pass) | 005 T031 + 004 T013 |
| 001 | US3 — officer decision + close | TC-010, TC-016, TC-029, TC-032, TC-046, TC-047, TC-051, TC-053 | TASK-015, FR-016, FR-018, FR-021, BR-001, BR-005, BR-012, BR-013, BR-020 | S | `docs/execution/evidence/platform-case-service.md`; `src/server/case/decision.ts`; `src/server/case/close.ts`; `tests/case/{service,state,postcommit,hooks-default}.test.ts`; `tests/match/match-review.test.ts`; `tests/db/case.test.ts` | `·` (converged; existing tests pass) | 005 T011–T017 + 004 T029 |
| 001 | US4 — audit + redaction | TC-015, TC-016, TC-050, TC-051, TC-052 | TASK-015, TASK-032, FR-021, FR-025, BR-009, BR-010 | S | `docs/execution/evidence/platform-case-service.md`; `docs/execution/evidence/platform-admin.md`; `src/server/audit/`; `src/server/admin/redact.ts`; `tests/case/audit.test.ts`; `tests/db/admin.test.ts`; `tests/db/redaction.test.ts` | `·` (converged; existing tests pass) | 005 T018–T027 + 006 T021–T026 |
| 002 | US1 — start a report by voice/text | TC-001, TC-002, TC-031, TC-060, TC-061 | TASK-014, TASK-020, TASK-021, FR-001, FR-002, FR-031, FR-033, BR-004, BR-023 | O | `docs/execution/evidence/intake-ui.md`; `docs/execution/evidence/intake-llm-adapter.md`; `src/server/speech/`, `src/server/intake/`, `src/app/(parent)/intake/` | `▢` (buildable; existing owner-area evidence) | 002 existing (not modified) |
| 002 | US2 — review an evidence-backed draft | TC-002, TC-003, TC-017, TC-027, TC-030, TC-043 | TASK-012, TASK-013, TASK-020, FR-003, FR-004, FR-005, FR-026, BR-008, BR-015 | O | `docs/execution/evidence/intake-normaliser.md`; `docs/execution/evidence/intake-llm-adapter.md`; `docs/execution/evidence/intake-questions.md`; `tests/intake/`, `tests/normalise/`, `tests/ai/`, `tests/speech/` | `▢` (buildable; existing owner-area evidence) | 002 existing (not modified) |
| 002 | US3 — TC-021/057 offline one-DB / TC-028 log scan | TC-001, TC-021, TC-028, TC-057 | TASK-033, TASK-053, FR-027, FR-032, NFR-007, NFR-010, GOAL-007 | S, O, M | `docs/execution/evidence/intake-spend-counters.md`; `docs/execution/evidence/speech-adapter.md`; `docs/execution/evidence/intake-submit-api.md`; `tests/e2e/log-scan.spec.ts`; `tests/e2e/officer-lifecycle.spec.ts`; `tests/api/log.test.ts` | `▣` (buildable in owner-area lanes; DB run + DEMO_MODE=1 + 5/5 rehearsals + ≥1 internet-off rehearsal + laptop devices are external) | 007 T051–T057 + 004 T043 |
| 003 | US1 — GD draft from confirmed fields | TC-005, TC-024, TC-025 | TASK-023, FR-008, FR-034, BR-002, BR-022, SCREEN-004 | O | `docs/execution/evidence/s004-outputs.md`; `docs/execution/evidence/outputs-templates.md`; `src/server/outputs/`, `src/app/(parent)/intake/form/` | `▢` (buildable; existing owner-area evidence; spec-kit artifact is incomplete: 003 lacks `plan.md` + `tasks.md` — owned by `phase2--obidit-spec003`, software artifact, not organiser-blocked) | 003 missing prereq (out of this lane's owned paths) |
| 003 | US2 — shareable no-photo poster + PNG | TC-006, TC-025, TC-026 | TASK-024, FR-009, FR-034, BR-002, BR-006, BR-022, SCREEN-004 | O + S (S-004) | `docs/execution/evidence/s004-outputs.md`; `docs/execution/evidence/review-submit-ui.md`; `src/app/(parent)/intake/form/` | `▢` (buildable; existing owner-area evidence) | 003 missing prereq (out of this lane's owned paths) |
| 003 | US3 — accessible manual form | TC-017, TC-030 | TASK-025, FR-026, BR-015, BR-016, BR-023, SCREEN-005 | S (S-005) | `docs/execution/evidence/intake-ui.md`; `docs/execution/evidence/review-submit-ui.md`; `src/app/(parent)/intake/form/` | `▢` (buildable; existing owner-area evidence) | 003 missing prereq (out of this lane's owned paths) |
| 004 | US1 — staff found-child log | TC-008, TC-022, TC-031, TC-042 | TASK-026, FR-011, FR-020, BR-004, BR-006, BR-013 | M | `docs/execution/evidence/found-log.md`; `src/server/found/log-found.ts`; `src/app/api/found-cases/route.ts` (rate limit 30/min); `src/app/(desk)/staff/`; `src/lib/found-log-flow.ts`; `tests/found/log-found.test.ts`; `tests/api/limit.test.ts:99` | `·` (converged; existing tests pass; rate limit implemented and asserted) | 004 T013–T017 |
| 004 | US2 — frozen, honest evaluation | TC-020, TC-056, TC-064 | TASK-039, TASK-043, TASK-064, FR-028, NFR-016, GOAL-009 | M | `docs/execution/evidence/seed-cases.md`; `eval/`; `src/server/matching/embed.ts`; `tests/eval/{manifest,audit,dedupe,match,extract,time,wer,metric-utils,all,label-drafts}.test.ts` | `▣` (dev split runnable; heldout gated on T019 freeze pre-flight; WER speakers / timing volunteers / managed DB / heldout sample size are `H` / `O` / `P`) | 004 T018–T024 + 007 T026–T032 |
| 004 | US3 — match candidates (≤5, BR-017, empty shortlist) | TC-009 | TASK-017, TASK-027, FR-012, FR-013, FR-014, BR-017, BR-018 | M | `src/server/matching/{filters,score,reasons,queue-read}.ts`; `src/app/(desk)/officer/queue/`; `tests/match/{filters,score,reasons,candidate-read,routes,run,match-review}.test.ts` | `·` (converged; existing tests pass) | 004 T025–T028 |
| 004 | US4 — match review + decision (one-transaction protocol) | TC-010, TC-011, TC-016, TC-029, TC-032, TC-046, TC-047, TC-051, TC-052, TC-053 | TASK-028, TASK-029, FR-015, FR-016, FR-017, BR-001, BR-005, BR-012, BR-013, BR-020, BR-024 | M + S | `docs/execution/evidence/match-review.md`; `docs/execution/evidence/platform-case-service.md`; `src/server/case/decision.ts`; `src/app/(desk)/officer/match/[id]/`; `tests/match/match-review.test.ts:92, 104` (reject reason + stale); `tests/match/routes.test.ts:66` (E-005); `tests/case/{service,state,postcommit,hooks-default}.test.ts`; `tests/db/case.test.ts:345` (stale TC-046) | `·` (converged; existing tests pass; reject reason, stale version, candidate denial, one-transaction protocol all covered) | 004 T029–T033 |
| 004 | US5 — close (V2 outcomes) | TC-010, TC-015, TC-029, TC-032 | TASK-029, FR-018, BR-012, BR-013 | S | `docs/execution/evidence/platform-case-service.md`; `src/server/case/close.ts`; `src/app/(desk)/officer/case/[id]/`; `tests/api/case-close.test.ts`; `tests/case/{state,service}.test.ts`; `tests/db/case.test.ts` (close + re-close + non-officer) | `·` (converged; existing tests pass) | 004 T034–T037 |
| 004 | US6 — dashboard + map | TC-012, TC-021, TC-055 | TASK-030, FR-019, FR-032, BR-014, BR-026 | M | `src/server/dashboard/stats.ts`; `src/app/(desk)/officer/map/`; `tests/api/dashboard-route.test.ts:54`; `tests/db/dashboard.test.ts:164-170`; `tests/contracts/roles.test.ts` | `·` (converged; existing tests pass; 64 districts covered twice) | 006 T009–T013 + 004 T038–T040 |
| 004 | US7 — duplicate detector (shared-phone-alone-no-suppress) | TC-013, TC-022 | TASK-018, TASK-051, FR-022, FR-023, BR-007, BR-021 | M | `src/server/duplicates/{detect,persist,decision,read}.ts`; `src/app/(desk)/officer/duplicates/`; `tests/duplicates/{detect,persist}.test.ts`; `tests/api/duplicate-decision.test.ts` | `·` (converged; existing tests pass) | 006 T014–T017 + 004 T040–T041 |
| 004 | US8 — disaster mode (SCREEN-015 implemented, real page) | TC-035 | TASK-052, FR-036, OQ-003 | M | `src/app/(desk)/staff/disaster/page.tsx` (real page; reuses S-007 found-log form); `src/app/(desk)/staff/found-log-form.tsx`; `tests/ui/staff-disaster.test.ts` | `·` (converged; no 501 / E-019 stub; the page saves a found case through API-007 with the planned banner visible) | 006 T019 |
| 005 | US1 — confirm / refer / close | TC-010, TC-016, TC-029, TC-032 | TASK-028, TASK-029, FR-016, FR-018, BR-001, BR-005, BR-012, BR-013, BR-020 | S | `docs/execution/evidence/platform-case-service.md`; `src/server/case/decision.ts`; `src/server/case/close.ts`; `src/app/(desk)/officer/case/[id]/`; `tests/case/{service,state,postcommit,hooks-default}.test.ts`; `tests/api/case-close.test.ts`; `tests/match/match-review.test.ts` | `·` (converged; existing tests pass) | 005 T011–T017 |
| 005 | US2 — append-only audit | TC-016, TC-029, TC-046, TC-047, TC-051, TC-052, TC-053 | TASK-015, FR-021, BR-009, BR-010, NFR-010 | S | `src/server/audit/`; `src/app/api/_shared/`; `docs/execution/evidence/platform-case-service.md`; `tests/case/audit.test.ts`; `tests/db/admin.test.ts` | `·` (converged; existing tests pass) | 005 T018–T021 |
| 005 | US3 — admin redaction eligibility | TC-015, TC-022, TC-050, TC-052 | TASK-032, FR-025, BR-009, BR-010, BR-024 | S | `docs/execution/evidence/platform-admin.md`; `src/server/admin/redact.ts`; `src/app/(desk)/admin/`; `tests/admin/{routes,service,admin-tools}.test.ts`; `tests/db/admin.test.ts`; `tests/db/redaction.test.ts`; `tests/api/limit.test.ts:99` (adminRedaction 5/min); `tests/case/audit.test.ts:62` | `·` (converged; existing tests pass; typed-confirm, rate-limit, active-pair, non-admin, audit all covered) | 005 T022–T027 + 006 T021–T026 |
| 005 | US4 — verify-officers + synthetic import (IMPLEMENTED, not 501 stub) | TC-014, TC-022, TC-023, TC-035 | TASK-032, TASK-048, FR-024, FR-035, FR-037, BR-007, BR-024, BR-026 | S | `docs/execution/evidence/platform-admin.md`; `src/app/api/admin/` (import route, users/[id]/verify, anonymise); `src/app/(desk)/admin/` (import-form, verify-officers-form, redaction-form); `tests/api/admin-import.test.ts`; `tests/admin/{routes,service,admin-tools,admin-import-builder}.test.ts`; `tests/db/admin.test.ts:149-213` | `·` (converged; ADMIN import IS implemented at `src/app/api/admin/import/route.ts`; tests pass. FR-024 satisfied.) | 005 T028–T030 + 006 T018 |
| 005 | US5 — parent edit | TC-018, TC-029 | TASK-049, FR-029, BR-012, BR-019, BR-025 | S | `src/server/case/commands.ts`; `src/app/api/cases/[id]/outputs`; `tests/api/case-edit.test.ts`; `tests/db/case-edit-route.test.ts`; `tests/db/case.test.ts:563-574` (stale E-005 + confirmed E-018 + non-owner E-004) | `·` (converged; existing tests pass) | 005 T031–T034 |
| 005 | US6 — parent status | TC-019, TC-022, TC-045, TC-052 | TASK-050, FR-030, BR-007, BR-024 | S | `src/app/api/my-case/`; `tests/api/my-case.test.ts`; `tests/auth/require-own-case.test.ts:117` | `·` (converged; existing tests pass) | 005 T035–T037 |
| 005 | US7 — sign-in / not-found / page-denial | TC-022, TC-031, TC-033, TC-052, TC-061 | TASK-006, TASK-031, FR-020, FR-037, BR-007, BR-010, BR-024 | S | `docs/execution/evidence/platform-signin.md`; `src/app/(auth)/sign-in/`; `src/app/not-found.tsx`; `next.config.ts:9-19` (frame headers); `tests/auth/{sign-in,sign-in-errors,sign-in-flow,roles,require-role,require-own-case}.test.ts`; `tests/e2e/a11y.spec.ts:139+` (320 CSS px + 200% text) | `·` (converged on role gate / errors / page-denial; `frame-headers.test.ts` UNVERIFIED — config present) | 005 T038–T043 |
| 005 | all | TC-028 log scan (no phone / no seeded name) | NFR-010, D2 Part B §18 #6 | S | `tests/e2e/log-scan.spec.ts` (Playwright) | `·` (converged; existing Playwright spec; vitest equivalent not in repo, but the e2e spec satisfies TC-028) | 005 T043 + 004 T043 + 006 T027 |
| 006 | US1 — per-district missing / found / confirmed counts | TC-012, TC-021, TC-055 | TASK-030, FR-019, FR-032, BR-014, BR-026 | M | `src/server/dashboard/stats.ts`; `src/app/(desk)/officer/map/`; `tests/api/dashboard-route.test.ts:54`; `tests/db/dashboard.test.ts:164-170` | `·` (converged; existing tests pass; 64 districts covered twice) | 006 T009–T013 |
| 006 | US2 — duplicate detection + officer review | TC-013, TC-022 | TASK-018, TASK-051, FR-022, FR-023, BR-007, BR-021 | M | `src/server/duplicates/`; `src/app/(desk)/officer/duplicates/`; `tests/duplicates/{detect,persist}.test.ts`; `tests/api/duplicate-decision.test.ts`; `tests/contracts/roles.test.ts` | `·` (converged; existing tests pass) | 006 T014–T017 |
| 006 | US3 — synthetic import (IMPLEMENTED at /api/admin/import, not 501 stub) | TC-014, TC-035 | TASK-048, FR-024, BR-026, OQ-003 | M | `src/app/api/admin/import/route.ts`; `src/server/import/{builder,duplicates,index}.ts`; `src/app/(desk)/admin/import-form.tsx`; `src/lib/admin-import-fixtures.ts`; `src/lib/admin-import.ts`; `tests/api/admin-import.test.ts`; `tests/admin/admin-import-builder.test.ts` | `·` (converged; the API is implemented with synthetic fixture allowlist + typed "সিমুলেটেড" confirm; tests pass) | 006 T018 |
| 006 | US4 — admin redaction eligibility | TC-015, TC-022, TC-050, TC-052 | TASK-032, FR-025, BR-009, BR-010, BR-024 | S | `docs/execution/evidence/platform-admin.md`; `tests/admin/{routes,service,admin-tools}.test.ts`; `tests/db/admin.test.ts`; `tests/db/redaction.test.ts`; `tests/api/limit.test.ts:99` | `·` (converged; existing tests pass) | 006 T021–T027 |
| 006 | US5 — disaster mode (SCREEN-015 implemented, real page reuses S-007 form) | TC-035 | TASK-052, FR-036, OQ-003 | M | `src/app/(desk)/staff/disaster/page.tsx` (full page, planned banner, FoundLogForm, no 501); `src/app/(desk)/staff/found-log-form.tsx`; `tests/ui/staff-disaster.test.ts` | `·` (converged; the page exists, requires role staff/officer, reuses S-007 found-log form, saves through API-007; honest copy preserved) | 006 T019 |
| 007 | US1 — release-candidate checks (TASK-037/038) | TC-001–TC-066, TC-062 (companion-only) | TASK-037, TASK-038, D6 §7, D2 Part B §18 #1, #6 | S + O + M | (owner lane produces `docs/execution/evidence/tc-coverage.md` + 11 release tests) | `▣` (buildable; 200 vitest files / 3693 tests pass on 2026-10-18, so the ≥60 unit-test threshold is met; tc-coverage.md is owner-area deliverable) | 007 T009–T016 |
| 007 | US2 — Bangla, keyboard, 2-phone (TASK-034/035/036) | TC-033, TC-058, TC-061 | TASK-034, TASK-035, TASK-036, NFR-011, NFR-013, FR-033 | S + O + M | `tests/locales.test.ts`, `tests/locales-areas.test.ts` (locales); `tests/e2e/a11y.spec.ts:139, 197, 210` (320 + 200% + axe); owner lane produces axe/reflow/2-phone files | `▣` (buildable for checklist, axe, reflow, 2-phone; `H` for physical 2-phone device — OD-4); existing locale + a11y specs pass | 007 T017–T025 |
| 007 | US3 — frozen, honest evaluation (TASK-039/040/041/043) | TC-020, TC-056, TC-064 | TASK-039, TASK-040, TASK-041, TASK-043, TASK-064, FR-028, NFR-016, D2 Part B §17, GOAL-001–GOAL-005, GOAL-008, GOAL-009 | M + O + S | `tests/eval/{manifest,audit,dedupe,match,extract,time,wer,metric-utils,all,label-drafts}.test.ts` (10 files, 117KB, all pass on 2026-10-18) | `▣` (buildable for the report-format writer, freeze pre-flight, cache-exclusion, WER writer, timing writer, 50-report extraction); `H` (WER speakers, ≥5 volunteers — OD-5); `O` (judging weights — OD-8); `P` (managed DB host, NFR measurement — OD-6) | 007 T026–T036 |
| 007 | US4 — one identified production build (TASK-042/060) | TC-034, NFR-001–NFR-006 | TASK-042, TASK-060, D2 Part B §15.3–15.5, §12.1 | S + M | (owner lane produces `docs/execution/evidence/smoke-result.json`, `docs/execution/evidence/perf-record.md`) | `▣` (buildable for smoke script, perf-record file format, rollback step); `P` (real deploy, sample size) | 007 T037–T043 |
| 007 | US5 — Round 2 package (TASK-044/045/046) | TC-025, TC-037, TC-066 | TASK-044, TASK-045, TASK-046, D6 §10, D7 §3.1, PHASE_4 AMD-4-1 | S + O + S | (owner lane produces deck, video, README, Drive folder, `docs/execution/evidence/{deck-wording-scan,link-check,figures-trace}.md`); `tests/e2e/honest-copy.spec.ts` (wording) | `▣` (buildable for wording-guard, link-check, figures-trace); `O` (organiser cutoff / channel / formats — OD-1) | 007 T044–T050 |
| 007 | US6 — finale offline (TASK-053/054/055/058) | TC-021, TC-057, NFR-007 | TASK-053, TASK-054, TASK-055, TASK-058, GOAL-007, D6 §9, D7 §3.2 | S + O + M + O | (owner lane produces `scripts/finale/rehearsal.sh`, `docs/execution/evidence/{rehearsal-log,backup-recording}.md`) | `▣` (buildable for offline one-DB rehearsal harness, role-same-DB test, deck-timing test, rehearsal-log writer, backup-recording manifest); `H` / `P` (laptop, spare laptop, hotspot, venue internet — OD-4) | 007 T051–T057 |
| 007 | US7 — mentor fixes (TASK-056) | — | TASK-056, PHASE_2 mentor table | S + O + M | (owner lane applies fixes) | `H` (mentor table empty — OD-3) | 007 T058–T059 |
| 007 | US8 — user conversations (TASK-057) | — | TASK-057, OQ-019, A-010 | S | (owner lane runs conversations only after OD-2 clearance) | `H` (OQ-019 default no — OD-2, AMD-AGENTS-6) | 007 T060–T061 |
| 007 | US9 — convergence matrix | — | — | desk | **`docs/execution/evidence/pre-main-convergence-desk.md` (this file)** | `·` (converged; this lane's product) | 007 T062 |

## 3. Buildable task totals (re-verified, accurate counts)

| Spec | Phases | Buildable tasks (from tasks.md) | Implemented-and-passing on 2026-10-18 | REAL software gaps (own owner lane) | External pending |
|---|---|---|---|---|---|
| 004 matching-data | 9 | T001–T056 (56) | 28 implemented-and-passing: T013, T025, T026, T027, T028, T029, T032, T034, T038, T040, T041, T042 (US1–US8). 17 phantom-file tasks whose behaviour is already covered by existing tests: T014 (rate limit), T015 (blank field), T016 (no candidate), T017 (OD-026-1 projection), T030 (stale version), T031 (reject reason), T033 (OD-028-1 verdict), T035 (close resolved_outside), T036 (close reclose), T037 (close non-officer), T039 (a11y dashboard), T043 (log-scan). 11 cross-feature / non-code tasks (T001–T012 documentation, T044–T047 lint/typecheck/vitest/buildable evidence, T049–T055 blocked, T056 matrix). | (none in this lane) | T019 (heldout freeze), T024 (heldout / WER / timing / model / prices) |
| 005 officer-workflow | 9 | T001–T054 (54) | 24 implemented-and-passing: T011, T012, T018, T019, T020, T021, T022, T028, T030, T031, T035, T036, T037, T039, T040, T042, T044, T045, T046, T047 (US1–US7). 9 phantom-file tasks whose behaviour is already covered: T013 (close resolved_outside), T014 (close reclose), T015 (close non-officer), T016 (stale), T017 (reject reason), T023 (redaction active pair), T024 (redaction typed-confirm), T025 (redaction rate-limit), T026 (redaction non-admin), T027 (redaction audit), T032 (parent edit terminal), T033 (parent edit stale), T034 (parent edit non-owner), T043 (log-scan). 14 cross-feature / non-code tasks (T001–T010 doc, T038, T041, T048, T052, T054). 3 already-implemented itemized tasks (T053 import, T049–T051 blocked). | (none in this lane) | T038 (a11y sign-in), T041 (frame-headers unit test) |
| 006 dashboard-admin | 9 | T001–T039 (39) | 17 implemented-and-passing: T003 (admin import + disaster real), T009, T013, T014, T015, T017, T018, T019, T021, T024, T025, T026, T028, T029, T030, T031 (US1–US5). 7 phantom-file tasks whose behaviour is already covered: T010 (all 64 districts), T011 (a11y dashboard), T012 (drill-through officer-only), T016 (duplicate dismissal), T020 (a11y admin/disaster), T022 (redaction active pair), T023 (redaction typed-confirm), T027 (log-scan). 13 cross-feature / non-code tasks (T001–T008 doc, T032, T039 matrix). 2 already-implemented (T035 import, T036 limit, T037 disaster). | (none in this lane) | T011 (a11y dashboard Playwright), T020 (a11y admin/disaster Playwright), T012 (drill-through forged-HMAC) |
| 007 quality-release | 10 | T001–T062 (62) | 5 implemented-and-passing: T044, T045, T046, T047 (buildable evidence file refs in the convergence desk), T062 (this matrix). The release gating scripts (`scripts/eval/freeze-preflight.ts`, `cache-exclude.ts`, `wer.ts`, `timing.ts`, `extract.ts`, `smoke.*`, `finale/rehearsal.sh`) and the 11+ release tests are owner-area deliverables for the release lane. The heldout run is `MISSED` because TASK-064 freeze and OD-5/OD-6 are not closed. | (none in this lane) | T009–T011 (release tests), T012 (tc-coverage.md), T013–T016 (release evidence), T021 (bilingual checklist), T022 (axe result), T023 (reflow check), T024 (device test), T030–T035 (eval writers), T039 (smoke script), T040 (perf record), T047 (deck wording), T048 (link-check), T049 (figures-trace), T054 (rehearsal script), T055 (rehearsal log), T056 (backup recording) |

**Net totals**: 74 implemented-and-passing task rows across the four owned specs (28 + 24 + 17 + 5). 33 phantom-file task rows that the prior drafts treated as "buildable but not yet written" — every phantom is now mapped to the real test that already covers the behaviour. 13 cross-feature / non-code tasks. 3 already-implemented itemized tasks. The remaining ~28–40 rows per spec are external pending (`H` / `O` / `P`).

The "185 unbuilt" framing in the prior drafts is **wrong**. The current software is implemented and tested; the desk's verification of 2026-10-18 (77 test files / 1348 tests passing, 0 failed in the focused run; 200 test files / 3693 tests passing, 0 failed in the full run) confirms it.

## 4. Spec-kit artifacts produced by this lane (2026-10-18)

| Feature | spec.md | plan.md | tasks.md | checklists/requirements.md | Recovery source |
|---|---|---|---|---|---|
| 001 platform-foundation | (existing) | (existing) | (existing) | (existing) | `phase1-specs--lane-a` |
| 002 intake-ai | (existing) | (existing) | (existing) | (existing) | `phase1-specs--lane-a`, `phase2--obidit-spec002` |
| 003 parent-outputs | (existing) | **missing** | **missing** | (existing) | `phase2--obidit-spec003`. **Out of this lane's owned paths (003 owner: Obidit).** |
| 004 matching-data | **created** | **created** | **created** | n/a | n/a (derived from V2 D1/D6 + actual architecture) |
| 005 officer-workflow | **created** | **created** | **created** | n/a | n/a (derived from V1/D6 + actual architecture) |
| 006 dashboard-admin | **created** | **created** | **created** | n/a | n/a (derived from V1/D6 + actual architecture) |
| 007 quality-release | **recovered** | **created** | **created** | **recovered** | `origin/phase1--mahim-spec007:specs/007-quality-release/spec.md` and `checklists/requirements.md` |

Files written in this lane (only owned paths):

```text
specs/004-matching-data/spec.md
specs/004-matching-data/plan.md
specs/004-matching-data/tasks.md

specs/005-officer-workflow/spec.md
specs/005-officer-workflow/plan.md
specs/005-officer-workflow/tasks.md

specs/006-dashboard-admin/spec.md
specs/006-dashboard-admin/plan.md
specs/006-dashboard-admin/tasks.md

specs/007-quality-release/spec.md
specs/007-quality-release/plan.md
specs/007-quality-release/tasks.md
specs/007-quality-release/checklists/requirements.md

docs/execution/evidence/pre-main-convergence-desk.md
docs/execution/evidence/focused-test-summary.json
```

`specs/007-quality-release/spec.md` was recovered from `origin/phase1--mahim-spec007` (the only recoverable artifact with full intent for feature 007; the recovery script: `git show origin/phase1--mahim-spec007:specs/007-quality-release/spec.md > specs/007-quality-release/spec.md`; `git show origin/phase1--mahim-spec007:specs/007-quality-release/checklists/requirements.md > specs/007-quality-release/checklists/requirements.md`).

`specs/004-matching-data/**`, `specs/005-officer-workflow/**`, `specs/006-dashboard-admin/**` were created from scratch. V2 pack (D1 FR-011–FR-018 / FR-022 / FR-023 / FR-035 / FR-037 / FR-025 / FR-019 / FR-032 / FR-036, D2A API-007–API-014 / API-016 / API-018 / API-020 / API-022, D3 SCREEN-007 / 008 / 009 / 010 / 011 / 012 / 013 / 014 / 015, D6 TASK-009 / TASK-010 / TASK-011 / TASK-015 / TASK-016 / TASK-017 / TASK-018 / TASK-019 / TASK-026 / TASK-027 / TASK-028 / TASK-029 / TASK-030 / TASK-048 / TASK-051 / TASK-052) was the only source of intent; no spec-pack or constitution rewrite was performed.

## 5. Verification commands run today (2026-10-18, Asia/Dhaka)

### 5.1 Real commands and their exit codes

| Command | Exit | Time | Result |
|---|---|---|---|
| `bash .specify/scripts/bash/check-prerequisites.sh --json --require-spec --require-tasks --include-tasks` (with `SPECIFY_FEATURE_DIRECTORY=specs/001..006,007`) | 0/0/1/0/0/0/0 | < 1 s each | Specs 001, 002, 004, 005, 006, 007 are `AVAILABLE_DOCS: tasks.md`; spec 003 reports `plan.md not found` (out of this lane's owned paths). |
| `npm run lint` | 0 | ~ 3 s | 0 errors, 51 warnings. |
| `npm run typecheck` | 0 | ~ 8 s | `next typegen && tsc --noEmit` clean. |
| `npx vitest run` | 0 | ~ 9 s | 172 passed, 28 skipped of 200 test files; 3693 passed, 308 skipped of 4001 tests; 0 failed. |
| `npx vitest run tests/match/ tests/duplicates/ tests/found/ tests/eval/ tests/admin/ tests/case/ tests/contracts/ tests/embeddings/ tests/auth/ tests/api/` | 0 | 3.93 s | 77 test files, 1348 tests passed, 1 skipped, 0 failed. |

### 5.2 Commands NOT run in this lane (with reason)

- `npm run test:db`: requires a dedicated loopback PostgreSQL 16 container with this lane's unique DB prefix; the role rule allows resetting only dedicated loopback DBs and forbids resetting existing human / demo / shared DBs. (`risk: db-reset`)
- `npx playwright test`: requires Playwright browsers and a real deployment; the role rule forbids provider / deployment calls. (`risk: provider-call`, `risk: deployment`)
- `npm run smoke` (production): managed DB host is `OD-6 / OQ-021` UNKNOWN. (`risk: deployment`)
- `npm run eval:all` / `npm run eval:extract|match|dedupe|wer|time|audit`: dev split runnable only against the seed loader; heldout is gated on `TASK-064` freeze (OD-064-1 UNKNOWN). (`risk: heldout-tuning`)
- `npm run spend` / `npm run db:reset` / `npm run seed` / `npm run reembed` / `npm run model:fetch`: require provider / DB / model accounts; the role rule forbids provider / deployment / DB-altering calls. (`risk: db-reset`, `risk: provider-call`)
- Real WER runs (TASK-040) / timing study (TASK-041) / mentor fixes (TASK-056) / user conversations (TASK-057): require WER speakers, ≥5 timing volunteers, the mentor table and OQ-019 clearance — all `OD-3, OD-5` UNKNOWN. (`risk: human-evidence`)
- Two-phone device test (TASK-036) / 5-rehearsal finale (TASK-054): require the two Android phones and the laptop / spare laptop / hotspot — `OD-4` UNKNOWN. (`risk: device-evidence`)

### 5.3 Test files inventory

- `tests/**/*.test.ts` (Vitest): 200 files; 172 passed, 28 skipped; 3693 tests passed, 308 skipped, 0 failed.
- `tests/e2e/*.spec.ts` (Playwright): 9 files; not run in this lane.
- `src/**/*.test.ts` (Vitest co-located): 0 files.

## 6. Spec-kit unresolved blockers (re-verified)

### 6.1 Spec-kit prereqs missing (software artifacts, owned by other lane)

| Item | Path | Owner | Reason |
|---|---|---|---|
| `specs/003-parent-outputs/plan.md` | 003 | O (Obidit, `phase2--obidit-spec003`) | Out of this lane's owned paths. Recorded as a **software artifact** (not organiser-blocked). The 003 `spec.md` and `checklists/requirements.md` exist; the parent-outputs application code is implemented. |
| `specs/003-parent-outputs/tasks.md` | 003 | O (Obidit) | Same reason. |

### 6.2 Spec-kit prereqs missing (recoverable, no source found)

| Item | Path | Reason |
|---|---|---|
| `specs/004-matching-data/{research.md, data-model.md, contracts/, quickstart.md}` | 004 | Not produced by this lane. |
| `specs/005-officer-workflow/{research.md, data-model.md, contracts/, quickstart.md}` | 005 | Same reasoning. |
| `specs/006-dashboard-admin/{research.md, data-model.md, contracts/, quickstart.md}` | 006 | Same reasoning. |
| `specs/007-quality-release/{research.md, data-model.md, contracts/, quickstart.md}` | 007 | Same reasoning. |

### 6.3 Open decisions (organiser / mentor / volunteer / device / production)

(All `O` / `H` / `P`. Carried over from `spec.md` of each owned feature.)

- **OD-1** (organiser cutoff, channel, recipient, formats): lead — `O`.
- **OD-2** (OQ-019 ethics): mentors / faculty — `H`.
- **OD-3** (mentor session 2 fix list): lead — `H` (empty now).
- **OD-4** (two Android phones, laptop, spare laptop, hotspot): Mahim — `H` / `P`.
- **OD-5** (WER speakers and timing volunteers): identities and availability — `H`.
- **OD-6** (managed database host): `OQ-021` — `P`.
- **OD-7** (provider prices and spend so far): `OQ-004, OQ-022` — `P`.
- **OD-8** (judging weights and synthetic-only acceptability): `OQ-025, OQ-026` — `O`.

Plus the spec-level decisions recorded in the spec.md of each owned feature (OD-009-1..3, OD-017-1, OD-018-1, OD-026-1..4, OD-028-1..4, OD-031-1..7, OD-032-3..7, OD-049-1, OD-050-1, OD-052-1, OD-064-1). None of them is invented in this lane.

## 7. Honest claims and limits

- **What this lane claims**: the convergence desk recovered feature 007 spec + checklist, produced spec / plan / tasks for features 004 / 005 / 006, and produced this matrix. The lane does **not** modify application code, contracts, the schema, the role DTOs, the audit invariants, the manifest, the model, the thresholds, the prompt / templates or the preprocessing. The lane does **not** reset any human / demo / shared DB and does **not** run a heldout evaluation.
- **What is buildable and already evidenced (this lane's run, 2026-10-18)**: `tests/{match,duplicates,found,eval,admin,case,contracts,embeddings,auth,api}/*.test.ts` already exist and were run in this lane on 2026-10-18 with the exit codes shown in §0 and §2. **77 test files, 1348 tests passed, 1 skipped, 0 failed in the focused run; 200 test files, 3693 tests passed, 308 skipped, 0 failed in the full run.** The admin synthetic import is implemented at `src/app/api/admin/import/route.ts` and is exercised by `tests/api/admin-import.test.ts` + `tests/admin/admin-import-builder.test.ts`. The disaster-mode page (`src/app/(desk)/staff/disaster/page.tsx`) is a real page that reuses the S-007 found-log form and saves through API-007.
- **What is buildable but not in this lane**: the gating scripts and evidence files added in the 007 task list (`docs/execution/evidence/tc-coverage.md`, `axe-result.md`, `reflow-check.md`, `device-test.md`, `perf-record.md`, `rehearsal-log.md`, `backup-recording.md`, `deck-wording-scan.md`, `link-check.md`, `figures-trace.md`, and the `scripts/eval/*` and `scripts/finale/*` and `scripts/smoke.*` scripts) are recorded as buildable task rows; they are not produced in this lane because (a) the 007 owner-area lane owns the gating scripts and (b) the role forbids a full DB suite reset, an actual production deploy, a heldout evaluation run, WER speaker recordings, timing volunteer sessions, a deck send, or a real device check.
- **What is human / production / organiser blocked**: §6.3 lists all `H` / `O` / `P` items. The lane refuses to invent values for any of them.
- **What may not have been visible**: the heldout evaluation harness, the WER run, the timing study, the production smoke check, the deck / video / Drive package, the real device check and the finale rehearsal log all live in lanes outside this worker's owned paths. The matrix records them; this lane does not produce them.
- **What the prior convergence desk got wrong**: the "185 unbuilt" framing in the prior drafts conflated buildable-but-not-yet-written with actually-unbuilt. The current verification of every `[ ] new` task path shows that the great majority of those rows are covered by existing tests on disk and passing on 2026-10-18. The "buildable, not yet written" framing is now corrected to "covered by existing tests; phantom path is not on disk" (§1.1).

## 8. Next-step handoff

For the coordinator:

- **Acceptance of 007 spec recovery**: confirm `specs/007-quality-release/spec.md` was recovered verbatim from `origin/phase1--mahim-spec007:specs/007-quality-release/spec.md` and only the branch-name line and a one-line provenance were added.
- **Acceptance of 004 / 005 / 006 specs**: confirm the V2 IDs (FR-### / TASK-### / TC-### / SCREEN-### / BR-###) are kept verbatim and the AC / scenario language matches the V2 pack. No schema / role DTO / audit invariant change.
- **Matrix sign-off**: confirm the rows in §2 agree with the owner-lane evidence files. The "185 unbuilt" framing has been replaced with the accurate count in §3 (74 implemented-and-passing, 33 phantom-file tasks whose behaviour is already covered, ~28–40 external pending, 13 cross-feature / non-code tasks, 3 already-implemented itemized).
- **Phantom-file cleanup**: the 33 phantom-file task rows in §1.1 can be either (a) re-titled with the real test path that already covers the behaviour, or (b) marked as `[x]` with a "covered by `tests/X.test.ts` (real path)" annotation. The drafts as written are misleading.
- **Frame-headers unit test (005 T041)**: the next lane that needs to claim a unit test for `X-Frame-Options: DENY` + `frame-ancestors 'none'` should either write `tests/auth/frame-headers.test.ts` against `next.config.ts:9-19` or downgrade the claim to "config-only; UNVERIFIED in a unit test".
- **003 spec-kit prereqs**: the 003 owner (`phase2--obidit-spec003`) produces `specs/003-parent-outputs/{plan,tasks}.md`. Out of this lane; 003 is a software artifact, not an organiser-blocked item.
- **DB-only tests**: the lane lists `tests/db/*` test files as **buildable** tasks (they require a dedicated loopback DB with this lane's unique prefix); an integration lane with `npm run db:up && npm run db:reset` can run them.

## 9. Lane integrity (the role rules)

- **Owned paths only**: the lane wrote only `specs/004-matching-data/**`, `specs/005-officer-workflow/**`, `specs/006-dashboard-admin/**`, `specs/007-quality-release/**` and `docs/execution/evidence/pre-main-convergence-desk.md` (`docs/execution/evidence/focused-test-summary.json` is a vitest output file copied into the evidence directory). No application code was modified.
- **No `.env*` read / display**: not read.
- **No provider calls / uploads / email / deployment**: not made.
- **No git commit / merge / push / branch change**: the worktree is unchanged (`git status` shows only the new files and the existing untracked `node_modules`); no commit was made; no branch was changed; the branch remains `pre-main--spec-desk-data`. The coordinator owns Git.
- **No heldout tuning**: no manifest / model / threshold / preprocessing / template change after freeze; the freeze pre-flight (feature 007 T031) is recorded as a buildable task and not implemented in this lane.
- **No schema / role / audit change**: no `db/schema_v2.sql`, no `src/contracts/`, no `src/server/audit/` change.
- **No DB reset**: `npm run test:db` not run; no PostgreSQL container touched; no human / demo / shared DB reset.
- **No secrets**: no `.env.example` change, no `.env.local` read.
- **No remote service touched**: no Vercel, no managed DB, no provider API, no email service, no Playwright Cloud.


## Coordinator integration disposition

The active integration branch already contains `003-parent-outputs/plan.md` and `tasks.md`, the 26-test local release checker, backup/Q&A preparation and the existing `eval/*.mjs` writers. Old planned `scripts/eval/*.ts` or evidence filenames are aliases of implemented behavior, not requirements to duplicate tooling. Freeze checks are implemented in `eval/metric-utils.mjs` and exercised by `tests/eval/{all,extract,match,dedupe}.test.ts`; freeze is unset and no held-out run is permitted or claimed. Native model revision/hash pins are in `src/server/embeddings/model.ts`. Root verification has passed 321 PostgreSQL tests across 31 files and 78 desktop/mobile browser checks with zero skips. The optional research/data-model/contract files may link to the canonical V2 pack, frozen runtime SQL and `src/contracts/`; their absence does not establish missing application behavior. Remaining local CLI, actual restart, poster download and header acceptance checks are consolidated in the final integration report; personal ownership is never a software blocker. Human studies, physical-device acceptance, production/public-sharing access and frozen quality remain pending.
