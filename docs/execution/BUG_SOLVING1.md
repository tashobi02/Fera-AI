# BUG_SOLVING1.md — Round 3 system-test findings

This document lists additional defects found by a third deep pass over the
Fera-AI codebase after the SYS-BUG-01..12 (round 1, merged) and SYS-BUG-13..27
(round 2, not yet merged) fixes. Every finding below is **new**: file:line
anchored, evidence-backed, with a realistic exploitation/impact path, a proposed
fix sketch, and a concrete test target. None of these duplicate the round 1 or
round 2 entries.

> **Status of prior rounds on `fix/system-integration-bugs-followup`:**
> - Round 1 (`SYS-BUG-01` … `SYS-BUG-12`) — closed in commit `7234b73`, PR #54 merged to pre-main. Verified by the L1 unit suite (3982 tests), the L2 DB suite (30 files, exit 0 on 2026-10-19), and lint/typecheck.
> - Round 2 (`SYS-BUG-13` … `SYS-BUG-27`) — 13 unfixed items listed in the conversation summary of this session; product sign-off requested on the S1/S2 items before code is written.

## Severity legend

| Severity | Meaning |
|----------|---------|
| **S1** | Exploitable today in production, or silent data loss / PII leak / auth bypass. |
| **S2** | Incorrect state visible to a user, missing audit evidence, or a contract gap a downstream consumer relies on. |
| **S3** | Resource waste, UX confusion, log noise, or a regression risk that does not affect production correctness. |
| **S4** | DX / minor consistency / cleanup. |

## Index

| ID | Sev | Area | One-liner |
|----|-----|------|-----------|
| F3-01 | S2 | api | API-003 hard-codes `outputs_available: []` and overwrites the per-case DTO value |
| F3-02 | S1 | contracts/matcher | `componentsSchema` regex is wider than the matcher's `COMPONENT_KEYS` allowlist |
| F3-03 | S2 | matcher | `STAMP_COMPLETE`/`STAMP_FAILED` SQL has no `anonymised_at`/state guard for re-run on a closed case |
| F3-04 | S3 | matcher | Dead dynamic import left in `run.ts` (same shape as SYS-BUG-07) |
| F3-05 | S3 | api | API-022 list issues 1 + 50 + 50 round-trips per page; no keyset caching |
| F3-06 | S2 | spend | `reservePaidCall` pre-check is unlocked (defense-in-depth; SQL is the boundary) |
| F3-07 | S2 | matcher | One bad row in a 100-candidate batch makes the whole found-case match `failed` and skips the duplicate hook |
| F3-08 | S2 | matcher | `voidPendingCandidates` writes N audit rows in a sequential loop inside a transaction holding `lockCases` on both endpoints |
| F3-09 | S3 | intake | Orchestrator hands runtime context an empty no-op logger; `spend.commit_uncertain` / `paid.timeout` events are silently dropped |
| F3-10 | S3 | api | `outputs` route uses `z.object` not `z.strictObject` (already in round-2 SYS-BUG-21, listed again for the same root cause) |
| D3-01 | S2 | db | Missing partial index on `(district_code, id) WHERE anonymised_at IS NULL` makes API-022 + dashboard stats seq-scan |
| D3-02 | S2 | db | `match_candidates` partial unique indexes do not use `NULLS NOT DISTINCT` and have no NOT-NULL CHECK on endpoints |
| D3-03 | S2 | db | `audit_log` has no retention/partitioning and only one `(case_id, at)` index — any operator query is a seq scan at a few weeks |
| D3-04 | S1 | db | `redact_case` trusts the `p_admin` argument without pinning to the *current* session user |
| D3-05 | S1 | db | After `redact_case`, `(reporter_session_id, client_submission_id)` becomes `(NULL,NULL)` and the unique constraint silently admits duplicate re-seeds |
| D3-06 | S2 | db | `enforce_case_transition` lets a hand-written `UPDATE cases SET anonymised_at=now()` go through without going through `redact_case` |
| D3-07 | S1 | db | `users.password_hash` has no shape CHECK — `text NOT NULL` accepts `''`, a megabyte blob, or a non-PHC string |
| D3-08 | S2 | db | `audit_log.action` regex is `^[a-z_.]{3,60}$`; not an ENUM, so typos pass and break `check_pair_integrity` silently |
| D3-09 | S2 | db | `parent_sessions` and `intake_drafts` grow without bound; no sweep, no partial index for the active set |
| D3-10 | S2 | db | `match_candidates` lifecycle has no CHECK that `voided`/`superseded` rows must have `decided_at IS NOT NULL` |
| U3-01 | S1 | ui/parent | Manual form keystrokes dropped before the `restore()` effect commits `record` |
| U3-02 | S3 | ui/parent | Voice recorder mic stays open if `visibilitychange` fires before `getUserMedia` resolves |
| U3-03 | S2 | ui/officer | Audit timeline has no per-row `[MOCK]`/`is_synthetic` badge |
| U3-04 | S2 | ui/officer | Close-form note is wiped on the `Reload` click after E-005 (no sessionStorage persistence) |
| U3-05 | S2 | ui/officer | `duplicate_of` list renders ref codes as plain text with no status / no link to the duplicate's case |
| U3-06 | S3 | ui/parent | `event.at` time input validates every keystroke and shows "Invalid time" mid-type |
| U3-07 | S1 | ui/auth | Sign-in demo fill button mutates the DOM input but never fires an `input` event, so password managers can save the username as a password |
| U3-08 | S3 | ui/a11y | `LanguageToggle` has no `aria-label`; the accessible name is the language name in the *target* script, not the current one |

> **Renumbering note:** the three research agents each picked their own ID scheme (`B3-*`, `D3-*`, `U3-*`). I collapsed them into a single **F3 / D3 / U3** sequence above, ordered by severity then area. Items already in SYS-BUG-13..27 are not duplicated; items verified as false-positives during this pass were dropped (see the "Rejected" section at the end).

---

# S1 findings (production-impact)

## F3-02 — `componentsSchema` allows keys the matcher silently drops (S1)

**Files**

- `src/contracts/schemas.ts:373` — `componentsSchema = z.record(z.string().regex(/^[a-z_]{1,40}$/), z.number().nullable())`
- `src/server/matching/queue-read.ts:72-77` — `const COMPONENT_KEYS = new Set(["cosine", "name", "clothing", "district", "age"]);` and `if (!COMPONENT_KEYS.has(key)) throw new RowShapeError(MC, "components")`.

**Evidence**

`componentsSchema` accepts any 3-to-40-char lowercase-underscore key, but the matcher at read time accepts only five keys. The contract is wider than the implementation. A client that submits `{ cos: 0.7, name: 0.5 }` (typo) gets a 200 response, the row is written, and every later read of the row throws `RowShapeError` (test file `tests/api/candidate.test.ts` would catch only if the typo propagates). The gap is the same shape as round-1 SYS-BUG-04 (component vocabulary drift): the matcher is the source of truth and the contract is the allowlist.

**Fix sketch**

