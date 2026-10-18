# TASK-058 — Backup-recording plan (DRAFT, honest, offline worker)

> Honest-fact source. D6 §9.4 sets the policy: if the live finale
> stack fails (internet, deploy, model load, font, device), the
> labelled backup recording is the fallback. This plan describes the
> **synthetic / cached / actual-app** sources we have, the **restore
> and rehearsal** checklist, and the **human-claim gap** that remains.
> No claim is made that the human-recorded backup MP4 exists yet;
> the agent's role is the plan, not the capture.

## 1. Status as of 18 Oct 2026 (user-confirmed)

| Item | Status | Note |
|---|---|---|
| TASK-058 start (plan written) | in progress (this file) | Plan covers synthetic / cached / actual-app sources. |
| Actual human-recorded backup MP4 | **NOT completed** | Mahim (lead) records the labelled rehearsal MP4 against the real app; agent cannot record human output. |
| Backup on laptop | pending Mahim (lead) | Folder, device, and label plan described below. |
| Backup on Drive | UNKNOWN | Drive folder link is **UNKNOWN** (organiser evidence not yet recorded). |
| TASK-054 five rehearsals including one internet-off (GOAL-007) | `todo` | D6 §9.4. |
| TASK-055 timed ≤10-minute deck | `todo` | D6 §9.4. |
| DEP-009 kit checkpoint by **23 Oct** | `todo` | D6 §9.4. |

The agent's plan covers the **synthetic / cached / actual-app**
fallback chain. The **human-recorded** backup MP4 is recorded by
Mahim (lead) on the day; the agent never claims it is complete.

## 2. Why a backup recording exists (the policy)

D6 §9.4: *"A cloud failure restarts a fresh labelled local scenario;
it never transfers cloud state silently. If local fails, use the
labelled backup recording."*

D7 §3.2 commits the Q&A buffer to the labelled backup if the live
stack fails on stage. The backup is the documented fallback, not a
hidden duplicate. The audience must be able to tell — from on-screen
labels and from the narration — that the footage is a backup
recording rather than a live demo, and that the labels are
synthetic / `[MOCK]` / cached as required by Constitution I, II, VI
and VII.

## 3. Synthetic / cached / actual-app sources (already on disk)

These are the **agent-prepared** artefacts that the offline release
worker has hashed and verified. They are honest copy: synthetic
data only, `[MOCK]` officer verification, `referral recorded
(simulation)`, and the actual-app recording is captioned and silent.

| Source | Path | Provenance | Honest label |
|---|---|---|---|
| Actual local-app recording | `submission/demo/final.mp4` | `submission/demo/provenance.json` (git SHA, beat names, SHA-256) | "Actual TASK-045 local-app recording; synthetic data; [MOCK] officer verification; referral recorded (simulation)" |
| Beat-level SRT | `submission/demo/captions.srt` | derived from capture timings | captions aligned to beats |
| Per-beat PNGs | `submission/demo/proof/*.png` | curated from capture | per-beat visual proof |
| Contact sheet | `submission/round2/build/storyboard-contact-sheet.png` | generated from `frames/shot-*.png` | QA contact sheet, **not** the app recording |
| Slide images | `submission/round2/build/slide-imgs/slide-*.png` | generated from `fera-round2-deck.pdf` via `pdftoppm` | QA slide renders, **not** the deck source |
| Deck PPTX | `submission/round2/fera-round2-deck.pptx` | python-pptx generated | editable deck, draft |
| Deck PDF | `submission/round2/fera-round2-deck.pdf` | LibreOffice render of the PPTX | PDF render, draft |

These are tracked in `submission/round2/links.txt` and verified by
`docs/execution/evidence/pre-main-phase4-readiness.md`. The release
checker is `scripts/release/check.mjs`; the test suite is
`tests/release/check.test.ts`.

### Hashes and provenance (recorded by the offline worker)

The release-check CLI writes SHA-256 of every allowlisted file to
`docs/execution/evidence/pre-main-phase4-readiness.md`. The actual
local-app recording's `submission/demo/provenance.json` records the
git SHA, capture-script SHA-256, beat names, and per-beat PNG hashes.

The agent can verify hashes and bytes on demand, but cannot re-record
the human demo. The human recording is the lead's deliverable.

## 4. Restore and rehearsal checklist (the runbook)

### 4.1 Local stack rehearsal (internet-on)

```
# 1. Fresh synthetic database
npm run db:up
npm run db:reset
npm run seed -- --set demo

# 2. Build and serve the app
npm run build
DEMO_MODE=1 npm start

# 3. Sanity-check the local app
curl -sS http://127.0.0.1:3000/api/health
# expect {"synthetic_only":true} or the framework's local health response

# 4. Replay the local capture
node scripts/demo/orchestrate.mjs
node scripts/demo/capture.mjs
node scripts/demo/postprocess.mjs
node scripts/demo/verify.mjs
# expect: "OK: 8 beats, 105.000 s, h264, 1280x720"

# 5. Run the offline release-check
node scripts/release/check.mjs --output /tmp/fera-readiness.md
# expect: exit 2 when external UNVERIFIED URLs are present,
#         exit 0 if no external URLs and all local checks PASS.
```

