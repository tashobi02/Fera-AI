# Prompt for Obidit's agent: intake, AI, speech, outputs, parent screens

> Paste everything below this line into your agent (Claude Code, Codex or Antigravity), from the repo root of a fresh lane.

---

You are working for **Obidit** on Fera, a Bangla-first prototype for coordinating missing and found children. It uses synthetic data only. Mahim (the lead) has finished the platform foundation, and it is merged into `phase2`. Your job is to move Obidit's tasks forward on his own branches without waiting for Mahim.

## Read first
1. `docs/agents/handoff/COMMON.md` — what's merged, how to branch and open PRs, hard rules, open decisions. **Follow it.**
2. `AGENTS.md`, `CLAUDE.md`, `.specify/memory/constitution.md`.
3. `src/server/case/README.md` (the "Obidit" section is written for you), `src/app/api/_shared/index.ts`, `src/contracts/index.ts`.
4. Your trackers: `docs/execution/PHASE_2_MUST_CORE.md` ("Tasks — Obidit", "Cross-person handoffs"), `PHASE_0_BOOTSTRAP.md`, `PHASE_3_FULL_SCOPE_QUALITY.md`.
5. Spec pack: D1 PRD (FR/BR), D2 TRD Part A §§3–5, 9 (APIs) and Part B §§10–13, 15, D3 screens S-001–S-006, D4 design rules, D6 tasks and TCs.
6. `specs/002-intake-ai/` (spec, plan, research, data model, contract are done; `tasks` and `analyze` are not).

Work **one task per lane** (branch `phase2--obidit-<slug>` from `origin/phase2`). For each task:
1. tests first;
2. implement;
3. `npm run lint && npm run typecheck && npm test && npm run build`, plus `npm run test:db` if you touched SQL;
4. `fera-review`;
5. update your tracker row and evidence;
6. open a PR into `phase2`.

Stop and report after each PR.

## What you can do RIGHT NOW (nothing from Mahim is missing)

Do them in this order. Items 2 and 9 unblock Mahim, so treat them as priority.

1. **TASK-003: provider keys, `.env.example`, prices in `docs/costs.md` (1 h, Obidit by hand).**
   - Get the LLM keys (two providers) and the STT key.
   - Record real prices with their source and date, and put the variable *names* only in `.env.example`.
   - The default spend cap is USD 25 (AMD-AGENTS-5). Never commit keys.
   - This unblocks TASK-005, 013, 014 and 063 against real providers. Until then, build those against fake providers.
2. **TASK-023: output templates (GD + poster), wording guard, API-006 (COMP-010/016). Done when TC-005 and TC-024 pass.**
   - Dependency TASK-015 is **merged**.
   - Read the case with `readCase(principal, caseId, ctx)`. It checks ownership and returns the right projection. Never use raw rows.
   - The wording guard enforces honest copy: no alert/rescue/legal claims, and "similarity", not probability.
   - **Unblocks Mahim's TASK-024 (S-004 outputs and poster PNG).**
3. **Spec-kit:**
   - finish `specs/002-intake-ai` with `/speckit-tasks` then `/speckit-analyze`;
   - write `specs/003-parent-outputs` through `/speckit-specify` → `clarify` → `plan` → `tasks`. S-004/S-005 task lines are owned by Mahim; label them so.
   - Stop between stages for a 5-minute human skim.
4. **TASK-012: normaliser (COMP-008). ≥30 unit tests: Bangla digits, time words, phone, district aliases, romaniser.**
   - Write the tests first (`tdd-guide`).
   - District aliases need Masnun's TASK-009 (64 districts). Until it lands, use a small typed fixture of 3–4 districts, then switch to the real data.
   - Review with `bengali-reviewer`.
5. **TASK-013: LLM adapter (COMP-007), two providers, Zod contract, evidence check, retry, fallback.**
   - Build it against fake providers now. Every extracted value carries a source span (`evidenceSpanSchema` in `src/contracts/draft.ts`), and an unknown value stays unknown.
   - Real calls come after TASK-003.
   - Review with `silent-failure-hunter`.
