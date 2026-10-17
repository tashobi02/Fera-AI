# TASK-016 evidence: embedding service and `npm run reembed` (COMP-011)

Owner: Masnun · Branch `phase2--masnun-embeddings` (from the seed lane `b1dabd6`) · Date: 18 Oct 2026 (Asia/Dhaka) · Links: TASK-016, COMP-011, A-026, A-027, A-028, RISK-015, OQ-023.
All data is synthetic. Status: `review`.

## What was built

| Piece | Where |
|---|---|
| `embedText(text, role)` (384-d, L2-normalised Float32Array; NFC; `query: ` / `passage: `) | `src/server/embeddings/model.ts`, re-exported by `index.ts` |
| `EMBEDDING = { model, revision, space }`, `MODEL_FILES` (SHA-256), prefix policy, `EMBED_PROVIDER` switch, injectable `Embedder` (`setEmbedder`) | `src/server/embeddings/model.ts` |
| `caseEmbeddingText(draftLike)` | `src/server/embeddings/text.ts` |
| `npm run model:fetch` | `scripts/model-fetch.mjs` |
| `npm run reembed` (logic in `scripts/embeddings/reembed-lib.mjs`) | `scripts/reembed.mjs` |
| Tests | `tests/embeddings/{text,embed}.test.ts` (fake embedder), `tests/db/embeddings.test.ts` (added to `test:db`) |

`model.ts` and `text.ts` have no relative imports and use only erasable TypeScript, because the `.mjs` scripts load them directly with Node's type stripping (default in Node 24; the repo's `engines` also allows `^22.12`, where type stripping is NOT on by default, so the scripts need Node 22.18+ or 24; local Node is v24.18.0).

## The pinned model

- Model `Xenova/multilingual-e5-small` (ONNX export of `intfloat/multilingual-e5-small`), `q8` weights, mean pooling, L2 normalised, 384-d.
- **Revision `761b726dd34fb83930e26aab4e9ac3899aa1fa78`**, read on 18 Oct 2026 from `https://huggingface.co/api/models/Xenova/multilingual-e5-small` (last modified 2025-07-22). The TASK-004 spike downloaded `main` and did not record a hash; because `main` had not moved since 2025-07-22 it is the same commit unless Hugging Face rewrote history. The q8 weight file matches the spike's byte count (118,308,185 B).
- **Space** `e5-small-q8-mean-l2-384-text-v1-<10 hex>`: built by `buildSpace()` from the exported constants (dtype, dimension, `TEXT_RECIPE`, the `query: `/`passage: ` prefix strings, the kind-to-role map, pooling and normalise options) with a short SHA-256 of them, so changing any one changes the string (tested). Current value `e5-small-q8-mean-l2-384-text-v1-f88aa34c97`. Changing the model, revision, space string or `TEXT_RECIPE` makes `reembed` re-embed every case.
- Files fetched, each SHA-256 verified before it is kept: `config.json`, `tokenizer_config.json`, `tokenizer.json` (16.3 MiB), `onnx/model_quantized.onnx` (112.8 MiB). 129.1 MiB on disk. Cache `./models/hf` (or `FERA_MODEL_CACHE`), git-ignored (`models/`). Never committed.
- Transformers.js 4.3.1 finding: passing `revision` to `pipeline()` makes its tokenizer lookup miss a custom cache (`this.tokenizer is not a function`). So `model:fetch` downloads the pinned revision itself into the default-revision layout and the runtime loads with remote downloads disabled. A missing file fails with a "run `npm run model:fetch`" message; the runtime never downloads.

## What is embedded, and why (`caseEmbeddingText`)

