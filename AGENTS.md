# AGENTS.md — Fera

Shared instructions for every coding agent on this repo (Claude Code imports this file from `CLAUDE.md`; Codex reads it directly). Keep it short; details live in `docs/`.

## What we are building
Fera: Bangla-first case coordination for missing and found children in Bangladesh. A parent reports by voice or text → reviews extracted fields → submits; staff log found children; a **verified officer** compares ranked candidates and records the decision; the case closes and district counts update. **Synthetic-data prototype** — no real child data, no alerts, no physical return, no CID/police integration.

Dates (Asia/Dhaka): Round 2 working baseline **Wed 14 Oct 2026, 22:00**, internal send target 21:00. The user reports organiser extension flexibility; new cutoff is **UNKNOWN**. Handover §10 leaves exact time/channel/formats pending organiser evidence. Planned deliverables: repo, 5–8 slides, 1–2 min video, Drive folder and selection-email reply. Finale **24 Oct**. Plan: `docs/execution/EXECUTION_PLAN.md`; live per-phase status: `docs/execution/PHASE_*.md` (update your rows in the same branch as the work).

## Sources of truth (in priority order)
1. `.specify/memory/constitution.md` — non-negotiable principles.
2. `docs/spec/` — V2 spec pack: `D1_PRD_V2` (FR/BR/TC), `D2_TRD_PartA/B_V2` (stack, API, `schema_v2.sql`), `D3_App_Flow_V2` (screens S-001–S-016, errors E-001–E-024), `D4_Design_Brief_V2` (UX rules), `D5_Background_Schema_V2` (BR-012–026), `D6_Implementation_Plan_V2` (TASK-001–064), `D7_Closing_Pack_V2` (demo script), `TEAM_HANDOVER_V2`.
3. `specs/NNN-*/` — spec-kit feature specs, plans and tasks generated from the above.
4. `DESIGN.md` (visual system: Cockpit & Paper) and `PRODUCT.md` (product truth for the impeccable skill). **Exception, decided 12 Oct:** for visual tokens (type families, palette, radii, spacing), `DESIGN.md` wins over D4 §6 and `docs/code/tokens_v2.css`. Its "Fera overrides" section carries D4's Bangla, parent-screen and status rules, and D4 behaviour rules still win over any style.
5. Clickable prototype of every screen: https://claude.ai/artifact/NiRLbAAYfY8eyPSpWMZmH4 — UI reference, not code to copy wholesale.

If the spec pack and a spec-kit artifact disagree, the spec pack wins; fix the artifact.

`docs/spec/` is a byte-identical working copy of `docs/markdown/`, whose hashes are in `docs/MANIFEST.json`. Don't edit either in a feature PR. A spec change updates both copies and the manifest in one PR.

## Non-negotiables (summary — full list in the constitution)
- **Review before submit.** No missing-report payload is server-stored, matched, shown to another party or exported before the reporter confirms. Device-local review is required; providers may process synthetic audio/text after notice. Pre-submit server state is metadata only.
- **AI retrieves and ranks; people decide.** Never auto-confirm, auto-close or guess fields. Unknown stays unknown. Every extracted value carries a source span.
- **Role-scoped DTOs.** Candidates and the other party's data go only to *verified* officers. Every route: Zod input → role guard → per-role DTO allowlist → error envelope. Never return raw rows.
- **One-transaction confirm** (sorted-UUID locks, version recheck, void competitors, both states, referral record, audit).
- **Append-only audit** for decisions, state changes, edits, redactions, denied access. No child payload in logs.
- **Honest copy.** "Similarity", not probability. "Referral recorded (simulation)", not delivered. No alert/runaway/rescue/legal-compliance claims. Synthetic, `[MOCK]` and cached labels always visible. Metrics = measured with denominators, or "not measured".
- **Synthetic only.** No photos, faces, ID documents or exact coordinates.

## Stack
Next.js App Router + TypeScript strict + Tailwind · Zod · PostgreSQL 16 + pgvector via `pg` and hand-written SQL (`db/schema_v2.sql` is the single source; no ORM) · Auth.js credentials (parents have no account; anonymous cookie) · Whisper STT · provider-agnostic LLM adapter with fallback · Transformers.js `multilingual-e5-small` (384-d) · Leaflet optional, bundled district outlines · Vitest · Playwright + axe · pino with redaction · Vercel (Round 2) + laptop stack with `DEMO_MODE=1` (finale).

## Repo layout and ownership
One writer per area. Touching another owner's area = small PR tagged for them.

