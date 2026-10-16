# TASK-013 evidence — LLM adapter (COMP-007)

Owner: Obidit · Lane: `obidit-llm` (Codex), branch `phase2--obidit-llm` · Date: 2026-10-16 (Asia/Dhaka) · Committed on `phase2--obidit-llm`: TASK-013 base at `68fffda` plus merge `2bca467` of `origin/phase2`, with round-7 to round-10 edits on top. Stacked on TASK-012 / PR #18 already present in this worktree. Links: FR-004/026, BR-004/008/023, D2A §2.1/COMP-007/DECISION-004, D2B §13 E-012/013/014, D5 §6 ExtractInput/ExtractOutput, D6 TASK-013, TC-002/017/027/028, and TC-014's injection boundary.

Synthetic fixtures and `[MOCK]` providers only. No provider SDK, real provider/model identity, account, key, price, dependency, network call, database call, persistence, commit, push, PR or deployment was added. No `.env*` file was read. Frozen contracts/schema/spec pack and the stacked normaliser were not changed.

## Status against “Extracts 10 sample texts; fallback test passes”

**Current status (2026-10-16, round 10): review.** Round 10 removed bare `cant`/`wont` (+3 fix8 cases): `npx vitest run tests/ai` 11 files, 535 passed; `npm test` 1,912 passed / 162 skipped (the safeguarding gate reproduced the argon2 timing flake OD-013-6 in 4/4 full runs under load: 1911 passed / 1 failed; `tests/auth` alone 176/176). Round-9 state follows: Round-7 logger integration (OD-013-15) is in place; round-8 WARN fixes (hedge spelling variants, same-field earlier qualifier, raw error cause, README/OD updates) all green; round-9 follow-ups (cause-on-ok:false, mislabelled control, English negation forms incl. U+2019, NUMBER_OW_HEDGE on `uncertaintyText`, same-field scan for unlabelled facts, comment fix) all green. TC-002 reproduced at adapter level with scripted [MOCK] providers only; real provider, UI, latency, provider notice and paid-call integration unverified; S-003 full-text mitigation not built (TASK-022). `npm run lint` exit 0; `npm run typecheck` exit 0; `npm run build` exit 0; `npm test` exit 0; `npm run test:db` exit 0 (162/162 across 8 files; see "Round 9 measured" below); `npx vitest run tests/ai` exit 0 (11 files, 532 passed / 0 failed — was 513 before round 9, +19 fix8 cases); `npx vitest run -c tests/ai/sol-policy.config.mjs` exit 1 (5 RED by design, OD-013-11, was 3 before round 9, +2 new rows). No argon2 flake in the round-9 run. This supersedes the round-7 A7 wording and earlier readiness/verification-pending wording; historical runs are kept above.

## What was built

| Area | Files | Notes |
|---|---|---|
| Public seam and contracts | `src/server/ai/index.ts`, `types.ts`, `contract.ts` | Provider name + `extract(request, { signal })`; required injected `dispatch(provider, request, { signal })`; D5 output shape derived locally from frozen draft validators, excluding name_latin/district_code and route metadata. Strict unknown-key rejection. Per-field EvidenceSpan validation allows invalid evidence to drop only that fact. |
| Adapter | `src/server/ai/adapter.ts` | Temperature 0; primary → one repair only on invalid output → one fallback. Outage/timeout goes directly to fallback. E-012/013/014 envelopes, fixed caller AbortError, bounded dispatch even for abort-ignoring fakes, timer/listener cleanup, typed E-019/E-023 refusal stops immediately. Original source plus independently checked partials returned on failure. Safe logs contain slot/attempt, error ID/class/code/status, latency, the outcome (first `issues` entry), drop-reason counts and the summary tally; never field names or values. A broken sink cannot repeat a call. |
| Evidence/value support | `src/server/ai/evidence.ts` | Raw UTF-16 quote checks round-trip through the normaliser offset map. NFC direct comparison, complete graphemes, recomputed digits/phone/time derivations, explicit field context, complete numeric claims/ranges/units, source-wide supported-grammar contradictions, canonical phone/time comparison, unsupported fields unknown. No provider-supplied derivation is authoritative. |
| Prompt | `src/server/ai/prompt.ts` | Proposed `fera-extract-v1` and `fera-extract-v1-repair` templates, separate SHA-256 hashes, `needs_review` status. Fixed system instructions and JSON-encoded user data remain separate; tools empty, no URL fetching or decision authority. Exact prompt absent from pack: OD-013-1. |
| Consumer notes | `src/server/ai/README.md` | Integration API, supported grammar, safe error/manual handoff, timeout/mixed-failure proposals, spend-wrapper responsibilities and limitations. |
| Tests/fakes | `tests/ai/adapter.test.ts`, `evidence.test.ts`, `fixtures.ts`, `fakes/scripted.ts`, `fix1.test.ts`, `fix2.test.ts`, `fix3.test.ts`, `fix4.test.ts`, `fix5.test.ts` | 39 adapter + 61 evidence + 48 fix-round-1 + 111 fix-round-2 + 58 Sol review + 46 fix-round-3 + 31 fix-round-4 cases (394 passed); fix-round-5 tests added in `tests/ai/fix5.test.ts` (round 5 verified, see "Sonnet review, round 5"; `fix6.test.ts` now adds 65 tests including Sol regressions). Five semantic counterexamples preserved under OD-013-11: 3 RED in `tests/ai/sol-policy.probe.ts` (name cases) and 2 as gate-probe rows `own-age-sibling`, `own-cloth-father` (the probe file has 3 tests, so the 2 gate rows are not in its count). Eleven Bangla/English/mixed samples (the 11th is `TC-002-adapted`, TC-002 with an explicit name label, for the name path), including TC-002's text with `[MOCK]`; other inputs are labelled synthetic descriptions. Phone values reuse existing contract/normaliser fixtures. No paid call. |
| Evidence/tracker | This file; `docs/execution/PHASE_2_MUST_CORE.md` | TASK-013 row and Obidit log only. |

## Tests first and guarantees

Initial `npm test -- tests/ai` failed because `@/server/ai` did not exist; tests were written before production implementation. Runtime regressions were then added before each corresponding change: two conflict cases failed (68 passed / 2 failed), then field-context/repair tests failed (70 passed / 3 failed). The first full implementation passed 73/73.

Read-only reviewers then exposed incomplete numeric evidence and missed source contradictions. **Before the fixes, `npm test -- tests/ai` reproduced 18 failed / 75 passed (93 total)**. After fixes, that same command passed **93/93 at that point in round 0 (historical; superseded by the 317 regression count above)**, including truncated ASCII/Bangla digits, range endpoints, month/decimal units, unit-only ages/heights, all optional text-label separators, competing phones/times, and equivalent canonical spellings that must not falsely conflict.

| Guarantee | Evidence |
|---|---|
| Ten fake-provider samples retain exact raw source and valid spans; unprovided name_latin/district_code stay null | Parameterised 10/10 sample cases in `adapter.test.ts`; each result passes `caseDraftSchema` |
| One primary repair, exactly one fallback, no retry on outage; every attempt crosses injected seam | Dispatch-order assertions and three reservation-refusal positions |
| Strict output authority boundary; no extra status/questions/tool-call keys survive | Four extra-key cases; invalid output keeps only independently verified partial fields |
| E-012, E-013, E-014 and manual handoff are explicit | Invalid twice, both down, timeout and mixed-failure cases; source retained |
| Caller abort stops all attempts; timeout reaches provider signal and late output cannot replace fallback | Pre-abort, mid-call, abort-aware/ignoring fakes, timer cleanup and late-completion cases |
| Evidence failures drop facts instead of guessing | Malformed/missing/incorrect spans, literal-but-wrong value/field, NFC, surrogate/conjunct/join-control/nukta and numeric-prefix/range/unit cases |
| Supported contradictory source claims become unknown even when omitted by provider | Labelled/unit-only numeric claims, punctuation-free Bangla/English text labels, repeated phone/time cases |
| Unknowns/derivations remain honest | Unknown with evidence stays unknown; forged derivations cannot change a value; successful fallback nulls are not restored from invalid attempts |
| No child text, name, phone, prompt or provider name/message in logs | Captured allowlisted logs with TC-002's synthetic name and both numeral spellings; malicious provider names/errors; sink-failure case |

## Verification

All application checks use the installed lockfile/dependencies. `NEXT_TELEMETRY_DISABLED=1` was set for Next.js commands and full-suite runs. (Round-0/6 wording: "No SQL/DB code was touched, so `test:db` is not required or run" — **superseded by round 7/8/9**: `npm run test:db` runs as part of the standard measured set, exits 0 with 162/162 across 8 files, even though no SQL/DB code was touched in TASK-013 itself. The full `test:db` file-by-file breakdown is recorded in the "Round 9 Measured" section.)

