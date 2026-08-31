# MLB HR Quality Score

## Current authority

This document is the current methodology and contract authority for the MLB
**HR Quality Score** (`hrScore`) — the per-batter relative matchup ranking that
orders the HR props board, drives HR best-bets selection, and seeds the HR
social-selection pool.

Subject to the authority hierarchy in [../DECISIONS.md](../DECISIONS.md).
`KS-007` and `KS-008` are binding: `hrScore` is **not** a probability, fair
value, edge, +EV/value claim, best bet, or calibrated forecast, and no surface
may present it as one. The separate EV-style view on the same page is a
different model — [mlb-hr-plus-ev.md](mlb-hr-plus-ev.md). Surface routing,
artifacts, and the social relationship live in
[../features/mlb-hr.md](../features/mlb-hr.md); external sources in
[../DATA_SOURCES.md](../DATA_SOURCES.md).

## Status / version

- **Status:** current production, user-facing.
- **Version:** `MLB_HR_MODEL_VERSION = "mlb-hr-quality-v1.1"`
  ([`scripts/lib/mlb-hr-model-version.mjs`](../../scripts/lib/mlb-hr-model-version.mjs)).
  Per that module's header, the constant currently versions the HR **pipeline**
  (payload schema, archive format, confidence rules); the scoring formula was
  not altered by the `v1.1` bump. Any future change to the weighting or inputs
  below must increment it.
- Published methodology copy: `HR_QUALITY_SCORE_METHODOLOGY` — "HR Quality Score
  is a relative matchup-quality ranking, not a calibrated probability."
- Archive dedup key: `date|playerId|gameId|modelVersion`.

## Purpose

Rank every batter on the slate by matchup-quality for hitting a home run today,
relative to the other batters on that slate. It is an ordering device for the
board, the best-bets cards, and the social pool — not a standalone estimate of
how likely any home run is.

## Current inputs

`computeBatterHrScore(batter, contexts)` in
[`scripts/generate-mlb-hr-props.mjs`](../../scripts/generate-mlb-hr-props.mjs)
produces a `baseHrScore` as a weight-renormalizing weighted average of these
components, each mapped to 0–100:

| Component | Mapping | Weight |
| --- | --- | --- |
| Barrel% | `blendRawAndPercentile`, raw band 3–20 | 0.22 |
| Hard-Hit% | blend, raw band 25–60 | 0.18 |
| xBA | blend, raw band 0.18–0.34 | 0.12 |
| Whiff% | blend, raw band 15–38, inverted | 0.08 |
| Last-7 HR count | `normalizeMetric` (min–max across the slate) | 0.10 |
| Last-30 HR count | `normalizeMetric` across the slate | 0.10 |
| Opposing pitcher **HR VS** score | see below | 0.15 |
| Park factor | `normalizeMetric` across the slate | 0.03 |
| Weather boost | `scaleToRange(boost + 10, 0, 20)` | 0.02 |
| Handedness HR-frequency score vs facing hand | `splitHrFrequencyScore` (HR/AB + ISO + K/PA + BB/PA for the facing hand only, `scripts/lib/mlb-hr-handedness-frequency.mjs`) | `HAND_FREQ_SCORE_WEIGHT = 0.10` |

`blendRawAndPercentile` = `0.6 · rawScaled + 0.4 · slatePercentileRank`; either
term is dropped (and the other reweighted) when non-finite.

**Opposing pitcher HR VS** (`computePitcherMatchupRatings(...).hrVs`,
renormalizing weighted average, rounded to 1 dp): pitcher xERA
`scaleToRange(2.5, 6.5)` w 0.30; Hard-Hit% blend band 28–55 w 0.25; Fly-Ball%
blend band 25–50 w 0.20; Barrel% blend band 4–14 w 0.25. When the batter's row
cannot be matched to a scored pitcher, HR VS falls back to a slate-normalized
value of the pitcher's HR/9 (`normalizeMetric`), else `50`.

**Post-multipliers** applied at generation so `hrScore` is the final number:

```
hrScore = round1( baseHrScore × xeraMult(pitcherXera) × regrAdj )
```

- `xeraMult` — step function on the opposing starter's xERA: `≤2.5 → 0.80`,
  `≤3.0 → 0.85`, `≤3.5 → 0.91`, `≤4.0 → 0.96`, `≤4.5 → 1.00`, `≤5.0 → 1.05`,
  `≤5.5 → 1.10`, else `1.15`; `1.00` when xERA is null.
  `pitcherXera` source order: matched pitcher `xera` → `pitcher-regression.json`
  `xera` → that file's `xfip` → null.
