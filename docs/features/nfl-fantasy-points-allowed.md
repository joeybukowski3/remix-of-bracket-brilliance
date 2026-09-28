# NFL Fantasy Points Allowed by Position

The Points Allowed view reads `public/data/nfl/fantasy-points-allowed.json`, produced by `scripts/generate-nfl-fantasy-points-allowed.ts`. The current artifact contract is `nfl-fantasy-points-allowed-v2`.

## Source and samples

QB, RB, combined WR, and TE use normalized nflverse player-week rows from the committed 2025 and 2026 caches, scored with JKB Full PPR. For each defense, season, week, and position, the producer sums the actual fantasy points of opposing players. Season samples use all available regular-season games from that season; Last 5 and Last 8 use each defense's most recent five or eight completed games across the season boundary. A team's per-game value is the sum of its selected game totals divided by its number of selected games. Rank 1 allows the fewest points per game. Zero-game samples retain null ranks and values.

The `wr` cell is independently aggregated from all raw WR player-week rows in every sample. It is never calculated from Wide WR and Slot WR values. The `wideWr` and `slotWr` cells come only from the current-season Razzball defense snapshot and are null in 2025, Last 5, and Last 8. They are separate source measures and are not used to derive combined WR.

## Artifact and view contract

Each sample contains `qb`, `rb`, `wr`, `wideWr`, `slotWr`, and `te`. Every populated cell keeps rank, sampled games, total points when game-level data exists, per-game points, and source. Version 2 adds `wr` to the prior contract; the page rejects older or incomplete artifacts instead of silently displaying an empty fallback.

The 2026 table shows QB, RB, Wide WR, Slot WR, and TE when every defense has both split values. If the snapshot is incomplete, it shows QB, RB, WR, and TE. The 2025, Last 5, and Last 8 tables always show QB, RB, WR, and TE. The combined WR header uses the existing teal WR color; the 2026 split colors stay as they were.

Rank mode displays and sorts by the WR rank. Raw mode displays WR fantasy points allowed per game with rank in parentheses and sorts by the artifact's numeric per-game value before one-decimal display formatting. Heat color is driven by rank in both modes. The page note reads: “Wide/Slot WR splits are available for 2026; other samples use combined WR.”

The producer reads only committed caches and the current-season split snapshot. `--dry-run` prints a preview without writing the artifact. No projection, edge, threshold, market, archive, or evaluation method is changed by this extension.

## Yards vs Avg view (`?view=yards`)

The third tab answers: how far above or below their own normal production do opponents perform against this defense? It reads `public/data/nfl/yards-vs-average-by-position.json` (contract `nfl-yards-vs-average-v1`), produced by `scripts/generate-nfl-yards-vs-average.ts` from the same player-week cache (seasons S-2 through S; S-2 only feeds prior-season means for S-1 games). Logic lives in `src/lib/nfl/yardsVsAverage/`.

**Metrics** (sums per offense-game; every offense-game is created first and missing position groups are 0, so a game with no TE row still counts as 0 TE yards):

| Column | Definition |
|---|---|
| PASS | Gross team passing yards from every QB/RB/WR/TE passer. Sack yards are not subtracted (the cache does not carry them), so this is not official net passing. QB PASS is not shown because it matches PASS in nearly every game. |
| RUSH | Team rushing yards from QB/RB/WR/TE rows (fullbacks and other positions are outside the cache). |
| QB RUSH, RB RUSH | Rushing yards by position group. |
| RB REC, WR REC, TE REC | Receiving yards by position group. |

**Baseline.** For offense O, target game G in season S: `baseline = priorWeight * mean(O's season S-1 games) + currentWeight * mean(O's other season S games, excluding G)`. Weights come from `getProjectionBlendWeights(otherGames)` in `src/lib/nfl/projectionBlendPolicy.ts` (`nfl-comparison-blend-v1`: prior weight 1, 0.8, 0.6, 0.4, 0.2, then 0 at 5+ other games). The baseline depends only on the offense and the game, never on the displayed defense window, so a 2025 game inside Last 8 uses its 2025 baseline. It is recomputed on every rebuild, so earlier games' baselines move as opponents play more games. If the blend needs a prior season that does not exist, the baseline is null and the game is excluded from every sample (no other fallback). Deltas are raw; they are not re-centered on the league mean, so early in the season a league-wide shift from last year shows up in every team's number.

**Deltas and samples.** Game delta = actual - baseline (one decimal). Samples use the Points Allowed windows (2026, 2025, Last 5, Last 8 across the season boundary). Yds = mean game delta. % = `100 * sum(actual - baseline) / sum(baseline)` (a ratio of sums, not a mean of game percentages), withheld when the sampled games' mean baseline is under 10 yards per game and always withheld for QB RUSH (near-zero and negative baselines are routine). Each cell also stores `gamesAbove` and `gamesBelow` (exactly 0 counts as neither), shown as the cell tooltip.

**Reading it.** Positive = opponents beat their normal production (bad for the defense); negative = held below normal (good). Rank 1 is the most negative delta; ties break by fewer games above average, then team. Heat is rank-driven with the same palette and direction as Points Allowed; the Yds and % modes rank independently. Samples under 3 games keep their value but use the shared muted small-sample tint (`TABLE_CONVENTIONS.md` section G). Defaults: 2026, Yds, Raw.

**Artifact.** `games[]` holds every 2025/2026 defense-game (key, offense, defense, other-game count, blend weights, actual and baseline by metric) so a later drilldown needs no schema change; `rows[]` holds per-team, per-sample, per-metric `gamesSampled`, `deltaYds`, `deltaPct`, `rankYds`, `rankPct`, `gamesAbove`, `gamesBelow`. It is written with each game and each sample block on one line. `npm run nfl:validate-yards-vs-average -- --season=<S>` fails unless the artifact equals a fresh rebuild from the cache and passes the structural checks in `validate.ts`; upstream lag is a warning only. `.github/workflows/nfl-allowed-by-position.yml` regenerates and validates it after Fantasy Points Allowed; it is intentionally not part of the `nfl-yardage-projections.yml` backstop.
