# NFL power rating

## Current authority and model hierarchy

This document is the current methodology authority for the canonical 2026 NFL
team-strength system exposed publicly as **Current OVR**, **Power Rating**, and,
on some surfaces, **JKB Power**. The current calculation is implemented by
[`currentRating2026.ts`](../../src/lib/nfl/currentRating2026.ts) and loaded for
the application by
[`useNflCurrentRating2026.ts`](../../src/hooks/useNflCurrentRating2026.ts).

The canonical system is a composition, not `nfl-power-v0.3.1` alone:

```text
nfl-power-v0.4-beta rating2026       -> preseason OVR anchor
nfl-power-v0.3.1 OFF / DEF ratings   -> preseason OFF / DEF anchors
Team Performance Rating             -> live OVR / OFF / DEF evidence
team-specific completed-game blend  -> canonical Current OVR / OFF / DEF
canonical Current OVR (nfl-current-ovr-v1.1.0) -> jkb-power-number-v1.1.0 -> projected margin
```

The composed board has its own model identity, `nfl-current-ovr-v1.1.0`
([`currentOvrModelVersion.ts`](../../src/lib/nfl/currentOvrModelVersion.ts)),
stamped into `team-performance-analytics.json` (`_meta.currentOvrModelVersion`)
and `matchup-projections.json` (`model.currentOvrModelVersion`). The artifact
validator rejects any performance artifact whose version, opponent-adjustment
method, top-level weights or scale divisors differ from the committed model, so
an artifact from an earlier methodology can never be displayed as the current
rating. The pre-change composition (40/40/20 composite, one-pass opponent
adjustment, overall divisor 0.7224159319378768) is retroactively labelled
`nfl-current-ovr-v1.0.0` for documentation only; it was never archived under
that name. Its independently versioned inputs remain `nfl-power-v0.4-beta`,
`nfl-power-v0.3.1`, and the `nfl-performance-v1` artifact schema. The current
board must never be described as `nfl-power-v0.3.1` or `jkb-power-number-*`.

`jkb-power-number-v1.1.0` is downstream of Current OVR. It converts strength to
NFL points and projects a game margin; it does not own or replace the 1–99
Current OVR calculation. See
[`nfl-projected-spread.md`](nfl-projected-spread.md).

## Purpose and output meaning

Current OVR is a market-independent estimate of relative NFL team strength on
a public 1–99 scale. Current OFF and Current DEF are companion ratings on the
same scale. Higher is better. The values are scores, not ranks, points,
percentiles, probabilities, projected margins, or betting edges. Ranks are
computed from the finished ratings.

The public terms are related as follows:

- **Current OVR / Power Rating / JKB Power:** the canonical 1–99 team-strength
  value documented here.
- **Power Number:** Current OVR recentered on the 32-team mean and multiplied by
  0.24; it is expressed in points.
- **Projected Spread:** the difference between the two Power Numbers plus the
  applicable fixed home-field value.
- **Model Analysis:** a presentation section containing the projected spread,
  its components, and an optional market comparison.
- **Model vs Market:** a downstream descriptive difference, not a rating input.

## Exact current calculation

For each team and for each of OVR, OFF, and DEF:

```text
current rating = preseasonWeight * preseason anchor
               + performanceWeight * live performance rating
current rating = clamp(current rating, 1, 99)
```

The anchors and live inputs are exact and intentionally asymmetric:

| Output | Preseason anchor | Live input |
| --- | --- | --- |
| Current OVR | `nfl-power-v0.4-beta` `rating2026` | Team Performance `performanceRating` |
| Current OFF | `nfl-power-v0.3.1` preseason `offenseRating` | Team Performance `offenseRating` |
| Current DEF | `nfl-power-v0.3.1` preseason `defenseRating` | Team Performance `defenseRating` |

The same team-specific completed-game table applies to all three outputs:

| Completed games for that team | Preseason weight | Performance weight |
| ---: | ---: | ---: |
| 0 | 1.00 | 0.00 |
| 1 | 0.80 | 0.20 |
| 2 | 0.60 | 0.40 |
| 3 | 0.40 | 0.60 |
| 4 | 0.25 | 0.75 |
| 5 | 0.10 | 0.90 |
| 6+ | 0.00 | 1.00 |