- `regrAdj` = `clamp(1 + regressionScore × 0.004, 0.96, 1.04)`; `1.00` when the
  pitcher has no `regressionScore`.

Batters are then sorted by `hrScore` descending, tie-broken by player name
ascending; `hrScoreRank` is the 1-based index in that order.

## Eligibility

The score itself has **no eligibility gate** — every batter listed in a
probable-pitcher matchup receives an `hrScore`. There is deliberately **no
minimum plate-appearance or sample-size filter** (contrast the `>300` PA gate in
[mlb-hr-plus-ev.md](mlb-hr-plus-ev.md), which is that model's alone).

- Opposing pitcher `"TBD"` → angle tags suppressed and the row is excluded from
  best-bets selection, but the row still receives a score.
- Best-bets / social eligibility is a separate downstream filter (see "Output
  interpretation").

## Formula / weights

See "Current inputs". All weights, raw bands, the `0.6 / 0.4` blend split, the
`xeraMult` breakpoints, and `regrAdj`'s `0.004` slope / `0.96–1.04` clamp are
the methodology and are fixed here.

## Fallbacks

- Any missing component is dropped and the remaining weights renormalize
  (`computeWeightedScore` returns `null` only if every component is missing).
- `scaleToRange` returns `50` on an invalid band and `null` on a non-finite
  value; `normalizeMetric` returns `50` with fewer than one finite slate value
  or when max equals min.
- Missing handedness split / pitcher hand → `splitHrFrequencyScore` null →
  component dropped (neutral, fail-open).
- Null `pitcherXera` → `xeraMult` = 1.00; null `regressionScore` → `regrAdj` =
  1.00.
- Zero generated pitcher or batter rows preserves the previous artifacts rather
  than publishing an empty slate.

## Clamps

- Component maps are clamped to `0–100`.
- `xeraMult ∈ [0.80, 1.15]`, `regrAdj ∈ [0.96, 1.04]`.
- Final `hrScore` is rounded to 1 dp. The **product is not re-clamped to
  0–100**; in practice values land roughly `0–95`.

## Output interpretation

`hrScore` is a slate-relative matchup-quality rank. Consumers:

- **Board ordering** and `hrScoreRank` on `/mlb/hr-props`.
- **Best-bets** — `selectDeterministicHrPicks`
  ([`scripts/lib/mlb-hr-selection.mjs`](../../scripts/lib/mlb-hr-selection.mjs)):
  eligible = `hrScore ≥ SELECTION_MIN_QUALITY_SCORE (40)` and opposing pitcher
  not `"TBD"`; `bestBets` = top 5; `valueBets` = next 3 that have `hrOddsYes`;
  `longshots` = ranks 8–25 with the longest positive American odds, limit 2.
  Selection is purely rule-based; Grok only writes wording for already-selected
  players and never chooses them.
- **Game HR-environment score** uses `QUALIFYING_HR_SCORE_THRESHOLD = 50` to
  count "qualifying hitters" per game.
- **Social HR pool** — `getHrCandidatePoolWithPendingConfirmation` over the same
  committed `hr-props-raw.json`; full contract in
  [../features/social-publishing.md](../features/social-publishing.md).

It is never divided by 100, compared to a market-implied probability, or
rendered as a fair price / edge / EV. `hrValueEdge` is deprecated and always
`null`.

## Calibration / validation status

**None.** `hr-model-performance.json`
([`scripts/build-mlb-hr-performance-summary.mjs`](../../scripts/build-mlb-hr-performance-summary.mjs),
pure logic in
[`scripts/lib/mlb-hr-performance-summary.mjs`](../../scripts/lib/mlb-hr-performance-summary.mjs))
reports **empirical** graded-outcome rates by score band, confidence level,
lineup status, and model version (8,496 graded hit/miss records as of the
2026-08-28 build). `calibrationDifference` is `null`; the artifact's `note`
states the score is a ranking, not a validated forecast; a sample-size warning
fires below the meaningfulness threshold. This is descriptive history, **not** a
`KS-008` calibration gate — no edge, EV, or win-probability claim is licensed.

## Artifacts / producers

| Artifact | Producer | Workflow |
| --- | --- | --- |
| `public/data/mlb/hr-props-raw.json` (`hrScore`, `hrScoreRank`, `confidenceLevel`) | `scripts/generate-mlb-hr-props.mjs` → `generate-mlb-hr-props-with-k-shadow.mjs` → `resolve-mlb-k-production-projection.mjs` | `generate-mlb-hr-props.yml` |
| `public/data/mlb/hr-props-best-bets.json` | `selectDeterministicHrPicks` inside `generate-mlb-hr-props.mjs` (`buildBestBetsPayload`) | `generate-mlb-hr-props.yml` |
| `public/data/mlb/hr-prediction-history.json` | `scripts/build-mlb-hr-archive.mjs` | `generate-mlb-hr-props.yml` |
| `public/data/mlb/hr-model-performance.json` | `scripts/build-mlb-hr-performance-summary.mjs` | `grade-mlb-hr-results.yml` |
| `top-hr-performance*.json`, `sin-city-performance*.json` | persist/grade scripts per [../features/mlb-hr.md](../features/mlb-hr.md) | `generate-mlb-hr-props.yml` / `grade-mlb-hr-results.yml` |

Per `KS-005` these artifacts change only through their producers.

## Consumers

`src/pages/MlbHrProps.tsx` (board + best bets), `src/hooks/useMlbPropsData.ts`
(`normalizeHrDashboardPayload`), `MlbPropsHub`, `MlbGameDetail` prop previews,
the HR social tables and X export routes, and the grading/performance pipeline.

## Tests

- `scripts/generate-mlb-hr-props.integrity.test.mjs`,
  `.season-totals.test.mjs`, `.trend-window.test.mjs`,
  `.k9-missing-data.test.mjs`, `.phase2.test.mjs`.
- `scripts/lib/mlb-hr-selection` behavior via the generator tests;
  `scripts/build-mlb-hr-archive.test.mjs`,
  `scripts/build-mlb-hr-performance-summary.test.mjs`.
- `src/pages/MlbHrProps` component tests exercise board ordering and best-bets
  rendering.

## Not this

- **Not HR +EV.** `hrScore` never produces a probability, "Current Rate Fair",
  "JKB Fair", fair odds, or EV. That model is `src/lib/mlb/hrPlusEvModel.ts`,
  documented in [mlb-hr-plus-ev.md](mlb-hr-plus-ev.md); it never reads `hrScore`.
- **Not a shadow score.** `mlb-hr-candidate-v0.1`, `mlb-hr-phase2-shadow-v1`
  (bullpen + hand-split), and the "MLB Analytics Foundation Phase 1" client-side
  `shadow*` fields are all isolated and never feed `hrScore` or its rank.
- **Not the Sin City HR-rules screen** (`src/lib/mlb/mlbHrFilter.ts`, a fixed
  3-of-5 Statcast qualification; see [../features/mlb-hr.md](../features/mlb-hr.md)).
- **Not the Moneyline model** ([mlb-moneyline.md](mlb-moneyline.md)); the
  `mlb-analytics-foundation-phase-1` name is an HR-centred research collision,
  not authority for either.

## Limitations

- Percentile components and the `normalizeMetric` inputs are **slate-relative**:
  a thin slate makes the ranking noisier and not comparable across days.
- Last-7 / last-30 are **raw HR counts**, not rates, so a low-PA hot streak can
  score highly with no sample gate.
- Opposing-pitcher HR VS silently falls back to a slate-normalized HR/9 when the
  pitcher row is unmatched.
- `xeraMult` is a coarse step function; the final product is not re-clamped.
- Weather and park carry token weight (0.02 / 0.03) and `weatherBoost` is a
  PropFinder point composite, not a rate.
- Grok-authored explanation copy is presentation only (`KS-008`).

## Version / reopening criteria

Reopen this contract before changing: any component, its weight, its raw band,
or the `0.6/0.4` blend split; the `xeraMult` breakpoints or `regrAdj`
slope/clamp; the sort key or tiebreak; `SELECTION_MIN_QUALITY_SCORE`, the
best-bets/value/longshot limits, or `QUALIFYING_HR_SCORE_THRESHOLD`; the archive
schema, dedup key, or confidence-level rules; or introducing any probability,
fair-value, edge, or +EV output derived from `hrScore` (which additionally
requires a documented `KS-008` calibration gate). Increment
`MLB_HR_MODEL_VERSION` on any such change.
