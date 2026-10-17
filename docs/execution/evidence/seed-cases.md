# TASK-019 evidence — synthetic case seed loader

Owner: Masnun · Branch `phase2--masnun-seed` (stacked on #33 districts and #34 synthetic set) · Date: 2026-10-17 (Asia/Dhaka) · Links: TASK-019, A-039, BR-026, FR-032, OD-010-4.

All cases are synthetic (`is_synthetic = true`, enforced by the table CHECK). No photo, face, ID document or exact coordinate. Wherever a seeded text is shown or exported the "সিনথেটিক"/`[MOCK]` label (FR-032) must be rendered with it (see synthetic-set.md, display dependency).

## Decision: seed-only path, not the case service (recorded before coding)

| Question | Finding |
|---|---|
| Does the case service accept a caller-supplied case id? | No. `cases.id` is `gen_random_uuid()` and `ref_code` is random (`newRefCode`). It does accept a caller-supplied `client_submission_id` (a UUID). |
| Can a plain `node db/seed/index.mjs` call it? | No. `src/server/case/` is TypeScript behind `@/` aliases, runs on its own `fera_app` pool (not the owner client the seed holds), and there is no TS runner in the repo. |
| Result | `db/seed/cases.mjs` mirrors `createMissingCase`/`createFoundCase` + `openCase` column for column and audit row for audit row. Idempotency uses the service's own key: `client_submission_id = record_id`. |

How each record is attributed (the service's owner rules):

- **Missing (90):** one anonymous `parent_sessions` row per report (`id = record_id`, revoked at creation, so no cookie can use it). Parents have no account. `source = parent`, stored `submitted`, then stepped to `open` as the route does after embedding. `matching_state` stays `queued`.
- **Found (110):** owned by `staff.demo` or `staff2.demo` (from `npm run seed:users`, required), chosen by the last hex digit of `record_id` so `demo` and `full` agree. `source = staff`, stored `open`.
- **Audit (real rows, service's strict key set, no child payload):** `case.created` for every case (actor parent session or staff, `api` API-003/API-007), plus `case.state_changed` submitted -> open (actor system) for each missing case. `request_id = seed-cases`.
- **Versions:** `version = 1`, no `case_versions` row (the service writes one only on an owner edit).
- **Payload hash:** the contracts' canonical hash. The committed drafts differ from the schemas' parsed output only in a `.000` time fraction, which the loader drops (as `primitives.ts` does); a DB test compares every stored hash with `submissionPayloadHash` from the contracts. An existing case with a different hash stops the run (the service's E-006 analogue).
- **Embeddings:** `embedding*` columns stay NULL; a later task (TASK-016 re-embed) fills them.
- **Id map:** record_id is the case's `client_submission_id` column, so the map is a join, not a file; nothing with child payload is printed or logged. The command prints counts and elapsed time only.
- The whole load is one transaction: a failure leaves nothing behind; a re-run inserts nothing (`skipped`).

## What `--set demo` loads (OD-010-4)

The plan row says "3 demo cases"; the synthetic set's demo script needs more (a true pair, a decoy, a duplicate and a no-match query). No number was invented: `demo` loads exactly the records whose ground-truth `demo_role` is one of the following, **5 records**.

| demo_role | label | kind | note |
|---|---|---|---|
| `kamalapur_boy` | SYN-F-001 | found | true partner of Rafi |
| `narayanganj_decoy` | SYN-DF-001 | found | decoy, type `contradiction` |
| `mim` | SYN-M-061 | missing | no-match query |
| `mim_public_post` | SYN-M-076 | missing | duplicate of Mim (public-post wording) |
| `sabbir` | SYN-M-062 | missing | no-match query |

**Rafi (`rafi`, SYN-M-001) is withheld** from `demo` because the demo creates him live by voice. `--set full` loads all 200 records, Rafi included. Count by kind: 90 missing, 110 found (the synthetic set's decoys and duplicates: 80 + 10 and 80 + 30).

## Verification

| Check | Result |
|---|---|
| `tests/db/seed-cases.test.ts` (9 tests, in `npm run test:db`) | pass: demo = 5 and no Rafi in < 120 s; full = 200 synthetic, 0 other; second run inserts 0 and adds no audit row; owners per service rules; audit rows; hash equals contracts; no embedding, queue untouched; fails closed without staff accounts |
| `npm run seed -- --set demo` on a fresh local DB (`db:reset`, `seed:users`) | inserted 5, elapsed 19 ms in-process, whole command under 1 s wall time; second run inserted 0 / skipped 5; `--set full` afterwards inserted 195 / skipped 5 in 136 ms (200 cases) |

Elapsed times are single local runs on this laptop's PostgreSQL 16, not a benchmark.

## Open items

- UNKNOWN: whether the plan's "3 demo cases" meant a subset of the five above. Mahim to confirm; the loader's `DEMO_ROLES` list is the one place to change.
- Bangla wording of the seeded reports is template text without human review (OD-010-3).
