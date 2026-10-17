# TASK-021 evidence: SCREEN-001 welcome and SCREEN-002 intake

Owner: Obidit · Lane: `obidit-intake-ui` · Branch: `phase2--obidit-intake-ui`, base `0617b4c` · Initial implementation: Claude Code, 2026-10-15 · Review fixes: Codex, 2026-10-16; round-2 fixes: Claude Code takeover, 2026-10-16; round-3 fixes: Claude Code, 2026-10-16; round-4 sequence: Antigravity worker, then Haiku supervisor, then Codex Sol (interrupted at its usage limit), then Sonnet takeover, then fera-safeguarding PASS (round 4), then impeccable finish "fix" with two items, then G13 (2026-10-16, Asia/Dhaka).

Linked requirements: TASK-021, COMP-024–027/046/048/050, FR-001/002/004/005/007/033, BR-004/008/023, TC-001 (UI steps only), TC-026, TC-060 (UI side), D3 SCREEN-001/002 and §7, D4 §10/13/15.1, DESIGN.md Paper and Fera overrides.

Synthetic only. Uncommitted; no commit, push, PR, deployment, provider or database call was made in this fix round.

## Done-when status

**Phone voice test NOT MET. “Voice and text paths work on phone” is NOT MET.** No real phone or real microphone recording was tested. API-001/002 are not implemented in this checkout. The default client remains a visibly labelled `[MOCK]` local fake; its transcription returns E-011 instead of inventing speech. Mocked browser-media unit tests establish cleanup and cancellation behavior, not actual phone compatibility. Real phone voice, provider integration, Playwright/axe, screen-reader and forced-colours walks remain pending.

## Current implementation

- S-001 `/`: full D4 §10 limits/emergency line, exact D4 §15.1 provider notice, review-before-submit and verified-officer copy, synthetic label, 48 px Start and `tel:13219`. Start acknowledges only in a plain client click handler; its description references one short review-before-submit line.
- S-002 `/intake`: notice gate, synthetic/`[MOCK]`/cached labels, labelled conversation with live announcements off, focused follow-up questions, editable transcript/text, outlined tap-to-record control, neutral catalogue errors, one filled Send primary, summary, labelled planned destinations and in-page discard confirmation. No report is submitted here.
- The draft lives in component memory; notice and handoff live in client module memory. A hard reload shows the notice again. S-003 `/intake/review` (TASK-022) and S-005 `/intake/form` (TASK-025) are planned destinations and currently reach S-016. The handoff includes the latest extraction, missing fields and source text, including pending/unsent answers. Consuming screens must be client components and cache their single `takeHandoff()` result with the documented StrictMode-safe ref/lazy initializer guard.
- The fake accepts complete supported messages: finite synthetic example names, explicit sex, complete exact-year age clauses (unlabelled age is accepted only in the first message or in answer to the age question; labelled age is accepted everywhere) and full labelled 11-digit 01… phone values (or a complete phone-question answer). Mixed Bangla/ASCII digits are accepted. Any unsupported clause or question makes that message unknown; conflicting claims never select a winner. An unsupported continuation clears extracted facts/evidence and offers the manual form, preserving all original words; exact allowlisted “don’t know” answers only advance the current question. Names are compared in NFC, while original values and UTF-16 evidence remain unchanged. Clothing, places, district resolution and time stay unknown. Overflow also offers manual entry without truncation. It is an interface fake, not an AI-quality result.
- The summary has 14 display rows: Bangla-script/general name, Latin name, exact age/range, sex, height, clothing, marks, last-seen time/window, place, thana, district, circumstances labelled as the parent's own words, reporter relation and phone. Compound contract paths (age bounds and time endpoints/approximation) are grouped in their corresponding row; all `DraftFieldPath` values have labels in a full `Record`. Unknowns read “অজানা”. Code-only districts read unknown. Both time-window endpoints render when exact time is null.
- HTTP mode is selected by server-page `FERA_INTAKE_CLIENT=live`. It sends multipart audio (`audio`, `kind`, `duration_s`, optional token) or JSON to fixed same-origin endpoints; strict response/error schemas protect the UI. It does not implement server processing.

