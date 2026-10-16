# TASK-063 — atomic paid-call counters, replay refusal and price sheet

Owner: Obidit · Lead: Mahim · Tools: Codex Sol (implementation, continuation audit, post-G6 review/fixes and measured verification), Claude Code (review fixes, T2 verification, round 3), Antigravity gemini-3.8-flash-high helpers G1/G6 (polish; G6 could not run commands) · Branch: `phase2--obidit-spend-counters` · Base `0617b4c`; committed as `5cecbc0` plus a WARN-fix commit on branch `phase2--obidit-spend-counters`; PR into phase2 being opened · Last verified: 2026-10-16 (Asia/Dhaka). Links: TASK-063, BR-004/023/024, COMP-009, D2A API-001/002 and reserve/settle functions, D2B §12/15, TC-036/043/065.

Synthetic data and fake providers only. No provider calls, dependency changes or deployment. All database tests use isolated throwaway databases on 127.0.0.1:54322; application behaviour runs as `fera_app`. Frozen contracts, schema, roles and spec copies are unchanged.

## Status against the D6 done-when

| Criterion | Result | Evidence / limit |
|---|---|---|
| Draft replay/concurrency checks | PASS at service/DB level | Concurrent requests for one draft revision across two pools commit one reservation; ten callers with distinct expected revisions 1..10 race on ten real connections and every success has a unique reservation and revision; replay after settlement does not reserve or charge again. Ten concurrent direct SQL reservations on ten distinct backend connections accept six and refuse four. The seventh sequential call is refused even after zero-cost settlements. |
| Budget checks | PASS at service/DB level | Cap refusal rolls back the draft count/revision. Ten concurrent drafts compete for USD 0.03 of synthetic headroom: three USD 0.01 reservations succeed. SQL prevents over-bound/conflicting settlement; identical concurrent settlement is idempotent. Unknown usage retains the reserved upper bound. |
| Manual path survives paid refusal | PASS for reviewed submission service | The actual `createMissingCase` service still creates a submitted report after both budget and six-call refusals; the device fixture is unchanged. E-023/E-013 retain `fallback: "manual_form"`; server-input faults and foreign `ApiError`s from the transaction helper now map to E-013, not E-001/E-005 (round 2). SCREEN-005 opening and API-002 end-to-end TC-036 are NOT demonstrated here. |
| Real price sheet / paid routes | NOT DONE | TASK-003's `docs/costs.md` is absent. Default sheet explicitly says UNKNOWN and estimation refuses. TASK-013/014/020 must wire the wrapper, verified draft token, notice and maximum billable usage. |

## What was built

