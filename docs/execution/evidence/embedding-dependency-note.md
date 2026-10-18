# Embedding dependency note (P3-024)

Plain, factual note on the production embedding stack and its transitive
dependencies. No invented numbers — every line is either a `package.json`
/`package-lock.json` reading or an item the lead has to confirm.

## Direct dependency

- `@huggingface/transformers` 4.3.1 (declared in `package.json`). The
  spike (see `embedding-spike.md`) evaluated this version on a laptop and
  is the version TASK-016 ships. AGENTS.md pins the local
  `multilingual-e5-small` (Xenova export) as the embedding model — 384-d,
  mean pooling, L2-normalised, `query:` / `passage:` prefix policy. The
  security hardening in P3-024 keeps the runtime path local;
  `scripts/model-fetch.mjs` is the supported entry point that fetches
  from huggingface.co. It uses fixed pinned asset URLs and verifies each
  SHA-256 before the runtime loader opens the local cache with remote
  access disabled. The cache is gitignored.
  The follow-up pin is `Xenova/multilingual-e5-small` revision
  `761b726dd34fb83930e26aab4e9ac3899aa1fa78`, q8. The canonical space
  digest includes model, revision and the full vector recipe, so a revision
  bump makes stored vectors visibly stale.

## Local pin verification (2026-10-18)

The authorized `npm run model:fetch` run found all four pinned files already
in the ignored worktree cache. It reported each as cached, verified their
SHA-256 values against `src/server/embeddings/model.ts`, and completed the
runtime warm-up with remote models disabled; no asset download was needed.
The pinned files were 658 B (`config.json`), 443 B (`tokenizer_config.json`),
17,082,730 B (`tokenizer.json`), and 118,308,185 B
(`onnx/model_quantized.onnx`). The script reported 1,212 ms elapsed and a
577.6 MiB cache total. That total includes an extra, unpinned
`onnx/model.onnx` file of 470,268,533 B already present in the cache; runtime
verification requires only the four listed pinned files.

`FERA_REAL_EMBED=1 npm test -- tests/embeddings/embed.test.ts` passed all six
tests with the local CPU runtime, including Bangla query/passage vectors of
dimension 384 whose L2 norms are within `1e-3` of 1. The runtime test uses the
verified local cache and keeps remote model downloads disabled.

## Transitive dependencies worth knowing about

These are read from the current `package-lock.json`; the lockfile has not
been changed by this lane.

- `onnxruntime-node` 1.30.0 (pulled in via `@huggingface/transformers`).
  This package has an **install script** that, on `linux/x64`, downloads
  CUDA provider binaries from `api.nuget.org` at install time unless
  `ONNXRUNTIME_NODE_INSTALL=skip` is set. Recommendation (not done by
  this lane): set `ONNXRUNTIME_NODE_INSTALL=skip` in CI and in any
  deploy install step where the CUDA provider is not needed, so the
  install does not depend on `api.nuget.org`. CPU inference still works
  after the install step is skipped; only the GPU provider is omitted.
  Until this is set, a clean `npm ci` on linux/x64 in a network-limited
  sandbox can fail with a NuGet fetch error, and the failure surfaces as
  a postinstall error, not a runtime error.

- `onnxruntime-web` 1.31.0-dev.20260914-8d85527a0 (pulled in via
  `@huggingface/transformers` and `sharp`). This is a **nightly
  pre-release** (`-dev.YYYYMMDD-<sha>`). The lockfile pins it to a
  single dated build, but the package name carries the dev tag, so a
  future `@huggingface/transformers` patch release can move it again.
  Fera is not currently using the web runtime (we use the node runtime
  on the laptop stack and do not yet know the Vercel runtime plan —
  OQ-023), so this transitive dep is dormant today, but the team should
  either (a) confirm the dev pre-release is acceptable as a transitive
  pin or (b) move the dependency to a stable line via a `overrides`
  entry in `package.json`. Listed as an open decision below.

