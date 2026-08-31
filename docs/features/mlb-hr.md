# MLB Home Run Props (feature contract)

Durable router for the JoeKnowsBall MLB **Home Run (HR) Props** surfaces: routes,
the distinct HR numbers shown, artifacts and producers, performance tracking,
and the social-publishing relationship. This is a **feature/automation**
document; it does not own scoring methodology.

Subject to `KS-007` / `KS-008` in [../DECISIONS.md](../DECISIONS.md): a score,
or a model-vs-market difference, is **not** an edge, +EV/value claim, best bet,
or calibrated probability without a documented calibration gate. Surface
overview: [mlb.md](mlb.md). Social publishing:
[social-publishing.md](social-publishing.md).

Point-in-time evidence, **not** current authority (`KS-004`):
[../mlb-analytics-foundation-phase-1.md](../mlb-analytics-foundation-phase-1.md),
memory `mlb-analytics-foundation`.

There is no dedicated HR **model** doc yet. Methodology detail below is cited
from code; a future `docs/models/mlb-hr-*.md` is warranted (see "Flag").

## Routes / pages

| Route | Component | Surface |
| --- | --- | --- |
| `/mlb/hr-props` | `src/pages/MlbHrProps.tsx` | HR props board: HR Quality Score, best bets, filters, and a **`plus-EV` view** toggle. |
| `/mlb/hr-props/x-export` | `src/pages/MlbHrPropsXExport.tsx` | Social-image export (outside `MlbLayout`). |
| `/mlb/sin-city` | `src/pages/MlbSinCity.tsx` | HR-rules screen: 3-of-5 Statcast qualification, closest-five fallback (`src/lib/mlb/mlbHrFilter.ts`). Unrelated to the numerology "Sin City / Masonic" component — see [../models/sin-city.md](../models/sin-city.md). |
| `/mlb/props` | `src/pages/MlbPropsHub.tsx` | Links hub over today's HR / K / BvP props. |
| `/mlb/vulnerable-pitchers` | `src/pages/MlbVulnerablePitchers.tsx` | Pitcher HR-vulnerability research. |

Page data: `src/hooks/useMlbPropsData.ts` ← `/data/mlb/hr-props-raw.json` +
`/data/mlb/hr-props-best-bets.json`; normalized by `normalizeHrDashboardPayload`.

## The distinct HR numbers (keep separate)

### 1. HR Score — `hrScore` ("HR Quality Score")

Server-generated per-batter field from `scripts/generate-mlb-hr-props.mjs`. A
**relative matchup ranking**, not a probability, fair value, or EV. Drives the
main board ordering, best-bets, and social selection.

### 2. HR +EV (`plus-EV` view) — standalone V2 model

`src/lib/mlb/hrPlusEvModel.ts` (`evaluateHrPlusEv`,
`HR_PLUS_EV_MODEL_VERSION = "mlb-hr-plus-ev-v2"`). **Independent** of `hrScore`,
best bets, Sin City, and social-card selection — it never reads or writes any of
them. Eligibility gate: strictly more than `PLUS_EV_MIN_SEASON_PA = 300` season
plate appearances.

Separate quantities it produces:

- **Current Rate Fair** — `currentRateHrProbability`: raw season HR/PA carried
  straight to expected PA (by batting order, `EXPECTED_PA_BY_ORDER`), no trend,
  no matchup; and `currentRateFairOddsAmerican`.
- **Trend factor** — `computeTrendFactor(r30, r14)` =
  `0.70 + 0.20·r30 + 0.10·r14`, clamped `0.90x–1.10x`, from real L14/L30
  calendar-window HR + PA.
- **Matchup multiplier** — weighted blend (`MATCHUP_WEIGHTS`: starter 0.30,
  hitter hand 0.20, pitcher hand 0.15, bullpen 0.15, park 0.08, weather 0.07,
  recent-trend 0.05 — several currently neutral for lack of production inputs),
  capped `0.70x–1.30x`.
- **JKB Fair** — `jkbHrPa = seasonHrPa · trendFactor · totalMatchupMultiplier`,
  → `jkbHrProbability`, `fairOddsAmerican`.
- **EV / label** — `ev = computeExpectedValue(jkbHrProbability, bookOdds)`;
  label ∈ `STRONG +EV` / `MODERATE +EV` / `FAIR` / `OVERPRICED` /
  `UNAVAILABLE` (thresholds `VALUE_EV_STRONG = 0.15`,
  `VALUE_EV_MODERATE = 0.05`, `VALUE_EV_FAIR_LOW = −0.05`). A true zero-HR
  season forces `UNAVAILABLE` rather than a −100% EV.

Per `KS-008` this uncalibrated EV view carries responsible-gambling language and
descriptive framing; its calibration posture is unproven.

### 3. Current-rate / fair-value calculations

"Current Rate Fair" (raw season rate) and "JKB Fair" (adjusted) are deliberately
distinct outputs of the +EV model — see above. Display-only derivations
(`computeJkbProjectedPaPerHr`, trend-window direction) never feed back into any
model calculation.

### 4. Sin City HR-rules screen

`getSinCityResults` (`src/lib/mlb/mlbHrFilter.ts`): each batter is evaluated
against 5 fixed Statcast criteria — `Barrel% ≥ 12`, `Pull% ≥ 20` (overall pull
rate, not pulled-air), `Hard Hit% ≥ 45`, `Exit Velo ≥ 92`, and `Wind Out ≥ 8`
mph with the roof open (`classifyWind`). `qualifies` when `matchCount ≥ 3`
(`SIN_CITY_MIN_CRITERIA`); if nobody qualifies, the closest
`SIN_CITY_FALLBACK_COUNT = 5` by shortfall are shown as `isFallback`. Fixed
thresholds; a rules model, not a score.

