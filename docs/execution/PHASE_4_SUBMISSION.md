# Phase 4 — Round 2 submission · Gate G5

> **Current integration status — 18 Oct 2026.** Phase 4–5 software and local preparation are implemented on `pre-main` and pass local verification. Remote CI is being run before review. The user will verify and explicitly approve before any merge into `main`. No Round 2 submission, production deployment or human acceptance is claimed. Formal G5/G6 remain UNVERIFIED for the original external/human requirements. Current evidence: [final verification](evidence/pre-main-final-verification.json), [closure](pre-main-phase4-phase5-closure.md), [TC matrix](evidence/pre-main-tc-coverage.md).

> The older dated entries below are historical snapshots; the current integration status and linked final verification supersede their software counts and branch pointers.


> **Current status (18 Oct 2026, late).** Latest user steering: **complete Phase 4 and Phase 5 across all three owners except the media-file submission itself** (no Round 2 deck / video / Drive upload / selection-email send by an agent); verify the staged `pre-main--closure-docs` worktree; then the user approves the merge to `main`. **Phase 5 software work is `IN PROGRESS / REVIEW` until final software evidence is in place** — the older "be ready to start, not actually start" / "Phase 5 prepared, not started" framing is superseded. **Human formal G5 / G6 stay unpassed** because the pending external / human / production requirements remain on the original owners' queues (organiser instructions, 50 human labels, 60 audio clips, 2 Android devices, 5 person timing study, Bangla human review, provider accounts / prices, production DB, Drive / public sharing, five human rehearsals, spare laptop / mentor clearance, freeze tag). See [pre-main-phase4-phase5-closure.md](pre-main-phase4-phase5-closure.md) and [G6-2026-10-18-pre-main.md](../gates/G6-2026-10-18-pre-main.md).
>
> Historical snapshot — 18 Oct 2026, pre-main head `9c18e45`: application source `9155963` carried forward; production build / full DB (321 / 31) / full browser (78 / 0 skip in 56.2 s) PASS in `/tmp/fera-pre-main-final-verification.json`; the seven-slide deck (`ed3bfe6`) and actual 105-second local video (`27bb3c6`) are prepared and reviewed; an 8-slide deck variant is also reviewed (PR50 mahim-organiser 18:45, source-attributed). Audit documents are committed separately. Round 2 is not submitted. Human evidence, production acceptance, frozen quality, organiser instructions, Drive and private-repository sharing remain unresolved. Phase 5 handoff is `IN PROGRESS / REVIEW`, not the earlier "prepared, not started".

