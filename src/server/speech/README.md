# Speech adapter — TASK-014 part 1 / COMP-006

Library only: a provider interface, branded dispatch seam, one primary attempt and an optional single fallback attempt. No route, SDK, network client, database or persistence is implemented here. Tests use invented synthetic data and `[MOCK]` providers.

Each attempt defaults to 25,000 ms and is capped at 25,000 ms (D2A `docs/spec/D2_TRD_PartA_V2.md:182`; D2B `docs/spec/D2_TRD_PartB_V2.md:157`). The timer also bounds dispatches that ignore their abort signal, although it cannot forcibly stop their underlying work. Non-finite timeout options use the default. See OD-014-6 in the evidence for the per-attempt scope and mixed-failure policy.

Results reuse the frozen catalogue's Bangla/English copy:

| Condition | Result | Source in D2B §13 |
|---|---|---|
| Empty/whitespace text | E-010, no text and no fallback | `docs/spec/D2_TRD_PartB_V2.md:153` |
| Typed `SttFailure` | E-011, `failure: "unavailable"` | `docs/spec/D2_TRD_PartB_V2.md:154` |
| Timeout | E-014, `failure: "timeout"` | `docs/spec/D2_TRD_PartB_V2.md:157` |
| Other throw or malformed provider result | E-021, `failure: "unexpected"`, error-level diagnostics | `docs/spec/D2_TRD_PartB_V2.md:164` |
| Dispatch refusal | E-019 or E-023, no fallback | `docs/spec/D2_TRD_PartB_V2.md:162`, `:166` |

An exhausted sequence preserves unexpected failures before timeouts before outages. A successful fallback returns its text. Caller cancellation rejects with a new fixed-message `AbortError`, cancels the active attempt and stops fallback. Raw provider errors are neither returned nor logged.

Injected sinks receive `speech.attempt` and `speech.summary` entries: fixed outcomes, slot, attempt, duration, error ID and fixed error class only. No provider name/message/status/code/cause, transcript, audio or audio size is logged. The default sink logs registered `speech.attempt` and `speech.summary` entries through `createLogger`. Sink failures cannot cause a retry or change a result; an emergency fallback swallows the sink error and writes at most the event name.

## Route obligations — not implemented by this library

The `brandSttDispatch()` helper is a compile-time marker, not a runtime notice or budget check. The future TASK-014/API-001 wrapper must:

- Show the provider-processing notice before sending synthetic audio; enforce synthetic-only intake and review before submit. Pre-submit server state holds expiry/counter/hash/cost metadata only. FR-007 concerns draft visibility; the notice requirement comes from BR-004 (`docs/spec/D1_PRD_V2.md:398`, `:474`; `docs/spec/D6_Implementation_Plan_V2.md:285`). The notice acknowledgement mechanism remains open.
- Route every attempt, including fallback, through `runPaidCall` (in TASK-063, PR #22, not yet merged) / `reserve_ai_call` and settlement. Reserve before dispatch; fail closed on refusal while preserving manual intake. Six dispatched paid transcribe/extract calls per draft; USD 25 default stop, with a documented team decision required to raise it to at most USD 30 (`docs/spec/D1_PRD_V2.md:515`; `docs/spec/D2_TRD_PartB_V2.md:134`; `db/schema_v2.sql:544`, `:562`). Map known expiry/budget refusals to `DispatchRefused`; unexpected wrapper bugs remain unexpected.
- Keep audio and raw transcripts out of server storage and logs. Audio is in memory/transit only, never localStorage or DB (`docs/spec/D2_TRD_PartB_V2.md:77`, `:80`). Return the editable transcript for device-local review; do not create child case rows, match, export or show it to another party before confirmation (BR-004/FR-007).
- Enforce authentication/ownership, same-origin multipart handling, codec, actual size ≤2 MB, verified duration 5–120 s, expiry and revision checks (`docs/spec/D2_TRD_PartA_V2.md:280`–`:284`).

Draft creation and token signing remain out of scope and open. Script/language validation, protected labelled demo-cache lookup, provider/model/pricing, live phone recordings and the complete `TranscribeResponse` also belong to subsequent integration. TC-001, TC-004, TC-043, TC-060, TC-061 and TC-065 are not established by library unit tests.
