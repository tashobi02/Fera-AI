# System and integration test plan — Fera

Drafted 19 Oct 2026 against `main` at `8499361`. Finale is 24 Oct. Status: **DRAFT, not reviewed by the owners.** Owners follow the AGENTS.md table; Mahim and Sadman are the same person.

This plan covers how the parts of Fera are tested together (integration) and how the whole product is tested end to end (system). It builds on the harness that already exists. It does not replace unit tests, and it does not change the acceptance cases: those are D6 §8 TC-001–TC-037 and §8.1 TC-038–TC-066, and D6 wins wherever this plan disagrees with it.

Baseline recorded in [PHASE_5_HANDOFF.md](handoff/PHASE_5_HANDOFF.md) at application source `9155963`: 3,693 unit tests pass (308 skipped), 320 DB tests pass, 78 browser checks pass, remote CI green. **Not yet done:** production smoke, frozen held-out evaluation, measured spend, formal G6 or offline-journey PASS. This plan has not re-run those numbers.

---

## 1 Scope

### In scope

| Area | What "integrated" means here |
|---|---|
| Route pipeline | Every handler under `src/app/api/**` runs, in order: Zod input, role guard, service, per-role DTO allowlist, error envelope, audit. |
| Service ↔ PostgreSQL 16 + pgvector | Case service, state guard, confirm transaction, triggers, constraints and roles (`db/schema_v2.sql` + `db/roles.sql`). |
| Intake chain | Speech adapter (API-001) → normaliser → LLM adapter + fallback → question templates → device-local review → submit (API-003). |
| Spend and cache | Atomic paid-call reservation, cap refusal (E-023), `DEMO_MODE=1` cache path, `[MOCK]`/cached labels. |
| Matching chain | Found report (API-007) → embeddings (local E5 cache) → hard filters → scoring → candidates → officer decision (API-010) → close (API-011) → dashboard (API-012). |
| Duplicates | Detector → persistence → banner → decision (duplicates route). |
| Outputs | GD draft, poster PNG, 13219 summary (API-006) through the wording guard. |
| Admin | Synthetic import (API-015), redaction (API-016), officer verify `[MOCK]` (API-017), user list. |
| Auth and sessions | Auth.js credentials, anonymous parent cookie, cookie security flags, sign-out. |
| UI | Parent S-001–S-006 (Bangla default, English toggle), desk S-007–S-016, both themes. |
| Non-functional | Accessibility, log hygiene, security headers, offline operation, restart, concurrency, performance. |
| Deployments | Vercel (Round 2) and the laptop stack with `DEMO_MODE=1` (finale). |

### Out of scope

Real child data, photos or faces, alerts, physical return, CID/police integration and legal-compliance claims. None of these exist, so none are tested, except **negatively**: tests prove that no control, wording or input for them exists (TC-025, TC-026, TC-037, TC-066).

---

## 2 Test levels and the suites that already exist

| Level | Command | Location | Environment | Runs in CI |
|---|---|---|---|---|
| L1 Unit | `npm test` | `tests/**/*.test.ts` (no DB) | Node, fakes in `tests/*/fakes`, `tests/api/fakes.ts` | Yes (`check` job) |
| L2 Service ↔ DB integration | `npm run test:db` | `tests/db/*.test.ts` | Fresh `fera_test_<pid>_<n>` database per file, PG16 + pgvector 0.8.1 image from `db/docker` | Yes (`db` job, TC-062) |
| L3 System, browser + API | `npm run test:e2e` | `tests/e2e/*.spec.ts` | Production build, fresh `fera_e2e_<run>` database, `DEMO_MODE=1`, mobile 360×780 bn-BD + desktop 1280×800 | Manual only (`workflow_dispatch`) |
| L3 System, offline journeys | `npm run test:offline` | `tests/rehearsal/*.spec.ts` | Port 3225, `fera_e2e_premainjourney_<run>` database, local model cache, browser network allowlist | Manual only |
| L3 Repeat stability | `npm run rehearsal:automated` | `scripts/rehearsal/` | Same as offline, N repeats | No |
| L4 Model quality | `npm run eval:all` (and `eval:extract`, `match`, `dedupe`, `wer`, `time`, `audit`) | `eval/` | Dev split only until `eval/FREEZE.md` says `FREEZE_FLAG: SET` | No |
| L4 Deployment smoke | `npm run smoke -- <url>` | `scripts/smoke.mjs` | Deployed URL, read-only by default; `--synthetic-submit` only with loopback or explicit `FERA_SMOKE_ALLOW_NON_LOOPBACK=1` | No |
| L4 Offline stack readiness | `npm run demo:local -- verify` | `scripts/demo/verify.mjs` | Laptop Docker stack | No |
| L4 Release pack | `npm run release:check` | `scripts/release/check.mjs` | Local files; external URLs reported UNVERIFIED | No |