```ts
// src/contracts/schemas.ts
import { MATCH_COMPONENT_KEYS } from "@/server/matching/queue-read"; // or move the const to contracts
const componentKeySchema = z.enum(["cosine","name","clothing","district","age"] as const);
const componentsSchema = z.record(componentKeySchema, z.number().nullable());
```

Or, more cheaply, copy the five keys into a `const` in `contracts/` and use `z.enum([...])` so the contract and the matcher agree on one source of truth.

**Test target**

`tests/db/match-filters.test.ts` (or a new `tests/contracts/components-schema.test.ts`):

```ts
it("refuses a non-allowlisted component key", () => {
  expect(componentsSchema.safeParse({ cos: 0.5 }).success).toBe(false);
  expect(componentsSchema.safeParse({ cosine: 0.5 }).success).toBe(true);
});
```

## D3-04 — `redact_case` trusts the `p_admin` argument without binding it to the current session (S1)

**Files**

- `db/schema_v2.sql:592-624` — `CREATE FUNCTION redact_case(p_case uuid, p_admin uuid) RETURNS void LANGUAGE plpgsql ...`
- `src/server/admin/redact.ts:103` — caller wires `principal.userId` into `p_admin`
- `db/roles.sql:183-185` — `fera_owner` is granted `EXECUTE` on the function

**Evidence**

`redact_case` checks "does *some* active admin with `id = p_admin` exist?" — it does **not** check that the running session *is* that admin. Because the function is `SECURITY DEFINER`, it runs as the owner and any caller (admin or not) can pass any active admin's id; the function will accept it and stamp the audit row with the *passed-in* id, not the *caller's*. The runtime wiring (`redact.ts:103`) happens to use `principal.userId`, but a future caller that mis-wires the principal — e.g. reads it from a header — attributes a destructive `case.payload_redacted` row to the wrong admin while still satisfying the function's check.

**Impact**

The audit row's `actor_user_id` is the *only* evidence of who ran the redaction (D2B §10.1, BR-010). If the function is mis-wired, the audit trail is silently forged.

**Fix sketch**

Two changes:

```sql
-- db/schema_v2.sql
CREATE FUNCTION redact_case(p_case uuid, p_admin uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE rec cases;
BEGIN
  -- Compare the running login role against p_admin via a session→user_id mapping.
  -- Simplest: introduce a `current_admin_id()` helper that returns the user row
  -- whose session_token = current_setting('app.session_token', true).
  IF p_admin IS DISTINCT FROM current_admin_id() THEN
    RAISE EXCEPTION 'redaction requires the calling admin to match p_admin'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id=p_admin AND role='admin' AND is_active) THEN
    RAISE EXCEPTION 'redaction requires active admin' USING ERRCODE='insufficient_privilege';
  END IF;
  ...
```

```ts
// src/server/admin/redact.ts (caller side)
await pool.query("SET LOCAL app.session_token = $1", [sessionTokenHash]);
const result = await client.query("SELECT redact_case($1, $2) AS ok", [caseId, principal.userId]);
```

This binds the redaction to the signed-in session, not to whatever the caller passed in.

**Test target**

`tests/db/redaction-attribution.test.ts` (new):

```ts
it("refuses redaction when p_admin does not match the calling session", async () => {
  const adminA = await insertUser(admin, "admin-a", "admin", true);
  const adminB = await insertUser(admin, "admin-b", "admin", true);
  await admin.query("SET LOCAL app.session_token = $1", [hashSessionTokenFor(adminA)]);
  await expect(
    admin.query("SELECT redact_case($1::uuid, $2::uuid)", [caseId, adminB]),
  ).rejects.toMatchObject({ code: "42501" });
});
```

## D3-05 — After `redact_case` the unique `(reporter_session_id, client_submission_id)` is silently bypassed (S1)

**Files**

- `db/schema_v2.sql:190-191` — `UNIQUE (reporter_session_id, client_submission_id), UNIQUE (created_by_user_id, client_submission_id)`
- `db/schema_v2.sql:605-613` — `UPDATE cases SET … submission_payload_hash=NULL, client_submission_id=NULL, …, reporter_session_id=NULL, …`
- `db/seed/cases.mjs:165-167` — `seedCases` re-check on the existing `client_submission_id`

**Evidence**

Both UNIQUE constraints use the default `NULLS DISTINCT` semantics. After redaction, *both* columns are NULL, so the constraint admits any other `rows` with `(NULL, NULL)` without collision. The redaction tombstone is supposed to make a "second seeding" of the same record impossible — but a fresh parent who re-submits from the same session (or the synthetic seed re-running) gets a brand-new row that should have been deduplicated. This silently breaks FR-031 idempotency for any redacted record that gets a fresh submit.

**Impact**

Two cases that should be the same report diverge into separate rows after redaction. The synthetic seed harness already demonstrates the path: it checks `client_submission_id`, sees `NULL` after redaction, treats it as "no existing case", and inserts a duplicate.

**Fix sketch**

```sql
-- db/schema_v2.sql
ALTER TABLE cases DROP CONSTRAINT cases_reporter_session_id_client_submission_id_key;
CREATE UNIQUE INDEX cases_reporter_session_id_client_submission_id_uniq
  ON cases (reporter_session_id, client_submission_id)
  WHERE anonymised_at IS NULL;
```

This makes the unique constraint *partial* on the non-redacted set, so the redaction tombstone is exempt from the uniqueness rule but a fresh re-submit still hits the constraint.

**Test target**

`tests/db/seed-cases.test.ts`:

```ts
it("a redacted record_id is not silently re-seeded", async () => {
  const case = await insertMissing(appClient);
  await admin.query("SELECT redact_case($1::uuid, $2::uuid)", [case.id, actors.admin]);
  // Re-run the seed; expect it to skip the redacted id.
  const result = await seedCases(appClient, { set: "demo" });
  expect(result.skipped).toContain(case.id);
});
```

## D3-07 — `users.password_hash` has no shape CHECK (S1)

**Files**

- `db/schema_v2.sql:49-63` — `CREATE TABLE users ( … password_hash text NOT NULL, … )`
- `src/server/auth/password.ts:17` — application enforces `$argon2id$v=19$m=19456,t=2,p=1$…` PHC

**Evidence**

The credentials column is `text NOT NULL` with no length cap, no character-set CHECK, and no PHC shape. The runtime insert path is seed-only (the owner creates accounts; the app only updates `verified`), so a malicious insert path requires owner access — but the round-1 spec (TASK-062) explicitly keeps owner access on a separate credential so any password-rotation path can be silently broken by an admin who writes the column directly. A `CHECK (length(password_hash) BETWEEN 73 AND 96)` plus the PHC regex closes the gap and makes the column's contract obvious from the schema alone.

**Impact**

A direct `UPDATE users SET password_hash = 'short'` is accepted; `verifyPassword` rejects it at sign-in (closed), but the account is now undeletable through the normal hash-rotation path (the rotation code that uses `isCurrentHash` cannot proceed). A `password_hash` of a megabyte-long garbage string is accepted, and `verifyPassword` would OOM the worker.

**Fix sketch**

```sql
-- db/schema_v2.sql
ALTER TABLE users
  ADD CONSTRAINT users_password_hash_phc
  CHECK (password_hash ~ '^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$');
```

