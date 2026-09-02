# MLB Projected-K calibration — Experiment 2: opponent-environment influence

Analysis-only calibration experiment layered on **V2.1** (pitcher-skill
shrinkage alpha 0.55, `docs/mlb-k-calibration-experiment-1.md`). **No production
model was changed.** `src/lib/mlb/kProjectionV2.ts` is untouched.

## Hypothesis

After V2.1, the opponent-environment matchup term is still compressed:
low-K offenses carry ≈ −0.23 K residual bias (model over-projects), high-K
offenses ≈ +0.12 K (model under-projects). The current effect is
`(opponentEnvironmentRate − leagueKRate) * 0.45` clamped to ±0.035, and only
0.5% of rows reach the clamp — so either the multiplier is too low, the clamp
is too tight, or both.

## The controlled change

```
// V2.1
matchupAdjustment = clamp((opponentEnvironmentRate - leagueKRate) * 0.45, -0.035, +0.035)

// experiment
matchupAdjustment = clamp((opponentEnvironmentRate - leagueKRate) * mult, -clampAbs, +clampAbs)
projectedKRate    = clamp(pitcherSkillRateShrunk + matchupAdjustment, 0.10, 0.40)   // shrunk skill reused verbatim
```

Nothing else touched: pitcher-skill shrinkage, season/recent weights, recent
regression, workload, home/away, lineup, whiff, confidence rules, V2→legacy
fallback, production resolver.

## Method

| Split | Seasons | Role |
| --- | --- | --- |
| development | 2023 + 2024 (n=9,361) | tuning + selection |
| holdout | 2025 (n=4,682) | scored once, never fed back |
| full | 2023–2025 (n=14,043) | descriptive only |

- Dataset: `data/mlb/k-history/backtest/2023-2025-v2_1-alpha055` — rebuilt from
  the frozen StatsAPI corpus with the **V2.1 production code**, so the pitcher
  term already carries the shrinkage and the persisted decomposition exposes
  `pitcherSkillRateShrunk` + `opponentEnvironmentRate`.
- Grid (compact, two isolated arms + short diagonal):
  - multiplier arm: 0.55, 0.65, 0.75, 0.85, 1.00 at clamp 0.035
  - clamp arm: ±0.045, ±0.055, ±0.065, ±0.075 at multiplier 0.45
  - joint diagonal: 0.65/0.055, 0.75/0.065, 0.85/0.075
  - baseline 0.45 / 0.035 included once.
- Opponent-K terciles fixed from **development** season-K-rate: edges 0.2148 / 0.2369.
- Baseline reproduction (0.45 / 0.035 vs stored V2.1): max |Δ| **0.0022 K**, mean 0.0006 K, 0 rows over tolerance.

Reproduce:

```
node scripts/analyze-mlb-k-opponent-experiment.mjs --dir=data/mlb/k-history/backtest/2023-2025-v2_1-alpha055
```

## Files

| File | Purpose |
| --- | --- |
| `scripts/lib/mlb-k-opponent-experiment.mjs` | pure `reprojectRow(row, mult, clampAbs)` + grid |
| `scripts/lib/mlb-k-opponent-experiment.test.mjs` | 9 `node --test` unit tests |
| `scripts/analyze-mlb-k-opponent-experiment.mjs` | runner → `<dir>/opponent-experiment/{experiment.json,report.md}` |

## Candidate results (V2 view)

### A. Development (2023–2024)

| mult / clamp | MAE | RMSE | corr | bias | calib slope | proj SD | oppK low bias | oppK mid | oppK high | clamp hit % | mean \|adj\| |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **0.45 / 0.035** (V2.1) | 1.8483 | 2.3096 | 0.3863 | −0.055 | 0.959 | 1.008 | **−0.257** | −0.040 | **+0.115** | 0.5 | 0.0087 |
| 0.55 / 0.035 | 1.8449 | 2.3060 | 0.3898 | −0.055 | 0.957 | 1.019 | −0.201 | −0.040 | +0.060 | 0.9 | 0.0106 |
| 0.65 / 0.035 | 1.8424 | 2.3034 | 0.3923 | −0.055 | 0.951 | 1.032 | −0.147 | −0.041 | +0.008 | 2.6 | 0.0124 |
| **0.75 / 0.035** | **1.8407** | **2.3020** | **0.3939** | −0.054 | 0.943 | 1.045 | −0.096 | −0.041 | −0.041 | 4.9 | 0.0142 |
| 0.85 / 0.035 | 1.8397 | 2.3013 | 0.3948 | −0.054 | 0.934 | 1.058 | −0.050 | −0.041 | −0.084 | 8.9 | 0.0157 |
| 1.00 / 0.035 | 1.8395 | 2.3017 | 0.3949 | −0.054 | 0.919 | 1.075 | +0.007 | −0.042 | −0.141 | 14.7 | 0.0178 |
| 0.45 / 0.045 | 1.8483 | 2.3099 | 0.3861 | −0.055 | 0.958 | 1.009 | −0.256 | −0.040 | +0.113 | 0.3 | 0.0088 |
| 0.45 / 0.055 | 1.8484 | 2.3101 | 0.3859 | −0.056 | 0.958 | 1.009 | −0.256 | −0.040 | +0.112 | 0.1 | 0.0088 |
| 0.45 / 0.065 | 1.8484 | 2.3101 | 0.3859 | −0.056 | 0.957 | 1.009 | −0.256 | −0.040 | +0.112 | 0.1 | 0.0088 |
| 0.45 / 0.075 | 1.8485 | 2.3102 | 0.3858 | −0.056 | 0.957 | 1.009 | −0.256 | −0.040 | +0.111 | 0.0 | 0.0088 |
| 0.65 / 0.055 | 1.8433 | 2.3046 | 0.3914 | −0.055 | 0.946 | 1.036 | −0.142 | −0.041 | +0.001 | 0.4 | 0.0126 |
| 0.75 / 0.065 | 1.8423 | 2.3039 | 0.3924 | −0.056 | 0.933 | 1.053 | −0.085 | −0.041 | −0.056 | 0.4 | 0.0146 |
| 0.85 / 0.075 | 1.8422 | 2.3046 | 0.3925 | −0.056 | 0.915 | 1.073 | −0.028 | −0.041 | −0.113 | 0.4 | 0.0165 |

