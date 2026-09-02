# MLB Projected K historical backtest (v1)

Point-in-time evidence and methodology for the **measurement-and-diagnosis**
backtest of the current production Projected K model. It does **not** change any
model — see [models/mlb-k-score.md](models/mlb-k-score.md) for the live
methodology contract and the `KS-003` conflict noted below.

## Purpose

Measure how the production Projected K output has performed on historical
pitcher starts, with zero lookahead leakage, so component-level over/under-
weighting can be diagnosed before any formula change is proposed.

## Production model under test (as-built, 2026-09-01)

`scripts/resolve-mlb-k-production-projection.mjs` →
`scripts/lib/mlb-k-production-projection.mjs` promotes **V2.2
(`mlb-k-projection-v2-production`, `src/lib/mlb/kProjectionV2.ts`)** into
`projectedKs` whenever a V2 row matches with `confidence ∈ {high, medium}` and
`projectedStrikeouts > 0`; the legacy `IP × K9 / 9` projection is the
deterministic per-row fallback only. On the 2026-09-01 slate 29 / 30 rows were
V2-served. This backtest treats **V2 as the production model** and legacy as the
fallback, and reports three views (see below). The doc conflict this backtest
originally flagged (`KS-003`) was resolved on 2026-09-02: `KS-013` records the
V2.2 promotion and [models/mlb-k-score.md](models/mlb-k-score.md) now describes
V2.2 as live (was: model version string `mlb-k-projection-v2-shadow`).

## Three reported views

| View | Definition |
| --- | --- |
| **production-resolved** | Exactly what users would have received: V2 when it satisfies the live eligibility rule, else the legacy projection. Headline system metric. |
| **V2-only** | Every historically reconstructable V2 projection, **all confidences kept** (`productionEligible` is a separate field). |
| **legacy** | The legacy `IP × K9 / 9` projection, reconstructed independently wherever possible. |

V2 and legacy are never blended. Every row carries
`projectionServedByProduction` and `availability.{v2,legacy,both,productionScoreable,isProductionFallbackRow}`.

## Pipeline

| Step | Script | Output (all under `data/mlb/k-history/`, gitignored) |
| --- | --- | --- |
| 1. StatsAPI outcome corpus | `scripts/acquire-mlb-k-backtest-history.mjs` (drives the merged `acquireMlbKHistoryStatsApi` over weekly windows) | `raw/statsapi/<season>/<window>/` + `raw/statsapi/corpus-manifest.json` |
| 2. Game logs | `scripts/acquire-mlb-k-backtest-gamelogs.mjs` | `raw/gamelogs/` (URL-keyed, hash-verified cache) + `manifest.json` |
| 3. As-of reconstruction | `scripts/lib/mlb-k-backtest-asof.mjs` (pure) | — |
| 4. Workload reconstruction | `scripts/lib/mlb-k-backtest-asof.mjs` `buildWorkloadDataShape` + real `computeWorkloadProjection` | — |
| 5. Dataset | `scripts/build-mlb-k-backtest-dataset.mjs` + `scripts/lib/mlb-k-backtest-dataset.mjs` (pure) | `backtest/<label>/dataset.jsonl` + `manifest.json` |
| 6. Tests | `scripts/lib/mlb-k-backtest-*.test.mjs` (`node --test`) | — |
| 7. Analysis | `scripts/analyze-mlb-k-backtest.mjs` | `backtest/<label>/analysis.json` + `report.md` |

The real production/model helpers are imported, never reimplemented:
`calculateProjectedK9` / `calculateProjectedKs` (`scripts/generate-mlb-hr-props.mjs`),
`calculateProjectedInnings` / `classifyPitcherRole` (`scripts/lib/mlb-projected-innings.mjs`),
`computeWorkloadProjection` (`scripts/mlb-k/compute-workload-projection.mjs`),
`projectStrikeoutsV2` (transpiled from `src/lib/mlb/kProjectionV2.ts`),
`V2_PRODUCTION_CONFIDENCE` (`scripts/lib/mlb-k-production-projection.mjs`).

## Leakage control

The single gate is `isBeforeCutoff(rowDate, cutoffDate)` — a strict `<` against
the start's slate date (`officialDate`). Every season-to-date aggregate, recent-
form sample, opponent rate and league rate is built only from game-log / team-log
rows that pass it, and the projected start's own `gamePk` is additionally
excluded. The previous-season fallback (prior-year rows for an early-season
start) is prior-year data and carries no leakage. Unit tests in
`mlb-k-backtest-asof.test.mjs` assert a row dated on the cutoff is excluded and
that recency windows are anchored correctly.

## Fidelity deviations from production inputs (recorded per row)

| Flag | Meaning |
| --- | --- |
| `SAVANT_STATCAST_RATES_SUBSTITUTED_STATSAPI` | K% / whiff% come from StatsAPI cumulative K/BF, not Baseball Savant Statcast plate-discipline rates (approved scope decision — leak-free, ~full coverage). |
| `PROJECTED_LINEUP_KRATE_DROPPED` | `opponent.projectedLineupKRate` (V2 weight 0.14) is null — posted pregame lineups are not archived before 2026-09-01. V2's weights renormalize over present terms, as they do in production when the lineup is unavailable. |
| `LEAGUE_WHIFF_UNAVAILABLE` | `context.leagueAverageWhiffRate` is null → V2 records a context fallback → **historical V2 confidence caps at "medium"**. "medium" is still production-eligible, so production-resolved is unaffected; "high" is simply unreachable in the backtest. |
| `V2_WHIFF_SUPPORTED_TERMS_DROPPED` | pitcher (0.22) and opponent (0.04) whiff-supported K% terms drop for lack of a whiff input; skill/environment weights renormalize. |
| `LEGACY_K9_RATE_ESTIMATE` | legacy K9 used the kRate estimate path (no real season SO/IP yet); with whiff missing `skillMult` defaults to 1 exactly as production's own code does. |
| `RECENT_FORM_USED_PRIOR_SEASON` | early-season start; recent-form sample drew on the prior season (matches `fetchPitcherWorkloadData`). |
| `FIRST_START_OF_SEASON` / `SPARSE_RECENT_START_SAMPLE` | thin sample; folded into `dataQualityTier`. |
| `WORKLOAD_*` | flags surfaced by the real workload model for this row. |

Home/away and vs-LHP/RHP split terms are passed `null` — matching production,
which also never wires them today.

## Prop lines

Not fabricated. Every row has `market.kLine = null` with stable join keys
(`date`, `gameId`, `pitcherId`); a future `join-k-prop-lines` step can attach
historical lines without rebuilding the dataset.

## Reproduce

```
npm run mlb:k-backtest:acquire -- --seasons=2023,2024,2025
npm run mlb:k-backtest:acquire-gamelogs
npm run mlb:k-backtest:build -- --label=2023-2025 --seasons=2023,2024,2025
npm run mlb:k-backtest:analyze -- --dir=data/mlb/k-history/backtest/2023-2025
```

Steps 1–2 are resumable and hash-verified; an interrupted run continues from
cache. Coverage gaps are recorded in the manifests, never silently dropped.
