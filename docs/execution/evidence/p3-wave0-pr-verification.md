# Phase 3 partial Wave 0.1 PR verification — 17 Oct 2026, 21:50 Asia/Dhaka

**Branch:** `phase2--obidit-phase3-wave0` from `origin/phase2` at `545065d` (PR #26). **Scope:** P3-001–004, P3-011, P3-014–016 and the TASK-009 district seed needed by P3-015. The branch excludes Masnun's unmerged TASK-026/028 work and the blocked P3-010/P3-018 drafts. This is PR readiness evidence for the listed cards, **not a Wave 0.1, G2′, G3, or G4 PASS**.

| Check | Result at `c11dd76` | Evidence |
|---|---|---|
| `npm ci --offline` | exit 0 | Lockfile installed; no paid provider call |
| `npm run lint` | exit 0 | ESLint |
| `npm run typecheck` | exit 0 | Next route types generated; TypeScript strict check |
| `npm test` | exit 0 | 102 files passed, 11 skipped; 2,875 tests passed, 203 skipped |
| `npm run test:db` | exit 0 | 11 isolated local PostgreSQL test files passed; 203 tests total |
| `npm run build` | exit 0 | Next.js 16.4.0 Turbopack production build in a repository-local worktree |
| `npm run test:e2e` | exit 0 | 4/4 smoke and axe checks across 360 px mobile and desktop; dedicated local synthetic DB |
| 360 px S-003 visual check | PASS | [Current district search card](screenshots/p3-015-review-360.png), captured with a temporary synthetic Playwright fixture; no horizontal clipping |
| Changed-file secret scan and `git diff --check` | PASS | No `.env*`, key material, or credential additions; diff whitespace clean |

The `/tmp` worktree's Turbopack build failed while binding a local CSS worker port. The same committed code built and passed E2E from the repository-local worktree with its own `npm ci`. Unit subprocess tests also needed elevated local execution because the sandbox suppressed their child-process output. These were environment failures; the passing commands above ran on the same commit. The screenshot fixture was removed after capture.

**Pre-PR `fera-review`: PASS** on the clean diff after fixes. Safeguarding, TypeScript, security, React, database, Bengali, accessibility, MLE, and E2E reviewers completed read-only reviews. React found that the district could not return to unknown and lacked D3/D4 bilingual alias search; Bengali confirmed the search gap. Both were fixed, with 44/44 focused tests and renewed PASS. Accessibility requested result announcements and an updated narrow screenshot; both were provided, with renewed PASS. Security requested that E2E require the `fera_app` role; fixed and re-reviewed PASS.

**Limits to carry into the PR:** District names, centroids, and adjacency are AI-compiled and unverified (DEP-004/A-019); never present them as authoritative or use adjacency as a hard eligibility filter. The embedding spike is exploratory and lacks a saved corpus/script/model revision/raw timing artifacts; it cannot approve model promotion. The CI E2E job is `workflow_dispatch` only, and its current four checks cover the welcome screen and axe, not safeguarding journeys. TASK-003 human provider keys/spend controls remain `todo`; no paid application provider call ran. OD-014-7 and OD-020-3 remain open. P3-010, P3-012, and P3-018 are blocked, P3-013 awaits Mahim's unmerged S-005 branch, and P3-043 awaits TASK-019 seed. No Wave 0.1 gate PASS is claimed.
