# 00 — Gap Check and Seed Registry — Fera

| Field | Value |
|---|---|
| Version | 2.0 |
| Date | 11 Oct 2026 (Asia/Dhaka, UTC+6) |
| Owner | Sadman Shaharier (team lead) |
| Authors | Sadman Shaharier; Obidit Islam |
| Status | V2 team handover; implementation status UNVERIFIED |
| Sources read | S1a `fera_pitch_deck.pdf` (16 slides, Round 1); S1b Claude Doc "Fera — Product Requirements Document (v2)", rev 18, 7 Oct 2026; S2 PROJECT CONTEXT block |

Source rank: S1a = S1b > S2 > assumptions. Where S1a and S1b disagree, the newer S1b wins.

---

## V2 release contract

**Authors:** Sadman Shaharier and Obidit Islam. **Version:** 2.0. **Issued:** 11 October 2026, Asia/Dhaka (UTC+6).

This is the revised team specification, not evidence that the application has been built. Actual repository progress, account configuration, interviews, evaluations, and spend remain **UNVERIFIED** until evidence is attached. V1 defaults are superseded by the V2 rules below; existing requirement IDs are retained.

- This release is a **synthetic-data prototype**. Officer verification and referral delivery are simulated and labelled. The schema rejects records marked non-synthetic; the application must also prevent real reports from entering this release.
- A candidate score is similarity, not identity probability. A reviewer decision does not establish guardian authority or safe reunification. A referral row means **referral recorded**, not delivered or acknowledged.
- Draft payload stays on the device before report confirmation, but providers process audio/text beforehand with a notice. Only expiry/counter/hash metadata and cost reservations are stored server-side before submission.
- Possible duplicates remain visible. Shared phone alone never establishes one child. No physical child-return action is performed by Fera.
- Counts distinguish missing-report rows, found-report rows, and confirmed pairs. They are not a census of unique children or proof of rescue.
- Sources, diagrams, tables, code blocks, and acceptance criteria are part of the handover. The companion code must match the embedded code exactly. [Team handover](TEAM_HANDOVER_V2.md) records change closure, evidence gaps, and release gates.

## (a) Clarification questions

Only questions whose answers change scope, architecture or the demo. Each has a default. V2 working choices are specified below. Record team approval and evidence; an unanswered account, partner, or organiser question remains pending.

| OQ | Question | Why it matters | Default if unanswered | Blocks |
|---|---|---|---|---|
| OQ-001 | Are **voice intake** and **poster + 13219 summary** Must for Round 2? | PRD v2 marks both Should (v2 FR7, FR8). PROJECT CONTEXT lists "Bangla intake → poster + GD" as built and the D6 journey starts with a voice note. | Voice = **Must**, with typed text as the guaranteed path and a cached transcript for the scripted demo note. Poster = **Must** (text poster, no photo). 13219 summary = **Should**. | D1 scope, D6 critical path |
| OQ-002 | Adopt the separate missing/found state machine from PROJECT CONTEXT (draft → submitted → open → matched-pending-review → confirmed → closed/referred)? | PRD v2 uses open / matched / closed / reopened and closes both cases on confirm. Changes BRs, schema enums, map legend. | Use browser draft plus five persisted missing-case states (submitted/open/matched_pending_review/confirmed/closed). Found cases use open → matched_pending_review → referred; the last value means referral recorded only. PRD v2's "reopened" maps to "open". | D1 §13, D2 schema |
| OQ-003 | What did mentors say in session 1 (7–8 Oct) about the environment theme and disaster mode? | PRD v2 rates "judges favour environmental projects" Medium/High risk. The answer decides whether disaster mode gets a demo screen. | Disaster mode stays **Could**: one static screen reusing the found-child form, labelled "planned extension". No need claims. | D1 scope, D6, D7 script |
| OQ-004 | Which accounts and API keys does the team already hold (LLM providers, OpenAI for Whisper, Postgres host, Vercel)? Any free credits? | Sets the default LLM provider, the embedding source and the USD 30 budget estimate. | Provider/account/model/price is PENDING. Only synthetic test data may reach APIs; enforce terms, atomic reservations and actual prices before paid dispatch. | D2 stack, cost model |
| OQ-005 | Finale demo topology: deployed app over venue Wi-Fi, or laptop-local (localhost DB, phone on laptop hotspot)? | Venue internet may fail. Local-first changes DB hosting, embeddings and the fallback design. | Deployed app for Round 2 video. **Single-backend** local stack for the finale fallback. All roles share one local DB; preloaded assets and labelled fixtures support the scripted scenario. Restart the local scenario when switching from cloud. | D2 §3, §14, §15; D6 phase 6 |
| OQ-006 | What exists today (9 Oct)? Repo skeleton, synthetic set, 50 labelled reports, any user conversations held? | PRD v2 planned build days 7–11 Oct; 5 days remain. The deck also promises 5–10 user conversations. | Actual build and interviews are UNVERIFIED. Inventory the repository and completed tasks on 11 Oct; do not restart completed work or claim interviews without evidence. | D6 phases, D7 risks |
| OQ-007 | Demo auth and roles: real login or a role switcher? Keep PRD v2's extra "helper" role? | PRD v2 roles: parent, helper, staff, officer, admin. PROJECT CONTEXT: parent, officer, shelter staff, admin. | Seeded accounts with protected seeded synthetic login; officer verification **[MOCK]** (seeded `verified=true`). Drop "helper"; a helper files as a parent with relation = "other". | D2 §9, D3 auth flow |

