# BUG_SOLVING2.md — Round 3 system-test tasks (S2 + S3) with subtasks

This document is the **second** of two BUG_SOLVING files produced by the
round 3 system-test pass. It covers the S2 (incorrect state visible to a user,
missing audit evidence, contract gap) and S3 (resource waste, UX confusion, log
noise) findings from `BUG_SOLVING1.md` — **restated as explicit tasks with
subtasks**, so an implementer can pick a task and know exactly what to do,
what to test, and when the task is done.

> **Related documents**
> - `BUG_SOLVING1.md` — S1 findings (already exploitable in production) + the
>   rejected/verified-not-bugs section. The S1 PR is the first thing to ship;
>   this doc assumes that PR has already landed.
> - `SYSTEM_INTEGRATION_TEST_PLAN.md` — the test plan the round 1 PR was
>   verified against. The new tasks below reference the system-level scenarios
>   (SYS-*) where they apply.

## How to read this document

Each numbered task has:

- **Why** — one or two sentences on the user impact.
- **Where** — file:line anchors for the code under change.
- **Subtasks** — a numbered list of small, well-defined work items. Each
  subtask is small enough to review in a single sitting.
- **Done when** — a concrete acceptance criterion (test names, lint, typecheck).
- **Test target** — the test file to extend and the assertion shape.

A reviewer should be able to read the **Done when** block and know whether the
task is complete without re-reading the source.

## Cross-references

| ID | Sev | Where in BUG_SOLVING1.md | Title |
|----|-----|--------------------------|-------|
| T-01 | S2 | F3-01 | API-003 hard-codes `outputs_available: []` |
| T-02 | S2 | F3-03 | `STAMP_COMPLETE` / `STAMP_FAILED` re-runs on closed cases |
| T-03 | S2 | F3-07 | One bad row poisons the whole candidate batch |
| T-04 | S2 | F3-08 | `voidPendingCandidates` writes N audit rows in a loop |
| T-05 | S2 | D3-01 | Missing partial index `(district_code, id) WHERE anonymised_at IS NULL` |
| T-06 | S2 | D3-02 | `match_candidates` partial unique indexes not `NULLS NOT DISTINCT` |
| T-07 | S2 | D3-03 | `audit_log` missing secondary indexes and partitioning |
| T-08 | S2 | D3-06 | `enforce_case_transition` lets hand-written `anonymised_at` updates through |
| T-09 | S2 | D3-08 | `audit_log.action` regex too loose; should be an ENUM |
| T-10 | S2 | D3-09 | `parent_sessions` and `intake_drafts` grow without bound |
| T-11 | S2 | D3-10 | `match_candidates` lifecycle has no `decided_at IS NOT NULL` CHECK |
| T-12 | S2 | U3-03 | Audit timeline missing per-row `[MOCK]` badge |
| T-13 | S2 | U3-04 | Close-form note is wiped on the E-005 `Reload` click |
| T-14 | S2 | U3-05 | `duplicate_of` list is un-actionable, un-scoped |
| T-15 | S3 | F3-04 | Dead dynamic import in matcher runner |
| T-16 | S3 | F3-05 | API-022 list issues 1 + 50 + 50 round-trips per page |
| T-17 | S3 | F3-06 | `reservePaidCall` pre-check is unlocked (defense-in-depth) |
| T-18 | S3 | F3-09 | Orchestrator hands runtime context a no-op logger |
| T-19 | S3 | U3-02 | Voice recorder mic stays open if `visibilitychange` fires pre-`getUserMedia` |
| T-20 | S3 | U3-06 | `event.at` time input validates every keystroke |
| T-21 | S3 | U3-08 | `LanguageToggle` has no `aria-label` |

Each task is fully defined below.

---

# S2 tasks

## T-01 — Forward the per-case `outputs_available` from the projection in API-003 (S2)

**Why.** API-003 overwrites the per-case DTO with `outputs_available: []`, so a parent re-fetching their case from API-003 sees a different "outputs available" list than from `/my-case` (which honours the projection). The contract field is silently broken on the create path.

**Where.**
- `src/app/api/cases/route.ts:48` (the override)
- `src/server/case/projection.ts` (the `projectCaseFor("owner")` already returns the field)
- `src/contracts/schemas.ts` (`ownerCaseViewSchema.outputs_available` definition)

### Subtasks

- T-01.1 Read `src/server/case/projection.ts` to confirm `projectCaseFor("owner")` returns `outputs_available` from `output_for_cases` (it does).
- T-01.2 In `src/app/api/cases/route.ts:48`, drop the `outputs_available: []` override; forward the value from `current.view.data`.
- T-01.3 In `src/contracts/examples.ts`, add an `ownerCaseViewExample` with `outputs_available: ["summary_bn"]` so the schema example is non-empty.
- T-01.4 In `tests/api/create-missing.test.ts`, add an assertion that the 201 response's `outputs_available` matches the seeded `output_for_cases` row.
- T-01.5 In `tests/api/create-missing.test.ts`, extend the existing happy-path test to assert the field is `Array.isArray(response.body.outputs_available)` (regression guard for the override).

