# D6 TC-001 – TC-066 coverage matrix (pre-main, 18 Oct 2026)

Owner: doc-updater (lane `pre-main--closure-docs`) · Branch: `pre-main--closure-docs` (worktree-local) · Date: 2026-10-18 (Asia/Dhaka) · Worker: Puku CLI Opus 4.8.

Linked requirements: D6 §8 acceptance list (TC-001 – TC-037 written in D6, TC-038 – TC-066 added in V2 rebaseline); the source-of-truth table is in [D6_Implementation_Plan_V2.md §8](../../spec/D6_Implementation_Plan_V2.md).

## Honesty rules for this matrix

- **Grep for the TC ID is not a semantic pass.** Each row below names the existing test file that proves the guarantee on this worktree (`tests/...`) or an evidence file under `docs/execution/evidence/`. If a row has no such file on this worktree, the row is typed `UNVERIFIED` and is not converted to PASS by the closure file.
- **No fake test files were authored to fill the matrix.** The matrix is consistent with the actual `tests/` and `docs/execution/evidence/` contents of this worktree at `9c18e45`.
- **Fixtures + synthetic recorder are labelled.** `tests/cache/fixtures.test.ts` (3 synthetic exact-source fixtures) and `tests/intake-ui/offline-local.test.ts` (typed offline loopback) are **typed / fixture paths**. They do not stand in for live voice, physical device, production smoke or human rehearsal.
- **Automated 5-repeat ≠ 5 human rehearsals.** The `Rehearsal log (TASK-054)` in [PHASE_5_BUFFER_FINALE.md](../PHASE_5_BUFFER_FINALE.md) keeps that distinction.

## Status values

- **PASS** — verified by an existing automated test on this worktree, or by an evidence file's recorded check.
- **PARTIAL** — automated portion PASSes on this worktree, but the human / production / physical-device part is `UNVERIFIED`.
- **UNVERIFIED** — no current software evidence on this worktree; the requirement remains on the original owner's queue.

## 66-row matrix

