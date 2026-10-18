# Feature Specification: Quality, evaluation and release

**Feature Branch**: `pre-main--spec-desk-data`

**Created**: 2026-10-14 (Asia/Dhaka); recovered 2026-10-18 from `origin/phase1--mahim-spec007` to `specs/007-quality-release/spec.md` and `checklists/requirements.md`. Plan and tasks created 2026-10-18 by Puku CLI Opus 4.8 worker for the pre-main convergence lane.

**Status**: Draft for human skim; specification only

**Input**: Feature 007 brief in `docs/agents/SPECKIT_PROMPTS.md` and the V2 spec pack
**Owner**: Mahim (shared; each task keeps its D6 owner: S = Mahim, O = Obidit, M = Masnun)

This feature defines how the team proves, measures, releases and presents the synthetic Fera prototype: release-candidate checks, accessibility and Bangla copy, device checks, the frozen honest evaluation, the production release, the Round 2 submission package and finale readiness. It is a target, not evidence that any check has run, any metric has been measured, any build has been deployed or any deliverable has been sent. On 14 Oct 2026 the repository is a specs-and-skeleton tree; the upstream build tasks this feature depends on have no completion evidence. (STORY-022, STORY-023; FR-027, FR-028, FR-032; GOAL-001–GOAL-009; TASK-034–046, TASK-053–058, TASK-060)

## User Scenarios & Testing *(mandatory)*

Stories 1–5 serve Round 2 Must work and story 6 serves finale Must work (D6 §5). Stories 7–8 are Should items. Priorities follow the source classification and dates, not a new ordering inside each group.

### User Story 1 - Prove the release candidate keeps the journey and safeguards (Priority: P1)

