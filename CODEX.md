# CODEX.md — Fera (Codex)

Codex-specific working guide. Read [AGENTS.md](AGENTS.md) first; its shared rules, source hierarchy, ownership map and definition of done apply here. This file supplements them. [CLAUDE.md](CLAUDE.md) is the companion guide for Claude Code.

## Start each session

1. Read [docs/execution/EXECUTION_PLAN.md](docs/execution/EXECUTION_PLAN.md) for the active schedule, gate evidence and lane assignments, then the current phase tracker `docs/execution/PHASE_*.md`; update your task rows there as you work. All dates and times are **Asia/Dhaka**.
2. Check the branch, worktree and working-tree changes. Preserve existing work. Identify the task range, owning area and relevant TASK/FR/BR/TC/SCREEN IDs before editing.
3. Read `.specify/memory/constitution.md` when available, the relevant documents in `docs/spec/`, and the feature's `specs/NNN-*/{spec,plan,tasks}.md`. The constitution and V2 spec pack take precedence over generated feature artifacts; fix a conflicting artifact.
4. Consult [the agent roster](docs/agents/AGENT_ROSTER.md) for tooling and reviewer roles, and [the spec-kit prompts](docs/agents/SPECKIT_PROMPTS.md) for the exact feature brief. Read a skill's `SKILL.md` before using it.
5. For UI work, also read [DESIGN.md](DESIGN.md), [PRODUCT.md](PRODUCT.md), D3 and D4. The local screen reference is [the clickable prototype](<demo/Fera — clickable prototype and blueprint.html>).

## Checkout and setup reality

As checked on **12 Oct 2026**, this checkout contains the specification package, prototype, agent guidance and helper scripts, plus a minimal project skeleton. `src/`, `db/` and `specs/` are absent. Every declared `package.json` script prints `not implemented` and exits with status 1; there are no application dependencies or lockfile. Command names describe planned checks, not checks that have passed.

The agent kit was assembled and validated on 12 Oct (see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)): 18 Claude agents, 16 Codex roles, 28 skills in both `.claude/skills/` and `.agents/skills/`, and spec-kit for both tools. The constitution and the `fera-*` files are team drafts until the owners ratify them at G0. The impeccable edit hooks are not installed; `bootstrap.sh` optionally attempts their installation (not run by this audit).

- [scripts/agents/bootstrap.sh](scripts/agents/bootstrap.sh) checks prerequisites, installs the spec-kit CLI, optionally installs provider-native impeccable builds/hooks, and creates a local environment template if absent. It assumes the vendored kit is present and does not regenerate it.
- Intended Codex roles live in `.codex/config.toml` and `.codex/agents/*.toml`; skills live in `.agents/skills/`. Follow the roster's project-trust and hook setup once those files are available. Roles inherit the session model. Some review-capable roles use `workspace-write`; explicitly assign every review read-only work.
- `docs/spec/*.md` currently matches the original `docs/markdown/` package. `docs/code/{schema_v2.sql,fera_types_v2.ts,tokens_v2.css}` contains the supplied companions. Preserve their manifest hashes and embedded-code equality. The eventual runtime `db/schema_v2.sql` must match the supplied SQL; it applies to a fresh synthetic database, not an in-place migration.
- Stored results under `docs/verification/` establish companion checks only. They do not establish application acceptance, PostgreSQL 16/runtime-role coverage, concurrency safety, deployment or product metrics.

## Worktrees, features and implementation

Use one worktree, branch and writing session per implementation lane. The helper creates a sibling directory and a lane branch:

```sh
scripts/agents/new-lane.sh 002-intake-ai obidit-normaliser
# Worktree: ../fera-lanes/obidit-normaliser
# Branch: 002-intake-ai--obidit-normaliser
```

The helper starts from the feature branch if available, otherwise `origin/main` or `main`. **Uncommitted agent-kit files are not carried into a new lane**; ensure G0's kit is committed first. It copies `.env.local` without displaying it. Run `npm ci` only once application dependencies and a lockfile exist.

| Feature directory under `specs/` | Owner and boundaries |
|---|---|
| `001-platform-foundation` | Sadman: platform, contracts, schema, auth, case service, shell |
| `002-intake-ai` | Obidit: normaliser, extraction, speech, intake, spend, cache |
| `003-parent-outputs` | Obidit; S-004/S-005 screens belong to Sadman |
| `004-matching-data` | Masnun: districts, synthetic data, embeddings, matching, duplicates |
| `005-officer-workflow` | Masnun; S-012 belongs to Sadman |
| `006-dashboard-admin` | Masnun; S-013 belongs to Sadman |
| `007-quality-release` | Sadman coordinates; task ownership is shared as specified |

Pin the feature directory with `SPECIFY_FEATURE_DIRECTORY`; use the briefs in `docs/agents/SPECKIT_PROMPTS.md`. Codex stages are `$speckit-specify` → `$speckit-clarify` → `$speckit-plan` → `$speckit-tasks` → `$speckit-analyze`. Present each stage's concrete output for the short human skim before advancing. Do not rerun `$speckit-constitution` unless amending the existing constitution.

