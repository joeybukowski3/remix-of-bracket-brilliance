# NFL Yardage Prop Models — Audit + Architecture (Phase 0)

Status: audit only. No models implemented. No production code changed.
Scope: passing yards, rushing yards, receiving yards player props.

## 1. Existing reusable infrastructure

| Area | Existing files/data | Reusable? | Notes |
| --- | --- | --- | --- |
| Player weekly stats | `data/nfl/nflverse/stats-player-week/stats_player_week_{2022-2025}.csv` | **Yes, core input** | nflverse `player_stats` weekly. Per player-week: `completions, attempts, passing_yards, passing_tds, interceptions, carries, rushing_yards, rushing_tds, receptions, targets, receiving_yards, receiving_tds, receiving_air_yards, target_share, air_yards_share, fantasy_points_ppr`. Byte-provenance cached (manifest.json, sha256). This is the ground truth for both features and yardage outcome labels. |
| Player identity crosswalk | `data/nfl/nflverse/players/`, `weekly-rosters/roster_weekly_{2023-2026}.csv` | Yes | `gsis_id -> pfr_id` join used by injury/snap pipeline (`scripts/lib/nfl-injury-join.mjs`), 99.74% coverage. Same crosswalk is the right backbone for a player-prop universe. |
| Snap participation | `data/nfl/nflverse/snap-counts/` | Yes | Verbatim nflverse `snap_counts`, joined via the above crosswalk. `offense_pct`/`defense_pct` per game. Team snap denominator reconstruction is exact (see redesign spec §23.6). No routes, no route participation. |
| Injuries / availability | `public/data/nfl/matchup-injuries.json`, `scripts/generate-nfl-matchup-injuries.mjs`, `scripts/lib/nfl-injury-join.mjs` | Yes | `gameStatus` (OUT/DOUBTFUL/QUESTIONABLE), `practiceStatus`, `reserveStatus` (generic, no IR/PUP split), last-game and season snap %. Documented gap: Sunday-morning downgrades/inactives are not available pre-kickoff (daily nflverse refresh only). |
| Team/game schedule + context | `public/data/nfl/<season>/games.json`, `results.json` | Yes | Home/away, opponent, kickoff, final score. Rest-day/short-week logic exists in fantasy pipeline (`shortWeek`, `byeReturn`, `restDays`). |
| Team EPA (offense/defense, pass/rush split) | `public/data/nfl/matchup-epa.json`, `scripts/lib/nfl-epa-core.mjs`, `scripts/generate-nfl-matchup-epa.mjs` | Yes | From nflverse play-by-play (`epa` column), eligible-play filter empirically validated against RBSDM. Own-game and opponent-allowed both derivable. Season/Last-5/historical-blend windowing shared with Phase 2 conventional metrics via `nfl-matchup-metrics.mjs`. |
| Success rate (offense/defense, pass/rush split) | `public/data/nfl/matchup-success-rates.json` | Yes, with caveats | RBSDM-sourced, **not blendable across periods** (no denominator published) — shown as separate season windows, not a rolling stat. |
| Conventional team volume/efficiency | `public/data/nfl/matchup-metrics.json` | Yes | Yards/play, pass/rush play %, attempts/game, YPA, sacks allowed/game, etc. Third-down % and time-of-possession are explicitly **not available** from this source (deferred to PBP). |
| Trench win rates (PBWR/RBWR/PRWR/RSWR) | `public/data/nfl/matchup-trench-metrics.json` | Yes, limited | ESPN Analytics, season-to-date only, no weekly split, no cross-season blend. Directly relevant to pass-block/pass-rush matchup for passing yards, and run-block/run-stop for rushing yards. |
| Market spread/total (game-level, not player props) | `public/data/nfl/matchup-market.json`, `scripts/lib/nfl-market-core.mjs` | Yes, for game environment only | nflverse `games.csv` market columns: spread, total, moneyline. One line per game, no book identified, no player props, no historical timestamp. Already used to derive implied team totals in the fantasy pipeline (`impliedTeamTotals.ts`). |
| Team power rating | `public/data/nfl/<season>/power-ratings.json` (`nfl-power-v0.3.1`) | Partial | Composite EPA/point-differential rating; useful as a coarse opponent-strength prior, not player-level. |
| Fantasy weekly projection pipeline | `src/lib/fantasy/weekly/**` (usage, baseline, scoring, backtest, projections/model, projections/production, projections/shadow) | **Architecturally reusable, not numerically reusable** | Extremely mature: leakage-safe universe construction, frozen model-spec versioning, ridge-regression research harness, holdout discipline (2023 train / 2024 select / 2025 holdout), provenance-stamped artifacts, methodology-matches-frozen-spec self-check tests. **But the modeled target is `actualFantasyPoints` (jkb-full-ppr-v1.0.0), a single scalar composite — not decomposed into passing/rushing/receiving yards.** The pipeline pattern (universe → features → frozen spec → production artifact → methodology copy) is the template to copy; the fitted coefficients are not transferable to a yards target. |
| Fantasy usage contract | `src/lib/fantasy/weekly/usage.ts` | Yes | Already models `targets, receptions, receivingAirYards, targetShare, airYardsShare, rushAttempts, passAttempts, completions, offensiveSnaps, snapShare`, with `routes/routeParticipation/redZoneTouches/goalLineTouches/redZoneTargets` explicitly typed `null` (source doesn't carry them — see Missing Dependencies). |
| Depth chart / starter status | `weekly-rosters` `depth_chart_position` | Partial, not authoritative | Documented in `src/lib/fantasy/weekly/README.md`: this is a *positional label*, not a depth order, so `starterStatus` is frozen at `"unknown"` in the current fantasy contract. No real starter/depth-order signal exists anywhere in the repo today. |
| Sportsbook player-prop lines (passing/rushing/receiving yards) | — | **No** | Not ingested anywhere. `docs/nfl-data-inventory.md` mandate explicitly forbids paid Odds API and player-props products ("free-first," "no paid The Odds API usage ... no player-props products"). Confirmed via repo-wide search: zero matches for passing/rushing/receiving-yard prop lines in any script, artifact, or doc. |

## 2. Missing dependencies

In rough order of how blocking they are for a legitimate v1:

1. **Sportsbook player-prop lines.** This is the hard blocker for the "Prop Edge" layer (`edgeYards = projection - line`) and for any Over/Under backtest. The current NFL pipeline mandate is explicitly free-first and explicitly excludes player-props products and paid Odds API usage (`docs/nfl-data-inventory.md`). A matchup score and a yardage projection can be built and back-tested without this, but **the "prop" half of the system cannot ship** until this constraint is revisited or a free/compliant prop-line source is identified and approved. This is a product/policy decision, not a data-availability one — flag for explicit approval before Phase 5 in the phased plan below.
2. **Route participation / routes run.** Not in `stats_player_week`, not anywhere else in the repo. Blocks true "yards per route run," "targets per route," and route-based receiving efficiency — these must be simulated from `targets/receptions/air_yards` proxies instead, or sourced later from a provider that publishes routes (e.g., a routes-run release, if one becomes available free-first).
3. **Real depth-chart / starter order.** `depth_chart_position` is a label, not an order; no legitimate "starter vs. backup" signal exists. This matters most for rushing (early-down/goal-line role) and for backup-QB/committee-backfield edge cases. Snap share is the best current proxy and is already join-validated.
4. **Red-zone / goal-line usage.** Not in `stats_player_week`. No red-zone target/touch counts anywhere in the repo. This is a material gap for rushing TDs-adjacent role and goal-line back identification, and for receiving red-zone target share. Would need a new nflverse or PBP-derived aggregation (PBP is already fetched for EPA — red-zone splits are derivable from the same cached play-by-play with additional aggregation work, unlike routes/red-zone-from-provider).
5. **Pressure / sack-allowed matchup granularity below team level.** OL/DL matchup data exists only as team-level trench win rates (season-to-date, no split by opponent-specific matchup game). Individual pass-protection matchups (e.g., which OT struggles vs. speed rushers) are out of scope for any near-term phase.
6. **Weather / stadium surface detail beyond dome flag.** `teams.json` carries `isDome`; no live weather feed (wind, temperature, precipitation) exists in the repo. Material for outdoor-market passing-yards variance, not currently available.
7. **Historical closing player-prop lines for backtesting.** Even if a decision is made to add current player-prop ingestion later, there is no historical archive of prop lines/closing lines in this repo to backtest against — CLV-style backtesting (closing-line comparison) is not possible from repo data alone.
8. **QB rushing designed-run vs. scramble split.** `stats_player_week` carries `carries`/`rushing_yards` undifferentiated; nflverse PBP separately tags scrambles (already used by the EPA pipeline's play classification), so this is derivable from the cached PBP but not from the weekly aggregate currently used by the fantasy pipeline.

## 3. Recommended architecture

Each market is modeled as an independent pipeline sharing common infrastructure (player identity, team context, EPA/success-rate, injuries, schedule) but with separate opportunity and efficiency models and separate frozen model specs — mirroring the fantasy pipeline's per-position frozen-spec pattern, not the MLB K pipeline's single-formula pattern (NFL yardage markets have materially different drivers per market, matching the task's explicit instruction not to force one shared formula).

### Passing yards
```
Inputs:
  QB season/recent pass efficiency (YPA, EPA/pass, air yards)
  Team-level expected dropbacks: pace proxy (plays/game) x neutral pass rate / PROE proxy
    (PROE itself is NOT currently available — no neutral-script pass-rate-over-expected
    metric exists in the repo; closest proxy is team pass-play % from matchup-metrics.json,
    which is descriptive, not expectation-adjusted)
  Opponent pass defense: EPA/pass allowed, pass success rate allowed, opponent pass YPA
  Trenches: PBWR (own) vs PRWR (opponent) — season-to-date only
  Game script proxy: implied team total, spread (from matchup-market.json)
  QB/OL availability: matchup-injuries.json

  -> opportunity model: expected pass attempts
     (dropback estimate x sack-rate adjustment; team pace x expected game script)
  -> efficiency model: expected yards/attempt
     (QB rate stats blended with opponent pass-defense allowed rate, trench-adjusted)
  -> yard projection: expected attempts x expected YPA
  -> matchup score: normalized 0-100 composite of the opportunity + efficiency
     + matchup inputs above (presentation only, NOT derived from the yard projection)
  -> prop edge: projection - sportsbook line (BLOCKED — no line source, see §2.1)
```

### Rushing yards
```
Inputs:
  Player carries (season/recent), snap share, early-down usage proxy
    (no true early-down split available — would need PBP down-filtered aggregation,
    derivable from the already-cached play-by-play but not shipped today)
  Goal-line/red-zone role (UNAVAILABLE — §2.4)
  QB rushing impact where relevant (mobile-QB carries already in stats_player_week,
    but QB vs. RB carry split requires position-aware aggregation, which the raw
    file already supports since it is per-player, per-position)
  Opponent rush defense: EPA/rush allowed, rush success rate allowed, opponent YPC
  Trenches: RBWR (own) vs RSWR (opponent)
  Team offensive line context: run-block win rate (own team, season-to-date)
  Game script proxy: implied team total, spread

  -> opportunity model: expected carries
     (season/recent share x team-level expected rush plays, itself derived from
     expected total plays x (1 - expected pass rate proxy))
  -> efficiency model: expected yards/carry
     (player YPC blended with opponent rush-defense allowed rate, trench-adjusted)
  -> yard projection: expected carries x expected YPC
  -> matchup score: normalized 0-100 composite
  -> prop edge: projection - sportsbook line (BLOCKED)
```

### Receiving yards
```
Inputs:
  Target share, air yards share (both directly in stats_player_week)
  Receptions/targets recent trend, catch rate (receptions/targets)
  aDOT (derivable: receiving_air_yards / targets — not currently precomputed anywhere)
  Route participation / targets-per-route (UNAVAILABLE — §2.2)
  Team expected dropbacks (shared with passing model's opportunity leg)
  Opponent pass defense: EPA/pass allowed, pass success rate allowed
  Teammate injuries / target redistribution: matchup-injuries.json gives WHO is out;
    a target-redistribution MODEL does not exist and would be new work
  Game script proxy: implied team total, spread

  -> opportunity model: expected targets
     (target share x expected team pass attempts, itself the passing model's
     opportunity-leg output — the two markets share this upstream node)
  -> efficiency model: expected yards/target
     (catch rate x aDOT, blended with opponent pass-defense allowed rate)
  -> yard projection: expected targets x expected yards/target
  -> matchup score: normalized 0-100 composite
  -> prop edge: projection - sportsbook line (BLOCKED)
```

Passing and receiving share one upstream node (team expected dropbacks/pass attempts);
rushing and receiving both depend on the same team expected-plays/pass-rate split for
their opportunity legs. This should be a single shared "team play-volume and mix"
sub-model consumed by all three markets, computed once per team-game, not three
independent guesses at the same number.

## 4. Proposed canonical schemas (not implemented)

```typescript
// Shared player identity, mirrors the existing gsis_id/pfr_id crosswalk already
// proven at 99.74% coverage in the injury pipeline.
interface NflPropPlayerIdentity {
  playerId: string;        // canonical "gsis:<id>", matches fantasy pipeline convention
  playerName: string;
  position: "QB" | "RB" | "WR" | "TE";
  team: string;             // canonical abbr, resolves against teams.json
}

// One per player-game-market. Team play-volume sub-model output feeds the
// opportunity leg of all three markets (see §3).
interface NflTeamPlayVolumeContext {
  season: number;
  week: number;
  team: string;
  expectedOffensivePlays: number | null;
  expectedPassAttempts: number | null;
  expectedRushAttempts: number | null;
  source: "team-pace-and-mix-v1";
  provenance: ArtifactProvenance; // shared shape with existing NFL artifacts' _meta
}

interface NflYardageOpportunity {
  season: number;
  week: number;
  playerId: string;
  market: "passing" | "rushing" | "receiving";
  expectedVolume: number | null;   // attempts, carries, or targets depending on market
  volumeShare: number | null;      // player's share of the team volume input
  confidence: "high" | "medium" | "low";
  inputsUsed: readonly string[];   // self-describing, mirrors fantasy baseline's fallbackReason pattern
}

interface NflYardageEfficiency {
  season: number;
  week: number;
  playerId: string;
  market: "passing" | "rushing" | "receiving";
  expectedRate: number | null;     // yards/attempt, yards/carry, or yards/target
  playerComponent: number | null;
  opponentComponent: number | null;
  blendWeight: number;             // documented, not tunable per-request
}

// The three DISTINCT outputs the brief requires kept structurally separate —
// never let the score or the edge collapse back into the projection.
interface NflYardageProjection {
  schemaVersion: "nfl-yardage-projection-v1";
  season: number;
  week: number;
  playerId: string;
  market: "passing" | "rushing" | "receiving";
  projectedYards: number | null;   // opportunity x efficiency, a real statistical estimate
  opportunity: NflYardageOpportunity;
  efficiency: NflYardageEfficiency;
  generatedAt: string;
  provenance: ArtifactProvenance;
}

interface NflYardageMatchupScore {
  schemaVersion: "nfl-yardage-matchup-score-v1";
  season: number;
  week: number;
  playerId: string;
  market: "passing" | "rushing" | "receiving";
  score: number;                   // 0-100, presentation only
  components: readonly { label: string; weight: number; normalizedValue: number }[];
  // NOT derived from projectedYards, and projectedYards is NOT derived from score.
}

interface NflYardagePropEdge {
  schemaVersion: "nfl-yardage-prop-edge-v1";
  season: number;
  week: number;
  playerId: string;
  market: "passing" | "rushing" | "receiving";
  projectedYards: number;
  line: number;                    // BLOCKED until a line source is approved
  book: string | null;
  edgeYards: number;                // projectedYards - line
  lean: "over" | "under" | "pick";
  generatedAt: string;
}
```

## 5. Historical/backtest plan

What is realistically usable from the repo today:

- **Outcome labels:** `stats_player_week_{2022,2023,2024,2025}.csv` — real passing/rushing/receiving yards per player-game, four full seasons.
- **Leakage-safe universe construction:** `src/lib/fantasy/weekly/backtest/universe.ts` already builds a week-effective ACT-roster candidate pool with N-1-only feature discipline. This is directly reusable as-is for a yardage-projection universe (same eligibility question: "was this player rosterable and plausibly active before kickoff").
- **Chronological split discipline:** the fantasy pipeline's frozen 2023-train / 2024-select / 2025-holdout split is a proven, already-defensible pattern to copy verbatim for yardage models, rather than re-deriving a new split policy.
- **Team/opponent EPA features:** `data/nfl/nflverse/epa-team-game` cache supports N-1-only opponent-strength features across the same seasons.
- **Injury/snap context:** 2012-2025 injury cache and matching snap-count cache both exist, though only 2023-2026 rosters are cached alongside — the 2022 season would need weekly-roster backfill if used as a training year.

Recommended backtest metrics, mapped to the brief's list:

- MAE / RMSE / bias: per market, computed on `projectedYards - actualYards`, matching the fantasy backtest's existing metrics module pattern (`weekly/backtest/metrics.ts`) extended for a continuous yards target instead of fantasy points.
- Correlation: Pearson/Spearman of projection vs. actual, per market and per position-relevant subgroup (e.g., pass-catching RBs within rushing yards).
- Calibration by projected-yard bucket: bucket projections (e.g., 0-25, 25-50, 50-75, 75-100, 100+) and compare mean actual within each bucket — directly reusable bucketing pattern from any existing rank-tier code (`rankTier.ts` precedent, different domain).
- Over/Under hit rate by edge threshold: **requires the blocked prop-line dependency (§2.1).** Cannot be computed from repo data today. Document this explicitly rather than approximating a synthetic "line" from the projection itself, which would be circular and self-validating.
- Performance by season/week/player role/line range/favorite-underdog: all mechanically available except "line range," which is blocked by §2.1. Favorite/underdog is already available via `matchup-market.json`'s existing favorite/underdog split logic (redesign spec §24.7).
- Closing-line comparison: **not possible.** No historical prop lines exist in-repo, and the game-level market source (`nflverse/nfldata` `games.csv`) explicitly has no distinct closing-line field, only "the settled historical market line" (redesign spec §24.5). This applies doubly to player props, which aren't sourced at all.

Sample-size caution (per the brief's instruction to avoid over-optimizing for raw hit rate): four seasons of weekly data per player is thin per individual player; backtests should report at the market/position level, not chase single-player accuracy, and should carry explicit game-count denominators the way the RBSDM/ESPN artifacts already do (`gamesIncluded` pattern).

## 6. Implementation phases

- **Phase 0 (this phase): audit + architecture.** Complete. No code shipped.
- **Phase 1: canonical schemas + player-week outcome artifact.** Ship the read-only historical dataset (§4 types, `NflYardageProjection` minus a real model — i.e., just wiring stats_player_week into a canonical per-player-game yards record with the existing gsis/pfr identity). No projection logic yet. Establishes the "ground truth" table every later phase validates against.
- **Phase 2: team play-volume sub-model.** The shared opportunity-leg input (§3) — expected team plays, pass/rush mix — built once, consumed by all three markets. This is new modeling work; nothing in the repo computes an *expected* pass rate today (only descriptive pass-play %).
- **Phase 3: baseline opportunity + efficiency models per market.** Rate-based, no learned coefficients yet — direct extensions of season/recent usage the way `usage.ts` and `baseline.ts` already model fantasy usage, retargeted at market-specific yards instead of PPR points.
- **Phase 4: matchup-adjusted efficiency (opponent EPA/success-rate/trench blending).** Introduces the opponent-side inputs from the existing EPA/success-rate/trench artifacts. Requires the same "never blend un-blendable periods" discipline already established for success rate (redesign spec §21.2) and trenches (§22.5).
- **Phase 5: normalized 0-100 matchup scores.** Presentation layer only, built from Phase 3/4 components, explicitly decoupled from the yard projection per the brief's conceptual-separation requirement.
- **Phase 6: backtesting + calibration.** Run the Phase 3-5 output against 2023-2025 holdout using the metrics in §5, minus anything requiring player-prop lines.
- **Phase 7 (blocked pending decision): sportsbook player-prop integration.** Cannot start until the free-first mandate's exclusion of player-props products is either revisited or a compliant free source is identified and approved (§2.1, §7 decision list below). Unlocks `edgeYards`, Over/Under hit-rate backtesting, and closing-line comparison.
- **Phase 8: production artifacts + API.** Generator scripts (`scripts/generate-nfl-yardage-*.mjs` pattern) producing versioned `public/data/nfl/yardage-*.json` artifacts, following the existing atomic temp-file+rename, provenance-block, and independent-failure-domain conventions used by every other NFL Phase (2-6) generator.
- **Phase 9: UI/social integration.** New surface, isolated from fantasy UI per the task's explicit instruction; would extend the matchup-analyzer's existing "Model Analysis coming soon" placeholder pattern (redesign spec §12) rather than retrofitting fantasy pages.

## 7. File-level implementation proposal (future phases, not this one)

New, isolated under a dedicated NFL props namespace — never inside `src/lib/fantasy/`:

- `src/lib/nfl/props/playerIdentity.ts` — thin wrapper around the existing gsis/pfr crosswalk, scoped to prop-relevant positions.
- `src/lib/nfl/props/teamPlayVolume.ts` — the shared opportunity sub-model (§3, §6 Phase 2).
- `src/lib/nfl/props/passing/opportunity.ts`, `efficiency.ts`, `projection.ts`
- `src/lib/nfl/props/rushing/opportunity.ts`, `efficiency.ts`, `projection.ts`
- `src/lib/nfl/props/receiving/opportunity.ts`, `efficiency.ts`, `projection.ts`
- `src/lib/nfl/props/matchupScore.ts` — shared 0-100 normalization utility parameterized per market.
- `src/lib/nfl/props/propEdge.ts` — blocked until Phase 7 line source exists; schema can exist earlier, computation cannot.
- `src/lib/nfl/props/backtest/` — mirrors `src/lib/fantasy/weekly/backtest/` structure (universe, features, metrics, invariants), retargeted at yards outcomes.
- `scripts/generate-nfl-yardage-outcomes.mjs` (Phase 1), `scripts/generate-nfl-team-play-volume.mjs` (Phase 2), `scripts/generate-nfl-yardage-projections.mjs` (Phase 3+), `scripts/generate-nfl-yardage-backtest.mjs` (Phase 6) — following the existing `nfl:*` npm-script naming convention.
- `public/data/nfl/yardage-outcomes.json`, `public/data/nfl/yardage-projections.json`, `public/data/nfl/yardage-matchup-scores.json` — new artifacts, own `_meta` blocks per `nfl-v0.1` schema convention, independent failure domains like every existing NFL artifact.
- `docs/nfl-yardage-props-model.md` — future model documentation once a phase actually ships methodology, following the `nfl-matchup-analyzer-redesign-spec.md` / `nfl-power-v0.3.1-epa-migration.md` documentation pattern.

Existing files that would need touching, and only when their phase arrives: none in Phase 0-1. `teams.json` and the gsis/pfr crosswalk are read, never modified. No fantasy files, no fantasy UI, no existing matchup-analyzer files are touched by any phase in this plan; the future matchup-analyzer "Model Analysis" placeholder section is the natural eventual UI host, but wiring it in is out of scope until a UI phase is explicitly approved.

## 8. Risks / unanswered questions

- **No PROE / neutral-script pass-rate metric exists anywhere in the repo.** Every "expected pass rate" input in §3 is currently a *descriptive* proxy (season pass-play %), not an *expectation-adjusted* one. Using descriptive pass-rate as if it were PROE would systematically mis-project pass-heavy/run-heavy teams' true situational tendency. This should be flagged as a known model limitation, not silently treated as equivalent.
- **No true starter/depth-chart signal.** Backup-role false positives (e.g., a committee backfield RB2 briefly overtaking snaps) cannot be distinguished from real role changes without a depth-chart source this repo doesn't have. Snap share is the best proxy and lags real usage by one game.
- **Red-zone/goal-line usage gap materially affects rushing-yards modeling less than TD modeling**, but still affects it: goal-line-heavy backs get artificially low YPC in raw season stats (short-yardage carries suppress the average), and a model blind to red-zone role will misread that suppression as poor overall efficiency rather than role-driven.
- **Player-prop line unavailability is a product decision, not a technical one.** The free-first mandate (`docs/nfl-data-inventory.md`) is explicit and predates this task; building projection/matchup-score infrastructure without a line source is legitimate and valuable on its own (it's real statistical output), but the "Prop Edge" and "ranked Over/Under opportunities" halves of the brief cannot exist until this is resolved. Recommend explicit approval before any Phase 7 work begins, including a decision on whether a free player-prop source exists that is compliant with the existing mandate (none has been identified in this audit).
- **RBSDM/ESPN trench and success-rate sources are undocumented, unversioned third-party APIs**, already flagged as fragile in the existing matchup-analyzer docs (redesign spec §21.9, §22.10). Any yardage model depending on them inherits that fragility — a schema change on their end degrades trench/success-rate inputs to N/A, not a crash, per the existing defensive-generator pattern, but the model's accuracy would silently shift.
- **Four seasons of weekly data (2022-2025) is a thin sample for player-level backtesting**, especially split further by role/line-range/season. Aggregate market/position-level backtest conclusions will be far more defensible than any single-player accuracy claim — consistent with the brief's own caution against over-optimizing for raw win rate on insufficient sample.
- **Passing/receiving share an upstream opportunity node.** If that shared sub-model is wrong, the error propagates into both markets simultaneously rather than being an independent failure — worth explicit sensitivity/ablation testing in Phase 6 rather than assuming independence between markets.