| Files | Notes |
|---|---|
| `src/server/spend/service.ts` | Server principal/kind/owner and expected-revision binding around the existing SQL functions. Reservation commits before dispatch. Revision/owner refusal rolls back the tentative SQL reservation; all paid counters/cap/expiry enforcement stays in SQL. Uses the existing transaction/pool/decode patterns; one transaction attempt so uncertain COMMIT never dispatches or automatically reserves again. |
| `src/server/spend/paid-call.ts` | One dispatch per reservation. Caller supplies an integer timeout of 1–25,000 ms (D2A COMP-006 line 182; D2B §13 E-014 row line 157; COMP-007 gives no other value) and receives an AbortSignal. Known billing settles, including a known unbilled zero. Failed/late/unknown billing retains budget and consumed revision. A successful paid result is always returned, with `settlement` `settled`/`retained`/`unsettled`; `PaidCallError` keeps the provider's E-012/E-013/E-014 and `failureSource: "provider" \| "settlement"`. Late results/failures after a timeout are logged, never settled. Safe structured `spend.*` logs; no payload, provider text or pg message. |
| `src/server/spend/errors.ts` | 23514 with no named constraint and `routine`/`where` naming `reserve_ai_call` (db/schema_v2.sql:553/557), or the exact RAISE text as a fallback, maps to E-023; other spend/settlement failures map to E-013. Only the module's own IDs (E-002/003/012/013/014/023) pass through; any other `ApiError` becomes E-013 with `spend.error_remapped`. The shared transaction helper logs safe SQLSTATE/class/frame diagnostics before mapping; pool acquisition failures get the same safe treatment locally. Messages/details never escape. No frozen error IDs changed. |
| `src/server/spend/money.ts`, `price-sheet.ts` | Six-decimal USD strings, exact bigint arithmetic and upward rounding for upper bounds. Injected speech/extraction rate types, separate input/output rates, explicit UNKNOWN default. Missing, ambiguous, malformed, zero-total or overflowing estimates refuse. No real provider/model/rate supplied. |
| `src/server/spend/index.ts`, `README.md` | Server entry point and adapter/token/retry/settlement integration requirements. Reservation handles are internal metadata, not route DTOs. |
| `tests/spend/{money,price-sheet,service,paid-call}.test.ts`, `fakes.ts`, `estimates.ts` | Unit cases with synthetic rates/identities and fake providers/DB: money edges, branded estimates, timeout bounds, settlement-failure/late-result events, E-013 server-input mapping, foreign-`ApiError` remapping at constraints/COMMIT, principal refusals even when adapter inputs are invalid, structured spend log assertions, payload protection, and logger dropping checks for invalid fields/unknown reasons (OD-063-8); verified in the T2/round-3 runs below. |
| `tests/db/spend.test.ts` | 20 PostgreSQL cases covering six-call, ten-connection concurrency, distinct-revision race, replay, cap, settlement, wrong-kind drafts (parent→found, user→missing), API-007, over-bound/malformed actual cost, unknown failure, explicit fallback and real reviewed manual submission after both refusals. |
| `src/app/api/_shared/log.ts` (Mahim's file) | Spend events added plus minimal validated field extension (`reservation_id`, `draft_id`, `upper_usd`, `actual_usd`, `provider_error_id`, `price_id`, and spend `reason` values), approved by Obidit (task owner) 2026-10-16; Mahim's approval (log.ts file owner and lead, AGENTS.md:34) is required in PR review (OD-063-8). |
| `scripts/db/test-db.mjs` | Only the authorised `FILES` array change, registering the new DB suite. |

## Tests-first evidence

Journeys derived from the task and `specs/002-intake-ai/{plan,data-model}.md`: reserve before dispatch, refuse replay/limit/cap, settle known usage once, retain unknown usage, reserve each retry/fallback separately, preserve reviewed manual submission, refuse UNKNOWN pricing.

- RED: `npm test -- tests/spend tests/db/spend.test.ts`, exit 1 before implementation: four suites could not resolve the not-yet-created spend module.
- Behavioural RED after the first implementation: same command, exit 1; 62 passed, 4 failed, 13 DB cases skipped. Invalid USD validation leaked a ZodError instead of E-001. Piped validation now gates decimal parsing before refinement.
- GREEN: same targeted command, exit 0; 66 passed, 13 DB cases skipped at that point. Adding the second manual-refusal scenario raised the DB suite to 14 cases.
- Initial DB run: 12/13 spend cases passed; the manual-submit fixture referenced an unseeded district. The fixture now uses the harness's existing MOCK_DISTRICT; rerun 14/14 passed. A pg concurrent-query deprecation warning from fixture setup was removed by preparing drafts sequentially before the concurrent reservation phase.
- Review-fix round 1 (Codex, interrupted by usage limit): tests written first; RED `npx vitest run tests/spend` 24 failed / 76 passed, then partial implementation. Claude Code resumed: typecheck had 7 errors and 19/108 spend tests failed, all because the shared logger rejects the `reservation_id`/`draft_id`/`upper_usd`/`actual_usd`/`provider_error_id` fields and non-HTTP `reason` values. Logs were remapped to allowlisted keys (`route`, `original_error_id`, dotted `rule`) and the tests updated to match.
- Review-fix round 2 (Claude Code): tests first for E-013 server-input mapping and foreign-`ApiError` remapping (RED: 39 failed / 82 passed after the source/test field change, mostly expected-field updates), then GREEN `npx vitest run tests/spend` 121/121.
- Earlier review-fix RED: `npm test -- tests/spend/service.test.ts`, exit 1; 29 passed, four new diagnostic-log tests failed. Error mapping had hidden the shared transaction helper's safe logs. The wrapper now preserves the original callback error, allows safe logging/rollback, then maps it; failed pool acquisition is logged safely too. GREEN: `npm test -- tests/spend`, exit 0, 70/70 passed.
- Continuation baseline (2026-10-16, Codex): `git status --short`, `git diff`, `npm run typecheck` and `npx vitest run tests/spend` inspected before editing. Typecheck exit 0; 121/121 spend tests passed. The earlier remapping of required logging fields to `rule`/`original_error_id` was identified as incomplete against round 1, rather than accepted as an equivalent fix.
- Continuation RED: `npx vitest run tests/spend`, exit 1; 7 failed / 123 passed (130 total). Invalid adapter timeout masked missing/disallowed principals; invalid reservation metadata masked disallowed principals. Two new constraints-stage tests already passed, establishing E-013 mapping, rollback and no false commit-uncertain event. Added a shared internal principal guard before adapter validation at both entry points. GREEN: the same command exit 0; 130/130 passed. No checkpoint commits were made, per explicit user instruction.
- Continuation review WARN fix: the silent-failure reviewer found immediate unexpected dispatch errors lost their safe class/code/frame when converted to E-013. Updated the existing failure test: RED `npx vitest run tests/spend/paid-call.test.ts`, 1 failed / 29 passed. Carrying `describeError(err)` into the retained/settled event fixed it: GREEN `npx vitest run tests/spend`, 130/130. The reviewer confirmed the WARN resolved in a read-only follow-up; provider messages stay excluded.

## T2 verification (2026-10-16, Claude, after Antigravity G1 edits to paid-call.ts, price-sheet.ts, tests/spend/* and this doc)

lint 0; typecheck 0; build 0; `npm run test:db` 0 (spend DB 20/20); `npm test` 1 failed / 1066 passed on the known load-sensitive `sign-in.test.ts` timing test, which passes alone (11/11). `tests/spend` 133/133. Code read against R1/R2 items: all present. Not verified: reviewer re-review (pending), real prices/routes (UNKNOWN).

## Verification (local, 2026-10-16 00:52, Codex continuation) — SUPERSEDED by the T2 and round-3 runs; /tmp log paths are not durable evidence

Ran the requested chain, `npm run lint && npm run typecheck && npm test && npm run build && npm run test:db`, to completion (exit 0), including a fresh full run after the diagnostic WARN fix. The output was written to a /tmp log, which is not durable evidence; the table below is the only record.

| Command | Exit | Result |
|---|---|---|
| `npm run lint` | 0 | Clean (0 errors, 0 warnings). |
| `npm run typecheck` | 0 | Next route types and strict TypeScript clean. |
| `npm test` | 0 | 1,064 passed; 137 skipped (the gated DB cases); 44 passed files, 5 skipped files. Includes 130 spend unit cases. The known `tests/auth/sign-in.test.ts` timing test passed; no isolated rerun was needed. |
| `npx vitest run tests/spend` | 0 | 130/130 in 4 files. |
| `npm run build` | 0 | Next.js production build; existing six routes build. |
| `npm run test:db` | 0 | 137/137: platform 48, redaction 18, auth 13, case 38, spend 20. PostgreSQL 16.15 + pgvector 0.8.1, throwaway `fera_test_*` databases on 127.0.0.1:54322. |
| `git diff --check` | 0 | No whitespace errors in tracked changes. |
| Scoped security/diff review | 0 | No new dependencies, provider calls, raw payload logging or direct console/sink writes in the spend module. `errors.ts` reads pg messages only for the required compatibility mapping; it never logs them. Frozen files unchanged; `.serena/` ignored. |

Coverage percentage: **not measured**; no Vitest coverage provider is installed and no dependency was added. The repo's D6 count requirements apply instead of the vendored 80% default. Full provider/browser acceptance is not inferred from unit counts.

## Review status

Current Sol verdict: **PASS — ready for PR**, with Mahim's shared-logger approval still required in PR review (OD-063-8). Measured post-G6 results and the current review gate are recorded at the end of this document. TASK-063 is in `review`, not complete; real prices, route/token/browser integration and operational reconciliation remain separate open work.

Historical review record: **Claude fera-review round 1: safeguarding PASS with WARNs (listed in the next sentence), silent-failure BLOCK B1–B3, database/security/typescript WARNs — fixes applied in rounds 1–2, awaiting re-review at that time.** The safeguarding WARNs were BR-023 server-input E-001, foreign `ApiError` pass-through and README route obligations. No earlier PASS without WARNs stands. The continuation audit found the logging-field exception below, so the historical “fixed” statement did not establish completion of round 1 items 2/3/7. Verification commands establish only their measured results; they do not replace reviewer approval.

Round 1 items (lead brief 1–14): settlement-failure discriminator and paid-result preservation (B1); safe `spend.*` logging (B2); late result/failure logging after timeout (B3); branded estimates; caller API ID and `canIntake`; pack-sourced 25 s timeout bound; pricing diagnostics; sturdier 23514 mapping, refusal and commit-uncertain logs; unlocked ownership pre-check; `settlePaidCall` internal; ten-connection and distinct-revision races; principal/kind/billing tests; open decisions; money tests and pinned IDs. Round 2 items 1–4: server-input faults → E-013 + `spend.bad_input`; only spend-owned `ApiError` IDs pass through; README route obligations (OD-063-7); this status text.

Logging items (round 1 items 2/3/7): B2/B3 asked for `reservation_id`, `draft_id`, `upper_usd`, `actual_usd`, `provider_error_id` and spend `reason` codes; item 7 also required the price ID. Following Obidit's approval of OD-063-8 on 2026-10-16 (Mahim's PR approval still required), the minimal validated field extension in `log.ts` was applied, and `paid-call.ts` / `price-sheet.ts` now log these structured facts (`reservation_id`, `draft_id`, `upper_usd`, `provider_error_id`, `price_id`) and reason values ("timeout", "unknown_billing", "bad_actual", "settle_failed") instead of dotted rules, with `actual_usd` on late results reporting a valid cost and `provider_error_id` on late failures. Marked as implemented; verified in the T2/round-3 runs below. Flagged for Mahim's review in the PR.

