# Fera — Execution Plan (12–24 Oct 2026)

Team: **Sadman** (lead, platform, integration, release) · **Obidit** (intake, AI, outputs) · **Masnun** (data, matching, officer workflow, dashboard, evaluation).
Scope: **everything** — all 64 tasks in D6 (Must, Should, Could), ≈222 estimated hours. Times are Asia/Dhaka.

## The dates that matter
| When | What |
|---|---|
| Mon 12 Oct | Phases 0–1: setup, agent kit, specs, frozen contracts and data |
| 12–13 Oct | Mentor session 2 (fixes feed TASK-056) |
| Tue 13 Oct 23:00 | **G2** — the Must journey works end to end on the preview deploy |
| Wed 14 Oct 16:00 | **G4** — production deploy, frozen evaluation, full scope done |
| Wed 14 Oct 21:00 | **G5** — submission target (22:00 planning baseline; exact organiser instructions/extension UNKNOWN) |
| Thu 15 Oct | **G6** — buffer, leftovers, finale baseline. "Mostly done by the 15th" = everything shipped, 15th absorbs slippage |
| Sat 24 Oct | Finale at AIUB: 5–10 min + live demo |

**Live status per phase** (every agent updates its rows there): [Phase 0](PHASE_0_BOOTSTRAP.md) · [Phase 1](PHASE_1_SPECS_CONTRACTS.md) · [Phase 2](PHASE_2_MUST_CORE.md) · [Phase 3](PHASE_3_FULL_SCOPE_QUALITY.md) · [Phase 4](PHASE_4_SUBMISSION.md) · [Phases 5–6](PHASE_5_BUFFER_FINALE.md). This plan stays the schedule. The phase files hold status and evidence.

Round 2 is planned for 14 Oct; the user reports an extension, whose new cutoff is UNKNOWN. Keep the 14 Oct baseline until organiser instructions are recorded. Unfinished tasks retain their original phase and owner.

## Capacity, honestly
D6 estimates 184 h for the 52-task Round 2 baseline and 222 h for all 64 tasks. Actual owner availability, remaining effort and agent savings are UNKNOWN. Track evidence-backed remaining hours per person at stand-ups (`fera-gate`); see AMD-PLAN-1.

---

## How the multi-agent setup works

**Lanes.** A lane = one git worktree + one branch + one agent session working through a short task list. Each person runs **up to three lanes**: usually one Claude Code lane for UI (with the `impeccable` skill), one Codex lane for well-specified backend tasks, and one Claude Code lane for the next most important thing or for review fixes. Create lanes with `scripts/agents/new-lane.sh <feature> <lane>`.

**Who writes where.** One writer per path (ownership map in `AGENTS.md`). `src/contracts/` and `db/schema_v2.sql` freeze at G1; changing them later needs a PR reviewed by all three.

**Claude Code vs Codex.**
- Claude Code: spec-kit stages, UI screens (impeccable), cross-module integration, reviews via subagents.
- Codex: pure-logic modules with tight contracts and tests first (normaliser, matcher, state guard, counters, DTO projections, seed/generator), plus a **second-opinion review** of Claude-written PRs on the risky paths (confirm transaction, permissions, extraction contract).
- Swap freely if one tool is rate-limited; both read the same `AGENTS.md`, skills and reviewer roles.

**Review loop on every PR.** Agent finishes → `verification-loop` → `fera-review` (parallel reviewers, always including `fera-safeguarding-reviewer`) → fix BLOCKs → human owner skims and merges. Small PRs, merged at least every 2–3 hours, lanes rebased after each merge.

**Rhythm.** 15-minute stand-ups at **09:00, 13:00, 18:00, 23:00** (13–14 Oct): each person reports gate status, merged PRs, blockers, remaining hours. Merge windows right after each stand-up so integration breaks surface early.

**Spend.** Agent subscriptions are separate from the app's USD 30 API budget. Never put the app's provider keys in an agent session; use `.env.local` and the spend cap (TASK-059/063).

---

## Phase 0 — Bootstrap (Mon 12 Oct, now → 18:00) · Gate G0
| Who | Tasks | Agent use |
|---|---|---|
| Sadman | TASK-001 repo, CI, preview deploy · commit this agent kit · TASK-002 pick DB host, apply `schema_v2.sql` (local Docker + managed) | Claude Code: scaffold Next.js + CI; `database-reviewer` on schema apply |
| Obidit | TASK-003 provider keys, `.env.example`, prices in `docs/costs.md` · TASK-005 Android MediaRecorder → STT spike | Codex: tiny test scripts for each provider; no app code yet |
| Masnun | TASK-004 embedding spike (cold start, size, local vs API) · TASK-009 64 districts + neighbours | Codex: spike script + district loader |

