# Obidit → Mahim and Masnun: Phase 2 handoff

**Date:** 2026-10-16. **Branch:** `phase-2-obidit-handoff` (from `origin/phase2` at e39f8d4).
This is everything Obidit has for Phase 2.

All work here is a synthetic-data prototype. Nothing was tested on real providers, a real phone or a screen reader.

## 1. What this branch is, and how to merge it

This branch contains every open Obidit PR, merged into one tree, plus the hand-off documents. **Merge this PR instead of the separate ones; do not merge both.** After it merges, GitHub shows the others as merged because their commits are inside it. **Use "Create a merge commit".** A squash or rebase merge would leave #25 and #28 to #30 open, and merging them afterwards would apply the same changes twice.

| Included | PR | What it is |
|---|---|---|
| Mahim's integration | #25 | Lands #23 (TASK-020 part 1) and #24 (TASK-014 part 1). Mahim's branch `phase2--mahim-integrate2`, merged in unchanged. |
| S-001, S-002, S-003 | #30 (contains #27) | Parent intake chat, voice recorder and review screen. |
| LLM adapter | #28 | TASK-013. |
| `npm run spend` | #29 | TASK-059. |

If you prefer to merge the PRs one by one, the order is #25, then #30, then #28 and #29. Skip #27: it shows a tracker conflict, but #30 contains it and merges cleanly. #30 merges cleanly after #25. #28 and #29 each conflict only in `docs/execution/PHASE_2_MUST_CORE.md` (task rows and log lines). This branch already holds those resolutions.

Not in this branch: Mahim's #26 (S-004 outputs, TASK-024).

## 2. Status