**Done when**
- `npx vitest run tests/api/create-missing.test.ts` passes.
- `npx tsc --noEmit` is clean.
- `npm run lint` is clean.
- The route no longer carries the `outputs_available: []` literal in the source.

**Test target** (assertion shape):
```ts
expect(response.body.outputs_available).toEqual(["summary_bn"]);  // after pre-seeding
```

---

## T-02 — Guard `STAMP_COMPLETE` / `STAMP_FAILED` against re-run on closed/redacted cases (S2)

**Why.** A re-run of the matcher on a closed or redacted case still writes `matching_state='complete'`, making the case appear "still matching" on the desk.

**Where.**
- `src/server/matching/run.ts:467-489` (`STAMP_COMPLETE_SQL`, `STAMP_FAILED_SQL`)
- `src/server/matching/run.ts:110-117` (the upsert path)

### Subtasks

- T-02.1 In `src/server/matching/run.ts`, change `STAMP_COMPLETE_SQL` to:
  ```sql
  UPDATE cases SET matching_state = 'complete'
    WHERE id = $1 AND status NOT IN ('closed', 'referred')
      AND anonymised_at IS NULL
  RETURNING matching_state;
  ```
- T-02.2 Mirror the guard in `STAMP_FAILED_SQL` so a re-run on a closed case does not overwrite `matching_state='failed'`.
- T-02.3 If `RETURNING` is empty, log `{ event: "match.skipped_redacted_or_closed", missing_id, run_id }` at `info` level and proceed to void the candidates.
- T-02.4 In `src/server/matching/run.ts`, add the corresponding `voidPendingCandidates` step so the candidates table stays clean even when the cases row is not stamped.

**Done when**
- A closed-then-rerun case has `matching_state` unchanged.
- A redacted-then-rerun case has `matching_state` unchanged.
- The matcher log line `match.skipped_redacted_or_closed` appears in the test logs.
- `npx tsc --noEmit` clean.

**Test target**: `tests/db/match-run.test.ts` — new `it("does not stamp matching_state on a closed case")`.

---

## T-03 — Make the candidate batch tolerant to a single bad row (S2)

**Why.** One bad row in a 100-candidate batch makes the whole found-case match `failed` and skips the duplicate hook.

**Where.**
- `src/server/matching/run.ts` (the batch upsert loop)
- `tests/db/match-run.test.ts` (test target)

### Subtasks

- T-03.1 In `src/server/matching/run.ts`, wrap each row's `INSERT … ON CONFLICT …` in a `SAVEPOINT row` / `RELEASE SAVEPOINT row` / `ROLLBACK TO SAVEPOINT row` triad.
- T-03.2 On a row-level failure, log `{ event: "match.row_skipped", missing_id, found_id, err_code, err_message }` at `warn` level and continue the loop.
- T-03.3 Aggregate `skipped` into the runner's return value (`{ ok, candidates, considered, skipped }`).
- T-03.4 Ensure the duplicate-hook call runs even when `skipped.length > 0`.

**Done when**
- A 5-candidate batch with 1 bad row produces 4 valid candidates and `skipped.length === 1`.
- The duplicate hook still fires.
- `npx tsc --noEmit` clean.

**Test target**: `tests/db/match-run.test.ts` — `it("skips a single bad candidate and continues the batch")`.

---

## T-04 — Batch the `voidPendingCandidates` audit insert (S2)

**Why.** `voidPendingCandidates` writes N audit rows in a sequential loop inside a transaction that holds `lockCases` on both endpoints. With 50 candidates that's 50 INSERTs holding locks on 50 cases.

**Where.**
- `src/server/matching/run.ts` (the `voidPendingCandidates` function)

### Subtasks

- T-04.1 Refactor the per-candidate `INSERT INTO audit_log …` into one `INSERT … VALUES ($1, …), ($2, …), …` statement.
- T-04.2 Build the `VALUES` list with a `voidedCandidates.map((_, i) => …).join(",")` template, parameterised with the candidate IDs and the case IDs.
- T-04.3 Verify the post-batch `pg_stat_statements` shows one INSERT, not N.

**Done when**
- 50 voided candidates → 1 INSERT.
- Lock duration on the cases rows is unchanged (the loop was inside one transaction; the batched INSERT keeps it so).
- The audit rows are byte-equivalent to the prior per-row output.

**Test target**: `tests/db/case-audit-read.test.ts` — `it("voidPendingCandidates writes one batched audit row per candidate")`.

---

## T-05 — Add the missing partial index on `(district_code, id) WHERE anonymised_at IS NULL` (S2)

