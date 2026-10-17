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
  security hardening in P3-024 keeps the runtime path local; only
  `scripts/model-fetch.mjs` is allowed to fetch from huggingface.co
  (with an explicit `allowRemote: true`), and the cache is gitignored.

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

1. **Model revision pin.** `docs/execution/evidence/embedding-spike.md`
   does not record a specific revision/commit hash for
   `Xenova/multilingual-e5-small`. Per the P3-024 brief, when no hash
   is recorded we do NOT invent one: the loader passes only the model
   id and reads the optional `refs/main` file best-effort after the
   pipeline is built. The relevant comment in
   `src/server/embeddings/model.ts` and `scripts/reembed.mjs` is
   `UNKNOWN: model revision not pinned (not recorded in
   embedding-spike.md)`. The decision is whether to run a second spike
   that records a specific hash and update the spike doc so a future
   loader change can pin it via the `revision` option.
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
  `false`), per-`(model, cacheDir)` cache key, repo-root-anchored
  default cache dir, and the `UNKNOWN: model revision not pinned`
  comment.
- `src/server/embeddings/index.ts` — `reembedAll` now SKIPS rows whose
  canonical embed text is empty (only the prefix remains) instead of
  embedding the bare prefix. Skipped rows keep `embedding=NULL` and
  the schema CHECK
  `embedding IS NULL OR (embedding_model IS NOT NULL AND ...)` is
  satisfied. `skippedEmpty` reports the count.
- `scripts/reembed.mjs` — sets `env.allowRemoteModels = false`, skips
  empty rows from the embed call and from the UPDATE, anchors the
  cache dir at the repo root via `import.meta.url`.
- `scripts/model-fetch.mjs` — the only path that sets
  `env.allowRemoteModels = true`; anchors the cache dir at the repo
  root via `import.meta.url`.
- `tests/embeddings/model.test.ts` — adds a mocked-loader suite that
  asserts the default `loadLocalEmbedder` sets
  `env.allowRemoteModels = false`, that `allowRemote: true` is the only
  way to flip it on, and that the per-`(model, cacheDir)` cache key
  works.
- `tests/db/reembed.test.ts` — the "skippedEmpty" test now asserts the
  row's `embedding`, `embedding_model`, `embedding_revision`, and
  `embedding_space` are all NULL after the run (it previously expected
  a prefix-only vector to be stored).
