# System integration fixes — 19 October 2026

Later follow-up: [pre-main merge and regression repairs](pre-main-merge-2026-10-19.md) records the subsequently authorized integration.

The five defects in [the original execution report](system-test-2026-10-19-8499361.md) are fixed and their scoped automated checks pass. This does not establish production acceptance, human rehearsal completion or formal G6 approval.

Base: `8499361daa64898de2e938551b9e63e181cb3f32`. Final application source: `77cdfee52333f9c0b656d2a1d0849cac4a078469`. Commit `c32dedc` subsequently changes only the lint regression test's cold-initialization timeout, from 5 to 30 seconds. The final unit run already included that timeout adjustment. No dependencies, public contracts or database schema changed.

## Resolved defects

| Original ID | Result and regression evidence |
|---|---|
| SYS-BUG-01 | Text-only and empty handoffs open an editable manual form. Full original text remains device-local and visible; the submission field respects its 4,000-character contract without splitting a surrogate pair. Unknown fields remain unknown. An attempted submission requires explicit replacement. Unit regressions and six browser checks cover direct manual navigation and initial E-013 / E-023 responses across two viewports. Error responses are injected at the browser HTTP seam; live-provider behavior is not claimed. |
| SYS-BUG-02 | Verification audit details persist a strict UUID identifying the affected account. Two different targets remain distinguishable in restricted-role DB tests. |
| SYS-BUG-03 | Duplicate-decision audit details persist the link UUID, distinguishing A–B and A–C. Internal storage keys do not expand frozen public DTOs; unit and restricted-role DB tests verify this. |
| SYS-BUG-04 | Rehearsal configuration paths resolve correctly whether absolute or repository-relative. CLI regressions pass; the actual absolute-path CLI completes five repetitions. |
| SYS-BUG-05 | ESLint ignores nested `.worktrees/**` while retaining coverage of the active application. The normal lint command passes. A regression exercises ESLint's real configuration loader. |

Failing regressions were committed before fixes (`c32537e`; additional visible-text regression `db72a7d`). The latter caught a first implementation that retained text without rendering it. Its green focused run contained **40 checks**, correcting the inaccurate “19 focused checks” wording in commit `77cdfee`'s message.

## Verification loop

| Check | Observed result |
|---|---|
| Production build | PASS, Next.js 16.4.0; offline `node:22-bookworm-slim` container, network disabled, `DEMO_MODE=1`. Native host build cannot load this host's Turbopack binding; this is the verified build workaround. |
| Typecheck | PASS, `npm run typecheck`. |
| Lint | PASS, `npm run lint`; zero errors, 73 warnings. |
| Unit | PASS: 3,992 passed / 4,303 collected; 311 skipped, zero failed. DB/native tests are exercised separately. Coverage percentage was not measured; Fera's test-count requirements supersede the vendored 80% default. |
| PostgreSQL 16 integration | PASS: 323 tests across 32 files, fresh isolated DBs using restricted application roles. Backend source was unchanged between this run and final source. |
| Native embeddings | PASS: six checks, pinned local model. |
| Standard browser suite | PASS: 84 checks, zero skipped or flaky, 43.7 seconds; production build reused after successful build verification. |
| Offline repetitions | PASS: five runs of 13 checks, distinct owned DBs, all cleaned up. Each recorded 189 loopback browser requests and zero external browser attempts. Source attribution is `77cdfee`; dirty-tree disclosure includes only evidence outputs and the test timeout adjustment. |
| Security and diff | PASS for this scoped change: strict UUID storage allowlist, unchanged role projections, notice/review gates and atomic audited writes preserved; no new secret literals or console logging in changed runtime files; `git diff --check` passes. |

Raw logs are compressed in [the artifact directory](system-fixes-2026-10-19/). [Unit counters](system-fixes-2026-10-19/unit-summary.json) and [five-run summary](system-fixes-2026-10-19/offline-repeats.json) retain measured denominators. Temporary browser configurations only skip a repeated build and choose guarded, isolated DB names; they retain the repository suites and server launchers. Raw configurations containing throwaway signing secrets are not published.