## Review round 1 (Claude fera-review + Codex)

The interrupted Claude edit left useful partial changes alongside an unwired recorder helper and stale tests. Baseline: typecheck failed on removed locale keys; intake tests were 132 passing / 8 failing. Codex kept valid changes and completed all numbered requests.

| Item | Finding and fix |
|---|---|
| 1 | Capture uses a mounted/lifecycle ref, per-session cancellation, and a timer ref. Pending permission after unmount releases every track. Constructor/start/error paths release tracks and intervals. Recorder errors use recoverable catalogue E-021 copy. Stale/duplicate events cannot send. |
| 2 | The in-flight AbortController and timeout are held in refs. Confirmed discard, actual unmount and plain manual/slow/planned navigation abort requests and invalidate generations. Late responses are dropped; unsent text survives handoff. |
| 3 | Removed canned child values and invented speech. Every recognised value has a source span; unsupported values stay null/unknown. Added name-guess, age-unit/range/precision and phone-substring regressions. |
| 4 | Conversation live announcements are off; focus announces questions. Textarea descriptions include current question, error, example and limit as applicable. Tab on the focused question goes to the textarea. Parent messages/free-text values have script-aware `lang`. No H1 focus on a hard-load notice. Validation errors are alerts; the character limit has a live status. Disabled primary/tertiary styles are visible. Start has a short description. |
| 5 | Send is the sole filled primary while composing (D3 permits record or type, then Send; D4 requires the mic above the text box). The mic disc is outlined and stacks above copy below 24 rem. Example copy is a composer hint, outside the conversation. Idle status/alert nodes stay mounted but out of layout. E-022 appears and is announced once. |
| 6 | Full D4 emergency line and matching English; no district-code copy; plain record hint; matching text labels; removed dead typeInsteadAction; “প্রতিবেদন” and “অন্য কিছু”. New Bangla strings are marked for human review. |
| 7 | Removed window.confirm. Nonempty discard opens an in-page, nonmodal labelled group with “রাখুন”/“মুছুন”, initially focusing Keep. Escape/Keep preserves text and restores discard focus. Empty discard skips confirmation. Recording stops before the panel opens; requests remain in flight until deletion is confirmed (round-2 R3). |
| 8 | Bare status mappings: 413→E-008; 401→E-002 (an explicit E-019 envelope is preserved); 503→E-013 extract/E-011 transcribe; 422→E-012 extract/E-010 transcribe; non-JSON 2xx→E-021. Complete field-label Record includes height/thana/circumstances/relation. |
| 9 | Handoff and acknowledgement side effects run only for plain primary clicks; modified/middle clicks preserve current work. Client-only `acknowledgeNotice` and guarded once-per-consumer handoff guidance are documented in code. |
| 10 | Added omitted summary fields, a separate Latin-name row, and approximate time-window rendering. No known Latin name is hidden by the Bangla name. The “every field” claim above now names the grouped display rows and excludes metadata. |
| 11 | OD-021-7 resolved toward S-003 per D1 STORY-003 AC2; A8 SC2 offers reviewAction with mandatory unknowns marked unknown. D3:69 agrees; D3:483 conflicts. |
| 12 | OD-021-8 records server ownership of the six-paid-call cap. No client retry cap added. Retry guards prevent concurrent calls, including repeated activation before React rerenders. |
| 13 | Every unbuilt form link, including ghost and slow links, carries the planned label. Built S-003 review actions use plain primary links with no Planned label (round 3). |
| 14 | Capture snapshots a consent epoch plus mounted/lifecycle state. Discard, unmount and new acknowledgement invalidate old continuations. Permission resolution, recorder events, timer/auto-stop and upload entry check validity; stale audio is dropped. Exact discard → new intake → late permission regression observes zero fetches. |

Review also found and fixed: StrictMode effect replay reusing an aborted capture signal; E-019 Start again clearing consent but resetting to compose; an old cancelled permission clearing a newer timer; duplicate queued stops; premature “sending” for locally rejected short audio; UTF-16 slicing through Bangla names/source; and manual handoff losing unsent follow-ups. Sending is announced only while a request is actually busy.