**G0 exit:** CI green on `main`; agent kit committed (`CLAUDE.md`, `AGENTS.md`, `.claude/`, `.codex/`, `.agents/`, `.specify/`); schema applied locally and on the host with the HNSW index; both LLM providers and STT answer a test call; embedding decision written; 3 phone recordings transcribed; districts load.

## Phase 1 — Specs and frozen contracts (Mon 12 Oct 18:00 → 23:00) · Gate G1
| Who | Tasks | Agent use |
|---|---|---|
| Sadman | spec 001 + 007 · TASK-061 contracts (DTOs, Zod, states, error envelope, role projections) · TASK-008 shell, tokens, fonts, language toggle · cross-feature `/speckit-analyze` 22:30 | Claude Code: `/speckit-*`; `code-architect` for the contracts layout; `typescript-reviewer` |
| Obidit | specs 002 + 003 · start TASK-012 normaliser tests (Codex, tests first) | Claude Code: `/speckit-*`; Codex lane: `tdd_guide` on normaliser |
| Masnun | specs 004 + 005 + 006 · TASK-010 synthetic generator + TASK-064 manifest, **frozen and hashed before any matcher code** | Claude Code: `/speckit-*`; Codex lane: generator; `mle-reviewer` on the manifest |

Prompts: `docs/agents/SPECKIT_PROMPTS.md`. Stop for a 5-minute skim between specify → plan → tasks.

**G1 exit:** seven `specs/NNN-*/tasks.md` with owner and lane on every task, `/speckit-analyze` clean of critical issues; `src/contracts/` merged and tagged `contracts-v1`; ground-truth file and manifest hash committed; shell with Bangla rendering merged.

## Phase 2 — Must core build (Tue 13 Oct 08:00 → 23:00) · Gate G2
Critical path: contracts → case service (TASK-015) → matcher (TASK-017) → match review (TASK-028) → case detail/close (TASK-029) → map (TASK-030). Case service API must be merged by **12:00** because intake submit, found log and matching all call it.

| Who | Lane A | Lane B | Lane C |
|---|---|---|---|
| **Sadman** | Codex · TASK-007 API layer → TASK-062 invariants → TASK-015 case service, state guard, audit (**by 12:00**) | Claude · TASK-006 auth → TASK-031 S-008/S-016 → TASK-029 S-012 close + audit (after 028) | Claude + impeccable · TASK-024 S-004 + poster PNG → TASK-025 S-005 → TASK-032 S-013 admin |
| **Obidit** | Codex · TASK-012 normaliser → TASK-013 LLM adapter + evidence check → TASK-063 counters → TASK-059 spend | Claude · TASK-014 speech + API-001 → TASK-020 orchestrator → TASK-033 demo cache | Claude + impeccable · TASK-021 S-001/S-002 → TASK-022 S-003 + submit → TASK-023 templates + wording guard |
| **Masnun** | Codex · TASK-016 embeddings → TASK-017 matcher → TASK-018 duplicates → TASK-019 seed | Claude + impeccable · TASK-026 S-007 → TASK-027 S-009 → TASK-028 S-010 confirm/reject → TASK-030 S-011 map | Human-heavy · TASK-011 50 labelled reports (Obidit reviews) · scaffold TASK-039 eval harness |

Evening (19:00–22:00), Obidit + 2–3 friends record the **60 WER clips** (TASK-040) so the run can happen on the 14th.

Reviewer focus today: `database-reviewer` + `fera-safeguarding-reviewer` on every case-service and confirm PR; `bengali-reviewer` on normaliser and intake copy; `silent-failure-hunter` on the AI adapter and fallbacks.

**G2 exit:** TC-001 to TC-012 pass on the preview deploy with `npm run seed -- --set demo`: voice/text intake → follow-up → review → submit → GD/poster → found log → Rafi tops the queue → confirm with simulated referral → close → district counts change. Mentor-session fixes listed as TASK-056 items.

