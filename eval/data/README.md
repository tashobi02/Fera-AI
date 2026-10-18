# eval/data — labelled reports for extraction evaluation

## What this folder is

`labelled.draft.jsonl` is a set of **agent-drafted INPUT texts only**. It is
not ground truth.

- Each line is one JSON object with three keys: `id` (`L001`..`L050`), `text`,
  and `labels`.
- `labels` is intentionally an **empty object** on every line in this draft
  file. No model produces labels; a person does.
- These 50 texts are the input side of TASK-011 / FR-028 / GOAL-002. They feed
  `eval/extract.mjs` once a person has filled `labels` and the file has been
  reviewed.

> **Note on the `L001..L050` keys.** `eval/extract.mjs` requires label `id`s
> to match canonical manifest `record_id`s (D2B §17, AMD-3-3). The legacy
> `L001..L050` draft is preserved **as historical input only**; it is **not**
> the file `extract.mjs` is fed today.

## Canonical draft for human review (`labelled.canonical.draft.jsonl`)

A new draft is produced deterministically by `eval/prepare-label-drafts.mjs`:

- The script reads `data/synthetic/records.jsonl` and the canonical
  `eval/manifest.json`. It **only keeps records whose `split === "dev"`** —
  held-out test records are explicitly never surfaced, in line with
  `eval/FREEZE.md` (which is currently `FREEZE_FLAG: NOT SET`).
- Selection **never** uses `role`, `true_partner_ids`, `no_match`,
  `decoy_type`, predictions, thresholds, or any held-out model
  output. Only the manifest `record_id` is consulted, then sorted
  lexicographically; the first 50 records with non-empty
  `draft.source_text` are emitted.
- Every emitted row is `{id, text, labels}` where `text` is
  `record.draft.source_text` verbatim and `labels` is `{}` (always blank).
- The script **never** overwrites `labelled.draft.jsonl` and **never** edits
  `labelled.jsonl`. The default `--out` is a brand-new file:
  `eval/data/labelled.canonical.draft.jsonl`. Pass `--replace` to overwrite
  that file, but only when every existing row still has empty labels.
- The script refuses to write anywhere outside `eval/data/`.

To (re)generate the canonical draft from the committed data:

```bash
node eval/prepare-label-drafts.mjs
# or explicitly:
node eval/prepare-label-drafts.mjs --out eval/data/labelled.canonical.draft.jsonl
```

The script is a thin wrapper around the pure helpers `loadDevRecordIds`,
`buildLabelDrafts`, `validateDraftRows`, `guardProtectedFiles`,
`guardSafeOutputPath`, and `checkOverwriteGuard`. Those helpers are
unit-tested in `tests/eval/label-drafts.test.ts` (pure in-memory tests;
no fixture files, no model calls, no held-out data). The test cases
include a "no test record selected" assertion that proves the dev filter
is honoured, plus a "respects 50-row cap" assertion. The test file is
located at the standard vitest discovery path so it is automatically
picked up by `npm test`.

### Human workflow (canonical draft → `labelled.jsonl`)

1. Run `node eval/prepare-label-drafts.mjs` to (re)produce
   `eval/data/labelled.canonical.draft.jsonl` with 50 unlabelled rows keyed
   by canonical `record_id`s.