| Command | Exit | Observed result |
|---|---|---|
| `npm test -- tests/ai` (round-0 scoped run; superseded by round 1 below) | 0 | 93 passed per the earlier record; the evidence file actually holds 61 cases (39 + 61 = 100), 7 more than the 54 first written down. Those 7 are parameterised numeric/label-punctuation/phone/time regression cases; which exact ones: UNKNOWN (untracked file, no history) |
| `npm run lint` | 0 | No errors or warnings |
| `NEXT_TELEMETRY_DISABLED=1 npm run typecheck` | 0 | Route types + TypeScript pass |
| `NEXT_TELEMETRY_DISABLED=1 npm test` (first two runs, 73 AI cases) | 1 each | Each: 1,099 passed, one failed, 117 skipped; 46 passed files / one failed / four skipped (51 total). Only failure: sign-in timing ratio 2.1743594572020246 and 2.7225564380578144 against `< 2`. |
| `NEXT_TELEMETRY_DISABLED=1 npm test` (after review fixes, 93 AI cases) | 1 | 1,119 passed, one failed, 117 skipped (1,237 total); 46 passed files / one failed / four skipped. Same auth timing test; ratio 2.3469644709204824. |
| `NEXT_TELEMETRY_DISABLED=1 npm test` (final rerun by Claude, 2026-10-16 01:13) | 0 | 1,127 passed, 117 skipped (1,244); 47 passed files / 4 skipped. Auth timing test passed this time (known load-sensitive flake). |
| `npm run lint` / `npm run typecheck` / `NEXT_TELEMETRY_DISABLED=1 npm run build` (final rerun) | 0 / 0 / 0 | All pass. |
| Fix round 1 (2026-10-16): `npm run lint` / `typecheck` / `build` / `npx vitest run tests/ai` | 0 / 0 / 0 / 0 | AI 148 passed (3 files) |
| Fix round 1: `NEXT_TELEMETRY_DISABLED=1 npm test` | 1 | 1,174 passed, 1 failed, 117 skipped (1,292); only failure: sign-in timing (argon2 flake, OD-013-6). `npx vitest run tests/auth` alone: exit 0, 176/176 |
| `npm run test:db` | — | Not run: no SQL/DB changes |
| Scoped network/secret/input scan | No runtime matches | Only URL match is the explicit `example.invalid` prompt-injection test. No SDK, env access, DB, spend import, file I/O or console logging in task TypeScript. |

Coverage percentage: **not measured**. Neither `@vitest/coverage-v8` nor `@vitest/coverage-istanbul` is installed. No dependency was added; D6's task criteria apply rather than the vendored generic 80% gate. This does not claim CI or production readiness.

## Fix round 1 (2026-10-16, Claude Code, after review)

Verdicts that triggered it: Sonnet-high review **PASS with WARNs**; silent-failure-hunter **BLOCK S1-S2**; safeguarding gate **BLOCK SG1-SG4** (all fixed below; re-review pending). Tests (`tests/ai/fix1.test.ts`, 48 cases) were written before the code; the new probes failed against round-0 code by the reviewers' reproduction and pass now.

| Item | Fix | Evidence |
|---|---|---|
| S1 | Only typed `ProviderFailure` (and timeout) is an outage; any other dispatch throw logs `outcome: unexpected` with error class/code, still E-013 plus manual form | `adapter.ts` catch branch; fix1 "S1" (3 tests) |
| S2 | `checkOutput`/merge throw is caught: E-012, manual form, `cause` kept (Zod errors replaced by a message-free Error), class logged, no further paid call | fix1 "S2" (throwing getter) |
| W1 | `dropped: {field, reason: type_mismatch/span_mismatch/uncertain/conflict}[]` on every result and in each attempt log; never-extracted fields absent | fix1 "W1" (3) |
| W2-W6 | `outcome: aborted`; one `ai.summary` with tally; E-001 `reason` zod/normalise_status/normalised_text_mismatch; `non_json`/`schema_mismatch`; `ai.log_failed` carries `err_name` | fix1 W2, W3-W6 |
| SG1 | `\p{M}` in unit/claim boundaries; reject tail starting `+ ? -এর এর বেশি কম over under more less plus` | fix1 "SG1" (10 + control) |
| SG2 | Added বা, সম্ভবত, মনে হয়, হতে পারে, নই, প্রায়, আনুমানিক, think, about, around (whole words, NFC-built) | fix1 "SG2" (12) |
| SG3 | ছেলে/মেয়ে accepted only before one digit-free word ending at `, । ;` or end of line | fix1 "SG3" (4 + 4 controls); TC-002 still passes |
| SG4 | Counts corrected (above); default `npm test` wording unified | this file, tracker row and log |
| SW1 | `ProviderDispatch` is branded; `brandProviderDispatch` is the only way in (tests and TASK-020 use it) | fix1 `@ts-expect-error` test; README |
| SW2 | Default sink is the project `createLogger` (redaction applies); slot/attempt in `rule`, reason/dropped/tally in `issues` | fix1 default-sink test |
| SW3 | OD-013-9 below; no contract edit | |

**Log events added to `src/app/api/_shared/log.ts` (only `LOG_EVENTS` names, flagged for the owner):** `ai.attempt`, `ai.summary`, `ai.input_rejected`.

## Review 0 (on the initial implementation, before fix round 1)

`fera-review` review 0: **BLOCK** from safeguarding, TypeScript, Bengali and security; failure-path reviewer **PASS**. All reviews were read-only, scoped to untracked task files. TypeScript reviewer also ran typecheck/lint and observed exit 0.

| Finding | Fix and tests |
|---|---|
| Numeric prefix/range endpoint can become a different exact age; months can be misread as years | Complete numeric source claims checked against quoted bounds; token suffix and unsupported-unit checks; labelled and unit-only alternatives compared. Nine numeric regressions plus unit-only height case. |
| Optional label punctuation bypasses text contradictions | Context and source-claim scans share label/separator grammar, including natural Bangla labels. Three English/Bangla/mixed punctuation regressions. |
| Competing phone/time facts omitted by the provider survive | Scan supported source grammar; revalidate/canonicalise each complete claim through normaliser and compare all results. Phone-prefix, repeated Bangla/English phone and relative/ISO time cases; equivalent-format controls. |

Fix-round-1 re-review: done, produced fix round 2 (below) (fera-review not re-run in this round). Cross-tool extraction second opinion (Claude reviewing Codex implementation) is **not run**: this session has no authorised network use/second-tool review channel. Lead review remains pending; no approval is implied.

## Fix round 2 (2026-10-16, Claude Code)

Triggered by the silent-failure recheck (SF1-SF3, SN1-SN2: WARN, no BLOCK) and the safeguarding re-gate (A1-A6: BLOCK, BR-008). Lead decision: replace the evidence denylist with an allowlist of strict shapes. Tests (`tests/ai/fix2.test.ts`, 111 cases) were written against the probe cases; the probe file was lost in a reboot, so cases were rebuilt from the fix list and the probe listing I had already read. Before the change the probe reported 36 wrongly kept cases; after the change none.

| Item | Fix | Evidence |
|---|---|---|
| A1 | Numeric facts: whole clause must be `[label] number [unit] [old/বয়সী/বয়স]`; comparator/tail denylists deleted; age_min/max need the `lo-hi` shape | fix2 numeric table (44 unknown) + keeps |
| A2 | Name only from নাম/name label, digit-free; ছেলে/মেয়ে never a name; ছেলে/মেয়ে sex only after আমার/my/our/আমাদের | fix2 name table; fix1 SG3 keep-cases flipped to unknown |
| A3 | One hedge list as whole tokens, per clause (plus an adjacent clause made only of a hedge); bare "no"/"না" not hedges | fix2 hedge and keep tables |
| A4 | Double-escaped lookahead removed with the tail denylist. "age 10 lessons" and "বয়স ১০ কমলা জামা" are now unknown (the strict shape allows nothing after the unit), asserted in fix2 | fix2 |
| A5 | This doc updated; OD-013-10 added; OD-013-4/7 updated; rounds renamed (Review 0, Fix round 1, Fix round 2) | this file |
| A6 | `safeError` rejects phone-shaped err_name/err_code (pattern copied from log.ts with a comment); `issues` omitted when empty; README: never log/serialise `cause` or `dropped` | fix2 A6 |
| SF1 | Outcome is the first `issues` entry in production lines (invalid reason folded in as `invalid_<reason>`) | fix2 SF1 through the real logger |
| SF2 | Counts per drop reason (`{code: reason, path: "n"}`) instead of one entry per field | fix2 with 6 span_mismatch fields |
| SF3 | Abort after a paid attempt emits `ai.summary` with an `aborted` tally, then rethrows; abort before any attempt emits nothing | fix2 SF3 (3) |
| SN1 | `ProviderFailure(status, { cause })`; logged class is the cause's; README rules for wrappers | fix2 SN1 |
| SN2 | Non-contract `failure: "unavailable" | "unexpected" | "timeout"` on failed E-013/E-014 results | fix2 SN2 |

Sample changes forced by the allowlist: TC-002's synthetic text in `tests/ai/fixtures.ts` now reads `[MOCK] আমার ছেলে, নাম রাফি, বয়স ১৩, ...` (a name label added; it previously relied on ছেলে as a name source). Probe expectation changes by design: the four "ছেলে/মেয়ে <name>" keep-cases became unknown (A2); `পোশাক: নীল জামা, নাম রাফি না` clothing is now kept (negation is per clause, A3); `phone no:` is kept (label `phone no` accepted, "no" no longer a hedge). Added hedge `জানি না` beyond the lead's list so `নাম রাফি, ঠিক জানি না` stays unknown.

Checks (fix round 2): `npm run lint` 0, `npm run typecheck` 0, `npm run build` 0, `npx vitest run tests/ai` 259 passed, `npm test` 1,286 passed / 117 skipped, no failure on this run (argon2 timing flake OD-013-6 did not occur). No second-tool/helper output was used.

## Sol review (2026-10-16, Codex)

**Verdict:** Sol review findings addressed; lead decision 2026-10-16 resolved OD-013-11/12 as accepted residual risk; safeguarding gate 2026-10-16 BLOCK addressed in fix round 3; tracker status stays `review`; Sonnet takeover review below measured the checks (verification no longer pending).

