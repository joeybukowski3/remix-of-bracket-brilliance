# NFL yardage Matchup Score research (Phase 8)

## 1. Status and conceptual contract

Phase 8 implements research-only 0-100 Matchup Scores for passing, rushing,
and receiving. It does not promote any projection model to production-ready.
The approved Phase 7 projection architectures are unchanged:

- Passing: direct ridge passing-yard model (alpha 10).
- Rushing: projected carries x shrunk YPC.
- Receiving: projected targets x shrunk YPT, with the existing position
  segmentation decision preserved where applicable.

The four concepts remain structurally separate:

```text
Projection    = expected statistical output
Matchup Score = favorability of opportunity and football environment
Prop Edge     = future sportsbook line versus projection (not built)
Uncertainty   = expected error/dispersion (not a score input)
```

No projected-yard value, actual target-game yardage, prediction-interval
width, residual-risk flag, sportsbook line, or betting result enters a score.

## 2. Opportunity versus environment

Every score exposes three top-level values:

- `opportunityScore`: expected meaningful usage or volume environment.
- `environmentScore`: the unweighted mean of the selected non-opportunity
  dimensions, retained for interpretation.
- `matchupScore`: the selected development-weighted composite.

The companion scores are useful and are retained. They make high
opportunity/ordinary environment and modest opportunity/excellent environment
directly inspectable. They are components, not confidence scores.

## 3. Market dimensions

### Passing

- **Opportunity:** team offensive plays, team pass attempts, the QB's prior
  attempt role, team dropback rate, neutral pass rate, and PROE.
- **Opponent:** pass attempts allowed, dropback rate allowed, and pass EPA/play
  allowed.
- **Game environment:** total, implied team total, spread as a trailing-script
  volume signal, and dome status. Passing alone retains market context because
  the Phase 4/7 development ablations established material value.
- **Passing quality:** prior QB YPA and completion rate. These are pregame QB
  profile inputs, not projected passing yards.

Pass success rate is not available in the committed historical weekly feature
surface and was not fabricated.

### Rushing

- **Workload:** prior carries/game and carry share.
- **Role quality:** prior team top-RB carry-share concentration.
- **Team rushing environment:** team rush attempts, inverse dropback rate, and
  inverse PROE.
- **Opponent:** rush attempts allowed and rush EPA/play allowed.

Workload is capped at 50% of a candidate. Market context is excluded because
the Phase 5/7 development tests found essentially no incremental value. Trench
is excluded because there is no validated historical per-week trench source.

### Receiving

- **Opportunity:** targets/game, target share, team pass attempts, dropback
  rate, and PROE.
- **Role stability:** negative absolute last-three versus season-prior changes
  in target volume and target share. High scores mean a more stable prior role.
- **Opponent:** targets allowed and pass EPA/play allowed.
- **Efficiency profile:** prior yards/target and aDOT. These are percentile
  profile indicators, not the projected YPT leg or projected yards.

Market context is excluded because Phase 6/7 found no development value.

## 4. Historical normalization

Each raw indicator is mapped through a mid-rank empirical CDF. Higher-is-better
and lower-is-better direction is declared per indicator. Dimension scores are
the equal mean of their indicator percentiles; candidate scores are weighted
means of dimension scores and are clamped to 0-100.

- During candidate/weight selection, every validation row uses a reference
  built only from that fold's training seasons.
- The final research reference is frozen on 2022-2024 and versioned as
  `nfl-yardage-matchup-reference-2022-2024-v1`.
- 2025 is applied to that already-frozen reference and never alters it.
- Missing player/team history maps to neutral 50. Week 1 therefore uses a
  prior-season feature where available and otherwise receives a neutral input;
  it never uses a Week 1/current-season distribution.
- No yearly min/max scaling is used. The frozen reference prevents arbitrary
  annual rescaling and makes environmental drift visible rather than hiding it.

50 therefore approximates a development-era league-typical environment.
Normalization is market-specific. Receiving uses position-specific indicator
references in the winner so an 85 remains an exceptional within-role receiving
environment regardless of whether the player is an RB, WR, or TE.

The 2022 rows in the season-distribution table are descriptive scores against
the final fixed 2022-2024 research reference. Model/weight selection uses only
the true rolling validation rows (2023 and 2024), not that descriptive view.

