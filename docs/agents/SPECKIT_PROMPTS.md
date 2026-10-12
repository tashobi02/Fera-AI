# Spec-kit prompts — Fera

Seven features, one per area. Each owner runs their own in their own worktree (Claude Code `/speckit-*`, Codex `$speckit-*`). The directory is fixed with `SPECIFY_FEATURE_DIRECTORY` so three machines never collide on numbers.

**Rules for every stage**
- The constitution (`.specify/memory/constitution.md`) is already written. Do **not** run `/speckit-constitution` again unless amending it.
- The spec pack in `docs/spec/` is the requirements source. Specs must cite FR/BR/TC/TASK/SCREEN IDs instead of re-inventing requirements. Max 3 `[NEEDS CLARIFICATION]`; prefer the answer already in the pack.
- Stop after each stage and skim the output (5 minutes, not 30). Fix ID mismatches by hand.
- After `/speckit-tasks`, run `/speckit-analyze`. Sadman runs a cross-feature analyze at 22:30 on 12 Oct.

---

## 001 · platform-foundation · Sadman
```text
/speckit-specify SPECIFY_FEATURE_DIRECTORY=specs/001-platform-foundation
Platform foundation for Fera per docs/spec: repository + CI (TASK-001), PostgreSQL 16 + pgvector with db/schema_v2.sql applied to a fresh synthetic DB (TASK-002, D2 Part A §7), shared contracts in src/contracts — DTOs, Zod schemas, report state enums, error envelope E-001–E-024, per-role projections, idempotency tokens, referral/count semantics (TASK-061, FV-01–05/10), schema invariants, restricted runtime role and related-payload redaction (TASK-062), Auth.js credentials for staff/officer/admin plus anonymous parent cookie and requireRole with verified-officer checks (TASK-006, FR-035, FR-037, BR-024), API layer with request ID, Zod helpers and rate limiter (TASK-007, COMP-021), app shell with DESIGN.md tokens, Noto Sans Bengali and the language toggle (TASK-008, COMP-022, FR-033), case service with state guard, versions and append-only audit (TASK-015, BR-010, BR-012, BR-013, BR-025, FR-021), sign-in S-008 and not-found S-016 (TASK-031). Acceptance: TC-016, TC-022, TC-023, TC-032.
```
```text
/speckit-plan Use the stack in AGENTS.md exactly. Raw SQL through pg, no ORM; schema_v2.sql is byte-identical to D2 Part A §7. Put contracts in src/contracts and export them for every other feature; they freeze at Gate G1 (12 Oct 23:00). Case service exposes createMissing/createFound/open/transition/editWithVersion/confirmPair/close as typed functions with audit inside the same transaction. Document the API surface other features call in contracts/ (quickstart.md).
```

## 002 · intake-ai · Obidit
```text
/speckit-specify SPECIFY_FEATURE_DIRECTORY=specs/002-intake-ai
Parent intake for Fera per docs/spec: provider keys and real price sheet (TASK-003), Android MediaRecorder → STT spike (TASK-005), Bangla normaliser for digits, time words, phones, district aliases and romanisation (TASK-012, COMP-008, FR-003), provider-agnostic LLM extraction adapter with Zod contract, source-span evidence check, retry and fallback provider (TASK-013, COMP-007, FR-004, BR-008), speech adapter and API-001 (TASK-014, FR-002, BR-023), intake orchestrator with templated one-at-a-time questions, max four rounds then manual form (TASK-020, FR-005, FR-026), screens S-001 welcome/notice and S-002 intake chat with recorder (TASK-021), S-003 review-before-submit with draft-on-device and idempotent submission UUID (TASK-022, FR-006, FR-007, FR-031, BR-004), atomic paid-call counters/reservations and spend cap (TASK-063, TASK-059), demo-safe cache for the three scripted cases with visible cached badge (TASK-033, FR-027). Acceptance: TC-001, TC-003, TC-004, TC-021, TC-031, TC-036, TC-060.
```
```text
/speckit-plan Server modules under src/server/{normalise,ai,speech,intake,spend,cache}; parent screens under src/app/(parent). Consume src/contracts from 001; never write SQL directly — call the case service. Normaliser and extraction contract are test-first (≥30 normaliser tests). Providers sit behind one interface; record model, prompt version and latency per call without logging child text. UI follows DESIGN.md Paper theme and the prototype screens; run /impeccable harden on S-002 and S-003.
```

