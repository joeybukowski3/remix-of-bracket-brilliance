# 16-0 Version 1: no-persistence milestone

## Scope

The feature is exposed at `/16-0/*` and lazy-loads from `src/App.tsx`. This
milestone includes the complete draft and season game, but deliberately excludes
leaderboards, saved results, Supabase, cron jobs, submissions, validation APIs,
and analytics.

Runs are created in browser memory with a cryptographically generated run ID,
seed, and random draft slot. Refreshing or leaving the route discards the run.
The feature does not call a 16-0 API and does not use local or session storage.

## Engine and data

- Player pool: 311 active players (31 QB, 85 RB, 97 WR, 34 TE, 32 K, 32 DST).
- Draft: 12 teams, 17 rounds, 204 total picks, seeded CPU profiles and
  randomness.
- User clock: 20 seconds, immediate legal auto-pick at expiration.
- Roster rules: 17 total players with minimums of 1 QB, 2 RB, 2 WR, 1 TE,
  six total RB/WR/TE players, exactly 2 K, and exactly 2 DST. By the end of
  Round 15, every roster has its offensive foundation, one K, and one DST.
  Rounds 16 and 17 are reserved for the backup K and backup DST, in either
  order.
- Schedule: actual 2026 NFL opponents and bye weeks for Weeks 1-17.
- Lineups: optimized from drafted, non-bye players using matchup-adjusted
  expected value before realized scores are generated. One K and one DST start.
  If drafted players cannot fill a weekly slot, the optimizer selects the
  highest-expected undrafted, non-bye temporary player from the completed
  draft's replacement pool. The temporary player is scored by the same seeded
  engine and never joins the roster.
- Scoring: tier- and position-aware mixture variance with bust and ceiling
  outcomes.
- Season: 14 regular-season weeks plus synthetic six-team qualification and
  Weeks 15-17 playoff flow.
- Opponent identities: 142 curated static names, unique within one run.

The normalized player file is generated from the approved workbook and the
repository schedule. Workbook formulas are not reproduced in application code.

## Determinism

All draft and season business logic uses the seeded PRNG. A complete draft can
be replayed from seed, slot, and user selections; its CPU selections and season
result reproduce exactly. Local run ID generation and replay/new-game seed
generation are intentionally non-deterministic.

## Calibration

The final engine version is `16-0-engine-v7`. Its one-time difficulty
recalibration changed the global lineup-strength response and stage opponent
curve; it did not add record-aware, undefeated-aware, late-season, or
draft-slot-specific behavior.

Exact final configuration:

- Lineup strength: reference 123.8 expected points, sensitivity 8, upside
  breakpoint 126, upside sensitivity 42, minimum multiplier 0.7, maximum 1.8.
- Regular opponent tiers: 16% weak, 34% average, 32% strong, 18% elite.
- Playoff opponent tier: 100% elite in Weeks 15, 16, and 17.
- Stage score multipliers: regular 1.24, Week 15 1.45, Week 16 1.53,
  Week 17 1.58.
- Synthetic standings: mean weekly win probability 0.55, standard deviation
  0.15, bounds 0.20-0.85, score mean 126.4, strength slope 55, score standard
  deviation 8.5.

Relative to the v5 selection candidate, the final focused adjustment was
exactly: upside sensitivity 40 to 42, regular multiplier 1.26 to 1.24, and
Week 15 multiplier 1.35 to 1.45. Week 16, Week 17, tier weights, standings
parameters, draft rules, scoring variance, and replacement rules were unchanged.

The opponent base distribution was regenerated from 100,000 weekly team scores
across 1,440 legally drafted rosters:

| Metric | Value |
| --- | ---: |
| Mean | 85.8 |
| Standard deviation | 24.2 |
| 10th percentile | 63.9 |
| Median | 81.2 |
| 90th percentile | 109.8 |
| 95th percentile | 124.4 |

The final season audit used 250,000 seeded seasons and a bank of 120 legal user
drafts, ten unique rosters from each draft slot. That produced 3,500,000
regular-season lineup-weeks and 136 perfect seasons:

| Metric | Value |
| --- | ---: |
| User weekly mean | 125.862 |
| Regular opponent weekly mean | 112.506 |
| Average regular-season wins | 7.406 |
| Playoff qualification | 54.8%; 95% CI 54.594%–54.984% |
| Top-two bye | 20.1%; 95% CI 19.977%–20.292% |
| Championship | 7.0%; 95% CI 6.855%–7.055% |
| 14-0 regular season | 0.096%; 239 seasons |
| Perfect 16-0 | 0.054%; 95% CI 0.046%–0.064%; 136 seasons |

Before the focused recalibration, the reported values were 9.749 wins, 94.4%
qualification, 67.1% top-two, 5.9% championship, and 0.069% perfect. The final
curve therefore removes the excessive regular-season advantage while retaining
the approved natural perfect-season range.

Stage distributions:

| Stage | User mean | Opponent mean | Opp. SD | Opp. P10 | Opp. median | Opp. P90 | User - opp. | User win |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Regular | 125.862 | 112.506 | 23.763 | 81.3 | 112.0 | 143.4 | +13.356 | 52.901% |
| Week 16 | 151.293 | 168.726 | 25.551 | 133.9 | 168.2 | 202.4 | -17.433 | 31.412% |
| Week 17 | 207.731 | 173.960 | 26.373 | 138.0 | 173.5 | 208.7 | +33.771 | 70.443% |

Week 16 and Week 17 user means are conditional on reaching those rounds. The
large Week 17 user mean is a survivor-selection effect, not an in-season boost.
Every opponent draw remains independent of the user's generated score and
record.