Design choices: keep the established Paper system and nonsticky composer so enlarged text does not cover focus. Script detection assumes Latin letters are English, gives mixed Bangla/Latin text a Bangla tag, and leaves neutral punctuation/ASCII digits untagged; this is a documented limit, not language identification. No shared shell, contracts, schema, spec pack or other owner's runtime files were edited. `.serena/` was ignored. No dependency was added.

### Tests and check evidence

Tests were written/run before each testable new fix. The recorder, request/discard, StrictMode/restart, fake truthfulness and handoff regressions were observed failing for the intended behavior, then passing. Existing partial fixes already correct at baseline received regression coverage without being deliberately broken.

`npx vitest run tests/intake-ui` (round-1 count; later rounds are below): **200 passed**, 8 files (+60 over initial 140): machine 29, recorder reducer 6, client/fake 29, summary/handoff 7, server markup 9, locales 96, recorder lifecycle 11, chat lifecycle 13. Fakes and the dependency-free Node hook/event harness live only under tests or `src/lib/intake/fakes`. The harness tests effects, refs and event logic (including explicit setup/cleanup/setup replay); it does not emulate DOM focus, layout or React's scheduler.

Round-1 verification, 2026-10-16 (historical; final Sol results are below):

| Command | Result |
|---|---|
| `npm run lint` | PASS, no warnings |
| `npm run typecheck` | PASS |
| `npm test` | 1133 passed / 1 failed / 117 DB skipped, 52 files. Sole failure: existing load-sensitive `tests/auth/sign-in.test.ts` timing ratio 2.13 against <2. Auth files untouched. |
| `npx vitest run tests/auth/sign-in.test.ts tests/auth/password.test.ts --maxWorkers=1` | PASS, 18/18 in isolation, as requested for the known timing flake |
| `npm run build` | PASS after the full-suite timing failure; includes `/` and `/intake` |
| Scoped forbidden-import/storage/logging/unsafe-HTML scan and `git diff --check` | PASS |
| Coverage | Not measured; no coverage provider/dependency added; Fera has no vendored 80% gate |

An earlier full run before review follow-ups passed 1118 tests with 117 skipped and built successfully. The latest full-suite result above is retained honestly rather than replaced by that earlier green run. Database skips do not establish database acceptance.

### Browser evidence

Production build served with `npx next start -p 3210`, system Chrome headless in a temporary profile (no Playwright, no new dependency). Round-1 captures (superseded by the round-2 set below) taken before the Codex cutoff and inspected by the Claude takeover worker (T1): 23 PNGs (22 measured in `browser-checks.json`, plus one CLI notice shot) in `/tmp/claude-1000/-home-obidit-secondBrain-coding-Fera-AI/50a826f0-3489-4066-a4c3-c910ac591020/scratchpad/shots-r2/` covering S-002 notice, compose, short-error, no-microphone E-022, limit, question, manual and discard at 360 px, 320 px with 200 % text, and 1280 px. Recorded horizontal overflow is 0 for all 22 measured shots. Only the 320 px E-022 image was viewed by eye. These files are in a session-temporary `/tmp` scratchpad, not in the repo, and may disappear. This is not a real-phone test.

### Review status and deferrals

Review history: round 1 TypeScript, React, Bangla, accessibility and security reviews passed after fixes (production dependency audit 0 vulnerabilities). **Round 2:** Sonnet-high review PASS with WARNs (R1-R5); safeguarding review BLOCK (SG1 age regex, SG2 relation regex, SW1-SW4); silent-failure recheck BLOCK (B1 plus W1-W6, N1-N2); Impeccable finish review asked for a recapture. All are fixed or recorded below; **re-reviews are pending** (safeguarding, silent-failure, Impeccable). The security reviewer noted an existing dev-only ESLint dependency advisory; no dependency changes were made. Final review status will be updated after browser/evidence checks.

Deferred work has existing ownership: phone voice and live API-001/002 (TASK-014/020/036/038); real screen-reader/axe/forced-colours checks (TASK-034/038); durable draft restore, expiry and S-003/S-005 consumers (TASK-022/025); demo fixtures/cache (TASK-033); district-name data integration (TASK-009). None is claimed complete by these UI fixes.

