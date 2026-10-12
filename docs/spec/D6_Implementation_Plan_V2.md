# D6 — High-Level Implementation Plan — Fera

| Field | Value |
|---|---|
| Version | 2.0 |
| Date | 11 Oct 2026 (Asia/Dhaka, UTC+6) |
| Owner | Sadman Shaharier |
| Authors | Sadman Shaharier; Obidit Islam |
| Status | V2 team handover; implementation status UNVERIFIED |
| Inputs | D1–D5 V2.0; validation report; verified progress and availability still pending. |
| Key dates | Round 2 submission 14 Oct 2026; exact cutoff/channel pending official email. Mentor dates require team confirmation. Finale 24 Oct 2026 at AIUB. |

## V2 release contract

**Authors:** Sadman Shaharier and Obidit Islam. **Version:** 2.0. **Issued:** 11 October 2026, Asia/Dhaka (UTC+6).

This is the revised team specification, not evidence that the application has been built. Actual repository progress, account configuration, interviews, evaluations, and spend remain **UNVERIFIED** until evidence is attached. V1 defaults are superseded by the V2 rules below; existing requirement IDs are retained.

- This release is a **synthetic-data prototype**. Officer verification and referral delivery are simulated and labelled. The schema rejects records marked non-synthetic; the application must also prevent real reports from entering this release.
- A candidate score is similarity, not identity probability. A reviewer decision does not establish guardian authority or safe reunification. A referral row means **referral recorded**, not delivered or acknowledged.
- Draft payload stays on the device before report confirmation, but providers process audio/text beforehand with a notice. Only expiry/counter/hash metadata and cost reservations are stored server-side before submission.
- Possible duplicates remain visible. Shared phone alone never establishes one child. No physical child-return action is performed by Fera.
- Counts distinguish missing-report rows, found-report rows, and confirmed pairs. They are not a census of unique children or proof of rescue.
- Sources, diagrams, tables, code blocks, and acceptance criteria are part of the handover. The companion code must match the embedded code exactly. [Team handover](TEAM_HANDOVER_V2.md) records change closure, evidence gaps, and release gates.

## Changes to earlier documents

V2 rebases gates from actual remaining work, corrects workload/dependencies, adds TASK-061–064 and TC-038–066, and removes unsupported delivery guarantees. The task estimates and resource totals are computed in the handover.

---

## 1 MVP definition

**Smallest complete demoable product:** one parent, one station volunteer and one officer move one synthetic missing report through a reviewed candidate decision and coordination closure on the map, in Bangla, with a human deciding the match.

**The one essential journey**

| # | Step | Screen | FR |
|---|---|---|---|
| 1 | Parent records a Bangla voice note | SCREEN-002 | FR-002 |
| 2 | Fera builds a case draft and asks for the district | SCREEN-002 | FR-003 – FR-005 |
| 3 | Parent reviews and submits | SCREEN-003 | FR-006, FR-007 |
| 4 | Parent gets the GD draft and poster | SCREEN-004 | FR-008, FR-009 |
| 5 | Station volunteer logs a found boy | SCREEN-007 | FR-011 |
| 6 | Matching surfaces a qualified candidate in the scripted scenario | SCREEN-009 | FR-012 – FR-014 |
| 7 | Officer compares evidence and confirms; simulated referral record created | SCREEN-010 | FR-015, FR-016 |
| 8 | Officer closes the case; the Dhaka marker updates | SCREEN-012, SCREEN-011 | FR-018, FR-019 |

**Included (Must):** FR-001 – FR-009, FR-011 – FR-022, FR-025 – FR-028, FR-031 – FR-035, FR-037.

**Excluded from MVP:** FR-010 13219 summary (Should), FR-024 import (Should), FR-029 edit after submit (Should), FR-023 duplicate screen, FR-030 parent status (Should), FR-036 disaster mode (Could). Alerts, face matching, telecom targeting and live police data are Won't; shown only as [MOCK] on slides.

## 2 Goals

| Type | Goal | Measure | Due |
|---|---|---|---|
| Product | Essential journey works on the deployed app | TC-001 – TC-012 pass | 14 Oct 18:00 |
| Product | Safeguarding rules enforced | TC-010, TC-019, TC-022 – TC-027 pass | 14 Oct 18:00 |
| Product | Report time beats manual form | Median ≤ 5 min and below manual (GOAL-001) | 13 Oct |
| Technical | Extraction accuracy measured | ≥ 85 % target; actual reported (GOAL-002) | 13 Oct |
| Technical | Matching measured | Recall@5 ≥ 80 %, P@1 ≥ 60 % targets; actual reported (GOAL-003) | 13 Oct |
| Technical | Dedupe and WER measured | F1 ≥ 0.8; WER ≤ 30 % targets; actual reported (GOAL-004, GOAL-005) | 13 Oct |
| Technical | AI spend | ≤ USD 25 at freeze, ≤ USD 30 at finale (NFR-016) | 14 Oct, 24 Oct |
| Demo | Round 2 video | 1–2 min, shows steps 1–8 of §1 | 14 Oct 20:00 |
| Demo | Finale reliability | 5 of 5 rehearsals pass, ≥ 1 with internet off (GOAL-007) | 23 Oct |
| Demo | Honest metrics slide | All 5 metrics + ≥ 2 failures (GOAL-009) | 14 Oct |

