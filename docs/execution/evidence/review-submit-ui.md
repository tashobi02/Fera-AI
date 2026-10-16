# TASK-022 part 2 — S-003 fix round 4

Owner: Obidit. Lane `obidit-review-ui`, branch `phase2--obidit-review-ui`, stacked on PR #27 per the supplied brief. Date: 2026-10-16 (Asia/Dhaka). Existing uncommitted A8, W4 and round-2 work was inspected and retained; round-4 fixes preserve that work and restore the lead’s full-source requirement. No commit or push.

**Verdict: Sol self-review (not the release gate); release gate pending.** Requested round-4 fixes are verified locally. TASK-022 remains `in progress`; full TC-004/031 client-to-database acceptance, human Bangla approval and the independent release safeguarding gate remain unverified. Round-3 internal findings and reviews were self-review evidence only, not release acceptance.

## Scope and safeguards

TASK-022 / SCREEN-003, FR-006/007/031/033, BR-004/008/015/016/023, TC-004/031; TASK-021 review navigation and draft sweeps. References: [API evidence](intake-submit-api.md), [intake evidence](intake-ui.md), D3 SCREEN-003 and returning/error flows, D4 §§9/11 and DESIGN Fera overrides. Spec files, contracts, server/API code, DB and dependencies were not edited. No `.env*` files were read. Synthetic fixtures only; no external provider or DB runner was used.

Submission remains an explicit confirmed POST. Mounting, editing or confirming alone never submits. `ReviewScreen.submit()` refuses `record.mock` independently of the disabled control. A successful synthetic intercepted response leaves the reference visible without automatically navigating to the planned report page. Reference persistence contains metadata only. Draft payloads and provenance remain device-local before submission.

## Fixes and behavioral proof

| Finding | Implemented behavior | Regression proof |
|---|---|---|
| B1 mandatory times | `at`, `at_lower`, `at_upper` each always expose date and HH:mm controls, with localized digits. Code composes seconds and `+06:00`; ISO text/hints are not displayed. Controls wrap/grow for enlarged text. Errors retain IDs, descriptions and `aria-invalid`; each prefilled value has full source or edited status. | `review-fields-regressions.test.ts`: “always exposes all mandatory time inputs…”; `tests/ui/review-screen.test.ts`: linked errors and prefilled age/time sources. |
| B1 date/chips | Chips fill both bounds and approximate `at`; night rolls into the next day. A future night upper bound is clamped to now with an icon/text clarification. Typing the chip date without a chip displays an inline unapplied-date notice. | `review-fields-regressions.test.ts`: every chip, rollover, invalid date, date-only notice, localized date + HH:mm composition, initially empty bound, incremental typing/clearing and fixed-clock BR-016 clamp. |
| B2 age estimate | Explicit exact/estimate choice exposes both estimate bounds even with no extraction. Estimate clears exact age; editing an exact age clears old normalized bounds before contract normalization. | “a parent with no prefilled age chooses estimate…” proves 7–9 with `age_years:null`; “editing a prefilled exact age…” catches hidden-bound conflicts. Static tests cover missing and inconsistent bounds. |
| B3 review links | Completed and extracted-manual outcomes use plain primary `Link` to S-003 with no Planned label. `PlannedLink` is restricted to `/intake/form`. No-extraction manual fallback cannot offer an empty review. | `tests/intake-ui/chat-lifecycle.test.ts`: four-round review handoff and primary-link assertions; no-extraction manual fallback regression. |
| B3 provenance | Every non-empty unedited field shows the complete canonical `source_text` with its original span highlighted, including exact/estimated age and every time field. The separate top block is removed. Extra/unsent handoff words still appear once below the fields. | `tests/ui/review-screen.test.ts`: full source for all populated visible fields and both estimated-age bounds; explicit TASK-013 residuals `ঠিক জানি না। রাফি। ১০ বছর` in age and `বাবার তথ্য। পোশাক: নীল জামা` in clothing. Existing extra-source-once regression retained. |
| B3 mock dispatch | Handler refuses direct mock form submission after confirmation; storage never becomes attempted. Button/notice remain visibly `[MOCK]` and disabled. | Lifecycle handoff regression and R4 “mounting a stored mock:true draft and submitting never fetches”; browser `requestSubmit()` observes no POST. |
| Labels | District label has the existing honest `[MOCK]` badge; unknown text fields use `reviewUnknownAdd`; the sex radio uses `unknownValue` after polish; the success synthetic badge renders once. | Static district/unknown-add regression; lifecycle “synthetic badge appears once on success”; browser success badge count. |
| W1 fresh handoff | Expired-record branch applies only without a handoff. | “a fresh handoff supersedes an expired stored draft”. |
| W2 expiry | Pre-submit expiry checks attempted and non-attempted records. | “pre-submit expiry refuses an attempted retry before its timer fires”. |
| W3 expiry rendering | Timer and visible-tab recheck remove fields and the form, clear readable storage, and show expiry recovery. Cold reload lets S-003 read expiry before cleanup. | Timer parameterization, `visibilitychange` regression, `tests/intake-ui/handoff-entry.test.ts`; browser checks cold-load expiry and focused replacement notice. |
| W5 accessibility | Descriptions resolve; age/time errors and edited statuses use icon, text and colour; sex summary focuses the first radio; expired alert receives focus after fields disappear. Storage/mock/frozen notices also have icons. | Static description/error/edited tests, lifecycle sex-summary activation and expired-focus-target regression, plus browser description/focus checks. |
| Cleanup failures | Timer, pre-submit and API E-019 deletion failures remove visible fields, retain inaccessible storage, and show the cleanup warning. | Parameterized “timer/submit/E-019 expiry reports failed storage deletion…” regression. |

