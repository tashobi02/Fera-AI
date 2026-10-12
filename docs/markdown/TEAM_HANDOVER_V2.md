# Fera AI — V2 Team Handover and Meeting Workbook

| Field | Value |
|---|---|
| Edition | 2.0 · 11 October 2026 · Asia/Dhaka (UTC+6) |
| Authors | Sadman Shaharier; Obidit Islam |
| Team | Sadman Shaharier · Obidit Islam · Masnun Kabir |
| Purpose | Revised specifications, development decisions and review evidence for the next team meeting |
| Release boundary | Invented synthetic-data prototype; real-case pilot readiness is not established |
| Evidence status | Companion validation completed as described below; application, accounts, evaluations, interviews, actual task progress and spend UNVERIFIED |

## 1 Start here

This package replaces the nine supplied Markdown specifications with V2 editions and updates their three code companions. Original files remain unchanged. Every V2 document names **Obidit Islam** as co-author alongside **Sadman Shaharier**. Existing document owners and team responsibilities are retained; authorship does not imply approval or completed implementation.

The complete handbook combines this workbook with all nine revised documents. The individual PDFs are convenient for discipline-specific review. Editable Markdown and exact code companions are included so the team can implement and maintain the same contracts. This is a specification handover; an application repository was not supplied and is not included.

Read this workbook first, then D1 for scope and rules, D2A for interfaces/schema/authority, D2B for privacy/evaluation/deployment, and D6 for the execution gates. Read D3 and D4 together when implementing screens. D5 is the ID/type index; D7 is the meeting and pitch closing pack. The registry document records assumptions and scope decisions.

## 2 Document and companion index

| File | Team use | Principal V2 change |
|---|---|---|
| [00_Gap_Check_and_Registry_V2.md](00_Gap_Check_and_Registry_V2.md) | Establish assumptions and scope | Separate planned work from evidence; synthetic-only baseline; official-cutoff uncertainty |
| [D1_PRD_V2.md](D1_PRD_V2.md) | Product acceptance and business rules | Required fields, uncertainty, duplicates, role views, lifecycle/count semantics and pilot gates |
| [D2_TRD_PartA_V2.md](D2_TRD_PartA_V2.md) | API, database and authority | Draft metadata/token, scoped submission UUIDs, role DTOs, reliable matching state and atomic pair decisions |
| [D2_TRD_PartB_V2.md](D2_TRD_PartB_V2.md) | Security, privacy and quality | Full related-payload redaction, paid reservations, valid evaluation and one-database fallback |
| [D3_App_Flow_V2.md](D3_App_Flow_V2.md) | Screen behaviour | Manual completion, role-scoped reads, current-version decisions and explicit referral-recorded labels |
| [D4_Design_Brief_V2.md](D4_Design_Brief_V2.md) | UI, Bangla copy and accessibility | Stronger border contrast, narrow officer layouts, shortcut controls and honest labels |
| [D5_Background_Schema_V2.md](D5_Background_Schema_V2.md) | Shared types and ID lookup | 537 unique IDs; corrected definition locations and revised TypeScript |
| [D6_Implementation_Plan_V2.md](D6_Implementation_Plan_V2.md) | Task/test execution | Rebased gates; 64 tasks, 66 acceptance specifications; corrected dependencies and workload |
| [D7_Closing_Pack_V2.md](D7_Closing_Pack_V2.md) | Meeting and demonstration narrative | Honest evidence/status claims, timing labels and unresolved decisions |
| `code/schema_v2.sql` | Fresh demo database | 17 tables; required-field, pair, history, redaction and cost controls |
| `code/fera_types_v2.ts` | Shared TypeScript contract | Distinct kind/state and role shapes; source spans, intervals, tokens and reservation types |
| `code/tokens_v2.css` | Design token source | Corrected light/dark border colours; retained token names |