**Why.** API-022 and the dashboard stats query `cases WHERE district_code = $N AND anonymised_at IS NULL ORDER BY id DESC` against a table that only has `cases_kind_status_district_idx (kind, status, district_code)`. The planner seq-scans.

**Where.**
- `db/schema_v2.sql:196-200` (the existing index block)

### Subtasks

- T-05.1 Add three indexes to `db/schema_v2.sql`:
  ```sql
  CREATE INDEX cases_district_anonymous_id_idx
    ON cases (district_code, id DESC) WHERE anonymised_at IS NULL;
  CREATE INDEX cases_district_kind_anonymous_id_idx
    ON cases (district_code, kind, id DESC) WHERE anonymised_at IS NULL;
  CREATE INDEX cases_district_kind_status_idx
    ON cases (district_code, kind, status);
  ```
- T-05.2 Re-run `scripts/db/reset.mjs` against a fresh test database to confirm the indexes are created.
- T-05.3 Extend `tests/db/case-list.test.ts` with a `EXPLAIN`-based assertion that the planner picks `cases_district_anonymous_id_idx`.

**Done when**
- `tests/db/platform.test.ts` lists the new indexes.
- `EXPLAIN` on the officer list shows `Index Scan using cases_district_anonymous_id_idx`.

**Test target**: `tests/db/case-list.test.ts` — `it("uses the district+id partial index for the officer list")`.

---

## T-06 — Tighten the `match_candidates` partial unique indexes (S2)

**Why.** The partial unique indexes do not use `NULLS NOT DISTINCT` and the schema does not defend against a future migration that allows one endpoint to be soft-NULL.

**Where.**
- `db/schema_v2.sql:286-287` (the indexes)
- `db/schema_v2.sql:268-283` (the table)

### Subtasks

- T-06.1 Recreate the partial unique indexes with `NULLS NOT DISTINCT`:
  ```sql
  CREATE UNIQUE INDEX match_candidates_one_confirmed_missing
    ON match_candidates (missing_case_id) NULLS NOT DISTINCT WHERE status='confirmed';
  CREATE UNIQUE INDEX match_candidates_one_confirmed_found
    ON match_candidates (found_case_id)   NULLS NOT DISTINCT WHERE status='confirmed';
  ```
- T-06.2 Add a `CHECK` constraint:
  ```sql
  ALTER TABLE match_candidates
    ADD CONSTRAINT match_candidates_endpoints_not_null
    CHECK (missing_case_id IS NOT NULL AND found_case_id IS NOT NULL);
  ```
- T-06.3 Add a regression test in `tests/db/platform.test.ts` that introspects `pg_get_indexdef` and asserts the `NULLS NOT DISTINCT` clause.

**Done when**
- The indexes include `NULLS NOT DISTINCT` in their `pg_get_indexdef` output.
- The CHECK rejects a `NULL` endpoint insert.
- `npx vitest run tests/db/platform.test.ts` passes.

---

## T-07 — Add `audit_log` secondary indexes and a partition plan (S2)

**Why.** The only index is `(case_id, at)`. Any operator query by `actor_user_id`, `action`, or `at BETWEEN …` is a seq scan within weeks.

**Where.**
- `db/schema_v2.sql:344-356` (the table + index)

### Subtasks

- T-07.1 Add the secondary indexes:
  ```sql
  CREATE INDEX audit_log_at_idx              ON audit_log (at DESC);
  CREATE INDEX audit_log_actor_at_idx        ON audit_log (actor_user_id, at DESC) WHERE actor_user_id IS NOT NULL;
  CREATE INDEX audit_log_action_at_idx       ON audit_log (action, at DESC);
  CREATE INDEX audit_log_session_at_idx      ON audit_log (actor_session_id, at DESC) WHERE actor_session_id IS NOT NULL;
  CREATE INDEX audit_log_request_id_idx      ON audit_log (request_id) WHERE request_id IS NOT NULL;
  ```
- T-07.2 Document the partition plan in `db/notes/audit-partitioning.md` (a new file). Cover: `pg_partman` schedule, monthly partition naming, retention policy, replay-vs-replay retention for the demo seed.
- T-07.3 Extend `tests/db/platform.test.ts > "append-only audit"` with a `it("exposes at/actor/action/request_id indexes")` that introspects `pg_indexes`.

**Done when**
- All five indexes are created.
- The `db/notes/audit-partitioning.md` doc is committed and cross-linked from `db/schema_v2.sql` header comment.
- The new test passes.

---

## T-08 — Pin `anonymised_at` writes to `redact_case` via a GUC (S2)

**Why.** `enforce_case_transition` lets a hand-written `UPDATE cases SET anonymised_at=now() WHERE id=$1` go through without going through `redact_case` — which means the `case.payload_redacted` audit row never gets written.

