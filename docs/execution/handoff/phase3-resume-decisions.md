# Phase 3 resume decisions

**Recorded:** 2026-10-18 (Asia/Dhaka)
**Authority:** USER-DELEGATED AGENT
**Scope:** technical decisions for finishing Phase 3 across all owner lanes

The user explicitly delegated Phase 3 technical decisions and work across owner lanes to the orchestrating agent on 18 Oct. This document records those agent decisions. It does not claim that Mahim, Masnun, or Obidit personally approved them, and it is not evidence that code, reviews, human tasks, or gates are complete. The Phase 3 plan §9 remains the evidence-backed status source.

## Intake notice, sessions, drafts, and replay

### Provider notice

API-001 and API-002 require the versioned request header `x-fera-provider-notice: v1` before any intake provider dispatch. The browser may send it only after showing the COMP-050 notice. The route accepts only the supported version and fails closed before reservation or dispatch when it is absent or unsupported. The version is an explicit acknowledgment signal; it does not move transcript, audio, or child fields into the header or server draft metadata. Test the missing, unsupported, and supported cases at the route boundary.

The signal is a header, so no frozen request-body contract changes are implied. The exact notice copy remains the D3/D4 copy. This decision does not authorize real provider use; API work uses `[MOCK]` providers until the human provider evidence is complete.

### Shared session and draft helper

API-001 and API-002 use one server helper for parent-session resolution/minting, draft metadata creation, token signing, and token verification. This prevents the voice and text-first paths from resetting separate limits. The helper stores only the principal binding, kind, timestamps, payload hash, server-owned counters, revision, and budget metadata. Audio, transcripts, extracted fields, source spans, and `CaseDraft` remain device-local until review and confirmation.

Use the dedicated `DRAFT_SIGNING_KEY`, which is already merged in P3-004 (`12317b5`) and fails closed when absent or invalid. Never fall back to `AUTH_SECRET`. Preserve the previously recorded OD-022-5 decision for direct S-005 submission: API-003 mints an anonymous parent session only when no parent cookie is sent; a present unusable cookie remains E-002/E-019.

### Fresh-draft limit

Enforce a server-owned maximum of **3 active drafts per principal in any rolling 24-hour period**, shared between API-001 and API-002. A principal is the server-resolved parent session or authenticated intake user. Count unexpired metadata drafts created in that window. Concurrent creation attempts must serialize or use an equivalent database-backed atomic guard so they cannot exceed the limit. Refuse before provider dispatch when the limit is reached. This is a conservative operational bound chosen under the user's delegation; the spec pack provides no numeric per-principal draft-creation limit.

### Follow-up rounds and revision replay guard

Extend `intake_drafts` with a server-owned, metadata-only counter:

```sql
follow_up_round smallint NOT NULL DEFAULT 0
  CHECK (follow_up_round BETWEEN 0 AND 4)
```

Atomically increment it exactly when a follow-up question is issued, with a concurrency-safe check against the four-round maximum. It stores no question text or child payload. Apply the change to the schema source and its runtime mirror together.

Keep `revision` and `ai_calls_used` as separate values with separate meanings. The signed token's expected revision is the server-side compare-and-swap/replay guard; `ai_calls_used` counts dispatched paid provider calls only. A paid reservation may advance both once, but do not derive one from the other or increment `ai_calls_used` for a cache hit or question-only state change. A repeated/stale revision must not dispatch. Keep the six-dispatch-per-draft cap and four-follow-up-round cap independent.

This schema extension is authorized as a technical decision under the user's delegation. That explicit delegation supersedes the older P3-005 all-owner sign-off wording for this extension. Before integration it still requires passing database, security, and Fera safeguarding reviews. Do not describe those reviews as all-owner sign-off or attribute them to an absent owner approval.

## Parent status and correction flow

### OQ-B1-2 status labels

Use D3 SCREEN-006's three parent labels for the missing report:

| Stored missing-case state | Parent label |
|---|---|
| `submitted`, `open` | Open |
| `matched_pending_review`, `confirmed` | Being checked |
| `closed` | Closed |

`referred` is the found-report state described by BR-013, not a fourth missing-report badge. Referral wording appears only when the corresponding referral record exists. Never imply delivery, receipt, custody, return, or safe reunification.