Games played is read per team from the performance artifact, floored when
fractional, bounded below by zero, and capped at the 6+ row for weighting. It
is not a league week count. At zero games the immutable preseason values pass
through exactly. Once a team has played, all three finite performance ratings
are required; missing live inputs cause the board build to fail rather than
trigger a fallback. Each team's state becomes `live` after its first completed
game, while the board becomes `live` when any team has completed a game.

OVR, OFF, and DEF ranks are calculated independently after blending. An ordinal
rank is never blended. Ties use the shared deterministic descending-rank helper.

The previously shipped live formula
`preseasonV04 + evidenceWeight * (currentV03 - preseasonV03)` is explicitly
retired. No current consumer may independently select v0.3.1, v0.4, or Team
Performance and label that value current OVR/OFF/DEF.

## Preseason OVR anchor: `nfl-power-v0.4-beta`

The current OVR preseason anchor is the hand-curated 2026 projection in
[`projected-power-ratings-v04.json`](../../public/data/nfl/2026/projected-power-ratings-v04.json).
Its reconciled fields are:

```text
guideCalibrationAdjustment = 0.15 * (guideRating - jkbV03Rating)
rating2025Adjusted = jkbV03Rating
                   + guideCalibrationAdjustment
                   + luckAdjustment
projectionAdjustment2026 = personnelAdjustment
                         + coachAdjustment
                         + returningInjuryAdjustment
rating2026 = rating2025Adjusted + projectionAdjustment2026
```

Artifact metadata declares a guide-calibration cap of 3.0 rating points, a
luck-adjustment cap of 4.0, and a projection-adjustment cap of 8.0. The
committed validator proves the 32-team arithmetic within 0.15 rounding
tolerance and requires `rating2025Adjusted` and `rating2026` in [1, 99]. It
does not independently reproduce the human source process, and its current
tests do not prove enforcement of each declared component cap; the committed
artifact is therefore the approved input, not a formula for regenerating the
judgment calls.

Schedule strength is carried as context but `_meta.sosAffectsRating` is false.
The artifact identifies only eight teams as having detailed luck coverage; a
zero luck adjustment outside that set is a no-op, not proof of neutral luck.
Its status remains beta and its metadata recommends complete luck transcription
and an August roster/injury refresh before final publication.

The artifact is imported from an approved external JSON source by
[`import-nfl-power-v04-projection.mjs`](../../scripts/import-nfl-power-v04-projection.mjs),
not derived by the ordinary v0.3.1 generator.

## Live Team Performance Rating

The live input is produced from full-season completed-game evidence. The
approved Model C composite uses three equally weighted candidates per side:

```text
OFF composite = mean(
  z(opponent-adjusted filtered EPA/play),
  z(opponent-adjusted filtered traditional success rate),
  z(opponent-adjusted unfiltered explosive-play rate)
)

DEF composite = mean(
  z(-opponent-adjusted filtered EPA/play allowed),
  z(-opponent-adjusted filtered success rate allowed),
  z(-opponent-adjusted unfiltered explosive-play rate allowed)
)

Overall composite = 0.40 * OFF composite
                  + 0.20 * DEF composite
                  + 0.40 * z(opponent-adjusted point differential/game)
```

The three metrics within OFF and DEF have equal weight. The top-level weights
are exactly 40% offense, 20% defense, and 40% point differential (v1.0.0 used
40/40/20; see "Current OVR v1.1.0 change record"). The other six
offensive and six defensive metrics in the artifact are display/diagnostic
fields and have zero composite weight.

### EPA, success, explosives, and point differential

The live EPA source is nflverse play-by-play with nflfastR play-level EPA. EPA
and traditional success rate use the garbage-time-filtered bundles. Traditional
success means at least 40% of yards-to-go on first down, 60% on second down,
and 100% on third or fourth down; the nflfastR-style `EPA > 0` success metric
is diagnostic only. Explosive rate uses the unfiltered bundle because the
backtest found filtering degraded predictive performance.

Point differential per game comes from completed final scores in
`public/data/nfl/<season>/results.json`, which is also the source for opponents
faced. It is not derived from a sportsbook line.

### Opponent adjustment and sample behavior

The engine performs one full-season, leave-one-out (LOO) adjustment
(`leave-one-out-v1`):