**Where.**
- `db/schema_v2.sql:203-251` (the transition trigger)
- `db/schema_v2.sql:592-624` (the `redact_case` function)

### Subtasks

- T-08.1 Modify `redact_case` to set the GUC before the update:
  ```sql
  PERFORM set_config('fera.redacting', '1', true);
  -- existing UPDATE …
  ```
- T-08.2 Add a guard at the top of `enforce_case_transition`'s UPDATE branch:
  ```sql
  IF NEW.anonymised_at IS NOT NULL AND OLD.anonymised_at IS NULL AND
     (current_setting('fera.redacting', true) IS NULL OR
      current_setting('fera.redacting', true) <> '1') THEN
    RAISE EXCEPTION 'anonymised_at may only be set by redact_case()' USING ERRCODE = 'insufficient_privilege';
  END IF;
  ```
- T-08.3 Add a regression test in `tests/db/platform.test.ts` that runs a hand-written `UPDATE cases SET anonymised_at = now() WHERE id = $1` and expects `42501`.

**Done when**
- Hand-written `anonymised_at` writes are rejected.
- `redact_case` calls still succeed and still write the `case.payload_redacted` audit row.

---

## T-09 — Convert `audit_log.action` from a regex to an ENUM (S2)

**Why.** The current regex admits any 3-60 char lowercase-underscore string; a typo in a SQL string is silently accepted and breaks `check_pair_integrity` downstream.

**Where.**
- `db/schema_v2.sql:350` (the regex CHECK)
- `src/contracts/states.ts:152-157` (`AUDIT_ACTIONS`)
- `src/server/audit/actions.ts:8-32` (`CASE_AUDIT_ACTIONS`)

### Subtasks

- T-09.1 In `db/schema_v2.sql`, create the ENUM:
  ```sql
  CREATE TYPE audit_action AS ENUM (
    'match.confirm','match.reject','case.payload_redacted','access.denied',
    'case.created','case.imported','case.submission_replayed','case.state_changed',
    'case.edited','case.closed','case.contact_viewed','match.voided',
    'referral.recorded','duplicate.reviewed','duplicate.flagged',
    'match.refused','case.close.refused','case.edit.refused','user.verification_changed'
  );
  ```
- T-09.2 Migrate the column:
  ```sql
  ALTER TABLE audit_log ALTER COLUMN action TYPE audit_action USING action::audit_action;
  ```
- T-09.3 Drop the old CHECK constraint.
- T-09.4 Add a CI guard (in `scripts/db/check-enum-drift.mjs` — new file) that compares the ENUM list to `WRITABLE_AUDIT_ACTIONS + ['case.payload_redacted']` and fails the build on drift.
- T-09.5 Add a regression test in `tests/db/audit-actions.test.ts` (new) that `INSERT INTO audit_log (action, …) VALUES ('match.ConfirM', …)` is rejected with `22P02`.

**Done when**
- The ENUM exists, the column is migrated, the CI guard runs in `npm run check`.
- The regression test passes.

---

## T-10 — Add a sweep job + partial indexes for `parent_sessions` and `intake_drafts` (S2)

**Why.** Both tables grow without bound; the active set is a small fraction of the total.

**Where.**
- `db/schema_v2.sql:65-99` (the tables)
- `scripts/db/` (the new sweep script)
- `package.json` (the new `db:sweep` script)

### Subtasks

- T-10.1 Add the partial indexes in `db/schema_v2.sql`:
  ```sql
  CREATE INDEX parent_sessions_active_idx ON parent_sessions (id)
    WHERE revoked_at IS NULL AND expires_at > now();
  CREATE INDEX intake_drafts_active_idx ON intake_drafts (session_id, created_at)
    WHERE expires_at > now();
  ```
- T-10.2 Create `scripts/db/sweep.mjs` that:
  - `DELETE FROM parent_sessions WHERE revoked_at IS NOT NULL OR expires_at < now() - interval '7 days';`
  - `DELETE FROM intake_drafts   WHERE expires_at < now() - interval '1 day';`
  - Logs the count of deleted rows and exits non-zero on DB error.
- T-10.3 Add a `"db:sweep"` entry to `package.json` that runs the script.
- T-10.4 Add a `tests/db/sweep.test.ts` (new) that seeds 100 expired sessions + 100 expired drafts, runs the sweep, and asserts the table counts.

**Done when**
- `npm run db:sweep` is green on a test database.
- The partial indexes exist and are used by the principal resolver's SELECT (verified via EXPLAIN).
- The new test passes.

**Implementation note.** PostgreSQL rejects a partial-index predicate containing
`now()` because it is not immutable. The schema and migration use regular
`expires_at` indexes, add `sweep_expired_metadata()` and expose it as
`npm run db:sweep`. The database-backed behavior and deployment schedule still
need verification in a PG16 + pgvector environment; this worktree does not
configure a recurring scheduler.

---