### Non-blocking open questions (logged now, defaults applied)

| OQ | Topic | Conflict or gap | Default applied |
|---|---|---|---|
| OQ-008 | Evidence scope | PROJECT CONTEXT says use only 5 figures. Deck and PRD v2 also cite age 0–9 split, MUN Alert "200+ cases / 29 rescued", Teknaf "10 victims". | Use only the 5 PROJECT CONTEXT figures, cited to the originating report; original pitch/PRD are not supplied. |
| OQ-009 | Accessibility level | PRD v2 targets WCAG 2.1 AA; D4 spec asks 2.2 AA. | Target 2.2 AA. It includes all 2.1 AA criteria, so PRD v2 is still met. |
| OQ-010 | Alert authority wording | Deck slide 4 says only CID's Missing Children Cell can issue alerts, and also that a proposed Cell "never materialised". | Write "CID (via MUN Alert) issues or withdraws alerts". Ask a mentor or CID contact for the correct unit name. |
| OQ-011 | Personal Data Protection Act (2026) | PRD v2 says "passed April 2026". No clauses are in any source. | Cite the Act by name only. Accurately sourced legal references are allowed; unsupported compliance claims are prohibited. Qualified review is required before a pilot. |
| OQ-012 | Retention period for closed cases | PRD v2: "to be set with a partner". Safeguarding requires delete/redact identifying payloads. | Demo: redact identifying payloads on an admin action. Period = UNKNOWN. |
| OQ-013 | LLM/STT provider data terms | PRD v2: "confirm per provider" no-training and retention terms. | Synthetic data only reaches providers before terms are checked. |
| OQ-014 | Persona count | PRD v2 has 4 personas incl. child-protection officer; D1 spec asks for 3. | 3 primary personas in full; child-protection caseworker kept as secondary PERSONA-004 (no UI in MVP). |
| OQ-015 | Dedupe priority | PRD v2 puts duplicate merge at Could (v2 FR10). Deck promises a duplicate-detection quality metric in Round 2. | Duplicate **detection + offline metric** = Must. Merge **UI** = Could. |

---

## (b) Seed registry

### GOALs

Targets are provisional working targets. Tune on development data only, then freeze thresholds/prompts/targets before the held-out test. Synthetic performance does not establish safe real-case identity matching.