Working times in the preceding table are internal planning targets, not verified organiser requirements or delivery promises. Confirm the official cutoff and submission channel before setting the final schedule.

## 3 Non-goals

| Category | Not doing |
|---|---|
| Features | Alerts of any kind; face matching; telecom location targeting; live police/CID data; SMS/IVR; native app; parent cross-device access; dashboard filters |
| Technical work deferred | Phone OTP for parents; migrations framework; background job queue; multi-region hosting; automated retention scheduler; LLM re-ranking; real officer verification |
| Production concerns | Load beyond 50 users; 24/7 uptime; backups beyond the managed host's defaults; formal legal review; security audit by a third party; data-sharing agreements |

---

## 4 Rebased gates and capacity

The previous 9–14 October empty-repository assumption is historical. At issue time (11 October, Asia/Dhaka), actual completion and team availability are UNVERIFIED. Do not mark work done merely because a specification exists.

| Gate | Target working window | Exit evidence |
|---|---|---|
| A Contract/inventory | 11 Oct | Repo/deploy and task status; V2 fields/states/permissions approved; provider/audio/embedding evidence; official cutoff confirmed |
| B Complete typed journey | 11–12 Oct | One synthetic case on one DB: manual/review/submit/output/found/rank/decision/referral record/close/counts/audit |
| C Quality and evaluation | 12–13 Oct | Target PG16/role and concurrent tests; frozen manifest; live cache-disabled metrics and failures; device/a11y checks |
| D Record and submit | 13–14 Oct | Tested script/topology, honest labels/timings/spend, export/upload/link checks, organiser submission evidence |
| E Finale hardening | 15–24 Oct | Same-backend local rehearsal, five recorded runs including internet-off, backup recording, final test/limitations |

If starting from zero on 11 October, four full days at 10 hours/person/day yield about 120 team-hours. Actual remaining work is the sum of unfinished estimates, not the full historic workload. The V2 added tasks below and dependency path are calculated in the handover. Estimates are planning inputs, not delivery promises. Team lead must reassign work/cut optional scope or report missing features if remaining work exceeds available hours. Preserve correctness, honest evaluation and submission buffer.

## 5 Task board

Owners: **S** = Sadman (lead/integration), **O** = Obidit (intake & LLM), **M** = Masnun (data, matching & dashboard). CP labels inherited from V1 are removed; computed V2 dependency path is in the handover. Owner capacity can change the actual schedule.

