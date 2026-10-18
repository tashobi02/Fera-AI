# Phase 4–5 completion on pre-main

User scope: finish Phase 4 and Phase 5 across all three owners, excluding video and PPT file submission. Primary implementation/debugging/testing uses isolated Puku CLI Opus 4.8 lanes. Main remains unchanged while this work is staged and verified.

Initial baseline: main 8499bce; 162 local/remote references, 121 distinct tips, 30 tips outside main history, plus two uncommitted spec drafts. The inventory is in evidence/pre-main-branch-inventory.json. Every original ref receives a disposition: exact ancestor, independently superseded, useful change to recover, or unsafe/unresolved. No old implementation is blindly restored. Useful code/spec changes must be recovered and reviewed before any superseded history is incorporated.

| Lane | Ownership | Acceptance |
|---|---|---|
| Branch audit | Branch/worktree reconciliation evidence | Every original reference and dirty draft accounted for; useful missing changes explicit |
| Platform/intake convergence | specs 001/002/003 | Required artifacts recovered/generated and code gaps traced without invented completion |
| Data/desk convergence | specs 004/005/006/007 | Same, preserving frozen contracts and held-out separation |
| Offline stack | Guarded local packaging CLI and tests | Dedicated loopback database; one DB for every role; restart/local asset readiness |
| Browser/offline journeys | Real browser regression and offline rehearsal harness | Required UI/API state transitions, network denial, persisted restart, honest automated-run labels |
| Phase 4 release | Release checks, links, metrics, unsent reply and Q&A/backup plan | Local deliverables validated; missing external access reported rather than passed |

Coordinator owns integration, package/CI wiring, tracker/gate updates, final reviews and testing directly on pre-main. One writer per lane. Workers do not commit, push, merge or mutate external services.

Final validation includes production build, strict typecheck, lint, unit and PostgreSQL/pgvector suites, full mobile/desktop browser suite, offline same-DB scenario, destructive-operation guards, log/role/privacy checks, release-file/hash checks, manifest/spec consistency, dependency/security scan and routed review. Test fixtures, model-cache use and automated repetitions must be labelled; they do not establish human studies or physical-device compatibility.

External facts remain as last confirmed until new evidence arrives: organiser cutoff/channel/recipient UNKNOWN; Drive access absent; repository private; human labels/audio/device/timing/provider evidence unavailable. Media submission is excluded by this request. No email, upload, public-visibility change, production acceptance, human rehearsal or freeze is inferred from a software test. Latest user steering supersedes the earlier automatic merge gate: finish and test pre-main, then hold for the user to verify and approve before merging main. Keep external release requirements pending; no formal human/submission gate is inferred. Refresh branch references at each integration checkpoint and before handoff to recover necessary newly created work.
