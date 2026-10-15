# Prompt for Masnun's agent: districts, data, embeddings, matching, staff and officer screens

> Paste everything below this line into your agent (Claude Code, Codex or Antigravity), from the repo root of a fresh lane.

---

You are working for **Masnun** on Fera, a Bangla-first prototype for coordinating missing and found children. It uses synthetic data only. Mahim (the lead) has finished the platform foundation and it is merged into `phase2`, including the case service with the one-transaction officer confirm. Your job is to move Masnun's tasks forward on his own branches without waiting for Mahim.

Masnun's work is on the **critical path**: matcher (TASK-017) → match review (TASK-028) → Mahim's case close (TASK-029) → map (TASK-030).

## Read first
1. `docs/agents/handoff/COMMON.md`: what's merged, how to branch and open PRs, the hard rules and the open decisions. **Follow it.**
2. `AGENTS.md`, `CLAUDE.md`, `.specify/memory/constitution.md`.
3. `src/server/case/README.md`. Its "Masnun" section is written for you. Also read the header of `src/server/case/internal.ts` (the lock protocol), `src/app/api/_shared/index.ts` and `src/contracts/index.ts`.
4. Your trackers: `docs/execution/PHASE_2_MUST_CORE.md` ("Tasks — Masnun", "Cross-person handoffs"), `PHASE_0_BOOTSTRAP.md`, `PHASE_1_SPECS_CONTRACTS.md`, `PHASE_3_FULL_SCOPE_QUALITY.md`.
5. From the spec pack:
   - D1 PRD BR-012–026;
   - D2 TRD Part A (matching COMP-011/012/013, APIs 007–014) and Part B §12 (performance);
   - D3 screens S-007, S-009–S-011, S-014, S-015;
   - D5 Background Schema;
   - D6 tasks and TCs.

Work **one task per lane** (branch `phase2--masnun-<slug>` from `origin/phase2`). For each task:
1. Write the tests first.
2. Implement.
3. Run `npm run lint && npm run typecheck && npm test && npm run build`, plus `npm run test:db` for SQL.
4. Run `fera-review`. It adds `mle-reviewer` for matching, data and eval work, and `database-reviewer` for SQL.
5. Update your tracker row and evidence.
6. Open a PR into `phase2`.

Stop and report after each PR.

## What you can do RIGHT NOW

Do them in this order. Item 1 unblocks Obidit, and item 8 unblocks Mahim.

1. **TASK-009: district data, 64 rows (bn/en names, centroids, neighbours). Done when `npm run seed` loads 64 districts.**
   - Dependency TASK-002 is merged; the local DB stack works.
   - Tables are `districts` and `district_neighbours` in `db/schema_v2.sql`. `fera_app` only has SELECT on them, so the seed must run through the admin/owner connection, the same way `scripts/db/seed-users.mjs` connects.
   - `npm run seed` is still a fail-fast stub. Implement it. A `--set demo|full` flag comes with TASK-019.
   - Centroids are district-level only, never exact locations.
   - **Unblocks Obidit's TASK-012** (district aliases in the normaliser), and your own TASK-010 and TASK-030.
2. **TASK-011: 50 hand-labelled reports (Masnun by hand, can run in parallel).** Write them to `eval/data/labelled.jsonl`; Obidit reviews them.
3. **TASK-004: embedding spike — local `multilingual-e5-small` (384-d) on Vercel vs an API (OQ-023, RISK-015).**
   - Output: a report covering cold start, bundle size, and a local-vs-API decision.
   - For a Vercel test deploy, use Obidit's team project or ask Mahim for a manual CLI deploy.
4. **Spec-kit:** take `specs/004-matching-data`, `005-officer-workflow` and `006-dashboard-admin` through `specify` → `clarify` → `plan` → `tasks`.
   - In 005, the S-012 task lines are Mahim's; in 006, the S-013 task lines are Mahim's. Label them that way.
   - Stop between stages for a 5-minute human skim.
5. **TASK-010 → TASK-064: synthetic set generator, then the frozen manifest.**
   - **TASK-010:** about 200 records, ground truth, duplicates, decoys and no-match cases; hash the ground-truth file and commit it.
   - **TASK-064:** identity-grouped manifest with a frozen split and hashes, done **before any matcher code**.
   - Review with `mle-reviewer`.
6. **TASK-016 → TASK-019: embeddings, then the seed loader.**
   - **TASK-016:** embedding service plus `npm run reembed` (COMP-011, 384-d, matching `cases.embedding` and its model/revision/space columns). Done when 200 records are embedded.
   - **TASK-019:** `npm run seed -- --set demo` in under 2 minutes, with synthetic labels and 3 demo cases. Requirements:
     - `is_synthetic = true` on every row.
     - Each `provenance` entry must pass `evidenceSpanSchema` (`quote`, `start_utf16`, `end_utf16`, `derivation`). Otherwise the case service cannot decode the row, and every read, decision and close on it fails with E-021.
     - TASK-019 unblocks Obidit's TASK-033.