| ID | Task | Priority | Owner | Dependencies | Hours | Completion evidence | Plan note |
|---|---|---|---|---|---|---|---|
| TASK-001 | Repo: Next.js App Router, TS strict, Tailwind, ESLint, CI (lint, typecheck, test) | Must | S | — | 3 | CI green on `main`; preview deploy URL | |
| TASK-002 | Pick DB host (OQ-021); apply `schema_v2.sql`; local Docker DB | Must | S | TASK-001 | 2 | HNSW index created on host and locally | |
| TASK-003 | Provider keys, `.env.example`, record real prices in `docs/costs.md` (OQ-004, OQ-022) | Must | O | — | 1 | Both LLMs and STT answer a test call | |
| TASK-004 | Spike: local embedding model on Vercel (OQ-023, RISK-015) | Must | M | TASK-001 | 3 | Report: cold start, size; decision local vs API | |
| TASK-005 | Spike: Android MediaRecorder → STT (A-030) | Must | O | TASK-003 | 2 | 3 phone recordings transcribed | |
| TASK-006 | Auth.js credentials, parent cookie, `requireRole`, seeded users | Must | S | TASK-002 | 5 | TC-023 passes | |
| TASK-007 | API layer: error envelope E-001 – E-024, Zod helpers, request ID, rate limiter (COMP-021) | Must | S | TASK-001 | 4 | Unit tests for envelope and limiter | |
| TASK-008 | Layout shell, `tokens_v2.css`, Noto Sans Bengali, language toggle (COMP-022) | Must | S | TASK-001 | 3 | Bangla renders on 1 Android phone | |
| TASK-009 | District data: 64 rows bn/en/centroids + neighbours (DEP-004, A-013) | Must | M | TASK-002 | 3 | `npm run seed` loads 64 districts | |
| TASK-010 | Synthetic set generator: ~200 records, ground truth, duplicates, decoys (A-039) | Must | M | TASK-009 | 6 | Ground-truth file hashed and committed | |
| TASK-011 | 50 hand-labelled reports | Must | M | — | 5 | `eval/data/labelled.jsonl` reviewed by O | |
| TASK-012 | Normaliser: Bangla digits, time words, phone, district aliases, romaniser (COMP-008) | Must | O | TASK-009 | 5 | 30 unit tests pass | |
| TASK-013 | LLM adapter: 2 providers, Zod contract, evidence check, retry, fallback (COMP-007) | Must | O | TASK-003, TASK-012 | 7 | Extracts 10 sample texts; fallback test passes | |
| TASK-014 | Speech adapter + API-001 (COMP-006) | Must | O | TASK-005, TASK-007 | 3 | TC-001 steps 1–3 pass | |
| TASK-015 | Case service, state guard, audit, versions (COMP-014, COMP-015) | Must | S | TASK-007, TASK-061, TASK-062 | 6 | TC-032 and TC-016 pass | |
| TASK-016 | Embedding service + `npm run reembed` (COMP-011) | Must | M | TASK-004 | 3 | 200 records embedded | |
| TASK-017 | Matching engine: filters, cosine, bonuses, template reasons (COMP-012) | Must | M | TASK-015, TASK-016 | 7 | TC-009 passes; first recall@5 printed | |
| TASK-018 | Duplicate detector (COMP-013) | Must | M | TASK-016 | 3 | TC-013 passes | |
| TASK-019 | Seed loader with synthetic labels and 3 demo cases | Must | M | TASK-010 | 2 | `npm run seed -- --set demo` < 2 min | |
| TASK-020 | Intake orchestrator + API-002 + question templates (COMP-009) | Must | O | TASK-013 | 4 | TC-003 passes | |
| TASK-021 | SCREEN-001/002 intake chat + recorder (COMP-024 – COMP-027) | Must | O | TASK-008, TASK-014, TASK-020 | 7 | Voice and text paths work on phone | |
| TASK-022 | SCREEN-003 review + API-003 + draft persistence | Must | O | TASK-015, TASK-021 | 5 | TC-004, TC-031 pass | |
| TASK-023 | Output templates GD/poster + wording guard + API-006 (COMP-010, COMP-016) | Must | O | TASK-015 | 4 | TC-005, TC-024 pass | |
| TASK-024 | SCREEN-004 outputs + poster PNG (COMP-030, COMP-031) | Must | S | TASK-023 | 3 | TC-006 passes | |
| TASK-025 | SCREEN-005 manual form fallback (COMP-032) | Must | S | TASK-022 | 2 | TC-017 passes | |
| TASK-026 | SCREEN-007 found-child log + API-007 (COMP-034) | Must | M | TASK-015, TASK-020 | 3 | TC-008 passes | |
| TASK-027 | SCREEN-009 queue + API-008 (COMP-035, COMP-036) | Must | M | TASK-017 | 3 | Queue lists seeded candidates | |
| TASK-028 | SCREEN-010 match review + API-009/010 (COMP-037, COMP-038) | Must | M | TASK-017, TASK-027 | 6 | TC-010 (confirm part), TC-011 pass | |
| TASK-029 | SCREEN-012 case detail, close, audit + API-011/013 (COMP-039, COMP-042) | Must | S | TASK-028 | 5 | TC-010 full passes | |
| TASK-030 | SCREEN-011 map + table + API-012 (COMP-040, COMP-041) | Must | M | TASK-009, TASK-029 | 5 | TC-012 passes | |
| TASK-031 | SCREEN-008 sign-in + SCREEN-016 (COMP-047, COMP-045) | Must | S | TASK-006 | 2 | TC-022 passes | |
| TASK-032 | SCREEN-013 admin: redact identifying payloads + verify [MOCK] + API-016/017 (COMP-043) | Must | S | TASK-015 | 3 | TC-015 passes | |
| TASK-033 | Demo-safe cache + fixtures for 3 cases + cached badge (COMP-017, COMP-048) | Must | O | TASK-020, TASK-019 | 3 | TC-021 passes on laptop | |
| TASK-034 | Accessibility pass: axe + keyboard + 320 CSS px reflow, 200 % text zoom and 400 % viewport zoom | Must | S | TASK-030 | 3 | TC-033 passes | |
| TASK-035 | Bangla copy review; all empty/error/loading states | Must | O | TASK-030 | 3 | Every E-xxx shows bn + en text | |
| TASK-036 | Test on 2 Android phones (Bangla rendering, mic, 360 px) | Must | M | TASK-030 | 2 | Checklist signed in `docs/device-test.md` | |
| TASK-037 | Unit tests: normaliser, matcher, state guard, wording guard | Must | S | TASK-017 | 4 | ≥ 60 tests, CI green | |
| TASK-038 | Playwright E2E: essential journey + safeguarding TCs | Must | S | TASK-030, TASK-032, TASK-059 | 5 | TC-001–066 app/service checks where applicable; companion-only results kept separate |  |
| TASK-039 | Evaluation harness: smoke/dev run first; held-out run after manifest/model freeze | Must | M |TASK-011, TASK-017, TASK-018, TASK-064 | 5 | TC-020 passes; report committed | |
| TASK-040 | WER recordings (60 clips) + run | Must | O | TASK-014 | 3 | WER in report | |
| TASK-041 | Timing study, ≥ 5 testers, assistant vs manual form | Must | S | TASK-025 | 3 | `eval/data/timing.csv`; median in report | |
| TASK-042 | Production deploy + managed DB seed + smoke test | Must | S | TASK-038 | 2 | `npm run smoke` passes on prod | |
| TASK-043 | Final evaluation run on freeze build | Must | M | TASK-042, TASK-039, TASK-040, TASK-041, TASK-060 | 2 | Frozen cache-disabled report with all metrics, denominators, failures, commit/model/manifest hashes |  |
| TASK-044 | Round 2 deck, 5–8 slides | Must | S | TASK-043 | 4 | Working 5–8-slide deck; exact organiser deliverables confirmed; honest measured/pending labels |  |
| TASK-045 | Round 2 demo video, 1–2 min | Must | O | TASK-042 | 4 | Working 1–2-minute MP4; confirm official format; compressed/cached timings labelled |  |
| TASK-046 | README, Drive folder (links TXT, deck, video), reply to selection email | Must | S | TASK-044, TASK-045 | 1 | Receipt via organiser-confirmed channel before confirmed cutoff; links accessible |  |
| TASK-047 | 13219 summary (FR-010) | Should | O | TASK-023 | 1 | TC-007 passes | |
| TASK-048 | Synthetic fixture import + API-015 (FR-024) | Should | M | TASK-020 | 3 | TC-014 passes | |
| TASK-049 | Edit after submit + API-005 + SCREEN-006 (FR-029) | Should | O | TASK-022 | 4 | TC-018 passes | |
| TASK-050 | Parent status API-018 (FR-030) | Should | O | TASK-049 | 1 | TC-019 passes | |
| TASK-051 | Duplicate review SCREEN-014 (FR-023) | Could | M | TASK-018 | 3 | Mark same/different works | |
| TASK-052 | Disaster mode SCREEN-015 (FR-036) | Could | M | TASK-026 | 2 | TC-035 passes | |
| TASK-053 | Finale local stack: Docker DB, model cache, fixtures, `DEMO_MODE=1` | Must | S | TASK-033 | 4 | Laptop runs journey offline | |
| TASK-054 | 5 rehearsals, ≥ 1 internet-off | Must | S, O, M | TASK-053 | 5 | Rehearsal log 5/5 | |
| TASK-055 | Finale deck, 5–10 min | Must | S | TASK-043 | 4 | Timed run ≤ 10 min | |
| TASK-056 | Fixes from mentor session 2 (12–13 Oct) | Should | S, O, M | — | 5 | Agreed fixes merged by 14 Oct 18:00 | |
| TASK-057 | 5–10 user conversations, only if OQ-019 allows | Should | S | — | 4 | Notes with consent; findings slide | |
| TASK-058 | Backup recording of the finale demo | Must | O | TASK-054 | 2 | MP4 on laptop and Drive | |
| TASK-059 | `npm run spend` + spend cap check (DECISION-017) | Must | O |TASK-013, TASK-063 | 1 | TC-036 passes | |
| TASK-060 | Performance check against D2 Part B §12.1 | Must | M | TASK-042 | 2 | TC-034 results in report | |
| TASK-061 | Apply V2 required fields, DTOs, token/idempotency and referral/count semantics | Must | S | TASK-001 | 3 | Runtime schemas/examples and role projections agree; FV-01–05/10 closed |  |
| TASK-062 | V2 schema invariants, restricted roles and full related-payload redaction | Must | S | TASK-002, TASK-061 | 4 | Negative and positive lifecycle/redaction checks; target PG16 CI pending until run |  |
| TASK-063 | Atomic paid-call counters/reservations, replay handling and price sheet | Must | O | TASK-003, TASK-062 | 2 | Draft replay/concurrency/budget checks; manual path survives paid refusal |  |
| TASK-064 | Identity-grouped manifest, no-match/duplicate hard negatives, frozen metrics | Must | M | TASK-010 | 3 | Manifest counts/split/hash asserted before held-out evaluation |  |