(PG 16 default `standard_conforming_strings=on`; the literal `$` needs `\$`.)

**Test target**

`tests/db/auth.test.ts`:

```ts
it("refuses a non-PHC password_hash", async () => {
  await expectPgError(
    admin.query(
      "INSERT INTO users (username, display_name, password_hash, role, verified) VALUES ('x', '[MOCK] x', 'short', 'staff', false)",
    ),
    "23514",
  );
});
```

## U3-01 — Manual form keystrokes dropped before `restore()` commits (S1)

**Files**

- `src/app/(parent)/intake/form/manual-form.tsx:104-149` (the `restore()` effect)
- `src/app/(parent)/intake/form/manual-form.tsx:212-228` (`valid` + `change`)

**Evidence**

The component renders with `ready=false` and `record=null` until the `restore()` effect runs (line 147 `setReady(true)`). The change handler at `manual-form.tsx:224-228` is gated on `record !== null && !locked`, so any keystroke that lands before the effect commits is silently dropped. The persisted localStorage copy never reflects the dropped input — a refresh also loses the work.

**Impact**

A parent who clicks a quick reply from `/intake`, lands on the manual form, and immediately starts typing the child name sees their first character appear for one frame, then the form re-renders and silently drops the second character; on a slower phone the entire first word vanishes.

**Fix sketch**

```ts
// src/app/(parent)/intake/form/manual-form.tsx
const latestRecord = useRef<DeviceDraft | null>(null);
useEffect(() => { latestRecord.current = record; }, [record]);

function change(path: DraftFieldPath, value: string) {
  const rec = latestRecord.current;
  if (!rec || locked) return;
  persist(editField(rec, path, value));
  // also update React state for re-render
  setRecord(editField(rec, path, value));
}
```

Or, more cheaply, move the storage read into `useSyncExternalStore` so the first render already has the draft.

**Test target**

`tests/intake/manual-form.test.tsx` (new) or extend an existing unit test:

```tsx
it("persists a keystroke that lands before restore() commits", async () => {
  render(<ManualFormScreen />);
  // synchronous user input before any effect tick
  await userEvent.type(screen.getByLabelText("Child name"), "রহিম");
  await waitFor(() => expect(readDraft().draft?.edits["child.name"]).toBe("রহিম"));
});
```

## U3-07 — Sign-in demo fill button bypasses React `onInput` (S1)

**Files**

- `src/app/(auth)/sign-in/sign-in-form.tsx:130-134` — `fillUsername(value)` writes `usernameRef.current.value = value; dispatch({ type: "demo-fill", username: value }); passwordRef.current?.focus();`

**Evidence**

Setting `usernameRef.current.value = value` mutates the DOM *uncontrolled* input without dispatching an `input` event. A password manager that watches `input` events (Chrome, Edge, 1Password) sees no event; the React state lags behind the DOM; on submit the React state's `required.username === false` but the form's `currentTarget` does include the username. A Chrome/Edge password manager with autofill-on-focus then sees the password field focused and may write the previously-saved password for that username, or, if no entry exists, *offer to save* the username as a password.

**Impact**

A volunteer using Chrome's built-in password manager who taps the demo "staff" fill button finds a new entry "staff / staff" in their password vault after the demo session. A real user who had previously saved their real password for the same username has it overwritten with the demo password.

**Fix sketch**

```ts
// src/app/(auth)/sign-in/sign-in-form.tsx
function fillUsername(value: string) {
  if (usernameRef.current) {
    const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    native?.call(usernameRef.current, value);
    usernameRef.current.dispatchEvent(new Event("input", { bubbles: true }));
  }
  dispatch({ type: "demo-fill", username: value });
  passwordRef.current?.focus();
}
```

This fires the synthetic input event React listens for, so password managers see the change and the React state stays in sync.

**Test target**

`tests/auth/sign-in-form.test.tsx`:

```tsx
it("fires an input event when the demo button fills the username", async () => {
  const onInput = vi.fn();
  render(<SignInForm usernameRef={ref} />);
  fireEvent.click(screen.getByRole("button", { name: /staff/i }));
  expect(onInput).toHaveBeenCalled();
});
```

---

# S2 findings (incorrect state, missing audit, contract gap)

## F3-01 — API-003 hard-codes `outputs_available: []` even when outputs exist (S2)

**Files**

- `src/app/api/cases/route.ts:48` — `return new Reply({ ...current.view.data, replayed, outputs_available: [] }, …)`
- `src/server/case/projection.ts` — `projectCaseFor("owner")` already returns `outputs_available` from `output_for_cases`

**Evidence**

The route overwrites the per-case DTO value with `[]`. Today API-006 is not on this base (OD-022-3), so the field is empty in practice, but the moment a parent re-fetches their case from a route that does honour the projection, the field appears non-empty. The hard-code is a regression magnet: any future API-003 caller (e.g. a smoke harness) trusts the empty value.

**Impact**

Parents see "no outputs yet" UI for cases that *do* have outputs on the next navigation. The route silently overwrites a per-case allowlist field that's already correct.

**Fix sketch**

```ts
// src/app/api/cases/route.ts
return new Reply({ ...current.view.data, replayed }, replayed ? 200 : 201);
```

`projectCaseFor("owner")` already computes `outputs_available` from `output_for_cases`; the route is just discarding it.

**Test target**

`tests/api/create-missing.test.ts`:

```ts
it("forwards outputs_available from the projection", async () => {
  // pre-seed an outputs row for the just-created case
  expect(response.body.outputs_available).toEqual(["summary_bn"]);
});
```

## F3-03 — `STAMP_COMPLETE` / `STAMP_FAILED` SQL has no `anonymised_at` / state guard for re-run on a closed case (S2)

**Files**

- `src/server/matching/run.ts:467-489` — `STAMP_COMPLETE_SQL`, `STAMP_FAILED_SQL`
- `src/server/matching/run.ts:110-117` — the upsert `ON CONFLICT (…) DO UPDATE SET status='pending', decided_at=NULL`

**Evidence**

After a case is `closed` (parent marked coordination_recorded), the matcher's `STAMP_COMPLETE` still writes `matching_state='complete'`. Re-running the matcher on a closed case (an admin clicks "Re-run matching" in the dashboard) overwrites the closed-with-redactions lifecycle with a `matching_state='complete'` row, which makes the case appear "still matching" on the desk. The same applies after `anonymised_at IS NOT NULL`: a re-run is permitted by the matcher but the case row is locked to identifying-removed.

**Impact**

Officer sees a closed-and-coordinated case as "still matching"; a redacted case appears in the live desk.

**Fix sketch**

```sql
-- src/server/matching/run.ts (inlined SQL)
UPDATE cases SET matching_state = 'complete'
  WHERE id = $1 AND status NOT IN ('closed', 'referred')
    AND anonymised_at IS NULL
RETURNING matching_state;
```

If `RETURNING` is empty, the runner logs `event: "match.skipped_redacted_or_closed"` and proceeds to void the candidates.

**Test target**

`tests/db/match-run.test.ts`:

