# Implementation Plan: Quality, evaluation and release

**Branch**: `pre-main--spec-desk-data` | **Date**: 2026-10-18 (Asia/Dhaka) | **Spec**: [spec.md](spec.md) | **Owner**: Puku CLI Opus 4.8 (convergence desk); each task keeps its D6 owner: S = Mahim, O = Obidit, M = Masnun

**Input**: Feature 007 brief in `docs/agents/SPECKIT_PROMPTS.md` and the V2 spec pack. This is a design and convergence artifact; the spec body was recovered from `origin/phase1--mahim-spec007` on 2026-10-18. Plan and tasks are now produced for the pre-main convergence lane, deriving every buildable task from D6 §5, D2 Part B §17, §18 and the V2 ownership table.

> **Convergence note (2026-10-18):** This feature owns **release-quality, evaluation, release and presentation** work. Most of it is human/organiser/external (mentor fixes, two-phone device test, WER speakers, timing volunteers, organiser channel/cutoff, judging weights). The buildable work is the gating evidence: TASK-034/035/037/038/039/040/041/042/043/044/045/053/054/055/058/060 plus the offline one-DB rehearsal path TASK-021/057. **Nothing in this plan changes heldout thresholds, the manifest, the model, the schema, the role DTOs or the audit invariants.** (AMD-AGENTS-1, AMD-AGENTS-3, AMD-AGENTS-5)

## Summary

Plan the release-quality and presentation work for the synthetic Fera prototype so the team can prove, measure, release and present Round 2 + finale against the V2 acceptance set. The plan is **append-only** against the existing tasks.md that recovers the seven features 001–007, and it intentionally distinguishes software gaps from human/production/organiser blocked requirements. The offline-rehearsal one-DB requirement (TC-021, TC-057) is included as a buildable task that wraps the existing `DEMO_MODE=1` flow; the metrics denominators + heldout freeze are a buildable task on top of the existing matcher/manifest; the officer atomic decision + redaction + import + counts map already exist and are verified by route-level focused tests rather than re-implemented. (FR-027, FR-028, FR-032; GOAL-001–GOAL-009; TASK-034–TASK-046, TASK-053–TASK-058, TASK-060; TC-020, TC-021, TC-028, TC-033, TC-034, TC-036, TC-037, TC-056, TC-057, TC-058, TC-061, TC-064, TC-065, TC-066)

## Technical Context

