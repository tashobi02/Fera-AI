# Phase 0 — Bootstrap · Gate G0

**Window:** Mon 12 Oct 2026, now → 18:00 (Asia/Dhaka) · **Gate:** G0 · **Plan:** [EXECUTION_PLAN.md](EXECUTION_PLAN.md#phase-0--bootstrap-mon-12-oct-now--1800--gate-g0) · **Next:** [Phase 1](PHASE_1_SPECS_CONTRACTS.md)
**Phase status:** `doing` — G0 is overdue (due 18:00); see "Known state".
**Last updated:** 2026-10-13 · tasks distributed among Obidit, Masnun and Mahim; lead = Mahim
**Team:** **Obidit** — intake, AI, outputs · **Masnun** — data, matching, officer workflow, dashboard, evaluation · **Mahim** — lead; platform, integration, release (named "Sadman" in AGENTS.md and the spec pack; D6 owner code S). Tasks follow [EXECUTION_PLAN.md](EXECUTION_PLAN.md). The lead approves cuts and reschedules, records organiser and mentor decisions, and runs `fera-gate`.

---

## How to work this file (Claude Code · Codex · Antigravity)

This is a living tracker. Every agent working on a task in this phase updates it **in the same branch as the work**.

1. Read [AGENTS.md](../../AGENTS.md), then this file, then the spec-pack sections named in your row. All times are Asia/Dhaka.
2. Pick a `todo` row in your owner's lane whose dependencies are `done`. Set it to `doing` and fill in the lane and tool.
3. Work in a lane worktree (`scripts/agents/new-lane.sh <feature> <lane>`) and stay inside the owner's paths ([ownership map](../../AGENTS.md#repo-layout-and-ownership)).
4. When you open the PR, set the row to `review` with the PR link. After the merge, set it to `done` and fill in **Evidence**: the command and its result, a URL or a file path. A task without evidence is not done.
5. If you are stuck, set the row to `blocked`, say what blocks it in Evidence, and add a log line.
6. Edit only the rows in **your own person table** and **your log section**, so parallel lanes don't conflict. Never tick a gate box yourself. Gate boxes are ticked from the `fera-gate` report in [docs/gates/](../gates/).

**Status values:** `todo` · `doing` · `review` · `done` · `blocked` · `cut`. Use `cut` only with approval from the lead (Mahim) and in the [D6 §11](../spec/D6_Implementation_Plan_V2.md#11-recommendation) cut order. Never cut review-before-submit, officer confirm, referral, audit or redaction.

| Action | Claude Code | Codex | Antigravity / any other agent |
|---|---|---|---|
| Spec-kit stage | `/speckit-<stage>` | `$speckit-<stage>` | Open `.agents/skills/speckit-<stage>/SKILL.md` and follow it step by step |
| Skill (`fera-review`, `fera-gate`, `verification-loop`, `impeccable`, …) | `/<skill>` | `$<skill>` | Read `.agents/skills/<skill>/SKILL.md` and follow it |
| Reviewer (`fera-safeguarding-reviewer`, `database-reviewer`, …) | Subagent from `.claude/agents/<name>.md` | Role from `.codex/agents/<name>.toml` | Start a separate read-only agent and give it `.claude/agents/<name>.md` as its brief |

> The agent kit is committed on `main` (commit 648a60e and the commits after it), so new lane worktrees contain it. The constitution and `fera-*` files are drafts until the three owners ratify them.

---

## Known state (checked 12 Oct 19:15)
- Repo: README, a minimal `package.json` (every script prints `not implemented`), `tsconfig.json`, spec pack in `docs/spec/`, companions in `docs/code/`, prototype in `demo/`, helper scripts in `scripts/agents/`.
- Missing locally: Next.js app, `src/`, `db/`, `specs/`, CI (`.github/`) and lockfile.
- Agent kit and guidance are committed on `main` as of 13 Oct (234 kit files tracked). Ratification and `bootstrap.sh` on each laptop are still UNKNOWN; see KIT and AMD-0-1.
- Schema exists only as `docs/code/schema_v2.sql` (must stay byte-identical; copy to `db/schema_v2.sql`, do not edit).

## Who does what

| Person | Tasks this phase | D6 hours |
|---|---|---|
| **Obidit** | TASK-003 provider keys and prices → TASK-005 phone STT spike | 3 |
| **Masnun** | TASK-004 embedding spike → TASK-009 64 districts | 6 |
| **Mahim** (lead) | KIT → TASK-001 repo, CI, preview → TASK-002 DB host and schema | 5 (+1 KIT, outside D6) |

### Lead duties — Mahim
- Chase the decisions below until each has an owner's written answer, and record the organiser cutoff/extension evidence (AMD-PLAN-1).
- Run `fera-gate G0` at the gate time and link the report; nobody else ticks gate boxes.
- Lead duties carry no D6 hours; report them at stand-ups if they cost build time.

## Tasks — Obidit
| ID | Task | Lane · tool | Deps | h | Done when (D6) | Status | PR / commit | Evidence |
|---|---|---|---|---|---|---|---|---|
| TASK-003 | Provider keys, `.env.example`, real prices in `docs/costs.md` (OQ-004, OQ-022) | Codex | — | 1 | Both LLMs and STT answer a test call | `todo` | | |
| TASK-005 | Spike: Android MediaRecorder → STT (A-030) | Codex | TASK-003 | 2 | 3 phone recordings transcribed | `todo` | | |

## Tasks — Masnun
| ID | Task | Lane · tool | Deps | h | Done when (D6) | Status | PR / commit | Evidence |
|---|---|---|---|---|---|---|---|---|
| TASK-004 | Spike: local embedding model on Vercel (OQ-023, RISK-015) | Codex | TASK-001 | 3 | Report: cold start, size; decision local vs API | `todo` | | |
| TASK-009 | District data: 64 rows bn/en/centroids + neighbours | Codex | TASK-002 | 3 | `npm run seed` loads 64 districts | `review` | branch `phase2--masnun-districts` (PR pending) | Unit/lint/typecheck/build green; **`npm run seed` and `test:db` not run (no Docker on this machine)**; data is AI-compiled and UNVERIFIED (DEP-004/A-019 check owner UNKNOWN). See [evidence](evidence/data-districts.md). |

## Tasks — Mahim (lead)
| ID | Task | Lane · tool | Deps | h | Done when (D6) | Status | PR / commit | Evidence |
|---|---|---|---|---|---|---|---|---|
| KIT | Commit agent kit: `CLAUDE.md`, `AGENTS.md`, `CODEX.md`, `.claude/`, `.codex/`, `.agents/`, `.specify/` (constitution), `docs/agents/`, `docs/execution/` | any | — | 1 | `bootstrap.sh` runs; `/agents` lists `fera-safeguarding-reviewer`; `$speckit-*` visible in Codex | `review` | 648a60e | Committed on `main` (234 kit files tracked, checked 13 Oct). Assembled and validated 12 Oct: 18 agents, 16 Codex roles, 28 skills per tool, spec-kit 1.1.4.dev0 @0443760. Pending: owners ratify constitution + `fera-*`; `bootstrap.sh` on each laptop |
| TASK-001 | Repo: Next.js App Router, TS strict, Tailwind, ESLint, CI (lint, typecheck, test), preview deploy | Claude Code | — | 3 | CI green on `main`; preview deploy URL | `review` | branch `phase1--mahim-task001` | Next 16.4.0 + React 19.3 + Tailwind 4 + ESLint 9 + Vitest 5; `tsconfig` on `bundler`, still covers `docs/code/fera_types_v2.ts`; stub script names kept. Local 14 Oct from clean `npm ci`: `lint`/`typecheck`/`test` (34 passed: spec-pack hashes vs `docs/MANIFEST.json`, `docs/spec`=`docs/markdown`, locales)/`build` all exit 0. Manual Vercel CLI deploys under Mahim's account (project `fera-ai`, no env vars set): preview https://fera-abcticicm-deatraxs-projects.vercel.app (Ready, reviewed head). An earlier first deploy went to production (https://fera-1jqfsupq2-deatraxs-projects.vercel.app); production must be redeployed from `main` after merge. Placeholder page is `noindex`. Pending: CI green on `main` (merge is a human decision); `npm audit --omit=dev` 0, dev-only `braces` advisory via `eslint-config-next`. |
| TASK-002 | Pick DB host (OQ-021); apply `schema_v2.sql` locally (Docker) and on host | Claude Code + `database-reviewer` | TASK-001 | 2 | HNSW index created on host and locally | `review` | branch `phase1--mahim-db` | **Local done** (14 Oct): `npm run db:up` + `npm run db:reset` on Docker PG 16.15 + pgvector 0.8.1 (`db/docker/Dockerfile`), HNSW `cases_embedding_hnsw_idx`, 17 tables, schema SHA-256 3fe345b1…bf67 = companion; reset is local-only (host + query-param + PG* env guard, 19 tests). **Host NOT done**: Obidit's Supabase project; applied state and version UNKNOWN; needs owner go-ahead. Evidence: `docs/execution/evidence/platform-schema.md`. TASK-001 (PR #1) still unmerged. |

Cross-person waits: Masnun's TASK-004 needs Mahim's TASK-001, and TASK-009 needs TASK-002. Masnun can draft the spike script and district file meanwhile, but marks them `done` only once those dependencies are `done`.

TASK-001 gotchas (found in the pre-execution audit):
- `create-next-app` refuses a directory that already has `package.json`/`tsconfig.json`. Scaffold in a temp directory and merge in. Keep the existing `package.json` script names (D6 TC-020 and `fera-gate` use them) and keep `docs/code/fera_types_v2.ts` covered by `npm run typecheck`.
- The current `tsconfig.json` uses `moduleResolution: "node"`. Replace it with Next's `bundler` config.
- `.env.example` now lists every D2B §15.1 name. TASK-003 fills `.env.local` only.

Rules for this phase: no app feature code yet; spike scripts only. Never paste provider keys into an agent prompt. Keys go in `.env.local` only.

## Decisions to close (they block lanes)
| Question | Owner | Blocks | Decision | Recorded in | Status |
|---|---|---|---|---|---|
| Managed Postgres host (OQ-021) | Mahim | TASK-002 → everything | Decided by Mahim (14 Oct): Supabase (managed) + Supabase CLI local PG16 (Obidit's unmerged `origin/phase0-local-tooling--lane-b` @1960bdc). Pending D2 Part A OQ-021 condition: host must pass `CREATE EXTENSION vector` (pgvector ≥ 0.8.1, A-034) and HNSW index creation in TASK-002; if it fails, the decision reopens | Mahim log, 14 Oct | `review` |
| Default LLM provider, keys, prices, data terms (OQ-004, OQ-013, OQ-022) | Obidit | TASK-013 | | `docs/costs.md` | `todo` |
| Local embeddings on Vercel or API (OQ-023) | Masnun | TASK-016 | | TASK-004 report | `todo` |
| Voice and poster in Round 2 (OQ-001) | Obidit | — | Team plan: yes, full scope; organiser agreement UNKNOWN (AMD-0-2) | EXECUTION_PLAN | `review` |
| Organiser cutoff, channel, formats and extension (AMD-PLAN-1) | Mahim (lead) | G5 timing | UNKNOWN | | `todo` |

## G0 exit checklist
Tick only from the gate report (`fera-gate`), with evidence linked.
- [ ] CI green on `main`
- [ ] Agent kit committed (`CLAUDE.md`, `AGENTS.md`, `.claude/`, `.codex/`, `.agents/`, `.specify/`)
- [ ] Schema applied locally and on the host, with the HNSW index
- [ ] Both LLM providers and STT answer a test call
- [ ] Embedding decision written
- [ ] 3 phone recordings transcribed
- [ ] 64 districts load

**Gate report:** _(link `docs/gates/G0-*.md`)_ · **Result:** _pending_

## Log
Format: `- YYYY-MM-DD HH:MM · <tool> · <lane> · <ID> <status change or note>`

### Obidit
- 2026-10-12 19:15 · Claude Code · — · created phase files; agent kit found missing (KIT)
- 2026-10-12 20:10 · Claude Code · — · KIT → review: replaced ECC self-config with pinned Fera kit; drafted constitution, fera-safeguarding-reviewer, fera-review, fera-gate, settings.json (backup ../fera-ecc-kit-backup-2026-10-12.tar.gz)
- 2026-10-13 · Claude Code · — · tasks split into per-person tables (Mahim lead, Obidit, Masnun); KIT evidence updated: committed on `main`
### Masnun
- 2026-10-15 23:07 · Claude Code · masnun-districts · TASK-009 `todo` → `review`; 64 districts + 280 directed edges and `npm run seed` implemented, fera-review PASS; DB run pending Docker, data unverified
### Mahim (lead)
- 2026-10-14 15:57 · Claude Code · mahim-task001 · OQ-021 decided by Mahim: Supabase; status `review` until TASK-002 proves pgvector + HNSW on the host
- 2026-10-14 15:57 · Claude Code · mahim-task001 · TASK-001 `todo` → `review`; local checks green, manual Vercel deploy Ready; awaiting PR CI and human merge
- 2026-10-14 19:20 · Claude Code · mahim-db · TASK-002 `todo` → `review`; local PG16 + pgvector + HNSW evidenced; hosted Supabase apply pending owner go-ahead

## Audit amendments (2026-10-12)

### AMD-0-1 — Entry and observed state
**Gap:** no testable entry criterion; “Missing: … the whole agent kit” contradicts KIT's later evidence.
**Change:** entry G0 requires the local inventory, cleanly identified task owners (Mahim = lead and D6 owner S/Sadman, Obidit = O, Masnun = M), unresolved DEP-001–004/008 decisions and protected-companion hash checks recorded. Kit files are committed on `main` as of 13 Oct; ratification, bootstrap on each laptop and runtime discovery remain UNKNOWN. Do not run bootstrap during this audit or infer its success.
**Old text corrected:** “and the whole agent kit (`.claude/`, `.agents/`, `.codex/`, `.specify/` incl. the constitution) although `THIRD_PARTY_NOTICES.md` lists it as vendored.”
**Source:** local git/file inventory 12 Oct; TEAM_HANDOVER_V2 §§5–7; G0/KIT.

### AMD-0-2 — G0 evidence mapping and unknown decisions
**Gap:** G0 boxes lack acceptance IDs and OQ-001 is marked settled by the plan alone.
**Change:** map repo/CI to TASK-001 + NFR-014; fresh local/host DB and HNSW to TASK-002 + TC-062/DEP-008; two LLM calls to TASK-003/DEP-002; embedding report to TASK-004/DEP-003 + TC-059; three phone transcriptions to TASK-005/DEP-001 + TC-061; district count=64 to TASK-009/DEP-004. Every command remains planned until implemented and actually run. KIT needs the existing role/skill inventory and named-owner ratification evidence. The team plan includes voice/poster (D1 Must/FR-002/009); independent organiser agreement closing OQ-001 is UNKNOWN. Source deadlines in D1 DEP register are past targets, not evidence of delivery.
**Source:** D1 §§8,15; D2B §15; D6 TASK-001–009/TC-062; handover §§6–7.