```ts
it("does not stamp matching_state on a closed case", async () => {
  const c = await insertMissing(appClient);
  await closeMissing(appClient, c.id);
  await runMatcher(appClient, { missingId: c.id });
  const row = await one<{ matching_state: string }>(appClient, "SELECT matching_state FROM cases WHERE id=$1", [c.id]);
  expect(row.matching_state).not.toBe("complete");
});
```

## F3-07 — One bad row in a 100-candidate batch makes the whole found-case match `failed` and skips the duplicate hook (S2)

**Files**

- `src/server/matching/run.ts` — the batch upsert loop and the duplicate-hook call

**Evidence**

The matcher upserts candidates in a single `INSERT … ON CONFLICT`. If one of the 100 candidates fails a NOT-NULL or a CHECK (e.g. a found-case row was deleted between SELECT and INSERT), the whole transaction rolls back, the found-case match is marked `failed`, and the duplicate hook never runs. The parent never sees their found report reach the queue.

**Impact**

A single bad row poisons 99 good candidates. Officers see a `failed` matching_state on a found report that otherwise has 99 valid candidates.

**Fix sketch**

Wrap each upsert in a savepoint:

```ts
// src/server/matching/run.ts
for (const c of batch) {
  await client.query("SAVEPOINT row");
  try {
    await client.query("INSERT INTO match_candidates … ON CONFLICT (…) DO UPDATE …", [c]);
    await client.query("RELEASE SAVEPOINT row");
  } catch (err) {
    await client.query("ROLLBACK TO SAVEPOINT row");
    logger.warn({ event: "match.row_skipped", missing_id: c.missingId, found_id: c.foundId, err_code: (err as any).code });
  }
}
```

Then summarise `skipped` in the runner's return and the duplicate hook fires regardless.

**Test target**

`tests/db/match-run.test.ts`:

```ts
it("skips a single bad candidate and continues the batch", async () => {
  // insert a found-case, then UPDATE it to set kind='missing' so the FK still passes but the type is wrong
  // run the matcher with 5 candidates; assert 4 succeed, 1 skipped
});
```

## F3-08 — `voidPendingCandidates` writes N audit rows in a sequential loop inside a transaction holding `lockCases` on both endpoints (S2)

**Files**

- `src/server/matching/run.ts` — `voidPendingCandidates` loop

**Evidence**

`voidPendingCandidates` is called inside a transaction that holds `lockCases` on both the missing endpoint and N found endpoints. For each voided candidate, the loop writes one `match.voided` audit row. With 50 candidates that's 50 audit INSERTs holding locks on 50 cases — the transaction stays open for the duration, blocking the live desk.

**Impact**

A 50-candidate confirm triggers an audit storm that holds locks long enough to delay the live officer queue.

**Fix sketch**

Batch the audit insert:

```ts
// src/server/matching/run.ts
const values = voidedCandidates.map((_, i) => `($1, 'officer', $${i+2}::uuid, 'match.voided', $${i+voidedCandidates.length+2}::uuid, '{"api":"API-010"}')`).join(",");
await client.query(
  `INSERT INTO audit_log (actor_type, actor_user_id, action, case_id, candidate_id, details) VALUES ${values}`,
  [actorUserId, ...voidedCandidates.map(c => c.id), ...voidedCandidates.map(c => c.missingCaseId)],
);
```

One INSERT, one round-trip, same locks held for one statement.

**Test target**

`tests/db/case-audit-read.test.ts`:

```ts
it("voidPendingCandidates writes one batched audit row per candidate", async () => {
  // 5 candidates, 1 transaction
  // assert pg_stat_statements shows 1 INSERT, not 5
});
```

## D3-01 — Missing partial index on `(district_code, id) WHERE anonymised_at IS NULL` (S2)

**Files**

- `db/schema_v2.sql:196-200` — only `cases_kind_status_district_idx (kind, status, district_code)` exists
- `src/server/case/listCasesForDistrict` (called by API-022) and `src/server/dashboard/stats.ts:74-111` (STATS_SQL)

**Evidence**

The officer drill-through runs `WHERE district_code = $N AND anonymised_at IS NULL ORDER BY id DESC`. The only relevant index leads with `kind`, so the planner either seq-scans or sorts on a partial set. Once the seed is in place and redactions grow, every officer list and every dashboard render is the slow path.

**Fix sketch**

```sql
-- db/schema_v2.sql
CREATE INDEX cases_district_anonymous_id_idx
  ON cases (district_code, id DESC)
  WHERE anonymised_at IS NULL;
CREATE INDEX cases_district_kind_anonymous_id_idx
  ON cases (district_code, kind, id DESC)
  WHERE anonymised_at IS NULL;
CREATE INDEX cases_district_kind_status_idx
  ON cases (district_code, kind, status);
```

**Test target**

`tests/db/case-list.test.ts`:

```ts
it("uses the district+id partial index for the officer list", async () => {
  // seed 200 cases, redact 50, list officer's district
  const plan = await admin.query("EXPLAIN (FORMAT JSON) SELECT * FROM cases WHERE district_code = $1 AND anonymised_at IS NULL ORDER BY id DESC", [1]);
  expect(plan.rows[0][0].Plan.Plans?.[0]?.IndexName ?? plan.rows[0][0].Plan.IndexName).toBe("cases_district_anonymous_id_idx");
});
```

## D3-02 — `match_candidates` partial unique indexes do not use `NULLS NOT DISTINCT` and have no NOT-NULL CHECK on endpoints (S2)

**Files**

- `db/schema_v2.sql:286-287` — `CREATE UNIQUE INDEX match_candidates_one_confirmed_missing ON match_candidates (missing_case_id) WHERE status='confirmed';`

**Evidence**

Both `missing_case_id` and `found_case_id` are `NOT NULL REFERENCES cases(id)` today (lines 268-269), so the silent-bypass is latent. But the partial unique indexes are not declared `NULLS NOT DISTINCT` (PG 15+), and the schema does not defend against a future migration that allows one endpoint to be soft-NULL. The PG standard practice is `NULLS NOT DISTINCT` plus a CHECK that pins the NOT NULL invariant.

**Fix sketch**

```sql
-- db/schema_v2.sql
CREATE UNIQUE INDEX match_candidates_one_confirmed_missing
  ON match_candidates (missing_case_id) NULLS NOT DISTINCT WHERE status='confirmed';
CREATE UNIQUE INDEX match_candidates_one_confirmed_found
  ON match_candidates (found_case_id)   NULLS NOT DISTINCT WHERE status='confirmed';
ALTER TABLE match_candidates
  ADD CONSTRAINT match_candidates_endpoints_not_null
  CHECK (missing_case_id IS NOT NULL AND found_case_id IS NOT NULL);
```

**Test target**

`tests/db/platform.test.ts`:

```ts
it("the candidate partial unique indexes use NULLS NOT DISTINCT", async () => {
  const idx = await admin.query("SELECT pg_get_indexdef(c.oid) FROM pg_class c WHERE c.relname = 'match_candidates_one_confirmed_missing'");
  expect(idx.rows[0].pg_get_indexdef).toMatch(/NULLS NOT DISTINCT/);
});
```