## 003 · parent-outputs · Obidit (S-004, S-005 screens: Sadman)
```text
/speckit-specify SPECIFY_FEATURE_DIRECTORY=specs/003-parent-outputs
Parent outputs and after-submit flows per docs/spec: fixed-template Bangla GD draft and no-photo poster with 13219, contact choice and separate share acknowledgement, plus wording guard that blocks alert/runaway/rescue/legal claims in generated and displayed text (TASK-023, COMP-010, COMP-016, FR-008, FR-009, FR-034, BR-022), S-004 outputs screen with poster PNG (TASK-024), S-005 manual form fallback prefilled from the draft (TASK-025, FR-026), 13219 summary ≤ 80 words (TASK-047, FR-010), edit after submit with versions and API-005 plus S-006 parent status and API-018 (TASK-049, TASK-050, FR-029, FR-030, BR-025). Acceptance: TC-005, TC-006, TC-007, TC-017, TC-018, TC-019, TC-024, TC-025.
```
```text
/speckit-plan Templates are pure functions over reviewed fields only (no LLM). Wording guard is a shared module used by templates, UI copy tests and the deck checklist. Poster PNG renders client-side with canvas at 1080×1350. Edits go through caseService.editWithVersion. Tasks for S-004/S-005 carry owner Sadman; the rest owner Obidit.
```

## 004 · matching-data · Masnun
```text
/speckit-specify SPECIFY_FEATURE_DIRECTORY=specs/004-matching-data
Data and matching per docs/spec: local embedding spike on the deploy target (TASK-004, OQ-023), 64 districts with bn/en names, centroids and neighbours (TASK-009), synthetic set generator with ~200 records, ground truth, duplicates, decoys and no-match cases (TASK-010), identity-grouped manifest with frozen split and hashes (TASK-064), 50 hand-labelled reports (TASK-011), embedding service and npm run reembed (TASK-016), matching engine with BR-017 hard filters, exact national cosine retrieval, soft district/adjacency/clothing/marks bonuses, qualify-or-abstain and template reasons (TASK-017, FR-012, FR-013, BR-018, BR-019), duplicate detector where shared phone is only a weak cue (TASK-018, FR-022, BR-021), seed loader with synthetic labels and the three demo cases (TASK-019, FR-032). Acceptance: TC-009, TC-013, TC-020 (smoke).
```
```text
/speckit-plan Modules under src/server/{embeddings,matching,duplicates}, data under data/ and db/seed/. Freeze ground truth and manifest (hash committed) before any matcher tuning; thresholds calibrated on the dev split only. Matching runs after case open and after found save, writes candidates through the case service, and never changes report state except open ↔ matched_pending_review via the service. Deterministic, seeded, and fast enough for ~200 rows with exact search.
```

## 005 · officer-workflow · Masnun (S-012: Sadman)
```text
/speckit-specify SPECIFY_FEATURE_DIRECTORY=specs/005-officer-workflow
Staff and officer workflow per docs/spec: S-007 found-child log with API-007, review before save, matching state only (TASK-026, FR-011), S-009 review queue with keyboard shortcuts (TASK-027, FR-014), S-010 match review with agree/differ/unknown evidence, checklist, two-step confirm and reject-with-reason, one-transaction confirm with simulated referral record (TASK-028, FR-015, FR-016, FR-017, BR-005, BR-019, BR-020), S-012 case detail, close with outcome, audit timeline (TASK-029, FR-018), S-014 duplicate review (TASK-051, FR-023), S-015 disaster mode labelled as planned (TASK-052, FR-036). Acceptance: TC-008, TC-010, TC-011, TC-035, TC-046, TC-047.
```
```text
/speckit-plan Screens under src/app/(desk)/staff and src/app/(desk)/officer using the Cockpit theme from DESIGN.md and the prototype layouts. Confirm/close call caseService.confirmPair/close only. Staff DTOs never include candidates. Keyboard: J/K/Enter in the queue, C/R in review, Esc closes dialogs, shortcuts off while typing. S-012 tasks carry owner Sadman.
```

