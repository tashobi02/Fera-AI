# TASK-059 — spend CLI review evidence

Owner: Obidit. Lane: `phase2--obidit-spend`. Reviewer: Codex. Worker: puku-cli (Opus 4.8), as named in the brief. Worker execution details and historical verification counts are UNKNOWN: the supplied result JSON contains assertions, not command transcripts. This report supersedes those assertions. No commit, push, dependencies, provider requests or `.env*` reads.

Synthetic fixtures only. Database checks use loopback PostgreSQL and disposable databases; the CLI only reads budget/cost metadata. No report payload is stored or read by this CLI. No parent UI changes; D4 presentation rules are not exercised here.

## Scope and lead blocker

The package.json `spend` script and the test-db.mjs entry were reverted by a review whose brief left them out, then restored by the lead on 2026-10-16 (OD-059-4 resolved).

| Allowed file | Purpose |
|---|---|
| `scripts/spend.mjs` | Read-only local CLI, exact cap comparison, text/JSON report, generic unknown-argument errors, help before DB configuration, DB failure location and code only. |
| `scripts/spend/lib.mjs` | Pure exact-decimal helpers, `safeUrl`, `DHAKA_TODAY_DATE_EXPR`, `TODAY_SPEND_SQL`. `safeUrl` returns only `host:port/dbname`, stripping both scheme and userinfo. |
| `scripts/db/guard.mjs` | Existing optional `label` parameter and related comments/default/message substitutions only relative to HEAD. The reviewer made no further edits to this shared file. Default caller diagnostics are preserved. |
| `tests/scripts/spend.test.ts` | Money formatting, status and output shapes, invariant error, exact safe location formatting without URL mutation. |
| `tests/scripts/spend-cli.test.ts` | Argument parsing plus subprocess regressions for `--help`/`--explain` without DB configuration and no arbitrary input in either output stream. |
| `tests/db/spend-cli.test.ts` | CLI subprocess integration, local guard, credential stripping, today's settled cost, numeric cap comparison, actual unset and empty cap cases, production SQL boundary regression. |
| `docs/execution/PHASE_2_MUST_CORE.md` | TASK-059 log lines only. The historical worker line is preserved and explicitly superseded. |

## Verified behavior

- Default USD cap is read from `ai_budget`; committed plus reserved determines status. Money uses bigint micros, preserving exact decimal comparisons. `AI_SPEND_CAP_USD` matches numerically across `25`, `25.0` and `25.000000`.
- An invalid `AI_SPEND_CAP_USD` produces `invalid AI_SPEND_CAP_USD` without echoing the value. A valid numeric mismatch reports cap drift; it does not change the database cap. Empty/unset means no comparison.
- On DB failure stderr shows only `host:port/dbname` with no userinfo, plus the driver error code when available. It does not print the raw driver message. Tests retain the `sekrit` username regression and synthetic password checks.
- Unknown arguments produce only `unknown argument` and usage. This also protects positional credentials and malformed `name=value` input; the earlier after-`=` redaction alone was insufficient.
- `--explain` and `--help` show help before reading DB configuration. The worker's integration test advertised both but invoked only `--help`; a subprocess regression now covers both.
- Both output formats contain `cap_usd`, `committed_usd`, `reserved_usd`, `used_usd`, `today_usd`, `remaining_usd`, `status`. All amounts are six-decimal strings.
- Today's cost is settled `actual_usd` in Asia/Dhaka. The boundary test evaluates the imported production date expression and full aggregate with fixed instants: `2026-10-15 17:59:59+00` maps to `2026-10-15`; `2026-10-15 18:00:00+00` maps to `2026-10-16`. It does not rely on the current date.

## Tests-first review fixes

The safe-location regression failed before `safeUrl` was corrected. The help and private-argument regressions failed before their CLI fixes. The old boundary test passed with a temporary UTC mutation of the production date expression; the revised boundary test failed under that same mutation. Asia/Dhaka was restored before verification. The temporary mutation was solely a test-sensitivity check, not a production timezone defect.

During reviewer verification, a full unit run hit the known argon2 timing test flake; the affected password test file passed when rerun alone. Both runs are retained in the session logs and reported to the lead. No auth files were edited.

Historical worker RED/GREEN execution: UNKNOWN; no transcript supplied. Reviewer RED/GREEN and current checks are recorded here. No checkpoint commits were made, as requested.