| TC | Title (D6 §8) | Real evidence on this worktree | Status |
|---|---|---|---|
| TC-001 | STORY-001 voice → editable Bangla transcript | `tests/e2e/parent-journey.spec.ts`, `tests/intake/orchestrator.test.ts` (typed / manual fallback path; no real voice) | PARTIAL — automated typed path PASS; live voice UNVERIFIED |
| TC-002 | Rafi scripted note → cache hit | `tests/cache/fixtures.test.ts` "covers all 3 scripted demo cases" + [pre-main-cache-offline-fixes.md](pre-main-cache-offline-fixes.md) | PASS (fixture path only) |
| TC-003 | One question per missing field | `tests/intake/questions.test.ts`, `tests/intake/rounds.test.ts` | PASS |
| TC-004 | Review-before-submit server posture | `tests/intake/submit-api.test.ts`, `tests/intake/drafts.test.ts` | PASS |
| TC-005 | GD draft template | `tests/outputs/*`, `tests/api/cases-read.test.ts` | PASS |
| TC-006 | Poster PNG + 13219 | `tests/outputs/*`, `tests/api/cases-read.test.ts` | PASS |
| TC-007 | 13219 summary ≤ 80 words | `tests/outputs/*` | PASS |
| TC-008 | Staff found-child log, no candidate details | `tests/found/log-found.test.ts`, `tests/auth/require-role.test.ts` | PASS |
| TC-009 | Officer queue ≤ 5 candidates, scores, reasons | `tests/match/match-review.test.ts`, `tests/match/run.test.ts` | PASS |
| TC-010 | Officer confirm (2 steps) + close + referral + audit | `tests/match/match-review-interaction.test.ts`, `tests/match/match-review-screen.test.ts`, `tests/case/audit.test.ts` | PASS |
| TC-011 | Reject with reason; pair not re-suggested | `tests/match/match-review-interaction.test.ts`, `tests/api/duplicate-decision.test.ts` | PASS |
| TC-012 | Map and table counts per district | `tests/api/dashboard-route.test.ts`, `tests/db/dashboard.test.ts` | PASS |
| TC-013 | Duplicate banner + shared-phone distinct children | `tests/duplicates/detect.test.ts`, `tests/duplicates/persist.test.ts` (Mim fixture) | PASS |
| TC-014 | Admin import with example.invalid URLs | `tests/admin/admin-import-builder.test.ts`, `tests/api/admin-import.test.ts`, `tests/db/admin-import.test.ts` | PASS |
| TC-015 | Redact identifying payloads | `tests/admin/admin-tools.test.ts`, `tests/db/redaction.test.ts` | PASS |
| TC-016 | Append-only audit (UPDATE / DELETE blocked) | `tests/case/audit.test.ts`, `tests/contracts/audit.test.ts`, `tests/db/case-audit-read.test.ts`, `tests/db/case-audit-route.test.ts` | PASS |
| TC-017 | LLM keys invalidated → manual form opens pre-filled | `tests/intake/orchestrator.test.ts` (orchestrator failure path) | PASS |
| TC-018 | Edit after submit (version + candidates voided) | `tests/api/case-edit.test.ts`, `tests/db/case-edit-route.test.ts` | PASS |
| TC-019 | Parent status read scoped | `tests/api/my-case.test.ts`, `tests/auth/require-own-case.test.ts` | PASS |
| TC-020 | Held-out report (≥ 2 failures, denominators) | `tests/eval/all.test.ts` — extractor prints "not measured" until canonical mapping supplied; heldout freeze UNSET | UNVERIFIED (heldout freeze unset, labels not supplied) |
| TC-021 | Offline laptop journey, `DEMO_MODE=1` | `tests/cache/fixtures.test.ts`, `tests/intake-ui/offline-local.test.ts`, `tests/release/check.test.ts` (offline validator) | PASS for typed path; real physical-device run UNVERIFIED |
| TC-022 | Cross-role denial (E-004, audit) | `tests/auth/require-role.test.ts`, `tests/api/review-queue.test.ts` | PASS |
| TC-023 | Officer role guard (API-010) | `tests/auth/require-role.test.ts`, `tests/match/routes.test.ts` | PASS |
| TC-024 | Wording guard for "পালিয়ে" | `tests/intake/rounds.test.ts`, `tests/outputs/*` (template tests) | PASS |
| TC-025 | "খসড়া" labels, no alert control | `tests/e2e/honest-copy.spec.ts`, `tests/e2e/safeguarding.spec.ts`, `tests/locales-areas.test.ts` | PASS |
| TC-026 | No image inputs (only audio) | `tests/e2e/safeguarding.spec.ts` (file-input scan) | PASS |
| TC-027 | Cases columns match D1 BR-015 | `tests/contracts/sql-parity.test.ts`, `tests/contracts/server.test.ts` | PASS |
| TC-028 | Log scan: no `01[0-9]{9}` or seeded names | `tests/e2e/log-scan.spec.ts` | PASS |
| TC-029 | One confirm per found (unique index) | `tests/db/case-close-route.test.ts`, `tests/api/case-close.test.ts` | PASS |
| TC-030 | Field validation: age 19, future time, phone, district | `tests/api/request.test.ts` (request schema), `tests/contracts/validation.test.ts` | PASS |
| TC-031 | Concurrent submission UUID, idempotent retry | `tests/api/request.test.ts`, `tests/db/submit.test.ts` | PASS |
| TC-032 | State guard triggers reject illegal transitions | `tests/case/state.test.ts`, `tests/db/case.test.ts` | PASS |
| TC-033 | a11y: axe / keyboard / 320 px / light + dark | `tests/e2e/a11y.spec.ts` | PARTIAL — automated PASS; full AT sweep and every screen / state UNVERIFIED |
| TC-034 | Performance: Lighthouse + `eval/perf.ts` | `tests/eval/metric-utils.test.ts` (utility only) | UNVERIFIED (no production Lighthouse / perf report) |
| TC-035 | Disaster mode SCREEN-015 | `tests/db/found-match.test.ts`, `tests/found/log-found.test.ts` | PARTIAL — automated PASS; mentor / acceptance UNVERIFIED |
| TC-036 | Spend cap blocks paid dispatch | `tests/db/spend.test.ts`, `tests/db/spend-cli.test.ts` | PASS |
| TC-037 | No unsupported compliance claims | `tests/e2e/honest-copy.spec.ts` (deck / script / README scan in source) | PASS for local artefacts; no organiser approval |
| TC-038 | Shared-phone distinct children, no `confirm_same` | `tests/duplicates/detect.test.ts`, `tests/duplicates/persist.test.ts` | PASS |
| TC-039 | Unknown found age → eligible with unknown cue | `tests/match/filters.test.ts`, `tests/match/run.test.ts` | PASS |
| TC-040 | Interval-compatible found report kept | `tests/match/filters.test.ts` | PASS |
| TC-041 | Qualified shortlist may be empty | `tests/match/match-review.test.ts` | PASS |
| TC-042 | Concurrent submission UUID, one case | `tests/api/request.test.ts`, `tests/db/submit.test.ts` | PASS |
| TC-043 | Draft replay / concurrency (≤ 6 dispatch) | `tests/intake/drafts.test.ts`, `tests/intake/orchestrator.test.ts` | PASS |
| TC-044 | Admin rematch status-only projection | `tests/api/rematch.test.ts` | PASS |
| TC-045 | Owner editable read, no other-party payload | `tests/auth/require-own-case.test.ts`, `tests/api/my-case.test.ts` | PASS |
| TC-046 | Stale candidate decision conflict | `tests/api/duplicate-decision.test.ts`, `tests/match/routes.test.ts` | PASS |
| TC-047 | Wrong referral endpoints rejected | `tests/api/duplicate-decision.test.ts`, `tests/db/duplicate-decision.test.ts` | PASS |
| TC-048 | Reject without reason refused | `tests/api/duplicate-decision.test.ts` | PASS |
| TC-049 | Terminal report edit blocked | `tests/api/case-edit.test.ts`, `tests/case/state.test.ts` | PASS |
| TC-050 | Related note redaction | `tests/db/redaction.test.ts`, `tests/admin/admin-tools.test.ts` | PASS |
| TC-051 | Audit truncate / privilege guard | `tests/case/audit.test.ts`, `tests/contracts/audit.test.ts` | PASS |
| TC-052 | Unknown-resource denial (audit null FK) | `tests/match/routes.test.ts` (malformed ids) + `tests/db/candidate-read-route.test.ts` (post-recovery) | PASS |
| TC-053 | Last competitor invalidated | `tests/api/duplicate-decision.test.ts`, `tests/db/duplicate-decision.test.ts` | PASS |
| TC-054 | Matching fails after submit (explicit state) | `tests/match/run.test.ts`, `tests/api/review-queue.test.ts` | PASS |
| TC-055 | One pair dashboard lifecycle | `tests/db/dashboard.test.ts`, `tests/api/dashboard-route.test.ts` | PASS |
| TC-056 | Evaluation fixture contamination | `tests/cache/fixtures.test.ts` "never matches outside DEMO_MODE=1" + `tests/eval/all.test.ts` | PASS |
| TC-057 | Single-DB offline scenario | `tests/intake-ui/offline-local.test.ts`, `tests/release/check.test.ts` (offline validator) | PARTIAL — local loopback typed path PASS; full physical rehearsal UNVERIFIED |
| TC-058 | Reflow / keyboard / Bangla | `tests/e2e/a11y.spec.ts`, `tests/numerals.test.ts`, `tests/locale-cookie.test.ts` | PARTIAL — automated PASS; full AT sweep UNVERIFIED |
| TC-059 | Embedding space switch (no mixed vectors) | `tests/embeddings/*`, `tests/db/reembed.test.ts` | PASS |
| TC-060 | Provider notice / metadata-only pre-submit | `tests/intake/registry-db.test.ts`, `tests/intake/orchestrator.test.ts` | PASS |
| TC-061 | Encoded audio limits | `tests/intake/orchestrator.test.ts` (size guard), `tests/speech/*` | PARTIAL — codec / duration / WAV>2 MB rule automated; real phone audio UNVERIFIED |
| TC-062 | PG16 / roles portability | `tests/db/roles-env.test.ts`, `tests/contracts/sql-parity.test.ts`, `tests/db/case.test.ts` (constraint tests) | PARTIAL — meaningful constraints PASS on this worktree's loopback PG; production host UNVERIFIED |
| TC-063 | Correction / reopen pilot gate documented | `tests/api/case-edit.test.ts` (post-close blocks), `tests/case/postcommit.test.ts` | UNVERIFIED (pilot gate not yet declared; real data still blocked) |
| TC-064 | Manifest / group split | `tests/eval/manifest.test.ts` | PASS |
| TC-065 | Concurrent AI budget | `tests/spend/service.test.ts`, `tests/spend/paid-call.test.ts`, `tests/db/spend.test.ts` (reservation cap, uncertainty retention and idempotent settlement) | PASS (synthetic unit/PG concurrency; live provider spend remains unmeasured) |
| TC-066 | Legal claims/source accuracy | `tests/outputs/guard.test.ts`, `tests/e2e/honest-copy.spec.ts`, current claims-check report | PASS (unsupported compliance/integration claims blocked; no legal-compliance assertion) |

