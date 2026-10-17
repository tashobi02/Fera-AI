# TASK-026 evidence — SCREEN-007 found-child log and API-007

Owner: Masnun · Lane: `masnun-found-log` (Claude Code + `impeccable`), branch `phase2--masnun-found-log` from `origin/phase2` @ `0617b4c`, **stacked on `phase2--masnun-districts` (TASK-009)** · Date: 2026-10-15 (Asia/Dhaka) · Links: TASK-026, COMP-034, FR-011, BR-004/006/010/013, DECISION-013, TC-008, D2A API-007, D3 SCREEN-007.

All data is synthetic. No paid call, no photo, no exact coordinate.

> **Depends on TASK-009.** Merge the TASK-009 PR first (merge commit, not squash). This lane carries that branch's commits only because `data/districts.json` is not on `phase2` yet.

## Status against "Done when TC-008 passes"

**TC-008 does not pass yet, and this lane cannot make it pass alone.** TC-008 is a browser/database journey ("Staff signed in, log Kamalapur found boy; Ref F-… shown; case open or matched_pending_review ≤ 15 s; no candidate details shown to staff"). What is done and verified here:

- the API route and its service (fake case service in unit tests);
- the form logic and the screen markup (server-rendered; no browser here).

What is **not** done: a real request through PostgreSQL (no Docker on this machine), the Playwright/axe journey (TASK-038, Playwright not installed), the free-text path (needs Obidit's TASK-020), and the "≤ 15 s match" part (needs the matcher, TASK-017).

## What was built

| Area | Files | Notes |
|---|---|---|
| API-007 route | `src/app/api/found-cases/route.ts` | `defineRoute` with the frozen `createFoundRequestSchema` / strict `createFoundResponseSchema`. 201 new, 200 identical replay. Per-principal write limit 30/min (not from the spec pack; OD-026-3). |
| Service | `src/server/found/log-found.ts` | Calls `createFoundCase`, then returns the caller's own report plus `matching_state`. For a verified officer the own-view is projected through a staff-role principal minted from the same user (OD-026-1). |
| Screen | `src/app/(desk)/staff/page.tsx`, `found-log-form.tsx` | `requireRole(["staff","officer"], "/staff")`; desk surface; districts sorted once on the server per locale and shown as "Dhaka (ঢাকা)" / "ঢাকা (Dhaka)". |
| Logic | `src/lib/found-log-flow.ts` | Values → request via the contract, exact-path field mapping (unmapped contract issues are reported as a contract failure, never blamed on a field), failure classification, state machine, save guard, submission-id plan. |
| Strings | `src/locales/index.ts` | 54 `foundLog*` keys, bn + en. D3 Save/Saving strings exact. |
| Icon | `src/app/components/icons.tsx` | `CircleCheckIcon`. |
| Tests | `tests/found/log-found.test.ts` (12), `tests/ui/found-log-flow.test.ts`, `tests/ui/found-log-screen.test.ts` (6) | Service, route contract (201/200, E-001, E-002, E-003, E-006, cross-origin, strict draft), flow, markup. |

## Behaviour worth knowing

- **Save is the confirmation.** `confirmed: true` exists only in `buildFoundRequest`. Blank age, name, height, marks, thana and relation are sent as `null`; sex defaults to "unknown".
- **Found time** defaults to now (D3) and is sent as an exact time (`at = at_lower = at_upper`, `at_approx = false`). The hint tells staff to change it if the child was found earlier. An "approximate time" option is not built (OD-026-2).
- **Idempotent retry.** The same client UUID is reused only when the form values are unchanged (a safe replay). A changed payload gets a new UUID, so an edit after an "uncertain" result is never a permanent E-006. Caveat, stated in the copy: if the first attempt really was saved and the staff then change a detail, a second report is created. Closing that gap needs a server-side change (OD-026-4).
- **Honest failure labels.** "Offline" only when the browser says it is offline; any other lost response, a 5xx or an unreadable body is "uncertain" (a retry is safe). A 2xx whose body fails the contract is logged by field path only.
- **No candidate details** reach staff. The matching state (`queued` / `running` / `complete` / `failed`) is shown explicitly and "complete" says the search is done, not that a match exists.

## Verification (2026-10-15, local)

| Command | Result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | 44 files passed, 5 skipped (DB-gated); 995 tests passed, 123 skipped |
| `npm run build` | succeeds; `/api/found-cases` and `/staff` registered |
| `npm run test:db`, any request against PostgreSQL | **NOT RUN** (no Docker/psql on this machine) |
| Playwright / axe, real screen reader, 320 px and 200 % zoom in a browser | **NOT RUN** |

## Review (`fera-review`, 7 reviewers, read-only)

| Reviewer | First verdict | Handled |
|---|---|---|
| `fera-safeguarding-reviewer` | BLOCK | The one BLOCK, a dialable-looking phone in test fixtures, is fixed (`01700000001`). WARNs: found-time hint made explicit; uncertain/conflict copy now qualified; per-principal rate limit; Bangla honest-copy check; follow-up named on the officer projection; test file committed. |
| `security-reviewer` | PASS | Rate limit, E-006-only conflict label, route tests for E-006, cross-origin and extra keys. |
| `typescript-reviewer` | WARN | Future check now zero-skew and uses `toDhakaIso`; exact-path mapping; typed fake; matcher-based assertions; clock pinned in tests. |
| `react-reviewer` | BLOCK (3 functional) | Edited-retry id; focus after "Log another"; UUID fallback; focus after commit; stable alert region; server-side district sort; pageshow reset. |
| `a11y-architect` | no blocker | `min-w-0` on fieldsets; stacked age inputs on narrow screens; self-sufficient age labels; alert next to Save; `autoComplete="tel"`; `aria-busy`; success panel keeps the global focus outline. |
| `bengali-reviewer` | approve | Two optional wording tweaks applied (invalid-value copy, "সংরক্ষণ করুন" in the retry note). |
| `silent-failure-hunter` | HIGH ×3 | try/finally on the guard; edited-retry; honest classification. |

Not adopted: saving form values to `sessionStorage` for a mid-session 401 (see open decisions); a "reference number" wording change.

## What is NOT done

- No real-database run and no browser journey (above).
- A 401 mid-session shows "sign in again" but does not keep the draft across a sign-in redirect.
- Free-text (voice or typed) extraction for found children: TASK-020 (Obidit).
- No found-child duplicate check and no matcher: TASK-018 / TASK-017.
- Two existing tests use the dialable-looking number `01712345678` (`tests/api/platform.test.ts`, `tests/api/log.test.ts`, `tests/api/request.test.ts`). They are Mahim's files; flagged, not edited.

## Open decisions

| ID | Question | Who |
|---|---|---|
| OD-026-1 | Add an own-found-report projection to `src/contracts` (frozen) so officers need no re-projection workaround. | all three owners |
| OD-026-2 | Add an "approximate time" option for a found child (currently exact only)? | Masnun, Obidit |
| OD-026-3 | Is a per-principal 30/min write limit on API-007 acceptable (not in the spec pack)? In-memory per instance until a shared store exists. | Mahim |
| OD-026-4 | After an "uncertain" save and an edit, a second report can be created. A server-side near-duplicate guard or tombstone would close it. | all three owners |
| OD-026-5 | Keep the typed found-child form across a 401 (sessionStorage backup)? It stores a child description in the browser, so it needs a deliberate yes. | Masnun |