## 5. Weight-selection methodology

Equal weighting is the transparent benchmark. Predictive weighting enumerates
a deterministic non-negative 0.1-step grid with:

- every included dimension at least 0.1;
- opportunity/workload no greater than 0.5;
- average development-fold correlation with actual yards as the objective;
- automatic rejection if average score/projection correlation is at least
  0.95.

This is a small constrained search over plainly disclosed weights, not a
black-box model. It uses football outcomes, never sportsbook outcomes. A small
complexity penalty (0.005 per dimension beyond two) prevents a negligible
correlation gain from automatically choosing a larger candidate. Receiving's
final semantic decision is described in Section 8.

## 6. Passing candidates and winner

| Candidate | Dimensions | Equal-weight dev corr (actual / projection) | Selected weights | Weighted dev corr (actual / projection) |
|---|---|---:|---|---:|
| P1 | Opportunity + opponent | 0.11 / 0.43 | 0.4 / 0.6 | 0.11 / 0.41 |
| P2 | P1 + game environment | 0.11 / 0.38 | 0.3 / 0.5 / 0.2 | 0.12 / 0.39 |
| **P3** | P2 + passing quality | **0.19 / 0.64** | **opportunity 0.2, opponent 0.3, quality 0.4, game 0.1** | **0.21 / 0.70** |

P3 wins. Prior QB quality earns real development influence, while opportunity
is only 20%; the resulting score is primarily a non-volume environment/profile
view rather than a proxy for the direct yardage projection.

## 7. Rushing candidates and winner

| Candidate | Dimensions | Equal-weight dev corr (actual / projection) | Selected weights | Weighted dev corr (actual / projection) |
|---|---|---:|---|---:|
| R1 | Workload + opponent | 0.50 / 0.65 | 0.5 / 0.5 | 0.50 / 0.65 |
| R2 | R1 + team environment | 0.44 / 0.60 | 0.5 / 0.2 / 0.3 | 0.56 / 0.76 |
| **R3** | R2 + role quality | **0.39 / 0.54** | **workload 0.5, role 0.1, team 0.2, opponent 0.2** | **0.58 / 0.81** |

R3 wins. Workload is genuinely the strongest rushing signal and reaches the
pre-specified 50% cap, but 50% remains reserved for committee/team/opponent
environment. The high-score/modest-projection example in Section 13 confirms
that the design can reward a favorable environment without fabricating volume.

## 8. Receiving candidates and winner

| Candidate | Normalization | Equal-weight dev corr (actual / projection) | Selected weights | Weighted dev corr (actual / projection) |
|---|---|---:|---|---:|
| C1 opportunity + opponent | Pooled | 0.27 / 0.43 | 0.5 / 0.5 | 0.27 / 0.43 |
| C2 + role stability | Pooled | 0.06 / 0.12 | 0.5 / 0.1 / 0.4 | 0.25 / 0.42 |
| C3 + efficiency | Pooled | 0.23 / 0.36 | 0.5 / 0.1 / 0.1 / 0.3 | 0.42 / 0.68 |
| **C3 + efficiency** | **Position-specific** | **0.14 / 0.25** | **opportunity 0.5, stability 0.1, opponent 0.1, efficiency 0.3** | **0.31 / 0.56** |

The unconstrained correlation winner is pooled C3, but it fails the requested
cross-position presentation meaning: its retrospective means were roughly 41
for RB, 48 for TE, and 55 for WR. Position-normalized C3 is selected instead.
This decision uses development semantics and the declared requirement, not a
2025 outcome metric. Under the frozen selected design, retrospective means are
49.1 RB / 50.0 WR / 49.2 TE and p90 is 64.0 / 64.1 / 64.5. The same displayed
score now has comparable within-role meaning.

## 9. Independence and outcome relationship

| Market | Dev corr: score vs projection | Dev corr: score vs actual | 2025 corr: score vs projection | 2025 corr: score vs actual |
|---|---:|---:|---:|---:|
| Passing | 0.66 | 0.24 | 0.58 | 0.18 |
| Rushing | 0.80 | 0.58 | 0.81 | 0.59 |
| Receiving | 0.55 | 0.30 | 0.59 | 0.32 |

No design approaches the 0.98-1.00 rejection range. Rushing is closest because
real workload appropriately affects both quantities, but its 0.81 correlation
still leaves substantial independent environment variation.