**Historical Codex fera-review continuation: BLOCK on the logging limit above; superseded by the post-G6 PASS below.** Base/HEAD `0617b4c73eb51ce7610bb29f642244974e063a21`; 18 task-owned tracked/untracked files reviewed without staging. Read-only reviewers: safeguarding BLOCK (cost/correlation facts missing); silent-failure BLOCK (same gap; new immediate-error diagnostic WARN subsequently fixed and confirmed); TypeScript BLOCK (same gap; no other material issue); security WARN (same known gap; no independent blocker); database PASS with existing OD-063-5/6 operational WARNs; React PASS/N/A (shared log delta was event names only at that point, no React/App Router behavior). No reviewers were omitted from the applicable routing. Reviewers did not rerun the full suites; the primary agent's measured checks are above. Subsequent reviews are recorded below.

The shared-logger extension proposal (`/tmp/fera-task063-logger-fields.patch`) was approved by Obidit (task owner) 2026-10-16; Mahim's approval (log.ts file owner and lead, AGENTS.md:34) is required in PR review (OD-063-8). It adds: UUID checks for reservation/draft IDs, bounded decimal checks for USD amounts, an error-ID allowlist, a bounded identifier check for the price ID, and the four spend reason codes. It is applied to `log.ts`, and spend events now carry these facts. Flagged for Mahim's review in the PR; verified in the T2/round-3 runs below.