| Task | State | Evidence |
|---|---|---|
| TASK-012 normaliser | merged (#18) | |
| TASK-023 templates, wording guard, API-006 | merged | |
| TASK-022 part 1 (API-003 submit) | merged (#20) | `docs/execution/evidence/intake-submit-api.md` |
| TASK-063 spend counters | merged (#22) | |
| TASK-013 LLM adapter | in this branch (#28) | `docs/execution/evidence/intake-llm-adapter.md` |
| TASK-014 part 1 speech adapter | in this branch (#24 via #25) | `docs/execution/evidence/speech-adapter.md` |
| TASK-020 part 1 follow-up questions | in this branch (#23 via #25) | `docs/execution/evidence/intake-questions.md` |
| TASK-021 S-001/S-002 | in this branch (#27 via #30) | `docs/execution/evidence/intake-ui.md` |
| TASK-022 part 2 S-003 | in this branch (#30) | `docs/execution/evidence/review-submit-ui.md` |
| TASK-059 `npm run spend` | in this branch (#29) | `docs/execution/evidence/spend-cli.md` |

Every Obidit PR above passed the Fera safeguarding gate before this hand-off. #25 is Mahim's integration of #23 and #24, which were gated separately.

The tracker keeps merged tasks at `review` (as it does for Mahim's TASK-007 and TASK-015) until the lead marks them `done`. The PR / commit column now names the PRs.

**Integrated-tree results for this branch (measured, 2026-10-16 22:58, Asia/Dhaka, by the lead; a puku worker's run a few minutes earlier gave the same numbers):**
| Command | Exit | Result |
|---|---|---|
| `npm run lint` | 0 | no findings |
| `npm run typecheck` | 0 | no errors |
| `npm test` | 0 | `Test Files  95 passed \| 9 skipped (104)`, `Tests  2704 passed \| 185 skipped (2889)` |
| `npm run build` | 0 | compiled |
| `npm run test:db` | 0 | 9 files: 48 + 18 + 13 + 38 + 4 + 10 + 11 + 20 + 23 = 185 |
| `npm run spend` | 0 | `status=ok`, `cap_usd=25.000000` |

The argon2 timing flake did not occur in either run.

**Known flake:** the full `npm test` can fail on the argon2 timing tests in `tests/auth` when the machine is under load (OD-013-6 in `intake-llm-adapter.md`). They pass when run alone. It happened in several runs during this work. Mahim owns the sign-in test.

## 3. Not done

The parent journey does not work end to end yet. These tests are met only at adapter or service level, and the PRs say so: TC-001, TC-002, TC-036.

| Task | Why it is not done |
|---|---|
| TASK-003 provider keys, prices | Obidit does this by hand. Nothing runs against a real provider until it is done. |
| TASK-014 part 2 (API-001) | Needs `DRAFT_SIGNING_KEY` (section 4) and the route, draft and token decisions (OD-014-7). Plan: `obidit/task-014-blueprint.md` (planning only). |
| TASK-020 part 2 (API-002) | Needs #28 and #25 merged, `DRAFT_SIGNING_KEY`, and the round-counter decision (OD-020-3, section 4). Plan: `obidit/task-020-blueprint.md` (planning only). |
| TASK-033 demo cache | Needs TASK-020 part 2 and Masnun's TASK-019 seed. |
| TASK-049, TASK-050 (S-006, status API) | Not started. A string draft exists: `obidit/s006-strings-draft.md`. It leaves open the destination after save (ACT-017), the badge-to-status mapping, and whether offline edits are kept. |
| TASK-035 Bangla copy for every state | A work list exists: `obidit/state-copy-audit.md`. S-004 was not audited, and the S-003 section predates the last S-003 fixes. |
| TASK-040 WER run, video shots | Human work. |
| Specs | `specs/002-intake-ai/tasks.md` and `specs/003-parent-outputs/` are drafts in their own commit. **Obidit has not skimmed them.** Drop that commit if you do not want them. Known issues are noted at the top of each file: `tasks.md` has a stale "work already in flight" section and sends the four-round exit to S-005 while the implemented decision (OD-021-7) sends it to S-003; spec 003 treats the badge mapping as settled (it is open, OQ-B1-2), describes the poster contact as a toggle (D4:187 requires an explicit choice with no default), and uses "confirmed" ambiguously. |

Mahim's tasks that depend on this work: TASK-024 (S-004) is in #26. TASK-025 (S-005, `/intake/form`) can start now that S-003 exists. S-002 links to `/intake/form`, labelled "planned", until it exists. S-003 shows the manual form as a planned label with no link.

## 4. For Mahim

**Approvals (shared files you own):**
1. `src/app/api/_shared/log.ts`: three event names only (`ai.attempt`, `ai.summary`, `ai.input_rejected`). Same pattern as #22 and #24. OD-013-15.
2. `scripts/db/guard.mjs`: an optional `label` parameter so the spend command's messages do not say "db:reset". The default keeps every message byte-for-byte. AGENTS.md lists no owner for `scripts/db/`. Also `scripts/db/test-db.mjs` (one entry in `FILES`) and the `spend` script in `package.json`.
   Also in your area, from #27: `src/app/page.tsx` (your TASK-008 shell) is deleted because `src/app/(parent)/page.tsx` now serves `/`, and `src/locales/index.ts` gains 325 lines (S-001 to S-003 strings) and loses none. Approval by the file owner is UNKNOWN.

**Blockers for TASK-014/020 part 2:**
3. `DRAFT_SIGNING_KEY` is in D2B §15.1 (line 193), but `src/server/auth/secrets.ts` only knows `AUTH_SECRET` and `PARENT_COOKIE_KEY`. Part 2 will fail closed until it is added; there is no fallback to `AUTH_SECRET`.
4. OD-020-3, round storage: `intake_drafts` has no round column, and a client token cannot be the counter (D2A:1300). Resolve with Masnun. A schema change needs all-owner review.
5. OD-022-5: who mints the parent session on the direct S-005 submit path. Evidence: `intake-submit-api.md`.

**Decisions taken on Obidit's side. Several evidence docs call them "lead decisions", but they were taken by Obidit as task owner, not by Mahim as phase lead (on phase2, AGENTS.md names Mahim as lead). Please confirm or overturn:**
- OD-022-10: drafts expire at 24 h with no grace period, including drafts the parent tried to submit. Cost: if a submit reached the server but the parent never saw the confirmation, the device loses its retry reference after 24 h. The server copy is unaffected.
- OD-022-17: the part-of-day chips use working hour ranges (06–12, 12–15, 15–18, 18–20, 20–06 next day). They need human review.
- OD-013-10/11/14/16: the evidence checker is an allowlist and forward scope; some misreads are accepted. **Their mitigation is that S-003 shows the parent's full text beside every prefilled field. That only holds once S-003 is merged.** Over-abstention is accepted (a sentence like "He didn't come home." makes earlier facts unknown); the rate is not measured.
- OD-021-7: the four-round exit also offers S-003 (D1 STORY-003 AC2). D3:69 and D1 STORY-003 AC2 send it to S-003; D3:483 sends it to S-005. Changing the spec needs both copies and the manifest.
- OD-059-1/2/3: no warning threshold (the pack defines none). The database cap is the enforced one; if `AI_SPEND_CAP_USD` is set and differs, the command exits 4. The app does not read that variable (DECISION-017's "raise cap via env" is not implemented).

**Other:**
- OD-013-9: the adapter's provider interface differs from D5 §6 `LLMProvider` (contracts owner).
- S-003's success screen shows "Submitted report page" as plain text with a planned label, because the `/report/<id>` page (S-004, #26) is not in phase2 yet (OD-022-12). Wire the link when #26 merges.
- OD-023-1/2 were implemented in #26 as proposed. #26 says Obidit still needs to acknowledge them, and `contract-notes.md` lists Obidit and Mahim as owners. They are still open on both sides.

## 5. For Masnun

- **Districts (TASK-009).** Your branch `phase2--masnun-districts` is not in phase2 yet. S-003's district field is a required number from 1 to 64, labelled `[MOCK]` (OD-022-14). A parent who does not know the number cannot submit. When TASK-009 merges, Obidit swaps it for a named list.
- **Round storage.** OD-020-3 above needs you and Mahim.
- **What S-003 submits that matching should expect.** A parent can submit an *estimated* age: `age_years` empty with `age_min` and `age_max` set. A time can be approximate: `at_lower` and `at_upper` set, from a part-of-day chip. See `src/contracts/draft.ts` and `tests/intake/review/review-fields-regressions.test.ts`.
- **Tracker dependencies:** TASK-020 (Obidit) unblocks your TASK-026. Your TASK-019 seed unblocks Obidit's TASK-033.

## 6. Documents with this hand-off

In `docs/execution/handoff/obidit/`. Local file paths inside them point at Obidit's laptop and do not resolve here.

| File | What it is | Status |
|---|---|---|
| `open-decisions-index.md` | Every open-decision definition line found in the evidence docs, specs and phase trackers, copied in full by a script, one row per line | Generated by script; its header names the commit. Decisions added afterwards are not in it |
| `state-copy-audit.md` | TASK-035 work list | Reviewed by a second agent; S-004 unaudited; S-003 section stale |
| `s006-strings-draft.md` | bn/en strings for S-006 | Draft; new Bangla needs human review |
| `bangla-review-sheet.md` | Bangla strings for a human reviewer | 329 rows; reviewer column blank; 85 rows are backend strings, not locale keys |
| `task-014-blueprint.md`, `task-020-blueprint.md` | Plans for the two unbuilt routes | Planning only |

Bangla strings added in these PRs are marked "needs human Bangla review". None has been reviewed by a person.

## 7. How the work was checked

Each PR was built by an AI worker (Codex, Antigravity or puku), reviewed by a second agent, and (for the Obidit PRs) passed the `fera-safeguarding-reviewer` gate. Several workers wrote counts or "done" claims that were false, so the gate re-measured the numbers. The bodies of #23, #24, #28, #29 and #30 say who measured each number; the older PRs give counts without saying. This is still all agent-checked. No human has reviewed the code line by line, run it on a phone, or run Playwright/axe.
