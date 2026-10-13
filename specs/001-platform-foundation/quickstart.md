# Feature 001 validation guide

**Status**: Future validation instructions for a synthetic implementation. The app scaffold, runtime schema, contracts and CI are absent in this lane; planned npm commands are fail-fast stubs. No command below has been run as an application check. No provider call or real personal record is required. (TASK-001/002/061; AMD-1-1)

## Prerequisites and stop points

1. TASK-001 must supply the Next.js scaffold, lockfile, implemented scripts and green CI on main. Current Phase 0 status is `todo`; do not interpret a stub script as a pass. (TASK-001; D6 §5)
2. TASK-002 must use a fresh **synthetic** PostgreSQL 16/pgvector environment. Compare planned `db/schema_v2.sql` byte-for-byte with `docs/code/schema_v2.sql` before applying it locally and on the chosen host. OQ-021 host choice is UNKNOWN; do not create or apply a migration from this guide. (TASK-002; D2 Part A §7.1; TC-062)
3. TASK-061 must implement and validate the allowlist DTOs, Zod schemas and examples in `src/contracts/`; TASK-062 then verifies runtime grants and lifecycle/redaction invariants. `src/contracts/` and `db/schema_v2.sql` are frozen only under the reviewed G1 merge/tag rule. (TASK-061/062; BR-007/024; AMD-1-1)
4. Use invented synthetic people and reports only. Keep [MOCK], cached, synthetic and simulation labels visible as applicable. Do not use real child data, scraped pages, photos, faces, identity documents or exact coordinates. (FR-024; BR-026; DEP-007; TC-026)

## Validation journey once those prerequisites exist

| Step | Future action | Expected evidence |
|---|---|---|
| Scaffold | From the implemented worktree, run `npm run typecheck`, `npm run lint` and `npm run test`; inspect CI on main. | Commands and CI succeed from real implementations, with commit/URL recorded. Planned stub exit 1 never counts. (TASK-001/037) |
| Schema | Verify byte equality, apply the exact supplied schema to fresh local and host DBs through the approved TASK-002 procedure, then inspect HNSW index and version/grant results. | Local and host run logs without secrets, plus schema hash and HNSW evidence; no application of an edited schema. (TASK-002/062; TC-062) |
| Review and submit | On a synthetic parent session, keep draft child fields in the browser, review and confirm; replay the same UUID concurrently, then retry it with changed fields. | Pre-submit server metadata only; one case and stable ref for identical replay; changed payload conflicts; required fields reject per TC-030. (BR-004/015/016; TC-004/030/031/042/060) |
| Role boundary | Read one invented case as parent owner, staff owner, verified officer, admin, unverified officer and unrelated user; request candidate evidence and a hidden/absent ID. | Each `OwnerCaseView`/`StaffOwnCaseView`/`OfficerCaseView`/`AdminCaseView` contains only its allowlisted fields; staff, unverified officer and admin receive no candidate/other-party data; hidden/absent E-004 responses match. (BR-007/024; TC-022/023/044/045/052) |
| Decision and state | On current synthetic candidate versions, confirm as active verified officer, then attempt stale, second and illegal transitions; test both allowed closure outcomes from their required states. | One decision, both report states, competitor invalidation, referral recorded (simulation) and audit commit together; conflicting attempts leave no partial records. (BR-012/013/020; TC-010/029/032/046/047/053) |
| Audit and redaction | Check safe events for permitted changes and denied access; attempt audit-history mutation; redact an eligible terminal synthetic case and inspect related history. | Append-only audit, no child text in logs, and direct/related payload removed without erasing active linked evidence. (BR-009/010/025; TC-015/016/050/051/052) |
| Shell and recovery | Show SCREEN-008/016 in Bangla and English, inspect language toggle, parent Bangla numerals, 320 CSS px reflow, 200% zoom and one Android phone. | Screens follow D3 states and DESIGN.md visual tokens; phone evidence demonstrates Bangla glyphs. Human device check is still pending. (FR-033; COMP-022; TASK-008/031; TC-002/033/058) |

Record the command, exit code, commit, environment and safe evidence path for each future check. Measure any performance claim with its denominator; until then say **not measured**. See [platform-contract.md](contracts/platform-contract.md) for boundaries and [data-model.md](data-model.md) for state/count semantics. (NFR-001/010; FR-028; BR-014)