The three companions are embedded byte for byte in D2A section 7, D5 section 6 and D4 section 16 respectively. Edit the canonical companion and regenerate its embedded copy together. ID stability is preserved; new IDs are API-021–023, ENTITY-015–017, TC-038–066 and TASK-061–064.

## 3 What changed against the validation report

“Revised” below means the specification now contains the correction. It does not mean the application has passed its acceptance test. Each owner must attach repository/run/decision evidence before closing an implementation finding.

| Finding | V2 correction and source | Owner | Remaining evidence |
|---|---|---|---|
| FV-01 · referral and closure | D1 BR-005/012/013; D2A API-010/011; D3; D7: confirmation records a simulated referral; closure records coordination only | Sadman + future safeguarding partner | UI/API transaction test; future identity, guardian, custody, recipient and acknowledgement procedure |
| FV-02 · phone dedupe | D1 BR-021/FR-022; D2A; TC-038: phone is a weak cue, reports remain visible; reviewed grouping preserves originals | Masnun | Shared-contact hard negatives; detector precision/recall; grouping audit if optional UI built |
| FV-03 · required/unknown fields | D1 BR-015/016; D2A types/API; D3/D4: district compulsory; found age unknown allowed; reviewed event bounds | Obidit + Masnun | Runtime validators, manual completion, temporal/provenance negative tests |
| FV-04 · role permissions | D1 BR-007/024; D2A section 9; D5: owner, staff-own, officer and admin DTOs | Sadman | Every-route ownership/verification tests; no admin rematch candidate/score leakage |
| FV-05 · idempotency/counters | D2A API-001/002/003/007; schema/types: separate opaque token, authoritative draft counter, scoped UUID/hash | Sadman + Obidit | HTTP concurrent replay/conflict test; principal binding and revocation; actual provider dispatch accounting |
| FV-06 · database invariants | D2A section 7; schema: initial states, required fields, current versions, decision/referral/audit coupling and immutable history | Sadman | Target PostgreSQL 16 CI, restricted runtime grants, sorted locks and concurrent application decisions |
| FV-07 · redaction | D1 BR-009; D2A API-016; D2B section 11; schema: direct and related payloads cleared; retained records pseudonymous | Sadman | Application/admin authority, duplicate-note cleanup, provider/export/backup policy; active linked evidence retained |
| FV-08 · split demonstration DB | D2B deployment; D6/D7: one database per whole journey; isolated local restart on fallback | Sadman | Cloud and offline rehearsals across separate role profiles; tested LAN HTTPS before phone microphone use |
| FV-09 · matching uncertainty | D1 BR-017/018; D2A adapter; D2B evaluation: national exact baseline, soft geography, unknowns and abstention | Masnun | Frozen embedding space and dev thresholds, hard negatives, no-match results and deployment spike |
| FV-10 · counts | D1 BR-014/FR-019; D5 DTOs; D6 demo: missing/found rows and confirmed pairs separated | Masnun | One-pair lifecycle count assertions across API, map and table |
| FV-11 · evaluation | D2B section 17; TASK-064; TC-056/057/063: identity-grouped manifest, exact denominators, cache exclusion and failure reporting | Obidit + Masnun | Manifest/hash, frozen run configuration, held-out report and baseline comparisons |
| FV-12 · provider processing | D1/D3/D4 notices; D2B section 11: synthetic audio/text processed before submission confirmation | Obidit | Actual account/model/endpoint terms, primary and fallback settings; lawful real-use review later |
| FV-13 · arithmetic/schedule | D2B section 12; D6; this workbook: USD 4.87 input-equivalent ceiling; 184 h Round 2 and 58 h dependency lower bound | Obidit + Sadman | Actual prices/spend, completed-work inventory, owner availability and revised resource schedule |
| FV-14 · pitch claims | D1/D5/D7: dated reporting cohort, existing returned/rescued outcomes, coordination need as hypothesis; no partnership/scale guarantee | Sadman | Source/selection-email review; real user/agency discovery; measured product results |
| FV-15 · deployment fit | D2A adapters; D2B security/deploy; TC-058/059/060/065: pin model/assets, codec tests, CSP/tile rules | Masnun + Obidit | Exact hosting tier/package/runtime test; audio bounds; all offline assets bundled; no bulk OSM caching |
| FV-16 · screens/accessibility | D2A API-021/022/023; D3; D4 and tokens; TC-061/062: screen paths and accessible reflow/shortcuts | Sadman | Rendered axe/manual keyboard/zoom/screen-reader checks; admin list and district drill-through implementation |

