# D7 — Closing Pack — Fera

| Field | Value |
|---|---|
| Version | 2.0 |
| Date | 11 Oct 2026 (Asia/Dhaka, UTC+6) |
| Owner | Sadman Shaharier |
| Authors | Sadman Shaharier; Obidit Islam |
| Status | V2 team handover; implementation status UNVERIFIED |
| Inputs | V2 registry and D1–D6; team handover, verification evidence and meeting decisions. |

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

V2 replaces unsupported metrics and receipt/return claims, identifies pending meeting decisions, revises the compressed demo narrative and aligns release evidence with the V2 contracts.

---

## 1 Top 10 implementation priorities

| # | Priority | TASK | FR | Why first |
|---|---|---|---|---|
| 1 | Schema, case service, state guard, audit | TASK-002, TASK-015 | FR-016, FR-021 | Every safeguarding rule depends on them |
| 2 | Extraction adapter with evidence check and fallback | TASK-013 | FR-004, FR-026 | Core AI; critical path |
| 3 | Text intake + follow-up questions + review-before-submit | TASK-020 – TASK-022 | FR-001, FR-003, FR-005 – FR-007 | Guaranteed demo path; BR-004 |
| 4 | Synthetic set with ground truth, frozen before matcher code | TASK-010, TASK-019 | FR-032 | Honest metrics need it first |
| 5 | Matcher: filters, cosine, bonuses, template reasons | TASK-016, TASK-017 | FR-012, FR-013 | The "match surfaced" moment |
| 6 | Found-child log + review queue + side-by-side confirm/reject | TASK-026 – TASK-028 | FR-011, FR-014 – FR-017 | Human-confirms moment; BR-001 |
| 7 | Close with referral + district map | TASK-029, TASK-030 | FR-018, FR-019 | Closure visible to judges |
| 8 | Voice intake + demo-safe cache | TASK-014, TASK-021, TASK-033 | FR-002, FR-027 | Hero moment, offline-safe |
| 9 | Evaluation harness, WER, timing study | TASK-039 – TASK-041, TASK-043 | FR-028 | Deck promised all 5 metrics |
| 10 | Prod deploy, video, submission | TASK-042, TASK-045, TASK-046 | — | Nothing counts unless submitted by the official 14 Oct cutoff, exact time pending |

## 2 Top 10 risks

Separate execution risks from pilot safety gates. Synthetic-demo risk scores do not waive real-case safeguards. Score = likelihood (L 1, M 2, H 3) × impact (L 1, M 2, H 3, Severe 4). Ties broken by nearness of the deadline it threatens.

| Rank | RISK | Risk | L × I | Score | First action | Owner |
|---|---|---|---|---|---|---|
| 1 | RISK-017 | Round 2 work exceeds capacity | M × H | 6 | 21:00 stand-up; cut order on 11 Oct | Sadman |
| 2 | RISK-001 | Core journey unfinished by freeze | M × H | 6 | Text path first; voice after | Sadman |
| 3 | RISK-003 | AI invents or misreads fields | M × H | 6 | Evidence check; review screen | Obidit |
| 4 | RISK-005 | Venue internet fails | M × H | 6 | One backend per run; restart complete local scenario; labelled backup recording | Sadman |
| 5 | RISK-004 | AI outage or spend over USD 30 | M × H | 6 | Fallback provider; spend cap 25 | Obidit |
| 6 | RISK-012 | Overclaiming metrics, interviews or law | M × H | 6 | Metrics slide with failures; "0 interviews" stated | Sadman |
| 7 | RISK-002 | Bangla speech recognition too poor | H × M | 6 | Typed path; editable transcript; report WER | Obidit |
| 8 | RISK-011 | "Why not just MUN Alert?" | H × M | 6 | One slide: Potential future coordination support; no integration or alert authority | Sadman |
| 9 | RISK-010 | Judges favour environment-themed work | M × H | 6 | Ask mentors (OQ-003); disaster-mode slide | Sadman |
| 10 | RISK-009 | False match sends a child into danger | L × Severe | 4 | No physical return; external identity/guardian procedure and acknowledged partner hand-off required before a pilot | Sadman |

## 3 Demonstration script

All cases are synthetic. Officer verification is mocked; referral is an internal simulated record. No integration, custody transfer, rescue, or legal compliance is demonstrated. Display actual measured results or “not measured”; never present a target as a result.

### 3.1 Round 2 video: proposed 1:45

| Time | Screen/action | Spoken line |
|---|---|---|
| 0:00–0:12 | Title, sourced January–July figures | “The September report recorded 15,717 missing-child reports and 2,038 remaining untraced for January–July 2026. Fera explores better report coordination.” |
| 0:12–0:20 | Synthetic and processing notice | “This is a synthetic prototype. A parent can speak or type in Bangla.” |
| 0:20–0:38 | Compressed voice capture/transcript; time-compressed label | “The transcript is editable. External AI processing is explained before intake.” |
| 0:38–0:52 | Required field question/manual completion/review/confirm | “The parent reviews the fields before a report enters the register.” |
| 0:52–1:02 | GD draft; separate poster contact preview | “Fera drafts text. It does not file a GD or issue alerts.” |
| 1:02–1:12 | Staff own found report | “Staff records an invented found-child description.” |
| 1:12–1:28 | Qualified candidates, evidence and checklist | “Similarity supplies candidates, not identity proof. A reviewer records the decision and a simulated referral.” |
| 1:28–1:38 | Coordination closure and separate counts | “The missing-report coordination status changes. Found reports and confirmed pairs are counted separately.” |
| 1:38–1:45 | Measured metrics, sample counts, failures | “These are held-out synthetic measurements, with failures and limitations.” |