```text
adjusted metric = raw metric
                - (mean over the team's games of the opponent's comparison value
                   EXCLUDING that game  -  league comparison mean)
```

Offense compares against opponents' matching defense-allowed metric; defense
compares against opponents' matching offense metric; point differential
compares against opponents' own point differential. Each game contributes one
term (rematches appear once per game). The comparison value for a game is the
opponent's rate over the opponent's OTHER games, so a game never partially
grades itself. When the opponent has no other games (every team after Week 1),
or is absent from the board, that game contributes the league mean, i.e. no
adjustment; a one-game sample therefore equals the raw value. The engine needs
per-game play sums for this (`TeamPerformanceGameEvidence`), which the generator
supplies from the same team-game cache and results.json it already reads. This
is not an iterative schedule solve.

The retired v1.0.0 method used each opponent's season-to-date aggregate, which
includes the game against the team being adjusted. That subtracted a fraction
1/n of the team's own performance (100% after one game, 50% after two). After
Week 1 it removed every team's entire offensive and defensive signal, leaving
only the league mean: 2026 Week 2 pregame ratings had 84% of teams sharing one
offense rating and one team pinned at the 99 clamp.

The live Current OVR uses the full current-season performance rating. There is
no L4/L8 live rating and no within-season recency weighting. The implementation
explicitly declines opponent adjustment for short L4/L8 boards because the
backtest found it harmful at half-season granularity.

The current system does not roll prior-season games into the live sample.
Prior-season information enters only through the preseason anchors, and the
game-count blend removes those anchors by each team's sixth completed game.

### Public transform and clamps

Each performance composite is transformed independently:

```text
performance public rating = clamp(50 + 15 * (composite / divisor), 1, 99)
```

The fixed divisors, fitted on 2023–2025 nflverse data (96 team-seasons) on
2026-08-18, are:

- offense: `0.9248507883569935`
- defense: `0.8648390483639914`
- overall: `0.8015993487311668` (v1.1.0 refit; v1.0.0 used
  `0.7224159319378768`)

The overall divisor was refit for v1.1.0 because the 40/20/40 composite is
about 11% wider than the 40/40/20 composite the old constant was fitted for
(pooled SD 0.8100 vs 0.7300 over 96 team-seasons); keeping 0.7224 would have
widened the public rating scale. The refit preserves the previous calibration
exactly: new = old x SD(new composite) / SD(old composite)
([`fit-overall-divisor.mts`](../../scripts/analysis/nfl-current-ovr-v1.1.0/fit-overall-divisor.mts),
result in `overall-divisor-fit.json`). The offense and defense divisors are
unchanged. They make the pooled historical composite distribution mean 50 and standard
deviation 15 before endpoint clamping. The resulting performance ratings are
then blended with the preseason anchors and clamped again to [1, 99].

## Preseason, movement, and change interpretation

Before a team completes a game, Current OVR/OFF/DEF equal its preseason
anchors. Each completed game moves that team to the next blend row; it does not
displace a particular prior-season game. The rating may move because the
team's own performance composite changes, the league distributions or
opponent adjustment change, or the preseason/performance weights change.
Consequently a week-to-week change is not solely a measure of that team's most
recent game.

The canonical board has no intrinsic `ratingChange` or `rankChange` field.
Consumer trend comparisons are presentation calculations against explicitly
named snapshots. The v0.3.1 preseason artifact's publication-to-publication
movement fields belong to that compatibility artifact and must not be
presented as canonical Current OVR movement.

The verified 2025→2026 rolling-eight behavior is also not this rating model. It
belongs to matchup-display sampling in
[`nfl-matchup-metrics.mjs`](../../scripts/lib/nfl-matchup-metrics.mjs): games
are ordered by kickoff date, and each completed current-season game displaces
one prior-season game until the eight-game display sample is current-season
only. It is game-count based, not week-count based. Current OVR instead uses
the explicit anchor/performance table above.

## Identity, artifacts, producers, and consumers

[`public/data/nfl/teams.json`](../../public/data/nfl/teams.json) is the
canonical 32-team identity registry. The current board requires a matching
v0.4 row, v0.3.1 preseason row, and performance row for every team. Missing or
non-finite required live values fail instead of being imputed.