## 006 · dashboard-admin · Masnun (S-013: Sadman)
```text
/speckit-specify SPECIFY_FEATURE_DIRECTORY=specs/006-dashboard-admin
District dashboard and admin tools per docs/spec: S-011 map plus accessible table with separate missing-report, found-report and confirmed-pair counts, synthetic toggle and officer drill-through (TASK-030, FR-019, BR-014, API-012, API-022), S-013 admin with mock officer verification, payload redaction of eligible terminal reports behind typed confirmation, and invented-fixture import with API-015 (TASK-032, TASK-048, FR-024, FR-025, FR-035, BR-009). Acceptance: TC-012, TC-014, TC-015, TC-050.
```
```text
/speckit-plan Counts come from one SQL view per BR-014; never "unique children". Map uses bundled simplified district outlines so it works offline; Leaflet tiles optional. Admin sees aggregates and metadata only. S-013 tasks carry owner Sadman.
```

## 007 · quality-release · Sadman (shared)
```text
/speckit-specify SPECIFY_FEATURE_DIRECTORY=specs/007-quality-release
Quality, evaluation and release per docs/spec: accessibility pass (TASK-034, TC-033), Bangla copy for every state (TASK-035), two-Android device test (TASK-036), unit tests ≥60 (TASK-037), Playwright essential journey and safeguarding TCs (TASK-038), evaluation harness dev then held-out (TASK-039, FR-028), WER on 60 clips (TASK-040), timing study ≥5 testers (TASK-041), production deploy + smoke (TASK-042), performance check (TASK-060, TC-034), final frozen evaluation (TASK-043), Round 2 deck 5–8 slides, 1–2 min video, README and Drive submission against the 14 Oct 22:00 planning baseline, organiser extension cutoff UNKNOWN (TASK-044–046), mentor fixes (TASK-056), finale local stack, rehearsals, deck and backup recording (TASK-053–055, TASK-058), user conversations only if OQ-019 allows (TASK-057).
```
```text
/speckit-plan Owners per D6 (S/O/M). Tag Playwright specs @gate-G2/@gate-G4 for the fera-gate skill. Evaluation disables fixtures and caches, prints denominators, failures, commit/model/manifest hashes. Every number in the deck comes from the frozen report or says "not measured".
```

---

## After `/speckit-tasks`
- Add the owner initial and lane to each task line, e.g. `- [ ] T012 [P] [O·lane-A] Normaliser: Bangla digits … (TASK-012)`.
- `/speckit-taskstoissues` is optional; the team board is `specs/*/tasks.md`.
- Implement with `/speckit-implement` scoped to a task range (`/speckit-implement T010-T014`), then `/speckit-converge` until it reports Converged.

## Audit amendments (2026-10-12)

- **AMD-PROMPTS-1 — Gap:** Briefs implied verified deadline/availability and omitted uniform evidence discipline. **Change:** Use the amended phase plans and 184 h Round 2 baseline; 14 Oct 22:00 is a working target, extension date/time UNKNOWN. Never invent facts or use the three-clarification limit to guess; unresolved facts become UNKNOWN/open decisions. Feature paths, npm commands and acceptance checks remain planned. The workflow requires clarify and analyze as well as specify/plan/tasks before implement, regardless of the bundled workflow shortcut. G2 includes offline core; P5 packages it. Preserve all safeguards, raw SQL/frozen contracts, dev-only tuning, atomic USD25 default cap (documented rise ≤30), and original task ownership. **Source:** handover §§6–10; D6; AGENTS.
