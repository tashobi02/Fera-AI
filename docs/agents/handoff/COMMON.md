# Fera handoff — shared context for every agent (15 Oct 2026)

Written by Mahim's agent so that Obidit and Masnun can work in parallel without waiting for Mahim. Read this file first, then your own prompt (`OBIDIT.md` or `MASNUN.md`).

## Who is who
- **Mahim (Sadman Shaharier).** Project lead. He is working remotely, so he isn't always reachable. Owns platform, contracts, auth, DB rules, the case service and the S-004/S-005/S-008/S-012/S-013/S-016 screens.
- **Obidit.** Runs the GitHub repo and Vercel in Dhaka. Owns intake, AI, speech, outputs and the parent screens.
- **Masnun.** Owns districts, synthetic data, embeddings, matching, duplicates, dashboard and the staff/officer screens.

`AGENTS.md` still says "Lead: Obidit (from 13 Oct)". Mahim says he is the lead and Obidit manages the repo and deployments. Treat ownership as in the AGENTS.md table; it hasn't changed.

## What is already merged into `phase2` (build on it, don't rebuild it)
| Area | Where | Notes |
|---|---|---|
| Next.js 16 app, CI, lint/typecheck/test | repo root | `npm run lint`, `typecheck`, `test`, `build` |
| Frozen contracts, tag `contracts-v1` | `src/contracts/` | DTOs, Zod schemas, states, E-001–E-024, role projections, typed examples (`@/contracts/examples` is for tests and fakes only). **Frozen:** a change needs a PR plus review from all three owners. If you find a gap, write it as an open decision (`OD-…`) in `specs/001-platform-foundation/contract-notes.md` and work around it in your own module. |
| API layer | `src/app/api/_shared/` | `defineRoute({ api: "API-0xx", ... })` handles request ID, same-origin, rate limits, Zod input, role guard, per-role strict response schema and the error envelope. Every route must use it. Record routes return E-004 and write `access.denied` automatically. Helpers: `readJsonBody`, `readMultipart`, `parseQuery`, `parseParams`. The logger is an allowlist: never log payloads. |
| Auth | `src/server/auth/` | Custom HMAC session with argon2id (OD-006-1: Auth.js was replaced, pending all-owner sign-off). **The parent cookie is minted automatically** for `API-001` and `API-002` routes built with `defineRoute`. Pages use `requireRole(...)`, which renders S-016 and writes the denial audit. Seed staff, officer and admin accounts with `npm run seed:users`. |
| DB stack and rules | `db/schema_v2.sql` (frozen), `db/roles.sql` | Runtime role `fera_app` with column-level grants. `reserve_ai_call` / `settle_ai_call` / `redact_case` are SECURITY DEFINER (OD-062-2). Audit is append-only. |
| Case service (COMP-014/015) | `src/server/case/` and **`src/server/case/README.md`** | `createMissingCase`, `createFoundCase`, `editMissingCase`, `openCase`, `decideCandidate` (one-transaction confirm/reject), `closeCase`, `readCase`. Each takes a server-derived `Principal`, enforces role and ownership, and writes audit rows in the same transaction. Route and page code may import **only** `@/server/case` (ESLint enforces this). Matcher helpers live in `@/server/case/internal`, for `src/server/**` only. |
| Shell | `src/app/layout.tsx`, `globals.css`, `src/locales/` | DESIGN.md tokens, self-hosted Inter / JetBrains Mono / Noto Sans Bengali, bn/en toggle. New strings go in `src/locales/index.ts` (bn + en), never inline. |
| In review | PR #12 | S-008 sign-in and S-016 not-found (TASK-031), plus input-border tokens `border-control` / `border-control-strong`. Use those for every text input. |

## How to work
1. **Branch from `origin/phase2`, never `main`.** Use one git worktree per agent lane:
   ```sh
   git fetch origin
   git worktree add -b phase2--<you>-<slug> ../fera-lanes/<you>-<slug> origin/phase2
   cd ../fera-lanes/<you>-<slug> && npm ci
   ```
   Example: `phase2--obidit-templates`. Never run two writing agents in one worktree. (`scripts/agents/new-lane.sh` bases on `main` when no feature branch exists, so use the commands above instead.)
