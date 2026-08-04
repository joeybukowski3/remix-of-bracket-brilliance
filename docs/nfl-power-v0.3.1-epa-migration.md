# NFL power rating v0.3.0 → v0.3.1 — EPA source migration

Produced by Phase 7B. The model's mathematics are unchanged: 40% opponent-adjusted
offensive EPA/play + 40% inverted opponent-adjusted defensive EPA/play + 20%
opponent-adjusted point differential/game, one-pass opponent adjustment, trajectory
lambda 0, and the public scale 50 ± 15 clamped to [1, 99]. The only change is the
EPA source: legacy `stats_team_week` (`passing_epa` + `rushing_epa`, scrambles booked
as rushing, ~3.2% of eligible plays missing) → nflfastR play-by-play.

Preseason ratings for season N are built from the completed season N−1.

## Summary

| Preseason | Built from | Mean Δrating | Max Δrating | Mean Δrank | Max Δrank | Spearman | ≥3 places | ≥5 pts |
|---|---|---|---|---|---|---|---|---|
| 2023 | 2022 | 1.339 | 5.487 | 1.00 | 6 | 0.9824 | 3 | 1 |
| 2024 | 2023 | 1.382 | 4.150 | 0.62 | 4 | 0.9919 | 2 | 0 |
| 2025 | 2024 | 1.949 | 4.852 | 1.19 | 3 | 0.9879 | 1 | 0 |
| 2026 | 2025 | 1.302 | 5.038 | 0.69 | 3 | 0.9941 | 1 | 1 |

These reproduce the Phase 7 audit predictions (mean ~1.34 / ~1.38 / ~1.95 / ~1.30;
Spearman ~0.982 / ~0.992 / ~0.988 / ~0.994) to three decimal places, confirming the
production migration behaves exactly as the scratchpad analysis forecast.

## Top and bottom five by season

**2023 preseason (from 2022)**

- Top 5 before: SF BUF KC PHI DAL
- Top 5 after: SF BUF PHI KC CIN
- Bottom 5 before: HOU CHI IND ATL ARI
- Bottom 5 after: HOU CHI IND ATL ARI  *(unchanged)*

**2024 preseason (from 2023)**

- Top 5 before: BAL SF DAL BUF CLE
- Top 5 after: BAL SF DAL BUF CLE  *(unchanged)*
- Bottom 5 before: WSH CAR ARI NYG NE
- Bottom 5 after: WSH CAR ARI NYG NE  *(unchanged)*

**2025 preseason (from 2024)**

- Top 5 before: BAL DET PHI GB DEN
- Top 5 after: DET BAL PHI GB BUF
- Bottom 5 before: CAR JAX NYG NE DAL
- Bottom 5 after: CAR JAX NE CLE NYG

**2026 preseason (from 2025)**

- Top 5 before: LAR SEA HOU JAX BUF
- Top 5 after: LAR SEA HOU BUF NE
- Bottom 5 before: NYJ TEN LV WSH MIA
- Bottom 5 after: NYJ TEN LV MIA WSH

## Full 32-team comparison — 2026 preseason (from the 2025 season)

| Team | Old rating | New rating | Delta | Old rank | New rank | Rank delta |
|---|---|---|---|---|---|---|
| LAR | 75.82 | 80.85 | +5.04 | 1 | 1 | +0 |
| SEA | 72.87 | 74.36 | +1.49 | 2 | 2 | +0 |
| HOU | 68.13 | 68.39 | +0.26 | 3 | 3 | +0 |
| BUF | 65.04 | 65.86 | +0.82 | 5 | 4 | +1 |
| NE | 64.35 | 65.74 | +1.39 | 6 | 5 | +1 |
| JAX | 66.46 | 65.58 | -0.88 | 4 | 6 | -2 |
| PHI | 63.22 | 62.08 | -1.14 | 7 | 7 | +0 |
| DET | 61.25 | 59.89 | -1.37 | 9 | 8 | +1 |
| IND | 60.38 | 59.83 | -0.55 | 10 | 9 | +1 |
| DEN | 62.56 | 58.65 | -3.91 | 8 | 10 | -2 |
| GB | 56.17 | 56.98 | +0.81 | 12 | 11 | +1 |
| KC | 58.01 | 56.47 | -1.54 | 11 | 12 | -1 |
| SF | 55.02 | 56.42 | +1.40 | 14 | 13 | +1 |
| LAC | 55.61 | 55.43 | -0.18 | 13 | 14 | -1 |
| MIN | 50.92 | 53.21 | +2.29 | 18 | 15 | +3 |
| BAL | 54.90 | 53.11 | -1.78 | 15 | 16 | -1 |
| CHI | 53.95 | 52.54 | -1.41 | 16 | 17 | -1 |
| PIT | 52.43 | 51.10 | -1.33 | 17 | 18 | -1 |
| TB | 47.74 | 49.54 | +1.79 | 19 | 19 | +0 |
| ATL | 45.94 | 46.23 | +0.29 | 20 | 20 | +0 |
| NO | 45.11 | 43.53 | -1.58 | 21 | 21 | +0 |
| NYG | 42.81 | 43.06 | +0.25 | 22 | 22 | +0 |
| CAR | 38.92 | 40.76 | +1.84 | 23 | 23 | +0 |
| ARI | 38.85 | 39.01 | +0.16 | 24 | 24 | +0 |
| DAL | 35.86 | 37.46 | +1.60 | 26 | 25 | +1 |
| CIN | 36.01 | 35.72 | -0.29 | 25 | 26 | -1 |
| CLE | 35.67 | 34.98 | -0.69 | 27 | 27 | +0 |
| WSH | 32.97 | 34.38 | +1.41 | 29 | 28 | +1 |
| MIA | 35.60 | 34.28 | -1.32 | 28 | 29 | -1 |
| LV | 24.84 | 24.36 | -0.48 | 30 | 30 | +0 |
| TEN | 24.76 | 23.95 | -0.81 | 31 | 31 | +0 |
| NYJ | 17.84 | 16.25 | -1.59 | 32 | 32 | +0 |

## Movement fields

`rankChange` and `ratingChange` are null for all 32 teams in the first v0.3.1
publication. Movement is only computed against a prior of the same model version —
a definition change is not team movement, and reporting the migration delta as
rank/rating movement would imply teams had improved or declined when they had not.