## Review-brief checklist

| Brief item | Implementation / evidence |
|---|---|
| R1.1 | `failureSource` separates provider/settlement; known-cost settlement failure keeps E-012/E-014; successful paid output returns `unsettled`. |
| R1.2 | Implemented: `reservation_id`, `draft_id`, `upper_usd` and, when known, `provider_error_id` in shared spend facts; spend `reason` values ("timeout", "unknown_billing", "bad_actual", "settle_failed") replace dotted `rule`; verified in the T2/round-3 runs below. |
| R1.3 | Implemented: late success carries `actual_usd` when valid cost reported, `reason` for bad/null actual; `spend.late_failure` carries `provider_error_id`; no automatic settlement; verified in the T2/round-3 runs below. |
| R1.4 | Estimator alone mints `UpperUsdEstimate`; raw strings fail the type boundary; runtime amounts remain validated. |
| R1.5 | Caller API-001/002/007 reaches `canCall`; `canIntake` binds missing/found kind. |
| R1.6 | Integer timeout 1–25,000 ms; tests include 0, max, max+1 and non-integer; pack sources cited above. |
| R1.7 | Implemented: intended E-023 passes through unchanged; unexpected pricing failures log safe error class and `price_id` then map E-023; verified in the T2/round-3 runs below. |
| R1.8 | Context-based 23514 mapping plus text fallback; stale/foreign refusal reasons; uncertain COMMIT event; constraints/COMMIT error mapping tests. |
| R1.9 | Unlocked `SELECT 1` owner/kind pre-check precedes the global lock; scoped revision check retained after reserve. |
| R1.10 | Settlement omitted from the public barrel; README marks it internal; DB tests import the internal service. |
| R1.11 | Ten acquired clients have ten distinct backend PIDs; distinct expected revisions 1..10 race with unique successes. |
| R1.12 | Null/admin/inactive/unverified principals; real DB parent→found/user→missing; bad/over-bound actual cost; settlement failure after E-012/E-014. |
| R1.13 | OD-063-5/6 recorded; historical review status corrected; tracker kept open for re-review. |
| R1.14 | Direct money edge/round-trip tests; error expectations pin contract IDs. |
| R2.1 | Adapter faults → E-013 plus safe field-only diagnostics; principal failures retain E-002/E-003, including when adapter inputs are also bad. |
| R2.2 | Only E-002/003/012/013/014/023 pass; other `ApiError`s → E-013 plus remapping event; constraints and COMMIT paths tested. |
| R2.3 | README route notice/token/anti-reset obligations explicit; OD-063-7 recorded. |
| R2.4 | Prior Claude round-1 verdict and WARNs stated above and in tracker; current command counts measured again. |