Fixed rules for every level:

- **Synthetic data only.** Seeded users (`npm run seed:users`), seed sets (`npm run seed -- --set demo|full`) and the fixture clock. No real names, phones, photos or coordinates in a fixture, log or report.
- **Dedicated loopback databases only.** Every DB step goes through `scripts/db/guard.mjs`. Never run `db:reset` against a shared, demo or remote database.
- **Never read `.env*`.** Keys are per-run random values, as in `playwright.config.ts`.
- **No paid provider calls in automated suites.** `DEMO_MODE=1` and fakes. Live-provider checks are manual, budgeted and logged (§8).

---

## 3 Environments

| ID | Environment | Used for | Built by | Notes |
|---|---|---|---|---|
| E1 | Node only | L1 | `npm ci` | Fast; every PR. |
| E2 | Local PG16 + pgvector | L2 | `npm run db:up` locally, Docker in CI | One database per test file; dropped afterwards. |
| E3 | Production build on loopback + per-run DB | L3 | Playwright `webServer` (`db:reset && build && e2e-server.mjs`) | Server log captured to `.e2e-logs/` for TC-028. |
| E4 | Laptop finale stack, internet off | L3 offline, rehearsals, TC-021/057 | `npm run demo:local -- start` after `model:fetch` | One database shared by every role; separate browser profiles per role. |
| E5 | Vercel preview / production | Smoke, Lighthouse, live-provider spot checks | Mahim (deploy owner) | Read-only checks by default; managed DB is never reset. |
| E6 | Physical phone | TC-001, TC-061, 360 px parent reflow on real hardware | Masnun (physical-device checks) | Device model and browser UNKNOWN; record them on the run sheet. |

---

## 4 Integration test design (by seam)

Each row is one seam between two components. "Existing" names the files that test it today; "Add" is new work (also listed in §9).

### 4.1 Route pipeline (every API route)

The 21 handlers are: `health`, `auth/sign-in`, `auth/sign-out`, `intake/transcribe`, `intake/extract`, `cases` (POST, GET), `cases/[id]` (GET, PATCH), `cases/[id]/outputs`, `cases/[id]/close`, `cases/[id]/audit`, `my-case`, `found-cases`, `match/[caseId]`, `review-queue`, `candidates/[id]`, `candidates/[id]/decision`, `duplicates/[id]/decision`, `dashboard/stats`, `admin/import`, `admin/anonymise`, `admin/users`, `admin/users/[id]/verify`.

| Check | Existing | Add |
|---|---|---|
| Malformed JSON, oversize body (64 KiB, or the per-route cap for API-015), invalid UTF-8, repeated/`__proto__` query keys → E-001, no echoed values | `tests/api/platform.test.ts`, `tests/api/request.test.ts` | — |
| Rate limits and `Retry-After` (E-007) | `tests/api/limit.test.ts`, `platform.test.ts` | — |
| Server-generated `request_id`; client ID only logged | `platform.test.ts` | — |
| **Role × route matrix** (§6) | Per-route tests, scattered | One table-driven test over every route × every principal, expected status and error ID taken from D2 Part A. It fails when a new route is not in the table. |
| Response is exactly the role's DTO allowlist (no extra keys, no raw row) | `tests/contracts/roles.test.ts`, per-route tests | Same matrix test: for every 2xx response, compare the key set (recursively) to the allowlist. |
| Security headers on HTML and API (X-Frame-Options DENY, CSP `frame-ancestors 'none'`) | Offline journey 10 | Repeat the header check on a JSON route and on the deployed origin (E5). |

