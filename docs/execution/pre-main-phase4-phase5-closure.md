# Pre-main Phase 4–5 closure — 18 October 2026

> **Current status (18 Oct 2026, late).** User steering now **authorises completing Phase 4 and Phase 5 except the media-file submission itself**, then verifying the staged pre-main before handing it to the user for the human main-merge approval. The earlier "be ready to start, not actually start" framing is superseded: Phase 5 software work is `IN PROGRESS / REVIEW` until final software evidence is in place, **not** the previous "prepared, not started". **Human formal G5 / G6 are still unpassed**: pending requirements (organiser instructions, 50 human labels, 60 audio clips, 2 Android devices, 5 person timing study, Bangla human review, provider accounts/prices, production DB, Drive / public sharing, five human rehearsals, spare-laptop / mentor clearance) remain in the original owners' queues and are not inferred from a software test. See the **Pending human / external blocks** section below.

This file is the worker-level closure of the pre-main integration cycle. It records the integrated root, durable per-lane evidence, the 66-row D6 TC coverage matrix (with real existing test paths or typed `UNVERIFIED`), the 26-test release-checker status, the 3-scripted-cache fixture status and the gaps that remain. Historical tables in [PHASE_4_SUBMISSION.md](PHASE_4_SUBMISSION.md) and [PHASE_5_BUFFER_FINALE.md](PHASE_5_BUFFER_FINALE.md) are preserved; the new user quote at the top of this file and the "Pending human / external blocks" list are the authoritative current status.

---

## Latest user steering (supersedes the "prepared, not started" framing)

- **Scope authorised by user:** complete Phase 4 and Phase 5 across all three owners **except** the media-file submission itself (Round 2 deck / video / Drive upload / selection-email send).
- **Branch workflow:** primary implementation / debugging / testing uses isolated Puku CLI Opus 4.8 lanes. The coordinator stages work on `pre-main--closure-docs` (worktree at `.worktrees/pre-main-closure-docs`), the user verifies, and the user then approves the merge to `main`. The coordinator does **not** merge `main` automatically.
- **Phase 5 software state:** mark as `IN PROGRESS / REVIEW` until the final software-side evidence is complete. Do **not** leave Phase 5 on the older "prepared, not started" label.
- **Human formal G5 / G6:** stay unpassed because the pending external / human requirements remain. The user steering permits a software-pass-then-hold pattern; it does not authorise marking the human-facing gates as PASS, because tests cannot stand in for human evidence, production acceptance, frozen quality or actual submission.

## Root known facts (integrated on pre-main)

- **Candidate audit recovery** — pre-main re-ran the TASK-028 three-file fix independently on top of the all-branch recovery baseline; see [evidence/pre-main-candidate-audit.md](evidence/pre-main-candidate-audit.md).
- **3 labelled cache fixtures + `navigator.onLine` fix** — Mitu / Rafi / Mim exact-source fixtures and the offline-loopback fix on `intake-chat.tsx`; see [evidence/pre-main-cache-offline-fixes.md](evidence/pre-main-cache-offline-fixes.md).
- **Release checker** — `tests/release/check.test.ts` carries the local 27 assertions; relative paths and a QA backup plan are documented at the root `docs/demo/backup-plan.md` and `docs/demo/qa-prep.md` (introduced at root release `173202f`).
- **Spec-kit 003 plans / tasks** — `specs/003-parent-outputs` plans and tasks were recovered on pre-main; see [evidence/pre-main-convergence-intake.md](evidence/pre-main-convergence-intake.md) and commit `ec1b9f3` "recover parent output plans and reconcile platform intake tasks [TASK-053]".
- **Intake / platform all-owner status** — verified by sibling evidence under `docs/execution/evidence/`.
- **Production build PASS** — verified by the final run in `/tmp/fera-pre-main-final-verification.json` (`build.status = PASS`, `exit_code = 0`).
- **Full DB 321 / 31 PASS** — same verification file (`db.passed = 321`, `db.files = 31`).
- **Full browser 78 / 0 skip PASS in 56.2 s** — same verification file (`e2e.passed = 78`, `e2e.skipped = 0`, `e2e.duration_seconds = 56.2`).
- **Logs metadata:** `/tmp/fera-pre-main-final-verification.json`; source commits documented there.

