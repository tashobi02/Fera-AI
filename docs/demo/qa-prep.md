# Fera finale Q&A prep (D7 §3.2) — offline worker draft, 18 Oct 2026

> Honest-fact source. D7 §3.2 ("Finale: 8 minutes plus 2-minute Q&A
> buffer") is the contract for the AIUB finale; the questions below
> are the questions that the offline release worker can answer with
> recorded evidence. Anything not in the *Honest evidence* column
> stays **UNKNOWN** and is escalated to Mahim (lead), Masnun
> (data/matching) or Obidit (intake/AI) on the day.
>
> **Round 2 status as of 18 Oct 2026:** not submitted; recipient,
> channel, cutoff and Drive folder are **UNKNOWN** until the lead
> records organiser evidence in `docs/gates/G5-*.md`. This file
> does not claim G5 PASS or that Round 2 was sent.

## 1. What is Fera?

| Question | Honest answer | Honest evidence |
|---|---|---|
| What problem is Fera solving? | Bangla-first case coordination for missing and found children in Bangladesh, on a synthetic-data prototype. No real child data, no alerts, no physical return, no CID/police integration. | AGENTS.md "What we are building"; `.specify/memory/constitution.md` I–VII |
| What is in the demo? | The actual local synthetic 1:45 recording at `submission/demo/final.mp4` (105.000 s, 1280×720, H.264, silent, captioned). Typed flow + explicit seeded officer scenario; **no real voice**. | `submission/demo/provenance.json`; `submission/demo/verify.mjs` (independent re-check) |
| What does the 7-slide deck show? | A short, editable deck at `submission/round2/fera-round2-deck.pptx` plus a PDF render. Every metric on the deck is "not measured" with a reason. | `submission/round2/fera-round2-deck.pptx`; `submission/round2/metrics.md` |
| Is this Round 2 final or a draft? | The Round 2 draft pack exists locally. Submission to the organiser has not happened; recipient, channel, cutoff and Drive folder are **UNKNOWN**. | `docs/execution/PHASE_4_SUBMISSION.md` AMD-4-1; `docs/gates/G5-2026-10-18.md` |

## 2. Honest limits you must say on stage

- **No real child data.** No photos, faces, ID documents or exact coordinates (Constitution VII, BR-006). The only "actors" are seeded MOCK records in `submission/demo/capture.mjs` and the synthetic seed set under `data/`; provenance is at `submission/demo/provenance.json`.
- **Officer verification is `[MOCK]`.** The recording shows a seeded officer scenario with explicit human reject and confirm. Officer verification in production would be done by a verified officer, not by an AI; the case service writes `referral recorded (simulation)` and never claims delivery (Constitution II, VI).
- **Release metrics are not measured.** The frozen held-out run (TASK-043), WER (TASK-040, 60 consented clips), end-to-end latency on a labelled set (TASK-041, ≥5 testers), total spend (no live paid call this cycle) and duplicate precision are all **not measured** this cycle. Each metric says "not measured" with its reason in `submission/round2/metrics.md`. The old dev-only diagnostic (12/302 duplicate precision) is a dev measurement on a different split and is not a released metric.
- **Timing is edited.** The recording is 105.000 s; the live journey takes longer. Time compression is labelled on screen (`[MOCK]`) and in narration.
- **Provider / model / spend.** Default provider cap is USD 25; team may raise to at most USD 30. No live paid call has been issued in this cycle, so actual spend is **not measured** (D2B §12/§15; AGENTS.md AMD-AGENTS-5).
- **Repository visibility.** Repo URL: `https://github.com/tashobi02/Fera-AI`. The repo is PRIVATE; logged-out public access and organiser reviewer access are owner-decision territory, not an agent's. Don't claim the link is publicly open in the Q&A.
- **The storyboard MP4 in `submission/round2/` is not the actual demo.** It is a synthetic on-screen-caption storyboard that illustrates the journey; the actual recorded demo is `submission/demo/final.mp4`. This is recorded in `submission/round2/links.txt` and must not be confused on stage.
- **No interview / no human labels / no WER.** "User interviews held" is UNKNOWN for this cycle; there is no labelled 60-clip Bangla set, no human audio, no human device timing, and no provider evidence. Recorded as "not completed" in `docs/execution/PHASE_5_BUFFER_FINALE.md` (READY-15…19).

## 3. Likely Q&A and the honest answer

### A. Architecture

- **What stack runs locally?** Next.js App Router (TypeScript strict, Tailwind) + Zod + PostgreSQL 16 with `pgvector` via hand-written SQL (no ORM) + Auth.js credentials + Transformers.js `multilingual-e5-small` (384-d) + Whisper STT (PCM WAV only) + a provider-agnostic LLM adapter with a fallback + Leaflet with bundled district outlines. Vercel for Round 2, laptop stack with `DEMO_MODE=1` for the finale. (AGENTS.md "Stack".)
- **What is `db/schema_v2.sql`?** A byte-identical copy of `docs/code/schema_v2.sql`; `src/contracts/` and the schema freeze at G1. Any change after that needs a PR reviewed by all three owners.
- **Why no ORM?** Schema migrations are hand-written SQL because the spec pack requires exact lock/audit/state-guard semantics that an ORM would hide.

### B. Data and evaluation

- **What is the dataset?** A synthetic Bangla seed set, frozen before any tuning would be allowed. There is no real child data anywhere; that is the prototype's contract.
- **Why is the held-out metric "not measured"?** The frozen held-out run is TASK-043. The provisional independent split exists in dev but is not the released frozen manifest for this cycle. The script `eval/match.mjs` still prints "not measured" until a canonical mapping is supplied. (See `submission/round2/metrics.md` §5; `docs/execution/PHASE_3_AUDIT_2026-10-18.md` §3.5a READY-11.)
- **What about WER?** Whisper STT is used; voice path is PCM WAV only, WebM is not supported. WER is not measured because there is no labelled 60-clip Bangla set. (D6 TASK-040; `submission/round2/metrics.md` §2; READY-17.)
- **What about duplicate precision?** 12/302 was a dev diagnostic only; the released duplicate precision is **not measured** this cycle. (READY-11; `submission/round2/metrics.md` §5.)

### C. Safeguarding and role boundaries

- **Who can see candidates and the other party's data?** Only **verified** officers. Parents see their own report and status, staff see their own found reports, admins see aggregates and redacted metadata. (Constitution III, BR-007/024.)
- **Can the AI confirm or close a case?** No. AI retrieves and ranks; a verified officer records the decision. The case service writes `referral recorded (simulation)`, never "delivered", "returned" or "reunified". (Constitution II, VI; BR-008/018/021.)
- **Review before submit?** Yes. A parent must review the extracted fields before any missing-report payload is stored, matched, shown to another party or exported. Providers may process audio/text only after the on-screen notice; the server stores only expiry/counter/hash/cost metadata before submit. (Constitution I, BR-004/023, FR-006/007/031.)
- **What about child data in logs?** Logs never carry child names, phone numbers or free text. Audit is append-only; `UPDATE`, `DELETE` and `TRUNCATE` on audit are rejected; the runtime role has no DDL. (Constitution V, BR-009/010, NFR-010.)

### D. Submission status (for the AIUB finale, where judges ask "is the submission in?")

- **Was Round 2 submitted?** Not as of 18 Oct 2026 (user-confirmed). Recipient, channel, cutoff, Drive folder, repository reviewer access and selection-email reply are **UNKNOWN** until Mahim (lead) records organiser evidence. (PHASE_4 §G5; `docs/gates/G5-2026-10-18.md`.)
- **What is the cutoff?** Working baseline was 14 Oct 2026 22:00 Asia/Dhaka. The user reported an organiser extension; the new cutoff/date is **UNKNOWN** (TEAM_HANDOVER_V2 §10; AMD-4-1).
- **Is the deck public?** The deck is in the source checkout. Public visibility depends on Drive access and reviewer access, both of which are owner-decision territory.
- **What about the 5–8 slides / 1–2 min video / Drive folder / `r2-freeze` tag?** The seven-slide deck (`ed3bfe6`), the 105-second local video (`27bb3c6`) and the local draft zip are prepared. The `r2-freeze` tag is **not** applied; no frozen release build is on the `r2-freeze` (or rebaselined) tag because frozen evaluation, production acceptance and human evidence are missing. (PHASE_4 §G5; AMD-4-1.)

### E. What is honest-construction in this prototype?

- Numbers come from a frozen report or they say "not measured" (BR-026; Constitution VI).
- "Similarity" is used, never probability or identity.
- "Referral recorded (simulation)" is used, never delivered / returned / reunified.
- No alert, runaway, rescue, CID/police integration or legal-compliance claim.
- Synthetic, `[MOCK]`, cached, planned and simulation labels stay visible. The deck's metric slide says "Each metric is 'not measured' until the live run. Denominator and failures will be shown when measured (BR-026, Principle VI)".

## 4. The honest offline release-check artefact

`docs/execution/evidence/pre-main-phase4-readiness.md` is produced by
`node scripts/release/check.mjs`. It is a local artefact; it does
**not** claim G5 PASS. It:

- Hashes the eight allowlisted submission pack files with SHA-256.
- Marks external URLs as **UNVERIFIED** (it never opens a TCP
  connection, so it cannot mark them PASS).
- Refuses path-traversal segments and absolute paths outside the
  repo root.
- Surfaces missing local files (e.g. `build/`, `frames/`,
  `scripts/build_pptx.py` references in `links.txt` that are
  not on disk) as FAIL so the lead can resolve them.

Exit code 0 means every required offline check PASS; 1 means a
required offline check FAIL (a real local problem); 2 means every
local check PASS and only UNVERIFIED external URLs remain (a
"ready with external blockers" state, not a hidden PASS); 3 means
bad usage.

## 5. Questions that must be deferred to the lead or the original owner

If a judge asks any of these on the day, the honest answer is
"UNKNOWN, escalated to Mahim":

- Exact organiser cutoff, channel, formats, recipient and
  subject of the selection-email reply.
- Whether the Drive folder is created and the link is live.
- Whether the GitHub repo is now public, or whether reviewers
  have been added.
- Whether the production deployment exists and on what URL.
- Whether the held-out run, WER, latency, spend or duplicate
  precision have been measured in production with human labels.
- Whether TASK-057 (5–10 user conversations) is cleared by
  mentors and faculty (OQ-019).

## 6. Anti-hallucination checklist before you go on stage

- [ ] The `submission/demo/final.mp4` is the actual local
      recording; the storyboard in `submission/round2/` is **not**
      app footage. Don't mix them up.
- [ ] All release metrics are "not measured" with a reason. No
      frozen number is presented as a result anywhere in the pack.
- [ ] The 12/302 duplicate precision figure is a dev diagnostic
      on a different split, not a released metric. Do not present
      it as a held-out result.
- [ ] No alert, runaway, rescue, CID/police integration or
      legal-compliance claim. No interview count, no human-label
      count, no measured WER, no measured latency, no measured
      spend, no measured duplicate precision.
- [ ] The repo is PRIVATE; don't claim the public link is open
      without the lead's confirmation.
- [ ] Round 2 has not been submitted; do not say "we submitted"
      or "we sent the email".
- [ ] The actual recorded demo is captioned and silent, with
      `[MOCK]` officer verification and a referral-recorded
      (simulation) label.
- [ ] The backup recording on the laptop and Drive is for
      TASK-058, planned in Phase 5/6; it is not yet on Drive
      (H-10 / READY-21). If the venue network fails, the labelled
      backup recording is the fallback per D7 §3.2.
