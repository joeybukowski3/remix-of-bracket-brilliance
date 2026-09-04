# NFL total-model research (Phases A-I)

Research-only. Nothing here is wired into production, the matchup UI, or any
archive. See `docs/modeling/JKB_MODELING_MASTER_SPEC.md`'s "JKB total
research build" section for the governing summary and
`docs/modeling/FEATURE_REGISTRY.md`'s "Total-model research features"
section for the feature inventory.

## Reproducing

1. `node scripts/analysis/nfl-total-model-research/fetch-scoring-support-cache.mjs [--seasons=2021,2022,2023,2024,2025]`
   Fetches nflverse play-by-play, aggregates to a compact per-team-game
   EPA/success-rate/explosive-rate cache, and writes it to
   `data/nfl/research/nfl-total-model/scoring_support_team_game_<season>.csv`
   (committed -- see that directory's `scoring-support-manifest.json` for
   provenance). Raw play-by-play itself is never stored.

2. `npx tsx scripts/analysis/nfl-total-model-research/evaluate.ts`
   Builds the Phase C research dataset, evaluates Baseline 0 / Baseline 1 /
   the core ridge across the three walk-forward folds, runs Phase G
   diagnostics, and runs the Phase H residual-feature research pass.
   Writes the full result to `out/report.json`.

## Core library (`src/lib/nfl/research/total/`)

- `scoringEnvironment.ts` -- Phase A
- `teamScoringFeatures.ts`, `genericWindow.ts` -- Phase B
- `dataset.ts`, `types.ts` -- Phase C
- `baselines.ts` -- Phase D
- `ridgeModel.ts` (wraps `src/lib/nfl/props/ridge.ts`) -- Phase E
- `metrics.ts` -- Phase F/G evaluation metrics
- `leakage.test.ts` -- Phase I consolidated safety tests

## Harness (`scripts/analysis/nfl-total-model-research/`)

- `fetch-scoring-support-cache.mjs` -- builds the compact scoring-support cache (Phase B data dependency)
- `lib/loadData.ts` -- loads `results.json` + the scoring-support cache into the research types
- `lib/residualFeatures.ts` -- Phase H candidate feature builders
- `evaluate.ts` -- the full walk-forward harness (Phases A, D, E, F, G, H)
- `out/report.json` -- full numeric results (not restated in the docs to avoid drift)
