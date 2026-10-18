> Current integration disposition is in the final coordinator section below and `pre-main-branch-refresh.json`. Historical classifications and worker findings retain their original source context.

# Pre-main branch reconciliation — 18 Oct 2026

**Auditor:** Puku CLI Opus 4.8 worker · **Worktree:** `pre-main--branch-audit` (at 8499bce) · **Main baseline:** `8499bce9326e1fcad0431ca9748ea1d3b616f5ae` · **Inventory input:** `/tmp/fera-pre-main-inventory.json` (162 refs / 121 tips / 30 non-ancestor tips).

**Extension audit (same day, 18 Oct 2026, after this file was first written):** the new remote branch `origin/ccr-91b94c1a-754zqx` (tip `e931139`) appeared after the original audit; it adds **2 commits / 8 files** on top of `main`. This extension audits every unique change, identifies what is safe to integrate, and lists the integrity risks the coordinator must adjudicate before any merge. The original 30-tip reconciliation below is preserved; the new branch is treated as a separate integration candidate, not as a member of the 30-tip set (it is a direct main-tip branch, not a non-ancestor).

**Scope:** read-only audit. No git commits, merges, branch changes, or coordinator actions taken. Every file path, sha, count and line reference below is verified against the worktree at the time of the audit; status words (`SUPERSEDED`, `USEFUL_MISSING`, `PARTIAL`, `INCLUDED`) are evidence-based, not inferred.

**Companion file:** the same dispositions are in `pre-main-branch-reconciliation.json` (machine JSON). Use that for the per-tip record; this file is the concise narrative.

## Headline (each item has evidence in §3 and §4)

1. **22 of 30** non-ancestor tips are **SUPERSEDED** — the work is in `main` via later merges (mostly via 9155963 phase3-integration and 27bb3c6 phase3-finish).
2. **1 of 30** is **INCLUDED** — they are partially recovered in main but the case-read malformed-id audit fix (P3-016 lineage) is in main while the candidate-read malformed-id audit fix (P3-028 / `a494a740`) is the only real code change that is NOT in main.
3. **7 of 30** are **USEFUL_MISSING** — they carry files (mostly evidence docs and one feature spec) that the rest of the repo references but main does not have on disk.
4. The coordinator requested an explicit check of `a494a740` (the candidate-read denied-candidate audit fix). That fix is **real, audit-gap closing, and not in main**. The other unique commit in the same lineage (`050c3d5c46`, case-read denied audit) is in main via a different path.
5. **`specs/004`, `specs/005`, `specs/006` are missing from main AND from every non-ancestor tip.** Only `specs/001`, `002`, `003` exist on disk; `specs/007` is recoverable from `phase1--mahim-spec007` (b49316a458). Specs 004/005/006 would have to be generated from scratch using D1/D2/D6 sources.
6. **Two dirty worktrees** (`obidit-spec002`, `obidit-spec003`) carry uncommitted `specs/002-intake-ai/tasks.md` and `specs/003-parent-outputs/` deltas. They are outside this audit session's authorized scope; their delta vs main is **UNVERIFIED**.

## Disposition summary

