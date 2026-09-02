# MLB Projected-K calibration — Experiment 4: contextual starter workload

**Analysis only. No production module changed.** Base model: Projected K **V2.2**
(pitcher-skill shrinkage α = 0.55, opponent-environment multiplier 0.75, matchup
clamp ±0.035 — all frozen and verified present in `src/lib/mlb/kProjectionV2.ts`).
K-rate model, recent-form regression, opponent term, home/away wiring, fallback
behaviour untouched.

Scope, per approval: **pitcher-specific workload information only.** The Phase-1
diagnosis and the extreme/consistent follow-up found no usable pregame signal in
opponent recent starter-workload effect or opponent offensive quality, so those,
plus wRC+/OPS and any ML, are excluded.

- Development: 2023 + 2024 (n = 9,359 scoreable; thin < 5 season starts: 2,629; early-season: 2,390)
- Untouched holdout: 2025 (n = 4,682) — scored once, not used for selection
- Full 2023–2025 descriptive only (n = 14,041)
- Dataset: `data/mlb/k-history/backtest/2023-2025-v2_2-workload/` rebuilt from the
  real StatsAPI corpus with current V2.2 production code, plus the additive
  analysis-only `workload4Inputs` block (as-of season-to-date and last-5
  per-start IP/BF/pitches, and season pitches-per-BF).

**Fidelity:** `reprojectV4` at baseline params reproduces production
`mlb-k-workload-v2` `expectedBF`/`expectedInnings` to max |Δ| **0.001** BF over
14,578 rows; the downstream baseline re-run reproduces stored V2.2 K to max |Δ|
**0.0005**.

---

## 1. Candidates tested

Pitcher-anchored: `expectedPitchLimit`, `expectedBF`, `expectedInnings` =
`blend(season-to-date per-start, last-5 per-start)`, clamped to the existing role
caps. League/role defaults (pitch 86 etc.) used **only** as a fallback when the
pitcher has < 3 current-season starts **and** no last-5 sample.

| id | change |
| --- | --- |
| `baseline` | production V2.2 workload (exact) |
| `B50` | blend 50% season / 50% last-5 |
| `B60` | blend 60% season / 40% last-5 |
| `B70` | blend 70% season / 30% last-5 |
| `B60_ppb` | B60, but `expectedBF = expectedPitchLimit / (pitcher's own season pitches-per-BF)` — the one optional arm (replaces the opponent-pitches-per-PA divisor) |

No other candidate families.

---

## 2. Selected candidate — **NONE**

Selection rule (development only): *improve workload fidelity* — BF calibration
slope closer to 1 by ≥ 0.02 **or** BF SD-ratio closer to 1 by ≥ 0.03, with BF MAE
not worse by > 0.02 and BF corr not down by > 0.004 — *without worsening
downstream K* — K MAE/RMSE not worse by > 0.001, K corr not down by > 0.001,
|K bias| not up by > 0.02. **Survivors: none.**

