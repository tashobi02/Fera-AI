# A2 evidence: follow-up question templates and selector

Task: TASK-020 part 1 / COMP-009. Lane: `phase2--obidit-orchestrator`. Review date: 2026-10-16 (Asia/Dhaka). Base/HEAD: `0617b4c73eb51ce7610bb29f642244974e063a21`.

Scope: only `src/server/intake/questions.ts`, `src/server/intake/README.md`, `tests/intake/questions.test.ts` and this evidence doc. Initial staged/unstaged tracked diffs were empty; these four files were untracked. No scope drift required reverting. No commit, push, new dependency, route, provider call or `.env*` inspection.

## Built behavior and checked sources

- Five fixed bilingual templates, keyed by the existing `DraftFieldPath`. All ten strings match `docs/spec/D3_App_Flow_V2.md:83–87` character for character. Bangla enclosing quotation marks are Markdown delimiters; the sex-button annotation is UI guidance, not question text.
- Source mapping: age → D3:83; sex → :84; district → :85; event time → :86; phone → :87. `docs/spec/D4_Design_Brief_V2.md:206–210` contains validation messages, not conversational questions. There are no entries with a missing language in these five templates.
- D3 table order selects exactly one available missing field. D1 BR-015 (`docs/spec/D1_PRD_V2.md:495`) defines required submission fields, not priority; name is optional and non-empty last-seen place is required.
- Empty `missing` returns `null`; otherwise `round >= LIMITS.followUpRounds` returns manual/rounds_exhausted. The existing constant is 4 (`src/contracts/primitives.ts:117`). When no missing field has a usable template, return manual/no_template. D1 STORY-003 AC1/AC2 is at :268–269, FR-005 at :396 and BR-023 at :515.
- Questions match the frozen strict `{ field, bn, en }` schema (`src/contracts/schemas.ts:265–270`). Manual results and `null` are local results, not question DTOs. Helpers classify variants and optionally adapt to the brief's tagged proposal. No contract changed.
- Read handoff item 8 (`docs/agents/handoff/OBIDIT.md:98–101`) and the fixed-text precedent in `../obidit-templates/src/server/outputs/templates.ts` read-only. This task does not establish full TASK-020 or route-level TC-003 acceptance.

## Verification

The worker originally recorded “verification pending” because it could not run commands. The following are reviewer executions, not worker or supervisor claims.

Initial checks before reviewer changes:

| Command | Exit | Result |
|---|---:|---|
| `npm run lint` | 0 | No diagnostics |
| `npm run typecheck` | 0 | Route types generated; no TypeScript errors |
| `npm test` | 0 | 41 passed / 4 skipped files; 949 passed / 117 skipped tests (1066 total) |
| `npm run build` | 0 | Production compilation, TypeScript and static generation passed (8/8 pages) |
| `npm test -- tests/intake/questions.test.ts` | 0 | 1 file, 15/15 tests (independent read-only reviewers) |

The known `tests/auth` argon2 timing failure did not occur in the initial full run; no isolated retry was needed.

Final reviewer checks after corrections:

| Command/check | Exit | Result |
|---|---:|---|
| `npm run lint` | 0 | No warnings or errors |
| `npm run typecheck` | 0 | Route types generated; no TypeScript errors |
| `npm test` | 0 | 41 passed / 4 skipped files; 1015 passed / 117 skipped tests (1132 total) |
| `npm run build` | 0 | Production compilation, TypeScript and static generation passed (8/8 pages) |
| `npm test -- tests/intake/questions.test.ts` | 0 | 1 file, 81/81 passed; no skips |
| Inline Python documentation regression audit | 0 | 7/7 passed after correction; initial RED was exit 1, 7/7 failed |
| Inline Python source/scope/whitespace audit | 0 | 10/10 D3 literals in source and tests; 0 log/network/persistence API findings; exactly 4 allowed untracked files, 0 tracked changes; no trailing whitespace |
| `CI=1 npm test -- --coverage --coverage.provider=v8` | 1 | Cannot find `@vitest/coverage-v8`; coverage not measured. No dependency installed |

The final full run also had no argon2 timing failure; no isolated retry was needed in either run. The four skipped files are the opt-in PostgreSQL suites (`tests/db/{auth,case,platform,redaction}.test.ts`); those 117 tests were not executed.

Earlier Sol-run review: PASS. The release gate result is recorded separately below.
fera-safeguarding-reviewer gate (2026-10-16): PASS with 3 WARNs. Invalid-round fail-closed guard fixed in G10. Unfilled {name}/{নাম} placeholders must be filled or replaced by the UNKNOWN fallback in the TASK-020 part 2 route, with a test that no '{' reaches the response.

## Reviewer corrections and test evidence

No selector runtime defect was found against the brief's valid-round cases. Corrected documentation and source comments:

1. Removed the client-token counter authority option; D2A §9.4 (`docs/spec/D2_TRD_PartA_V2.md:1300`) explicitly says embedded counters are not authoritative.
2. Removed unapproved mappings from revision/paid-call counts to follow-up rounds. BR-023 separately limits four follow-ups and six paid calls; round storage is UNKNOWN.
3. Removed invented neutral fallback examples. Missing-name copy/behavior is UNKNOWN, requiring an open decision.
4. Documented all name dependencies: age and district in both languages, plus English event time (`event.at`).
5. Corrected the schema citation to `db/schema_v2.sql:75–87` and attributed ordering only to D3.
6. Corrected the owner list to all three owners: Mahim (Sadman), Obidit and Masnun.
7. Clarified that only the pure selector is implemented, the optional tagged adapter is not a wire DTO, and UI sex options still need integration.

Before changes, an inline Python `unittest` audit reproduced seven documentation defects (exit 1; 7/7 failed): token authority, counter mapping, invented fallback copy, incomplete name dependency list, wrong schema citation, false priority attribution and owner count. The same seven assertions are rerun after correction; results below. These checks did not create another repository file.

Added Vitest cases for all 31 nonempty subsets of templated fields in reversed/duplicated order with untemplated fields present; all 20 field/round combinations for rounds 0–3; all 14 untemplated fields at rounds 0/4; and guard/manual variants plus independence between calls. The strict question schema verifies that each selection returns one question with no extra keys. Frozen inputs verify no mutation.

## Fields with UNKNOWN question copy

`DRAFT_FIELD_PATHS` (`src/contracts/states.ts:161–167`) contains 19 paths. These 14 have no entry in the D3:79–88 follow-up table; their question copy remains **UNKNOWN**:

| Field | Template status |
|---|---|
| `child.name` | UNKNOWN |
| `child.name_latin` | UNKNOWN |
| `child.age_min` | UNKNOWN |
| `child.age_max` | UNKNOWN |
| `child.height_cm` | UNKNOWN |
| `child.clothing` | UNKNOWN |
| `child.marks` | UNKNOWN |
| `event.at_lower` | UNKNOWN |
| `event.at_upper` | UNKNOWN |
| `event.place_text` | UNKNOWN; required for missing-report submission (BR-015) |
| `event.district_text` | UNKNOWN |
| `event.thana` | UNKNOWN |
| `event.circumstances` | UNKNOWN |
| `reporter.relation` | UNKNOWN |

## Open decisions

- **OD-020-1 — Missing copy and names:** name-dependent `child.age_years`, `event.district_code` (both languages) and `event.at` (English) require the reviewed name. Fallback question text/behavior with no reviewed name and question copy for the 14 untemplated paths are UNKNOWN. Do not invent text or names. The library preserves the sourced templates verbatim; callers must resolve this before displaying dependent questions. UI must retain D3:84's other/unknown sex choices.
- **OD-020-2 — Shape difference recorded, resolved for this library:** the brief's tagged proposal differs from the frozen strict question DTO. The contract wins as instructed. API callers must use `{ field, bn, en }`; the tagged helper is local only. No contract change is proposed.
- **OD-020-3 — Authoritative round storage:** `intake_drafts` (`db/schema_v2.sql:75–87`) has no dedicated round column. Storage, atomic increment and replay/concurrency enforcement are UNKNOWN. Client-token counters cannot be authoritative (D2A:1300). Revision and paid calls are not established substitutes for follow-up counts. Resolve with Mahim and Masnun; any schema change requires all-owner review including Obidit. Route input must use validated server-owned metadata; invalid-number handling is not specified for this pure selector.
- **OD-020-4 — Four-round navigation / OD-021-7:** D3:69 sends rounds=4 to S-003; D1 STORY-003 AC2 (:269) likewise opens review with unknowns. D3:483 specifies SCREEN-005 for mandatory unknowns after four follow-ups; D1 FR-005 (:396), BR-023 (:515) and D2A:294 require manual completion. Exact routing remains UNKNOWN. The library returns manual/rounds_exhausted and does not navigate or unblock submission. D3:483 requires known values preserved and submit blocked until mandatory fields are completed.
- **OD-020-5 — Priority:** no explicit selection priority was found in the cited pack sections. Provisional order is D3:83–87 table order: age, sex, district, event time, phone. BR-015 is not priority evidence. Lead confirmation of that integration policy remains open.

## Safeguarding and verification limits

The library imports only the existing client-safe contracts and performs in-memory selection. No logs, child text/transcripts/provider messages, network calls, server storage, real-data fixtures, extraction, matching, decisions or lifecycle writes were added. Tests pass only field paths, rounds and a labelled synthetic caller-copy mutation. Unknown fields stay unresolved; templates do not claim alerts, delivery, rescue, probability or legal status.

No route or UI exists in this change. Server counter authority/concurrency, reviewed-name interpolation, labels/sex choices, navigation and pre-submit persistence enforcement therefore remain integration work, not verified behavior. Full-suite DB skips do not establish PostgreSQL transaction acceptance. CI, deployment and end-to-end TC-003 were not run. Coverage percentage is not measured; no dependency will be installed to obtain it.