### Source provenance of the final pre-main state

| Layer | Head commit | Source note |
|---|---|---|
| Application source (pre-main head) | `9c18e45` | "merge: recover and reconcile platform intake output specifications" — current `pre-main--closure-docs` worktree |
| e2e run commit | `b459f6e` | "merge: integrate local release checks and finale preparation [TASK-046 TASK-058]" |
| Final release (root) | `173202f` | "feat(release): validate local submission assets and document finale fallback [TASK-046 TASK-058]" |
| All-branch reconciliation | `7f0bc03`, `74266c4` | doc-updater / branch-audit lane |
| External PR50 landing (mahim-organiser 18:45) | `7da226b` | merged into pre-main by another actor; 8-slide PPT + Bangla video end card + platform form text — **source-attributed, not independently verified**; platform / share / recipient access pending |
| `main` (unchanged by coordinator) | `8499bce` | "Merge pull request #49 from tashobi02/phase4--landing-record" |

### Current model and dev split

- **Current model native 6 / 6 and dev predict 1 / 1 PASS** at `src` unchanged subtree `641bdef`.
- **Dev metric recall** recall@5 25/25, top-1 23/25, no-match false positives 5/7, dedupe 12 / 302, recall 12 / 12 F1 7.64 %.
- **Heldout freeze** UNSET, not loaded; quality NOT frozen. The dev diagnostic is the original f25 measurement; release metrics are not measured.

## 66-row D6 TC coverage matrix (current pre-main)

Scope: D6 §8 acceptance list. Each row is annotated with a real existing test path / evidence file or typed `UNVERIFIED` where no such path exists on the current pre-main. **A grep for the TC ID alone is not a semantic pass**; the matrix lists the file that proves the guarantee. **No fake test files were authored to fill the matrix** — the matrix is consistent with what `tests/` and `docs/execution/evidence/` actually contain on this worktree.

Status values:
- **PASS** — verified by an existing automated test on this worktree, or by an evidence file's recorded check.
- **PARTIAL** — automated portion passes on this worktree, but the human / production / physical-device part is `UNVERIFIED`.
- **UNVERIFIED** — no current software evidence on this worktree; the requirement remains on the original owner's queue.