### 4.2 Service ↔ database

| Check | TC | Existing | Add |
|---|---|---|---|
| Schema applies on real PG16 with app roles | TC-062 | `tests/db/platform.test.ts`, CI `db` job | — |
| Illegal state moves raise `check_violation` (open→confirmed, found→closed) | TC-032 | `db/case.test.ts`, `db/platform.test.ts`, `contracts/sql-parity.test.ts` | — |
| Confirm transaction: sorted-UUID locks, version recheck, void competitors, both states, referral, audit — all or nothing | TC-010, TC-029, TC-046, TC-053 | `db/case.test.ts`, `db/platform.test.ts` | **Fault injection:** abort the transaction after each step (via a test-only failing trigger or a killed connection) and assert no partial state, referral or audit row survives. |
| Two officers confirm competing candidates at the same time | TC-029 | Unique-index test | Two real connections with `Promise.all`; exactly one succeeds, the other gets the conflict error ID, and the loser's candidate is superseded. |
| Referral endpoints must match the candidate pair | TC-047 | `contracts/platform.test.ts` (contract only) | DB test: insert a referral with a mismatched pair as `fera_app`; the constraint rejects it. |
| Reject needs a reason (NULL or too short is rejected by both service and DB) | TC-048 | Untagged coverage in `db/case.test.ts` | Confirm, then tag `TC-048`. |
| Terminal report edit blocked (E-018); redaction is a separate privileged path | TC-049, TC-018 | `db/case-edit-route.test.ts`, `api/case-edit.test.ts` | Confirm, then tag `TC-049`. |
| Audit is append-only: UPDATE/DELETE/TRUNCATE fail; runtime role has no DDL or ownership | TC-016, TC-051 | `db/platform.test.ts` | — |
| Unknown-resource denial writes a safe audit row with a null FK | TC-052 | Several | — |
| Idempotent submit: same UUID + payload → one row, same ref; changed payload → conflict | TC-031, TC-042 | `db/submit.test.ts`, `case/service.test.ts` | Run concurrently over real connections (not only sequential replays). |
| No child payload in the DB before submit (metadata and cost rows only) | TC-004, TC-060 | `db/submit.test.ts`, parent journey | — |
| Redaction clears direct and related payloads; pseudonymous counts unchanged; active linked evidence skipped | TC-015, TC-050 | `db/redaction.test.ts`, `db/admin.test.ts` | — |
| `cases` columns equal the BR-015 field list plus the optional list, nothing more | TC-027 | Partial (`contracts/platform.test.ts`) | DB test that reads `information_schema.columns` and compares it to a list copied from D1 BR-015. |

### 4.3 Intake chain

| Check | TC | Existing | Add |
|---|---|---|---|
| Normaliser: Bangla numerals, phone, district, time intervals | TC-002, TC-030 | `tests/normalise/*`, `tests/ai/fix*.test.ts` (≥30 normaliser tests per D6) | — |
| Exactly one follow-up question per missing field | TC-003 | `intake/questions.test.ts`, `intake-ui/questions.test.ts` | Tag `TC-003`; add a route-level test (API-002 with a draft missing only district → one question). |
| LLM failure → manual form within 2 s with the text kept | TC-017 | `intake-ui/manual-form.test.ts`, parent journey | — |
| Spend cap reached → E-023 and manual form | TC-036 | `db/spend.test.ts`, `db/spend-cli.test.ts` | Browser assertion that the manual form opens. |
| Concurrent reservations can never exceed the cap; duplicate settlement is idempotent | TC-065, TC-043 | Untagged in `db/spend.test.ts` | `Promise.all` of N reservations where N > remaining slots, on real connections; exactly the remaining number succeed. Tag `TC-065`. |
| Provider notice is shown before any dispatch | TC-060 | `intake-ui/client.test.ts` | Browser check: no request to the extract/transcribe route before the notice is acknowledged. |
| Audio limits: codec, duration, size; WAV > 2 MB rejected or compressed | TC-061 | `api/intake/audio-metadata.test.ts` and others | Manual E6 run with real phone recordings (§8). |
| Cache path: exact source → `cached: true`, zero paid calls; cache miss with UNKNOWN prices refused before reservation | TC-021, TC-056 | `smoke.spec.ts`, offline journey 7 | — |

