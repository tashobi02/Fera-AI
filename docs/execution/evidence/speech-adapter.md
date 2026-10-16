# TASK-014 part 1 — speech adapter review evidence

Date: 2026-10-16 (Asia/Dhaka). Branch: `phase2--obidit-speech`.
Implementation supplied by Antigravity Gemini Flash; reviewed and debugged by Codex Sol; supervisor check by Claude Haiku.
Scope: only the seven files allowed by `A1-worker.md`. This is a library review, not completion of TASK-014/API-001 or an end-to-end acceptance result.

## Scope and implementation

Initial `git status --short`, `git diff`, `git diff --cached` and `git ls-files --others --exclude-standard` found seven untracked files and no tracked changes:

- `src/server/speech/{types.ts,adapter.ts,index.ts,README.md}`
- `tests/speech/{fakes.ts,adapter.test.ts}`
- `docs/execution/evidence/speech-adapter.md`

No out-of-scope edits needed reverting. No contracts, SQL, shared API helpers, other owners' files, dependencies or phase trackers were changed. The explicit brief limits writes to these seven files, so the TASK-014 tracker row remains unchanged. No commit/push, environment-file read or network/provider call was performed.

The library exposes `SttProvider`, a branded `SttDispatch`, typed provider-down/timeout/refusal errors, and `createSttAdapter`. It makes one primary attempt and at most one optional fallback attempt. The dispatch brand is a compile-time marker; it does **not** enforce notice, budget, synthetic-only input or persistence rules at runtime. The route must supply those checks inside its dispatch wrapper.

Each attempt has a default/capped 25,000 ms timer and forwards cancellation to the provider; the timer also bounds a dispatch that ignores cancellation. Caller cancellation rejects with a new fixed-message `AbortError`, with no fallback. Success returns trimmed editable text. Empty/whitespace returns E-010 without text or fallback. Known `SttFailure` yields E-011 / `failure: "unavailable"`; timeout yields E-014 / `failure: "timeout"`; other throws or malformed responses yield E-021 / `failure: "unexpected"`. Exhausted mixed failures preserve unexpected bugs before timeout before outage. Refusal E-019/E-023 stops dispatch. Raw provider errors are not returned.

Logs contain fixed speech events/outcomes, slot, attempt, elapsed milliseconds, error ID and fixed error class. No transcript, audio, audio size, provider name, raw message/stack, status, code or cause is sent to a sink. Unexpected failures log at error level; catalogue levels are also respected for E-010 (info), E-011 (error), E-014 (warn), E-019 (info), E-023 (warn). Sink failures do not change results or trigger paid retries. See OD-014-2 for the explicit default logger registration diagnostic.

## Citation audit

Every source line cited in the worker's code, README and evidence was checked against the local pack. The original line numbers exist and generally describe the stated requirement. Corrections concern what the implementation proves: a brand does not enforce route checks; FR-007 describes draft visibility, not notice acknowledgement; unit tests do not establish acceptance TCs; missing logger events are not safe completed observability. Unsupported acknowledgement and session/token implementation details were removed from the README. Existing frozen catalogue copy is reused; no new user-facing copy or E-ID was invented.

| Source | Verified statement and limit |
|---|---|
| `docs/spec/D2_TRD_PartA_V2.md:166` | Speech outage mitigation is typed input and scripted cache; it does not specify a second STT provider. |
| `docs/spec/D2_TRD_PartA_V2.md:182` | COMP-006: 25 s timeout → E-014; empty/garbled → E-010; down → E-011. Script check/cache are subsequent integration work. |
| `docs/spec/D2_TRD_PartA_V2.md:231`, `:232`, `:235` | E-010 / E-011 / E-014 keys and HTTP statuses. |
| `docs/spec/D2_TRD_PartA_V2.md:275`–`:284` | API-001, editable synthetic transcript, response fields and validation. No API-001 route is implemented here. |
| `docs/spec/D2_TRD_PartB_V2.md:153`, `:154`, `:157`, `:164` | E-010 unintelligible/info; E-011 unavailable/error; E-014 timeout/warn; **E-021 INTERNAL/error** for bugs. The generic INTERNAL entry is used for unexpected speech failures, rather than claiming a provider outage. |
| `docs/spec/D2_TRD_PartB_V2.md:162`, `:166` | E-019 expired session; E-023 paid-budget refusal. |
| `docs/spec/D2_TRD_PartB_V2.md:44`, `:175`–`:177` | Safe allowlist logs and separate AI metrics/spend reporting; this library does not write `ai_calls` rows. |
| `docs/spec/D2_TRD_PartB_V2.md:77`, `:80` | Pre-submit metadata only; audio in memory/transit, not localStorage or DB. |
| `docs/spec/D2_TRD_PartB_V2.md:134` | USD 25 reservation stop; documented decision required to raise toward the USD 30 ceiling. |
| `docs/spec/D2_TRD_PartB_V2.md:195`, `:197` | Explicit LLM fallback variables; STT provider/model examples only. No STT fallback variable is specified. |
| `docs/spec/D1_PRD_V2.md:393`, `:398`, `:474`, `:515` | FR-002 editable voice transcript; FR-007 unconfirmed draft isolation; BR-004 notice before provider processing; BR-023 verified audio limits, six paid calls including fallback, metadata-only server draft. |
| `docs/spec/D6_Implementation_Plan_V2.md:102`, `:113` | TASK-003 provider/pricing work and TASK-014 speech **plus API-001**. Full task completion is not claimed. |
| `docs/spec/D6_Implementation_Plan_V2.md:221`, `:224`, `:268`, `:285`, `:286`, `:290` | TC-001 / 004 / 043 / 060 / 061 / 065 require phone/UI/DB/notice/budget/codec integration; these are not unit-test PASS claims. |
| `db/schema_v2.sql:544`, `:562` | Reservation and settlement function definitions exist, read only for citation checking; no DB call was made. |
| `src/app/api/_shared/log.ts:12`–`:18` | Current `LOG_EVENTS` has no speech event; shared logger remains unchanged. |
| `docs/agents/handoff/OBIDIT.md` item 7 | Future route obligations: notice, memory-only audio/transcript processing and reservations on every attempt. |