Development outcome behavior is directionally sensible:

| Market | Difficult mean actual yards | Challenging | Neutral | Positive | Elite |
|---|---:|---:|---:|---:|---:|
| Passing | 201.4 | 208.6 | 231.0 | 243.3 | 276.2 |
| Rushing | 2.0 | 4.2 | 12.1 | 28.7 | 60.0 |
| Receiving | 8.4 | 14.9 | 24.5 | 33.3 | 41.8 |

Passing's 2025 elite slice is not monotonic (23 rows, 231.6 yards versus 239.6
in Positive), while development is monotonic. This is reported as small-sample
retrospective variance, not used to retune thresholds or weights.

## 10. Historical stability

| Market | Season | n | Mean | Median | SD |
|---|---:|---:|---:|---:|---:|
| Passing | 2022 | 542 | 50.4 | 49.9 | 11.6 |
| Passing | 2023 | 544 | 50.6 | 50.6 | 11.8 |
| Passing | 2024 | 544 | 49.0 | 50.0 | 12.1 |
| Passing | 2025 retrospective | 544 | 50.7 | 50.7 | 11.9 |
| Rushing | 2022 | 2,886 | 50.5 | 50.0 | 15.7 |
| Rushing | 2023 | 3,417 | 48.6 | 48.7 | 15.5 |
| Rushing | 2024 | 3,387 | 51.0 | 51.0 | 16.1 |
| Rushing | 2025 retrospective | 3,448 | 48.8 | 48.3 | 15.5 |
| Receiving | 2022 | 4,339 | 52.3 | 52.7 | 12.3 |
| Receiving | 2023 | 5,369 | 50.7 | 50.9 | 11.5 |
| Receiving | 2024 | 5,244 | 47.4 | 47.4 | 11.6 |
| Receiving | 2025 retrospective | 5,179 | 49.5 | 49.6 | 11.3 |

No market exhibits a radical seasonal meaning shift. Receiving shows the
largest development movement (2022 mean 52.3 to 2024 mean 47.4), but 2025
returns to 49.5 under the unchanged reference. Full p05/p10/p25/p50/p75/p90/p95
and per-season band distributions are in the research artifact.

## 11. Interpretation bands and population shares

Common thresholds come from pooled selected-score development p10/p30/p70/p90,
rounded to five points and then frozen:

- 0-29: Difficult
- 30-44: Challenging
- 45-54: Neutral
- 55-69: Positive
- 70-100: Elite

Because weighted averages of several percentiles are less dispersed than one
raw percentile, 70—not 85—is the empirical elite boundary. An 85 remains elite
in every market and, for receiving, every position.

| Market/period | Difficult | Challenging | Neutral | Positive | Elite |
|---|---:|---:|---:|---:|---:|
| Passing dev | 5.2% | 28.2% | 32.6% | 29.4% | 4.5% |
| Passing 2025 | 4.2% | 29.0% | 28.1% | 34.4% | 4.2% |
| Rushing dev | 11.6% | 27.4% | 22.2% | 27.4% | 11.4% |
| Rushing 2025 | 12.4% | 30.3% | 22.6% | 24.2% | 10.5% |
| Receiving dev | 4.8% | 29.0% | 31.8% | 29.8% | 4.6% |
| Receiving 2025 | 4.2% | 30.6% | 33.8% | 27.8% | 3.5% |

## 12. Hard-case behavior

- **Passing:** 2025 multi-QB games average 51.4 and no-history QBs 50.3.
  Uncertainty does not force a poor score; missing QB history contributes
  neutral inputs while opponent/game information still moves the result.
- **Rushing:** committee rows average 45.7, low-history rows 42.2, and
  high-volume backs 72.8. Committee/low-history scores are lower mainly through
  observable workload/role conditions, not an uncertainty penalty. Their
  environment companion scores remain separately visible.
- **Receiving:** low-history rows remain near neutral. Zero-target outcomes are
  a retrospective diagnostic only and never a score input; their lower mean is
  explained by prior opportunity. Volatile-share rows are not assigned a
  blanket poor score—stability is only 10% of the selected composite.

Prediction-interval width and Phase 7 hard-case residuals never enter the
Matchup Score.

## 13. Historical separation examples (2025 retrospective)