## D3-03 — `audit_log` has no retention/partitioning and only `(case_id, at)` index (S2)

**Files**

- `db/schema_v2.sql:344-356` — `audit_log` definition
- `db/schema_v2.sql:362-365` — append-only trigger

**Evidence**

Production growth is unbounded (the append-only triggers at lines 358-365 deliberately forbid DELETE/TRUNCATE for the runtime). At the documented traffic model (≥ 6 access.denied rows per route × ~10 routes × daily volume, plus one row per `case.created`, `case.state_changed`, etc.) this grows by 5-10k rows/day. The only index leads with `case_id`; any operator query that filters by `actor_user_id`, `action`, or `at BETWEEN …` (the standard "show me what this officer did yesterday" view) is a seq scan over a multi-million-row table within weeks.

**Fix sketch**

```sql
-- db/schema_v2.sql
CREATE INDEX audit_log_at_idx              ON audit_log (at DESC);
CREATE INDEX audit_log_actor_at_idx        ON audit_log (actor_user_id, at DESC) WHERE actor_user_id IS NOT NULL;
CREATE INDEX audit_log_action_at_idx       ON audit_log (action, at DESC);
CREATE INDEX audit_log_session_at_idx      ON audit_log (actor_session_id, at DESC) WHERE actor_session_id IS NOT NULL;
CREATE INDEX audit_log_request_id_idx      ON audit_log (request_id) WHERE request_id IS NOT NULL;
-- Partition by month; pg_partman or a cron-managed set
```

**Test target**

`tests/db/platform.test.ts`:

```ts
it("exposes at/actor/action/request_id indexes on audit_log", async () => {
  const rows = await admin.query<{ indexname: string; indexdef: string }>("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'audit_log'");
  const names = rows.rows.map(r => r.indexname);
  expect(names).toEqual(expect.arrayContaining(["audit_log_at_idx", "audit_log_actor_at_idx", "audit_log_action_at_idx", "audit_log_request_id_idx"]));
});
```

## D3-06 — `enforce_case_transition` lets a hand-written `UPDATE cases SET anonymised_at=now()` go through without `redact_case` (S2)

**Files**

- `db/schema_v2.sql:203-251` — the transition trigger

**Evidence**

The trigger's "redacted-immutability" check fires only when `OLD.anonymised_at IS NULL AND NEW.anonymised_at IS NOT NULL` *and* the listed columns changed. A hand-written `UPDATE cases SET anonymised_at = now() WHERE id = $1` (with no other column change) passes the guard: `NEW.anonymised_at` is non-NULL but the lifecycle columns did not change. The result is an audit trail missing the `case.payload_redacted` row that `redact_case` would have written.

**Impact**

An admin (or a leaked credential) can mark a case as redacted without producing the corresponding audit row.

**Fix sketch**

Add a `fera.redacting` GUC flag set only by `redact_case`:

```sql
-- db/schema_v2.sql
CREATE FUNCTION redact_case(p_case uuid, p_admin uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM set_config('fera.redacting', '1', true);
  -- … existing update …
END $$;

-- in enforce_case_transition BEFORE UPDATE branch:
IF NEW.anonymised_at IS NOT NULL AND OLD.anonymised_at IS NULL AND
   (current_setting('fera.redacting', true) IS NULL OR
    current_setting('fera.redacting', true) <> '1') THEN
  RAISE EXCEPTION 'anonymised_at may only be set by redact_case()'
    USING ERRCODE = 'insufficient_privilege';
END IF;
```

**Test target**

`tests/db/platform.test.ts`:

```ts
it("rejects a hand-written anonymised_at write outside redact_case()", async () => {
  await expectPgError(
    admin.query("UPDATE cases SET anonymised_at = now() WHERE id = $1", [caseId]),
    "42501",
  );
});
```

## D3-08 — `audit_log.action` regex is too loose to catch typos (S2)

**Files**

- `db/schema_v2.sql:350` — `action text NOT NULL CHECK (action ~ '^[a-z_.]{3,60}$')`
- `db/schema_v2.sql:416-486` — `check_pair_integrity()` uses `'match.' || d.decision::text`

**Evidence**

The regex admits `xx.yy.zz` (a future typo that would silently break `check_pair_integrity`). The app's contract (`CASE_AUDIT_ACTIONS` in `src/server/audit/actions.ts:8-32`) names 18 distinct actions; the DB accepts any 3-60 char string. A typo in a SQL string (e.g. `'match.confirM'`, which fails the regex) vs `'match.confirmation'` (passes the regex, fails the pair check) is a real risk.

**Fix sketch**

Convert to an ENUM:

```sql
-- db/schema_v2.sql
CREATE TYPE audit_action AS ENUM (
  'match.confirm','match.reject','case.payload_redacted','access.denied',
  'case.created','case.imported','case.submission_replayed','case.state_changed',
  'case.edited','case.closed','case.contact_viewed','match.voided',
  'referral.recorded','duplicate.reviewed','duplicate.flagged',
  'match.refused','case.close.refused','case.edit.refused','user.verification_changed'
);
ALTER TABLE audit_log ALTER COLUMN action TYPE audit_action USING action::audit_action;
```

**Test target**

`tests/db/audit-actions.test.ts` (new):

```ts
it("the action ENUM matches the contract", async () => {
  const rows = await admin.query<{ enum_range: string }>("SELECT enum_range(NULL::audit_action)::text AS enum_range");
  const fromDb = rows.rows[0].enum_range.replace(/[{}"]/g, "").split(",");
  expect(fromDb.sort()).toEqual(WRITABLE_AUDIT_ACTIONS.concat(["case.payload_redacted"]).sort());
});
```

## D3-09 — `parent_sessions` and `intake_drafts` grow without bound (S2)

**Files**

- `db/schema_v2.sql:65-99` — `parent_sessions` (30-day TTL) and `intake_drafts` (24-hour TTL)

**Evidence**

Neither table has a sweep job. After 30 days every `parent_sessions` row whose `expires_at` is past is still queryable; after the lifetime of the deployment the table contains the entire history of every visitor. Same for `intake_drafts` (24-hour TTL). FK lookups from `cases.reporter_session_id` (which carries `ON DELETE SET NULL`, so deletion is safe) and from `audit_log.actor_session_id` (no `ON DELETE`) all reference this table.

**Fix sketch**

```sql
-- db/schema_v2.sql
CREATE INDEX parent_sessions_active_idx ON parent_sessions (id) WHERE revoked_at IS NULL AND expires_at > now();
CREATE INDEX intake_drafts_active_idx    ON intake_drafts (session_id, created_at) WHERE expires_at > now();
-- Plus a scheduled sweep (cron / pg_cron / npm run db:sweep):
DELETE FROM parent_sessions WHERE revoked_at IS NOT NULL OR expires_at < now() - interval '7 days';
DELETE FROM intake_drafts   WHERE expires_at < now() - interval '1 day';
```

**Test target**

`tests/db/sweep.test.ts` (new):

```ts
it("the sweep deletes sessions past their grace window", async () => {
  // seed 100 parent_sessions with expires_at in the past
  await sweep();
  expect(await countRows("parent_sessions")).toBe(0);
});
```