## T-11 — Add the `match_candidates` `decided_at IS NOT NULL` CHECK (S2)

**Why.** A `voided` or `superseded` row with `decided_at IS NULL` passes the symmetric CHECK today; the symmetric CHECK only catches `(status='pending')` paired with `decided_at IS NOT NULL`.

**Where.**
- `db/schema_v2.sql:266-283` (the table)

### Subtasks

- T-11.1 Add the new CHECK:
  ```sql
  ALTER TABLE match_candidates
    ADD CONSTRAINT match_candidates_decided_at_when_terminal
    CHECK (
      (status = 'pending' AND decided_at IS NULL)
      OR (status <> 'pending' AND decided_at IS NOT NULL)
    );
  ```
- T-11.2 Add a regression test in `tests/db/platform.test.ts` that `UPDATE match_candidates SET status='voided', decided_at=NULL WHERE id=$1` is rejected with `23514`.

**Done when**
- The CHECK exists.
- The regression test passes.
- The existing matcher test still passes (it always sets both columns together).

---

## T-12 — Add a per-row `[MOCK]` badge to the audit timeline (S2)

**Why.** The audit list renders a localised label per action but never reads `entry.is_synthetic`. An admin reviewing a `user.verification_changed` row cannot tell from the timeline that the row was synthetic.

**Where.**
- `src/app/(desk)/officer/case/[id]/audit-list.tsx:22-61` (`ACTION_LABEL`)
- `src/app/(desk)/admin/verify-officers-form.tsx:241-268`
- `src/app/components/honest-label.tsx` (the existing chip component)

### Subtasks

- T-12.1 In `src/contracts/case-audit.ts`, add `is_synthetic: boolean` to the `AuditEntry` schema (already a non-strict field; make it explicit).
- T-12.2 In `src/server/audit/read.ts` (the audit read service), include `is_synthetic` in the SELECT projection.
- T-12.3 In `src/app/(desk)/officer/case/[id]/audit-list.tsx`, render `<HonestLabel>{t.syntheticBadge}</HonestLabel>` when `entry.is_synthetic`.
- T-12.4 Add the `syntheticBadge` translation key in `src/lib/i18n/locales/bn.ts` and `en.ts`.
- T-12.5 In `src/app/(desk)/officer/case/[id]/audit-list.tsx`, mark the row `data-test="audit-row-{id}"` for the test to target.
- T-12.6 Add `tests/officer/audit-list.test.tsx` (new) with two rows (one synthetic, one not) and assert the chip is present on the synthetic row only.

**Done when**
- The synthetic row shows the badge in both locales.
- `npx vitest run tests/officer/audit-list.test.tsx` passes.
- `npx tsc --noEmit` clean.

**Test target** (assertion shape):
```tsx
expect(screen.getByTestId("audit-row-1")).toHaveTextContent(/MOCK|synthetic/i);
expect(screen.getByTestId("audit-row-2")).not.toHaveTextContent(/MOCK|synthetic/i);
```

---

## T-13 — Persist the close-form note across an E-005 reload (S2)

**Why.** On `state.failure === "stale"` the only button is `window.location.reload()`. The note is in the *current* component's state; after reload, the officer has to retype it.

**Where.**
- `src/app/(desk)/officer/case/[id]/close-form.tsx:328-352`

### Subtasks

- T-13.1 In `src/app/(desk)/officer/case/[id]/close-form.tsx`, add a `NOTE_KEY(caseId) = "fera.close-note.{caseId}"` constant.
- T-13.2 In the `note` setter, write to `sessionStorage`:
  ```ts
  try { sessionStorage.setItem(NOTE_KEY(caseId), value.slice(0, NOTE_MAX)); } catch {}
  ```
- T-13.3 In the initial state factory, restore from `sessionStorage`:
  ```ts
  const restored = (() => { try { return sessionStorage.getItem(NOTE_KEY(caseId)) ?? ""; } catch { return ""; }})();
  return { step: 1, stepped: false, outcome, note: restored.slice(0, NOTE_MAX), ... };
  ```
- T-13.4 On `success` and on `state.note === ""`, `sessionStorage.removeItem(NOTE_KEY(caseId))`.
- T-13.5 In `tests/officer/close-form.test.tsx`, type a note, dispatch `state.failure = "stale"`, click "Reload", re-mount the component, and assert the note is restored.

**Done when**
- The note survives `window.location.reload()` (simulated by unmount + remount).
- The sessionStorage key is removed on `success` and on empty input.
- The new test passes.

---

## T-14 — Make the `duplicate_of` list actionable on the officer case detail (S2)

**Why.** `duplicate_of` items are rendered as plain text — not links, no status. An officer cannot drill in.

**Where.**
- `src/app/(desk)/officer/case/[id]/case-detail.tsx:191-216`
- `src/server/case/projection.ts` (the `projectCaseFor("officer")` return type)