## What is NOT done

- Real provider/model identities, prices, billing increments/minimum charges, accounts and the `docs/costs.md` loader (TASK-003); injected values in tests are explicitly synthetic.
- Provider adapters, API-001/002 wiring, draft creation/token signing/verification, notice UI, durable paid-route rate limits and SCREEN-005 integration (TASK-013/014/020/025). The module requires a server-derived principal and token-bound revision; it cannot make an unverified client counter authoritative.
- `npm run spend`/reporting and operator reconciliation (TASK-059), hosted DB/CI execution or live billing evidence. No automatic uncertain-call refund/reaper exists.
- No process-crash or lost-COMMIT recovery is claimed. Such calls conservatively keep consumed revision/reserved budget. No payload/result replay cache exists, because pre-submit payload remains device-local.
- TC-036's API-002 refusal/manual-screen journey and the complete browser portions of TC-043/065 remain integration work. This evidence establishes the service/DB guarantees listed above.

## Open decisions

| ID | UNKNOWN / chosen conservative behaviour | Owner / resolution |
|---|---|---|
| OD-063-1 | A separate paid client-request key is UNKNOWN: the pack specifies rejecting replayed draft revisions, and the frozen reservation table has no unique client-request column. This module uses `(draftId, token-bound expectedRevision)` as the request identity. Stale/repeated revisions refuse with rollback and never dispatch. Explicit server retry/fallback uses the consumed revision and a fresh reservation; it must not be confused with the original HTTP replay. | Obidit to maintain this token contract in TASK-014/020; any distinct durable key requires all-owner schema/contracts review. |
| OD-063-2 | Dedicated replay/settlement error IDs and an expiry error with `manual_form` fallback are UNKNOWN. SQL deliberately conflates missing/expired drafts and six-call refusal. Known SQL limit/cap refusal and scoped owner/revision unavailability use E-023; unknown DB/settlement failure uses E-013. E-019 is not guessed from the conflated SQL error and lacks a manual fallback in the frozen catalogue. | Obidit; all owners if a new or amended contract ID is required. |
| OD-063-3 | Provider/model/prices and all billing rules are UNKNOWN pending TASK-003, OQ-004/OQ-022. `UNKNOWN_PRICE_SHEET` refuses. Typed injected sheets support synthetic tests and future verified values; no rate is presented as real. | Obidit, TASK-003: record verified sources/date and billing units in `docs/costs.md`, then wire the loader. |
| OD-063-4 | Reconciliation timing/evidence for unknown usage and process-crash reservations is UNKNOWN. Retain reserved upper bounds until actual billing is known; identical settlement retry is safe, conflicting actual amounts refuse. Never auto-refund a timeout. | Obidit, coordinate TASK-059 and provider-adapter integration. |
| OD-063-5 | Stale-reservation reconciliation / lost COMMIT acknowledgement leaves reserved budget; no reaper. A failed reservation COMMIT never dispatches or automatically retries; a failed settlement COMMIT preserves paid output as unsettled. Actual durable state can be UNKNOWN. | Obidit, coordinate TASK-059 and provider adapters; reconciliation timing/evidence remains UNKNOWN. |
| OD-063-6 | Expired-draft DELETE granted in `db/roles.sql:124–127` will hit the `ai_reservations.draft_id` FK (`db/schema_v2.sql:364–366`) once a draft has reservations; no cascade or cleanup policy is added here. | Mahim (schema owner); resolve cleanup/retention with all-owner schema review. Frozen schema/roles unchanged. |
| OD-063-7 | The spend module cannot enforce provider notice, draft-token binding or draft re-creation. The API-001/002/007 routes (TASK-014/020) must refuse paid dispatch before the provider notice, take `draftId`/`expectedRevision` only from a verified draft token bound to the session/user, and stop re-created drafts from resetting the six-call counter (TC-043). Recorded in `src/server/spend/README.md`. | Obidit, TASK-014/020; verify in their TC-043 tests. |
| OD-063-8 | Minimal validated field extension to Mahim's `log.ts` (`reservation_id`, `draft_id`, `upper_usd`, `actual_usd`, `provider_error_id`, `price_id`, and spend `reason` values). Decided by Obidit (task owner) 2026-10-16; Mahim's approval (log.ts file owner and lead, AGENTS.md:34) is required in PR review. | Approved by Obidit (task owner) 2026-10-16; Mahim's PR approval pending. Implemented in `log.ts`, `paid-call.ts`, `price-sheet.ts` and test assertions; verified in the T2/round-3 runs below; Mahim's review pending in the PR. |