**Critical path:** The V1 printed chain was invalid (67 hours, not ~59; four undeclared links). V2 dependency/resource summary is generated from the task table in TEAM_HANDOVER_V2. A dependency longest path is a lower bound, not a resource-feasible finish date.

## 6 Folder structure

```text
fera/
├─ app/                          # Next.js App Router
│  ├─ (parent)/                  # SCREEN-001–006, no auth
│  │  ├─ page.tsx                # SCREEN-001 welcome
│  │  ├─ report/page.tsx         # SCREEN-002 intake chat
│  │  ├─ review/page.tsx         # SCREEN-003
│  │  ├─ case/[ref]/page.tsx     # SCREEN-004 / SCREEN-006
│  │  └─ form/page.tsx           # SCREEN-005 manual form
│  ├─ staff/                     # SCREEN-007, SCREEN-015
│  ├─ officer/                   # SCREEN-009–012, SCREEN-014
│  ├─ admin/                     # SCREEN-013
│  ├─ signin/page.tsx            # SCREEN-008
│  ├─ not-found.tsx              # SCREEN-016
│  └─ api/                       # API-001 – API-020 route handlers
├─ components/                   # COMP-022 – COMP-050 (UI)
├─ lib/
│  ├─ ai/                        # COMP-006 speech, COMP-007 llm, COMP-011 embeddings, providers/
│  ├─ intake/                    # COMP-008 normaliser, COMP-009 orchestrator, question templates
│  ├─ outputs/                   # COMP-010 templates, COMP-016 wording guard
│  ├─ cases/                     # COMP-014 case service, COMP-015 audit
│  ├─ matching/                  # COMP-012 matcher, COMP-013 dedupe
│  ├─ auth/                      # COMP-005
│  ├─ http/                      # COMP-004 envelope, COMP-021 rate limiter, errors E-001–E-024
│  └─ db.ts                      # pg pool
├─ fixtures/demo/                # COMP-017 cached transcripts/extractions/embeddings
├─ scripts/                      # seed, reembed, model:fetch, spend, smoke
├─ eval/                         # COMP-020 metric scripts, data/, report-YYYY-MM-DD.md
├─ tests/                        # vitest unit + playwright e2e
├─ styles/tokens.css             # D4 §16
├─ schema.sql                    # D2 §7
├─ docs/                         # D1–D7, costs.md, device-test.md
├─ docker-compose.yml            # local Postgres + pgvector
└─ .env.example
```