### Subtasks

- T-14.1 In `src/server/case/projection.ts`, change `duplicate_of: string[]` to `duplicate_of: { ref: string; id: string; status: CaseStatus }[]`. The service already has the case id and status in hand; this is a re-shape, not a new query.
- T-14.2 In `src/app/(desk)/officer/case/[id]/case-detail.tsx`, render each item as a `<Link href={\`/officer/case/\${d.id}\`}>` plus a `<StatusBadge group={groupOf(d.status)} locale={locale} />`.
- T-14.3 In `tests/officer/case-detail.test.tsx`, render with a single duplicate and assert the link and the status badge.
- T-14.4 Update the contract schema in `src/contracts/case.ts` to the new shape; regenerate the `examples.ts` example.

**Done when**
- The duplicate list is clickable and shows the status.
- The test passes.
- `npx tsc --noEmit` is clean.
- `npm run lint` is clean.

**Test target** (assertion shape):
```tsx
const dup = screen.getByTestId("duplicate-ref");
expect(dup).toHaveAttribute("href", "/officer/case/u-1");
expect(dup).toHaveTextContent(/open/i);
```

---

# S3 tasks

## T-15 — Remove the dead dynamic import in the matcher runner (S3)

**Why.** A `await import(…)` is left in `src/server/matching/run.ts` from a refactor (same shape as round-1 SYS-BUG-07); it adds startup latency and makes the call graph harder to follow.

**Where.** `src/server/matching/run.ts` (the dynamic import line)

### Subtasks

- T-15.1 In `src/server/matching/run.ts`, replace the `await import(…)` with a static `import { … } from "…"` at the top of the file.
- T-15.2 Add `tests/lint/no-dynamic-imports.test.ts` (new) that greps `src/server/**/*.ts` for `await import\(` and fails if any are found.
- T-15.3 Run `npx vitest run tests/lint/no-dynamic-imports.test.ts` and confirm it passes.

**Done when**
- No `await import(` survives in `src/server/`.
- The new test passes.

---

## T-16 — Collapse the API-022 list path to one query (S3)

**Why.** The list path runs one `count(*)` + one cursor query + one `WHERE id = ANY(...)` for each candidate-batch preview. With 64 districts, every dashboard refresh issues dozens of round-trips.

**Where.**
- `src/app/api/cases/route.ts:57-60` (GET handler)
- `src/server/case/list.ts` (`listOfficerCases`)

### Subtasks

- T-16.1 In `src/server/case/list.ts`, replace the cursor + preview round-trips with a single CTE that returns the cursor and the preview in one SELECT.
- T-16.2 In `tests/api/case-list.test.ts`, spy on `pool.query` and assert exactly one SELECT runs for the page (plus one COUNT).
- T-16.3 Verify the response shape is unchanged against `caseListResponseSchema`.

**Done when**
- The test spy records exactly one SELECT.
- The contract test still passes.
- `npx tsc --noEmit` clean.

---

## T-17 — Tighten the `reservePaidCall` pre-check to a `FOR UPDATE` lock (S3, defense-in-depth)

**Why.** The pre-check is intentionally unlocked (the SQL `reserve_ai_call` is the source of truth), but a `FOR UPDATE` on the draft row would make the design intent clearer and reduce the SQL function's responsibility.

**Where.** `src/server/spend/service.ts:118-139`

### Subtasks

- T-17.1 In `src/server/spend/service.ts`, change the pre-check to a `SELECT … FOR UPDATE` on `intake_drafts WHERE id = $1`.
- T-17.2 Confirm the SQL `reserve_ai_call` still works (the lock order is the same: budget first, then draft).
- T-17.3 In `tests/db/spend.test.ts`, add a `it("refuses a parallel reservePaidCall on the same draftId")` that fires two concurrent calls and asserts one wins, one fails with `E-023 stale.revision`.

**Done when**
- The pre-check is `FOR UPDATE`.
- The concurrent test passes deterministically.
- The existing `tests/db/spend.test.ts` (20 tests) all pass.

---

## T-18 — Forward the request-scoped logger into `runPaidCall` (S3)

**Why.** The orchestrator wraps its inner call with a no-op logger, dropping `spend.commit_uncertain` and `paid.timeout` events. On-call loses visibility during AI-budget incidents.

**Where.** `src/server/intake/orchestrator.ts:198` and `:260`

### Subtasks

- T-18.1 In `src/server/intake/orchestrator.ts`, replace the no-op logger on lines 198 and 260 with `ctx.logger ?? createLogger()`.
- T-18.2 In `tests/intake/orchestrator.test.ts`, assert that a `spend.commit_uncertain` event is logged when the inner call surfaces the appropriate error.
- T-18.3 In `src/server/spend/paid-call.ts:120` (the `runPaidCall` call), confirm the logger is the orchestrator-passed logger (no separate re-wrapping).