| Path | Owner | Contents |
|---|---|---|
| `src/contracts/` | Sadman (**frozen after Phase 1; PR + all-owner review to change**) | DTOs, Zod schemas, state enums, error codes, role projections |
| `db/schema_v2.sql`, `src/server/{db,auth,case,audit,admin}/` | Sadman | schema, auth, case service, state guard, audit, redaction |
| `src/server/{intake,ai,speech,normalise,outputs,spend,cache}/` | Obidit | normaliser, LLM/STT adapters, orchestrator, wording guard, templates, spend, demo cache |
| `src/server/{matching,embeddings,duplicates,dashboard}/`, `db/seed/`, `data/`, `eval/` | Masnun | districts, synthetic set, manifest, matcher, dupes, counts, evaluation |
| `src/app/(parent)/` S-001–S-006 | Obidit (S-004/S-005 Sadman) | parent screens |
| `src/app/(desk)/staff/` S-007, S-015 | Masnun | found-child log, disaster mode |
| `src/app/(desk)/officer/{queue,match,map,duplicates}` S-009–S-011, S-014 | Masnun | officer review and map |
| `src/app/(desk)/officer/case/`, `(desk)/admin/`, `(auth)/` S-008, S-012, S-013, S-016 | Sadman | case detail/close, admin, sign-in, not-found |
| `src/app/api/**` | owner of the matching server module | route handlers |
| `tests/e2e/`, CI, deploy | Sadman | Playwright, GitHub Actions, Vercel |

Adjust paths once if the existing repo differs, then keep this table current.

## Workflow (spec-kit + parallel lanes)
1. One spec-kit feature per area: `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze`. Codex uses `$speckit-<command>`. Prompts: `docs/agents/SPECKIT_PROMPTS.md`.
2. Build in **git worktrees**, one lane per agent session: `scripts/agents/new-lane.sh 002-intake-ai obidit-normaliser`. Never run two writing agents in the same worktree.
3. `/speckit-implement` (or plain prompts citing TASK/FR IDs) → `/speckit-converge` until Converged.
4. Before every PR: run the `fera-review` skill (parallel reviewers, see below) and `verification-loop`. CI must be green.
5. Merge to `main` small and often (at least every 2–3 h). Rebase lanes on `main` after each merge.

Branches: `NNN-feature` (spec-kit) and lane branches `NNN-feature--<owner>-<slug>`. Commits: Conventional Commits with IDs, e.g. `feat(matching): hard filters BR-017 [TASK-017]`.

## Which agent for what
| Need | Claude Code subagent | Codex role |
|---|---|---|
| Blueprint for a task before coding | `code-architect` | `code_architect` |
| Tests first / coverage | `tdd-guide` | `tdd_guide` |
| Any TS change | `typescript-reviewer` | `typescript_reviewer` |
| Any `.tsx` / App Router change | `react-reviewer` | `react_reviewer` |
| SQL, schema, pgvector, transactions | `database-reviewer` | `database_reviewer` |
| Auth, input, secrets, API endpoints | `security-reviewer` | `security_reviewer` |
| Bangla text, normaliser, fonts, copy | `bengali-reviewer` | `bengali_reviewer` |
| UI accessibility (WCAG 2.2 AA) | `a11y-architect` | `a11y_architect` |
| Error paths, fallbacks, retries | `silent-failure-hunter` | `silent_failure_hunter` |
| Matcher evaluation, metrics, manifest | `mle-reviewer` | `mle_reviewer` |
| Playwright journeys | `e2e-runner` | `e2e_runner` |
| Build / type / hydration errors | `react-build-resolver` | `react_build_resolver` |
| README, docs, codemaps | `doc-updater` | `doc_updater` |
| **Every PR (gate)** | `fera-safeguarding-reviewer` | `fera_safeguarding_reviewer` |
| UI design craft / polish / audit | skill `impeccable` + `impeccable-finish-reviewer` | skill `impeccable` + `impeccable_finish_reviewer` |

Skills available to both tools (`.claude/skills/`, `.agents/skills/`): spec-kit (`speckit-*`), `impeccable`, `tdd-workflow`, `verification-loop`, `e2e-testing`, `security-review`, `postgres-patterns`, `database-migrations`, `api-design`, `react-patterns`, `nextjs-turbopack`, `frontend-a11y`, `bengali-nlp`, `cost-aware-llm-pipeline`, `eval-harness`, `parallel-execution-optimizer`, `team-agent-orchestration`, `fera-review`, `fera-gate`.

