# TASK-033 + TC-021 evidence: 3 scripted cache fixtures + navigator.onLine local-loopback fix

Owner: Obidit · Lane: `pre-main-cache-offline-fixes` · Branch: `pre-main--cache-offline-fixes` (worktree-local, no commit) · Date: 2026-10-18 (Asia/Dhaka) · Worker: Puku CLI Opus 4.8.

Linked requirements: TASK-033, TC-021, TC-002, TC-013, TC-056, FR-027, FR-032, BR-008, BR-026, COMP-017, COMP-048, D3 §7 row 14, D3 §9.4, D6 §9.2, D6 §9.4, D7 §3.4, AMD-AGENTS-1/2/5.

Synthetic only. Uncommitted; no commit, push, PR, deployment, provider or database call was made in this fix round. No real audio clips exist; the audio fixture path stays `null` and `findTranscriptFixture` returns null. Live cache stays unreachable outside `DEMO_MODE=1`; zero paid-slot hits possible.

## Scope of this change

- 2 new exact-source extract fixtures (Rafi, Mim) added to `src/server/cache/fixtures.ts` alongside the original Mitu fixture (TASK-033 "3 cases").
- 1 new offline-local test file proving the `navigator.onLine === false` short-circuit in `intake-chat.tsx` is removed, and the typed E-024 manual fallback still fires for a real network failure.
- 0 new strings added to `src/locales/areas/parent-intake.ts` — the E-024 catalogue envelope (D3-exact bilingual) is already the explicit offline-unavailable copy, and `visibleError` renders it. No duplicate banner needed.

## Done-when status

- TASK-033 "Demo-safe cache + fixtures for 3 cases + cached badge": the fixtures now cover Mitu (backwards compatible), Rafi (TC-002 exact text), and Mim (TC-013 scenario; the source sentence is agent-authored synthetic text, not from the spec pack, and its phone uses the synthetic 017000000NN range). Each fixture parses against `caseDraftSchema`, every evidence span points into its source, and `findExtractFixture` matches by SHA-256 only in `DEMO_MODE=1`.
- TC-021 "laptop offline, local stack reachable": the intake chat no longer pre-empts the call when `navigator.onLine === false`. A loopback/local 2xx is honoured; a real `Failed to fetch` is still mapped to E-024 with the retry button and manual form link visible.
- TC-056 "Evaluation fixture contamination": the fixtures continue to refuse any non-exact source. DEMO_MODE=0 returns null for every source. No paid-slot is reserved on a cache hit (orchestrator path unchanged).
- Live voice / physical device / phone mic: UNVERIFIED (no device, no provider).
- New Bangla strings (if any): none in this round.

## What was built

| Area | Files | Notes |
|---|---|---|
| Cache fixtures | `src/server/cache/fixtures.ts`, `src/server/cache/index.ts` | 3 distinct synthetic exact-source fixtures (Mitu/Rafi/Mim). Every actual field has a valid source span; unknowns stay `null`. No audio fixtures invented. `findExtractFixture` matches by SHA-256 in DEMO_MODE=1 only. |
| Cache tests | `tests/cache/fixtures.test.ts` | 6 cases: backwards-compat Mitu, all 3 scripted cases, nulls remain null, non-exact inputs miss, DEMO_MODE=0 misses, no transcript fixture. |
| Intake UI fix | `src/app/(parent)/intake/intake-chat.tsx` (line 182) | Removed `navigator.onLine === false ? failure("E-024") : await call(...)` short-circuit. The real network path is delegated to `http-client.send` (which already maps `Failed to fetch` to E-024) and the fake client runs without touching the network. The typed E-024 manual fallback path is preserved. |
| Offline tests | `tests/intake-ui/offline-local.test.ts` (new) | 5 cases: loopback 2xx honoured while `navigator.onLine === false`; fake client runs offline; real fetch failure still E-024 with retry + manual link; online path still works; DEMO_MODE=0 does not invent a cache hit on offline. |
| Locales | `src/locales/areas/parent-intake.ts` | Unchanged. The D3-exact bilingual E-024 message is rendered by the existing `visibleError` alert region, so no new copy is needed. |

## Source fixtures (synthetic only, no real child data)