Every pitcher-anchored candidate improves BF SD-ratio and central bias but
**worsens BF MAE, BF correlation, BF calibration slope, and downstream Projected
K** — the same signal/noise trade Experiment 3 documented, because the honest
pregame predictors (a pitcher's own season/recent per-start workload) correlate
only ≈ 0.50–0.55 with the next start.

---

## 3. Development results (2023–2024)

### Workload

| candidate | BF MAE | BF RMSE | BF corr | BF bias | BF projSD | BF sdRatio (act SD 4.44) | BF calibSlope | IP MAE | IP corr | IP bias | Pit MAE | Pit corr | Pit bias |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baseline * | 2.748 | 3.761 | 0.550 | +0.150 | 3.05 | **0.686** | **0.802** | 0.968 | 0.433 | −0.022 | 9.41 | 0.591 | +0.598 |
| B50 | 2.815 | 3.847 | 0.536 | +0.107 | 3.23 | 0.727 | 0.737 | 0.978 | 0.426 | −0.001 | 9.63 | 0.577 | +0.323 |
| B60 | 2.811 | 3.841 | 0.536 | +0.116 | 3.21 | 0.723 | 0.742 | 0.977 | 0.427 | +0.000 | 9.62 | 0.577 | +0.351 |
| B70 | 2.809 | 3.839 | 0.536 | +0.125 | 3.19 | 0.719 | 0.746 | 0.976 | 0.426 | +0.002 | 9.62 | 0.577 | +0.379 |
| B60_ppb | 2.814 | 3.837 | 0.536 | +0.115 | 3.19 | 0.718 | 0.747 | 0.977 | 0.427 | +0.000 | 9.62 | 0.577 | +0.351 |

### Downstream Projected K (production V2.2 re-run)

| candidate | K MAE | K RMSE | K corr | K bias | K calibSlope | K projSD | short < 5 IP K bias | long ≥ 6 IP K bias |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baseline * | **1.8402** | **2.3014** | **0.3938** | −0.053 | 0.943 | 1.045 | −1.216 | +0.778 |
| B50 | 1.8463 | 2.3073 | 0.3889 | −0.055 | 0.924 | 1.053 | −1.211 | +0.767 |
| B60 | 1.8460 | 2.3070 | 0.3890 | −0.053 | 0.928 | 1.049 | −1.212 | +0.772 |
| B70 | 1.8460 | 2.3070 | 0.3889 | −0.051 | 0.930 | 1.046 | −1.212 | +0.776 |
| B60_ppb | 1.8460 | 2.3081 | 0.3881 | −0.055 | 0.923 | 1.052 | −1.214 | +0.774 |

### Early-season & thin-sample (development)

| candidate | early BF MAE | early BF bias | early K MAE | thin (n=2,629) BF MAE | thin BF bias | thin K MAE | thin K bias |
| --- | --- | --- | --- | --- | --- | --- | --- |
| baseline * | 2.696 | +0.522 | 1.876 | 2.932 | +0.530 | 1.841 | −0.104 |
| B60 | 2.827 | +0.522 | 1.888 | 3.137 | +0.645 | 1.850 | −0.075 |
| B70 | 2.826 | +0.518 | 1.888 | 3.135 | +0.633 | 1.850 | −0.078 |

Thin-sample and early-season **BF accuracy gets materially worse** under the
pitcher anchor (thin BF MAE +0.20, bias +0.12) — the season term is unreliable
with < 5 starts and the last-5 fallback doesn't recover it.

---

## 4. Untouched 2025 holdout results (scored once)

| candidate | BF MAE | BF corr | BF bias | BF sdRatio (act SD 4.02) | BF calibSlope | IP corr | Pit corr | K MAE | K RMSE | K corr | K bias | K calibSlope |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baseline * | **2.675** | **0.479** | +0.128 | **0.659** | **0.727** | 0.374 | 0.503 | **1.8273** | **2.2961** | **0.3583** | −0.032 | 0.914 |
| B50 | 2.753 | 0.467 | +0.140 | 0.719 | 0.649 | 0.367 | 0.500 | 1.836 | 2.3047 | 0.350 | −0.023 | 0.887 |
| B60 | 2.748 | 0.466 | +0.149 | 0.715 | 0.652 | 0.368 | 0.501 | 1.835 | 2.3041 | 0.351 | −0.021 | 0.891 |
| B70 | 2.746 | 0.466 | +0.157 | 0.712 | 0.654 | 0.367 | 0.500 | 1.835 | 2.3037 | 0.351 | −0.019 | 0.894 |
| B60_ppb | 2.753 | 0.462 | +0.157 | 0.702 | 0.658 | 0.368 | 0.501 | 1.833 | 2.3031 | 0.351 | −0.020 | 0.897 |

Holdout confirms development: SD-ratio up ~0.05, **but BF MAE +0.07–0.08, BF corr
−0.013, BF calibration slope 0.727 → 0.65 (much worse), K MAE +0.005–0.009,
K corr −0.007, K calibration slope 0.914 → 0.89.** No candidate is an improvement.

---

## 5. Baseline vs candidate deltas (development)

BF sdRatio / BF calibSlope / BF MAE / BF corr  |  K MAE / K RMSE / K corr / K bias

| candidate | BF sdRatio | BF calibSlope | BF MAE | BF corr | K MAE | K RMSE | K corr | K bias |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B50 | **+0.041** | **−0.065** | **+0.067** | **−0.014** | +0.006 | +0.006 | −0.005 | −0.002 |
| B60 | +0.036 | −0.060 | +0.063 | −0.014 | +0.006 | +0.006 | −0.005 | −0.000 |
| B70 | +0.033 | −0.056 | +0.061 | −0.014 | +0.006 | +0.006 | −0.005 | +0.002 |
| B60_ppb | +0.032 | −0.055 | +0.066 | −0.014 | +0.006 | +0.007 | −0.006 | −0.002 |

Bold = breaches the selection bar. The SD-ratio gain (good) is inseparable from a
worse calibration slope, worse MAE, worse correlation, and worse downstream K.

---

## 6. Did season/recent blending help?

**Partially, and not enough.** It improved the *shape* of the projection:
- BF SD-ratio 0.686 → ~0.72 (less compressed)
- IP bias −0.022 → ~0.000
- projected-pitches bias +0.60 → ~0.35
- higher season weight (B70) gave slightly better central bias and calibration
  slope than B50 — consistent with the diagnosis that season baseline ≥ recent
  trend.

But it degraded everything that matters for accuracy on **both** dev and holdout:
BF MAE +0.06–0.08, BF correlation −0.014, **BF calibration slope −0.06 to −0.07
(further from 1, not closer)**, downstream K MAE/RMSE +0.006, K correlation
−0.005. The blend adds spread that is roughly half noise, so the projection
disperses without tracking actual workload any better.

---

## 7. Did pitcher-specific pitches-per-BF help?

**No.** `B60_ppb` vs `B60` on development: BF calibration slope 0.747 vs 0.742
(≈ equal), BF corr identical (0.536), BF MAE slightly worse (2.814 vs 2.811),
K RMSE worse (2.3081 vs 2.3070), K corr worse (0.388 vs 0.389). On the holdout it
had a marginally better K MAE (1.833 vs 1.835) but worse BF correlation (0.462 vs
0.466) and worse BF SD-ratio direction. All differences are within backtest
noise; the pitcher's own pitches-per-BF divisor adds nothing over the existing
opponent-pitches-per-PA divisor or a direct season/recent BF blend.

---

## 8. Short-start / long-start bias

Downstream Projected-K bias by actual start length is **essentially unchanged**:

| segment | baseline (dev) | B60 (dev) | baseline (2025) | B60 (2025) |
| --- | --- | --- | --- | --- |
| short < 5 IP | −1.216 | −1.212 | −1.149 | −1.127 |
| long ≥ 6 IP | +0.778 | +0.772 | +0.745 | +0.742 |

The IP-bucket bias is a hook-timing / blow-up phenomenon that no pregame
central-tendency reweighting addresses (same conclusion as Experiment 3).

---

## 9. Recommendation: **REJECT the pitcher-anchored workload change**

- The pitcher-anchored season/recent blend improves projected-workload
  **dispersion and central bias**, but at the cost of **point accuracy (MAE),
  rank correlation, calibration slope, and downstream Projected K** — on
  development *and* the untouched 2025 holdout.
- Downstream Projected-K MAE/RMSE move **+0.3–0.5 %** in the wrong direction;
  correlation drops ~0.005. This fails the guardrail (improve workload fidelity
  without worsening downstream K).
- Thin-sample and early-season pitchers get **worse**, not better.
- The optional pitches-per-BF arm adds no value.

Keep V2.2 workload unchanged. Combined with Experiments 3 and 4, the evidence is
consistent: the projected-workload component is under-dispersed because the
honest pregame predictors are weak (r ≈ 0.5), and Projected-K variance is
K-rate-dominated, so no small workload reparameterisation improves Projected K.
The only remaining workload ideas worth a *dedicated, narrowly-targeted*
experiment (not a broad reweight) are the Experiment-3 §K follow-ups: a
short-start hazard term aimed only at the < 4 IP tail, and a real league
starter-pitch-count series to replace the constant 86 in the fallback path.

---

## 10. Files changed

Analysis / harness only — nothing under `src/`, nothing production:

| file | status |
| --- | --- |
| `scripts/lib/mlb-k-workload-experiment-4.mjs` | **new** — pure pitcher-anchored `reprojectV4` + `buildV4Inputs` (delegates to Exp-3 `reprojectFromDecomp` at baseline params) |
| `scripts/lib/mlb-k-workload-experiment-4.test.mjs` | **new** — fidelity vs production + candidate-direction tests |
| `scripts/analyze-mlb-k-workload-experiment-4.mjs` | **new** — Experiment 4 analyzer (grid + downstream re-run + selection) |
| `docs/mlb-k-calibration-experiment-4.md` | **new** — this document |
| `scripts/build-mlb-k-backtest-dataset.mjs` | **+1 additive edit** — import + attach analysis-only `row.workload4Inputs` |

`src/lib/mlb/kProjectionV2.ts` and `scripts/mlb-k/compute-workload-projection.mjs`
are untouched. Experiment 3's files (`mlb-k-workload-experiment.mjs`,
`analyze-mlb-k-workload-experiment.mjs`, `docs/mlb-k-calibration-experiment-3.md`,
the `workloadDecomp` / `_v2Input` additive edits) are unchanged and reused.
Generated artefacts (git-ignored `data/mlb/`):
`.../backtest/2023-2025-v2_2-workload/workload-experiment-4/{experiment.json,report.md}`.

---

## 11. Tests

- `node --test scripts/lib/mlb-k-workload-experiment-4.test.mjs` — **4 pass**
  (reprojectV4 == production at baseline params on 2 shapes; season-weight
  direction; pitches-per-BF arm sanity).
- `node --test scripts/lib/mlb-k-workload-experiment.test.mjs` — **7 pass** (Exp 3, unchanged).
- `node --test scripts/lib/mlb-k-backtest-dataset.test.mjs` — **7 pass** (additive `workload4Inputs` non-breaking).
- `node --test scripts/mlb-k/compute-workload-projection.test.mjs` — **11 pass** (production module unchanged).
- Full-dataset fidelity: `reprojectV4` baseline == production `expectedBF`/`expectedInnings` to max |Δ| 0.001 BF on 14,578 rows; downstream baseline re-run == stored V2.2 K to max |Δ| 0.0005.
- `npx vitest run src/lib/mlb/kProjectionV2.test.ts` — not run in this worktree (no local `node_modules` install; `kProjectionV2.ts` byte-identical to `main`, unmodified).