Sol 6.1 (high) review 2026-10-16: NEEDS-LEAD on OD-013-11/12 → decided by the lead; safeguarding re-gate pending.

### Measured checks

| Command | Baseline exit / result | Final exit / result |
|---|---|---|
| `npm run lint` | 0; 0 errors/warnings | 0; 0 errors/warnings |
| `NEXT_TELEMETRY_DISABLED=1 npm run typecheck` | 0; 0 type errors | 0; 0 type errors |
| `NEXT_TELEMETRY_DISABLED=1 npm test` | 1; 1,285 passed, 1 failed, 117 skipped; 53 files (48 passed, 1 failed, 4 skipped) | 0; 1,344 passed, 117 skipped, 0 failed; 54 files (50 passed, 4 skipped) |
| `NEXT_TELEMETRY_DISABLED=1 npm run build` | 0; 6 routes, 8/8 static-generation work items | 0; 6 routes, 8/8 static-generation work items |
| `npx vitest run tests/ai` | 0; 259/259, 4 files | 0; 317/317, 5 files |
| `npx vitest run --config tests/ai/sol-policy.config.mjs` | Not run before review | **1; 3/3 failed**, 1 file; unresolved semantic-policy probes |

The baseline auth failure was `tests/auth/password.test.ts`, ratio **0.4944777057355851** against `> 0.5`; no auth, threshold or runner change. Final default `npm test` passes on this run; the earlier failure remains evidence for OD-013-6. Coverage and real-provider extraction recall/quality remain **not measured**. Logs from this session are in `/tmp/task-013-sol-*.log` (temporary; durable test sources and counts are recorded here).

### New cases, RED evidence and fixes

`tests/ai/sol-review.test.ts` adds **58** cases: **36 unsupported facts**, **15 strict-shape keep controls**, **7 privacy/error-path cases**. The first 49 cases produced **25 failed / 24 passed** (exit 1) before production changes. Eight more cases then reproduced **8 failed / 49 passed** (57 total, exit 1) after the first fix. The final hostile-proxy control passed without exposing a new bug. Thus **33 distinct new cases reproduced bugs before their fixes**, and all 58 now pass.

| Cases | What the probes showed | Fix / final behaviour |
|---|---|---|
| Bangla `বাবার নাম: করিম`, English `father's name: Karim`, mixed `বাবার clothing: blue shirt`; attributed phone labels | Suffix label matching borrowed another person's value | Text and phone context now anchors the whole clause; foreign/negated prefixes stay unknown |
| `নাম: রাফি নাম: রাহি`, `name: Rafi name Rahi`; two conflicting name clauses | Entire repeated-label text could be stored as a name; separate contradictory clauses were already rejected | Name character grammar and repeated-name-label rejection; no guessed choice between values |
| `নাম: রাফি রাফি` | Truncated `রাফি` was already rejected; complete repeated name is a valid literal value | Preserve the full `রাফি রাফি`; never silently deduplicate |
| `নাম: রাফি ١`, `নাম: রাফি ²` | Name digit check missed non-Bangla/non-ASCII numeric characters | Letter/mark name grammar rejects every numeric script/category |
| `clothing: ma\u200bybe blue shirt`, Bangla `সম্\u200dভবত`, dangling `ma\u200cybe`, CGJ `ma\u034fybe`, VS16 `ma\ufe0fybe` | Invisible format/mark characters hid listed hedges | Compare uncertainty after removing Unicode default-ignorables; keep accepted raw evidence and legitimate joiners intact |
| Whole-value `নাম: রাফি না`, `clothing: not/no blue shirt`, Bangla/mixed `নাকি` alternatives | Full negated/alternative phrases passed when quoted in full | Local negation check and one hedge list including `নাকি`; `phone no` remains valid |
| `my boy is not missing`, `not a boy`, `আমার ছেলে নয়`, witness/attribution clauses | Sex words escaped the whole-clause policy | Whole possessive/literal/sex-label shapes only; letter/mark boundaries |
| Father's visit time and an appointment ISO timestamp | Unrelated time substrings became event time | Only complete bare supported relative/ISO time clauses are accepted; narrative recall is reduced (OD-013-12) |
| Bangla/ASCII `১0`, `১2০`, range `৬-8`, mixed phone digits | Complete mixed digit values are valid; truncated or zero-width-split digits were already rejected | Complete strict values and digit derivations retained |
| NFD `কোয়েল`, intact ZWJ conjunct marks | Exact raw quotes can support NFC values | NFC comparison kept; raw UTF-16 evidence round-trip preserved |
| Default stdout/stderr and injected logs, token-shaped `SyntheticChild` error name/code, arbitrary status object | Messages/source/output/evidence/cause/dropped values stayed absent, but arbitrary token metadata and unvalidated status could leak | Fixed error classes + known diagnostic-code allowlist + integer HTTP status 100–599; default sink still `createLogger` |
| Throwing error name/code/message/stack and `ProviderFailure` status/cause getters | Diagnostic reads could reject extraction instead of reaching manual fallback | Guarded own data descriptors; never execute metadata getters or inspect message/stack |

The prior NFC/surrogate phone test was adjusted by inserting `;` before the phone label: the Unicode prefix remains before its raw offsets, while the phone now has its own strict clause. Its old arbitrary-prefix shape is intentionally unsupported. No acceptance assertion was removed.

### Remaining semantic counterexamples (OD-013-11)

The durable RED probe is `tests/ai/sol-policy.probe.ts`, run with `tests/ai/sol-policy.config.mjs`. It asserts unknown for all policy counterexamples, and currently fails them (RED by design; accepted residual risk OD-013-11):

- `নাম: রাফির বাবা করিম` → keeps the entire phrase as `child.name`.
- `name: Rafi is missing` → keeps the entire sentence fragment as `child.name`.
- `বাবার তথ্য; নাম: করিম` → keeps the father's name because attribution spans clauses.
- `বড় ভাইয়ের তথ্য; বয়স ১৫` → cross-clause ownership beyond names; keeps sibling age as `child.age_years`.
- `বাবার তথ্য; পোশাক: নীল জামা` → cross-clause ownership beyond names; keeps father's clothing as `child.clothing`.

These fit the approved labelled-value shapes; lexical checks cannot establish cross-clause semantic ownership. Lead decision 2026-10-16 decided OD-013-11 as accepted residual risk: explicit label text is quoted, not guessed. Mitigation is device-local review-before-submit (BR-004) and S-003 (TASK-022) showing the parent's FULL source text beside every pre-filled field.

### Read-only review and scope

AGENTS.md-routed TypeScript, Bengali and security reviewers rechecked the fixes. TypeScript's two independent getter repros now pass (2/2); Bengali independently ran the original 57 Sol cases (57/57) and closed the default-ignorable hedge blocker; security/log review PASS. These are scoped implementation reviews, not a safeguarding verdict. A subsequent hostile-proxy control brings the final Sol count to 58.

This review changed only `src/server/ai/{adapter,evidence}.ts`, its README, `tests/ai/{evidence.test,sol-review.test}.ts`, the two semantic-policy probe/config files, this evidence doc and the TASK-013 tracker row/log. Existing `src/app/api/_shared/log.ts` changes remain event-name additions only; this review made no change there. No contracts, DB, spec pack or dependencies changed. Contracts/spec were read for review; `.env*` and `.serena` were not accessed.

## Fix round 3 (2026-10-16, Antigravity)

Triggered by the safeguarding gate re-probe (BLOCK 1-4). Lead decisions (2026-10-16) implemented:
1. **Sentence-scope qualifiers (BLOCK 1):** Qualifier scope moves from adjacent clauses to the WHOLE SENTENCE (ends at `।`, `.`, `!`, `?` or newline). Any HEDGE, NEGATION, or CORRECTION token anywhere in the sentence makes every fact whose span lies in that sentence unknown (drop reason `uncertain`). Added hedges: হয়তো, বোধ হয় (with space) as well as বোধহয়, শিওর না, sure না, ধারণা, possibly, believe, certain, ঠিক জানি না. Added corrections: মানে, actually, sorry, I mean, না না. Bare না and নয় count as NEGATION and apply sentence-wide (`phone no` label exempt). In `dangling()`, digit exemption (`!isDigitIn`) was removed so numerical self-corrections (e.g. "বয়স ১০, না ১১") drop the fact. Control test confirms a different sentence without qualifiers keeps its facts (e.g. "বয়স ১০। পোশাক নিয়ে নিশ্চিত না।").
2. **Height unit required (BLOCK 2):** `child.height_cm` is accepted only when an explicit unit (`cm`, `সেমি`, `সেন্টিমিটার`) is present. Unitless heights ("উচ্চতা ৪৮", "height 50", "উচ্চতা ৪ ফুট") are rejected to unknown.
3. **TC-002 shapes restored under sentence-scope rule (BLOCK 4):**
   - (a) `child.sex` from possessive kin word directly followed by a single name word (letters only, no digits): "আমার ছেলে রাফি" gives male, "আমার মেয়ে মিম" gives female.
   - (b) Event time from normaliser's time-word grammar at the start of a narrative clause ("গতকাল বিকেলে মাদ্রাসা থেকে ফেরেনি" yields yesterday afternoon interval).
   - (c) Verbatim D6 TC-002 text yields age 13, sex male, yesterday afternoon time interval, and phone 01711223344; name stays unknown per OD-013-11/13.
   - (e) Each shape drops to unknown when any qualifier appears in the same sentence.