## Bugs found and fixed, with test evidence

Tests were added/strengthened before runtime fixes. `npm test -- tests/speech/adapter.test.ts` first exited 1: **8 failed, 9 passed**. After adding the empty-result failure-union assertion, the next RED run exited 1: **9 failed, 8 passed**. The first implementation GREEN run exited 0: **17/17 passed**. Additional cancellation, refusal, fallback, sink and log-level cases then passed: **28/28**.

A final edge-case test used a dispatch that synchronously aborts the caller and then throws. RED: `npm test -- tests/speech/adapter.test.ts -t 'synchronous dispatch throw'` exited **1**: the assertion passed (1 selected, 28 filtered), but Vitest reported **one unhandled AbortError rejection**. Wrapping dispatch in a Promise executor before racing captures the synchronous throw and observes both rejections while preserving synchronous dispatch timing. The identical isolated command then exited **0**, and the full speech suite exited **0, 29/29 passed**, with no unhandled errors.

| Bug | Regression guarantee |
|---|---|
| Unexpected bug was mapped to E-011 and could later be masked by an outage | E-021/INTERNAL and `failure: "unexpected"`, including primary bug followed by unavailable fallback; error-level default diagnostics. |
| Default sink cast unsupported speech events to `any`, failing lint and losing event identity | No cast/unsupported logger call; explicit registration diagnostic retains attempt/summary identity and sanitized fields. |
| Default severity treated E-010/E-011 as warn | Actual default output uses info/error respectively, and warn for E-014. |
| Provider error status/cause getters and hostile thrown proxies could escape as raw rejections | No getter reads; safe fixed-class inspection; failures remain structured E-011 or E-021. Provider errors/causes are absent from results. |
| Malformed provider response was invented as empty audio | A non-string/missing transcript is an unexpected integration bug (E-021); actual empty/whitespace text remains E-010. |
| NaN timeout became approximately 1 ms | Non-finite timeout uses 25,000 ms; timer cleanup and provider abort asserted. |
| A synchronous dispatch throw after abort bypassed the cancellation race | Both rejections are observed; the regression permits an event-loop turn so Vitest can detect unhandled errors; no fallback occurs. |
| Failure union mixed unintelligible input with transport/bug reasons | `failure` is only unavailable/unexpected/timeout; E-010 has no failure discriminator. |
| Documentation overstated runtime enforcement and acceptance completion | Route obligations and unverified integration clearly separated; exact E-021 citation added; no fabricated copy or provider details. |

Reviewer edits: `src/server/speech/adapter.ts`, `src/server/speech/types.ts`, `src/server/speech/README.md`, `tests/speech/adapter.test.ts`, this evidence document. Worker `index.ts` and `fakes.ts` were reviewed and remain unchanged.

## Checks actually run

| Check | Initial result | Corrected result |
|---|---|---|
| `npm run lint` | Exit 1: 1 explicit-any error, 0 warnings | Exit 0: 0 errors/warnings |
| `npm run typecheck` | Exit 0 | Exit 0: Next route types generated and TypeScript clean |
| `npm test` | Exit 0: 945 passed, 117 skipped; 41 passed files, 4 skipped | Exit 0: **963 passed, 117 skipped** (1,080 total); **41 passed files, 4 skipped** |
| `npm run build` | Exit 0 | Exit 0: compiled, TypeScript complete, 8/8 pages generated |
| `npm test -- tests/speech/adapter.test.ts` | Regression RED results above | Exit 0: **29 passed**, 1 file, 0 failures/skips |
| `git diff --check` | Not run initially | Exit 0; tracked diff empty. Seven untracked files manually reviewed. |