There is no standalone generated Current OVR artifact. The browser builds the
board in `useNflCurrentRating2026` from:

- [`preseason-power-ratings.json`](../../public/data/nfl/2026/preseason-power-ratings.json)
  for v0.3.1 OFF/DEF anchors;
- [`projected-power-ratings-v04.json`](../../public/data/nfl/2026/projected-power-ratings-v04.json)
  for the OVR anchor; and
- [`team-performance-analytics.json`](../../public/data/nfl/2026/team-performance-analytics.json)
  for live evidence.

The performance producer is
[`generate-nfl-team-performance-analytics.mts`](../../scripts/generate-nfl-team-performance-analytics.mts).
It reads the compact nflverse cache under
[`data/nfl/nflverse/performance-team-game/`](../../data/nfl/nflverse/performance-team-game/),
season results, and the team registry. The matchup-projection producer
[`generate-nfl-matchup-projections.mts`](../../scripts/generate-nfl-matchup-projections.mts)
loads the same three rating artifacts and rebuilds the same canonical board
before applying the spread model.

Current consumers include the NFL Power Ratings, Matchups, Matchup Detail,
Standings, Super Bowl Odds, Team Guide, and Team Schedules pages; the weekly
dashboard; matchup cards; and team-dashboard/trend components. The Power
Ratings page's remaining v0.3 public loader call supplies W–L enrichment, not
its displayed OVR/OFF/DEF ratings.

## Superseded and compatibility methodology

### `nfl-power-v0.3.1`

`nfl-power-v0.3.1` remains an active artifact/preseason-anchor family and a
historical/review model. Its 40/40/20 composite uses opponent-adjusted offense
EPA/play, inverted defense EPA/play allowed, and point differential/game; it
uses the fixed `0.733` scale divisor, 1–99 transform, and a zero-weight
final-eight trajectory term. It supplies the current system's preseason OFF
and DEF anchors and is the base rating embedded in v0.4. It is not the
canonical live 2026 OVR calculation, and its current overall rating has no live
OVR consumer.

The v0.3.1 producer remains
[`generate-nfl-v03-artifacts.mjs`](../../scripts/generate-nfl-v03-artifacts.mjs),
which publishes the review and preseason family under
`public/data/nfl/<season>/`. Dedicated v0.3 review, historical trend, and
analysis/calibration paths still consume those artifacts.

### Intentional coexistence of EPA definitions

The repository retains two EPA definitions; they are not interchangeable:

- Current v0.3.1 and matchup-display EPA uses nflverse/nflfastR play-level EPA
  from the `matchup-epa-v1` cache. Eligible plays require a pass or rush
  indicator, present EPA and possession team, and no two-point attempt. This
  is authoritative for v0.3.1.
- The older `stats_team_week` generator derives passing plus rushing EPA with
  provider aggregate denominators and different scramble/play coverage. It
  belongs to legacy v0.1/v0.2 generation and is not authoritative for
  v0.3.1 or the current rating system.

The current live Team Performance EPA is likewise nflverse/nflfastR
play-by-play, but it applies its own documented garbage-time treatment and
must not be silently equated with either historical aggregation contract.

## Relevant tests

- [`currentRating2026.test.ts`](../../src/lib/nfl/currentRating2026.test.ts):
  exact anchors, blend weights, per-team game counts, clamps, missing-data
  failures, ranks, and retirement of the v0.3.1-delta calculation.
- [`performanceComposite2026.test.ts`](../../src/lib/nfl/performanceComposite2026.test.ts):
  Model C metrics, weights, opponent adjustment, public divisors, and clamps.
- [`teamPerformanceAnalytics.test.ts`](../../src/lib/nfl/teamPerformanceAnalytics.test.ts)
  and
  [`generate-nfl-team-performance-analytics.test.ts`](../../scripts/generate-nfl-team-performance-analytics.test.ts):
  artifact schema, zero-game behavior, sources, and producer invariants.
- [`v04Projection.test.ts`](../../src/lib/nfl/v04Projection.test.ts): v0.4
  version/base, 32-team arithmetic, scale, SOS exclusion, and luck coverage.