**Window:** Wed 14 Oct 2026, 16:00 → 21:00 (Asia/Dhaka). Working cutoff baseline **22:00**; organiser extension date/time UNKNOWN · **Gate:** G5 · **Plan:** [EXECUTION_PLAN.md](EXECUTION_PLAN.md#phase-4--submission-wed-14-oct-1600--2100--gate-g5) · **Prev:** [Phase 3](PHASE_3_FULL_SCOPE_QUALITY.md) · **Next:** [Phase 5–6](PHASE_5_BUFFER_FINALE.md)
**Phase status:** `doing` (deliverable preparation may finish; release blocked — see audit). Phase 4 deliverables prepared and integrated at `27bb3c6`: 7 editable PPTX + PDF slides, the **actual recorded local demo** at `submission/demo/final.mp4` (105.000 s, 1280×720, H.264, eight proof PNGs, captions/provenance validated; typed flow + explicit seeded officer scenario, **no real voice**; verified in `/tmp/fera-demo-verified.log`), scripts, metrics, and links; an independent SG artifact review returned PASS at `/tmp/fera-disposition-submission.json` (`64 claims PASS, 0 FAIL`). A separate storyboard preview in `submission/round2` is **not** the actual demo. **Round 2 NOT submitted as of 18 Oct (user-confirmed).** G3 / G4 / G5 FAIL / UNVERIFIED because no human / production / official receipt and no `r2-freeze` tag (or rebaselined name) exist.
**Last updated:** 2026-10-18 · tasks distributed among Obidit, Masnun and Mahim; lead = Mahim · audit: [PHASE_3_AUDIT_2026-10-18.md](PHASE_3_AUDIT_2026-10-18.md); final review disposition: [phase3-finish-review.md](evidence/phase3-finish-review.md); handoff: [PHASE_5_HANDOFF.md](handoff/PHASE_5_HANDOFF.md); gates: [G3-2026-10-18.md](../gates/G3-2026-10-18.md), [G4-2026-10-18.md](../gates/G4-2026-10-18.md), [G5-2026-10-18.md](../gates/G5-2026-10-18.md), [G6-2026-10-18-pre-main.md](../gates/G6-2026-10-18-pre-main.md); pre-main closure: [pre-main-phase4-phase5-closure.md](pre-main-phase4-phase5-closure.md); TC matrix: [evidence/pre-main-tc-coverage.md](evidence/pre-main-tc-coverage.md)
**Team:** **Obidit** — intake, AI, outputs · **Masnun** — data, matching, officer workflow, dashboard, evaluation · **Mahim** — lead; platform, integration, release (named "Sadman" in AGENTS.md and the spec pack; D6 owner code S). Tasks follow [EXECUTION_PLAN.md](EXECUTION_PLAN.md). The lead approves cuts and reschedules, records organiser and mentor decisions, and runs `fera-gate`.

---

## How to work this file (Claude Code · Codex · Antigravity)

This is a living tracker. Every agent working on a task in this phase updates it **in the same branch as the work**.

1. Read [AGENTS.md](../../AGENTS.md), then this file, then the spec-pack sections named in your row. All times are Asia/Dhaka.
2. Pick a `todo` row in your owner's lane whose dependencies are `done`. Set it to `doing` and fill in the lane and tool.
3. Work in a lane worktree (`scripts/agents/new-lane.sh <feature> <lane>`) and stay inside the owner's paths ([ownership map](../../AGENTS.md#repo-layout-and-ownership)).
4. When you open the PR, set the row to `review` with the PR link. After the merge, set it to `done` and fill in **Evidence**: the command and its result, a URL or a file path. A task without evidence is not done.
5. If you are stuck, set the row to `blocked`, say what blocks it in Evidence, and add a log line.
6. Edit only the rows in **your own person table** and **your log section**, so parallel lanes don't conflict. Never tick a gate box yourself. Gate boxes are ticked from the `fera-gate` report in [docs/gates/](../gates/).

**Status values:** `todo` · `doing` · `review` · `done` · `blocked` · `cut`. Nothing in this phase may be cut.

| Action | Claude Code | Codex | Antigravity / any other agent |
|---|---|---|---|
| Skill (`fera-review`, `fera-gate`, …) | `/<skill>` | `$<skill>` | Read `.agents/skills/<skill>/SKILL.md` and follow it |
| Reviewer (`fera-safeguarding-reviewer`, `doc-updater`, …) | Subagent from `.claude/agents/<name>.md` | Role from `.codex/agents/<name>.toml` | Start a separate read-only agent and give it `.claude/agents/<name>.md` as its brief |

---

## Honest-language rules for every deliverable (Constitution VI, BR-011)
- Numbers come **only** from the frozen report committed in Phase 3 (TASK-043), with denominators. Anything else says "not measured".
- "Similarity", not probability. "Referral recorded (simulation)", not delivered. No alert, runaway, rescue, police-integration or legal-compliance claims.
- Synthetic data, `[MOCK]` officer verification, cached outputs and time compression are labelled on screen and in narration.
- Run the wording guard and `fera-safeguarding-reviewer` over the deck text, video script and README before anything is uploaded (TC-025, TC-037, TC-066).

## Who does what

| Person | Tasks this phase | D6 hours |
|---|---|---|
| **Obidit** | TASK-045 1–2 min video | 4 |
| **Masnun** | METRIC-FIGS for the deck · README-EVAL section · LINK-CHECK before and after sending | — (not estimated in D6) |
| **Mahim** (lead) | TASK-044 deck, 5–8 slides → TASK-046 README, Drive folder and the selection-email reply | 5 |

### Lead duties — Mahim
- Before anything is sent, confirm the organiser's cutoff, channel and formats (AMD-4-1) and record the source; until then they're UNKNOWN.
- Approve the final deck text and video script after the wording guard and `fera-safeguarding-reviewer` pass.
- Send only after Masnun's pre-send LINK-CHECK passes.
- Run `fera-gate G5` and link the report.

## Tasks — Obidit
| ID | Task | Tool | Deps | h | Done when (D6) | Status | PR / link | Evidence |
|---|---|---|---|---|---|---|---|---|
| TASK-045 | Round 2 video, 1–2 min, per [D7 §3.1](../spec/D7_Closing_Pack_V2.md#31-round-2-video-proposed-145); English captions over Bangla UI | human | TASK-042 | 4 | Working 1–2 min MP4; compressed/cached timings labelled | `review` | 27bb3c6; submission/demo/final.mp4 | Verified **actual recorded local synthetic film** at `submission/demo/final.mp4`: 105.000 s, 1280×720, H.264, eight proof PNGs, captions/provenance validated; independent JS / security / safeguarding PASS. Timing edited; seeded officer scenario explicit; **no real voice**, typed flow. Production acceptance remains blocked. The separate storyboard preview in `submission/round2` is not the actual demo. |

## Tasks — Masnun
| ID | Task | Tool | Deps | h | Done when (D6) | Status | PR / link | Evidence |
|---|---|---|---|---|---|---|---|---|
| METRIC-FIGS | Metric figures + failure examples for the deck, from the frozen report | Codex | TASK-043 | — | Figures in deck, each with denominator and source | `blocked` | submission/round2/metrics.md | Release metrics say not measured. Original dev diagnostic linked with denominators/failures; reviewed labels/freeze/production measurements remain absent. |
| README-EVAL | README evaluation section | Claude Code + `doc-updater` | TASK-043 | — | Section merged; numbers match the frozen report | `review` | README.md; eval/reports/phase3-dev-2026-10-18.md | Evaluation status documented with dev-only provenance and poor duplicate precision 12/302; no frozen-release claim. |
| LINK-CHECK | Repo, deck, video and every link open logged-out, in a private window | human | TASK-046 | — | Checked list with timestamps | `blocked` | GitHub visibility readback; 18 Oct browser check | Repository PRIVATE; organiser access unverified. Drive unsigned in available browser, no upload connector/folder. No logged-out or post-send access PASS. |

## Tasks — Mahim (lead)
| ID | Task | Tool | Deps | h | Done when (D6) | Status | PR / link | Evidence |
|---|---|---|---|---|---|---|---|---|
| TASK-044 | Round 2 deck, 5–8 slides, incl. metrics slide and [MOCK] items marked | any + `fera-safeguarding-reviewer` | TASK-043 | 4 | Working 5–8-slide deck; honest measured/pending labels | `review` | ed3bfe6; submission/round2/fera-round2-deck.pptx | Seven editable slides plus PDF; all release metrics not measured; 64 automated claims checks and independent safeguarding wording review PASS. |
| TASK-046 | README, Drive folder (links TXT, deck, video), **reply to the selection email by 21:00** | human (+ `doc-updater` for README) | TASK-044, 045 | 1 | Email sent with Drive link before 21:00; links accessible | `blocked` | Local reviewed link/deck/video pack prepared | Round2 not submitted. No Drive authentication/folder, confirmed organiser cutoff/channel/recipient, actual email or receipt. Private repository sharing unresolved. |

Order: Masnun's METRIC-FIGS → Mahim's TASK-044 deck; Obidit's TASK-045 video + Mahim's deck → Mahim's TASK-046; Masnun's LINK-CHECK runs once before sending and again after.

## Submission checklist ([D6 §10](../spec/D6_Implementation_Plan_V2.md#10-hackathon-checklist))
- [ ] GitHub repo link (public or shared as required)
- [ ] 5–8 slide PowerPoint deck
- [ ] 1–2 min demo video
- [ ] Drive folder with TXT/DOC of links + deck + video
- [ ] `r2-freeze` tag on the submitted commit
- [ ] Reply to the selection email with the folder link, sent before 21:00 (cutoff 22:00)

## G5 exit checklist (21:00)
Tick only from the gate report (`fera-gate`), with evidence linked.
- [ ] Email sent with the Drive link before 21:00 (record send time)
- [ ] Every link opens in a private window

**Gate report:** _(link `docs/gates/G5-*.md`)_ · **Result:** _pending_

## Log
Format: `- YYYY-MM-DD HH:MM · <tool> · <lane> · <ID> <status change or note>`

### Obidit
### Masnun
### Mahim (lead)
- 2026-10-18 18:45 · Claude Code · ccr-91b94c1a-754zqx · TASK-046 organiser evidence recorded: submission is on the LooselyCoupled AI Worker Platform (https://h4hbd.ezassist.me/), platform deadline 18 Oct 2026 22:00 GMT+6, PPT at most 8 slides, video in Bangla or English. Required fields: name, description, public HTTPS demo link, demo video URL, GitHub repo URL. Deck rebuilt to 8 slides (engineering slide added; internal UNKNOWN/LINK-CHECK lines removed; claims check 64/64 PASS). Video end card re-rendered as submission/demo/final-submission.mp4 (final.mp4 unchanged). Form text: submission/round2/platform-submission.md. Re-run on main 8499bce: typecheck PASS, lint 0 errors/51 warnings, unit 3,691 pass + 2 timing tests pass in isolation (load-sensitive), 308 skipped; DB 320/30 files PASS. Not submitted yet.
- 2026-10-18 · doc-updater · lane `pre-main--closure-docs` · pre-main Phase 4–5 closure docs staged. User quote at the top of this file and the [pre-main-phase4-phase5-closure.md](pre-main-phase4-phase5-closure.md) closure record replaces the earlier "Phase 5 prepared, not started" framing with the latest user steering (complete P4+P5 except media file submission, software `IN PROGRESS / REVIEW`, formal G5 / G6 unpassed until pending requirements close). New evidence: [pre-main-tc-coverage.md](evidence/pre-main-tc-coverage.md) (66-row D6 TC matrix with real existing test paths or typed `UNVERIFIED`; no fake files); new gate [G6-2026-10-18-pre-main.md](../gates/G6-2026-10-18-pre-main.md) (pre-main software pass; human / external blocks pending). Root verification `/tmp/fera-pre-main-final-verification.json`: build PASS exit 0, DB 321 / 31 PASS, browser 78 / 0 skip PASS in 56.2 s, runtime audit 0 known vulnerabilities, full dep audit WARN (5 HIGH entries tracing to one unpatched `braces` advisory in the lint chain; no automatic downgrade). PR50 mahim-organiser 18:45 8-slide PPT + Bangla video end card integrated on pre-main — **source-attributed, not independently verified**; platform / share / recipient access pending. Round 2 NOT submitted; no media-file submission was sent. No application / schema / Git / secret / external-service writes this round.

## Audit amendments (2026-10-12)

### AMD-4-1 — Cutoff, entry and receipt
**Gap:** “Official cutoff **22:00**” was not supported by the handover.
**Change:** entry requires G4's measured/explicitly missing evidence report and an identified frozen build; failed Must items remain disclosed blockers. 21:00 is the internal send target and 14 Oct 22:00 the working baseline. The user reports an organiser extension; its new cutoff/date, email and exact formats are **UNKNOWN** until Mahim (lead) records organiser evidence. TEAM_HANDOVER_V2 §10 leaves exact time/channel/formats pending selection email. Do not invent a recipient or mark the email sent.
G5 exit requires TASK-044/045 deliverables and TC-025/037/066 wording review, TASK-046 actual submission/receipt evidence against the confirmed channel/cutoff, frozen commit identification, and logged-out access checks. Prepare LINK-CHECK before sending; repeat afterward to verify the delivered links. The current table's dependency on TASK-046 is the final recheck, not permission to send unchecked links.
**Old text corrected:** “Official cutoff **22:00**”.
**Source:** TEAM_HANDOVER_V2 §§7,10; D6 TASK-044–046, §10; user update 12 Oct.

### AMD-4-2 — Evidence boundaries
**Gap:** submission boxes do not distinguish baseline targets from organiser requirements.
**Change:** label the 5–8 slides, 1–2 min video, Drive folder and reply channel as planned deliverables pending official confirmation. All metrics must cite frozen denominators/failures or say “not measured”; deployment, interviews, accounts and partner approval are UNKNOWN without evidence. Nothing here authorises automatic email delivery by an agent.
**Source:** handover §§7–10; D6 TC-020/025/037/066.

### AMD-4-3 — Principle reference
**Gap:** “C7” is not the constitution's honest-copy principle ID. **Change:** old heading “(C7, BR-011)” now cites Constitution VI (Honest by construction). **Source:** `.specify/memory/constitution.md` Principle VI.
