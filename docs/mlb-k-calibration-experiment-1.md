# MLB Projected-K calibration — Experiment 1: shrink pitcher skill dispersion

Analysis-only calibration experiment on the merged 2023–2025 Projected-K
backtest ([mlb-k-backtest-v1.md](mlb-k-backtest-v1.md)). **No production model
was changed.** `src/lib/mlb/kProjectionV2.ts` is untouched.

## Hypothesis

The V2 backtest under-projects low-K starts and over-projects high-K starts
(calibration slope ≈ 0.64). The pitcher season-skill residual coefficient is
strongly negative — the pitcher skill term is too dispersed. Shrinking it
toward the contemporaneous league K rate should tighten calibration.

## The one controlled change

```
pitcherSkillAdjusted = leagueKRate + alpha * (pitcherSkillRate - leagueKRate)
projectedKRate       = clamp(pitcherSkillAdjusted + matchupAdjustment, 0.1, 0.4)   // unchanged
projectedStrikeouts  = projectedKRate * projectedBattersFaced                      // unchanged
```

`alpha = 1.0` is the current production behaviour. `matchupAdjustment` does not
depend on `pitcherSkillRate` (only a null guard), so it is reused verbatim from
the persisted V2 decomposition. Recent-vs-season weights, opponent-adjustment
weights/clamps, workload, and the V2→legacy fallback are **not** touched.

## Method

| Split | Seasons | Role |
| --- | --- | --- |
| development | 2023 + 2024 (n=9,361) | tuning + alpha selection |
| holdout | 2025 (n=4,682) | scored once, never fed back |
| full | 2023–2025 (n=14,043) | descriptive only |

- View: V2-only, all confidences (the model under calibration). Row is
  scoreable when the stored V2 projection and the actual K are both finite.
- Grid: alpha ∈ {1.00, 0.90, 0.80, 0.70, 0.65, 0.60, 0.55, 0.50, 0.45, 0.40}.
- Pitcher-type terciles (for high-K / low-K discrimination checks) are fixed
  from the **development** set only: season-K-rate edges 0.1954 / 0.2442.
- Baseline-fidelity gate: recomputing every row at `alpha = 1.0` reproduces the
  stored production V2 projection to **max |Δ| 0.0014 K, mean |Δ| 0.0005 K**
  (0 rows over a 0.05 K tolerance). The reconstruction is faithful.

## Files

| File | Purpose |
| --- | --- |
| `scripts/lib/mlb-k-shrinkage-experiment.mjs` | pure `shrinkRow(row, alpha)` transform + alpha grid |
| `scripts/lib/mlb-k-shrinkage-experiment.test.mjs` | 8 `node --test` unit tests |
| `scripts/analyze-mlb-k-shrinkage-experiment.mjs` | runner → `<dir>/shrinkage-experiment/{experiment.json,report.md}` |

Reproduce:

```
node scripts/analyze-mlb-k-shrinkage-experiment.mjs --dir=data/mlb/k-history/backtest/2023-2025
```

Output lands under the gitignored `data/mlb/k-history/backtest/` tree.

## Candidate results

### A. Development (2023–2024)

| alpha | MAE | RMSE | corr | bias | medAE | calib slope | calib int | proj SD |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1.00 | 1.8899 | 2.3733 | 0.3739 | −0.037 | 1.5791 | 0.655 | 1.666 | 1.429 |
| 0.90 | 1.8737 | 2.3499 | 0.3776 | −0.041 | 1.5746 | 0.710 | 1.393 | 1.331 |
| 0.80 | 1.8609 | 2.3311 | 0.3813 | −0.045 | 1.5613 | 0.774 | 1.076 | 1.234 |
| 0.70 | 1.8523 | 2.3180 | 0.3844 | −0.049 | 1.5551 | 0.844 | 0.723 | 1.140 |
| 0.65 | 1.8497 | 2.3137 | 0.3855 | −0.051 | 1.5545 | 0.882 | 0.535 | 1.094 |
| 0.60 | 1.8484 | 2.3109 | 0.3862 | −0.053 | 1.5541 | 0.920 | 0.342 | 1.050 |
| **0.55** | **1.8482** | **2.3096** | **0.3864** | −0.055 | 1.5557 | 0.960 | 0.146 | 1.008 |
| 0.50 | 1.8492 | 2.3098 | 0.3858 | −0.057 | — | 0.998 | −0.04 | 0.967 |
| 0.45 | 1.8516 | 2.3116 | 0.3844 | −0.059 | — | 1.036 | — | 0.929 |
| 0.40 | 1.8550 | 2.3148 | 0.3820 | −0.061 | — | 1.071 | — | 0.892 |