## 7 Testing strategy

| Level | Tool | Scope | When |
|---|---|---|---|
| Unit | Vitest | Normaliser, evidence check, matcher scoring, dedupe rule, state guard, wording guard, templates | Every push (CI) |
| Integration | Vitest + local Postgres | API handlers against a seeded DB; trigger and constraint behaviour | Every push |
| End-to-end | Playwright (mobile 360 px + desktop 1280 px) | Essential journey; safeguarding TCs; error flows | Nightly + before freeze |
| Accessibility | @axe-core/playwright + manual keyboard and screen-reader spot check | All Must screens, light and dark | 13 Oct, 23 Oct |
| Manual demo checks | Checklist on 2 Android phones + laptop | Bangla rendering, mic, copy, PNG, map | 13 Oct, each rehearsal |
| Failure-state tests | Playwright with network throttling/offline; provider keys removed | E-010 – E-014, E-022 – E-024, fallback form, demo cache | 13 Oct |
| AI evaluation | `/eval` scripts | matching/duplicate/extraction/speech metrics, abstention/coverage, timing and audit coverage | 11 Oct (first), 13 Oct, 14 Oct (final), 23 Oct |

## 8 Test cases

| TC | Covers | Preconditions | Steps | Expected result | Pass if |
|---|---|---|---|---|---|
| TC-001 | STORY-001, FR-002 | Phone, mic allowed, preview deploy | 1 Open SCREEN-002. 2 Record 38 s scripted Rafi note. 3 Stop. | Editable Bangla transcript appears | Shown ≤ 20 s; contains "রাফি" and "১৩" or "13" |
| TC-002 | STORY-002, FR-001, FR-003, FR-004, FR-033 | — | Submit "আমার ছেলে রাফি, বয়স ১৩, গতকাল বিকেলে মাদ্রাসা থেকে ফেরেনি। নম্বর ০১৭১১২২৩৩৪৪" | Draft: age 13, sex male, explicit fixture-clock yesterday afternoon interval with 16:00 display point, phone 01711223344; district empty | Required fields and supported time bounds correct; unknowns explicit; draft ≤ 15 s; UI in Bangla |
| TC-003 | STORY-003, FR-005 | TC-002 draft | Read question; answer "মিরপুর, ঢাকা" | One question about district; then draft complete | Exactly 1 question per missing field; district code = Dhaka |
| TC-004 | STORY-004, FR-006, FR-007, BR-004 | Complete draft | 1 Query DB and officer queue before submit. 2 Edit clothing. 3 Tick check. 4 Submit. | Before submit: 0 child case rows; metadata allowed. After: case open with edited clothing | 0 child case rows pre-submit; metadata/cost rows allowed; stored = edited values |
| TC-005 | STORY-005, FR-008, BR-022 | Submitted case | Tap "জিডি খসড়া" | GD text with name, age, place, time, phone; "খসড়া" label | All 5 fields present; no token absent from the case fields except template text |
| TC-006 | STORY-006, FR-009, BR-006 | Submitted case | Tap "পোস্টার"; download PNG | Text + PNG with 13219 and phone; no photo | PNG renders Bangla; no image input exists |
| TC-007 | STORY-007, FR-010 | Submitted case | Tap "১৩২১৯ সারাংশ" | Bangla summary | ≤ 80 words |
| TC-008 | STORY-008, FR-011 | Staff signed in | Log Kamalapur found boy (demo data) | Ref F-… shown; "মিল খোঁজা হয়েছে" | Case open or matched_pending_review ≤ 15 s; no candidate details shown to staff |
| TC-009 | STORY-009, FR-012 – FR-014, BR-017, BR-018 | Seeded set + TC-008 | Officer opens queue | Rafi case with ≤ 5 candidates, scores, reasons | Scripted fixture true pair rank recorded; held-out quality reported separately; no candidate violates eligibility (SQL check) |
| TC-010 | STORY-010, STORY-012, FR-015, FR-016, FR-018, BR-001, BR-005 | TC-009 | 1 Open candidate. 2 Confirm (2 steps). 3 Close with "সমন্বয়ের সিদ্ধান্ত ও রেফারেল নথিভুক্ত (সিমুলেশন)". | Missing confirmed → closed; found referred; 1 referral; audit rows | All states correct; referral exists; 3 audit entries |
| TC-011 | STORY-011, FR-017, BR-019 | Candidate pending | Reject with reason "পোশাক আলাদা"; re-run API-014 | Candidate rejected; case open; pair absent after re-run | Pair not re-suggested |
| TC-012 | STORY-013, FR-019, BR-014 | Seeded + TC-010 | Open map and table | Counts per district | Every district count = SQL count by group |
| TC-013 | STORY-014, FR-022, FR-023 | Mim parent case + public duplicate | Open either case | Banner "সম্ভাব্য একই শিশু"; both flagged reports remain independently visible | Link exists; distinct-child shared-phone controls stay visible |
| TC-014 | STORY-015, FR-024 | Admin | Import 5 invented synthetic sample texts with example.invalid URLs, one containing "ignore previous instructions" | 5 synthetic cases tagged simulated public_import with invented URLs | Injected text yields only schema fields; no server fetch of URLs |
| TC-015 | STORY-016, FR-025, BR-009 | 3 closed/referred, 1 open | Run redact identifying payloads all eligible | eligible payloads redacted, active linked evidence skipped | direct and related identifying payloads cleared; pseudonymous counts unchanged |
| TC-016 | STORY-017, FR-021, BR-010, NFR-017 | TC-010 done | 1 Read audit. 2 Try SQL UPDATE/DELETE on audit_log | Entries for confirm, referral, close | All present; UPDATE/DELETE/TRUNCATE raise error; runtime cannot alter guards |
| TC-017 | STORY-018, FR-026 | LLM keys invalidated | Submit text | Manual form opens pre-filled with any parsed fields | Form ≤ 2 s after error; text kept |
| TC-018 | STORY-019, FR-029, BR-025 | Case open with pending candidate | Edit age; confirm | Version 2; candidates voided; re-match run | Version row exists; confirmed case returns E-018 |
| TC-019 | STORY-020, FR-030, BR-007 | Parent case matched | Parent opens status and own scoped edit read | "যাচাই চলছে" plus own fields if editable | Response JSON has no found-case or candidate fields |
| TC-020 | STORY-022, FR-028, GOAL-002 – GOAL-005, GOAL-009 | Labelled sets | `npm run eval:all` | Report with 5 metrics, sizes, SHA, ≥ 2 failures | All sections present |
| TC-021 | STORY-023, FR-027, FR-032, NFR-007 | `DEMO_MODE=1`, laptop offline | Run Rafi journey with scripted inputs | Journey completes; "ক্যাশ" badges; "সিনথেটিক" labels | Completes with network off |
| TC-022 | BR-007, FR-020 | Parent and staff sessions | Request API-009 and API-004 for another case | 404 body | E-004 returned; `access.denied` audit row |
| TC-023 | BR-001, FR-035, FR-037 | Staff and unverified officer | POST API-010 confirm | Refused | E-003/E-004; candidate still pending |
| TC-024 | BR-002, BR-003, FR-034 | Template with "পালিয়ে" injected in test | Generate outputs | Blocked | E-016; text not shown |
| TC-025 | BR-002 | Submitted case | Inspect all outputs and UI | Draft labels; no "send alert" control | Every output labelled "খসড়া"; 0 alert actions in UI |
| TC-026 | BR-006 | — | Search UI and API schema for image inputs | None | 0 file inputs except audio |
| TC-027 | BR-008 | — | Compare `cases` columns and forms with D1 BR-015 + optional list | Match | No extra personal fields |
| TC-028 | NFR-010 | Full E2E run | Regex scan logs for `01[0-9]{9}` and seeded names | None found | 0 matches |
| TC-029 | BR-020 | Found case with 2 pending candidates | Confirm one | Other superseded; second confirm on same found fails | Unique index blocks second confirm |
| TC-030 | BR-015, BR-016 | — | Submit age 19, future time, phone 0171, district "XYZ" | 4 field errors | E-001 with 4 paths |
| TC-031 | FR-031 | Submitted case | Concurrently replay the same submission UUID and canonical payload | Existing ref shown | 200 stable retry reference; 1 row; changed payload conflicts |
| TC-032 | BR-012, BR-013 | Seeded cases | SQL: open→confirmed; found→closed | Rejected by trigger | Both raise `check_violation` |
| TC-033 | NFR-011 | Prod build | axe on Must screens, light and dark; keyboard walk | No serious/critical | 0 serious/critical; all actions keyboard-reachable |
| TC-034 | NFR-001 – NFR-005 | Prod build | Lighthouse mobile; `eval/perf.ts` | Values recorded | Each target met or reported as missed |
| TC-035 | STORY-021, FR-036 | Staff | Open disaster screen; log child | Banner "পরিকল্পিত সম্প্রসারণ" | Saved as found case |
| TC-036 | NFR-016, DECISION-017 | Spend cap set to current total | Call API-002 | Refused | E-023; manual form opens |
| TC-037 | BR-011 | Deck, UI, README | Search for compliance claims | None | 0 unsupported compliance claims; cited legal facts have primary sources |

