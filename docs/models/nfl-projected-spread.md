# NFL projected spread

## Current authority and relationship to the power rating

This document is the current methodology authority for the canonical NFL
margin system, `jkb-power-number-v1.0.0`. It has produced the public JKB
projected spread since 2026-08-19. Its implementation is
[`jkbPowerNumber2026.ts`](../../src/lib/nfl/jkbPowerNumber2026.ts), its producer
is
[`generate-nfl-matchup-projections.mts`](../../scripts/generate-nfl-matchup-projections.mts),
and its public artifact is
[`matchup-projections.json`](../../public/data/nfl/matchup-projections.json).

The two model documents remain necessary because the systems are related but
not identical:

```text
canonical Current OVR (1-99 team strength)
  -> average-relative Power Number (NFL points)
  -> neutral margin
  -> projected home margin after fixed HFA
```

The rating documented in
[`nfl-power-rating.md`](nfl-power-rating.md) owns Current OVR. This model consumes
that exact 32-team board and owns Power Number and projected margin. It does
not calculate a second OVR and does not consume raw EPA, point differential,
or the retired spread model's 45/35/20 strength composite directly.

## Purpose and public concepts

The model converts relative Current OVR strength into scoreboard points and
forecasts the home team's final scoring margin.

- **Current OVR / Power Rating / JKB Power** is the upstream 1–99 strength
  score.
- **Power Number** is how many points above (positive) or below (negative) the
  current league-average team a club rates on a neutral field.
- **Projected Spread / JKB Projected Spread** is the model's expected game
  margin rendered in conventional favorite-negative notation.
- **Model Analysis** is the consumer section that presents the projection,
  Power Number breakdown, market line, and descriptive comparison.
- **Model vs Market** is a post-model difference; it is not a model feature.

## Exact inputs and formula

The only model inputs are:

1. the complete canonical 32-team Current OVR board; and
2. the schedule's neutral-site boolean for the matchup.

A partial board is rejected because it would use the wrong league mean. The
five exact steps are:

```text
leagueAverageOVR = mean(Current OVR for all 32 teams)

team Power Number = (team Current OVR - leagueAverageOVR) * 0.24

neutralMargin = home Power Number - away Power Number

homeFieldAdvantage = neutralSite ? 0.0 : 2.0

expectedHomeMargin = neutralMargin + homeFieldAdvantage
```

The league-average term cancels between teams, so the margin is algebraically
equivalent to:

```text
expectedHomeMargin = 0.24 * (home Current OVR - away Current OVR)
                   + homeFieldAdvantage
```

There is no intercept, nonlinear term, team-specific HFA, margin clamp, Power
Number clamp, or projection guard band. Internal calculations remain
unrounded. Only the final sportsbook display is rounded to one decimal.

## Parameters and calibration

Production parameters are fixed:

- Current-OVR-to-points coefficient: `0.24`
- ordinary-site home-field advantage: `2.0` points
- neutral-site home-field advantage: `0.0` points
- intercept: none
- fitted-at-generation parameters: none

The production artifact accordingly declares `fittedParameters: []` and
`marketInputUsed: false`. There is no 3.5–5.5 beta guard band in the current
model; that band belongs only to retired `nfl-spread-v0.1.0`.

The fixed coefficient and HFA were selected from the committed Current-OVR
spread calibration in
[`nfl-current-ovr-spread-calibration/`](../../scripts/analysis/nfl-current-ovr-spread-calibration/).
It reconstructed 2023–2025 and evaluated 2024–2025 out of sample with strict
walk-forward, pre-kickoff ratings. Season fits put the OVR coefficient between
approximately 0.229 and 0.256; 0.24 is the approved stable midpoint rather
than a parameter re-fitted by the production generator.

HFA values 0, 1.5, 2.0, and 2.5 were grid-tested. Their pooled results were
close; 1.5 had the lowest grid MAE, while 2.0 was retained as a fixed policy
choice consistent with the previous public model. A jointly fitted HFA is not
used. An intercept was tested and rejected, and the quadratic diagnostic was
not adopted. Neutral games always receive exactly zero regardless of the
ordinary-site setting.

