# Phase 4 handoff — 18 October 2026

## Branch and release status

- Working branch: `phase3--phase4-handoff`; PR target: `phase2`.
- Phase 3 is **not release-complete**. G2′, G3 and G4 remain FAIL/UNVERIFIED until their missing evidence is supplied. This branch prepares a reviewable Phase 4 starting point; it does not authorise a freeze, production submission or a claim of measured live AI quality.
- The user delegated technical decisions and cross-owner implementation on 18 October. Puku CLI **Opus 4.8** implemented the finish lanes. Codex integrated, corrected and verified their output. Luna 6 Max handled small earlier tasks and reviews; its quota was exhausted, so final routed reviews used independent Puku sessions with Codex second opinions. No personal approval by Mahim or Masnun is invented.
- Root checkout `phase-3-obidit` was preserved. Use the handoff branch/worktree, not the old parked drafts.

## Implemented paths

Metadata-only intake routes and atomic per-attempt spend reservations; exact-source labelled demo extraction cache; local manual review/submit; parent status and versioned owner edits; officer queue, compare/confirm/reject, case close and safe audit; same-kind duplicate persistence/review; admin-only protected synthetic fixture import; district aggregates, centroid SVG and accessible HTML drill-through; pinned offline q8 embeddings; development-only prediction generation and honest evaluation reports; health probes and opt-in synthetic smoke; browser journeys and log capture.

Source and evidence are linked from [the Phase 3 plan](../PHASE_3_PLAN.md), [quality tracker](../PHASE_3_FULL_SCOPE_QUALITY.md), [verification](../evidence/phase3-finish-verification.md), and [review disposition](../evidence/phase3-finish-review.md).

## Required before release

The user confirmed the first five items are **not completed**, not merely unavailable to the agent.

| Requirement | Evidence to add | Effect |
|---|---|---|
| TASK-003 provider setup | Account/terms, verified prices, keys provisioned out of Git, spend controls | Real paid application calls remain disabled; price sheet UNKNOWN |
| TASK-011 reviewed labels | Human-labelled extraction file, canonical identity/group mapping, reviewer sign-off | Extraction quality is not measured |
| TASK-040 audio | 60 consented clips and reference transcripts | WER is not measured |
| TASK-036 devices | Two physical Android results in `docs/device-test.md` | Browser emulation is not a physical-device pass |
| TASK-041 timing | At least five testers, assistant/manual times | Workflow speed is not measured |
| Human Bangla copy review | Named review of strings marked as needing it | Automated Unicode/copy checks do not replace this |
| TASK-056 mentor fixes | Actual findings and disposition list | Findings and remaining effort UNKNOWN |
| TASK-042 / TASK-060 | Managed DB/deployment configuration, real production smoke and performance evidence | Local production build is not a deployment pass |
| TASK-043 | Reviewed freeze inputs and independent held-out run on the actual release build | No `r2-freeze` tag; test split remains locked |
| Organiser evidence | Cutoff, channel, formats, extension and prior submission status | No email/upload/submission completion claimed |

Current API-001 metadata verification supports PCM WAV; browser WebM/Opus is refused as unsupported. There is no checked-in audio cache or verified live provider configuration. Typed/manual reporting remains available. Do not advertise live voice as accepted.

## Development diagnostics: not release figures

The committed [dev report](../../../eval/reports/phase3-dev-2026-10-18.md) scores real offline predictions generated at source commit `705238a84fc363bd43d72c4f5fd1823992f8cbd8`, with full model/manifest/prediction provenance in the adjacent `.meta.json` files. There are 39 missing-query and 86 duplicate-source outputs; scoring uses 25 labelled true-pair queries, seven no-match queries, and 12 duplicate truth pairs.

- Recall@5: 25/25; top-1: 23/25; no-match false suggestions: 5/7.
- Duplicate precision: 12/302; recall: 12/12; F1: 7.64%. Same-kind shared-phone negatives: 22/25 rejected, three false flags.
- Ranking and duplicate thresholds remain provisional. Calibrate on dev only. These poor precision results are an explicit quality gap, not a successful quality gate.
- Extraction labels `L001`–`L050` currently have no canonical manifest mapping. Establish a genuine reviewed mapping or regenerate unlabelled inputs from canonical records before the human label pass; never invent mappings to make an evaluator run.
- Extraction, WER, participant timing, real-production performance and production audit coverage remain **not measured**. Database/browser audit regressions are separate software evidence.

## Reproduce locally

Use supported Node (`^22.12.0` or `>=24`) and the local PostgreSQL 16/pgvector stack. Never reset or seed a non-local database; never commit `.env*`, credentials, model weights, browser traces or generated logs.

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
```

The Playwright harness creates a dedicated loopback database and per-run signing keys. Its mobile project is Chromium emulation. `model:fetch` verifies the four pinned q8 assets; runtime loading is offline-only and rejects `allowRemote: true`. Set `FERA_MODEL_CACHE` to an absolute verified-cache path when reusing a cache across worktrees.

```sh
npx vitest run --config vitest.predict-dev.config.mts scripts/eval/predict-dev.runner.test.ts
npm run eval:all -- --split dev --match-prediction eval/data/dev-match.jsonl --dedupe-prediction eval/data/dev-dedupe.jsonl
npm run smoke -- http://127.0.0.1:3000 --synthetic-submit --with-status
```

The smoke mutation is explicit and synthetic-only. Its success on localhost does not satisfy production smoke. Default smoke is read-only and reports its submit check as skipped.

## Phase 4 starting order

1. Resolve the evidence table and rerun G2′/G3/G4. Preserve review-before-submit, verified-officer authority, atomic confirm/referral, append-only audit and redaction throughout.
2. Verify the organiser instructions. The old 14 October deadline is a planning baseline; the extension cutoff and previous submission status remain UNKNOWN.
3. Prepare TASK-044 deck (5–8 slides), TASK-045 video (1–2 minutes), and TASK-046 README/folder/link pack using the Phase 4 tracker and D7. Every absent release metric says “not measured”; development diagnostics are not frozen release figures.
4. Run wording guard and `fera-review` on the deliverables, perform logged-out link checks, then send only through the confirmed channel. No message or upload has been sent by this handoff.