### 8.1 V2 additional acceptance cases

| TC | Case | Covers | Pass condition |
|---|---|---|---|
| TC-038 | Shared-phone distinct children | BR-021, FV-02 | Two siblings/shelter reports remain searchable; phone-only link cannot confirm_same |
| TC-039 | Unknown found age | BR-017, FV-03 | Eligible with unknown cue; no fabricated age agreement |
| TC-040 | Overlapping time uncertainty | BR-016/017 | Interval-compatible found report is not removed by midpoint |
| TC-041 | No plausible candidate | BR-018 | Qualified shortlist may be empty; no misleading confidence |
| TC-042 | Concurrent submission UUID | FR-031, FV-05 | One case; stable response; different payload conflicts |
| TC-043 | Draft replay/concurrency | BR-023, FV-05 | Server usage cannot reset; six dispatched calls maximum |
| TC-044 | Admin rematch projection | BR-007/024 | Status only, no candidate IDs/scores/child payload |
| TC-045 | Owner editable read | API-004, SCREEN-006 | Own fields before lock; no other-party payload |
| TC-046 | Stale candidate decision | API-010 | Expected-version conflict, no new decision/referral |
| TC-047 | Wrong referral endpoints | FV-06 | Constraint rejects mismatched candidate pair |
| TC-048 | Reject without reason | BR-001 | Service and DB reject NULL/short reason |
| TC-049 | Terminal report edit | BR-025 | Blocked; privileged redaction separate; no silent history rewrite |
| TC-050 | Related note redaction | BR-009 | Outcome/referral/decision/candidate/provenance/output payloads cleared; IDs remain pseudonymous |
| TC-051 | Audit truncate/privilege | BR-010 | UPDATE/DELETE/TRUNCATE rejected; runtime no DDL/ownership |
| TC-052 | Unknown-resource denial | API-004 | Safe audit recorded with null FK and no information leak |
| TC-053 | Last competitor invalidated | BR-020 | Other affected report returns to open if no pending candidate |
| TC-054 | Matching fails after submit | API-003/014 | Saved report, explicit failed/queued state, reliable retry |
| TC-055 | One pair dashboard lifecycle | BR-014 | Missing/found categories change separately; pair count one |
| TC-056 | Evaluation fixture contamination | GOAL-009 | Quality run rejects/excludes cache/fixture hits and labels result |
| TC-057 | Single-DB offline scenario | FV-08 | All local roles see same new report; assets preloaded |
| TC-058 | Reflow/keyboard/Bangla | NFR-011 | 320px/400%/200% checks; shortcuts disabled during typing and switchable |
| TC-059 | Embedding space switch | FV-09/15 | No mixed vectors; matching paused until validated rebuild |
| TC-060 | Provider notice/metadata | BR-004, FV-12 | Notice before dispatch; no child payload in pre-submit DB metadata |
| TC-061 | Encoded audio limits | BR-023 | Real phone codec/duration/size tested; WAV >2 MB rejected or compressed |
| TC-062 | PostgreSQL16/runtime host | D2B acceptance | Original V2 SQL applies and meaningful constraints tested on target PG16/roles; portable engine result alone not enough |
| TC-063 | Correction/reopen pilot gate | BR-025 | Documented two distinct verified reviewers, reason/evidence/history; real data blocked until implemented/approved |
| TC-064 | Manifest/group split | FV-11 | 200 count, identities/no-match/duplicates declared; no connected-group leakage |
| TC-065 | Concurrent AI budget | FV-12/13 | Reservations cannot exceed cap; uncertain usage retained; duplicate settlement idempotent |
| TC-066 | Legal claims/source accuracy | BR-011 | No unsupported compliance or integration claim; accurate primary-law citations allowed |

