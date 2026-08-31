# MLB product area

Durable router for the JoeKnowsBall MLB surfaces: what the systems are, how they
route, which artifacts back them, and which are production versus shadow/research.
It does **not** restate methodology.

Current methodology / contract docs:

- [../models/mlb-moneyline.md](../models/mlb-moneyline.md) — Moneyline Edge model,
  archive, grading, CLV.
- [../DATA_SOURCES.md](../DATA_SOURCES.md) — MLB Stats API, Baseball Savant,
  FanGraphs, odds providers, Action Network, Polymarket, xAI Grok.

Point-in-time references (evidence, **not** current authority — `KS-004`):
[../mlb-analytics-foundation-phase-1.md](../mlb-analytics-foundation-phase-1.md),
[../mlb-k-projection-audit.md](../mlb-k-projection-audit.md),
[../mlb-k-v2-shadow-ui-validation.md](../mlb-k-v2-shadow-ui-validation.md),
[../numerology-v3-promotion-criteria.md](../numerology-v3-promotion-criteria.md),
memory `mlb-pipeline-reliability-phase1`, `mlb-analytics-foundation`,
`mlb-x-slate-timing`.

Subject to `KS-007` / `KS-008` / `KS-009` in
[../DECISIONS.md](../DECISIONS.md). Responsible-gambling language is preserved on
betting-related surfaces.

## Routes / surfaces (verified in `src/App.tsx`)

Children of `MlbLayout` (`src/components/mlb/MlbLayout.tsx`):

| Route | Page | Surface |
| --- | --- | --- |
| `/mlb` | `MlbGameDetail.tsx` | Daily game research hub: schedule, probable pitchers, Game Matchup Analyzer (incl. the categorical **Moneyline Edge Strength** row), top prop previews, Polymarket moneyline panel, HR/K/ML social tables. |
| `/mlb/props` | `MlbPropsHub.tsx` | Links hub over today's HR / K / BvP props (`useMlbPropsData`). |
| `/mlb/hr-props` | `MlbHrProps.tsx` | HR props board: HR Quality Score, best bets, filters, plus a `plus-EV` view (`src/lib/mlb/hrPlusEvModel.ts`). |
| `/mlb/sin-city` | `MlbSinCity.tsx` | Rules-model screen: 3-of-5 qualification, closest-five fallback (`src/lib/mlb/mlbHrFilter.ts`). |
| `/mlb/strikeout-props` | `MlbStrikeoutProps.tsx` | K props board: projected Ks, model-vs-line value sorting, canonical candidates, K-v2 shadow. |
| `/mlb/batter-vs-pitcher` | `MlbBatterVsPitcher.tsx` | BvP history and matchup splits. |
| `/mlb/numerology` | `MlbNumerologyPage.tsx` (→ `MlbNumerologyPageEnhanced`) | Numerology picks + results tracker. |
| `/mlb/power-rankings` | `MlbPowerRankings.tsx` | MLB team power rankings. |
| `/mlb/vulnerable-pitchers` | `MlbVulnerablePitchers.tsx` | Pitcher HR-vulnerability research. |