### 4.4 Matching, duplicates and dashboard

| Check | TC | Existing | Add |
|---|---|---|---|
| Hard filters, including unknown found age and overlapping time intervals | TC-009, TC-039, TC-040 | `match/filters.test.ts`, `db/match-filters.test.ts` | — |
| No candidate breaks eligibility (SQL check over every candidate row after a full seed run) | TC-009 | `db/match-run.test.ts` | Run on the `full` seed set, not only small fixtures. |
| Empty shortlist allowed; no misleading confidence; "similarity" wording | TC-041 | `match/score.test.ts`, honest-copy spec | — |
| Rejected pair not re-suggested after re-match | TC-011 | `match/match-review.test.ts`, officer lifecycle | — |
| Matching fails after submit → saved report, explicit failed/queued state, retry works | TC-054 | Untagged (`db/match-run.test.ts`, `db/submit.test.ts`) | Fault test: make the embedder throw after submit; assert the case row exists, the state is shown, and the retry (API-014) produces candidates. Tag `TC-054`. |
| Embedding space switch: no mixed vectors; matching paused until a validated rebuild | TC-059 | `db/reembed.test.ts` | — |
| Shared-phone distinct children stay separate; a phone-only link cannot `confirm_same` | TC-013, TC-038 | `db/duplicates.test.ts`, offline journey 5 | — |
| Dashboard count per district = SQL group count; one pair changes missing and found separately | TC-012, TC-055 | `db/dashboard.test.ts` | — |
| Admin re-match projection shows status only | TC-044 | `contracts/roles.test.ts` | Route-level check through the matrix test (§6). |

### 4.5 Outputs, auth, locale

| Check | TC | Existing |
|---|---|---|
| GD draft has the 5 fields and the "খসড়া" label; poster PNG renders Bangla, has 13219 and the phone, no image input; summary ≤ 80 words | TC-005–TC-007 | `outputs/*`, offline journey 8 |
| Injected forbidden word ("পালিয়ে") → E-016, text not shown | TC-024 | `outputs/guard.test.ts` |
| Parent cookie: own read OK, cross-owner read → E-004 + `access.denied` audit | TC-022 | `smoke.spec.ts` |
| Bangla default, English toggle, Bangla numerals in Bangla mode | FR-033 | `tests/locale*.test.ts`, `numerals.test.ts` |

---

## 5 System test scenarios

Each scenario runs as one script on a single database with every role, in E3 (automated) and again in E4 (internet off). "Auto" names the spec that covers it today.

