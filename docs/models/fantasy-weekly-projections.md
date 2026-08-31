# Fantasy weekly projections & rankings

CURRENT methodology authority for the JoeKnowsBall **weekly** fantasy football
system: the weekly point projection, the weekly ordinal ranking, and the research
context shown beside them. Subject to the authority hierarchy in
[../DECISIONS.md](../DECISIONS.md) (`KS-007`, `KS-008`, `KS-009`), this file owns
the approved contract. Code, `src/lib/fantasy/weekly/README.md`,
[../fantasy-weekly-production-operations.md](../fantasy-weekly-production-operations.md),
and historical research remain evidence and provenance.

For the season-long / draft-preparation lens see
[fantasy-par.md](fantasy-par.md). PAR and the weekly system are different models.

---

## 1. Concept map (reconciled)

| Concept | What it is | Current authority | Public? |
| --- | --- | --- | --- |
| **Weekly point projection** | `projectedFantasyPoints` per player per week (Full PPR) | `weekly-fantasy-projection-v1` model + `weekly-fantasy-production-context-v1` policy layer → **`weekly-fantasy-projection-production-artifact-v2`** | Yes |
| **Weekly ordinal ranking** | `positionRank` 1..N within QB/RB/WR/TE | The production projection artifact itself — rows are pre-sorted descending by `projectedFantasyPoints` with `positionRank` written on each row | Yes |
| **Production artifact** | `public/data/fantasy/projections/<season>/week-<NN>.json` | `scripts/generate-fantasy-weekly-projections.ts` (`fantasy:projections:generate`, alias `fantasy:weekly:publish`) | Yes |
| **Weekly research / context artifact** | Per-player usage evidence, opponent FPA, matchup edges, matchup grade | **`weekly-fantasy-research-artifact-v1`**, `public/data/fantasy/weekly-research/<season>/week-<NN>.json` | Yes (context only) |
| **Matchup composite / context** | Weighted 0–100 matchup score + Great…Very Tough grade | `calculateWeeklyMatchupComposite` (`src/lib/fantasy/weekly/matchupComposite.ts`), consumed only by `researchPresentation.ts` | Research/presentation only — never an input to a projection or rank |
| **Rest-of-Season research** | Multi-candidate shadow ROS projections & shadow model rank | `ros-shadow-projection-v1` (`src/lib/fantasy/rosResearch/*`, `data/fantasy/ros-research/2026/`) | **Shadow only** — never overwrites a live rank |
| **Season-long draft rankings** | Published JKB draft board | `FANTASY_RANKINGS` (`src/data/fantasyRankings2026.ts`) | Yes (separate page) |

### Parallel / superseded-for-consumption

- **`weekly-fantasy-ranking-artifact-v1`** (`weekly-fantasy-authority-v1.0.0`,
  `src/lib/fantasy/weekly/productionAuthority.ts`, `fantasy:weekly-rankings`,
  `public/data/fantasy/weekly/<season>/`) is an earlier Phase 2 **baseline**
  ranking artifact (ranks by preseason-ROS / current-season PPG only, plus
  descriptive context). Current status, verified against code/tests:
  - Its artifact, producer (`generate-fantasy-weekly-rankings.ts`), schema, and
    tests (`artifactLoader.test.ts`, `productionArtifact.test.ts`,
    `useWeeklyFantasyRankingArtifact.test.tsx`) are still present and maintained;
    `public/data/fantasy/weekly/2026/week-01.json` is committed and
    schema-validated.
  - Its loader hook `useWeeklyFantasyRankingArtifact` is imported **only by its
    own test** — **no page or component consumes it**. All live weekly surfaces
    (weekly rankings page, NFL Weekly Command Center, DFS Contest Analyzer)
    consume the **production projection artifact** instead.
  - It is therefore **superseded for current public weekly-ranking
    consumption**: the production projection artifact is the current weekly
    ordinal-ranking authority.
  - It is **not** formally retired. No `docs/DECISIONS.md` entry records its
    removal, and its pipeline remains wired. Do not describe it as deleted or
    decommissioned without such a decision.
  See **Open conflict** below.
- `src/lib/fantasy/weeklyRankings.ts` (`buildWeeklyRankingRows`) is an even older
  season-baseline **context** helper; its own docstring states it "does NOT
  provide true weekly rankings". Retained for the NFL Weekly Command Center's
  schedule/opponent context only.