The **clamp arm is inert**: sweeping ±0.045 → ±0.075 at the current 0.45
multiplier moves MAE/RMSE/bias by ≤ 0.0002 and barely touches the opponent
buckets. The **multiplier arm** monotonically improves error, correlation and
opponent-bucket calibration up to ~0.75–0.85. At the higher multipliers the
tight 0.035 clamp becomes slightly *helpful* (0.75/0.035 MAE 1.8407 <
0.75/0.065 MAE 1.8423) — it caps the noisiest ~5% of extreme matchups.

### B. Holdout (2025) — untouched

| mult / clamp | MAE | RMSE | corr | bias | calib slope | oppK low | oppK mid | oppK high |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0.45 / 0.035 (V2.1) | 1.8307 | 2.3018 | 0.3518 | −0.034 | 0.926 | −0.192 | +0.038 | +0.142 |
| 0.65 / 0.035 | 1.8279 | 2.2972 | 0.3569 | −0.033 | 0.921 | −0.103 | +0.010 | +0.012 |
| **0.75 / 0.035** | **1.8273** | **2.2961** | **0.3583** | −0.032 | 0.914 | −0.060 | −0.004 | −0.042 |
| 0.85 / 0.035 | 1.8271 | 2.2959 | 0.3589 | −0.030 | 0.907 | −0.022 | −0.018 | −0.082 |
| 1.00 / 0.035 | 1.8284 | 2.2975 | 0.3578 | −0.028 | 0.892 | +0.028 | −0.039 | −0.127 |

Holdout tracks development: same monotone error/correlation trend, same
opponent-bucket flattening, minimum RMSE around 0.75–0.85.

### C. Full 2023–2025 (descriptive)

0.75 / 0.035: MAE 1.8362, RMSE 2.3000, corr 0.3828, bias −0.047, slope 0.934;
opponent-K buckets −0.083 / −0.026 / −0.041 (from −0.233 / −0.008 / +0.120).

## Selection (development data only)

Rule: simplest (min multiplier, then clamp) with dev MAE and RMSE each improved
≥ 0.004 vs V2.1, **both** outer opponent-K bucket |bias| ≤ 0.10, dev
correlation not down > 0.002, dev calibration slope in [0.92, 1.03].

- Survivors: **0.75/0.035**, 0.85/0.035, 0.75/0.065.
- **Selected: multiplier 0.75, clamp ±0.035** (simplest — lowest multiplier that
  clears the bar, clamp unchanged).

## Baseline V2.1 vs selected (0.75 / ±0.035)

| metric | dev V2.1 | dev sel | Δ | holdout V2.1 | holdout sel | Δ |
| --- | --- | --- | --- | --- | --- | --- |
| MAE | 1.8483 | 1.8407 | −0.0076 | 1.8307 | 1.8273 | −0.0034 |
| RMSE | 2.3096 | 2.3020 | −0.0076 | 2.3018 | 2.2961 | −0.0057 |
| correlation | 0.3863 | 0.3939 | +0.0076 | 0.3518 | 0.3583 | +0.0065 |
| bias | −0.0551 | −0.0540 | +0.0011 | −0.0343 | −0.0318 | +0.0025 |
| calibration slope | 0.959 | 0.943 | −0.016 | 0.926 | 0.914 | −0.012 |
| projection SD | 1.008 | 1.045 | +0.037 | 0.934 | 0.963 | +0.030 |

Correlation **rises** while error falls — the extra opponent influence is
signal, not variance. Calibration slope eases ~0.015 (0.96 → 0.94), still well
inside the healthy band and not overshooting 1.0.

## Opponent-bucket bias before / after

