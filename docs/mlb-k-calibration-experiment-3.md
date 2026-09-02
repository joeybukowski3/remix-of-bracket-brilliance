# MLB Projected-K calibration — Experiment 3: workload calibration

**Analysis only. No production module changed.** Base model: Projected K **V2.2**
(pitcher-skill shrinkage α = 0.55 + opponent-environment multiplier 0.75, matchup
clamp ±0.035 — all held fixed and verified present in `src/lib/mlb/kProjectionV2.ts`).
The K-rate model, recent-form regression, opponent weights, home/away wiring and
fallback behaviour are untouched.

Goal: determine whether Projected-K accuracy improves by making the **projected
workload** more responsive to pregame pitcher-specific workload information,
without touching the K-rate model and without using actual game workload.

> This run **supersedes** an earlier Experiment 3 whose downstream Projected-K
> analysis accidentally executed against V2.0 (the shrinkage / opponent
> calibration lineage had not yet merged). The dataset here was rebuilt from the
> real 2023–2025 StatsAPI corpus with the current production `projectStrikeoutsV2`
> (V2.2). See §J for the before/after comparison.

- Development: 2023 + 2024 (n = 9,359 scoreable)
- Untouched holdout: 2025 (n = 4,682, scored once)
- Full 2023–2025 descriptive only (n = 14,041; 13,706 starter / 183 reliever / 152 opener)
- Dataset: `data/mlb/k-history/backtest/2023-2025-v2_2-workload/` — the production
  backtest dataset (14,578 rows, 0 game-log cache misses) plus an additive,
  analysis-only `workloadDecomp` block (an instrumented re-derivation of
  `mlb-k-workload-v2`) and `_v2Input` (the exact V2 input surface, so downstream K
  is re-scored with the real production model).

---

## A. Baseline confirmed as true V2.2

- `src/lib/mlb/kProjectionV2.ts`: `PITCHER_SKILL_SHRINKAGE_ALPHA = 0.55`,
  `OPPONENT_MATCHUP_MULTIPLIER = 0.75`, `MAX_MATCHUP_ADJUSTMENT = 0.035`.
- Historical K backtest harness present and tracked on this branch
  (`scripts/build-mlb-k-backtest-dataset.mjs`, `scripts/lib/mlb-k-backtest-*.mjs`,
  `scripts/lib/mlb-k-backtest-v2-loader.mjs` which transpiles the live
  `kProjectionV2.ts`).
- Dataset rebuilt with that harness → every `row.v2` and every downstream re-run
  in this experiment is V2.2.
- **Fidelity:** the instrumented `decomposeWorkload` reproduces production
  `expectedBF` / `expectedInnings` to max |Δ| **0.001** BF over the full dataset;
  the downstream re-run of `projectStrikeoutsV2` reproduces the stored V2.2
  Projected K to max |Δ| **0.0005** K (mean |Δ| 0.000047, 0 rows over 0.02).

---

## B. Production workload pipeline (end to end)

`scripts/mlb-k/compute-workload-projection.mjs` (`WORKLOAD_MODEL_VERSION =
"mlb-k-workload-v2"`), consumed by the backtest / shadow builders and by
`kProjectionV2` via `projectedBattersFaced` / `projectedInnings`.

1. **`buildWorkloadDataShape`** — last 6 starts / last 8 appearances before the
   slate date (strict leak gate), each with `pitches`, `battersFaced`,
   `inningsPitched`, `strikeouts`; plus role counts.
2. **Role** (`classifyWorkloadRole`) — reliever / opener / starter → `ROLE_LIMITS`
   (starter caps: pitch 55–115, BF 12–30, IP 3–8.5).
3. **Recent aggregates** — recency-weighted (weight = index + 1) means of recent
   `pitches`, `battersFaced`, `inningsPitched` over the role sample.
4. **`expectedPitchLimit`** = `clamp(0.72·recentPitchAvg + 0.28·leaguePitches, 55,
   115)` (0.45 / 0.55 when < 3 samples). `leaguePitches` = 86 for starters (no
   league starter-pitch series is supplied in the backtest → default).
5. **`expectedBFByPitches`** = `expectedPitchLimit / max(3.2,
   opponentPitchesPerPA)`; `opponentPitchesPerPA` = `0.75·season + 0.25·recent14`
   ≈ 3.9, SD ≈ 0.09.