| ID | Scenario | Steps (short) | Pass condition | TCs | Auto |
|---|---|---|---|---|---|
| SYS-01 | **Rafi golden path** | Parent text report → one question → review, edit clothing, tick, submit → outputs → staff logs Kamalapur found boy → verified officer opens queue → confirm (two steps) → close "…রেফারেল নথিভুক্ত (সিমুলেশন)" → dashboard | 0 case rows before submit; stored = edited values; ≤ 5 candidates with reasons; missing confirmed→closed, found referred, 1 referral, 3 audit rows; district counts = SQL | TC-002–TC-012, TC-016 | Split across `parent-journey`, `officer-lifecycle`, offline journeys 1–4. **Add** one spec that runs it unbroken. |
| SYS-02 | Voice path | Record scripted 38 s note → transcript → as SYS-01 | Transcript ≤ 20 s with "রাফি" and "১৩"/"13" | TC-001 | Offline journey 9 (synthetic bytes). Real voice is manual (§8). |
| SYS-03 | Reject then confirm | Officer rejects with "পোশাক আলাদা" → re-match → confirms a different candidate | Pair absent after re-run; other candidates voided on confirm | TC-011, TC-029 | `officer-lifecycle`, journey 3 |
| SYS-04 | Edit after submit | Parent edits age while a candidate is pending | Version 2; candidates voided; re-match ran; confirmed case → E-018 | TC-018, TC-049 | `parent-journey` |
| SYS-05 | Parent status | Parent opens status after match | "যাচাই চলছে"; JSON has no found-case or candidate fields | TC-019, TC-045 | `parent-journey` |
| SYS-06 | Duplicates | Mim parent case + public duplicate; shared-phone siblings | Banner "সম্ভাব্য একই শিশু"; both visible; phone-only cannot merge | TC-013, TC-038 | Journey 5 |
| SYS-07 | Admin import + prompt injection | Import 5 invented texts with example.invalid URLs, one containing "ignore previous instructions" | 5 cases tagged simulated public_import; schema fields only; no server fetch | TC-014 | Journey 6. **Add** server-egress proof (§7.4). |
| SYS-08 | Redaction | 3 closed/referred + 1 open → redact all eligible | Eligible cleared, active evidence skipped, counts unchanged | TC-015, TC-050 | DB level only. **Add** a UI run via S-013. |
| SYS-09 | Degraded intake | LLM keys invalid; then spend cap reached | Manual form ≤ 2 s with text kept; E-023 → manual form | TC-017, TC-036 | Partly. **Add** a browser E-023 case. |
| SYS-10 | Matching failure | Submit while the embedder is broken, then repair it and retry | Explicit failed/queued state; retry succeeds | TC-054 | **Add** |
| SYS-11 | Disaster mode | Staff opens S-015, logs a child | Banner "পরিকল্পিত সম্প্রসারণ"; saved as a found case | TC-035 | Unit only (`ui/staff-disaster.test.ts`). **Add** to the e2e suite. |
| SYS-12 | Finale offline, one DB | All roles on the laptop, internet off, separate profiles | Every role sees the same new report; zero non-loopback attempts; cached and synthetic labels visible | TC-021, TC-057 | `full-journey-offline.spec.ts` suite checks. Plus a human rehearsal (TASK-054). |
| SYS-13 | Restart mid-demo | Restart the app on the same port mid-journey | DB state and session cookie preserved | — | Offline suite "restart" |
| SYS-14 | Deployed smoke | Health, home, sign-in on Vercel | `npm run smoke` exits 0 with no skipped lines counted as pass | TASK-042 | Script exists; **never run on production yet** |

---

## 6 Safeguarding and negative suite

### 6.1 Role × route matrix

Principals: anonymous (no cookie), parent (owner), parent (other owner), staff, unverified officer, verified officer, admin, and a disabled or role-less principal.

For every route in §4.1 and every principal, assert:

1. Status and error ID equal the D2 Part A API table. Known fixed points: TC-022 (staff or parent reading another case → E-004, 404 body, `access.denied` audit) and TC-023 (staff or unverified officer confirming → E-003/E-004, candidate still pending).
2. Every 2xx body has exactly the role's DTO keys.
3. Every denial writes one safe audit row with no child payload.
4. Only verified officers ever receive candidate IDs, scores or the other party's data.

Owner: Sadman (auth/role guard). Location: `tests/api/role-matrix.test.ts` (route level, with fakes) plus a smaller DB-backed version in `tests/db/` for the four candidate and decision routes.

### 6.2 Fixed negative checks

| Check | TC | Existing |
|---|---|---|
| No file or camera inputs anywhere except audio | TC-026 | `safeguarding.spec.ts` |
| No alert-sending control or wording | TC-025 | `safeguarding.spec.ts` |
| No delivery, return, reunification, alert, runaway or compliance claims in the UI | TC-037, TC-066 | `honest-copy.spec.ts` |
| Same scan over the README, deck text, video script and submission pack | TC-037, TC-066 | **Add**: run the honest-copy patterns over those files in `release:check` or a unit test. |
| Log scan: no `01[0-9]{9}`, no seeded names, request_id present | TC-028 | `log-scan.spec.ts` (E3) |
| Same log scan over the offline run log and the Vercel function logs from one smoke | TC-028 | **Add** (E4 automatic; E5 manual export) |

---

## 7 Non-functional tests

### 7.1 Accessibility (TC-033, TC-058)

