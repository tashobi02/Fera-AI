# Pre-main integration — 19 October 2026

The user authorized merging the newly added pre-main changes into main after the earlier request to keep them separate. Integrated pre-main `2c7d1bf` into main base `190c178` using merge commit `8c05ef1`, then repaired the merge regressions before advancing main. Application source was finalized at `1939e49`; later commits add tests and repair browser fixtures, ending at `4f00a6c`. This report is scoped automated evidence, not production acceptance or formal G6 approval.

## Merge decisions

- Retained the new text-only device-draft constructor, but bounded its reviewed `source_text` to 4,000 UTF-16 units without a dangling high surrogate. Full original history remains local. Unknown fields and empty evidence remain explicit. Existing main fixes for visible original text and explicit replacement of attempted drafts stay intact.
- Retained the queue's strict component-key allowlist and the matcher running-state refusal/redacted-counterpart cleanup. Kept the correct empty-shortlist cleanup. No scoring formula, threshold, model, manifest or evaluation labels changed.
- Restored BR-019's same-version rejection predicates. The incoming all-version exclusion contradicted D1 and prevented re-evaluation after a report edit. Kept the spec-aligned DB regression, rather than the incoming inverted assertion.
- Kept audit subject UUIDs as strict internal storage metadata, preserving existing main behavior. Frozen public contracts and the database schema are unchanged from `190c178`.
- Removed the incoming network/User-Agent-bound parent-cookie migration after security review found it contradicted D2A §9.5 and FR-037. Existing signed cookies and same-device access survive network/browser-header changes. Production authentication files are byte-identical to main base; signature, expiry, revocation, role and ownership checks remain intact. No session reset or authentication migration is required by this merge.
- Kept the previously verified lint/rehearsal-path fixes while resolving duplicate edits. Fixed a duplicated test object property caught by the production typecheck.
- Updated legacy E2E/offline synthetic candidate fixtures from the unsupported `text` component to the scorer's canonical `cosine`, `name`, `clothing`, `district`, `age` keys. Strengthened the copy test to reject server-error responses and require the actual localized queue heading. The strict queue validator remains intact.

## Regression evidence

| Checkpoint | Observed result and guarantee |
|---|---|
| `8c05ef1` isolated merge | RED: 62 unit passes / two failures (overlong text constructor and widened audit DTO); 12 DB passes / one failure (version-scoped rejection). No failing checkpoint was pushed to main. |
| `2c9a8df` first repairs | GREEN: 165 focused unit checks and 15 DB checks. Manual fallback, source retention, versioned rejection and public audit projections pass. |
| `bb6a17c` continuity regressions | RED: two failures when returning with an existing parent cookie or changing network/browser headers on the same device. Captures the incoming authentication availability regression; also removes the duplicate test property. |
| `1939e49` stable-session repair | GREEN: 180 focused unit checks. Its commit message incorrectly says 173; the captured log records the actual 180. Production authentication restored to the compatible base implementation. |
| `a71b78a` matcher guard regression | Five focused matcher DB checks pass. New check verifies persisted-running refusal before embedding, no new candidates, preservation of the open report and explicit E-005 failure persistence. |
| Browser fixture integration | First full run: 82 passed / two queue API failures. The previous copy test incorrectly accepted an error page. Strengthened copy assertions then produce two expected RED failures (`2955d1e`). After canonical fixture repair (`4f00a6c`), all 84 browser checks and 13 offline checks pass. |

Tests cover the original four pre-main findings from [the earlier inspection](system-fixes-2026-10-19.md#separate-inspection-of-pre-main), plus the additional authentication, compile and fixture issues encountered during integration.

## Verification loop

| Check | Result |
|---|---|
| Production build | PASS, Next.js 16.4.0, network-disabled Node 22 container with DEMO_MODE=1. Existing filesystem-tracing warnings remain. The host Turbopack binding issue uses the same established container workaround as the previous run. |
| Typecheck | PASS, `npm run typecheck`, including the final browser fixture/assertion changes. |
| Lint | PASS, normal `npm run lint`, zero errors / 72 warnings. |
| Unit | PASS, 3,996 passed / 4,309 collected, 313 skipped, zero failed. DB/native tests run separately. Coverage percentage was not measured; Fera's D6 count requirements apply. |
| PostgreSQL 16 | PASS, 324 full-suite checks across 32 files, then five matcher checks including one new check added after that full run: 325 distinct checks exercised. The subsequent full CI run must collect all 325 together. |
| Native embeddings | PASS, six checks using the pinned local model. |
| Browser | PASS, 84 checks, zero skips/flaky/failures, 39.1 seconds. |
| Offline journey | PASS, 13 checks, zero skips/flaky/failures, 26.0 seconds, including owned-server restart and same-session continuity. This is one automated journey run; earlier five repetitions are historical evidence, not five new runs of this merge. |
| Security/diff | PASS, scoped secret/logging scan has no matches; `git diff --check` passes. Contracts, schema and production auth match the base. No dependency changes. |

Browser configurations are temporary derivatives of the repository configs: guarded dedicated DB names and a reused production build replace redundant rebuilds; suites, launchers and assertions remain the repository's. Raw configs containing throwaway signing secrets are not committed. The production build predates later test-only changes; application source is unchanged thereafter. Final unit collection includes the new matcher test; it is skipped there and executed separately against PostgreSQL.

One initial full DB run failed during `roles.sql` setup with `tuple concurrently updated`, rather than a test assertion. Because role definitions are shared across databases, overlapping resets on the same cluster can collide despite isolated DB names. The complete rerun passed with no overlapping coordinator-owned DB resets. Browser, offline and focused resets were run sequentially thereafter. The harness-wide concurrency limitation is recorded here rather than claimed fixed by this merge.

Machine-readable [summary](pre-main-merge-2026-10-19/summary.json), compressed RED/GREEN logs and [offline journey records](pre-main-merge-2026-10-19/offline-journey-records.json) are in the artifact directory. A manifest records file hashes. Full GitHub CI is dispatched after the push; its result and run link are reported in the completion response.

## Fera review

**FERA-REVIEW: PASS.** Read-only reviewers: safeguarding, security, TypeScript, database, ML, Bengali, fallback/error paths and E2E. All selected reviewers ran; final BLOCK count is zero. Security's parent-session continuity blocker and TypeScript's duplicated-property blocker were repaired and re-reviewed as PASS. Safeguarding re-reviewed the compatible authentication repair with no remaining warnings. Database/ML/Bengali/fallback reviews cover final application logic; TypeScript/E2E follow-ups cover the later test and fixture changes. No reviewer is credited with executing the coordinator's tests.

No React screen or locale file changed relative to main; existing localized copy and UI behavior were retained. No owner approval or second-tool approval is invented; final production auth, frozen contracts and extraction contracts are unchanged from base.

## Acceptance limits

All data and mutations are synthetic and local. Browser routing observes browser HTTP(S), not every server egress path. The run does not establish live provider/voice behavior, physical internet-off operation, device/screen-reader acceptance, held-out model quality, human rehearsals, deployment smoke or external submission/access evidence. Existing phase and gate requirements remain pending.