Test paths in that table are under `tests/intake/review/` unless qualified. Tests were written before the fixes. RED evidence: `/home/obidit/secondBrain/coding/fera-lanes/_orchestration/shots/s003-r4/logs/s003-r4-red.log` and `/home/obidit/secondBrain/coding/fera-lanes/_orchestration/shots/s003-r4/logs/s003-r4-clock-red.log`. GREEN evidence: `/home/obidit/secondBrain/coding/fera-lanes/_orchestration/shots/s003-r4/logs/s003-r4-{targeted,lint,typecheck,test,build,diffcheck}.log`. Reviewer feedback exposed suffix leakage during incremental HH:mm entry; the new clearing/typing regression reproduced it before the fix. No tests were disabled. Round 2’s excerpt assertions were replaced because the lead reversed that design in round 4.

## Measured checks (archived round-4 run)

Archived round-4 command logs use `/home/obidit/secondBrain/coding/fera-lanes/_orchestration/shots/s003-r4/logs/s003-r4-*.log`.

| Command | Exit | Measured result |
|---|---|---|
| `npm run lint` | 0 | No errors or warnings |
| `npm run typecheck` | 0 | Route generation and strict TypeScript check |
| `npm test` | 0 | 2,019 passed; 162 skipped; 88 files (80 passed, 8 skipped) |
| `npm run build` | 0 | Production build includes `/intake/review` |
| `npx vitest run tests/intake tests/intake-ui tests/ui/review-screen.test.ts` | 0 | 666 passed; 24 files |
| `git diff --check` | 0 | No whitespace errors |

An earlier concurrent full run hit the existing auth timing assertion in `tests/auth/password.test.ts` (unknown/wrong-password ratio below its threshold); `/home/obidit/secondBrain/coding/fera-lanes/_orchestration/shots/s003-r4/logs/s003-r4-test-pre.log` retains the failure. The unchanged default suite passed on rerun (`/home/obidit/secondBrain/coding/fera-lanes/_orchestration/shots/s003-r4/logs/s003-r4-test-rerun.log`). No out-of-scope auth files were edited. Skipped DB tests do not establish database acceptance. Coverage percentage was not measured; no coverage dependency was installed.

## Browser evidence (archived round-4 run)

The reviewer used a locally available Playwright; no project dependency changed. Isolated headless Chromium, serving the production build only at localhost. Script: `/home/obidit/secondBrain/coding/fera-lanes/_orchestration/shots/s003-r4/logs/s003-r4-browser.cjs`. Captures and `results.json`: `/home/obidit/secondBrain/coding/fera-lanes/_orchestration/shots/s003-r4/`.

The script produced **23 state captures**: empty, incomplete, valid, attempted, expired, mock-preview and mock-success at **320 px bn, 360 px bn and 1280 px en**, plus incomplete/valid at **320 px bn with 200% text enlargement**. The latter doubles computed text size and line height, including form controls, while keeping the viewport and layout spacing fixed; it is a headless text-only enlargement emulation, not a physical-browser zoom setting.

Every capture was inspected for overflow and clipped values. DOM checks found no horizontal document/element overflow, no clipped input/textarea values, no missing description targets and no mismatched full-source text. Screenshots/contact sheets and scoped visual review found no material clipping. **0 page errors and 0 external requests** were observed. These archived captures predate the polish single-line inputs and do not validate the current mobile submit bar.