Add an owner and lane to every generated task, with its D6 ID, for example `[O·lane-A] ... (TASK-012)`. The task board is `specs/*/tasks.md`; `$speckit-taskstoissues` is optional. Implement a bounded task range with `$speckit-implement` or an explicit TASK/FR-scoped prompt, then `$speckit-converge` until Converged.

Codex's main lane is well-specified logic with tests first: normaliser, state guard, matcher, counters, DTO projections and seed generation. It also gives second-opinion reviews of Claude-written confirmation, permissions and extraction changes. Follow the AGENTS.md role-routing table; read-only reviewers can run in parallel, while writing agents require separate lanes and non-overlapping paths.

Respect ownership, including Sadman's parent-screen exceptions. At **G1**, `src/contracts/` and `db/schema_v2.sql` freeze; subsequent changes require a small PR reviewed by all three owners. Use the case service for lifecycle writes rather than duplicating SQL in intake or UI modules. Commit messages use Conventional Commits with IDs, e.g. `feat(intake): Bangla digit normalisation [TASK-012]`.

## Execution priorities and gates

The execution plan targets **all 64 D6 tasks, approximately 222 estimated hours**, across 12–24 Oct. The handover's Round 2 baseline remains **52 tasks / 184 h** (Sadman 67, Obidit 54, Masnun 63). Actual remaining effort and availability are UNKNOWN; use the execution plan with its audit amendments. Report slippage with an owner and remaining work instead of silently dropping features or declaring gates complete.

| Gate | Due, Asia/Dhaka | Required evidence |
|---|---|---|
| G0 | 12 Oct, 18:00 | Committed agent kit, CI, local/hosted DB, provider/STT/embedding spikes, districts |
| G1 | 12 Oct, 23:00 | Seven analyzed feature task boards, contracts tagged `contracts-v1`, frozen ground truth/manifest, Bangla shell |
| G2 | 13 Oct, 23:00 | Amended Phase 2 Must checks pass; TC-007 is optional Phase 3 scope |
| G3 | 14 Oct, 13:00 | Should/Could acceptance, accessibility, Bangla copy and mentor fixes pass |
| G4 | 14 Oct, 16:00 | Production smoke/E2E, frozen cache-disabled evaluation and measured spend |
| G5 | 14 Oct, 21:00 | Submission email with Drive link sent; all deliverable links open logged-out |
| G6 | 15 Oct, 20:00 | Full offline laptop journey; remaining items have owners and dates before 20 Oct |

- **Critical path:** contracts → case service (TASK-015) → matcher (TASK-017) → review (TASK-028) → close (TASK-029) → map (TASK-030). The case service API must merge by **13 Oct, 12:00**. Dependent lanes can use typed fakes while waiting.
- Freeze identity-grouped ground truth and the manifest hash before matcher implementation/tuning. Calibrate on dev only; freeze thresholds/models before held-out evaluation.
- On **14 Oct**, feature freeze is **12:30**; afterward, only fixes for failing TCs. Production deploy/smoke is due **15:00**, final frozen evaluation **15:45**.
- Round 2 deliverables are the repo, **5–8 slides**, **1–2 min video**, and a Drive folder, sent by replying to the selection email. The working cutoff baseline is **14 Oct, 22:00** and internal send target **21:00**. The user reports an organiser extension; its date/time is UNKNOWN. Handover §10 does not verify the exact cutoff/channel/formats.
- Stand-ups on 13–14 Oct are **09:00, 13:00, 18:00, 23:00**, with merge windows afterward. Merge small PRs every 2–3 hours and rebase lanes after merges. Track gate evidence, blockers and remaining hours with `$fera-gate`; reports go in `docs/gates/`.
- Finale is **24 Oct**. TASK-053 provides the local `DEMO_MODE=1` stack; TASK-054 requires five rehearsals, at least one internet-off. TASK-055 covers the finale deck and TASK-058 the backup recording. TASK-057 user conversations remain conditional on mentor/faculty clearance of OQ-019.

Phase 0 decisions remain owner-led: Sadman resolves the DB host (OQ-021); Obidit resolves LLM/STT accounts, prices and data terms (OQ-004/013/022); Masnun resolves local versus API embeddings (OQ-023). Record decisions and evidence rather than guessing a provider or deployment capability.

## Implementation safeguards

