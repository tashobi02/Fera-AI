# Fera handoff — shared context for every agent (15 Oct 2026)

Written by Mahim's agent so that Obidit and Masnun can work in parallel without waiting for Mahim. Read this file first, then your own prompt (`OBIDIT.md` or `MASNUN.md`).

## Who is who
- **Mahim (Sadman Shaharier), lead.** Owns platform, contracts, auth, DB rules, the case service and the S-004/S-005/S-008/S-012/S-013/S-016 screens. He isn't always reachable, so don't wait on him for anything this file already answers.
- **Obidit.** Owns intake, AI, speech, outputs and the parent screens. He also manages the GitHub repo and the team Vercel project.
- **Masnun.** Owns districts, synthetic data, embeddings, matching, duplicates, dashboard and the staff/officer screens.

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
| Sign-in and not-found | `src/app/(auth)/sign-in/`, `src/app/not-found.tsx` (PR #12) | S-008 and S-016 (TASK-031). Input-border tokens `border-control` / `border-control-strong` (D4 §13, ≥3:1): use them for every text input. |

## Knowledge graph (`graphify-out/`)
A knowledge graph of this repo, built on `phase2` on 15 Oct. It covers `src/`, `db/`, `scripts/`, `tests/`, `specs/`, `docs/spec/`, `docs/execution/`, the agent guides and the handoff docs. The vendored kits, PDFs and screenshots are excluded; `.graphifyignore` lists the scope.
- `graphify-out/GRAPH_REPORT.md`: start here. It lists the communities (e.g. "Case Commands", "Officer Decision Locks", "API Route Factory", "Contract Zod Schemas"), the god nodes, surprising cross-file links and suggested questions.
- `graphify-out/graph.html`: interactive view; open it in a browser.
- `graphify-out/graph.json`: raw graph for agents. With the graphify skill installed, ask `/graphify query "<question>"` before grepping (e.g. "what calls decideCandidate?", "which TCs does TASK-028 need?").
- After your PR changes code or docs, refresh it with `/graphify . --update`, which re-extracts only changed files. Keep the update as its own commit.

**The graph is a derived index, not a source of truth.** It repeats what each source file says, including statements later decisions overrode (for example Auth.js, replaced by OD-006-1, or PRODUCT.md's interview line, overridden by AMD-AGENTS-6). When it disagrees with the constitution, the spec pack, AGENTS.md/CLAUDE.md or their amendments, those win; check the source file before acting.

Known gaps: SQL files have no AST parser, so the schema and roles were extracted semantically. About 380 extracted edges referenced spec-pack nodes named differently in an older cache and were dropped at build time, so some spec-to-code links are missing.

## How to work
1. **Branch as described in "Where to branch from" below.** Never run two writing agents in one worktree.
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
7. **When something you depend on is missing, build against typed fakes**, then swap in the real call when it merges. UI and app code use `@/contracts/client-examples`. Tests and `fakes/` folders may also use `@/contracts/examples`; ESLint refuses it anywhere else.

## Where to branch from

**Base every new branch on `origin/phase2`.** It is the team's integration branch for Phase 2 and the only branch with the whole platform. As of 15 Oct it is at `8a96b59` and contains:
- the Phase 1 work (merged in through landing PRs, so the `phase1` branch itself isn't an ancestor): the scaffold and CI (TASK-001), the local DB stack (TASK-002), the contracts (TASK-061, tag `contracts-v1`) and the shell (TASK-008);
- Mahim's Phase 2 PRs: #4 API layer (TASK-007), #6 DB rules (TASK-062), #9 auth (TASK-006), #10 (lands #4 and #6), #11 case service (TASK-015), #12 sign-in and not-found (TASK-031);
- Obidit's specs `specs/002-intake-ai` (specify, clarify, plan).

Always `git fetch origin` first, so you branch from the latest `phase2`, not a stale local copy.

**Do not branch from:**
- `main` (`1c1ec6c` "Tasks Split"): docs and agent kit only, no app code;
- `phase1`: has none of the Phase 2 platform;
- any `phase*--mahim-*` lane branch: they are merged or Mahim's in-flight work;
- the old `phase0-local-tooling--lane-b` and `phase1-specs--lane-a`: already merged into `phase2`.

`scripts/agents/new-lane.sh phase2 <owner>-<slug>` also works: it creates `phase2--<owner>-<slug>` from `origin/phase2`. Don't call it with any other first argument, though. When no branch matches, it falls back to `main`.

**Naming:** `phase2--<owner>-<slug>`, one D6 task per branch. Examples: `phase2--obidit-templates` (TASK-023), `phase2--masnun-districts` (TASK-009). Spec-kit work gets its own branch, e.g. `phase2--masnun-spec004`.

**New lane (worktree; recommended for agents):**
```sh
cd <your Fera-AI clone>
git fetch origin
git worktree add -b phase2--<owner>-<slug> ../fera-lanes/<owner>-<slug> origin/phase2
cd ../fera-lanes/<owner>-<slug>
npm ci
# human step, only if you have one: cp <your Fera-AI clone>/.env.local .env.local   (never commit it, never open or paste it into a prompt)
```

Without worktrees: `git fetch origin && git switch -c phase2--<owner>-<slug> origin/phase2`. Then use only one agent at a time in that clone.

**First push:** `git push -u origin phase2--<owner>-<slug>`. Then open the PR: `gh pr create --base phase2`.

**When a task needs your own unmerged work** (for example TASK-010 needs your TASK-009 branch):
- Branch from that branch: `git worktree add -b phase2--masnun-synthetic ../fera-lanes/masnun-synthetic origin/phase2--masnun-districts`.
- Still open the PR with **base `phase2`**, and write "Depends on #N, merge #N first" at the top.
- Do **not** set the PR base to the other lane branch. Earlier, stacked PRs merged into lane branches instead of `phase2`, and the work had to be carried over by extra "landing" PRs.
- Merge #N with **"Create a merge commit"**, not squash or rebase. Then run `git fetch origin && git merge origin/phase2` in the dependent lane and push.
- If #N was squashed anyway, rebuild the dependent lane on the new `phase2`: `git rebase --onto origin/phase2 <last commit of #N's branch> <dependent branch>`, then push with `--force-with-lease` (your own branch only).

**Keep lanes current:**
- After any PR merges into `phase2`, run `git fetch origin && git merge origin/phase2` in each open lane.
- Use merge, not rebase, once a branch is pushed, so nobody has to force-push.
- Tracker conflicts in `docs/execution/PHASE_*.md` are normal: keep both sides' rows and put log lines in time order.

**Finished lanes:** after the PR merges, remove the worktree with `git worktree remove ../fera-lanes/<owner>-<slug>` and delete its `node_modules` to save disk.

## Hard rules (from AGENTS.md and the constitution; these override any task text)
- **Never read or print `.env*`** and never commit secrets. Never put provider keys in prompts. The one exception (AMD-CLAUDE-2): `.env.example` is a nonsecret template of variable *names* that you may read and edit. Real keys are typed by a human into `.env.local`, which an agent never opens, prints or commits. The app may load it at runtime.
- **Never push to `main`.** Never run `db:reset` against a non-local database.
- **Don't edit** `docs/spec/`, `docs/markdown/`, `docs/code/`, `docs/MANIFEST.json`, `db/schema_v2.sql` or `src/contracts/` in a feature PR.
- **Synthetic data only.** No photos, faces, ID documents or exact coordinates.
- **Review before submit (constitution §I, BR-004, BR-023):** "No missing-report payload is stored, matched, shown to another party or exported before the reporter reviews and confirms it. Providers may process audio/text only after the on-screen notice. Before submit, the server stores only expiry, counter, hash and cost metadata. Submission is idempotent on a client UUID." Review is device-local. Each draft may dispatch at most six paid transcribe/extract calls, including retries and fallbacks, enforced through `reserve_ai_call`.
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
| OD-015-2 | Masnun, then all three owners | The code writes `voided` for replaced candidates; D6 TC-029 says "superseded". Treat both as non-pending until decided. |
| OD-015-4 | all three owners | A replay after redaction can create a second report. A fix needs a non-identifying tombstone (schema change). **Proposed mitigation, not yet agreed:** TASK-022 clears the device draft and `client_submission_id` after a 2xx. |
| OD-015-6 | Masnun | Acknowledge the matcher lock protocol in `src/server/case/internal.ts` before TASK-017 merges. |
| OD-015-14 | all three owners | Audit-row growth from repeated denials and refusals; per-principal limits on API-005/010/011. |