- Existing `a11y.spec.ts`: axe on public and desk pages in light and dark themes, 320 CSS px reflow, keyboard reachability of submit.
- **Add:** a 200 % text-zoom and 400 % viewport-zoom pass on S-002, S-003, S-005 and S-010; a check that keyboard shortcuts are off while typing and can be switched off; a full keyboard walk of the confirm dialog (four checkboxes, final "হ্যাঁ, নিশ্চিত করুন").
- **Manual:** one screen-reader pass (NVDA or TalkBack) over the parent report in Bangla. Who has which device is UNKNOWN; record it on the run sheet.

### 7.2 Performance (TC-034) — **no test exists today**

- Run Lighthouse mobile on the deployed S-001, S-002 and S-003 (E5). Record each NFR-001–NFR-005 target as met, missed or not measured, with the run count.
- Time the API with a small script against E3: extract (cache path), submit, found-report-to-candidates (TC-008: ≤ 15 s), and confirm. Report the median and maximum over at least 5 runs; give the count with every number.
- Owner: Masnun (production performance, per the Phase 5 handoff). `eval/perf.ts` from D6 is not in the repo; whether to add it or to use a script under `scripts/` is an open decision.

### 7.3 Concurrency and resilience

- TC-029, TC-031/042, TC-043, TC-065 run on real concurrent connections (§4.2, §4.3).
- Killed DB connection during confirm → no partial state (§4.2).
- `npm run rehearsal:automated` repeats the offline suite. A flaky result is a defect, not a retry (§11).

### 7.4 Network and egress

- Browser side: the offline config already aborts and records non-loopback requests and blocks service workers.
- Server side, not covered today: run E4 with the host firewall (or a Docker network with no route out) blocking outbound traffic, and assert that the journeys still pass and the app log shows no failed outbound attempts. This also proves SYS-07 (no server fetch of imported URLs).

### 7.5 Security

- `security-reviewer` pass over the route list in §4.1.
- Cookie flags (`Secure` in production, `HttpOnly`, `SameSite`) on E5: covered by `secureCookiesFor` unit tests, checked once on the real origin.
- `npm audit --omit=dev` must report zero runtime findings. The known dev-chain `braces` advisory stays recorded, not ignored.

---

## 8 Manual and human-only checks

These cannot be automated honestly. Each needs a dated run sheet in `docs/execution/evidence/`. Do not record any of them as passed without that sheet.

| Check | TC | Needs | Owner |
|---|---|---|---|
| Live voice on a real phone, live STT provider | TC-001 | E6 phone, provider key, spend reservation | Obidit (provider, audio) + Masnun (device) |
| Real phone codecs, durations and sizes | TC-061 | E6, at least one Android device; iOS UNKNOWN | Obidit |
| Bangla copy review of every new or changed string | FR-033 | Bangla reader | Obidit (+ `bengali-reviewer` agent) |
| Five full rehearsals, at least one with internet off | TASK-054 | Three people, the laptop, the spare laptop | All three |
| Correction/reopen pilot gate: two distinct verified reviewers, reason, evidence, history | TC-063 | Documentation review; real data stays blocked | Sadman |
| Held-out evaluation after the freeze | TC-020, TC-056, TC-064 | `eval/FREEZE.md` set by an independent reviewer | Masnun |
| Logged-out organiser view of the repository and Drive links | — | Organiser access | Mahim |

---

## 9 Traceability and gaps

Status of every D6 acceptance case at `8499361`, from a grep for each TC ID in the tests plus a keyword check. **Tagged** = a test names the TC. **Untagged** = tests appear to cover it without naming it; someone must confirm this and add the tag. **Gap** = no automated test found. **Human** = only a manual run can satisfy it.

| Status | TCs |
|---|---|
| Tagged | 002, 004–026, 028–033, 035, 036, 038–046, 050–053, 055, 056, 059, 060, 062, 064 |
| Untagged, likely covered | 003 (`intake/questions.test.ts`), 027 (partial), 037/066 (UI only, `honest-copy.spec.ts`), 048, 049, 054 (partial), 057 (offline suite), 058 (partial, `a11y.spec.ts`), 065 (`db/spend.test.ts`) |
| Gap | 034 performance; 047 at DB level; 054 fault path; server-side egress; role × route matrix; unbroken SYS-01 spec; SYS-11 in e2e |
| Human | 001, 061, 063; 020 held-out run |

