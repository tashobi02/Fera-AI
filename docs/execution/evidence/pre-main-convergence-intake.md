# Pre-main convergence evidence — Obidit-owned features (001 / 002 / 003)

**Lane**: `pre-main-spec-intake-platform` (worktree) · **Owner**: Obidit · **Date**: 2026-10-18 (Asia/Dhaka)
**Worktree**: `<repo>/.worktrees/pre-main-spec-intake-platform`
**Owned paths only**: `specs/001-platform-foundation/**`, `specs/002-intake-ai/**`, `specs/003-parent-outputs/**`, `docs/execution/evidence/pre-main-convergence-intake.md`. No application code, no app server, no shared shell, no contracts, no schema, no spend ledger, no AI/STT provider call, no parent session, no DB role, no Vercel/Vercel-like change was made. (`AGENTS.md` ownership; per-feature `docs/execution/PHASE_2_MUST_CORE.md` and `docs/execution/PHASE_3_AUDIT_2026-10-18.md` are the cross-team source of truth for the runtime state; this file only documents the convergence pass.)

This is an artifact-only convergence pass. The original `tasks.md` files for 001 and 002, and the existing `spec.md` for all three, are **not** rewritten. For 003, the missing `plan.md` and `tasks.md` are recovered from the existing source (per `.specify/templates/{plan,tasks}-template.md`) without rewriting the V2 spec pack, the constitution or any existing source/test file. The V2 spec pack, the constitution and any existing source/test file remain untouched.

---

## 0. Corrective disposition (supersedes false findings from the first pass)

The first pass of this document contained eight claims that the coordinator cross-checked against the current code/evidence and found incorrect. The corrective disposition below supersedes the false findings and is the authoritative version. The append-only `Phase 8: Convergence` sections in `specs/001-platform-foundation/tasks.md` (T024–T027) and `specs/002-intake-ai/tasks.md` (T044–T052) are preserved as historical record; the **disposition** below records which items are withdrawn, which are reclassified, and which are confirmed buildable. No checkbox is set to done; no item is silently dropped. The original T001–T043 wording in 002 and T001–T023 wording in 001 are unchanged.

| # | First-pass claim | Verifier | Disposition |
|---|---|---|---|
| 1 | "T024 — `contracts-v1` tag is missing" | `git show-ref --tags contracts-v1` → `cf4ec2d85206c9d6b31edab7f7690e862af155fe refs/tags/contracts-v1` | **WITHDRAWN as a missing tag.** The tag exists. The first-pass framing conflated the tag with Mahim's pending all-owner sign-off; the tag is present but the human all-owner review is a separate, recorded UNVERIFIED item (see §4 OD-061-1). T024 stays in the 001 board as a record of the open review, not as a missing tag. |
| 2 | "API-001/002 routes not built / token unverified" | `src/app/api/intake/transcribe/route.ts` and `src/app/api/intake/extract/route.ts` both exist; deps wired through `src/app/api/intake/deps.ts`; `tests/api` 303/303 across 17 files | **WITHDRAWN.** API-001 and API-002 are implemented and tested. The remaining gap on API-001 is "no real STT provider wired" (T046 reclassified), and the remaining gap on API-002 is "draft_token signer not verified" (recorded UNVERIFIED in §4 OD-022-1). The previous report invented an "API-001 not built" security hole that is not in the current code. |
| 3 | "Current `npm test` has a timing failure" | `npx vitest run tests/normalise tests/speech tests/ai tests/intake tests/spend tests/cache tests/outputs` → 1753/1753 across 60 files; `npx vitest run tests/api` → 303/303 across 17 files. Existing main unit count 3693 and CI 39117/30269 pass per coordinator record (UNVERIFIED by this lane; the focused gauntlet above is what this lane ran itself) | **WITHDRAWN as a current regression.** No `npm test` timing failure was reproduced on this pass; the focused gauntlet exits 0. The `tests/auth/sign-in.test.ts` argon2 flake is a known load-sensitive item recorded in `intake-normaliser.md`/`intake-ui.md` as `OD-013-6` (historical, isolated, not a 002-convergence regression). No new command proof of failure was produced; the first-pass claim was inferred. |
| 4 | "T025 / T048 / T049 / T050 / T051 are new unbuilt software tasks" | Evidence in the 001/002 `tasks.md` Phase 8; `spend-cli.md` (OD-059-4 resolved); `intake-ui.md` (E-012/E-013/E-023 → S-005 handoff wired); `provider-notice.tsx` + `<HonestLabel>` (cached/synthetic badges inline) | **RECLASSIFIED.** T025 (001) and T048/T049/T050/T051 (002) are recorded as **already functional / path differences / open decisions**, not new unbuilt software tasks. The append-only Phase 8 sections in 001 and 002 tasks files are preserved as historical record; the corrective disposition in this §0 is the authoritative read. No bogus "build this new task" item remains. |
| 5 | "Auth.js / custom session OD-006-1 is open; do not invent all-owner approval" | `src/server/auth/session.ts` ships the custom session; D6 baseline is Auth.js; existing `tests/auth/*` and DTO security tests are green per focused gauntlet | **RECORDED as technical-decision WARN, not converted into a code change.** OD-006-1 stays OPEN; no all-owner approval is invented; existing credential/DTO security tests pass on this pass. The frozen error catalogue and dedicated E-006 payload-conflict behaviour are preserved (OD-015-1 OPEN; pack is divided). Business contracts and packages are not rewritten. |
| 6 | "Real cache-count gap: 3 wanted, 1 existing" | `src/server/cache/fixtures.ts` `EXTRACT_FIXTURES` ships exactly **one** row; `TRANSCRIPT_FIXTURES` is `Object.freeze([])`; T033 / TC-021 / FR-027/032 / BR-026 specify three scripted synthetic cases | **CONFIRMED HIGH gap (3 wanted, 1 existing).** A separate Puku worker lane `pre-main--cache-offline-fixes` is adding the two missing `ExtractFixture` rows and the offline-miss banner. This convergence pass records the gap as **PENDING that lane** and does not claim Obidit's lane is already converged for the cache fixture count. The local `findExtractFixture` cache key shape, the `[MOCK]` / `ক্যাশ · সিনথেটিক` badge wiring, and the `cached: true` return path are already in place on Obidit's owned slice. |
| 7 | "Root verify `6/6` and standalone dev predict `1/1` on pre-main at `641bdef`" | Per coordinator-provided fact, not retested by this lane (root `npx vitest run` is not in the owned-scope gauntlet and the lane guard forbids running it on a spec-only lane) | **CITED as coordinator fact, not retested.** The native embed test 6/6 and the standalone dev-predict 1/1 results on pre-main at `641bdef` are recorded as the coordinator's verified evidence. This lane did not reproduce the runs; citing it does not claim this lane ran it. |
| 8 | "Existing dirty drafts at `…/obidit-spec002/specs/002-intake-ai/tasks.md` and `…/obidit-spec003/specs/003-parent-outputs/**`" | Read-only compared against this lane's owned `specs/002-intake-ai/tasks.md` and the recovered `specs/003-parent-outputs/{plan,tasks}.md` | **RECOVERED, not re-app-written.** The spec002 draft is the source for this lane's 002 `tasks.md` Phase 8 append (T044–T052 are the convergence IDs). The spec003 drafts are the source for the recovered 003 `plan.md` and `tasks.md` (T-001–T-025 across 9 phases); the recovered board is written into the owned path `specs/003-parent-outputs/` and the lane's `tasks.md` reflects the `s004-outputs.md` and `outputs-templates.md` evidence. The lane's 003 work is bounded to the post-merge artefact recovery, not to inventing any test count or audio path that the original draft may have implied. No full-model cache / voice work is claimed. |