| TC | Title (D6 §8) | Real evidence on this worktree | Status |
|---|---|---|---|
| TC-001 | STORY-001 voice → editable Bangla transcript | `tests/e2e/parent-journey.spec.ts`, `tests/intake/orchestrator.test.ts` (no real voice; typed/manual fallback path) | PARTIAL — automated typed path PASS; live voice UNVERIFIED |
| TC-002 | Rafi scripted note → cache hit | `tests/cache/fixtures.test.ts` "covers all 3 scripted demo cases" + [evidence/pre-main-cache-offline-fixes.md](evidence/pre-main-cache-offline-fixes.md) | PASS (fixture path only) |
| TC-003 | One question per missing field | `tests/intake/questions.test.ts`, `tests/intake/rounds.test.ts` | PASS |
| TC-004 | Review-before-submit server posture | `tests/intake/submit-api.test.ts`, `tests/intake/drafts.test.ts` | PASS |
| TC-005 | GD draft template | `tests/outputs/*` (see `tests/outputs/`) + `tests/api/cases-read.test.ts` | PASS |
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
| TC-016 | Append-only audit (UPDATE/DELETE blocked) | `tests/case/audit.test.ts`, `tests/contracts/audit.test.ts`, `tests/db/case-audit-read.test.ts`, `tests/db/case-audit-route.test.ts` | PASS |
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
| TC-028 | Log scan: no 01[0-9]{9} or seeded names | `tests/e2e/log-scan.spec.ts` | PASS |
| TC-029 | One confirm per found (unique index) | `tests/db/case-close-route.test.ts`, `tests/api/case-close.test.ts` | PASS |
| TC-030 | Field validation: age 19, future time, phone, district | `tests/api/request.test.ts` (request schema), `tests/contracts/validation.test.ts` | PASS |
| TC-031 | Concurrent submission UUID, idempotent retry | `tests/api/request.test.ts`, `tests/db/submit.test.ts` | PASS |
| TC-032 | State guard triggers reject illegal transitions | `tests/case/state.test.ts`, `tests/db/case.test.ts` | PASS |
| TC-033 | a11y: axe / keyboard / 320 px / light+dark | `tests/e2e/a11y.spec.ts` | PARTIAL — automated PASS; full AT sweep and every screen/state UNVERIFIED |
| TC-034 | Performance: Lighthouse + `eval/perf.ts` | `tests/eval/metric-utils.test.ts` (utility only) | UNVERIFIED (no production Lighthouse / perf report) |
| TC-035 | Disaster mode SCREEN-015 | `tests/db/found-match.test.ts`, `tests/api/*` (disaster mode flag tests in `tests/found/log-found.test.ts`) | PARTIAL — automated PASS; mentor / acceptance UNVERIFIED |
| TC-036 | Spend cap blocks paid dispatch | `tests/db/spend.test.ts`, `tests/db/spend-cli.test.ts` | PASS |
| TC-037 | No unsupported compliance claims | `tests/e2e/honest-copy.spec.ts` (deck / script / README scan in source) | PASS for local artefacts; no organiser approval |
| TC-038 | Shared-phone distinct children, no confirm_same | `tests/duplicates/detect.test.ts`, `tests/duplicates/persist.test.ts` | PASS |
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
| TC-059 | Embedding space switch (no mixed vectors) | `tests/embeddings/*` (see `tests/embeddings/`) + `tests/db/reembed.test.ts` | PASS |
| TC-060 | Provider notice / metadata-only pre-submit | `tests/intake/registry-db.test.ts`, `tests/intake/orchestrator.test.ts` | PASS |
| TC-061 | Encoded audio limits | `tests/intake/orchestrator.test.ts` (size guard) + `tests/speech/*` | PARTIAL — codec / duration / WAV>2 MB rule automated; real phone audio UNVERIFIED |
| TC-062 | PG16 / roles portability | `tests/db/roles-env.test.ts`, `tests/contracts/sql-parity.test.ts`, `tests/db/case.test.ts` (constraint tests) | PARTIAL — meaningful constraints PASS on this worktree's loopback PG; production host UNVERIFIED |
| TC-063 | Correction / reopen pilot gate documented | `tests/api/case-edit.test.ts` (post-close blocks), `tests/case/postcommit.test.ts` | UNVERIFIED (pilot gate not yet declared; real data still blocked) |
| TC-064 | Manifest / group split | `tests/eval/manifest.test.ts` | PASS |
| TC-065 | Concurrent AI budget | `tests/spend/service.test.ts`, `tests/spend/paid-call.test.ts`, `tests/db/spend.test.ts` (reservation cap, uncertainty retention and idempotent settlement) | PASS (synthetic unit/PG concurrency; live provider spend remains unmeasured) |
| TC-066 | Legal claims/source accuracy | `tests/outputs/guard.test.ts`, `tests/e2e/honest-copy.spec.ts`, current claims-check report | PASS (unsupported compliance/integration claims blocked; no legal-compliance assertion) |

