# RB team-history repair (production implementation defect)

Status: **production fix; not a model change.** Model `weekly-fantasy-projection-v1`, inference policy, frozen spec, alpha, features, scaler, baseline and both context policy layers are untouched.

## Defect
The trained RB residual (`frozenSpec.ts`: ridge alpha 10) uses `teamRushEpaPrior` and `teamOffensivePlaysPrior`, derived by `buildTrainingRow -> teamOpponentFeatures(teamHistory, ...)` from the manifest-verified `epa-team-game` cache. `generate-fantasy-player-week-projection-dataset.ts` (training) always supplied that history. `generate-fantasy-weekly-projections.ts` (production) called `buildProductionProjectionArtifact` without `teamHistory` (optional, default `[]`): harmless in Week 1, a defect from Week 2.

Both features were therefore null for every RB at scoring time. They carry a missing-value indicator column in the fitted scaler (Week-1 training rows), so scoring fired the indicator for every RB: a constant **+1.62** in `teamContextAdjustment` (Week 3: all 119 RBs; corrected mean +0.18). The audit's apparent "RB level bias" (~ +1.4 pts) was this term, not a separate effect, so **no separate level adjustment is added**.

## Fix
* `scripts/lib/fantasy-team-history.ts` maps `epa-team-game` rows with the same fields and canonical team normalization as the training script; `priorSeasonTeamHistory` keeps only `season == target && week < target` and **fails closed for week > 1 when the season has no rows** (a silent empty history is the defect).
* The generator loads the verified cache (Week 1: none needed), passes it to the unchanged `buildProductionProjectionArtifact`, records the source hash in artifact provenance, and warns if the cache lags the previous week (uses the latest completed cached week).
* Workflow: a best-effort `refresh-nfl-epa-source-cache.mjs` step before generation; a failed refresh falls back to the committed cache.
* Training and inference now derive identical RB features from the same rows through the same function (`teamHistory.test.ts`), and target/later weeks cannot contribute.

## Evidence
* A locally regenerated deployment bundle reproduced the shipped Week 3 usage/team/other components exactly (max diff 0.0).
* Walk-forward 2024-2025, played pool: RB MAE 6.03 -> 5.73 (paired -0.30, 95% CI -0.36..-0.24), bias +1.41 -> +0.21, Spearman +0.006 (CI +0.0005..+0.011), consistent in both seasons. 2026 Week 2 (n=44): MAE 5.16 -> 4.48.
* Week 3: RB mean -1.64 pts; 100 of 120 RBs move >= 1 pt, 55 move >= 3 ranks. QB/WR/TE content is identical (only the shared artifact provenance list gains the epa-team-game entry); Week 1 output is byte-identical to the previous generator.

## Not repaired here
Training history counts rostered-but-inactive weeks as 0-point games while production history excludes them; the ridge target is `actual - shrinkageBaseline` but is added to the PAR baseline; `schedule` (home/away, rest) is not supplied (not a ridge feature).
