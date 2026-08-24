# CFB Model V2 — Production Integration Plan (Phase 10)

Status: **design only — nothing in this document has been implemented.** No production file listed below has been modified as part of writing this plan. This document is the deliverable of CFB Model V2 Phase 10 (branch `feat/cfb-model-v2-research-foundation`), produced after Phase 9 classified the Phase 8 connectivity-aware finalist as **B — GO, ANALYTICS-ONLY CANDIDATE**.

---

## 1. Current production CFB architecture map

The production CFB stack is a **build-time-only** system: there is no server runtime and no scheduled job. Every artifact is a static JSON file, imported at build time via ES module `import`, and bundled into the Vite/React SPA. "Refreshing" data today means: run a script locally → commit the regenerated JSON → rebuild/redeploy.

```
CFBD API
  → scripts/cfb-fetch-data.ts                 (raw cache: data/cfb/cfbd/raw/*.json)
  → scripts/cfb-fetch-transition-teams.ts      (FCS-transition raw cache)
  → scripts/cfb-build-ratings.ts               (src/lib/cfb/pipeline, src/lib/cfb/model)
      → data/generated/cfb/2026-preseason-ratings.json / .csv
      → data/generated/cfb/2026-preseason-ratings-v1.json / .csv   (candidate variant)
  → scripts/cfb-calibrate-model.ts             (src/lib/cfb/calibration, src/lib/cfb/production)
      → data/generated/cfb/2026-preseason-ratings-v0.2-candidate.json
      → data/generated/cfb/model-calibration-report.json
  → scripts/cfb-build-market-anchor-production.ts   (src/lib/cfb/marketAnchor)
      → data/generated/cfb/2026-preseason-ratings-v1.1.json / .csv   ← THE production ratings file
      → data/generated/cfb/2026-preseason-v1.1-shrinkage-audit.json
  → data/generated/cfb/2026-schedule.json / 2026-schedule-v1.json    ← schedule + odds + model placeholder
       ↓
  src/data/cfb/season2026/ratings.ts     (static import → CFB_V1_RATINGS_2026)
  src/data/cfb/season2026/schedule.ts    (static import → CFB_GAMES_2026)
       ↓
  src/data/cfb/index.ts (getTeamById / getGameById / composed CfbTeam view models)
       ↓
  src/pages/cfb/*.tsx  (CollegeFootballLanding, Rankings, Schedule, TeamPage, Matchup, Conference)
       ↓
  src/components/cfb/*.tsx  (CollegeFootballOddsDisplay, ComparisonRow, TeamLogo, DataNotice, …)
```

Key production library dirs (all under `src/lib/cfb/`, distinct from `src/lib/cfb/research/`):
- `pipeline/` — CFBD raw-JSON normalization + opponent adjustment (iterative method, preseason-only). `config.ts`, `normalizeCfbd.ts`, `opponentAdjustment.ts`, `validateRatings.ts` (the existing fail-closed precedent — `assertCompleteCfbRatings` throws rather than publishing partial ratings).
- `model/` — the V1 percentile-rank preseason power model. `config.ts` (`CFB_MODEL_CONFIG` — hand-set weights, explicitly *not* fit to outcomes), `preseasonModel.ts`, `rank.ts`, `normalize.ts`, `sos.ts`.
- `calibration/` — the V0.2 candidate grid-search calibration harness used historically to pick V1's opponent-adjustment strength/iterations. `config.ts` (`CFB_CALIBRATION_GRID`), `modelCalibration.ts`.
- `production/` — `CFB_V1_CONFIG` (freezes the V0.2 candidate config as "v1") plus `transitionShrinkage.ts` (FCS→FBS transition-team fallback blending).
- `marketAnchor.ts` (top-level, not a subdir) — the V1.1 blend of a manually-sourced preseason market baseline (VSiN guide, see `docs/cfb-preseason-market-anchor-v1.1.md`) with the V1 statistical power, via `CFB_MARKET_FADE_BANDS` (75/25 at 0 games played → 10/90 at 9+).
- `routes.ts`, `format.ts`, `comparison.ts`, `ratingPresentation.ts`, `schedulePresentation.ts`, `standings.ts`, `rankings.ts`, `sosPresentation.ts`, `sectionNav.ts` — UI-facing presentation helpers.

No API/server functions, no Vercel serverless functions for CFB, no cron/GitHub Actions workflow for CFB refresh. `npm run cfb:refresh` = `cfb:fetch-data && cfb:build-ratings` and is invoked manually.

---

## 2. Current V1/V1.1 artifact/contracts

**Production-consumed artifacts** (the two files actually imported by `src/data/cfb/season2026/*.ts`):

| File | Consumer | Shape |
|---|---|---|
| `data/generated/cfb/2026-preseason-ratings-v1.1.json` | `src/data/cfb/season2026/ratings.ts` | `{ modelVersion, rows: [{ teamId, rank, jkbPower, jkbOffense, jkbDefense, sosPlayedRating: null, sosPlayedRank: null, sosRemainingRating, sosRemainingRank }] }` |
| `data/generated/cfb/2026-schedule-v1.json` | `src/data/cfb/season2026/schedule.ts` | `CfbGame[]` — see `CfbGame`/`CfbGameOdds`/`CfbGameModelProjections` in `src/data/cfb/types.ts` |

