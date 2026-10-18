# Embedded SQL fence synchronisation: D2A copies ↔ `docs/code/schema_v2.sql`

- **Recorded:** 2026-10-18 (Asia/Dhaka)
- **Authority:** recorded user-delegated technical decision (`docs/execution/handoff/phase3-resume-decisions.md`).
  This is not evidence of personal all-owner approval and does not relax any
  safeguarding rule. Before integration the affected `docs/spec/` working copy
  and `docs/MANIFEST.json` change still require passing review.
- **Lane:** small SPEC correction only.
  No new schema design, no `docs/code/schema_v2.sql` edit, no `db/schema_v2.sql`
  edit, no contract/application/secret/provider/network change, no commit, no push.
- **Scope:** `docs/spec/D2_TRD_PartA_V2.md`, `docs/markdown/D2_TRD_PartA_V2.md`,
  `docs/MANIFEST.json`, and this evidence file.

## Why this drift existed

`docs/spec/D2_TRD_PartA_V2.md` is a byte-identical working copy of
`docs/markdown/D2_TRD_PartA_V2.md` (AGENTS §"Sources of truth"). Section 7 of
both files embeds the canonical schema as a single fenced ```sql ... ``` block.

`docs/execution/handoff/phase3-resume-decisions.md` records that, on
2026-10-18, the user delegated authority to extend `intake_drafts` with a
server-owned `follow_up_round smallint` counter (cap 4, `CHECK (follow_up_round
BETWEEN 0 AND 4)`) together with the six-dispatch-per-draft cap and the four
follow-up-round cap kept independent. That extension was applied to
`docs/code/schema_v2.sql` and its runtime mirror `db/schema_v2.sql` (the
runtime mirror is byte-identical to `docs/code/schema_v2.sql`).

The embedded SQL fence in both D2A copies was not updated at that time, so the
embedded body remained at 33,972 bytes while the canonical schema was
34,939 bytes — a 967-byte drift that, per the handoff record, must be applied
"to the schema source and its runtime mirror together" (read literally for the
authoritative spec source pair). Because the spec pack is also a byte-identical
working copy of `markdown/`, this correction updates both D2A copies and the
one tracked manifest entry (`markdown/D2_TRD_PartA_V2.md`) without touching
any other entry.

The first byte where the two bodies diverged was the new
`follow_up_round smallint NOT NULL DEFAULT 0\n  CHECK (follow_up_round BETWEEN 0
AND 4)` clause on `intake_drafts`, exactly as recorded in the handoff.

## Exact change

The body of the single fenced ```sql ... ``` block in both D2A copies was
replaced, byte for byte, with the current `docs/code/schema_v2.sql`. All other
prose and fences (mermaid, json, fenced introductions and other sections) were
left untouched. The manifest entry for `markdown/D2_TRD_PartA_V2.md` was
updated to the new actual bytes and SHA-256; no other manifest entry, hash, or
format was modified.

### Files changed

| Path | Before | After | SHA-256 before | SHA-256 after |
|---|---|---|---|---|
| `docs/spec/D2_TRD_PartA_V2.md` | 87,023 bytes | 89,490 bytes | `e158121a…c592fba` | `86f4b065…2993fec33` |
| `docs/markdown/D2_TRD_PartA_V2.md` | 87,023 bytes | 89,490 bytes | `e158121a…c592fba` | `86f4b065…2993fec33` |
| `docs/MANIFEST.json` (entry `markdown/D2_TRD_PartA_V2.md`) | bytes 87,023, sha `e158121a…c592fba` | bytes 89,490, sha `86f4b065…2993fec33` | n/a | n/a |
| `docs/execution/evidence/schema-spec-sync.md` | (new) | — | — | — |

### Embedded SQL bytes

| Source | Bytes | SHA-256 |
|---|---|---|
| Embedded in D2A before | 33,972 | (not recorded; diff against canonical was the `follow_up_round` clause) |
| Embedded in D2A after | 34,939 | `08e7ad04…86042d87` (byte-identical to canonical) |
| `docs/code/schema_v2.sql` (unchanged) | 34,939 | `08e7ad04…86042d87` |
| `db/schema_v2.sql` (runtime mirror, unchanged) | 34,939 | `08e7ad04…86042d87` |

## Exact checks performed

1. **Fence discovery:** located every ```sql ... ``` block in both D2A files
   via byte search for the `\`\`\`sql\n` open marker and the immediate
   following `\n\`\`\`\n` close marker. Each file contained exactly one SQL
   fence (lines 620–1240 in the pre-change text). No other code fences were
   disturbed.
2. **Body equivalence before:** the embedded body (33,972 bytes) was compared
   byte for byte to `docs/code/schema_v2.sql` (34,939 bytes); the first
   divergence was the new `follow_up_round` clause, as predicted.