## Review round 2 fixes (2026-10-16)

- SG1/SG2/R1: every keyword in the fake has Unicode word boundaries (age, relation, name descriptor list now includes নয়/না/no/not). Regression tests: `tests/intake-ui/fake-boundaries.test.ts` (village/page/Garage/Average/message, "my sons friend", "আমার ছেলের বন্ধু", negation names). Round 2 patched these with boundary regexes and a descriptor denylist; the round-3 safeguarding gate showed that this did not hold ("my son's friend", "teen-age 5", "Age 7, no 8"), so round 3 replaced it. The earlier claim that the whole fake was audited is withdrawn.
- SW1: a phone number is accepted only as the answer to the phone question or beside an explicit "my number/আমার নম্বর" label; a bare 01... number in the first message stays unknown.
- R2: the fake has no district lookup (a district answer stays unknown). A question that was answered and left unknown is not asked again; with none left the form takes over. Chrome check at 360 px: district asked once.
- B1/W1/N2: a microphone permission that never settles times out after 15 s (`PERMISSION_TIMEOUT_MS`, local choice, OD-021-10), cancels the session and shows E-021; only NotAllowedError, NotFoundError and SecurityError are final E-022; other errors are retryable. Diagnostics log the error name only.
- W2-W5: request errors log the name; applying a reply is inside the try; a refused run resets to the notice or ends busy; a recording that cannot be sent and a send during recording show a message.
- W6: round 2 logged parse error names or Zod issue paths. Sol found that rejected record keys in those paths can contain payload; the final diagnostic now logs only a fixed `ZodError` name (see Sol review).
- N1/R3: discard no longer aborts the request until "মুছুন" is confirmed ("রাখুন" loses nothing); the microphone stops at once. cancelRequest clears the retry record so cancelled audio is never resent.
- R4: pagehide and visibilitychange to hidden stop the recording and drop the audio unsent.
- R5: a one-sided time window shows "After/Before {t} (approximate)". New bn/en strings `timeAfter`, `timeBefore`, `recordingNotSent`, `finishRecordingFirst` need human Bangla review.
- SW2: nothing in this lane enforces BR-023's six-paid-call cap; that is server-side and unverified (OD-021-8).

Round-2 checks: lint 0, typecheck 0, build 0; `npx vitest run tests/intake-ui` 258 passed (9 files); `npm test` 1191 passed / 1 failed (known `tests/auth/sign-in.test.ts` timing flake) / 117 skipped; auth files alone with one worker 18/18. Round-2 captures (session-temporary, not in repo): scratchpad `shots-r3/`: S-001 at 360 bn, 320 at 200 % bn, 1280 en; S-002 recording, processing and after-voice (E-011) at the same widths; manual state at 360. Overflow 0 in every row of `shots-r3/browser-checks.json`. Fake media device in headless Chrome, not a real phone microphone. Viewed by eye: 7 images (360 S-001, 360 recording, 360 processing, 320 S-001, 320 recording, 1280 S-001, 1280 recording); the rest only measured.

## Review round 3 fixes (2026-10-16)