“mock-success” means an intercepted synthetic HTTP 201 from a submit-enabled fixture (`mock:false`, `cached:true`); a `mock:true` draft cannot submit. Browser interactions also verify estimated-age entry, Bangla digits, chip-date unapplied notice, night year rollover, incremental HH:mm typing, submitted payload, single success badge, no auto-navigation and mock dispatch refusal. Expiry removes fields and focuses its replacement notice.

No physical phone/voice test, screen-reader session, browser matrix, computed contrast audit or live API/DB integration is claimed.

## Review gate and history

Round-3 verdict relabelled: **Sol self-review (not the release gate); release gate pending**. The supplied release gate blocked round 2; full-source mitigation remained broken under the excerpt design and is restored in round 4. The lead’s no-grace retention decision supersedes earlier attempted-retention advice.

Round-4 verdict: **Sol self-review (not the release gate); release gate pending**. Used TDD, React patterns, Impeccable and the verification-loop checks. Read-only TypeScript/React review found partial-time suffix leakage and mobile colon-entry friction; both were fixed and the React reviewer rechecked them. Bengali technical review found no actionable issue; human copy approval remains pending. Scoped Impeccable finish review inspected every requested capture and found no material fix. These are implementation reviews, not an independent release safeguarding gate. No new release-gate acceptance is claimed.

## Decisions and remaining limits

- **OD-022-9 / OD-021-7:** four-round extracted drafts continue to S-003 per D1 STORY-003 AC2 and D3:69; D3:483 conflicts and needs spec-owner reconciliation. No extraction means no review handoff. Spec copies remain unchanged.
- **OD-022-10 — lead decision, 2026-10-16:** readable attempted and non-attempted drafts expire at **24 h with no grace period**, or earlier if the provider expiry is sooner. Saves never extend expiry. E-019 clears the device record; timer/visibility/pre-submit expiry also remove React fields. S-001/S-002 sweep on every mount; S-003 owns its restoring read so cold reload can explain expiry. The shared-device retention policy is decided, not open. **Trade-off:** if a request reached the server but its success was lost, expiry/E-019 removes the local UUID/payload and therefore the device retry reference; the server case is unaffected, and a fresh report can duplicate it. Storage is plaintext and browser-profile shared, not session-bound. `localStorage` compare/write remains non-atomic across tabs.
- **OD-022-10 deletion rules:** malformed JSON is deleted; schema-invalid non-attempted records are deleted; a schema-invalid record carrying `attempted:true` and a valid attempted UUID is kept for explicit recovery/discard; storage that throws is kept. A failed removal cannot guarantee deletion: the screen removes fields and shows a cleanup warning. Parseable, schema-valid records expire without an attempted exemption; future-saved records are also rejected as clock-invalid.
- **OD-022-11:** S-003 shows the parent's FULL source text beside every pre-filled field (TASK-013 OD-013-11/14/16). Lead decision 2026-10-16, fix round 4: round 2’s excerpt design was reverted; round 3 retained that now-rejected design. The top standalone full-text block is removed; each unedited prefilled value carries full canonical text with its original span highlighted. Extra/unsent handoff words appear once below the fields. Evidence offsets remain verbatim.
- **OD-022-12:** S-004/report and S-005/manual integration remain unavailable on this base. Their S-003 destinations are labelled planned text. No report auto-navigation is claimed; a metadata-only submitted reference supports return to the screen. Current remote PR status was not queried.
- **OD-022-13:** new Bangla locale strings are marked `needs human Bangla review`. Technical Unicode/numeral review passes; human copy approval remains pending.
- **OD-022-14 — OPEN until TASK-009:** district is still a synthetic code, now labelled `[MOCK]` beside the district label. The named selector depends on TASK-009; never guess a district. Actual time UI uses a chip date, controlled part-of-day radios, and three always-visible date + HH:mm control pairs plus approximation checkbox. Bangla mode localizes digits; code composes `+06:00`. A chip date with no chip has an unapplied notice. Night future upper bounds clamp to now with a clarification note. No ISO input/hint or native date input is displayed.
- **OD-022-15:** frozen UUID/payload persistence and guarded replacement/new-ID transitions remain. Failed persistence blocks unsafe identity changes; failed reference save retains the retry record only until the same expiry bound. Memory-only reload recovery and cross-tab lost updates remain limitations.
- **OD-022-16:** mock preview refuses dispatch both in UI and handler. Synthetic/mock/cached labels remain visible where applicable. No server/API/session/tombstone decision in OD-022-1–8 or OD-015-4 is changed here.
- **OD-022-17:** `PART_OF_DAY_RANGES` is defined once in code, with the requested `ponytail:` comment marking lead working ranges pending human review: morning 06:00–12:00; midday 12:00–15:00; afternoon 15:00–18:00; evening 18:00–20:00; night 20:00–06:00 next day. Working mappings are implemented and tested; final human range/copy review remains pending. Physical phone/voice, screen reader, full client-to-DB TC-004/031 and S-004/manual acceptance remain unverified.

