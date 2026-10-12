---
name: fera-review
description: Pre-PR review gate for Fera. Picks reviewers from the diff using the AGENTS.md routing table, runs them read-only and in parallel (always including fera-safeguarding-reviewer), merges the findings and returns PASS or BLOCK. Use before opening or merging any PR, and on deck, video-script or README changes.
metadata:
  author: "fera-team"
---

# fera-review

Run this after `verification-loop` passes and before asking a human to merge.

## 1. Collect the diff
```sh
base=$(git merge-base origin/main HEAD 2>/dev/null || git merge-base main HEAD)
git diff --name-only "$base"...HEAD
```
Include unstaged, staged and untracked changes as detailed in AMD-REVIEW-1. If all scoped diff sources are empty, stop and say so.

## 2. Pick reviewers from the changed paths
`fera-safeguarding-reviewer` is **always** included. Add each reviewer whose row matches:

| Changed path or content | Reviewer |
|---|---|
| any `*.ts`, `*.tsx` | `typescript-reviewer` |
| `*.tsx`, `src/app/**` | `react-reviewer` |
| `*.sql`, `db/**`, `src/server/{db,case,audit,admin,matching,duplicates,dashboard}/**`, anything with `BEGIN`/`FOR UPDATE`/pgvector | `database-reviewer` |
| `src/app/api/**`, `src/server/auth/**`, `src/contracts/**`, env/secret handling, rate limiting | `security-reviewer` |
| Bangla strings, locale files, `src/server/normalise/**`, fonts | `bengali-reviewer` |
| UI screens or components | `a11y-architect` (review only) and, for a finished screen, `impeccable-finish-reviewer` |
| `src/server/{ai,speech,intake,spend,cache}/**`, retries, fallbacks, `catch` blocks | `silent-failure-hunter` |
| `src/server/{matching,embeddings,duplicates}/**`, `eval/**`, `data/**`, thresholds, manifest | `mle-reviewer` |
| `tests/e2e/**` | `e2e-runner` (review only) |

The confirm transaction, permission and extraction-contract changes also get a **second-opinion review from the other tool** (Codex reviews Claude-written code, and vice versa).

## 3. Run them in parallel, read-only
- **Claude Code:** launch every selected subagent in **one message** and give each the base commit, the file list and "review only, edit nothing, cite file:line".
- **Codex:** spawn the matching roles from `.codex/agents/` (snake_case names). Explicitly assign “review only, edit nothing”; some roles have write-capable sandboxes.
- **Antigravity / other agents:** for each reviewer, start a separate agent conversation, paste `.claude/agents/<name>.md` as its brief, and give it the same inputs.

## 4. Merge the results
```
FERA-REVIEW: PASS | BLOCK
Base: <sha>  Head: <sha>  Files: <n>
Reviewers: <list>   Not run: <list + reason>

BLOCK (must fix before merge)
- <reviewer> · <file>:<line> · <finding> · <BR/FR/TC>
WARN
- …
```
- The verdict is BLOCK if any reviewer reports a BLOCK, or if `fera-safeguarding-reviewer` didn't run.
- Remove duplicate findings, and keep the strictest severity.
- After fixing the BLOCKs, run this skill again on the new head. Paste the final summary into the PR description and update the task row in `docs/execution/PHASE_*.md`.

## Audit amendments (2026-10-12)

- **AMD-REVIEW-1 — Gap:** Diff collection omitted staged/untracked work, and prose overstated role sandbox permissions. **Change:** Collect committed diff plus `git diff --name-only`, `git diff --cached --name-only`, and `git ls-files --others --exclude-standard`; review new files without staging them. A mixed tree needs an explicit task-owned file/change list so team edits are preserved. Check all three worktree sources before declaring the diff empty. Record failing/planned checks honestly; a documentation audit can report findings when the app skeleton cannot pass verification, but cannot claim release/PR readiness. Reviews are read-only task assignments even where a role's configured sandbox can write; do not change permissions. **Source:** user ground rules; AGENTS review workflow; local config.
