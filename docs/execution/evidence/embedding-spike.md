# Embedding spike: multilingual-e5-small via Transformers.js (TASK-004, OQ-023, RISK-015)

Status: local measurement DONE on one laptop. **Vercel limits UNKNOWN until a real deploy is measured.** Local-vs-API is an **OPEN DECISION**.
Data: SYNTHETIC only (`data/synthetic/`, PR #34). Not a held-out result, not evidence of real Bangla quality.

## Commands run (worktree `masnun-spike`, 17 Oct 2026)

```
npm i -D @huggingface/transformers          # v4.3.1 resolved; SPIKE ONLY, package.json/lock NOT committed
node scripts/embed-spike.mjs --cache .cache/models              # fp32 (first run downloaded the model)
node scripts/embed-spike.mjs --cache .cache/models-q8 --dtype q8
```

`.cache/` is git-ignored; no model files committed. Model id `Xenova/multilingual-e5-small` (ONNX export of intfloat/multilingual-e5-small), mean pooling, L2 normalised, 384-d, `passage: ` prefix on every record. (Queries would use `query: ` in production per D2A; this spike embeds both sides with `passage: ` for symmetry, so numbers are not the production prefix setup.)

## Machine (read via uname/sysctl)

Apple M5, 16 GiB RAM (`hw.memsize` 17179869184), Darwin 25.6.0 arm64, Node v24.18.0. Local CPU, not Vercel.

## Results (n shown for every figure)

| Item | fp32 | q8 |
|---|---|---|
| Model weight file on disk | 470,268,533 B (448.5 MiB) `onnx/model.onnx` | 118,308,185 B (112.8 MiB) `onnx/model_quantized.onnx` |
| Whole cache dir (incl. tokenizer 17 MB) | 487,352,364 B (464.8 MiB) | contains both ONNX files, 577.6 MiB; ignore, see weight row |
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
- `source_text` Hit@5 stays at 35/60 while `description_fields` reaches 60/60. The cause was **not diagnosed** here. Source texts mix Bangla, English and short/public_post variants (see `ground_truth.json` `source_variant`), but no per-variant breakdown was run, so no claim is made about cross-language behaviour.
- Caveats: text is template-generated and easy; 60 queries and 110 candidates is small; both sides use the `passage: ` prefix; description fields are the generator's own structured fields (in production they come from reviewed extraction); one machine, few runs. This is a dev-split style spike, **not a held-out result**, and says nothing measured about real Bangla quality. `eval:match` (Masnun, later task) owns real evaluation.

## OPEN DECISION: local embeddings vs `EMBED_PROVIDER=api`

Not decided here. Evidence for the decision maker:

- Local inference works on a laptop: ~5 to 8 ms per record after load, weights 112.8 MiB (q8) or 448.5 MiB (fp32), results near-identical between the two on this set. This supports the **laptop finale stack** (`DEMO_MODE=1`) as feasible.
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

## Dependency note

`@huggingface/transformers` was installed in this worktree for the spike only and the `package.json`/lockfile change was reverted before commit. TASK-016 (embedding service) decides the production dependency. To re-run: `npm i -D @huggingface/transformers` then the commands above.