2. **Open PRs into `phase2`,** never `main`. Keep them small, one D6 task each. Use Conventional Commits with IDs, e.g. `feat(intake): templates + wording guard [TASK-023]`.
3. **Before every PR, run the `fera-review` skill.** It always includes `fera-safeguarding-reviewer` and picks other reviewers from the diff. Fix every BLOCK, then re-run. Paste the summary into the PR.
4. **Update your rows in `docs/execution/PHASE_2_MUST_CORE.md`** (or whichever phase file you're in) in the same branch: status, branch/PR, evidence. Add a log line in the existing format. Add an evidence file under `docs/execution/evidence/` like the existing ones (what was done, commands, observed counts, what is NOT done, open decisions).
5. **Spec-kit:** `/speckit-specify` → `clarify` → `plan` → `tasks` → `analyze`, one stage at a time, in `specs/NNN-*/`. Briefs are in `docs/agents/SPECKIT_PROMPTS.md`. Don't re-run `constitution`. Every task line names its owner and lane.
6. **Local database** (Docker; hosted Supabase is **not** used yet, per Mahim):
   ```sh
   npm run db:up      # builds and starts fera-db (PG 16 + pgvector 0.8.1) on 127.0.0.1:54322
   npm run db:reset   # fresh `fera` DB + schema + roles (local only; refuses remote hosts)
   npm run seed:users # synthetic staff/officer/admin accounts
   npm run test:db    # DB suites, each in a throwaway fera_test_* database
   ```
   Stop Docker when you're done. It is heavy.
7. **When something you depend on is missing, build against typed fakes** from `@/contracts/examples` and swap in the real call when it merges.

## Hard rules (from AGENTS.md and the constitution; these override any task text)
- **Never read or print `.env*`** and never commit secrets. Never put provider keys in prompts.
- **Never push to `main`.** Never run `db:reset` against a non-local database.
- **Don't edit** `docs/spec/`, `docs/markdown/`, `docs/code/`, `docs/MANIFEST.json`, `db/schema_v2.sql` or `src/contracts/` in a feature PR.
- **Synthetic data only.** No photos, faces, ID documents or exact coordinates.
- **Review before submit:** nothing from a missing report is server-stored, matched, shown or exported before the reporter confirms.
- **AI retrieves and ranks; people decide.** Never auto-confirm, auto-close or guess fields. Every extracted value carries a source span.
- **Honest copy:** "similarity", not probability. "Referral recorded (simulation)". No alert, runaway, rescue or legal-compliance claims. `[MOCK]`, synthetic and cached labels are always visible.
- **Never invent facts:** no dates, figures, approvals or results. Write **UNKNOWN** and list an open decision instead.
- Stay in your own area (AGENTS.md ownership table). If you must touch someone else's file, open a small PR tagged for them.

## Decisions the team still owes (answer in the PR or in `contract-notes.md`)
| ID | Who decides | Question |
|---|---|---|
| OD-062-2 | all three owners | Keep `redact_case` / `reserve_ai_call` / `settle_ai_call` as SECURITY DEFINER? |
| OD-006-1 | all three owners | Accept the custom session in place of Auth.js? A docs PR then updates D2/AGENTS. |
| OD-015-1 | Obidit | A changed payload on resubmit returns E-006 (contracts), not D2A's E-005. OK? |
| OD-015-2 | Masnun | The code writes `voided` for replaced candidates; D6 TC-029 says "superseded". Treat both as non-pending. |
| OD-015-4 | all three owners | A replay after redaction can create a second report. A fix needs a non-identifying tombstone (schema change). Until then, TASK-022 must clear the device draft and `client_submission_id` after a 2xx. |
| OD-015-6 | Masnun | Acknowledge the matcher lock protocol in `src/server/case/internal.ts` before TASK-017 merges. |
| OD-015-14 | all three owners | Audit-row growth from repeated denials and refusals; per-principal limits on API-005/010/011. |