## Local verification

The spend and DB results below were supplied as lead measurements in PA3 (2026-10-16, exact time not recorded; an earlier "~22:15" in the lead's brief was wrong); the other command results and earlier review narratives are inherited evidence, not fresh PA3 reruns. PA3's result JSON records documentation finish checks only. Historical execution remains unverified without its command transcript.

| Command | Exit | Summary |
|---|---|---|
| `npm run lint` | 0 | Silent ESLint success. |
| `npm run typecheck` | 0 | `✓ Types generated successfully`; TypeScript success. |
| `npm test` | 0 | `Test Files  59 passed | 9 skipped (68)`; `Tests  1401 passed | 185 skipped (1586)`. DB suites are skipped in this command. |
| `npm run build` | 0 | `✓ Compiled successfully`; production build completed. |
| `npm run test:db` | 0 | 9 files, per-file `Tests` lines: 48, 18, 13, 38, 4, 10, 11, 20, 23. The last is `tests/db/spend-cli.test.ts`. |
| `npx vitest run tests/scripts` | 0 | `Test Files  2 passed (2)`; `Tests  24 passed (24)`. |
| `AI_SPEND_CAP_USD=25 node scripts/spend.mjs` | 0 | Verbatim text below. |
| `node scripts/spend.mjs --json` | 0 | Verbatim JSON below. |
| `node scripts/spend.mjs --help` | 0 | Help contract. |
| `node scripts/spend.mjs --explain` | 0 | Help contract without DB access. |
| `node scripts/spend.mjs --bogus` | 4 | `unknown argument` and usage; no argument echo. |
| `npm run spend` | 0 | Verbatim text below. |
| `git diff --check` | 0 | No output. |
| `git diff HEAD -- scripts/db/guard.mjs` | 0 | Only optional label machinery and comments; no `safeUrl`. |

Text:

```text
cap_usd=25.000000
committed_usd=0.000000
reserved_usd=0.000000
used_usd=0.000000
today_usd=0.000000
remaining_usd=25.000000
status=ok
```

JSON:

```json
{"cap_usd":"25.000000","committed_usd":"0.000000","reserved_usd":"0.000000","used_usd":"0.000000","today_usd":"0.000000","remaining_usd":"25.000000","status":"ok"}
```

## Source checks and limits

- [D6 TASK-059](../../spec/D6_Implementation_Plan_V2.md#5-task-board) has its task row at line 158: `npm run spend` plus cap check, done when TC-036 passes. [D2B](../../spec/D2_TRD_PartB_V2.md) line 177 requires today's/total spend versus `AI_SPEND_CAP_USD`; line 261 describes raising the cap via env. These lines support the command contract, not proof of completion.
- D6 line 256 defines TC-036: set cap to current total, call API-002, refuse with E-023 and open the manual form. The existing [service test](../../../tests/db/spend.test.ts) exercises budget refusal and reviewed submission through the case service. The CLI integration itself only proves reporting and exit status, not service refusal or the end-to-end manual-form journey.
- [Reservation SQL](../../../db/schema_v2.sql) lines 555–557 enforce committed plus reserved against cap; lines 575–576 move settled cost into committed and record `settled_at`. [Money helpers](../../../src/server/spend/money.ts) use the same accepted USD regex.
- No API-002 route or manual-form journey was verified. No coverage measurement or independent safeguarding gate was run; this is the reviewer check before the lead's gate. The scoped CLI has no child-text/provider-message logging, payload storage, paid dispatch or lifecycle decisions.

## Open decisions

- OD-059-1: warning threshold UNKNOWN; the pack provides no rule. The CLI implements no warning threshold.
- OD-059-2: no cap-changing CLI flag; any operator update workflow needs a documented team decision.
- OD-059-3: env cap remains a comparison only; the specified raise-via-env workflow is unimplemented. Lead must reconcile the operator workflow with DB enforcement.
- OD-059-4: Resolved 2026-10-16 by Obidit's orchestrator (lead integration): wiring restored.
- Historical worker command execution, timestamp provenance and counts: UNKNOWN beyond the result JSON's claims. Current verification replaces them; do not infer they were false merely because no transcript was supplied.
- PA3 worker log time: UNKNOWN; the worker left an unevaluated timestamp placeholder. Recover the original time from execution evidence if needed; do not substitute the review time.
