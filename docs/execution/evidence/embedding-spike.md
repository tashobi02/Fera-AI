# Embedding spike: multilingual-e5-small via Transformers.js (TASK-004, OQ-023, RISK-015)

Status: local measurement DONE on one laptop. **Vercel limits UNKNOWN until a real deploy is measured.** Local-vs-API is an **OPEN DECISION**.
Data: SYNTHETIC only (`data/synthetic/`, PR #34). Not a held-out result, not evidence of real Bangla quality.

## Commands run (worktree `masnun-spike`, 17 Oct 2026)

```
npm i -D @huggingface/transformers          # v4.3.1 resolved; SPIKE ONLY, package.json/lock NOT committed
node scripts/embed-spike.mjs --cache .cache/models              # fp32 (first run downloaded the model)
node scripts/embed-spike.mjs --cache .cache/models-q8 --dtype q8
# fix round 1 additions (production prefix policy; --query-prefix applies to the missing/query side):
node scripts/embed-spike.mjs --cache .cache/models --dtype fp32 --query-prefix "query: " --passage-prefix "passage: "
node scripts/embed-spike.mjs --cache .cache/models-q8 --dtype q8 --query-prefix "query: " --passage-prefix "passage: "
```

`.cache/` is git-ignored; no model files committed. Model id `Xenova/multilingual-e5-small` (ONNX export of intfloat/multilingual-e5-small), mean pooling, L2 normalised, 384-d, `passage: ` prefix on every record. The default runs below use `passage: ` on both sides; the production policy (`query: ` on the missing/query side, `passage: ` on the found side, per D2A) is reported separately in its own section.

## Machine (read via uname/sysctl)

Apple M5, 16 GiB RAM (`hw.memsize` 17179869184), Darwin 25.6.0 arm64, Node v24.18.0. Local CPU, not Vercel.

## Read this first: the description-field arm is an upper bound, not a finding

Verified directly from `data/synthetic` (80 true pairs, query side vs found partner side, exact string equality of the draft fields): `child.clothing` is **identical in 80/80** pairs, `child.marks` in **39/80**, `event.circumstances` in 0/80 and `event.place_text` in 0/80. The description-field text is built from those fields, so the description-field result (Hit@5 60/60, MRR 0.94) is largely **verbatim string recovery of a template**. It is easy by construction and is an **upper bound**, not evidence of retrieval quality. The two arms also differ in **content as well as format**: the description text drops age, sex, date and district, which `source_text` contains, so arm-to-arm differences are confounded and must not be read as "structured fields beat free text".

## Results (n shown for every figure)

| Item | fp32 | q8 |
|---|---|---|
| Model weight file on disk | 470,268,533 B (448.5 MiB) `onnx/model.onnx` | 118,308,185 B (112.8 MiB) `onnx/model_quantized.onnx` |
| Whole cache dir (incl. tokenizer 17 MB), for reference only | 487,352,364 B (464.8 MiB) | 605,660,549 B; this cache dir also holds the fp32 `model.onnx`, so ignore it and use the weight row (the script now stats the `.onnx` weight file only) |
| Cold start, files already on disk (load + first embed), 1 measurement each, run 2 | 640 ms (also 389 ms in another warm run) | 386 ms |
| First-ever run incl. download (network dependent) | 204,724 ms | 51,734 ms |
| Per-record latency, `source_text` (n=200) median / p95 | 7.10 / 8.65 ms (run 3); 5.47 / 7.43 ms (run 1) | 7.83 / 10.14 ms |
| Per-record latency, `description_fields` (n=200) median / p95 | 4.50 / 6.84 ms | 4.77 / 6.61 ms |

Latency varies run to run (about 5 to 7 ms median for the same variant), so treat these as order of magnitude. Cold-start figures exclude process start and `import`.

### Similarity and ranking (fp32; q8 shown where it differs)

Queries: the 60 `pair_query` missing records. Candidates: all 110 found records (pair_found 60, dup_found 20, found decoys 30). A query is a hit at k if its best-ranked true partner is in the top k (some queries have 2 true partners, 80 true pairs in total).

| Metric | `source_text` | `description_fields` (clothing + marks + circumstances + place) |
|---|---|---|
| Mean cosine, true pairs (n=80) | 0.8742 | 0.9434 |
| Mean cosine, decoy to its target (n=40) | 0.8621 | 0.9222 |
| Mean cosine, random missing/found non-true pairs (n=1000, seeded) | 0.8344 | 0.8659 |
| Hit@1 | 25/60 | 54/60 |
| Hit@3 | 35/60 | 59/60 |
| Hit@5 | 35/60 | 60/60 |
| MRR | 0.5033 | 0.9422 |
| No-match queries, top-1 cosine to any found (n=15): min / median / max | 0.8590 / 0.8847 / 0.9221 | 0.9102 / 0.9315 / 0.9595 |
| True-pair cosine min / median (n=80) | 0.8039 / 0.8718 | 0.9005 / 0.9449 |

q8 (same protocol): `source_text` Hit@1/3/5 = 25/35/35 of 60, MRR 0.5129; `description_fields` Hit@1/3/5 = 53/59/60 of 60, MRR 0.9347. Mean true-pair cosine 0.8756 / 0.9426. Differences from fp32 are within one query at Hit@1.

## What the numbers do and do not say

- Similarity scores are compressed: random pairs already score 0.83 to 0.87, true pairs 0.87 to 0.94, decoys sit between. Cosine alone has narrow separation, so rank order matters, not absolute value.
- The no-match top-1 cosines overlap the true-pair range (no-match max 0.9595 is above true-pair min 0.9005 in the description variant; 0.9221 vs 0.8039 in the other). No threshold that separates "no match" from "match" is supported by this data; do not display similarity as a probability (AGENTS: "similarity", not probability).
- `source_text` Hit@5 stays at 35/60 while `description_fields` reaches 60/60; see the per-variant breakdown below for what the plateau is and is not.
- Caveats: text is template-generated and easy; 60 queries and 110 candidates is small; both sides use the `passage: ` prefix; description fields are the generator's own structured fields (in production they come from reviewed extraction); one machine, few runs. This is a dev-split style spike, **not a held-out result**, and says nothing measured about real Bangla quality. `eval:match` (Masnun, later task) owns real evaluation.

## Production prefix policy (`query: ` for the missing/query side, `passage: ` for found)

| Metric (n) | fp32 `source_text` | fp32 description | q8 `source_text` | q8 description |
|---|---|---|---|---|
| Hit@1 / 60 | 26 | 57 | 28 | 58 |
| Hit@3 / 60 | 39 | 59 | 37 | 59 |
| Hit@5 / 60 | 42 | 60 | 41 | 60 |
| MRR | 0.5612 | 0.9708 | 0.5718 | 0.9792 |
| Mean cosine true pairs (n=80) / decoy (n=40) / random (n=1000) | 0.8713 / 0.8603 / 0.8326 | 0.9191 / 0.9015 / 0.8520 | 0.8720 / 0.8609 / 0.8333 | 0.9188 / 0.9013 / 0.8519 |
| No-match top-1 cosine (n=15) min / median / max | 0.8460 / 0.8690 / 0.9106 | 0.8821 / 0.9035 / 0.9350 | 0.8476 / 0.8699 / 0.9148 | 0.8809 / 0.9054 / 0.9355 |
| True-pair cosine min (n=80) | 0.8061 | 0.8780 | 0.8046 | 0.8802 |

Versus `passage: ` on both sides (fp32): `source_text` Hit@5 35 -> 42 of 60 and MRR 0.50 -> 0.56; description Hit@1 54 -> 57 and MRR 0.94 -> 0.97. The production policy is at least as good on every rank metric here on this synthetic set, with 60 queries and a few queries moving, so treat the gain as small and unconfirmed. It does not remove the overlap of no-match and true-pair cosines (no-match max 0.9350 in the description arm is above the true-pair min 0.8780; 0.9106 vs 0.8061 for `source_text`).

## Per-variant breakdown of the `source_text` plateau (fp32, `passage: ` both sides)

Variant of each record is `source_variant` from `ground_truth.json`, joined on `record_id`. A query is grouped by (query variant -> variant of its highest-cosine true partner); counts per group are small (2 to 12), so these are descriptive only.

| query -> partner | n | Hit@1 | Hit@3 | Hit@5 | MRR |
|---|---|---|---|---|---|
| bn -> bn | 12 | 8 | 11 | 11 | 0.770 |
| bn -> en | 3 | 0 | 0 | 0 | 0.014 |
| bn -> short | 4 | 2 | 3 | 3 | 0.587 |
| en -> bn | 5 | 0 | 0 | 0 | 0.046 |
| en -> en | 4 | 4 | 4 | 4 | 1.000 |
| en -> short | 3 | 0 | 0 | 0 | 0.045 |
| mixed -> bn | 10 | 5 | 9 | 9 | 0.658 |
| mixed -> en | 5 | 0 | 0 | 0 | 0.056 |
| mixed -> short | 4 | 1 | 2 | 2 | 0.431 |
| public_post -> bn | 5 | 4 | 5 | 5 | 0.900 |
| public_post -> en | 2 | 0 | 0 | 0 | 0.012 |
| public_post -> short | 3 | 1 | 1 | 1 | 0.365 |

Same-variant pairs only (bn->bn + en->en; n=16): Hit@1 12, Hit@3 15, Hit@5 15 of 16, MRR 0.827. The other 44 cross-variant pairs account for the plateau: 24 of the 25 Hit@5 misses are cross-variant (the one same-variant miss is SYN-M-023, bn->bn, rank 14), and 20 of those 44 are Hit@5. Where the partner is `en` and the query is not `en`, Hit@5 is 0 of 10 (bn 0/3, mixed 0/5, public_post 0/2); `en` queries against `bn` partners are 0 of 5. All 25 misses are listed by the script with their variants and ranks (worst: SYN-M-002 bn->en rank 95, SYN-M-026 bn->en rank 90).

What this shows, from the measured numbers only: the plateau is concentrated in pairs whose two texts are in different variants, especially English vs Bangla text, and same-variant retrieval is 15/16 at Hit@5. That fits a cross-script/cross-wording artifact of how this generator renders the two sides, together with the model's weaker cross-language matching on this text; **this spike cannot separate the two** (no controlled arm with the same wording in both scripts was run) and says nothing about real reports. The `short` variant's language was not inspected, so no statement is made about it beyond the numbers. The groups are defined by highest-cosine partner, so counts shift slightly between arms.

## OPEN DECISION: local embeddings vs `EMBED_PROVIDER=api`

Not decided here. Evidence for the decision maker:

- Local inference works on a laptop: ~5 to 8 ms per record after load, weights 112.8 MiB (q8) or 448.5 MiB (fp32), results near-identical between the two on this set. The laptop finale stack (`DEMO_MODE=1`) is not blocked by this measurement on one laptop (M5, 16 GiB).
- Vercel hosting: **UNKNOWN (OQ-023)**. Nothing in this spike ran on Vercel. Function bundle size limits, memory, cold start with ONNX runtime and the weight file, and whether the native `onnxruntime-node` binary fits are all unmeasured. Do not cite any Vercel limit from memory; read the current limits for the plan actually used and measure.

### What a human must measure on a real Vercel deploy

1. Deployed function size with `@huggingface/transformers` + `onnxruntime-node` + the chosen model file (q8 ~113 MiB, fp32 ~449 MiB), against the limit shown for the team's plan at deploy time; whether the build is accepted at all.
2. Cold start of the embedding route: time to first response after idle, repeated at least 5 times, with the model in the bundle vs fetched at runtime (and the runtime-fetch variant's `/tmp` or cache behaviour).
3. Peak memory and configured function memory; any out-of-memory kill.
4. Warm per-request latency for 1 record and for a batch of 200 (`reembed`).
5. Whether the function duration limit on the plan covers re-embedding 200 records.
6. Record plan name, region, Node version, date, commit SHA and raw logs in a follow-up evidence file.

### Fallback (D2 Part A A-027)

If any measurement fails or is unacceptable: set `EMBED_PROVIDER=api` (provider embeddings API behind the same adapter) for Round 2 on Vercel and keep local Transformers.js for the laptop finale stack. An API embedder must keep the same 384-d `pgvector` column or trigger a re-embed with a dimension change; that is a schema decision for a human, and API processing of synthetic text needs provider notice per the constitution. Cost/limits for any API provider are UNKNOWN until `docs/costs.md` has real prices (TASK-003).

## Caveats that must travel with the TASK-016 decision

1. Verbatim-overlap upper bound: the description-field arm shares `clothing` verbatim in 80/80 true pairs and `marks` in 39/80 (checked from `data/synthetic`); its 60/60 is not a finding.
2. The two arms are confounded (description text lacks age, sex, date, district; `source_text` has them), so they are not a format comparison.
3. Prefix policy: production `query: `/`passage: ` result is in its own section; the gain over `passage: ` on both sides is small on 60 queries.
4. No supported match/no-match threshold: no-match top-1 cosine reaches 0.96 (0.9595, `passage: ` both sides, description arm), above the minimum true-pair cosine 0.90 (0.9005); show similarity, never a probability.
5. Synthetic and dev only, 60 queries x 110 candidates, one machine (M5, 16 GiB), few runs, no real Bangla evidence, not held-out.
6. Re-validate on `eval:match` with independently phrased text (not generator-templated, not sharing verbatim fields) before using any figure here for a decision.
7. Vercel size, cold start and memory remain UNKNOWN; local-vs-API stays an OPEN DECISION.

## Dependency note

`@huggingface/transformers` was installed in this worktree for the spike only and the `package.json`/lockfile change was reverted before commit. TASK-016 (embedding service) decides the production dependency. To re-run: `npm i -D @huggingface/transformers` then the commands above.
