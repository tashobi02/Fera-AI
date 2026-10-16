# Graph Report - obidit-templates  (2026-10-15)

## Corpus Check
- 217 files · ~251,419 words (incremental update: 19 files re-extracted)
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3113 nodes · 7209 edges · 158 communities (117 shown, 41 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 689 edges (avg confidence: 0.88)
- Token cost: 147,335 input · 0 output

## Community Hubs (Navigation)
- Contract Zod Schemas
- API Route Factory
- Session Tokens
- Case States And SQL Parity
- Contract Validation Tests
- Spec Companion Types
- API Route Factory And Limits
- Typed Contract Examples
- API Platform And Auth Tests
- Intake APIs And Error Catalogue
- Repository Audit Findings
- Desk Screens And Navigation
- Domain Entities (D5)
- Role Projections And Audit View
- SQL Tables And Roles
- Feature 001 Tasks
- Schema Spec Entities
- Sign-in Form Flow
- Contract Barrel Exports
- Case Service Contract
- Role Guard And Not-found
- Feature 002 Intake Spec
- Audit Writer And Denials
- Handoff Shared Context
- Case Submit And Read APIs
- Locale And Layout
- Officer Views And Queue
- Transactions And Internals
- Case Commands
- Credential Sign-in
- Spec Pack And Paid Calls
- Draft And Primitive Schemas
- Agent Guides And Review
- Confirm Pair Integrity
- Auth And Sign-in Evidence
- Parent Intake Requirements
- DB Test Harness
- Gap Check And Registry
- Matching Requirements
- Design Brief And Tokens
- Case Service Tests
- Case Service Evidence
- Safeguarding Requirements
- Matching And Evaluation Design
- Return Paths After Sign-in
- DB Invariants Evidence
- npm Scripts
- DB Test Harness 2
- Read
- Human Decision Rules
- Obidit Phase 2 Work
- Spec-Kit Feature Prompts
- Atomic Confirm Requirements
- Officer Decision Locks
- Platform Language
- Registry Types
- Voice And Extraction Goals
- D1 Prd V2
- D1 Prd V2 2
- D5 Background Schema V2
- API-006 Route Contracts
- Role Projections And Audit View 2
- Verification Scripts
- Case Command Requests
- Redact
- Tsconfig
- TASK-023 Outputs Evidence
- Principal And Rows
- State
- Output Templates
- Schema V2
- D6 Implementation Plan V2 2
- Demo Accounts
- Sign In Errors
- Readme
- D2 Trd Parta V2
- UI States And Components
- Review-Before-Submit UX
- D5 Background Schema V2 3
- Team Handover V2
- Design
- D2 Trd Parta V2 2
- D5 Background Schema V2 2
- Package
- Outputs Service Tests
- Token Contrast Test
- D5 Background Schema V2 8
- D5 Background Schema V2 4
- Package 2
- DB Test Harness 3
- D6 Implementation Plan V2
- Team Handover V2 2
- Team Handover V2 3
- Globals Css Source Guard Test
- D1 Prd V2 3
- D1 Prd V2 4
- D1 Prd V2 5
- D2 Trd Parta V2 3
- D5 Background Schema V2 6
- D7 Closing Pack V2
- Template Tests And Fixtures
- Design 2
- Verification Scripts 2
- Demo And Safeguard TCs
- Pool
- Agent Roster
- D6 Implementation Plan V2 3
- Cookies
- Wording Guard
- Principal And Rows 2
- D5 Background Schema V2 7
- D5 Background Schema V2 9
- Eslint Config
- Package 3
- Product
- Globals Css Source Guard Test 2
- Design 3
- Agent Roster 2
- Agent Roster 2
- D5 Background Schema V2 11
- Companion Types Test
- D5 Background Schema V2 12
- Fera Types V2
- Fera Types V2 2
- Fera Types V2 3
- Fera Types V2 4
- D1 Prd V2 6
- D1 Prd V2 7
- D1 Prd V2 8
- D1 Prd V2 9
- D2 Trd Parta V2 4
- D4 Design Brief V2
- Up
- Speckit Prompts 2
- Audit 2026 10 12
- Audit 2026 10 12 2
- Audit 2026 10 12 3
- Audit 2026 10 12 4
- Phase 3-4 Release Plan
- D1 Prd V2 16
- D1 Prd V2 17
- D1 Prd V2 18
- D1 Prd V2 19
- D1 Prd V2 20
- D1 Prd V2 21
- D1 Prd V2 22
- D1 Prd V2 23
- D2 Trd Parta V2 5
- D5 Background Schema V2 13

## God Nodes (most connected - your core abstractions)
1. `vitest` - 51 edges
2. `ApiError` - 45 edges
3. `fera_types_v2.ts shared TypeScript types` - 39 edges
4. `schema_v2.sql companion schema (§7)` - 39 edges
5. `isUuid()` - 38 edges
6. `00 Gap Check and Seed Registry V2` - 36 edges
7. `table cases` - 35 edges
8. `effectiveRole` - 34 edges
9. `Feature 001 Contract Notes (TASK-061)` - 34 edges
10. `createRouteFactory()` - 32 edges

## Surprising Connections (you probably didn't know these)
- `transition service command` --semantically_similar_to--> `enforce_case_transition()`  [INFERRED] [semantically similar]
  specs/001-platform-foundation/contracts/platform-contract.md → db/schema_v2.sql
- `table match_candidates` --implements--> `ENTITY-005 MatchCandidate`  [INFERRED]
  db/schema_v2.sql → specs/001-platform-foundation/data-model.md
- `table referrals` --implements--> `Referral recorded (simulation) semantics`  [INFERRED]
  db/schema_v2.sql → specs/001-platform-foundation/contracts/platform-contract.md
- `createMissingCase` --shares_data_with--> `table cases`  [INFERRED]
  src/server/case/README.md → db/schema_v2.sql
- `Decision 1: fixed stack Next.js + pg + hand-written SQL, no ORM` --rationale_for--> `Fera schema V2 (schema_v2.sql)`  [INFERRED]
  specs/001-platform-foundation/research.md → db/schema_v2.sql

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Officer confirm -> simulated referral -> coordination closure flow** — docs_spec_d1_prd_v2_story_010, docs_spec_d1_prd_v2_story_012, docs_spec_d1_prd_v2_fr_016, docs_spec_d1_prd_v2_fr_018, docs_spec_d1_prd_v2_br_001, docs_spec_d1_prd_v2_br_005, docs_spec_d1_prd_v2_br_020, docs_spec_d1_prd_v2_tc_010, docs_spec_d1_prd_v2_screen_010, docs_spec_d1_prd_v2_screen_012 [EXTRACTED 1.00]
- **Voice/text intake pipeline** — docs_spec_d3_app_flow_v2_screen_002, docs_spec_d2_trd_parta_v2_comp_003_voice_recorder, docs_spec_d2_trd_parta_v2_api_001_transcribe, docs_spec_d2_trd_parta_v2_comp_006_speech_adapter, docs_spec_d2_trd_parta_v2_api_002_extract, docs_spec_d2_trd_parta_v2_comp_009_intake_orchestrator, docs_spec_d2_trd_parta_v2_comp_008_normaliser, docs_spec_d2_trd_parta_v2_comp_007_llm_adapter [EXTRACTED 1.00]
- **One-transaction match confirm flow** — docs_spec_d3_app_flow_v2_screen_010, docs_spec_d3_app_flow_v2_act_021, docs_spec_d2_trd_parta_v2_api_010_decision, docs_spec_d2_trd_parta_v2_confirm_transaction, docs_spec_d2_trd_parta_v2_check_pair_integrity, docs_spec_d2_trd_parta_v2_verify_decision_author, docs_spec_d2_trd_parta_v2_match_candidates, docs_spec_d2_trd_parta_v2_review_decisions, docs_spec_d2_trd_parta_v2_referrals, docs_spec_d2_trd_parta_v2_audit_log [EXTRACTED 1.00]
- **One-transaction officer confirm flow** — docs_execution_evidence_platform_case_service_decide_candidate, docs_execution_evidence_platform_case_service_lock_protocol, docs_execution_evidence_platform_case_service_with_transaction, docs_execution_evidence_platform_case_service_append_audit, docs_execution_evidence_platform_case_service_state_guard [EXTRACTED 1.00]
- **Review-before-submit safeguard (parent confirm before any sharing)** — docs_spec_d1_prd_v2_story_004, docs_spec_d1_prd_v2_fr_006, docs_spec_d1_prd_v2_fr_007, docs_spec_d1_prd_v2_fr_031, docs_spec_d1_prd_v2_br_004, docs_spec_d1_prd_v2_tc_004, docs_spec_d1_prd_v2_screen_003 [EXTRACTED 1.00]
- **Role-scoped case DTO projections (explicit allowlists)** — docs_spec_d5_background_schema_v2_ownercaseview, docs_spec_d5_background_schema_v2_staffowncaseview, docs_spec_d5_background_schema_v2_admincaseview, docs_spec_d5_background_schema_v2_officercaseview, docs_spec_d5_background_schema_v2_candidatedecisionview, docs_spec_d5_background_schema_v2_br_007 [EXTRACTED 1.00]
- **Seven spec-kit features 001-007** — docs_agents_speckit_prompts_feature_001_platform_foundation, docs_agents_speckit_prompts_feature_002_intake_ai, docs_agents_speckit_prompts_feature_003_parent_outputs, docs_agents_speckit_prompts_feature_004_matching_data, docs_agents_speckit_prompts_feature_005_officer_workflow, docs_agents_speckit_prompts_feature_006_dashboard_admin, docs_agents_speckit_prompts_feature_007_quality_release [EXTRACTED 1.00]
- **Vendored agent tooling (spec-kit, ECC, impeccable)** — docs_agents_agent_roster_spec_kit_process_spine, docs_agents_agent_roster_ecc_selected_agents, docs_agents_agent_roster_impeccable_design_quality [EXTRACTED 1.00]
- **Access denial chain: resolver, guards, access.denied audit, not-found screen** — docs_execution_evidence_platform_auth_principal_resolver, docs_execution_evidence_platform_auth_require_role, docs_execution_evidence_platform_case_service_denial_hooks, docs_execution_phase_2_must_core_task_007, docs_execution_evidence_platform_signin_screen_016 [INFERRED 0.85]
- **One-transaction officer confirmation (app service + DB deferred checks)** — src_server_case_readme_decidecandidate, specs_001_platform_foundation_contracts_platform_contract_confirmpair, db_schema_v2_check_pair_integrity, db_schema_v2_verify_decision_author, db_schema_v2_review_decisions, db_schema_v2_referrals, db_schema_v2_match_candidates, src_server_case_readme_appendaudit [INFERRED 0.85]
- **Atomic AI budget and paid-call enforcement** — docs_spec_d2_trd_parta_v2_ai_budget, docs_spec_d2_trd_parta_v2_ai_reservations, docs_spec_d2_trd_parta_v2_intake_drafts, docs_spec_d2_trd_parta_v2_reserve_ai_call, docs_spec_d2_trd_parta_v2_settle_ai_call, docs_spec_d2_trd_parta_v2_paid_call_counter, docs_spec_d2_trd_partb_v2_decision_017, docs_spec_d2_trd_parta_v2_e_023_ai_budget_cap [INFERRED 0.85]
- **Frozen, identity-grouped honest evaluation pipeline** — docs_spec_team_handover_v2_evaluation_manifest, docs_spec_team_handover_v2_fv_11, docs_spec_d6_implementation_plan_v2_task_064, docs_spec_d6_implementation_plan_v2_task_039, docs_spec_d6_implementation_plan_v2_task_043, docs_spec_d6_implementation_plan_v2_tc_020 [INFERRED 0.85]
- **Honest labelling UI cues (synthetic, cached, status, duplicate, V2 microcopy)** — docs_spec_d4_design_brief_v2_principle_honest_labels, docs_spec_d4_design_brief_v2_comp_023, docs_spec_d4_design_brief_v2_comp_048, docs_spec_d4_design_brief_v2_comp_033, docs_spec_d4_design_brief_v2_comp_049, docs_spec_d4_design_brief_v2_required_v2_microcopy [INFERRED 0.85]
- **Candidate matching rules (eligibility, ranking, rejection, duplicates)** — docs_spec_d1_prd_v2_br_017, docs_spec_d1_prd_v2_br_018, docs_spec_d1_prd_v2_br_019, docs_spec_d1_prd_v2_br_021, docs_spec_d1_prd_v2_fr_012, docs_spec_d1_prd_v2_fr_013, docs_spec_d1_prd_v2_fr_022, docs_spec_00_gap_check_and_registry_v2_goal_003, docs_spec_00_gap_check_and_registry_v2_goal_004 [INFERRED 0.85]
- **Officer confirm decision flow (one-transaction confirm with simulated referral)** — docs_spec_d4_design_brief_v2_comp_038, docs_spec_d4_design_brief_v2_confirm_reject_dialog, docs_spec_d5_background_schema_v2_api_010, docs_spec_d5_background_schema_v2_decisionrequest, docs_spec_d5_background_schema_v2_decisionresponse, docs_spec_d5_background_schema_v2_reviewdecision, docs_spec_d5_background_schema_v2_referral, docs_spec_d5_background_schema_v2_br_020, docs_spec_d5_background_schema_v2_br_005 [INFERRED 0.85]
- **One-transaction confirm, referral and closure flow** — docs_spec_team_handover_v2_matching_decisions_contract, docs_spec_team_handover_v2_fv_01, docs_spec_d6_implementation_plan_v2_task_028, docs_spec_d6_implementation_plan_v2_task_029, docs_spec_d6_implementation_plan_v2_tc_010 [INFERRED 0.85]
- **Paid-call protection: per-draft counter and atomic budget reservation** — db_schema_v2_reserve_ai_call, db_schema_v2_settle_ai_call, db_schema_v2_ai_budget, db_schema_v2_ai_reservations, db_schema_v2_intake_drafts, db_schema_v2_ai_calls, specs_002_intake_ai_spec_paid_call_limits [INFERRED 0.85]
- **Terminal payload redaction flow** — db_schema_v2_redact_case, db_roles_fera_redactor, db_roles_od_062_2_security_definer, db_schema_v2_enforce_case_transition, db_schema_v2_lock_decision_history, db_schema_v2_protect_confirmed_candidate, db_schema_v2_lock_referral_history, specs_001_platform_foundation_spec_terminal_payload_redaction [INFERRED 0.85]
- **Single-database offline demo fallback** — docs_spec_team_handover_v2_single_database_topology, docs_spec_team_handover_v2_fv_08, docs_spec_d6_implementation_plan_v2_backup_paths, docs_spec_d6_implementation_plan_v2_task_053, docs_spec_d6_implementation_plan_v2_tc_021, docs_spec_d7_closing_pack_v2_finale_script, docs_spec_d7_closing_pack_v2_risk_005 [INFERRED 0.85]
- **Officer decision critical path chain** — docs_spec_d6_implementation_plan_v2_task_015, docs_execution_phase_2_must_core_task_017, docs_execution_phase_2_must_core_task_028, docs_execution_phase_2_must_core_task_029, docs_execution_phase_2_must_core_task_030 [EXTRACTED 1.00]
- **Output generation flow (API-006 -> getOutput -> templates + wording guard, FOR SHARE re-check)** — docs_execution_evidence_outputs_templates_api_006_route, docs_execution_evidence_outputs_templates_getoutput, docs_execution_evidence_outputs_templates_gd_poster_templates, docs_execution_evidence_outputs_templates_wording_guard, docs_execution_evidence_outputs_templates_for_share_recheck [EXTRACTED 1.00]
- **Submission idempotency vs redaction replay gap** — specs_001_platform_foundation_contract_notes_classifysubmission, specs_001_platform_foundation_contract_notes_od_3, specs_001_platform_foundation_contract_notes_od_015_4, docs_execution_phase_2_must_core_task_022, specs_001_platform_foundation_contract_notes_od_015_1 [INFERRED 0.85]

## Communities (158 total, 41 thin omitted)

### Community 0 - "Contract Zod Schemas"
Cohesion: 0.02
Nodes (112): AGE, cursorSchema, DHAKA_OFFSET, districtCodeSchema, districtQuerySchema, draftTokenSchema, HEIGHT_CM, inputDateTimeSchema (+104 more)

### Community 1 - "API Route Factory"
Cohesion: 0.05
Nodes (79): auditUnavailable(), AuditUnavailableError, createRouteFactory(), DefineRoute, defOf(), HandlerInput, isStrictResponseSchema(), Out (+71 more)

### Community 2 - "Session Tokens"
Cohesion: 0.07
Nodes (45): PUBLIC_APIS, user(), toDhakaIso(), mint(), parentPrincipal, userPrincipal, createAuth(), endSession() (+37 more)

### Community 3 - "Case States And SQL Parity"
Cohesion: 0.03
Nodes (44): ACTOR_TYPES, actorTypeSchema, CANDIDATE_STATUSES, CandidateStatus, candidateStatusSchema, caseSourceSchema, caseStatusSchema, COUNTING_BASIS (+36 more)

### Community 4 - "Contract Validation Tests"
Cohesion: 0.04
Nodes (32): exampleConfirmDecisionRequest, exampleConfirmDecisionResponse, exampleDashboardStatsResponse, exampleExtractFollowUpRequest, exampleExtractRequest, exampleExtractResponse, exampleFoundDraft, exampleImportRequest (+24 more)

### Community 5 - "Spec Companion Types"
Cohesion: 0.03
Nodes (63): ActorType, AdminCaseView, AiBudget, AiCall, AiReservation, AuditEntry, AuthLabel, CandidateDecisionView (+55 more)

### Community 6 - "API Route Factory And Limits"
Cohesion: 0.06
Nodes (38): runtime, AuditDenied, AuditDeniedInput, PrincipalResolver, RouteDeps, createKeyer(), hasPaidLimits(), Keyer (+30 more)

### Community 7 - "Typed Contract Examples"
Cohesion: 0.04
Nodes (47): MissingSubmissionDraftInput, adminAudit, adminView, auditedCase, candidate, caseList, components, districts (+39 more)

### Community 8 - "API Platform And Auth Tests"
Cohesion: 0.05
Nodes (33): zod, POST, runtime, signOutResponseSchema, GET, defineRoute, clientExamples, CatalogueEntry (+25 more)

### Community 9 - "Intake APIs And Error Catalogue"
Cohesion: 0.07
Nodes (50): A-030 Android Chrome webm/opus accepted by speech provider, A-033 Bangla to Latin romanisation table for names, A-035 Bangla time words map to fixed approximate hours, A-036 2 MB suffices for a 120 s webm/opus note, API-001 POST /api/intake/transcribe, API-002 POST /api/intake/extract, CaseDraft, COMP-001 Parent client (+42 more)

### Community 10 - "Repository Audit Findings"
Cohesion: 0.07
Nodes (39): Round 2 working baseline Wed 14 Oct 22:00 (organiser cutoff UNKNOWN), Mahim (Sadman Shaharier), lead, Feature 007 quality-release (Sadman, shared), Fera repository audit 2026-10-12, Audit evidence and arithmetic (222 h, 184 h, 58 h path, 17 Must items), F01 No runnable application (blocker), F02 Unverified/infeasible resource schedule (blocker), F03 Organiser cutoff/channel/extension not evidenced (blocker) (+31 more)

### Community 11 - "Desk Screens And Navigation"
Cohesion: 0.08
Nodes (47): API-009 GET /api/candidates/:id, API-011 POST /api/cases/:id/close, API-012 GET /api/dashboard/stats, API-013 GET /api/cases/:id/audit, API-015 POST /api/admin/import, API-016 POST /api/admin/anonymise (redaction), API-017 POST /api/admin/users/:id/verify [MOCK], API-021 GET /api/admin/users (+39 more)

### Community 12 - "Domain Entities (D5)"
Cohesion: 0.07
Nodes (39): AdminCaseView, API-012 GET /api/dashboard/stats, AuditEntry, CandidateDecisionView, Case, CaseDraft, CaseStatus, CaseVersion (+31 more)

### Community 13 - "Role Projections And Audit View"
Cohesion: 0.06
Nodes (48): maskPhone(), toMillisecondIso(), AdminAuditResponse, AdminCaseView, CandidateDecisionView, candidateDecisionViewSchema, CaseListResponse, checkIdentity() (+40 more)

### Community 14 - "SQL Tables And Roles"
Cohesion: 0.07
Nodes (45): role fera_app, role fera_owner, role fera_redactor, Ownership transfer to fera_owner, Runtime password env guard (>=16 chars), Role membership drift repair, table ai_budget, table ai_calls (+37 more)

### Community 15 - "Feature 001 Tasks"
Cohesion: 0.08
Nodes (37): Fera runtime roles and grants (roles.sql), Fera schema V2 (schema_v2.sql), Feature 001 spec quality checklist, Feature 001 clarification review, OQ-021 managed database host (UNKNOWN), ErrorEnvelope (id, key, message_bn, message_en, retryable, fallback), Feature 001 implementation plan, Feature 001 build order and dependency gates (TASK-001>002>007/008/061>006/062>015/031) (+29 more)

### Community 16 - "Schema Spec Entities"
Cohesion: 0.12
Nodes (41): A-032 District codes 1–64 are Fera-internal, ai_calls table (ENTITY-013 AiCall), API-010 POST /api/candidates/:id/decision, audit_log table (ENTITY-009 AuditEntry), audit_log_append_only(), candidate_status enum, case_status enum, case_versions table (ENTITY-004 CaseVersion) (+33 more)

### Community 17 - "Sign-in Form Flow"
Cohesion: 0.10
Nodes (35): DEMO_ROLE_KEY, ids(), inputClass, SignInForm(), onSubmit(), CircleAlertIcon(), ClockIcon(), CornerDownLeftIcon() (+27 more)

### Community 18 - "Contract Barrel Exports"
Cohesion: 0.08
Nodes (26): evidenceSpanSchema, CASE_KINDS, CASE_SOURCES, MATCHING_STATES, OUTCOMES, SEXES, AuditActor, endpointsOf() (+18 more)

### Community 19 - "Case Service Contract"
Cohesion: 0.09
Nodes (36): Feature 001 interface contract, AdminCaseView, API-003 POST /api/cases, API-004 GET /api/cases/:id, API-005 PATCH /api/cases/:id, API-007 POST /api/found-cases, API-011 POST /api/cases/:id/close, API-019 GET /api/health (+28 more)

### Community 20 - "Role Guard And Not-found"
Cohesion: 0.09
Nodes (26): nextConfig, next, FocusHeading(), HouseIcon(), SearchXIcon(), NotFoundScreen(), logger, NotFound() (+18 more)

### Community 21 - "Feature 002 Intake Spec"
Cohesion: 0.09
Nodes (32): Submission validation and uniqueness rules (BR-015/016), Feature 001 constitution check (principles I-VII), Feature 001 US2 Preserve only a reviewed report, Feature 002 clarification review, OQ-004/OQ-022 provider accounts and prices (UNKNOWN), Feature 002 interface contract plan, API-001 POST /api/intake/transcribe, API-002 POST /api/intake/extract (+24 more)

### Community 22 - "Audit Writer And Denials"
Cohesion: 0.12
Nodes (26): AUDIT_ACTION_PATTERN, isUuid(), ADMIN_AUDIT_DETAIL_KEYS, OFFICER_AUDIT_DETAIL_KEYS, AUDIT_ACTIONS, ACTION_ACTORS, CASE_AUDIT_ACTIONS, CaseAuditAction (+18 more)

### Community 23 - "Handoff Shared Context"
Cohesion: 0.09
Nodes (18): Fera Handoff Shared Context (COMMON.md), Case service (src/server/case, COMP-014/015), defineRoute API route factory, graphify-out knowledge graph, Masnun (data, matching, officer workflow), Obidit (intake, AI, speech, outputs), phase2 integration branch, Typed fakes (@/contracts/client-examples) (+10 more)

### Community 24 - "Case Submit And Read APIs"
Cohesion: 0.08
Nodes (35): Account recovery (§9.5), AdminCaseView, API-003 POST /api/cases, API-004 GET /api/cases/:id, API-005 PATCH /api/cases/:id, API-007 POST /api/found-cases, API-008 GET /api/review-queue, API-014 POST /api/match/:caseId (+27 more)

### Community 25 - "Locale And Layout"
Cohesion: 0.12
Nodes (25): setLocale(), generateMetadata(), AppHeader(), LanguageToggle(), generateMetadata(), inter, jetbrainsMono, notoBengali (+17 more)

### Community 26 - "Officer Views And Queue"
Cohesion: 0.05
Nodes (21): exampleCreateFoundResponse, exampleCreateMissingResponse, exampleFoundRow, exampleOfficerMissingView, exampleReviewQueueResponse, adminCaseViewSchema, caseListResponseSchema, createFoundResponseSchema (+13 more)

### Community 27 - "Transactions And Internals"
Cohesion: 0.14
Nodes (27): describeError(), insertReport(), newRefCode(), ident(), isRetryable(), isSevereRefusal(), LockSetChanged, mapDbError() (+19 more)

### Community 28 - "Case Commands"
Cohesion: 0.10
Nodes (28): FoundSubmissionDraft, MissingSubmissionDraft, sameId(), sha256HexSchema, Principal, canonicalJson(), classifySubmission(), ExistingSubmission (+20 more)

### Community 29 - "Credential Sign-in"
Cohesion: 0.12
Nodes (27): @node-rs/argon2, POST, isProductionEnv(), defaultAuth(), defaultAuthStore(), ARGON2_PARAMS, canonical(), dummyHash() (+19 more)

### Community 30 - "Spec Pack And Paid Calls"
Cohesion: 0.10
Nodes (24): ai_budget table (ENTITY-016 AiBudget), ai_reservations table (ENTITY-017 AiReservation), D2 Technical Requirements Document Part A (§1–§9), intake_drafts table (ENTITY-015 IntakeDraft), Intake and submission sequence (§3.3), Server-side paid-call counter (≤6 per draft), pino JSON logs with redaction list, reserve_ai_call() (+16 more)

### Community 31 - "Draft And Primitive Schemas"
Cohesion: 0.08
Nodes (30): ageBound(), agesSubset(), ageYears, CaseDraft, CaseDraftInput, caseDraftSchema, checkAges(), childBase (+22 more)

### Community 32 - "Agent Guides And Review"
Cohesion: 0.08
Nodes (17): fera-gate skill, AGENTS.md - Fera shared agent instructions, Agent routing table (reviewer per change type), Fera (Bangla-first missing/found child case coordination prototype), fera-review skill (parallel pre-PR reviewers), fera-safeguarding-reviewer (every-PR gate), Mahim (Sadman Shaharier) - platform, integration, release, Masnun - districts, data, matching, officer workflow, dashboard, evaluation (+9 more)

### Community 33 - "Confirm Pair Integrity"
Cohesion: 0.11
Nodes (28): enum candidate_status, trigger candidates_integrity, check_pair_integrity(), trigger confirmed_candidate_lock, enum decision_t, trigger decisions_author, trigger decisions_history, trigger decisions_integrity (+20 more)

### Community 34 - "Auth And Sign-in Evidence"
Cohesion: 0.15
Nodes (23): Fera stack (Next.js App Router, TS strict, Zod, PG16 + pgvector via pg, raw SQL, Vitest, Playwright), Custom HMAC session auth with argon2id, TASK-006 evidence: credentials session, resolver, parent cookie, API-020 sign-in / sign-out routes (generic E-002), argon2id password KDF (NFC-normalised, 10-200 chars, dummy-hash timing equality), HMAC-signed 8 h credential session cookie (fera_session), Parent session cookie (fera_ps), minted only on API-001/002, DB principal resolver (default resolver for defineRoute) (+15 more)

### Community 35 - "Parent Intake Requirements"
Cohesion: 0.11
Nodes (24): GOAL-001 Parent produces reviewed Bangla report in first hour, DEP-002 Two interchangeable language-model services, FR-001 Typed intake 20-2,000 chars, Bangla/English/mixed (Must), FR-003 Bangla digit normalisation and Asia/Dhaka event intervals (Must), FR-004 Field extraction, unstated fields empty, never guess (Must), FR-005 At most four one-at-a-time follow-ups then manual completion (Must), FR-006 Editable review with explicit confirm (Must), FR-007 Drafts isolated from matching, views and exports (Must) (+16 more)

### Community 36 - "DB Test Harness"
Cohesion: 0.18
Nodes (27): EXPECTED_PRIVILEGES, pairOfMissing(), RUNTIME_ROLES, blockedByDeactivatedResolver(), PSEUDONYMISATION, Actors, addCandidate(), CaseRef (+19 more)

### Community 37 - "Gap Check And Registry"
Cohesion: 0.09
Nodes (27): 00 Gap Check and Seed Registry V2, Fera pitch deck (Round 1, S1a), Legacy goal map v2 G1-G5 to GOAL IDs, MVP feature list (29 features, MoSCoW), OQ-001 Voice intake and poster/13219 Must for Round 2?, OQ-003 Mentor view on environment theme / disaster mode?, OQ-005 Finale demo topology (deployed vs laptop-local)?, OQ-006 What exists today; interviews held? (+19 more)

### Community 38 - "Matching Requirements"
Cohesion: 0.11
Nodes (26): GOAL-003 Right found record in officer shortlist (Recall@5 >=80%), PERSONA-002 Verifying officer (SI Karim), PERSONA-003 Shelter/station staff (Rumana), DEP-003 Offline-capable text similarity, DEP-005 Synthetic set ~200 records, FR-011 Staff found-child logging by form or free text (Must), FR-012 Rank up to five qualified candidates nationally with reasons (Must), FR-013 Exclude pairs failing BR-017 hard filters (Must) (+18 more)

### Community 39 - "Design Brief And Tokens"
Cohesion: 0.10
Nodes (25): COMP-022 App header with language toggle, D4 UI/UX Design Brief V2, tokens_v2.css design tokens, Information architecture (parent, staff, officer, admin, shared areas), Structured layout specifications (replace ASCII wireframes), Dark palette, Light palette (deep teal primary, amber/blue/green status), Screen-by-screen descriptions (SCREEN-001–016) (+17 more)

### Community 40 - "Case Service Tests"
Cohesion: 0.08
Nodes (19): exampleCreateFoundRequest, exampleMissingRow, exampleUpdateCaseRequest, createFoundRequestSchema, updateCaseRequestSchema, StepAuthorityError, fakePool(), Handler (+11 more)

### Community 41 - "Case Service Evidence"
Cohesion: 0.14
Nodes (15): TASK-015 evidence: case service, state guard, audit, versions, Audit logger appendAudit (COMP-015, allowlisted actions and details), closeCase (API-011, coordination_recorded / resolved_outside_fera), createMissingCase / createFoundCase idempotent create (API-003/007), decideCandidate one-transaction confirm/reject (API-010), editMissingCase (API-005, case_versions snapshot, voids pending candidates), Sorted-UUID lock protocol (lockNeighbourhood, LockSetChanged retry), readCase (API-004 role projection or hidden) (+7 more)

### Community 42 - "Safeguarding Requirements"
Cohesion: 0.12
Nodes (20): OQ-010 Alert authority wording (CID unit name), PERSONA-001 Parent/guardian (Shirin), CID (Criminal Investigation Department), FR-008 Bangla GD draft from fixed template, confirmed fields only (Must), FR-009 Reviewed no-photo poster with 13219 and sharing acknowledgement (Must), FR-010 13219-ready summary <=80 words (Should), FR-034 Block alert wording and runaway terms (Must), 13219 helpline (+12 more)

### Community 43 - "Matching And Evaluation Design"
Cohesion: 0.09
Nodes (20): A-028 Match score weights (0.55 cosine + 0.15 name + 0.15 clothing + 0.10 district + 0.05 age), A-029 No fixed raw-cosine duplicate threshold; calibrate on dev, A-031 Microphone requires HTTPS or localhost, A-034 Free-tier managed Postgres with pgvector >= 0.8.1, COMP-012 Matching engine, COMP-013 Duplicate detector, COMP-020 Evaluation harness, OQ-021 Managed Postgres host choice (+12 more)

### Community 44 - "Return Paths After Sign-in"
Cohesion: 0.16
Nodes (23): SignInPage(), TITLE_KEY, InfoIcon(), ADMIN_READ_PATHS, DESK_ENTRY_PATHS, destinationAfterSignIn(), firstSegment(), homeForSession() (+15 more)

### Community 45 - "DB Invariants Evidence"
Cohesion: 0.17
Nodes (21): CI workflow (.github/workflows/ci.yml), CI check job (npm ci, lint, typecheck, test, build), CI db job (PG16 + pgvector 0.8.1 container, npm run test:db), Six paid AI calls per draft via reserve_ai_call, TASK-062 evidence: schema invariants, restricted roles, redaction, fera_app runtime role (column-level grants, CONNECTION LIMIT 40), fera_owner role (owns all public objects, no login), fera_redactor role (API-016 redaction only) (+13 more)

### Community 46 - "npm Scripts"
Cohesion: 0.08
Nodes (24): scripts, build, db:reset, db:up, dev, eval:all, eval:audit, eval:dedupe (+16 more)

### Community 47 - "DB Test Harness 2"
Cohesion: 0.20
Nodes (14): assertDatabaseName(), assertLocalDatabaseUrl(), DEFAULT_DATABASE_URL, LOCAL_HOSTS, maskUrl(), scrubbedEnv(), withDatabase(), connection() (+6 more)

### Community 48 - "Read"
Cohesion: 0.16
Nodes (14): effectiveRole, projectCaseFor(), closeCase(), CloseResult, hasConfirmedReferral(), CreateResult, DecisionResult, NO_OFFICER_CONTEXT (+6 more)

### Community 49 - "Human Decision Rules"
Cohesion: 0.14
Nodes (19): GOAL-008 Humans make every match decision, FR-020 Candidates and matched records restricted to verified officers (Must), FR-021 Append-only audit entry for every STORY-017 action (Must), FR-030 Parent own case status without other-party evidence (Should), FR-035 Officer verified only when admin marks [MOCK] (Must), FR-037 Role sign-in for staff/officers/admins; parents no account (Must), Mocked capabilities ([MOCK] police data, verification, telecom, face), NFR-017 Audit immutability (+11 more)

### Community 50 - "Obidit Phase 2 Work"
Cohesion: 0.21
Nodes (19): Handoff prompt for Obidit's agent, Feature 002 intake-ai (Obidit), F12 Missing default spend cap / unsafe post-call budget example, App API budget and spend cap (USD 30), Phase 0 Bootstrap (Gate G0), KIT Agent kit commit (CLAUDE.md, AGENTS.md, .claude, .codex, .specify), TASK-003 Provider keys, .env.example, prices, TASK-005 Android MediaRecorder to STT spike (+11 more)

### Community 51 - "Spec-Kit Feature Prompts"
Cohesion: 0.15
Nodes (18): Handoff prompt for Masnun's agent, Spec-kit prompts (SPECKIT_PROMPTS.md), Feature 001 platform-foundation (Sadman), Feature 004 matching-data (Masnun), Feature 005 officer-workflow (Masnun; S-012 Sadman), Feature 006 dashboard-admin (Masnun; S-013 Sadman), F16 Bundled spec-kit workflow skips clarify/analyze, F17 speckit-analyze could persist feature.json (SPECIFY_FEATURE_NO_PERSIST fix) (+10 more)

### Community 52 - "Atomic Confirm Requirements"
Cohesion: 0.13
Nodes (14): GOAL-006 Every case shows known status by district, D1 Product Requirements Document V2, FR-016 Atomic confirm: decision, states, simulated referral, audit (Must), FR-018 Coordination closure (coordination_recorded / resolved_outside_fera) (Must), OQ-016 Official online GD field list and format, OQ-017 Neighbouring-district adjacency source, OQ-018 Referral child-protection agency name, OQ-019 Ethics of usability tests with real parents (+6 more)

### Community 53 - "Officer Decision Locks"
Cohesion: 0.19
Nodes (18): appendAudit(), voidPendingCandidates(), CandidateRow, decideCandidate(), DecisionStateError, live(), lockVerifiedOfficer(), mapCandidate() (+10 more)

### Community 54 - "Platform Language"
Cohesion: 0.18
Nodes (18): Spec-kit workflow (specify -> clarify -> plan -> tasks -> analyze -> implement -> converge), TASK-008 evidence: platform shell and language, Android phone Bangla glyph check (pending, blocks TASK-008 done), Layout shell (skip link, COMP-022 header, demo banner, main), Paper & Cockpit design tokens (globals.css via Tailwind 4 @theme), Headless Chrome shell check (37/37 in production and DEMO_MODE), Language toggle (Server Action, fera-lang cookie, aria-pressed), Bangla numeral helpers (toBanglaDigits, localizeDigits, display only) (+10 more)

### Community 55 - "Registry Types"
Cohesion: 0.10
Nodes (21): ApiEndpoint, Assumption, BusinessRule, Component, Decision, Dependency, EntityRecord, ErrorCode (+13 more)

### Community 56 - "Voice And Extraction Goals"
Cohesion: 0.12
Nodes (17): GOAL-002 AI extracts case fields correctly (>=85%), GOAL-005 Bangla voice usable (WER <=30%), GOAL-009 Results reported honestly (metrics slide), OQ-004 Which accounts and API keys exist?, DEP-001 Speech-to-text service with Bangla support, DEP-006 50 hand-labelled reports, FR-002 Voice notes 5-120 s to editable Bangla transcript (Must), FR-028 Frozen held-out metrics with denominators and failure examples (Must) (+9 more)

### Community 57 - "D1 Prd V2"
Cohesion: 0.14
Nodes (15): GOAL-007 Live demo does not fail (5 of 5 rehearsals), Demo-safe mode (cached outputs, offline scripted journey), FR-026 Pre-filled manual form after 2 failed extractions or AI error (Must), FR-027 Demo-safe mode stored outputs with no network (Must), FR-032 Synthetic seed records labelled on every screen (Must), NFR-007 Offline scripted demo 5 of 5, NFR-008 Draft survives network loss; fallback <=2 s, RISK-004 AI outage, quota or spend over USD 30 (+7 more)

### Community 58 - "D1 Prd V2 2"
Cohesion: 0.10
Nodes (19): OQ-011 Personal Data Protection Act (2026) specifics, OQ-012 Retention period for closed cases, OQ-013 LLM/STT provider data terms, DEP-007 Public news and alert texts, FR-024 Import invented public-format fixtures with synthetic label (Should), FR-025 Redact identifying payloads from eligible terminal reports (Must), NFR-010 No payload in logs; provider notice, Personal Data Protection Act (2026) (+11 more)

### Community 59 - "D5 Background Schema V2"
Cohesion: 0.13
Nodes (19): COMP-033 Status badge (icon + text + colour), COMP-039 Close-case dialog, COMP-040 District map, COMP-041 District table, COMP-042 Audit timeline, COMP-043 Admin action panel, COMP-045 Empty state, Closure (missing case reaching closed with outcome) (+11 more)

### Community 60 - "API-006 Route Contracts"
Cohesion: 0.14
Nodes (10): bodySchema, POST, runtime, assertAllowedWording(), cached(), decodeStored(), districtNameBn(), getOutput() (+2 more)

### Community 61 - "Role Projections And Audit View 2"
Cohesion: 0.10
Nodes (14): exampleAdminAuditResponse, exampleAuditRows, exampleOfficerAuditResponse, REFS, adminAuditEntryViewSchema, officerAuditEntryViewSchema, AuditWithheldHook, admin (+6 more)

### Community 62 - "Verification Scripts"
Cohesion: 0.11
Nodes (14): admin, c, db, draft, f, f2, lit(), m (+6 more)

### Community 63 - "Case Command Requests"
Cohesion: 0.17
Nodes (7): exampleCreateMissingRequest, CHECKLIST, connect(), MOCK_DISTRICT, pool(), testParent(), testUser()

### Community 64 - "Redact"
Cohesion: 0.13
Nodes (11): AnonymiseRequestInput, anonymiseRequestSchema, AnonymiseResponse, anonymiseResponseSchema, Queryable, redactCases(), REDACTION_DB_ROLE, RedactionDbError (+3 more)

### Community 65 - "Tsconfig"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 66 - "TASK-023 Outputs Evidence"
Cohesion: 0.22
Nodes (11): Feature 003 parent-outputs (Obidit; S-004/S-005 Sadman), TASK-023 Evidence: Output Templates, Wording Guard and API-006, API-006 outputs route, GD and poster templates (COMP-010, templates.ts), getOutput service (src/server/outputs/index.ts), TC-005 GD draft test, TC-024 wording guard blocks banned term, Wording guard (COMP-016, guard.ts) (+3 more)

### Community 67 - "Principal And Rows"
Cohesion: 0.22
Nodes (15): EvidenceSpan, IsoDateTime, Uuid, AuditRow, CaseRow, ParentSessionRow, UserRow, ActorType (+7 more)

### Community 68 - "State"
Cohesion: 0.14
Nodes (9): CASE_STATUSES, isLegalTransition(), CASE_COLUMNS, assertTransition(), OFFICER_ONLY_TARGETS, StatusChange, TERMINAL, LEGAL (+1 more)

### Community 69 - "Output Templates"
Cohesion: 0.18
Nodes (16): ageBn(), childLines(), clock(), dayPart(), DRAFT_HEADER_BN, gd(), MONTHS_BN, or() (+8 more)

### Community 70 - "Schema V2"
Cohesion: 0.15
Nodes (14): enum actor_t, table audit_log, audit_log_append_only(), trigger audit_log_no_truncate, trigger audit_log_no_update_delete, table case_versions, trigger cases_transition_guard, enforce_case_transition() (+6 more)

### Community 71 - "D6 Implementation Plan V2 2"
Cohesion: 0.17
Nodes (15): A-040 Team capacity assumption (120 team-hours), D6 Implementation Plan V2, D6 Planned Folder Structure, D6 Goals (GOAL-001-009 targets), Hackathon Checklist, D6 Non-goals (alerts, face matching, live police data), OQ-024 Team availability before 14 Oct, Rebased Gates A-E (+7 more)

### Community 72 - "Demo Accounts"
Cohesion: 0.18
Nodes (9): react, react-dom, LogOutIcon(), SignOutButton(), SIGN_IN_PATH, DemoAccount, DemoAccountRole, form() (+1 more)

### Community 73 - "Sign In Errors"
Cohesion: 0.30
Nodes (11): RFC-9110, dualNumerals(), localizeDigits(), text(), toBanglaDigits(), toLatinDigits(), classifySignInFailure(), errorIdOf() (+3 more)

### Community 74 - "Readme"
Cohesion: 0.19
Nodes (15): Code companions (schema_v2.sql, fera_types_v2.ts, tokens_v2.css), Fera AI Complete Team Handbook V2 (PDF), MANIFEST.json SHA-256 hashes, TEAM_HANDOVER_V2 workbook, Fera AI V2 team package README, Verification companion evidence (48 schema behaviours), Evidence on hand (no interviews, no metrics), Fail-fast npm script stubs (+7 more)

### Community 75 - "D2 Trd Parta V2"
Cohesion: 0.16
Nodes (11): A-026 multilingual-e5-small gives usable Bangla similarity, A-027 Local model fits hosting limits, else EMBED_PROVIDER=api, API-019 GET /api/health, COMP-011 Embedding service, Embedding model switch procedure, OQ-023 Hosting function limits for local embedding model, RISK-015 Local embedding model too large/slow for serverless, State management rules (§8) (+3 more)

### Community 76 - "UI States And Components"
Cohesion: 0.15
Nodes (14): COMP-024 Chat bubble, COMP-025 Voice record button with timer, COMP-026 Transcript editor, COMP-027 Question prompt with quick-reply chips, COMP-034 Found-child form, COMP-044 Inline alert / toast, COMP-046 Loading state with 10 s message, Loading, empty, success and error state patterns (+6 more)

### Community 77 - "Review-Before-Submit UX"
Cohesion: 0.15
Nodes (13): COMP-028 Editable field card, COMP-029 Confirm bar (checkbox + submit), COMP-032 Manual case form, COMP-050 Consent notice, Confirm/reject dialog (focus on Go back, reject reason chips), Forms and validation rules (age 0-17, 64 districts, 01XXXXXXXXX phone), Required V2 microcopy (demo banner, provider notice, referral recorded simulation), Review-before-register interaction ('আমি যাচাই করেছি' checkbox) (+5 more)

### Community 78 - "D5 Background Schema V2 3"
Cohesion: 0.14
Nodes (14): COMP-036 Candidate row (rank, score, reason), A-028 Match score = 100 x (0.55 cosine + 0.15 name + 0.15 clothing + 0.10 district + 0.05 age), D5 Background Schema V2, Fera (ফেরা), Bangla–English glossary, Hack for Humanity 2026 (AI Collective Bangladesh, AIUB) Track 3, ID registry (537 IDs across 21 prefixes), Registry link types (GOAL→STORY→FR→SCREEN/TC…) (+6 more)

### Community 79 - "Team Handover V2"
Cohesion: 0.19
Nodes (14): V2 Acceptance Cases TC-038-066, V2 Document and Companion Index, fera_types_v2.ts companion, Meeting Decision Worksheet, schema_v2.sql companion (17 tables), Fera AI V2 Team Handover and Meeting Workbook, tokens_v2.css companion, Verification Performed for Handover (+6 more)

### Community 80 - "Design"
Cohesion: 0.16
Nodes (5): Desk keyboard shortcuts (J/K/Enter, C/R, Esc), Lucide iconography, Signal gradient, Capabilities and constraints, Accessibility and inclusion (WCAG 2.2 AA)

### Community 81 - "D2 Trd Parta V2 2"
Cohesion: 0.16
Nodes (11): API-006 POST /api/cases/:id/outputs, Browser canvas poster PNG render, COMP-010 Output generator, COMP-016 Wording guard, DecisionResponse, E-016 OUTPUT_BLOCKED, E-020 OUTPUT_REQUEST_LIMIT_RESERVED, Referral recorded (simulation), not delivered (+3 more)

### Community 82 - "D5 Background Schema V2 2"
Cohesion: 0.18
Nodes (12): COMP-037 Side-by-side evidence table, COMP-038 Decision panel (confirm / reject + reason), COMP-049 Duplicate banner (সম্ভাব্য একই শিশু), Responsive breakpoints (<600, 600-1023, >=1024 px), COMP-013 Duplicate detector, Duplicate (two same-kind records of one child), DuplicateLink, FR-015 Side-by-side agree/differ/unknown per field (+4 more)

### Community 83 - "Package"
Cohesion: 0.14
Nodes (13): engines, node, name, private, version, supabase, tailwindcss, @tailwindcss/turbopack (+5 more)

### Community 84 - "Outputs Service Tests"
Cohesion: 0.14
Nodes (5): IDS, CREATED, district, mockedRead, parent

### Community 85 - "Token Contrast Test"
Cohesion: 0.19
Nodes (11): clamp(), contrast(), css, decode(), encode(), luminance(), nonTextPairs, parse() (+3 more)

### Community 86 - "D5 Background Schema V2 8"
Cohesion: 0.17
Nodes (8): COMP-023 Synthetic badge (সিনথেটিক), COMP-048 Cached badge (ক্যাশ), COMP-017 Demo-safe cache, PERSONA-004 Child-protection caseworker, Referral (simulated internal record), Synthetic data, TASK-033 Demo-safe cache + fixtures + cached badge, TC-010 Confirm → referral → close

### Community 87 - "D5 Background Schema V2 4"
Cohesion: 0.19
Nodes (10): COMP-030 Output card with copy, COMP-031 Poster preview + PNG download, Copy and poster download rules (1080x1350 PNG, draft footer), CID Missing Children Cell, COMP-016 Wording guard, FR-034 Block alert wording and runaway terms, 13219 helpline, MUN Alert (CID missing-child alert system) (+2 more)

### Community 88 - "Package 2"
Cohesion: 0.17
Nodes (12): devDependencies, eslint, eslint-config-next, supabase, tailwindcss, @tailwindcss/turbopack, @types/node, @types/pg (+4 more)

### Community 89 - "DB Test Harness 3"
Cohesion: 0.26
Nodes (8): vitest, ARGON2_PARAMS, defaultsRefusedBecause(), LOCAL_SEED_PASSWORDS, main(), seedAccounts(), seedPasswords(), SeedAccount

### Community 90 - "D6 Implementation Plan V2"
Cohesion: 0.33
Nodes (11): TASK-013 LLM adapter (2 providers, evidence check, fallback), TASK-017 Matching engine (filters, cosine, bonuses, reasons), TASK-028 SCREEN-010 match review + API-009/010, TASK-029 SCREEN-012 case detail, close, audit, TASK-039 Evaluation harness, TASK-043 Final evaluation run on freeze build, TASK-064 Identity-grouped manifest, hard negatives, frozen metrics, Task Board TASK-001-064 (+3 more)

### Community 91 - "Team Handover V2 2"
Cohesion: 0.27
Nodes (9): TASK-061 V2 required fields, DTOs, token/idempotency, TASK-062 V2 schema invariants, restricted roles, redaction, TC-022 Cross-case access returns E-004 + access.denied audit, FV-02 Phone dedupe as weak cue, FV-04 Role permissions / DTOs, FV-05 Idempotency and counters, FV-07 Redaction of direct and related payloads, FV-12 Provider processing before submission (+1 more)

### Community 92 - "Team Handover V2 3"
Cohesion: 0.18
Nodes (10): TC-010 Confirm, referral, close with audit, RISK-009 False match sends a child into danger, Round 2 Video Script (1:45), BSS CID briefing (Missing Children Cell, MUN, 13219), Daily Star report 3 Sep 2026 (15,717 reported, 2,038 untraced), FV-01 Referral and closure semantics, Hack for Humanity official event page, multilingual-e5-small (384-d) model card (+2 more)

### Community 93 - "Globals Css Source Guard Test"
Cohesion: 0.20
Nodes (6): CLIENT_EXAMPLE_VALUES, expected, file, docs, manifest, ManifestFile

### Community 94 - "D1 Prd V2 3"
Cohesion: 0.36
Nodes (7): GOAL-004 Duplicate reports detected (pairwise F1 >=0.8), OQ-015 Dedupe priority (detection Must, merge Could), FR-022 Flag possible duplicates, keep reports discoverable (Must), FR-023 Reviewed reversible duplicate grouping/dismissal (Could), STORY-014 Detect duplicate reports (Must), TC-013 Duplicate flag and link, TC-029 One-to-one confirm lock

### Community 95 - "D1 Prd V2 4"
Cohesion: 0.31
Nodes (6): OQ-002 Adopt separate missing/found state machine?, DEP-011 Base map display with offline fallback, FR-019 Separate missing/found/confirmed-pair district counts (Must), NFR-005 District map 1,000 cases <=2 s, TC-012 Map counts equal register, TC-032 Illegal state transitions rejected

### Community 96 - "D1 Prd V2 5"
Cohesion: 0.24
Nodes (8): FR-017 Reject with reason, remove candidate (Must), FR-029 Parent edit after submission per BR-025, versioned (Should), OQ-020 Cross-device parent return, SCREEN-006 Parent case status and edit, STORY-019 Edit after submission (Should), STORY-020 See my case status (Should), TC-011 Reject -> open, not re-suggested, TC-018 Edit after submission

### Community 97 - "D2 Trd Parta V2 3"
Cohesion: 0.24
Nodes (9): API-020 /api/auth/*, Auth.js credentials provider (staff/officer/admin), COMP-005 Auth and session, E-002 UNAUTHENTICATED, Signed anonymous parent cookie (fera_ps), Sessions, tokens and CSRF (§9.4), Auth flow, D-008 Role officer and verified? (+1 more)

### Community 98 - "D5 Background Schema V2 6"
Cohesion: 0.22
Nodes (7): AiBudget, AiCall, AiReservation, Project constraints (budget, time, network, data, law), IntakeDraft, OQ-011 Personal Data Protection Act (2026), Personal Data Protection Act, 2026

### Community 99 - "D7 Closing Pack V2"
Cohesion: 0.22
Nodes (9): Clarifications Still Needed (OQ-001-026), D7 Closing Pack V2, OQ-025 Judging weights, OQ-026 Acceptability of synthetic data for Round 2, RISK-003 AI invents or misreads fields, RISK-012 Overclaiming metrics, interviews or law, Top 10 Risks (L x I scoring), V2 Meeting Outputs (+1 more)

### Community 100 - "Template Tests And Fixtures"
Cohesion: 0.20
Nodes (5): exampleMissingDraft, exampleOwnerCaseView, TemplateInput, blank, input()

### Community 101 - "Design 2"
Cohesion: 0.22
Nodes (8): Cockpit (dark, default) theme, Cockpit & Paper design system, Diff review agentic pattern (undoable changes), Notion design language (provenance), Paper (light) theme, Raycast design language (provenance), Semantic token theming ([data-theme]), Sticker palette (decoration only)

### Community 102 - "Verification Scripts 2"
Cohesion: 0.25
Nodes (7): [base = "http://localhost:3108", out = "."], check(), { chromium }, foreign, newContext(), results, shellFacts()

### Community 103 - "Demo And Safeguard TCs"
Cohesion: 0.22
Nodes (9): TASK-022 SCREEN-003 review + API-003 + draft persistence, TASK-033 Demo-safe cache + fixtures + cached badge, TASK-053 Finale local stack (DEMO_MODE=1), TC-004 Review before submit (0 child case rows pre-submit), TC-016 Append-only audit log, TC-020 npm run eval:all report, TC-021 DEMO_MODE offline journey, TC-036 Spend cap refusal E-023 (+1 more)

### Community 104 - "Pool"
Cohesion: 0.39
Nodes (6): pg, closePool(), DatabaseConfigError, getPool(), PoolSlot, setPoolForTests()

### Community 105 - "Agent Roster"
Cohesion: 0.32
Nodes (6): Claude Code vs Codex layout (18 agents vs 16 roles), fera-gate skill, Agent roster, spec-kit as process spine, need(), bootstrap.sh script

### Community 106 - "D6 Implementation Plan V2 3"
Cohesion: 0.29
Nodes (6): Synthetic Demo Data (Rafi, Kamalapur boy, Mim, Sabbir, Narayanganj decoy), D6 Demo Plan, MVP Essential Journey (8 steps), Finale Script (8 min + Q&A), RISK-005 Venue internet fails, FV-08 Split demonstration DB

### Community 108 - "Wording Guard"
Cohesion: 0.36
Nodes (5): BANNED_TERMS, BannedGroup, findBannedGroup(), NORMALISED, normaliseForGuard()

### Community 109 - "Principal And Rows 2"
Cohesion: 0.43
Nodes (6): API_ACCESS, API_IDS, ApiId, Branded, canCall(), canIntake()

### Community 110 - "D5 Background Schema V2 7"
Cohesion: 0.29
Nodes (3): FR-020 Restrict candidates to verified officers, GOAL-008 Humans make every match decision, Match (ranked missing↔found candidate pair)

### Community 111 - "D5 Background Schema V2 9"
Cohesion: 0.33
Nodes (6): COMP-035 Review queue list, Officer keyboard shortcuts (J/K, Enter, C, R, Esc), API-010 POST /api/candidates/:id/decision, DecisionRequest, DecisionResponse, TC-029 One-to-one confirm lock

### Community 112 - "Eslint Config"
Cohesion: 0.29
Nodes (5): CASE_INTERNALS, eslintConfig, SERVER_MODULES, eslint, eslint-config-next

### Community 113 - "Package 3"
Cohesion: 0.29
Nodes (7): dependencies, next, @node-rs/argon2, pg, react, react-dom, zod

### Community 114 - "Product"
Cohesion: 0.29
Nodes (6): Admin (user), Parent or guardian (user), PRODUCT.md product brief, Station or shelter staff (user), Verified officer (user), What the project does not do

### Community 115 - "Globals Css Source Guard Test 2"
Cohesion: 0.33
Nodes (4): cockpit, css, desk, paper

### Community 116 - "Design 3"
Cohesion: 0.40
Nodes (4): Inter with ss03 type system, Noto Sans Bengali for Bangla text, impeccable skill for design quality, Operating context and offline cached demo

### Community 117 - "Agent Roster 2"
Cohesion: 0.50
Nodes (3): cost-aware-llm-pipeline skill (USD 30 budget), ECC selection: 13 agents, 15 skills, .env.example template (AI_SPEND_CAP_USD=25)

## Ambiguous Edges - Review These
- `API-010 POST /api/candidates/:id/decision` → `COMP-035 Review queue list`  [AMBIGUOUS]
  docs/spec/D4_Design_Brief_V2.md · relation: conceptually_related_to
- `Evidence on hand (no interviews, no metrics)` → `Fera AI root README`  [AMBIGUOUS]
  PRODUCT.md · relation: conceptually_related_to
- `.env.example template (AI_SPEND_CAP_USD=25)` → `cost-aware-llm-pipeline skill (USD 30 budget)`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to
- `RISK-012 Overclaiming metrics, interviews or law` → `Next-meeting Agenda and Decisions`  [AMBIGUOUS]
  docs/spec/D7_Closing_Pack_V2.md · relation: conceptually_related_to

## Knowledge Gaps
- **688 isolated node(s):** `AdminAuditEntryView`, `AdminUsersResponse`, `AnonymiseRequest`, `AuditResponse`, `CaseListQuery` (+683 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 955 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **41 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `API-010 POST /api/candidates/:id/decision` and `COMP-035 Review queue list`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `vitest` connect `DB Test Harness 3` to `API Route Factory`, `Session Tokens`, `Case States And SQL Parity`, `Contract Validation Tests`, `API Route Factory And Limits`, `Typed Contract Examples`, `API Platform And Auth Tests`, `Sign-in Form Flow`, `Role Guard And Not-found`, `Audit Writer And Denials`, `Locale And Layout`, `Officer Views And Queue`, `Transactions And Internals`, `Credential Sign-in`, `DB Test Harness`, `Case Service Tests`, `Return Paths After Sign-in`, `DB Test Harness 2`, `Role Projections And Audit View 2`, `Case Command Requests`, `State`, `Demo Accounts`, `Sign In Errors`, `Package`, `Outputs Service Tests`, `Token Contrast Test`, `Globals Css Source Guard Test`, `Template Tests And Fixtures`, `Pool`, `Wording Guard`, `Globals Css Source Guard Test 2`, `Companion Types Test`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **What connects `AdminAuditEntryView`, `AdminUsersResponse`, `AnonymiseRequest` to the rest of the system?**
  _688 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Contract Zod Schemas` be split into smaller, more focused modules?**
  _Cohesion score 0.021439953643343473 - nodes in this community are weakly interconnected._
- **What is the exact relationship between `Evidence on hand (no interviews, no metrics)` and `Fera AI root README`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `Feature 001 Contract Notes (TASK-061)` connect `Handoff Shared Context` to `TASK-023 Outputs Evidence`, `Feature 001 Tasks`, `Obidit Phase 2 Work`, `Case Service Contract`, `Spec-Kit Feature Prompts`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Should `API Route Factory` be split into smaller, more focused modules?**
  _Cohesion score 0.04803133374561946 - nodes in this community are weakly interconnected._