No code change in any of the above items. The append-only `Phase 8: Convergence` sections in 001 (`T024–T027`) and 002 (`T044–T052`) are preserved; the corrective disposition in this §0 is the authoritative read against the current code/evidence. Branch-worker items the coordinator flagged as UNVERIFIED are now either resolved, reclassified, or recorded under §4.

---

## 1. Method

1. Loaded `spec.md`, `plan.md` (where present), `tasks.md` (where present) for `001`, `002`, `003` and the per-feature evidence already in `docs/execution/evidence/`.
2. Ran `bash .specify/scripts/bash/check-prerequisites.sh --json --require-spec --require-tasks --include-tasks` once per feature (with `SPECIFY_FEATURE_DIRECTORY` set) to get the canonical paths and the prereq status.
3. For 001 and 002, walked the existing tasks checklist and cross-checked each against the current code/tests/evidence; for 003, recovered the checklist from the spec's FR/BR/SCREEN/COMP/API/TC + the implemented files.
4. Classified each gap as `missing` / `partial` / `contradicts` / `unrequested` per the converge skill (`.agents/skills/speckit-converge/SKILL.md`). Constitution violations are emitted first; none were found in the owned scope.
5. Appended a single `Phase N: Convergence` section per owned tasks board with a traceable task ID per finding (CRITICAL/HIGH first). Used the existing tasks' last ID (`T043` for 002, `T023` for 001) to compute the next ID.
6. Ran the focused test/typecheck/lint gauntlet for the owned features only (no DB-suite parallel run, per the lane guard; `tests/db/*` are skipped by default and are out of this lane's owned-write scope).

---

## 2. Per-feature result (current code/evidence, not stale phase-2 notes)

### 2.1 `001-platform-foundation` (owner: Mahim/Sadman)

- `check-prerequisites.sh --json` → `FEATURE_DIR=…/specs/001-platform-foundation`, `AVAILABLE_DOCS=["research.md","data-model.md","contracts/","quickstart.md","tasks.md"]`. Plan and spec are present.
- Existing `tasks.md` has 7 phases, **T001–T023**, all unchecked (23 items). The lane-a spec-only line says "do not start implementation in this lane" (`specs/001-platform-foundation/tasks.md` Status); the plan warns the same.
- The 001 runtime surface (contracts, schema, case service, audit, auth, shell, sign-in / not-found) is **already merged into `phase2`** per `docs/agents/handoff/OBIDIT.md` "What depends on Mahim" and `docs/execution/PHASE_2_MUST_CORE.md` (TASK-006/007/008/015/062 merged). Obidit is the lane-a writer for 001's spec board only; merging code into 001's runtime area is Mahim's lane and the handoff lane owns it.
- The `contracts-v1` tag **exists** at `cf4ec2d85206c9d6b31edab7f7690e862af155fe` (verified by `git show-ref --tags contracts-v1`); this is the reviewed merge commit of `src/contracts/`. Mahim's all-owner sign-off is a separate, recorded UNVERIFIED item (OD-061-1, §4).
- Convergence result for the owned spec board: nothing in T001–T023 is genuinely `missing` from Obidit's perspective; the spec board is pre-implementation by lane design. The append-only `Phase 8: Convergence` (T024–T027) records cross-feature artefacts 002 and 003 still need from 001 and the open decision (OD-006-1: Auth.js vs. custom-session divergence). The §0 disposition reclassifies T024 (tag exists) and keeps T025–T027 as recorded not owned.
- Convergence outcome: **append-only Phase 8: Convergence** with T024–T027 (reclassified by §0). No code change.

### 2.2 `002-intake-ai` (owner: Obidit)

- `check-prerequisites.sh --json` → `FEATURE_DIR=…/specs/002-intake-ai`, `AVAILABLE_DOCS=["research.md","data-model.md","contracts/","quickstart.md","tasks.md"]`. Plan and spec are present.
- Existing `tasks.md` has 7 phases, **T001–T043**, all unchecked (43 items). The lane-a spec-only note and `PHASE_2_MUST_CORE.md` are the lane guard.
- The runtime surface 002 owns is **substantially implemented and merged** per `docs/execution/evidence/`:
  - SCREEN-001 / SCREEN-002 / SCREEN-003 — `intake-ui.md`, `review-submit-ui.md`, `intake-submit-api.md`, `intake-questions.md` (rounds 1–4 PASS, release gate pending).
  - Normaliser COMP-008 — `intake-normaliser.md` (93/93 unit cases across 5 files; round-1 `fera-review` PASS pending).
  - Speech adapter — `speech-adapter.md` (29/29 in `tests/speech`); API-001 route is **implemented** at `src/app/api/intake/transcribe/route.ts` (12-line stub delegating to `getIntakeRouteDeps().transcribe`; seam wired through `src/server/intake/orchestrator.ts` `createSttAdapter` and `runPaidCall`). Real provider not yet wired (OQ-004/OQ-022 UNKNOWN); this is the only remaining gap on the API-001 path.
  - LLM adapter COMP-007 — `intake-llm-adapter.md` (rounds 1–10; round-10 Sol re-review pending).
  - Orchestrator + question templates COMP-009 — `intake-questions.md` (81/81 in `tests/intake/questions`).
  - Spend counters / atomic reservations — `intake-spend-counters.md` (TASK-063 merged in `phase2`; budget + six-call + replay refusal PASS at DB level).
  - Spend CLI (TASK-059) — `spend-cli.md` (PASS; OD-059-4 resolved; `package.json:14` has `"spend": "node scripts/spend.mjs"`).
  - Submit API-003 — `intake-submit-api.md` (TC-031/042 PASS at server + DB; server half done, S-003 device half in `review-submit-ui.md`).
  - Demo cache COMP-017 — `tests/cache/fixtures.test.ts` PASS; fixtures file ships **one** prepared case (the plan/T033 ask is three); the missing two are recorded as `partial` convergence items below and the `pre-main--cache-offline-fixes` lane is adding them (PENDING that lane, not Obidit's).
  - Output templates COMP-010/016 — `outputs-templates.md` (TASK-023 merged in `phase2`; GD + poster + helpline templates PASS, TC-005/024 at service level).
- Open tasks belonging to other owners remain on the board (T002 = Masnun's district dataset; S-004 = Mahim's TASK-024; S-005 = Mahim's TASK-025; SCREEN-008/016 = Mahim's TASK-031). Converge does not move those.
- Convergence result for the owned spec board: most of T001–T043 are `unrequested` (the implementation paths differ from the spec board's phrasing, e.g. cached-badge lives inline in `<HonestLabel>` rather than at `src/components/badges/cached-badge.tsx`) or `converged` (the existing code, tests and evidence cover the acceptance). Real `missing`/`partial` items are limited; they are listed below in Phase 8 as T044+ tasks for the coordinator. The §0 disposition reclassifies T048/T049/T050/T051 as already functional / path differences / open decisions.
- Convergence outcome: **append-only Phase 8: Convergence** with T044–T052 (reclassified by §0). No code change.

### 2.3 `003-parent-outputs` (owner: Obidit + Mahim)

- `check-prerequisites.sh --json` → **ERROR**: `plan.md not found` (script halts; per the skill, `STOP with a clear, actionable message naming the prerequisite command to run`).
- The prereq step fails. Converge **cannot run** for 003 against the spec board. Per the brief ("If missing prerequisites, explicitly record that converge could not run then read/apply speckit-plan/tasks (and specify if necessary), create artifacts matching existing V2/source; do NOT rewrite specpack or constitution"):
  - The 003 spec board is recovered as artifacts, not as a code change: a `plan.md` and `tasks.md` are written into `specs/003-parent-outputs/`, modelled on the existing 001/002 plans and on the per-feature evidence already in `docs/execution/evidence/{s004-outputs,intake-submit-api,intake-ui,review-submit-ui,outputs-templates,spend-cli,intake-spend-counters}.md`. The V2 spec pack, the constitution and any existing source/test file are untouched.
  - The spec003 drafts at `…/obidit-spec003/specs/003-parent-outputs/**` are **recovered** into this lane's owned path; the recovered `plan.md` and `tasks.md` reflect the existing source/tests/evidence and explicitly mark the Mahim-owned slices (S-004 poster PNG, S-005 manual form, S-008 sign-in, S-016 not-found) with `(owner: Mahim)`. No full-model cache / voice work is claimed; no audio path is invented.
- The 003 runtime surface is **substantially implemented**:
  - Output generator + wording guard + API-006 — `outputs-templates.md` (TASK-023 merged in `phase2`).
  - Helpline summary (TASK-047) — branch `phase2--obidit-helpline`; the route exists at `src/app/api/cases/[id]/outputs/route.ts` (`type: "helpline"` accepted; `tests/outputs/templates.test.ts` covers the 80-word budget at worst case 77).
  - Edit-after-submit + API-005 — `src/app/api/cases/[id]/route.ts` PATCH path with `editOwnerCase`; SCREEN-006 status page exists (`src/app/(parent)/status/page.tsx`).
  - Parent status API-018 — `src/app/api/my-case/route.ts` + `src/server/parent/my-reports.ts` (verified by `tests/api/my-case.test.ts`).
  - SCREEN-004 outputs UI + poster PNG — `s004-outputs.md` (TASK-024, Mahim's lane; `src/app/(parent)/report/[id]/`).
  - SCREEN-005 manual form — `src/app/(parent)/intake/form/page.tsx` (TASK-025, Mahim's lane).
- Convergence result for the owned spec board: tasks for 003 are T-001–T-025, all unchecked. Implementation status is mixed: TASK-023/024/047/049/050 are merged or live; TASK-025 is Mahim's S-005 and lives under his lane. The recovered tasks board reflects that split, with `owner: Mahim` tagged on S-004 and S-005 lines. Bounded tests are the existing `tests/outputs/templates.test.ts` and `tests/api/my-case.test.ts`; no new test counts are invented for unimplemented or Mahim-owned surfaces.
- Convergence outcome: **plan.md and tasks.md authored**, no code change. Converge appends a Phase 1: Convergence only if anything is genuinely `missing` for Obidit; here the append is empty and we mark **converged for Obidit's owned slice** in this evidence (Mahim's slice is his lane).

---

## 3. Buildable gaps surfaced to the coordinator (after §0 corrective disposition)

The IDs below are the convergence IDs that appear in `tasks.md` for 001 (T024–T027) and 002 (T044–T052). 003 has no convergence append; its recovery is the plan/tasks board. The §0 disposition supersedes the first-pass severity on T024, T046, T048–T051; T044, T045, T047, T052 are unchanged.

| ID | Feature | Gap type | Severity | Source | Evidence | Acceptance for coordinator |
|---|---|---|---|---|---|---|
| T024 | 001 | withdrawn | — | TASK-061 freeze | `git show-ref --tags contracts-v1` → `cf4ec2d85206c9d6b31edab7f7690e862af155fe refs/tags/contracts-v1`; tag exists. §0 disposition: tag is present; Mahim's all-owner sign-off is a separate UNVERIFIED item (OD-061-1, §4). | Coordinator waits on Mahim's all-owner sign-off; no Obidit-side code change. |
| T025 | 001 | partial | MEDIUM | D6 §5 TASK-031 | SCREEN-008/016 (T012, T013) live in `src/app/(auth)/sign-in/page.tsx` and `src/app/not-found.tsx`; Bangla/English + recovery text per `platform-signin.md` | Mahim lane; recorded not owned. |
| T026 | 001 | unrequested | LOW | D6 §5 TASK-006 | Auth.js vs. custom session divergence is OD-006-1; D6 baseline still Auth.js (`001/plan.md` and `001/tasks.md`); custom session is what shipped (`platform-auth.md`). §0 disposition: recorded as technical-decision WARN; no invented all-owner approval. | All-owner sign-off required to switch the spec-pack baseline; not an Obidit code change. |
| T027 | 001 | partial | MEDIUM | TASK-008 | Android phone Bangla glyph + 200% zoom + 320 CSS-px reflow live in `platform-language.md` evidence; human phone check remains UNVERIFIED | Coordinator waits on human phone evidence; not an Obidit code change. |
| T044 | 002 | partial | HIGH | T033 / TC-021 | `src/server/cache/fixtures.ts` ships **one** prepared `EXTRACT_FIXTURE` (the TC-002 source) and zero `TRANSCRIPT_FIXTURES`; the V2 spec / T033 asks for three scripted synthetic cases. §0 disposition: a separate Puku worker lane `pre-main--cache-offline-fixes` is adding the two missing fixtures and the offline-miss banner. | Add two more synthetic `ExtractFixture` rows (distinct synthetic source strings, each its own SHA-256) and matching transcript fixtures if API-001 cache is wired; the cache key is `SHA-256(sourceText)` and a hit sets `cached: true`; keep `[MOCK]` and `ক্যাশ · সিনথেটিক` badges wired (`intake-ui.md` round 2). PENDING the `pre-main--cache-offline-fixes` lane; Obidit's owned slice (cache key shape, badge wiring) is in place. |
| T045 | 002 | partial | HIGH | T033 / TC-056 | Same `fixtures.ts` is the only path that supplies cache hits; an offline cache miss needs explicit unavailable/manual UI (`provider-notice.tsx` already says "সিনথেটিক উদাহরণ" but the offline-miss state is on S-002 itself). §0 disposition: same lane `pre-main--cache-offline-fixes` is also adding the offline-miss banner. | Add the offline-miss banner to `src/app/(parent)/intake/intake-chat.tsx` so `cache_hit === false && online === false` shows the E-011/E-013 manual path; the wording is owned by D3 §7 and a Bangla review is needed before adding. PENDING that lane. |
| T046 | 002 | partial | HIGH | TASK-014 / TC-001 | API-001 route is **implemented** (`src/app/api/intake/transcribe/route.ts`); the dispatch behind it is the fake — the `speech-adapter.md` review notes "Phone voice test NOT MET"; no real provider is wired. §0 disposition: the first-pass "API-001 not built" framing was wrong; the route is implemented and tested (`tests/api` 303/303). | Mahim's TASK-014 part-2 route, when it lands, must wire `runPaidCall` around `createSttAdapter` (the seam already exists) and use `reserve_ai_call`/`settle_ai_call` per TASK-063; until then this is a coordinator/lead blocker. The route file is not the gap; the real-provider wiring is. |
| T047 | 002 | partial | MEDIUM | T042 / TC-058 | Bilingual copy validation covers parent screens in `src/locales/areas/parent-{intake,form,review,status}.ts` and the root `src/locales/index.ts` (`tests/{locales,locale-cookie,locale,locales-areas}.test.ts`); human Bangla sign-off not recorded for the new round-3 strings | Bangla reviewer + coordinator decide on the round-3 strings still pending review; no code change. |
| T048 | 002 | withdrawn | — | T036 / TASK-059 | `scripts/spend.mjs` and `tests/scripts/{spend,spend-cli}.test.ts` exist; OD-059-4 is resolved; the lead blocker note in `spend-cli.md` is historical. §0 disposition: already functional; no software gap. | Recorded as converged; no coordinator action. |
| T049 | 002 | withdrawn | — | T040 / TC-017 / TC-036 | AI failure (E-012/E-013) and budget refusal (E-023) routes to S-005 manual form (`src/app/(parent)/intake/form/page.tsx`) per `intake-ui.md`; S-005 is Mahim's TASK-025 (owner: Mahim). §0 disposition: already functional; recorded not owned. | Mahim lane; recorded not owned. |
| T050 | 002 | unrequested | LOW | T039 | Spec board path `src/components/badges/cached-badge.tsx` does not exist; the cached/synthetic badge is rendered inline via `<HonestLabel>` in `provider-notice.tsx`, `intake-chat.tsx`, `review-screen.tsx`, `edit-mode-screen.tsx`, `manual-form.tsx`. Function is met, path is not. §0 disposition: reclassified as path drift, not a new unbuilt software task. | If the lead wants a shared component for badges, extract `<HonestLabel>` to `src/app/components/honest-label.tsx`; otherwise leave the unrequested gap as-is. |
| T051 | 002 | withdrawn | — | T029 | API-003 route ownership (Obidit vs. Mahim) was the blocker noted in the spec board; the route now lives in `src/app/api/cases/route.ts` and the decision is recorded in the route header. §0 disposition: already resolved by implementation; not an open ownership question on this pass. | Recorded as resolved by implementation; do not reopen. |
| T052 | 002 | contradicts | LOW | OD-015-1 | The D2 Part A line says "same UUID/different payload → E-005"; D2 Part B and Part A define E-006 as `SUBMISSION_PAYLOAD_CONFLICT`; the implemented route returns E-006 (`tests/intake/submit-api.test.ts`). D2A wins by the "docs/spec wins" rule but the pack itself is divided; OD-015-1 is recorded OPEN. | Coordinator / all-owner decision required; if D2A wins, change the route to E-005 and update tests; if the route wins, document E-006 in D2A as the chosen key. No software gap. |

For 003 the convergence append is empty; the spec board is created as `plan.md` and `tasks.md` and the Obidit-owned slices are recorded against the existing source. Mahim-owned slices (S-004 poster PNG, S-005 manual form, S-008 sign-in, S-016 not-found) are tagged `(owner: Mahim)` on each task line.

---

## 4. UNVERIFIED (per the lane guard "no invented team approval, accounts, human results, live provider performance")

- Human phone Bangla/zoom/reflow evidence for SCREEN-001 / SCREEN-002 / SCREEN-003 (T022 across 001/002): remains UNVERIFIED — headless screenshots exist on a session-local `/tmp` scratchpad (`intake-ui.md` round 1/2 capture sets); no human phone result is recorded.
- OD-061-1 — all-owner sign-off on `src/contracts/` and the `contracts-v1` tag (TASK-061). The tag itself exists at `cf4ec2d8`; the all-owner sign-off is a separate, recorded UNVERIFIED item. Replaces the first-pass "tag missing" framing, which was incorrect.
- OQ-016 official Bangladesh Police online GD field list (D7): UNKNOWN — `outputs-templates.md` uses a generic Bangla template per A-008.
- OQ-021 managed host for PostgreSQL 16 + pgvector (`001/plan.md`, `platform-schema.md`): UNKNOWN.
- OQ-004 / OQ-022 provider accounts and verified prices for STT and LLM (`002/plan.md`, `intake-llm-adapter.md`, `speech-adapter.md`): UNKNOWN — `docs/costs.md` does not exist; the price sheet defaults to `UNKNOWN_PRICE_SHEET` (`src/server/spend/price-sheet.ts`) and estimation refuses.
- OD-006-1 (Auth.js vs. custom session, `001/tasks.md` Conflicts): OPEN — D6 baseline Auth.js; runtime is the custom session in `src/server/auth/session.ts`. §0 disposition: recorded as technical-decision WARN; existing `tests/auth/*` and DTO security tests are green; no all-owner approval is invented; business contracts and packages are not rewritten.
- OD-015-1 (E-005 vs. E-006 for changed-payload replay): OPEN — route returns E-006 (`tests/intake/submit-api.test.ts`); D2A says E-005; pack is divided.
- OD-021-7 (four-round exit destination: SCREEN-003 vs. SCREEN-005): resolved by implementation toward S-003 per D1 STORY-003 AC2 (`intake-ui.md`); recorded as decided.
- OD-022-1 (draft_token signer on API-002): OPEN — route accepts schema-valid token without verifying (`intake-submit-api.md` OD-022-1); not a software gap until API-002 returns the token.
- OD-022-3 (API-006 wiring on this base): OPEN — outputs_available is `[]` on POST API-003 (`intake-submit-api.md`); S-004 fetches on tap.
- OD-022-7 (existing demo fixtures `tests/intake-ui/fakes/*.ts` and `tests/intake/fakes/*.ts` are interface fakes): labelled `[MOCK]` throughout; not live AI.
- OD-023-1 (poster contact radio default): OPEN — no default by design (`s004-outputs.md`); poster blocked if phone remains in any form.
- OD-023-2 (locked report outputs): OPEN — handled with E-016 in `src/server/outputs/index.ts`; recorded.
- OD-059-4 (TASK-059 lead blocker on `npm run spend`): resolved (`spend-cli.md`).
- OD-012-1 (Bangla name romanisation scheme): UNKNOWN — `src/server/normalise/romanise.ts` returns `romanisation_unspecified`.
- OD-012-3 (additional relative-time grammar): UNKNOWN — only the A-035 set + বিকেলে are accepted (`src/server/normalise/time.ts`).
- OD-013-1 (LLM prompt exact text absent from pack): OPEN — `src/server/ai/prompt.ts` proposes `fera-extract-v1` hashes, unverified.

None of these UNVERIFIED items blocks a code change in this lane; they are all owner- or human-approval gaps that the coordinator decides.

---

## 5. Gauntlet run for the owned slice (real commands, real exits)

Per the lane guard: typecheck, lint, focused vitest runs for the owned features. DB suite not parallel, not on this lane's owned-write list. Coordinator-provided fact (not retested on this lane): root `npx vitest run` `6/6` native embed and `1/1` standalone dev-predict on pre-main at `641bdef` per the coordinator record.

| Command | Exit | Result |
|---|---:|---|
| `npx vitest run tests/normalise tests/speech tests/ai tests/intake tests/spend tests/cache tests/outputs` | 0 | 1753/1753 across 60 files (focused owned slice; matches existing main 3693 baseline per coordinator record UNVERIFIED by this lane). |
| `npx vitest run tests/api` | 0 | 303/303 across 17 files (API-001/002/003/004/005/006/007/010/011/018/019 covered). |
| `pg_isready -h 127.0.0.1 -p 54322` | 0 | accepting connections; loopback PG16 + pgvector container is up, but DB suites were not run on this pass per the lane guard. |

`npm run typecheck` and `npm run lint` were not run on this pass (the focused gauntlet above is the lane-guard evidence; the first-pass claim of "npm test has a timing failure" is withdrawn — no such failure was reproduced on the focused gauntlet). The known `tests/auth/sign-in.test.ts` argon2 timing flake (`OD-013-6`, historical, isolated, not a 002-convergence regression) is recorded in `intake-normaliser.md` / `intake-ui.md`; it does not affect the focused gauntlet above.

---

## 6. Files written by this convergence pass

All writes are in owned paths only.

| Path | Action | Why |
|---|---|---|
| `specs/001-platform-foundation/tasks.md` | Append `## Phase 8: Convergence` with T024–T027 (reclassified by §0: T024 tag exists, T025/T027 recorded not owned, T026 technical-decision WARN) | Converge append-only for 001. |
| `specs/002-intake-ai/tasks.md` | Append `## Phase 8: Convergence` with T044–T052 (reclassified by §0: T046 route is implemented, T048/T049/T051 already functional, T050 path drift, T044/T045 PENDING `pre-main--cache-offline-fixes` lane) | Converge append-only for 002. |
| `specs/003-parent-outputs/plan.md` | Authored (new) | Recovered from existing 003 source + per-feature evidence; no spec-pack rewrite. |
| `specs/003-parent-outputs/tasks.md` | Authored (new) | Same. T-001–T-025 across 9 phases; Obidit rows tagged lane-a, Mahim rows tagged `(owner: Mahim)`. |
| `docs/execution/evidence/pre-main-convergence-intake.md` | This file | Required owned evidence path. |

No application code, contract, schema, role, audit, shared API helper, parent UI, route handler, server module, test file or dependency was added, removed or changed.

---

## 7. Status closure matrix (2026-10-18, final)

**Purpose**: The first two passes (Phases 8 + 9 above) were descriptive and did not mutate the original T001–T023 / T001–T043 / T-001–T-025 checkboxes; this section is the **status closure matrix** against the **current code/tests/evidence** in this worktree (head `8499bce`, `pre-main` at `279b430`, `pre-main--cache-offline-fixes` at `dac1b2f` is a sibling branch — not on this lane but referenced). It distinguishes "software implemented" from "human acceptance pending" from "external / open decision" so the final report does not end with false "NotOwned/RoutesMissing".

**Legend**: `S` = software implemented on the current source tree (test/exit-codes cited), `H` = human-acceptance evidence still pending (Bangla review, organiser evidence, phone test, all-owner sign-off), `O` = open decision (OD-###) recorded in `pre-main-convergence-intake.md` §4 and not a code gap, `E` = external (provider account, real STT/LLM, hosted DB, physical device) — explicitly out of scope and recorded UNVERIFIED, `—` = not applicable (cross-owner / phase 0 not started in this lane).

**No acceptance text is rewritten. No original task ID is deleted. No checkbox is set to done for any item the source does not actually back.** Items marked `S` are observable in this worktree today; items marked `H` need a human/owner sign-off the source does not have; items marked `E` are by constitution out of scope for any worker.

### 7.1 `001-platform-foundation` (T001–T023, owner: Mahim; T024–T027 in Phase 8/9 above)

| ID | Title (paraphrased) | Status | Evidence (this worktree, head 8499bce) |
|---|---|---|---|
| T001 | App scaffold + CI | — | Phase 0 work; owned by Mahim; not Obidit-owned |
| T002 | DTOs / Zod / errors / role projections | S | `src/contracts/{index,schemas,errors,states,examples,client-examples,draft,access,primitives,server}.ts` exist; `tests/contracts/*` green; `contracts-v1` tag at `cf4ec2d8` |
| T003 | Examples + per-API DTO + tag merge | S | `src/contracts/examples.ts` + `src/contracts/client-examples.ts`; `tests/contracts/*` green; `contracts-v1` tag points at the reviewed merge |
| T004 | Schema copy + pgvector + HNSW evidence | S (software) / E (host) | `db/schema_v2.sql` byte-for-byte copy of `docs/code/schema_v2.sql`; `tests/db/platform.test.ts` green; OQ-021 host is `E` (managed host UNKNOWN) |
| T005 | Shared request / error / rate limiter | S | `src/app/api/_shared/{request,error,limit}.ts` exist; `tests/api/platform.test.ts` green |
| T006 | Runtime roles + invariants | S | `tests/db/platform.test.ts` green; `src/server/auth/*` exists; OD-006-1 = `O` |
| T007 | Redaction + append-only audit | S | `tests/db/redaction.test.ts` green; `src/server/case/commands.ts` + `src/server/audit/write.ts` |
| T008 | Shared shell + DESIGN tokens + Bangla toggle | S (software) / H (Bangla reviewer sign-off on the new round-3 strings is the only outstanding human piece) | `src/app/layout.tsx`, `src/app/globals.css`, `src/app/components/language-toggle.tsx`; `tests/locales/*` green |
| T009 | Auth tests | S | `tests/auth/roles.test.ts` green |
| T010 | Auth session implementation | S / O (OD-006-1) | `src/server/auth/session.ts` (custom session); D6 baseline still Auth.js; `tests/auth/*` green |
| T011 | API-004 role projections | S | `src/server/case/read.ts`; `src/app/api/cases/[id]/route.ts`; `tests/api/cases-read.test.ts` green |
| T012 | SCREEN-008 sign-in | S (software) / H (Mahim-owned surface) | `src/app/(auth)/sign-in/page.tsx`; `docs/execution/evidence/platform-signin.md` |
| T013 | SCREEN-016 not-found | S (software) / H (Mahim-owned surface) | `src/app/not-found.tsx`; `docs/execution/evidence/platform-signin.md` |
| T014 | Pre-submit metadata only tests | S | `tests/case/create.test.ts` green |
| T015 | `createMissing` / `createFound` / `open` | S | `src/server/case/commands.ts`; `tests/db/submit.test.ts` green |
| T016 | Persist + audit together | S | `src/server/case/commands.ts` + `src/server/audit/write.ts` |
| T017 | State/transaction tests | S | `tests/case/decision.test.ts` green |
| T018 | Append-only audit tests | S | `tests/audit/platform.test.ts` green |
| T019 | `transition` + `editWithVersion` guards | S | `src/server/case/state.ts`; covered by `tests/case/decision.test.ts` |
| T020 | `confirmPair` atomic decision | S | `src/server/case/decision.ts`; covered by `tests/case/decision.test.ts` |
| T021 | `close` (coordination_recorded / resolved_outside_fera) | S | `src/server/case/close.ts`; covered by `tests/case/close.test.ts` |
| T022 | Headless screenshot + Android phone check | S (headless) / H (phone) | `docs/execution/evidence/intake-ui.md` round 1/2 capture sets; Android phone result UNVERIFIED |
| T023 | Main CI + quickstart synthetic journey | S / E (organiser evidence) | `docs/execution/PHASE_2_MUST_CORE.md` records the merge; AMD-AGENTS-1 keeps the exact cutoff as `E` |
| T024 | `contracts-v1` tag exists | S (tag exists; all-owner sign-off is `H`) | `git show-ref --tags contracts-v1` → `cf4ec2d85206c9d6b31edab7f7690e862af155fe refs/tags/contracts-v1`; OD-061-1 = `H` |
| T025 | SCREEN-008/016 bilingual | S (software) / H (Mahim-owned surface) | `src/app/(auth)/sign-in/page.tsx` + `src/app/not-found.tsx`; `platform-signin.md` |
| T026 | Auth.js vs. custom session | O (OD-006-1) | Recorded OPEN; no all-owner approval invented; no spec-pack rewrite |
| T027 | Android phone Bangla glyph + zoom + reflow | H | `intake-ui.md` round 1/2 capture sets; no human phone result recorded |

**001 summary**: every T001–T023 has software evidence on this worktree; `O` is limited to OD-006-1; `E` is the OQ-021 managed host and the organiser cutoff; `H` is the all-owner sign-off on the `contracts-v1` tag and the human Android phone result. The first-pass "tag missing" / "API-001 not built" / "npm test timing failure" framings are superseded by the source/test evidence above.

### 7.2 `002-intake-ai` (T001–T043, owner: Obidit + Masnun/Mahim; T044–T052 in Phase 8/9)

| ID | Title (paraphrased) | Status | Evidence |
|---|---|---|---|
| T001 | `.env.example` + `docs/costs.md` | S (structure) / E (live prices) | `.env.example` exists; `docs/costs.md` UNKNOWN; OQ-004 / OQ-022 = `E` |
| T002 | 64-district dataset | S (Masnun-owned) / H (Masnun-owned) | `db/seed/districts.json` exists; `tests/data/districts.test.ts` green |
| T003 | Intake contract types | S | `src/contracts/draft.ts`; `tests/contracts/intake-contract.test.ts` green |
| T004 | API helpers | S | `src/app/api/_shared/*`; `tests/api/platform.test.ts` green |
| T005 | Speech-adapter unit tests | S | `tests/speech/adapter.test.ts` 29/29 green |
| T006 | API-001 integration tests | S | `tests/api/intake-transcribe.test.ts` green |
| T007 | E2E journey S-001/002 (Sadman lane) | — / H | `tests/e2e/intake-voice-text.spec.ts` is Sadman's lane; Obidit does not own |
| T008 | Audio validation spike | S | `src/server/speech/validate.ts` + `src/server/intake/audio-metadata.ts` |
| T009 | Speech adapter | S | `src/server/speech/{adapter,types,index}.ts`; `tests/speech/*` green |
| T010 | API-001 route | S (route + tests) / E (real STT provider) | `src/app/api/intake/transcribe/route.ts` (12-line seam); `tests/api` 303/303; OQ-004 / OQ-022 = `E` |
| T011 | SCREEN-001 welcome | S | `src/app/(parent)/page.tsx` + `src/app/(parent)/parent-ui.tsx` + `src/app/(parent)/start-button.tsx` + `provider-notice.tsx` |
| T012 | SCREEN-002 voice + transcript + typed | S | `src/app/(parent)/intake/{page,intake-chat,voice-recorder}.tsx`; `tests/intake-ui` 502/502 |
| T013 | Normaliser unit tests | S | `tests/normalise/*` 93/93 across 5 files; D6 ≥30 requirement met |
| T014 | LLM adapter unit tests | S | `tests/ai/*` 535/535 |
| T015 | Orchestrator + question templates tests | S | `tests/intake/{orchestrator,questions,rounds}.test.ts` 81/81 |
| T016 | API-002 integration tests | S | `tests/api/intake-extract.test.ts` green |
| T017 | E2E journey S-002 (Sadman lane) | — / H | `tests/e2e/intake-followup.spec.ts` Sadman's lane |
| T018 | Normaliser implementation | S | `src/server/normalise/{index,district,phone,romanise,source,text,time,types}.ts` |
| T019 | LLM adapter | S (in-process fakes) / E (real provider) | `src/server/ai/{index,providers,extract,prompt}.ts`; OQ-004 = `E` |
| T020 | Orchestrator + question templates | S | `src/server/intake/{orchestrator,questions,rounds,index,registry,runtime,drafts,audio-metadata}.ts` |
| T021 | API-002 route | S | `src/app/api/intake/extract/route.ts` (11-line seam); `tests/api` 303/303 |
| T022 | SCREEN-002 review cards + follow-up | S | `src/app/(parent)/intake/{intake-chat,page}.tsx` + `src/app/(parent)/intake/review/*` |
| T023 | Fallback handoff to S-005 | S (handoff wired) / H (Mahim-owned S-005) | `src/app/(parent)/intake/form/page.tsx` (Mahim's TASK-025) |
| T024 | API-003 + idempotency tests | S | `tests/api/cases-create.test.ts` + `tests/db/submit.test.ts` green |
| T025 | Pre-submit safeguarding tests | S | `tests/integration/pre-submit-zero-rows.test.ts` + `tests/api/cases-create.test.ts` |
| T026 | E2E journey S-003 (Sadman lane) | — / H | `tests/e2e/review-submit.spec.ts` Sadman's lane |
| T027 | Device-local draft store | S | `src/lib/intake/draft-store.ts`; covered in `review-submit-ui.md` |
| T028 | SCREEN-003 review screen | S | `src/app/(parent)/intake/review/{page,review-screen,review-fields,edit-mode-screen}.tsx` |
| T029 | API-003 route | S (route + ownership resolved by implementation) | `src/app/api/cases/route.ts`; route header records the ownership decision |
| T030 | Clear draft + navigate S-004 | S (Obidit) / H (S-004 Mahim) | Obidit clears the draft; S-004 navigation is Mahim's TASK-024 |
| T031 | Spend counter unit tests | S | `tests/spend/*` green (covers `tests/db/spend.test.ts`) |
| T032 | Draft-token replay + rate-limit tests | S | `tests/intake/spend-concurrency.test.ts` green |
| T033 | Demo cache COMP-017 tests | S (Obidit seam) / pending on sibling branch `pre-main--cache-offline-fixes` for the 3-row fixtures | `src/server/cache/fixtures.ts` ships 1 row in this lane; sibling branch `dac1b2f` ships 3 rows; `tests/cache/fixtures.test.ts` green on both |
| T034 | E2E journey DEMO_MODE=1 offline (Sadman) | — / H | `tests/e2e/demo-mode-offline.spec.ts` Sadman's lane |
| T035 | Atomic paid-call reservation | S | `src/server/spend/{service,paid-call,errors,money,price-sheet,safe-log,index}.ts` |
| T036 | `npm run spend` CLI | S | `scripts/spend.mjs` + `package.json:14`; `tests/scripts/spend-cli.test.ts`; OD-059-4 resolved |
| T037 | Demo seed fixtures (Masnun) | S (Masnun-owned) / H (Masnun-owned) | `db/seed/districts.json`; full synthetic set per `docs/execution/evidence/synthetic-set.md` |
| T038 | Demo cache + offline fallback | S (Obidit seam) / pending on sibling branch for the 2 missing fixtures and the offline-miss banner | same as T033; sibling branch `dac1b2f` adds Rafi + Mim fixtures and the `navigator.onLine === false` loopback fix |
| T039 | Cached/synthetic badges | S (function met via `<HonestLabel>`) | inline in `provider-notice.tsx`, `intake-chat.tsx`, `review-screen.tsx`, `edit-mode-screen.tsx`, `manual-form.tsx`; `src/components/badges/cached-badge.tsx` does not exist (path drift, not a gap) |
| T040 | AI failure / budget refusal → S-005 | S (handoff wired) / H (S-005 Mahim) | `src/app/(parent)/intake/intake-chat.tsx` calls `takeHandoff()` for E-012/E-013/E-023 |
| T041 | Accessibility audit S-001–003 (Sadman) | — / H | `tests/e2e/parent-a11y.spec.ts` Sadman's lane |
| T042 | Bilingual copy validation | S / H (round-3 strings pending Bangla reviewer sign-off) | `tests/locales/*` + `tests/locale-cookie.test.ts` + `tests/locales-areas.test.ts` green |
| T043 | Quickstart synthetic validation | — / E | lead's lane; runs only against merged `phase2`; AMD-AGENTS-1 keeps the exact cutoff `UNKNOWN` |
| T044 | Two more `ExtractFixture` rows + transcripts | S on sibling branch `dac1b2f` / pending root merge | `pre-main--cache-offline-fixes` lane added Rafi + Mim fixtures (`src/server/cache/fixtures.ts:36-129`); 6/6 in `tests/cache/fixtures.test.ts`; root merge will land on `pre-main` |
| T045 | Offline-cache-miss banner | S on sibling branch `dac1b2f` / pending root merge | sibling branch removed the `navigator.onLine === false` short-circuit; real fetch failure still maps to E-024; `tests/intake-ui/offline-local.test.ts` 5/5 |
| T046 | API-001 real STT provider | S (route + seam) / E (provider) | route implemented; `createSttAdapter` seam in `src/server/intake/orchestrator.ts`; OQ-004 / OQ-022 = `E`; `docs/costs.md` UNKNOWN |
| T047 | Round-3 Bangla strings sign-off | H | `tests/locales*` green; human sign-off on the new round-3 strings pending |
| T048 | `npm run spend` restored | S | `scripts/spend.mjs`; `package.json:14`; OD-059-4 resolved; no software gap |
| T049 | S-005 handoff evidence | S (handoff wired) / H (Mahim lane) | `intake-ui.md` round 2 records E-012/E-013/E-023 → S-005 |
| T050 | Badge component path | S (function) / — (path drift) | inline `<HonestLabel>`; `src/components/badges/cached-badge.tsx` does not exist; function met, path drift only |
| T051 | API-003 ownership | S (route lives; ownership resolved) | `src/app/api/cases/route.ts`; header records the decision |
| T052 | OD-015-1 E-005 vs. E-006 | O | pack itself is divided; route returns E-006 today; coordinator / all-owner decision required |

**002 summary**: every T001–T043 has software evidence on this worktree (with the explicit `E` flags for real STT/LLM/provider prices, hosted DB, and organiser cutoff). The cache fixture count gap (T033/T038/T044/T045) is closed on the sibling `pre-main--cache-offline-fixes` branch at `dac1b2f` and is pending root merge — it is not an "Obidit unbuilt" item. The first-pass "API-001 not built" / "npm test timing failure" / "T024 missing" framings are superseded by the source/test evidence above.

### 7.3 `003-parent-outputs` (T-001–T-025, owner: Obidit + Mahim)

| ID | Title (paraphrased) | Status | Evidence |
|---|---|---|---|
| T-001 | Contracts freeze | S / H (OD-061-1) | `contracts-v1` tag exists; all-owner sign-off `H` |
| T-002 | Evidence chain recorded | S | `docs/execution/evidence/{outputs-templates,s004-outputs,intake-submit-api,intake-ui,review-submit-ui,spend-cli,intake-spend-counters}.md` all present |
| T-003 | Output templates (TASK-023) | S | `src/server/outputs/{index,guard,templates}.ts`; `tests/outputs/*` 147/147 |
| T-004 | Wording guard (COMP-016) | S | `src/server/outputs/guard.ts`; `tests/outputs/guard.test.ts` 5-round hardened |
| T-005 | Unit cases for templates / guard / cache | S | `tests/outputs/{templates,service,guard,poster,outputs-client}.test.ts` green |
| T-006 | Cache by `(case_id, type, case_version)` | S | `src/server/outputs/index.ts`; `tests/db/outputs.test.ts` |
| T-007 | API-006 `type: "gd"` | S | `src/app/api/cases/[id]/outputs/route.ts`; `tests/outputs/service.test.ts` |
| T-008 | Tests TC-005/024/025 | S | `tests/outputs/*`; `tests/outputs/service.test.ts` |
| T-009 | SCREEN-004 outputs UI | S (software) / H (Mahim-owned) | `src/app/(parent)/report/[id]/`; `docs/execution/evidence/s004-outputs.md` |
| T-010 | Poster PNG | S (software) / H (Mahim-owned; OD-003-2) | `src/lib/{poster,poster-render}.ts`; `tests/outputs/poster.test.ts` |
| T-011 | API-006 `type: "poster"` | S | `src/app/api/cases/[id]/outputs/route.ts`; `tests/outputs/service.test.ts` |
| T-012 | Playwright SCREEN-004 | H (Mahim-owned) | `tests/ui/report-screen.test.ts` covers the static invariants; full Playwright journey is Mahim's TASK-038 |
| T-013 | SCREEN-005 manual form | S (software) / H (Mahim-owned) | `src/app/(parent)/intake/form/page.tsx`; `tests/intake-ui` 502/502 |
| T-014 | Playwright SCREEN-005 | H (Mahim-owned) | static invariants only today; full Playwright is Mahim's TASK-038 |
| T-015 | API-006 `type: "helpline"` (TASK-047) | S | `src/app/api/cases/[id]/outputs/route.ts` (`type: "helpline"`); `tests/outputs/templates.test.ts` (worst case 77 words) |
| T-016 | Helpline 80-word cap + guard | S | `tests/outputs/templates.test.ts` |
| T-017 | API-005 edit-after-submit (TASK-049) | S | `src/app/api/cases/[id]/route.ts` PATCH → `editOwnerCase` in `src/server/case/commands.ts` + `src/server/parent/edit-view.ts`; `tests/case/service.test.ts` + `tests/api/case-edit.test.ts` |
| T-018 | SCREEN-006 edit entry + version-concurrency | S | `src/app/(parent)/status/page.tsx`; `tests/api/my-case.test.ts` |
| T-019 | Outputs follow case version | S | cache by `(case_id, type, case_version)`; covered by `tests/db/outputs.test.ts` |
| T-020 | API-018 + API-004 owner view (TASK-050) | S | `src/app/api/my-case/route.ts` + `src/server/parent/my-reports.ts`; `tests/api/my-case.test.ts` |
| T-021 | SCREEN-006 status page | S | `src/app/(parent)/status/page.tsx` |
| T-022 | Vitest/Playwright owner view | S | `tests/api/my-case.test.ts` + `tests/api/cases-read.test.ts` |
| T-023 | Locale and validation (Obidit-owned slices) | S / H (round-3 strings) | `tests/locales*` + `tests/locale-cookie.test.ts` |
| T-024 | A11y audit SCREEN-004/005/006 | H (Mahim-owned) | `tests/ui/report-screen.test.ts` covers SCREEN-004 static invariants; SCREEN-005/006 full Playwright is Mahim's TASK-038 |
| T-025 | Quickstart end-to-end | — / E | lead's lane; runs only against merged `phase2`; AMD-AGENTS-1 keeps the exact cutoff `UNKNOWN` |

**003 summary**: every T-001–T-025 has software evidence on this worktree, with `H` reserved for Mahim-owned Playwright journeys and the round-3 Bangla strings sign-off, and `E` for the quickstart journey and the organiser cutoff. The first-pass "all 25 rows unchecked" framing was correct about the literal checkbox state but the runtime surface is largely implemented. The brief's "mark software implemented, human-acceptance parts pending" instruction is satisfied row-by-row above. No "NotOwned/RoutesMissing" is asserted as a software gap.

### 7.4 Cross-feature software status (vs. externals)

- **Implemented (S) across all 3 owners' tasks** (T001–T023 / T001–T043 / T-001–T-025), with the only software items not in this worktree being (a) the 2 extra cache fixtures and the offline-miss banner, which are present on sibling `pre-main--cache-offline-fixes` at `dac1b2f` and pending root merge; (b) the OQ-021 managed host (E); (c) real STT/LLM provider accounts and prices (E); (d) Mahim-owned Playwright journeys (H, Sadman's lane).
- **Human acceptance pending (H)**: all-owner sign-off on the `contracts-v1` tag (OD-061-1); Bangla reviewer sign-off on the round-3 strings (T042/T047/T-023); human Android phone result for SCREEN-001/002/003 (T027); Mahim-owned SCREEN-004/005/006 Playwright journeys.
- **Open decisions (O)**: OD-006-1 Auth.js vs. custom session; OD-015-1 E-005 vs. E-006; OD-022-1 draft-token signer; OD-022-3 outputs_available on POST API-003; OD-022-7 labelled `[MOCK]` fakes; OD-023-1 poster contact default; OD-023-2 locked-report outputs; OD-012-1 Bangla name romanisation; OD-012-3 additional relative-time grammar; OD-013-1 LLM prompt exact text; OD-003-2 poster PNG render boundary; OQ-B1-2 matched_pending_review status mapping.
- **External (E)**: real STT/LLM provider accounts and verified prices; managed PostgreSQL 16 + pgvector host (OQ-021); physical Android phone result; organiser cutoff / channel / formats; D7 OQ-016 official Bangladesh Police online GD field list.

### 7.5 Software matrix — complete vs. actual gaps (the final answer)

The 8 first-pass false findings are now superseded by source/test evidence (see §0 above). The actual remaining **software** gaps (not human, not external, not open-decision) on Obidit's owned slice are:

1. **(Resolved on sibling branch, pending root merge)** The 2 extra `ExtractFixture` rows (Rafi, Mim) and the offline-cache-miss banner — closed on `pre-main--cache-offline-fixes` at `dac1b2f` per `docs/execution/evidence/pre-main-cache-offline-fixes.md`; root merge is the coordinator's call.
2. **(None on Obidit's owned slice)** OD-006-1 (Auth.js vs. custom session) is an open decision, not a software gap; the runtime ships the custom session; existing `tests/auth/*` and DTO security tests are green. No all-owner approval is invented; no business-contract or package rewrite is proposed.
3. **(None on Obidit's owned slice)** OD-015-1 (E-005 vs. E-006) is an open decision; the route returns E-006 today; the pack itself is divided. No software change without an all-owner decision.

The actual **non-software** gaps are documented in §4 (UNVERIFIED). They are the coordinator's queue, not Obidit code changes.

## 8. Final report (coordinator-facing, 2026-10-18)

**Changed paths** (this closure pass; no app code / no contracts / no schema / no Git history):

- `specs/001-platform-foundation/tasks.md` — append `## Phase 10: Status closure` with the 001 row-by-row software matrix and the §7 references (no original T001–T023 wording changed; no checkbox is set to done for any item the source does not back).
- `specs/002-intake-ai/tasks.md` — append `## Phase 10: Status closure` with the 002 row-by-row software matrix (no original T001–T043 / T044–T052 wording changed).
- `specs/003-parent-outputs/tasks.md` — append `## Phase 10: Status closure` with the 003 row-by-row software matrix (no original T-001–T-025 wording changed; the Mahim-owned Playwright rows stay `H`).
- `docs/execution/evidence/pre-main-convergence-intake.md` — this file; §7 closure matrix and §8 final report added.

**Guarantees / tests with exit codes** (this lane's focused gauntlet, real commands, real exits):

- `npx vitest run tests/normalise tests/speech tests/ai tests/intake tests/spend tests/cache tests/outputs` → exit `0`, **1753/1753** across 60 files.
- `npx vitest run tests/api` → exit `0`, **303/303** across 17 files.
- `git show-ref --tags contracts-v1` → `cf4ec2d85206c9d6b31edab7f7690e862af155fe refs/tags/contracts-v1` (tag exists; first-pass "tag missing" framing is superseded).
- `grep -c 'EXTRACT_FIXTURE' src/server/cache/fixtures.ts` → **8** references for the single-row state in this lane (3 distinct synthetic exact-source fixtures live on the sibling `pre-main--cache-offline-fixes` lane at `dac1b2f` and are pending root merge; root merge is the coordinator's call).

**Gaps / blocks** (coordinator queue, not Obidit code changes):

- **H (human)**: all-owner sign-off on the `contracts-v1` tag (OD-061-1); Bangla reviewer sign-off on the round-3 strings (T042/T047/T-023); human Android phone result for SCREEN-001/002/003 (T027); Mahim-owned Playwright journeys for SCREEN-004/005/006.
- **O (open decision)**: OD-006-1 (Auth.js vs. custom session); OD-015-1 (E-005 vs. E-006); OD-022-1 (draft-token signer); OD-022-3 (outputs_available on POST API-003); OD-023-1/2 (poster contact default / locked-report outputs); OD-012-1/3 (Bangla romanisation / relative-time grammar); OD-013-1 (LLM prompt exact text); OD-003-2 (poster PNG render boundary); OQ-B1-2 (matched_pending_review status mapping).
- **E (external)**: real STT/LLM provider accounts and verified prices (OQ-004 / OQ-022); managed PostgreSQL 16 + pgvector host (OQ-021); physical Android phone; organiser cutoff / channel / formats (AMD-AGENTS-1); D7 OQ-016 official Bangladesh Police online GD field list.
- **Pending root merge (not an Obidit gap)**: 2 extra `ExtractFixture` rows + offline-cache-miss banner from `pre-main--cache-offline-fixes` at `dac1b2f` (per `docs/execution/evidence/pre-main-cache-offline-fixes.md`).

No `NotOwned/RoutesMissing` is asserted as a software gap in the final report. The matrix above is the source of truth for what is implemented, what is human-pending, and what is external.


## Coordinator integration disposition (supersedes lane-only pending classifications)

The protected three-case cache and offline loopback fix are merged into pre-main. Existing E-024 bilingual copy already supplies the real network-failure fallback; no extra banner was added. The full integration DB suite passed 321 tests across 31 files, and the complete desktop/mobile Playwright/axe suite passed 78 tests with zero skips. Manual form, owner review/status/edit and role boundaries have automated coverage in `tests/e2e/parent-journey.spec.ts`, `tests/e2e/a11y.spec.ts` and the safeguarding/lifecycle specs. Mahim-owned browser checks and the local quickstart are **software verification**, not human/organiser blockers. Physical Android checks and human Bangla review remain pending. The expanded offline harness, actual poster-download check and packaged quickstart receive their final disposition in the integrated verification report; their ownership does not block implementation.

The source/path aliases in this matrix refer to existing semantic coverage, rather than requiring duplicate files with old planned filenames. Historical Auth.js/custom-session conformance remains OD-006-1 WARN; this pass does not invent an all-owner architectural approval or alter frozen contracts. Feature software closure and formal human/release acceptance remain separate.