- `onnxruntime-common` 1.31.0-dev.20260911-2a43ec07e (pulled in via
  `onnxruntime-web` and via `onnxruntime-node`'s peer line). Same
  pre-release caveat as `onnxruntime-web`; same open decision.

- `protobufjs` 7.6.6 (pulled in via `onnxruntime-web`). The package has
  a benign install script (`postinstall` regenerates a `dist` artefact);
  it does not reach the network and does not call any external
  downloader. No action recommended.

## Open decisions

Items the lead or a follow-up lane must resolve. None of them is
"blocked" today; each is a deliberate decision left to the human.

1. **Model pin provenance.** The initial spike did not record a model
   revision. The follow-up source comment records the Hugging Face model
   API lookup on 17 and 18 Oct 2026 and pins revision
   `761b726dd34fb83930e26aab4e9ac3899aa1fa78` in code. Four local asset
   hashes were verified on 18 Oct 2026 as documented above. Keep the source
   revision and asset hashes synchronized when intentionally changing the
   model; the pinned asset hashes, not a mutable `main` reference, guard the
   runtime cache.
2. **`ONNXRUNTIME_NODE_INSTALL=skip` in CI / deploy.** Recommended in
   the section above; not done by this lane. The decision is whether
   to set the env var in `.github/workflows/*.yml` and in the Vercel
   project settings so the install no longer depends on
   `api.nuget.org`.
3. **Nightly pre-release pin.** Both `onnxruntime-web` 1.31.0-dev.* and
   `onnxruntime-common` 1.31.0-dev.* are nightly builds that the team
   has not explicitly chosen. The decision is whether to keep them
   (Fera does not use the web runtime), add a `package.json` `overrides`
   to a stable line, or wait for a non-dev release from
   `@huggingface/transformers` upstream.

## Files touched in P3-024 (security hardening)

- `src/server/embeddings/model.ts` — adds `allowRemote` (default
  `false`), per-model/cache/recipe pipeline cache key, repo-root-anchored
  default cache dir, and the offline cache verification path. The later
  model-pin follow-up below records the pinned revision and hashes.
- `src/server/embeddings/index.ts` — `reembedAll` now SKIPS rows whose
  canonical embed text is empty (only the prefix remains) instead of
  embedding the bare prefix. Skipped rows keep `embedding=NULL` and
  the schema CHECK
  `embedding IS NULL OR (embedding_model IS NOT NULL AND ...)` is
  satisfied. `skippedEmpty` reports the count.
- `scripts/reembed.mjs` — sets `env.allowRemoteModels = false`, skips
  empty rows from the embed call and from the UPDATE, anchors the
  cache dir at the repo root via `import.meta.url`.
- `scripts/model-fetch.mjs` — downloads only fixed pinned asset URLs,
  verifies their hashes, then warms up via the runtime loader with remote
  access disabled; anchors the cache dir at the repo root via
  `import.meta.url`.
- `tests/embeddings/model.test.ts` — adds a mocked-loader suite that
  asserts the default `loadLocalEmbedder` sets
  `env.allowRemoteModels = false`, that `allowRemote: true` is the only
  way to flip it on, and that model/cache/recipe cache configurations
  works.
- `tests/db/reembed.test.ts` — the "skippedEmpty" test now asserts the
  row's `embedding`, `embedding_model`, `embedding_revision`, and
  `embedding_space` are all NULL after the run (it previously expected
  a prefix-only vector to be stored).

## Model pin follow-up

- `src/server/embeddings/model.ts` — pins the Xenova revision and four
  SHA-256 asset digests; includes model and revision in the canonical
  embedding-space hash.
- `src/server/embeddings/text.ts` — exposes prefix-free structured text
  for the reembed worker; phone removal leaves one normalized boundary.
- `scripts/embeddings/reembed-lib.mjs` — checks persisted vector metadata
  before re-embedding and invalidates pending candidates and active match
  state before writing vectors from a new space.
- `tests/embeddings/` — covers model/revision space identity, pinned cache
  verification, phone scrubbing, and stale-vector upgrade ordering.