- F1 (safeguarding BLOCK, BR-008; pre-Sol behavior, superseded by Sol review and round 4; see the current implementation section above): the `[MOCK]` fake now uses an allowlist, not a denylist. Text is split into clauses (`, । ; . ! ?` newline). A field is read only when a whole clause has a strict shape: `নাম|name` + one or two letter-only words; `বয়স|age` + digits (+ বছর/years), or digits + বছর/years (+ বয়সী/old); `আমার|আমাদের|my|our` + ছেলে/মেয়ে/son/daughter/boy/girl (+ optional name); `লিঙ্গ|sex` + a sex word. Phone is unchanged. A negation or correction token (না, নয়, no, not, বরং, actually) in the previous, same or next clause makes the clause unknown (the brief said same or next; the previous clause is added so "not my son, my daughter Mina" is unknown). One small stop-word list remains for the name slot ("my daughter went missing" is not a name); it is a guard on a name, not the matcher. Recall is deliberately low. The attribution limit ("the fake cannot tell whose age it is") is mostly removed, because a clause that is not exactly a shape is ignored; a bare "age 7" is still the typist's claim about a child. Tests: `tests/intake-ui/fake-allowlist.test.ts` (checks sex explicitly, not only name). The earlier denylist boundary tests still pass except "my age 9,", which is now unknown by design.
- F2: Retry does nothing while the discard confirmation is open. F3: a recording dropped because the tab was hidden shows `recordingNotSent` (pagehide stays silent). F4: focus-moving effects are skipped while the confirmation is open. F5: `last` is cleared after a successful reply. Tests: `tests/intake-ui/chat-r3.test.ts`.
- Round-3 checks (2026-10-16): lint 0, typecheck 0, `npm test` 0 (1241 passed, 117 skipped, 51 files), build 0, `npx vitest run tests/intake-ui` 307 passed, 11 files.
- Round-3 captures are pre-Sol evidence, in `/home/obidit/secondBrain/coding/fera-lanes/_orchestration/shots/shots-r3/` (script `drive-r4.mjs`, `browser-checks.json`): S-001, and S-002 recording, processing (polled for the status text, no fixed sleep) and after-voice at 360 bn, 320 bn at 200 % and 1280 en, plus 360-bn manual; 13 images, overflow 0 on all. Looked at by eye: 1280-en processing and 360-bn manual only. Not a real-phone test.
- Review status: round-3 safeguarding and silent-failure re-reviews are pending.

## Sol review (2026-10-16)

**Verdict: PASS — ready for the safeguarding gate.** This is a Sol code/test review, not a safeguarding-gate approval or TASK-021 acceptance. **Phone voice test NOT MET.** The task remains `review`; live API-001/002, real-phone recording and human Bangla approval remain unverified.

### Measured checks

| Command | Exit | Measured count/result |
|---|---:|---|
| `npm run lint` | 0 | 0 errors, 0 warnings |
| `npm run typecheck` | 0 | 0 type errors |
| `npm test` | 0 | 1,312 passed, 0 failed, 117 DB skipped; 53 passed files + 4 skipped files |
| `npm run build` | 0 | Production build and TypeScript pass; 7 listed routes, including `/` and `/intake` |
| `npx vitest run tests/intake-ui` | 0 | 378 passed, 0 failed, 13 files |

Baseline before Sol edits also passed all five checks: 1,241 full-suite passes / 117 skips and 307 intake passes / 11 files. The argon2 timing flake did not recur in either final full-suite run; no auth-only rerun was needed. Coverage was not measured; no coverage dependency was added. DB skips do not establish DB acceptance. Console diagnostics generated by existing auth/audit failure fixtures are expected test output, not failed checks. Command logs are session-temporary `/tmp/sol-021-*.log`; the counts above are recorded here for durability.

### Adversarial cases, observed failures and fixes

Added 70 adversarial/strict-positive cases in `tests/intake-ui/sol-adversarial.test.ts`, plus one privacy regression in `sol-diagnostics.test.ts` (71 new tests total). The first adversarial run was RED: 42 failed / 19 passed. The diagnostic test separately failed, showing the synthetic payload inside the warning. A later reviewer recheck added nine cases: eight failed and one already passed before the final fixes. All 71 now pass.