A 38-second recording is compressed in the 18-second segment; label the time compression and report measured live latency separately. If the required video length differs in the organiser email, adapt this script without hiding delays or cache use.

### 3.2 Finale: 8 minutes plus 2-minute Q&A buffer

| Time | Speaker | Action and content |
|---|---|---|
| 0:00–1:00 | Sadman | Sourced scale, existing recorded outcomes; unmet coordination hypothesis, no national-registry absence claim |
| 1:00–1:45 | Sadman | Fera's proposed reviewed intake/coordination role; no MUN/CID integration or alert authority |
| 1:45–3:15 | Obidit | Processing notice, synthetic Bangla voice/text, editable transcript, source evidence, unknown/manual completion, reviewed submission |
| 3:15–3:45 | Obidit | Fixed GD draft, explicit contact choice and poster sharing limits |
| 3:45–5:00 | Masnun | Staff entry, officer evidence, no-match/uncertainty cue, rejection reason and simulated confirmation/referral record |
| 5:00–5:45 | Masnun | Coordination closure, distinct report/pair counts, visible duplicate cues and safe audit |
| 5:45–6:45 | Sadman | Actual held-out dataset/model/denominators, baselines, failures, live latency and measured spend |
| 6:45–7:30 | Sadman | Synthetic-only restriction; no face/photo; real-case verification/legal/provider/partner/correction gates |
| 7:30–8:00 | Sadman | 64-district data model and next evidence needed; no unsupported scalability or rescue promise |
| 8:00–10:00 | All | MUN overlap, AI contribution, false candidates, data availability, offline scope, correction and operating capacity |

Failure line: “We are restarting the labelled synthetic scenario on our local stack.” All roles switch to the same local DB; never continue a cloud report on a separate local officer DB. If local fails, show the labelled backup recording. Cache and mock badges remain visible. Cost lines use measured spend at recording time, not the USD 30 target.

## 4 Clarifications still needed

| OQ | Question | Who can answer | By when |
|---|---|---|---|
| OQ-001 | Voice and poster Must for Round 2? | Team (Sadman) | 11 Oct contract gate |
| OQ-002 | separate missing/found state machine confirmed? | Team (Sadman) | 11 Oct contract gate |
| OQ-003 | Environment theme / disaster mode weight | Mentors | Session 2, 12–Before recording or official submission |
| OQ-004 | Keys held; default provider; prices | Obidit | 11 Oct evidence gate |
| OQ-005 | Finale topology confirmed | Team; organisers (venue Wi-Fi) | Before recording or official submission |
| OQ-006 | Build status and interviews held | Team | 11 Oct evidence gate |
| OQ-007 | Demo login and roles | Team | 11 Oct evidence gate |
| OQ-010 | Correct CID unit name for alerts | Public CID briefing identifies Missing Children Cell; partner workflow still pending | 11 Oct |
| OQ-011 | Personal Data Protection Act specifics | Legal adviser | Before any pilot (synthetic prototype makes no compliance claim) |
| OQ-012 | Retention period for closed cases | Partner agency | Before any pilot |
| OQ-013 | Provider training and retention terms | Obidit (provider docs) | 11 Oct evidence gate |
| OQ-016 | Official online GD field list | Mentors or a police contact | Before claiming template/agency acceptance; use draft/simulation labels now |
| OQ-017 | District adjacency source | Masnun | 11 Oct |
| OQ-018 | Referral agency name to show | Child-protection NGO or mentors | Before claiming template/agency acceptance; use draft/simulation labels now |
| OQ-019 | Ethics of testing with real parents | Mentors / faculty | 12 Oct |
| OQ-020 | Cross-device parent access | Team | After the finale |
| OQ-021 | Managed Postgres host | Sadman | 11 Oct evidence gate |
| OQ-022 | Speech provider limits and price | Obidit | 11 Oct evidence gate |
| OQ-023 | Hosting limits for local embeddings | Masnun (spike) | 11 Oct evidence gate |
| OQ-024 | Team availability before freeze | Team | 11 Oct evidence gate |
| OQ-025 | Judging weights for impact, feasibility, scalability | Organisers | Before recording or official submission |
| OQ-026 | Is synthetic data without real public-child news acceptable for Round 2 technical evaluation? | Organisers / mentors | Before recording or official submission |

Resolved by default and needing only team sign-off: OQ-008, OQ-009, OQ-014, OQ-015.

---

## IDs introduced

- OQ-025 Judging weights
- OQ-026 Acceptability of synthetic data for Round 2

## IDs referenced

- TASK-002, TASK-010, TASK-013 – TASK-017, TASK-019 – TASK-022, TASK-026 – TASK-030, TASK-033, TASK-039 – TASK-043, TASK-045, TASK-046 (D6)
- FR-001 – FR-007, FR-011 – FR-019, FR-021, FR-026 – FR-028, FR-032 (D1)
- RISK-001 – RISK-005, RISK-009 – RISK-012, RISK-017 (D1, D6)
- BR-001, BR-004 (D1)
- SCREEN-001 (D1)
- OQ-001 – OQ-024 (00, D1, D2, D6)

## V2 meeting outputs

The next meeting closes: actual build/interviews/availability; state/referral/closure meanings; duplicate visibility; required fields/unknown/time rules; DTOs and idempotency; exact provider/model/account terms/prices; single-DB topology; manifest/metric freeze; official deliverables/cutoff and responsible submitter. Track unresolved partner/legal questions as pilot gates. Track actual institution/name spelling from registration; do not infer affiliation.