| Market/case | Player | Score | Opportunity | Environment | Projection |
|---|---|---:|---:|---:|---:|
| Passing high/high | Jacoby Brissett W9 | 67.4 | 82.1 | 69.8 | 266.3 |
| Passing high/modest | Aaron Rodgers W2 | 66.7 | 44.8 | 59.7 | 221.7 |
| Passing low/high | Dak Prescott W2 | 40.3 | 56.4 | 41.4 | 260.9 |
| Passing low/low | Tyler Shough W12 | 39.8 | 42.1 | 40.6 | 207.0 |
| Rushing high/high | Ashton Jeanty W14 | 70.6 | 95.2 | 54.7 | 56.9 |
| Rushing high/modest | Savion Williams W6 | 62.6 | 44.2 | 79.6 | 4.4 |
| Rushing low/high | Justin Herbert W2 | 40.3 | 78.8 | 1.6 | 30.8 |
| Rushing low/low | Andy Dalton W17 | 34.6 | 25.5 | 41.7 | 0.3 |
| Receiving high/high | Quentin Johnston W11 | 64.4 | 77.6 | 50.0 | 53.5 |
| Receiving high/modest | Ty Johnson W2 | 64.1 | 70.1 | 63.7 | 11.2 |
| Receiving low/high | Josh Downs W1 | 40.6 | 42.9 | 41.4 | 54.4 |
| Receiving low/low | Mo Alie-Cox W13 | 39.4 | 38.4 | 41.7 | 5.5 |

These are percentile-corner examples selected mechanically, not cherry-picked
for their realized result. In particular, the high-score/modest-projection and
low-score/high-projection rows demonstrate the intended conceptual separation.

## 14. Canonical schema

`src/lib/nfl/props/types/matchupScore.ts` defines the v2 discriminated union:

- common identity/game fields;
- `matchupScore`, `opportunityScore`, and `environmentScore`;
- `scoreVersion` and `referenceDistributionVersion`;
- market-specific `components` with dimension and indicator scores;
- receiving position for reference interpretation.

It has no projected-yard, interval, sportsbook, edge, probability, confidence,
lean, or recommendation field. `types/projection.ts` re-exports the canonical
score type while projections remain a separate schema.

## 15. Stale rushing artifact review

`data/nfl/props/rushing-outcomes-2022-2025.json` is methodologically superseded
by v2, but it is **not unreferenced**: the legacy
`scripts/run-nfl-rushing-baseline-competition.ts` still consumes it and the
legacy generator/runner remain exposed through package scripts. Therefore the
artifact was not deleted. The old Phase 5 report is now explicitly marked
historical/superseded. Removing the legacy generator, runner, package commands,
artifact, and old report should be one separately approved cleanup so no live
command is silently broken.

## 16. Implementation-defect correction

Reuse inspection found the Phase 7 cross-market runner passed pass EPA into the
rushing feature builder's generic EPA slot. Rushing's selected decomposition
does not consume that input, so the approved winner and projection outputs do
not change. The runner now constructs separate pass- and rush-EPA logs. Its
rushing direct-model robustness diagnostic is regenerated with the intended
rush EPA input.

## 17. Production readiness and remaining concerns

All markets remain research baselines. Phase 8 does not meet Phase 7's open
operational status/history/interval gates or passing calibration gate.

Concerns before any sportsbook/edge phase:

- Score/outcome relationships are moderate, especially passing; the score is a
  presentation aid, not a calibrated probability.
- Passing's quality component carries 40%; future research should monitor
  whether QB/team identity changes make that profile stale.
- Rushing retains an intentionally strong workload contribution and has the
  highest projection correlation (0.81); the component display is important.
- Receiving chooses semantic cross-position comparability over the pooled
  candidate's stronger raw outcome correlation.
- Fixed references need an explicit versioned refresh policy before live use;
  silent annual recalibration would destroy longitudinal meaning.
- No sportsbook integration, Over/Under testing, prop edge, betting
  recommendation, UI, confidence score, or production artifact/API was built.

## 18. Validation and artifact

The detailed machine-readable candidate folds, correlations, distributions,
bands, hard cases, and examples are stored in
`data/nfl/props/matchup-score-research.json`. Exact validation commands and
results are reported in the Phase 8 handoff.