| Probe family | Before Sol | Final behavior |
|---|---|---|
| Distant negation: `age 7, sex female, not sure about that age`; `বয়স ৭, নাম নুসরাত, না আসলে মনে নেই` | Filled the earlier age because only adjacent clauses were guarded | Complete unsupported message yields no facts |
| Zero-width negation/digits: `n\u200bot`, `ন\u200cয়`, `age ৭\u200b৮`, phone followed by ZWSP + another digit | Distant negation and phone substring could escape checks; split age already stayed unknown | Unsupported input stays unknown; no invisible-character deletion is used to create facts |
| Conflicting labels: `age 7, age 8`, `বয়স ৭; বয়স ৮`, `sex male; sex female`, two names or phones | Later field silently overwrote earlier field | Conflicting field and evidence stay unknown; contradictory explicit follow-up also clears the affected field |
| Name-slot narratives: `my daughter vanished`, `my son drowned`, `আমার মেয়ে অসুস্থ`, `name unknown`, `নাম অজানা` | Guessed names outside the stop-word list | Pure finite synthetic-name allowlist; unsupported message yields no name or inferred sex |
| Joined labels: `nameMina`, `নামনুসরাত`, `age7`, `বয়স৭` | Accepted without a label/value separator | Require whitespace or colon; unsupported shapes stay unknown |
| Negated/uncertain phones: `not my number 01700000001`, `আমার নম্বর ০১৭০০০০০০০১ নয়`, curly/ASCII `isn’t/isn't correct`, two possible answer numbers | Filled a phone from an arbitrary substring | Complete labelled clause or complete phone-question answer only |
| Phone suffixes: letters, `.5`, extra zero-width digit, Arabic-Indic digit | Filled the first 11 digits | Whole clause/answer fails; phone stays unknown |
| Curly apostrophe relations: `my son’s name Rafiq`, Bengali relation with ZWNJ | Already unknown | Remain unknown, with explicit sex checks |
| Questions: `age 7?`, `sex female?`, `name Mina?`, `বয়স ৭؟` | ASCII question punctuation was discarded and facts filled; U+061F already stayed unknown | Both question marks rejected as assertions |
| Unsupported corrections after a valid reply: `age is not 7`, `age 8, not sure`, `that is wrong`, `আগের তথ্য ভুল` | Retained earlier filled age/evidence | Drop extracted facts/evidence, preserve original source and offer manual form; exact allowlisted unknown answers preserve unrelated facts |
| Strict positives: `আমার মেয়ে নুসরাত`, `my daughter Mina, age 7`, `নাম: নুসরাত জাহান`, NFD `মীম`/`কোয়েল`, `৭ বছর`, mixed `০7` / `1৭` ages | Existing shapes worked; mixed phone prefix `0১`/`০1` was missed | Strict positives read, mixed phone prefixes normalize correctly, and every evidence quote slices the original UTF-16 source exactly |
| Malformed response evidence key containing synthetic child payload | Zod issue-path diagnostic leaked the arbitrary key | Error-name-only `intake response: ZodError`; no key, quote or value logged |

**Name-slot decision:** the small stop-word guard was unsafe (reproduced above). It was replaced with eight synthetic example names: নুসরাত, নুসরাত জাহান, মীম, রফিক, কোয়েল, Mina, Rafiq, Mim. Other names stay unknown. Unsupported text anywhere prevents new extraction; unsupported continuations fall back to the form. This deliberate recall loss follows the lead’s “recall does not matter; never guessing does” decision. The existing generic client request fixture contains narrative; its fake-client smoke test now uses a strict positive input. No contract fixture was edited. Fake recall/quality is not measured.

### Privacy and parent rules recheck

- Read-only React review plus recorder/request tests trace track/timer release on unmount, discard, navigation, constructor/start/error, permission timeout and late permission resolution. Confirmed deletion aborts the request and invalidates late continuations; no later audio upload is allowed. Opening the panel stops the microphone, while Keep preserves the request. Retry checks `confirmingDiscard` and is inert while the panel is open.
- Hidden-tab and pagehide events cancel/drop audio; hiding the tab also announces `recordingNotSent`. The 15-second permission timeout restores the composer and releases any late stream. Targeted lifecycle/recorder run: 52/52 passed, 4 files. Custom hook/media tests do not emulate actual browser permissions, child mounting, DOM focus or React scheduling. The injected reducer-throw test is not proof that React catches reducer errors inside dispatch’s caller.
- Fixed the one additional privacy bug found: schema issue paths can contain arbitrary evidence keys. The response diagnostic now uses the fixed error name only. Other scoped diagnostics contain error names, not message/body/audio. No client import of server modules, browser storage, unsafe HTML, red/danger class, countdown or flashing was found in the parent/intake scope. No UI string was added; bilingual locale tests pass. Parent controls use ≥44 px targets; recording/status/error components pair icon, text and semantic colour. Bangla remains the default.
- Impeccable scoped detector: exit 0, no findings (palette note only). Existing round-3 capture inventory verified: 13 PNGs, all 13 recorded overflow values are 0; `browser-checks.json` marks two images as previously viewed. Sol additionally viewed the existing 1280-en processing and 320-bn-200 recording images. These are **pre-Sol captures**, not new browser measurements; no visual/TSX changes were made by Sol. No phone, screen-reader, axe or fresh end-to-end browser run is claimed. The broader Impeccable audit dimensions were not fully measured/scored.
- Read-only TypeScript parser recheck passed after both reproduced blockers were fixed; it independently ran the 71 new tests (exit 0). Read-only Bengali review approved the bounded fake scope and independently ran all 70 adversarial/positive cases (exit 0), confirming NFC/original-span handling and mixed digits. No further concrete blocker found. This is not human Bangla approval. Safeguarding and other previously pending gate re-reviews are still pending.

