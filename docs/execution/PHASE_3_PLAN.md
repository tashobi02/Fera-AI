# Phase 3 plan: Wave 0 unblockers, features, quality, release

**Branch:** `phase-3-obidit` (from `origin/phase-2-obidit-handoff` 82e1c08, plus merges of `phase-2-masnun` and `phase2--mahim-outputs`). **Written:** 2026-10-17 (Asia/Dhaka) by the planner (Claude Code, Opus 5.5). **Status:** executing; the user reported Mahim's approval of the rebaseline (§2) and D-A on 17 Oct. Other §3 decisions remain open.
**Tracker:** task status lives in §9 of this file. Log lines go in the owner sections of [PHASE_3_FULL_SCOPE_QUALITY.md](PHASE_3_FULL_SCOPE_QUALITY.md#log). The orchestrator alone updates TASK rows in the Phase 2 and Phase 3 trackers when every sub-task of a TASK is merged (single writer, so there are no row conflicts).
**Rules:** [AGENTS.md](../../AGENTS.md) first. Synthetic data only. No paid provider call until TASK-003 is done by a human (spend cap USD 25). Never cut review-before-submit, officer confirm, referral, audit or redaction.

---

## 1. Baseline on `phase-3-obidit` (measured 2026-10-17)

| Step | Result |
|---|---|
| Merge `phase-2-masnun` | Merge commit b4e98b3. Conflicts in `src/locales/index.ts`, `src/app/components/icons.tsx` and `scripts/db/test-db.mjs`, resolved additively (both sides' strings and icons; FILES = union, `districts-seed.test.ts` added) |
| Merge `phase2--mahim-outputs` | Merge commit fc2ce98. **Did not merge cleanly**: `src/locales/index.ts` conflicted with Masnun's additions (both sides appended). Resolved additively; one duplicate key `callHelpline` (same value on both sides) kept once |
| Other phase2 branches | Verified with `git merge-base --is-ancestor`: all contained in the base. Not merged again |
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | **exit 1**: `Test Files 2 failed \| 106 passed \| 10 skipped (118)`, `Tests 2 failed \| 2928 passed \| 191 skipped (3121)`. Both failures come from the merge, not from flakes (see P3-002/P3-003). The argon2 tests did not fail |
| `npm run build` | exit 0 |
| `npm run test:db` | exit 0: 10 files, 48+18+13+38+4+10+11+20+23+6 = **191** tests |

Setup notes: `node_modules` in the main checkout was a partial install, so `npm ci` was run. `git fetch` over SSH fails (no agent key loaded); fetching over HTTPS with `gh auth git-credential` works. Pushing needs one of the two.

---

## 2. Rebaseline to the 24 Oct finale: **approved by Mahim, as reported by the user on 17 Oct**

The 14 Oct times in the Phase 3 tracker are stale. Whether Round 2 was submitted, and whether TASK-044–046 are still needed, is **UNKNOWN**. This plan does not cover them (open decision R-1). Capacity per person is **UNKNOWN**; these are targets, not a computed schedule.

| When (Asia/Dhaka) | Event | Exit evidence |
|---|---|---|
| Sat 17 Oct | Lead confirms merge, push, decisions in §3. Wave 0.0 | `npm test` exit 0 on `phase-3-obidit` |
| Sat 17 – Sun 18 Oct | Waves 0.1 and 0.2 | Wave gate per §6 |
| Sun 18 – Mon 19 Oct | Waves 0.3–0.5 | **G2′ Mon 19 Oct 22:00**: the G2 Must checklist with evidence (or each miss recorded) |
| Mon 19 – Tue 20 Oct | Wave 1 features | **Feature freeze Tue 20 Oct 22:00** |
| Wed 21 Oct | Wave 2 quality; human phone test, timing study, clip recording | **G3 Wed 21 Oct 20:00** |
| Thu 22 Oct | Wave 3 release: deploy (explicit go-ahead), performance, final frozen eval | **G4 Thu 22 Oct 22:00** |
| Fri 23 Oct | Phase 5: TASK-053 local stack, TASK-054 rehearsals (≥1 offline), TASK-058 backup recording, TASK-055 finale deck. Not detailed here | [PHASE_5_BUFFER_FINALE.md](PHASE_5_BUFFER_FINALE.md) |
| Sat 24 Oct | Finale | — |

Cut triggers (D6 §11 order, lead approves each cut; a cut is recorded as an omission against its FR/TC, never as PASS):
1. G2′ missed by more than 6 h → cut TASK-052 (FR-036 disaster screen).
2. Wave 1 not merge-ready Tue 20 Oct 18:00 → cut in order TASK-047 (FR-010; it is built, so cutting means hiding the card and its claim), TASK-048 (FR-024), TASK-049/050 (FR-029/030).
3. TASK-003 keys not available Wed 21 Oct 12:00 → live voice is cut; keep the labelled cached note (TASK-033) and the typed path.
4. Last: poster PNG (keep poster text).

---

## 3. Open decisions and assumptions (not resolved here)

Tasks marked **GATED** do not start until their decision is recorded in the Phase 3 tracker log by the person named.

| ID | Question | Blocks | Who decides | Planner's note |
|---|---|---|---|---|
| D-A | How to fix the two merge-caused test failures | P3-002, P3-003 | Lead + Obidit (guard) | **Approved by Mahim, as reported by the user on 17 Oct:** (1) add `matchReviewSimilarityNote` and `matchReviewDialogBody` to `NEGATED_DISCLAIMER_KEYS` and update the pinned assertion: they are the honest negations D4 asks for ("not a probability", "referral recorded (simulation)"); (2) narrow the photo regex so `getUserMedia({ audio: true })` passes but any `video` constraint fails (TC-026 allows audio input) |
| OD-014-7 | API-001: notice acknowledgement mechanism, draft creation, token signing, route/session/codec validation, cache | P3-017 | Obidit + Mahim | Blueprint: `docs/execution/handoff/obidit/task-014-blueprint.md` |
| OD-020-3 | Authoritative follow-up round storage: `intake_drafts` has no round column; a client token cannot be the counter (D2A:1300) | P3-005, P3-020 | Obidit + Masnun + Mahim (schema change = all-owner review) | Option to evaluate: add `follow_up_rounds smallint NOT NULL DEFAULT 0 CHECK (0..4)` with atomic increment. Not decided |
| OD-022-5 | Who mints the parent session on the direct S-005 submit path | P3-013 | Mahim | **Decided by Mahim in `c1269e7` (17 Oct, on `origin/phase2--mahim-parent-session`, not yet merged into `phase2`):** API-003 mints the anonymous parent session only when no parent cookie is sent. A present unusable parent cookie remains E-002/E-019; later branch fixes `f863070`/`570cd28` handle dead-cookie clearing without replacing a valid parent cookie. S-005 draft is `2fbb8d0` on `origin/phase2--mahim-manual-form`; reconcile after its PR. |
| OQ-B1-2 | Parent badge → status mapping | P3-103, P3-104 | Lead | Also affects the S-004 badge already merged |
| ACT-017 | Destination after a successful S-006 save; badge mapping; whether offline edits are kept | P3-103 | Lead | D3 §row 12 gives E-018 lock copy and "S-003 or tel:13219" as recovery only |
| R-1 | Round 2 submission status; are TASK-044–046 still owed? | scope | Lead | **UNKNOWN** |
| R-2 | Lead identity. AGENTS.md says "Lead: Obidit (from 13 Oct)"; the trackers and this brief say Mahim | approvals | Team | Plan follows the brief (Mahim). Fix AGENTS.md or the trackers |
| R-3 | Production DB host (OQ-021), Vercel project and managed DB access | P3-301 | Mahim | **UNKNOWN**; needed before deploy |
| R-4 | Embedding: local Transformers.js vs API (TASK-004 outcome) | P3-024 | Masnun | P3-011 produces the evidence |
| R-5 | Map rendering: bundled district outlines (source and licence **UNKNOWN**) vs centroid dots + table; Leaflet optional | P3-050 | Masnun | Default if no outline data with a known licence: table + centroid SVG, no Leaflet |
| R-6 | Owner of the import service (TASK-048 is Masnun's; `src/server/admin/` is Mahim's) | P3-105 | Team | Proposal: new module `src/server/import/` owned by Masnun; add it to the AGENTS.md table |
| R-7 | Mentor session 2 fix list is empty (Phase 2 tracker) | TASK-056 | Mahim | Fill the table first; P3-109 is generated from it |
| R-8 | TASK-011 is "hand-labelled". Agents may draft synthetic texts; labels come from a person | P3-012 | Masnun + Obidit review | Assumption: agent drafts, human labels |
| R-9 | Exact CLI invocations for puku, agy and Codex Luna 6 are not in this repo | §7 | Orchestrator owner | **Resolved for installed CLIs 17 Oct:** `puku-cli -p --model opus-4-8 --effort high` reports `modelUsage.opus-4-8`; `claude -p --model haiku --effort high` reports `modelUsage.claude-haiku-5-5`; `agy models` lists `gemini-3.8-flash-high` (execution not yet verified); `codex exec -m gpt-6-luna -s read-only --ephemeral` reported model `gpt-6-luna` and completed the Wave 0.0 review. Puku editor's `puku chat` is a different launcher. |
| R-10 | Pending confirmations from the handoff §4 (OD-022-10, OD-022-17, OD-013-10/11/14/16, OD-021-7, OD-059-1/2/3, OD-023-1/2, OD-013-15 log names, guard.mjs label) | not blocking | Mahim | Record yes/no in the tracker log |

Assumptions: matching, dashboard and import are Masnun's paths per AGENTS.md; a task that must touch another owner's file goes in as a small PR tagged for that owner (AGENTS.md). Phase 5 tasks are outside this plan.

---

## 4. Baseline gap check before Wave 0

Historical snapshot checked against files, routes and npm scripts on `phase-3-obidit` before the Wave 0 cards merged. For current integration state, use the status table in §9 and the Phase 3 tracker log; rows below are not refreshed after each PR.

| Task | Tracker | Code on `phase-3-obidit` | Verdict |
|---|---|---|---|
| TASK-003 keys | todo | no provider SDK or key check runs | **unmet (HUMAN)** |
| TASK-004 embedding spike | todo (P0) | no report, no model dependency | **unmet** |
| TASK-010 synthetic set | blocked (P1) | `data/` has only `districts.json` | **unmet** |
| TASK-064 manifest | blocked (P1) | none | **unmet** |
| TASK-011 labelled reports | todo | no `eval/` directory | **unmet** |
| TASK-014 part 2 API-001 | in progress | no `src/app/api/intake/transcribe`; `DRAFT_SIGNING_KEY` absent from `src/server/auth/secrets.ts` | **unmet**, GATED OD-014-7 |
| TASK-016 embeddings | todo | no `src/server/embeddings/`; `reembed` is a stub | **unmet** |
| TASK-017 matcher | todo | `src/server/matching/` holds only `candidate-read.ts` (API-009 read) | **unmet** |
| TASK-018 duplicates | todo | no `src/server/duplicates/` | **unmet** |
| TASK-019 seed demo | todo | `db/seed/index.mjs` loads 64 districts only; says `--set` loads no records yet | **unmet** |
| TASK-020 part 2 API-002 | in progress | no `src/app/api/intake/extract` | **unmet**, GATED OD-020-3 |
| TASK-022 part 2 S-003 | in progress | S-003 + API-003 present; district is a `[MOCK]` number 1–64 (OD-022-14); success screen shows the report page as plain text (OD-022-12) though S-004 is now merged | **partly met** (P3-015) |
| TASK-024 S-004 | review | merged now (`/report/[id]`) | met in code; TC-006 evidence pending (P3-208) |
| TASK-025 S-005 | todo | no `/intake/form` | **unmet** |
| TASK-026 S-007 | review | merged now; manual path only | met in code; TC-008 needs matching (P3-040) and Playwright |
| TASK-027 S-009 queue | todo | no queue page, no API-008 | **unmet** |
| TASK-028 S-010 | review | merged now; API-009/010 present | met in code; TC-010/011 need matcher candidates and API-014 |
| TASK-029 S-012 | todo | `closeCase` service exists (`src/server/case/close.ts`); no API-011, API-013, API-004 routes, no S-012 page | **partly met** |
| TASK-030 S-011 map | todo | no dashboard module, no API-012/022 | **unmet** |
| TASK-033 demo cache | todo | no `src/server/cache/` | **unmet** |
| TASK-038 tooling | — | no Playwright or axe dependency, `test:e2e` is a stub | **unmet** |
| `smoke`, `eval:*`, `model:fetch` | — | stubs exit 1 | **unmet** |

### Phase 3 tasks whose dependencies are not met

| Phase 3 task | Declared deps | Actually missing | Wave 0 tasks that unblock it |
|---|---|---|---|
| TASK-047 13219 | 023 | none | — (P3-101 records TC-007) |
| TASK-048 import | 020 | API-002 / orchestrator part 2 | P3-005, P3-020 |
| TASK-049 edit | 022 | API-004 read, API-014 rematch (TC-018 "re-match run"), matcher | P3-016, P3-030–P3-040 |
| TASK-050 status | 049 | 049; OQ-B1-2 | P3-102 |
| TASK-051 S-014 | 018 | 018 (and 016, 004) | P3-011, P3-024, P3-033 |
| TASK-052 S-015 | 026 | none | — |
| TASK-034/035/036 | 030 | 030 → 029 → 028 → 027 → 017 → 016 → 004, and 064 → 010 | P3-010…P3-050 |
| TASK-037 | 017 | matcher | P3-030–P3-032 |
| TASK-038 | 030, 032, 059 | 030; Playwright tooling | P3-014, P3-050 |
| TASK-039 | 011, 017, 018, 064 | all four | P3-012, P3-022, P3-030–P3-033 |
| TASK-040 WER | 014 | API-001; 60 clips (HUMAN) | P3-017 |
| TASK-041 timing | 025 | S-005 | P3-013 |
| TASK-042 deploy | 038 | 038; R-3 | Wave 2 |
| TASK-060, TASK-043 | 042 (+039/040/041) | everything above | Wave 3 |
| TASK-056 | — | mentor list empty (R-7) | HUMAN |

---

## 5. Hot files and wave rules

Files that almost every task wants to touch. Rules for every worker:

- `src/locales/index.ts`: after P3-001, **no task edits it** except P3-202. New strings go in the task's own area file under `src/locales/areas/` (named in each task). Bangla and English in the same file.
- `src/app/components/icons.tsx`: after P3-001, add icons in a local file next to the screen using the exported `Icon` base. Do not edit `icons.tsx`.
- `scripts/db/test-db.mjs`: after P3-001 it picks up every `tests/db/*.test.ts` itself. Do not edit it.
- `package.json` / `package-lock.json`: at most one task per wave (named below). Script stubs point at their own files after P3-001, so tasks replace a script file, not `package.json`.
- `src/contracts/`: frozen. A task that needs a contract change stops, writes the needed change in its evidence file, and sets its row to `blocked`.
- `db/schema_v2.sql` and `docs/code/schema_v2.sql`: only P3-005. Both copies change together.
- `docs/spec/`, `docs/markdown/`, `docs/MANIFEST.json`: never in this plan.
- Trackers: each worker edits only its row in §9 and its owner log section. These are the only conflicts the orchestrator resolves by hand (keep both sides).

Tasks in the same wave touch disjoint files; each task lists the files it may change. A worker that needs a file not on its list stops and reports.

---

## 6. Task cards

Card format: **Lane** (owner and AGENTS.md paths) · **Files** (the only files to create or edit, besides its §9 row and log line) · **Deps** · **Inputs** · **Steps** · **Accept** · **Evidence** · **Tool** · **Review** (`fera-review` always runs `fera-safeguarding-reviewer`; the domain reviewer is named).

Every card also implies: work in your lane worktree; run `npm ci` once; run `npm run lint`, `npm run typecheck`, `npm test` (and `npm run test:db` if you touched SQL or `tests/db/`) before asking for review; write strings in bn + en; use `[MOCK]` fakes, never real providers; no real child data; record exit codes and counts exactly as printed.

Tools: **puku** = Puku CLI (Opus 4.8) · **agy** = agy (Gemini 3.8 Flash High) · **haiku** = Claude Code (Haiku 5.5 High) · **luna** = Codex (Luna 6), review and test only · **HUMAN**.

### Wave 0.0: prep (Sat 17 Oct; all four in parallel)

#### P3-001 · Hot-file split (enables parallel waves) · no FR
- **Lane:** Mahim · locale, scripts, shell files.
- **Files:** edit `src/locales/index.ts`, `scripts/db/test-db.mjs`, `package.json` (the `scripts` block only), `src/app/components/icons.tsx` (export only); create `src/locales/areas/{parent-intake,parent-form,parent-status,staff-disaster,officer-queue,officer-case,officer-map,officer-duplicates,admin-import}.ts`, `scripts/model-fetch.mjs`, `scripts/reembed.mjs`, `scripts/smoke.mjs`, `eval/{extract,match,dedupe,wer,time,audit,all}.mjs`, `tests/locales-areas.test.ts`.
- **Deps:** merge confirmed.
- **Inputs:** `src/locales/index.ts` (structure: `const bn`, `MessageKey`, `const en … satisfies`), `scripts/db/test-db.mjs`, `package.json`.
- **Steps:**
  1. Each area file exports `export const <camelName>Bn = {} as const;` and `export const <camelName>En = {} as const;`.
  2. In `index.ts`, spread each area's `Bn` object at the end of `bn` and each `En` object at the end of `en`. Keep `MessageKey` and the `satisfies` check unchanged.
  3. Add `tests/locales-areas.test.ts`: no key appears in two area files or in both an area file and the inline `bn`; every area `Bn` key has an `En` key.
  4. `test-db.mjs`: replace the literal `FILES` with every `tests/db/*.test.ts` except `reset-guard.test.ts` and `roles-env.test.ts` (they run in the unit suite today), sorted. Check the result lists the same 10 files as now.
  5. Repoint the stub scripts `model:fetch`, `reembed`, `smoke`, `eval:*` to `node scripts/<name>.mjs` / `node eval/<name>.mjs`; each new file prints `<name>: not implemented` to stderr and exits 1 (same behaviour as now). `eval:all` → `eval/all.mjs`. Leave `test:e2e` alone (P3-014).
  6. Export the `Icon` base function from `icons.tsx`. No other change there.
- **Accept:** `npm run test:db` runs the same 10 files; `npm run reembed` still exits 1; lint, typecheck, build exit 0; `tests/locales-areas.test.ts` passes.
- **Evidence:** command outputs; list of the 10 test-db files before and after.
- **Tool:** puku. **Review:** typescript-reviewer.

#### P3-002 · Wording-guard allowlist after the merge · BR-002/BR-003 · TC-024 · GATED D-A
- **Lane:** Obidit · `tests/outputs/`.
- **Files:** `tests/outputs/guard.test.ts`.
- **Deps:** D-A recorded.
- **Inputs:** failing test output in §1; `src/locales/index.ts` keys `matchReviewSimilarityNote`, `matchReviewDialogBody`; D4 honest-wording rules.
- **Steps:** apply the D-A decision exactly. If approved as proposed: add the two keys to `NEGATED_DISCLAIMER_KEYS`, update the pinned `toEqual` list, and add a comment line naming D-A. Do not change `findBannedGroup`.
- **Accept:** `npx vitest run tests/outputs/guard.test.ts` passes; no other test file changes.
- **Evidence:** the test command output.
- **Tool:** haiku. **Review:** bengali-reviewer.

#### P3-003 · No-photo source scan allows microphone only · BR-006 · TC-026 · GATED D-A
- **Lane:** Mahim · `tests/ui/`.
- **Files:** `tests/ui/report-screen.test.ts`.
- **Deps:** D-A recorded.
- **Inputs:** the regex at `tests/ui/report-screen.test.ts:179`; `src/app/(parent)/intake/voice-recorder.tsx:126` (`getUserMedia({ audio: true })`); D6 TC-026 ("0 file inputs except audio").
- **Steps:** replace the bare `getUserMedia` alternative with a pattern that matches only a `getUserMedia` call whose argument mentions `video`. Add one case asserting the pattern matches `getUserMedia({ video: true })` and does not match `getUserMedia({ audio: true })`.
- **Accept:** `npx vitest run tests/ui/report-screen.test.ts` passes; full `npm test` exit 0 once P3-002 is also in.
- **Evidence:** both commands.
- **Tool:** haiku. **Review:** security-reviewer.

#### P3-004 · `DRAFT_SIGNING_KEY` in the secret loader · D2B §15.1
- **Lane:** Mahim · `src/server/auth/`.
- **Files:** `src/server/auth/secrets.ts`, its existing test file under `tests/auth/` (find with `grep -rl secrets tests/auth`), `.env.example` (template line only, no value).
- **Deps:** none.
- **Inputs:** D2B §15.1 (`docs/spec/D2_TRD_PartB_V2.md`, around line 193); how `AUTH_SECRET` and `PARENT_COOKIE_KEY` are loaded today.
- **Steps:** add `DRAFT_SIGNING_KEY` with the same validation as `PARENT_COOKIE_KEY` (length, distinct from the others if the loader checks that). Fail closed; no fallback to `AUTH_SECRET`. Tests: missing → error; too short → error; valid → loaded. Never print a value.
- **Accept:** auth tests pass; lint/typecheck exit 0.
- **Evidence:** test output.
- **Tool:** haiku. **Review:** security-reviewer.

**HUMAN in Wave 0.0:** record D-A, OD-014-7, OD-020-3, OD-022-5 (§3); fill the mentor table (R-7); start TASK-003 keys.

**Wave 0.0 exit:** `npm test` exit 0 on `phase-3-obidit`.

### Wave 0.1 (parallel)

#### P3-005 · Follow-up round storage in `intake_drafts` · FR-005 · GATED OD-020-3
- **Lane:** Mahim · `db/schema_v2.sql`.
- **Files:** `db/schema_v2.sql`, `docs/code/schema_v2.sql` (same change), `db/roles.sql` only if the runtime role needs a grant, new `tests/db/draft-rounds.test.ts`.
- **Deps:** OD-020-3 decided with the exact column/function shape.
- **Inputs:** `db/schema_v2.sql:75–87`; `reserve_ai_call` in the same file (pattern for an atomic increment); D2A:1300; `docs/execution/evidence/intake-questions.md:91`.
- **Steps:** implement only the decided shape, with an atomic increment function that refuses past the cap and is safe under concurrent calls. DB tests: increment, cap refusal, two concurrent increments → exact count, expired draft refused.
- **Accept:** `npm run test:db` exit 0 including the new file; `diff db/schema_v2.sql docs/code/schema_v2.sql` empty.
- **Evidence:** test:db output; diff output.
- **Tool:** puku. **Review:** database-reviewer (all-owner review required: Obidit, Masnun, Mahim).

#### P3-010 · TASK-010 synthetic set generator · A-039 · (feeds TC-009, TC-064)
- **Lane:** Masnun · `db/seed/`, `data/`.
- **Files:** create `db/seed/generate-synthetic.mjs`, `data/synthetic/cases.json`, `data/synthetic/ground-truth.json`, `data/synthetic/SHA256SUMS`, `tests/data/synthetic-set.test.ts`.
- **Deps:** none (TASK-009 merged).
- **Inputs:** D6 TASK-010; D5 (`docs/spec/D5_Background_Schema_V2.md`) BR-015–018 field rules; `src/contracts/draft.ts` and `schemas.ts` (field shapes); `data/districts.json`; handover FV-11 (identity groups, no-match, duplicates, decoys).
- **Steps:**
  1. Deterministic generator (fixed seed) writing ~200 records: missing and found reports with identity groups, true pairs, no-match missing reports, duplicates, shared-phone distinct children (TC-038), unknown found ages (TC-039), overlapping time intervals (TC-040), decoys.
  2. Invented names and `017…` phones from a reserved fake range; no exact coordinates, photos or IDs. Mark every record `synthetic: true`.
  3. Ground truth lists group IDs and the true pair for each missing report or `null`.
  4. Write SHA-256 of both JSON files to `SHA256SUMS`.
  5. Test: count ≈200, every record parses with the contract schema, regenerating gives identical bytes, the hashes match.
- **Accept:** `npx vitest run tests/data/synthetic-set.test.ts` passes.
- **Evidence:** counts by category; the two hashes.
- **Tool:** puku. **Review:** mle-reviewer.

#### P3-011 · TASK-004 embedding spike report · OQ-023, RISK-015
- **Lane:** Masnun · docs only.
- **Files:** create `docs/execution/evidence/embedding-spike.md`. No dependency is committed.
- **Deps:** none.
- **Inputs:** D2B embedding sections (grep `multilingual-e5-small`, `OQ-023`); AGENTS.md stack line.
- **Steps:** in a scratch directory outside the repo, install `@huggingface/transformers`, embed 20 Bangla/English synthetic sentences with `Xenova/multilingual-e5-small` (384-d), measure model download size, cold-start time and per-text latency on the laptop. Record whether Vercel function size limits allow it (cite the source or mark **UNKNOWN**). Recommend local vs API with numbers.
- **Accept:** report has size, cold start, latency, dimension check (384), and a recommendation for R-4.
- **Evidence:** the report.
- **Tool:** puku. **Review:** mle-reviewer.

#### P3-012 · TASK-011 draft texts for the 50 labelled reports · FR-028 · HUMAN labels
- **Lane:** Masnun · `eval/`.
- **Files:** create `eval/data/labelled.draft.jsonl`, `eval/data/README.md`.
- **Deps:** none.
- **Inputs:** D6 TASK-011; D2B §17 (evaluation); TC-002 example sentence; `src/contracts/draft.ts`.
- **Steps:** write 50 synthetic parent report texts (≈70 % Bangla, mixed digits, time words, district aliases, some unknowns). One JSON object per line with `id`, `text`, and an empty `labels` object. No labels from the model. README: how a person fills labels and that Obidit reviews.
- **Accept:** 50 lines, each valid JSON, no real names (use a fixed invented list).
- **Evidence:** line count.
- **Tool:** agy. **Review:** bengali-reviewer.
- **HUMAN after:** Masnun labels into `eval/data/labelled.jsonl`; Obidit reviews and signs in the README.

#### P3-013 · TASK-025 S-005 manual form · FR-026 · TC-017 · OD-022-5 decided
- **Lane:** Mahim · `src/app/(parent)/intake/form/` (S-005 is Sadman's per AGENTS.md).
- **Files:** create `src/app/(parent)/intake/form/page.tsx`, `src/app/(parent)/intake/form/manual-form.tsx`, `tests/intake-ui/manual-form.test.ts`; strings in `src/locales/areas/parent-form.ts`.
- **Deps:** P3-001; OD-022-5 decision in §3; reconcile Mahim's unmerged S-005 branch before duplicate implementation.
- **Inputs:** D3 SCREEN-005 (`docs/spec/D3_App_Flow_V2.md:121`) and line 483 (missing-field list after four rounds); D1 FR-026; D2A API-003 (`D2_TRD_PartA_V2.md:297`); COMP-032; reuse field components from `src/app/(parent)/intake/review/review-fields.tsx` (import; do not edit).
- **Steps:** form with the same fields and validation as S-003; pre-fill from the device-local draft if present; same review checkbox and submit via API-003 with the device-local UUID; on API error keep every typed value; ≥44 px targets; no red.
- **Accept:** TC-017 at component level (form renders ≤2 s after a simulated LLM error, text kept); unit tests pass.
- **Evidence:** test output; 360 px screenshot path.
- **Tool:** puku. **Review:** react-reviewer, a11y-architect.

#### P3-014 · Playwright + axe harness · D6 §7
- **Lane:** Mahim · `tests/e2e/`, CI.
- **Files:** `package.json` + `package-lock.json` (devDependencies `@playwright/test`, `@axe-core/playwright`; script `test:e2e` → `playwright test`) **(the only package.json task in Wave 0.1)**, create `playwright.config.ts`, `tests/e2e/smoke.spec.ts`, `tests/e2e/support/db.ts`; edit `.github/workflows/ci.yml` (add an e2e job, can be `workflow_dispatch` only), `vitest` config only if it would pick up `tests/e2e`.
- **Deps:** P3-001.
- **Inputs:** D6 §7 (mobile 360 px + desktop 1280 px); `scripts/db/guard.mjs` (local DB only).
- **Steps:** two projects (360×780 mobile, 1280×800 desktop); `webServer` runs `npm run build && npm start` against a fresh local test DB created like `test-db.mjs` does; `smoke.spec.ts` opens `/` and checks the Bangla welcome title and the synthetic badge; `support/db.ts` gives a fresh DB per run and refuses non-loopback URLs. Install browsers with `npx playwright install chromium` (not committed).
- **Accept:** `npm run test:e2e` exit 0 locally; `npm test` does not run e2e files.
- **Evidence:** both outputs; dependency note (name, version, why) in the PR body.
- **Tool:** puku. **Review:** typescript-reviewer.

#### P3-015 · S-003 district list and report link · FR-006 · OD-022-12, OD-022-14
- **Lane:** Obidit · `src/app/(parent)/intake/review/`.
- **Files:** `src/app/(parent)/intake/review/review-fields.tsx`, `review-screen.tsx`, their tests under `tests/intake/review/`; strings in `src/locales/areas/parent-intake.ts`.
- **Deps:** P3-001.
- **Inputs:** handoff §5 (districts); `data/districts.json` and whatever district list Masnun's TASK-009 exports (`grep -rn districts src/lib src/server`); D3 SCREEN-003; D4 Bangla rules; OD-022-12.
- **Steps:** replace the `[MOCK]` 1–64 number input with a named district select (Bangla names in bn mode, English in en) that still submits the district code; keep "unknown" possible where the contract allows; on the success screen, link "Submitted report page" to `/report/<id>` and drop its planned label.
- **Accept:** review tests pass; TC-004 unit-level checks still pass; no `[MOCK]` label left on the district field.
- **Evidence:** test output; 360 px screenshot path.
- **Tool:** puku. **Review:** react-reviewer, bengali-reviewer.

#### P3-016 · API-004 `GET /api/cases/:id` with role DTOs · BR-007 · TC-022, TC-045, TC-052
- **Lane:** Mahim · `src/server/case/`, `src/app/api/cases/[id]/`.
- **Files:** create `src/app/api/cases/[id]/route.ts`, `tests/api/cases-read.test.ts`, `tests/db/case-read.test.ts`; edit `src/server/case/read.ts` (this wave only P3-016 edits it).
- **Deps:** P3-001.
- **Inputs:** D2A API-004 (`D2_TRD_PartA_V2.md:309`) and the projection table at line 1284; `src/contracts/access.ts` (role projections); existing route pattern in `src/app/api/candidates/[id]/route.ts`.
- **Steps:** Zod params → role guard → per-role DTO (OwnerCaseView, StaffOwnCaseView, OfficerCaseView, AdminCaseView metadata) → error envelope. Unknown or other-party ID → E-004 with an `access.denied` audit row (null FK for unknown). Never return raw rows.
- **Accept:** TC-022 and TC-052 as DB tests; parent sees only own case; response JSON never has candidate or other-party fields.
- **Evidence:** test:db output.
- **Tool:** puku. **Review:** security-reviewer, database-reviewer.

#### P3-017 · TASK-014 part 2: API-001 `POST /api/intake/transcribe` · FR-002 · TC-001 (1–3 on fakes), TC-043, TC-060, TC-061 · GATED OD-014-7
- **Lane:** Obidit · `src/server/intake/`, `src/app/api/intake/`.
- **Files:** create `src/app/api/intake/transcribe/route.ts`, `src/server/intake/drafts.ts`, `tests/api/intake/transcribe.test.ts`, `tests/intake/drafts.test.ts`.
- **Deps:** P3-004; OD-014-7.
- **Inputs:** `docs/execution/handoff/obidit/task-014-blueprint.md` (whole file: files, route flow, error map, tests); D2A API-001 (`:275`); `src/server/speech/`; `src/server/spend/` (`runPaidCall`).
- **Steps:** follow the blueprint §2 route flow and §4 error map, with the OD-014-7 decision. Provider = `[MOCK]` fake. No audio or transcript stored server-side; draft row is metadata only.
- **Accept:** the blueprint §5 tests pass; TC-060 (notice before dispatch) and TC-043 (six calls max) at route level.
- **Evidence:** test output; list of tests mapped to TCs.
- **Tool:** puku. **Review:** security-reviewer, silent-failure-hunter.

#### P3-018 · TASK-029 part: API-011 close + API-013 safe audit · FR-018, FR-021 · TC-010 (close), TC-016
- **Lane:** Mahim · `src/app/api/cases/[id]/close/`, `src/app/api/cases/[id]/audit/`, `src/server/audit/`.
- **Files:** create `src/app/api/cases/[id]/close/route.ts`, `src/app/api/cases/[id]/audit/route.ts`, `src/server/audit/safe-read.ts` (if no equivalent exists in `src/server/audit/`), `tests/api/case-close.test.ts`, `tests/db/case-audit-read.test.ts`. Do not edit `src/server/case/read.ts`.
- **Deps:** P3-001.
- **Inputs:** D2A API-011 (`:380`), API-013 (`:401`) and projection rows at `:1288`; `src/server/case/close.ts`; D3 SCREEN-012; copy "সমন্বয়ের সিদ্ধান্ত ও রেফারেল নথিভুক্ত (সিমুলেশন)".
- **Steps:** close route calls `closeCase` (verified officer only; expected-version check); audit route returns the safe audit projection (officer operational, admin metadata only, no child payload).
- **Accept:** DB tests: close with stale version → conflict; staff/unverified → E-003/E-004; audit rows for confirm/referral/close present; UPDATE/DELETE on `audit_log` still fails.
- **Evidence:** test:db output.
- **Tool:** puku. **Review:** database-reviewer, security-reviewer.

**Wave 0.1 exit:** wave gate (§7).

### Wave 0.2 (parallel)

#### P3-019 · TASK-029 part: S-012 case detail, close and audit · FR-018, FR-021 · TC-010
- **Lane:** Mahim · `src/app/(desk)/officer/case/`.
- **Files:** create `src/app/(desk)/officer/case/[id]/page.tsx`, `close-form.tsx`, `audit-list.tsx`, `tests/ui/officer-case.test.ts`; strings in `src/locales/areas/officer-case.ts`.
- **Deps:** P3-016, P3-018.
- **Inputs:** D3 SCREEN-012 (`:220`); D4 status rules (icon + text + colour); COMP-039, COMP-042; DESIGN.md Cockpit tokens.
- **Steps:** server-render the officer DTO from API-004's service; close with a two-step confirm and the exact simulation copy; audit list from API-013; empty/loading/error states in bn + en.
- **Accept:** component tests; manual: close a seeded confirmed pair locally.
- **Evidence:** test output; screenshot path.
- **Tool:** puku. **Review:** react-reviewer, a11y-architect.

#### P3-020 · TASK-020 part 2: API-002 `POST /api/intake/extract` · FR-003–FR-005 · TC-002, TC-003, TC-036 · GATED OD-020-3
- **Lane:** Obidit · `src/server/intake/`, `src/app/api/intake/extract/`.
- **Files:** create `src/app/api/intake/extract/route.ts`, `src/server/intake/orchestrator.ts`, `tests/api/intake/extract.test.ts`; edit `src/server/intake/drafts.ts` (from P3-017).
- **Deps:** P3-005, P3-017.
- **Inputs:** `docs/execution/handoff/obidit/task-020-blueprint.md`; D2A API-002 (`:286`); `src/server/ai/`, `src/server/normalise/`, `src/server/intake/questions.ts`.
- **Steps:** follow the blueprint with the P3-005 round counter; LLM via the `[MOCK]` adapter; exactly one question per missing field; every value has a source span; unknown stays unknown; spend refusal → E-023 and the client opens S-005.
- **Accept:** TC-002 and TC-003 at route level on the fake; TC-036 with cap = current total.
- **Evidence:** test output.
- **Tool:** puku. **Review:** security-reviewer, silent-failure-hunter, bengali-reviewer.

#### P3-021 · Manual-form links in S-002 and S-003 · FR-026
- **Lane:** Obidit · `src/app/(parent)/intake/`.
- **Files:** `src/app/(parent)/intake/intake-chat.tsx`, `src/app/(parent)/intake/review/review-screen.tsx`, related tests.
- **Deps:** P3-013, P3-015.
- **Inputs:** handoff §3 last paragraph (planned labels); OD-021-7.
- **Steps:** replace the "planned" label/text with a real link to `/intake/form`, carrying nothing in the URL (the form reads the device-local draft).
- **Accept:** tests updated and passing; no "planned" label left for the form.
- **Evidence:** test output.
- **Tool:** haiku. **Review:** react-reviewer.

#### P3-022 · TASK-064 identity-grouped manifest and frozen split · FV-11 · TC-064
- **Lane:** Masnun · `eval/`, `data/`.
- **Files:** create `eval/manifest.mjs`, `data/synthetic/manifest.json`, `tests/data/manifest.test.ts`.
- **Deps:** P3-010.
- **Inputs:** D6 TASK-064; AMD-3-3 in the Phase 3 tracker (held-out integrity); handover FV-11.
- **Steps:** split by identity group (no group in two splits) into dev and held-out; record counts per category per split and the hash of the inputs and of the manifest.
- **Accept:** test asserts 200-ish count, declared identities/no-match/duplicates, no connected group across splits, hash stable.
- **Evidence:** counts per split; manifest hash.
- **Tool:** puku. **Review:** mle-reviewer.

#### P3-023 · TASK-019 seed loader with demo cases · TC-009 precondition
- **Lane:** Masnun · `db/seed/`.
- **Files:** `db/seed/index.mjs`, create `db/seed/cases.mjs`, `tests/db/seed-cases.test.ts`.
- **Deps:** P3-010.
- **Inputs:** D7 demo script (`docs/spec/D7_Closing_Pack_V2.md`; Rafi, Kamalapur, Mim cases); D6 TASK-019.
- **Steps:** `--set demo` loads the 3 demo cases plus what they need; `--set full` loads all synthetic records; both labelled synthetic; idempotent; local URLs only via `guard.mjs`.
- **Accept:** `time npm run seed -- --set demo` < 2 min on a fresh DB; DB test passes.
- **Evidence:** timing output; test:db output.
- **Tool:** puku. **Review:** database-reviewer.

#### P3-024 · TASK-016 embedding service + `npm run reembed` + `model:fetch` · COMP-011
- **Lane:** Masnun · `src/server/embeddings/`.
- **Files:** create `src/server/embeddings/{index,model}.ts`, `tests/embeddings/*.test.ts`; replace `scripts/reembed.mjs` and `scripts/model-fetch.mjs`; `package.json` + lock (one dependency, per R-4) **(the only package.json task in Wave 0.2)**.
- **Deps:** P3-011 and R-4 decided; P3-001.
- **Inputs:** P3-011 report; D2B embedding section; schema vector column (384-d, HNSW).
- **Steps:** embed the canonical case text with the `query:`/`passage:` prefixes the model needs; store the model/version with each vector; `reembed` rebuilds all vectors and refuses mixed model versions (TC-059); `model:fetch` downloads into a gitignored cache.
- **Accept:** 200 records embedded on a seeded local DB (after P3-023 merges, run in the wave gate); unit tests with a fake model pass.
- **Evidence:** reembed output with the count; dependency note.
- **Tool:** puku. **Review:** mle-reviewer, database-reviewer.

**Wave 0.2 exit:** wave gate; `npm run seed -- --set full && npm run reembed` on the merged tree.

### Wave 0.3 (parallel)

#### P3-030 · TASK-017a matcher hard filters · BR-017 · TC-009 (eligibility), TC-039, TC-040
- **Lane:** Masnun · `src/server/matching/`.
- **Files:** create `src/server/matching/filters.ts`, `tests/match/filters.test.ts`, `tests/db/match-filters.test.ts`.
- **Deps:** P3-022, P3-024.
- **Inputs:** D5 BR-017 (and BR-016 time bounds); D2B matching section.
- **Steps:** SQL that returns eligible found reports for a missing report (sex, age interval overlap with unknown allowed, time interval overlap not midpoint, state); a reusable SQL check that no candidate violates eligibility.
- **Accept:** TC-039/TC-040 cases pass; eligibility SQL check returns 0 violations on the synthetic set.
- **Evidence:** test output.
- **Tool:** puku. **Review:** database-reviewer, mle-reviewer.

#### P3-031 · TASK-017b scoring, bonuses and qualify-or-abstain · BR-018 · TC-041
- **Lane:** Masnun · `src/server/matching/`.
- **Files:** create `src/server/matching/score.ts`, `tests/match/score.test.ts`.
- **Deps:** P3-024.
- **Inputs:** D5 BR-018; D2B matching weights and threshold; AMD-3-3 (calibrate on dev only).
- **Steps:** national cosine + documented bonuses → similarity out of 100; qualify threshold read from one config constant; empty shortlist allowed; never call it probability.
- **Accept:** TC-041 (empty shortlist) and ranking unit tests pass.
- **Evidence:** test output.
- **Tool:** puku. **Review:** mle-reviewer.

#### P3-032 · TASK-017c template reasons · FR-014
- **Lane:** Masnun · `src/server/matching/`.
- **Files:** create `src/server/matching/reasons.ts`, `tests/match/reasons.test.ts`.
- **Deps:** none in this wave.
- **Inputs:** D1 FR-014; existing `matchVerdict*` and `matchField*` strings (do not edit them); D4 honest wording.
- **Steps:** fixed templates per field comparison (agree / differ / unknown); no free text from a model; returns keys, not sentences.
- **Accept:** tests pass; wording guard passes on every template.
- **Evidence:** test output.
- **Tool:** agy. **Review:** bengali-reviewer.

#### P3-033 · TASK-018 duplicate detector · FR-022 · TC-013, TC-038
- **Lane:** Masnun · `src/server/duplicates/`.
- **Files:** create `src/server/duplicates/{index,detect}.ts`, `tests/duplicates/detect.test.ts`, `tests/db/duplicates.test.ts`.
- **Deps:** P3-024.
- **Inputs:** D1 FR-022/FR-023; D5 BR-021 (shared phone is a weak cue only).
- **Steps:** flag possible duplicates by embedding similarity + field agreement; shared phone alone never links; both reports stay visible.
- **Accept:** TC-013 and TC-038 DB tests pass.
- **Evidence:** test output.
- **Tool:** puku. **Review:** mle-reviewer, database-reviewer.

#### P3-034 · TASK-027 S-009 queue + API-008 · FR-012 · "queue lists seeded candidates"
- **Lane:** Masnun · `src/app/(desk)/officer/queue/`, `src/app/api/review-queue/`.
- **Files:** create `src/app/(desk)/officer/queue/page.tsx`, `queue-list.tsx`, `src/app/api/review-queue/route.ts`, `src/server/matching/queue-read.ts`, `tests/api/review-queue.test.ts`, `tests/db/review-queue.test.ts`; strings in `src/locales/areas/officer-queue.ts`.
- **Deps:** P3-001 (candidate rows can be inserted directly in tests until P3-040).
- **Inputs:** D3 SCREEN-009 (`:177`); D2A API-008 (`:350`); COMP-035/036; link each row to the existing `/officer/match/[id]`.
- **Steps:** verified officers only; pending candidates ordered by case then similarity; empty state; no candidate data for staff or unverified officers.
- **Accept:** DB test lists seeded candidates; staff gets E-003/E-004.
- **Evidence:** test output; screenshot path.
- **Tool:** puku. **Review:** react-reviewer, security-reviewer.

#### P3-035 · Wire S-002 to API-001/API-002 · FR-002–FR-005 · TC-001 (fake), TC-002, TC-003
- **Lane:** Obidit · `src/app/(parent)/intake/`, `src/lib/intake/`.
- **Files:** `src/app/(parent)/intake/intake-chat.tsx`, `voice-recorder.tsx`, `src/lib/intake/*.ts` (only the client fake/adapter files), related tests.
- **Deps:** P3-017, P3-020, P3-021.
- **Inputs:** `docs/execution/evidence/intake-ui.md`; D3 SCREEN-002; E-010–E-015, E-022, E-023.
- **Steps:** replace the typed `[MOCK]` client fake with calls to the two routes; keep the fake for tests; E-023 or a provider failure opens S-005 with text kept; cached results show the cached badge.
- **Accept:** intake-ui tests pass; manual run on the local stack with the fake provider.
- **Evidence:** test output; short note of the manual run.
- **Tool:** puku. **Review:** react-reviewer, silent-failure-hunter.

### Wave 0.4 (parallel)

#### P3-040 · TASK-017d matcher run + API-014 rematch + triggers · FR-012–FR-017 · TC-008, TC-009, TC-011, TC-054
- **Lane:** Masnun (touches Mahim's case service: PR tagged for Mahim) · `src/server/matching/`, `src/app/api/match/`.
- **Files:** create `src/server/matching/run.ts`, `src/app/api/match/[caseId]/route.ts`, `tests/db/match-run.test.ts`; edit `src/server/found/log-found.ts` and the submit command in `src/server/case/` (one call each, after commit).
- **Deps:** P3-030, P3-031, P3-032, P3-033.
- **Inputs:** D2A API-014 (`:410`) and projection `:1289` (status only); BR-019 (rejected pair never re-suggested); TC-054.
- **Steps:** run = filters → score → top ≤5 qualified → candidate rows with reasons → case state to `matched_pending_review` if any; failures leave the report saved with a visible failed/queued state and a retry; API-014 returns status only.
- **Accept:** TC-008 (≤15 s, no candidate details to staff) and TC-011 as DB/API tests; TC-009 fixture true pair rank printed (dev split only).
- **Evidence:** test output; the printed rank and recall@5 on dev with denominators.
- **Tool:** puku. **Review:** database-reviewer, mle-reviewer.

#### P3-041 · TASK-030a API-012 stats + API-022 case list · FR-019 · TC-012, TC-055
- **Lane:** Masnun · `src/server/dashboard/`, `src/app/api/dashboard/`.
- **Files:** create `src/server/dashboard/{index,stats}.ts`, `src/app/api/dashboard/stats/route.ts`, `tests/db/dashboard.test.ts`; edit `src/app/api/cases/route.ts` (add GET only; PR tagged for the route owner).
- **Deps:** P3-019.
- **Inputs:** D2A API-012 (`:391`), API-022 (`:487`); D5 BR-014; D3 line 480.
- **Steps:** counts per district by kind and state; one pair counts once; drill-through list for officers with kind-specific counts, none for admin.
- **Accept:** TC-012 (every count = SQL group count) and TC-055 DB tests pass.
- **Evidence:** test output.
- **Tool:** puku. **Review:** database-reviewer.

#### P3-043 · TASK-033 demo-safe cache + fixtures + cached badge · FR-027, FR-032 · TC-021 (laptop)
- **Lane:** Obidit · `src/server/cache/`.
- **Files:** create `src/server/cache/{index,fixtures}.ts`, `src/server/cache/fixtures/*.json`, `tests/cache/*.test.ts`; edit the two intake routes from P3-017/P3-020 (cache lookup before dispatch).
- **Deps:** P3-020, P3-023.
- **Inputs:** COMP-017, COMP-048; D7 demo script; TC-056 (cache hits excluded from metrics).
- **Steps:** `DEMO_MODE=1` only; keyed by exact scripted input hash; returns `cached=true`; badge shown; eval code can detect and exclude cache hits.
- **Accept:** unit tests; TC-021 on the laptop with network off (run in the wave gate).
- **Evidence:** test output; offline run note.
- **Tool:** puku. **Review:** silent-failure-hunter.

### Wave 0.5

#### P3-050 · TASK-030b S-011 map + table · FR-019 · TC-012 (UI)
- **Lane:** Masnun · `src/app/(desk)/officer/map/`.
- **Files:** create `src/app/(desk)/officer/map/page.tsx`, `district-table.tsx`, `district-map.tsx`, `tests/ui/officer-map.test.ts`; strings in `src/locales/areas/officer-map.ts`.
- **Deps:** P3-041; R-5.
- **Inputs:** D3 SCREEN-011 (`:207`); COMP-040/041; D4 (no red; icon + text + colour); `data/districts.json` centroids.
- **Steps:** accessible table first (the source of truth), then the map per R-5; drill-through link per district to the API-022 list.
- **Accept:** UI tests; table values equal API-012.
- **Evidence:** test output; screenshot paths light and dark.
- **Tool:** puku. **Review:** react-reviewer, a11y-architect.

**G2′ (end of Wave 0):** `fera-gate` G2 checklist. Run by luna; lead signs.

### Wave 1: features (Mon 19 – Tue 20 Oct; 1a in parallel, then 1b)

#### P3-101 · TASK-047 13219 summary on the merged tree · FR-010 · TC-007 — 1a
- **Lane:** Obidit · tests only.
- **Files:** add a case to `tests/outputs/` if TC-007 lacks a test on the S-004 card path.
- **Deps:** none.
- **Inputs:** current TASK-047 row; `src/app/(parent)/report/[id]/`.
- **Steps:** confirm S-004 shows the 13219 card and that the ≤80-word check covers the worst case through API-006.
- **Accept:** TC-007 test passes on `phase-3-obidit`.
- **Evidence:** test output.
- **Tool:** haiku. **Review:** bengali-reviewer.

#### P3-102 · TASK-049a API-005 `PATCH /api/cases/:id` · FR-029, BR-025 · TC-018, TC-049 — 1a
- **Lane:** Obidit (files in Mahim's case module: PR tagged for Mahim).
- **Files:** create `src/server/case/edit.ts`, `tests/db/case-edit.test.ts`; edit `src/app/api/cases/[id]/route.ts` (add PATCH).
- **Deps:** P3-016, P3-040.
- **Inputs:** D2A API-005 (`:318`); D3 row 12 (`:338`); BR-025.
- **Steps:** owner only; allowed in submitted/open/matched_pending_review; new version row; void pending candidates; trigger rematch; confirmed or terminal → E-018.
- **Accept:** TC-018 and TC-049 DB tests.
- **Evidence:** test output.
- **Tool:** puku. **Review:** database-reviewer, security-reviewer.

#### P3-104 · TASK-050 API-018 `GET /api/my-case` · FR-030 · TC-019 — 1a · GATED OQ-B1-2
- **Lane:** Obidit (PR tagged for Mahim).
- **Files:** create `src/app/api/my-case/route.ts`, `tests/api/my-case.test.ts`.
- **Deps:** OQ-B1-2.
- **Inputs:** D2A API-018 (`:451`); BR-007.
- **Steps:** parent cookie → own case status label per OQ-B1-2 and own editable fields; never found-case or candidate fields.
- **Accept:** TC-019 (JSON has no found or candidate fields).
- **Evidence:** test output.
- **Tool:** puku. **Review:** security-reviewer.

#### P3-105 · TASK-048a import service + API-015 · FR-024 · TC-014 — 1a
- **Lane:** Masnun · module per R-6.
- **Files:** create `src/server/import/{index,import}.ts` (or the R-6 path), `src/app/api/admin/import/route.ts`, `tests/api/admin-import.test.ts`.
- **Deps:** P3-020; R-6.
- **Inputs:** D2A API-015 (`:419`); TC-014.
- **Steps:** admin only; synthetic sample texts only; run through the extraction adapter; only schema fields survive; tag `simulated public_import`; never fetch URLs.
- **Accept:** TC-014 (injection text yields schema fields only; no network call: assert with a fetch spy).
- **Evidence:** test output.
- **Tool:** puku. **Review:** security-reviewer.

#### P3-107 · TASK-051 S-014 duplicate review + API-023 · FR-023 · "mark same/different works" — 1a
- **Lane:** Masnun · `src/app/(desk)/officer/duplicates/`, `src/server/duplicates/`.
- **Files:** create `src/app/(desk)/officer/duplicates/[id]/page.tsx`, `decision-form.tsx`, `src/server/duplicates/decision.ts`, `src/app/api/duplicates/[id]/decision/route.ts`, `tests/db/duplicate-decision.test.ts`; strings in `src/locales/areas/officer-duplicates.ts`.
- **Deps:** P3-033.
- **Inputs:** D3 SCREEN-014 (`:250`), line 482; D2A API-023 (`:496`); TC-038.
- **Steps:** verified officer marks same/different with a reason; audit row; phone-only link cannot be marked same; neither report hidden.
- **Accept:** DB test for both outcomes; TC-038 still passes.
- **Evidence:** test output; screenshot.
- **Tool:** puku. **Review:** react-reviewer, database-reviewer.

#### P3-108 · TASK-052 S-015 disaster mode · FR-036 · TC-035 — 1a (cut first if short)
- **Lane:** Masnun · `src/app/(desk)/staff/disaster/`.
- **Files:** create `src/app/(desk)/staff/disaster/page.tsx`, `tests/ui/staff-disaster.test.ts`; strings in `src/locales/areas/staff-disaster.ts`.
- **Deps:** none.
- **Inputs:** D3 SCREEN-015 (`:261`); banner "পরিকল্পিত সম্প্রসারণ".
- **Steps:** planned-extension banner; reuse `found-log-form.tsx` by import (do not edit it); saves a found case through API-007.
- **Accept:** TC-035.
- **Evidence:** test output.
- **Tool:** agy. **Review:** react-reviewer.

#### P3-103 · TASK-049b S-006 status and edit · FR-029, FR-030 · TC-018 (UI), TC-045 — 1b · GATED ACT-017, OQ-B1-2
- **Lane:** Obidit · `src/app/(parent)/status/` (path proposed; confirm against D3 SCREEN-006 `:135`).
- **Files:** create `src/app/(parent)/status/[id]/page.tsx`, `status-view.tsx`, `edit-form.tsx`, `tests/intake-ui/status.test.ts`; strings in `src/locales/areas/parent-status.ts` (start from `docs/execution/handoff/obidit/s006-strings-draft.md`).
- **Deps:** P3-102, P3-104.
- **Inputs:** D3 SCREEN-006 and line 478; s006 strings draft.
- **Steps:** status badge per OQ-B1-2; edit form only in editable states; after save go where ACT-017 says; locked copy with E-018.
- **Accept:** component tests; TC-045.
- **Evidence:** test output; screenshot.
- **Tool:** puku. **Review:** react-reviewer, bengali-reviewer, a11y-architect.

#### P3-106 · TASK-048b admin import UI · FR-024 — 1b
- **Lane:** Mahim · `src/app/(desk)/admin/`.
- **Files:** create `src/app/(desk)/admin/import-form.tsx`; edit `src/app/(desk)/admin/page.tsx` (replace the `importPlanned` placeholder); strings in `src/locales/areas/admin-import.ts`.
- **Deps:** P3-105.
- **Inputs:** D3 SCREEN-013; TC-014.
- **Steps:** paste up to 5 synthetic texts; synthetic label always visible; show created references.
- **Accept:** component test.
- **Evidence:** test output.
- **Tool:** agy. **Review:** react-reviewer.

#### P3-109 · TASK-056 mentor fixes — HUMAN list first
- One card per row of the Phase 2 mentor table, created by the lead once the table is filled (R-7). Each fix stays in its owner's paths. Scope **UNKNOWN** today.

**Feature freeze Tue 20 Oct 22:00.** After it, only fixes for failing TCs.

### Wave 2: quality (Wed 21 Oct; 2a in parallel, then 2b)

#### P3-201 · TASK-034 axe + keyboard + reflow · NFR-011 · TC-033, TC-058 — 2a
- **Lane:** Mahim · `tests/e2e/`.
- **Files:** create `tests/e2e/a11y.spec.ts`.
- **Deps:** P3-014, Wave 1 merged.
- **Inputs:** D6 TASK-034; D4 accessibility section; list of Must screens S-001–S-005, S-007–S-013, S-016.
- **Steps:** axe on each Must screen in light and dark; keyboard walk of the primary action; 320 px reflow, 200 % text, 400 % zoom checks.
- **Accept:** 0 serious/critical. Each violation becomes a fix card for the screen owner (2b), not a fix inside this task.
- **Evidence:** axe summary per screen.
- **Tool:** agy. **Review:** a11y-architect.

#### P3-202 · TASK-035a Bangla copy: inline locale strings · FR-033 — 2a
- **Lane:** Obidit (the only task allowed to edit `src/locales/index.ts`; PR tagged for Mahim).
- **Files:** `src/locales/index.ts`.
- **Deps:** Wave 1 merged.
- **Inputs:** `docs/execution/handoff/obidit/state-copy-audit.md` (refresh its S-003 section; S-004 was never audited); D3/D4 exact strings.
- **Steps:** every loading/empty/error state of S-001–S-004 and the older desk screens has bn + en; use D3/D4 exact strings where they exist; mark new Bangla "needs human Bangla review".
- **Accept:** every E-xxx reachable on these screens shows bn + en; locale tests pass.
- **Evidence:** updated audit table.
- **Tool:** agy. **Review:** bengali-reviewer.

#### P3-203 · TASK-035b Bangla copy: area files · FR-033 — 2a
- **Lane:** Obidit (PRs tagged for each area owner).
- **Files:** `src/locales/areas/*.ts`.
- **Deps:** Wave 1 merged.
- **Inputs:** as P3-202.
- **Steps:** same as P3-202 for the area files. If a string in `src/contracts/errors.ts` (frozen) is wrong, list it in the evidence; do not edit it.
- **Accept:** every E-xxx reachable on the new screens shows bn + en.
- **Evidence:** audit table rows.
- **Tool:** agy. **Review:** bengali-reviewer.

#### P3-204 · TASK-037 unit tests: matcher, duplicates, state guard, wording guard · ≥60 tests
- **Lane:** Mahim (tests in Masnun's areas: PR tagged) — 2a.
- **Files:** `tests/match/*.test.ts`, `tests/duplicates/*.test.ts` (add cases only).
- **Deps:** P3-040.
- **Inputs:** D6 §7; D6 TASK-037.
- **Steps:** add edge cases the matcher/dedupe suites lack (boundary similarity, ties, all-unknown fields, abstain); count tests per area with `npx vitest list`.
- **Accept:** ≥60 tests across normaliser, matcher, state guard, wording guard (D6 target); CI green.
- **Evidence:** counts per area.
- **Tool:** agy. **Review:** typescript-reviewer.

#### P3-205 · TASK-038a parent journey e2e · TC-002–TC-006, TC-004 DB check, TC-031 — 2a
- **Lane:** Mahim · `tests/e2e/`.
- **Files:** create `tests/e2e/parent-journey.spec.ts`.
- **Deps:** P3-014, P3-035.
- **Inputs:** D6 §8 rows TC-002–TC-006, TC-031; D7 Rafi script.
- **Steps:** text path with the fake provider; before submit assert 0 case rows (metadata allowed); edit clothing; tick; submit; outputs show "খসড়া"; replay same UUID → same ref. Tag `@gate-G4`.
- **Accept:** spec passes on mobile and desktop projects.
- **Evidence:** Playwright summary.
- **Tool:** puku. **Review:** e2e-runner.

#### P3-206 · TASK-038b staff and officer e2e · TC-008–TC-012, TC-029 — 2a
- **Lane:** Mahim · `tests/e2e/`.
- **Files:** create `tests/e2e/officer-decision.spec.ts`.
- **Deps:** P3-014, P3-050.
- **Inputs:** D6 §8 TC-008–TC-012, TC-029; D7 Kamalapur script.
- **Steps:** staff logs found child → officer queue → confirm (two steps) → close with the simulation copy → map count changes; reject path with reason; second confirm on the same found case fails.
- **Accept:** spec passes.
- **Evidence:** Playwright summary.
- **Tool:** puku. **Review:** e2e-runner, database-reviewer.

#### P3-207 · TASK-038c safeguarding and failure e2e · TC-017, TC-022, TC-023, TC-025, TC-026, TC-036 — 2a
- **Lane:** Mahim · `tests/e2e/`.
- **Files:** create `tests/e2e/safeguarding.spec.ts`, `tests/e2e/failure-states.spec.ts`.
- **Deps:** P3-014.
- **Inputs:** D6 §8 rows; E-010–E-014, E-022–E-024.
- **Steps:** cross-role denials with audit rows; no alert controls; no file inputs except audio; provider failure → manual form ≤2 s with text kept; spend cap → E-023.
- **Accept:** specs pass.
- **Evidence:** Playwright summary.
- **Tool:** puku. **Review:** e2e-runner, security-reviewer.

#### P3-208 · TASK-038d outputs and offline e2e · TC-006, TC-021, TC-057 — 2a
- **Lane:** Mahim · `tests/e2e/`.
- **Files:** create `tests/e2e/outputs.spec.ts`, `tests/e2e/offline-demo.spec.ts`.
- **Deps:** P3-014, P3-043.
- **Inputs:** TC-006, TC-021, TC-057.
- **Steps:** poster PNG renders Bangla and has no image input; with `DEMO_MODE=1` and network blocked in the browser context, the Rafi journey completes with cached and synthetic labels; all roles see the same new report on one DB.
- **Accept:** specs pass.
- **Evidence:** Playwright summary.
- **Tool:** puku. **Review:** e2e-runner.

#### P3-209 · TC-028 log scan · NFR-010 — 2a
- **Lane:** Mahim · `tests/e2e/`.
- **Files:** create `tests/e2e/log-scan.spec.ts` (runs last; scans the server log file the webServer writes).
- **Deps:** P3-014.
- **Inputs:** TC-028; pino redaction config.
- **Steps:** after the other specs, regex the captured server log for `01[0-9]{9}` and seeded names.
- **Accept:** 0 matches.
- **Evidence:** match count.
- **Tool:** agy. **Review:** security-reviewer.

#### P3-210 · TASK-039a eval: extraction · FR-028 · TC-020 part — 2a
- **Lane:** Masnun · `eval/`.
- **Files:** replace `eval/extract.mjs`; create `tests/eval/extract.test.ts`.
- **Deps:** P3-012 human labels done; P3-020.
- **Inputs:** D2B §17; AMD-3-3; TC-056.
- **Steps:** field-level precision/recall against `labelled.jsonl` with denominators; exclude cache/fixture hits and say so; dev split only until the freeze; prints "not measured" when a provider is unavailable.
- **Accept:** `npm run eval:extract` prints metrics with denominators on the fake provider (labelled as fake).
- **Evidence:** output.
- **Tool:** puku. **Review:** mle-reviewer.

#### P3-211 · TASK-039b eval: matching and duplicates · TC-020, TC-064 — 2a
- **Lane:** Masnun · `eval/`.
- **Files:** replace `eval/match.mjs`, `eval/dedupe.mjs`; create `tests/eval/match.test.ts`.
- **Deps:** P3-040, P3-022.
- **Inputs:** manifest; ground truth; AMD-3-3.
- **Steps:** recall@5, abstention rate, coverage, duplicate precision/recall, each with denominators; split chosen by flag, default dev; refuses held-out unless a freeze file exists.
- **Accept:** commands print metrics on dev.
- **Evidence:** output.
- **Tool:** puku. **Review:** mle-reviewer.

#### P3-212 · TASK-039c eval: WER, timing, audit coverage — 2a
- **Lane:** Masnun · `eval/`.
- **Files:** replace `eval/wer.mjs`, `eval/time.mjs`, `eval/audit.mjs`; create `tests/eval/wer.test.ts`.
- **Deps:** none (inputs may not exist yet).
- **Inputs:** TASK-040, TASK-041 definitions; `eval/data/timing.csv` format (create the header only).
- **Steps:** WER on clips + reference transcripts; median and IQR from `timing.csv`; audit coverage SQL. If inputs are missing, print "not measured" and exit 0.
- **Accept:** each command runs; unit test on a tiny WER example.
- **Evidence:** output.
- **Tool:** agy. **Review:** mle-reviewer.

#### P3-213 · TASK-042 prep: `npm run smoke` — 2a
- **Lane:** Mahim · `scripts/`.
- **Files:** replace `scripts/smoke.mjs`; create `tests/scripts/smoke.test.ts`.
- **Deps:** none.
- **Inputs:** D2A API-019 health; D6 TASK-042.
- **Steps:** takes a base URL; checks health, `/` renders the synthetic badge, sign-in page loads, a synthetic text submit through the fake path if `DEMO_MODE` allows; no secrets printed.
- **Accept:** passes against the local production build.
- **Evidence:** output.
- **Tool:** agy. **Review:** security-reviewer.

#### P3-214 · TASK-039d `eval:all` report writer — 2b
- **Lane:** Masnun · `eval/`.
- **Files:** replace `eval/all.mjs`; create `eval/reports/.gitkeep`.
- **Deps:** P3-210, P3-211, P3-212.
- **Inputs:** TC-020 (5 metrics, sizes, SHA, ≥2 failures).
- **Steps:** run each eval, write `eval/reports/<date>-<split>.md` with commit, model, manifest hashes, denominators, at least two failure examples, cache disabled.
- **Accept:** TC-020 on dev.
- **Evidence:** report path.
- **Tool:** agy. **Review:** mle-reviewer.

#### P3-215 · Accessibility fix cards — 2b
- One card per P3-201 violation, in the owner's files. Tool agy for copy/ARIA, puku for structure. Review a11y-architect.

#### P3-216 · WER run — 2b, after HUMAN TASK-040 clips exist
- **Lane:** Obidit. **Files:** `eval/reports/` output only. **Deps:** 60 clips with consent note; P3-212; TASK-003 keys. **Steps:** `npm run eval:wer`. **Accept:** WER in report with denominator. **Tool:** agy. **Review:** mle-reviewer.

#### P3-217 · Dev evaluation and freeze — 2b
- **Lane:** Masnun. **Files:** `eval/freeze.json` (commit, model, manifest hash, thresholds). **Deps:** P3-214. **Steps:** run `npm run eval:all` on dev; calibrate thresholds on dev only; write the freeze file. After this, no threshold, model or prompt change without a new freeze (AMD-3-3). **Accept:** freeze file committed. **Tool:** puku. **Review:** mle-reviewer.

**HUMAN in Wave 2:** TASK-036 two Android phones → `docs/device-test.md` signed; TASK-040 record 60 clips with consent; TASK-041 timing study ≥5 testers → `eval/data/timing.csv`; human Bangla review of strings marked "needs human Bangla review".

**G3 (Wed 21 Oct 20:00):** TC-007, TC-014, TC-018, TC-019, TC-035 pass (or are recorded as cut); S-014 works; TC-033 and Bangla checks pass; mentor fixes merged; freeze held.

### Wave 3: release (Thu 22 Oct)

#### P3-301 · TASK-042 production deploy + managed DB seed + smoke — **needs Obidit's explicit go-ahead**
- **Lane:** Mahim. **Deps:** G3; Playwright green; R-3 resolved. **Steps:** deploy `phase-3-obidit` per the lead's instruction; apply `schema_v2.sql` + roles to the managed DB; `seed -- --set demo`; `npm run smoke -- <prod URL>`; tag (name to be decided by the lead; the old `r2-freeze` is a Round 2 name). **Accept:** smoke passes on prod. **Evidence:** URL, smoke output, tag. **Tool:** haiku, run with a human present. **Review:** security-reviewer.

#### P3-302 · TASK-060 performance · NFR-001–NFR-005 · TC-034
- **Lane:** Masnun. **Files:** create `eval/perf.ts` (or `.mjs`), report in `eval/reports/`. **Deps:** P3-301. **Steps:** Lighthouse mobile on the prod URL for the Must parent screens; API timings per D2B §12.1. **Accept:** each target met or reported as missed. **Tool:** puku. **Review:** mle-reviewer.

#### P3-303 · Held-out run + TASK-043 final frozen evaluation · TC-020, TC-056, TC-064
- **Lane:** Masnun. **Deps:** P3-217, P3-302, P3-216 (or WER "not measured"), TASK-041 data (or "not measured"). **Steps:** `npm run eval:all -- --split heldout` on the prod build with cache disabled; no tuning from these results. **Accept:** report with all metrics, denominators, failures, commit/model/manifest hashes. **Tool:** puku. **Review:** mle-reviewer.

#### P3-304 · G4 gate
- `fera-gate G4` run by luna: smoke on prod, Playwright green, final eval report, measured spend (`npm run spend`). Lead signs.

**HUMAN:** VIDEO-PREP (raw shots after P3-301).

---

## 7. Execution model

| Role | Who | Does | Never |
|---|---|---|---|
| Orchestrator | Codex Sol 6.1 | Creates lanes, launches workers as background bash terminals, routes reviews, merges into `phase-3-obidit`, runs wave gates, updates TASK rows in the Phase 2/3 trackers, resolves tracker-only conflicts | Implements features; merges a BLOCK; pushes `main`; deploys |
| Implementer (default) | Puku CLI, strictly Opus 4.8 | Cards marked puku | Edits files not on its card |
| Implementer (light) | agy, Gemini 3.8 Flash High | Cards marked agy: copy, strings, fixtures, small UI states, tests | Schema, auth, transactions |
| Implementer (small) | Claude Code, Haiku 5.5 High | Cards marked haiku | Multi-module work |
| Reviewer and tester | Codex Luna 6 | `$fera-review` on every task (always `fera_safeguarding_reviewer` + the card's domain reviewer), re-runs the card's Accept command, wave gates with `$fera-gate` | Implements or edits code |
| HUMAN | named person | TASK-003, TASK-011 labels, TASK-036, TASK-040 clips, TASK-041, VIDEO-PREP, decisions in §3, deploy go-ahead | — |

Flow per task:
1. Orchestrator: `scripts/agents/new-lane.sh phase-3-obidit p3-<id>-<owner>-<slug>` → worktree `../fera-lanes/p3-<id>-…`, branch `phase-3-obidit--p3-<id>-…` from the local `phase-3-obidit`. Then `npm ci` in the lane.
2. Worker gets: AGENTS.md, this file's §5 and its own card, nothing else. It changes only the files on its card plus its §9 row and its owner log line.
3. Worker runs the card's Accept command and the standard checks, commits on its lane branch (Conventional Commits with the TASK ID), sets its §9 row to `review`.
4. Luna runs `$fera-review` in the lane (read-only) and the Accept command. BLOCK → back to the same worker with the findings (max 2 rounds, then the orchestrator escalates to the lead).
5. PASS → orchestrator merges into `phase-3-obidit` with `--no-ff`, then runs `npm run lint && npm run typecheck && npm test` on the integration tree. Red → revert the merge and send it back.
6. After the last task of a wave: wave gate (below). Lanes for the next wave are created only after the gate, from the updated `phase-3-obidit`.

Wave gate: on `phase-3-obidit` run lint, typecheck, test, build, test:db (and `test:e2e` once P3-014 is in); argon2 failures are re-run alone before being called failures; Luna runs `$fera-review` on the whole wave diff; the orchestrator writes `docs/gates/W<n>-<YYYY-MM-DD-HHMM>.md` with exit codes and counts.

Concurrency limits: 10–20 workers in parallel, but at most 3 lanes running `npm run build`, full `npm test` or `test:e2e` at once (CPU load causes the argon2 timing flake). `test:db` is safe in parallel (one database per pid) and needs the `fera-db` container (`npm run db:up`). No GATED card starts before its decision is logged. Pushing needs an SSH agent or HTTPS with `gh auth git-credential`; the orchestrator pushes `phase-3-obidit` only after the lead says so.

---

## 8. Orchestrator launch prompt (copy into Codex Sol 6.1)

```text
You are the Phase 3 orchestrator for Fera (repo: /home/obidit/secondBrain/coding/Fera-AI, integration branch phase-3-obidit, checked out in that directory). You never implement features yourself.

Read first, in order: AGENTS.md; docs/execution/PHASE_3_PLAN.md (whole file); docs/execution/PHASE_3_FULL_SCOPE_QUALITY.md (log format only).

Your job:
1. Work wave by wave in the order of PHASE_3_PLAN.md §6: 0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 1a, 1b, 2a, 2b, 3. Never start a card whose Deps are not merged, and never start a GATED card until its decision appears in the tracker log. Skip HUMAN cards and list them for the lead.
2. For each card in the current wave, create a lane:
   scripts/agents/new-lane.sh phase-3-obidit p3-<id>-<owner>-<slug>
   then run `npm ci` in ../fera-lanes/p3-<id>-<owner>-<slug>.
3. Launch one worker per lane as a separate background bash terminal, using the tool on the card:
   puku  -> <PUKU_CMD> (model strictly Opus 4.8)
   agy   -> <AGY_CMD> (Gemini 3.8 Flash High)
   haiku -> claude -p with model claude-haiku-5-5 at high effort (use the local flag names)
   Worker prompt: "Read AGENTS.md, then §5 and card P3-<id> of docs/execution/PHASE_3_PLAN.md. Do exactly that card. Change only the files it lists, plus your row in §9 and one log line in your owner's section of PHASE_3_FULL_SCOPE_QUALITY.md. Use [MOCK] fakes; no real providers, no real child data, never read .env files. Run the card's Accept command and npm run lint, typecheck, test (and test:db if you touched SQL or tests/db). Commit on your lane branch with a Conventional Commit naming the TASK ID. If you need a file not on the card, or a contract/schema change, stop and set your row to blocked with the reason."
   Run 10-20 workers at once, but at most 3 lanes running build, full test or test:e2e at the same time.
4. When a worker finishes, run Codex Luna 6 (<LUNA_CMD>) read-only in that lane: `$fera-review` (always fera_safeguarding_reviewer plus the card's reviewer) and the card's Accept command. BLOCK -> send the findings back to the same worker (at most 2 rounds), then escalate to the lead.
5. On PASS: in the integration directory, `git merge --no-ff phase-3-obidit--p3-<id>-...`; then npm run lint && npm run typecheck && npm test. If red, revert the merge and return it to the worker. Resolve conflicts yourself only in tracker/log lines (keep both sides); any other conflict goes back to the worker.
6. After the last card of a wave: run the wave gate from §7 (lint, typecheck, test, build, test:db, test:e2e once available; re-run argon2 auth tests alone before calling them failures), have Luna run `$fera-review` on the wave diff, write docs/gates/W<n>-<YYYY-MM-DD-HHMM>.md with exit codes and counts, and update the TASK rows in the Phase 2/3 trackers for TASKs whose cards are all merged. Run `$fera-gate` at G2', G3 and G4.
7. Never push without the lead's go-ahead. Never push to main. Never deploy (P3-301 needs Obidit's explicit go-ahead). Never run db:reset against a non-local database. Never cut scope yourself: propose cuts to the lead in the D6 §11 order; never cut review-before-submit, officer confirm, referral, audit or redaction.
8. Report to the lead after each wave: merged cards, blocked cards with reasons, GATED cards waiting on decisions, HUMAN tasks due, gate result, and remaining cards per owner.
```

---

## 9. Status (workers edit only their own row)

Status values: `todo` · `doing` · `review` · `done` · `blocked` · `cut`.

| Card | TASK | Owner | Tool | Status | Lane / commit | Evidence |
|---|---|---|---|---|---|---|
| P3-001 | — | Mahim | `puku-cli` Opus 4.8 | `done` | [merged PR #38](https://github.com/tashobi02/Fera-AI/pull/38) · `9c2ad8e` merged into `phase-3-obidit` | Locale tests 52/52; scoped safeguarding/TS/DB/Bangla/React/a11y reviews PASS. After all Wave 0.0 merges: lint, typecheck, `npm test`, `test:db`, and Turbopack build exit 0. |
| P3-002 | (TASK-023) | Obidit | Claude Code Haiku 5.5 | `done` | [merged PR #38](https://github.com/tashobi02/Fera-AI/pull/38) · `42c2d0f` merged into `phase-3-obidit` | Approved D-A; wording-guard tests 58/58; exact bn/en disclaimer copy pinned; Bengali, TS, safeguarding reviews PASS. Full merged suite green. This card alone does not complete TASK-023. |
| P3-003 | (TASK-024) | Mahim | Claude Code Haiku 5.5 | `done` | [merged PR #38](https://github.com/tashobi02/Fera-AI/pull/38) · `13fa187` merged into `phase-3-obidit` | Approved D-A; parent-screen tests 70/70; security, TS, safeguarding reviews PASS after fail-closed media scan fixes. Full merged suite green. This card alone does not complete TASK-024. |
| P3-004 | (TASK-014) | Mahim | Claude Code Haiku 5.5 | `done` | [merged PR #38](https://github.com/tashobi02/Fera-AI/pull/38) · `12317b5` merged into `phase-3-obidit` | Focused auth 18/18; scoped safeguarding/security/TS reviews PASS. After all Wave 0.0 merges: lint, typecheck, `npm test` (2,959 passed, 191 skipped), `test:db` (10 files), and Turbopack build exit 0. This card alone does not complete TASK-014. |
| P3-005 | TASK-020 | Mahim | puku | `todo` | | GATED OD-020-3; no recorded decision found in locally available Mahim branches. |
| P3-010 | TASK-010 | Masnun | puku | `blocked` | isolated draft `d5371b6`; not merged | MLE review BLOCK after two Puku rounds: five found ages violate DB constraint, unknown age absent, decoys do not exercise BR-017 hard filters, ground truth incomplete, five shared-phone distinct-child pairs mislabelled duplicates. |
| P3-011 | TASK-004 | Masnun | puku | `done` | [merged PR #38](https://github.com/tashobi02/Fera-AI/pull/38) · `9500910` merged into `phase-3-obidit` | [Embedding spike](evidence/embedding-spike.md): 20 synthetic bn/en texts, 384-d; MLE review PASS after correction. Hosted viability remains UNKNOWN; this card does not complete all TASK-004 deployment evidence. |
| P3-012 | TASK-011 | Masnun | agy + HUMAN | `blocked` | no edits in `/tmp/fera-p3-012` | agy CLI denied its headless command permission. Automatic approval review rejected the requested permission-bypass flag. Exact executor retained; 50 synthetic texts and human labels remain undone. |
| P3-013 | TASK-025 | Mahim | puku | `todo` | | OD-022-5 decided in Mahim commit `c1269e7`; S-005 draft `2fbb8d0` is on an unmerged Mahim branch. Reconcile that work and its review before this card starts or is counted done. |
| P3-014 | TASK-038 | Mahim | puku | `done` | [merged PR #38](https://github.com/tashobi02/Fera-AI/pull/38) · `9de0d5c` merged into `phase-3-obidit` | `npm run test:e2e` 4/4 PASS on a fresh local synthetic DB, including Turbopack build; `npm test` excludes e2e. TS/safeguarding review PASS. Added dev dependencies `@playwright/test` ^1.64.1 (browser runner) and `@axe-core/playwright` ^4.14.0 (a11y scan). Harness only; TASK-038 journeys remain; CI E2E is manual-only. |
| P3-015 | TASK-022 | Obidit | puku | `done` | [merged PR #38](https://github.com/tashobi02/Fera-AI/pull/38) · `c74381b` merged into `phase-3-obidit`; clean-branch fixes `f416cc4`, `c11dd76` | Searchable, clearable bilingual district list with aliases and result announcement; 44/44 focused tests; React/Bengali/a11y re-reviews PASS; 44px helpline and submitted-report link; refreshed [360 px screenshot](evidence/screenshots/p3-015-review-360.png). |
| P3-016 | TASK-029 | Mahim | puku | `done` | [merged PR #38](https://github.com/tashobi02/Fera-AI/pull/38) · `2de934c` plus malformed-ID fix merged into `phase-3-obidit` | API tests 6/6, isolated DB tests 12/12, full `test:db` 11 files PASS; security, safeguarding, database and TS reviews PASS. Role DTOs and persisted E-004 denied-access audit, including malformed IDs, verified. This card alone does not complete TASK-029. |
| P3-017 | TASK-014 | Obidit | puku | `todo` | | GATED OD-014-7; no recorded decision found in locally available Mahim branches. |
| P3-018 | TASK-029 | Mahim | puku | `blocked` | isolated drafts `33c9017`, `7a9fadb`; neither merged | Puku CLI Opus 4.8 repaired response/fixture typing; integrator schema-parse fix made typecheck PASS. `npm test -- tests/api/case-close.test.ts` fails because this DB-backed test runs in the unit suite without `DATABASE_URL`; local `test:db` fails 7 audit-read tests (`audit_log.at` fixture shape). The reader also fetches audit rows before applying the role guard. No PR until these are fixed and DB/safeguarding review passes. |
| P3-019 | TASK-029 | Mahim | puku | `todo` | | |
| P3-020 | TASK-020 | Obidit | puku | `todo` | | GATED OD-020-3 and P3-005; no recorded decision found in locally available Mahim branches. |
| P3-021 | TASK-025 | Obidit | haiku | `todo` | | |
| P3-022 | TASK-064 | Masnun | puku | `todo` | | |
| P3-023 | TASK-019 | Masnun | puku | `todo` | | |
| P3-024 | TASK-016 | Masnun | puku | `todo` | | |
| P3-030 | TASK-017 | Masnun | puku | `todo` | | |
| P3-031 | TASK-017 | Masnun | puku | `todo` | | |
| P3-032 | TASK-017 | Masnun | agy | `todo` | | |
| P3-033 | TASK-018 | Masnun | puku | `todo` | | |
| P3-034 | TASK-027 | Masnun | puku | `todo` | | |
| P3-035 | TASK-021 | Obidit | puku | `todo` | | |
| P3-040 | TASK-017 | Masnun | puku | `todo` | | |
| P3-041 | TASK-030 | Masnun | puku | `todo` | | |
| P3-043 | TASK-033 | Obidit | puku | `todo` | | |
| P3-050 | TASK-030 | Masnun | puku | `todo` | | |
| P3-101 | TASK-047 | Obidit | haiku | `todo` | | |
| P3-102 | TASK-049 | Obidit | puku | `todo` | | |
| P3-103 | TASK-049 | Obidit | puku | `todo` | | |
| P3-104 | TASK-050 | Obidit | puku | `todo` | | |
| P3-105 | TASK-048 | Masnun | puku | `todo` | | |
| P3-106 | TASK-048 | Mahim | agy | `todo` | | |
| P3-107 | TASK-051 | Masnun | puku | `todo` | | |
| P3-108 | TASK-052 | Masnun | agy | `todo` | | |
| P3-109 | TASK-056 | all | — | `todo` | | list not filled (R-7) |
| P3-201 | TASK-034 | Mahim | agy | `todo` | | |
| P3-202 | TASK-035 | Obidit | agy | `todo` | | |
| P3-203 | TASK-035 | Obidit | agy | `todo` | | |
| P3-204 | TASK-037 | Mahim | agy | `todo` | | |
| P3-205 | TASK-038 | Mahim | puku | `todo` | | |
| P3-206 | TASK-038 | Mahim | puku | `todo` | | |
| P3-207 | TASK-038 | Mahim | puku | `todo` | | |
| P3-208 | TASK-038 | Mahim | puku | `todo` | | |
| P3-209 | TASK-038 | Mahim | agy | `todo` | | |
| P3-210 | TASK-039 | Masnun | puku | `todo` | | |
| P3-211 | TASK-039 | Masnun | puku | `todo` | | |
| P3-212 | TASK-039 | Masnun | agy | `todo` | | |
| P3-213 | TASK-042 | Mahim | agy | `todo` | | |
| P3-214 | TASK-039 | Masnun | agy | `todo` | | |
| P3-215 | TASK-034 | owners | agy / puku | `todo` | | |
| P3-216 | TASK-040 | Obidit | agy | `todo` | | needs clips (HUMAN) |
| P3-217 | TASK-039 | Masnun | puku | `todo` | | |
| P3-301 | TASK-042 | Mahim | haiku + HUMAN | `todo` | | needs go-ahead |
| P3-302 | TASK-060 | Masnun | puku | `todo` | | |
| P3-303 | TASK-043 | Masnun | puku | `todo` | | |
| P3-304 | G4 | Mahim | luna | `todo` | | |
| HUMAN | TASK-003 | Obidit | HUMAN | `todo` | | |
| HUMAN | TASK-036 | Masnun | HUMAN | `todo` | | |
| HUMAN | TASK-040 clips | Obidit | HUMAN | `todo` | | |
| HUMAN | TASK-041 | Mahim | HUMAN | `todo` | | |
| HUMAN | VIDEO-PREP | Obidit | HUMAN | `todo` | | |
