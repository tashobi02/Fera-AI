# TASK-028 evidence — SCREEN-010 match review, API-009 and API-010

Owner: Masnun · Lane: `masnun-match-review` (Claude Code + `database-reviewer`), branch `phase2--masnun-match-review` from `origin/phase2` @ `0617b4c` · Date: 2026-10-15 (Asia/Dhaka) · Links: TASK-028, COMP-037/038/049, FR-015–FR-017, BR-001/005/010/019/020, TC-010 (confirm part), TC-011, D2A API-009/010, D3 SCREEN-010.

All data is synthetic. No paid call, no photo, no exact coordinate.

## Status against "Done when TC-010 (confirm part) and TC-011 pass"

**Neither TC passes yet, and this lane cannot make them pass alone.** Both are database journeys over a candidate that the matcher (TASK-017) must create, opened from the queue (TASK-027). Neither exists yet, and no database or browser ran on this machine (no Docker, no Playwright).

What is done and verified here: the pure comparison and request logic, the candidate read module (database helpers faked), both routes' contracts (fake case service), and the screen markup (server-rendered).

## What was built

| Area | Files | Notes |
|---|---|---|
| API-009 read | `src/server/matching/candidate-read.ts`, `src/app/api/candidates/[id]/route.ts` | Verified officer only; absent, malformed and forbidden are the same `hidden`/E-004. Both reports via the officer projection; `case.contact_viewed` is written in the same transaction for each raw phone served. `qualified` = pending, both reports at the candidate's versions, both in a queue status, neither redacted. |
| API-010 decision | `src/app/api/candidates/[id]/decision/route.ts` | Parses, calls the merged `decideCandidate`, returns its response. No logic of its own. |
| Screen | `src/app/(desk)/officer/match/[id]/page.tsx`, `match-review.tsx` | Evidence table (stacked blocks below `sm`), similarity score, duplicate banner, summary, contacts, score components, decision panel. Confirm is a two-step native dialog with the four checklist items; Reject needs a 3–500 character reason. |
| Logic | `src/lib/match-review.ts` | `compareCases`, `buildConfirm/buildReject`, failure classification, `requestDecision` (timeout covers the body read). |
| Strings | `src/locales/index.ts` | 69 keys, bn + en. D3 Confirm / Not a match / score label / verdict words / dialog sentence exact. |
| Icons | `src/app/components/status-icons.tsx` | CircleCheck / CircleX / CircleHelp; separate file so this lane and the found-log lane do not conflict in `icons.tsx`. Fold together after both merge. |

## Behaviour worth knowing

- **Nothing here decides.** Buttons send the officer's choice to API-010. The score is "similarity ... not a probability and not proof of identity".
- **Verdicts.** Agree / differs only for sex, age (ranges overlap or not) and same district. Free text, height, time and a **different district** are "compare by eye": a found child often turns up in another district, so a different district is not shown as a contradiction. D3 names three verdicts; this adds a fourth for those fields (OD-028-1).
- **Retry rule.** A retry after a stored decision is E-005 by design. "Stale" and "uncertain" both offer a reload, never a second blind press.
- **Honest success text.** Confirm shows "Match confirmed. Referral recorded (simulation)." D3 says "Referral to child-protection services created"; that overclaims, so the constitution's honest-copy rule wins (OD-028-4: fix D3 in a spec PR).
- **Not-found page.** An absent or unreadable candidate renders SCREEN-016 and writes an `access.denied` row (null FK), like the API route.

## Verification (2026-10-15, local)

| Command | Result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | 44 files passed, 4 skipped (DB-gated); 976 tests passed, 117 skipped |
| `npm run build` | succeeds; `/api/candidates/[id]`, `/api/candidates/[id]/decision`, `/officer/match/[id]` registered |
| Real PostgreSQL, Playwright/axe, screen reader, 320 px and 200 % zoom in a browser | **NOT RUN** |

## Review (`fera-review`, 6 reviewers, read-only)

| Reviewer | First verdict | Handled |
|---|---|---|
| `fera-safeguarding-reviewer` | BLOCK | Absent candidate on the page now writes `access.denied`; request id passed on the page read; English verdict word "Agrees" (not "Match"). D3 deviation noted above. |
| `database-reviewer` | PASS | `anonymised_at` added to `qualified`; redacted-counterpart test. |
| `security-reviewer` | PASS | Per-principal limits on both routes (OD-028-3); non-strict decision body recorded (OD-028-5). |
| `typescript-reviewer` | no blockers | Timer kept until the body is read; timeout, hang, offline/uncertain, 429 and default-parser tests; E-003 → forbidden; district → "review". |
| `a11y-architect` | 4 HIGH | Alert separated from the reload button and focused; guards on reopen/reject; failure kept on a reason error; checklist legend; note cleared on reopen; stacked rows below `sm`, keyboard-reachable table; unqualified warning linked to disabled controls. |
| `bengali-reviewer` | approve | "No decision can be recorded." and "নিজে মিলিয়ে দেখুন" applied. |

## What is NOT done

- No database or browser run (above); `npm run test:db` has no suite for the candidate read.
- No real candidates: matcher TASK-017 and queue TASK-027 are not built.
- The "Back to the queue" link points at `/officer/queue` (TASK-027) and will 404 (SCREEN-016) until it exists. No link to the case page yet (Mahim's TASK-029).
- Keyboard shortcuts for officers (D4) are not built.

## Open decisions

| ID | Question | Who |
|---|---|---|
| OD-028-1 | Accept a fourth "compare by eye" verdict, and a different district shown as "compare by eye" rather than "differs"? | Masnun, Mahim |
| OD-028-2 | `explanation_version` has no column; a constant `v1` is returned until the matcher stores one. | Masnun (TASK-017) |
| OD-028-3 | Per-principal limits (API-010 30/min, API-009 120/min) are not from the spec pack. | Mahim |
| OD-028-4 | D3 SCREEN-010's success string and English dialog sentence overclaim; update the spec pack (both copies and the manifest). | all three owners |
| OD-028-5 | `decisionRequestSchema` is a plain `z.object`, so unknown body keys are stripped, not rejected. The contract is frozen. | all three owners |
| OD-028-6 | `PageDeniedInput` only allows `reason: "role"`; a record-not-found page denial reuses it (details store only `error_id`). Add a `"record"` reason? | Mahim |