4. **Tests (`tests/ai/fix3.test.ts`):** Complete test suite written covering all probe inputs from items 1-3. Checks measured in the Sonnet review section.

## Sonnet review (takeover from Sol, Codex limit)

Reviewer: Claude Sonnet, 2026-10-16, lane `obidit-llm`. Lead decisions of 2026-10-16 applied.

**Bugs fixed**
1. `উচ্চতা ৪ ফুট` made the whole extraction not-ok. Cause: the provider value 4 is outside the `height_cm` range (40-220), so `outputStructureSchema` (which reused the ranged field schemas) marked the whole response malformed, which triggered a retry, then the fakes ran out ("unexpected", E-013). Fix in `src/server/ai/contract.ts`: the structure schema checks the four numeric child fields as plain numbers; the ranged per-field schema still drops the value as `type_mismatch`. Feet is not converted. Result: extraction ok, `height_cm` unknown.
2. `tests/ai/fix1.test.ts` W1 now expects `uncertain` for clothing, age and place (sentence-scope "maybe"; OD-013-10, fix round 3). Previous kept/conflict/span_mismatch expectations superseded.
3. `tests/ai/fix2.test.ts` KEEP "পোশাক: নীল জামা, নাম রাফি না" moved to the unknown list (same-sentence negation; OD-013-10, fix round 3).
4. Status line 9 no longer says "verification pending".

**Measured (2026-10-16)**
- `npm run lint` exit 0; `npm run typecheck` exit 0; `npm run build` exit 0.
- `npx vitest run tests/ai`: 6 files, 363 passed, 0 failed (was 360/3 failed).
- `npm test`: 1389 passed, 1 failed, 117 skipped (55 files; 50 passed, 1 failed, 4 skipped). The failure is the known argon2 timing test `tests/auth/sign-in.test.ts` "unknown user and wrong password take about the same time" in two full runs; run alone it passes (11/11). Unrelated to TASK-013.
- Gate probe (`_orchestration/probes/013/gate.probe.ts`) only prints its rows and asserts nothing. At the time of this review it reported 5 FAIL rows (superseded by the round 4 re-run in the next section; current FAIL list is 3 rows).
- `tests/ai/sol-policy.probe.ts` (own config): 3 of 3 RED, by design (OD-013-11). It holds the 3 name cases only; the sibling-age and father-clothing counterexamples are gate-probe rows.
- `ai.attempt` log: `AiLogEntry` allows only event, slot, attempt, latency, outcome, error id, status, error class/code, reason enum and `dropped` as field path + reason enum. No source text, quotes or values; the `logs.probe.ts` gate probe passes. `src/app/api/_shared/log.ts` only adds the three event names.

**Not verified:** real-provider behaviour; recall of the checker (not measured).

## Fix round 4 (2026-10-16, Antigravity)

Triggered by safeguarding re-probe (BLOCK B1, B2) and WARNs. Lead decisions (2026-10-16) implemented:
1. **Next-sentence retraction openers (BLOCK B1):** If the first token of a sentence, after an optional `[MOCK]`, is a CORRECTION or NEGATION marker (না, না না, নয়, no, not, sorry, actually, মানে, I mean), mark the PREVIOUS sentence uncertain as well (e.g. "বয়স ১০। না, ১১।", "বয়স ১০\nনা না ১১", "age 10. Sorry, 11.", "age 10. Actually 11.", "নাম: রাফি। না না, রাহি।", "নম্বর ০১৭১১২২৩৩৪৪। না, ০১৮১১২২৩৩৪৪", "গতকাল বিকেলে মাদ্রাসা থেকে ফেরেনি। না, সকালে।" with "।", "." or "\n").
2. **Whole-text retraction (BLOCK B1):** If any sentence contains a whole-text reference (উপরের, সব তথ্য, সবকিছু, above, all of this, everything, any of the above) together with a hedge or negation, mark the WHOLE text uncertain (e.g. "বয়স ১০। উপরের সব তথ্য আমি নিশ্চিত না", "age 10. Not sure about any of the above."). Control sentences that are separate facts (e.g. "বয়স ১০। নম্বর ০১৭১১২২৩৩৪৪") and verbatim TC-002 keep their facts.
3. **Abbreviated hedges and dot boundaries (BLOCK B2):** Added approx, ca, c, prob, est, abt, আনু to `HEDGE_WORDS`. "." is NOT treated as a clause or sentence boundary when following an abbreviation token (or Dr, Mr, Mrs, Ms, St) or when no whitespace follows it (as in "১০.হয়তো"). All abbreviated hedge inputs drop to unknown; control "বয়স ১০। উচ্চতা ১২০ cm" keeps both.
4. **WARN fixes:**
   - In `evidence.ts`: if the word after ছেলে/মেয়ে/son/daughter/boy/girl is a relationship noun (জামাই, বউ, বৌ, স্বামী, স্ত্রী, বন্ধু, friend, boyfriend, girlfriend, husband, wife, in-law), sex stays unknown (e.g. "আমার মেয়ে জামাই", "আমার ছেলে বউ", "my girl friend").
   - Added "হবে" to `HEDGE_WORDS` ("নাম: রাফি হবে" drops to unknown, resolving the `name-hobe` gate probe).
   - In `contract.ts`: `age_years`, `age_min`, `age_max` are integers in `outputStructureSchema` (`z.int()`) so that float `10.5` fails the structure schema and triggers a retry, while `height_cm` remains a plain number.
5. **Tests (`tests/ai/fix4.test.ts`):** Complete test suite added covering all BLOCK B1, B2 and WARN cases; verification pending (no shell commands run per instructions).

## Sonnet review, round 4 (2026-10-16)

Reviewer: Claude Sonnet, lane `obidit-llm`. Measured after fix round 4.

**Fixed**
- `tests/ai/fix4.test.ts` imported `outputStructureSchema` from the `@/server/ai` barrel (TS2305); now imported from `@/server/ai/contract`. Barrel unchanged.
- `tests/ai/fix2.test.ts` "logs counts per drop reason" regression: not the B1 next-sentence rule. The test's source `[MOCK] name: A; clothing: B; marks: C; ...` is one sentence containing the bare token `C`, which round 4 B2 added as the abbreviated hedge `c` (circa). The sentence is now uncertain, so 5 fields log `uncertain` (path 5); the `C` quote itself lies inside `[MOCK]` and is a `span_mismatch` (path 1). The rule fired correctly, so the fixture placeholder `C` became `G` and the original expectation (6 `span_mismatch`) stands.
- `ALL_LABELS` (unused) removed from `src/server/ai/evidence.ts`.

**Measured**
- `npm run lint` exit 0, no warnings; `npm run typecheck` exit 0; `npm run build` exit 0.
- `npm test` exit 0: 52 files passed, 4 skipped; 1421 tests passed, 117 skipped, 0 failed (argon2 timing test did not fail this run).
- `npx vitest run tests/ai`: 7 files, 394 passed, 0 failed.
- Gate probes (`_orchestration/probes/013/vitest.probe.config.mjs`) exit 0, 4 tests passed. `a5-inputs.probe.ts` reported `wrong=0 of 33` inputs kept wrongly. The probes live outside the repo, in `_orchestration/probes/013/`.
- Gate-probe FAIL rows now (3; the probe only prints):
  - `new-slash-district`: kept as one value; TASK-009 must reject combined slash alternatives (see "For TASK-020").
  - `own-age-sibling`: accepted residual risk OD-013-11.
  - `own-cloth-father`: accepted residual risk OD-013-11.
  - `new-sentence-scope` and `name-hobe` now pass (unknown, `uncertain`).
- `tests/ai/sol-policy.probe.ts` (own config): 3 of 3 RED, unchanged, by design (OD-013-11).

**Not verified:** real-provider behaviour; checker recall and false-abstention rates (not measured). Bare `c`/`ca` as hedges will abstain on any sentence containing a standalone letter C; accepted as conservative.

## Fix round 5 (2026-10-16, Antigravity)

Triggered by user decision (Obidit, 2026-10-16): "forward scope + full text" and safeguarding gate WARNs:
1. **Forward scope:** Qualifier scope extended across the text: a fact becomes unknown (drop reason `uncertain`) when its OWN sentence, or ANY LATER sentence in the same text, contains a hedge, negation, or correction token, or a question delimiter (`?`). Replaced next-sentence opener rules (`RETRACTION_OPENER`) with this forward-scope check; retained whole-text-reference rule. A qualifier appearing only in an earlier sentence does not taint a later fact ("পোশাক নিয়ে নিশ্চিত না। বয়স ১০।" keeps age 10). Superseded round-3 control flipped ("বয়স ১০। পোশাক নিয়ে নিশ্চিত না।" now drops age to unknown).
2. **Expanded correction words:** Added আসলে, দুঃখিত, ভুল, ভুল বললাম, নাহ, wait, oops, correction, I meant to `CORRECTION_WORDS`, matching anywhere in a sentence. Trailing questions in a later sentence ("১১?") count as uncertain.
3. **Kin relationship guard:** Added শাশুড়ি, শ্বশুর, ননদ, দেবর, ভাবি to `RELATIONSHIP_WORDS` ("আমার মেয়ে শাশুড়ি" drops sex to unknown).
4. **Fractional / string age and height per-field drop:** In `contract.ts`, `outputStructureSchema` allows fractional and string ages and heights (`z.union([z.number(), z.string()]).nullable()`) so that malformed numbers drop per-field as `type_mismatch` in `checkOutput` without making the entire response structurally invalid or triggering costly paid retries. The per-field drop covers `height_cm` as well, not only ages.
5. **Tests:** Added `tests/ai/fix5.test.ts` covering all forward-scope retraction and keep inputs; `fix3.test.ts` control flipped; `fix4.test.ts` float age test updated. Status: verified in round 5 Sonnet review (tests/ai 432/432 passed); final round 6 results are in the Sol A7 review below.