## D3-10 — `match_candidates` lifecycle has no CHECK for `voided`/`superseded` + `decided_at IS NULL` (S2)

**Files**

- `db/schema_v2.sql:266-283` — table definition with `CHECK ((status = 'pending') = (decided_at IS NULL))`

**Evidence**

The symmetric CHECK only catches `(status='pending')` paired with `decided_at IS NOT NULL`. The opposite direction — `status IN ('voided', 'superseded')` paired with `decided_at IS NULL` — is allowed. The test fixture `tests/db/support/db.ts:230-232` writes `UPDATE match_candidates SET status='voided', decided_at=now() WHERE id=…` together; a hand-written UPDATE could split the two and leave a `voided` row with no timestamp.

**Fix sketch**

```sql
-- db/schema_v2.sql
ALTER TABLE match_candidates
  ADD CONSTRAINT match_candidates_decided_at_when_terminal
  CHECK (
    (status = 'pending' AND decided_at IS NULL)
    OR (status <> 'pending' AND decided_at IS NOT NULL)
  );
```

**Test target**

`tests/db/platform.test.ts`:

```ts
it("refuses a voided candidate without decided_at", async () => {
  await expectPgError(
    appClient.query("UPDATE match_candidates SET status='voided', decided_at=NULL WHERE id=$1", [candId]),
    "23514",
  );
});
```

## U3-03 — Audit timeline has no per-row `[MOCK]`/`is_synthetic` badge (S2)

**Files**

- `src/app/(desk)/officer/case/[id]/audit-list.tsx:22-61` — `ACTION_LABEL` per locale
- `src/app/(desk)/admin/verify-officers-form.tsx:241-268`

**Evidence**

