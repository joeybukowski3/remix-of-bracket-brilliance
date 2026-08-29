# CFB preseason power rating

## Current authority and model hierarchy

This document is the current methodology authority for the College Football
team-strength ratings shown publicly as **JKB Preseason Power** (also labelled
**JKB Power** / **Power Rating** on team and matchup surfaces).

Two distinct systems must never be conflated:

| System | Version id | Independence | Status | Rendered in the app? |
| --- | --- | --- | --- | --- |
| **Production preseason composite** | `cfb-preseason-v1.1-market-anchor` | **Market-informed (MIC).** Blends a market baseline with JKB efficiency data. | Production methodology. | Yes — every `/college-football` surface. |
| **CFB Model V2 shadow IPR** | `cfb-ipr-v2.0` bundle (`cfb-v2.0` / `cfb-scoring-v2.0` / `cfb-calibration-v2.0` / `cfb-probability-v2.0`) | **Independent Predictive Rating (IPR).** Never reads market data at any layer. | Shadow only. Not promoted, not in the UI. | No. See [../plans/active/cfb-model-v2.md](../plans/active/cfb-model-v2.md). |

Per `KS-009` ([../DECISIONS.md](../DECISIONS.md)) these must stay explicitly
distinguishable in code, artifacts, and copy. The production rating is a
**market-informed composite** and must not be described as an independent model.
Model V2 is the independent rating and is shadow-only; its architecture guard
forbids importing any market-anchor code.