### 5. Social selection

The canonical X publisher's HR pool comes from
`getHrCandidatePoolWithPendingConfirmation`
(`scripts/lib/mlb-social-composition.mjs`) over the same committed
`hr-props-raw.json` the site reads (`--source=production`), then
`composeSocialPostPlan`. Selection core:
`scripts/lib/mlb-hr-x-selection-core.mjs`. Full publishing contract:
[social-publishing.md](social-publishing.md). Social selection is independent of
the `plus-EV` view and of the Sin City screen.

## Artifacts / producers

| Artifact | Producer(s) | Workflow |
| --- | --- | --- |
| `public/data/mlb/hr-props-raw.json`, `hr-props-best-bets.json` | `scripts/generate-mlb-hr-props.mjs` → `scripts/generate-mlb-hr-props-with-k-shadow.mjs` | `generate-mlb-hr-props.yml` ("Generate MLB Data") |
| `public/data/mlb/hr-prediction-history.json` | `scripts/build-mlb-hr-archive.mjs` | `generate-mlb-hr-props.yml` |
| `public/data/mlb/hr-model-performance.json` | `scripts/build-mlb-hr-performance-summary.mjs` | `grade-mlb-hr-results.yml` |
| `public/data/mlb/top-hr-performance.json`, `top-hr-performance-summary.json` | `scripts/persist-top-hr-picks.mjs`, `scripts/grade-top-hr-picks.mjs` | `generate-mlb-hr-props.yml` (persist), `grade-mlb-hr-results.yml` (grade) |
| `public/data/mlb/sin-city-performance.json`, `sin-city-performance-summary.json` | `scripts/persist-sin-city-picks.mjs`, `scripts/grade-sin-city-picks.mjs` | `generate-mlb-hr-props.yml` (persist), `grade-mlb-hr-results.yml` (grade) |
| Batter HR odds / handedness enrichment | `scripts/inject-batter-hr-odds.mjs`, `scripts/inject-batter-handedness.mjs`, `scripts/validate-mlb-prop-odds.mjs` | `generate-mlb-hr-props.yml` |
| Hand-split / bullpen caches feeding HR +EV | `scripts/build-mlb-batter-hand-splits.mjs`, `scripts/build-mlb-team-bullpen-stats.mjs` | `generate-mlb-hr-props.yml` |

`hrScore` and the `.json` archives change **through their producers** (`KS-005`).

## Performance tracking

Empirical outcome rates only (no calibration claim):

- `hr-model-performance.json` — graded `hrScore` predictions.
- `top-hr-performance*.json` — graded daily "top HR" picks.
- `sin-city-performance*.json` — graded Sin City HR-rules qualifiers.

Grading: `scripts/grade-mlb-hr-results.mjs` + the per-system graders, workflow
`grade-mlb-hr-results.yml` (also grades `top-k`). Aggregated on the
`/mlb/performance-preview` "MLB Results Tracker" (`PerformanceTrackerShell`,
`src/lib/mlb/performancePreviewTrackers/sinCityTracker.ts`,
`SIN_CITY_TRACKING_MODEL_VERSION = "sin-city-tracking-v1"`).

The **HR +EV V2** model has **no** dedicated performance artifact or grader.

## Historical / shadow analytics (not production authority)

**MLB Analytics Foundation — Phase 1** (`src/lib/mlb/analytics/**`,
`jkb-hr-bridge@1.0.0` / `hr-bridge-abs@1`): shared TypeScript contracts + a
deterministic score engine computed client-side in `useMlbPropsData` as
additive `shadow*` fields, fail-open. **Nothing public changed**; it does not own
`hrScore`, best bets, or the `.mjs` archives. Memory `mlb-analytics-foundation`
records it as stranded/shadow-only — treat as history, verify against current
code.

## Tests / docs

- `scripts/lib/mlb-hr-x-selection-core.test.mjs` — social selection.
- `src/lib/mlb/kPropCanonicalCandidates.test.ts` — (K, adjacent; HR shares the
  composition layer).
- `scripts/generate-mlb-hr-props.integrity.test.mjs`,
  `generate-mlb-hr-props.season-totals.test.mjs`,
  `generate-mlb-hr-props.trend-window.test.mjs`,
  `generate-mlb-hr-props.k9-missing-data.test.mjs`,
  `generate-mlb-hr-props.phase2.test.mjs`.
- `generate-mlb-hr-props-with-k-shadow.reliever-safety.test.mjs`,
  `.env-propagation.test.mjs`.
- `src/lib/mlb/hrPlusEvModel` behavior via `MlbHrProps` tests;
  `src/lib/mlb/mlbHrFilter` via Sin City page/component tests.

## Conflicts

No direct code-vs-audit conflict identified for HR. The
`mlb-analytics-foundation-phase-1` naming is a known collision (it is HR-centred
research, not the production `hrScore` pipeline and not the Moneyline model —
see [../models/mlb-moneyline.md](../models/mlb-moneyline.md)).

## Flag: future model doc

`hrScore` (HR Quality Score) composition and the HR +EV V2 model each warrant a
dedicated `docs/models/mlb-hr-*.md` methodology contract, including the `KS-008`
calibration posture of the `plus-EV` view. Until then, this feature doc is the
router and the point-in-time research docs are **evidence only**, not current
methodology authority. Full HR +EV / HR Score formulas are intentionally **not**
transcribed here; they belong in that model doc.