The current model does not independently choose a rolling window. Its sample
and recency behavior are inherited from the canonical Current OVR input:
team-specific preseason/live weights by completed games and full-season live
performance, as documented in the power-rating contract. Season/Last 5 UI
controls do not alter this projection.

## Output and sportsbook notation

`expectedHomeMargin` is the unrounded expected home scoring margin:

- positive means the home team is projected to win by that amount;
- negative means the away team is projected to win by its absolute value; and
- zero means an even matchup.

The display helper rounds that final value to one decimal and assigns the
favorite a negative sportsbook-style line. For example, an expected home
margin of `+4.46` displays `HOME -4.5`; `-2.96` displays `AWAY -3.0`; a value
that rounds to zero displays `PK`. The sign conversion and rounding are
presentation, not a new prediction.

## Market independence and comparison boundary

The producer reads the three canonical Current OVR input artifacts plus the
2026 schedule. It does not read
`public/data/nfl/matchup-market.json` and does not accept spreads, totals,
moneylines, odds, ATS history, or market-derived priors. Market is not an input
to Current OVR, Power Number, neutral margin, HFA, or projected margin.

[`projectionData.ts`](../../src/lib/nfl/projectionData.ts) and presentation
consumers join the market only after a model projection exists. With both
expressed as home-team margins, the descriptive comparison is:

```text
Model vs Market = model expectedHomeMargin - marketHomeMargin
```

A missing market line remains missing and does not replace or modify the model
projection. Conversely, a missing or malformed projection cannot be filled
with the market line.

Under KS-008 in [`DECISIONS.md`](../DECISIONS.md), neither the projection nor
Model vs Market is by itself an edge, +EV or value claim, best bet, pick,
recommendation, calibrated cover probability, win probability, confidence, or
stake size. Those claims require a separately documented and satisfied
validation gate.

## Validation and performance framing

The committed 2024–2025 walk-forward evaluation contains 544 games. For the
Current-OVR model at HFA 1.5—the calibration run's lowest-MAE grid point—it
records pooled MAE `10.2555`, RMSE `13.1498`, straight-up winner accuracy
`65.56%`, and bias `-0.5292`. At HFA 2.0, the production policy, pooled MAE is
`10.2624` and bias is `-0.0338`; season-specific coefficient fits are about
`0.23084` and `0.25641`.

The same 544-game market benchmark records MAE `9.6664`, RMSE `12.4393`, and
straight-up winner accuracy `68.32%`. The model-directed ATS diagnostic is
`50.46%` over 539 eligible games. Current evidence therefore does not show the
model beating the market and does not authorize profitability or betting-edge
language. These figures describe the committed calibration dataset, not a
guarantee of future performance or a calibrated uncertainty interval.

## Artifact, producer, and consumers

The production artifact uses schema `nfl-matchup-projections-v2` and model
version `jkb-power-number-v1.0.0`. For every game it carries the two Current
OVRs, league-average OVR, Power Numbers, neutral margin, HFA, unrounded expected
home margin, and display spread. The producer rebuilds Current OVR from:

- `public/data/nfl/2026/preseason-power-ratings.json`;
- `public/data/nfl/2026/projected-power-ratings-v04.json`;
- `public/data/nfl/2026/team-performance-analytics.json`; and
- `public/data/nfl/2026/games.json` for matchup and neutral-site data.

The producer refuses to overwrite a known-good artifact if no games can be
projected and writes atomically through a temporary file.

The artifact loader is
[`useNflMatchupProjections.ts`](../../src/hooks/useNflMatchupProjections.ts),
with validation and comparison logic in `projectionData.ts`. Public consumers
include NFL matchup cards, Matchup Detail and its Model Analysis/Details
sections, Team Schedules, and the weekly dashboard. Current UI copy uses
“JKB Projected Spread,” “Power Number,” “Current OVR,” “Model Analysis,” and
“Model vs Market.”

## Historical predecessor: `nfl-spread-v0.1.0`