## Not done

- TASK-003's real provider identities/models/keys/accounts/prices/terms, endpoint adapters or live sample extraction.
- TASK-063 `runPaidCall`, budget/counter enforcement or reservation settlement. TASK-020 must wrap the required dispatch seam, translate reservation/expiry refusals, forward abort and retain uncertain reservations after timeout; adapter never imports spend.
- API-002, notice/role/session/revision checks, deterministic pre-parsing, preserving existing reviewed device edits, missing_fields/templated NextQuestion, district/romanisation integration, cache or browser screens.
- Full TC-002 latency/UI and TC-017's pre-filled SCREEN-005 within two seconds, Playwright/Android journeys, real extraction metrics or semantic generalisation.
- Fixing the inherited shared logger integration (OD-013-15), or the historical auth timing flake (OD-013-6): outside A7 scope. The requested all-default-commands-exit-0 condition remains unmet. (Round-6 wording: **superseded by round 7/8**: OD-013-15 was resolved in round 7 (names-only logger integration); the all-default-commands-exit-0 condition is met in round 8's measured results — `lint`/`typecheck`/`test`/`build`/`test:db` all exit 0, with `vitest` tests/ai also exit 0 and the semantic-policy probe intentionally RED by design.)

## Open decisions

- **OD-013-1 — Exact prompt and approval: UNKNOWN.** D2A §2.1 specifies behaviour, not verbatim prompt text. Obidit/team must review the versioned base/repair templates and their computed hashes before real-provider use; both are visibly `needs_review`.
- **OD-013-2 — Deadline scope: UNKNOWN.** D2B §13 E-014 supplies **25 s**, but does not settle per-dispatch versus whole-extraction scope. This adapter applies 25,000 ms per dispatch (including the injected reservation wrapper), forwards signal and bounds abort-ignoring implementations. TASK-020/lead must decide whole-route duration and any shared deadline; no latency target is claimed measured.
- **OD-013-3 — Mixed failure precedence: UNKNOWN.** Pack defines invalid twice → E-012, down → E-013, timeout → E-014. Proposed implementation: successful fallback wins; otherwise two invalid outputs or a final invalid response → E-012, otherwise any timeout → E-014, otherwise E-013. Primary invalid twice still permits the single fallback, as explicitly requested for this task. Team approval remains pending.
- **OD-013-4 — Wider semantic grammar/policy: UNKNOWN (allowlist OD-013-10; Sol counterexamples OD-013-11/12).** Supported labels, units, separators, lexical negation and contradictions are listed precisely in `src/server/ai/README.md`. They are proposed conservative implementation grammar, not invented district aliases or a general language-quality guarantee. Unsupported paraphrases/inflections/unlabelled text remain unknown. Review the grammar and any expansion with Bangla fixtures before live provider evaluation; general semantic recall/quality are not measured. Source time scanning mirrors current COMP-008 grammar; changes there require coordinated adapter regression tests.
- **OD-013-5 — Real providers and paid integration: UNKNOWN.** TASK-003 is human-owned and not done per this task's instructions; TASK-063 is not available in this worktree. This lane intentionally supplies no identity/model/key/price assumptions. TASK-020 wires the paid seam only after those choices and `runPaidCall` are available; all retries/fallbacks must reserve separately.
- **OD-013-6 — Default full-suite timing reliability: UNKNOWN.** Mahim/lead owns the sign-in test and shared Vitest setup. The same load-sensitive failure was observed in TASK-012 evidence. Two-worker execution passes the same test set; this lane changes neither the timing assertion nor runner configuration. Resolve before claiming the exact default `npm test` gate is green.

- **OD-013-7 — Wider hedge/comparator grammar: superseded by OD-013-10.** Comparators are no longer enumerated: anything outside the strict numeric shape is unknown. The single hedge list (README; Sol added নাকি and local negation handling) still misses unlisted Bangla/English hedges; hedge recall and false-abstention rates are not measured.
- **OD-013-8 — NFC vs NFD quote recall: UNKNOWN.** A provider quote typed in a different normalisation form than the raw `sourceText` fails the exact-substring check and drops the fact (safe, but recall is unmeasured). TASK-020/lead to decide whether to add NFC-equivalent quote matching.
- **OD-013-10 — Evidence checker is an allowlist: decided (lead decision 2026-10-16, Obidit as task owner).** Only strict shapes are accepted (numeric `[label] n [unit]`, label-stated names, possessive ছেলে/মেয়ে for sex, one hedge list per sentence); recall is traded for BR-008 (never guess). Recall and false-abstention are not measured.
- **OD-013-9 — Provider interface vs D5 §6 `LLMProvider`: for the contracts owner (Sadman).** `types.ts:16-19` defines `extract(request, {signal})`; D5 §6 actually specifies `id: "gemini" | "openai" | "claude"` and `extractCase(input: ExtractInput): Promise<ExtractOutput>` (lines 513–515), unlike this local dispatch seam. No contract edit made; confirm before TASK-020.

- **OD-013-11 — Semantic ownership of labelled fields: Decided by lead 2026-10-16.** Accepted residual risk. Widened to cover every labelled field (not just names; e.g. "বড় ভাইয়ের তথ্য; বয়স ১৫", "বাবার তথ্য; পোশাক: নীল জামা"). A value that directly follows an explicit field label is quoted from the reporter's own text, not guessed. Lexical heuristics cannot reliably resolve multi-clause semantic attribution. Round 8 names two further unlabelled residual cases next to `own-age-sibling`: `বাবা বিদেশে, ১০ বছর` (a unit-only clause about another person) and `ঠিক জানি না। রাফি। ১০ বছর` (a qualifier two sentences back, a RED-by-design row in `tests/ai/sol-policy.probe.ts`). Mitigation: review before submit (BR-004), and the S-003 review screen (TASK-022 part 2) must show the parent's FULL source text beside every pre-filled field so the parent can inspect context and correct errors. **S-003 is TASK-022 and not built yet; the mitigation is not in place until TASK-022 part 2 merges.** Counterexamples stay documented in `tests/ai/sol-policy.probe.ts` (outside default test run; RED by design). The same-field earlier qualifier refinement is recorded under OD-013-11: an earlier sentence that is uncertain AND names the same field's label (or, for unit-only facts, names the same field's label) drops the later fact. Lead control "পোশাক নিয়ে নিশ্চিত না। বয়স ১০।" stays KEPT because the earlier sentence names a DIFFERENT field's label. The scan now also runs for unlabelled (unit-only) facts: "বয়স নিয়ে নিশ্চিত না। রাফি স্কুলে যায়। ১০ বছর" drops age 10 (earlier বয়স sentence is uncertain + names the age label). Tested in `tests/ai/fix8.test.ts` (WARN 5).
- **OD-013-12 — Narrower clause policy / TC-002 recall: Decided 2026-10-16.** Superseded in part by fix round 3: sentence-scope qualifiers and TC-002 shapes (kin+name sex, narrative time) restored under lead decision.
- **OD-013-13 — D6 TC-002 name expectation vs OD-013-11 label policy: Recorded 2026-10-16.** Consistent; D6 TC-002 Expected lists no name, so name is not required. D6 TC-002 Expected result specifies: "Draft: age 13, sex male, explicit fixture-clock yesterday afternoon interval with 16:00 display point, phone 01711223344; district empty". Under OD-013-11 anti-guessing policy, names require an explicit label (নাম:/name:) to prevent false attribution. Unlabelled kin-adjacent names ("আমার ছেলে রাফি") leave name unknown while safely extracting sex ("male"). Loosening the name rule would re-introduce false name attribution (e.g. "আমার ছেলে নিখোঁজ"). Conflict recorded; OD-013-11 label requirement upheld by lead decision.
- **OD-013-14 — Residual unlisted hedge, correction words, and kin relationship nouns: recorded (2026-10-16, refreshed round 9).** Recall and false-abstention are not measured. Mitigated by S-003 showing the parent's full source text alongside every pre-filled field. Round 9 added English negation spelling variants: U+2019 curly apostrophe (`don't`, `can’t` …), apostrophe-less forms (`dont`, `cant`, `didnt`, `isnt`, `wont`, `couldnt`, `doesnt`, `wasnt`), and `idk` — all whole-token so `cant` does not match `cantonment`. U+02BC (`donʼt`) remains kept (not covered). Remaining unlisted: slang hedges, dialect forms, inflected corrections outside the enumerated guard, and Bangla/English idiom outside the round-9 hedge list. A real-provider evaluation is needed to enumerate them.
- **OD-013-16 — Over-abstention under forward scope: accepted (safe direction), rate not measured.** The gate measured the following as dropping every earlier fact under forward-scope rules: "He can't speak well.", "I couldn't find him anywhere.", "He didn't come home." (core missing-report sentences — under forward scope these drop every earlier fact), "He could be anywhere.", `আমার ফোন নাই।`, `কোনো দাগ নাই।`, same-field: `বাবার নাম জানি না। নাম: রাফি` (drops the child's name), and `আমার ফোন নাই। নম্বর ০১৭১১২২৩৩৪৪` (drops the phone). Mitigation: the parent fills these fields on S-003 (TASK-022), which is not built yet. The false-abstention rate needs a real-provider evaluation and is UNKNOWN. Bare `cant`/`wont` removed in round 10 because 'Dhaka Cant' (Cantonment) and 'as is his wont' overmatched.

## For TASK-020

- A **shared outer deadline** is needed: worst case is 3 dispatches x 25 s = 75 s (OD-013-2).
- A valid but empty draft (no usable fact) should route to the manual form (review NOTE 4); the adapter returns `ok: true` for it.
- The dispatch slot (`brandProviderDispatch`) must contain the provider-notice check and `runPaidCall`; a bare pass-through no longer type-checks.
- Slash alternatives in text values (e.g. "জেলা: X/Y" or "জেলা: [MOCK] জেলা ১/[MOCK] জেলা ২") must not reach TASK-009 district mapping as a single district entity; TASK-009 / normaliser must reject combined slash alternatives.
- S-003 (TASK-022 part 2) must show the parent's full source text alongside every pre-filled field (OD-013-11, OD-013-14).

## Sonnet review, round 5 (2026-10-16)

Reviewer: Claude Sonnet 5.5, standing in for Codex Sol (usage limit). Measured, not estimated.

| Check | Result |
|---|---|
| `npm run lint` | exit 0 |
| `npm run typecheck` | exit 0 (6 TS2339 `calls` errors fixed: the fake's real API is `provider.extract.mock.calls`) |
| `npx vitest run tests/ai` | 8 files, 432 passed / 432 |
| `npm test` | exit 1: 1458 passed, 1 failed, 117 skipped (1576). The one failure is the known argon2 timing flake `tests/auth/sign-in.test.ts` "unknown user and wrong password take about the same time"; rerun alone: `tests/auth` 10 files, 176/176 passed |
| `npm run build` | exit 0 |
| Gate probes | exit 0, 5 files / 6 tests; FAIL rows exactly: `new-slash-district` (TASK-009), `own-age-sibling` and `own-cloth-father` (OD-013-11) |
| A6 inputs probe | 0 of 37 wrong (supervisor run) |

Fixes in this review:
- fix4/fix5 tests used a non-existent `.calls`; now `extract.mock.calls.length`.
- fix1 W1 expected a string height `"tall"` to fail the whole response. Lead decision 2026-10-16: a non-numeric or out-of-range numeric field is dropped as `type_mismatch` with no retry, so it never becomes a guess and costs no paid call. Expectation changed to `ok` with the drop; new test confirms wholly malformed output (wrong shape, unknown key, array) still retries once.
- Kin guard: the supervisor read `span_mismatch` as the span check. The kin guard also reports `span_mismatch`. A new test shows the clause check accepts `আমার ছেলে রাফি` (sex kept) while `আমার ছেলে বন্ধু` and `my son husband` are dropped. Mutation check: with the guard line removed, 9 tests fail (including the new one), so the guard is what makes sex unknown.
- Sample count corrected to eleven (11th is `TC-002-adapted`).

Integration follow-ups: OD-013-11 is already decided as accepted residual semantic-ownership risk (own-age-sibling / own-cloth-father), with S-003 mitigation still pending; TASK-009 slash-district handling remains open; per-field string/float drop for age and height weakens the structure check by design and confirmed by the lead (Obidit's orchestrator) 2026-10-16.

## Fix round 6 (2026-10-16, Antigravity)

Triggered by user decision (Task A7, 2026-10-16): qualifier just before an unlabelled fact, forward-pointing whole-text references, prefix ভুল, fullwidth ？/… markers, slash alternatives between numbers, and kin guard expansion:
1. **Qualifier just BEFORE an unlabelled fact:** Inside `hedged()`, when the fact's OWN sentence contains no field label (covers: age or height anchored only by unit, bare time phrase, or kin-only sex clause such as "আমার ছেলে"), `isSentenceUncertain` is also run on the IMMEDIATELY PREVIOUS sentence. Forward-scope rule across subsequent sentences remains unchanged. The lead's control is preserved: "পোশাক নিয়ে নিশ্চিত না। বয়স ১০।" keeps age 10 because its own sentence contains the label বয়স.
2. **Forward-pointing whole-text references:** Added নিচের, পরের, below, following, what follows to `WHOLE_TEXT_REF_WORDS`. Texts like "নিচের তথ্য নিশ্চিত না। বয়স ১০।", "Not sure about what follows. age 10.", and "The following may be wrong. age 10." drop facts to unknown. Added `may be` to `HEDGE_WORDS`.
3. **Prefix ভুল and new correction words:** In `CORRECTION_WORDS`, ভুল matches as a prefix with Bangla suffixes `-ে`, `-ভাবে`, `-ই` (so ভুলে, ভুলভাবে, ভুলই count as corrections). The name ভুলু does not match and is kept. Added corrections: শুধরে, scratch that, my mistake, rather. Words "wrong", "update", "change" on their own are excluded (too broad; recorded in OD-013-14).
4. **Fullwidth "？", "…", and number slash alternatives:** Fullwidth "？" and "…" are treated as sentence delimiters and markers of uncertainty when appearing right after a fact's value or delimiter. Slash alternatives between numbers ("১০/১১", "10/11") anywhere in a sentence are treated as uncertain.
5. **Kin relationship guard expansion:** Added নাতি, নাতনি, চাচা, মামা, খালা, ফুপু, bf, gf to `RELATIONSHIP_WORDS`, along with possessive inflections `-এর` / `-য়ের` / `-র` / `-'s`. Clauses such as "আমার মেয়ে নাতি", "আমার ছেলে চাচা", "আমার মেয়ে জামাইয়ের" yield unknown sex, while "আমার ছেলে রাফি" keeps sex male.
6. **Tests:** Added `tests/ai/fix6.test.ts` covering all unlabelled-fact previous-sentence qualifier cases, kept controls, forward whole-text refs, prefix ভুল and corrections, fullwidth ？/… markers, number slash alternatives, and kin guard expansions. Status: measured in the Sol A7 review below; A7 65/65 passes, full integration blocked by OD-013-15.