3. **Body equivalence after:** the embedded body (34,939 bytes) is now
   byte-identical to `docs/code/schema_v2.sql` (SHA-256
   `08e7ad04…86042d87`).
4. **Other-prose preservation:** the prefix before the opening fence and the
   suffix after the closing fence in each D2A file are byte-identical between
   the pre-change and post-change bytes (verified by slice comparison).
5. **Copy parity:** `docs/spec/D2_TRD_PartA_V2.md` and
   `docs/markdown/D2_TRD_PartA_V2.md` are byte-identical to each other after
   the change (89,490 bytes; SHA-256 `86f4b065…2993fec33`), as required by
   AGENTS "Sources of truth".
6. **Runtime mirror:** `db/schema_v2.sql` is byte-identical to
   `docs/code/schema_v2.sql` (unchanged; this evidence confirms the
   pre-existing runtime mirror relation, not a change to it).
7. **Manifest well-formedness:** `docs/MANIFEST.json` parses as JSON and
   remains indented at two spaces with a trailing newline; only the single
   `markdown/D2_TRD_PartA_V2.md` entry changed.
8. **All manifest actual hashes:** every one of the 31 tracked entries was
   re-hashed from its file under `docs/` and compared to its manifest entry —
   31 / 31 match, 0 mismatches, 0 skipped.
9. **Verification script reference:** `docs/verification/schema_checks.mjs`
   reads from `docs/code/schema_v2.sql` (resolved as
   `verification/../code/schema_v2.sql`); the embedded fence in D2A is not
   re-read by that script, so changing it does not alter the verification
   runner's input. Because the embedded fence is now byte-identical to the
   file the runner reads, the two views agree.

### Output of step 8

```json
{
  "manifest_json_valid": true,
  "manifest_entries_checked": 31,
  "manifest_entries_skipped": 0,
  "manifest_mismatches": [],
  "d2a_copies_byte_identical": true,
  "d2a_embedded_sql_byte_equal_to_code_schema_v2_sql": true,
  "db_runtime_mirror_byte_equal_to_docs_code_schema": true,
  "schema_checks_mjs_references_docs_code_schema_v2_sql": true,
  "actual_d2a_md": {
    "path": "markdown/D2_TRD_PartA_V2.md",
    "bytes": 89490,
    "sha256": "86f4b0653bccd74dde9b02115527ba813f4fb75916716b17605053d2993fec33"
  },
  "actual_d2a_spec": {
    "path": "spec/D2_TRD_PartA_V2.md (working copy, not in manifest)",
    "bytes": 89490,
    "sha256": "86f4b0653bccd74dde9b02115527ba813f4fb75916716b17605053d2993fec33"
  },
  "actual_code_schema": {
    "path": "code/schema_v2.sql",
    "bytes": 36439,
    "sha256": "08e7ad04ad093366787eeb9e8785e67c4558b1cf770f65806d1ad8df86042d87"
  },
  "actual_db_schema": {
    "path": "db/schema_v2.sql (runtime mirror)",
    "bytes": 36439,
    "sha256": "08e7ad04ad093366787eeb9e8785e67c4558b1cf770f65806d1ad8df86042d87"
  },
  "actual_manifest_bytes": 5497,
  "actual_manifest_sha256": "41845669793d7366e83cb2a0f54dd4a586ba78f3dd368d68a504c2b9f949cdc2"
}
```

## Limitations

- This is a **byte-only** synchronisation. No structural SQL review was
  performed: the embedded body equals the canonical file byte for byte, so any
  structural property of the schema is exactly what is already in
  `docs/code/schema_v2.sql`.
- The `docs/verification/schema_checks.mjs` runner was not executed in this
  lane. The user's lane forbade dependency installs and commits, and the
  runner consumes `docs/code/schema_v2.sql`, not the embedded fence. Running
  it later will exercise the canonical file unchanged by this work.
- `docs/verification/document_checks.json` records a stale
  `schema_v2.sql` `sha256` of `3fe345b1…` against the current canonical
  `08e7ad04…`. That stale entry is outside this lane ("don't rewrite unrelated
  hashes/format"); it is not a manifest entry and is therefore not gated by
  the SHA-256 verification performed above. Coordinators may wish to refresh
  `document_checks.json` in a separate doc-only follow-up.
- The handoff counter "Final frozen SQL new metadata followup counter remains
  max 4" is honoured: the `CHECK (follow_up_round BETWEEN 0 AND 4)` clause
  from `phase3-resume-decisions.md` is preserved in the canonical schema and
  is now also present in the D2A embedded fence.

## Coordinator follow-up

- Coordinator will create the separate small-spec PR per AGENTS workflow and
  rerun the verification scripts; this lane intentionally did not push.
- No new task, no new file beyond the three tracked changes and this evidence
  file.