Dev error is minimised at **alpha ≈ 0.55** for both MAE and RMSE, with a flat
basin over 0.50–0.60. Correlation peaks in the same basin (it *rises* from
0.374 → 0.386). Calibration slope crosses 1.0 near alpha 0.50.

### B. Holdout (2025) — untouched

| alpha | MAE | RMSE | corr | bias | calib slope | proj SD |
| --- | --- | --- | --- | --- | --- | --- |
| 1.00 | 1.8752 | 2.3667 | 0.3467 | −0.027 | 0.614 | 1.388 |
| 0.65 | 1.8322 | 2.3055 | 0.3527 | −0.033 | 0.843 | 1.028 |
| 0.60 | 1.8308 | 2.3029 | 0.3525 | −0.034 | 0.884 | 0.980 |
| **0.55** | **1.8307** | **2.3018** | 0.3518 | −0.034 | 0.926 | 0.934 |
| 0.50 | 1.8321 | 2.3023 | 0.3503 | −0.035 | 0.969 | 0.889 |
| 0.40 | 1.8384 | 2.3080 | 0.3443 | −0.037 | 1.050 | 0.806 |

The holdout curve tracks development almost exactly — same 0.55 minimum, same
flat basin, same monotone calibration-slope trend. No sign of dev overfitting.

### C. Full 2023–2025 (descriptive)

alpha 0.55: MAE 1.8424, RMSE 2.3070, corr 0.3756, bias −0.048, calib slope
0.949 — vs baseline MAE 1.8850, RMSE 2.3711, corr 0.3653, slope 0.642.

## Selected alpha (development data only)

Rule: minimum development RMSE among alphas that keep dev correlation ≥
baseline − 0.01 and dev projection SD ≥ 60% of baseline. **All grid alphas pass
the discrimination guard** (correlation never drops below baseline). The rule
selects **alpha = 0.55**.

**Decision: alpha = 0.55 is locked.** It is the minimum-development-RMSE point
under the predefined 2023–2024 selection rule, and the untouched 2025 holdout
independently landed on the same error basin (same minimum, same monotone
calibration-slope trend). No further alpha grid will be run against 2025 — doing
so would contaminate the holdout. 0.60 was considered as a more conservative
in-basin alternative but is not adopted; the flat basin makes the ~0.001 K RMSE
difference immaterial and 0.55 is what the rule produced.

## Baseline vs candidate (alpha = 0.55)

| metric | dev base | dev 0.55 | Δ | holdout base | holdout 0.55 | Δ |
| --- | --- | --- | --- | --- | --- | --- |
| MAE | 1.8899 | 1.8482 | −0.042 | 1.8752 | 1.8307 | −0.045 |
| RMSE | 2.3733 | 2.3096 | −0.064 | 2.3667 | 2.3018 | −0.065 |
| correlation | 0.3739 | 0.3864 | +0.013 | 0.3467 | 0.3518 | +0.005 |
| bias | −0.037 | −0.055 | −0.018 | −0.027 | −0.034 | −0.007 |
| calib slope | 0.655 | 0.960 | +0.304 | 0.614 | 0.926 | +0.312 |
| proj SD | 1.429 | 1.008 | −0.421 | 1.388 | 0.934 | −0.454 |

## Segmented effects (holdout, alpha 0.55 vs baseline)

**Projection-bucket bias** (fixed baseline terciles — the headline calibration defect):

| bucket | baseline bias | alpha 0.55 bias |
| --- | --- | --- |
| low | **+0.529** | +0.013 |
| mid | −0.029 | −0.104 |
| high | **−0.581** | −0.012 |

The low-under / high-over split is essentially eliminated on unseen data.

**High-K vs low-K pitchers** (discrimination — is it just collapsing to the mean?):

| group | baseline bias / corr | alpha 0.55 bias / corr |
| --- | --- | --- |
| high-K pitchers | −0.637 / 0.306 | −0.015 / 0.324 |
| low-K pitchers | +0.453 / 0.189 | −0.079 / 0.203 |

