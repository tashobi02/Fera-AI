# Phase 3 worker batch: status at 2026-10-18 (Asia/Dhaka)

Written by the Claude Code planner session. Everything here is synthetic-data work built by puku-cli (Opus 4.8) workers and verified by the lead session. Branch `phase3-integration` = `origin/phase2` + Masnun's open PR stack (#33–#37) + the green lanes below.

## Measured on `phase3-integration`
- `npm run typecheck` 0 errors, `npm run lint` 0 errors (4 warnings).
- `npm test`: 123 files passed, 1 failed, 3221 tests passed, 1 failed. The one failure is `tests/embeddings/scripts-cli.test.ts` under full-suite load; it passes alone (5/5), so it is a timeout flake.
- `npm run test:db`: 19 files, all passed.
- `npm run test:e2e` was run on the e2e lane only: 18 passed, 8 skipped (`test.fixme`).

## Lanes (branch `phase3--<id>-<slug>`, local worktrees under `fera-lanes/`)
| Card | Result | Notes |
|---|---|---|
| P3-030 filters | merged | BR-017 time rule is ONLY "found upper >= missing lower"; only rejected pairs at the same versions are excluded; pending pairs stay eligible so a rematch can re-rank them (lead decision) |
| P3-031 scoring | merged | A-028 weights with available-feature normalisation; `experimental: true`; thresholds are documented defaults, calibrate on dev only |
| P3-032 reasons | merged | thin adapter over `compareCases` (never computes its own verdict) |
| P3-033 duplicates | merged | contradiction gate, two-field rule, shared phone never links; threshold 0.5 uncalibrated |
| P3-041 dashboard | merged | API-012 counts include redacted cases (TC-015). The stub GET /api/cases (API-022) was removed: it returned an empty list. API-022 needs the case service to expose a row fetch (Mahim) |
| P3-024 embeddings | merged | adds `@huggingface/transformers` 4.3.1; see `evidence/embedding-dependency-note.md` (CUDA install download, nightly onnxruntime-web, unpinned model revision are OPEN decisions) |
| P3-022 manifest | merged | 40/60 dev/test by identity group per D2B §17 and OD-010-2; not frozen |
| P3-012 labelled drafts | merged | 50 input texts, labels empty (a person labels; Obidit reviews) |
| P3-101 TC-007 test | merged | |
| P3-108 disaster mode | merged | exact D3 banner wording; no link from S-007 footer yet |
| P3-209 e2e | merged | TC-025/026 UI checks and TC-023 pass; TC-022 and TC-028 are `fixme` with reasons; adds per-run AUTH_SECRET/PARENT_COOKIE_KEY to the e2e web server in `playwright.config.ts` |
| P3-034 review queue | **WIP, not merged** | signed cursor + staleness predicate written; 2 of 14 DB tests fail (pagination deep-equal, redacted found case) and the test files have type errors |
| P3-019 S-012 case detail | **WIP, not merged** | ~15 of 28 UI tests disagree with the component; needs a rewrite pass |

PRs #40 (close/audit), #41 (smoke), #42 (eval scripts) are open drafts against `phase2` from earlier in the session.

## Open decisions
1. How to publish: lanes branch from `phase3-integration`, which contains Masnun's unmerged PRs, so PRs straight to `phase2` would also show his files. Suggested: merge #33–#37 first, then rebase/open lane PRs.
2. Masnun owns matcher, embeddings, dashboard, manifest and eval data; tell him before PRs land.
3. API-022 (case list) route: Mahim to expose a list/row fetch from `@/server/case`.
4. Duplicate and qualify thresholds, embedding revision pin, ONNX install settings (see the dependency note).
5. Plan card P3-030 still says "time interval overlap": it should say BR-017's one-sided rule.
