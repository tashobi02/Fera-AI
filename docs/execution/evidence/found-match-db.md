# TASK-026 / TASK-028 evidence — PostgreSQL 16 tests for the found log and match read

Owner: Masnun · Lane: `masnun-followups` (branch `phase2--masnun-followups`, stacked on PR #33 and PR #34, both open when written; merged state unknown) · Date: 2026-10-17 (Asia/Dhaka) · Links: TASK-026, TASK-028, TC-008, TC-010, TC-011, BR-010, D2A API-007/009/010.

All data is synthetic. No paid call, no photo, no exact coordinate. Local PostgreSQL 16.15 with pgvector 0.8.1 on 127.0.0.1:54322 (no Docker).

## What this adds

`tests/db/found-match.test.ts` (6 tests, added to `scripts/db/test-db.mjs` FILES), run as `fera_app`:

1. `logFoundCase` stores one found case for a repeated `client_submission_id` and reports `replayed: true`.
2. `readCandidate` is `hidden` for an unverified officer, a staff user, a parent session, a malformed id and an unknown id, and writes no `case.contact_viewed` row.
3. A verified officer's read writes `case.contact_viewed` for both reports with the request id, in the same transaction.
4. With a trigger failing only the second endpoint's `case.contact_viewed` insert (the first has already happened), the read rejects and no audit row exists for that request id, so the first insert rolled back too.
5. Two connections: the missing report is edited (service `editMissingCase`) between the read's `cases` SELECT and the rest of the read. Before the fix the officer was served the pre-edit report as `qualified: true`. After the fix (`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ` as the first statement of the read transaction) the audit insert meets the concurrent update (40001), `withTransaction` retries, and the result is the edited report with `qualified: false`.
6. Two connections: the missing report is edited after a qualified read; `decideCandidate` then returns E-005 and the candidate is not confirmed.

Red then green for item 5: with `candidate-read.ts` reverted the file ran 5 passed / 1 failed; with the fix, 6 passed.

## Commands run on this machine (2026-10-17)

| Command | Result |
|---|---|
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0; 110 files passed, 11 skipped; 2,971 tests passed, 197 skipped (the skipped ones are the DB tests) (after fix round 1) |
| `npm run test:db` | exit 0; 11 files, 197 tests passed (48, 18, 13, 38, 4, 10, 11, 20, 23, 6, 6), including the 6 new |
| `npm run build` | exit 0 |

## Decisions and findings (fix round 1)

- Display rounding is downward (`Math.floor`): 99.6 shows as 99 and a component of 0.999 as 0.99, so only a stored 100 or 1 reads as full. The stored value is unchanged.
- After a `stale` or `uncertain` result the decision controls are disabled and point (aria-describedby) at the failure message until the page is reloaded. `validation` and `generic` failures show Reload but leave the controls enabled on purpose: a generic failure can be a lost reply, and the server rechecks the versions and answers E-005 if the decision was in fact stored, so a second press cannot double-decide.
- Exhausted retries: if all 3 attempts hit 40001, `withTransaction` rethrows through `mapDbError`, which maps only `LockSetChanged`, check and unique violations; a serialization failure is returned unchanged. The API layer logs its SQLSTATE and answers E-021, and the match page has no catch, so it errors. Only `kind: "hidden"` produces E-004 and the `access.denied` row, so an exhausted retry cannot be recorded as a denial. No change made (`src/server/case/tx.ts` is Mahim's area).
- Free text now treats U+200B as a word break (one space, repeats collapsed); U+FEFF and U+00AD are removed; ZWNJ/ZWJ are kept. Pasted phone numbers are cleaned with the shared invisible class plus U+2010-U+2015 and U+2212, and an invisible-only phone reports "required".
- Out of scope here: the 017-prefixed fixtures under `tests/` are left alone (contracts-owner follow-up).

## Not proven by this note

TC-008, TC-010 and TC-011 as browser journeys (Playwright, TASK-038) and the matcher-created candidate path (TASK-017) are still not run. This note covers the database behaviour of the existing services only.
