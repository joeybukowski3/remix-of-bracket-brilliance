# Completed plan — NFL power rating v0.3.0 → v0.3.1 EPA source migration

**Status: COMPLETE (historical provenance).** Delivered by Phase 7B of the NFL
Matchup Analyzer redesign. This document is a distilled record. **It is not
current methodology authority.**

Current methodology authority:
[../../models/nfl-power-rating.md](../../models/nfl-power-rating.md).

## Objective

Migrate the NFL power rating's EPA input from the legacy `stats_team_week`
aggregate (`passing_epa` + `rushing_epa`) to nflfastR play-by-play, **without
changing the model's mathematics**, and publish the v0.3.1 preseason-anchor and
review family from the new source.

## What changed

- **EPA source only.** Legacy `stats_team_week` (scrambles booked as rushing,
  ~3.2% of eligible plays missing) → nflfastR play-by-play with a play-level
  eligible-play filter (pass or rush indicator, present EPA and possession
  team, no two-point attempt).
- The v0.3.0 → v0.3.1 version bump records the source change.

## Why it changed

- The legacy aggregate had incomplete play coverage and a scramble
  classification that did not match the play-by-play definition used elsewhere
  in the redesign's EPA work, making the rating inconsistent with the
  matchup-display EPA it sat beside.

## What was preserved

- The composite: 40% opponent-adjusted offensive EPA/play + 40% inverted
  opponent-adjusted defensive EPA/play + 20% opponent-adjusted point
  differential/game.
- One-pass opponent adjustment; trajectory lambda 0 (zero-weight final-eight
  term); fixed `0.733` scale divisor; public scale 50 ± 15 clamped to [1, 99].
- Preseason ratings for season N built from the completed season N−1.
- `rankChange` / `ratingChange` published as null in the first v0.3.1
  publication — a definition change is not team movement, and movement is only
  computed against a prior of the same model version.

## Validation performed

Reproduced the Phase 7 audit predictions to three decimal places across four
preseasons (2023–2026):

| Preseason | Built from | Mean Δrating | Spearman | Teams moving ≥3 places |
| --- | --- | --- | --- | --- |
| 2023 | 2022 | 1.339 | 0.9824 | 3 |
| 2024 | 2023 | 1.382 | 0.9919 | 2 |
| 2025 | 2024 | 1.949 | 0.9879 | 1 |
| 2026 | 2025 | 1.302 | 0.9941 | 1 |

Rank order was highly stable; the largest single-team rating shift was ~5.5
points. Full 32-team before/after tables are in the evidence doc.

## Historical role today

`nfl-power-v0.3.1` is **still an active artifact and preseason-anchor family**,
but it is **not** the canonical live 2026 OVR calculation. Current NFL live
team-strength architecture has evolved beyond v0.3.1:

- The canonical **Current OVR** board is a *composition* — `nfl-power-v0.4-beta`
  `rating2026` as the OVR preseason anchor, `nfl-power-v0.3.1` preseason
  `offenseRating` / `defenseRating` as the OFF / DEF anchors, and a full-season
  **Team Performance Rating** (Model C composite: opponent-adjusted filtered
  EPA/play, traditional success rate, unfiltered explosive-play rate, 40/40/20)
  as the live input, blended by a team-specific completed-game weight table
  that reaches 100% live evidence by each team's sixth game.
- The live Team Performance EPA is also nflverse/nflfastR play-by-play but
  applies its own documented garbage-time treatment and its own fitted public
  divisors — it must not be silently equated with the v0.3.1 EPA contract.
- v0.3.1's *overall* rating has no live OVR consumer; only its OFF/DEF
  preseason anchors and its embedded base rating inside v0.4 remain load-bearing.
- The v0.3.1 producer (`generate-nfl-v03-artifacts.mjs`) still publishes the
  review and preseason family; dedicated v0.3 review, historical-trend, and
  calibration paths still consume it.

## Current docs that own methodology now

- [../../models/nfl-power-rating.md](../../models/nfl-power-rating.md) — the
  composed Current OVR system, the v0.3.1 role, the intentional coexistence of
  two EPA definitions, and reopening criteria.
- [../../models/nfl-projected-spread.md](../../models/nfl-projected-spread.md) —
  the downstream Power Number / spread model.
- [nfl-matchup-analyzer-redesign.md](nfl-matchup-analyzer-redesign.md) — the
  parent redesign plan.

## Historical evidence

- [../../nfl-power-v0.3.1-epa-migration.md](../../nfl-power-v0.3.1-epa-migration.md)
  — the migration report with full per-team before/after tables.
- [../../nfl-matchup-analyzer-redesign-spec.md](../../nfl-matchup-analyzer-redesign-spec.md)
  §26 (Phase 7B implementation note), §25 (Phase 6 EPA efficiency).

## Completion status

Complete. The migration behaved exactly as the pre-implementation analysis
forecast. Retained for provenance only.