The local stack rehearsal proves the app boots, the synthetic data
loads, the capture pipeline runs, and the offline release-check
exits with the honest `0` / `1` / `2` codes.

### 4.2 Local stack rehearsal (internet-off, GOAL-007)

The same as 4.1 with the network adapter disabled. The model and
fonts must be preloaded (`npm run model:fetch` and the font assets
under `public/`) so the demo does not reach the network. The
runtime must continue to serve `127.0.0.1:3000` from the laptop
stack. The release-check stays exit 0 / 1 / 2 in this mode (the
script never opens a TCP connection).

### 4.3 Backup-recording restore (the day)

If the live stack fails on stage, the labelled backup recording is
played from the laptop. The audience is told explicitly:

- "The recording you are watching is the labelled backup, captured
  on {date} from the same local stack; the live demo was not
  possible because {reason}."
- The on-screen `[MOCK]`, `synthetic`, `referral recorded
  (simulation)`, and `cached` labels stay visible.
- The Q&A answers stay aligned with `docs/demo/qa-prep.md`, and any
  claim that depends on a live measurement is replaced with "not
  measured" (BR-026, Principle VI).

The Q&A buffer (D7 §3.2) is the safety margin; the backup recording
is the explicit fallback when the buffer is needed.

## 5. Restore artefacts (what the laptop must have on 24 Oct)

| Path on the laptop | Source in the repo | Honest label |
|---|---|---|
| `submission/demo/final.mp4` | `submission/demo/final.mp4` | actual local-app recording, 105.000 s, 1280x720, H.264, silent, captioned |
| `submission/demo/captions.srt` | `submission/demo/captions.srt` | beat-level SRT |
| `submission/demo/provenance.json` | `submission/demo/provenance.json` | git SHA + SHA-256 hashes |
| `submission/demo/proof/*.png` | `submission/demo/proof/*.png` | per-beat PNGs |
| `docs/demo/qa-prep.md` | `docs/demo/qa-prep.md` | honest Q&A answers |
| `docs/demo/backup-plan.md` | `docs/demo/backup-plan.md` | this file |
| `docs/execution/evidence/pre-main-phase4-readiness.md` | `docs/execution/evidence/pre-main-phase4-readiness.md` | offline release-check output |
| `docs/spec/D7_Closing_Pack_V2.md` | `docs/spec/D7_Closing_Pack_V2.md` | demo script and release contract |

The `submission/round2/` directory is local preparation only (the
deck and storyboard are drafts); the `submission/demo/` directory
holds the **actual** TASK-045 capture, which is the only recording
in the pack that is a real app recording rather than a synthetic
storyboard.

The human-recorded backup MP4 (TASK-058) is produced by Mahim
(lead) and lives at a path chosen by the lead; this plan does not
predict that path because the capture is not yet done.

## 6. Honest gaps and escalation (UNCHANGED from PHASE_5_BUFFER_FINALE.md)

- **H-10** (TASK-058 backup MP4 on laptop and Drive): **NOT completed**.
  The plan is this file; the recording is lead-side. The agent does
  not claim the recording exists.
- **READY-21** (TASK-058 Drive upload): **UNVERIFIED** — Drive
  folder is UNKNOWN until the lead records organiser evidence.
- **READY-15…19** (no human labels / audio / device / timing /
  provider evidence): **NO** for this cycle. Recorded as "not
  completed" for this cycle.
- **OQ-019** (TASK-057 5–10 user conversations): UNKNOWN until
  mentors and faculty clear it. No interview count is invented.

The agent is honest about every gap above. The labelled backup
recording is the documented fallback for the finale; whether the
recording, the rehearsals and the DEP-009 kit checkpoint all happen
on schedule is for the lead to evidence, not for the agent to
predict.

## 7. Why this plan is "honest" (Constitution VI)

- Synthetic / cached / `[MOCK]` / "referral recorded (simulation)"
  labels are never hidden.
- No alert, runaway, rescue, CID/police integration or
  legal-compliance claim is made.
- No measurement is presented as a result. The metrics stay "not
  measured" until a live run with a human-labelled set is
  completed.
- The agent-prepared artefacts are tracked in this worktree and
  verified by the offline release-check. The human-recorded backup
  is the lead's deliverable and is recorded as **NOT completed**
  here, never as a hidden PASS.
- The restore and rehearsal checklist is reproducible from the
  current source checkout; every step is an existing `npm` /
  `python3` / `node` command. No vendor model name is presented as
  Fera evidence.

## 8. Pointer to the offline release-check artefact

`docs/execution/evidence/pre-main-phase4-readiness.md` is the
honest-readiness report produced by `node scripts/release/check.mjs`.
Exit code 0 means every local check PASS; 1 means a real local
problem; 2 means only UNVERIFIED external URLs remain (the
"ready with external blockers" state, not a hidden PASS). The
script never opens a TCP connection and never claims G5 PASS.
