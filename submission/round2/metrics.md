# Metrics — Round 2 submission (DRAFT)

Every metric listed below is a frozen release metric per
`AGENTS.md` Principle VI ("Honest by construction") and D1 BR-026.

Honest-copy rule: a metric is either a measured value with its
denominator, or it says **"not measured"**. Anything else is
forbidden by the constitution.

Status of the frozen held-out run: **not executed** (D6 TASK-043 is
still `todo` per `docs/execution/PHASE_4_SUBMISSION.md`). The deck
and video therefore list each metric as **not measured** with a
short reason. No frozen numeric figure is presented as a result
anywhere in this submission pack.

**Important:** No claim is made that a manifest freeze has
actually happened. The current development flow has a
provisional freeze for an independent held-out set, and the
held-out run is still pending. The `cap USD 25` is the configured
default limit, not actual spend; total spend is **not measured**.

---

## 1. Matching precision @k

- **Definition (planned):** proportion of ranked candidate lists in
  which the ground-truth pair appears in the top-k candidates, over
  the held-out synthetic set (FR-028, D6 TASK-040).
- **Status:** not measured.
- **Reason:** the held-out run is not executed.
- **Denominator when measured:** held-out synthetic set size, named
  in the report committed in Phase 3 (TASK-043).

## 2. Word error rate (WER)

- **Definition (planned):** Levenshtein-aligned character or word
  error between Whisper STT output and the reviewed transcript, on a
  labelled Bangla subset (D6 TASK-041).
- **Status:** not measured.
- **Reason:** there is no reviewed 60-clip Bangla set. (There is no
  verified audio cache; earlier "voice cache" wording referred to a
  synthetic cache only, not a labelled human-reviewed set.)
- **Honest copy:** voice path is PCM WAV only; WebM is not supported.
  WER will only be reported after a live run on a labelled set.

## 3. End-to-end latency

- **Definition (planned):** wall-clock seconds from parent "Start"
  click to "Submit" enabled, measured on the local stack, and
  separately from the parent's first word to the editable
  transcript (D6 TASK-043).
- **Status:** not measured.
- **Reason:** the working build is not signed off; live latency has
  not been recorded.
- **Honest copy:** the storyboard uses synthetic on-screen captions
  only. Compressed timing shown on screen is labelled; live latency
  will be reported separately when measured.

## 4. Total spend (USD)

- **Definition (planned):** measured paid-call spend at recording
  time, with the per-call atomic reservation ledger (D2B §12/§15;
  AGENTS.md AMD-AGENTS-5).
- **Status:** not measured.
- **Reason:** no live paid call has been issued in the submission
  cycle.
- **Default cap:** USD 25 by default. A documented team decision may
  raise the cap to at most USD 30. The cap is a configured limit,
  not actual spend.

## 5. Duplicate precision

- **Definition (planned):** proportion of "possible duplicate" rows
  surfaced by `src/server/duplicates` that a verified officer agrees
  are duplicates on a labelled subset (D6 TASK-043).
- **Status:** not measured.
- **Reason:** the manifest has not been frozen before matcher
  tuning in this submission cycle; thresholds cannot be reported.
  A provisional, independent held-out split is held in dev and is
  not yet a released frozen manifest.

---

## Counter types (kept distinct)

`docs/spec/D7_Closing_Pack_V2.md` requires three counter types, and
explicitly warns they are not a census of unique children:

- **Missing-report rows.** Count of reviewed parent submissions.
- **Found-report rows.** Count of staff found-child entries.
- **Confirmed pairs.** Count of officer confirmations, each recorded
  as "referral recorded (simulation)" — not delivered, not
  acknowledged.

All three are **row counts**, not a census of unique children and
not proof of rescue. They are shown separately in the deck (slide 5)
and the storyboard (shot 6). Any numeric counter shown in the
storyboard (shot 6) is a synthetic placeholder used to illustrate
the layout; no real counts are claimed.

---

## What the deck and the video actually say

- Slide 6 of the deck: every metric is "not measured — <reason>"
  with no frozen numbers, and a closing strip says "Each metric is
  'not measured' until the live run. Denominator and failures will
  be shown when measured (BR-026, Principle VI)".
- Shot 7 of the storyboard: identical list, identical "not measured"
  labels, identical closing strip.

## Failure and limitation lines that must stay visible

- Synthetic prototype; no real child data; no photos, faces, ID
  documents or exact coordinates (Principle VII, BR-006).
- Cached extraction is [MOCK] until the live provider is verified.
- Officer verification is [MOCK]; referral is a recorded
  simulation.
- Score is similarity, not identity probability.
- No alert, runaway, rescue, CID/police integration or
  legal-compliance claim.
- No interview count is invented; user-confirmed 18 Oct 2026: no
  human-labelled interview/audio/device/timing/provider evidence
  is available in this submission cycle.

## Submission status (user-confirmed 18 Oct 2026)

- Round 2 has **not** been submitted. Recipient, channel and
  cutoff are **UNKNOWN** until Mahim records organiser evidence.
- Channel is **UNKNOWN**. Drive folder is **UNKNOWN**. Selection
  email recipient is **UNKNOWN**.
- Production access and human labels / audio / devices / timing /
  provider evidence are **not available** (**NO**) for this
  cycle. Recorded as "not completed" for this cycle.