## Sol A7 review (2026-10-16)

**Verdict: NEEDS-LEAD.** Scoped A7 safeguarding and TypeScript re-reviews PASS after fixes. Whole-implementation fera-review / verification-loop remains BLOCK because the adapter depends on three event IDs absent from the protected shared logger. The owner must resolve OD-013-15; no allowlist bypass, weakened test, cast or dependency was introduced. *(Superseded: OD-013-15 resolved in Round 7 integration, below.)*

### Scope and provenance

Read AGENTS.md first; checked tracked, staged and all untracked files against A7-worker.md and reviewed the supervisor report as claims to verify. Preserved inherited untracked AI implementation/tests from earlier rounds. Sol changed only `src/server/ai/evidence.ts`, its README, `tests/ai/fix6.test.ts`, this evidence and TASK-013's phase row/log. Restored `src/app/api/_shared/log.ts` byte-for-byte from HEAD (removed the inherited single AI-event line); no remaining diff there. Removed the generated untracked `.vitest/json/output.json`. Restored the unrelated TASK-022 tracker row from HEAD. `git restore` could not lock the external worktree index in the read-only git directory; restoration used `git show HEAD:<path>` without touching the index. No commit, push, new dependency, env-file read or application/provider network call.

The supervisor's `may be` scope warning is not a reason to remove it: the brief explicitly requires `The following may be wrong. age 10.` to abstain. `may be` is the narrow hedge supporting that required example; broad bare `wrong`, `update`, `change` remain excluded in OD-013-14.

### Test-first fixes

Added **19** regression/coverage cases to `fix6.test.ts` before production edits. RED command `npm test -- tests/ai/fix6.test.ts`: **exit 1, 10 failed / 55 passed (65)**, comprising the existing `Everything below is uncertain` failure and nine newly failing cases. GREEN same command: **exit 0, 65/65**; independently reproduced by the safeguarding reviewer.

| Bug | Fix and guarantee |
|---|---|
| English `uncertain` was not a hedge; explicitly retracted age survived | Added whole-token `uncertain`; forward whole-text and later-sentence tests drop age. Synthetic name `Uncertainly` remains kept. |
| Trimming the previous sentence lost `?`, `？`, `…` when preceded by spaces, leaving unlabelled kin sex known | Retain the previous raw sentence's trailing spaces and punctuation. Three adapter regressions assert unknown sex, `uncertain`, and removed evidence. |
| Forward scanning skipped standalone later `?`, `？`, `…` | Inspect uncertainty markers while traversing delimiters; three regressions now abstain. |
| Own-field label detection missed decomposed Bangla পোশাক | NFC-normalize only the label-check comparison; NFC/NFD labelled clothing now behaves identically, with raw spans untouched. |

Added missing নাতনি and possessive suffix cases, retaining the brief's age/name/kin controls. Corrected documentation that called now-guarded nouns unlisted, called decided OD-013-11 open, and cited shifting historical review line numbers. New documentation changes require no runtime code fix.

### Measured checks on the final tree