Both groups' biases go to ~0 and within-group correlation *improves*. The
model still separates a 5.6-K projection for high-K arms from 4.2-K for low-K
arms (means 5.65 vs 4.17); projected-K range stays 0.7–8.4 and SD 0.93. This
is calibration tightening, not mean-collapse.

**Season phase** (holdout): early MAE 2.011→1.907, late 1.854→1.830, mid
1.812→1.789 — improvement in every phase, largest early-season.

**Data-quality tier** (holdout): A 1.799→1.802 (flat), B 1.972→1.877, C
2.073→1.826 — gains concentrated in the thinner-sample tiers, as expected when
regularising a noisy skill estimate.

## Verdict

7. **Recommendation: ADOPT shrinkage at alpha = 0.55 (locked).** Improvement is
   consistent dev↔holdout, monotone in the right direction across the whole
   grid, and driven by genuine calibration repair (slope 0.61 → ~0.93, bucket
   and pitcher-type biases collapse) without loss of discrimination
   (correlation and projected-K spread both hold up). alpha = 0.55 is the
   minimum-development-RMSE point under the predefined rule; the 2025 holdout
   confirmed the basin. No further grid will be run against 2025.

6. Shrinkage materially improves calibration without destroying discrimination:
   **yes.**

## Production implementation (V2.1)

Applied in `src/lib/mlb/kProjectionV2.ts`:

```
// before
projectedKRate = clamp(pitcherSkillRate + matchupAdjustment, 0.10, 0.40)

// after (V2.1)
pitcherSkillRateShrunk = leagueKRate + 0.55 * (pitcherSkillRate - leagueKRate)
projectedKRate         = clamp(pitcherSkillRateShrunk + matchupAdjustment, 0.10, 0.40)
```

- `PITCHER_SKILL_SHRINKAGE_ALPHA = 0.55` (module constant).
- `pitcherSkillRate` (raw blend) is unchanged and still returned; a new
  `pitcherSkillRateShrunk` field is added to `KProjectionResult` for audit.
- `matchupAdjustment` still receives the raw `pitcherSkillRate` (its only use of
  that argument is a null guard), so the matchup term and its clamp are
  byte-for-byte unchanged.
- Nothing else touched: season/recent blend, recent-form regression, opponent
  environment weights, matchup clamp, workload, home/away, lineup, whiff,
  confidence rules, V2→legacy fallback, production resolver.

### Production-path backtest replay (updated V2 code, full rebuild)

| view | metric | baseline (V2) | V2.1 (alpha 0.55) | Δ |
| --- | --- | --- | --- | --- |
| V2-only full 2023–2025 | MAE | 1.8850 | 1.8424 | −0.0426 |
| | RMSE | 2.3711 | 2.3070 | −0.0641 |
| | correlation | 0.3653 | 0.3756 | +0.0103 |
| | bias | −0.0339 | −0.0482 | −0.0143 |
| | calibration slope | 0.642 | 0.949 | +0.307 |
| | projection SD | 1.415 | 0.985 | −0.430 |
| V2-only 2025 holdout | MAE | 1.8752 | 1.8307 | −0.0445 |
| | RMSE | 2.3667 | 2.3018 | −0.0649 |
| | calibration slope | 0.614 | 0.926 | +0.312 |
| production-resolved full | MAE | 1.8854 | 1.8422 | −0.0432 |
| | RMSE | 2.3717 | 2.3069 | −0.0648 |
| | calibration slope | 0.638 | 0.933 | +0.295 |

The production replay reproduces the analysis-only experiment transform to
**±0.0000 on MAE / RMSE / correlation** at every split — expected, since the
shrink is exactly linear and the experiment's alpha=1.0 reconstruction was
faithful to 0.0014 K. No disagreement to investigate.

Segmented (V2-only, full): the low-projection bucket bias goes +0.474 → −0.039,
high bucket −0.573 → −0.030; high-K pitchers −0.60 → −0.02, low-K +0.48 → −0.07.
Every season phase and data-quality tier improves on MAE/RMSE. Discrimination
holds: correlation up, projected-K spread still substantial (SD 0.98, and
high-K vs low-K projection means stay clearly separated).