### Open conflict (not resolved here)

[../fantasy-weekly-production-operations.md](../fantasy-weekly-production-operations.md)
describes `fantasy:weekly-rankings` / `public/data/fantasy/weekly/<season>/`
(the `weekly-fantasy-ranking-artifact-v1` path) as the canonical static artifact
the public consumers read. Current code does **not** match that: the public
consumers read the production **projection** artifact
(`public/data/fantasy/projections/<season>/`). Per the authority hierarchy in
[../DECISIONS.md](../DECISIONS.md) (current implementation + tests +
[../DATA_SOURCES.md](../DATA_SOURCES.md), whose consumer list names
`FantasyWeeklyRankings.tsx` and the projection artifact), this document treats
the projection artifact as current. `docs/fantasy-weekly-production-operations.md`
was not modified in this pass and should be reconciled in a later operations-doc
update.

---

## 2. Weekly point projection — `weekly-fantasy-projection-v1`

### 2.1 Version identifiers (verified against code)

| Identifier | Value | Source |
| --- | --- | --- |
| Model version | `weekly-fantasy-projection-v1` | `model/frozenSpec.ts` |
| Frozen research split | `2023-train-2024-validate-2025-holdout-v1` | `model/frozenSpec.ts`, `splitAuthority.ts` |
| Inference policy | `weekly-fantasy-projection-inference-v1` | `shadow/inferencePolicy.ts` |
| Deployment-fit version | `WEEKLY_FANTASY_PROJECTION_DEPLOYMENT_FIT_VERSION` (`model/deploymentFit.ts`) | pinned in artifact |
| Context policy layer | `weekly-fantasy-production-context-v1` | `production/context.ts` |
| Production artifact schema | `weekly-fantasy-projection-production-artifact-v2` | `production/artifactContract.ts` |
| Training-row schema | `weekly-fantasy-projection-training-row-v2` | `projections/contract.ts` |
| Scoring version | `jkb-full-ppr-v1.0.0` | `weekly/scoring.ts` |
| Public methodology copy | `PRODUCTION_METHODOLOGY_*` in `production/methodology.ts` | `ProjectionMethodologyPanel.tsx` |

### 2.2 Scoring version (frozen)

`jkb-full-ppr-v1.0.0` (`FANTASY_SCORING_FORMAT = "PPR"`), `FULL_PPR_SCORING`
frozen in `src/lib/fantasy/weekly/scoring.ts`:

- passing yard `0.04`; passing TD `4`; interception `−2`
- rushing yard `0.1`; rushing TD `6`
- reception `1`; receiving yard `0.1`; receiving TD `6`
- fumble lost `−2`; any two-point conversion `2`; special-teams return TD `6`
- **no** yardage / long-play / first-down / game bonuses (`bonuses: []`)

Changing any coefficient requires a new scoring version; historical artifacts
retain the version used to compute every outcome.

### 2.3 Production authority / structure

Every production row = **frozen model output + two product-policy adjustments**:

```
projectedFantasyPoints =
    projection.projectedFantasyPoints              # frozen v1 model (baseline [+ residual])
  + scoringEnvironmentAdjustment                   # policy layer, per-position coeff × cap
  + opponentFpaAdjustment                          # policy layer, per-position weight × cap
```

`components` on each row breaks this out
(`baseline`, `usageAdjustment`, `teamContextAdjustment`, `opponentAdjustment`
[always `0` under v1], `scoringEnvironmentAdjustment`, `opponentFpaAdjustment`,
`otherAdjustment`).

### 2.3.1 Market-influence boundary (frozen model vs. published projection)

Three distinct things, kept separate (consistent with `KS-009` in
[../DECISIONS.md](../DECISIONS.md)):