One intermediate unit run exceeded Vitest's default five-second timeout while cold-loading Next.js ESLint plugins. The specific integration test now has a 30-second limit; its assertions are unchanged, its focused rerun passed, and the final full unit run passed. Earlier repetitions during source changes are excluded from the final evidence.

## Fera review gate

**FERA-REVIEW: PASS**, scoped to the five fixes. Base `8499361`; reviewed application head `77cdfee`, including the unstaged timeout-only test adjustment. Read-only TypeScript, React, database, security, safeguarding and E2E reviewers reported PASS without blocking findings. Accessibility review supplied a substantive static PASS before its terminal agent quota error. E2E suggested optional stronger edit/no-submit assertions in the error-response scenarios; direct navigation already checks no pre-review case submission.

Dedicated Bengali, ML and fallback reviewers could not run because the agent quota was exhausted. Coordinator review covered those surfaces: existing Bangla locale strings are reused; truncation preserves UTF-16 boundaries; original text stays visible; there is no new ranking/model behavior; duplicate audit metadata changes no matching decision; text-only fallbacks remain local, unknown-valued and replacement-gated. Specialist completion or owner approval is not invented.

## Separate inspection of pre-main

Inspected `origin/pre-main` at `2c7d1bf` (PR #54, implementation commit `7234b73`) in a detached worktree. It is **not included in this main push**. It overlaps all five original fixes and additionally changes authentication, matching and frozen public audit contracts. Its typecheck and normal unit suite pass (3,982 passed, 310 skipped), but four restored/additional regressions fail:

| Finding | Reproduction and consequence |
|---|---|
| P1 — BR-019 regression, `src/server/matching/filters.ts:116` | Reject a pair at version 1, then edit the missing report to version 2. The changed SQL excludes the pair permanently. D1 BR-019 explicitly limits rejection suppression to the **same report versions**. Restoring the original spec-aligned DB regression produces 12 passes / one failure. PR #54 changed that test to assert the opposite of the spec. Retain the version predicates before integrating. |
| P1 — long manual handoff throws, `src/lib/intake/draft-store.ts:97` | A text-only handoff can hold up to 20,000 characters, but the new constructor parses the complete text into a field capped at 4,000. The manual-form lifecycle throws `ZodError` instead of opening the form. Retain full local history and bound the submission field as this fix branch does. |
| P2 — original text remains hidden, `src/app/(parent)/intake/review/review-fields.tsx` | An unknown-valued manual draft with no evidence does not render its original text when local and draft strings are equal. The visible-text regression fails. This fix branch explicitly renders that panel. |
| P2 — new text handoff ignored after attempted submit, `src/app/(parent)/intake/form/manual-form.tsx:144` | The old replacement check requires an extraction response. With an attempted draft and a new text-only handoff, no replacement choice appears and the old attempted draft wins. The explicit-replacement regression fails. This fix branch handles every handoff. |

The manual lifecycle probes yield 15 passes / three failures on pre-main. Their [test source](system-fixes-2026-10-19/pre-main-manual-regressions.test.ts.txt), the [spec-aligned DB regression source](system-fixes-2026-10-19/pre-main-spec-filters.test.ts.txt) and failure logs are retained. The same manual checks and original version-scoped filter test pass in this main-bound scope.

Additional review notes: pre-main binds parent cookies to the request's normalized address and User-Agent and invalidates previous three-part cookies. Its comments incorrectly promise IP/24 grouping and legacy-token compatibility; the code uses exact IPv4 addresses and accepts only four-part tokens. Network-change/session-continuity behavior needs an explicit product decision before that change is integrated. The public audit DTO additions touch frozen contracts; evidence of all-owner approval is UNKNOWN. The new queue component allowlist matches the actual scorer keys. The suspected empty-shortlist cleanup issue is not a confirmed bug: the preceding supersede query already removes dropped pending rows.

## Remaining acceptance limits

These results use synthetic inputs and dedicated local databases. Browser routing observes browser HTTP(S), not server egress, Node fetches or every WebSocket. Automated repetitions do not substitute for five human rehearsals, physical internet-off/device testing, screen-reader acceptance, live voice/provider testing, held-out quality metrics, production smoke or external submission/access evidence. Those remain governed by their existing phase/gate rows.
