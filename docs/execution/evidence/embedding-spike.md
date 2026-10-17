# TASK-004 embedding spike — evidence and R-4 recommendation

**Card:** P3-011 · TASK-004 · OQ-023 · RISK-015
**Owner lane:** Masnun (docs only — no dependency committed)
**Branch:** measured in `/tmp` scratch by the orchestrator, **not** in the repo worktree
**Written:** 2026-10-17 (Asia/Dhaka) by the worker assigned to P3-011
**Status:** evidence-backed report; recommendation is **cautious** and conditional on the unknowns called out in §4

---

## 1. Scope of the spike

The objective of TASK-004 is to choose between two embedding strategies for Fera:

- **Option A — local on the laptop (demo / finale):** the orchestrator's local device runs `@huggingface/transformers` with `Xenova/multilingual-e5-small` (q8) to produce 384-dimensional vectors.
- **Option B — hosted API:** pay a remote provider per call. Gated on TASK-003 keys (HUMAN; no spend before then — AGENTS.md and the plan's rules).

The card scope (PHASE_3_PLAN.md §6, P3-011) is the spike, not the production decision. P3-024 (TASK-016) builds the embedding service after R-4 is decided. P3-011 must produce numbers and a recommendation; it must not commit a dependency.

## 2. What was measured, where, and how

A **single** local run was performed by the orchestrator in a scratch directory under `/tmp` (outside the repo). The configuration:

| Item | Value |
|---|---|
| Library | `@huggingface/transformers@4.3.1` (installed only in `/tmp` scratch) |
| Model | `Xenova/multilingual-e5-small`, q8 quantisation |
| Corpus | 20 synthetic sentences, mixed Bangla and English (no real child data, per AGENTS.md) |
| Runtime | Node v26.11.1, Linux x64 |
| Network | first model download and pipeline initialization measured once; 20 inputs then embedded sequentially in the same process |

The orchestrator reported the following numbers. They are reproduced here exactly as given; they are not re-measured in this lane.

| Metric | Value | Notes |
|---|---|---|
| On-disk model cache size | **135,392,016 bytes** ≈ **129.12 MiB** (binary) | the q8 model files the library writes under its cache; pre-decompress uncompressed in-RAM footprint is **UNKNOWN** and not measured here |
| Cold pipeline init + download | **46,158.996 ms** (≈ 46.16 s) | one-shot; includes the first-time fetch of the model files |
| Per-text latency, median | **4.424888 ms** | pipeline already initialized; same process |
| Per-text latency, min | **3.370512 ms** | |
| Per-text latency, max | **15.58157 ms** | one tail outlier on 1 of 20 texts; cause **UNKNOWN** without per-text logs |
| Output dimension | **384** | required by the schema (D2B, HNSW column on the case vector) — **passes** |

These are **single-run** numbers on a single machine. The plan's rules are explicit that they are "a single local run, not deployment" and they are not a deployment readiness claim. They are sufficient to inform R-4, not to ship against.

## 3. What this answers for the schema and matching

- **Dimension check (TC-059 family):** the model returns 384-d vectors, exactly the column the schema assumes (D2B embedding section). The shape check passes for this model configuration.
- **Language coverage (D2B, OQ-023):** `multilingual-e5-small` is explicitly multilingual and is the model the plan already names as the candidate. The 20-sentence mix is a smoke test, not a labelled benchmark — a real eval on the 50 labelled reports (TASK-011, P3-012 → P3-210/211) is the place to measure recall@5 and abstention on the synthetic set.
- **The `query:` / `passage:` prefix convention (D2B):** this spike explicitly prefixed all 20 inputs with `query:`. It did not test `passage:` inputs or retrieval quality. P3-024 must apply the right prefix per call site and store the model/version with each vector (TC-059: refuse mixed versions on reembed).

## 4. Vercel function size viability — **UNKNOWN**

This card measures laptop local embedding. D6 TASK-004 and D2A A-027 require a Vercel hosting viability check, which this laptop-only measurement does not satisfy. The official Vercel limits and the remaining measurements are recorded below.

### 4.1 What the official Vercel sources say

- **Standard Node function size cap (uncompressed):** **250 MB** maximum per function. Source: <https://vercel.com/docs/functions/limitations>.
- **Large functions opt-in:** Vercel Functions can be up to **5 GB** in package size on the opt-in large-functions tier. Source: <https://vercel.com/changelog/vercel-functions-can-now-be-up-to-5-gb-in-package-size>.

### 4.2 What is still unknown for the Fera bundle

The actual **built** Fera bundle size is **UNKNOWN**. The numbers in §2 are the on-disk q8 model cache (~129 MiB on disk) on the orchestrator's laptop. They are not the size of a Vercel function artefact, which is determined by what the bundler emits after the embedding code, the model's external-data shims, and the rest of the Fera server are tree-shaken and packed. The plan does not give a measured Fera-built artefact size, and this card was not asked to produce one.

Concretely, the unknowns that block a Vercel-bundle answer from this spike are:

1. The built Fera artefact size after `next build` with `@huggingface/transformers` as a dependency — not measured.
2. Whether the on-disk q8 model is fetched at runtime (Vercel has no persistent disk for serverless functions) or bundled in — both add either cold-start time or bundle size; neither is measured.
3. The cold-start effect on Vercel request paths is **UNKNOWN**. D2B §12.1 sets parent LCP ≤3 s (three-run median) and route JavaScript ≤170 KB gzip; D1 NFR-001 sets interactive response ≤3 s. This spike did not measure hosted cold starts, parent LCP, route JavaScript, or whether a parent request waits for embedding initialization. P3-302 (TASK-060) owns the later performance measurement.
4. Whether the parent-side client should ever import `@huggingface/transformers` at all. The plan implies no — embedding is a server concern — but the bundle surface on Vercel still depends on the route layout, which this card does not own.

For these reasons, the Vercel function bundle viability is **UNKNOWN** and is recorded as such. It is not a "yes" and not a "no".

## 5. Risk notes (OQ-023, RISK-015)

- **Cold start on Vercel:** the 46.16 s local download and initialization is a concern for any request path that waits for an uncached model. Whether the deployed route waits for it, and the actual hosted cold start, are **UNKNOWN**. Warm the model before the local finale demo.
- **Per-text latency:** the observed median was 4.42 ms and maximum was 15.58 ms for this 20-input run. End-to-end matching latency and the latency distribution are **not measured** here; P3-211/P3-302 must measure them.
- **Cache and determinism:** the on-disk cache is 129 MiB. A `gitignore`d `model:fetch` (per P3-024) and a recorded model/version with every vector (TC-059) are the controls. They are not in scope here.
- **Real providers, real data:** this spike used synthetic sentences on a local machine. No key, no real audio, no real child data. The plan's rules (AGENTS.md, §2 cut triggers, OQ-023) are kept.

## 6. Recommendation for R-4 (cautious)

R-4 is the team's choice between local Transformers.js and a paid API. The card asks for a recommendation; the plan's cut rules and the lack of measured Vercel data make a confident "deploy-on-Vercel-with-local-model" answer unsupportable. The recommendation is therefore split, with the same numbers:

1. **For the 24 Oct finale (laptop, in-person demo):** **local embedding on the orchestrator's laptop, warmed before the demo, is the recommended path.** The numbers support it:
   - The model fits in a one-time fetch (~129 MiB) and is then warm.
   - 4.42 ms median per text is promising for a warmed pipeline; it does not establish the end-to-end BR-018/TC-008 result.
   - Dimension is correct (384), so no schema rework.
   - No paid provider is invoked; the spend cap is preserved; the no-paid-before-TASK-003 rule is honoured.

2. **For any post-finale Vercel-hosted embedding (deferred decision):** **UNKNOWN.** The official Vercel limits (250 MB standard, 5 GB opt-in) and the ~129 MiB on-disk model do not, by themselves, decide the question. A real answer needs:
   - the **built** Fera bundle size after `next build` with this dependency, and
   - a measured cold-start on Vercel for the parent screen(s) that depend on it, against the TC-034 / D2B §12.1 budget.
   Both are owned by the deploy and performance cards (P3-301, P3-302) and are not produced by this spike. Until those two numbers exist, R-4 should not be extended to "deploy the same model on Vercel" without a fresh review.

3. **What this report does not recommend:** a paid API (Option B) for the finale. Its latency and cost were not measured, and TASK-003 keys and spend controls remain human `todo`. A paid fallback is unavailable until those controls exist and the team approves the route.

## 7. Acceptance check vs the card

The card's Accept line is: "report has size, cold start, latency, dimension check (384), and a recommendation for R-4."

| Item | Where in this report |
|---|---|
| Size | §2 — 135,392,016 bytes cache |
| Cold start | §2 — 46,158.996 ms |
| Latency | §2 — median 4.424888 ms, min 3.370512 ms, max 15.58157 ms |
| Dimension check (384) | §2 — 384, passes |
| Recommendation for R-4 | §6 — local laptop for the finale; Vercel hosted is **UNKNOWN** pending built-bundle size and cold-start budget |

## 8. Sources

- Plan card P3-011 (PHASE_3_PLAN.md §6, line 231).
- D2B embedding sections, OQ-023, RISK-015 (cited in the card Inputs).
- AGENTS.md (stack line; no real provider before TASK-003; synthetic only).
- Vercel function limits: <https://vercel.com/docs/functions/limitations> (standard 250 MB).
- Vercel large functions: <https://vercel.com/changelog/vercel-functions-can-now-be-up-to-5-gb-in-package-size> (opt-in 5 GB).

## 9. What this card does not do

- It does not commit a dependency. `@huggingface/transformers` is not added to `package.json`. That is P3-024, and only after R-4 is decided by Masnun (PHASE_3_PLAN.md §3, R-4).
- It does not read or write any `.env` file. No secrets are needed for a local q8 model.
- It does not run a labelled eval. The 20-sentence corpus is a smoke test, not TC-020.
- It does not push, merge, or deploy. This is a docs-only change on a docs-only card.