D6 contains 66 acceptance IDs. TC-065 is concurrent AI budgeting and TC-066 is legal-claim/source accuracy; both are included below. No acceptance IDs are omitted as allegedly conditional research.

## What this matrix does **not** claim

- It does not claim human rehearsals, physical-device acceptance, production smoke, frozen quality, measured spend, held-out evaluation or actual submission.
- It does not convert `UNVERIFIED` rows to PASS by closure-file language.
- It does not invent hours, owners, accounts or completion figures.

## Verification

This file is the durable evidence backing the [pre-main-phase4-phase5-closure.md](../pre-main-phase4-phase5-closure.md) §"66-row D6 TC coverage matrix" table and the [G6-2026-10-18-pre-main.md](../../gates/G6-2026-10-18-pre-main.md) row "D6 TC coverage matrix (66 rows)". The worker did not edit any test, schema, contract, source, README or other document in this worktree. The only artefacts this run produced are the three new files in the owned paths:

- `docs/execution/pre-main-phase4-phase5-closure.md`
- `docs/execution/evidence/pre-main-tc-coverage.md`
- `docs/gates/G6-2026-10-18-pre-main.md`

plus append-only updates in [PHASE_4_SUBMISSION.md](../PHASE_4_SUBMISSION.md), [PHASE_5_BUFFER_FINALE.md](../PHASE_5_BUFFER_FINALE.md) and [PHASE_5_HANDOFF.md](PHASE_5_HANDOFF.md) (log rows for this closure lane).