| opponent-K bucket | dev V2.1 | dev sel | holdout V2.1 | holdout sel | full V2.1 | full sel |
| --- | --- | --- | --- | --- | --- | --- |
| low-K offense | −0.257 | −0.096 | −0.192 | −0.060 | −0.233 | −0.083 |
| mid-K offense | −0.040 | −0.041 | +0.038 | −0.004 | −0.008 | −0.026 |
| high-K offense | +0.115 | −0.041 | +0.142 | −0.042 | +0.120 | −0.041 |

Both outer biases shrink by ~60–70% and land within ±0.10 on the untouched
holdout. Projection-bucket bias stays small (dev low −0.05 → −0.01, high −0.02 →
−0.05).

## Clamp-hit rate before / after

| | rows with matchup | clamp-hit % | mean \|matchupAdjustment\| |
| --- | --- | --- | --- |
| dev V2.1 (0.45 / 0.035) | 9,275 | 0.48% | 0.0087 |
| dev selected (0.75 / 0.035) | 9,275 | 4.92% | 0.0142 |
| holdout V2.1 | 4,596 | 0.58% | 0.0076 |
| holdout selected | 4,596 | 5.11% | 0.0123 |

## Which knob is it?

**Primarily the multiplier.** Raising the clamp alone (multiplier held at 0.45)
does essentially nothing — the baseline clamp only bound 0.5% of rows, so
loosening it changes almost no projections. The full opponent-calibration gain
comes from multiplier 0.45 → 0.75. The clamp's only useful role is at the higher
multiplier, where keeping it *tight* at ±0.035 (now binding ~5% of rows)
slightly beats loosening it — so the recommendation raises the multiplier and
**leaves the clamp unchanged**.

## Recommendation

**ADOPT multiplier 0.75, clamp ±0.035 (unchanged), as V2.2** — or run a narrow
confirmation grid {0.65, 0.70, 0.75, 0.80} first if a tighter point estimate is
wanted. The gain is modest on aggregate error (full MAE −0.006, RMSE −0.007) but
consistent dev↔holdout, correlation-positive, and it repairs the opponent-K
calibration defect (outer biases −60–70%, both within ±0.10 out-of-sample)
without disturbing V2.1's overall calibration. Rejecting is also defensible if
the bar is "material aggregate error improvement only" — but the opponent-bucket
repair plus rising correlation argues for adoption.

## Production implementation (V2.2)

Applied in `src/lib/mlb/kProjectionV2.ts` — one change:

```
// V2.1
return clamp((opponentEnvironmentRate - leagueKRate) * 0.45, -0.035, +0.035)

// V2.2
return clamp((opponentEnvironmentRate - leagueKRate) * OPPONENT_MATCHUP_MULTIPLIER, -0.035, +0.035)
// OPPONENT_MATCHUP_MULTIPLIER = 0.75
```

`MAX_MATCHUP_ADJUSTMENT` (±0.035) unchanged. V2.1 pitcher-skill shrinkage
(`PITCHER_SKILL_SHRINKAGE_ALPHA = 0.55`) unchanged. Nothing else touched:
pitcher weights, recent-form regression, workload, home/away, lineup, whiff,
confidence rules, V2→legacy fallback, production resolver.

### Production-path backtest replay (updated V2.2 code, full rebuild)

| view | metric | V2.1 baseline | V2.2 (0.75 / ±0.035) | Δ |
| --- | --- | --- | --- | --- |
| V2-only full 2023–2025 | MAE | 1.8424 | 1.8362 | −0.0062 |
| | RMSE | 2.3070 | 2.3000 | −0.0070 |
| | correlation | 0.3756 | 0.3828 | +0.0072 |
| | bias | −0.0482 | −0.0466 | +0.0016 |
| | calibration slope | 0.949 | 0.934 | −0.015 |
| | projection SD | 0.985 | 1.020 | +0.035 |
| V2-only 2025 holdout | MAE | 1.8307 | 1.8273 | −0.0034 |
| | RMSE | 2.3018 | 2.2961 | −0.0057 |
| | calibration slope | 0.926 | 0.914 | −0.012 |
| production-resolved full | MAE | 1.8422 | 1.8366 | −0.0056 |
| | RMSE | 2.3069 | 2.3004 | −0.0065 |

Routing counters unchanged (v2ProductionEligible 13906, sourceLegacy 52).

### Replay vs analysis-only experiment

Exact agreement — full/dev/holdout MAE, RMSE, correlation and calibration slope
match the experiment transform to ≤ 0.0001 (rounding). No disagreement.

### Opponent-K bucket bias & clamp-hit rate

| | V2.1 | V2.2 |
| --- | --- | --- |
| low-K opponent bias (full) | −0.231 | −0.081 |
| mid-K opponent bias (full) | −0.009 | −0.027 |
| high-K opponent bias (full) | +0.120 | −0.041 |
| matchup clamp-hit rate | 0.5% | 4.99% |
| mean \|matchupAdjustment\| | 0.0084 | 0.0136 |

## Not done here

`src/lib/mlb/kProjectionV2.ts` V2.2 change staged locally, not committed.