**Not directly consumed by production** (intermediate/candidate/audit artifacts, kept for provenance): `2026-preseason-ratings.json`, `2026-preseason-ratings-v1.json`, `2026-preseason-ratings-v0.2-candidate.json/.csv`, `model-calibration-report.json`, `2026-preseason-v1.1-shrinkage-audit.json`, `2025-normalized-games.json`, `2025-transition-team-normalized-games.json`.

**UI fields currently expected** (`CfbJkbRatings`, `src/data/cfb/types.ts`): `jkbRank`, `previousJkbRank` (always null today — no historical rank series exists), `apRank` (independent, non-model), `jkbPowerRating`, `offensiveRating`, `defensiveRating`, `sosPlayedRating`/`sosPlayedRank` (**always null** — SOS-played was never wired up), `sosRemainingRating`/`sosRemainingRank`.

**Game-level model placeholder already exists and is currently all-null in production**: `CfbGameModelProjections` = `{ jkbProjectedSpread, jkbProjectedTotal, homeWinProbability, awayWinProbability, neutralPowerDifference, homeFieldAdjustment, jkbPowerLine }`. The type's own comment reads *"Model projection placeholders — do not invent values in Phase 1."* `CollegeFootballMatchup.tsx` already branches on `game.model.jkbPowerLine != null || game.model.jkbProjectedSpread != null` to decide whether to render a "model ready" state. **This is the exact contract Model V2 is expected to fill.**

**Null placeholders**: `sosPlayedRating`/`sosPlayedRank` (hardcoded null in the generator, `ratings.ts`), all of `CfbGameModelProjections` (never populated), `previousJkbRank` (no history retained).

**Market-anchor dependency**: `2026-preseason-ratings-v1.1.json` (the production ratings file) is built from `2026-preseason-ratings-v1.json` (statistical) blended with a hand-entered `CFB_PRESEASON_MARKET_BASELINE_2026` constant (`src/data/cfb/season2026/preseasonMarketBaseline.ts`) — i.e. **production ratings today already contain market information**, sourced once preseason from a print guide, not a live feed.

**Refresh scripts**: `cfb:fetch-data` → `cfb:build-ratings` → `cfb:calibrate`/`cfb:build-v1` → `cfb:build-market-anchor`, run manually, in that order, no automation.

**Deployment assumptions**: static SPA, artifacts baked into the JS bundle at build time (no runtime fetch, no ISR/SSR data fetching observed for CFB).

---

## 3. Frozen V2 specification

(Restated from the Phase 9-validated candidate, unchanged here — this document does not modify it.)

- Team metrics: YPP + PPP, gameWeighted, no garbage-time filter.
- Prior: Prior D (offense: prev-season opponent-adjusted offense + returning production + talent; defense: prev-season opponent-adjusted defense + talent), Phase 3's downward-only fallback hierarchy, never zero-imputed.
- Opponent adjustment: Ridge, `COMPONENT_SIZE` connectivity-aware per-team λ, base λ=10, multiplier capped ≤3×.
- Scoring: coherent home/away regression, national HFA, `BLENDED_CURRENT` scoring environment, `SUCCESS` secondary block, no pace.
- Total calibration: `TOTAL_ONLY`, pooled `LINEAR`, margin preserved exactly.
- Probability: empirical residual bootstrap, seed `20260101`, 20,000 draws, homoskedastic.
- Validated 2020–2025: margin MAE ≈12.865, RMSE≈16.225, corr≈0.600, directional accuracy≈71.1%; Brier≈0.188, log loss≈0.553, ECE≈0.010; 4/6 seasons improved, 2/6 tied, 0/6 materially worse; no validated betting edge (Phase 6/9).

---

## 4. Proposed V2 production artifact schemas

New artifact family under a **new, versioned directory**, never `data/cfb/research/`:

```
data/generated/cfb/v2/
  2026-preseason-team-ratings.json      (generated once, frozen at season start)
  2026-week-{N}-team-ratings.json       (generated weekly, one file per completed-through week)
  2026-week-{N}-projections.json        (generated weekly, upcoming-week games)
  2026-v2-manifest.json                 (provenance/versions/hashes for the above)
```

**Team ratings row** (research → production field mapping in parentheses):

```ts
type CfbV2TeamRating = {
  teamId: string;                    // JKB team id (mapped from CFBD externalTeamId)
  season: number;
  asOfWeek: number;                  // ratings reflect games completed strictly before this week
  offenseRating: number;             // research: offense (standardized)
  defenseRating: number;             // research: defense (standardized)
  overallRating: number;             // 0.5*(offense+defense) — display convenience, not a model input
  preseasonPriorOffense: number | null;
  preseasonPriorDefense: number | null;
  priorTier: string;                 // "PRIOR_D" | fallback tier actually resolved (Phase 3 Section 9)
  connectivity: {
    componentSize: number;
    gamesPlayed: number;
    regularizationMultiplier: number; // the actual λ_i / baseLambda ratio applied this week
  };
  ratingStatus: "computed" | "insufficient-data"; // fail-closed status, mirrors assertCompleteCfbRatings
  modelVersion: string;               // "cfb-ipr-v2.0"
  configVersion: string;              // "cfb-ipr-v2.0-config"
  generatedAt: string;                // ISO timestamp
  dataAsOf: string;                   // ISO timestamp of the last completed game folded in
};
```