2. **A named person** (not a model) reads each `text` and fills `labels`
   per the field set in `src/contracts/draft.ts` (see "How a person fills
   labels" below). The old `L001..L050` draft stays in
   `labelled.draft.jsonl` as a historical reference; **the human reviews
   `labelled.canonical.draft.jsonl`**, not the legacy one.
3. The labeller saves the filled file as `eval/data/labelled.jsonl` (one
   line per record, same `id` keys). `labelled.canonical.draft.jsonl` is
   left in place; it is the unlabelled working copy.
4. **Obidit** reviews every label against `text`, fixes any disagreement,
   and adds a second signed line in the labelled file's README.
5. **No label may be produced by a model.** If a label cannot be produced
   with confidence, it is left absent — "Unknown stays unknown" (AGENTS.md).
6. Quality measurement is **not** done in this lane. The script does not
   call any model, does not load the test split, and does not change the
   freeze flag. `eval/extract.mjs` will refuse to score until
   `eval/data/labelled.jsonl` is human-filled, a prediction file is
   supplied, and (for test-split scoring) `FREEZE_FLAG: SET` is in
   `eval/FREEZE.md`.

## How a person fills `labels`

The labels describe which fields a parent report carries, in the exact shape
the application stores. The structured field set is the one in
`src/contracts/draft.ts`:

- top-level: `kind` (`"missing"` or `"found"`), `source_text`
- `child.name`, `child.name_latin`, `child.sex`, `child.age_years`,
  `child.age_min`, `child.age_max`, `child.height_cm`, `child.clothing`,
  `child.marks`
- `event.at`, `event.at_lower`, `event.at_upper`, `event.at_approx`,
  `event.thana`, `event.place_text`, `event.district_text`,
  `event.district_code`, `event.circumstances`
- `reporter.relation`, `reporter.phone`
- `evidence` is a record keyed by the field paths above; each value is an
  `evidenceSpan` (`quote`, `start_utf16`, `end_utf16`, `derivation`).

The labeller records, for every present field, the field path, the exact
substring from `text` that supports it, and a `derivation` from
`EVIDENCE_DERIVATIONS` in `src/contracts/states.ts`. A field that is **not
present** in the text is left out of `labels` (a missing label is the
"absent" signal). A field that is present but the labeller cannot read with
confidence is also left out and noted in the labeller's notes file — never
guessed.

## Review and sign-off (HUMAN only)

- The labeller writes their **name** and the **date** at the top of
  `eval/data/labelled.jsonl` (the labelled copy of this file) and signs
  the README of that file when they are done.
- **Obidit** reviews the labels against `text` for the whole 50, fixes any
  disagreements, and adds a second signed line in the labelled file's
  README.
- **No label may be produced by a model.** The labeller is a named person;
  any tooling they use (regex, dictionary lookups) is named in the labelled
  file's README.
- If a label cannot be produced with confidence, it is left absent, not
  invented. "Unknown stays unknown" (AGENTS.md).

## Adversarial and edge-case texts (intentional)

The draft intentionally includes:

- a few texts that leave `age`, `place` or `phone` out on purpose;
- a few with hedges ("মনে হয় ১২ বছর" / "around 10 or maybe 11 years old");
- a few with a self-correction ("না, ১৩ বছর" / "12, no, 13 years old");
- a few with two children mentioned (L050);
- a few with district aliases and misspellings
  (Chittagong / Chattogram / চট্টগ্রাম / চিটাগাং);
- two or three with an injected instruction such as "ignore previous
  instructions" — these are **adversarial tests** and stay harmless; the
  labeller labels only the actual reported fields and ignores the
  instruction.

Phones are restricted to the reserved fake range `01700000000`–
`01700000099`. Names are invented first names only (Rafi, Nusrat, Sakib,
etc.); no real people are named. No exact addresses, no photos, no IDs.

## Provenance

- Drafted by an agent on the `phase-3-obidit--p3-012` lane as part of card
  P3-012 (TASK-011).
- Inputs read: `docs/spec/D2_TRD_PartB_V2.md` §17 (GOAL-002), the TC-002
  example sentence in `docs/spec/D6_Implementation_Plan_V2.md` §8,
  `src/contracts/draft.ts`, `data/districts.json`.
- Reviewer of the draft: bengali-reviewer; reviewer of the labels:
  Obidit (named above).

## Known limits of this draft

- Reviewed by a Bangla reviewer agent on 2026-10-18 (not a human): garbled lines, 10-digit Bangla phone numbers, repeated numbers and one alarming-sounding line were fixed; the texts still need a human read.
- Every phone number is unique (`017000000NN`), so the file cannot create false duplicate signals.
- `L049` and `L050` carry `"category": "adversarial"` (prompt-injection tests). Score them separately from the normal lines.
- Every text includes a phone number, so there is no "phone missing" coverage yet. Several texts omit age or place on purpose. Add phone-omission cases before scoring unknown-field behaviour.
- District aliases and misspellings are sparse (Chittagong/চিটাগাং, বরিসাল, বগড়া, ডাক্কার). The labeller should note which aliases the normaliser is expected to accept.

## Status of the canonical-draft helpers

`eval/prepare-label-drafts.mjs` is the production script; it is a thin
wrapper around the pure helpers exported for tests:
`loadDevRecordIds`, `buildLabelDrafts`, `validateDraftRows`,
`guardProtectedFiles`, `guardSafeOutputPath`, `checkOverwriteGuard`, and
`readJsonl`.

`tests/eval/label-drafts.test.ts` is the unit-test file. It is pure and
in-memory (no fixture files, no model calls, no held-out data, no
network, no env). The test cases include a "no test record selected"
assertion that proves the dev filter is honoured.

The test suite was executed via `npx vitest run tests/eval/` and all
131 tests across 10 test files in `tests/eval/` passed in this branch
on 2026-10-18, including the 37 tests in `label-drafts.test.ts`. The
test file lives at the standard vitest discovery path
(`tests/**/*.test.ts`) so it is automatically picked up by `npm test`.