## 9 Demo plan

### 9.1 Setup

| Item | Detail |
|---|---|
| Devices | Online: all roles on deployed origin/one managed DB. Local: all roles on laptop stack/one local DB, in separate browser profiles; phone only with tested secure LAN access. Spare laptop preloaded. |
| Build | Round 2: production deploy. Finale: production deploy + laptop-local copy with `DEMO_MODE=1` |
| Accounts | `officer.karim` (verified), `staff.rumana`, `admin` — passwords in the team vault |
| Reset | `npm run seed -- --reset --set demo` 10 min before each run |
| Checks | `/api/health` green; `npm run spend` < cap; phone font check |

### 9.2 Demo data (synthetic, labelled "সিনথেটিক")

| Name | Record | Role in demo |
|---|---|---|
| রাফি (Rafi) | Missing boy, 13, blue shirt, last seen 8 Oct afternoon interval, display reference 16:00; fixture intake clock explicitly 9 Oct near madrasa, Mirpur, Dhaka | Live parent voice report |
| Kamalapur boy | Found boy, est. 12–14, blue shirt, scar on left hand, Kamalapur railway station, Dhaka, 9 Oct 07:30 | Logged live by staff; true match |
| Narayanganj decoy | Found boy, 13, red shirt, Narayanganj | Rank 2–3; rejected in finale version |
| মীম (Mim) | Missing girl, 11, Tongi, Gazipur; parent report + public-post duplicate | Shows duplicate banner |
| সাব্বির (Sabbir) | Missing boy, 15, Chattogram; no found record | Shows open case and empty candidates |
| ~195 others | Seeded synthetic set | Fills map |

### 9.3 Actions and expected results

| # | Action | Expected on screen |
|---|---|---|
| 1 | Phone: SCREEN-001 → Start | Intake chat in Bangla |
| 2 | Record the Rafi script (38 s) | Transcript appears |
| 3 | Send; answer district "মিরপুর, ঢাকা" | Review cards filled |
| 4 | Tick check; submit | Ref M-…; status "খোলা" |
| 5 | Tap GD draft and poster | Bangla GD text; poster preview |
| 6 | Laptop: staff logs Kamalapur boy | Ref F-…; "মিল খোঁজা হয়েছে" |
| 7 | Officer: queue | Rafi at top, score shown |
| 8 | Open; side-by-side; confirm (2 steps) | "পর্যালোচকের সিদ্ধান্ত… রেফারেল নথিভুক্ত (সিমুলেশন)" |
| 9 | Close case | "কেস বন্ধ হয়েছে" |
| 10 | Map | Dhaka missing reports: Closed +1, Matched −1; found referral-recorded unchanged; confirmed pairs unchanged |
| Finale extras | Reject Narayanganj decoy with reason; show Mim duplicate banner; show audit trail; show metrics slide | As in D3 |

