# TASK-012 evidence — deterministic normaliser (COMP-008)

Owner: Obidit · Lane: `obidit-normaliser` (Codex), branch `phase2--obidit-normaliser` · Date: 2026-10-15 (Asia/Dhaka) · Base/HEAD: `0617b4c73eb51ce7610bb29f642244974e063a21`; changes are uncommitted. Links: FR-003, BR-008/015/016, TC-002/030, D2A §2.1/§3.4/COMP-008/A-033/A-035, D2B §10, D5 §6, feature 002 research/data-model/contract.

Synthetic fixtures only. The normaliser performs no provider/network calls, persistence or logging. No new dependencies, commits, pushes or PRs. The pre-existing `.serena/` directory is outside this task and was left untouched.

## Status against “≥30 unit tests pass”

**93/93 normaliser unit tests pass in five files; final fera-review verdict: pending re-review.** Each case has a one-line source citation. TASK-012 remains in review within the fixture-based scope authorised for this lane. Full TASK-009 district integration and a romanisation scheme remain open; they are not claimed complete.

TC-002's normaliser behaviour is covered: Bangla digits, original evidence, the specified phone, and yesterday 16:00 with 14:00–18:00 bounds. This is not the complete TC-002 extraction/UI/latency acceptance test. TC-030's invalid phone/district/future-time normaliser paths are covered; its four-path submission/API result is not implemented here.

## What was built

| Area | Files | Notes |
|---|---|---|
| Public API and results | `src/server/normalise/index.ts`, `types.ts` | Pure synchronous functions returning either `status: known`, a value and evidence, or `status: unknown`, `value: null`, empty evidence and a fixed reason. All field functions take explicit raw UTF-16 ranges. No route, DB or provider dependency. |
| Source integrity | `src/server/normalise/source.ts` | Validates raw source/ranges against frozen EvidenceSpan limits; rejects NUL, malformed UTF-16 and partial graphemes. Also rejects the internal boundary ICU permits before the consonant in a Bangla virama/ZWNJ sequence, preserving the complete source unit. Error reasons never include input. |
| Text and offset mapping | `src/server/normalise/text.ts` | NFC and the contract's `toAsciiDigits` helper. Every normalised UTF-16 code unit maps to its complete raw grapheme. Tokens are runs of non-whitespace graphemes, including punctuation. Each token retains its raw quote/offsets and `direct` or `digits` derivation. The two-argument `evidenceForRange` computes that same derivation from the raw quote, maps normalised ranges to original evidence, checks transformation consistency and refuses partial source units. Callers cannot supply provenance. Raw text and whitespace are preserved. |
| Phone | `src/server/normalise/phone.ts` | Reuses frozen `phoneSchema`, which applies the contract's `toAsciiDigits` itself: exactly 11 digits starting `01`, with only its permitted separators. No duplicate digit conversion or display-only numeral helper. Country prefixes, unsupported digits, invisible insertions and invalid inputs stay unknown. `digits` covers digit/phone-format normalisation; already canonical phones use `direct`. No ownership verification is implied. |
| Time | `src/server/normalise/time.ts` | Explicit `nowIso`, canonicalised through `inputDateTimeSchema`; never reads the ambient clock. Uses contract `toAsciiDigits`. Exact ISO instants have equal bounds; offset/ISO canonicalisation uses `time_interval` evidence, digit-only changes use `digits`, and canonical unchanged input uses `direct`. The exact-instant future check permits `CLOCK_SKEW_MS` (120,000 ms), inclusive. Submission retains its separate contract validation, including zero skew for `at_lower`. Supports `গতকাল` plus the five A-035 words and TC-002's `বিকেলে` only (OD-012-5). Word-derived intervals remain approximate ±2 h. The latest yesterday window ends at 23:00, so the unreachable relative `upper > now` check was removed. All timestamps are validated; no bounds are clipped. |
| District | `src/server/normalise/district.ts` | Injected synchronous `DistrictLookup` over preloaded data. The lookup receives the selected raw phrase after NFC, trim and lowercase, preserving Bangla digits in names. Only a unique valid internal code 1–64 resolves; multiple codes, invalid rows and unresolved names stay unknown. No fuzzy inference, default list or place-to-district guess. |
| Name romanisation | `src/server/normalise/romanise.ts` | Validates the source range, then returns `romanisation_unspecified` (OD-012-1). No speculative table or transliteration. |
| Tests and fixture | `tests/normalise/{text,phone,time,district,romanise}.test.ts`, `fixtures.ts` | 93 cases: Bangla/Latin/mixed digits, explicit NFC nukta expansion/offset expectations, rejected partial conjunct/ZWJ/ZWNJ/nukta ranges in both APIs, attempted false provenance, exact-offset evidence and clock-skew boundaries, strict time-word reasons, district lookup keys, repeated and supplementary-character offsets, schema-valid quotes, unknown/ambiguous values, contract formats, all A-035 bounds, Dhaka midnight/month/year/leap-day rollover, explicit clock independence, bounded Unicode work on 4,000-unit input, and an injectable four-row `[MOCK]` fixture. Alias labels and internal codes are synthetic test assignments, not a Bangladesh district dataset. |