## 4 Contracts to freeze at the meeting

### 4.1 Submission and processing

Missing reports require a complete child age/range, sex selection with unknown allowed, district, non-empty last-seen place, reviewed event interval and reporter contact. Found reports require description, district/place/time interval and staff contact; age may be unknown. Names remain optional. Four follow-up rounds are a conversational limit, not permission to guess remaining required facts; use the accessible manual form.

Draft payload remains on the device before report confirmation. Audio/text can reach declared providers earlier after the processing notice. Server-side draft records contain only principal, expiry, hash, revision and paid-call count. The opaque token is outside CaseDraft. The server checks ownership, expiry and revocation; retries never reset paid-call usage.

Submission uses a client-generated UUID scoped to the authenticated principal/session. The same UUID and canonical reviewed payload returns the same case; different values conflict. A new UUID remains a separate report, even if text/phone matches. Staff and parent submissions both use this contract. Do not turn a text hash or contact phone into a child identity.

### 4.2 Matching and decisions

Matching begins with national eligible exact retrieval for approximately 200 records. Geography is a soft feature. Unknown found age and overlapping time uncertainty remain visible as uncertainty. Pin 384-dimensional embedding artifact revision, dtype, pooling, L2 normalisation and symmetric query-prefix policy. Qualification and duplicate thresholds are development hypotheses until calibrated and frozen; zero suggestions is a valid result. Similarity scores never mean probability of identity.

Confirmation is one transaction with sorted endpoint locks, current version/role checks, reviewer decision, candidate state, both report states, simulated referral and safe match.confirm audit. Competing pending pairs are voided and all affected reports are reconciled. Rejection records a reason and match.reject audit. Pending candidates cannot survive a report-version change. Reliable queued/running/complete/failed matching state survives request failures; detached serverless promises are insufficient.

Ordinary terminal edits are locked. A referral row does not prove delivery, recipient acceptance, guardian identity, custody or safe return. Before a real-case pilot, define an audited correction/reopen procedure with two distinct authorised reviewers and preserved superseded history. An isolated synthetic reset is a demo operation, not that correction procedure.

### 4.3 Authority and privacy

Parents see their own editable report before lock, their own status and available outputs. Staff sees own found entries. Active verified officers see operational evidence/candidates. Admins see aggregate/metadata views and rematch status only. All reads/actions require server checks and DTO allowlists; debug mode must preserve these boundaries.

Redaction clears names/Latin names, exact age, contact, source URL, source/provenance/hash/vector metadata, notes, snapshots and generated output, including related decision/referral/candidate/duplicate text. IDs, dates, coarse age, district, sex and lifecycle/audit links remain restricted pseudonymous data. Found evidence is retained until the linked missing report closes. Browser exports, provider copies and backups require separate treatment; lazy browser expiry does not guarantee deletion while the browser is closed.

V2 blocks rows marked non-synthetic; a true flag cannot detect real information disguised as synthetic. Keep every fixture invented and prevent real input at the application boundary. Do not enable real public-child news imports. Fixed templates and a review checkbox do not establish legal guardianship or lawful processing.

## 5 Verification performed for this handover

