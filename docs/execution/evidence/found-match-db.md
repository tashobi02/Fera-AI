# TASK-026 / TASK-028 evidence — PostgreSQL 16 tests for the found log and match read

Owner: Masnun · Lane: `masnun-followups` (branch `phase2--masnun-followups`, stacked on PR #33 and PR #34, both open when written; merged state unknown) · Date: 2026-10-17 (Asia/Dhaka) · Links: TASK-026, TASK-028, TC-008, TC-010, TC-011, BR-010, D2A API-007/009/010.

All data is synthetic. No paid call, no photo, no exact coordinate. Local PostgreSQL 16.15 with pgvector 0.8.1 on 127.0.0.1:54322 (no Docker).

## What this adds

`tests/db/found-match.test.ts` (6 tests, added to `scripts/db/test-db.mjs` FILES), run as `fera_app`:

1. `logFoundCase` stores one found case for a repeated `client_submission_id` and reports `replayed: true`.
2. `readCandidate` is `hidden` for an unverified officer, a staff user, a parent session, a malformed id and an unknown id, and writes no `case.contact_viewed` row.
3. A verified officer's read writes `case.contact_viewed` for both reports with the request id, in the same transaction.
4. With a trigger forcing the `case.contact_viewed` audit insert to fail, the read rejects and no audit row exists for that request id.
5. Two connections: the missing report is edited (service `editMissingCase`) between the read's `cases` SELECT and the rest of the read. Before the fix the officer was served the pre-edit report as `qualified: true`. After the fix (`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ` as the first statement of the read transaction) the audit insert meets the concurrent update (40001), `withTransaction` retries, and the result is the edited report with `qualified: false`.
6. Two connections: the missing report is edited after a qualified read; `decideCandidate` then returns E-005 and the candidate is not confirmed.

Red then green for item 5: with `candidate-read.ts` reverted the file ran 5 passed / 1 failed; with the fix, 6 passed.

## Commands run on this machine (2026-10-17)

| Command | Result |
|---|---|
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0; 110 files passed, 11 skipped; 2,968 tests passed, 197 skipped (the skipped ones are the DB tests) |
| `npm run test:db` | exit 0; 11 files, 197 tests passed (48, 18, 13, 38, 4, 10, 11, 20, 23, 6, 6), including the 6 new |
| `npm run build` | exit 0 |

## Not proven by this note

TC-008, TC-010 and TC-011 as browser journeys (Playwright, TASK-038) and the matcher-created candidate path (TASK-017) are still not run. This note covers the database behaviour of the existing services only.
