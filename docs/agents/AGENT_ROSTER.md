# Agent roster — what we took from each repo and why

Pulled on 12 Oct 2026 from github/spec-kit, affaan-m/ecc and pbakaus/impeccable. Instructions are vendored; first-run engines/installers may need network, and setup parity across the three laptops is UNKNOWN. `scripts/agents/bootstrap.sh` attempts tool installation.

## github/spec-kit — the process spine
Installed with `specify init --integration claude` then `specify integration install codex` (spec-kit CLI from source).
- Claude Code skills in `.claude/skills/speckit-*`, Codex skills in `.agents/skills/speckit-*` (`$speckit-<command>`).
- Used: `constitution` (draft; ratification pending), `specify`, `clarify`, `plan`, `tasks`, `analyze`, `implement`, `converge`, `checklist` (for release checklists).
- Not used: `taskstoissues` (the board is `specs/*/tasks.md`; use it only if you want GitHub Issues).
- Templates and scripts in `.specify/`. The constitution is written: `.specify/memory/constitution.md`.

## affaan-m/ecc — 13 of 71 agents, 15 of ~300 skills
ECC is huge; loading all of it would flood every session with irrelevant routing (Django, Kotlin, healthcare, trading…). We took only what maps to Fera's stack and risks.

| Agent | Why Fera needs it | Mostly used by |
|---|---|---|
| `code-architect` | Turns a spec-kit task into a file-level blueprint before coding | all |
| `tdd-guide` | Tests first for normaliser, state guard, matcher, counters | all |
| `typescript-reviewer` | TS strict, async correctness, Node security | all |
| `react-reviewer` | App Router server/client boundaries, hooks, a11y | Obidit, Masnun |
| `react-build-resolver` | Next.js build, type and hydration failures with minimal diffs | all |
| `database-reviewer` | Postgres 16 + pgvector schema, transactions, locks, indexes | Sadman, Masnun |
| `security-reviewer` | Auth.js, role guards, input handling, secrets | Sadman |
| `bengali-reviewer` | Unicode normalisation, conjuncts, Bangla digits, fonts — core to intake | Obidit |
| `a11y-architect` | WCAG 2.2 AA for parent and officer screens | Sadman (TASK-034) |
| `silent-failure-hunter` | AI fallbacks, retries, matching failures that must surface, not vanish | Obidit, Masnun |
| `mle-reviewer` | Frozen manifest, held-out evaluation, no tuning on test data | Masnun |
| `e2e-runner` | Playwright journeys and safeguarding TCs | Sadman |
| `doc-updater` | README, docs and codemaps for the submission | Sadman |

Skills taken: `tdd-workflow`, `verification-loop`, `e2e-testing`, `security-review`, `postgres-patterns`, `database-migrations`, `api-design`, `react-patterns`, `nextjs-turbopack`, `frontend-a11y`, `bengali-nlp`, `cost-aware-llm-pipeline` (USD 30 budget), `eval-harness`, `parallel-execution-optimizer`, `team-agent-orchestration`.

Deliberately left out: `planner`/`architect` (spec-kit `plan` covers it), `code-reviewer` (overlaps the TS/React reviewers), `performance-optimizer` (TASK-060 is a measurement, not an optimisation pass), ECC hooks and the full plugin (hook profiles and MCP servers add setup risk for a 3-day sprint). Install the full plugin later with ECC's own installer if you want it.

## pbakaus/impeccable — design quality
- Skill `impeccable` in `.claude/skills/` and `.agents/skills/` (copied from the built Claude plugin, v4.5.2). Commands you will use: `shape` before a new screen, `craft` to build it, `harden` (errors, i18n, overflow), `audit` (a11y, responsive), `polish` before G3, `clarify` for copy.
- Agents: `impeccable-finish-reviewer` (review a finished screen against direction), `impeccable-documenter`, plus the two live-mode helpers the skill calls (`impeccable-asset-producer`, `impeccable-manual-edit-applier`).
- `PRODUCT.md` is pre-filled from the spec pack (drafted, not yet confirmed — run `/impeccable init` once to confirm). `DESIGN.md` is the team's Cockpit & Paper system; the brief wins over impeccable's default dislikes (e.g. it avoids Inter by default, but our DESIGN.md pins Inter + Noto Sans Bengali on purpose).
- The skill's launcher downloads its detector engine on first run. For the provider-native builds and edit hooks, run `npx impeccable install --providers=claude,codex --scope=project` on your machine (it could not reach impeccable.style from the machine that built this kit). In Codex, approve the hook in `/hooks` afterwards.

## Fera-specific (written for this repo)
- `fera-safeguarding-reviewer` — the release gate. Checks every PR against BR-001–BR-026: role-scoped DTOs, review-before-submit, AI boundaries, matching semantics, state machines, audit, honest wording, synthetic-only data. Opus, read-only.
- Skill `fera-review` — picks reviewers from the diff and runs them in parallel; always includes the safeguarding reviewer.
- Skill `fera-gate` — checks a phase gate from `docs/execution/EXECUTION_PLAN.md` and writes `docs/gates/G<n>-*.md`.

## Where things live
| | Claude Code | Codex |
|---|---|---|
| Project instructions | `CLAUDE.md` (imports `AGENTS.md`) | `AGENTS.md` |
| Subagents / roles | `.claude/agents/*.md` (18) | `.codex/config.toml` + `.codex/agents/*.toml` (16 roles) |
| Skills | `.claude/skills/` (28) | `.agents/skills/` (28) |
| Permissions | `.claude/settings.json` | Codex approvals/sandbox per role (`sandbox_mode`) |

Codex roles leave `model` unset so they inherit your default model; role sandbox modes vary; a11y/e2e roles can write, so review assignments must explicitly be read-only. Codex loads the project `.codex/config.toml` only after you trust the project.

## Audit amendments (2026-10-12)

- **AMD-ROSTER-1 — Gap:** Offline/identical-laptop readiness and role parity were overstated. **Change:** Vendored instructions are present; first-run detector/provider-native installation still needs network. Per-laptop runtime status is UNKNOWN. Constitution is drafted, not ratified. AGENTS is shared; CLAUDE imports it, CODEX is an explicit supplement, .gemini/GEMINI.md is an explicit Gemini/Antigravity brief (root GEMINI.md absent; automatic discovery UNKNOWN). The 18 Claude agents versus 16 Codex roles differ by Claude-only impeccable-asset-producer and impeccable-manual-edit-applier; use existing degraded/inline instructions when the named role is unavailable, without adding roles. impeccable_documenter exists in Codex although not a row in AGENTS's task-routing summary. Reviews must explicitly forbid edits even for workspace-write a11y/e2e roles. Missing upstream ECC rules/skills/commands mentioned in vendor text are not installed Fera capabilities; use the available-role/skill inventory and AGENTS precedence. All dates/hours/accounts/results without source evidence are UNKNOWN. **Source:** local inventory; AGENTS; handover §§6–7.