## Phase 3 — Full scope and quality (Wed 14 Oct 07:00 → 16:00) · Gates G3, G4
| Who | Features (Should/Could) | Quality and release |
|---|---|---|
| **Sadman** | TASK-056 mentor fixes (his areas) | TASK-034 a11y (axe, keyboard, 320 px, 200 %) · TASK-037 unit tests ≥60 · TASK-038 Playwright journey + safeguarding TCs · TASK-041 timing study with ≥5 testers (10:00–12:00) · **TASK-042 prod deploy + smoke by 15:00** |
| **Obidit** | TASK-047 13219 summary · TASK-049 edit after submit + S-006 · TASK-050 status API · TASK-056 (his areas) | TASK-035 Bangla copy for every state · TASK-040 WER run · prepare video shots |
| **Masnun** | TASK-048 fixture import · TASK-051 S-014 duplicate review · TASK-052 S-015 disaster mode · TASK-056 (his areas) | TASK-036 two Android phones · TASK-039 eval harness dev → held-out · TASK-060 perf check · **TASK-043 final frozen evaluation on the prod build by 15:45** |

Feature freeze **12:30**. After that, only fixes for failing TCs.

**G3 exit (13:00):** every Should/Could TC passes (TC-007, TC-014, TC-018, TC-019, TC-035 and the S-014 check); a11y and Bangla checks pass; mentor fixes merged.
**G4 exit (16:00):** `npm run smoke` passes on production; Playwright green; final evaluation report committed with denominators, failures, cache disabled, commit/model/manifest hashes; measured spend recorded.

## Phase 4 — Submission (Wed 14 Oct 16:00 → 21:00) · Gate G5
| Who | Tasks |
|---|---|
| Sadman | TASK-044 deck, 5–8 slides (numbers only from the frozen report or "not measured") · TASK-046 README, Drive folder (links TXT, deck, video), **reply to the selection email by 21:00** |
| Obidit | TASK-045 video, 1–2 min, following D7 §3.1; label time compression and cached outputs |
| Masnun | metric figures and failure examples for the deck · README evaluation section · final check that repo, deck, video and links open logged-out |

Agent use: `doc-updater` for README; wording guard + `fera-safeguarding-reviewer` over deck text and video script (Constitution VI, honest language).

**G5 exit:** email sent with the Drive link before 21:00; every link opens in a private window.

## Phase 5 — Buffer and finale baseline (Thu 15 Oct) · Gate G6
- Anything that slipped from Phases 2–3 (still in scope, just after the submission build).
- `/speckit-converge` on all seven features; close stale tasks.
- Sadman: TASK-053 laptop stack (Docker DB, model cache, fixtures, `DEMO_MODE=1`).
- All: rehearsal #1 of TASK-054 with internet off.
- Obidit: start TASK-058 backup recording plan.

**G6 exit:** the laptop runs the full journey offline; backlog empty or each item has an owner and a date before 20 Oct.

## Phase 6 — Finale prep (16 → 24 Oct)
TASK-054 five rehearsals (≥1 internet-off) · TASK-055 finale deck, timed ≤10 min · TASK-058 backup recording on laptop and Drive · TASK-057 5–10 user conversations only if mentors/faculty clear OQ-019 · mentor and judge Q&A prep from D7 §3.2.

---

## Gates (checked with the `fera-gate` skill, reports in `docs/gates/`)
| Gate | Due | Pass means |
|---|---|---|
| G0 | 12 Oct 18:00 | Repo, CI, agent kit, DB, keys, spikes done |
| G1 | 12 Oct 23:00 | Specs + tasks for 001–007, contracts frozen, data and manifest frozen, shell merged |
| G2 | 13 Oct 23:00 | Must journey TC-001–012 green on preview |
| G3 | 14 Oct 13:00 | Full scope TCs green, a11y + Bangla pass, feature freeze held |
| G4 | 14 Oct 16:00 | Prod smoke, E2E, frozen evaluation, spend recorded |
| G5 | 14 Oct 21:00 | Submission sent |
| G6 | 15 Oct 20:00 | Offline laptop journey, backlog triaged |

## Decisions to close in Phase 0 (they block lanes)
| Question | Owner | Blocks |
|---|---|---|
| Managed Postgres host (OQ-021) | Sadman | TASK-002 → everything |
| Default LLM provider, keys, prices, data terms (OQ-004, OQ-013, OQ-022) | Obidit | TASK-013 |
| Local embeddings on Vercel or API (OQ-023) | Masnun | TASK-016 |
| Voice and poster confirmed for Round 2 (OQ-001) | Sadman | closed: yes, full scope |
| Synthetic-only data acceptable to judges (OQ-026) | Mentors, session 2 | deck wording |
| Ethics of testing with real parents (OQ-019) | Mentors/faculty | TASK-057 |

