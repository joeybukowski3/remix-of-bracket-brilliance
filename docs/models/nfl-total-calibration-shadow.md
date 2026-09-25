# NFL total calibration shadow candidate (`jkb-nfl-total-calibration-shadow-k08-2026`)

**Status: shadow-only, prospective validation. Not a production model, not shown on the public site, not used by any indicator.**
Production stays `jkb-nfl-total-ridge-v1.0.0`, unchanged.

## Why it exists

The 2026-09 totals audit found the v1 projected total is over-dispersed (calibration slope of final total on projected total
about 0.64) and that shrinking totals toward the league mean improved walk-forward squared error and, more weakly, MAE
(about -0.05 to -0.08 MAE; the honest learned-k versions had confidence intervals including zero, and 2025 showed no gain).
That evidence is not strong enough for a production version bump, so the candidate is validated **forward** on 2026 games.

## Formula (frozen for the 2026 season)

```
shadowTotal = priorSeasonLeagueMean + 0.8 * (rawJkbTotal - priorSeasonLeagueMean)
```

- `rawJkbTotal` = the unchanged production projected game total (home + away expected points), taken from the same finalized
  production prediction rows the generator archives in the same run, so both numbers are frozen from identical pregame information.
- `k = 0.8` is a code constant (`NFL_TOTAL_SHADOW_K`). There is no argument, CLI flag or environment variable to change it; row
  validation rejects any other k, and the archive manifest freezes the configuration (a differing manifest blocks writes).
- `priorSeasonLeagueMean` = mean regular-season game total (home + away) of the **completed immediately-prior season**, read only from
  `public/data/nfl/<season-1>/results.json`. For 2026 this is 2025: 12,519 points over 272 games = **46.025735294117645**.
  The function fails closed if the prior season is incomplete, and never reads the target season's results.
  (The audit's offline experiments pooled 2020-2025, mean 45.75; the shadow candidate uses the single prior season as specified.)
- No market data enters the calculation. The market total available at generation time is recorded for later evaluation only.

## Where it runs and where it is stored

- Generated inside `scripts/generate-nfl-totals.ts` (`npm run nfl:totals`) immediately after the production archive write, from the same
  finalized production rows (`scripts/lib/nfl-total-shadow-calibration.ts`). `--no-shadow` disables it; `--shadow-archive-root=<dir>` redirects it.
  A shadow failure emits a workflow warning and never undoes or blocks the production write.
- Archive (separate from every production root): `data/nfl/shadow-predictions/nfl-total-calibration-k08/`
  - `manifest.json` - frozen configuration and activation time
  - `2026/<WW>/predictions.jsonl` - **prospective** rows (Week 3 onward), append-only, first observation wins
  - `2026/<WW>/retrospective.jsonl` - Weeks 1-2 **reference only** (backfilled from the archived production snapshots)
  - `2026/<WW>/outcomes.jsonl` - final totals attached later as separate immutable events (predictions are never rewritten)
- Each prediction row stores: raw production total, shadow total, k, prior-season league mean and its source hash, production prediction ids,
  the market total available at generation time (book, observation id, timestamp), the shadow and base model versions, `generated_at`, `created_at`, and `public_exposure: "none"`.
- Rows are only written for games whose generation time is strictly before kickoff.
- The CI commit step stages this root through `isAllowedShadowTotalPath` in `scripts/lib/nfl-prediction-archive-allowlist.mjs`.

## Evaluation

`npm run nfl:total-shadow -- report` (also `retrospective`, `grade`) grades outcomes and writes a comparison report: production vs shadow vs market
MAE, RMSE, signed error, calibration slope, the under-40 / 40-44.5 / 45-49.5 / 50+ buckets, and per-game paired absolute-error differences.
The prospective cohort (Week 3 onward, generated after activation) and the retrospective cohort are always reported separately.
**No comparative claim is made until at least 100 prospective games are graded** (`NFL_TOTAL_SHADOW_REVIEW_MIN_GAMES`), and even then the report is for human review.

## Isolation guarantees (tested)

Nothing under `src/` or `public/` references the shadow model; the Weekly Game Board keeps reading `public/data/nfl/team-totals.json`
(production v1.0.0); the team-totals view reads only `data/nfl/predictions`; the production archive output is byte-identical with and without the shadow hook.
See `scripts/lib/nfl-total-shadow-calibration.test.ts`, `scripts/lib/nfl-total-shadow-report.test.ts`,
`scripts/nfl-total-shadow-pipeline.test.ts`, `src/lib/nfl/shadowTotalIsolation.test.ts`.