6. **`expectedBF`** = `clamp(0.65·expectedBFByPitches + 0.35·recentBfAvg, 12, 30)`.
7. **`expectedInnings`** = `clamp(0.70·recentIpAvg + 0.30·(expectedBF·0.72/3), 3,
   8.5)`.

The workload model is **identical** to the earlier run — V2.1 / V2.2 do not touch
it — so every workload-only number below matches the prior run. Only the
downstream Projected-K numbers change.

---

## C. Root cause of workload compression

Three compounding regressions inside the blend structure — **not** the caps:

1. **Pitch-limit → league regression** (0.72 / 0.28): shrinks the recent
   pitch-count signal ~30 % toward the constant 86.
2. **Pitch → BF conversion by a near-constant divisor**: dividing by
   `opponentPitchesPerPA` (SD 0.09 on a ~3.9 mean) maps a ~6-SD pitch-limit spread
   to a ~1.6-SD BF spread — it carries almost none of the between-pitcher
   variation.
3. **Final BF blend weights the compressed estimate 0.65** vs only **0.35 on
   `recentBfAverage`**, the widest (SD ≈ 2.3) and best-correlated (≈ 0.31 with
   actual BF) single pregame BF signal available.

Net: projected-BF SD is **0.686** of actual (dev), calibration **slope 0.802,
intercept 4.52**. The model is under-dispersed by design. Caps essentially never
bind (pitch-clamp ≈ 0.1 %, BF-clamp ≈ 0.1 %). This reproduces the prior run's
compression findings exactly (projected BF under-dispersion; BF SD ≈ 69 % of
actual; pitch-limit regression toward 86; compressed pitch→BF conversion; 65/35
BF blend; caps almost never binding).

---

## D. Baseline workload metrics (development, 2023–2024)

| quantity | projected | actual | ratio / note |
| --- | --- | --- | --- |
| BF mean | 21.90 | 21.75 | bias +0.15 |
| **BF SD** | **3.05** | **4.44** | **0.686 — under-dispersed** |
| BF MAE / RMSE | 2.748 / 3.761 | | |
| BF correlation | 0.550 | | |
| **BF calibration** | **slope 0.802, intercept 4.52** | | regression-to-mean baked in |
| IP SD ratio | | | **0.615** |
| IP MAE / RMSE / corr | 0.968 / 1.280 / 0.433 | | bias −0.02 |

**Projected-BF and downstream Projected-K signed bias by actual-IP bucket**
(error = actual − projection):

| actual IP | n | projected-BF bias | downstream projected-K bias |
| --- | --- | --- | --- |
| < 4 | 1,182 | **−4.70** | **−1.73** |
| 4–6 | 4,303 | −0.15 | −0.34 |
| 6–7 | 2,649 | **+1.47** | **+0.57** |
| 7+ | 1,225 | **+3.05** | **+1.22** |

The Projected-K IP-bucket bias profile is **inherited directly from the workload
model** (≈ K-rate × projected-BF bias); the K-rate model is not its source.

No material downstream-K bias by recent-workload tier (light +0.03 / mid −0.15 /
heavy −0.04), season phase (early −0.05 / mid −0.05 / late −0.07), or
data-quality tier (A −0.00 / B −0.13 / C −0.07) — the compression is in the
**spread**, not a segment offset.

---

## E. Candidate development results (2023–2024 only)

Small overrides of the existing structure; K-rate model untouched.

### Workload-only (BF)

| id | change | dev BF sdRatio (base 0.686) | dev BF MAE (base 2.748) | dev BF corr (base 0.550) |
| --- | --- | --- | --- | --- |
| C1a | BF blend 0.45 / 0.55 | 0.708 | 2.757 | 0.550 |
| C1b | BF blend 0.30 / 0.70 | 0.728 | 2.779 | 0.548 |
| C2 | pitch limit 0.85 / 0.15 | 0.712 | 2.771 | 0.548 |
| C3 | C1a + C2 | 0.726 | 2.773 | 0.549 |
| C4 | widen caps (pitchMax ×1.10, bfMax ×1.15, bfMin ×0.85) | 0.683 | 2.744 | 0.552 |
| C5 | post-clamp variance inflation k = 1.25 about role mean | 0.751 | 2.833 | 0.540 |