- **Review before submit:** drafts stay on the device; providers may process synthetic audio/text before submission only after the notice. Pre-submit server storage is expiry/counter/hash/cost metadata only. No report payload storage, matching, other-party visibility or export before confirmation (BR-004, TC-004/060).
- **Evidence and human decisions:** unknown fields stay unknown; every extracted or derived value retains its source span. AI only retrieves and ranks. Zero qualified candidates is valid; district is a soft feature and retrieval is national. Never auto-confirm or auto-close (BR-008/017–020).
- **Role boundaries:** Zod input → role guard → allowlisted role DTO → error envelope. Only verified officers receive candidates and other-party details; admins receive metadata/aggregates. Never return raw rows (BR-024).
- **Atomic lifecycle:** confirmation locks endpoints in sorted UUID order, rechecks versions/authorisation, voids competitors, reconciles affected states, records the simulated referral and appends audit in one transaction. Edits, redaction and denied access also require safe audit; no child payload in logs (BR-009/010/020/025).
- **Synthetic and honest:** no real child records, photos, faces, ID documents or exact coordinates. Preserve synthetic, `[MOCK]`, cached, planned and simulation labels. Say "Similarity" and "Referral recorded (simulation)"; make no alert, runaway, rescue, police-integration or legal-compliance claims. Count missing reports, found reports and confirmed pairs separately. Metrics need denominators and failures, or "not measured".
- **Budget and secrets:** app API spend defaults to a USD 25 cap; a documented team decision may raise it within the USD 30 ceiling, separate from agent subscriptions. Paid dispatch must use atomic counters/reservations (TASK-063) and the spend cap (TASK-059); refusal must leave manual intake usable. Never read or print `.env*`, put provider keys in agent prompts/logs, reset a non-local database or push directly to `main`.

## UI and review before a PR

Use `$impeccable` for UI work: `shape` → `craft` → `harden` → `audit` → `polish`, with `clarify` for copy. Keep the team's Inter + Noto Sans Bengali + JetBrains Mono choices, semantic tokens and Cockpit/Paper themes. D3/D4 behaviour and accessibility requirements override generic visual defaults: no red on parent screens; status includes icon + text + colour; parent body text is 18 px with Bangla-friendly 1.7 line height, touch targets at least 44 px, and keyboard/320 px/200% zoom states must work.

Parent UI defaults to Bangla, supports English and uses Bangla numerals in Bangla mode. Desk UI is bilingual. Use D3/D4's exact copy where provided; new loading/empty/error strings belong in locale files. `PRODUCT.md` is an unconfirmed draft; the roster calls for one `$impeccable init` confirmation before treating it as a confirmed product brief.

Before every PR, run `$verification-loop` and `$fera-review`. Select reviewers from the diff using AGENTS.md; always include `fera_safeguarding_reviewer`. Run read-only reviews in parallel and fix every BLOCK. High-risk confirmation/case-service work also needs database review; Bangla work needs Bengali review; AI retries/fallbacks need failure-path review. Obtain `impeccable_finish_reviewer` review for finished UI.

Once implemented, required checks are `npm run typecheck`, `npm run lint`, `npm test`, the appropriate build/E2E checks, and production smoke for release changes. Tests cover logic and journeys, including concurrency, roles and failures where applicable: TASK-012 requires at least 30 normaliser tests; TASK-037 requires at least 60 unit tests overall. Frozen evaluations disable caches/fixtures and record denominators, failures, spend and commit/model/manifest hashes.

Report actual commands/results, reviewer findings, linked IDs and any remaining setup gaps. Attach new-dependency notes to the PR. Gate PASS and task completion require evidence, not the presence of a spec, placeholder command or companion report. The human owner reviews and merges the PR.

## Audit amendments (2026-10-12)

- **AMD-CODEX-1 — Gap:** 184 h was dismissed as an obsolete subset. **Change:** retain 184 h/52 tasks (S67/O54/M63) as the Round 2 baseline and 222 h/64 tasks as overall ambition; actual availability and remaining effort UNKNOWN. Old “D6's older 184-hour Round 2 subset is not the current team's scope target” was corrected. G2 uses amended Must checks (optional TC-007 belongs to G3); see phase amendments for entry/exit evidence. **Source:** handover §6; AMD-PLAN-1/2.
- **AMD-CODEX-2 — Gap:** official 22:00 cutoff and no-extension claim. **Change:** old “The 15th is a buffer/finale day, not an extension of Round 2” is replaced by the baseline/UNKNOWN extension distinction. Finale kit checkpoint is **23 Oct**, finale **24 Oct**. P5 links late tasks without absorbing P2/P3 scope. **Source:** handover §10; D1 DEP-009; user update.
- **AMD-CODEX-3 — Gap:** missing explicit no-invention/default-cap rules. **Change:** never invent facts, dates, hours, owners, accounts, figures, contacts or completion. Deployment, interviews, partner approval, account readiness and measured results require evidence; otherwise **UNKNOWN** plus open decision. Default paid cap **USD 25**, documented decision required to raise it within USD 30; reservations/manual fallback remain mandatory. **Source:** handover §§6–7; D2B §12.
- **AMD-CODEX-4 — Gap:** “reviewers use read-only” overstates configured permissions. **Change:** existing a11y/e2e builder-capable roles have workspace-write; every review task must explicitly prohibit edits regardless of role permissions. No sandbox/permission setting changed. CODEX is a manually referenced supplement, not a verified auto-loaded file. Shared rules remain in AGENTS. PRODUCT's interview/processing errors and DESIGN's generic Undo rule are governed by AMD-AGENTS-6. **Source:** local TOML inventory; existing workflow.