| Check | Result | Practical limit |
|---|---|---|
| Revised source coverage | Nine Markdown documents and three companions, plus this workbook | Independent upstream pitch/source PRD and application repository were not supplied |
| Registry | 537 rows / 537 unique IDs; category counts checked | IDs index requirements, not implementation completion |
| Embedded companions | All three exact matches; SHA-256 hashes recorded | Regenerate both copies after later edits |
| TypeScript | Strict compile using TypeScript 5.4.5 passed | Standalone contract file only; no runtime JSON/API validation |
| SQL execution | Fresh schema applied in PostgreSQL 18.3 via PGlite 0.5.8; pgvector 0.8.1 | Target PostgreSQL 16 and actual managed-host/runtime privileges remain untested |
| SQL behaviours | 48 targeted positive/negative checks passed | Sequential companion checks; not network concurrency, API authorisation or a deployed app audit |
| SQL coverage examples | Required fields, shared-phone reports, unknown found age, endpoint roles, audit-coupled decisions, immutable history, redaction, UUID uniqueness and atomic cost limits | The server still owns principal checks, lock order, safe audit content and provider settlement evidence |
| Token contrast | V2 border contrast exceeds 3:1 against all three light and dark surfaces | Full component, focus, keyboard, zoom/reflow and assistive-technology validation pending |
| PDF delivery | Searchable text, rendered diagrams, contents/bookmarks/links; workbook form fields | Complete and save forms in a compatible PDF viewer; form completion does not alter evidence status automatically |

See `verification/schema_checks.json`, `document_checks.json`, `contrast_checks.json` and `pdf_checks.json` for reproducible scope/results. The portable schema check runner and pinned package versions are included. These are companion-file checks; do not present them as 48 application or safeguarding tests passed.

## 6 Corrected capacity and dependency calculation

The task board contains 64 tasks and 222 estimated hours overall. The Round 2 selection is TASK-001–046, TASK-059/060 and TASK-061–064: **52 tasks, 184 hours**. This adds 12 hours of V2 remediation to the original 172-hour selection. Owner estimates are **Sadman 67 h, Obidit 54 h, Masnun 63 h**.

The declared dependency graph is acyclic. Its longest Round 2 path is **58 hours**:

| Sequence | Tasks | Hours |
|---|---|---|
| Contract and case foundation | TASK-001 → 061 → 062 → 015 | 16 |
| Matching and decision UI | TASK-017 → 027 → 028 → 029 → 030 | 26 |
| Verification and submission | TASK-038 → 042 → 060 → 043 → 044 → 046 | 16 |

This is a dependency lower bound. It assumes unlimited independent resources and continuous availability; owner workloads, feedback, model downloads and review queues can make elapsed delivery longer. The original printed path totalled 67 hours and included four undeclared edges, so its approximately 59-hour claim was invalid.

If no work were completed at the start of 11 October, four full days at the assumed ten hours per person per day would offer at most **120 team-hours**, before meetings, interruptions and submission buffer. That assumption is not verified capacity. First inventory actual completed work and remaining estimates; compare each owner's remaining load with actual availability. Reassign or reduce optional scope and state any omitted Must behaviour honestly. Keep the typed/manual journey, review, role enforcement, decision/audit integrity and truthful evaluation ahead of optional import, disaster UI, summary or duplicate-grouping UI.

Actual provider prices and spend remain unknown. The old extraction allowance used 1.32M input + 0.44M output tokens with output weighted four times: 3.08M input-equivalent tokens. USD 15 / 3.08 = **USD 4.87/M**, not USD 5.70/M. This is an allowance calculation, not a provider price quote. Record actual input/output/audio rates and maximum-call reservations. Default cap USD 25; a documented team budget decision may raise it within the USD 30 ceiling. Uncertain paid calls are not silently refunded.

## 7 Next-meeting agenda and decisions