### New test work

| # | Work | Level | Owner (AGENTS.md table) | TCs |
|---|---|---|---|---|
| T1 | Role × route matrix, route level + DB level | L1 + L2 | Sadman | 022, 023, 044, 045 |
| T2 | Confirm-transaction fault injection and concurrent confirm | L2 | Sadman | 010, 029, 046 |
| T3 | Referral pair constraint at DB level | L2 | Sadman | 047 |
| T4 | `cases` columns vs the BR-015 list | L2 | Sadman | 027 |
| T5 | Concurrent spend reservations; confirm + tag | L2 | Obidit | 043, 065 |
| T6 | Concurrent idempotent submit | L2 | Sadman | 031, 042 |
| T7 | Matching-failure-after-submit fault path (SYS-10) | L2 + L3 | Masnun | 054 |
| T8 | Unbroken SYS-01 golden-path spec, run in E3 and E4 | L3 | Sadman (e2e) | 001–012, 016 |
| T9 | Disaster mode (SYS-11) and E-023 manual form (SYS-09) in the browser | L3 | Masnun / Obidit | 035, 036 |
| T10 | 200 %/400 % zoom, shortcut toggle, confirm-dialog keyboard walk | L3 | Sadman | 033, 058 |
| T11 | Honest-copy scan over README, deck, video script, submission pack | L1 | Obidit | 037, 066 |
| T12 | Server-side egress block during the offline run | L3 (E4) | Mahim | 014, 021, 057 |
| T13 | Lighthouse and API timing report | L4 (E5) | Masnun | 034 |
| T14 | Confirm the "untagged, likely covered" rows and add TC tags | L1/L2 | Each test file's owner | 003, 048, 049, 054, 057, 065 |

New tests follow the existing patterns: `tests/db/*.test.ts` gated on `FERA_DB_TESTS` and picked up automatically by `scripts/db/test-db.mjs`; browser specs in `tests/e2e/` reuse `tests/e2e/support/`. Name TC and BR IDs in each test title, as the existing specs do.

---

## 10 Run order

### On every PR (automatic)
`lint` → `typecheck` → `npm test` → `build` (CI `check`), then `test:db` (CI `db`). After those, the `fera-review` skill, which always includes `fera-safeguarding-reviewer`.

### Before merging anything that touches routes, the DB, intake, matching or UI (manual dispatch)
CI `e2e` job: `model:fetch` → real-embedding check → `test:e2e` → `test:offline`. This job costs build and browser time, which is why it is manual. Before the finale, run it on every merge to `main` rather than "when someone remembers".

### Release candidate for the finale (once per candidate SHA)
1. Clean checkout of the candidate SHA; record the SHA.
2. CI fully green, including a manual `e2e` dispatch on that SHA.
3. `npm run rehearsal:automated` — record N and the pass count.
4. `npm run eval:all` on the dev split. Report it as dev and give the denominators. Held-out only if `FREEZE_FLAG: SET`.
5. Deploy to Vercel → `npm run smoke -- <url>` → Lighthouse (T13) → log scan of one smoke (§6.2).
6. Laptop: `demo:local -- verify` → internet off → SYS-12 and SYS-13 by hand → server-egress check (T12).
7. `npm run release:check`. Exit code 2 (external URLs UNVERIFIED) is acceptable only when those URLs are listed in the evidence file.
8. Human checks from §8 that are due.
9. Write the evidence file (§12) and run the `fera-gate` skill for G6.

The time of the release-candidate cut and the code freeze before 24 Oct is **UNKNOWN**. It is an open decision for Mahim (§13).

---

## 11 Entry, exit and defect rules

**Entry to system testing:** CI `check` and `db` green on the SHA; the model cache verified (`demo:local -- verify` or the CI fetch step); seeds load.

