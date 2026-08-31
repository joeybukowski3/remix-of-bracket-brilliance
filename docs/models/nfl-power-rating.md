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
canonical Current OVR                -> jkb-power-number-v1.0.0 -> projected margin
```

There is no top-level model-version constant or model-version field for the
composed Current OVR board. Its independently versioned inputs are
`nfl-power-v0.4-beta`, `nfl-power-v0.3.1`, and the
`nfl-performance-v1` artifact schema. This missing aggregate version identifier
is a known governance limitation; it must not be papered over by calling the
current board `nfl-power-v0.3.1` or `jkb-power-number-v1.0.0`.

`jkb-power-number-v1.0.0` is downstream of Current OVR. It converts strength to
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
                  + 0.40 * DEF composite
                  + 0.20 * z(opponent-adjusted point differential/game)
```

The three metrics within OFF and DEF have equal weight. The top-level weights
are exactly 40% offense, 40% defense, and 20% point differential. The other six
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

The engine performs one full-season, one-pass adjustment:

```text
adjusted metric = raw metric - (opponent comparison mean - league comparison mean)
```

Offense compares against opponents' matching defense-allowed metric; defense
compares against opponents' matching offense metric; point differential
compares against opponents' own point differential. Rematches appear once per
game in the opponent list. This is not an iterative schedule solve.

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
- overall: `0.7224159319378768`

They make the pooled historical composite distribution mean 50 and standard
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

- The composed current system lacks one aggregate model version and one
  standalone Current OVR artifact.
- The v0.4 OVR anchor is beta, partly judgment-based, and has incomplete
  documented luck coverage; OFF/DEF use older v0.3.1 anchors instead.
- The live model has no within-season recency term and uses one-pass,
  full-season opponent adjustment.
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

The aggregate-version gap should be resolved the next time any output-changing
Current OVR methodology change is approved; a component version alone is not a
sufficient durable identifier for the composed public rating.
