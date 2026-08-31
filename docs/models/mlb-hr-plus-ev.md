# MLB HR +EV (V2)

## Current authority

This document is the current methodology and contract authority for the MLB
**HR +EV** model (V2) — the standalone, browser-computed valuation behind the
`plus-EV` view toggle on `/mlb/hr-props`.

Subject to the authority hierarchy in [../DECISIONS.md](../DECISIONS.md).
`KS-007`, `KS-008`, and `KS-009` are binding. The model produces an EV number
and a value label; **it has no calibration or validation gate**, so per `KS-008`
those outputs are descriptive only and are not an edge, a +EV/value guarantee, a
best bet, a pick, or a calibrated probability. Surface routing and artifacts:
[../features/mlb-hr.md](../features/mlb-hr.md). Odds sources:
[../DATA_SOURCES.md](../DATA_SOURCES.md).

## Status / version

- **Status:** current production, user-facing. Computed **in the browser** by
  `evaluateHrPlusEv` in
  [`src/lib/mlb/hrPlusEvModel.ts`](../../src/lib/mlb/hrPlusEvModel.ts) from the
  committed `hr-props-raw.json` batter rows; rendered by
  `src/components/mlb/HrPlusEvTable.tsx` when the batter table's `plusEv` view is
  selected (also reachable via `?view=ev`).
- **Version:** `HR_PLUS_EV_MODEL_VERSION = "mlb-hr-plus-ev-v2"`.
- **No dedicated artifact, producer, workflow, archive, or grader.** It is a
  pure client-side transform of fields the HR pipeline already publishes.

## Purpose

Separate a hitter's raw season HR rate ("Current Rate Fair") from JoeKnowsBall's
adjusted rate ("JKB Fair"), convert each to a today-game HR probability and fair
price, and compare JKB Fair to the actual sportsbook HR YES price to produce a
descriptive EV figure and label.

## Current inputs

Per batter row (all from `hr-props-raw.json`; nulls are treated as neutral /
unavailable, never substituted):

- `seasonHomeRuns`, `seasonPlateAppearances` — **authoritative season totals
  only**. HR/AB and handedness-split sums are explicitly **not** accepted as a
  substitute for season HR/PA.
- `last14HomeRuns/PlateAppearances`, `last30HomeRuns/PlateAppearances` — real
  MLB StatsAPI calendar-window game-log HR + PA (never AB, games, or projected
  PA). Null windows mean genuinely unavailable, not a 0-HR cold streak.
- `battingOrder` → expected PA (`EXPECTED_PA_BY_ORDER`, 1→4.6 … 9→3.8;
  `EXPECTED_PA_FALLBACK = 4.2`).
- `opposingPitcherHrVs` (the HR VS score from
  [mlb-hr-score.md](mlb-hr-score.md)), `parkFactor`, handedness splits
  (`handednessSplits.vsLeft/vsRight`), `pitcherHand`, `bats`.
- `hrOddsYes` — the actual sportsbook HR YES price (American).
- `pitcherHrPaVsBatterHand` / `leaguePitcherHrPa`, `bullpenHrPa` /
  `leagueBullpenHrPa` — currently absent from production artifacts, so those
  matchup components stay neutral.

## Eligibility

`isPlusEvEligible` — **strictly more than `PLUS_EV_MIN_SEASON_PA = 300` season
plate appearances**. Ineligible rows are filtered out of the `plusEv` table
upstream (`isPlusEvEligible` in `MlbHrProps.tsx`) and, if evaluated, return
`eligible: false` with `trendFactor` and adjusted rates forced neutral / null.

`available` additionally requires: resolvable authoritative season HR/PA, and a
parseable `hrOddsYes`. A true **zero-HR season** is eligible but forces
`ev`/`label` to `UNAVAILABLE` (no defensible price) rather than emitting a −100%
EV.

`classifySeasonSample` labels the season PA sample (`VERY LIMITED` <75,
`LIMITED` <125, `MODERATE` <200, else `ESTABLISHED`) for display; it does not
gate.

## Formula / weights

**Current Rate Fair:**
`currentRateHrProbability = 1 − (1 − seasonHrPa)^expectedPa`; fair odds via
`probabilityToAmericanOdds`. No trend, no matchup.

**Trend factor** (`computeTrendFactor`):
`0.70 + 0.20·r30 + 0.10·r14`, clamped to `[0.90, 1.10]`, where
`rN = windowHrPa / seasonHrPa` (or `1` when the window or season baseline is
missing/zero). `1.00` when ineligible or season HR/PA is unavailable.

**Matchup multiplier** — `combineWeightedMultipliers` over
`MATCHUP_WEIGHTS` then `capTotalMatchupMultiplier` to `[0.70, 1.30]`:

| Factor | Weight | Current status |
| --- | --- | --- |
| `starter` (HR-susceptibility from `opposingPitcherHrVs`) | 0.30 | active: `1 + clamp((score−50)/50, −1, 1) · 0.20` |
| `hitterHandedness` (hitter HR/PA vs starter hand ÷ season HR/PA, clamped `[0.70,1.30]`) | 0.20 | active when a reliable split exists |
| `pitcherHandedness` | 0.15 | neutral — input not in production artifacts |
| `bullpen` | 0.15 | neutral — input not in production artifacts |
| `park` (`parkFactor` as-is) | 0.08 | active when present |
| `weather` | 0.07 | **always neutral** — `weatherBoost` is a point composite, not a rate multiplier; no defensible conversion |
| `recentTrend` | 0.05 | **always neutral inside Matchup** — recent trend is modeled as the dedicated Trend factor above, to avoid double-counting |