One intermediate typecheck after the first implementation fix exited 2 (one summary error-ID union mismatch); corrected without casting and rerun clean. The intermediate full suite also passed (962 passed, 117 skipped), before the final cancellation regression was added. No argon2 timing failure occurred in any of the three full-suite runs, so no isolated flake rerun was needed. The 117 skipped tests belong to the four existing opt-in PostgreSQL integration suites; `tests/db/support/db.ts:13` gates them on `FERA_DB_TESTS === "1"`, which was not enabled. Coverage percentage was not measured; no coverage dependency was installed.

Safeguarding inspection: only in-memory library processing and synthetic fake providers; no network/DB/storage import or call in the new module. Tests capture injected and default logs, including hostile error fields and private `[MOCK]` messages, and prove those payloads do not enter diagnostics. They do not prove that a future route/provider wrapper obeys notice, spend or retention rules.

## Open decisions and integration handoff

- **OD-014-1 — Optional STT fallback (Mahim/Obidit):** A production secondary provider is UNKNOWN. The library supports at most one optional fallback after an outage, timeout or unexpected dispatch failure; no LLM fallback policy was invented for STT. Keep the manual typed path usable.
- **OD-014-2 — Logger registration (Mahim):** Speech event names (`speech.attempt` and `speech.summary`) were added to Mahim's `src/app/api/_shared/log.ts` as event names only, flagged for his PR review (OD-014-2 resolved for the event list). The default sink logs directly through `createLogger` using the registered names without bypassing allowlists. A throwing sink uses a safe fallback writing at most the event name, following the `src/server/spend/safe-log.ts` pattern.
- **OD-014-3 — Duration (Mahim/Obidit):** Implemented choice: rounded nonnegative elapsed `performance.now()` milliseconds around dispatch, including wrapper time. Approval of how it aligns with `ai_calls.duration_ms` is UNKNOWN; this is not a measured STT performance claim.
- **OD-014-4 — Empty transcript policy (Mahim/Obidit):** Implemented choice: E-010 and stop without a second paid attempt. The pack specifies E-010, but does not mandate an empty-input fallback policy.
- **OD-014-5 — Live provider/model/pricing (Obidit, TASK-003/005):** UNKNOWN in this review. No provider identity, price, credentials, retention terms or real-phone result was verified. The pack's model example is not deployment evidence.
- **OD-014-6 — Timing and mixed failures (Mahim/Obidit):** The brief specifies per-attempt timeout of 25 s (`STT_DEFAULT_TIMEOUT_MS` / `STT_MAX_TIMEOUT_MS`): two configured attempts can take roughly 50 s plus overhead in the worst case with fallback. The ~50 s worst-case total with fallback stands in tension against TC-001's ≤20 s total latency target (`docs/spec/D6_Implementation_Plan_V2.md:221`). The pack does not explicitly define aggregate timing or mixed-error precedence. Current exhausted-result precedence is unexpected > timeout > unavailable. The caller must still supply a dispatch that stops work on cancellation; a noncooperative provider can keep working after the adapter stops waiting. Confirm this policy and aggregate timing during route integration.
- **OD-014-7 — API-001 integration (Obidit/Mahim):** Notice acknowledgement mechanism, draft creation, token signing, route/session/codec validation, script/language checks, protected labelled demo cache and full response remain open/out of scope. Enforce synthetic-only input, reserve/settle every attempt, metadata-only server state and device-local review in that integration. TC-001/004/043/060/061/065 remain **not verified**.

## Independent review gate

**pre-release internal review (Sol run): PASS.** Four independent read-only reviewers completed the scoped review: `typescript_reviewer`, `silent_failure_hunter`, `bengali_reviewer`, `fera_safeguarding_reviewer`. Zero BLOCK findings. TypeScript, failure-path and safeguarding reviewers re-reviewed the final synchronous-cancellation fix; TypeScript and safeguarding independently reran the final speech suite: exit 0, 29/29 passed. The Bengali review remains applicable because the final delta adds no Bangla or product copy.

Safeguarding warnings are integration handoffs: absent shared speech event registration (OD-014-2) and route notice/reservation/synthetic/retention enforcement (OD-014-7). These do not block this library-only brief. Full checks/build were run by the parent reviewer; CI and future PR checks were not verified. No PR was created.

**pre-release internal review (Sol run): Verdict: PASS — ready for a PR for TASK-014 part 1 only.** Full TASK-014 and the acceptance TCs listed above remain unverified.

fera-safeguarding-reviewer release gate 2026-10-16: PASS with 9 WARNs; WARN 1-8 fixed in G12; WARN 9 (tracker row) fixed in G11.