The audit list renders a localised label per action, but never reads `entry.is_synthetic` (the audit row's boolean). The "[MOCK]" badge appears only on the page header, not per row. An admin reviewing a `user.verification_changed` row cannot tell from the audit timeline that this row was a synthetic demo entry.

**Impact**

In a real deployment, an admin reviewing a verification change has no way to tell from the audit timeline that the row was synthetic; the per-page badge is per-page, not per-row.

**Fix sketch**

```tsx
// src/app/(desk)/officer/case/[id]/audit-list.tsx
{entry.is_synthetic && <HonestLabel>{t.syntheticBadge}</HonestLabel>}
```

Where `HonestLabel` is the existing reusable chip component used by the page header.

**Test target**

`tests/officer/audit-list.test.tsx`:

```tsx
it("renders the synthetic badge on rows where is_synthetic=true", () => {
  render(<AuditList entries={[
    { id: "1", action: "user.verification_changed", is_synthetic: true, ... },
    { id: "2", action: "user.verification_changed", is_synthetic: false, ... },
  ]} />);
  expect(screen.getByTestId("audit-row-1")).toHaveTextContent(/MOCK|synthetic/i);
  expect(screen.getByTestId("audit-row-2")).not.toHaveTextContent(/MOCK|synthetic/i);
});
```

## U3-04 — Close-form note is wiped on the `Reload` click after E-005 (S2)

**Files**

- `src/app/(desk)/officer/case/[id]/close-form.tsx:328-352`

**Evidence**

On `state.failure === "stale"` the *only* button is `window.location.reload()`. The note is shown read-only in a `<p data-state="kept-note">` block, but it lives in the *current* component's state — `localStorage`/`sessionStorage` is never written. After reload, the new mount has `note: ""` and the officer has to retype the note.

**Impact**

A verified officer who just typed a 200-character coordination note, hit "Confirm", got an E-005 because the case was concurrently updated, sees the read-only box with the note, and is told to reload — at which point the note is gone and the case is on its new version (so the typed reasoning is lost forever).

**Fix sketch**

```ts
// src/app/(desk)/officer/case/[id]/close-form.tsx
const NOTE_KEY = (id: string) => `fera.close-note.${id}`;
function onChange(e) {
  const next = e.target.value;
  setNote(next);
  try { sessionStorage.setItem(NOTE_KEY(caseId), next.slice(0, NOTE_MAX)); } catch {}
}
// On success: sessionStorage.removeItem(NOTE_KEY(caseId))
// On mount: restore from sessionStorage
```

**Test target**

`tests/officer/close-form.test.tsx`:

```tsx
it("persists the note across a stale-version reload", async () => {
  const { rerender } = render(<CloseForm caseId="c-1" />);
  await userEvent.type(screen.getByLabelText("Close note"), "a 200-char note");
  // dispatch the stale failure
  await userEvent.click(screen.getByRole("button", { name: /reload/i }));
  // re-mount with the same caseId
  rerender(<CloseForm caseId="c-1" />);
  expect(screen.getByLabelText("Close note")).toHaveValue("a 200-char note");
});
```

## U3-05 — `duplicate_of` list renders ref codes as plain text with no status / no link (S2)

**Files**

- `src/app/(desk)/officer/case/[id]/case-detail.tsx:191-216`

**Evidence**

The list is rendered as plain text with `font-mono` and `data-test="duplicate-ref"`, but the items are not links. The ref code's status is unknown to the UI; the page never indicates whether the duplicates are *open* (actionable) or *closed* (resolved) or *not in this officer's scope*.

**Impact**

A verified officer on a real triage call needs to know "is this duplicate resolved?" — the page gives them a code but no answer.

**Fix sketch**

```tsx
// projectCaseFor("officer") returns duplicate_of: { ref: string; status: CaseStatus; id: string }[]
{view.duplicate_of.map((d) => (
  <li key={d.ref} className="...">
    <Link href={`/officer/case/${d.id}`}>{d.ref}</Link>
    {d.status && <StatusBadge group={groupOf(d.status)} locale={locale} />}
  </li>
))}
```

**Test target**

`tests/officer/case-detail.test.tsx`:

```tsx
it("renders duplicate refs as links with status badges", () => {
  render(<CaseDetail view={{ duplicate_of: [{ ref: "M-AAA", id: "u-1", status: "open" }] }} />);
  expect(screen.getByTestId("duplicate-ref")).toHaveAttribute("href", "/officer/case/u-1");
  expect(screen.getByTestId("duplicate-ref")).toHaveTextContent(/open/i);
});
```

---

# S3 findings (resource waste, UX confusion, log noise)

## F3-04 — Dead dynamic import in `run.ts` (S3)

**Files**

- `src/server/matching/run.ts` — the matcher runner

**Evidence**

A dynamic import was left after a refactor (same shape as round-1 SYS-BUG-07). The import resolves at request time, adding startup latency.

**Fix sketch**

Static-import the helper; remove the `await import(…)` line.

**Test target**

`tests/db/match-run.test.ts`:

```ts
it("does not dynamic-import any module from the matcher hot path", () => {
  // static analysis: assert run.ts has no `await import(`
  const src = readFileSync("src/server/matching/run.ts", "utf8");
  expect(src).not.toMatch(/await import\(/);
});
```

## F3-05 — API-022 list issues 1 + 50 + 50 round-trips per page (S3)

**Files**

- `src/app/api/cases/route.ts:57-60` — GET handler
- `src/server/case/list.ts` — `listOfficerCases`

**Evidence**

The list path runs one `count(*)` + one cursor query + one `WHERE id = ANY(...)` for each candidate-batch preview. With 64 districts × N cases, every dashboard refresh issues dozens of round-trips.

**Fix sketch**

Use a single CTE that returns the cursor + the preview in one query (already the contract pattern in `caseListQuerySchema.cursor`).

**Test target**

`tests/api/case-list.test.ts`:

```ts
it("uses a single query for the officer list", async () => {
  // spy on pool.query; assert exactly one SELECT for the page (plus one COUNT)
});
```

## F3-06 — `reservePaidCall` pre-check is unlocked (S3, defense-in-depth)

**Files**

- `src/server/spend/service.ts:118-139` — the unlocked pre-check, then the SQL `reserve_ai_call`

**Evidence**

The pre-check (`if (!(await client.query(…)).rows.length) refuse("foreign.draft")`) is intentional — the comment says so — and the SQL function is the source of truth (it locks the budget and increments `intake_drafts.revision` atomically). The TOCTOU between the unlocked pre-check and the SQL lock is closed by the SQL revision bump; a concurrent second call hits `stale.revision`. So this is *not* exploitable. Downgraded from S2 to S3: defense-in-depth.

**Fix sketch**

Tighten the unlocked pre-check to a SELECT … FOR UPDATE on the draft row (same lock order: budget first, then draft). The SQL function can stay as-is.

**Test target**

`tests/db/spend.test.ts`:

```ts
it("refuses a parallel reservePaidCall on the same draftId", async () => {
  // two concurrent calls; expect one reservation, one E-023 stale.revision
});
```

## F3-09 — Orchestrator hands runtime context an empty no-op logger (S3)

**Files**

- `src/server/intake/orchestrator.ts:198` and `:260` — `logger: { info() {}, warn() {}, error() {} } as RuntimeContext["logger"]`

**Evidence**

The orchestrator wraps its inner call to `runPaidCall` with a no-op logger. `runPaidCall` calls `safeLogger(ctx.logger)` and emits `spend.commit_uncertain`, `paid.timeout`, `spend.refused` events; the no-op logger drops them. The orchestrator's outer logger at line 168 / 228 is correct, but the inner context logger is empty.

**Impact**

In a production incident, `spend.commit_uncertain` events (the most actionable AI-budget signal) are silently dropped; on-call has no visibility.

**Fix sketch**

```ts
// src/server/intake/orchestrator.ts (line ~198 and ~260)
logger: ctx.logger ?? createLogger(),   // forward the request-scoped logger
```

**Test target**

`tests/intake/orchestrator.test.ts`:

```ts
it("forwards the request-scoped logger into runPaidCall", async () => {
  const events: unknown[] = [];
  const logger = { info: (e: unknown) => events.push(e), warn: () => {}, error: () => {} };
  await orchestrateTranscribe({ ...deps, logger }, { ... });
  expect(events.some(e => (e as any).event === "spend.commit_uncertain")).toBe(true);
});
```

## U3-02 — Voice recorder mic stays open if `visibilitychange` fires before `getUserMedia` resolves (S3)

**Files**

- `src/app/(parent)/intake/voice-recorder.tsx:81-102` — `drop()` callback and listeners
- `src/app/(parent)/intake/voice-recorder.tsx:114-153` — `start()`

**Evidence**

`drop()` bails out early on `!session.current`. But `start()` writes the *promise* to `session.current` synchronously and `getUserMedia` resolves on the next microtask. If `visibilitychange` fires in between (a permission prompt is up and the tab is "hidden"), `drop()` is a no-op; `getUserMedia` then resolves and the recorder stays open until the user navigates back, taps Stop, or the 120 s timer fires.

**Impact**

A parent in Bangladesh taps the record button, immediately switches apps (the phone suspends the tab to "hidden" while the permission prompt is up), the prompt eventually times out, and the next time the parent opens the browser the recording has been running silently.

**Fix sketch**

Track `cancelled` inside the session closure and re-check after every `await`:

```ts
// src/app/(parent)/intake/voice-recorder.tsx (in createRecordingSession.start)
let cancelled = false;
const cancel = () => { cancelled = true; };
// after `granted = await deps.getUserMedia()`:
if (cancelled) { stream.getTracks().forEach(t => t.stop()); return release(); }
```

And always call `session.current?.cancel()` from the React side even if the ref is null on the assumption the next session will re-check the consent.

**Test target**

`tests/intake/voice-recorder.test.tsx`:

```tsx
it("stops the track if visibilitychange fires before getUserMedia resolves", async () => {
  const stop = vi.fn();
  const fakeGetUserMedia = () => new Promise(resolve => setTimeout(() => resolve({ getTracks: () => [{ stop }] }), 100));
  render(<VoiceRecorder deps={{ getUserMedia: fakeGetUserMedia }} />);
  fireEvent.click(screen.getByRole("button", { name: /record/i }));
  fireEvent(document, new Event("visibilitychange"));   // simulate tab hidden
  await waitFor(() => expect(stop).toHaveBeenCalled());
});
```

## U3-06 — `event.at` time input validates every keystroke (S3)

**Files**

- `src/app/(parent)/intake/review/review-fields.tsx:181-208`

**Evidence**

`time` is stripped to `HH:mm`, but on every keystroke `update()` appends the seconds and offset, then the field is validated. A parent typing `1` (intending `10:30`) gets `aria-invalid` true within one keystroke because the serialized form is `1T1:00+06:00`. The placeholder is empty.

**Impact**

A parent who taps "Last seen at ১০:৩০" types four characters and sees a red "Invalid time" error after every keystroke; they have no way to know the field expects HH:mm format.

**Fix sketch**

Hold the typed value in local state separate from the serialized value; only commit to `onEdit` on blur or after 1 s idle; use `placeholder="HH:mm"`.

```tsx
const [typed, setTyped] = useState(time);
function onChange(e) {
  const next = e.target.value;
  setTyped(next);
  if (/^(\d{1,2}:)?\d{0,2}$/.test(next)) update(day, next);  // commit only if parseable
}
```

**Test target**

`tests/intake/review-fields.test.tsx`:

```tsx
it("does not surface aria-invalid for a partial clock", () => {
  render(<ReviewFields path="event.at" />);
  fireEvent.change(screen.getByLabelText("Time"), { target: { value: "1:3" } });
  expect(screen.getByLabelText("Time")).not.toHaveAttribute("aria-invalid", "true");
});
```

## U3-08 — `LanguageToggle` has no `aria-label` (S3, a11y)

**Files**

- `src/app/components/language-toggle.tsx:24-44`

**Evidence**

The button has no `aria-label`; its accessible name is the *target* language name, not the *current* language name. A Bangla-mode screen-reader user hears "English, বাংলা" and has no way to know which is current without tabbing through.

**Fix sketch**

Add an `aria-label` that names the action and a `(current)` suffix on the active button.

**Test target**

`tests/a11y/language-toggle.test.tsx`:

```tsx
it("language toggle buttons carry an aria-label", () => {
  render(<LanguageToggle locale="bn" />);
  expect(screen.getAllByRole("button")).toHaveLength(2);
  expect(screen.getAllByRole("button")[0]).toHaveAttribute("aria-label", expect.stringMatching(/current/i));
});
```

---

# Rejected (verified not bugs during this pass)

The following findings from the research agents were investigated and **dropped** because the source does not actually contain the bug:

| Claim | Reason for rejection |
|-------|---------------------|
| `readMultipart` reads audio bytes before validating content-type | `readMultipart` (`request.ts:169-184`) validates the top-level `Content-Type` *before* reading any bytes; `parseAudioCt` validates the audio part's MIME *before* transcribing. Order is correct. |
| `caseImported` is registered but never written | `src/server/case/import.ts:140` writes `caseImported` inside the API-015 import path. |
| `outputs` route uses `z.object` and should be `z.strictObject` | This is a real finding, but **already listed** as round-2 SYS-BUG-21. Not duplicated here. |
| `apiError.caseId` is forwarded to `auditAccessDenied` but the hook drops it | Verified: `compose.ts:317` does forward `apiError.caseId`, and `denied.ts:33` writes `caseId` to the row. The hook drops it from `details` only. The *gap* is captured in round-2 SYS-BUG-15. |
| `reservePaidCall` is a TOCTOU exploitable for double-spending | The SQL `reserve_ai_call` is the source of truth: it takes the global budget lock and increments `intake_drafts.revision` atomically; a concurrent second call hits `stale.revision`. The unlocked pre-check is a documented fast-fail optimization. Downgraded to S3 defense-in-depth (F3-06). |

---

# Acceptance criteria for closing BUG_SOLVING1.md

A reviewer should be able to take each numbered item above and:

1. Reproduce the bug against the current `fix/system-integration-bugs-followup` branch.
2. Write a failing test that demonstrates the bug.
3. Apply the fix sketch.
4. Confirm the test passes.
5. Re-run the L1 unit suite (≥ 3982 tests) and the L2 DB suite (30 files, exit 0) — both must remain green.

Suggested fix order: **S1 → S2 → S3**, with D3-04, D3-05, D3-07, U3-01, U3-07 (the S1 items) as the first PR. The S2 items form the second PR. The S3 items are housekeeping and can ship with the second PR or be split out.

When the first PR lands, update `docs/execution/STATUS.md` (or equivalent) to reflect the new findings as `SYS-BUG-28` … `SYS-BUG-55` and close them in the standard commit format. This doc remains the historical record of the round 3 survey.

## Execution record — 2026-10-19

Implemented in the current worktree; no PR or merge was created. The result for
each indexed finding is:

| ID | Result |
|----|--------|
| F3-01 | Fixed: API-003 returns the current generated outputs on submit and replay. |
| F3-02 | Fixed: match components are limited to the five supported keys, with contract regression coverage. |
| F3-03 | Fixed: matcher completion/failure stamps re-check case eligibility and state. |
| F3-04 | Fixed: removed the dead dynamic import; the lint regression is scoped to this runner because other lazy imports are intentional. |
| F3-05 | Fixed: API-022 now gets the page, district labels, and duplicate cues in one query. |
| F3-06 | Reviewed; no change: the SQL reservation owns the budget lock and draft revision. Adding a pre-lock on the draft risks reversing the lock order and introducing deadlocks. |
| F3-07 | Fixed: candidate writes use a savepoint per row, skip only SQLSTATE 22/23 row failures, and still run the duplicate hook. |
| F3-08 | Fixed: void audit entries are inserted in a batch. |
| F3-09 | Fixed: the request logger is passed through the intake runtime. |
| F3-10 | Duplicate of round-2 SYS-BUG-21; no duplicate implementation was added. |
| D3-01 | Fixed: added the district/visible-case index. |
| D3-02 | Fixed: confirmed-candidate unique indexes use `NULLS NOT DISTINCT`; endpoint null checks are enforced. |
| D3-03 | Partly fixed: operator-query indexes and a partitioning decision note were added. Partitioning remains deferred until volume and query measurements support it. |
| D3-04 | Fixed: redaction verifies the transaction actor against the session actor. |
| D3-05 | Fixed for synthetic seed replay: a fixture-ID-only mapping prevents reseeding a redacted fixture. Reporter identity/submission IDs are still erased on redaction, so general reporter deduplication is intentionally not claimed. |
| D3-06 | Fixed: the transition trigger rejects direct anonymisation writes outside the redaction transaction. |
| D3-07 | Fixed: password hashes must match the expected Argon2id PHC form. |
| D3-08 | Fixed: audit actions use a database enum; the drift check compares it with the TypeScript action maps. |
| D3-09 | Implemented at the application boundary: expiry indexes, `sweep_expired_metadata()` and `npm run db:sweep` were added. The proposed `expires_at > now()` partial-index predicate is not immutable in PostgreSQL, so valid expiry indexes are used; no deployment scheduler is configured here. |
| D3-10 | Existing database check verified; added a regression confirming pending candidates have no decision timestamp and terminal candidates require one. |
| U3-01 | Existing restore-ready gate verified; added regression coverage for keystrokes before draft restoration. |
| U3-02 | Existing cancellation/late-stream cleanup verified; added a regression for visibility changing before microphone permission resolves. |
| U3-03 | Fixed: officer audit rows carry and display the synthetic marker. |
| U3-04 | Fixed: the close note survives reload through session storage and clears after success. |
| U3-05 | Fixed: duplicate entries expose officer-scoped case links and status. |
| U3-06 | Existing partial-time behavior verified; added regression coverage. |
| U3-07 | Fixed: demo fill uses the native input setter and dispatches a bubbling `input` event before password focus; helper and ordering regressions added. |
| U3-08 | Fixed: language toggle buttons have localized accessible names identifying the current choice. |

`npm run check` passed on 2026-10-19 with the required local process/loopback
permissions: 3995 tests passed and 322 were skipped; lint exited 0 with 72
warnings; typecheck and the audit-action drift check passed. `npm run test:db`
could not complete: the local PostgreSQL endpoint was unavailable, Docker had
no running daemon, and the available server binaries are PostgreSQL 18 without
pgvector while this suite requires PostgreSQL 16 + pgvector 0.8.1. No database
migration was applied. The branch remains unmerged; changes under `src/contracts/`
still require the all-owner review specified by `AGENTS.md`.

## Verification refresh — 2026-10-19

This run supersedes the earlier note that PostgreSQL was unavailable. Against
the disposable PostgreSQL 16.15 + pgvector 0.8.1 test service, `npm run
test:db` passed all 33 files and 341 tests. The added migration and matcher
regressions passed, including an injected migration-007 failure proving the
006/007 pair rolls back without recording either migration or exposing the
caller-cutoff function. Full test, browser, offline, repeat, lint/typecheck,
and review results are in [pre-main verification](evidence/pre-main-verification-2026-10-19.md).

The code changes are committed on `pre-main`; this is not a merge record.
Safeguarding review found no code blocker but still requires a PR and
all-owner review for changes under frozen `src/contracts/` before `main` can
be updated.