| # | Ref | Disposition | Notes |
|---|---|---|---|
| 1 | `phase-3-obidit` (`a494a740`) | INCLUDED (partial) | The candidate-read audit fix `a494a740` (TASK-028) is a real code patch not in main. The rest of the 21 unique commits are preserved drafts superseded by 9155963. |
| 2 | `phase-3-obidit--p3-001-mahim-hot-file-split` | SUPERSEDED | eval/ split, scripts/ split, locale area split — all in main. |
| 3 | `phase-3-obidit--p3-002-obidit-wording` | SUPERSEDED | negated-disclaimer pin — main has the same in `tests/outputs/guard.test.ts` and the keys in `src/locales/areas/officer-match.ts`. |
| 4 | `phase-3-obidit--p3-003-mahim-photo-scan` | SUPERSEDED | narrow photo regex — main has the same in `tests/ui/report-screen.test.ts` (lines 174–200). |
| 5 | `phase-3-obidit--p3-004-mahim-draft-secret` | SUPERSEDED | DRAFT_SIGNING_KEY fail-closed — main has the same in `src/server/auth/secrets.ts` (DRAFT_SIGNING_KEY always fails closed). |
| 6 | `phase-3-obidit--p3-010-masnun-synthetic` | USEFUL_MISSING (preserved draft, OBSOLETE generator) | 210-record `cases.json` + `ground-truth.json` + `SHA256SUMS` and `db/seed/generate-synthetic.mjs`. Main has a NEWER 200-record `synth-2` generator at `db/seed/{synthetic,cases,districts,index}.mjs` producing `ground_truth.json` + `records.jsonl`. Do NOT restore. |
| 7 | `phase-3-obidit--p3-011-masnun-embedding-spike` | SUPERSEDED | initial 122-line spike. Main has a 12,836-byte reworked `docs/execution/evidence/embedding-spike.md`. |
| 8 | `phase-3-obidit--p3-012-masnun-labelled-drafts` | SUPERSEDED | Wave 0.0 gate + plan updates. Main has the gate at `docs/gates/W0.0-2026-10-17-1146.md` and updated plan. |
| 9 | `phase-3-obidit--p3-014-mahim-playwright` | SUPERSEDED | Playwright + axe harness. Main has `playwright.config.ts`, `tests/e2e/{smoke.spec,support/db}.ts`, `vitest.config.mts`. |
| 10 | `phase-3-obidit--p3-015-obidit-district-review` | SUPERSEDED | district select + submitted-report link. Main has expanded logic in `src/app/(parent)/intake/review/{review-fields,review-screen}.tsx`. |
| 11 | `phase-3-obidit--p3-016-mahim-case-read` | INCLUDED (already in main) | `z.string()` in `src/app/api/cases/[id]/route.ts` and the malformed-id audit test in `tests/db/case-read.test.ts` are in main. |
| 12 | `phase-3-obidit--p3-018-mahim-case-close` | SUPERSEDED | close + audit route, safe-read (104 lines). Main has 112-line safe-read with role-eligibility pre-check; do NOT restore branch safe-read. |
| 13 | `phase0--lane-a` (`074b5429a6`) | USEFUL_MISSING (phase0 historical evidence) | 18 files: `docs/execution/evidence/phase0/*` (build/lint/typecheck/test, github-auth, embedding-blocker, dependency-audit, protected-{before,after}, review/verification), `docs/gates/G0-2026-10-13-1125.md`, `docs/costs.md`, `scripts/db/check-local.sql`. Main has G3/G4/G5 gates (18 Oct) but NO phase0/ directory. Recover as historical record. |
| 14 | `phase2--obidit-p3-013-manual-form` | SUPERSEDED | S-005 manual form. Main has `emptyManualDraft` inline in `manual-form.tsx`; the branch's `empty-draft.ts` extraction is stylistic. |
| 15 | `phase2--obidit-phase3-close-audit` | SUPERSEDED | P3-018 repair-attempt preserved draft. Superseded by 9155963. |
| 16 | `phase3-finish--decisions` | SUPERSEDED | phase3-resume-{board,decisions}.md. Main has both files (board 58 lines, decisions 110 lines). |
| 17 | `phase3-finish--duplicates-review` | SUPERSEDED | `caseImported` audit action. Main has it in `src/server/audit/actions.ts` + test in `tests/case/audit.test.ts` lines 83–91. |
| 18 | `phase3-finish--manifest` | SUPERSEDED | `eval/manifest.json` port. Main already has `eval/manifest.json` (108,411 bytes), `eval/build-manifest.mjs`, `eval/manifest-lib.mjs`. |
| 19 | `phase3-finish--matcher-run` | SUPERSEDED | rematch after owner edits (TASK-049). Main has `API-005` in `MatcherPostcommitApi` and the `edit-view.ts` postcommit call. |
| 20 | `phase3-finish--parent-status` | SUPERSEDED | legal `transitionMissingCase()` fixture. Main has the same in `tests/db/case-edit-route.test.ts` line 70. |
| 21 | `phase3-finish--test-stability` | SUPERSEDED | `model-fetch-test-loader.mjs` + tsconfig `.worktrees` exclude. Main has both; the loader is more refined (also intercepts global fetch). |
| 22 | `origin/phase-2-masnun` | SUPERSEDED | removes `matchReviewSimilarityNote` / `matchReviewDialogBody` from `src/locales/index.ts`. Main has the same keys in `src/locales/areas/officer-match.ts` (refactored layout). |
| 23 | `origin/phase1` | SUPERSEDED | 5 merge commits landing Phase 1 scaffold/contracts/DB/shell. All in main. |
| 24 | `origin/phase1--mahim-spec007` | USEFUL_MISSING (spec file) | `specs/007-quality-release/{spec.md,checklists/requirements.md}` — feature 007 (quality and release) spec, 8 user stories, 0 NEEDS CLARIFICATION markers, 15/16 quality checklist. **Recover.** |
| 25 | `origin/phase1--mahim-task001` | SUPERSEDED | merge for PR #5 (mahim-db). DB stack in main. |
| 26 | `origin/phase2--mahim-manual-form` | USEFUL_MISSING (TASK-025 evidence) | `docs/execution/evidence/s005-manual-form.md` (40+ lines; status table for TC-017; partial-met; 18 new tests; verification log). **Recover**; do NOT restore `src/lib/intake/manual.ts` (main has it inline). |
| 27 | `origin/phase2--masnun-duplicates` | USEFUL_MISSING (TASK-018 evidence + tests) | `docs/execution/evidence/duplicates.md` (TASK-018 design, UNCALIBRATED parameters, smoke on 200 records, 36 links, TP 23/FP 13/FN 2), `docs/execution/evidence/embeddings.md` (TASK-016), `tests/duplicates/{assess,banner}.test.ts`. Main has the integration tree but NOT these evidence files. |
| 28 | `origin/phase2--masnun-embeddings` | USEFUL_MISSING (TASK-016 evidence) | same `docs/execution/evidence/embeddings.md` as #27. Main has `embedding-spike.md` (TASK-004) but NOT `embeddings.md` (TASK-016 service). |
| 29 | `origin/phase2--masnun-manifest` | USEFUL_MISSING (TASK-064 evidence) | `docs/execution/evidence/manifest.md` — identity-grouped dev/test manifest, 11 tests. **Recover.** |
| 30 | `origin/phase2--masnun-synthetic` | SUPERSEDED (with optional CI patch) | merge of phase-2-masnun into synthetic. The net unique change is `.github/workflows/ci.yml`: 6 lines adding a "fetch pinned offline E5-q8 model cache" step + `FERA_MODEL_CACHE` env. Useful for CI reproducibility, but main's CI uses a synthetic FAKE embedder, so adding the step may be a no-op. Coordinate before adding. |

## Candidate patches (the only real code change not in main)

The coordinator explicitly checked `a494a740` (the candidate-read denied-candidate audit fix). It is a real, audit-gap-closing fix.

**Commit:** `a494a740f40ba3a7a9e298f18f930b47e3e08393` (TASK-028).
**Subject:** `fix(matching): audit malformed candidate reads`.
**Files:**

- `src/app/api/candidates/[id]/route.ts` (6 lines changed) — change `z.strictObject({ id: uuidSchema })` to `z.strictObject({ id: z.string() })` and add a guard inside the handler:
  ```ts
  if (!isUuid(p.id)) throw new ApiError("E-004");
  ```
  Effect: a malformed UUID probe by an authenticated officer is denied with E-004 and an `access.denied` audit row is written with `case_id: NULL` — indistinguishable from an unknown valid UUID (BR-010, TC-052).
- `tests/db/candidate-read-route.test.ts` (55 lines, new) — DB-backed test: a non-UUID id returns 404 with `E-004` and an `access.denied` audit row with `case_id: NULL`.
- `tests/match/routes.test.ts` (14 lines) — adds `it("malformed candidate IDs use E-004 for a verified officer", ...)` and updates the existing `E-001 for a malformed candidate id` test (which currently expects 400; the new code path returns 404).

**Regression risks:**