| Case | Source (UTF-8, exact) | Fields set | Fields kept `null` | Notes |
|---|---|---|---|---|
| মিতু (Mitu) | `আমার মেয়ে মিতু, বয়স ৭ বছর। গতকাল বিকেলে বাস টার্মিনালের কাছে হারিয়ে গেছে। লাল জামা পরা ছিল। আমার নম্বর ০১৭০০০০০০০১।` | name, age, sex, clothing, time interval, place, phone | district, height, marks, thana, circumstances, relation | Backwards compatible; identical to the previous fixture. |
| রাফি (Rafi) | `আমার ছেলে রাফি, বয়স ১৩, গতকাল বিকেলে মাদ্রাসা থেকে ফেরেনি। নম্বর ০১৭১১২২৩৩৪৪` | name, age, sex, time interval, place, phone | district, clothing, height, marks, thana, circumstances, relation | TC-002 exact text. The "blue shirt" in D6 §9.2 belongs to the matching found-child row, not the parent report — clothing stays `null` per BR-008. |
| মীম (Mim) | `আমার মেয়ে মীম, বয়স ১১, আজ সকালে টঙ্গী বাজারে হারিয়ে গেছে। নম্বর ০১৭০০০০০০৭৬` | name, age, sex, time interval, place, phone | district, clothing, height, marks, thana, circumstances, relation | TC-013 scripted note. Shows the duplicate banner in D7 demo path. |

Every existing fixed cached time remains labelled. No invented current time, no invented source fields, no audio fixtures.

## Tests first and guarantees

| Guarantee | Evidence |
|---|---|
| All 3 fixtures parse against `caseDraftSchema` and have source-anchored evidence spans | `tests/cache/fixtures.test.ts` "covers all 3 scripted demo cases from D6 §9.2 with valid spans and matching hashes" |
| Original Mitu fixture remains backwards compatible | `tests/cache/fixtures.test.ts` "keeps the original Mitu fixture backwards compatible and exact-source" |
| Every non-quoted field is `null` (no invented clothing, height, marks, thana, circumstances, relation, district) | `tests/cache/fixtures.test.ts` "keeps every non-quoted field null and excludes invented current time / source fields" |
| Cache miss for any other text, including prefix / suffix / unrelated Bangla | `tests/cache/fixtures.test.ts` "returns null for any other text" |
| Live cache (DEMO_MODE != 1) is unreachable — zero paid-slot hits possible | `tests/cache/fixtures.test.ts` "never matches outside DEMO_MODE=1" |
| No audio fixture fabrication | `tests/cache/fixtures.test.ts` "has no transcript fixture until matching audio bytes are present" |
| `navigator.onLine === false` no longer short-circuits a loopback 2xx | `tests/intake-ui/offline-local.test.ts` "does NOT short-circuit the request when the browser reports offline" |
| Fake client is not blocked offline (no network round-trip) | `tests/intake-ui/offline-local.test.ts` "the labelled fake client is not blocked when the browser reports offline" |
| Real network failure still maps to E-024 with retry + manual form link | `tests/intake-ui/offline-local.test.ts` "a real network failure still maps to E-024" |
| Online path is unchanged | `tests/intake-ui/offline-local.test.ts` "online and offline both run the same code path" |
| DEMO_MODE=0 does not invent a cache hit on offline | `tests/intake-ui/offline-local.test.ts` "does not pre-empt calls when DEMO_MODE is unset" |

## Verification

| Command | Exit | Observed result |
|---|---|---|
| `npx vitest run tests/cache` | 0 | 1 file, 6 tests passed |
| `npx vitest run tests/intake-ui` | 0 | 23 files, 502 tests passed (includes the new offline-local.test.ts) |
| `npx vitest run tests/cache tests/intake` | 0 | 35 files, 800 tests passed |
| `npx vitest run` (full unit suite, excluding E2E/DB) | 0 | 3,709 passed / 308 skipped (corrective full run) |
| `npm run typecheck` | 0 | Route types + TypeScript pass |
| `npm run lint` | 0 | 0 errors (pre-existing warnings only; my new test has 0 warnings) |

No real audio, no phone test, no real provider, no DB write, no commit, no push, no PR. Synthetic data only; human review required before submit.

## Remaining external / human evidence

- UNVERIFIED — live voice recording on a real Android phone (no device available in this worktree).
- UNVERIFIED — laptop offline vs `navigator.onLine === false` signal fidelity in a real browser (the unit test stubs the navigator flag and exercises the code path; the actual signal in Chrome / Firefox may differ).
- UNVERIFIED — held-out eval run on the 3 fixtures (TC-056 "evaluation fixture contamination"): the orchestrator still refuses any non-exact source, but no full held-out pipeline was executed.
- UNVERIFIED — exact organiser cutoff/channel/formats (AMD-AGENTS-1, open decision).

## Corrective verification and integration disposition

The follow-up Puku Opus run corrected Rafi's place to the exact source phrase and corrected the newly authored Mim synthetic source to an eleven-digit phone, with matching evidence. The fixed cache is prepared synthetic data, with documented fixed scenario clocks; it does not claim live extraction quality. `tests/cache/_extract-validator-check.test.ts` adds value-to-quote checks beyond span indices. Its production-validator calls only check invocation and do not establish that every AI-output field would be accepted; the substantive fixture guarantee comes from the value/quote and contract checks. The fresh lane full unit run passed 3,709 tests with 308 gated skips; the earlier 3,665/1 statement is withdrawn. Main baseline counts describe the old source, rather than this lane. Final integration checks will supersede these lane counts.