## Risks specific to this way of working
| Risk | Watch for | Response |
|---|---|---|
| Agents drift from the spec | PRs without TASK/FR IDs; invented fields or wording | `/speckit-converge`; safeguarding reviewer BLOCK; reject PRs without IDs |
| Merge conflicts across lanes | Two lanes editing the same file | Ownership map; contracts frozen; rebase after every merge window |
| Case service late (critical path) | Not merged by 12:00 on the 13th | Sadman drops Lane C until it lands; others code against the contract types with fakes |
| Matcher tuned on test data | Thresholds changed after held-out run | Manifest hash checked by the eval harness; `mle-reviewer` on any threshold PR |
| Rate limits on one tool | Lane idle > 20 min | Move the lane to the other tool; both share skills and roles |
| Review becomes the bottleneck | PRs waiting > 1 h | Merge windows after stand-ups; reviewers run in parallel; owner skims, agents check |

## Audit amendments (2026-10-12)

### AMD-PLAN-1 — Schedule evidence and capacity
**Gap:** the cutoff and capacity were presented as established facts. **Change:** 14 Oct remains the working submission date, with 21:00 internal send target and 22:00 planning baseline. The user reports organiser flexibility/extension on 12 Oct; replacement date/time and documentary confirmation are **UNKNOWN**. Keep the baseline until Sadman records the organiser instruction; then rebase dependent targets together. Handover §10 confirms the date, not 22:00, channel or formats. Finale remains 24 Oct; DEP-009 kit readiness is 23 Oct.
**Old text corrected:** “official cutoff **22:00**”; “Round 2 must be submitted on the 14th; the 15th cannot be a build day for Round 2.” The latter is a baseline planning rule, not a verified organiser restriction.
**Source:** TEAM_HANDOVER_V2 §§6–10; D6 §§4–5,10; user clarification 2026-10-12.

**Round 2 baseline:** 52 tasks, **184 h** (TASK-001–046,059–064): Sadman **67**, Obidit **54**, Masnun **63**. All 64 tasks total **222 h**; the 38 h difference belongs to optional/finale work, not a replacement Round 2 estimate. KIT's local 1 h is additional and not in D6. Partial rows such as TASK-012 start, TASK-039 scaffold and TASK-040 record share their task's single estimate.
**Old text corrected:** “Human time 12–15 Oct ≈ 3 people × (4 + 14 + 13 + 10) h ≈ 123 h. Agents therefore need to carry roughly 45 % of the estimated hours.” Availability, remaining effort and agent savings are **UNKNOWN**. D6's acyclic graph has a **58 h** Round 2 lower bound, not a feasible promise; typed fakes permit preparation but do not satisfy integrated dependencies. Re-estimate with owner evidence (OQ-024/RISK-017).

### AMD-PLAN-2 — Complete Must-to-phase traceability
**Gap:** task allocation lacked a direct D1 §8 Must checklist. **Change:** the following 17 rows are exhaustive; G4 must link evidence for every row. Phase 5 packages/rehearses existing offline behaviour, never implements a missing Round 2 Must under a new owner.
**Source:** D1 §8, FR table and STORY-023; D6 §§5,8; handover §8.

| D1 §8 Must | Build phase / task | Acceptance |
|---|---|---|
| Bangla text + follow-ups | P1 shell; P2 TASK-012/013/020/021 | FR-001/003–005/033; TC-002/003 |
| Bangla voice | P0 spikes; P2 TASK-014/021 | FR-002; TC-001/061 |
| Review/edit before submit | P2 TASK-022 | FR-006/007/031; TC-004/031/042/060 |
| GD draft | P2 TASK-023/024 | FR-008; TC-005 |
| No-photo text poster | P2 TASK-023/024 | FR-009; TC-006/026 |
| Staff found log | P2 TASK-026 | FR-011; TC-008 |
| Top-five matching/reasons | P2 TASK-016/017 | FR-012/013; TC-009/039–041 |
| Officer queue/compare/confirm/reject | P2 TASK-027/028 | FR-014–017; TC-010/011/023/046/048/053 |
| Referral record and closure | P2 TASK-015/028/029 | FR-016/018; TC-010/029/032/047 |
| District map/status counts | P2 TASK-030 | FR-019; TC-012/055 |
| Role access | P1 contracts; P2 TASK-006/007/031/032 | FR-020/035/037; TC-022/023/044/052 |
| Audit | P2 TASK-015/062 | FR-021; TC-016/028/051 |
| Eligible terminal redaction | P2 TASK-032/062 | FR-025; TC-015/050 |
| Duplicate detection + metric | P2 TASK-018; P3 TASK-039/043 | FR-022; TC-013/038/020 |
| Five-metric report | P3 TASK-039/040/041/043/060 | FR-028; STORY-022; TC-020/034/056/064 |
| Manual + demo-safe fallback | P2 TASK-025/033; P3 integrated verification TASK-038 | FR-026/027; STORY-018/023; TC-017/021/057 |
| Labelled synthetic seed | P1 TASK-010/064; P2 TASK-019 | FR-032; TC-021/064 |