| Minutes | Discussion | Required outcome | Lead |
|---|---|---|---|
| 0–10 | Actual repo/deploy progress, unfinished tasks and availability | Evidence-backed remaining-work inventory and owner capacity | Sadman |
| 10–25 | V2 required fields, token/UUID, role DTOs, decision/referral/count semantics | Agreed canonical contracts; unresolved items get owner/date | All |
| 25–35 | Provider/audio/embedding/hosting spike and costs | Tested primary/fallback configuration or explicit manual/demo limitation | Obidit + Masnun |
| 35–45 | Evaluation manifest, grouped split, baselines and no-match tests | Frozen development/test boundary and reporting definitions | Masnun + Obidit |
| 45–55 | One-database demo, official cutoff/channel/deliverables and claims | Rehearsal topology and submission checklist with verified organiser instructions | Sadman |
| 55–60 | Priorities, handover acknowledgement and next evidence check | Owner/date per unresolved action; no invented completion | All |

Bring the actual repository/build link, current board, remaining owner hours, provider account configuration and price sheet, organiser selection email, manifest/ground truth if written, test logs, spend log, and any consented interview notes. Retrieve the original pitch/source PRD if their inherited assumptions remain authoritative.

Use confirmed / changed / unknown for decisions. Do not replace missing answers with “nothing built,” “zero spend,” “no interviews” or “no agency outcomes” without evidence. Record who decided, when, what evidence was examined and the next review date.

## 8 Evaluation and demonstration handover

Use a canonical manifest of 80 missing + 80 found + 40 additional decoys = 200 records, 60 canonical true pairs, 20 canonical no-match missing queries and 25 duplicate links within that same total. Keep identity-connected and duplicate variants in one split. The intended 40% dev/60% test split may not divide exactly by count; report actual grouped counts. Do not tune on held-out examples.

Freeze model/revision, preprocessing, prefixes, score weights, thresholds, prompt/template and manifest hashes before final evaluation. Force fixtures/cache off for quality runs. Report present-field errors and false additions separately from null agreement, conditional top-1 precision with coverage, Recall@5, clearly defined macro P@5 and aggregate shortlist precision, no-match false suggestions/abstention, duplicate precision/recall/F1, speech WER and critical-field errors. Distinguish gold-field from extracted/speech-field matching and include baselines/failures. Repeated clips/runs are not new independent samples. Five volunteer timing sessions are exploratory; a 90% completion threshold with five participants needs five completions.

All online roles use one cloud database. All offline roles use one local database in separate browser profiles. Bundle fonts, model, fixture data and district geometry. Use a laptop for the offline microphone baseline; a LAN phone needs tested HTTPS/secure-context access. If cloud fails, restart a fresh local synthetic scenario and disclose the restart; the cloud report does not silently transfer. Optional OSM tiles require current policy/attribution/Referer compliance and cannot be bulk cached for offline use.

Label synthetic data, seeded officer verification, fixture/cache responses, simulated referral recording and compressed video time. A 38-second demonstration containing a longer voice note is edited/time-compressed, not proof of that end-to-end latency. Do not claim CID/MUN integration, real recipient acknowledgement, child return, nationally validated efficacy or results not yet measured.

## 9 Applying and maintaining the package

Apply `code/schema_v2.sql` to a **fresh isolated synthetic database** with the target pgvector extension installed. It is not a repeatable migration or a V1 upgrade script. Existing/live data needs backup, a reviewed versioned migration, explicit enum/data mapping and rollback rehearsal. Create missing reports initially as submitted then open; construct final fixture states through complete audited lifecycle transactions.

Use separate migration-owner, runtime and restricted redaction credentials. The runtime must not own tables, alter schema, disable triggers or truncate audit. PUBLIC function revocations in the schema are not a deployed privilege configuration; an operator must grant the exact service-role privileges and test them. Passing an admin UUID to redact_case does not authenticate an HTTP caller: server authority checks remain mandatory. Decision/cost helper functions execute inside the caller's transaction and do not replace request-level enforcement.

Keep the companion types at service boundaries and implement strict runtime validators. Convert database numeric/bigint/timestamp/vector values deliberately. Pin tested dependency/model artifacts and commit the real application lockfile. This specification does not bundle a Next.js app or define runnable npm application scripts; D2B/D6 commands are implementation targets.