| Layer | Market influence | Basis |
| --- | --- | --- |
| **Frozen statistical model** (`weekly-fantasy-projection-v1`: `frozenSpec.ts` + `deploymentFit.ts` + `shadow/inference.ts`) | **Market-independent — verified by code.** Its frozen feature lists contain only prior/current-season usage, team EPA/play-volume, schedule/rest context and the ROS-PPG baseline; `model/featureSets.ts` explicitly excludes "markets, closing lines". No spread/total/implied-total/moneyline field appears in `contract.ts`, `build.ts`, or any position's `features`. `computeShadowProjection` reads only the training row + ROS baseline + deployment bundle. | fitted ridge coefficients (2023–2025 refit) + deterministic shrinkage baseline |
| **Production context / policy layer** (`weekly-fantasy-production-context-v1`, `production/context.ts`) | **May consume market-derived data.** `scoringEnvironmentAdjustment` is a deterministic, per-position-coefficient, hard-capped adjustment derived from the team's **market implied team total** (`deriveImpliedTeamTotals` over `public/data/nfl/matchup-market.json`) relative to the week's league average. `opponentFpaAdjustment` is FPA-derived, not market-derived. | tracked product-policy weights/caps; never fit from data |
| **Final published production projection** (`projectedFantasyPoints` in the artifact) | **Market-informed** — through the bounded context layer only. `generator.ts` adds `scoringEnvironmentAdjustment` (and `opponentFpaAdjustment`) to the frozen model output. The published number is therefore **not** wholly market-independent whenever current market data exists. | frozen model output **+** bounded deterministic context adjustments |

The context layer **never** changes the frozen fitted model coefficients, the
frozen feature set, or the baseline — it is added on top, is clamped
(per-position `capPoints`), and collapses to `0`
(`marketContextAvailable: false`) when no market data is present, in which case
the published projection equals the market-independent frozen model output.
"Independent rating" / "market-independent" language may be used for the frozen
model layer; it must **not** be used for the published `projectedFantasyPoints`
when market context is active.

### 2.4 Supported positions

`QB`, `RB`, `WR`, `TE` only. K and DST are out of scope. Any other position
throws in `buildProductionProjectionArtifact`.

### 2.5 Frozen methodology parameters (per position — `model/frozenSpec.ts`)

| Position | State | Family | Feature blocks | Ridge α | Shrinkage K | Rookie fallback PPG (2023 train mean) |
| --- | --- | --- | --- | --- | --- | --- |
| **QB** | `BASELINE_ONLY` | `deterministic-shrinkage-baseline` | `baseline` | none (`null`) | `2` | `5.42509090909091` |
| **RB** | `READY_FOR_2026_SHADOW` | `residual-ridge` | `baseline`, `usage`, `teamContext` | `10` | `2` | `3.124084778420037` |
| **WR** | `READY_FOR_2026_SHADOW` | `residual-ridge` | `baseline`, `usage` | `30` | `2` | `5.264690265486727` |
| **TE** | `READY_FOR_2026_SHADOW` | `residual-ridge` | `baseline`, `usage` | `10` | `2` | `2.7327485380116974` |

- Baseline authority: `shrinkage-blend`; preprocessing:
  `train-only-standardization-v1` (scalers fit on 2023 training rows only).
- Feature lists per position are frozen in `frozenSpec.ts` and immutable for
  this model version.
- QB has **no learned usage/matchup-residual adjustment** — tested, did not clear
  JKB validation/calibration.
- `opponentAdjustment` exists in the schema for forward-compatibility only; no
  promoted v1 feature block keys to it, so it is always `0`.

The frozen spec is the **only** source a production/shadow consumer may read for
a position's state/config; live `runPositionResearch()` is never consulted for
that. `production/methodology.ts` re-derives the public copy from `frozenSpec.ts`
and `assertMethodologyMatchesFrozenSpec()` fails closed on drift.

### 2.6 Product-policy context layer (`weekly-fantasy-production-context-v1`)

Small, bounded, **deterministic** adjustments — explicitly **not** learned/fit
coefficients — applied to every position including QB. `production/context.ts`
never imports rejected V2 research; it reuses only `deriveImpliedTeamTotals`
(pure market math) and `fpaForOpponent` (leakage-safe FPA).

**Scoring environment** (`SCORING_ENVIRONMENT_POLICY`), from the team's market
implied team total minus the week's league-average implied team total,
`adjustment = clamp(delta × coeff, ±capPoints)`:

| Pos | coefficient | capPoints |
| --- | --- | --- |
| QB | 0.30 | 2.0 |
| RB | 0.22 | 1.5 |
| WR | 0.26 | 1.75 |
| TE | 0.18 | 1.0 |

No market data (or no priced game for the team) → `marketContextAvailable:
false`, adjustment `0`. Never fabricates an implied total.

**Opponent FPA vs position** (`OPPONENT_FPA_POLICY`), from the opponent's fantasy
points allowed to the position, shrinkage-blended prior↔current season with
`OPPONENT_FPA_PRIOR_STRENGTH = 4`
(`currentWeight = gamesPlayed / (gamesPlayed + 4)`),
`adjustment = clamp(baselineFantasyPoints × (ratio−1) × weight, ±capPoints)`:

| Pos | weight | capPoints |
| --- | --- | --- |
| QB | 0.20 | 2.0 |
| RB | 0.15 | 1.5 |
| WR | 0.18 | 1.75 |
| TE | 0.15 | 1.25 |

FPA fallback reasons: `none`, `current-season-missing-use-prior`,
`missing-prior-season-neutral` (→ neutral ratio `1`),
`missing-both-neutral` (→ adjustment `0`). Never trusts a 1–2 game current-season
sample with no prior-season anchor.

### 2.7 Eligibility

The candidate universe is built by the caller
(`buildWeek1ShadowUniverse` / generic season/week) from PAR-consensus players
joined to the manifest-verified nflverse `players` + `weekly_rosters` +
schedule sources. Only resolved candidates with a `gsis:` id, a team, an
opponent, and `homeAway ∈ {home, away, neutral}` reach the artifact. Duplicate
GSIS ids throw. `neutral` is mapped to `home` for the model's `homeAway` feature.

### 2.8 Injury handling

**Injury status is NOT an active input to any projection or rank.** No injury
penalty, no scaling. (The nflverse injury report's `date_modified` cannot be
proven to precede kickoff.) Roster status feeds only descriptive
availability/eligibility elsewhere, never the projection formula.

### 2.9 Historical / training windows & leakage discipline

- **Split (frozen):** 2023 train · 2024 model-selection · **2025 holdout**.
  Ridge coefficients from training rows only; regularization selected on 2024;
  final refit on 2023–2024. Production deployment refits on all modeled rows
  2023–2025 via `deploymentFit.ts`.
- `splitAuthority.ts` exposes `assertNotModelSelectionSeason` /
  `MODEL_SELECTION_ALLOWED_SEASONS`: model-selection code must reject
  `season === 2025` before influencing any modeling decision.
- **No target-week leakage.** `buildTrainingRow` reads only `row.week < week`
  (current season) and `row.season === season − 1` (prior). `generator.ts`
  additionally runs `assertNoFutureHistory` (throws if any history row is at/after
  the target week). The generator filters current-season history to
  `row.week < week` before use.
- Missing model features produce a **missing score component**, never
  league-average imputation.
- 2022 nflverse `stats_player_week` is cached solely as a previous-season prior
  for 2023 rows; no 2022 universe/eligibility is modeled.
- 2025 pregame market artifact has no per-row timestamp → excluded from the
  primary historical comparison (production 2026 may consume a verified current
  pregame market).
- Source fields not available: routes, route participation, red-zone / goal-line
  touches, red-zone targets — stay `null`. `depth_chart_position` is a label, not
  a depth order → `starterStatus` stays `"unknown"`.

### 2.10 Fallback behavior

- **Week 1:** `week1Authority = "baseline-only"`. Baseline active for every
  position; RB/WR/TE learned residual **inactive** (no current-season features
  exist). Scoring-environment active whenever current market data exists;
  opponent-FPA uses last season.
- **Week 2+:** RB/WR/TE residual activates **automatically per row** when
  `evaluateResidualActivation` observes a real value for at least one of the
  position's frozen non-baseline features (`selected-current-season-feature-observed`);
  otherwise `no-selected-current-season-features-observed` and the row stays
  baseline. QB is always `model-state-baseline-only`.
- Rookie / no-prior-history rows with no shrinkage input use the frozen
  per-position `positionMeanPpgFromTraining`.
- The Week 2+ generator **refuses to run** (throws) if manifest-verified
  current-season player-week history through `week − 1` is unavailable — it will
  not silently produce a Week N artifact with no current-season features.
- Non-finite projection, duplicate GSIS id, unsupported position, or schema/rank
  invariant failure → **throw, nothing published**. The artifact is written to a
  `.tmp` staging file and atomically renamed only after
  `weeklyFantasyProjectionProductionArtifactSchema` + rank invariants pass.

### 2.11 Artifact season/week compatibility & no-substitution rules

- Path: `/data/fantasy/projections/<season>/week-<NN>.json` (`week` 1–18,
  zero-padded).
- `loadWeeklyFantasyProjectionState`: if `artifact.season`/`artifact.week` ≠
  requested → returns `missing` (**never** substitutes another week).
