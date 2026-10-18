# Open owner PR reconciliation — 18 October 2026

The consolidated `phase3--phase4-handoff` integration includes the technical work across all three owners. The older PR branches are retained; this audit does not rewrite their history.

| Older PR | Relationship to integration | Disposition after integration merges |
|---|---|---|
| #32, #35, #36, #37, #40, #41, #42 | Exact branch tips are integration ancestors | Included; reconcile GitHub status after the integration reaches phase2 |
| #33 | Remaining locale-removal commit 5bfdaf6 is already reflected by the locale split; merge-only history is behind the current tree | Superseded; retain branch |
| #34 | Synthetic generator/fix/test commits are ancestors; remaining difference is merge topology from #33 | Superseded; retain branch |
| #43 | Current eval/manifest-lib.mjs, build-manifest.mjs, manifest and held-out guard supersede the earlier implementation. Current manifest is a different, explicitly unfrozen revision. | Superseded; retain branch; do not restore the old manifest |
| #44 | Current pinned/hash-verified offline embeddings, model fetch/preflight and reembed service/tests supersede this stack | Superseded; retain branch |
| #45 | Current same-kind detector/persistence/decision services and eval/dedupe.mjs supersede this stack | Superseded; retain branch. D4's duplicate-visibility copy is reconciled separately below. |

A separate read-only Puku Opus 4.8 session compared unique commits, diffs and current paths (`/tmp/fera-phase4-pr-reconcile.json`). The coordinator checked exact ancestry and verified D4's explicit duplicate cue: “সম্ভাব্য একই শিশু · আলাদা প্রতিবেদন দৃশ্যমান” / “Possible duplicate · separate reports remain visible”. The isolated `phase4--duplicate-copy` lane restores the visibility sentence to the current locale area and queue introduction; the old unused locale key is not a reason to restore the obsolete service implementation.

No old PR is counted as a release-gate approval. Human owner approval, frozen evaluation, production acceptance and submission receipt remain separate unmet evidence. Closing a superseded PR does not delete its branch or change the reviewed software tree.