`nfl-spread-v0.1.0` was retired from production on 2026-08-19 when
`jkb-power-number-v1.0.0` took ownership of the public projection artifact. It
has no live consumer and no remaining public surface. Its generator was moved
to
[`generate-legacy-projections.mjs`](../../scripts/analysis/nfl-spread-v0.1.0-legacy/generate-legacy-projections.mjs)
and may write only the analysis output
`scripts/analysis/nfl-spread-v0.1.0-legacy/out/legacy-matchup-projections.json`,
which is not a checked-in production artifact.

The retired model remains evidence for historical comparison and backtesting.
It directly built a 45% offense EPA / 35% inverted defense EPA / 20% point
differential strength score, used a prior-season games-equivalent `K = 2`,
fitted beta on strictly earlier complete seasons, fixed HFA at 2.0/0, and
required beta in the inclusive 3.5–5.5 guard band. None of those component
weights, its beta fit, its rolling sample, or its guard band belongs to the
current model. The current system replaced it functionally rather than using
it upstream.

Historical documentation that names `nfl-spread-v0.1.0` as the live public
spread predates this replacement and remains provenance, not current
authority.

## Relevant tests

- [`jkbPowerNumber2026.test.ts`](../../src/lib/nfl/jkbPowerNumber2026.test.ts):
  exact 0.24 transform, complete-board requirement, centering, rank
  equivalence, margins, fixed/neutral HFA, display rounding, and market
  independence.
- [`jkbPowerSpreadArtifact.test.ts`](../../src/lib/nfl/jkbPowerSpreadArtifact.test.ts):
  production artifact version, formulas, HFA, replacement status, and false
  market-input flag.
- [`projectionData.test.ts`](../../src/lib/nfl/projectionData.test.ts): schema,
  sign conventions, model-versus-market calculation, and consumer-layer join.
- [`MatchupModelAnalysis.test.tsx`](../../src/components/nfl/matchups/MatchupModelAnalysis.test.tsx),
  [`MatchupRedesign.test.tsx`](../../src/components/nfl/matchups/MatchupRedesign.test.tsx),
  and [`MatchupCard.test.tsx`](../../src/components/nfl/matchups/MatchupCard.test.tsx):
  public terminology, component display, and absence of prohibited edge/pick
  language.
- [`weeklyDashboard.test.ts`](../../src/lib/nfl/weeklyDashboard.test.ts) and
  [`WeeklyCommandCenter.test.tsx`](../../src/components/nfl/weekly-dashboard/WeeklyCommandCenter.test.tsx):
  projection and descriptive comparison in the weekly consumer.
- [`spreadModel.test.ts`](../../src/lib/nfl/spreadModel.test.ts) and
  [`spreadBacktest.test.ts`](../../src/lib/nfl/spreadBacktest.test.ts): retained
  tests for the retired predecessor, not proof that it is still production.

## Known limitations

- The model inherits every limitation and change in the unversioned composed
  Current OVR board.
- The 0.24 coefficient and 2.0 HFA are global fixed values; they do not adapt
  by team, stadium, travel, rest, quarterback, injury, weather, or season era.
- The projection is linear and supplies no uncertainty interval or calibrated
  win/cover probability.
- Neutral-site accuracy depends on schedule metadata.
- The calibration covers only reconstructed 2023–2025 ratings and 2024–2025
  out-of-sample games.
- The committed results do not beat the market benchmark.

## Versioning and reopening criteria

A change to the Current OVR input contract, complete-board requirement,
league-average centering, 0.24 coefficient, HFA values, neutral-site policy,
linearity, intercept, rounding/sign convention, market-input boundary,
artifact schema, or missing-data behavior requires review and a new model
version when it can change a published result. Reopen before fitting parameters
at generation time, adding team/venue-specific HFA, using a different rating
or direct performance components, adding market features, producing
uncertainty or probabilities, or making edge/+EV/recommendation claims.

Any future change to the upstream Current OVR methodology must also assess and
version this downstream model, because an unchanged `0.24` transform over a
changed rating scale is not automatically the same spread model.