## Round 3 (2026-10-16, Claude Code)

Fixes from the re-review: log calls in the spend layer cannot throw (`safe-log.ts`), so a broken sink neither skips ROLLBACK nor discards paid output or misreports a committed settlement (SF1, SF2, SF4); `spend.commit_uncertain` carries `route`, `draft_id` and, when known, `reservation_id` (SF3); a non-object dispatch result becomes E-013 with the reservation retained (RW1); `PaidCallError.cause` is now `failureSource` (SN2/RW3); an abort-induced late rejection omits `provider_error_id` (SN1); `controller.abort()` is guarded (RN1). The SW4 test now passes the provider text through a failing dispatch, and the logger rejects bad `actual_usd`, `provider_error_id` and phone-shaped `price_id`. `src/server/case/tx.ts` is unchanged, so SF4 needed no OD for Mahim.

### Measured results (Round 3, 2026-10-16)

- `npm run lint` exit 0
- `npm run typecheck` exit 0
- `npm test` exit 0 (1074 passed, 137 skipped; the sign-in timing test passed in that run)
- `npm run build` exit 0
- `npm run test:db` 48+18+13+38+20 passed (spend DB 20/20)
- `tests/spend` 140/140

Claude reviews before G6 (historical, supplied in the handoff):
- fera-safeguarding-reviewer PASS (WARNs fixed in G6)
- silent-failure re-check: no BLOCK (2 WARN fixed in G6)
- Sonnet review-and-test PASS

G6 polish (Antigravity gemini-3.8-flash-high): items 1–4 plus evidence/tracker edits; G6 could not run commands. Sol performed the post-G6 review and checks below. Mahim remains lead and Obidit owns TASK-063.

## Post-G6 Sol verification (2026-10-16, Asia/Dhaka)

**Verdict: PASS — ready for PR.** The existing shared-logger extension is unchanged by Sol and still needs Mahim's PR approval (OD-063-8). No commit, push, PR, deployment, provider call or dependency change was made. `.env*` was not read and `.serena/` was ignored.

### G6 edit verification and fixes