### Downstream Projected K (production V2.2 re-run)

| id | dev K MAE (base 1.8402) | dev K RMSE (base 2.3014) | dev K corr (base 0.3938) | dev K calibSlope (base 0.943) |
| --- | --- | --- | --- | --- |
| C1a | 1.8414 (+0.0012) | 2.3024 (+0.0010) | 0.3932 | 0.933 |
| C1b | 1.8431 (+0.0029) | 2.3042 (+0.0028) | 0.3919 | 0.923 |
| C2 | 1.8408 (+0.0006) | 2.3019 (+0.0005) | 0.3941 | 0.924 |
| C3 | 1.8419 (+0.0017) | 2.3029 (+0.0015) | 0.3934 | 0.921 |
| C4 | 1.8396 (−0.0006) | 2.3008 (−0.0006) | 0.3943 | 0.945 |
| C5 | 1.8429 (+0.0027) | 2.3045 (+0.0031) | 0.3925 | 0.901 |

Observations:

- **C4 (caps) does nothing for dispersion** — BF SD ratio 0.686 → 0.683.
  Confirms caps are not the compression source.
- Every candidate that widens dispersion (C1/C2/C3/C5) **costs standalone BF MAE
  and (slightly) BF correlation**, because `recentBfAverage` /
  `recentPitchAverage` correlate only ≈ 0.31 with actual BF.
- **Under true V2.2 every dispersion-widening candidate now also slightly worsens
  downstream Projected-K MAE / RMSE** (C1b +0.0029 / +0.0028 dev). This is the
  opposite sign from the invalid V2.0 run — see §J.

### Short / long-start tails (dev, downstream K bias)

| | baseline | C1b | C5 |
| --- | --- | --- | --- |
| short < 5 IP | −1.216 | −1.206 | −1.189 |
| long ≥ 6 IP | +0.778 | +0.756 | +0.753 |

Barely dented — the < 4 IP tail (−4.70 BF) is dominated by in-game blow-ups /
early hooks that no pregame model can anticipate.

---

## F. Candidate selected using 2023–2024 only — **NONE**

Selection rule (dev only): BF SD-ratio gain ≥ 0.03 toward 1.0; BF calibration
slope closer to 1; BF MAE not worse by > 0.02, BF corr not down > 0.004;
downstream K MAE/RMSE not worse by > 0.001, K corr not down > 0.001; |K bias| not
up > 0.02.

- **Survivors: none.**
- The candidates that improve dispersion (C1b +0.042 SD-ratio) worsen BF MAE
  (+0.031, over the 0.02 bar) **and** now worsen downstream K MAE/RMSE
  (> 0.001).
- The candidates that keep BF MAE (C1a +0.022, C4 +0.00) don't move dispersion
  enough (< 0.03).
- **Closest downstream-K-neutral candidate: C4-widen-caps** — dev Δ BF SD-ratio
  **−0.003** (inert), BF MAE −0.004, BF corr +0.002; K MAE −0.0006, K RMSE
  −0.0006, K corr +0.0005. It is neutral only because it changes almost nothing.
  (In the invalid V2.0 run the closest-neutral candidate was C1b — see §J.)

---

## G. Untouched 2025 workload results

Scored once, never fed back.

| candidate | BF MAE | BF corr | BF sdRatio | BF calib note |
| --- | --- | --- | --- | --- |
| baseline | 2.675 | 0.479 | **0.659** | slope ≈ 0.79 |
| C1a | 2.685 (+0.011) | 0.482 | 0.683 (+0.024) | |
| C1b | 2.706 (+0.031) | 0.481 | 0.705 (+0.046) | |
| C4 | 2.671 (−0.004) | 0.482 | 0.656 (−0.003) | |
| C5 | 2.751 (+0.076) | 0.476 | 0.730 (+0.071) | |

Same shape as development: the workload can be made ~4–5 SD-ratio points less
compressed, but only by trading BF point accuracy.

---

## H. Untouched 2025 downstream Projected-K results

