# GEMINI.md — Fera (Gemini CLI / Antigravity)

Read [AGENTS.md](../AGENTS.md) first. Its rules, sources of truth, ownership map and definition of done apply to every agent here. This file only adds the mapping for tools without Claude subagents or Codex roles.

- **Current work:** open the active tracker in `docs/execution/PHASE_*.md`. Follow its "How to work this file" block, and update your task row in the same branch as the work.
- **Constitution:** follow the shared AGENTS hierarchy; `.specify/memory/constitution.md` keeps safeguards non-negotiable and resolves differing wording against `docs/spec/`.
- **Skills:** to run a skill (`speckit-*`, `fera-review`, `fera-gate`, `verification-loop`, `impeccable`, …), read `.agents/skills/<name>/SKILL.md` and follow it step by step.
- **Reviewers:** to run a reviewer (`fera-safeguarding-reviewer`, `database-reviewer`, …), start a separate read-only agent conversation and give it `.claude/agents/<name>.md` as its brief. `fera-safeguarding-reviewer` is required on every PR.
- **Never** read or print `.env*`, push to `main`, or run `db:reset` against a non-local database.

## Audit amendments (2026-10-12)

- **AMD-GEMINI-1 — Gap:** Loader discovery, source hierarchy and no-invention rules were implicit. **Change:** Read this file explicitly: no root GEMINI.md or verified auto-discovery setup exists. Follow AGENTS's hierarchy and its amendments; the constitution itself resolves differing wording against the V2 pack. Runtime paths/commands are planned. Keep review-before-submit/server metadata only, provider notice, AI ranks only, verified-officer decisions, role DTOs, atomic lifecycle, append-only safe audit, terminal redaction, synthetic-only data and all honest labels. No alerts/photos/face search/runaway labels/physical-return/integration/legal-compliance claims. Facts, dates, hours, owners, accounts, figures, contacts and completion without evidence are UNKNOWN/open decisions. No new loader, role, hook or permission setting is added. **Source:** AGENTS; constitution opening; handover §§4,7.