The future intake/extraction caller selects source-backed fields and performs semantic evidence checks (D2A §2.1); this normaliser does not extract names, age or sex from narratives. For a normalised range, call `evidenceForRange`, then use its raw `start_utf16`/`end_utf16` for field functions. Time's single returned source span supports `event.at`, `event.at_lower` and `event.at_upper`. Re-normalise edited text before reusing any ranges.

## Verification (local, 2026-10-15)

Tests were written before implementation. The first run failed to import the absent module (five failed suites, exit 1). With explicit-unknown API stubs, all 63 tests ran: **51 failed, 12 passed**, exit 1. Implementation then made all 63 pass.

The earlier implementation round identified repeated full-source segmentation per token. Its regression test failed before the fix: **one failed, 16 passed**, exit 1, with 7,996,000 segmented input units for a 4,000-unit source. Token evidence now uses the grapheme boundaries already built in the initial pass, retaining schema validation. The test limits segmented input work to at most twice the source length, without a machine-dependent timing threshold.

For the Claude fera-review round-1 fixes, regression tests were updated before production changes. `npm test -- tests/normalise` reproduced **11 failed, 82 passed (93 total)**: false/missing provenance, non-Dhaka offset evidence, exact-instant skew tolerance, and the ZWNJ internal boundary in both range APIs. After the fixes the same command passed **93/93** (text 27, phone 12, time 34, district 16, romanisation 4). These tests also explicitly establish that `Intl.Segmenter("bn")` keeps `ক্ষ` as one grapheme and that source U+09DF becomes U+09AF + U+09BC, with both normalised units mapping to the same one-unit raw range.

The requested `npm run lint && npm run typecheck && npm test && npm run build` chain was run. Lint and typecheck passed; the suite stopped the chain on the known load-sensitive sign-in timing test. `npm test -- tests/auth/sign-in.test.ts && npm run build` then passed, including the isolated timing test. No auth code or timing threshold was changed.

| Command | Exit | Result |
|---|---|---|
| `npm test -- tests/normalise` | 0 | 93 passed, five files; none skipped |
| `npm run lint` | 0 | No errors or warnings |
| `npm run typecheck` | 0 | Route type generation and TypeScript pass |
| `npm test` | 1 | 1,026 passed, one failed, 117 skipped (DB suites), 1,144 total; 44 passed files, one failed file, four skipped files (49 total). Only failure: `tests/auth/sign-in.test.ts` → “unknown user and wrong password take about the same time”; ratio 2.672 exceeded the `< 2` bound under full-suite load. |
| `npm test -- tests/auth/sign-in.test.ts` | 0 | 11/11 passed alone, including the timing test; none skipped |
| `npm run build` | 0 | Run after the isolated auth check; production build succeeds with six existing routes and eight static-generation work items |
| `npm run test:db` | — | Not run: no SQL or DB code changed |
| Scoped security/input scan | No matches | No logging, env access, network, filesystem or DB calls, display-only numeral import or `toLatinDigits` in the normaliser module/tests |
| `git diff --check` + scoped whitespace check | 0 | No tracked whitespace errors; all 16 task files, including untracked files, passed the whitespace check |

Coverage percentage: **not measured**. The coverage provider is not installed; no dependency was added. D6's ≥30-test done-when applies, not the generic vendored 80% target.

## Reviews

**Claude fera-review round 1 = BLOCK (`evidenceForRange` derivation) + WARNs; all fixed in this round. Final verdict: pending re-review.** This replaces the earlier self-recorded FERA-REVIEW PASS claims. The lead's round used Claude safeguarding, TypeScript and Bengali reviewers; these fixes do not establish their final approval.