- The page shows an explicit unavailable state and **does not** substitute
  Rest-of-Season or another week (`FantasyWeeklyRankings.tsx`).
- A failed generation run never overwrites or relabels the previous week's
  canonical artifact.
- DFS compatibility (`assessDfsSlateCompatibility`): season/week mismatch is a
  **blocking** `error`; artifact age > 24h is a **warning only** (no in-repo
  hard age-fail threshold — a stale artifact is displayed, never blocked or
  swapped).
- Consumers never re-sort or recompute rank from any other field.

### 2.12 Production vs rejected-research boundary

A methodology labelled **`projections-v2`** (learned implied-team-total
coefficients, learned opponent-adjusted defense, QB calibration) is **rejected
research**. No production or shadow code path imports `projections-v2/*`
(asserted by comments/contracts in `production/methodology.ts`,
`production/context.ts`, `production/artifactContract.ts`,
`generate-fantasy-weekly-projections.ts`; noted in
[../DATA_SOURCES.md](../DATA_SOURCES.md)). It must never be promoted or blended
in. Do not confuse the rejected learned implied-total coefficient with the
approved deterministic `scoringEnvironmentAdjustment`.

### 2.13 Which methodology the public copy may use

`ProjectionMethodologyPanel.tsx` ("How JKB Projections Work") may read **only**
`src/lib/fantasy/weekly/projections/production/methodology.ts`
(`PRODUCTION_METHODOLOGY_*`). That module is derived from `frozenSpec.ts` +
`context.ts` and never imports rejected research. `methodology.test.ts` enforces
the derivation.

### 2.14 Current inputs

`2026-par-consensus.json` (player universe + `rosProjectedPpg`), nflverse
`players` + `weekly_rosters` caches, `public/data/nfl/<season>/games.json`
schedule, `data/nfl/nflverse/stats-player-week` (prior + current season),
`data/fantasy/projections/weekly-fantasy-projection-training-dataset-v1.json`
(deployment refit), `public/data/nfl/matchup-market.json` (best-effort current
market). Registry: [../DATA_SOURCES.md](../DATA_SOURCES.md) — "Fantasy — weekly
projection / research inputs".

### 2.15 Output interpretation

- `projectedFantasyPoints` = the published pregame expected Full PPR points for
  that player, that week = **market-independent frozen model output plus the
  bounded deterministic context adjustments** (§2.3.1). It is market-informed
  whenever current market data is available; describe it as a "projection", not
  as a "market-independent" or "independent" rating.
- `positionRank` = that week's ordinal position rank (lower = better projected),
  derived from `projectedFantasyPoints`.
- `components` / `context` = transparent breakdown and fallback metadata; the
  frozen model's contribution is isolated in `components.baseline` +
  `components.usageAdjustment` + `components.teamContextAdjustment`, and the
  market/FPA context in `components.scoringEnvironmentAdjustment` +
  `components.opponentFpaAdjustment`.
- `confidence` (`high`/`medium`/`low` + reasons + `missingInputs`) is descriptive.
- Per `KS-008`: a projection or a projection-vs-market gap is **not** an edge,
  +EV claim, best bet, pick, recommendation, or calibrated win probability.
  Surfaces use descriptive language ("projection", "projected points") only.

---

## 3. Weekly research / context artifact — `weekly-fantasy-research-artifact-v1`

- Path: `/data/fantasy/weekly-research/<season>/week-<NN>.json`. Producer:
  `scripts/generate-fantasy-weekly-research.ts` (`fantasy:weekly-research`),
  validator `fantasy:weekly-research:validate`.
- Carries per-player: leakage-safe usage evidence
  (`WEEKLY_RESEARCH_CONTEXT_VERSION` context — season PPG, last-5 PPG, opponent
  FPA season / last-5, plus touches / RZ touches / YPC / targets / target share /
  air yards per game / targets per game), NFL matchup edges (trenches / EPA /
  success, `mode` pass|rush), and a `matchupGrade`.
- **Matchup grade authority (in the artifact):** input `opponentFpaSeason.rank`,
  bands `1–6 Great · 7–12 Good · 13–20 Neutral · 21–26 Tough · 27–32 Very Tough`.
- Joined to projection rows by **exact `playerId`** only
  (`joinWeeklyFantasyResearchRows`). Missing/mismatched research degrades the
  affected display fields to N/A — **projections and ranks stay available**.
