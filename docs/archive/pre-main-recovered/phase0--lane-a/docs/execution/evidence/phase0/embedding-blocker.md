# TASK-004 — blocked before spike execution

Owner: Masnun. OQ-023 remains open.

TASK-001 requires CI green on main and a preview URL; these are UNKNOWN. Under the requested dependency order, no embedding spike script or model download was started.

Candidate model is multilingual-e5-small, 384 dimensions, from AGENTS.md and docs/spec/D2_TRD_PartA_V2.md §1/§2.3. Artifact repository, revision, dtype, download size, model size, cold start, function limits and local-versus-API recommendation are UNKNOWN / not measured. No model name was inferred beyond that source-backed candidate.

Next: complete TASK-001, inspect artifact metadata without downloading weights, state the exact download size and request permission, then measure cold start and loaded size on the target environment. Only then record an evidence-backed recommendation and OQ-023 decision. No local/API choice is made here.