| Item | Planned choice and source |
|---|---|
| Language and framework | Next.js App Router, strict TypeScript, Tailwind, Vitest, Playwright + axe; no new framework added in this feature. (AGENTS.md; TASK-001, TASK-061) |
| Browser and server | Round 2 Vercel deploy + laptop DEMO_MODE=1 finale. The exact organiser cutoff/channel/formats remain UNKNOWN. (D2 Part B §12.1, §15; D6 §5; PHASE_4 AMD-4-1) |
| Storage boundary | Read-only consumption of the evaluation manifest from feature 004. No schema, role DTO or audit change here. (BR-026; TASK-064) |
| Interfaces | `npm run eval:all` (or the split `eval:extract|match|dedupe|wer|time|audit` dev scripts), `npm run spend`, `npm run smoke`, `npm run seed -- --set demo\|full`, `npm run db:reset`, `npm run reembed`, `npm run model:fetch`. Names are D2 Part B §15.3 / D6 TC-020; **all commands remain planned interfaces until the owned lane proves them with real output.** (AGENTS AMD-AGENTS-3) |
| AI and normalisation | None. This feature consumes upstream outputs. Provider accounts, models, prices, judges and devices remain UNKNOWN. (OQ-004, OQ-019, OQ-021, OQ-022, OQ-024, OQ-025, OQ-026) |
| Test framework | Vitest for release-candidate unit thresholds (≥60 tests, ≥30 normaliser), Playwright + axe for essential journey + safeguarding journeys (TC-001–TC-066 where applicable), Word/Google/email-channel link checks for the submission package, and offline-scripted rehearsal log (5/5, ≥1 internet-off) with all roles on one DB. D6 sets the targets; no measurement has been produced yet. (D6 TASK-037/038/054; TC-021, TC-033, TC-057, TC-058) |
| Performance targets | D2 Part B §12.1 (first load, non-AI p95, transcription, extraction, voice-to-draft, matching, map, concurrency). No measurement yet; the plan only adds the evidence file format, not new tooling. (TASK-060; NFR-001–NFR-006) |
| Limits | USD 25 atomic default spend cap; documented raise ≤ USD 30. No heldout tuning, schema/manifest/model change after freeze. (D2 Part B §18 #10; TASK-059; PHASE_3 AMD-3-3) |
| Visual and accessibility rules | D3 screen behaviour, D4 interaction rules, DESIGN.md Paper theme and Fera overrides; **WCAG 2.2 AA, Bangla default, English toggle, Bangla numerals, ≥44 px parent targets, 320 CSS px reflow, 200 % text zoom, 400 % viewport zoom.** (FR-033; NFR-011, NFR-013; D4; AGENTS.md) |
| Scale | Three scripted synthetic cache cases, D2's ten realistic concurrent demo users, two identified Android phones, ≥5 timing volunteers. Real personal data, photos, faces, exact coordinates, scraped pages and police/CID integration are forbidden. (FR-024, FR-027; BR-002, BR-006, BR-026; DEP-007, DEP-009) |

## Constitution Check

The constitution is a read-only draft. The V2 pack resolves wording differences. These checks assess this plan only; runtime compliance still needs evidence. (AGENTS.md; `.specify/memory/constitution.md`)

| Principle | Design check before research | Post-design check |
|---|---|---|
| I. Review before submit | No change to draft persistence or pre-submit metadata boundary; this feature reads only confirmed states and the evaluation manifest. (BR-004/023) | Verified by reading the existing API-003 evidence; no new code path proposed here. |
| II. AI assists, unknown remains unknown | Evaluation harness only reports numerator/denominator; metrics that cannot be measured are recorded as "not measured" with a reason. No heldout tuning. (BR-008; BR-021; TC-020) | Plan forbids any post-freeze model/manifest/threshold change. |
| III. Role visibility | Submission package and audit use only role-scoped DTOs; the safeguarding reviewer must pass. (BR-007/024) | Honest-copy checks added to TASK-044–046 acceptance; reviewer is the gate. |
| IV. Lifecycle | Smoke and one-DB rehearsal path use the existing case service and audit invariants. (BR-012/013/025) | No new lifecycle state is proposed. |
| V. Audit and logs | TC-028 log scan (no phone, no seeded name) is added as a buildable task that runs against a Playwright journey log. (BR-009/010; NFR-010) | Buildable; the scan is local, not a schema change. |
| VI. Honest labels | All deck/video/README numbers trace to the frozen report or read "not measured"; synthetic, [MOCK], cached, simulation and time-compressed labels stay visible. (BR-022/026; FR-027/032) | `fera-safeguarding-reviewer` is the gate; wording guard rules from feature 002 are reused. |
| VII. Synthetic only | No new fixtures beyond the existing synthetic set + manifest; finale rehearsals run against the same demo seed. (BR-026) | Plan reuses feature 004's manifest and feature 001's seed. |

**Gate result**: No design-level violation identified. This does not pass G4 or establish implementation compliance. The draft constitution remains unratified. (AMD-1-1; G4)

## Convergence Map (per D6 acceptance)

The plan below maps each of the seven user stories to its evidence and acceptance route, and records the human/production/organiser items that **cannot be implemented in this lane**. Nothing in this plan claims a fact, date, hour, owner, account, figure, contact, interview, approval or completion that has no recorded evidence.

| Story | Software gap in this lane | Human / production / organiser gap (out of scope) |
|---|---|---|
| US1 — release-candidate checks (TASK-037, TASK-038) | none new; run the existing Vitest suite + Playwright suite on the release candidate and record counts. | none. |
| US2 — Bangla + keyboard + 2-phone (TASK-034, TASK-035, TASK-036) | Bangla copy review path is buildable (run the locale diff and a reviewer pass); accessibility pass is buildable (axe + 320/200/400 checks). | Two Android phones, laptop, hotspot, devices and checklist signer (TASK-036; OD-4). |
| US3 — frozen, honest evaluation (TASK-039, TASK-040, TASK-041, TASK-043) | Eval harness denoms + cache exclusion + abstention/coverage are buildable as report-format constraints on the existing harness; **no heldout tuning.** | WER speakers, ≥5 timing volunteers and devices. |
| US4 — one identified production build (TASK-042, TASK-060) | `npm run smoke` evidence file is buildable; performance evidence format is buildable. | Managed DB host, real deploy URL, sample size for NFR-001–NFR-006 measurements. |
| US5 — Round 2 package (TASK-044, TASK-045, TASK-046) | Wording-guard + safeguarding-reviewer pass is buildable; the link-check script is buildable. | Organiser cutoff, channel, recipient, exact deck/video formats, judging weights. |
| US6 — finale offline (TASK-053, TASK-054, TASK-055, TASK-058) | Local stack + DEMO_MODE=1 + one-DB rehearsal harness are buildable on top of the existing scripts. | Real laptop, spare laptop, hotspot; venue internet state. |
| US7 — mentor fixes (TASK-056) | none; this lane cannot apply fixes owned by other areas. | The fix list is empty now (OD-3). |
| US8 — user conversations (TASK-057) | none; OQ-019 default is no. | OQ-019 answer from mentors/faculty; consent records if cleared. |

## Project Structure

### Documentation (this feature)

```text
specs/007-quality-release/
├── plan.md              # This file (Puku CLI 2026-10-18)
├── spec.md              # Recovered 2026-10-18 from origin/phase1--mahim-spec007
├── tasks.md             # Buildable task board (this plan)
├── checklists/
│   └── requirements.md  # Recovered 2026-10-18 from origin/phase1--mahim-spec007
└── contracts/           # (no new contracts; consumes feature 001 + 002)
```

### Source Code (no new application code in this feature)

```text
scripts/
└── eval/                 # Existing dev split scripts; this plan adds a report-format wrapper only
eval/
└── reports/              # New evidence directory for the frozen report
tests/
├── eval/                 # Existing; this plan only adds the cache-hit and heldout-split unit tests
└── e2e/                  # Existing; this plan only adds the TC-028 log scan
docs/
├── execution/evidence/   # Existing; this plan adds pre-main-convergence-desk.md
└── device-test.md        # Sign-off file for TASK-036
```

## Open Decisions (carried over from spec.md)

- OD-1 (organiser cutoff, channel, recipient, formats), OD-2 (OQ-019 ethics), OD-3 (mentor fix list), OD-4 (devices), OD-5 (WER speakers and timing volunteers), OD-6 (managed DB host), OD-7 (provider prices and spend so far), OD-8 (judging weights, synthetic acceptability) all remain UNKNOWN. This plan records them and does not invent values.

## Risks

- **RISK-A (high):** The existing matcher + manifest evidence (`docs/execution/evidence/embedding-dependency-note.md`, `seed-cases.md`) shows the heldout split is not yet runnable end-to-end on this machine. The plan handles this by separating "harness buildable" from "heldout run" and explicitly forbids heldout tuning. (PHASE_3 AMD-3-3)
- **RISK-B (medium):** Real `npm run smoke` against a managed DB requires OD-6 to close. The plan records the evidence file format and the command name; the deploy + sample-size run is left as a human/organiser task.
- **RISK-C (medium):** The two-phone checklist is gated on OD-4; this plan refuses to substitute an emulator (NFR-013).
- **RISK-D (low):** 5-rehearsal + 1-internet-off requirement assumes OD-4 supplies devices and a hotspot; if not, the rehearsal log is recorded as missed and the deadline slips, not invented.

## Notes

- This plan **does not** mark any existing unchecked task as done. It appends new convergence tasks for the missing parts (metrics denominators/freeze heldout, TC-021/057 offline one-DB rehearsal, TC-028 log scan) and explicitly marks the human/production/organiser gaps as `human/organiser-blocked`.
- "Buildable" means "can be implemented, tested and merged by a lane without waiting on organiser or human evidence."
- All command and status claims below are real or marked UNVERIFIED; no inferred successes.