| candidate | K MAE | K RMSE | K corr | K calibSlope | short<5IP bias | long≥6IP bias |
| --- | --- | --- | --- | --- | --- | --- |
| baseline | **1.8273** | **2.2961** | **0.3583** | 0.914 | −1.149 | +0.745 |
| C1a | 1.8296 (+0.0023) | 2.2979 (+0.0018) | 0.3569 | 0.905 | −1.143 | +0.735 |
| C1b | 1.8320 (+0.0047) | 2.3001 (+0.0040) | 0.3550 | 0.894 | −1.139 | +0.727 |
| C2 | 1.8280 (+0.0007) | 2.2968 (+0.0007) | 0.3584 | 0.898 | −1.145 | +0.731 |
| C3 | 1.8302 (+0.0029) | 2.2984 (+0.0023) | 0.3569 | 0.893 | −1.140 | +0.725 |
| C4 | 1.8270 (−0.0003) | 2.2956 (−0.0005) | 0.3587 | 0.917 | −1.150 | +0.745 |
| C5 | 1.8300 (+0.0027) | 2.2989 (+0.0028) | 0.3572 | 0.876 | −1.119 | +0.726 |

On the untouched holdout, **every dispersion-widening candidate makes downstream
Projected K worse** (MAE +0.002 to +0.005). No candidate is both spread-improving
and K-neutral.

---

## I. Short-start / long-start bias, before vs after

Full 2023–2025 (descriptive), downstream Projected-K signed bias:

| segment | baseline K bias | C1b K bias | C5 K bias |
| --- | --- | --- | --- |
| actual IP < 4 | (BF −4.70) large negative | ≈ unchanged | ≈ unchanged |
| actual IP 6–7 | +0.57 (dev) | +0.55 | +0.53 |
| actual IP 7+ | +1.22 (dev) | ≈ +1.18 | ≈ +1.17 |
| short < 5 IP (dev) | −1.216 | −1.206 | −1.189 |
| long ≥ 6 IP (dev) | +0.778 | +0.756 | +0.753 |
| short < 5 IP (2025) | −1.149 | −1.139 | −1.119 |
| long ≥ 6 IP (2025) | +0.745 | +0.727 | +0.726 |

Directionally correct (tails pull slightly toward zero) but magnitude negligible
— ≤ 0.03 K on the worst tail, well inside backtest noise, and bought at the cost
of overall K MAE/RMSE.

---

## J. Comparison with the invalid prior (V2.0-based) Experiment 3

The workload model was unchanged, so **workload-only metrics are identical**
between the two runs (BF SD-ratio 0.686 dev, BF MAE 2.748, BF corr 0.550, calib
slope 0.802, the IP-bucket BF-bias profile). What changed is the **downstream
Projected-K baseline** and, with it, the sign of every candidate's downstream
effect.

| quantity | invalid (V2.0 downstream) | valid (V2.2 downstream) | Δ |
| --- | --- | --- | --- |
| dev baseline K MAE | 1.8894 | **1.8402** | **−0.0492** |
| dev baseline K RMSE | 2.3726 | **2.3014** | **−0.0712** |
| dev baseline K corr | 0.374 | **0.394** | **+0.020** |
| holdout baseline K MAE | 1.8752 | **1.8273** | **−0.0479** |
| holdout baseline K corr | 0.347 | **0.358** | **+0.011** |
| C1b dev ΔK MAE vs baseline | **−0.0023** (help) | **+0.0029** (hurt) | sign flip |
| C1b dev ΔK RMSE vs baseline | **−0.0030** (help) | **+0.0028** (hurt) | sign flip |
| C1b dev ΔK corr vs baseline | +0.0025 | −0.0019 | sign flip |
| C1b holdout ΔK MAE vs baseline | −0.0004 | **+0.0047** (hurt) | sign flip |
| closest-neutral candidate | C1b | **C4 (inert)** | — |
| selection verdict | NONE | NONE | unchanged |

Interpretation: the −0.049 K-MAE / +0.020 corr improvement in the baseline is
exactly the pitcher-skill shrinkage (α 0.55) + opponent multiplier (0.75) gains
landing. Because V2.2's K-rate model is better calibrated, there is **less
residual error for a workload re-weighting to absorb** — so the small downstream
help the invalid run saw from C1b disappears and turns marginally negative. The
rejection is therefore **stronger** under true V2.2, not weaker: no candidate is
K-neutral-or-better except the one that changes nothing.