**Distinguishing labels (per the user steering):** the typed path through `tests/cache/fixtures.test.ts`, `tests/intake-ui/offline-local.test.ts`, `tests/e2e/parent-journey.spec.ts` and `tests/release/check.test.ts` is **a fixture path plus a synthetic recorder**, not a live-voice acceptance. Live voice, physical device, production, and human studies remain `UNVERIFIED` and are not converted to PASS by these tests.

## 26-test release checker (`tests/release/check.test.ts`)

`tests/release/check.test.ts` carries 27 individual assertions on this worktree (the head commit); the user steering rounds to "26 tests" because one assertion is the same end-to-end check counted once across two assertion styles. The checker runs relative paths only, never external URLs, and fails the run on any missing local file. Durable evidence: [evidence/pre-main-phase4-readiness.md](evidence/pre-main-phase4-readiness.md) ("offline worker readiness artefact") plus the final manifest in [PHASE_4_SUBMISSION.md](PHASE_4_SUBMISSION.md) §"Submission checklist" and `submission/round2/` itself. **The release checker does not mark G5 PASS**; that decision is the lead's (Mahim).

## 3-scripted cache fixtures + offline loopback fix

| Fixture | Source (UTF-8, exact) | Test | Evidence |
|---|---|---|---|
| মিতু (Mitu) | Backwards-compat (original) | `tests/cache/fixtures.test.ts` "keeps the original Mitu fixture backwards compatible" | [evidence/pre-main-cache-offline-fixes.md](evidence/pre-main-cache-offline-fixes.md) |
| রাফি (Rafi) | `আমার ছেলে রাফি, বয়স ১৩, গতকাল বিকেলে মাদ্রাসা থেকে ফেরেনি। নম্বর ০১৭১১২২৩৩৪৪` | `tests/cache/fixtures.test.ts` "covers all 3 scripted demo cases" | same |
| মীম (Mim) | `আমার মেয়ে মীম, বয়স ১১, আজ সকালে টঙ্গী বাজারে হারিয়ে গেছে। নম্বর ০১৯৯৮৮৭৭৬৬৫` | same | same |

Offline-loopback fix: `src/app/(parent)/intake/intake-chat.tsx` no longer pre-empts a real `Failed to fetch` when `navigator.onLine === false`; a loopback 2xx is honoured and the typed E-024 manual fallback still fires. Tests: `tests/intake-ui/offline-local.test.ts` (5 cases). **No real audio fixtures exist**; the path stays `null` and `findTranscriptFixture` returns `null`.

## Spec-kit 003 recovery and platform/intake task reconciliation

- `specs/003-parent-outputs/{plan,tasks}.md` were re-derived and committed at `ec1b9f3` "recover parent output plans and reconcile platform intake tasks [TASK-053]". The merge `9c18e45` lands both the spec recovery and the intake convergence.
- Evidence: [evidence/pre-main-convergence-intake.md](evidence/pre-main-convergence-intake.md).
- Platform / intake all-owner status: see the readme back-refs in [evidence/pre-main-branch-reconciliation.md](evidence/pre-main-branch-reconciliation.md) and the durable machine-readable evidence in [evidence/pre-main-branch-inventory.json](evidence/pre-main-branch-inventory.json).

## Backup / finale fallback + Q&A sheet (root release `173202f`)

- `docs/demo/backup-plan.md` — labelled backup recording plan, devices, labels, fallback path if the live journey breaks. Owned by Obidit (TASK-058).
- `docs/demo/qa-prep.md` — Q&A sheet for the AIUB finale (24 Oct 2026). Owned by Mahim (lead) with input from all owners.
- These files are **complete and committed at `173202f`**, not stubs. They remain reviewed in their owning lanes; this worker did not re-author them. D6 hours are not invented for the documentation step (D6 TASK-058 = 2 h human, D6 TASK-055 = 4 h, QA-PREP unestimated in D6).

## Pending human / external blocks (these keep G5 / G6 unpassed)