| Command | Exit | Result |
|---|---:|---|
| `npm run lint` | 0 | 0 errors/warnings |
| `NEXT_TELEMETRY_DISABLED=1 npm run typecheck` | 2 | 1 TS2322 at `src/server/ai/adapter.ts:55`: AI event IDs absent from shared logger allowlist |
| `npm test` | 1 | 1,518 passed / 6 failed / 117 skipped (1,641); 51 passed / 3 failed / 4 skipped files (58) |
| `NEXT_TELEMETRY_DISABLED=1 npm run build` | 1 | Bundling succeeds; same TS2322 stops build |
| `npm test -- tests/ai` | 1 | 491 passed / 6 failed (497); 6 passed / 3 failed files (9) |
| `npm test -- tests/ai/fix6.test.ts` | 0 | 65/65, 1 file |
| `npm test -- --config tests/ai/sol-policy.config.mjs` | 1 | 3/3 failed; historical accepted OD-013-11 semantic counterexamples, not a readiness PASS |
| External gate config with `--configLoader native --silent=false` | 1 | 8 passed / 1 failed, 6 files; failure is logger `dropped:["event"]` metadata, not child payload. Printed A5 0/33, A6 0/37 and A7 0/36 wrong inputs. Three printed gate FAIL rows remain slash-district, own-age-sibling, own-cloth-father. These rows are diagnostics, not assertions. |
| `git diff --check` | 0 | No tracked whitespace errors |

The six unit-test failures are default-logger expectations: fix1 SW2 (1), fix2 SF1/SF2 (3), fix2 input-rejection diagnostic (1), sol-review real-log event assertion (1). Their event names are stripped after the scope restoration. They were not removed or changed. The privacy assertions in sol-review execute before its failing event assertion and pass; the external log probe's failure is the extra safe `dropped:["event"]` metadata key. Source/error/phone payloads remain absent in captured logs.

Initial pre-fix full suite: **exit 1, 1,504 passed / 1 failed / 117 skipped**, 53 passed / 1 failed / 4 skipped files (58); only `Everything below is uncertain` failed. Initial lint/typecheck/build exited 0 before shared-logger restoration completed and are not final-tree evidence. No argon2 timing failure occurred in either full run, so no flake rerun was required. Initial external gate invocation failed before tests with EROFS writing Vite's temporary config beside the external config; native loading avoided that write and executed all nine probe tests. Temporary diagnostic logs: `/tmp/a7-*.log`; durable cases/results are in this file and `fix6.test.ts`.

### Citation and safeguarding audit

Checked current pack text: D1 FR-004:395 (never guessing), FR-026:417 (manual fallback), BR-004:474 and BR-008:478; D2A §2.1:67–75 (raw spans, evidence/contract, retry, provider/abort boundaries); D2B §13 E-012/013/014:155–157 (manual paths, 25 s); D5 §6:483–515 (input/output/provider interfaces), BR-004:817, BR-008:821, BR-023:836; D6 TASK-013:112, TC-002:222 (no expected name), TC-014:234 (injection/no fetch), TC-017:237, TC-027:247, TC-028:248; D3 SCREEN-003:93 (review/edit every field). These references exist and support the stated boundaries. BR-023 supports input/call limits, not a completed limits/spend integration. Arbitrary regex vocabulary is local implementation policy, not claimed pack copy. Lead confirmations in historical sections come from the supplied A7 brief/history; no independent approval record was obtained.

Read-only routed reviewers: TypeScript, Bengali, silent-failure and safeguarding. Final A7 TypeScript and safeguarding re-reviews PASS; Bengali's normalization issue and silent-failure's marker issue reproduced RED and are fixed. No UI/schema/auth route changed. Pure evidence code has no logger, network, DB or persistence API. Fakes/new fixtures are synthetic / `[MOCK]`; unknown values lose evidence. Honest draft/uncertainty wording retained.

### Open decisions / limitations

- **OD-013-15 — Shared logger integration: Resolved (2026-10-16, lead).** Sadman owns `src/app/api/_shared/log.ts`. The lead re-added the three event names only (`ai.attempt`, `ai.summary`, `ai.input_rejected`) to `LOG_EVENTS` on 2026-10-16, matching the PRs #22 and #24 pattern (no scope expansion, no allowlist bypass). Mahim's PR approval is required as file owner and lead. Measured results are in the "Round 7 integration (2026-10-16)" section below.
- Existing unresolved OD-013-1 prompt approval; OD-013-2 route deadline; OD-013-3 mixed-failure policy; OD-013-4 broader grammar; OD-013-5 real providers/paid seam; OD-013-6 auth timing reliability; OD-013-8 NFC-equivalent provider quotes; OD-013-9 provider interface alignment remain as above. OD-013-7 is superseded; OD-013-10/11/12 are recorded decisions, not newly open approvals. OD-013-13 is a recorded name-policy clarification.
- OD-013-14 broader unlisted hedge/correction/kin vocabulary and semantic recall remain unmeasured. The six later-word residuals and two over-abstentions reported by the supervisor's round-5 scratch probes were not independently rerun: that scratch path is absent. The cause of the reported earlier-question over-abstention remains UNKNOWN without its rerun; the reported earlier-hedge-sex abstention is consistent with the conservative A7 previous-sentence rule.
- TASK-009 slash-district rejection and TASK-022 S-003 full-source display remain pending. Full TC-002/017 UI/latency, DB-backed journeys, real providers, notice/spend enforcement, model quality/false-abstention rates and coverage percentage were not verified. No DB/E2E result is implied by skipped tests or adapter fixtures.

## Round 7 integration (2026-10-16)

