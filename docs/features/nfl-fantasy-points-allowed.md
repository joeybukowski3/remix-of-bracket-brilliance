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