The following are the original-owner items that no software test can satisfy. Each one is **not** marked PASS by a `tests/` row and remains the lead / owner's responsibility. The list is taken from the user steering in this brief and the original [PHASE_3_AUDIT_2026-10-18.md](PHASE_3_AUDIT_2026-10-18.md) "Open work and owner" sections; no new hours, no new owners are invented.

| # | Item | Owner | Why a software test cannot close it |
|---|---|---|---|
| H-1 | TASK-003 provider setup (account, terms, prices, keys out of Git, spend controls) | Obidit | Requires real provider credentials; cap is USD 25 default, may be raised to at most USD 30 with team decision |
| H-2 | TASK-011 50 labelled reports (canonical labels) | Masnun | Human-labelled reports; the 50 DEV-only blank `{}` rows in `eval/data/labelled.canonical.draft.jsonl` carry no human labels |
| H-3 | TASK-036 two Android phones | Masnun | Physical-device check; browser emulation is not a physical pass |
| H-4 | TASK-040 60 consented audio clips | Obidit | Real consented audio; WER remains not measured |
| H-5 | TASK-041 ≥ 5 tester timing | Masnun / all | Real participant timing; workflow speed remains not measured |
| H-6 | Human Bangla review of strings marked "needs human Bangla review" | Obidit | Human-in-the-loop string review |
| H-7 | TASK-056 mentor fixes | Mahim | Real mentor list and findings; mentor list currently empty |
| H-8 | TASK-042 production deploy / managed DB / smoke / freeze tag | Mahim | Real production credentials and run; the user has confirmed no production access |
| H-9 | Organiser cutoff / channel / formats / extension / recipient | Mahim | External organiser evidence; PR50 mahim-organiser 18:45 attributed `https://h4hbd.ezassist.me/`, 22:00 GMT+6 18 Oct, max 8 slides — **source-attributed, not independently verified**; platform / share / recipient access pending |
| H-10 | Drive folder / public sharing / selection-email send | Mahim | Real Drive / email; the available browser was unsigned, no upload connector |
| H-11 | Five human rehearsals (TASK-054) | All three | Real participants and dates; the current `TASK-054 #1` row is a partial within the D6 5 h share |
| H-12 | Spare laptop, hotspot, mentor clearance | Mahim | Real equipment and approvals; DEP-009 kit record is a lead-managed 23 Oct checkpoint |

**Automated 5-repeat** runs are not 5 human rehearsals; the difference is preserved in the `Rehearsal log (TASK-054)` table of [PHASE_5_BUFFER_FINALE.md](PHASE_5_BUFFER_FINALE.md). The `tests/release/check.test.ts` offline validator and the `tests/intake-ui/offline-local.test.ts` are software-typed proofs, not human-rehearsal acceptances.

## G6 gate (pre-main) — see docs/gates/G6-2026-10-18-pre-main.md

The pre-main G6 audit, written into [docs/gates/G6-2026-10-18-pre-main.md](../gates/G6-2026-10-18-pre-main.md), records the pre-main software-pass-then-hold state: production build, full DB, full browser and the 66-row matrix are recorded; the **formal G6 is UNVERIFIED** because the human / production / external blocks above remain pending. The gate does not claim the human-facing G6 ran; it is a software audit staged for user approval.

## Notes for the coordinator (handoff)

- The historical tables in [PHASE_4_SUBMISSION.md](PHASE_4_SUBMISSION.md) and [PHASE_5_BUFFER_FINALE.md](PHASE_5_BUFFER_FINALE.md) are preserved; this file's top **Current status** block is the authoritative current view, and updates to existing rows may be appended by their owners only.
- D6 has accepted "no estimate / no hours invented" for the documentation step. This file does not invent hours, owners, accounts or completion figures.
- The user steering authorises the software pass and a `IN PROGRESS / REVIEW` Phase 5 state; it does not authorise marking G5 / G6 PASS, the lead is responsible for inserting the final G5 / G6 evidence after the workers complete.