**JKB Fair:**
`trendAdjustedHrPa = seasonHrPa · trendFactor`;
`jkbHrPa = trendAdjustedHrPa · totalMatchupMultiplier`;
`jkbHrProbability = 1 − (1 − jkbHrPa)^expectedPa`; fair odds via
`probabilityToAmericanOdds`.

**EV / label:**
`ev = jkbHrProbability · decimal(bookOdds) − 1`;
`probabilityEdge = jkbHrProbability − bookImpliedProbability` (vig-inclusive).
`labelFromEv`: `≥ VALUE_EV_STRONG (0.15)` → `STRONG +EV`;
`≥ VALUE_EV_MODERATE (0.05)` → `MODERATE +EV`;
`> VALUE_EV_FAIR_LOW (−0.05)` → `FAIR`; else `OVERPRICED`; null → `UNAVAILABLE`.

Display-only derivations (`computeJkbProjectedPaPerHr = 1 / jkbHrPa`,
`trendWindowDirection`, `formatSeasonPaHr`) never feed back into any model value
(`KS-007`).

## Fallbacks

- Any missing matchup factor → `multiplier = 1`, `status: "neutral-missing"`,
  listed in `missingComponents`.
- Missing batting order → `EXPECTED_PA_FALLBACK = 4.2`, `expectedPaSource:
  "fallback"`.
- Missing/zero trend window or season baseline → that ratio is `1` (neutral);
  a missing window is never read as a cold signal.
- Missing season HR/PA, ineligible PA, or unparseable book odds →
  `available: false` with machine-readable `unavailableReasons`.

## Clamps

`trendFactor ∈ [0.90, 1.10]`; each ratio-style component `∈ [0.70, 1.30]`;
`totalMatchupMultiplier ∈ [0.70, 1.30]`; starter component swing `±0.20`;
`computeHrProbability` clamps the rate to `[0, 1]`.

## Output interpretation

`STRONG/MODERATE +EV`, `FAIR`, `OVERPRICED`, `UNAVAILABLE` describe the
**uncalibrated** model-vs-price relationship for that row only. The table
carries responsible-gambling language and descriptive framing. Nothing here is a
recommendation, a bet, or a probability the product stands behind. `currentRate*`
and `jkb*` outputs are labelled as distinct quantities and must stay distinct
(`KS-007`).

## Calibration / validation status

**None.** The V2 model has never been fit to settled HR outcomes and has no
grading artifact. Per `KS-008`, until a documented gate for
(`mlb-hr-plus-ev-v2`, a settled-history basis) exists, the surface stays
descriptive and may not imply profitability or correctness.

## Artifacts / producers

None. Inputs ride `hr-props-raw.json` (producer `generate-mlb-hr-props.mjs`,
workflow `generate-mlb-hr-props.yml`); the hand-split and bullpen caches that
would activate the currently-neutral factors are built by
`scripts/build-mlb-batter-hand-splits.mjs` and
`scripts/build-mlb-team-bullpen-stats.mjs`.

## Consumers

`src/pages/MlbHrProps.tsx` (`plusEv` batter-table view, `?view=ev` deep link),
`src/components/mlb/HrPlusEvTable.tsx`,
`src/components/mlb/hrPlusEvTableFilters.ts`. Not consumed by `hrScore`, best
bets, Sin City, the HR archive/grader, or social-card selection.

## Tests

- [`src/lib/mlb/hrPlusEvModel.test.ts`](../../src/lib/mlb/hrPlusEvModel.test.ts)
  — trend factor, matchup weighting/caps, EV labels, zero-HR handling,
  eligibility gate, odds/probability conversions.
- `src/components/mlb/HrPlusEvTable.test.tsx` — rendering, filters,
  excluded-row messaging.

## Not this

- **Not HR Quality Score.** `hrScore` is a slate-relative ranking with no
  probability output; this model never reads or writes it
  ([mlb-hr-score.md](mlb-hr-score.md)).
- **Not a market-informed composite** (`KS-009`): the only market input is the
  book price used *after* JKB Fair is computed, for the EV comparison — it is
  never fed into `jkbHrPa`.
- **Not the K +EV model** (`src/lib/mlb/kPlusEvModel.ts`) and not a graded
  system.

## Limitations

- Half the matchup weight (`pitcherHandedness` + `bullpen` + `weather` = 0.37)
  is currently inert for lack of production inputs, so `totalMatchupMultiplier`
  is dominated by starter + hitter-hand + park.
- Independence assumption: HR probability from a per-PA rate compounded over
  expected PA ignores plate-appearance correlation and pitcher-removal effects.
- `expectedPa` is a fixed lineup-slot table, not a game-state projection.
- Book odds are vig-inclusive; `probabilityEdge` is not a no-vig edge.
- Browser-only: not reproducible from a committed artifact, not archived, not
  graded.

## Version / reopening criteria

Reopen this contract before changing: `PLUS_EV_MIN_SEASON_PA`; the expected-PA
table or fallback; `TREND_BASE` / `TREND_WEIGHTS` / the trend clamp;
`MATCHUP_WEIGHTS`, `TOTAL_MATCHUP_CAP`, `COMPONENT_RATIO_CAP`, or the starter
swing; activating a currently-neutral factor; the `VALUE_EV_*` thresholds or the
label set; the zero-HR handling; or the season HR/PA authority rule. Any such
change increments `HR_PLUS_EV_MODEL_VERSION`. Adding a probability/edge/EV claim
that implies profitability additionally requires a documented `KS-008`
calibration gate.
