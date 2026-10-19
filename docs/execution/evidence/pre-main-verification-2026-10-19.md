# Pre-main verification — 2026-10-19

**Branch:** `pre-main`  
**Verified source:** `4316515` (`fix(a11y): make the review phone link visible [TASK-062]`) and its parent source commits `c9036d9`, `9bdbf8f`, and `aa16581`. The automated repeat report was captured while the same source edits were still uncommitted at base `7b13b5f`; those code files were then committed without further source changes.  
**Data:** synthetic fixtures only. PostgreSQL checks used the disposable local PostgreSQL 16.15 + pgvector 0.8.1 service.

## Results

| Check | Result |
|---|---|
| `npm run check` | PASS. 198 test files passed, 31 skipped; 4,009 tests passed, 329 skipped. Typecheck and audit-action check passed. Lint had 73 warnings and no errors. |
| `npm run test:db` | PASS. 33 files, 341 tests. Each file used a fresh isolated test database. |
| `npm run test:e2e` | PASS. Production build completed; 84 desktop/mobile browser checks passed. |
| `npm run test:offline` | PASS. 13 checks passed, including two server restarts and the zero-external-attempt assertion. |
| `npm run rehearsal:automated` | PASS. Five independent runs; 189 requests and zero external attempts per run. `pre-main-automated-repeat-summary.json` records each run. |
| `npm run smoke` | PASS for health, home synthetic badge, and sign-in form against the Playwright server on loopback. The mutating synthetic-submit check was skipped by default. |
| `npm run db:migrate` | PASS on a fresh schema: migrations 001–007 applied. Verified the no-argument sweep exists, the timestamp overload is absent, and `fera_app` can execute the safe function. |
| Migration failure injection | PASS. A deliberate 007 schema conflict failed the runner; neither migration 006 nor 007 was recorded and the unsafe timestamp overload was absent, proving the pair rolled back together. |
| `npm run release:check` | Exit 2 by design: local allowlist and path checks passed, while the GitHub and organiser URLs remain `UNVERIFIED`. The checker made no external requests. |
| `git diff --check` and secret-pattern scan | PASS. No whitespace errors or matches for the checked secret-like patterns. |

Coverage mode was not available because `@vitest/coverage-v8` is not installed. No dependency was added. This is reported as **not measured**; the Fera test targets in `AGENTS.md` do not require the vendored 80% default.

## Review and merge disposition

Database, security, TypeScript, silent-failure, and matcher-evaluation reviews found no code blocker. The safeguarding reviewer also passed the code but returned **BLOCK** for merge: the full branch diff changes frozen schemas in `src/contracts/`, and `AGENTS.md` requires a PR plus all-owner review before that contract can change. No PR or owner approval evidence is present. The branch remains committed on `pre-main`; `main` was not merged.

The changed contract schemas predate the four verification commits listed above and are part of the full `pre-main` diff. The required owner review is the remaining merge gate.
