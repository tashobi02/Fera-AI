---
name: fera-gate
description: Check a Fera phase gate (G0–G6) against its exit checklist in docs/execution/PHASE_*.md, collect evidence, and write the gate report to docs/gates/G<n>-<YYYY-MM-DD-HHMM>.md. Also reports remaining hours per owner for stand-ups. Use at each gate time, at stand-ups, or when asked "are we on track".
argument-hint: "G0 | G1 | G2 | G3 | G4 | G5 | G6 [standup]"
metadata:
  author: "fera-team"
---

# fera-gate

The argument is the gate (`G0`–`G6`). With `standup`, produce only the stand-up table (step 4).

## 1. Find the gate
| Gate | Tracker | Due (Asia/Dhaka) |
|---|---|---|
| G0 | `docs/execution/PHASE_0_BOOTSTRAP.md` | 12 Oct 18:00 |
| G1 | `docs/execution/PHASE_1_SPECS_CONTRACTS.md` | 12 Oct 23:00 |
| G2 | `docs/execution/PHASE_2_MUST_CORE.md` | 13 Oct 23:00 |
| G3, G4 | `docs/execution/PHASE_3_FULL_SCOPE_QUALITY.md` | 14 Oct 13:00, 16:00 |
| G5 | `docs/execution/PHASE_4_SUBMISSION.md` | 14 Oct 21:00 |
| G6 | `docs/execution/PHASE_5_BUFFER_FINALE.md` | 15 Oct 20:00 |

Read that gate's exit checklist, its task rows, and the schedule in `docs/execution/EXECUTION_PLAN.md`.

## 2. Verify each exit item with evidence
Collect evidence yourself, without relying on what a row says:
- **Repo facts:** `git log --oneline origin/main`, `git tag`, the existence of files (`specs/*/tasks.md`, `src/contracts/`, manifest hash, eval report).
- **Checks:** run `npm run typecheck`, `npm run lint`, `npm test`. For G2/G4, also run Playwright specs tagged `@gate-G2`/`@gate-G4` (`npx playwright test --grep @gate-G2`) and, for G4, `npm run smoke -- --base <prod-url>` and `npm run spend`.
- **CI:** `gh run list --branch main --limit 3`, if `gh` is available.
- **Human-only items** (phone tests, timing study, email sent): accept them only with a linked artefact or a named owner's confirmation in the tracker log. Otherwise mark them UNVERIFIED.

Never run `db:reset` or a seed against a non-local database, and never read or print `.env*`.

## 3. Write the report
Create `docs/gates/G<n>-<YYYY-MM-DD-HHMM>.md`:
```
# G<n> — <PASS | FAIL> — <date time Asia/Dhaka>
| Exit item | Result (PASS/FAIL/UNVERIFIED) | Evidence (command + result, URL, file) |
|---|---|---|
Open items: <ID — owner — next step — new date>
Remaining hours (D6 estimates of non-done rows): S <h> · O <h> · M <h>
```
The gate is PASS only if every item is PASS; UNVERIFIED counts as FAIL. Then link the report in the tracker's "Gate report" line and tick only the checklist boxes that are PASS. Add a log line.

## 4. Stand-up mode
Fill the next empty row of the tracker's stand-up table: gate status, PRs merged since the last stand-up, blockers, and remaining hours per owner (sum of D6 `h` over rows not `done`). Flag any critical-path checkpoint that is late, along with the fallback the tracker names for it.

## Audit amendments (2026-10-12)

- **AMD-GATE-1 — Gap:** Gate checks could ignore amendments, count partial tasks twice or run missing commands. **Change:** Read each tracker's Audit amendments and EXECUTION_PLAN amendments before interpreting checklists: added Must checks are required; optional TC-007 is not a G2 blocker. Gate times are internal targets; organiser extension date UNKNOWN. Validate script/dependency availability first; failing stubs and absent Playwright are UNVERIFIED/FAIL, never fetch/install tools implicitly. Deduplicate partial/carryover rows by TASK ID; shared hours are one task total, owner split UNKNOWN without evidence. Do not replace remaining-work estimates with full historic totals. Read .env.example only when authorised as a nonsecret template; never actual environment secrets. Human submission needs receipt evidence under the confirmed organiser instructions. **Source:** phase AMD-PLAN-1–4 and AMD-0–5; D6; handover §§6–10.