**Done when**
- A `spend.commit_uncertain` event is observed in the test.
- The existing intake tests still pass.

**Test target** (assertion shape):
```ts
expect(events.some(e => (e as any).event === "spend.commit_uncertain")).toBe(true);
```

---

## T-19 — Stop the voice-recorder track if `visibilitychange` fires pre-`getUserMedia` (S3)

**Why.** `drop()` bails out when the session ref is null, but `start()` writes the promise synchronously and `getUserMedia` resolves later. If `visibilitychange` fires in between, the recorder stays open.

**Where.** `src/app/(parent)/intake/voice-recorder.tsx:81-153`

### Subtasks

- T-19.1 In `src/app/(parent)/intake/voice-recorder.tsx`, introduce a `cancelled` flag in the session closure and re-check it after every `await`.
- T-19.2 In the `getUserMedia` resolve path, if `cancelled === true`, stop all tracks and release the session.
- T-19.3 On the React side, always call `session.current?.cancel()` (or its replacement) on `visibilitychange` — the session can no-op safely if no session is alive.
- T-19.4 In `tests/intake/voice-recorder.test.tsx`, fire a synthetic `visibilitychange` before `getUserMedia` resolves and assert the track is stopped.

**Done when**
- The test asserts `stop` was called.
- The existing `tests/intake/voice-recorder.test.tsx` tests still pass.

---

## T-20 — Suppress per-keystroke validation on the `event.at` time input (S3)

**Why.** The `event.at` time input validates every keystroke and shows `aria-invalid="true"` mid-type. Parents see "Invalid time" for a partial input.

**Where.** `src/app/(parent)/intake/review/review-fields.tsx:181-208`

### Subtasks

- T-20.1 In `src/app/(parent)/intake/review/review-fields.tsx`, split the typed value (`typed`) from the serialised value (`value`).
- T-20.2 Only commit to `onEdit` when the typed value matches `/^(\d{1,2}:)?\d{0,2}$/` or on blur.
- T-20.3 Add a `placeholder="HH:mm"` to the time input.
- T-20.4 In `tests/intake/review-fields.test.tsx`, type `1:3` and assert no `aria-invalid="true"`; type `1:3:99` and assert the error appears.

**Done when**
- The test passes.
- A parent typing `১০:৩০` sees no error until blur or until the value is fully formed.
- `npx tsc --noEmit` clean.

---

## T-21 — Add an `aria-label` to the `LanguageToggle` (S3, a11y)

**Why.** The toggle has no `aria-label`; the accessible name is the target language's name. A screen-reader user cannot tell which is current.

**Where.** `src/app/components/language-toggle.tsx:24-44`

### Subtasks

- T-21.1 In `src/app/components/language-toggle.tsx`, add `aria-label={\`\${t.languageToggleAction.replace("{lang}", languageNames[option])}\${option === locale ? \` (\${t.languageToggleCurrent})\` : ""}\`}`.
- T-21.2 Add the translation keys `languageToggleAction` and `languageToggleCurrent` to `src/lib/i18n/locales/bn.ts` and `en.ts`.
- T-21.3 In `tests/a11y/language-toggle.test.tsx`, assert `aria-label` includes `(current)` on the active button.
- T-21.4 Run `npm run check:axe` (or a Playwright + axe scan on `/`) and confirm zero violations on the toggle group.

**Done when**
- The new test passes.
- The axe scan is clean.

---

# Cross-cutting concerns

A few items are not specific to a single task but must be done as part of any
PR that ships from this document.

## CC-1 — Update the system integration test plan

After each task lands, update `docs/execution/SYSTEM_INTEGRATION_TEST_PLAN.md`
to add a regression test (or extend an existing scenario) that exercises the
fix. The scenarios most affected are:

- SYS-02 (intake path) — T-01, T-18, T-19, T-20
- SYS-04 (officer drill-through) — T-05, T-12, T-13, T-14
- SYS-06 (matcher) — T-02, T-03, T-04, T-11
- SYS-08 (audit trail) — T-07, T-09, T-12
- SYS-12 (admin redaction) — T-08 (this is the post-S1 task — T-08 in
  BUG_SOLVING2 is the S2 *followup*, the S1 item D3-06 is in BUG_SOLVING1)

## CC-2 — Add a `db:migrate-allow` step

Tasks T-05, T-06, T-07, T-09, T-10, T-11 modify `db/schema_v2.sql`. The
test runner uses `scripts/db/reset.mjs` to drop and recreate the schema, so
the new DDL is in place for every test run. **But** a production deploy also
needs an `ALTER TABLE` migration. Add a `scripts/db/migrations/` directory
with a numbered file per task (e.g. `001_cases_district_anonymous_id_idx.sql`)
and a `scripts/db/migrate.mjs` that applies them in order, tracking the
applied set in a `db_migrations` table.

