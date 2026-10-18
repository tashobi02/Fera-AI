# Fera AI (ফেরা)

> Final snapshot — 18 Oct 2026: application source `9155963`; build/typecheck/lint PASS (51 lint warnings, five build warnings); 3,693 unit pass/308 skip; 320 DB pass; 78 browser pass/zero skip. Full remote CI passed. The seven-slide deck (`ed3bfe6`) and actual 105-second local video (`27bb3c6`) are prepared and reviewed. Audit documents are committed separately. Round 2 is not submitted. Human evidence, production acceptance, frozen quality, organiser instructions, Drive and private-repository sharing remain unresolved. Phase 5 handoff is prepared, not started.

Fera AI is a planned Bangla-first web app for missing-child case coordination in Bangladesh, prepared for Hack for Humanity Bangladesh 2026. A parent or guardian reports a missing child by browser voice recording or text, reviews the structured report, and receives draft text outputs. Shelter and station staff record found-child reports; AI retrieves and ranks possible matches for a verified officer to review. Each case tracks a recorded coordination outcome. This hackathon prototype uses invented synthetic records; a recorded referral or closure does not establish delivery, identity, custody, rescue or safe reunification.

> **Status** (18 Oct 2026 audit)
>
> Synthetic-data prototype · Metrics not measured at release quality · Gates FAIL/UNVERIFIED · **Overall Fera PASS not claimed at this commit**
>
> - Software: application commit **`9155963`** builds (Turbopack), typechecks, lints with **0 errors / 51 warnings**, passes **3,693 / 308 skipped** unit tests across **172 / 28 skipped** files, **320 / 30 files** PostgreSQL 16 + pgvector DB tests, and **78 passed browser checks, no skips** Playwright journeys against a fresh local loopback DB. The recorded-video commit is **`27bb3c6`**, which adds the recorded local demo on top of the application source `9155963`; the two commits are distinct and the application code itself remains at `9155963`. The local `npm run smoke` is read-only by default; `--synthetic-submit` explicitly enables synthetic mutations and and is not a production pass. Build emits 5 dynamic-fs warnings in `src/server/embeddings/model.ts`. Current rerun: `/tmp/fera-finish-{unit,lint,build,typecheck,e2e}.{json,log}`. DB SQL/service unchanged after the final rerun: `/tmp/fera-complete-db.log`. The intermediate 18 / 8 e2e, 3,642 unit / 197 file / 66 server-test counts cited earlier are **historical** and are not the current claim; the current root integration e2e total is **78 passed browser checks, no skips**.
> - Reviews: all eleven reviewers ran final dispositions and the narrow 5-scope code-only re-review at `/tmp/fera-disposition-final-code.json` returned **PASS on all 5 scopes** (a11y, BN, TS, SFH, Fera safeguarding). `fera-safeguarding-reviewer` withdrew the parent-DTO `matching_state` false-finding per D2A mandates own / staff field (`/tmp/fera-disposition-fera-safeguarding-reviewer.json`); `silent-failure-hunter` PASS after narrow notice-log fix (`2d8c921`/`9155963`); `typescript-reviewer` PASS after batch + price-cause fix; `database-reviewer` PASS after SQLSTATE + typed tests fix; `impeccable-finish-reviewer` PASS after parent-5 native confirms replaced localized dialogs and officer focus / descriptions fix; focus `outline-none` fixed at root `e9708fc`; `bengali-reviewer` APPROVE after the `সহায়তা` typo fix (`ec6838b`); `react-reviewer` PASS (advisory); `security-reviewer` PASS with 2 LOW; `a11y-architect` and `mle-reviewer` PASS after rerun (the W3C/MDN-cited false findings — table rowheaders, tabindex scroll, district label, direction, disabled native control — were also withdrawn per <https://www.w3.org/WAI/tutorials/tables/two-headers/> and <https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overflow>). **Overall Fera PASS is not claimed at this commit.** See [`docs/execution/evidence/phase3-finish-review.md`](docs/execution/evidence/phase3-finish-review.md) and [`docs/execution/evidence/phase4-audit-evidence-2026-10-18.json`](docs/execution/evidence/phase4-audit-evidence-2026-10-18.json).
> - Quality (dev split, original f25 dev diagnostic at `eval/reports/phase3-dev-2026-10-18.md`; not a fresh release figure, unmodified, not re-run at `9155963`): Match — recall@5 **100 %** (denom 25), top-1 **92 %** (23/25), P@5 **32 %** (denom 25), no-match FP rate **71.43 %** (5/7). Dedupe — precision **3.97 %** (12/302), recall **100 %** (12/12), F1 **7.64 %**. Same-kind shared-phone rejection **22/25** (3 false flags). Extract / WER / time / audit coverage print **"not measured"** with reasons. TASK-011's 50 DEV-only blank `{}` rows in `eval/data/labelled.canonical.draft.jsonl` are fixtures with **no human labels**, and the historical L001–L050 set is **unmapped**; no held-out inference or tuning is performed. The dev-diagnostic precision figure (12 / 302) is explicitly poor and is disclosed, not a release-quality claim. These are dev diagnostics, not frozen release figures. `/tmp/fera-complete-eval-all.log` was never run; do not cite it.
> - Gates: W0.0 (internal) **PASS**; G2′ (Mon 19 Oct 22:00) / G3 / G4 / G5 are **FAIL — UNVERIFIED** at audit time. G3 / G4 / G5 fail because no human / production / official receipt and no `r2-freeze` tag (or rebaselined name) exists. See [`docs/gates/G3-2026-10-18.md`](docs/gates/G3-2026-10-18.md), [`docs/gates/G4-2026-10-18.md`](docs/gates/G4-2026-10-18.md), [`docs/gates/G5-2026-10-18.md`](docs/gates/G5-2026-10-18.md) and the audit at [`docs/execution/PHASE_3_AUDIT_2026-10-18.md`](docs/execution/PHASE_3_AUDIT_2026-10-18.md).
> - Phase 5: `todo / prepared` (user said "be ready to start, not actually start it" on 18 Oct). Readiness blocked queue in [`docs/execution/PHASE_5_BUFFER_FINALE.md` §"Phase 5 readiness blocked queue"](docs/execution/PHASE_5_BUFFER_FINALE.md#phase-5-readiness-blocked-queue-18-oct-2026) and the next-agent queue in [`docs/execution/handoff/PHASE_5_HANDOFF.md`](docs/execution/handoff/PHASE_5_HANDOFF.md). **Not started / not passed off-line journey.**
> - Release: no production deploy, no managed DB evidence, no `r2-freeze` tag (or rebaselined name), no submission email. Round 2 was **NOT submitted** as of 18 Oct (user-confirmed). Organiser cutoff, channel and required formats are **UNKNOWN** until Mahim (lead) records them. The 14 Oct 22:00 cutoff is a working baseline; the user reports an organiser extension. **Full offline app journey is not PASS.** The Phase 4 deliverable pack has been integrated at `27bb3c6`: 7 editable PPTX + PDF slides, the **actual recorded local demo** at `submission/demo/final.mp4` (105.000 s, 1280×720, H.264, eight proof PNGs, captions/provenance validated; explicit seeded officer scenario, no real voice; verified in `/tmp/fera-demo-verified.log`), scripts, metrics and links; an independent SG artifact review returned PASS at `/tmp/fera-disposition-submission.json` (`64 claims PASS, 0 FAIL`). A separate storyboard preview in `submission/round2` is **not** the actual demo. Artifact preparation may finish while G4 is blocked; actual upload, email and release remain blocked. Remote CI: <https://github.com/tashobi02/Fera-AI/actions/runs/39114757484> completed successfully (check, DB and browser jobs); the video is committed at `27bb3c6` and audit documents are committed separately.
> - Provider setup, audited labels, consented audio, physical Android devices, ≥5 human timing participants, mentor fix list and human Bangla review are confirmed not completed (per the prior handoff record), not merely unavailable to the agent. Prices and accounts are **UNKNOWN**. Default paid-cap remains **USD 25**; a documented team decision may raise it to at most USD 30.
> - Live referral delivery is outside this synthetic prototype. No alerts, no CID or police integration, no "runaway" or "rescue" wording. Similarity is not identity probability.

## Safeguarding rules

- AI retrieves and ranks only. A verified officer confirms every match. Officer verification is simulated and labelled in this prototype.
- No alerts issued or broadcast. No photos, face search, or identity documents. No "runaway" labels. No physical return action.
- No legal compliance claims. Qualified legal-review status is **UNKNOWN**; the specification contains legal references, not a compliance conclusion.
- Invented synthetic data only. Similarity is not identity probability. `referred` means referral recorded in a simulation; `closed` records a coordination outcome.

## What the project does not do

- No alerts or CID or MUN Alert integration.
- No live police data or real-child intake.
- No SMS or voice-call intake; planned voice intake uses a browser recording.
- No automatic GD filing, external referral delivery or child-return operation.

## Evaluation status (dev diagnostics — not release figures)

The dev split at integration commit `f25de23` is at [`eval/reports/phase3-dev-2026-10-18.md`](eval/reports/phase3-dev-2026-10-18.md) (and the matching [`.json`](eval/reports/phase3-dev-2026-10-18.json)). Every number below carries its denominator; every missing measurement prints `not measured (<reason>)`.

| Module | Measured? | Denominator | Result (dev split, original f25 dev diagnostic; not a fresh release figure at `9155963`) |
|---|---|---|---|
| extract | no | 50 unmapped labels L001–L050 | not measured |
| match — recall@5 | yes | 25 truth-pair queries | **100.00 %** (0 true-pair miss) |
| match — top-1 | yes | 25 truth-pair queries | **92.00 %** (23/25) |
| match — P@5 | yes | 25 truth-pair queries (incl. empty/zero) | **32.00 %** (denom 25) |
| match — no-match FP rate | yes | 7 no-match queries | **71.43 %** (5/7) |
| dedupe — pairwise precision | yes | 302 declared pairs | **3.97 %** (12/302) |
| dedupe — pairwise recall | yes | 12 truth | **100.00 %** (12/12) |
| dedupe — F1 | yes | — | **7.64 %** |
| dedupe — same-kind shared-phone rejection | yes | 25 pairs | **22/25 refused** (3 false flags) |
| wer (TASK-040) | no | no references | not measured |
| time (TASK-041) | no | empty timing file | not measured |
| audit coverage (TC-016) | no | 0 decisions | not measured |

The poor dedupe precision and the high no-match false-positive suggestion rate are explicit quality gaps. These are dev diagnostics, **not frozen release figures**; held-out tuning is forbidden; `FREEZE_FLAG` remains `NOT SET`. There is no verified production deployment, no held-out run, no production smoke, no measured spend, no `r2-freeze` tag (or rebaselined name). The actual recorded local demo at `submission/demo/final.mp4` (105.000 s, 1280×720, H.264) is present, validated, and integrated at `27bb3c6`; it is a local synthetic capture, not a production recording. The README will be re-edited to reflect the frozen report and the measured-on-release numbers when G4 evidence lands.

## Implemented stack (application commit `9155963`; integration HEAD `27bb3c6`)

The following choices are present in the source tree at `9155963` and run on a fresh local loopback PostgreSQL 16 + pgvector container. Production deploy (managed host, Vercel) is **not** done.

| Area | Implemented choice | Notes |
|---|---|---|
| UI and API | Next.js App Router + React + strict TypeScript + Tailwind; Node.js route handlers | Turbopack production build is green; 16 dynamic `/api/*` + 16 page routes |
| Validation and database access | Zod; `pg`, `pgvector` helper; hand-written SQL | `db/schema_v2.sql` + `db/roles.sql` are the single source; SECURITY DEFINER wrappers with pinned `search_path` |
| Database | PostgreSQL 16 + pgvector; local `fera-db` container for dev/tests | 30 DB test files / 320 tests pass on a fresh DB per file; managed host evidence is UNKNOWN |
| Authentication | Auth.js credentials for staff/officers/admins; signed anonymous parent cookie; `DRAFT_SIGNING_KEY` fails closed | No fallback to `AUTH_SECRET`; per-principal `pg_advisory_xact_lock` for the active-draft cap |
| Speech and extraction | Whisper-style STT adapter (scripted stub; PCM WAV only); provider-agnostic LLM adapter with fallback to a scripted stub; `scriptedLlm.extract()` returns `ok:false` so cannot masquerade as success | Real provider keys, prices and terms are UNKNOWN; no live paid application call |
| Embeddings | Transformers.js with `Xenova/multilingual-e5-small` q8 (384-d); pinned revision | Local-only; runtime refuses `allowRemote: true`; Vercel viability UNKNOWN |
| Map and exports | District centroid SVG + accessible HTML table drill-through; bundled 64 districts with neighbours | No new district-outline data, no unverified licence; no leaflet outline map |
| Hosting | Vercel for Round 2 (planned); laptop-local app + PostgreSQL for the isolated fallback journey | No Vercel project evidence; `DEMO_MODE=1` laptop stack is on the Phase 5 queue (P5-101) |
| Verification and logging | Vitest, Playwright + axe, `tsx` evaluation scripts, pino with redaction | 3,693 unit tests pass / 308 skipped across 172 files; 78 browser e2e checks pass (no skips); redaction config in place; log-scan TC-028 in the e2e suite |

## Current repository layout

Only existing project files are shown; Git metadata and workspace control directories are omitted.

```text
.
├── README.md
├── AGENTS.md · CLAUDE.md · CODEX.md     # agent instructions (shared · Claude Code · Codex)
├── DESIGN.md · PRODUCT.md               # visual system and product brief (impeccable skill)
├── THIRD_PARTY_NOTICES.md
├── package.json · tsconfig.json · .gitignore · .env.example
├── demo/
│   └── Fera — clickable prototype and blueprint.html
├── scripts/agents/                      # bootstrap.sh, new-lane.sh
├── third_party/                         # licences for vendored agent tooling
└── docs/
    ├── README.md · MANIFEST.json
    ├── code/                            # schema_v2.sql, fera_types_v2.ts, tokens_v2.css
    ├── markdown/                        # V2 spec pack (hashed in MANIFEST.json)
    ├── spec/                            # working copy of markdown/ used by agents
    ├── pdf/                             # V2 spec pack PDFs + team handbook
    ├── verification/                    # companion checks (not application acceptance)
    ├── agents/                          # agent roster, spec-kit prompts
    ├── execution/                       # execution plan + live per-phase trackers
    └── gates/                           # gate reports (fera-gate)
```

## Setup commands (application commit `9155963`; integration HEAD `27bb3c6`)

Node.js: supported versions are `^22.12.0` or `>=24`. Application source, dependencies and lockfile are present. **Production deploy is not done**; the local `npm run build` is not a deployment pass.

```sh
cp .env.example .env.local
```

This creates a local configuration template with every variable name from D2B §15.1 and empty values (except documented defaults `AI_SPEND_CAP_USD=25`, `DEMO_ONLY=true`, `DEMO_MODE=0`); it is not working credentials. Real provider keys, models, accounts, prices and terms remain **UNKNOWN** and are not committed.

```sh
npm ci
npm run db:up
npm run model:fetch
npm run build
npm run typecheck
npm run lint
npm test
npm run test:db
npm run test:e2e
npm run seed -- --set demo
npm run eval:all -- --split dev --match-prediction eval/data/dev-match.jsonl --dedupe-prediction eval/data/dev-dedupe.jsonl
npm run smoke -- http://127.0.0.1:3000 --synthetic-submit --with-status
```

`db:up` starts a local `fera-db` PostgreSQL 16 + pgvector container; never point it at a non-local database. `model:fetch` verifies the four pinned q8 assets; runtime loading is offline-only and refuses `allowRemote: true`. `test:e2e` creates a dedicated loopback database and per-run signing keys; the mobile project is Chromium emulation, not a physical device. `smoke` is read-only by default; the explicit `--synthetic-submit` mutation is synthetic-only. Smoke on localhost does not satisfy production smoke.

The schema application command, against a fresh isolated synthetic database (not an in-place migration), is:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/schema_v2.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/roles.sql
```

`docs/code/schema_v2.sql` is the spec companion; `db/schema_v2.sql` is the runtime copy and must match the spec companion. `db/roles.sql` is required to grant column- and EXECUTE-scoped permissions to `fera_app` and `fera_redactor`. An `.env.local` file alone does not export `DATABASE_URL` into the shell.

See [verification instructions and limits](docs/verification/README.md). Stored companion results do not establish application acceptance or measured product quality.

## V2 specification documents

The authoritative local package is `docs/`, issued 11 October 2026 (Asia/Dhaka), edition 2.0.

- [Package README](docs/README.md)
- [Team handover](docs/markdown/TEAM_HANDOVER_V2.md)
- [D1: Product requirements](docs/markdown/D1_PRD_V2.md)
- [D2A: Technical contracts and schema](docs/markdown/D2_TRD_PartA_V2.md)
- [D2B: Security, privacy, cost and evaluation](docs/markdown/D2_TRD_PartB_V2.md)
- [Registry and gap check](docs/markdown/00_Gap_Check_and_Registry_V2.md)
- [D3: App flows](docs/markdown/D3_App_Flow_V2.md)
- [D4: Design brief](docs/markdown/D4_Design_Brief_V2.md)
- [D5: Types and ID registry](docs/markdown/D5_Background_Schema_V2.md)
- [D6: Implementation and acceptance plan](docs/markdown/D6_Implementation_Plan_V2.md)
- [D7: Closing pack](docs/markdown/D7_Closing_Pack_V2.md)
- [Manifest](docs/MANIFEST.json)

Keep the three files in `docs/code/` byte-identical to their embedded document versions. Verify SHA-256 against `docs/MANIFEST.json` before using any copy.

## Authors

Sadman Shaharier, Obidit Islam.

## Audit amendments (2026-10-12)

- **AMD-README-1 — Gap:** unsupported negative evidence. **Change:** old “The application has not been built. Provider accounts, partner approval and live referral delivery are absent” now separates missing local implementation from UNKNOWN external account/approval status; no actual delivery is implemented by this prototype. Old “The Personal Data Protection Act (2026) has not been reviewed” now records UNKNOWN review status and no compliance claim. **Source:** handover §§5,7,10.
- **AMD-README-2 — Gap:** package identity and execution references were ambiguous. **Change:** this is the earlier root application-skeleton README, with team edits adding orchestration paths; the package README is `docs/README.md` and remains unchanged. Use [execution plan](docs/execution/EXECUTION_PLAN.md) and its phase amendments for the 184 h Round 2 baseline, 222 h overall estimate and gate evidence. 14 Oct 22:00 is a working cutoff baseline, 21:00 internal target; the user reports organiser extension flexibility, replacement date/time **UNKNOWN**. Kit due 23 Oct; finale 24 Oct. All app commands remain **planned**, failing stubs, with no installs/deployment/evaluation claimed. **Source:** HEAD diff; handover §§6,10; D1 DEP-009.
- **AMD-README-3 — Gap:** spend default not visible in skeleton. **Change:** `.env.example` now carries documented `AI_SPEND_CAP_USD=25` alongside synthetic/demo flags; actual keys/models/accounts/prices remain blank/UNKNOWN. `test:e2e` and `db:reset` join the existing fail-fast planned script interfaces, without executing a test or resetting a DB. `tsconfig.json` remains a strict standalone companion config; Next bundler/app configuration belongs to TASK-001. **Source:** D2B §§12,15; G0 TASK-001; AGENTS planned commands.
- **AMD-README-4 — Gap:** the 18 Oct audit rewrote Status, Evaluation status, Implemented stack and Setup commands; the older "not runnable" framing no longer matches the integration tree. **Change:** Status block now cites the **application** commit `9155963` and the recorded-video commit `27bb3c6` (which adds the recorded local demo on top of the application source), the final-review dispositions (all eleven reviewers ran, narrow 5-scope code-only re-review at `/tmp/fera-disposition-final-code.json` returned PASS on all 5 scopes; SG false-finding withdrawn, TS / registry / parent-5 / officer / focus / BN fixed; SFH narrow fix verified at `2d8c921`/`9155963`), the current root transcripts (`/tmp/fera-finish-{unit,lint,build,typecheck,e2e}.{json,log}` — 3,693 / 308 skipped unit tests, 172 files; 320 / 30 files DB from `/tmp/fera-complete-db.log`; 78 browser e2e checks, no skips; 0 lint errors / 51 warnings; 5 build warnings), the measured dev-split numbers (with denominators) and the FAIL/UNVERIFIED verdicts for G2′/G3/G4/G5. Evaluation status table links [`eval/reports/phase3-dev-2026-10-18.md`](eval/reports/phase3-dev-2026-10-18.md) and the matching `.json`, and discloses TASK-011's 50 DEV-only blank `{}` rows with no human labels and the historical L001–L050 set as unmapped; the dev report is the original f25 dev diagnostic, unmodified, not a fresh release figure, and `/tmp/fera-complete-eval-all.log` was never run. Implemented stack replaces the older "Planned stack" wording. Setup commands now reflect `npm ci` / `db:up` / `model:fetch` / `test:db` / `test:e2e` / `seed` / `eval:all` / `smoke`; no production deploy, no managed host evidence, no `r2-freeze` tag, no submission email, and Round 2 was NOT submitted as of 18 Oct (user-confirmed). The Phase 4 deliverable pack is integrated at `27bb3c6`: 7 PPTX + PDF slides + the actual recorded local demo at `submission/demo/final.mp4` (105.000 s, 1280×720, H.264, eight proof PNGs, captions/provenance validated; no real voice, typed flow + explicit seeded scenario; verified in `/tmp/fera-demo-verified.log`) + scripts + metrics + links; an independent SG artifact PASS is recorded at `/tmp/fera-disposition-submission.json`. The separate storyboard preview in `submission/round2` is **not** the actual demo. Remote CI <https://github.com/tashobi02/Fera-AI/actions/runs/39114757484> is completed successfully (check, DB and browser jobs); the video is committed at `27bb3c6` and audit documents are committed separately. **Source:** [`docs/execution/PHASE_3_AUDIT_2026-10-18.md`](docs/execution/PHASE_3_AUDIT_2026-10-18.md); [`docs/execution/evidence/phase3-finish-review.md`](docs/execution/evidence/phase3-finish-review.md); [`docs/execution/evidence/phase3-finish-verification.md`](docs/execution/evidence/phase3-finish-verification.md); [`docs/execution/evidence/phase4-audit-evidence-2026-10-18.json`](docs/execution/evidence/phase4-audit-evidence-2026-10-18.json); [`docs/gates/G3-2026-10-18.md`](docs/gates/G3-2026-10-18.md); [`docs/gates/G4-2026-10-18.md`](docs/gates/G4-2026-10-18.md); [`docs/gates/G5-2026-10-18.md`](docs/gates/G5-2026-10-18.md); [`docs/execution/handoff/PHASE_5_HANDOFF.md`](docs/execution/handoff/PHASE_5_HANDOFF.md); [`docs/execution/handoff/PHASE_4_HANDOFF.md`](docs/execution/handoff/PHASE_4_HANDOFF.md).