- [`publicPowerRatings.test.ts`](../../src/lib/nfl/publicPowerRatings.test.ts),
  [`matchupHeroMigration.test.ts`](../../src/lib/nfl/matchupHeroMigration.test.ts),
  and [`dashboardConsumerMigration.test.tsx`](../../src/lib/nfl/dashboardConsumerMigration.test.tsx):
  canonical consumer selection and absence of the retired live path.
- [`jkbPowerNumber2026.test.ts`](../../src/lib/nfl/jkbPowerNumber2026.test.ts):
  proves the downstream spread system consumes the exact Current OVR board.
- [`matchupSampleWindow.test.ts`](../../src/lib/nfl/matchupSampleWindow.test.ts):
  keeps matchup rolling-window behavior separate from Current OVR.

## Known limitations

- The composed current system has no standalone Current OVR artifact: the
  board is composed at read time from three artifacts by one library function.
- The v0.4 OVR anchor is beta, partly judgment-based, and has incomplete
  documented luck coverage; OFF/DEF use older v0.3.1 anchors instead.
- The live model has no within-season recency term and uses full-season
  leave-one-out opponent adjustment; at two games each opponent's comparison
  rests on a single other game, so early-season adjusted values are noisy
  (the audit found no adjustment at all to be statistically as good).
- Neither the composite nor the spread models quarterback changes: an
  established QB replaced by a lesser one costs about 5.6 points versus the
  projection on average (audit, 2021-2025), partly priced by the market.
- The weight table reaches 100% live evidence after only six team games.
- The model has no direct quarterback, availability, travel, rest, weather,
  venue, or market input once the season begins.
- League-wide z-scores and opponent means can move a team when other teams'
  data changes.
- The 1–99 output has no calibrated probability or betting interpretation.

## Versioning and reopening criteria

Create and document a new aggregate version before changing any anchor family,
blend weight, game-count threshold, input metric, garbage-time rule, success or
explosive definition, component weight, opponent adjustment, scale divisor,
public transform, clamp, missing-data behavior, identity contract, or rank
policy. Reopen the methodology before adding recency, changing the transition
away from preseason, restoring v0.3.1 overall as live OVR, introducing market
or availability inputs, or making probability/edge claims.

Any such change must bump `nfl-current-ovr` (MINOR for weights, adjustment or
constants) and re-assess the downstream `jkb-power-number` version.

## Current OVR v1.1.0 change record

Approved 2026-09-24 from the Current-OVR forensic audit
(`scripts/analysis/nfl-spread-audit-2026-09/`, walk-forward, 2020-2025
play-by-play). Changes: top-level weights 40/40/20 -> 40/20/40; opponent
adjustment one-pass -> leave-one-out; overall scale divisor refit. Unchanged:
blend schedule, EPA/SR/explosive definitions and garbage-time handling, OFF/DEF
sub-weights, 1-99 scale, 0.24 coefficient, 2.0 HFA. Note that leave-one-out also
changes the adjusted metrics behind Current OFF and DEF ratings.

Evidence (predicted home margin = 0.24 x dOVR + HFA, fixed constants, unchanged
transform), run through the production implementation by
[`backtest-production.mts`](../../scripts/analysis/nfl-current-ovr-v1.1.0/backtest-production.mts)
(results in `backtest-production.result.json`), 2024-2025 test games, n = 544:

| Model | MAE | RMSE | Correlation | Straight-up |
| --- | ---: | ---: | ---: | ---: |
| v1.0.0 (old) | 10.275 | 13.139 | 0.397 | 64.8% |
| v1.1.0 (new) | 10.101 | 12.986 | 0.429 | 65.9% |

Paired MAE difference -0.174, 95% CI [-0.283, -0.065]; better in every season
(2023 -0.107, 2024 -0.247, 2025 -0.101) and in games 1-2, 3-5 and 6+ of the
season. Both models remain about 0.4-0.6 MAE worse than the market benchmark, so
no edge or value claim follows (KS-008). The audit's dynamic scale matching gave
10.094 / 12.979; the small difference is the fixed refit divisor. The 2026 Weeks
1-2 holdout (n = 32) is descriptive only. Limitations: three seasons of real
preseason anchors (2021-2022 used a prior-season proxy), roughly 100 audited
variants without multiplicity correction, and 2026 sample size. Effective
production timestamp: set when this version's first artifact run is published.