- Season/week mismatch → treated as `missing`, research simply not joined
  (`loadWeeklyFantasyResearchState`, `assessDfsResearchArtifactCompatibility`).
- This artifact is **context**. It never feeds the projection or the rank.

### Matchup composite (`calculateWeeklyMatchupComposite`)

A separate research/presentation lens (`src/lib/fantasy/weekly/matchupComposite.ts`,
used only by `researchPresentation.ts`): component ranks normalized to
1 = easiest…32 = hardest, weighted, scaled 0–100, min 3 components required.

- Weights — pass catchers (QB/WR/TE): `fpaSeason 0.30 · fpaLast5 0.15 ·
  trenches 0.20 · epa 0.20 · success 0.15`; RB: `fpaSeason 0.30 · fpaLast5 0.15 ·
  trenches 0.25 · epa 0.15 · success 0.15`.
- Grade bands (score ≥): `85 Great · 70 Good · 45 Neutral · 30 Tough · 0 Very
  Tough`; `< 3` components → `N/A`.
- **Callers must not feed this score into projections, position ranks, or model
  adjustments** (module docstring).

---

## 4. Rest-of-Season research (`ros-shadow-projection-v1`) — shadow only

`src/lib/fantasy/rosResearch/*`, config in
`rosResearch/shadowProjectionConfig.ts`, output
`data/fantasy/ros-research/2026/shadow-ros-projections.json`.

- Multi-candidate (A–E) historical-baseline + bounded usage/team/FPA/market
  adjustment research. Recency weights `2025 .5 · 2024 .3 · 2023 .2` (renormalized
  over present seasons), min-sample `4` games, per-adjustment caps
  `usage .15 · team .10 · fpa .10 · market .08`, combined cap `.30`.
- Status treatment applied to the artifact: **Treatment D** (confidence ceiling +
  model-rank exclusion for `released`/`suspended`; **no** point modifier).
- **SHADOW ONLY** — "never overwrite a live rank". `consumerBoundaries.test.ts`
  asserts the ROS board does not import the weekly projection/ranking artifacts
  or hooks.
- **No ROS fallback when weekly production is unavailable.** The weekly page
  shows an unavailable state; it does not fall back to ROS or PAR.

---

## 5. Not this

- The weekly projection is **not** PAR, **not** the season-long draft board
  (`FANTASY_RANKINGS`), **not** the ROS shadow projection/model rank, and **not**
  the older `weekly-fantasy-ranking-artifact-v1` baseline artifact.
- **No stale-artifact relabeling** — a failed run keeps the prior artifact with
  its original `generatedAt`/`inputAsOf`; it is never re-stamped.
- **No cross-week substitution** — week N never renders week N±1's artifact.
- **No ROS/PAR fallback** when the weekly production artifact is missing.
- Injury status is **not** a projection input. No injury penalty.
- The matchup composite / matchup grade / research context is **not** an input
  to the projection or the rank.
- Rejected `projections-v2` research (learned implied-total coeff, learned
  opponent-defense, QB calibration) is **never** promoted or blended into
  production.
- Public "How JKB Projections Work" copy may **only** come from
  `production/methodology.ts`.
- A projection, or projection-vs-market, is **not** an edge / +EV / best bet /
  pick / calibrated probability (`KS-008`).
- The **frozen fitted model** is market-independent (verified: no market feature
  in its feature space) and stays that way — market data never enters the fitted
  coefficients, the feature set, or the baseline (`KS-009`).
- The **published `projectedFantasyPoints`** is **not** described as
  market-independent: it is market-informed through the bounded deterministic
  `scoringEnvironmentAdjustment` (market implied team total) in the context layer
  (§2.3.1). The two layers are kept explicitly distinguishable in the artifact
  `components` and in copy (`KS-009`).

---

## 6. Known limitations

- No published calibration/validation gate → outputs are descriptive projections
  only (`KS-008`).
- 2026 is unplayed; the model was selected on 2023–2024 and holds out 2025, but
  there is no 2026 realized-outcome check yet.
- QB is baseline-only — no learned weekly usage/matchup signal.
- Historical pregame market snapshots are unavailable and are not reconstructed,
  so the scoring-environment adjustment has no historical backtest of its own.
- Context-layer coefficients/caps are conservative product-policy judgment calls,
  not fit from data.
- Weekly research usage evidence is limited to fields nflverse `player_stats`
  reliably populates (no routes/snap share/RZ usage).