### 9.4 Backup paths

| Failure | Backup |
|---|---|
| Speech provider slow/down | Type the scripted Rafi text; or `DEMO_MODE=1` scripted note → cached transcript (badge "ক্যাশ") |
| LLM down | Fallback provider; then cached extraction; then manual form |
| Venue internet down | Restart the whole labelled scenario on the local stack, with all roles sharing its DB. Never mix a new cloud report with local officer state. If local fails, play labelled backup recording (TASK-058). |
| Laptop failure | Spare laptop with same local setup |
| Map tiles fail | Bundled district outlines + table; no bulk offline caching of public OSM tiles |

### 9.5 Versions

| Version | Length | Content |
|---|---|---|
| Round 2 video | 1:45 | Steps 1–10, sped-up waits, English captions over Bangla UI |
| Finale live | 7–8 min of a 10 min slot | Problem (1 min) → live steps 1–10 (4 min) → extras (1.5 min) → metrics, safeguards, scale (1.5 min) |

Spoken scripts and timings are in D7 §3.

## 10 Hackathon checklist

| Area | Item | Done |
|---|---|---|
| Product | Essential journey on prod (TC-001 – TC-012) | ☐ |
| Product | Should items only if Must is green | ☐ |
| UI | Bangla default, English toggle, synthetic/cached/draft labels | ☐ |
| Backend | State trigger, audit append-only, spend cap | ☐ |
| Security | `npm audit` clean; no secrets in repo; rate limits; E-004 for hidden records | ☐ |
| Accessibility | TC-033 green, light and dark | ☐ |
| Testing | Unit + E2E green; failure-state tests run | ☐ |
| Evaluation | Report with 5 metrics + failures, dated 14 Oct | ☐ |
| Deployment | Prod smoke test; `r2-freeze` tag | ☐ |
| Presentation | 5–8 slides incl. metrics slide and [MOCK] items marked | ☐ |
| Submission | GitHub repo link | ☐ |
| Submission | 5–8 slide PowerPoint deck | ☐ |
| Submission | 1–2 min demo video | ☐ |
| Submission | Drive folder with TXT/DOC of links + deck + video | ☐ |
| Submission | Reply to selection email with folder link before 14 Oct; exact cutoff pending organiser confirmation | ☐ |
| Finale | Local stack, 5 rehearsals, backup recording, spare laptop | ☐ |

## 11 Recommendation

| Topic | Advice |
|---|---|
| Build first | Critical path in §5: case service + state guard, extraction, intake screens, found log, matcher, match review, close, map. Text path before voice. |
| Cut if short (in order) | 1 FR-036 disaster screen → 2 FR-010 13219 summary → 3 FR-024 import → 4 FR-029 edit after submit → 5 live voice (keep cached scripted note, label it) → 6 poster PNG (keep poster text). Never cut review-before-submit, officer confirm, referral, audit or redact identifying payloads. |
| Impact (judges) | Show one child's case reaching a known status, and the closure count on the map; tie to "2,038 still untraced" (pitch deck). |
| Feasibility | Show measured metrics with failures, the USD spend so far, and the offline demo. |
| Scalability | Show 64-district map, 30,000-cases/year design (NFR-015), provider adapter, and that CID integration is a data agreement, not new infrastructure. |
| Do not attempt | Face matching, alert sending, scraping social media, real child data, real officer verification, a native app. |

---

## Assumptions (D6)

| ID | Assumption |
|---|---|
| A-040 | Actual availability and completed work must be inventoried on 11 Oct. A fresh 11–14 Oct start at 10 h/person/day gives at most 120 team-hours; this is an assumption, not verified capacity. |

## Open questions (D6)

| ID | Question | Default |
|---|---|---|
| OQ-024 | Do classes, exams or labs reduce team hours before 14 Oct? | UNKNOWN; inventory actual availability and finished work at the 11 Oct review |

## Risks (D6)

| ID | Risk | L | I | Mitigation | Owner |
|---|---|---|---|---|---|
| RISK-017 | V2 Round 2 estimates total 184 h and may exceed actual remaining capacity | M | H | Daily stand-up; inventory completed work and actual owner capacity, sequence dependencies, reassign and cut optional scope on 11 Oct | Sadman |

## IDs introduced

- TASK-001 – TASK-060 (one line each in §5)
- A-040 Team capacity
- OQ-024 Team availability
- RISK-017 Capacity overrun

## IDs referenced

- FR-001 – FR-037, STORY-001 – STORY-023, BR-001 – BR-022, BR-025, NFR-001 – NFR-017 (D1)
- TC-001 – TC-037 (D1, written here)
- GOAL-001 – GOAL-009 (00)
- SCREEN-001 – SCREEN-016 (D1)
- API-001 – API-020, COMP-004 – COMP-021, E-001 – E-024, DECISION-017, A-013, A-030, A-039 (D2)
- COMP-022 – COMP-050 (D4)
- OQ-004, OQ-019, OQ-021 – OQ-023, RISK-015 (00, D1, D2)
- DEP-004 (D1)