External-source ownership and refresh paths live in
[../DATA_SOURCES.md](../DATA_SOURCES.md) ("CFB — CollegeFootballData (CFBD) API
v2", "CFB — preseason market-anchor baseline (VSiN guide)"). Surface routing
lives in [../features/cfb.md](../features/cfb.md).

## Purpose and output meaning

JKB Preseason Power is a 0–99-style display rating of relative FBS team strength
for the 2026 season, computed once in the preseason. Higher is better. The
values are display scores, not ranks, points, spreads, probabilities, or betting
edges.

- **`jkbPowerRating`** — the market-informed composite documented here. It is a
  **MIC** value even though the field name does not say so (see Naming debt).
- **`offensiveRating` / `defensiveRating`** — JKB statistical offense / defense,
  carried forward unchanged from the statistical (`cfb-preseason-v1`) stage.
  These remain **statistical, not market-derived**.
- **`jkbRank`** — unique rank derived from `jkbPowerRating`.
- **`sosRemainingRating` / `sosRemainingRank`** — strength-of-schedule remaining,
  recomputed with the candidate JKB Power (the SOS engine uses opponent power).
- **`sosPlayedRating` / `sosPlayedRank`** — **always `null`** (SOS-played was
  never wired up).
- **`previousJkbRank`** — **always `null`** (no historical rank series exists).
- **`apRank` / `cfpRank`** — independent official-poll comparison fields. Copied
  in the consumer layer only; **never** passed to the rating calculation.

Per `KS-007`, presentation, ranking-for-display, tiering, and market-strip
helpers consume these published values and must not recompute them.

## Inputs

| Input | Source | Role |
| --- | --- | --- |
| Opponent-adjusted yards/play, points/play (2025) | CFBD `/games`, `/games/teams` bulk caches (`data/cfb/cfbd/raw/`) | Build JKB statistical offense (50% opp-adj YPP + 50% opp-adj PPP) and defense (inverted). |
| Prior-FCS fallback sample | `cfb:fetch-transition-teams` (`transition-teams-2025.json`) | Performance offense/defense inputs for FBS-transition teams, applied before league standardization. Never zero-rated. |
| Market power baseline | Steve Makinen's 2026 power-rating table, 2026 VSiN College Football Betting Guide (print PDF), transcribed once into `src/data/cfb/season2026/preseasonMarketBaseline.ts` (`CFB_PRESEASON_MARKET_BASELINE_2026`) | The market-informed anchor. Standardized league-wide as a population z-score. |
| Returning production | CFBD `/player/returning` (`percentPPA`, offense only) | **Excluded** from the 25% statistical component (option A) to avoid stacking a second preseason roster signal on the market baseline. |
| Talent composite | CFBD `/talent` | Stored in model inputs; roster-talent weight remains disabled. |
| AP / CFP rank | CFBD `/rankings` → `officialRankings.ts` | Independent comparison field only. |

## Exact current calculation

Implemented by `src/lib/cfb/marketAnchor.ts` (blend) over the statistical
`cfb-preseason-v1` output. From
[../cfb-preseason-market-anchor-v1.1.md](../cfb-preseason-market-anchor-v1.1.md):

1. Map all 138 source teams deterministically to JKB team ids.
2. Standardize the raw market baseline across the 138-team league with a
   population z-score (preserves ordering, ties, relative spacing).
3. JKB statistical offense = 50% opp-adj yards/play + 50% opp-adj points/play.
4. JKB statistical defense = 50% inverted opp-adj yards/play allowed + 50%
   inverted opp-adj points/play allowed.
5. Apply the generic prior-FCS fallback policy to the performance offense/defense
   inputs for every transition team (before step 7; not re-applied after blend).
6. Statistical power = 50% statistical offense + 50% statistical defense.
7. Standardize statistical power across the 138-team league with a population
   z-score.
8. Raw JKB Power = `0.75 × market z-score + 0.25 × statistical-power z-score`.
9. Generate unique ranks from raw JKB Power; break exact ties by ascending team id.
10. Convert raw JKB Power to the 40–99 display scale by percentile normalization,
    only after blending.

Existing JKB Offense / JKB Defense display ratings are carried forward unchanged
and remain statistical.

## Market influence

The production rating **is** market-informed. The `0.75` weight on the market
z-score means the market baseline is the dominant preseason signal; JKB
efficiency data contributes `0.25`.

The centralized in-season market/JKB fade bands (`CFB_MARKET_FADE_BANDS`) are
75/25 at 0 games, 65/35 after 1–2, 50/50 after 3–4, 35/65 after 5–6, 20/80 after
7–8, and 10/90 after 9 or more. **Only the preseason (75/25) band is active** in
the committed product. The typed future boundary reserves 2026 opponent-adjusted
offense/defense, record, scoring efficiency, and SOS Played without fabricating
current-season performance.

Public-facing methodology wording is fixed as: "JKB Preseason Power combines a
market-informed preseason strength baseline with JoeKnowsBall efficiency data."
This does not imply VSiN created or endorses JKB Power. Raw source values, VSiN
commentary, picks, prose, and branding are never exposed at runtime.

## Version and status

- Active version: `cfb-preseason-v1.1-market-anchor` (the `modelVersion` field of
  `data/generated/cfb/2026-preseason-ratings-v1.1.json`, surfaced as
  `CFB_V1_MODEL_VERSION`).
- Upstream statistical stage: `cfb-preseason-v1`
  (`data/generated/cfb/2026-preseason-ratings-v1.json`), a percentile-rank
  preseason power model whose weights are hand-set and explicitly **not** fit to
  outcomes (`src/lib/cfb/model/config.ts`).
- Calibration status: **none.** No calibration or validation gate is published
  for any CFB rating. Per `KS-008`, surfaces use descriptive language only
  ("JKB Preseason Power", "market-informed") and must not imply profitability,
  edge, or a calibrated probability.

## Artifacts, producers, consumers

**Pipeline (manual, in order):**

```
cfb:fetch-data            -> data/cfb/cfbd/raw/ (gitignored raw + SHA-256 manifest)
cfb:fetch-transition-teams -> transition-teams-2025.json
cfb:build-ratings          -> data/generated/cfb/2026-preseason-ratings.json / -v1.json (+ .csv)
cfb:calibrate / cfb:build-v1 -> 2026-preseason-ratings-v0.2-candidate.json, model-calibration-report.json
cfb:build-market-anchor    -> data/generated/cfb/2026-preseason-ratings-v1.1.json (+ .csv)
                              data/generated/cfb/2026-preseason-v1.1-shrinkage-audit.json
```

No CFB refresh automation exists for the production ratings; `npm run cfb:*` is
run locally and the regenerated JSON committed. (`cfb-market-odds-refresh.yml`
and `cfb-official-rankings-refresh.yml` refresh only odds and official rankings,
not the power ratings.)

**Production-consumed artifact:**
`data/generated/cfb/2026-preseason-ratings-v1.1.json` →
`src/data/cfb/season2026/ratings.ts` (`CFB_V1_RATINGS_2026`) →
`src/data/cfb/index.ts` → `src/pages/cfb/*.tsx` (build-time import; static SPA,
no runtime fetch).

**Consumers:** the `/college-football` Landing, Rankings, Schedule, Team, Matchup
(Power Comparison + Power Rating Line), and Conference surfaces.

**Not directly consumed** (provenance only): `2026-preseason-ratings.json`,
`-v1.json`, `-v0.2-candidate.json/.csv`, `model-calibration-report.json`,
`2026-preseason-v1.1-shrinkage-audit.json`, normalized-games intermediates.

## CFB Model V2 shadow IPR — boundary summary

`cfb-ipr-v2.0` is the independent rating. It is frozen in
`src/lib/cfb/production/v2/config.ts` (`CFB_V2_FROZEN_CONFIG`,
`CFB_V2_CONFIG_VERSION`) and generates a read-only browser artifact
`public/data/cfb/v2/shadow-projections.json` via `scripts/cfb-v2-build-shadow.ts`
(`npm run cfb:v2:build-shadow`) on workflow `cfb-v2-shadow-refresh.yml`.

- The current committed artifact reports `asOfWeek: 0`, `healthState: "DEGRADED"`
  (`MISSING_CURRENT_TALENT`, `PRESEASON_PRIOR_A_FALLBACK`,
  `NO_CURRENT_SUCCESS_DATA`, `PRESEASON_ZERO_COMPLETED_GAMES`), and every record
  has `projectionStatus: "unavailable"` with null points/margin/probability.
- The app-side consumer `src/data/cfb/v2/shadowProjections.ts` exists but
  `CFB_V2_ROLLOUT_STATE = "stage-2-infrastructure-ready"`: no `.tsx` file imports
  it and it is not in the bundle graph.
- Market-free guarantee: `src/lib/cfb/production/v2/architectureGuard.test.ts`
  and `scoringSupportMarketFreeGuard.test.ts` assert V2 code never imports
  `marketAnchor.ts`, `CFB_V1_CONFIG`, or any market-anchor artifact.

Full objective, validation basis, completed work, and promotion gates:
[../plans/active/cfb-model-v2.md](../plans/active/cfb-model-v2.md).

## Naming debt

- **`jkbPowerRating` is a bare field name for a MIC value.** It already blends
  market information but nothing in the field name or the `CfbJkbRatings` type
  says so. Model V2's design (`docs/cfb-model-v2-production-integration-plan.md`
  §6) requires that new rating fields carry an explicit `ipr`/`mic` qualifier and
  that this field be *documented* as MIC rather than silently reinterpreted as
  IPR when V2 lands.