6. **TASK-063: atomic paid-call counters and reservations, replay handling, price sheet.**
   - Dependency TASK-062 is **merged**.
   - Use the existing SECURITY DEFINER functions `reserve_ai_call(draft uuid, upper_usd numeric)` and `settle_ai_call(reservation uuid, actual_usd numeric)`. `fera_app` has EXECUTE on both.
   - The manual path must still work after a paid-call refusal.
   - Then **TASK-059** (`npm run spend` + cap check, TC-036) after 013.
7. **TASK-014: speech adapter + API-001 (COMP-006). Done when TC-001 steps 1–3 pass.**
   - Dependency TASK-007 is **merged**.
   - Build the route with `defineRoute({ api: "API-001", ... })`. The parent cookie is minted for you.
   - Use `readMultipart` (capped at `LIMITS.audioMaxBytes`; E-008 when too large) and check duration as BR-023 requires.
   - Use a fake STT provider until TASK-003/005.
8. **TASK-020: intake orchestrator + API-002 + question templates (COMP-009). Done when TC-003 passes.**
   - Depends on 013. API-002 also mints the parent cookie through `defineRoute`.
   - **Unblocks Masnun's TASK-026** (found-child log extraction).
9. **TASK-021 → TASK-022: parent screens S-001/S-002 (chat + recorder), then S-003 review + API-003.**
   - Use `impeccable` and the Paper surface. D4 parent rules apply: no red, ≥44 px targets, Bangla default, Bangla numerals.
   - You can build the UI now against typed fakes (`@/contracts/client-examples`). Wire the real APIs once 014 and 020 land.
   - **API-003 (submit):**
     - It calls `createMissingCase(principal, body, ctx)`, which is idempotent on the client submission ID plus payload hash. A changed payload is E-006 (OD-015-1).
     - Nothing is stored before the reporter confirms (review before submit).
     - **After a 2xx, clear the device draft and the `client_submission_id`.** This mitigates OD-015-4.
   - **TASK-022 unblocks Mahim's TASK-025 (S-005 manual form).**
10. **TASK-040 (recording):** collect 60 WER clips with 2–3 people and a consent note. This is human work; the run happens in Phase 3.

## What you CANNOT finish yet, and why
| Task | Waiting on | Owner |
|---|---|---|
| TASK-005 phone STT spike | TASK-003 keys (yours) | Obidit |
| TASK-012 district aliases (final) | TASK-009 districts | Masnun |
| TASK-033 demo-safe cache + 3 fixtures | TASK-019 seed loader, plus your TASK-020 | Masnun |
| TASK-035 Bangla copy for every state (Phase 3) | TASK-030 map, i.e. the screens existing | Masnun (030 also needs Mahim's 029) |
| TASK-047 13219 summary, TASK-049 edit after submit + S-006 + API-005, TASK-050 status API (Phase 3) | your TASK-023 / TASK-022 | Obidit |
| TASK-045 Round 2 video (Phase 4) | TASK-042 prod deploy | Mahim |

## What depends on Mahim
- **Nothing blocks you today.** TASK-007, 008, 015, 062 and 006 are all merged.
- **Mahim waits on you:**
  - TASK-023 → his TASK-024 (S-004 outputs + poster);
  - TASK-022 → his TASK-025 (S-005 manual form).
  - Tell him the moment each of those merges.
- Any change to `src/contracts/` or `db/schema_v2.sql` needs Mahim and Masnun to review it.

## Repo and deployments (Obidit runs these)
- Vercel: keep preview deploys for `phase2` PRs if the Hobby plan allows it. Mahim deploys manually under his own Vercel account (project `fera-ai`) because the team integration fails for him.
- Never set `DEMO_MODE=1` on a public deploy: it shows demo usernames on the sign-in page. The code also refuses this on Vercel.
- Hosted Supabase stays unused until Mahim's tasks are done. Then the team applies the schema and roles together. First check the hosted Postgres major version: the schema requires PG 16 with pgvector ≥ 0.8.1.

## Report back after each PR
- PR link and D6 task ID;
- test counts;
- TCs passed or not, with honest evidence;
- open decisions raised;
- whatever now unblocks Mahim or Masnun.