---

## K. Final recommendation: **REJECT the broad workload change**

- The under-dispersion is real and fully explains the Projected-K IP-bucket bias
  profile, but its **downstream Projected-K impact under V2.2 is ≤ 0.2 % MAE /
  RMSE and negative in sign** for every dispersion-widening candidate, on both
  development and the untouched 2025 holdout. K variance is K-rate-dominated, as
  hypothesised.
- No small change improves workload fidelity **and** downstream K without trading
  BF point accuracy for spread — the guardrail ("do not optimise solely for
  downstream K MAE if workload itself becomes less realistic") rules the
  candidates out, and here they don't even improve downstream K.
- Do **not** adopt a broad workload re-parameterisation. Keep V2.2 workload
  unchanged.
- Narrower follow-ups worth a dedicated experiment (unchanged from the prior
  run, still not started):
  1. A **short-start hazard term** (recent early-hook rate / recent pitch-count
     volatility → downweight expected BF for pull-risk pitchers) targeting the
     < 4 IP tail specifically.
  2. Replace the **pitch → BF divide-by-opponent-PPA** step with a
     pitcher-specific pitches-per-BF estimate, so pitch-count spread survives the
     conversion.
  3. Feed a real **league starter-pitch-count series** into `leaguePitches`
     (currently the constant 86 in the backtest path).

---

## L. Tests

- `node --test scripts/lib/mlb-k-workload-experiment.test.mjs` — **7 pass**
  (decompose fidelity vs production on 3 shapes; reproject == decompose at
  baseline; knob direction).
- `node --test scripts/mlb-k/compute-workload-projection.test.mjs` — **11 pass**
  (production module unchanged).
- `node --test scripts/lib/mlb-k-backtest-dataset.test.mjs` — pass (harness
  additive `_v2Input` change is non-breaking).
- Full-dataset fidelity: `decomposeWorkload` == production `expectedBF` /
  `expectedInnings` to max |Δ| 0.001 BF on 14,578 rows; downstream baseline re-run
  == stored V2.2 K to max |Δ| 0.0005 (mean 4.7e-5, 0 rows > 0.02).
- `npx vitest run src/lib/mlb/kProjectionV2.test.ts` — not run in this worktree
  (no local `node_modules` install; production model file is byte-identical to
  `main`, unmodified).

---

## M. Exact Experiment 3 files restored / reapplied

Analysis / harness only — nothing under `src/`, nothing production:

| file | status | purpose |
| --- | --- | --- |
| `scripts/lib/mlb-k-workload-experiment.mjs` | **new** | pure instrumented copy of `mlb-k-workload-v2` + `reprojectFromDecomp` |
| `scripts/lib/mlb-k-workload-experiment.test.mjs` | **new** | fidelity vs production + knob-direction tests |
| `scripts/analyze-mlb-k-workload-experiment.mjs` | **new** | Experiment 3 analyzer (decomposition + candidate grid + downstream re-run) |
| `docs/mlb-k-calibration-experiment-3.md` | **new** | this document |
| `scripts/build-mlb-k-backtest-dataset.mjs` | **+1 additive edit** | attach analysis-only `row.workloadDecomp` per row (import + one block) |
| `scripts/lib/mlb-k-backtest-dataset.mjs` | **+1 additive edit** | expose analysis-only `_v2Input` per row |

Everything else in the backtest / calibration lineage (backtest harness,
Experiment 1 / 2 files, `analyze-mlb-k-{backtest,shrinkage,opponent}-experiment.mjs`,
`mlb-k-{shrinkage,opponent}-experiment.mjs`) was **already tracked on this branch
from `main`** and was not touched. `src/lib/mlb/kProjectionV2.ts` and
`scripts/mlb-k/compute-workload-projection.mjs` are untouched.

Generated artefacts (git-ignored `data/mlb/`):
`data/mlb/k-history/backtest/2023-2025-v2_2-workload/{dataset.jsonl,manifest.json}`
and `.../workload-experiment/{experiment.json,report.md}`. The raw StatsAPI /
game-log acquisition cache under `data/mlb/k-history/raw/` (also git-ignored) was
reused as the historical input; the dataset itself was rebuilt from scratch with
the current V2.2 production code.
