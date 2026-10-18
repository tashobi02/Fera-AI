# Dev-only duplicate calibration — technical proposal

The user's authorisation covers implementation for all owners. This is agent-authored work awaiting the user's pre-main review, not personal approval from any named owner.

The reproducible grid consumes the committed baseline fixture, the unchanged manifest and dev profiles, and the production agreement helpers and canonical scorer. It only raises floors above the baseline 0.5/2. Selection maximises dev pairwise F1, then recall, precision and lower floors. No requirement mandates zero false negatives for duplicate flags; BR-021 retains all reports and human decisions.

| Metric | Baseline 0.5/2 | Selected 0.95/3 |
|---|---:|---:|
| True positives / 12 true pairs | 12 | 10 |
| False positives | 290 | 1 |
| False negatives | 0 | 2 |
| Precision | 3.97% | 90.91% |
| Recall | 100% | 83.33% |
| Pairwise F1 | 7.64% | 86.96% |

These are DEV results for 86 records / 30 connected groups, not a generalisation claim. Two of twelve true duplicate pairs are missed. Reports remain searchable; no report is suppressed. The earlier 0.92/3 trial achieved 12 TP, 9 FP, 0 FN and F1 72.73%; it imposed an unsupported perfect-recall constraint and was superseded.

The baseline fixture metadata records source provenance and hashes. Tests reproduce baseline counts and selection with no /tmp prerequisites or skips. Fresh production E5 dev prediction and canonical scoring passed at source ac44bdb: TP=10, FP=1, FN=2, F1=86.96%, shared-phone distinct-child negatives rejected 25/25. The grid reconstructs rounded scores and is approximate near thresholds; these fresh raw-similarity runtime results are the deciding evidence. See eval/reports/pre-main-dev-2026-10-18.md. Historical diagnostic evidence remains unchanged; its suggestion that software approval requires setting FREEZE_FLAG is superseded by the user's software/offline gate decision. FREEZE_FLAG remains NOT SET. No held-out prediction, tuning, label change, human label review or release approval is claimed.