| Finding | Applied fix / evidence |
|---|---|
| BLOCK: caller-controlled evidence derivation | Removed the parameter; computes `digits` when digit conversion changes the raw quote, otherwise `direct`, exactly as tokens do. Signature assertion and extra-JavaScript-argument regressions prevent false `direct`/`romanisation` labels. |
| WARN: display-only digit helper | Text/time use contract `toAsciiDigits`; phone passes raw text to `phoneSchema`, which converts once. |
| WARN: exact-time provenance and future policy | Converted offsets use `time_interval`; exact checks use inclusive `CLOCK_SKEW_MS`; unreachable relative upper-bound future check removed with a calendar explanation. |
| WARN: district lookup handoff | `DistrictLookup.lookup()` documents NFC → trim → lowercase index keys; a spy asserts the exact key. |
| WARN: strict time grammar | OD-012-5 records the precise allowlist and unknown policy; variant and standalone tests assert their reasons. |
| WARN: Bangla Unicode regressions | Both range APIs reject every internal start/end in `ক্ষ`, `ক্‍ষ`, `ক্‌ষ` and decomposed `ড়`; explicit nukta/NFC offset expectations replace the tautological test. A source-boundary guard handles ICU's ZWNJ split. |

Supplemental read-only Codex TypeScript and Bengali inspections of the fixes found no remaining findings; they made no edits and did not rerun the checks. Claude fera-review remains **pending re-review**. No PR is opened by this task.

## Not done

- TASK-009's 64 districts/real alias source, adapter and integration: only a four-row test fixture is supplied.
- Bangla→Latin name romanisation: API intentionally returns unknown pending the specified team table.
- Other relative-time words, grammatical forms, date notations or date-free part-of-day interpretation; none is inferred from unstated rules.
- API-002/orchestrator/provider integration, age/sex extraction, submission validation, browser/Android journeys and production deployment.
- Full TC-002 and TC-030 acceptance or performance/quality metrics.

## Open decisions

- **OD-012-1 — Romanisation scheme: UNKNOWN.** D2A A-033 says the team builds a table but specifies no mapping, spelling policy or fixtures. Obidit/team must supply and review it before `name_latin` is derived. All names currently return unknown, as instructed for this lane.
- **OD-012-2 — TASK-009 adapter/source: UNKNOWN.** Masnun's district data/aliases are not merged. Supply a preloaded adapter implementing `DistrictLookup.lookup(normalisedName)`; build names/alias keys with NFC normalisation, then trim and lowercase, exactly as the caller does. Return every matching internal code so ambiguity is retained. No fabricated real district assignment is required.
- **OD-012-3 — Additional time grammar: UNKNOWN.** A-035 gives five centres/widths; FR-003/TC-002 supply yesterday and `বিকেলে`. No policy specifies additional relative words, inflections such as `সকালে`, or how to date bare chips. Those inputs remain unknown until the team defines them. Explicit ISO instants use the frozen input contract.
- **OD-012-4 — Frozen evidence limits for long text: UNKNOWN.** Evidence offsets stop at 4,000 UTF-16 units and each quote at 500 characters, while raw text's Zod limit counts code points. This module conservatively returns unknown for raw text over 4,000 UTF-16 units or a token whose evidence exceeds the quote cap; it never truncates source or invents a token split. Mahim/all owners decide whether later frozen-contract changes or an alternative long-token policy are needed. No protected contract was edited.
- **OD-012-5 — Strict time-word policy; additional forms UNKNOWN.** Only A-035's base forms (`সকাল`, `দুপুর`, `বিকেল`, `সন্ধ্যা`, `রাত`) plus TC-002's `বিকেলে` are supported with `গতকাল`. Inflected/variant forms `সকালে`, `দুপুরে`, `সন্ধ্যায়`, `রাতে`, `বিকাল`, `সন্ধা` remain unknown (`unsupported`) under BR-008 until the spec owner adds a table. No suffix stripping. Standalone supported words, including `বিকেলে`, remain unknown (`ambiguous`) because no date is supplied; standalone `সন্ধ্যায়` is `unsupported`.

## fera-review round 2 (Claude, 2026-10-15)

fera-safeguarding-reviewer: **PASS** (round-1 BLOCK closed; 93/93 normaliser tests, full suite 1,027 passed / 117 skipped in its run). Its WARNs, recorded for the consumers:
- `direct` after NFC: when NFC changes a quote (U+09DF → U+09AF U+09BC) the value is canonically equivalent but not byte-identical, and is labelled `direct` (the contract has no NFC derivation). TASK-013's evidence check must compare NFC-normalised strings, not raw bytes.
- A phone quote with only separators removed (`01711-223344`) is labelled `digits` (closest enum value).
- Exact instants up to `CLOCK_SKEW_MS` ahead of the intake clock are accepted here, but submission (contract + DB trigger) checks `at_lower` with zero skew; TASK-022 needs a clear clarification message if such a draft is refused at submit (fails closed).
