# Phase 2 — Must core build · Gate G2

**Window:** Tue 13 Oct 2026, 08:00 → 23:00 (Asia/Dhaka) · **Gate:** G2 · **Plan:** [EXECUTION_PLAN.md](EXECUTION_PLAN.md#phase-2--must-core-build-tue-13-oct-0800--2300--gate-g2) · **Prev:** [Phase 1](PHASE_1_SPECS_CONTRACTS.md) · **Next:** [Phase 3](PHASE_3_FULL_SCOPE_QUALITY.md)
**Phase status:** `todo`
**Last updated:** 2026-10-13 · tasks distributed among Obidit, Masnun and Mahim; lead = Mahim
**Team:** **Obidit** — intake, AI, outputs · **Masnun** — data, matching, officer workflow, dashboard, evaluation · **Mahim** — lead; platform, integration, release (named "Sadman" in AGENTS.md and the spec pack; D6 owner code S). Tasks follow [EXECUTION_PLAN.md](EXECUTION_PLAN.md). The lead approves cuts and reschedules, records organiser and mentor decisions, and runs `fera-gate`.

---

## How to work this file (Claude Code · Codex · Antigravity)

This is a living tracker. Every agent working on a task in this phase updates it **in the same branch as the work**.

1. Read [AGENTS.md](../../AGENTS.md), then this file, then the spec-pack sections named in your row. All times are Asia/Dhaka.
2. Pick a `todo` row in your owner's lane whose dependencies are `done`. Set it to `doing` and fill in the lane and tool.
3. Work in a lane worktree (`scripts/agents/new-lane.sh <feature> <lane>`) and stay inside the owner's paths ([ownership map](../../AGENTS.md#repo-layout-and-ownership)).
4. When you open the PR, set the row to `review` with the PR link. After the merge, set it to `done` and fill in **Evidence**: the command and its result, a URL or a file path. A task without evidence is not done.
5. If you are stuck, set the row to `blocked`, say what blocks it in Evidence, and add a log line.
6. Edit only the rows in **your own person table** and **your log section**, so parallel lanes don't conflict. Never tick a gate box yourself. Gate boxes are ticked from the `fera-gate` report in [docs/gates/](../gates/).

**Status values:** `todo` · `doing` · `review` · `done` · `blocked` · `cut`. Use `cut` only with approval from the lead (Mahim) and in the [D6 §11](../spec/D6_Implementation_Plan_V2.md#11-recommendation) cut order. Never cut review-before-submit, officer confirm, referral, audit or redaction.

| Action | Claude Code | Codex | Antigravity / any other agent |
|---|---|---|---|
| Spec-kit stage | `/speckit-<stage>` | `$speckit-<stage>` | Open `.agents/skills/speckit-<stage>/SKILL.md` and follow it step by step |
| Skill (`fera-review`, `fera-gate`, `verification-loop`, `impeccable`, …) | `/<skill>` | `$<skill>` | Read `.agents/skills/<skill>/SKILL.md` and follow it |
| Reviewer (`fera-safeguarding-reviewer`, `database-reviewer`, …) | Subagent from `.claude/agents/<name>.md` | Role from `.codex/agents/<name>.toml` | Start a separate read-only agent and give it `.claude/agents/<name>.md` as its brief |

**Per-PR loop:** implement (`/speckit-implement T0xx-T0yy` or a TASK-scoped prompt) → `verification-loop` → `fera-review` (always includes `fera-safeguarding-reviewer`) → fix every BLOCK → owner skims and merges → other lanes rebase. Merge at least every 2–3 h.

---

## Critical path checkpoints
contracts → **TASK-015** case service → **TASK-017** matcher → **TASK-028** match review → **TASK-029** close → **TASK-030** map.

| Checkpoint | Due | Status | If late |
|---|---|---|---|
| TASK-015 case service API merged | **13 Oct 12:00** | `todo` | Mahim drops Lane C until it lands; other lanes code against `src/contracts` types with typed fakes |
| TASK-017 matcher merged | after TASK-015 | `todo` | Masnun Lane B builds S-009/S-010 against typed fake candidates |
| TASK-028 → 029 → 030 merged | before G2, 13 Oct 23:00 | `todo` | Report at the 23:00 stand-up with remaining hours |

## Schedule reality (pre-execution audit, 12 Oct)
On D6 estimates, the serial chains don't fit before G2 (23:00):
- Officer chain after the case service: TASK-017 (7) → 027 (3) → 028 (6) → 029 (5) → 030 (5) = **26 h** from 12:00.
- Intake chain: TASK-012 (5) → 013 (7) → 020 (4) → 021 (7) → 022 (5) = **28 h** from 08:00.

Rule for all lanes: **UI and integration lanes do not wait for backend tasks.** They start at 08:00 against the `src/contracts` DTO examples as typed fakes, and swap to the real API when the backend row is `done`:
- Obidit Lane C builds S-001/S-002/S-003 against API-001/002/003 fakes. Run TASK-023 first, as soon as TASK-015 lands.
- Masnun Lane B builds S-007/S-009/S-010/S-011 against API-007/008/009/010/012 fakes.
- Mahim Lane B builds S-012 against API-011/013 fakes.

A fake-backed screen counts as `review`, not `done`. It becomes `done` only once its TC passes against the real service. Report the remaining chain hours at every stand-up. If the 18:00 stand-up shows G2 can't be met, the lead (Mahim) applies the D6 §11 cut order or moves the item, with a log line.

## Who does what

| Person | Lane A (Codex) | Lane B (Claude Code) | Lane C | D6 hours |
|---|---|---|---|---|
| **Obidit** | TASK-012 normaliser → 013 LLM adapter → 063 counters → 059 spend | TASK-014 speech → 020 orchestrator → 033 demo cache | TASK-023 templates first, then 021 S-001/S-002 → 022 S-003 + submit (impeccable) · evening TASK-040 clip recording | 41 |
| **Masnun** | TASK-016 embeddings → 017 matcher → 018 duplicates → 019 seed | TASK-026 S-007 → 027 S-009 → 028 S-010 confirm/reject → 030 S-011 map (impeccable) | TASK-011 50 labelled reports (Obidit reviews) · TASK-039 eval scaffold | 37 |
| **Mahim** (lead) | TASK-007 API layer → 062 invariants → 015 case service (**by 12:00**) | TASK-006 auth → 031 S-008/S-016 → 029 S-012 close + audit | TASK-024 S-004 + poster → 025 S-005 → 032 S-013 admin (impeccable) | 34 |

Lane C for Obidit starts with TASK-023 as soon as TASK-015 lands, because S-001–S-003 wait on the long intake chain (see Schedule reality).

### Cross-person handoffs (the merge that unblocks someone else)
| When this merges | Owner | It unblocks |
|---|---|---|
| TASK-007 API layer | Mahim | Obidit TASK-014 |
| TASK-062 invariants | Mahim | Obidit TASK-063 |
| TASK-015 case service (**12:00**) | Mahim | Obidit TASK-022/023 · Masnun TASK-017/026 |
| TASK-008 shell (Phase 1) | Mahim | Obidit TASK-021 |
| TASK-020 orchestrator | Obidit | Masnun TASK-026 |
| TASK-019 seed | Masnun | Obidit TASK-033 |
| TASK-022 S-003 | Obidit | Mahim TASK-025 |
| TASK-023 templates | Obidit | Mahim TASK-024 |
| TASK-028 S-010 confirm | Masnun | Mahim TASK-029 |
| TASK-029 S-012 close | Mahim | Masnun TASK-030 |

When one of these merges, tell the waiting person straight away; they rebase and swaps their typed fake for the real call.

### Lead duties — Mahim
- Chair the 09:00, 13:00, 18:00 and 23:00 stand-ups and fill the table below with `fera-gate G2 standup`.
- At **12:00**, check that TASK-015 is merged; if it isn't, confirm the Lane C pause and the typed-fake fallback.
- At **18:00**, decide on cuts or moves (D6 §11 / AMD-PLAN-4) if G2 can't be met, and log the decision.
- Record mentor and organiser answers (DEP-010, OQ-003/OQ-010) in the mentor-fix table below.
- Run `fera-gate G2` at 23:00 and link the report.

## Tasks — Obidit
| ID | Task | Lane · tool | Deps | h | Done when (D6) | Status | PR / commit | Evidence |
|---|---|---|---|---|---|---|---|---|
| TASK-012 | Normaliser: Bangla digits, time words, phone, district aliases, romaniser (COMP-008) | A · Codex + `bengali-reviewer` | TASK-009 | 5 | ≥30 unit tests pass | `todo` | | |
| TASK-013 | LLM adapter: 2 providers, Zod contract, evidence check, retry, fallback (COMP-007) | A · Codex + `silent-failure-hunter` | TASK-003, 012 | 7 | Extracts 10 sample texts; fallback test passes | `todo` | | |
| TASK-063 | Atomic paid-call counters/reservations, replay handling, price sheet | A · Codex | TASK-003, 062 | 2 | Replay/concurrency/budget checks; manual path survives paid refusal | `todo` | | |
| TASK-059 | `npm run spend` + spend cap check (DECISION-017) | A · Codex | TASK-013, 063 | 1 | TC-036 passes | `todo` | | |
| TASK-014 | Speech adapter + API-001 (COMP-006) | B · Claude Code | TASK-005, 007 | 3 | TC-001 steps 1–3 pass | `todo` | | |
| TASK-020 | Intake orchestrator + API-002 + question templates (COMP-009) | B · Claude Code | TASK-013 | 4 | TC-003 passes | `todo` | | |
| TASK-033 | Demo-safe cache + fixtures for 3 cases + cached badge (COMP-017/048) | B · Claude Code | TASK-020, 019 | 3 | TC-021 passes on laptop | `todo` | | |
| TASK-023 | Output templates GD/poster + wording guard + API-006 (COMP-010/016) | C · Claude Code | TASK-015 | 4 | TC-005, TC-024 pass | `todo` | | |
| TASK-021 | S-001/S-002 intake chat + recorder (COMP-024–027) | C · Claude Code + `impeccable` | TASK-008, 014, 020 | 7 | Voice and text paths work on phone | `todo` | | |
| TASK-022 | S-003 review + API-003 + draft persistence (review-before-submit) | C · Claude Code + `impeccable` | TASK-015, 021 | 5 | TC-004, TC-031 pass | `todo` | | |
| TASK-040 (record) | 60 WER clips recorded, 19:00–22:00, with 2–3 friends | human | TASK-014 | — | 60 clips stored with consent note; run happens in Phase 3 | `todo` | | |

## Tasks — Masnun
| ID | Task | Lane · tool | Deps | h | Done when (D6) | Status | PR / commit | Evidence |
|---|---|---|---|---|---|---|---|---|
| TASK-016 | Embedding service + `npm run reembed` (COMP-011) | A · Codex | TASK-004 | 3 | 200 records embedded | `todo` | | |
| TASK-017 | Matcher: BR-017 filters, national cosine, bonuses, qualify-or-abstain, template reasons (COMP-012) | A · Codex + `mle-reviewer` | TASK-015, 016 | 7 | TC-009 passes; first recall@5 printed (dev split only) | `todo` | | |
| TASK-018 | Duplicate detector; shared phone only a weak cue (COMP-013) | A · Codex | TASK-016 | 3 | TC-013 passes | `todo` | | |
| TASK-019 | Seed loader with synthetic labels and 3 demo cases | A · Codex | TASK-010 | 2 | `npm run seed -- --set demo` < 2 min | `todo` | | |
| TASK-026 | S-007 found-child log + API-007 (COMP-034) | B · Claude Code + `impeccable` | TASK-015, 020 | 3 | TC-008 passes | `todo` | | |
| TASK-027 | S-009 queue + API-008 (COMP-035/036) | B · Claude Code + `impeccable` | TASK-017 | 3 | Queue lists seeded candidates | `todo` | | |
| TASK-028 | S-010 match review + API-009/010, one-transaction confirm, reject with reason | B · Claude Code + `database-reviewer` | TASK-017, 027 | 6 | TC-010 (confirm part), TC-011 pass | `todo` | | |
| TASK-030 | S-011 map + table + API-012 (COMP-040/041) | B · Claude Code + `impeccable` | TASK-009, 029 | 5 | TC-012 passes | `todo` | | |
| TASK-011 | 50 hand-labelled reports (reviewed by Obidit) | C · human | — | 5 | `eval/data/labelled.jsonl` reviewed by Obidit | `todo` | | |
| TASK-039 (scaffold) | Eval harness scaffold; dev split only | C · Codex + `mle-reviewer` | TASK-011, 017, 018, 064 | — | Smoke run prints metrics with denominators | `todo` | | |

## Tasks — Mahim (lead)
| ID | Task | Lane · tool | Deps | h | Done when (D6) | Status | PR / commit | Evidence |
|---|---|---|---|---|---|---|---|---|
| TASK-007 | API layer: error envelope E-001–E-024, Zod helpers, request ID, rate limiter (COMP-021) | A · Claude Code | TASK-001 | 4 | Unit tests for envelope and limiter | `review` | branch `phase2--mahim-api`, HEAD `a054767` on contracts `edb6a4d` (no PR yet) | `src/app/api/_shared/` + `/api/health`; `tests/api/` 179 cases (envelope + fallback, E-022/E-024 never sent, E-001 field paths, body/multipart caps, abort → E-001, server request ID, E-002/E-003, record-route E-004 + access.denied audit, audit failure → E-021, per-role strict DTOs, cookie seam, same-origin incl. scheme, limiter window/reset/E-007/E-013/bounded store, address trust, log redaction); lint/typecheck/test (479 pass, 1 skipped)/build exit 0. fera-review round 1 BLOCK fixed; re-review pending. **Gate:** no paid route ships on the memory limiter store (API-OD-1). Open decisions API-OD-1–7 in `specs/001-platform-foundation/contract-notes.md`; resolver waits for TASK-006, audit hook for TASK-015. |
| TASK-062 | Schema invariants, restricted runtime role, full related-payload redaction | A · Codex | TASK-002, TASK-061 | 4 | Negative and positive lifecycle/redaction checks | `review` | lane `phase2--mahim-invariants` (not merged) | [platform-db-invariants.md](evidence/platform-db-invariants.md): `npm run test:db` 66/66 on local PG16.15 + pgvector 0.8.1 (platform 48 incl. golden privilege matrix, redaction 18). DB-level only: app/API parts of TC-016/046/052/053/062 pending TASK-015/routes; hosted UNKNOWN; CI `db` job not run. 2 schema gaps (SECURITY INVOKER, mitigated provisionally by OD-062-2 — needs all-owner review; deactivated resolver OD-062-3), schema unchanged. PR adds pg 8.23.1 + @types/pg 8.23.1 |
| TASK-015 | Case service, state guard, audit, versions (COMP-014/015) — **by 12:00** | A · Claude Code + fera-review (5 reviewers) | TASK-007, 061, 062 | 6 | TC-032 and TC-016 pass | `review` | branch `phase2--mahim-case`, PR #11 (round-2 fixes `4ad5ee3`) | [platform-case-service.md](evidence/platform-case-service.md): `src/server/case/` (create missing/found with UUID+hash idempotency → E-006, openCase, owner edit with `case_versions` + versions, app state guard mirroring the trigger with `check_violation` → E-005, one-transaction confirm/reject with verified-officer share lock + sorted-UUID neighbourhood locks + competitor voiding + referral (simulation) + reconciliation, close E-017/E-005, API-004 read) and `src/server/audit/` (allowlisted actions/details; `access.denied` hooks installed in `defineRoute` and `requireRole`). lint/typecheck/build exit 0; `npm test` 772 pass ×2 (70 in `tests/case/`); `npm run test:db` 116/116 (case 37: TC-032 SQL `check_violation` ×2 + service E-005, TC-016 audit rows for confirm/referral/close, audit UPDATE/DELETE/TRUNCATE and 11 guard-alter attempts refused to `fera_app`, TC-029/046/053, concurrent confirms without deadlock at `attempts: 1`, LockSetChanged retry, deferred refusal at SET CONSTRAINTS, re-close E-005, refusal audits, idempotent submit, edit). No routes (consumers own them; API-010 service ready for TASK-028). Open decisions OD-015-1–17 in `specs/001-platform-foundation/contract-notes.md`. fera-review round 1: PASS, WARN fixes in `ada7429`; re-review pending. |
| TASK-006 | Credentials session (custom, OD-006-1: Auth.js replaced, needs all-owner sign-off + docs PR before merge), parent cookie, `requireRole`, seeded users | B · Claude Code + `security-reviewer` | TASK-002 | 5 | TC-023 passes | `review` | branch `phase2--mahim-auth`, PR #9 | [platform-auth.md](evidence/platform-auth.md): DB principal resolver (user row / parent_sessions re-read per request, parent cookie minted only on API-001/002), HMAC-signed 8 h session, argon2id (NFC, min 10), API-020 sign-in/out (generic E-002, failure-only E-007 with in-flight reservation), `requireRole` with fail-closed page-denial audit hook (TASK-015 installs it), `npm run seed:users` (explicit passwords outside plain local dev). lint/typecheck/build exit 0; `npm test` 616 pass (111 auth); `npm run test:db` 79/79 (auth 13). TC-023 role/verification parts pass; the brute-force limit holds per instance only (OD-006-3); record E-004 + access.denied row wait for TASK-015. fera-review round 1: 2 BLOCK + 6 WARN fixed, re-review pending. Adds `@node-rs/argon2` 2.2.1. |
| TASK-031 | S-008 sign-in + S-016 not-found | B · Claude Code | TASK-006 | 2 | TC-022 passes | `review` | branch `phase2--mahim-signin`, PR #12 | [platform-signin.md](evidence/platform-signin.md): S-008 (COMP-047) calls API-020 via a tested pure state machine (15 s timeout, generic E-002, E-007 seconds in Bangla numerals), returns to the same URL inside the role's own area else the D3 §1 role home (unverified officer → `/staff`), `DEMO_MODE=1` + not-Vercel usernames-only `[MOCK]` hint; S-016 (COMP-045) is the root not-found, identical for E-003/E-004, heading focused, localised title; `border-control` token ≥ 3:1 (D4 §6); frame headers. lint/typecheck/build exit 0; `npm test` 932 pass (twice); `test:db` 117/117. fera-review round 1: a11y BLOCK and WARNs fixed, re-review pending. **TC-022 not yet passing:** needs API-004/API-009; browser steps pending TASK-038. Open decisions OD-031-1–5, 7. |
| TASK-029 | S-012 case detail, close, audit + API-011/013 | B · Claude Code | TASK-028 | 5 | TC-010 full passes | `todo` | | |
| TASK-024 | S-004 outputs + poster PNG (COMP-030/031) | C · Claude Code + `impeccable` | TASK-023 | 3 | TC-006 passes | `todo` | | |
| TASK-025 | S-005 manual form fallback (COMP-032) | C · Claude Code + `impeccable` | TASK-022 | 2 | TC-017 passes | `todo` | | |
| TASK-032 | S-013 admin: redact payloads + verify [MOCK] + API-016/017 | C · Claude Code | TASK-015 | 3 | TC-015 passes | `review` | branch `phase2--mahim-admin` | [platform-admin.md](evidence/platform-admin.md): S-013 (COMP-043) at `/admin` (admin only): eligible summary, typed "বেনামী" confirmation, D3 empty/success states with Bangla numerals, `[MOCK]` officer verification list, planned import slot. API-016 via existing `redactCases` (fera_redactor; `redact_case` audits each case), API-017 [MOCK] one transaction + `user.verification_changed` audit, API-021 AdminUserView + signed cursor. **TC-015 passes locally** (`tests/db/admin.test.ts`: 2 redacted, 1 active linked evidence skipped, related payload cleared, counts unchanged). fera-review: safeguarding, security, database, bengali PASS; a11y and react BLOCKs fixed (focus, announcements, `lang="bn"`, 70 s redaction wait, refresh after every outcome). After fixes: lint/typecheck 0, `npm test` 1024 pass, `test:db` 128/128. Open decisions OD-032-1–12 (OD-032-1: verification audit has no target, needs contracts). |

**Reviewer focus today:** `database-reviewer` + `fera-safeguarding-reviewer` on every case-service and confirm PR; `bengali-reviewer` on the normaliser and intake copy; `silent-failure-hunter` on the AI adapter and fallbacks; Codex second-opinion review on Claude-written confirm, permission and extraction PRs.

## Stand-ups (15 min, then merge window)
| Time | Gate status | Merged since last | Blockers | Remaining h Obidit / Masnun / Mahim |
|---|---|---|---|---|
| 09:00 | | | | |
| 13:00 | | | | |
| 18:00 | | | | |
| 23:00 | | | | |

## Mentor session 2 fixes (feed TASK-056, executed in Phase 3)
| # | Fix | Area owner (Obidit / Masnun / Mahim) | Status |
|---|---|---|---|
| | | | |

Mahim (lead) fills this table from the mentor session; each fix goes to the owner of the area it touches.

## G2 exit checklist
Tick only from the gate report (`fera-gate`), with evidence linked. Run on the **preview deploy** with `npm run seed -- --set demo`.
- [ ] TC-001 voice → editable Bangla transcript
- [ ] TC-002 text → draft, unknowns explicit
- [ ] TC-003 one question per missing field
- [ ] TC-004 no child case row before submit
- [ ] TC-005 GD draft
- [ ] TC-006 poster PNG, no photo
- [ ] TC-007 13219 summary (TASK-047 is scheduled in Phase 3; if it isn't done, record it as an open item here, not a pass)
- [ ] TC-008 found log, no candidates shown to staff
- [ ] TC-009 Rafi tops the queue
- [ ] TC-010 confirm → simulated referral → close
- [ ] TC-011 reject with reason, pair not re-suggested
- [ ] TC-012 district counts = SQL counts
- [ ] Mentor fixes listed above as TASK-056 items

**Gate report:** _(link `docs/gates/G2-*.md`)_ · **Result:** _pending_

## Log
Format: `- YYYY-MM-DD HH:MM · <tool> · <lane> · <ID> <status change or note>`

### Obidit
### Masnun
### Mahim (lead)
- 2026-10-14 17:35 · Claude Code · mahim-api · TASK-007 `todo` → `review`; shared API layer and 92 tests at `a33d9af`; in-memory limiter, real principal resolver waits for TASK-006.
- 2026-10-14 18:40 · Claude Code · mahim-api · TASK-007 stays `review`; fera-review BLOCK (record-route E-004 + denial audit) and WARNs fixed at `a054767`, 179 API tests; re-review pending.
- 2026-10-14 23:55 · Claude Code · mahim-invariants · TASK-062 `todo` → `review`; db/roles.sql + db:reset wiring, test:db (per-run fera_test_* DBs) 59/59 pass, src/server/admin/redact.ts, evidence in platform-db-invariants.md; hosted host and CI db job pending.
- 2026-10-15 00:15 · Claude Code · mahim-invariants · TASK-062 stays `review`; fera-review fixes: SECURITY DEFINER service functions in roles.sql (OD-062-2, all-owner review), narrower grants + golden matrix, roles.sql transaction/drift/timeouts/password checks, redact.ts hardening, digest-pinned Dockerfile; test:db 66/66.
- 2026-10-15 00:45 · Claude Code · mahim-auth · TASK-006 `todo` → `review`; resolver, session, API-020, seed:users at `ee76e12`; test 593 / test:db 79 pass; OD-006-1 (no Auth.js) for all-owner review; security review pending.
- 2026-10-15 01:00 · Claude Code · mahim-auth · TASK-006 stays `review`; fera-review BLOCKs (page-denial audit, open redirect) and WARNs fixed; test 616 / test:db 79 pass; re-review pending.
- 2026-10-15 05:02 · Claude Code · mahim-case · TASK-015 `todo` → `review`; case service + audit logger + denial hooks at `e0879e8`; test 760 / test:db 113 (case 34) pass; TC-032 and TC-016 pass locally; OD-015-1–13 for owner review; fera-review pending.
- 2026-10-15 05:26 · Claude Code · mahim-case · TASK-015 stays `review`; fera-review round 1: PASS, WARN fixes at `ada7429` (command-only barrel + internal.ts, officer-only terminal steps, *.refused audits after rollback, handler E-003 audited, safe tx logging, typed row decoding); test 772 ×2 / test:db 116 (case 37) pass; OD-015-14–17 added.
- 2026-10-15 10:52 · Claude Code · mahim-case · TASK-015 stays `review`; fera-review round 2 (safeguarding + security on the fixes): PASS; lint boundary for case internals, refusal-audit retry/log, seed provenance shape; test 772 / test:db 117 (case 38).
- 2026-10-15 11:21 · Claude Code · mahim-signin · TASK-031 `todo` → `review`; S-008 sign-in + S-016 not-found, test 803 pass (101 new), lint/typecheck/build exit 0; impeccable finish review `fix` applied; TC-022 waits for API-004/009 + TASK-015, browser steps TASK-038; test:db blocked by unresponsive local DB.
- 2026-10-15 11:56 · Claude Code · mahim-signin · TASK-031 stays `review`; merged origin/phase2 (TASK-015 audit hook is the default: wrong-role page → S-016 + 404); fera-review round 1: a11y BLOCK fixed, WARNs fixed; test 932 / test:db 117 pass; re-review pending.
- 2026-10-15 12:03 · Claude Code · mahim-signin · TASK-031 stays `review`; fera-review round 2 (a11y + safeguarding on the fixes): PASS; return-note wording (OD-031-7), whitespace/demo-fill reducer fixes, stricter border-token test.
- 2026-10-15 17:29 · Claude Code · mahim-admin · TASK-032 `todo` → `review`; S-013 + API-016/017/021 at `0bbb798`; TC-015 passes locally; test 1021 (87 new) / test:db 128 (admin 11) pass; lint/typecheck/build exit 0; fera-review and Playwright pending.
- 2026-10-15 21:19 · Claude Code · mahim-admin · TASK-032 rebased onto `0617b4c` (code `6213a07`); fera-review BLOCKs (a11y 2, react 3) fixed; test 1024 / test:db 128 pass; PR into `phase2` opened; Playwright pending.

## Audit amendments (2026-10-12)

### AMD-2-1 — Entry and complete Must gate
**Gap:** G2's TC-001–012 range includes optional TC-007 yet omits mandatory safeguards.
**Change:** entry requires G1 contract/manifest evidence and completed D6 dependencies for each integrated task. G2's required happy-path set is TC-001–006 and TC-008–012; TC-007 stays a Phase 3 optional item and never causes a false Must PASS or a false Must failure. In addition to those boxes, require:
- [ ] TC-013/038: duplicate detection, shared-contact hard negatives and independently visible reports (FR-022).
- [ ] TC-015/016/028/050/051/062: terminal related-payload redaction, safe append-only audit and target PG16/runtime privileges (FR-021/025).
- [ ] TC-017/036/043/065: manual fallback, six-call/replay and atomic spend refusal (FR-026, BR-023, NFR-016).
- [ ] TC-021/057: full network-off scripted journey, all roles on one local DB, bundled assets and visible cache/synthetic labels (FR-027/032, STORY-023).
- [ ] TC-022–027/044/052/060: roles, verified-officer authority, wording/no-photo/data minimisation, safe denied access and provider notice (FR-020/034/035/037).
- [ ] TC-029–032/039–042/046–049/053–055: current-version lifecycle, uncertainty/abstention, idempotency and durable matching failure/retry. TC-049 checks the terminal lock even when optional editing is not built.
Record each applicable service/integration run; a companion check or typed fake cannot tick a box. TC-045 optional editable-read and other optional screens are accounted for at G3 if implemented.
**Source:** D1 §8; D6 §8 and V2 additional acceptance cases; handover §§4–5.

### AMD-2-2 — Offline core, dependency order and late work
**Gap:** TASK-033 claims TC-021 while the local whole-journey setup appears only in Phase 5.
**Change:** P2 TASK-033 coordinates cache/fixtures (Obidit), local app/DB/auth (Mahim) and model/seed/map assets (Masnun) using the P0 local DB so FR-027/STORY-023 can pass by G2; P3 TASK-038 repeats the integrated offline test before G4. P5 TASK-053 hardens/packages that baseline and must not absorb this implementation. If offline proof is missing, keep G2/G4 blocked and disclose the omission.
The full decision chain includes TASK-027 between matcher and review. Fake-backed UI can begin early, but all row dependencies must pass before completion. Add the P1 manifest freeze as an explicit prerequisite of matcher tuning; no new cyclic dependency is introduced.
Late tasks retain their original phase, owner and estimate; Phase 5 may link them, never relocate or close them. Cuts follow AMD-PLAN-4 and remain recorded FR/TC omissions.
**Source:** D1 FR-027/STORY-023; D6 TASK-033/038/053, §§9.4,11; handover §§6,8.

### AMD-2-3 — External dependencies and recordings
**Gap:** DEP-010 and volunteer availability were assumed.
**Change:** Mahim (lead) records mentor/organiser answers for OQ-003/OQ-010 (DEP-010 source due 13 Oct); mentor attendance/answers are UNKNOWN without evidence. TASK-040's 60 clips and 2–3 friends are planned, availability UNKNOWN; use invented scripts and consent, and count unique samples separately from repeated runs. Its recording and P3 run share the single D6 3 h estimate; re-estimates require evidence.
**Source:** D1 §15; D6 TASK-040/056; handover §§6–8.
