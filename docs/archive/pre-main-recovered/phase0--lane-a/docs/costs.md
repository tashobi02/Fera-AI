# TASK-003 provider and price evidence

Owner: Obidit. Checked 13 Oct 2026, Asia/Dhaka. Status: blocked. User confirms provider/model choices are not ready; see docs/execution/evidence/phase0/human-blockers.md.

| Item | Evidence / status | Blocker |
|---|---|---|
| Primary LLM provider/model/key | UNKNOWN; no choice or key supplied in this session | OQ-004; user selects provider/model and puts key directly in gitignored .env.local |
| Secondary LLM provider/model/key | UNKNOWN; no choice or key supplied in this session | OQ-004; same requirement for the second provider |
| STT provider/model/key | UNKNOWN; no choice or key supplied in this session | OQ-022; user chooses account/model and supplies credentials locally |
| LLM input/output token prices | UNVERIFIED; no price claimed | Need model-specific primary source URL, billing unit, currency and check date |
| STT per-minute price and accepted Android format/limits | UNVERIFIED; no price or format compatibility claimed | OQ-022; official docs plus phone test |
| Provider training/retention terms | UNVERIFIED | OQ-013; check the selected account mode and primary source terms |
| Both LLMs and STT test-call evidence | Not measured; zero calls dispatched | Credentials, provider decisions and explicit user OK for paid calls |

`.env.local` was absent in the lane at inspection. `.env.example` lists every D2B §15.1 name with blank values, as requested. No credential file was created; no secrets were read or logged.

D2B §§12/15.1 specify a USD 25 default cap and require a documented decision for an increase, at most USD 30. This is a budget requirement, not a provider price. Spend enforcement belongs to TASK-059/063; Phase 0 has no paid-call code.

Source: docs/spec/D2_TRD_PartB_V2.md §§12,15.1; docs/spec/D1_PRD_V2.md OQ-004/013; docs/spec/D2_TRD_PartA_V2.md OQ-022. Provider source URLs remain UNKNOWN until provider/model choices exist.