| Field | Embedded | Reason |
|---|---|---|
| clothing, marks, circumstances, place_text | yes | the spike's description arm (structured fields beat raw source_text on the synthetic set; that result is an upper bound because clothing is identical in 80/80 true pairs) |
| sex, age (as Bangla words, e.g. `ছেলে`, `বয়স ৭–১০ বছর`; unknown left out) | yes | requested by the brief; Bangla script/digits to match the other fields (mixed-script text under-performed in the spike). **Effect on ranking is UNKNOWN**: the spike's description arm did not include them. Drop by removing them and bumping `TEXT_RECIPE`; `eval:match` should decide |
| child_name, child_name_latin | **no** | the matcher scores names separately (A-028 weights name 0.15); embedding them would count the name twice |
| reporter phone, relation, GD number, thana, raw_text/source_text, district text | **no** | not a description of the child; phone and raw text can carry identifying details and never enter a vector |

Text is NFC-normalised with whitespace collapsed, so U+09DF and U+09AF U+09BC give the same text and vector (tested). Missing reports use the `query: ` prefix, found records `passage: ` (the spike's production policy; the gain over passage/passage was small).

## `EMBED_PROVIDER`

Default `local`. `api` (and any other value) **fails closed** with "not configured": no provider, key or price exists (account and prices UNKNOWN), nothing is sent anywhere, no paid API is called, no key added. `npm run reembed` checks this before touching the database. Whether local embedding fits Vercel stays **UNKNOWN (OQ-023)** and the local-vs-API decision stays **OPEN** (see `embedding-spike.md` on the spike branch for the measurements a human must take on a real deploy).

## `npm run reembed`

- Loopback-only database guard (`scripts/db/guard.mjs`, same as `db:reset`/`seed`), owner URL `FERA_DB_ADMIN_URL`, database `FERA_DB_NAME` (default `fera`).
- Embeds every case with `anonymised_at IS NULL`, status not `confirmed`/`closed`/`referred`, and an embedding that is NULL or differs in model, revision or space. Terminal cases are left alone because `cases_transition_guard` locks their report fields (including the embedding) and they are no longer matched; redacted cases must keep the embedding NULL (schema CHECK).
- Idempotent (a second run finds nothing). Embeds first, then writes each batch of 25 in one transaction (`BEGIN`, per-row `UPDATE ... WHERE version = <read version>`, `COMMIT`); a row edited meanwhile is counted `stale_retry` and picked up next run. A case whose description text is empty is skipped (`skipped_empty`), never embedded as a bare prefix.
- Prints counts only (`N records embedded` plus a JSON line); never case text, names or phones.

## Verification (18 Oct 2026, this laptop: Apple M5, Node v24.18.0, PostgreSQL 16.15 + pgvector 0.8.1)

| Check | Result |
|---|---|
| `npm run model:fetch` (first, network) | 4 files downloaded and hash-checked, 129.1 MiB, 26.7 s total including one test embedding; rerun: cached, 0.8 s |
| Fresh DB `fera_t3real`: `db:reset`, `seed:users`, `seed -- --set full` | 200 cases inserted, 0 embeddings |
| `npm run reembed` (real model) | **200 records embedded**, 8 batches, 2.8 s in-process (3.1 s wall incl. process start and model load) |
| second `npm run reembed` | 0 records embedded, 0 batches |
| Database check | 200 rows, 200 embeddings, 1 distinct `embedding_space`, vector norm 0.99999997 to 1.00000003 |
| `EMBED_PROVIDER=api npm run reembed` | exit 1, "not configured", no database touched |
| `FERA_REAL_EMBED=1 npx vitest run tests/embeddings` | 17 passed (real-model test included: related Bangla text scored closer than unrelated, 384-d, unit norm) |

Single local runs, not a benchmark; the 2.8 s figure is wall time for 200 short synthetic texts on one machine. Nothing here measures retrieval quality: that is `eval:match` (TASK-039) on independently phrased text. The spike caveats (verbatim-overlap upper bound, no usable match/no-match cosine threshold, similarity is not a probability) travel with this task unchanged.

Tests: `tests/embeddings/*` (fake embedder: unit norm, 384-d, NFC equality, name/phone never embedded, exact prefixes, provider fail-closed, bad-vector rejection); `tests/db/embeddings.test.ts` (6 tests: fills 200 with all three columns set and the CHECK holding, query/passage per kind with no name/phone in any embedded text, second run changes 0 rows, a changed revision or space re-embeds all 200, closed and redacted cases skipped).

## Dependency note (AGENTS.md: no new dependency without a note)

| Item | Detail |
|---|---|
| Package | `@huggingface/transformers` **4.3.1**, exact pin, production dependency (the spike used 4.3.1 as a dev-only install) |
| Why | runs the pinned multilingual-e5-small locally (A-026/A-027): no per-call cost, offline for the laptop finale |
| Licence | Apache-2.0 (package, per `node_modules/@huggingface/transformers/package.json` and the lockfile). Model licence: **UNKNOWN** (believed MIT, from memory, NOT verified; check the model card before the final licence notice) |
| Size | package 15 MB; its dependencies `onnxruntime-node` 1.30.0 (287 MB in `node_modules`, native binaries) and `onnxruntime-web` (140 MB) and `sharp` 0.35.5 dominate. These are install-size numbers on macOS arm64 only; Vercel function size is **UNKNOWN (OQ-023)** |
| Runtime download | none: the runtime loads from the local cache with remote models disabled. Only `npm run model:fetch` downloads (4 files from huggingface.co, ~129 MiB). `npm install` may also run onnxruntime-node's install script; npm printed an "allow-scripts" warning for it and it ran fine here: needs a human look at CI |
| Not yet wired | no route imports the service yet; when one does, `next.config.ts` will need `serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node"]` (not added, unmeasured) |

## Fix round 1 (18 Oct 2026, after review)

**Guarantee, reworded.** The child-name and phone FIELDS are not embedded, and phone-like numbers (01 + 9 digits, ASCII or Bangla digits, space/dot/hyphen separators, optional +880) are scrubbed from the free-text fields before embedding. **Names typed into free text are NOT detected.** Tested.

**Top-1 similarity does not identify a true no-match.** In the TASK-004 spike no-match top-1 cosine reached 0.96 while the weakest true pair was 0.90. Similarity is not a probability and must not be shown or used as one. (Also in the `text.ts` header.)

**Staleness.**
- A golden test pins `caseEmbeddingText` for fixed inputs; any change to it must bump `TEXT_RECIPE` (which changes the space and makes `reembed` redo everything).
- Writers of embedded fields or of the embedding columns, from grepping `src/server` and `db/seed`: `src/server/case/commands.ts` `editMissingCase` (clears embedding + model + revision + space in the same UPDATE as the edit; correct), `db/seed/cases.mjs` (inserts with the columns NULL), `scripts/embeddings/reembed-lib.mjs` (this task), and `redact_case()` in the schema (clears them). `src/server/case/{state,rows}.ts` only mention or read the columns. No other writer found. Rule for future code: any path that changes clothing, marks, circumstances, place_text, sex or age_* MUST clear the four embedding columns in the same UPDATE.
- A case whose text becomes empty: **fixed**, not just documented. `reembed` clears its old vector (`cleared_empty` count). The schema currently forbids empty text on live cases (place_text and age are required), so this is covered by a stub-client unit test only.
- **Open decision (TASK-017 / matcher owner):** after a model change `reembed` does NOT reset `matching_state`, `matched_at` or `match_error_id`, and does not void candidates computed from old-space vectors. The matcher must decide how to treat them.
- Concurrency: each UPDATE is guarded by the `version` read with the row; an edited row is counted `stale_retry`, one more bounded pass is made, anything still stale is `stale_remaining` and printed as a warning. Tested with an injected edit between SELECT and UPDATE (the edit's NULL embedding wins; the retry then embeds the NEW text).
- `TERMINAL` (confirmed, closed, referred) in `reembed-lib.mjs` duplicates the transition-guard trigger's terminal states in `db/schema_v2.sql`; the schema owner must keep the two in sync. Tested for confirmed, referred and closed, plus redacted.

**Cache integrity.** `loadLocalEmbedder` verifies the SHA-256 of all four model files once per process (about 113 MiB hashed), refuses a world-writable cache directory, sets `env.allowLocalModels = true` and `allowRemoteModels = false`, and fails closed with a `npm run model:fetch` hint. The file list is injectable, tested with tiny files, a corrupted file, a missing file and a 0777 directory. Because Transformers.js 4.3.1 looks files up under its DEFAULT revision (passing `revision` cannot find a pinned cache), the cache is not keyed by revision and the hash check is what ties the bytes to the pinned revision. `onnx/model_quantized.onnx` and `tokenizer.json` digests equal Hugging Face's LFS oids; **`config.json` and `tokenizer_config.json` have no LFS oid, so their digests are trust-on-first-use** (hashed from the bytes downloaded on 17 Oct 2026).

**Node preflight.** `model:fetch` and `reembed` check the Node version first and exit 1 with a message if type stripping is unavailable (needs 22.18+, 23.6+ or 24). **Open decision for Mahim:** `package.json` `engines` still says `^22.12.0 || >=24.0.0`, which allows 22.12 to 22.17 where these scripts would exit with that message. `engines` was not changed.

**Database.** `reembed` sets `statement_timeout = 60s` and `lock_timeout = 5s` on its connection. It runs as the owner connection (loopback-guarded, like `db:reset` and `seed`); the same logic also runs as `fera_app` (column-level UPDATE grants suffice; tested via `connect("app")`), so a future route can call it with the app role. It reads only the `cases` table, never `intake_drafts` (source-level test), so unreviewed drafts are never embedded.

**Revision date.** `main` was read from the Hugging Face API on 17 Oct 2026 (first look-up) and again on 18 Oct 2026: same sha `761b726dd34fb83930e26aab4e9ac3899aa1fa78`, lastModified 2025-07-22 (query repeated 18 Oct 2026 01:27 +06).

**Real pipeline, rerun after the fixes** (single local run, 18 Oct 2026 01:30 +06, fresh database, model already cached and re-verified by SHA-256 at load; code at the commit following 229bebc; this laptop, Node v24.18.0, PostgreSQL 16.15 + pgvector 0.8.1):

```
seed -- --set full : cases inserted 200, skipped 0
npm run model:fetch: ok (cached) x4; ok: 384-d vector, 129.1 MiB in cache, 1.2 s
npm run reembed    : 200 records embedded
  {"embedded":200,"skipped_empty":0,"cleared_empty":0,"stale_retry":0,"batches":8,"stale_remaining":0,"space":"e5-small-q8-mean-l2-384-text-v1-f88aa34c97","elapsed_s":2.5}
second reembed     : 0 records embedded
db: 200 rows | 200 embeddings | 1 distinct space | vector_norm 0.99999997 to 1.00000003
```

The earlier timings in this document (26.7 s first fetch, 2.8 s for 200) were also single local runs, not benchmarks.

**Dependency PR note, additions.** `@huggingface/transformers` 4.3.1 is Apache-2.0 per the lockfile. Its `onnxruntime-node` 1.30.0 postinstall downloads native binaries (on linux/x64 this includes CUDA provider files we do not use); recommending `ONNXRUNTIME_NODE_INSTALL=skip` where the embedding model is not run (CI, Vercel) is a CI decision for Mahim (`.github` not touched here). `onnxruntime-web` is pinned by transformers to a dev build `1.31.0-dev.20260914-8d85527a0` and must not be bundled into client code. `serverExternalPackages` is not wired because no route calls the service yet.

## Open items

- UNKNOWN: Vercel size/cold-start/memory fit (OQ-023); local-vs-API decision stays OPEN.
- UNKNOWN: whether age/sex words help or hurt ranking (needs `eval:match`).
- UNKNOWN: model licence (see above). Open decisions: `engines` vs Node 22.18; matcher handling of `matching_state` after a model change; CI `ONNXRUNTIME_NODE_INSTALL=skip`.
- The match pipeline that calls `embedText` after submit (COMP-011 failure mode "case saved `open` without vector") belongs to the matcher/case-service integration (TASK-017), not this task.