| ID | Goal | Metric | Target (source) | Set / method |
|---|---|---|---|---|
| GOAL-001 | A parent produces a reviewed Bangla report in the first hour | Time to complete report, assistant vs manual form | ≤ 5 min and faster than manual (PRD v2) | Timed tests, ≥ 5 users |
| GOAL-002 | AI extracts case fields correctly from messy Bangla | Field-level extraction accuracy | ≥ 85 % on required fields (PRD v2) | 50 hand-labelled reports |
| GOAL-003 | The right found-child record appears in the officer's shortlist | Recall@5; precision@1; precision@5 reported | ≥ 80 % / ≥ 60 % (PRD v2); P@5 as measured (S2) | Synthetic ~200-record set with ground truth |
| GOAL-004 | Duplicate reports of one child are detected | Duplicate-detection pairwise F1 | ≥ 0.8 (PRD v2) | Synthetic set with seeded duplicates |
| GOAL-005 | Bangla voice is usable for intake | Word error rate | ≤ 30 % (PRD v2) | Recorded test prompts |
| GOAL-006 | Every demo report has an explicit recorded coordination status, visible by district | Seeded cases shown with correct status | 100 % (PRD v2) | DB count vs map count |
| GOAL-007 | The live demo does not fail | Rehearsals passing end to end | 5 of 5, at least 1 with internet off (internet-off part proposed) | Rehearsal log |
| GOAL-008 | Humans make every match decision | Match-driven status changes with a recorded authorised decision and append-only audit | 100 % (PRD v2 FR5) | Audit-log check script |
| GOAL-009 | Results are reported honestly | Metrics slide with failure cases | 1 slide, all 5 metrics, ≥ 2 failure examples (PRD v2) | Deck review before the organiser-confirmed 14 Oct cutoff |

Legacy map: v2 G1 → GOAL-001, G2 → GOAL-003, G3 → GOAL-006, G4 → GOAL-009, G5 → GOAL-007. v2 secondary goals → GOAL-004, GOAL-005. v2 US/FR/A IDs are remapped in D1.

### PERSONAs

Names are fictional, built from published reporting, not interviews (PRD v2 A5).

| ID | Persona | One line | Priority |
|---|---|---|---|
| PERSONA-001 | Parent/guardian ("Shirin") | Dhaka mother, 30s; son, 13, did not return from madrasa; Bangla-first, weak formal writing, Android browser. | Must |
| PERSONA-002 | Verifying officer ("SI Karim") | Thana duty officer, several missing-child GDs a week; reviews matches on a desktop. | Must |
| PERSONA-003 | Shelter/station staff ("Rumana") | NGO volunteer at a railway-station children's desk; logs found children on a phone. | Must |
| PERSONA-004 | Child-protection caseworker | Intended future referral recipient; V2 records a simulated referral only; no recipient UI or delivery integration. | Should (record only) |
| PERSONA-005 | Disaster-mode shelter volunteer | Logs separated children after floods/cyclones; planned extension, no measured need. | Could (per OQ-003) |

### MVP feature list

"Demo" = the moment the feature appears in the Round 2 video or finale. Features become FR-IDs in D1.