| G6 item | Sol finding / correction |
|---|---|
| Late non-object dispatch result | Correct: emits `spend.late_result` / `bad_actual` after timeout, keeps the reservation and never settles. The test's `Promise<never>` resolver was invalid TypeScript: the initial `npm run build` exited 1 with TS2322 at `tests/spend/paid-call.test.ts:252`. Fixed the fixture to resolve `Promise<unknown>` through an explicitly invalid adapter cast; expanded it to `undefined`, `null` and a synthetic string. |
| Best-effort console fallback | Fixed a privacy gap: the G6 fallback copied arbitrary string event/reservation fields without the shared logger's validation. It now accepts only `LOG_EVENTS` and canonical lowercase reservation UUIDs, excluding phone-shaped digit runs, and prints no other input fields. A throwing console remains best effort and cannot discard paid output. No shared logger change was needed. |
| Price-sheet logging | Correct: `safeLogger` protects unexpected pricing diagnostics; a throwing logger still returns E-023. Existing regression passes. |
| Regression tests / phone-shaped price ID | The existing shared logger already drops `price_id: "01712345678"` through its phone check. G6's test passes without widening `log.ts`. Added fallback validation and double-sink-failure regressions. |
| Evidence and tracker | Replaced the unmeasured post-G6 placeholder with this measured record; TASK-063 now says `review` and links current results, ownership and open items. |

Fallback tests-first evidence: `npm test -- tests/spend/paid-call.test.ts` exited 1 with **3 failed / 46 passed** before the production fix; the three failures exposed raw fallback fields. After the fix, `npm test -- tests/spend` exited 0 with **150/150 passed**. The double-sink-failure test passed in both runs. No checkpoint commits were made, per instruction.

### Measured checks (post-fix, 09:45–09:46)

| Command | Exit | Measured result |
|---|---|---|
| `npm run lint` | 0 | 0 errors, 0 warnings. |
| `npm run typecheck` | 0 | Next route types generated; 0 TypeScript errors. |
| `npm test` | 0 | **1,084 passed / 137 skipped / 0 failed** (1,221 total); 44 passed files, 5 skipped DB files. The known auth timing test passed in this run; no isolated rerun was needed. |
| `npm run build` | 0 | Production build and TypeScript passed; 8 static-generation entries, 6 application routes. Supersedes the initial TS2322 failure recorded above. |
| `npm run test:db` | 0 | **137/137 passed**, no skipped/failed cases: platform 48, redaction 18, auth 13, case 38, spend 20. PostgreSQL **16.15**, pgvector **0.8.1**; isolated throwaway local DBs, restricted runtime role. |
| `npm test -- tests/spend` | 0 | **150/150 passed**, 4 files. |
| `git diff --check` | 0 | No whitespace errors in tracked changes. |

Coverage percentage remains **not measured**; no coverage provider/dependency was added. Scoped security/diff inspection found no raw payload/provider-message logging or paid provider calls. The spend console fallback is an intentional best-effort write with only a fixed marker, an allowlisted failed event and a validated reservation UUID. Frozen contracts/schema/roles, dependencies, and Mahim's shared logger were unchanged by this Sol pass.

Sol changed only `src/server/spend/safe-log.ts`, `tests/spend/paid-call.test.ts`, this evidence document and `docs/execution/PHASE_2_MUST_CORE.md`. All other lane changes were committed.

### Current review gate

**FERA-REVIEW: PASS.** Read-only review of the 19 task-owned tracked/untracked files against base/HEAD `0617b4c73eb51ce7610bb29f642244974e063a21`: safeguarding PASS, TypeScript PASS, silent-failure PASS, security PASS, database PASS, React PASS/N/A. No applicable reviewer omitted; no BLOCK findings. Existing safeguarding/operational WARNs remain the route notice/token/anti-reset obligations, uncertain-billing reconciliation and draft FK retention (OD-063-4–7). No reviewer edits or test reruns; measured commands above were run by Sol. Reviewers were instructed to exclude `.env*` and `.serena/`.

Final safeguarding delta gate on 5cecbc0 (2026-10-16): PASS with 3 WARNs; the null-input guard and the commit-state wording were fixed in the WARN-fix commit; the lead difference between main and phase2 AGENTS.md is noted for the OD-063-8 approver.

Open items remain OD-063-1–8: Mahim's PR review of the existing shared-logger extension; verified pricing/loader (TASK-003); provider/notice/token/anti-reset and manual-screen wiring (TASK-013/014/020/025); spend reporting/reconciliation (TASK-059), uncertain-COMMIT reservations and schema-owner FK cleanup. No live billing, hosted/CI execution or full browser acceptance is claimed.