Regular-season win probability by projected-lineup tier was 26.286% low,
47.539% mid, 61.904% high, and 74.054% elite. Qualification/top-two rates by
projected-lineup decile were:

| Decile | Qualification | Top two |
| ---: | ---: | ---: |
| 1 | 1.644% | 0.048% |
| 2 | 8.880% | 0.388% |
| 3 | 25.578% | 2.092% |
| 4 | 37.276% | 4.316% |
| 5 | 55.696% | 10.364% |
| 6 | 69.862% | 17.685% |
| 7 | 77.492% | 21.456% |
| 8 | 83.661% | 31.575% |
| 9 | 89.860% | 40.748% |
| 10 | 97.944% | 72.671% |

Championship rate by regular-season wins was 0% for 0-5 wins, 0.052% at 6,
0.448% at 7, 1.625% at 8, 4.855% at 9, 11.609% at 10, 25.293% at 11,
39.665% at 12, 48.803% at 13, and 56.904% at 14.

Among the 239 teams that started 14-0, 64.435% won Week 16 (95% CI
58.181%–70.232%). Of the 154 surviving 15-0 teams, 88.312% won Week 17 (95% CI
82.281%–92.477%).

Mean-score-to-projection ratios were 1.011 QB, 1.008 RB, 1.016 WR, 1.013 TE,
0.961 K, and 0.961 DST. K and DST generated negative scores in approximately
3.4% and 3.5% of sampled outcomes.

Across 3,500,000 regular-season user lineup-weeks:

| Coverage metric | Rate |
| --- | ---: |
| Empty K | 0% |
| Empty DST | 0% |
| Any empty offensive slot | 0% |
| Any empty lineup slot | 0% |
| Temporary K replacement | 0% |
| Temporary DST replacement | 0.893% |
| Temporary offensive replacement | 11.191% |
| Any temporary replacement | 11.964% |
| Multiple temporary replacements | 0.714% |

The audit observed 443,751 replacement selections, with zero bye violations,
duplicate-lineup weeks, or roster-persistence violations. All replacements came
from the actual undrafted post-draft pool, were selected by expected value
before scoring, and were temporary for that week.

Replacement weeks averaged a 50.163-point expected-value loss versus the
hypothetical same roster with all drafted players available. Their realized
mean was 88.150 versus 130.987 without a replacement, a -42.837-point
observational difference. This comparison is not causal because replacement
weeks are concentrated in heavy-bye situations.

At the season level, 12.5% used no replacement, 25.0% used exactly one, and
62.5% used multiple replacement selections. These are selection counts, not
necessarily distinct weeks.

Heavy overlap, defined as five or more drafted players sharing one bye, produced
7.974 average wins, 63.8% qualification, and a 7.1% championship rate versus
7.089 wins, 49.7%, and 6.9% without heavy overlap. This is confounded by the
sampled rosters' underlying strength and is not evidence that overlap helps.

The sampled automatic user drafts contained no same-bye K pairs, so the K
replacement path is proven by deterministic unit tests but does not have a
natural outcome subgroup. Same-bye DST rosters had 31,249 season samples:
7.050 wins, 50.6% qualification, 0.9% championship, and a 16.2% replacement-week
rate, versus 7.457 wins, 55.4%, 7.8%, and 11.4% for diversified DST pairs.

Each draft slot received 20,833 or 20,834 simulated seasons. Average-win 95%
confidence intervals ranged from ±0.024 to ±0.049 wins; the full slot table is
stored in `docs/16-0-statistical-validation.json`. Because those simulations
reuse ten drafted rosters per slot, the intervals quantify seeded season
variance and understate uncertainty from the population of all possible drafts.

## Animation and accessibility

Normal season rows resolve every 1.8 seconds, producing approximately 25.2
seconds for a missed-playoff regular season and up to 30.6 seconds for a
three-game playoff path. Reduced-motion mode uses shortened delays.

The timer has text and progress treatment, on-clock and drafted-player status is
announced, controls have keyboard focus behavior, results use text in addition
to color, and mobile drafting uses a full roster drawer.

## Known limitations

- Active runs are intentionally not recoverable after refresh or navigation.
- Same-bye combinations are deliberately legal. When drafted players cannot
  cover a slot, the temporary replacement is the best available undrafted
  player by expected value; it is not a persistent waiver transaction.
- The audited automatic-draft sample produced no same-bye user K pairs. Forced
  same-bye K/DST unit cases prove the replacement path, but same-bye kicker
  outcome comparisons remain statistically uncalibrated.
- The draft-slot audit intentionally preserves the accepted slot variation.
  Its 250,000 seasons reuse 120 roster templates, so slot confidence intervals
  should not be interpreted as independent-draft population intervals.
- Stage user-score means are conditional on playoff survival; they are not
  apples-to-apples samples of all drafted rosters.
- Opponent fantasy teams and synthetic standings are generated distributions,
  not persistent rosters.
- Projection and defense inputs are a fixed Version 1 data snapshot; there is no
  in-season update path in this milestone.
- Repository-wide lint, TypeScript, and test baselines contain unrelated
  pre-existing failures. The dedicated feature checks and production build pass.

## Deferred server work

An earlier status description overstated server completion. Scratch work for run
APIs, leaderboard submission/read paths, cron aggregation, client persistence,
and leaderboard UI had been started before the scope revision, but none of it
was retained. No server-related 16-0 file is present in `api/`, `supabase/`, or
`vercel.json`, and no exact scratch-file inventory survives in the uncommitted
worktree. Server work should be treated as not implemented, not complete.

The retained `engine/replayDraft.ts` module is framework-independent validation
logic used by deterministic tests. It is not an API, persistence interface, or
server dependency.