After a contract edit: update the canonical companion/requirement, all affected API/flow/UI/test rows, D5 registry and companion embeds; rerun scope-appropriate checks; version the evidence and PDF exports. Do not mark TC-001–066 complete merely because the acceptance specifications exist.

## 10 Sources and evidence boundaries

Public sources below were verified in the preceding validation review. The V2 specifications preserve source distinctions: official sources for rules/technical contracts, reported police figures for scale, and hypotheses for unvalidated workflow need. Missing independent upstream project sources are explicitly marked.

| Source | Supported use | Link |
|---|---|---|
| Official event page | Track 3, 14 Oct submission date, 24 Oct finale, three-member limit and 5–10-minute finale presentation; exact submission time/channel/slide/video rules still require selection email | [Hack for Humanity](https://hackathonbd2026.lovable.app/) |
| Daily Star report, 3 Sep 2026 | Jan–Jul reporting cohort: 15,717 reported, 2,038 untraced, 13,679 reported returned/rescued; approximately 13% untraced and 74 reports/day; not a live October count | [Police-figure reporting](https://www.thedailystar.net/news/news/15717-children-reported-missing-bangladesh-jan-july-2026-2038-untraced-police-4264066) |
| BSS CID briefing report | Missing Children Cell / MUN authority and 13219; no Fera endorsement or integration | [CID briefing](https://www.bssnews.net/news-flash/350717) |
| Official Personal Data Protection Act, 2026 | Act identity, phased commencement and need for qualified child-data/transfer assessment; no legal compliance conclusion | [Official law](https://bdlaws.minlaw.gov.bd/act-1692.html) |
| Gemini terms; OpenAI data controls | Exact account/endpoint training, retention and human-review terms require review | [Gemini](https://ai.google.dev/gemini-api/terms) · [OpenAI](https://developers.openai.com/api/docs/guides/your-data) |
| E5 model card; pgvector | 384 dimensions/prefixes/normalisation and filtered retrieval behaviour | [E5](https://huggingface.co/intfloat/multilingual-e5-small/blob/main/README.md) · [pgvector](https://github.com/pgvector/pgvector) |
| PostgreSQL constraints | NULL/CHECK behaviour and integrity design | [PostgreSQL 16](https://www.postgresql.org/docs/16/ddl-constraints.html) |
| Hosting/model/speech documentation | Verify actual tier limits, local assets and tested audio formats | [Vercel](https://vercel.com/docs/functions/limitations) · [Transformers.js](https://huggingface.co/docs/transformers.js/api/env) · [Speech](https://developers.openai.com/api/docs/guides/speech-to-text) |
| W3C accessibility guidance | Non-text contrast, character shortcuts and reflow tests | [Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) · [Shortcuts](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html) · [Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) |
| OSM tile policy | Optional online attribution/Referer; no offline bulk download | [Tile policy](https://operations.osmfoundation.org/policies/tiles/) |

The dated cohort disproves a blanket claim that existing agencies record no returned/rescued outcomes. Whether operational tools support Fera's proposed linked coordination workflow remains an interview/partner-discovery hypothesis. Synthetic model results cannot establish safe child identity matching or national effectiveness.

## 11 Meeting decision worksheet

The PDF edition provides fillable review checkboxes and meeting notes. All fields are blank/unchecked initially; they represent team decisions entered by the reviewer, not pre-approved gates. Use a compatible PDF viewer and save a completed copy with the meeting date. The editable Markdown remains the canonical specification.

Record date/attendees, progress evidence, agreed scope and unresolved actions. Confirm contract freeze, provider/deployment evidence, grouped evaluation manifest, role/redaction tests, one-database rehearsal, honest metrics/claims and official submission instructions. If evidence is missing, leave the corresponding item unchecked and record an owner/date. Real-case use needs the separate legal, safeguarding and partner-operating gate in D2B; this workbook does not approve a pilot.

<!-- PDF_FORM_WORKSHEET -->