Changed files are limited to the brief's allowed intake runtime, locale, tests, evidence and TASK-021/TASK-022 tracker surfaces. No dependency, contract or spec changes; no commit or push.

## Polish round (2026-10-16)

PA4 scope only: review components, locale, scoped tests, this evidence and the worker's single Obidit tracker log entry. No tracker row, dependency, contract, API, server or spec change. No commit or push. Current review prepares the implementation for the lead's gate; it does not pass the release gate.

| Brief item | Result and regression evidence |
|---|---|
| Sex picker | Done. Unknown radio uses `unknownValue` in Bangla and English; empty text fields keep `reviewUnknownAdd`. `tests/ui/review-screen.test.ts`: “PR1: sex radio unknown option…” checks both locales. |
| Date labels | Done. `timeDateShort` is “তারিখ” / “Date”; group date labels use it while the chip date keeps `timeDateLabel`. The Bangla key is marked `needs human Bangla review`. Static “PR2: chip date label…” checks labels and legends remain unchanged in source. |
| Single-line fields | Done. Name, phone, place and district use inputs; phone keeps tel input mode/autocomplete. CR/LF are removed from edit values; long text fields retain textareas. Static PR3 and `tests/intake/review/review-fields-regressions.test.ts` PR3 cover input types and newline handling. Native text inputs may remove pasted line breaks before React receives them; the guarantee is that line breaks are never stored. |
| Mobile submit | Done. One submit button in a sticky bar below 600 px (`max-[599px]`, exclusive of the 600 px desktop layout); `display:contents` on the card lets the form contain it, so it needs no extra list padding. Safe-area: `pb-[max(0.75rem,env(safe-area-inset-bottom))]`; checkbox stays in flow outside the bar; target `min-h-11`+. | `tests/ui/review-screen.test.ts` “PR4: one responsive submit bar…”. |
| Evidence paths | Corrected. Every archived round-4 log citation now retains its actual `s003-r4-` filename under the orchestration logs directory. These historical logs are distinct from the current polish checks. |
| Tracker | Done. Only the added Obidit log entry changes; the task row remains untouched and in progress. |

## Sonnet takeover review (not the release gate)

Sol's review stopped at its usage limit; its figures in earlier text were not relied on. Changes made in this review: removed the `focusin`/`scrollIntoView` handler (`src/app/globals.css:306` already applies `scroll-padding-block` from `--sticky-bottom`, so native focus scroll clears the bar); removed the form `--review-submit-height` variable and form bottom padding (the sticky bar is the form's last child, so it reserves its own space); `--sticky-bottom` is now written on the root only while the bar is sticky and is restored or removed on unmount; mobile breakpoint changed from `max-[600px]` to `max-[599px]` so it does not overlap `min-[600px]`; newlines in single-line fields are removed, not replaced by a space. The generic textarea branch is kept because marks, clothing, circumstances and thana still need it. Tests: `tests/intake/review/review-fields-regressions.test.ts` (newline strip; `--sticky-bottom` set, tracked, zeroed when not sticky, restored and removed on unmount).

| Check | Exit | Result |
|---|---|---|
| `npm run lint` | 0 | no findings |
| `npm run typecheck` | 0 | no errors |
| `npm test` | 0 | `Test Files  80 passed | 8 skipped (88)`; `Tests  2027 passed | 162 skipped (2189)` |
| `npm run build` | 0 | `✓ Compiled successfully in 612ms` |
| `npx vitest run tests/intake tests/intake-ui tests/ui/review-screen.test.ts` | 0 | `Test Files  24 passed (24)`; `Tests  674 passed (674)` |
| `git diff --check` | 0 | no output |

The argon2 timing flake did not occur in this run. Not verified: real-browser rendering after these edits (earlier Sol browser captures predate them), physical devices, screen readers.