- **`v1` / `v1.1` are ambiguous** across the statistical stage, the market-anchor
  stage, and the app constant `CFB_V1_MODEL_VERSION`. The V2 plan replaces this
  with explicit per-layer immutable ids.
- The public label "JKB Preseason Power" is used for the composite without the
  MIC qualifier; only the sub-label copy ("market-informed") disambiguates it.

## Known limitations

- Only the preseason 75/25 band is active; there is no in-season update path in
  the committed product.
- The `0.75` market weight makes the rating primarily a re-standardized print
  guide table; the JKB statistical contribution is `0.25`.
- The statistical component is the `cfb-preseason-v1` percentile model with
  hand-set weights not fit to outcomes.
- The market baseline is a single redistribution-constrained print source,
  transcribed once, not a live feed; it cannot be regenerated automatically.
- Returning production and talent signals are deliberately excluded / disabled.
- No calibration or validation gate exists (`KS-008`); no probability, edge, or
  +EV interpretation is licensed.
- `sosPlayedRating/Rank` and `previousJkbRank` are permanently null in 2026.

## Versioning and reopening criteria

Create and document a new version before changing: the `0.75 / 0.25` blend
weight, the fade-band schedule, the population z-score standardization, the
40–99 percentile display transform, the statistical offense/defense formulas
(50/50 YPP/PPP), the prior-FCS fallback policy, the returning-production
exclusion, the tie-break rule, or the AP/CFP independence.

Reopen the methodology before: activating any in-season band, feeding any
current-season 2026 performance into the rating, changing the market source, or
promoting CFB Model V2 IPR into any production UI field (that is a separate,
plan-gated decision — see [../plans/active/cfb-model-v2.md](../plans/active/cfb-model-v2.md)).