Files changed by Sol: `src/lib/intake/fakes/fake-client.ts`, `src/lib/intake/client.ts`, `tests/intake-ui/client.test.ts`, new `tests/intake-ui/sol-adversarial.test.ts`, new `tests/intake-ui/sol-diagnostics.test.ts`, this evidence file and the TASK-021 row/log in `PHASE_2_MUST_CORE.md`. The surrounding uncommitted implementation predates this review. No dependencies, frozen/shared runtime files, commits or pushes were added.

## Review round 4 fixes and G13 final polish (2026-10-16)

Round-4 sequence: Antigravity worker, then Haiku supervisor, then Codex Sol (interrupted at its usage limit), then Sonnet takeover, then fera-safeguarding PASS (round 4), then impeccable finish "fix" with two items, then G13.

- 1 (safeguarding BLOCK, BR-008): unlabelled age shape `N বছর` / `N years` / `N years old` is accepted only in the first message or when the current question is the age question (`asked === undefined || asked === "child.age_years"`). An unlabelled age clause answering any other follow-up question (such as the last-seen question) is rejected and remains unknown, with no evidence span. Labelled age (`age` / `বয়স` + N) remains accepted everywhere. Added reproducer and tests in `tests/intake-ui/fake-allowlist.test.ts` for "২ বছর", "2 years", "৫ বছর", and "3 years old".
- 2 (impeccable finish & G13): while `busy` (a clip is sending), `VoiceRecorder` renders an uploading state inside the recorder card with a spinner (`LoaderCircleIcon`) plus `t.sending` ("পাঠাচ্ছি…" / "Sending…") in readable `text-body-lg text-body`. G13 polished this to show exactly ONE message (removing the duplicate label line, replacing it with `sr-only`), pointed `aria-labelledby` at the stable label `t.recordAction` so the focused button's accessible name does not change to a second "sending" string, kept the round button disabled, and preserved the sr-only `aria-live="polite"` status announcement. `intake-chat.tsx` avoids duplicate status during audio transcribing while preserving the slow-status timeout message.
- 3 (narrow column layout): in the narrow column layout (below 24rem), `VoiceRecorder` centers text (`text-center`, and `justify-center` on the status row) so the label does not jump when recording starts.
- 4 (voice-off label): when `state.voiceOff` is set, the textarea label in `intake-chat.tsx` uses the new locale key `typeHere` (bn: "এখানে লিখুন", en: "Type it here") instead of `textLabel` ("Or type it here").
- 5 (follow-up question child name interpolation): follow-up questions use the child's name when known as specified in D3 COMP-009 (`"{নাম}-কে শেষবার কোন জেলায় দেখা গিয়েছিল?"` and `"When was {name} last seen?"`), and fall back to `"শিশুটিকে…"` / `"the child"` when unknown. Implemented via helper `src/lib/intake/questions.ts` (`formatQuestion`) without building strings inline in components. Unit and integration tests added in `tests/intake-ui/questions.test.ts`.
- 6 (recorder instruction typography): raised recorder instruction text in `VoiceRecorder` from `text-body-sm text-mute` to `text-body-lg text-body` (18 px). That is what the code uses.
- 7 (provider notice heading alignment): changed heading row from `items-center` to `items-start` and added `mt-[0.3em]` icon offset on `InfoIcon` in `ProviderNotice` full variant to match the compact variant.