The release owner runs the automated checks on a release candidate and gets one result per applicable acceptance case: logic-level tests for the normaliser, matcher, state guard and wording guard, and browser journeys for the essential journey and the safeguarding cases. Each Must failure appears as a disclosed blocker, not a hidden skip. (TASK-037 S, TASK-038 S; D6 §1, §7, §8, §8.1; D2 Part B §18 #1, #6)

**Why this priority**: A Must requirement counts as done only when its acceptance test passes on the deployed Round 2 build. Unmet items must be disclosed and block the claimed feature. (D1 §18; D2 Part B §18 #1)

**Independent Test**: On a synthetic release candidate, run the unit suite and the essential-journey and safeguarding journeys, then inspect the result list against TC-001–TC-066 and the log scan. Check TC-010, TC-019, TC-022–TC-028 and TC-031–TC-032 without relying on evaluation or deployment.

**Acceptance Scenarios**:

1. **Given** the release candidate, **when** the unit suite runs, **then** at least 60 tests pass across the normaliser, matcher, state guard and wording guard, including the 30 normaliser cases from TASK-012, with the routine checks green. (TASK-037; TASK-012; D6 §7)
2. **Given** a seeded synthetic demo set, **when** the essential-journey run executes steps 1–8 of D6 §1, **then** each step's TC records pass or fail on both a 360 px phone width and a 1280 px desktop width. (TASK-038; TC-001–TC-012; D6 §7)
3. **Given** the safeguarding cases, **when** they run, **then** a pass requires: refused candidate access for parent, staff and unverified roles; outputs that are labelled drafts with no alert action; no image input; illegal transitions rejected; append-only audit. (TC-019, TC-022–TC-027, TC-029, TC-032; BR-001, BR-002, BR-006, BR-007, BR-012, BR-013)
4. **Given** a full journey run, **when** its logs are scanned, **then** no phone-number pattern or seeded child name appears. (TC-028; NFR-010; D2 Part B §18 #6)
5. **Given** an acceptance case that can be shown only by a companion specification or a portable engine, **when** results are reported, **then** it is listed separately and never counted as an app or service pass. (TASK-038; TC-062; TEAM_HANDOVER_V2 §9)

---

### User Story 2 - Make every Must screen usable in Bangla, by keyboard and on real phones (Priority: P1)

Parents, staff and officers can use every Must screen in Bangla and English, by keyboard, at small widths and enlarged text, and on two Android phones. Every loading, empty, error and success state has both Bangla and English copy. (TASK-034 S, TASK-035 O, TASK-036 M; NFR-011, NFR-013; FR-033; D3 §§ states and E-001–E-024; D4)

**Why this priority**: WCAG 2.2 AA, Bangla default text and two-phone compatibility are Must quality bars for every Must screen. (NFR-011, NFR-013; D1 §18 items 2, 3, 7)

**Independent Test**: On the production-mode build, run the automated accessibility scan in light and dark themes, walk each Must screen by keyboard, check 320 CSS px reflow, 200% text zoom and 400% viewport zoom, review copy for every state, and complete the two-phone checklist. Check TC-033 and TC-058.

**Acceptance Scenarios**:

1. **Given** each Must screen in light and dark theme, **when** the automated accessibility scan runs, **then** it reports 0 serious or critical findings, and a manual keyboard walk reaches every action. (TASK-034; TC-033; NFR-011)
2. **Given** each Must screen, **when** it is viewed at 320 CSS px, 400% viewport zoom and 200% text zoom, **then** content reflows without loss. Single-character shortcuts are off while the user is typing and can be switched off. A Bangla screen-reader spot check finds no unresolved AA issue. (TC-058; D2 Part B §18 #9)
3. **Given** every E-001–E-024 state and every loading, empty and success state, **when** it is shown, **then** both Bangla and English text exist. The copy is the exact D3/D4 string where one exists, comes from the locale files, and has no red on parent screens. Status uses icon + text + colour. (TASK-035; FR-033; D4 behaviour rules)
4. **Given** two Android phones, **when** the device checklist runs, **then** Bangla glyphs render with none missing, the microphone records, the 360 px layout works, and the signed checklist identifies each device. (TASK-036; NFR-013; TC-061)

---

### User Story 3 - Report frozen, honest evaluation results (Priority: P1)

With one command, the team computes the five promised metrics on a frozen manifest and build. The report shows denominators, abstention and coverage, baselines and at least two failure examples. Any metric that could not be measured says "not measured" with a reason. (STORY-022; FR-028; TASK-039 M, TASK-040 O, TASK-041 S, TASK-043 M; GOAL-001–GOAL-005, GOAL-008, GOAL-009; D2 Part B §17)

**Why this priority**: The deck promises all five metrics. Honest reporting needs held-out measurement with no cache or fixture contamination. (GOAL-009; Constitution VI, VII; TEAM_HANDOVER_V2 §8)

**Independent Test**: Run the harness on the dev split, then once on the held-out split after the manifest, model and threshold freeze, with demo mode and caches disabled. Inspect the report sections and the hashes. Check TC-020, TC-056 and TC-064.

**Acceptance Scenarios**:

1. **Given** the frozen grouped manifest (80 missing + 80 found + 40 decoys = 200 records; 60 true pairs; 20 no-match queries; 25 duplicate links; identity-grouped 40/60 dev/test split with actual counts reported), **when** the held-out run executes, **then** the report gives Recall@5, top-1 precision with coverage, query-level P@5 and named aggregate shortlist precision, no-match false suggestions and abstention, and duplicate precision, recall and F1. Each has numerator and denominator. (TASK-039, TASK-043, TASK-064; GOAL-003, GOAL-004; TC-064; D2 Part B §17)
2. **Given** the 50 labelled reports, **when** extraction is evaluated, **then** present-field accuracy, false additions and omissions are reported separately from null agreement. Null agreement is never used as headline accuracy. (TASK-011, TASK-039; GOAL-002)
3. **Given** 60 unique clips (20 scripted prompts × at least 3 speakers), **when** WER runs, **then** it reports WER = (S+D+I)/N and critical-field errors. Repeated runs are labelled as repeats, not as new samples. (TASK-040; GOAL-005; A-012)
4. **Given** at least five adult volunteers role-playing a parent with invented scenarios, **when** the paired, counterbalanced timing study runs against the manual form, **then** the report gives median, range and the completion numerator/denominator, labelled exploratory. A five-person 90% completion claim requires 5/5. (TASK-041; GOAL-001; A-010, A-011; NFR-012)
5. **Given** a quality run, **when** any cache or fixture response is hit, **then** the affected result is rejected or excluded and labelled. Fixture output is never reported as a metric. (TC-056; FR-027; D2 Part B §17)
6. **Given** the final run on the freeze build, **when** the report is committed, **then** it records the commit, model revision, manifest and prompt/template hashes, date, hardware or deploy, and model/account mode, and it includes at least two failure examples. (TASK-043; TC-020; STORY-022 AC1)

---

### User Story 4 - Release one identified production build and record its performance (Priority: P1)

The release owner deploys the frozen build with seeded synthetic data and confirms it with a smoke check. Each performance target is then recorded as measured and marked met or missed. (TASK-042 S, TASK-060 M; NFR-001–NFR-006; D2 Part B §12.1, §15.3–15.4)

**Why this priority**: The Round 2 video, evaluation and judges all depend on one identified, working synthetic deployment. (D6 §2; D2 Part B §15)

**Independent Test**: Deploy the candidate, seed the demo set, run the smoke check (health, sign-in, one extraction, map stats), identify the build, then run the performance measurements. Check TC-034.

**Acceptance Scenarios**:

1. **Given** the release candidate has passed US1, **when** it is deployed and seeded with synthetic data only, **then** the smoke check passes on production and the build is identified by commit and the `r2-freeze` tag. (TASK-042; D2 Part B §15.3, §15.4; BR-026)
2. **Given** the production build, **when** performance is measured, **then** each D2 Part B §12.1 target (first load, non-AI p95, transcription, extraction, voice-to-draft, matching, map, concurrency) records its value and sample size and is marked met or missed. (TASK-060; TC-034; NFR-001–NFR-006)
3. **Given** a failed smoke check, **when** the release owner acts, **then** the previous green commit is redeployed and the failure is recorded. A failed build is never presented as the release. (D2 Part B §15.4)
4. **Given** paid AI calls during release work, **when** spend is reported, **then** reservations and settled spend show against the USD 25 default cap. Any raise up to USD 30 needs a documented team decision. (TASK-059; TC-036, TC-065; NFR-016; D2 Part B §18 #10)

---

### User Story 5 - Submit the Round 2 package truthfully and on time (Priority: P1)

The team prepares a 5–8-slide deck, a 1–2-minute video, a README and a Drive folder of links, then replies through the organiser-confirmed channel. Every number traces to the frozen report or says "not measured". The working baseline is 14 Oct 2026, 22:00 Asia/Dhaka, with an internal send target of 21:00. The organiser extension cutoff is UNKNOWN. (TASK-044 S, TASK-045 O, TASK-046 S; D6 §10; D7 §3.1; PHASE_4 AMD-4-1)

**Why this priority**: Work that is not submitted through the confirmed channel before the confirmed cutoff does not count for Round 2. (D7 §1 #10; D1 §18)

**Independent Test**: Review the deck, video script and README with the wording guard and the safeguarding reviewer. Trace every figure to the frozen report, open every link in a logged-out private window, and record receipt evidence. Check TC-025, TC-037 and TC-066.

**Acceptance Scenarios**:

1. **Given** the frozen evaluation report, **when** the deck is built, **then** it has 5–8 slides. The metrics slide shows all five metrics with denominators and at least two failures, and [MOCK] items, synthetic data and simulated referral are labelled. (TASK-044; GOAL-009; BR-026)
2. **Given** the D7 §3.1 script, **when** the 1–2-minute video is cut, **then** time compression, cached outputs and synthetic data are labelled on screen. Measured live latency is reported separately from compressed footage. (TASK-045; TEAM_HANDOVER_V2 §8)
3. **Given** the deck, video script and README text, **when** they are reviewed, **then** they contain 0 unsupported alert, runaway, rescue, return, police or CID integration, interview or legal-compliance claims. "Similarity" and "Referral recorded (simulation)" wording is used. (TC-025, TC-037, TC-066; BR-002, BR-003, BR-005, BR-011)
4. **Given** organiser-confirmed instructions, **when** the package is sent, **then** the folder holds the links file, deck and video, every link opens logged out, and receipt evidence through the confirmed channel before the confirmed cutoff is recorded. Without that evidence, the submission is not marked sent. (TASK-046; LINK-CHECK; PHASE_4 AMD-4-1)

---

### User Story 6 - Run the finale demo reliably offline (Priority: P2)

At the 24 Oct finale, the demo operator runs the scripted journey on a laptop-local stack with all roles on one local database. If needed, they restart a fresh labelled local scenario or play a labelled backup recording, and present a finale deck within the slot. (STORY-023; FR-027, FR-032; TASK-053 S, TASK-054 S/O/M, TASK-055 S, TASK-058 O; GOAL-007; NFR-007; D6 §9; D7 §3.2)

**Why this priority**: Finale work is Must, but it is due after Round 2. Venue internet failure must not break the demo. (GOAL-007; RISK-005)

**Independent Test**: With demo mode on and the network disabled, run the scripted journey on the local stack with all roles in separate browser profiles on one database, then log five rehearsals and time the deck. Check TC-021 and TC-057.

**Acceptance Scenarios**:

1. **Given** the local stack with bundled fonts, model, fixtures and district geometry, **when** the network is off, **then** the scripted journey completes with visible cached and synthetic labels. (TASK-053; TC-021, TC-057; FR-027; STORY-023 AC1–AC2)
2. **Given** five rehearsals, **when** they are logged, **then** 5 of 5 pass and at least one runs with the internet off. Each run uses one backend only. (TASK-054; GOAL-007; NFR-007)
3. **Given** a cloud failure on stage, **when** the operator switches, **then** a fresh local synthetic scenario restarts with a spoken disclosure. A cloud report is never continued on a separate local officer database. (D6 §9.4; D7 §3.2; TEAM_HANDOVER_V2 §8)
4. **Given** the finale deck and backup recording, **when** they are prepared, **then** a timed run takes 10 minutes or less and a labelled recording is stored on the laptop and in Drive. (TASK-055, TASK-058; D7 §3.2)

---

### User Story 7 - Apply the agreed mentor fixes (Priority: P3)

Each owner applies the fixes agreed at mentor session 2 in their own area and verifies them before the gate that needs them. (TASK-056 S/O/M, Should; DEP-010; PHASE_2 mentor table)

**Why this priority**: TASK-056 is Should in D6 §5. The mentor fix list is not yet recorded (UNKNOWN).

**Independent Test**: For each row in the Phase 2 mentor-fix table, check its owner, merged change and verification evidence, or its recorded not-done status.

**Acceptance Scenarios**:

1. **Given** a recorded mentor fix, **when** its owner merges it, **then** it is verified before the gate that needs it, or recorded as missed with a reschedule by the lead. (TASK-056; PHASE_3 AMD-3-2)
2. **Given** a fix that would weaken review-before-submit, officer confirmation, referral, audit or redaction, **when** it is proposed, **then** it is refused. (Constitution I–V; D6 §11)

---

### User Story 8 - Hold user conversations only if OQ-019 is cleared (Priority: P3)

If mentors or faculty clear OQ-019, the team holds 5–10 consented conversations and reports findings only from the consented notes. Otherwise TASK-057 stays blocked and no interview findings are claimed. (TASK-057 S, Should; OQ-019; A-010)

**Why this priority**: TASK-057 is Should, and its ethical basis is unresolved. The D1 default for including real affected parents is "no". (OQ-019; A-010)

**Independent Test**: Check that a recorded OQ-019 answer exists before any conversation, then check consent records and notes against the findings slide.

**Acceptance Scenarios**:

1. **Given** no recorded OQ-019 clearance, **when** release materials are prepared, **then** TASK-057 remains blocked and the interview count stays UNKNOWN. No interview finding appears in any deliverable. (OQ-019; PHASE_5 TASK-057; AMD-AGENTS-6)
2. **Given** a recorded clearance, **when** conversations run, **then** they stay within the scope of that answer, every note has a consent record, no child payload is collected, and the findings slide draws only on those notes. (TASK-057; BR-026)

### Edge Cases

- The organiser cutoff, channel or formats differ from the 14 Oct 22:00 baseline: the plan adapts to the organiser evidence the lead has recorded. A different video length adapts the D7 script without hiding delays or cache use. (PHASE_4 AMD-4-1; D7 §3.1)
- A metric cannot be measured before the cutoff (for example, clips not recorded or fewer than five testers): the report and deck show "not measured" or the actual n with a reason and next action. A target is never shown as a result. (D2 Part B §17; Constitution VI)
- Held-out results suggest a threshold, prompt or model change: no tuning on held-out data. Any later configuration change invalidates the frozen report for the new build. It needs a new freeze and, if the old set influenced the choice, a fresh independent held-out set. (PHASE_3 AMD-3-3)
- Deploy, performance and final evaluation do not fit the internal 15:00/15:45 targets: D6 dependencies (TASK-042 → TASK-060 → TASK-043 → TASK-044) are not bypassed. The lead records a reschedule. (PHASE_3 AMD-3-2)
- A Must TC fails at freeze: it is disclosed as a blocker and full Must completion is not claimed. Optional cuts follow the D6 §11 order and are shown as omitted, not PASS. (D1 §18; D6 §11)
- Paid spend nears the cap during evaluation: repeated runs are reduced first, keeping independent sample coverage and failure reporting. A refused paid call leaves the manual path usable. (D2 Part B §12.2; TC-036)
- A second Android phone is unavailable: TASK-036 stays open with the device gap recorded. An emulator is not evidence for NFR-013. (NFR-013; DEP-009)
- A real child, parent or public post enters a test, clip, conversation or fixture: it is excluded. Only invented synthetic material is used. (BR-026; FR-024)
- A phone microphone is not available over LAN offline: the laptop microphone is the offline baseline. A phone path needs a tested secure context. (TEAM_HANDOVER_V2 §8)

## Requirements *(mandatory)*

### Scope and boundaries

Feature 007 owns the release-quality and presentation work mapped to TASK-034–TASK-046, TASK-053–TASK-058 and TASK-060 in D6 §5. It consumes the behaviour built in features 001–006 and changes none of their requirements. Fixes found here go to the owning area under AGENTS ownership. Every record, clip, scenario and tester script is invented and synthetic. There is no real child data, photo, face, alert, physical return, police or CID integration, or legal-compliance claim. (BR-002, BR-006, BR-011, BR-026)

| TASK | Work | D6 owner | Priority | D6 dependencies | D6 h |
|---|---|---|---|---|---|
| TASK-034 | Accessibility pass | S (Mahim) | Must | TASK-030 | 3 |
| TASK-035 | Bangla copy for every state | O (Obidit) | Must | TASK-030 | 3 |
| TASK-036 | Two-Android device test | M (Masnun) | Must | TASK-030 | 2 |
| TASK-037 | Unit tests ≥ 60 | S (Mahim) | Must | TASK-017 | 4 |
| TASK-038 | Essential journey + safeguarding journeys | S (Mahim) | Must | TASK-030, TASK-032, TASK-059 | 5 |
| TASK-039 | Evaluation harness, dev then held-out | M (Masnun) | Must | TASK-011, TASK-017, TASK-018, TASK-064 | 5 |
| TASK-040 | WER on 60 clips | O (Obidit) | Must | TASK-014 | 3 |
| TASK-041 | Timing study, ≥ 5 testers | S (Mahim) | Must | TASK-025 | 3 |
| TASK-042 | Production deploy + smoke | S (Mahim) | Must | TASK-038 | 2 |
| TASK-043 | Final frozen evaluation | M (Masnun) | Must | TASK-042, TASK-039, TASK-040, TASK-041, TASK-060 | 2 |
| TASK-044 | Round 2 deck, 5–8 slides | S (Mahim) | Must | TASK-043 | 4 |
| TASK-045 | Round 2 video, 1–2 min | O (Obidit) | Must | TASK-042 | 4 |
| TASK-046 | README, Drive folder, selection-email reply | S (Mahim) | Must | TASK-044, TASK-045 | 1 |
| TASK-053 | Finale local stack | S (Mahim) | Must | TASK-033 | 4 |
| TASK-054 | 5 rehearsals, ≥ 1 internet-off | S, O, M (shared) | Must | TASK-053 | 5 |
| TASK-055 | Finale deck, ≤ 10 min | S (Mahim) | Must | TASK-043 | 4 |
| TASK-056 | Mentor session 2 fixes | S, O, M (shared) | Should | — | 5 |
| TASK-057 | 5–10 user conversations, only if OQ-019 allows | S (Mahim) | Should | — (OQ-019 clearance) | 4 |
| TASK-058 | Finale backup recording | O (Obidit) | Must | TASK-054 | 2 |
| TASK-060 | Performance check | M (Masnun) | Must | TASK-042 | 2 |

The hours are D6 planning estimates, not capacity or completion. Shared-task hours are single totals, not per person. (D6 §5; PHASE_5 AMD-5-3)

### Functional Requirements

- **TASK-037; D6 §7**: The release candidate must carry at least 60 passing unit tests over the normaliser, matcher scoring, state guard and wording guard, including at least 30 normaliser cases, with routine checks green. (AGENTS Definition of done)
- **TASK-038; D2 Part B §18 #1**: Browser journeys must cover the D6 §1 essential journey at phone and desktop widths, the safeguarding TCs and the failure-state paths (E-010–E-014, E-022–E-024, fallback form, demo cache). Journeys are tagged by gate (G2/G4). Companion-only results are reported separately. (TC-001–TC-066 where applicable; D6 §7)
- **TC-028; NFR-010**: A full journey's logs must contain 0 phone numbers and 0 seeded child names.
- **TASK-034; NFR-011; TC-033, TC-058**: Every Must screen must meet WCAG 2.2 AA: 0 serious or critical automated findings in light and dark themes, a full keyboard walk, 320 CSS px reflow, 200% text zoom, 400% viewport zoom, switchable shortcuts that are off while typing, and a Bangla screen-reader spot check. Parent targets are at least 44 px.
- **TASK-035; FR-033**: Every E-001–E-024 state and every loading, empty and success state must show Bangla and English text from the locale files. The text uses the exact D3/D4 strings where they exist and follows D4 behaviour rules: no red on parent screens; icon + text + colour; honest labels.
- **TASK-036; NFR-013**: A signed device checklist must record Bangla rendering, microphone recording and 360 px layout on two identified Android phones.
- **TASK-039, TASK-043; FR-028; TC-020, TC-056, TC-064**: The evaluation must run on the dev split first and on the held-out split only after the manifest, model, preprocessing, thresholds and prompt/template hashes are frozen. Demo mode and caches are disabled. The report covers the D2 Part B §17 metrics with denominators, abstention/coverage, baselines (manual timing; rules-only and embeddings-only where feasible), gold-field and extracted-field modes, at least two failures, and commit/model/manifest hashes.
- **TASK-040; GOAL-005**: WER must be computed on 60 unique synthetic clips (20 prompts × at least 3 speakers), with tokenisation documented, repeats labelled and critical-field errors reported.
- **TASK-041; GOAL-001; A-010, A-011**: The timing study must use at least five adult volunteers role-playing with invented scenarios. It is paired and counterbalanced against the same-field manual form, and reports median, range, completion numerator/denominator and help/order effects. It is labelled exploratory.
- **TASK-042; D2 Part B §15.3–15.5**: The production release must be one identified build with the `r2-freeze` tag, seeded synthetic data only and a passing smoke check, with a rollback to the previous green commit.
- **TASK-060; TC-034; NFR-001–NFR-006**: Each D2 Part B §12.1 target must be measured on the production build and reported as met or missed with its sample size.
- **NFR-016; TC-036, TC-065**: Release and evaluation spend must stay within the atomic USD 25 default cap (a documented raise may go up to USD 30). Reservations and settled spend are reported.
- **TASK-044–TASK-046; GOAL-009; TC-025, TC-037, TC-066**: The Round 2 package (repository link, 5–8-slide deck, 1–2-minute video, README, Drive folder with links file) must use only frozen-report numbers or "not measured". It must label synthetic, [MOCK], cached, simulation and time-compressed content, pass the wording guard and the safeguarding review, pass logged-out link checks, and be sent through the organiser-confirmed channel with receipt evidence.
- **TASK-053–TASK-055, TASK-058; FR-027; GOAL-007; TC-021, TC-057**: Finale readiness must include a local stack that runs the scripted journey with the network off and all roles on one database, 5/5 logged rehearsals with at least one internet-off, a finale deck timed at 10 minutes or less, and a labelled backup recording in two locations.
- **TASK-056**: Agreed mentor fixes must be applied by area owner and verified before the gate that needs them, or recorded as missed. No fix may weaken a constitution safeguard.
- **TASK-057; OQ-019**: User conversations must not start before a recorded OQ-019 answer. Any held must be consented, must collect no child payload, and must be the only source of interview findings.
- **BR-011; Constitution VI**: No deliverable may state a target as a result, call similarity a probability, or claim delivered referral, rescue, return, alerting, CID/police integration, legal compliance or interviews without evidence.

### Key Entities

- **Release candidate and freeze build**: One identified commit, tag and deployment with its check results; the subject of every measurement. (TASK-042; D2 Part B §15.4)
- **Acceptance result set**: Per-TC pass/fail/not-run for TC-001–TC-066 with gate tag, separating app/service results from companion-only results. (TASK-038)
- **Evaluation manifest**: Frozen, hashed, identity-grouped synthetic record list from feature 004 (TASK-064), consumed read-only here.
- **Evaluation report**: Dated, frozen record of metrics, denominators, coverage, baselines, failures and hashes. It is the only source for deck figures. (FR-028; TASK-043)
- **WER clip set and timing records**: Synthetic speech clips with speaker IDs and timing rows from adult role-play volunteers. They contain no real child data. (TASK-040, TASK-041)
- **Device checklist and rehearsal log**: Signed per-device results and per-run rehearsal outcomes, including network state. (TASK-036, TASK-054)
- **Submission package and receipt**: Deck, video, README, links file, Drive folder and organiser receipt evidence. (TASK-044–TASK-046)
- **Mentor fix list and conversation notes**: Owner-assigned fixes; consented notes, which exist only if OQ-019 is cleared. (TASK-056, TASK-057)

## Success Criteria *(mandatory)*

### Measurable Outcomes

These are acceptance targets for the release. None is an achieved result at specification time.

- **SC-001**: At least 60 unit tests (including at least 30 normaliser cases) pass on the release candidate with 0 failures. (TASK-037)
- **SC-002**: Every applicable TC-001–TC-066 has a recorded pass, fail or not-run result on the release candidate. Every Must failure is listed as a disclosed blocker, and companion-only results are counted separately. (TASK-038; D2 Part B §18 #1)
- **SC-003**: 0 serious or critical accessibility findings on all Must screens in both themes. 100% of actions are keyboard-reachable. The 320 px, 200% text and 400% zoom checks pass. (TC-033, TC-058)
- **SC-004**: 100% of E-001–E-024 states and loading/empty/success states show both Bangla and English text. (TASK-035)
- **SC-005**: A signed checklist covers 2 of 2 Android phones for Bangla glyphs, microphone and 360 px. (TASK-036; NFR-013)
- **SC-006**: The frozen report shows 5 of 5 promised metrics, each as numerator/denominator or "not measured" with a reason. It has at least 2 failure examples, 0 cache or fixture hits counted, and recorded commit, model and manifest hashes. (TC-020, TC-056, TC-064; GOAL-009)
- **SC-007**: 100% of D2 Part B §12.1 targets have a measured value marked met or missed. (TC-034)
- **SC-008**: A full journey's logs show 0 phone-number or seeded-name matches. (TC-028)
- **SC-009**: The production smoke check passes on one identified freeze build. (TASK-042)
- **SC-010**: Every number in the deck, video and README traces to the frozen report or reads "not measured". The wording review finds 0 unsupported claims, and 100% of submitted links open logged out. (TC-025, TC-037, TC-066)
- **SC-011**: Organiser receipt evidence through the confirmed channel is recorded before the confirmed cutoff. Until then, TASK-046 is not marked done. (TASK-046; PHASE_4 AMD-4-1)
- **SC-012**: 5 of 5 finale rehearsals pass, at least 1 with the internet off. A timed finale deck run takes 10 minutes or less, and the backup recording exists in 2 locations. (GOAL-007; NFR-007; TASK-054, TASK-055, TASK-058)
- **SC-013**: 0 user conversations happen before a recorded OQ-019 answer, and 100% of any held have a consent record. (TASK-057)

## Assumptions, dependencies and open decisions

- **Upstream dependencies**: TASK-011, TASK-014, TASK-017, TASK-018, TASK-025, TASK-030, TASK-032, TASK-033, TASK-059 and TASK-064 from features 001–006 gate this feature (D6 §5). As of 2026-10-14, Phase 0 TASK-001 is `todo` and Phase 1 TASK-061/008/010/064 are `blocked`. No feature-007 task can be marked done until its dependencies have evidence.
- **Schedule (UNKNOWN)**: 14 Oct 2026 22:00 Asia/Dhaka is the working baseline and 21:00 the internal send target. The user reports organiser extension flexibility; the new cutoff, channel, recipient and exact deck/video formats are UNKNOWN until Obidit (lead) records organiser evidence. (AGENTS AMD-AGENTS-1; PHASE_4 AMD-4-1; TEAM_HANDOVER_V2 §10)
- **Capacity (UNKNOWN)**: Actual remaining hours and owner availability are UNKNOWN (OQ-024; RISK-017). Internal times in the phase plans are targets, not a feasible computed schedule. (PHASE_3 AMD-3-2)
- **Open decisions**:
  - OD-1, organiser cutoff, channel and formats: Obidit (lead).
  - OD-2, OQ-019 ethics answer: mentors/faculty. TASK-057 stays blocked until then.
  - OD-3, mentor session 2 fix list: Obidit (lead), DEP-010. The list is empty now.
  - OD-4, the two Android phones, laptop, spare laptop and hotspot: Mahim, DEP-009, by 23 Oct.
  - OD-5, WER speakers and timing volunteers: identities and availability UNKNOWN.
  - OD-6, managed database host: OQ-021, affects TASK-042.
  - OD-7, provider prices and spend so far: OQ-004, OQ-022.
  - OD-8, judging weights and acceptability of synthetic-only data: OQ-025, OQ-026.
- **Interviews**: The interview count is UNKNOWN, not "0", until evidenced. Nothing in this feature claims interviews were held. (AMD-AGENTS-6; TEAM_HANDOVER_V2 §7)
- **Metric targets**: GOAL-001–GOAL-005 thresholds (≤ 5 min median and below manual; ≥ 85% extraction; Recall@5 ≥ 80% and P@1 ≥ 60%; F1 ≥ 0.8; WER ≤ 30%) are provisional targets (A-002). They are reported against measured values and never stated as results.
- **Commands**: The commands named in D2 Part B §15 and D6 (`smoke`, `eval:*`, `spend`, `seed`) are planned interfaces. Today they are fail-fast stubs and provide no evidence. (AGENTS AMD-AGENTS-3)
- **Constitution**: The constitution is a draft awaiting all-owner ratification. Its safeguards still govern this specification. (`.specify/memory/constitution.md`)