| # | Feature | MoSCoW | Planned implementation / simulation | Why (demo moment or safeguarding) |
|---|---|---|---|---|
| 1 | Bangla/mixed/Bangla-numeral **text** intake → case draft + one-at-a-time follow-up questions | Must | Planned; not verified | Demo: parent describes child; draft appears |
| 2 | Bangla **voice** intake (STT → transcript for review) | Must* | Planned + cached demo transcript | Demo hero moment; *pending OQ-001 |
| 3 | Parent review/edit; no submitted case, candidate sharing or export before confirm; provider processing is disclosed earlier | Must | Planned; not verified | Safeguarding: parent reviews before sharing |
| 4 | Bangla GD draft from fixed template (LLM may not add facts) | Must | Planned; not verified | Demo: copyable GD text |
| 5 | Shareable text poster (no child photo) | Must* | Planned; not verified | Demo: poster; *pending OQ-001 |
| 6 | 13219-ready summary (< 80 words) | Should | Planned if time | Demo add-on; Fera never calls or alerts |
| 7 | Found-child logging by staff (form or free text) | Must | Planned; not verified | Demo: station notice enters system |
| 8 | Matching: hard filters + embeddings + rules → top-5 with one-line reasons | Must | Planned; not verified | Demo: likely match surfaced |
| 9 | Officer review queue, side-by-side evidence, confirm/reject | Must | Planned; not verified | Safeguarding: human confirms every match |
| 10 | Simulated referral record on confirm; never imply delivery or auto-return | Must | Planned; not verified | Safeguarding: child-protection referral |
| 11 | District map with open/matched/closed counts (icon + text + colour) | Must | Planned; not verified | Demo: case closes on map |
| 12 | Role-based access; candidate/other-party matched evidence visible only to verified officers | Must | Planned; verification [MOCK] | Safeguarding: stalker-misuse defence |
| 13 | Append-only audit log of match decisions and status changes | Must | Planned; not verified | Safeguarding: auditable decisions |
| 14 | Redact identifying payloads from closed/eligible referral-recorded cases (admin action) | Must | Planned (manual trigger) | Safeguarding: delete/redact identifying payloads closed cases |
| 15 | Duplicate detection + offline duplicate-detection metric | Must | Planned; not verified | Deck promises the metric in Round 2 |
| 16 | Evaluation scripts for all 5 metrics | Must | Planned; not verified | Deck: "report as measured, including failures" |
| 17 | Demo-safe fallback: cached STT/LLM outputs for scripted inputs; manual form on AI failure | Must | Planned; not verified | Venue internet unreliable |
| 18 | Synthetic data seed loader (~200 records, labelled "synthetic") | Must | Planned; not verified | Demo data; no real child data |
| 19 | Import invented public-format fixture texts with source metadata | Should | Planned if time | Feeds matching beyond direct reports |
| 20 | Duplicate merge UI | Could | — | Metric covered by #15 |
| 21 | Dashboard filters (age band, date range) | Could | — | Not needed for the core journey |
| 22 | Parent case-status view (status only, no match details) | Could | — | Nice to show "being checked" |
| 23 | Disaster-mode screen | Could | Static | Per OQ-003 |
| 24 | Live police data | Won't (build) | [MOCK] = labelled synthetic seed | No data access before a partner agreement |
| 25 | Telecom location targeting | Won't (build) | [MOCK] = slide only | Out of scope; no partner |
| 26 | Face matching | Won't (build) | [MOCK] = slide only, "future, CID-held records, human review" | No public face search, ever |
| 27 | Issuing, withdrawing or broadcasting alerts | Won't (ever) | — | Only CID can (OQ-010) |
| 28 | "Runaway" labels, predicting who goes missing | Won't (ever) | — | Safeguarding |
| 29 | Native app, SMS/IVR intake | Won't | — | Post-hackathon roadmap |

---

## (c) Turn plan

| Turn | Unit | Files | Notes |
|---|---|---|---|
| 0 | Gap check + registry | `00_Gap_Check_and_Registry_V2.md` | This file |
| 1 | D1 PRD | `D1_PRD_V2.md` | Applies answers or defaults for OQ-001 – OQ-007 |
| 2 | D2 TRD Part A (§1–9) | `D2_TRD_PartA_V2.md` | Stack, architecture, components, API, data model |
| 3 | D2 TRD Part B (§10–19) | `D2_TRD_PartB_V2.md`, `schema_v2.sql` | Security, privacy, budget estimate, evaluation design |
| 4 | D3 App Flow | `D3_App_Flow_V2.md` | All 14 mandatory edge cases |
| 5 | D4 Design Brief | `D4_Design_Brief_V2.md`, `tokens_v2.css` | Bangla + English strings |
| 6 | D5 Background Schema | `D5_Background_Schema_V2.md`, `fera_types_v2.ts` | May split to Part A/B if the registry overflows |
| 7 | D6 Implementation Plan | `D6_Implementation_Plan_V2.md` | Rebased from verified progress on 11 Oct; Round 2 date 14 Oct; exact cutoff pending organiser confirmation |
| 8 | D7 Closing Pack | `D7_Closing_Pack_V2.md` | Priorities, risks, timed demo scripts, OQ owners |

Time note: specs alone take 9 turns. Use the V2 contract gate before dependent coding. D6 requires actual remaining-work and availability evidence on 11 Oct. The previous nine-turn drafting sequence is historical, not the current delivery schedule.

---

## IDs introduced

- GOAL-001 – GOAL-009 (9)
- PERSONA-001 – PERSONA-005 (5)
- OQ-001 – OQ-015 (15)

## IDs referenced

- Legacy PRD v2 IDs (G1–G5, US1–US9, FR1–FR11, A1–A5), cited as "v2 …" only; remapped in D1.