Cross-cutting wording guard FR-034/BR-002/003/011 is built in P2 TASK-023 and checked at G4/G5 (TC-024–027/037/066); spend and paid-call integrity are P2 TASK-059/063, G4 TC-036/043/065. This table is allocation, not evidence of completion.

### AMD-PLAN-3 — Dependency register and entry gates
**Gap:** DEP-001–011 were not mapped and the shortened “critical path” omitted TASK-027 and release verification. **Change:** use D6 §5 dependencies as completion prerequisites, plus local G1 manifest/contract prerequisites. D6 task graph was recomputed: 64 tasks, no cycles; all task dependencies in phase task rows match D6 (partial rows do not add tasks). Local OQ-019 clearance is an additional condition for TASK-057. The handover's full 58 h path includes TASK-027 and TASK-038→042→060→043→044→046. No fake-backed task becomes done before those real-service checks.
**Source:** D1 §15; D6 §§4–5; TEAM_HANDOVER_V2 §6.

| Dependency | Owner per D1 | Phase / evidence / source deadline |
|---|---|---|
| DEP-001 speech | Obidit | P0 TASK-003/005, P2 TASK-014; phone transcription; 11 Oct source target |
| DEP-002 two LLMs | Obidit | P0 TASK-003, P2 TASK-013; both calls/fallback; 10 Oct |
| DEP-003 offline similarity | Masnun | P0 TASK-004, P2 TASK-016/033 with Obidit; TC-021/057; 11 Oct |
| DEP-004 64 districts | Masnun | P0 TASK-009; count/names/centroids; 11 Oct |
| DEP-005 synthetic set | Masnun | P1 TASK-010/064, P2 TASK-019; manifest/hash; 11 Oct |
| DEP-006 labelled reports | Masnun, Obidit | P2 TASK-011, P3 TASK-039; review evidence; 11 Oct |
| DEP-007 public texts | Masnun | P3 TASK-048 invented fixtures ONLY under FR-024/BR-026; D1's “public pages” wording conflicts with V2; 12 Oct |
| DEP-008 host/DB | Sadman | P0 TASK-001/002, P3 TASK-042; URL + target PG16 evidence; 10 Oct |
| DEP-009 finale kit | Sadman | P5 TASK-053, finale rehearsal/device inventory; **23 Oct** |
| DEP-010 mentor answers | Sadman | P2 decision log for OQ-003/OQ-010, P3 TASK-056; **13 Oct**, answers UNKNOWN |
| DEP-011 base map/fallback | Masnun | P2 TASK-030, P3 offline test; bundled outlines/table; 12 Oct |

Source dates already earlier than these working phases require an evidence-backed rebaseline; this audit does not claim they were met. Phase entry chain: P0 inventory → G0 → P1/G1 → P2/G2 → P3/G3/G4 → P4/G5 → P5/G6 → kit by 23 Oct → finale 24 Oct. Preparatory parallel work is allowed; gate failure is never treated as entry approval.

### AMD-PLAN-4 — Cut order and scope ownership
**Gap:** fallback and rollover could conceal unmet Must work. **Change:** apply D6 §11's detailed order: disaster → 13219 summary → fixture import → post-submit editing → live voice (retain typed/manual and labelled cached note) → poster PNG (retain reviewed poster text). RISK-001 gives the shorter disaster→summary→import→voice order; D6 adds editing/poster stages. Record this source discrepancy and any lead decision; do not invent a position for duplicate grouping/status. Every cut remains a disclosed omission against its FR/TC, not a PASS. Never cut review, verified-officer decisions, simulated referral record, audit, redaction, role boundaries or synthetic-only rules. FR-027/STORY-023 require a whole offline journey on one local DB; fallback is primary→secondary provider→labelled scripted cache→manual, with no silent cloud/local transfer.
Phase 2–3 owners retain their tasks and estimates if late; Phase 5 may link blockers and coordinate rehearsal fixes but must not copy or absorb implementation scope. All-hour ambition remains, while Must correctness precedes optional work.
**Source:** D1 RISK-001, FR-026/027, STORY-023; D6 §§9.4,11; handover §§6,8.

### AMD-PLAN-5 — Principle reference
**Gap:** “C7 honest language” is not the constitution's honest-copy principle ID. **Change:** that old text now cites Constitution VI. **Source:** `.specify/memory/constitution.md` Principle VI.
