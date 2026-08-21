# Weekly fantasy input authority

Phase A defines inputs only. Nothing in this directory may publish a weekly
score or rank.

## Scoring

`jkb-full-ppr-v1.0.0` freezes the site's documented Full PPR format:

- 0.04 points per passing yard
- 4 per passing touchdown
- -2 per interception
- 0.1 per rushing or receiving yard
- 6 per rushing or receiving touchdown
- 1 per reception
- -2 per lost fumble
- 2 per passing, rushing, or receiving two-point conversion
- 6 per special-teams return touchdown credited to the player
- no yardage, long-play, first-down, or game bonuses

Changing any coefficient requires a new scoring version. Historical artifacts
retain the version used to calculate every outcome.

## Historical source and leakage policy

The supported source is nflverse's `player_stats` weekly release, projected to
QB/RB/WR/TE regular-season rows and committed with byte-level provenance.
Optional snap participation is joined through the existing GSIS-to-PFR
crosswalk and the exact same season/week/team only.

No row may use a later roster assignment, injury report, snap count, market
snapshot, or team metric. Historical pregame market snapshots are not currently
available and must remain unavailable rather than being reconstructed from a
later line.

The current source does not provide routes, route participation, red-zone
touches, goal-line touches, or red-zone targets. These fields stay `null`.

The nflverse weekly roster's `depth_chart_position` is a positional label, not
a depth order. `starterStatus` therefore remains `unknown` in the V1 input
contract.

## Phase B backtest boundary

Research code lives under `weekly/backtest`; generated research output belongs
under `data/fantasy/backtests`, never `public/data/fantasy/weekly`.

A player-stat file is not a ranking universe. Selecting only players who record
target-week stats leaks participation. The primary backtest therefore requires
complete weekly roster and injury sources for every modeled season. It builds
the candidate pool from week-effective `ACT` roster rows, excludes known OUT,
reserve, and bye rows before joining outcomes, and records eligible rostered
players without a stat row as zero-point outcomes. Missing injury seasons block
the backtest; absence from a complete weekly injury report does not.

Player strength and usage windows use only games before the target week.
Current-year FPA totals player points allowed by position per opponent game and
also stops at Week N-1. Team EPA and volume use only earlier team games. The
2025 market artifact has no per-row timestamp, so it is excluded from the
primary historical comparison even though production 2026 inputs may consume
a verified current pregame market.

The chronological split is frozen as 2023 training, 2024 model selection, and
2025 holdout. Ridge coefficients come only from training rows; regularization
is selected on 2024 before a final refit on 2023-2024. Missing model features
produce a missing score rather than league-average imputation. Internal scores
are research-only ordinal ranking signals, not published point projections.

Network-enabled generation order:

1. `npm run fantasy:player-week-cache -- --seasons=2023,2024,2025`
2. `npm run nfl:injury-cache -- --seasons=2023,2024,2025`
3. `npm run fantasy:player-week-history -- --generated-at=<ISO_TIMESTAMP>`
4. `npm run fantasy:weekly-backtest -- --generated-at=<SAME_ISO_TIMESTAMP>`