Lead decision (Obidit's orchestrator, 2026-10-16) resolved OD-013-15: the three AI event names were re-added to the shared logger allowlist (`src/app/api/_shared/log.ts` `LOG_EVENTS`) as a names-only addition after the `spend.*` lines, matching the pattern from PRs #22 (TASK-063) and #24. No other change was made to that file. Mahim's approval is required in the PR as the file owner and lead.

### Probe file is excluded from `npm test`

`tests/ai/sol-policy.probe.ts` is named `.probe.ts` and is not matched by the repo's vitest config (`include: ["tests/**/*.test.ts", "src/**/*.test.ts"]`); only `tests/ai/sol-policy.config.mjs` runs it as a RED-by-design gate-probe (`OD-013-11`). The 3 failing rows therefore do not run in `npm test`. No rename.

### Measured (round 7, 2026-10-16)

- `npx tsc --noEmit -p .` — exit 0, no type errors.
- `npx vitest run tests/ai` — exit 0; 9 files, **497 passed / 0 failed** (the six A7 logger failures now pass; no other test was added, removed or weakened).
- `npm test` — exit 0; 66 test files passed, 8 skipped (74 total); **1874 tests passed, 162 skipped, 0 failed** (2036 total).
- `tests/ai/sol-policy.probe.ts` was not picked up by `npm test`; its three RED rows are unchanged by design.
- No assertion was weakened, no cast was added, and no dependency was introduced.

## Round 8 (2026-10-16) — safeguarding follow-up WARN fixes

Triggered by the round-7 safeguarding gate return (BLOCK only in `docs/execution/evidence/intake-llm-adapter.md`; WARNs in code). The real নাই controls and required-cause assertions were added in `tests/ai/fix8.test.ts`; `tests/ai/fix7.test.ts` is unchanged (its optional cause guards are now always true because `cause` is required).

### 1. Spelling variants of existing hedges (lead refinement)

In `src/server/ai/evidence.ts`:
- `জানি\s*না` (was `\s+` only): covers one-word `জানিনা` and the two-word `জানি না`.
- `মনে\s*হয়` (was `\s+` only): covers no-space `মনেহয়` and the two-word `মনে হয়`.
- `ঠিক\s*জানি\s*না` (was `\s+` only): covers `ঠিক জানিনা`.
- New hedge: `হয়ত` (without final ো) — kept as a whole token, distinct from `হয়তো` because of the `ো` letter boundary on the right.
- New hedge: `could\s+be`.
- New `NEGATION` token: `নাই` (whole Bangla negation, not a substring of `নম্বর`, `নিশ্চিত`, `ফেরেনি`).
- New `ENGLISH_NT` regex: `don't|doesn't|didn't|isn't|can't|won't|aren't|wasn't|haven't|hasn't|hadn't|shouldn't|wouldn't|couldn't` as whole tokens.
- New `NUMBER_OW_HEDGE` regex: a number followed by `ও` and a hedge word (e.g. `১১ও হয়`, `১১ও হতে পারে`) is uncertain.

Tests in `tests/ai/fix7.test.ts` cover: `জানিনা`, `হয়ত` (no ো), `মনেহয়` (no space), `শিওর নাই`, `don't know exactly.`, `don't know the spelling` (name), `could be 11 too`, `১১ও হয়`. Verbatim D6 TC-002 still passes (control test included).

### 2. Same-field earlier qualifier (lead decision 2026-10-16, conservative direction for BR-008)

Refinement of the round-5 forward-scope rule: an earlier sentence that is uncertain AND names the SAME field's label now taints the later fact for that field. The lead's existing earlier control (`পোশাক নিয়ে নিশ্চিত না। বয়স ১০।` keeps age 10) is preserved because the earlier sentence names a DIFFERENT field. English pair added too (`Not sure about the age. age 10.` → unknown; `Not sure about the clothes. age 10.` → kept). Recorded under OD-013-11 below as a refinement of the forward-scope decision.

### 3. Raw error cause (only a class-name `Error`, never the original error or its message)

In `src/server/ai/types.ts`: `ExtractionResult.cause` is typed `Error` (not `unknown`); the dispatch seam's `fail` callback in `src/server/ai/adapter.ts` now also takes `Error`. In `src/server/ai/adapter.ts`: when the checker or another internal step throws a non-Zod error, the cause placed in the result is `new Error("ZodError")` for Zod errors and `new Error("Error")` for any other non-Zod error, matching the existing Zod handling. The `cause` no longer references the original error object or its message, so source text, names or phones in the error message do not reach the route wrapper or the JSON serialisation. Tests in `tests/ai/fix7.test.ts` cover: an error whose message contains a source-text secret does not appear in `JSON.stringify(result)` or in `String(result.cause)`; a thrown `ZodError` with leaked field values is replaced by a class-name Error.

### 4. README adapter-level qualifier note

In `src/server/ai/README.md`, the bullet about verbatim D6 TC-002 now explicitly states: "Verbatim D6 TC-002 text is verified at the adapter level with scripted `[MOCK]` providers only; the TC-002 UI, latency, notice and real-provider parts are not verified."

### 5. OD-013-11 / OD-013-14 updates

OD-013-11 now names the two additional unlabelled semantic-ownership cases that remain RED by design: `বাবা বিদেশে, ১০ বছর` (a unit-only clause about another person) and `ঠিক জানি না। রাফি। ১০ বছর` (a qualifier two sentences back). Mitigation: S-003 shows the full source text, which is TASK-022 and not built yet. The mitigation is not in place until TASK-022 part 2 merges.

OD-013-14 still records no new unfixable variants; all spelling variants the round-7 safeguarding list asked for are now covered by the round-8 hedge/negation changes.

### Round 8 Measured (2026-10-16)

| Command | Exit | Counts |
|---|---:|---|
| `npm run lint` | 0 | no errors, no warnings |
| `npm run typecheck` | 0 | no type errors |
| `npm test` | 0 | 1,890 passed / 162 skipped / 0 failed; 67 passed files / 8 skipped (75) |
| `npm run build` | 0 | Compiled successfully; all static pages generated |
| `npm run test:db` | 0 | 20/20 (spend DB only; no SQL/DB code touched in TASK-013) (misreported; measured 162/162 across 8 files, and 11 RED / 5 GREEN, per the round-8 safeguarding gate) |
| `npx vitest run tests/ai` | 0 | 10 files, **513 passed / 0 failed** (was 497 in round 7; +16 fix7 cases, none added, removed or weakened elsewhere) |
| `npx vitest run -c tests/ai/sol-policy.config.mjs` | 1 | 3/3 RED by design (OD-013-11 semantic counterexamples) |

`git diff --check` is clean after the final edit (no trailing blank line at EOF). No argon2 timing flake this run. The harness in `PHASE_2_MUST_CORE.md` TASK-013 row now cites `npm run typecheck` rather than `npx tsc`, matching the standard run-all set.

## Round 9 (2026-10-16) — round-8 safeguarding re-gate follow-ups

Triggered by the round-8 safeguarding re-gate (BLOCK on evidence accuracy only; WARNs in code). fix8 adds 19 cases; replayed by the safeguarding gate against HEAD 2bca467: 12 RED / 7 GREEN (5 keep-controls plus 2 cases already caught by existing hedges); all 19 GREEN after.

1. **Cause is always DEFINED on `ok:false` results (WARN 1).** In `src/server/ai/types.ts` and `src/server/ai/adapter.ts`: `ExtractionResult.cause` is now `Error` (required, not optional). The E-001 input-rejection path and the `fail` callback both place a class-name `Error` on every ok:false result. A throwing provider or a throwing checker never produces an `ok:false` result without `cause`. Tested: `tests/ai/fix8.test.ts` "cause is always DEFINED" (3 cases).
2. **Mislabelled `নাই` control (WARN 2).** The real নাই controls and required-cause assertions were added in `tests/ai/fix8.test.ts`; `tests/ai/fix7.test.ts` is unchanged (its optional cause guards are now always true because `cause` is required). All three controls remain green.
3. **English negation forms (WARN 3).** `ENGLISH_NT` in `src/server/ai/evidence.ts` now accepts: the curly U+2019 apostrophe (`don't`, `can’t` …), the apostrophe-less forms `dont|doesnt|didnt|isnt|cant|wont|couldnt|doesnt|wasnt`, and `idk`. Whole-token matching only (e.g. `cant` does not match inside `cantonment`). Tested: 7 cases in fix8.
4. **`NUMBER_OW_HEDGE` against `uncertaintyText(rawSentence)` (WARN 4).** In `src/server/ai/evidence.ts`: `NUMBER_OW_HEDGE` now runs after `uncertaintyText` normalisation so the precomposed `য়` form of `১১ও হয়` matches. Tested: precomposed `হয়`, precomposed `হয়তো`, and a ZWJ-containing `হতে পারে` form (3 cases).
5. **Same-field scan for unlabelled (unit-only) facts (WARN 5).** In `src/server/ai/evidence.ts`: the same-field earlier-qualifier scan no longer requires the own sentence to carry the field label. An earlier sentence that is uncertain AND names the same field's label (by field type) drops a later unit-only or label-only fact. Lead control "পোশাক নিয়ে নিশ্চিত না। বয়স ১০।" stays KEPT. Tested: 3 cases in fix8 (Bangla + English unit-only + lead control).
6. **Comment fix (WARN 6).** In `src/server/ai/evidence.ts`: the same-field earlier-qualifier code preserves trailing delimiters so a question mark ending an earlier sentence is not lost. Comment now describes the actual behaviour (trailing delimiters preserved) instead of saying "preserving" where the inner trim removed them.
7. **Two new sol-policy probe rows.** `tests/ai/sol-policy.probe.ts` adds `বাবা বিদেশে, ১০ বছর` and `ঠিক জানি না। রাফি। ১০ বছর` as RED-by-design rows; both stay RED after the round-9 code change (neither was promoted to GREEN).
8. **OD-013-16 added.** Over-abstention under forward scope is recorded as accepted (safe direction); the false-abstention rate needs a real-provider evaluation and is UNKNOWN. OD-013-14 wording rewritten to list what remains after the round-9 hedge additions.

### Round 9 Measured (2026-10-16)

| Command | Exit | Counts |
|---|---:|---|
| `npm run lint` | 0 | no errors, no warnings |
| `npm run typecheck` | 0 | no type errors |
| `npm run build` | 0 | Compiled successfully; all static pages generated |
| `npm test` | 0 | 1909 passed / 162 skipped, 68 files (re-measured by the round-9 safeguarding gate; the 1,912 count is round 10) |
| `npm run test:db` | 0 | 162/162 across 8 files (sum: 48+18+13+38+4+10+11+20); spend DB is one of the 8 |
| `npx vitest run tests/ai` | 0 | 11 files, **532 passed / 0 failed** (was 513 in round 8; +19 fix8 cases) |
| `npx vitest run -c tests/ai/sol-policy.config.mjs` | 1 | 5/5 RED by design (OD-013-11; was 3 in round 8, +2 new rows) |
| `git diff --check` | 0 | clean |

## Round 10 (2026-10-16)

Mechanical correction round. Edits made:

1. In `src/server/ai/evidence.ts`: removed bare `cant` and `wont` from the English negation list in `ENGLISH_NT`. The apostrophe forms (`can't`, `can’t`, `won't`, `won’t`) and every other token remain.
2. In `tests/ai/fix8.test.ts`: round 10: +3 cases (2 keep-controls, 1 unknown case). KEPT controls: `place: Dhaka Cant` (place kept) and `age 10. Last seen near Dhaka Cant.` (age kept). Unknown case: `age 10. I can’t remember.` (U+2019, age unknown).
3. In `src/server/ai/README.md`: `may carry cause` → `always carry a class-name cause (no payload)`.
4. In `docs/execution/evidence/intake-llm-adapter.md`:
   - The round-8 intro now notes the real নাই controls and required-cause assertions live in `tests/ai/fix8.test.ts`; `tests/ai/fix7.test.ts` is unchanged.
   - The round-9 WARN 2 entry uses the same wording.
   - OD-013-11 paragraph now says "a RED-by-design row in `tests/ai/sol-policy.probe.ts`" instead of `tests/ai/fix7.test.ts`.
   - Round-8 measured row now appends the round-8 safeguarding-gate note after `20/20 (spend DB only)`.
   - Round-9 measured row's `npm test` now records the round-9 gate's measurement (1909 passed / 162 skipped, 68 files). *(Lead correction: the worker had first written round 10's 1,912 here.)*
   - Status line and round-9 measured row no longer list `OD-013-16` (the two new rows are now under OD-013-11 / OD-013-14).
   - Header line says "round-7 to round-10 edits".
   - OD-013-14 records `U+02BC (donʼt) remains kept (not covered)`.
   - OD-013-16 records `Bare cant/wont removed in round 10 because 'Dhaka Cant' (Cantonment) and 'as is his wont' overmatched.`
5. In `tests/ai/sol-policy.probe.ts`: relabelled the two new residual rows. `বাবা বিদেশে, ১০ বছর` is now OD-013-11 (semantic ownership); `ঠিক জানি না। রাফি। ১০ বছর` is now OD-013-14 (a hedge two sentences back).
6. In `docs/execution/PHASE_2_MUST_CORE.md`: the round-9 log line carries the round-9 count (1909); row 91 carries the round-10 counts, labelled. *(Lead correction after the round-10 gate.)*

### Round 10 Measured (2026-10-16)

| Command | Exit | Counts |
|---|---:|---|
| `npm run lint` | 0 | no errors, no warnings |
| `npm run typecheck` | 0 | no type errors |
| `npm run build` | 0 | Compiled successfully; all static pages generated |
| `npm test` | 0 | 1,912 passed / 162 skipped / 0 failed; 68 passed files / 8 skipped (76) |
| `npx vitest run tests/ai` | 0 | 11 files, **535 passed / 0 failed** (was 532 in round 9; +3 round 10 fix8 cases) |
| `npx vitest run -c tests/ai/sol-policy.config.mjs` | 1 | 5/5 RED by design (OD-013-11) |
| `git diff --check` | 0 | clean |
