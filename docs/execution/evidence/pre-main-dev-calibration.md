# Dev-only duplicate calibration — technical proposal

The user's authorisation covers implementation for all owners. This is agent-authored work awaiting the user's pre-main review, not personal approval from any named owner.

The reproducible grid consumes the committed baseline fixture, the unchanged manifest and dev profiles, and the production agreement helpers and canonical scorer. It only raises floors above the baseline 0.5/2, and **0.95 is the top edge of the swept similarity grid (0.50–0.95): nothing above 0.95 was searched**, so a higher floor might score differently and is untested. Selection maximises dev pairwise F1, then recall, precision and lower floors. Grid scores are rounded to 2 dp (`round(raw*100)/100`), so the 0.95 cell admits raw similarity ≥ 0.945 while production refuses raw `< 0.95`.

All figures below are **dev split, 12 positive pairs, in-sample**: the same 12 positives chose the cell and score it. No requirement mandates zero false negatives for duplicate flags; BR-021 retains all reports and human decisions.

| Metric (dev, 12 positives, in-sample) | Baseline 0.5/2 | Alternative 0.92/3 | Selected 0.95/3 |
|---|---:|---:|---:|
| True positives / 12 true pairs | 12 | 12 | 10 |
| False positives | 290 | 9 | 1 |
| False negatives | 0 | 0 | 2 |
| Precision | 3.97% (12/302) | 57.14% (12/21) | 90.91% (10/11) |
| Recall | 100% (12/12) | 100% (12/12) | 83.33% (10/12) |
| Pairwise F1 | 7.64% | 72.73% | 86.96% |

Why 0.95/3 over 0.92/3: it trades 2 of 12 recall (two missed dev duplicate pairs) for 8 fewer false flags (9 → 1), which gives the highest dev F1 in the grid. With only 12 positives, the 2-pair recall loss and the F1 gap are both small-sample estimates. 0.92/3 is the full-recall alternative if the team prefers not to miss dev duplicates.

These are DEV results (86 records / 30 connected groups / 12 positive pairs, in-sample), not a generalisation claim. Two of twelve true duplicate pairs are missed. Reports remain searchable; no report is suppressed. The earlier 0.92/3 trial (12 TP, 9 FP, 0 FN, F1 72.73%) was selected under a perfect-recall constraint that no requirement supports, and was superseded by the F1 selection.

The baseline fixture metadata records source provenance and hashes. Tests reproduce baseline counts and selection with no /tmp prerequisites or skips. Fresh production E5 dev prediction (raw similarities) and canonical scoring at source ac44bdb, dev split, 12 positives, in-sample: TP=10, FP=1, FN=2, F1=86.96%, shared-phone distinct-child negatives rejected 25/25. The grid reconstructs rounded scores and is approximate near thresholds; these fresh raw-similarity runtime results are the deciding evidence. See eval/reports/pre-main-dev-2026-10-18.md. Historical diagnostic evidence remains unchanged; its suggestion that software approval requires setting FREEZE_FLAG is superseded by the user's software/offline gate decision. FREEZE_FLAG remains NOT SET. No held-out prediction, tuning, label change, human label review or release approval is claimed.
