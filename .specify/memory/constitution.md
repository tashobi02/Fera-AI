# Fera Constitution

<!-- Drafted 2026-10-12 from AGENTS.md and the V2 spec pack (docs/spec/). Status: DRAFT until the three owners ratify it at G0. -->

Fera is a Bangla-first case-coordination prototype for missing and found children in Bangladesh, built on synthetic data only. These principles override every spec-kit artifact, plan, task and agent suggestion. Each one cites the business rules (BR) in D1/D5 that define it in detail; when wording differs, the spec pack wins and this file is corrected.

## Core Principles

### I. Review before submit (NON-NEGOTIABLE)
No missing-report payload is stored, matched, shown to another party or exported before the reporter reviews and confirms it. Providers may process audio/text only after the on-screen notice. Before submit, the server stores only expiry, counter, hash and cost metadata. Submission is idempotent on a client UUID. (BR-004, BR-023, FR-006, FR-007, FR-031)

### II. AI retrieves and ranks; people decide (NON-NEGOTIABLE)
AI never confirms, rejects, closes or fills a field by guessing. Unknown stays unknown. Every extracted or derived value keeps its source span. Only an active verified officer records a candidate decision, and zero qualified candidates is a valid result. Retrieval is national; district is a soft bonus, never a gate. Shared phone alone never establishes the same child. (BR-001, BR-008, BR-017, BR-018, BR-019, BR-021)

### III. Least visibility by role (NON-NEGOTIABLE)
Every route runs in this order: Zod input → role guard → per-role DTO allowlist → error envelope. Raw rows are never returned. Candidates and other-party evidence go only to verified officers. Parents see their own report and status, staff see their own found reports, and admins see aggregates and redacted metadata only. Hidden records return the same not-found envelope and write an `access.denied` audit row. (BR-007, BR-024, E-004)

### IV. Lifecycle integrity
Report states change only through the case service and the database state guards. A confirmation is one transaction: lock both endpoints in sorted UUID order, recheck versions and authorisation, confirm one pair, void competitors, reconcile both states, record the simulated referral and append audit. Edits are versioned with an expected version; terminal reports can't be edited. (BR-012, BR-013, BR-020, BR-025)

### V. Append-only audit, no child payload in logs
Decisions, state changes, edits, redactions and denied access produce append-only audit events. UPDATE, DELETE and TRUNCATE on audit are rejected, and the runtime role has no DDL. Logs and telemetry never contain child names, phone numbers or free text. Redaction clears direct and related identifying payloads after closure. (BR-009, BR-010, NFR-010)

### VI. Honest by construction
Say "Similarity", never probability or identity. Say "Referral recorded (simulation)", never delivered, returned or reunified. No alerts, runaway labels, rescue promises, CID/police integration claims or legal-compliance claims. Outputs are labelled drafts from fixed templates over reviewed fields. Synthetic, `[MOCK]`, cached, planned and simulation labels stay visible. Every metric shows its denominator and failures, or says "not measured". (BR-002, BR-003, BR-005, BR-011, BR-022, BR-026)

### VII. Synthetic only, no images
Every record is invented and labelled synthetic. No photos, faces, ID documents, exact coordinates or physical-return action. Model-quality evaluation runs with fixtures and caches disabled, on a manifest frozen and hashed before any tuning; thresholds are calibrated on the dev split only. (BR-006, BR-026, GOAL-009)

## Technical constraints

- Stack is fixed by `AGENTS.md`: Next.js App Router, strict TypeScript, Tailwind, Zod, PostgreSQL 16 + pgvector through `pg` and hand-written SQL (no ORM), Auth.js credentials, Vitest, Playwright + axe, pino with redaction.
- `db/schema_v2.sql` is byte-identical to `docs/code/schema_v2.sql` and targets a fresh synthetic database. `src/contracts/` and the schema freeze at G1; later changes need a PR reviewed by all three owners.
- The paid AI budget is capped at USD 30 with atomic reservations. A refused paid call must leave the manual form usable. Secrets live only in `.env.local` and are never put in prompts or logs.
- Parent screens default to Bangla with Bangla numerals, 18 px / 1.7 body, no red, status shown as icon + text + colour, and touch targets ≥ 44 px. Everything meets WCAG 2.2 AA, including 320 px reflow and 200 % text zoom.

## Development workflow and quality gates

- Every change cites its TASK/FR/BR/TC IDs. Commits use Conventional Commits with IDs. Each lane works in its own worktree with one writer per path (the ownership map in `AGENTS.md`).
- Logic is test-first. Before a PR: `typecheck`, `lint` and `test` are green, `verification-loop` passes, and `fera-review` runs with `fera-safeguarding-reviewer` always included. Every BLOCK finding is fixed before a human merges. Nobody pushes directly to `main`.
- A gate passes only with evidence (command output, URL or file) recorded by `fera-gate` in `docs/gates/`. A spec, a placeholder command or a companion report is not evidence.

## Governance

This constitution supersedes other practices in this repo. Amendments need a PR that states the reason and the BR/FR affected, approved by all three owners (Sadman, Obidit, Masnun). Bump MAJOR for a removed or redefined principle, MINOR for an added principle or section, and PATCH for wording. `fera-safeguarding-reviewer` checks every PR against Principles I–VII.

**Version**: 1.0.0 | **Ratified**: pending (G0) | **Last Amended**: 2026-10-12