- No automation guarantees: refresh cadence is
  [../fantasy-weekly-production-operations.md](../fantasy-weekly-production-operations.md)
  guidance plus workflow `generate-fantasy-weekly-projections.yml`; otherwise
  manual.

---

## 7. Relevant paths

**Model / policy:** `src/lib/fantasy/weekly/projections/model/frozenSpec.ts`,
`.../model/deploymentFit.ts`, `.../shadow/inference.ts`,
`.../shadow/inferencePolicy.ts`, `.../splitAuthority.ts`,
`.../production/context.ts`, `.../production/methodology.ts`,
`.../production/generator.ts`, `.../production/artifactContract.ts`,
`.../production/artifactLoader.ts`, `src/lib/fantasy/weekly/scoring.ts`,
`src/lib/fantasy/weekly/build.ts`.

**Research / context:** `src/lib/fantasy/weekly/researchArtifact.ts`,
`researchArtifactLoader.ts`, `researchJoin.ts`, `researchContext.ts`,
`researchPresentation.ts`, `matchupComposite.ts`,
`src/lib/fantasy/rosResearch/*`.

**Producers:** `scripts/generate-fantasy-weekly-projections.ts`
(`fantasy:projections:generate` / `fantasy:weekly:publish`),
`scripts/validate-fantasy-weekly-projections.ts`,
`scripts/generate-fantasy-weekly-research.ts`,
`scripts/generate-fantasy-player-week-history.ts`,
`scripts/generate-fantasy-player-week-projection-dataset.ts`,
`scripts/generate-fantasy-weekly-rankings.ts` (superseded baseline artifact).

**Artifacts:** `public/data/fantasy/projections/<season>/week-<NN>.json`
(production), `public/data/fantasy/weekly-research/<season>/week-<NN>.json`
(context), `public/data/fantasy/weekly/<season>/week-<NN>.json` (superseded),
`data/fantasy/ros-research/2026/` (shadow),
`data/fantasy/projections/weekly-fantasy-projection-training-dataset-v1.json`.

**Consumers:** `src/pages/FantasyWeeklyRankings.tsx`,
`src/hooks/useWeeklyFantasyProjectionArtifact.ts`,
`src/hooks/useWeeklyFantasyResearchRows.ts`,
`src/hooks/useNflWeeklyDashboard.ts` (Weekly Command Center),
`src/pages/nfl/NFLDfsContestAnalyzer.tsx`,
`src/components/fantasy/ProjectionMethodologyPanel.tsx`,
`src/components/fantasy/WeeklyFantasyRankingsTable.tsx`.

**Tests:** `production/generator.test.ts`, `production/methodology.test.ts`,
`production/context.test.ts`, `model/frozenSpec.test.ts`,
`model/freeze.test.ts`, `model/holdout.test.ts`, `shadow/inference.test.ts`,
`shadow/inferencePolicy.test.ts`, `splitAuthority.test.ts`,
`weekly/leakage.test.ts`, `weekly/consumerBoundaries.test.ts`,
`weekly/researchArtifact.test.ts`, `weekly/researchJoin.test.ts`,
`weekly/matchupComposite.test.ts`, `weekly/scoring.test.ts`,
`src/lib/nfl/dfs/*` compatibility tests, `src/pages/FantasyWeeklyRankings.test.tsx`.

---

## 8. Version / reopening criteria

A **new model version** (`weekly-fantasy-projection-v2`, never an edit to v1) is
required to change: a position's frozen state/family/feature list/α/shrinkage K,
the rookie fallback means, the train/validate/holdout split, the baseline or
preprocessing authority, or to activate a QB learned adjustment.

A **new context-policy version** (`weekly-fantasy-production-context-v2`) is
required to change any `SCORING_ENVIRONMENT_POLICY` / `OPPONENT_FPA_POLICY`
coefficient or cap, `OPPONENT_FPA_PRIOR_STRENGTH`, or the FPA blend rule.

A **new scoring version** is required to change any Full PPR coefficient.

A **new inference-policy version** is required to change Week-1 authority or the
residual-activation rule.

**Explicit reopening** (a `docs/DECISIONS.md` entry) is required to: promote any
`projections-v2` research; publish a calibration/validation gate that would
license +EV / probability language; make the weekly page fall back to ROS/PAR;
feed a market or matchup-composite value into the model; or feed injury status
into a projection. Update this file and `docs/DECISIONS.md` before implementing.
