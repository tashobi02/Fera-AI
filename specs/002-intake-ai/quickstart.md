# Feature 002 future validation guide

**Status**: Planned checks only. No app scaffold, provider account, district load, runtime contracts or Android recording has been verified. Root npm scripts are fail-fast stubs; running them now does not prove this feature. Use invented synthetic cases only. (TASK-001/003/009/061; BR-026; AMD-1-1)

## Prerequisites before implementation validation

- TASK-001 scaffold/CI and TASK-061 DTOs, plus TASK-007 parent session, TASK-015 case service and TASK-008 shell. TASK-002 schema evidence is needed for persistence. Confirm these in their trackers before treating runtime checks as possible. (D6 §5; AMD-1-1)
- TASK-009 district aliases for TASK-012's normaliser; TASK-003 verified provider accounts/real prices for paid work; TASK-019 synthetic demo fixtures for TASK-033. Keep keys/DB URLs out of git and logs. No paid call is part of this guide's present run. (D6 §5; OQ-004/022)
- A synthetic TC-001 38-second phone recording satisfying measured duration and encoded-size checks, fixed-clock TC-002 typed fixture and three invented scripted demo cases. No real child/parent record, image, document, coordinate or scraped page. (TC-001/002/021/061; FR-024; BR-026; DEP-007)

## Validation sequence once prerequisites are evidenced

| Check | Future command or action | Expected evidence |
|---|---|---|
| Static and contract checks | npm run typecheck, npm run lint, npm run test after scripts are implemented. | ≥30 source-cited COMP-008 cases pass; extraction rejects unsupported spans and guessed fields; no runtime secrets in output. (TASK-012/013; BR-008; TC-027) |
| Browser review path | npm run test:e2e after journeys exist, then inspect SCREEN-001–003 on a phone and run impeccable harden for SCREEN-002/003. | Notice before dispatch, Bangla default/toggle, editable transcript and draft, ≥44 px targets, manual fallback, corrected field submitted once; TC-001–004/017/031/060/061 results with device/clock evidence. (FR-002/006/007/033; D4; DESIGN.md) |
| Paid-call protection | Run implemented reservation/concurrency checks and npm run spend; use synthetic requests, and only a verified price sheet when paid calls are explicitly budgeted. | Six-call maximum counts retries/fallback, replays cannot reset counters, default USD 25 refusal opens manual path; actual spend reports reservations and settlements. (BR-023; DECISION-017; TC-036/043) |
| Demo cache | Run network-off scripted journey in protected DEMO_MODE=1; inspect fixture inclusion in quality reports. | Hits show synthetic and cached labels; miss shows unavailable/manual; cached fixtures excluded from quality denominators. (FR-027/032; TC-021/056) |
| Submission idempotency | Concurrently replay identical principal+UUID+payload and a changed payload in a synthetic test. | One case and stable owner reference for identical retry; changed payload E-005, no pre-confirmation case row. (FR-031; BR-004; TC-004/031/042/060) |

Record each actual command, exit status, fixture ID and relevant screenshot/report path when implementation exists. A planned command or this guide is not acceptance evidence. (AMD-1-1; TC-001–004/017/021/031/036/042/043/056/060/061)