Round 4 review by Claude Sonnet 5.5 (takeover for the Codex Sol reviewer, 2026-10-16). Fixed: 10 `no-explicit-any` lint errors and the TS2345 in `sol-adversarial.test.ts` (already resolved in the lane when I ran the checks); the Bangla `messageSending` string now carries the "needs human Bangla review" marker; unknown-name fallback words ("শিশুটিকে", "শিশুটির", "শিশু", "the child") moved from `src/lib/intake/questions.ts` into locale keys `questionChildObject`, `questionChildPossessive`, `questionChild` (test written first, failed, then passed). Checks: `npm run lint` exit 0; `typecheck` exit 0; `npm test` exit 0 (55 files passed, 4 skipped; 1394 tests passed, 117 DB skips); `build` exit 0; safeguarding probe `context-age` 4/4 passed. No argon2 flake seen. Not verified: no fresh browser run of the round-4 visual changes (items 2, 3, 6, 7); no human Bangla review.

## Open decisions

- **OD-021-1 Routes:** `/intake`, `/intake/review`, `/intake/form` are local choices for TASK-021/022/025 to agree.
- **OD-021-2 Multipart:** `audio` is the proposed API-001 multipart part; TASK-014 must agree.
- **OD-021-3 Human Bangla review:** every new/round-1 Bangla string in `src/locales/index.ts` remains flagged for human review. Automated bilingual/Unicode checks and the Bangla agent review passed; human approval is UNKNOWN.
- **OD-021-4 Handoff/restore:** module memory only; no durable restore or refresh recovery. S-003/S-005 must be client components and consume/cache `takeHandoff()` once using the documented guard. TASK-022/025 own persistence and expiry.
- **OD-021-5 Fake default:** preview/deploy default remains a labelled literal-only fake until TASK-014/020. No real AI extraction/transcription claim is made. Team acceptance of that preview default is UNKNOWN.
- **OD-021-6 Icons:** parent-only Lucide wrappers stay local; moving them into the shell's shared icon file requires the shell owner.
- **OD-021-7 Conflicting four-round exit:** resolved toward S-003 per D1 STORY-003 AC2; D3:69 agrees with S-003; its conflict with D3:483 is noted for the spec owner. S-002 manual exit offers reviewAction to S-003 with unresolved fields marked unknown, while the S-005 manual destination remains visibly Planned. S-003 review actions are plain primary links after extraction; the round-3 tests in review-submit-ui.md verify the handoff.
- **OD-021-8 Paid calls/retries:** the client has no total retry cap. BR-023's ≤6 paid calls relies on TASK-014/020 plus TASK-063 `reserve_ai_call` and atomic server reservations. Retry is disabled/guarded while in flight; UI retry prevention is not the authoritative spend cap. Server enforcement was not verified here.
- **OD-021-9 District display:** the client does not have the server district-name catalogue. A known code without a resolved name displays unknown, never “district code N”. TASK-009/022/025 must agree how named district data reaches parent screens.
- **OD-021-10 Permission wait:** no pack value exists for how long to wait for the microphone prompt; 15 s is a local choice awaiting team confirmation.
- **OD-021-11 Round-2 Bangla:** the four new strings above are unreviewed by a human Bangla reader.
- **OD-021-12 Fake vocabulary/fallback:** the eight-name repertoire and immediate manual fallback after unsupported continuations are local conservative choices; a bare "name X" is accepted only because names are limited to the eight synthetic names. The lead should confirm this limited demo behavior or extend it with explicit synthetic fixtures/tests. This is not production extraction and does not establish arbitrary-name recall.
- **OD-021-13 When-last-seen Bangla name template:** D3:86 gives the when-last-seen template a {name} in English but none in Bangla; code copies D3 exactly; whether the Bangla should include the name is for the human Bangla reviewer and the spec owner (no copy invented).
- OD-021-14: guard locale-scan exempts only welcomeNoAlerts (D4 §10 negated disclaimer); proposed by Obidit (task owner) 2026-10-16; TASK-023 is also Obidit's; safeguarding gate accepted it as honest copy