**Game projection row**:

```ts
type CfbV2GameProjection = {
  gameId: string;
  season: number;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  matchupPopulation: "fbs_vs_fbs" | "fbs_vs_fcs" | "unsupported"; // Section 14 — never fabricate for non-fbs_vs_fbs
  expectedHomePoints: number | null;
  expectedAwayPoints: number | null;
  projectedMargin: number | null;    // home - away
  projectedTotal: number | null;
  homeWinProbability: number | null;
  awayWinProbability: number | null;
  marginInterval80: [number, number] | null;
  totalInterval80: [number, number] | null;
  asOfWeek: number;
  modelVersion: string;               // "cfb-ipr-v2.0" + "cfb-scoring-v2.0" + "cfb-probability-v2.0" bundled below
  versions: { ipr: string; scoring: string; calibration: string; probability: string };
  generatedAt: string;
  dataAsOf: string;
};
```

Internal research-only fields explicitly **excluded** from production artifacts: raw residual pools, full simulation draws, week-by-week walk-forward intermediate ratings for past weeks other than the frozen `asOfWeek` snapshot, market-line data of any kind (Section 6/21 hard boundary).

---

## 5. Model/config versioning strategy

Replace the ambiguous "v1"/"v1.1" pattern with explicit, independently-versioned, immutable ids — one per architectural layer, matching Phase 9's own `versions` bundle:

- `cfb-ipr-v2.0` — rating foundation (metrics + prior + connectivity Ridge). Bump the minor version (`v2.1`) for any parameter change (λ, connectivity policy); bump major (`v3.0`) for an architecture change.
- `cfb-scoring-v2.0` — scoring regression (HFA/environment/secondary block).
- `cfb-calibration-v2.0` — total calibration.
- `cfb-probability-v2.0` — bootstrap/distribution.
- `cfb-v2-config` — a single config-hash id (sha256 of the frozen `phase9-production-candidate.json`-style snapshot) stored alongside the four above, so a silent parameter drift is always detectable even if someone forgets to bump a named version.

Every generated artifact carries: `modelVersion` (the bundle, e.g. `"cfb-v2.0"`), `versions` (the four above), `configVersion` (the hash), `generatedAt`, `dataAsOf`, `season`, `asOfWeek`, and (for team ratings) `provenance: "model-computed"` matching the existing `CFB_PIPELINE_CONFIG.modelProvenance` convention.

---

## 6. IPR/MIC boundary design

Define two explicit, never-conflated production concepts:

- **IPR (Independent Predictive Rating)** — Model V2 exactly as validated in Phase 9. Derived only from CFBD box-score/schedule/roster data. Field prefix/namespace: `v2*` or a dedicated `ipr` object, e.g. `rating.ipr.offenseRating`. **Never reads market data, ever, at any layer** (mirrors the Phase 6-9 architecture-guard pattern — this constraint should get its own production test, see §17).
- **MIC (Market-Informed Consensus)** — anything that blends market data in (today's V1.1 market-anchor is architecturally a MIC, even though it predates the name). Field namespace: `mic*` or a dedicated `mic` object, e.g. `rating.mic.blendedPower`.

Naming rule for new code: **never ship a bare field like `powerRating` again.** Every rating field name must make its provenance unambiguous — `iprOffenseRating` vs `micBlendedPower`, not `offenseRating` used for both. Existing `CfbJkbRatings.jkbPowerRating` (currently MIC, since V1.1 already blends market) should be documented as MIC in a follow-up work unit rather than silently reinterpreted as IPR when V2 lands.

---

## 7. V1.1 market-anchor recommendation

**Recommendation: relabel, don't delete.** `2026-preseason-ratings-v1.1.json` and `marketAnchor.ts` should be renamed/documented as **MIC** (not deprecated) once V2 IPR exists, and — as a *separate, later* work unit, explicitly out of scope for Phase 10 implementation — MIC's "statistical" input could eventually be regenerated from V2 IPR instead of V1's percentile system, since V2 IPR is a strictly better independent signal. That regeneration is a MIC change, not an IPR change, and must not happen inside Phase 10.

**Dependency map**: `marketAnchor.ts` ← `2026-preseason-ratings-v1.json` (V1 statistical) + `preseasonMarketBaseline.ts` (hand-entered) + `apRankings.ts`. Nothing currently downstream of MIC feeds back into any rating computation — good, no cycle to break.

**Hard rule enforcement**: add an architecture-guard-style test (mirroring `phase*/architectureGuard.test.ts`) asserting the future `src/lib/cfb/v2/` production directory never imports `marketAnchor.ts`, `CFB_V1_CONFIG`, or any file under `data/generated/cfb/*market-anchor*`.

---

## 8. Preseason data refresh

Design (not implemented): a `cfb:v2:preseason` job, run once per season before Week 1, mirroring Phase 3's exact leakage boundary:

1. Fetch prior-season final games (for opponent-adjusted prior-season offense/defense), returning production, talent, current-season team/classification list (FBS transitions identified here).
2. Compute Prior D per team via the frozen Phase 3 regression (reused research code, called from a thin production wrapper — see §11).
3. **Freeze** the resulting `preseasonPriorOffense`/`preseasonPriorDefense`/`priorTier` per team into a versioned artifact (`2026-preseason-team-ratings.json`, `asOfWeek: 0`). This snapshot is never recomputed mid-season — it is the fixed anchor every weekly Ridge run blends toward.
4. Missing-data fallback: identical Phase 3 downward-only chain (PRIOR_D → PRIOR_C → PRIOR_A → LEAGUE_MEAN); a team landing on `LEAGUE_MEAN` is recorded with `priorTier: "LEAGUE_MEAN"` in the artifact, never silently zero-filled.

---

## 9. Weekly update workflow

Verified against the actual Phase 4/8/9 core loops (`phase8WalkForwardCore.ts`, `phase4WalkForwardCore.ts`) — the real dependency order is:

1. Fetch newly-completed games (scores) + any schedule changes for the upcoming week.
2. Normalize into the production game/team-game shape (reuse `pipeline/normalizeCfbd.ts`-equivalent logic, ported/adapted — not the research normalize path).
3. Rebuild the schedule graph through the just-completed week (connected components, per-team component size, games played) — **must happen before** rating computation, since connectivity feeds the per-team λ.
4. Compute connectivity-aware Ridge+prior ratings using the frozen preseason prior + this week's graph snapshot.
5. Refit the scoring-translation regression on all prior-week training rows using this week's rating snapshot (Section 9 of Phase 9: this refit is *downstream translation*, not rating retuning — same discipline applies in production).
6. Generate expected home/away points for the **upcoming** week's scheduled games only.
7. Fit/update the pooled linear total calibration from the training-window residuals through last week.
8. Update the residual pool (bootstrap population) with last week's new residuals.
9. Generate probabilities/intervals for upcoming games via the empirical bootstrap.
10. Write deterministic artifacts (team ratings + game projections + manifest).
11. QA gate (§16) — validate before anything is considered publishable.
12. Publish (commit artifact + trigger rebuild/redeploy — see §19 for where this should run).

This is the same order Phase 8/9's walk-forward already proves leakage-safe; production must not reorder steps 3↔4 or skip step 3 for "convenience."

---

## 10. Production data requirements

| Tier | Endpoints | Cadence |
|---|---|---|
| **Preseason required** | `/games` (prior season, final), `/player/returning`, `/talent`, `/teams` (current season classification/conference) | Once/season |
| **Weekly required** | `/games` (current season, incremental — new completed games + updated schedule), `/games/teams` (box-score stats for YPP/PPP inputs) | Weekly |
| **Historical training only** | 2018–2019 warm-start seasons (needed only to give the walk-forward a non-degenerate first trainable prior; already cached, not re-fetched weekly) | Never in prod refresh |
| **Research only, excluded from production** | `/player/usage`, `/coaches`, `/player/portal`, `/lines` (market), full 2018–2025 backfill corpus (~2.5GB) | Never touched by `cfb:v2:*` scripts |

Production V2 must maintain its **own** small raw-cache directory (e.g. `data/cfb/v2-production-cache/`), separate from `data/cfb/research/raw/` (research corpus stays gitignored and untouched by production).

---

## 11. Offline-vs-weekly parameter plan

| Parameter | Trained | Recomputed |
|---|---|---|
| Preseason prior regression coefficients (Phase 3 tier models) | Once/season, offline (§8) | Never mid-season |
| Preseason prior values per team | Once/season | Never mid-season |
| National HFA constant | Fixed research-validated constant, versioned in `cfb-scoring-v2.0` config | Never (not re-estimated weekly) |
| Connectivity λ formula/constants (`COMPONENT_SIZE_K`, cap) | Fixed, versioned in `cfb-ipr-v2.0` config | Never |
| Team offense/defense ratings | — | **Every week** (this is the whole point of the walk-forward) |
| Scoring-regression coefficients | — | **Every week** (Section 9 — downstream refit, cheap: a small OLS, not a search) |
| Total-calibration slope/intercept | — | **Every week** (pooled linear refit on growing residual set) |
| Residual bootstrap population | — | **Every week** (append last week's residuals) |

The expensive part of research (the Phase 8 grid search across λ/connectivity/staleness candidates) is **never** production work — it already happened, its output is the frozen config in §3/§5. Production only ever runs the *walk-forward with fixed hyperparameters*, which Phase 9 measured at ~57s/season-equivalent for the full rating+scoring step (342s finalist / 6 seasons ≈ 57s/season including the bootstrap; a single incremental week is a small fraction of that).

---

## 12. Bootstrap production recommendation

**Recommend Option B: precompute empirical residual quantiles/CDF, not a live 20,000-draw simulation per publish.** Phase 9 already proves the *seeded* 20,000-draw simulation is deterministic and validated — the recommendation is not to change the validated math, only to precompute its outputs once per weekly refresh (not per page load, not per API call, since there is no API/page-load path today anyway — everything is static). Concretely: run the existing deterministic bootstrap once during the weekly artifact-generation job (§9 step 9), and persist only its **outputs** (win probability, the four margin/total interval pairs) into the game-projection artifact — never re-run it client-side or on-demand. This is Option A (retain the validated simulation) executed at the right layer (build-time batch), which is functionally equivalent to Option B's cost profile since the SPA has no runtime compute budget to protect. Reduced-draw-count (Option C) is not recommended without a fresh convergence test against the validated 20,000-draw numbers — out of scope to test in Phase 10.

Benchmark: Phase 9's full 6-season, ~3,900-game bootstrap took ~342s. A single week's upcoming slate (≤~70 FBS games) with a training pool already computed is a tiny fraction of that — expect low single-digit seconds, well inside any CI job budget.

---

## 13. Current week / as-of semantics

Definition: **a rating/projection with `asOfWeek: N` reflects every FBS-vs-FBS game with a completed final score at generation time, and is used to project every scheduled game not yet started.** This is *not* a calendar-week cutoff — it is a completed-game-set cutoff, matching exactly how the research walk-forward already treats "week" (Phase 4/8 core: `games.filter(g => g.week < week)`).

Handling:
- **Tuesday/Wednesday/MACtion games**: since the cutoff is "completed games," not "Saturday," a Tuesday game completed before Thursday's slate is correctly folded in before that Thursday's projections generate — as long as the weekly job runs *after* the last game of the trailing week and *before* the first game of the upcoming week finishes. Recommend running the weekly job **daily**, recomputing the same `asOfWeek` idempotently until the next week's games start, rather than once/week — cheap (§19) and removes the whole "what counts as this week" ambiguity.
- **Postponed games**: excluded from the graph/ratings until they have a final score, regardless of original scheduled week (matches `status: "final"` gating already used throughout research).
- **Week 0**: treated as week 1 for cutoff purposes if CFBD reports it separately; no special-case code, since the walk-forward already generalizes to "whatever week numbers exist in the data."
- **Conference championships / bowls / playoffs**: `gameType !== "regular"` (research's own `CfbResearchGame.gameType`) — include them in the graph/ratings once completed (real games, real information) but the FBS-vs-FBS/postseason split should be visible in the artifact for QA, not silently merged.

---

## 14. FCS handling

Model V2 is validated **FBS-vs-FBS only**. Production must never fabricate a V2 projection for an FBS-vs-FCS game.

**Recommended behavior**: `matchupPopulation: "fbs_vs_fcs"` rows get `expectedHomePoints/expectedAwayPoints/projectedMargin/... : null` and the UI shows an explicit "Independent projection unavailable — non-FBS opponent" state (reusing the existing `CollegeFootballDataNotice` component pattern already present on the matchup page) rather than falling back to V1/MIC silently under a V2-labeled UI element. If a rating is still desired for FBS-vs-FCS games, that is V1.1/MIC's existing job (it already has an FCS transition-fallback policy) — never blend V1 numbers into a field labeled as V2/IPR.

---

## 15. New/transition FBS teams

Model V2's own connectivity-aware shrinkage already handles this correctly (Phase 8/9 validated a −0.66 to −0.79 MAE improvement specifically on transition-team games) — **no additional hardcoded logic needed in production.** A transition team simply has no `preseasonPriorOffense`/`preseasonPriorDefense` (both null, `priorTier: "LEAGUE_MEAN"` or whatever tier the fallback chain resolves), and the connectivity multiplier naturally pulls it toward the league mean until its component size/games-played grow. The production artifact should surface `priorTier` and `connectivity.componentSize` precisely so this is inspectable, not to drive any special-case branch.

---

## 16. QA / fail-closed rules

Mirroring the existing `assertCompleteCfbRatings` precedent (`pipeline/validateRatings.ts`), a production V2 publish must **abort** (throw, non-zero exit, no artifact write) rather than publish a partial/degraded artifact, whenever:

- Any expected FBS team is unresolved (external-id → JKB-id mapping miss).
- Any team's rating is `insufficient-data` beyond a documented, expected early-week population (e.g. week 1 before any games — that's expected-null, not a failure; week 6 with an unresolved team is a failure).
- The schedule graph fails to build (malformed game rows, orphaned team ids).
- Total calibration coefficients are unavailable when the training pool should be non-empty.
- Any probability is `NaN`/`Infinity`/outside `[0,1]`, or any margin/total is non-finite.
- `dataAsOf` is inconsistent with `asOfWeek` (e.g. a "week 6" artifact whose newest completed game is from week 3 — stale-fetch detector).
- A game already has a final score but is still being projected (must be excluded, not projected retroactively).
- Artifact provenance (`modelVersion`/`configVersion` hash) doesn't match the code that's about to run — refuse to silently regenerate under a stale version id.

**Never** manufacture a fallback betting projection, and never let a QA failure silently fall back to MIC/V1 under a V2-labeled field — a failed V2 generation means **no V2 output that day**, full stop (see §25 rollback).

---

## 17. Production test strategy

- **Unit**: connectivity multiplier formula/cap, prior-centered Ridge penalty, prior fallback chain, score coherence (`expectedHome+expectedAway == projectedTotal` etc.), total-calibration application, probability bounds `[0,1]`/sums to 1, bootstrap determinism (same seed → same output, reusing Phase 9's own `pipelineFidelity.test.ts` pattern).
- **Integration**: current production raw cache → ratings → projections → artifact, one end-to-end test per weekly-job run, asserting artifact schema + no NaN + provenance fields present.
- **Regression**: a small frozen set of historical (already-known-outcome) games re-run through the exact production code path, asserting numbers match Phase 9's own validated numbers within tolerance (see §18 golden fixtures).
- **Architecture**: a production-side guard test (same pattern as `phase*/architectureGuard.test.ts`) asserting `src/lib/cfb/v2/**` never imports `marketAnchor.ts`/`CFB_V1_CONFIG`/anything under `data/generated/cfb/*market-anchor*`, and that MIC code never becomes an input to a V2-labeled field.

---

## 18. Golden fixtures

A small, hand-picked, frozen set of historical games (2020–2025, already used in Phase 7-9's own findings, so the "interesting" cases are already identified):

| Case | Example source | What to check |
|---|---|---|
| Normal midseason FBS game | Any week 6-8 conference game | Margin/total/probability within tight tolerance of a locked snapshot |
| Week 1 disconnected game | A 2020/2021 week-1 game (component_1 bucket) | Confirms connectivity shrinkage activates correctly with zero games played |
| Transition-team game | One of Phase 7/8/9's transition-team n=87 sample games | Confirms `priorTier`/connectivity fields populate, no crash on null preseason prior |
| Nonconference game | Any Phase 9 nonconference-bucket game | Confirms cross-conference connectivity metric computes |
| High-confidence mismatch | A game from the `>90%`/`<10%` probability bucket | Confirms extreme-probability path doesn't clip/NaN |
| Close matchup | A game near `pHomeWin≈0.5` | Confirms interval/probability symmetry |

Recommend **tolerance-checked** (not byte-hash-locked) for margin/total/probability (floating-point walk-forward across a refactor from research → production code will not be bit-identical even when correct), but **hash-locked** for the deterministic bootstrap draws themselves (same seed, same residual pool → byte-identical simulation, exactly as Phase 9's determinism test already proves at the research layer).

---

## 19. Performance/runtime plan

| Job | Est. runtime (from Phase 8/9 measurements) | Where it should run |
|---|---|---|
| Preseason full build (prior regression + freeze) | Seconds (Phase 3-scale, not full walk-forward) | Local / GitHub Actions, once/season |
| Weekly refresh (ratings + projections for one new week) | Low single-digit seconds to ~1 minute (small fraction of Phase 9's 342s/6-season figure) | GitHub Actions (scheduled, daily during season per §13) |
| One-game projection (ad hoc/debug) | Sub-second once ratings are cached | Local script only, not a production path |
| Full-slate probability generation | Included in weekly refresh above | Same GitHub Actions job |

**Recommend GitHub Actions**, not Vercel build/API runtime: this matches the repo's existing "no CFB automation yet" reality (§1) and the SPA's static-artifact model — a scheduled Action can fetch, compute, validate, commit the regenerated JSON, and either open a PR or push directly to trigger the existing Vercel static rebuild. No new runtime infrastructure is required; this is the same shape as `cfb:refresh` today, just scheduled and gated by §16's QA instead of run-and-hope manually.

---

## 20. Production scripts plan

Following the existing `cfb:*` naming convention (not `cfb:research:*`, and avoiding any collision with it):

```
cfb:v2:fetch              vite-node scripts/cfb-v2-fetch-data.ts
cfb:v2:preseason          vite-node scripts/cfb-v2-build-preseason-prior.ts
cfb:v2:build-ratings      vite-node scripts/cfb-v2-build-ratings.ts
cfb:v2:build-projections  vite-node scripts/cfb-v2-build-projections.ts
cfb:v2:validate           vite-node scripts/cfb-v2-validate.ts
cfb:v2:refresh            npm run cfb:v2:fetch && npm run cfb:v2:build-ratings && npm run cfb:v2:build-projections && npm run cfb:v2:validate
```

`cfb:v2:validate` is a standalone script (not folded silently into `build-projections`) so QA (§16) can be re-run against an already-generated artifact without recomputation, and so CI can gate a commit on it explicitly.

---

## 21. Artifact-promotion strategy

Hard rule: **no production page or production script may import from `data/cfb/research/**` or `src/lib/cfb/research/**`, ever.** Production V2 code (`src/lib/cfb/v2/`, new) may **import research's pure, frozen library functions** the same way Phase 9 itself did (e.g. `phase3/buildPriorsForSeasons`, `phase8/candidateRatings`-equivalent logic) — this is "informed by research," which is allowed — but it must read its own production raw-cache (§10) and write only to `data/generated/cfb/v2/` (§4), never to `data/cfb/research/experiments/`. This mirrors exactly how Phase 6-9 were allowed to import earlier phases read-only but never wrote back into them — the same discipline extends one more hop into production.

A dedicated test (extending §17's architecture guard) should assert: no file under `src/pages/`, `src/components/`, or `src/data/cfb/season2026/` imports anything matching `/research\//`.

---

## 22. UI data-contract recommendation

The existing `CfbGameModelProjections` type (§2) is **already the right shape** to receive V2 output almost as-is: `jkbProjectedSpread` ← `-projectedMargin` (sign convention: production stores spread from the home team's perspective per `CfbGameOdds`'s own comment — needs a documented, tested sign flip from research's `home - away` convention), `jkbProjectedTotal` ← `projectedTotal`, `homeWinProbability`/`awayWinProbability` ← direct, `jkbPowerLine` ← could stay MIC-sourced or be redefined; **recommend renaming it or adding a parallel V2-labeled field** rather than silently changing its meaning (see §6's no-bare-`powerRating` rule — `jkbPowerLine` has the same ambiguity problem and should get an explicit `ipr`/`mic` qualifier when V2 lands, not be silently repointed). `neutralPowerDifference`/`homeFieldAdjustment` map naturally to the rating differential and HFA term respectively.

`CfbJkbRatings` needs **additive** fields (not a breaking rename) to carry V2 team-level output alongside existing V1.1/MIC fields — e.g. a new nested `ipr?: { offenseRating, defenseRating, overallRating, priorTier, connectivity }` object, optional so existing consumers are unaffected until UI work explicitly reads it (§6's WU boundary, §24).

**Terminology constraint** (binding on any future UI copy): never label model-vs-market disagreement as "+EV," "edge," "best bet," or "profitable" — Phase 6/9 do not support that claim. Safe terms: "Model Projection," "JKB Projection," "Independent Rating," "Model vs. Market Difference" (purely descriptive, no directional claim of correctness).

---

## 23. Explainability

Safe to surface, all already present in the proposed schema (§4) and directly traceable to a specific research finding:
- Offense/defense rating (with the understanding that these are standardized, not raw box-score numbers).
- Preseason-prior tier (`PRIOR_D`/fallback) — communicates "how much of this rating is early-season prior vs. current evidence."
- Schedule-connectivity context (component size, games played) — communicates "how much cross-opponent information supports this rating," directly answering "why is this rating volatile/uncertain."
- Sample/confidence context: games played, whether the team is a transition team.

Avoid implying deterministic causal explanation ("Team X is favored *because of* returning production Y%") — the model is a regression, not a causal model; UI copy should describe *inputs*, not *causes*.

---

## 24. Backward compatibility

Every current consumer of `data/generated/cfb/2026-preseason-ratings-v1.1.json` and `2026-schedule-v1.json` (all of `src/pages/cfb/*.tsx` via `src/data/cfb/index.ts`) would break on any breaking schema change to those two files. **Recommendation: additive only.** V2 artifacts live at new paths (§4); `CfbJkbRatings`/`CfbGame` gain optional new fields; nothing existing is renamed or removed in the same work unit that adds V2. A dedicated migration work unit, later, can retire V1.1-as-primary once V2/MIC-relabeled coexistence (§7) has run long enough to trust — not part of Phase 10's scope or the first implementation WU.

---

## 25. Rollback plan

If V2 generation fails (§16 QA gate trips): **do not publish.** The previous week's last-known-good V2 artifact remains in place (git history / last successful commit) and continues to be served — this is naturally how the static-artifact model already behaves (a failed script run simply doesn't overwrite the committed file). The UI must **never** substitute MIC data into a field labeled as V2/IPR to paper over a missing V2 artifact — if V2 is unavailable for a game/week, the V2-labeled UI element shows an explicit "unavailable" state (§14's pattern), and any MIC/V1.1 display stays clearly in its own, differently-labeled section.

---

## 26. Analytics/monitoring

Post-launch, track (offline, not user-facing) the same metrics Phase 9 validated, recomputed against realized outcomes as the season progresses: margin MAE, total MAE, Brier, log loss, ECE, probability-bucket calibration (reuse `phase5/probabilityEvaluation.ts`-equivalent logic), ratings-availability rate (% of scheduled FBS-vs-FBS games with a non-null V2 projection), and missing-projection rate (broken down by reason: FCS opponent, insufficient data, QA failure). Keep **market-performance diagnostics** (model-vs-market gap, incremental R² — Phase 6/8/9's own metrics) in a clearly separate report from **IPR-quality** metrics, so a market-relative dip is never mistaken for (or hidden by) an independent-quality regression or vice versa.

---

## 27. No production edge engine

Explicitly out of scope, now and until a future phase produces different evidence: automatic betting recommendations, spread/total/ML threshold-based picks, Kelly/bankroll sizing, live-odds integration, "+EV" badges. Phase 6/8/9 found no validated threshold, negative ROI at every tested moneyline threshold, and a market that remains more accurate — production V2 ships as an **analytics product**, not a picks product.

---

## 28. Implementation work units

| WU | Scope | Key files (new unless noted) | Depends on | Acceptance criteria | Tests |
|---|---|---|---|---|---|
| **WU1 — production model/config/types** | Freeze `cfb-ipr-v2.0`/`cfb-scoring-v2.0`/`cfb-calibration-v2.0`/`cfb-probability-v2.0` config objects; define `CfbV2TeamRating`/`CfbV2GameProjection` types | `src/lib/cfb/v2/config.ts`, `src/lib/cfb/v2/types.ts` | Phase 9 artifacts (reference only) | Config values match Phase 9's `phase9-production-candidate.json` exactly (test asserts equality) | Unit: config-snapshot equality test |
| **WU2 — production raw-data cache + preseason prior generator** | `cfb:v2:fetch`, `cfb:v2:preseason` | `scripts/cfb-v2-fetch-data.ts`, `scripts/cfb-v2-build-preseason-prior.ts`, `data/cfb/v2-production-cache/` | WU1 | Preseason artifact matches Phase 3's fallback-tier logic; missing data never zero-filled | Unit: fallback chain; Integration: fetch→prior |
| **WU3 — weekly rating generator** | Schedule-graph build + connectivity-aware Ridge, ported to a thin production wrapper around reused research primitives | `src/lib/cfb/v2/scheduleGraph.ts`, `src/lib/cfb/v2/ratings.ts`, `scripts/cfb-v2-build-ratings.ts` | WU2 | Byte-for-byte parity with Phase 8's `COMPONENT_SIZE` finalist on the golden-fixture seasons | Unit: connectivity multiplier/λ; Regression: golden fixtures |
| **WU4 — scoring/calibration/probability generator** | Weekly scoring refit, total calibration, bootstrap, `cfb:v2:build-projections` | `src/lib/cfb/v2/scoring.ts`, `src/lib/cfb/v2/probability.ts`, `scripts/cfb-v2-build-projections.ts` | WU3 | Matches Phase 9 margin/total/probability on golden fixtures within tolerance; bootstrap hash-locked | Unit: determinism, bounds; Regression: golden fixtures |
| **WU5 — artifact validation / fail-closed QA** | `cfb:v2:validate`, all §16 gates | `scripts/cfb-v2-validate.ts` | WU3, WU4 | Every §16 condition has a covering test that proves it aborts the publish | Unit: one test per QA rule |
| **WU6 — shadow-mode integration** | Generate V2 artifacts on a real schedule (§19), publish to `data/generated/cfb/v2/`, **no UI change** | GitHub Actions workflow (new) | WU1-WU5 | Artifacts generate on schedule, pass QA, for several consecutive weeks with no production UI exposure | Integration: end-to-end job; Architecture guard (§17/§21) |
| **WU7 — UI/data-contract migration** | Additive fields on `CfbJkbRatings`/`CfbGameModelProjections`, first UI surface (read-only display, safe terminology per §22/§24) | `src/data/cfb/types.ts`, `src/data/cfb/season2026/ratings.ts`, `src/pages/cfb/CollegeFootballMatchup.tsx` (additive) | WU6 (several clean weeks of shadow data) | New fields render correctly, old fields/pages unaffected, terminology reviewed against §22 constraint | Component/snapshot tests; existing page tests still pass |
| **WU8 — monitoring/rollout** | §26 tracking, IPR-vs-market report separation | `scripts/cfb-v2-report-performance.ts` | WU7 | Weekly performance report generates automatically; market/IPR metrics visibly separated | Unit: metric computation reuse from research |

---

## 29. Risk register

| Risk | Level | Mitigation |
|---|---|---|
| Research/production logic drifts (a "port" subtly differs from the validated research code) | **HIGH** | Golden fixtures (§18) with tolerance checks against Phase 9's own numbers; prefer thin wrappers calling research's pure functions over reimplementation where licensing/boundary allows |
| Market data contaminates IPR (accidental import) | **HIGH** | Architecture-guard test (§17/§21), same pattern proven across Phases 6-9 |
| FCS games silently get a fabricated V2 number | **MEDIUM** | `matchupPopulation` field + explicit null + UI "unavailable" state (§14) |
| Stale data published (fetch silently fails, old artifact regenerated with old data under a new timestamp) | **MEDIUM** | `dataAsOf`-vs-`asOfWeek` consistency check (§16) |
| Scoring/calibration drift week to week goes unnoticed | **MEDIUM** | §26 monitoring; regression tests against golden fixtures each release |
| Transition-team behavior regresses silently | **LOW** | Golden fixture includes a transition-team case (§18) |
| Weekly graph cutoff mistake (off-by-one week) reintroduces leakage | **HIGH** | Direct port of Phase 8's tested `buildWeekGraphSnapshots` boundary logic + a production-side leakage test mirroring `scheduleGraph.test.ts` |
| Bootstrap runtime balloons in production | **LOW** | Phase 9 measured ~57s/season-equivalent; a single week is trivial; §12's batch-at-refresh design keeps it off any latency-sensitive path |
| UI/marketing copy interprets analytics as betting edge | **MEDIUM** | §22/§24/§27 terminology constraints; product review gate before WU7 ships |
| Artifact schema migration breaks an existing consumer | **MEDIUM** | Additive-only rule (§24); new fields optional |

---

## 30. Final implementation plan (ordered)

WU1 → WU2 → WU3 → WU4 → WU5 → (run WU6 for several weeks, unattended, UI untouched) → WU7 → WU8. No step skips ahead of the one before it; WU7 (the only UI-visible step) is explicitly gated on WU6 having run cleanly, so no production page ever displays V2 output that hasn't survived multiple real weekly cycles of fail-closed validation.

---

## 31. Recommended first implementation work unit

**WU1 — production model/config/types.** It has no external dependencies, touches no production-visible behavior, and its acceptance criterion (config values provably identical to the Phase 9-validated snapshot) is the cheapest possible guard against the single highest-ranked risk in §29 (research/production drift) — every later WU is checked against WU1's frozen config, so getting it exactly right first is the highest-leverage next step.

## 32. GO / NO-GO for beginning production implementation

**GO** — conditional on following the work-unit order in §30 and treating every §16/§17/§21 guard as non-negotiable at each step. The Phase 9 validation (classification B) supports building an analytics-only production feature; nothing in this plan proposes exceeding that validated scope (no betting engine, no MIC-into-IPR contamination, no big-bang V1 replacement).