## CC-3 — Verify on every level after each task

The acceptance criterion in every "Done when" block lists the levels. The
short version is:

- **L1** — `npm run test:unit` (3982 tests) green.
- **L2** — `npm run test:db` (30 files) green.
- **L3** — `npm run typecheck` and `npm run lint` clean.
- **L4** — `npm run smoke` (or the equivalent) clean.

If a task changes a DDL file, **the L2 test suite must be re-run**, not just
L1, because `tests/db/reset.mjs` re-applies the schema on every test file.

---

# Acceptance criteria for closing BUG_SOLVING2.md

A reviewer should be able to take each numbered task and:

1. Reproduce the failure mode described in the **Why** paragraph.
2. Write a failing test (or extend the test target listed) that demonstrates
   the bug.
3. Apply the fix per the **Subtasks**.
4. Confirm the test passes.
5. Re-run the L1 unit suite, the L2 DB suite, `tsc --noEmit`, and `npm run lint` — all four must remain green.
6. (For DDL-changing tasks) Re-run `scripts/db/reset.mjs` on a fresh database
   and confirm the schema applies cleanly.

## Suggested PR structure

A clean way to ship the 21 tasks is two PRs:

1. **`fix/round3-s2-tasks`** (T-01, T-02, T-03, T-04, T-05, T-06, T-07, T-08, T-09, T-10, T-11, T-12, T-13, T-14) — all 14 S2 items in one PR. The DDL changes (T-05, T-06, T-07, T-09, T-10, T-11) ship together; the application changes ship together; the migration files (CC-2) land with the DDL.
2. **`fix/round3-s3-tasks`** (T-15, T-16, T-17, T-18, T-19, T-20, T-21) — the 7 S3 housekeeping items. Lower risk; can be split or batched freely.

The S1 PR (BUG_SOLVING1) should land first, then S2, then S3. Each PR gets the same review template (Bug → Fix → Test → Acceptance) and the same merge flow into `pre-main`.

## Status template

When a task closes, append a line to the table below:

```md
| T-01 | 2026-10-20 | merged | fix/round3-s2-tasks#1 |
| T-02 | ... | ... | ... |
```

This doc is the source of truth for the round 3 S2/S3 backlog; once all 21
tasks are closed, the doc is archived alongside `BUG_SOLVING1.md`.

## Execution status — 2026-10-19

Results below describe the current unmerged worktree. The unit and static checks
passed, but L2 PostgreSQL verification is still outstanding because this
environment has no local PG16 + pgvector service.

| Task | Result |
|------|--------|
| T-01 | Implemented; submit/replay output coverage added. |
| T-02 | Implemented; closed/redacted reruns are guarded. |
| T-03 | Implemented; row-level integrity failures no longer poison the batch. |
| T-04 | Implemented; audit inserts are batched. |
| T-05 | Implemented; index and plan regression added. |
| T-06 | Implemented; null-safe uniqueness and endpoint checks added. |
| T-07 | Secondary indexes implemented; partitioning deferred pending measured volume. |
| T-08 | Implemented; redaction actor and anonymisation guards added. |
| T-09 | Implemented; enum plus action-drift check added. |
| T-10 | Partly implemented; sweep function, valid expiry indexes, CLI and DB regression added. The proposed `now()` partial indexes are invalid PostgreSQL, and deployment scheduling remains open. |
| T-11 | Existing lifecycle check verified; DB regression added, no redundant constraint added. |
| T-12 | Implemented; synthetic marker is returned and displayed. |
| T-13 | Implemented; reload restores the note and success clears it. |
| T-14 | Implemented; duplicate shape, links and status rendering updated. |
| T-15 | Implemented; removed the dead matcher import and added a targeted regression. Other dynamic imports remain because they are valid lazy/cycle-breaking imports. |
| T-16 | Implemented; case list data is returned by one CTE query. The old “1 + 50 + 50” estimate was not accurate for this service. |
| T-17 | Reviewed and declined: an extra draft `FOR UPDATE` before the SQL reservation can invert the budget-lock → draft-lock order. The existing atomic reservation and revision check remain authoritative. |
| T-18 | Implemented; request logger is forwarded and tested. |
| T-19 | Existing late-stream cleanup verified; regression added for the pre-permission visibility change. |
| T-20 | Existing partial-time behavior verified; regression added for the typing state. |
| T-21 | Implemented; current-language accessible labels and component regression added. |

`npm run check` passed on 2026-10-19: 3995 tests passed, 322 skipped, lint
exited 0 with 72 warnings, typecheck passed, and audit-action drift validation
passed. The L2 suite was attempted but could not connect to `127.0.0.1:54322`;
Docker has no running daemon and the available PostgreSQL 18 installation has
no pgvector extension. The migration runner was not pointed at any database.
No PR was opened. Contract changes remain subject to the all-owner review in
`AGENTS.md` before merge.