7. **TASK-017 → TASK-018: matcher, then duplicates.**
   - **TASK-017, matcher (COMP-012):** BR-017 hard filters, national cosine, bonuses, qualify-or-abstain, template reasons. Done when TC-009 passes and the first recall@5 is printed, on the dev split only. Dependency TASK-015 is **merged**.
     - Put it in `src/server/matching/`. Import from `@/server/case/internal` only, and follow its header protocol:
       1. Use `withTransaction`.
       2. Call `lockCases(client, [every endpoint])` in one ascending pass *before* inserting any `match_candidates` row, and insert at both endpoints' current versions.
       3. Then call `reconcileQueueState(client, SYSTEM_ACTOR, ids, { api: "API-014" })`.
     - Admin-triggered rematch (API-014) must use `SYSTEM_ACTOR`, not the admin's actor; an admin actor fails closed.
     - **Acknowledge OD-015-6** (lock protocol) in your PR.
     - The AI ranks; it never confirms. "Similarity", not probability.
   - **TASK-018, duplicate detector (COMP-013), done when TC-013 passes:** a shared phone number is only a weak cue.
8. **TASK-026, TASK-027 → TASK-028: staff and officer screens.** Use `impeccable` and the Cockpit desk surface.
   - You can build the UI now against typed fakes (`@/contracts/client-examples`), then wire in the real calls.
   - **TASK-026: S-007 found-child log + API-007 (TC-008).** The route calls `createFoundCase(principal, body, ctx)`, which is already merged. Build the manual-field path now. Free-text extraction needs Obidit's TASK-020.
   - **TASK-027: S-009 queue + API-008.** Lists the seeded candidates. Needs TASK-017 for real data.
   - **TASK-028: S-010 match review + API-009 / API-010, done when TC-010 (confirm part) and TC-011 pass.**
     - The one-transaction confirm/reject **already exists**: `decideCandidate(principal, candidateId, body, ctx)`. It handles verified-officer checks, sorted locks, version rechecks, voiding competitors, both case states, the simulated referral and audit. Your route only parses with Zod, calls it, and returns `result.response`.
     - A retry after a successful decision returns E-005, so the UI must reload and show the stored state.
     - Use the contracts' candidate projection for API-009. Candidates and the other party's data go only to *verified* officers.
     - **TASK-028 unblocks Mahim's TASK-029** (S-012 case detail and close). This is the most important handoff; tell Mahim as soon as it merges.
9. **TASK-030: S-011 map + table + API-012 (TC-012).** Bundled district outlines, Leaflet optional. Build it now against seeded counts. Final counts need Mahim's TASK-029 (closures).
10. **TASK-039 (scaffold): eval harness, dev split only.** It prints metrics with denominators. The held-out run happens only after the manifest/model freeze (Phase 3).

## What you CANNOT finish yet, and why
| Task | Waiting on | Owner |
|---|---|---|
| TASK-010 | TASK-009 (yours) | Masnun |
| TASK-016 | TASK-004 spike decision (yours) | Masnun |
| TASK-017 | TASK-016, TASK-064 (yours) | Masnun |
| TASK-026 free-text extraction | TASK-020 orchestrator | Obidit |
| TASK-027 / 028 with real data | TASK-017 (yours) | Masnun |
| TASK-030 final counts | TASK-029 case close | **Mahim** (who waits on your TASK-028) |
| Phase 3: TASK-048 import + API-015 | TASK-020 | Obidit |
| Phase 3: TASK-051 S-014 duplicate review | TASK-018 (yours) | Masnun |
| Phase 3: TASK-052 S-015 disaster mode | TASK-026 (yours) | Masnun |
| Phase 3: TASK-036 two Android phones | TASK-030 (yours) | Masnun |
| Phase 3: TASK-039 held-out, 060 performance, 043 final evaluation | TASK-042 prod deploy | Mahim |

## What depends on Mahim
- **Nothing blocks you today.** TASK-015 (case service and confirm), 007 (API layer), 062 (DB rules) and 006 (auth) are all merged.
- Two handoffs come later:
  - **TASK-029 (Mahim)** waits on your **TASK-028**. Your **TASK-030** final counts then wait on Mahim's TASK-029.
  - **TASK-042 (Mahim)**, the production deploy and smoke test, gates your Phase 3 TASK-060 and TASK-043.
- Any change to `src/contracts/` or `db/schema_v2.sql` (for example new indexes, OD-015-17) needs a PR reviewed by all three owners.

## Report back after each PR
- PR link and D6 task ID;
- test counts and metrics, always with denominators;
- TCs passed or not, with honest evidence;
- open decisions raised;
- anything that now unblocks Obidit or Mahim.
