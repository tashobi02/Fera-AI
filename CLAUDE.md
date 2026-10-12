# CLAUDE.md — Fera (Claude Code)

@AGENTS.md

## Claude Code specifics
- **Subagents live in `.claude/agents/`.** Delegate proactively using the routing table in AGENTS.md. Reviews are read-only and can run in parallel: launch them in one message, not one after another.
- **Before any PR**, run the `fera-review` skill. It picks reviewers from the diff and always includes `fera-safeguarding-reviewer`. Fix every BLOCK finding before asking a human to merge.
- **Spec-kit skills** are `/speckit-*` (installed in `.claude/skills/`). Run one stage at a time and stop for human review between `specify`, `plan` and `tasks`.
- **UI work** goes through the `impeccable` skill (`/impeccable shape`, `craft`, `harden`, `audit`, `polish`). The brief wins: `DESIGN.md` deliberately pins Inter + JetBrains Mono, with Noto Sans Bengali for Bangla (see its "Fera overrides" section), and the Cockpit & Paper palettes, so do not "fix" those choices. D4 behaviour rules (icon + text + colour for status, no red on parent screens, honest labels) override any stylistic suggestion.
- **Model routing:** planning, safeguarding and architecture reviews use Opus (set in each agent file); routine implementation uses the session default.
- **Context hygiene:** one task per session. When a task closes, commit, then start a fresh session for the next one instead of compacting a long thread.
- **Never** read or print `.env*`, push to `main` directly, or run `db:reset` against a non-local database.

## Audit amendments (2026-10-12)

- **AMD-CLAUDE-1 — Gap:** safeguards/evidence discipline only implicit through import. **Change:** explicitly retain review before server persistence/matching/export, provider notice before synthetic processing, AI ranking only, verified-officer confirmation in one transaction, role DTOs, append-only safe audit and eligible terminal redaction. No real child data, photos/face search, alerts, runaway labels, physical return, integration or legal-compliance claims. Keep synthetic/[MOCK]/cache/simulation labels. Never invent dates, hours, owners, accounts, figures, contacts, metrics, interviews, deployment or partner approval; use **UNKNOWN** with open decisions. **Source:** AGENTS; handover §§4,7–8.
- **AMD-CLAUDE-2 — Gap:** guide does not distinguish planned commands/paths or scope-limited sessions. **Change:** AGENTS remains the shared rule file, with runtime paths/npm commands planned until implemented. Preserve tool-specific subagent/model guidance. Its “When a task closes, commit” instruction is conditional on task authorisation; this audit explicitly forbids commits and all Git tree-changing actions. `.env.example` is a nonsecret template readable only within authorised work; never expose actual environment secrets. Existing permission settings are unchanged. **Source:** user audit ground rules; local skeleton inventory.