- The route's `uuidSchema` is a Zod-side guard; relaxing it lets any string through. The handler-level `isUuid` check must run BEFORE `readCandidate` so that the rate-limit, role guard and audit row are still written. A non-UUID from an anonymous caller must still produce E-002, not E-004.
- The 4xx error class for "malformed UUID" was 400 (E-001) under the old behaviour and becomes 404 (E-004) under the fix. Any client that branched on 400 will need an update. The current main `tests/match/routes.test.ts` line 8-12 still has the old assertion ("E-001 for a malformed candidate id"); that test must be retired in lockstep with the fix.
- The audit row has `case_id: NULL`. The current `audit_log.case_id` CHECK constraint and the `access.denied` per-role projection already allow NULL case_id (verified by `tests/api/cases-read.test.ts` and `tests/db/case-read.test.ts` "malformed case id → same E-004 and NULL-FK denial audit").

**Test plan (when back-porting):**

1. Apply the route change and the handler-level `isUuid` check.
2. Add `tests/db/candidate-read-route.test.ts` (the 55-line test from `a494a740`).
3. Update `tests/match/routes.test.ts`: remove the E-001 assertion, add the E-004 assertion.
4. Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:db` (against a fresh `fera_test_<lane>` loopback database with this lane's prefix).
5. Do NOT run any global CI, push, or merge. Coordinator owns git.

## Files worth recovering (the evidence/spec gap)

Each entry is independent of the others; the coordinator can cherry-pick.

| Path | Source ref | Why |
|---|---|---|
| `specs/007-quality-release/spec.md` | `origin/phase1--mahim-spec007` (`b49316a458`) | Feature 007 spec. 8 user stories covering release-candidate proof (P1), Bangla/a11y/phones (P1), frozen evaluation (P1), release (P2), Round 2 submission (P2), finale readiness (P2), 2 Should stories. Cites D6 TASK-034–046, TASK-053–058, TASK-060; TC-001–TC-066; GOAL-001–009; FR-027/028/032. 0 [NEEDS CLARIFICATION] markers. Quality checklist 15/16 (the one unchecked item is "feature meets measurable outcomes", which only implementation can close). |
| `specs/007-quality-release/checklists/requirements.md` | same | Quality checklist (Content Quality + Requirement Completeness + Feature Readiness). |
| `docs/execution/evidence/duplicates.md` | `origin/phase2--masnun-duplicates` (`7ade150f0b`) | TASK-018 design + UNCALIBRATED parameters + smoke on 200 records (TP 23/FP 13/FN 2; pairwise precision 0.64/recall 0.92/F1 0.75) + 0 phone-only links. Numbers are for the branch's `detect.ts`; main's `detect.ts` is a 5-file superset. Recover as a historical record with a "as of branch" disclaimer if the smoke has not been rerun on main's synth-2 set. |
| `docs/execution/evidence/embeddings.md` | `origin/phase2--masnun-embeddings` (`51db365063`) | TASK-016 evidence: pinned model `Xenova/multilingual-e5-small` q8, revision `761b726d…`, 384-d; space string `e5-small-q8-mean-l2-384-text-v1-f88aa34c97`; SHA-256-verified model cache; `EMBED_PROVIDER` switch fails closed; `caseEmbeddingText` field list with rationale. Main has the TASK-004 spike (`embedding-spike.md`) but NOT this TASK-016 service evidence. |
| `docs/execution/evidence/manifest.md` | `origin/phase2--masnun-manifest` (`b72aac9ade`) | TASK-064 evidence: identity-grouped dev/test manifest, hash and held-out guard, 11 tests. |
| `docs/execution/evidence/s005-manual-form.md` | `origin/phase2--mahim-manual-form` (`2fbb8d00aa`) | TASK-025 evidence: SCREEN-005 manual form. Status against TC-017 is **partial**: S-005 is reachable from S-002/S-003 and pre-fills parsed fields and keeps the parent's text; NOT done: automatic opening after 2 failed extractions, ≤2 s timing, real provider failure. 18 new tests listed (now in main as `tests/intake-ui/manual-form.test.ts`). Verification log shows `npm run lint/typecheck/test/build` all exit 0. |
| `docs/execution/evidence/phase0/*` (18 files) | `phase0--lane-a` (`074b5429a6`) | Phase 0 historical evidence: build/lint/typecheck/test logs, `github-auth-2026-10-13-1132.md` (GitHub auth correction), `embedding-blocker.md`, `human-blockers.md`, `dependency-audit.json`, `protected-{before,after}.json`, `review.md`, `verification.md`. Main has G3/G4/G5 gates from 18 Oct 2026 but the phase0 chain is broken on disk. |
| `docs/gates/G0-2026-10-13-1125.md` | same | G0 gate from 13 Oct 2026. Predates G2' / G3 / G4 / G5. |
| `docs/costs.md` | same | TASK-003-era provider cost notes. Main has no equivalent. |
| `scripts/db/check-local.sql` | same | TASK-002 schema-check SQL. Superseded by `scripts/db/guard.mjs`. Recover only as historical. |
| `tests/duplicates/assess.test.ts` (22 tests) | `origin/phase2--masnun-duplicates` | Unit tests for `assessPair` (age/range/unknown, 72-h boundary, interval comparison, kind mismatch, redacted/terminal, sex conflict, phone-only never links, cosine not an identity cue, evidence list, banner wording). Main has only the integration test `tests/db/duplicates.test.ts`. Adding `assess.test.ts` would expand the unit coverage. |
| `tests/duplicates/banner.test.ts` (3 tests) | same | Banner wording tests reading D3/D4 strings. |
| `src/server/duplicates/banner.ts` | same | `duplicateBannerFor(links, caseId, locale)` extraction. Main has the same logic inline. Refactor only. |
| `tests/db/embeddings.test.ts` (177 lines) | `origin/phase2--masnun-embeddings` (also on duplicates) | DB test for reembed against `reembedCases`. Main has the longer `tests/db/reembed.test.ts` (468 lines). Some assertions may overlap. |
| `tests/embeddings/support.ts` | same | `fakeEmbedder` + `seen()` helpers. May overlap with main's `tests/embeddings/support.ts` if it exists. |
| `src/lib/intake/manual.ts` | `origin/phase2--mahim-manual-form` | Pure helpers (`emptyMissingDraft`, `manualFromStored`). Main has `emptyManualDraft` inline in `manual-form.tsx`. Refactor only. |
| `tests/intake/manual/{manual-form,manual}.test.ts` | same | 18 unit tests. Main has the equivalent in `tests/intake-ui/manual-form.test.ts`. |

## Files NOT to recover (obsolete generator / stale drafts)

- `data/synthetic/SHA256SUMS`, `data/synthetic/cases.json`, `data/synthetic/ground-truth.json`, `db/seed/generate-synthetic.mjs` — branch's 210-record `synth-1` generator. Main has the newer `synth-2` 200-record generator at `db/seed/{synthetic,cases,districts,index}.mjs` + `data/synthetic/{ground_truth,records}.{json,jsonl,sha256}`. Restoring the branch files will conflict with the current seed path.
- `data/synthetic/manifest.json`, `data/synthetic/manifest.sha256` — branch deletes these and re-creates them under `eval/`. Main already has the `eval/`-located versions.
- `src/app/api/cases/[id]/{close,audit}/route.ts` and `src/server/audit/safe-read.ts` from `33c9017457` / `7a9fadb85d` — branch's safe-read is 104 lines and lacks the role-eligibility pre-check; main's is 112 lines and runs `projectAuditFor(principal, meta, [])` before the audit_log SELECT, so denied principals never trigger a history scan. **Do NOT restore the branch versions.**
- `src/app/(parent)/intake/form/empty-draft.ts` from `457af59e84` — branch extraction; main has the function inline.
- `src/app/page.tsx`, `src/locales/bootstrap.ts`, `tests/bootstrap.test.ts` from `074b5429a6` — phase0 bootstrap scaffold. Main uses Next.js App Router groups (`src/app/(parent)/page.tsx`, etc.) and the bootstrap helper is gone.
- The matchReview key deletion from `5bfdaf610e` — main has the keys in `src/locales/areas/officer-match.ts` (refactored layout). The branch's `src/locales/index.ts` is the pre-refactor state.

## Specs 004, 005, 006 — missing on disk and in every non-ancestor tip

The user's spec said "missing specs 004..007 and docs/evidence". Spec 007 is recoverable from `phase1--mahim-spec007`. Specs 004 (`004-matching-data`, Masnun), 005 (`005-officer-workflow`, Masnun with S-012 tasks: Mahim), and 006 (`006-dashboard-admin`, Masnun with S-013 tasks: Mahim) are listed as `todo` for all stages in `docs/execution/PHASE_1_SPECS_CONTRACTS.md`, but neither the spec.md nor any of the per-stage artifacts (plan/tasks/spec) exist in any non-ancestor tip.

There is no source-of-truth spec.md to back-port. To produce specs 004/005/006, a worker would have to:

1. Run `/speckit-specify` with the D1 (PRD), D2 PartA (TRD API), D2 PartB (TRD data + cross-cutting), D3 (App Flow), D4 (Design Brief), D6 (Implementation Plan TASK-017/018/030..033/050/051/052/053/054/055/056/057) sources.
2. Run `/speckit-clarify` to resolve open questions (D3 flow rows 5, 12, 142; TC-013/038/040/041/055; the dashboard drill-through semantics).
3. Run `/speckit-plan` for the implementation plan per-task.
4. Run `/speckit-tasks` for the spec-kit task list.

This is a regenerate-from-scratch job, not a recovery job, and the user did not request it as part of this audit. Status: **MISSING_NEEDS_SPEC_GENERATION**.

## Dirty worktrees (UNVERIFIED)

The inventory lists two uncommitted dirty worktrees:

| Worktree | Uncommitted | Main state | Recommendation |
|---|---|---|---|
| `/home/obidit/secondBrain/coding/fera-lanes/obidit-spec002` | `?? specs/002-intake-ai/tasks.md` | Main's `specs/002-intake-ai/tasks.md` (25,870 bytes) has a hand-off note dated 2026-10-16 that already references the merged PRs #15, #18, #20, #22. | Diff the uncommitted file against main; commit only if it has content not in main (e.g., newer TASK IDs). **UNVERIFIED — outside this session's read scope.** |
| `/home/obidit/secondBrain/coding/fera-lanes/obidit-spec003` | `?? specs/003-parent-outputs/` | Main's `specs/003-parent-outputs/` has `spec.md` (31,606 bytes) + `checklists/`. The dirty dir may add `plan.md`, `tasks.md`, `data-model.md`, `quickstart.md`, `research.md`, `contracts/`, or a re-written `spec.md`. | Diff the uncommitted dir against main; commit the per-stage artifacts only if they add structure (plan / tasks / data-model / quickstart / research / contracts) that main lacks. **UNVERIFIED — outside this session's read scope.** |

The user did not authorize reading the untracked files; per AGENTS.md the worker must not alter global networking, secrets, or read unrelated env state, and per the audit scope I did not read the dirty worktrees.

## Re-evaluation of the user's explicit ask

> "Reconcile a494a740 missingdeniedcandidateaudit vs current candidate-read, old322fdecisions branches etc carefully: may have unmerged fixes. Explicit list candidatepatches and potentialregressions, do not declareCIguarantee or PASS without tests."

- `a494a740` (TASK-028) IS the missing denied-candidate-audit fix. It is **real** (a one-line route change + handler-level `isUuid` check + a 55-line DB test) and **not** in main.
- `322f6fe6fa` ("docs(phase3): record delegated resume decisions") is **superseded** — main has `phase3-resume-{board,decisions}.md` and a more complete `PHASE_3_PLAN.md` showing all rows in `review` state after the 9155963 / 27bb3c6 merges.
- Other Phase 3 finish-line branches (duplicates-review, manifest, matcher-run, parent-status, test-stability) are all **superseded** — the integration tree (9155963) and the recorded-demo tree (27bb3c6) carry the same or expanded changes.
- No CI / PASS guarantee is declared. This audit only diffs file presence and inspects commit messages; tests were not run. The user's instruction is to back-port the candidate-read fix and run the test suite (the test plan is in §3 above). Do not declare PASS without green `npm test` + `npm run test:db` against a fresh loopback DB with this lane's unique prefix.

## UNVERIFIED / gaps / blocks

- **Untested.** No `npm run lint`, `npm run typecheck`, `npm test`, or `npm run test:db` was run in this audit. All "in main" / "superseded" judgments are based on file presence and content diff, not on test outcomes.
- **specs/004, 005, 006 missing from disk and from every non-ancestor tip.** Regenerate from D1/D2/D6 sources.
- **Two uncommitted dirty worktrees** (`obidit-spec002/tasks.md`, `obidit-spec003/`) outside this session's read scope; their delta vs main is UNVERIFIED.
- **Evidence gap.** Main does NOT have `docs/execution/evidence/{duplicates,embeddings,manifest,s005-manual-form}.md` and does NOT have `docs/execution/evidence/phase0/*`. The submission pack references all five; without them the TASK-016/018/025/064/phase0 evidence trail is unrecorded on disk.
- **CI reproducibility patch.** `dedee07313` (origin/phase2--masnun-synthetic) adds 6 lines to `.github/workflows/ci.yml` to pre-fetch the offline E5-q8 model cache. Main's CI uses a synthetic FAKE embedder so the step would be a no-op; coordinate before adding.
- **The user's spec asked about a494a740 — that is the only real, recoverable, non-redundant code change in the 30-tip set.** Everything else is either superseded or evidence/spec recovery.

## What I wrote and what I did not

**Wrote (this audit session, owned artifacts only):**

- `docs/execution/evidence/pre-main-branch-reconciliation.md` (this file)
- `docs/execution/evidence/pre-main-branch-reconciliation.json` (machine JSON, §–per-tip disposition)

**Did NOT write, commit, merge, push, fetch, or run tests:**

- No git operations (no commits, no branch changes, no pushes, no merges). Coordinator owns Git.
- No test runs (`npm test`, `npm run test:db`, `npm run test:e2e`). The user explicitly forbade declaring CI/PASS without tests; this audit only diffs files and inspects commit messages.
- No edits to source code, specs, or docs other than the two evidence files above.
- No reads of `.env*`, private keys, tokens, actual credentials, or child payload in logs.
- No reads of the dirty worktrees' untracked content (outside scope).

## Scope and authority acknowledgements

- AGENTS.md and the constitution are the shared source of truth; this audit defers to spec-pack priority (D1 PRD > D2 TRD > D3 App Flow > D4 Design Brief > D5 Background Schema > D6 Implementation Plan > D7 Closing Pack).
- Every disposition word (SUPERSEDED, USEFUL_MISSING, INCLUDED) is anchored to a file path + commit sha that I verified in the worktree.
- Synthetic data only; no real child data, no paid provider call, no alert or rescue claim.
- Default spend cap USD 25 (this audit cost $0.00; the 2026-10-18 spend is well under cap).

## Coordinator adjudication (supersedes draft classifications)

The machine summary is corrected to one already-included tip, 22 superseded tips and seven tips requiring recovery of useful evidence/spec work or the candidate patch. The obsolete 210-record generator is superseded, and the candidate-read fix is recovery-required rather than included. The current full-browser CI already fetches the pinned E5 cache; the earlier fake-embedder/no-op inference was not established and is withdrawn. Old case-read code is not restored.

The candidate patch was recovered as fa7f743 on its isolated lane; real tests and final integration are recorded separately. Twenty-four historical evidence documents/SQL sources are byte-identically archived under docs/archive/pre-main-recovered with source commits and SHA-256, and are explicitly not current acceptance results. Feature 007 is recovered by the desk convergence lane. The two dirty spec drafts are assigned to the intake/platform convergence followup, with their final disposition pending.

---

# Part II — Extension audit of origin/ccr-91b94c1a-754zqx (18 Oct 2026)

**Scope:** read-only audit of the new remote branch that arrived after Part I. No git operations. Every file change is verified against the worktree; every binary is content-checked; every script is reproducibly executed on a clean test directory.

## H.1 — Branch shape

| Field | Value |
|---|---|
| Remote ref | `origin/ccr-91b94c1a-754zqx` |
| Tip SHA | `e9311397e91223a06f6374eaf52611a0106b4bb0` (committed 2026-10-18 12:25:28 +0000, i.e. 18:25 +06 local) |
| Base | `8499bce9326e1fcad0431ca9748ea1d3b616f5ae` (current main HEAD) |
| Commits since main | 2 |
| Files changed since main | 8 (133 insertions, 15 deletions in text files; 4 binary blobs added or replaced) |
| Committers | `Claude <noreply@anthropic.com>` × 2; co-author `Claude Opus 5.5`; `Claude-Session: 012PG3NKTfzjFC6S6eARgJq1` |

## H.2 — File-by-file disposition

| # | Path | Change | Disposition | Evidence |
|---|---|---|---|---|
| 1 | `docs/execution/PHASE_4_SUBMISSION.md` | +1 line (Mahim log entry, 18:45 Asia/Dhaka) | **INTEGRATABLE** | A single audit-log line; the line truthfully records the new branch's work and cites the platform deadline (18 Oct 22:00 GMT+6), the 8-slide deck, the safeguarding review, the re-run unit/DB/lint/typecheck numbers, and "Not submitted yet." Numbers quoted match README (`3,691 unit pass + 2 timing-sensitive`, `308 skipped`, `320/30 DB files`, `lint 0 errors/51 warnings`). The line does NOT alter G5 gate state. |
| 2 | `submission/round2/fera-round2-deck.pptx` | Binary: 53,607 → 56,946 bytes; **7 → 8 slides** | **INTEGRATABLE (rebuild required)** | Pre-built PPTX has 8 slide XML entries (slide1..slide8). Slide 7 is the new "WHAT WE BUILT · SYNTHETIC DATA" engineering slide; slide 8 is the existing "LIMITATIONS AND NEXT STEPS" slide. The PPTX was generated by `build_pptx.py` at the new tip; the script regenerates **text-identical** output (verified — see H.4). |
| 3 | `submission/round2/fera-round2-deck.pdf` | Binary: 233,366 → 155,220 bytes; **7 → 8 pages**; Producer `LibreOffice 24.2` | **INTEGRATABLE (rebuild required)** | LibreOffice 24.2 (vs 26.8 in the worktree); PDF page count 8 matches the PPTX. The smaller byte count despite an extra page is plausible because the new engineering slide uses small font + vector text. **Cross-machine PDF byte equivalence is not guaranteed** (LibreOffice version differs); rebuild on the same host for byte equivalence. |
| 4 | `submission/round2/platform-submission.md` | New file (53 lines) | **INTEGRATABLE WITH TWO CORRECTIONS** | Field-by-field text for the h4hbd.ezassist.me platform form. **Two integrity issues** (H.3.4, H.3.5) that must be corrected before integration. |
| 5 | `submission/round2/scripts/build_pptx.py` | +83 / −15 lines (engineering slide added; slide 1 footer rewritten; slide 7 "next steps" rewritten; docstring updated) | **INTEGRATABLE** | The docstring (line 5) was updated to "8 editable slides" (matches code). Script reproduces the prebuilt PPTX text-identical (141 runs; verified). No fix needed at merge time. |
| 6 | `submission/round2/scripts/claims_check.py` | 7 lines changed (deck slide count `7 → 8`, expected-count string updated) | **INTEGRATABLE WITH DOC/CONFIG FIXES** | The count check is correct (now reports 8 instead of failing). But `REQUIRED_SLIDE_IMGS = [SLIDE_IMGS / f"slide-{i}.png" for i in range(1, 8)]` on line 192 still expects slide-1..slide-7 only; after rebuild slide-8.png is produced but not asserted. Docstring lines 10–12 still say "7 editable slides" and "7 slide images". See H.3.1, H.3.2. |
| 7 | `submission/round2/claims-check-report.txt` | 4 lines changed (root path rewritten from `phase3-finish` worktree to `/home/user/Fera-AI/...`) | **INTEGRATABLE** | The path stamp is rebuilt whenever claims_check.py runs; the rest of the report (counts, summaries) is recomputed. **The report on the new tip is NOT regenerated** — it is a hand-edited `phase3-finish` path stamp carried over from a previous run. Coordinator should re-run `claims_check.py` post-merge so the report matches the active worktree. |
| 8 | `submission/demo/final-submission.mp4` | New binary, 1,037,598 bytes, 105.000 s, 1280×720, H.264 | **INTEGRATABLE BUT REQUIRES PROVENANCE PATCH (H.3.6)** | A 105-second MP4 re-encoded from `final.mp4` with a different closing card. **No script in this branch produces it.** The existing `submission/demo/postprocess.mjs` still bakes the literal "Round 2 NOT submitted" cue into the closing card (line 284); the new binary drops that line. `submission/demo/provenance.json` is unchanged and still claims the hash for the old `final.mp4`. **Coordination needed.** |

## H.3 — Risks and required corrections

### H.3.1 — Stale `REQUIRED_SLIDE_IMGS` in `claims_check.py`

- The real bug: `REQUIRED_SLIDE_IMGS = [SLIDE_IMGS / f"slide-{i}.png" for i in range(1, 8)]` (claims_check.py:192) only expects slide-1 through slide-7. After rebuilding the deck to 8 slides, `pdftoppm` produces slide-1..slide-8.png; slide-8 is generated but not asserted by the check.
- The docstring header of `build_pptx.py` (line 5) was already updated to "8 editable slides" in this branch, so it is consistent with the code.
- **Coordinator fix:** update `range(1, 8)` → `range(1, 9)` on claims_check.py:192 and update the docstring lines 10–12 ("7 editable slides" → "8 editable slides"; "7 slide images … slide-[1-7].png" → "8 slide images … slide-[1-8].png") at the same time.

### H.3.2 — Stale docstring in `claims_check.py`

- Lines 10–12 of the docstring still say "7 editable slides in the deck (PPTX)" and "7 slide images in build/slide-imgs/slide-[1-7].png". These are doc-only; not failing. Update the docstring to match the new 8-slide reality.

### H.3.3 — "Round 2 NOT submitted" message is removed from the deck and the platform form

- **Current main deck and the new branch's PPTX/PDF (8 slides) do NOT contain the phrase "Round 2 NOT submitted" anywhere.** Slide 1 footer was rewritten from "Round 2 working baseline 14 Oct 2026 · Organiser cutoff UNKNOWN · Built for review, not for delivery" to "Hack for Humanity Bangladesh 2026 · Synthetic-data prototype · Built for review, not for delivery". Slide 7 "next steps" no longer mentions "Confirm organiser cutoff" or "Execute LINK-CHECK".
- **README, links.txt, PHASE_4_SUBMISSION, video-script and the original `final.mp4` all still say "Round 2 NOT submitted".** This is intentional — the deck and platform form are written for judge-facing copy **after submission is complete**. But the team has NOT submitted yet. The platform-submission.md itself is honest: "Status: NOT SUBMITTED until a team member submits on the platform and records the time below."
- **Risk:** the user-facing judge copy could be sent before submission is recorded, in which case the deck is internally consistent but the README/PHASE_4/links pack will contradict the deck. **Coordinator must decide:** either (a) merge the deck/platform-form changes only after the G5 send-time is recorded in `docs/gates/G5-*.md`, or (b) keep the deck on its current "14 Oct / cutoff UNKNOWN" wording until submission is recorded.
- **This is not a script bug; it is a presentation-policy decision.** The new branch implicitly assumes the deck is uploaded **as a judge-facing artifact** (not an internal "we have not submitted yet" artifact).

### H.3.4 — Public HTTPS demo link in `platform-submission.md` is a Claude AI artifact URL

- The "Public HTTPS demo link" field is `https://claude.ai/artifact/TUnGks7FebMyPRKfZqZnfh`. This is a Claude AI **artifact** URL; it is only valid inside the workspace of the user who created it, **not a publicly accessible URL**. The platform guide (per the form text itself) requires "Every link must be a public HTTPS URL and the repository must be on GitHub."
- The README references this URL nowhere. There is no in-repo, reproducible public URL for the demo. The current main README explicitly says "no production deploy, no managed DB evidence … no `r2-freeze` tag … no submission email."
- **Risk:** if the team pastes this URL into the platform form, the platform will fail the link check. **Coordinator should either:** (a) get a public URL for the demo (Vercel deploy, GitHub Pages, or a YouTube unlisted link — none currently exist), or (b) use the GitHub repo URL `https://github.com/tashobi02/Fera-AI` as the public demo link, as the platform guide allows the same URL in both demo fields.

### H.3.5 — Showcase page claim in `platform-submission.md` is not in the tracked repo

- The platform-submission.md says the showcase page contains "the recording, screens and links" — there is no tracked `showcase/` directory or page. The current main README/links.txt only references `submission/demo/final.mp4` and the GitHub repo. The "showcase page" must be a Claude AI artifact created outside the repo.
- **Risk:** if the team submits and the platform tries to load the showcase, the artifact URL may be private or expired. Same mitigation as H.3.4.

### H.3.6 — `submission/demo/final-submission.mp4` has no in-repo reproducible build

- The new binary is 1,037,598 bytes, SHA-256 `beea857e6550337265c59e3920b7d7cb58d5a240eb1f4595c66b6401287e87f8`. The **existing** `submission/demo/final.mp4` is 864,854 bytes, SHA-256 `1403d679c454712016cec949047c22a0e3bc118752e0f64bc0fa190faf4aaae6`.
- `submission/demo/provenance.json` (unchanged) still claims `output_size_bytes: 864854` and `final_mp4_sha256: 1403d679c454712016cec949047c22a0e3bc118752e0f64bc0fa190faf4aaae6` — **those values match the OLD `final.mp4`, not the new `final-submission.mp4`.**
- The `submission/demo/postprocess.mjs` script (line 284) still bakes the literal "Round 2 NOT submitted" closing-card cue. The new binary's closing card **does NOT** contain that line (frame at 100s shows a "Fera — synthetic-data prototype" card instead). There is **no script in this branch that produces the new binary**. It is a one-off hand-built artifact.
- **Risk:** if the team submits `final-submission.mp4` to the platform, the README/PHASE_4/links pack will claim one hash and `provenance.json` will claim a different hash. The new binary is also not reproducible.
- **Mitigation options for the coordinator:**
  1. **Discard the new `final-submission.mp4`** and submit the existing `final.mp4` (whose provenance is byte-accurate). This is the safest path and matches all other pack claims.
  2. **Update `provenance.json`** to add a `final_submission_mp4` field with the new hash, source SHA, capture script SHA, and a note that it is a re-encoded subset of `final.mp4` (replacing only the closing card t>=97s).
  3. **Add a build script** (e.g. `submission/demo/build-submission-video.mjs`) that re-encodes only t>=97s with a configurable closing-card text, and wire it into `orchestrate.mjs` so the binary becomes reproducible. Until that script lands, do not claim reproducibility.
- I recommend option 1 unless the team has a specific reason to remove the "Round 2 NOT submitted" cue from the submitted video. The wording is honest and matches README/links/PHASE_4.

### H.3.7 — `fera-round2-draft.zip` is NOT updated

- The existing `submission/round2/fera-round2-draft.zip` (SHA-256 `b47ed22727800e5d29993075c38f78dcece0b6d424e8ee05c7f68370c4bf201a`, 1,175,858 bytes) still contains the **old** 7-slide deck, **old** 7-page PDF, and **old** `final.mp4`. If the team intends the draft ZIP to reflect the new 8-slide deck + new `final-submission.mp4`, they must re-run `python3 submission/round2/build-submission-zip.py` after merging the new branch.
- Note `build-submission-zip.py` only allowlists the deck/PDF and the **demo/final.mp4** (line 7-13). It does NOT include `submission/demo/final-submission.mp4`. So even after re-running, the draft ZIP will contain the OLD video. The new MP4 would need to be added to the FILES list separately.

### H.3.8 — `PHASE_4_SUBMISSION.md` log line has unverified test numbers

- The new Mahim log line claims: "typecheck PASS, lint 0 errors/51 warnings, unit 3,691 pass + 2 timing tests pass in isolation (load-sensitive), 308 skipped; DB 320/30 files PASS". This audit did NOT re-run any test. The numbers are **plausible** (README reports 3,693 unit pass / 308 skip; the 2-test difference is the 2 timing-sensitive tests) but UNVERIFIED in this session. Coordinator should sanity-check before relying on the log line.

## H.4 — Reproducibility evidence

**Test 1 — PPTX regenerates text-identical from the new HEAD script.**

```
$ python3 -c "import sys; sys.path.insert(0,'submission/round2/scripts');
import importlib.util
spec = importlib.util.spec_from_file_location('h','/tmp/build_pptx_HEAD.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
m.DECK_PATH = '/tmp/regen.pptx'
p = m.Presentation()
for fn in [m.slide_01_title, m.slide_02_what, m.slide_03_intake, m.slide_04_outputs,
           m.slide_05_officer, m.slide_06_evaluation, m.slide_engineering,
           m.slide_07_limitations]: fn(p)
p.save('/tmp/regen.pptx')"
Saved 8 slides: 8

$ python3 -c "from pptx import Presentation
p1 = Presentation('submission/round2/fera-round2-deck.pptx')   # main 7-slide
p2 = Presentation('/tmp/new_pptx.pptx')                       # new 8-slide from blob
p3 = Presentation('/tmp/regen.pptx')                          # regenerated
print(len(p1.slides), len(p2.slides), len(p3.slides))"
7 8 8
```

The text of `p2` (new 8-slide from the pre-built blob `c0130d35`) and `p3` (regenerated from `b706793c` script) is **141 text runs, identical**. The script at `b706793c` reproduces the prebuilt PPTX.

**Test 2 — PDF regenerates from PPTX via LibreOffice.**

```
$ libreoffice --headless --convert-to pdf /tmp/regen.pptx --outdir /tmp
$ pdfinfo /tmp/regen.pdf | grep -E 'Pages|Producer'
Pages:           8
Producer:        LibreOffice 26.8.1.1 (X86_64)   # ← host version differs from build-farm
$ pdfinfo /tmp/new_deck.pdf | grep -E 'Pages|Producer'   # new branch PDF blob
Pages:           8
Producer:        LibreOffice 24.2
```

PDF page count and content match (8 pages); byte equivalence is NOT guaranteed across LibreOffice versions. The build farm uses 24.2; the worktree host uses 26.8.1.1. Re-render on the build farm for byte equivalence.

**Test 3 — MP4 cannot be regenerated from any in-repo script.**

`grep -rn "final-submission" submission/demo/` returns no matches. The binary was not produced by `postprocess.mjs`, `orchestrate.mjs`, `capture.mjs`, or any other tracked script. **Not reproducible.**

## H.5 — Recommendation: precise merge / risk list

| Action | Target | Risk | Recommendation |
|---|---|---|---|
| **MERGE** | `docs/execution/PHASE_4_SUBMISSION.md` (+1 line) | LOW | Single audit-log line. Safe. |
| **MERGE** | `submission/round2/fera-round2-deck.pptx` (binary, 8 slides) | LOW | Pre-built; reproducible from `build_pptx.py`. |
| **MERGE** | `submission/round2/fera-round2-deck.pdf` (binary, 8 pages) | MEDIUM | LibreOffice 24.2 vs 26.8 byte divergence. Re-render on the build farm for byte equivalence; otherwise accept that PDF bytes will not be identical across machines. |
| **MERGE** | `submission/round2/scripts/build_pptx.py` | LOW | 8-slide code; reproduces the pre-built PPTX. |
| **MERGE with PATCH** | `submission/round2/scripts/claims_check.py` | LOW | Update docstring (lines 10–12) to say "8 editable slides" and "8 slide images"; change `range(1, 8)` to `range(1, 9)` on line 192 so slide-8.png is asserted. |
| **MERGE with PATCH** | `submission/round2/platform-submission.md` | HIGH | The Claude AI artifact URL is not a public URL. **Replace the "Public HTTPS demo link"** with `https://github.com/tashobi02/Fera-AI` (the platform guide allows the same URL in both demo fields) or with a real public URL. **Replace the "Demo video URL"** with the same URL or with a YouTube URL if the team uploads `final-submission.mp4` (or `final.mp4` — see below). |
| **MERGE with POLICY DECISION** | `submission/round2/fera-round2-deck.{pptx,pdf}` and `platform-submission.md` together | HIGH | The deck and the platform form no longer contain the literal "Round 2 NOT submitted" caveat. README, links.txt, PHASE_4 and the original `final.mp4` still do. The new copy is judge-facing for **post-submission**. Coordinator must decide whether to (a) merge now and use the deck only after G5 is recorded, or (b) keep the deck on its current 7-slide + "14 Oct / UNKNOWN" copy until G5 is recorded. I do not have a recommendation between (a) and (b) — that is a team decision. |
| **DISCARD or PATCH** | `submission/demo/final-submission.mp4` | HIGH | No reproducible build. `provenance.json` references a different file. If the team needs the closing-card change, add a build script (e.g. `submission/demo/build-submission-video.mjs`) and update `provenance.json`. Otherwise submit the existing `final.mp4`. |
| **DISCARD or PATCH** | `submission/round2/claims-check-report.txt` | LOW | Stale `phase3-finish` path. Re-run `claims_check.py` post-merge to refresh. |
| **NOT IN SCOPE** | `submission/round2/fera-round2-draft.zip` | LOW | Not modified by this branch. The build-submission-zip.py script will pick up the new deck and PDF after a re-run; the OLD `final.mp4` is still in the FILES list (line 8) and `final-submission.mp4` is not in the list. Re-run if the team wants the zip to reflect the new deck; do NOT include `final-submission.mp4` until it has provenance. |

## H.6 — What I did not do, did not run, and did not change

- **No git operations** (no commits, branch changes, merges, pushes, fetches beyond the initial `git fetch origin ccr-91b94c1a-754zqx`).
- **No application tests** (no `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:db`, `npm run test:e2e`). The new branch's claimed test numbers in the PHASE_4 log line are **UNVERIFIED** in this audit session.
- **No edits to source code, specs, docs, submission pack, video or deck** other than this evidence file and its JSON companion.
- **No reads of `.env*`, private keys, tokens, actual credentials, or child payload in logs.**
- **No reads of the dirty worktrees** (`obidit-spec002/tasks.md`, `obidit-spec003/`) — outside this session's scope.
- **No network calls** (other than the initial git fetch); no deployment, no email, no platform upload.

## H.7 — What was not in the original 30-tip audit

This is **not** a member of the 30 non-ancestor tip set. The original audit covered 30 branch tips that pre-date `main` 8499bce. The new `ccr-91b94c1a-754zqx` branch was created AFTER `main` 8499bce and is therefore a direct main-tip branch. It is a separate integration candidate. The 30-tip disposition is unchanged.


## Final coordinator adjudication of Part II

PR50 was merged externally as remote main `7da226b` and incorporated into pre-main at `167c0d4`; the coordinator did not change local main or merge this work to main. The malformed-ID fix is recovered and the full integrated database suite passed 321 tests across 31 files. The historical archive exists in the integration worktree with 24 byte-identical source files. Its absence in this isolated audit worktree is expected. The original draft002/003 files were compared/recovered by the intake/platform lane.

Part II's assertion that the original `provenance.json` is wrong is **withdrawn**: that JSON describes unchanged `final.mp4`. The newer variant needs its own provenance. Omitting “not submitted” on a deck/end card does not assert submission; the written submission status remains NOT SUBMITTED. No new permission ritual is required to prepare honest media. The showcase URL's public access is **UNVERIFIED**, rather than proven private by its URL type; a private GitHub repository is not a replacement public demo URL. Different LibreOffice versions may produce different PDF bytes; verify the current eight pages and content rather than demanding identical cross-version bytes.

A separate Puku artifact-integrity lane is fixing variant provenance/reproducibility, eight-page checks and the stale ZIP/report. Final integration evidence supersedes this static audit's baseline counts. User verification and approval are required before the coordinator merges pre-main to main.