Outside the layout: `/mlb/{numerology,hr-props,strikeout-props}/x-export`
(social-image export routes), `/mlb-demo` (`MLBPercentileDemo`),
`/mlb/performance-preview` (`MlbPerformancePreview` — titled **"MLB Results
Tracker"**, `PerformanceTrackerShell`).

## Major systems

| System | Status | Live artifact(s) | Producer(s) / workflow | Notes |
| --- | --- | --- | --- | --- |
| **HR props** | Production | `public/data/mlb/hr-props-raw.json`, `hr-props-best-bets.json`; archive `hr-prediction-history.json`; `hr-model-performance.json`; `top-hr-performance*.json` | `generate-mlb-hr-props.mjs`, `build-mlb-hr-archive.mjs`, `grade-mlb-hr-results.mjs`; `generate-mlb-hr-props.yml`, `grade-mlb-hr-results.yml` | HR Quality Score is a relative matchup ranking, **not** a probability. The `plus-EV` view derives an EV-style figure — its `KS-008` compliance needs a dedicated model doc. |
| **K props** | Production; **K-v2 shadow** in parallel | `hr-props-raw.json` (shared K rows), `mlb-k-props-v2-shadow*` shadow artifact | `generate-mlb-k-props-v2-shadow.mjs` (+ `:validate`), `test-mlb-k-shadow.yml` | Projected Ks are a native-unit informational field that cannot receive weight. `mlb-k-projection-audit.md` / `mlb-k-v2-shadow-ui-validation.md` are point-in-time. Needs a dedicated model doc. |
| **Moneyline** | Production model (browser); archive/grading/CLV internal-only | `ml-picks-raw.json`, `ml-prediction-history.json`, `ml-model-performance.json` | `generate-mlb-ml-picks.mjs`, `build-mlb-ml-archive.mjs`, `grade-mlb-ml-results.mjs`, `build-mlb-ml-performance-summary.mjs`; `generate-mlb-hr-props.yml`, `grade-mlb-ml-results.yml` | Fully documented: [../models/mlb-moneyline.md](../models/mlb-moneyline.md). Edge Strength is not a probability; no calibration gate. |
| **Numerology** | Production; v3 promotion criteria open | `public/data/mlb/` numerology artifacts; grading + results tracker | `generate-mlb-numerology.mjs`, `numerology-scoring-engine.mjs`, `grade-mlb-numerology-plays.mjs`, `persist-mlb-numerology-performance.mjs`; `generate-mlb-numerology.yml`, `mlb-numerology-grade.yml` | Grok narrative is presentation copy only (`KS-008`). Promotion gates: `numerology-v3-promotion-criteria.md`. Needs a dedicated model doc. |
| **Sin City** | Production (rules model) | derived in-app from `useMlbPropsData`; `sin-city-performance*.json` | HR pipeline + `src/lib/mlb/mlbHrFilter.ts` | Fixed criteria/thresholds; 3-of-5 qualification; closest-five fallback. Unchanged by the analytics-foundation shadow. |
| **Performance / Results Tracker** | Production surface | `hr-model-performance.json`, `ml-model-performance.json`, `top-*-performance*.json`, `sin-city-performance*.json` | the per-system grade/summary scripts above | Aggregates empirical outcome rates per system; `ml-model-performance.json` is otherwise internal-only. |
| **Power rankings / Vulnerable pitchers / BvP** | Production surfaces | `public/data/mlb/` power-rankings, percentiles, hand-splits, wRC+ caches | `generate-mlb-power-rankings.mjs` etc.; `generate-mlb-power-rankings.yml` | No dedicated model/feature docs yet. |
| **Automated social publishing** | Production | rendered X images under `artifacts/`; posted to X; numerology email | `post-mlb-hr-props-to-x.mjs`, `post-mlb-strikeout-props-to-x.mjs`, `post-mlb-ml-edges-to-x.mjs`, `post-mlb-numerology-to-x.mjs`, `generate-mlb-daily-picks.mjs` + `post-mlb-x-daily-card.mjs`, `post-mlb-x-edition.mjs`, `generate-mlb-numerology-email.mjs` | `post-mlb-*-to-x.yml`, `mlb-x-canonical.yml`, `mlb-x-editions.yml`, `post-mlb-daily-picks.yml`, `poll-mlb-x-posts.yml`, `poll-mlb-numerology-delivery.yml`, `mlb-numerology-email-rescue.yml` | Live posting/email is production-sensitive; every path has an enable gate. Slate/lineup timing: memory `mlb-x-slate-timing` (PR #67). |
| **Freshness / reliability pipeline** | Production | guards the artifacts above | `scripts/lib/mlb-data-freshness.mjs`, `mlb-data-watchdog.yml` | Stale daily data is caught; a stale artifact keeps its original `inputAsOf` rather than being relabelled. RCA + design: memory `mlb-pipeline-reliability-phase1` (PR #264). |

## Shadow / research (not production authority)

- **MLB Analytics Foundation Phase 1** (`src/lib/mlb/analytics/**`): shared
  TypeScript contracts + deterministic score engine (`jkb-hr-bridge@1.0.0`,
  `hr-bridge-abs@1`), computed client-side in `useMlbPropsData` as additive
  `shadow*` fields, fail-open. **Nothing public changed.** It does not own the
  HR, K, or Moneyline production scores or the `.mjs` archives. Memory
  `mlb-analytics-foundation` records the TS lib as stranded/shadow-only with the
  parallel `.mjs` archives authoritative — treat that memory as history, verify
  against current code.
- **K-v2 shadow** (`kPropsV2ShadowArtifact`): candidate K pipeline, validated in
  shadow, not promoted.
- **Moneyline Phase 2 shadow** (`mlb-ml-phase2-shadow-v1`): flag-gated
  projected-IP / park / bullpen experiment; never affects the live pick.
- `MLBPercentileDemo` (`/mlb-demo`): a demo surface, not a product area.

## Cross-cutting guarantees

- No MLB surface presents a model score, shadow or production, as a calibrated
  probability, fair value, edge, EV, or "JKB Value" without a documented
  calibration gate (`KS-008`). Uncalibrated probability/value-edge claims were
  removed from the Moneyline UI.
- Grok-generated prose is presentation copy, not a model output (`KS-008`).
- Odds/implied probabilities are vig-inclusive and labelled as such.
- Generated artifacts change through their producers (`KS-005`).

## Areas that still need dedicated model/feature docs

HR props (including the `plus-EV` view and `KS-008` posture), K props projection
+ K-v2 shadow, Numerology (with the v3 promotion gate), Sin City as a rules
model, MLB power rankings, vulnerable pitchers, batter-vs-pitcher, and the
Results Tracker aggregation contract. Until those exist, the point-in-time audits
and promotion-criteria docs above are **evidence only**, not current authority.