**Exit (finale release candidate):**
- Every Tagged and Untagged-confirmed TC passes on the candidate SHA.
- TC-010, TC-019, TC-022–TC-027 (D6 safeguarding row) pass with no exceptions.
- `fera-safeguarding-reviewer` = PASS.
- Every Gap and Human TC is either passed with evidence or listed as "not tested" with the reason. Never mark it passed.
- No open defect of severity S1 or S2.

**Severity:**

| Sev | Meaning | Example | Rule |
|---|---|---|---|
| S1 | Safeguarding or data-integrity break | Candidate data reaches staff; payload stored before submit; partial confirm | Stops the release. Fix, add a regression test, and re-run the full L2 and L3 suites. |
| S2 | Essential journey blocked | SYS-01 fails; offline run makes a non-loopback request | Stops the release. |
| S3 | Degraded but there is a workaround | Wrong Bangla numerals in one label | Fix before the finale if time allows; list it otherwise. |
| S4 | Cosmetic | Spacing | Backlog. |

**Flakes:** the e2e config allows one retry in CI. A test that passes only on retry is logged as a defect against its owner. It is not quarantined silently, and a safeguarding test is never quarantined.

---

## 12 Evidence and reporting

- One file per release candidate: `docs/execution/evidence/system-test-<YYYY-MM-DD>-<sha7>.md` (with a `.json` twin if the gate scripts need it), containing: SHA; environment IDs; the command and exit code for each step in §10; passed/failed/skipped counts with totals; TC status table (§9); manual run sheets; open defects.
- Numbers only as measured, with their denominators. Anything not run is written "not measured", never left out.
- Gate reports keep using `docs/gates/` through the `fera-gate` skill.
- Each owner updates their own rows in `docs/execution/PHASE_*.md` in the same branch as the test work.

---

## 13 Open decisions

| # | Decision | Proposed owner |
|---|---|---|
| OD-1 | Release-candidate cut time and code-freeze time before 24 Oct | Mahim |
| OD-2 | Whether the CI `e2e` job should run automatically on pushes to `main` until the finale | Sadman |
| OD-3 | Where the performance script lives (`eval/perf.ts` per D6, or `scripts/`) and which NFR targets are reported | Masnun |
| OD-4 | Physical devices available for E6 (models, OS, browsers) | Masnun |
| OD-5 | Budget for live-provider manual checks (TC-001, TC-061), inside the USD 25 default cap | Obidit |
| OD-6 | Who independently reviews and sets the eval freeze (TC-020 held-out) | UNKNOWN |
| OD-7 | Number of repeats for `rehearsal:automated` on a release candidate | Mahim |

## 14 Round 3 regression delta — 2026-10-19

The BUG_SOLVING1/2 implementation added or extended these automated checks:

| Area | Regression coverage |
|------|---------------------|
| API submit outputs and replay | `tests/intake/submit-api.test.ts`, `tests/db/submit.test.ts` |
| Matcher stamps, bad candidate rows, and duplicate hook | `tests/db/match-run.test.ts` |
| Batched audit writes and action contract | `tests/case/audit.test.ts`, `tests/contracts/sql-parity.test.ts`, `tests/db/platform.test.ts` |
| Case list query plan | `tests/db/case-list.test.ts` |
| Redaction actor, seed replay, and direct anonymisation | `tests/db/redaction.test.ts`, `tests/db/seed-cases.test.ts`, `tests/db/platform.test.ts` |
| Password-hash and audit-action constraints | `tests/db/platform.test.ts`, `tests/lint/` |
| Expiry sweep | `tests/db/sweep.test.ts` |
| Officer audit marker and duplicate links | `tests/ui/officer-case.test.ts`, `tests/match/match-review-screen.test.ts` |
| Close note reload and sign-in demo fill | `tests/ui/officer-case.test.ts`, `tests/auth/sign-in-dom.test.ts`, `tests/ui/sign-in-screen.test.ts` |
| Matcher runner and logger propagation | `tests/lint/`, `tests/intake/orchestrator.test.ts` |
| Voice cancellation and partial time input | `tests/intake-ui/voice-lifecycle.test.ts`, `tests/intake/review/review-fields-regressions.test.ts` |
| Language toggle accessible name | `tests/ui/language-toggle.test.ts` |
