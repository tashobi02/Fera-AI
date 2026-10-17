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