## Commands (planned; currently fail-fast skeleton stubs)
`npm run dev` · `lint` · `typecheck` · `test` · `test:e2e` · `db:reset` (fresh DB + `schema_v2.sql`) · `model:fetch` · `seed -- --set demo|full` · `reembed` · `eval:all` (or `eval:extract|match|dedupe|wer|time|audit`; dev split until the held-out run) · `spend` · `smoke` (prod). Names are planned interfaces from the phase plans and D6 TC-020; none establishes a working application check.

## Definition of done (per task)
Linked TASK/FR/TC IDs in the PR · unit tests for logic, Playwright for journeys · `typecheck`, `lint`, `test` green · `fera-safeguarding-reviewer` = PASS · Bangla + English strings for every new state (loading/empty/error) · screen matches D3 states and `DESIGN.md` tokens · no new dependency without a note in the PR. Test targets are D6's (≥30 normaliser tests, ≥60 unit tests overall); the 80 % coverage default in vendored skills doesn't apply.

## Language and copy
Parent screens default to Bangla with an English toggle (FR-033). Desk screens bilingual. Numbers in parent UI use Bangla numerals in Bangla mode. Use the exact strings from D3/D4 where they exist; new strings go in the locale files, never inline.

## Audit amendments (2026-10-12)

- **AMD-AGENTS-1 — Gap:** unsupported deadline certainty. **Change:** old “Round 2 submission **Wed 14 Oct 2026, 22:00**” is now a working baseline; exact organiser cutoff/channel/formats and extension date are UNKNOWN. User reports extension flexibility; verify organiser evidence without discarding the 14 Oct planning target. **Source:** TEAM_HANDOVER_V2 §10; user 12 Oct clarification.
- **AMD-AGENTS-2 — Gap:** missing evidence rule and overly broad pre-submit visibility wording. **Change:** never invent facts, dates, hours, owners, accounts, figures, contacts, interviews, approvals or completion; write **UNKNOWN** and list an open decision. Provider notice permits synthetic processing before confirmation; device-local review is required and server draft state remains metadata only. Old “stored, matched, shown or exported” now says server-stored / shown to another party. No safeguarding rule is relaxed. **Source:** handover §§4,7; BR-004/023.
- **AMD-AGENTS-3 — Gap:** nonexistent `build_resolver` role and implicit existing runtime paths/commands. **Change:** use existing `react_build_resolver`; all ownership-table runtime paths and `specs/NNN-*/` are **planned** until scaffolded. `db/schema_v2.sql` is the planned runtime copy of `docs/code/schema_v2.sql`. All npm commands are planned; stubs fail with exit 1, not successful checks. D2 references expand to existing `docs/spec/D2_TRD_PartA_V2.md` and `D2_TRD_PartB_V2.md`; S-001–016 are D3 display aliases for SCREEN-001–016. **Source:** local inventory/config, D3, D6 §5.
- **AMD-AGENTS-4 — Gap:** drift in shared/tool-specific guidance. **Change:** AGENTS remains the shared entry point; CLAUDE imports it; CODEX supplements it; Gemini/Antigravity must read `.gemini/GEMINI.md` explicitly unless their loader is verified. No structural rewrite or new role is needed. Constitution principles stay non-negotiable; its own opening says differing wording is corrected from the V2 pack. Keep the explicit DESIGN token exception; D4 behaviour still wins. **Source:** existing constitution opening and guides.
- **AMD-AGENTS-5 — Gap:** generic vendored defaults can conflict with project truth. **Change:** vendor examples are not Fera requirements or runnable project commands. Use D6's ≥30 normaliser/≥60 overall tests, frozen UUID/schema contracts, raw SQL (no ORM), ≥44 px parent targets and atomic paid-call reservations. Default cap **USD 25**; a documented team decision may raise it to at most USD 30. Vendor model names/prices, platform examples and unavailable roles/tools are unverified examples, never account or cost evidence. **Source:** D2B §12/15; handover §§6,9.
- **AMD-AGENTS-6 — Gap:** out-of-scope PRODUCT/DESIGN statements conflict with the pack. **Change:** do not rely on PRODUCT's “No user interviews held yet (0)” or “Review before anything leaves the device”: interviews are UNKNOWN, providers may process after notice. Do not apply DESIGN's generic Undo promise to immutable decisions/terminal records. Corrections are proposed in the audit log; those files remain unchanged. **Source:** handover §§4,7; BR-004/020/025.