### ACT-017 edit behavior

S-006 starts correction at S-003. The parent edits, reviews the complete revised report, and explicitly confirms before the owner-only, versioned API-005 `PATCH`. While offline, edits stay on the device and cannot be submitted. On a successful save, return to S-006 and show D3's “Correction submitted” state. For confirmed or terminal cases, return E-018 with D3's locked copy and recovery path. Do not optimistically report a saved correction.

## Matching, map, import, and evaluation

### R-4 local embedding pin

Use the local q8 quantized `Xenova/multilingual-e5-small` export at model repository revision `761b726dd34fb83930e26aab4e9ac3899aa1fa78`. The candidate implementation and expected file digests are in `origin/phase2--masnun-embeddings:src/server/embeddings/model.ts`; port the pin into the Phase 3 model lane. The four expected SHA-256 values are:

| Local model file | Expected SHA-256 |
|---|---|
| `config.json` | `cb99455288675345e1a4f411438d5d0adbba5fbd3a67ea4fb03c015433b996c1` |
| `tokenizer_config.json` | `a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b` |
| `tokenizer.json` | `0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39` |
| `onnx/model_quantized.onnx` | `f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193` |

At runtime, require the local files and verify their bytes against these digests before loading; disable remote model access. `npm run model:fetch` is the explicit, pinned setup path. The model files have not been materialized and verified in this decision worktree, so their local-byte verification remains required evidence for P3-024. Do not mark the model-pin task done until the lane records that verification. Set the vector-space identity from the model, revision, dtype (`q8`), dimension (384), pooling (mean), normalization (L2), query/passage prefixes and role mapping, and text recipe; any change to these inputs requires re-embedding. The pin establishes reproducibility, not model quality or hosted viability.

### R-5 map

Render district centroid markers in a local SVG and keep the accessible table. Do not add district-outline data without a known compatible licence. Use district centroids only; never store or display exact child coordinates.

### R-6 import ownership

TASK-048's new `src/server/import/` module is assigned to Masnun under the user's cross-owner delegation. Keep import admin-only, synthetic-data-only, schema-limited, and without URL fetching. This records task ownership for the lane and does not claim personal owner approval.

### Thresholds

Matcher and duplicate thresholds are provisional and uncalibrated until the development evaluation records its metrics and denominators. Tune only on the dev split, record the selected thresholds and model/vector space in the freeze evidence, and never tune from held-out results. The embedding spike alone is not acceptance evidence.

## Human and external evidence still required

These facts remain open; delegated agent authority does not supply them:

- Provider keys, accepted provider terms, and verified model/provider prices (TASK-003). No live paid provider dispatch before this evidence and the spend guard are recorded.
- 50 human labels for the synthetic evaluation texts (TASK-011).
- 60 consented audio clips for the WER run (TASK-040).
- Two Android phones for the device check (TASK-036).
- At least five timing-study participants (TASK-041).
- Mentor session 2 findings/fix list (TASK-056): **UNKNOWN**.
- Round 2 submission status, organiser cutoff, channel, required formats, and whether TASK-044–046 remain owed: **UNKNOWN**.
- Production DB/Vercel access and deployment go-ahead (R-3): **UNKNOWN**.
- Human Bangla review for copy explicitly marked as needing it.

Record each item from direct evidence in its owning artifact. Do not mark a human task, release gate, or acceptance criterion complete by inference.

## Source anchors

- `docs/spec/D2_TRD_PartA_V2.md`: API-001/002/003/005, provider notice, draft expiry, paid-dispatch limits, and intake metadata boundary.
- `docs/spec/D3_App_Flow_V2.md`: COMP-050, SCREEN-006, ACT-017, E-018, status labels, parent-session and draft expiry, and the referred state.
- `docs/spec/D5_Background_Schema_V2.md`: BR-005, BR-013, BR-014, BR-023, and BR-025.
- `docs/spec/D2_TRD_PartB_V2.md`: dev-only threshold tuning and held-out freeze rules.
- `docs/execution/PHASE_3_PLAN.md` §3 and §7: current decision ledger and executor policy.
- `docs/execution/handoff/obidit/task-014-blueprint.md`, `task-020-blueprint.md`: route boundaries and draft/spend/replay implementation details; this decision record supersedes only the choices recorded above.
