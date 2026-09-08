# NFL DFS Lineup Intelligence

WU6C adds downstream optimizer eligibility and weekly DST matchup context to
the uploaded-slate analyzer. WU8 builds on it with three deterministic preset
lineups (see below). Canonical JKB Full PPR projections and all existing
rank/value calculations remain owned by their existing authorities. CFB,
external consensus, stacking, DK CSV parsing and deployment configuration are
outside scope.

## Eligibility Contract

`attachDfsLineupContext` runs after `buildDfsSlateAnalysis` and
`enrichDfsSlateAnalysis`. Every row receives `slateEligible: true`, meaning
membership in the accepted upload, not clearance to enter a lineup.
Offensive rows receive `optimizerEligibility`, `roleContext`, and
`eligibilityReasons`. DST receives only `dstMatchup`.

`roleContext` contains:

- `optimizerEligibility`: eligible, ineligible, unknown.
- `optimizerEligible`: true, false, null respectively. Unknown is not false.
- `roleClass`: primary, committee, secondary, backup, unknown.
- `roleCertainty`: sourced, inferred, conflicting, unavailable.
- `availability`: active, questionable, doubtful, out, reserve, unknown.
- `starterEvidence`: confirmed, backup, ambiguous, unavailable. No probability.
- Nullable `depthRank` and weekly `projectedUsage.carries/targets`, `usageEvidence`.
- `projectionThresholdResult`, `usageThresholdResult`: pass, fail, unknown.
- `reasonCodes`, source references/timestamps, evaluation `asOf`, `policyVersion`.

Reason labels live in `roleContext.ts`; expanding the row exposes reasons and
underlying sources. Artifact generation time never makes old evidence current.

## Optimizer Eligibility v1

Policy `nfl-dfs-optimizer-eligibility-v1` lives in
`src/lib/nfl/dfs/policies/optimizerEligibilityV1.ts`. Comparisons use raw,
unrounded JKB values and inclusive minima.

| Position | JKB points minimum | Weekly opportunity / role requirement |
| --- | ---: | --- |
| QB | 8 | Unique sourced current depth-chart starter. QB2/QB3 without starter evidence fail; missing/ambiguous evidence is unknown. No artificial attempt threshold. |
| RB | 3 | At least 4 published projected carries OR 2 projected targets OR sourced depth 1-2 primary/committee role. |
| WR | 3 | At least 2 published projected targets OR sourced first-unit (depth 1) role. |
| TE | 2 | At least 1.5 published projected targets OR sourced depth 1-2 primary/committee role. |

[Week 1 validation](nfl-dfs-wu6c-week1-validation.md) contains the actual full
uploaded-slate projection distributions and cutoff examples. The floors are
conservative manual starting policies, not fitted accuracy claims. QB's floor
is near P10 (7.65); starter evidence performs the important backup exclusion.
Other floors sit between P25 and their medians (RB 5.01, WR 4.30, TE 2.31).

Available published usage distributions in the full uploaded slate:

| Usage | N | Min | P10 | P25 | Median | P75 | P90 | Max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| RB carries | 87 | 0 | 1.55 | 4.33 | 6.71 | 13.41 | 15.56 | 19.00 |
| WR targets | 132 | 1.03 | 1.79 | 2.17 | 4.14 | 6.69 | 8.17 | 9.89 |
| TE targets | 99 | 0.64 | 0.76 | 1.07 | 1.75 | 4.67 | 5.56 | 7.45 |

Four RB carries and two WR targets are just below available P25s; TE's 1.5 is
below its median. Two RB targets preserves receiving opportunity without
inventing receptions/touches. Sourced primary/committee allowances retain role
players above their points minimum. These settings are provisional and tunable.

Decision precedence:

1. Current OUT/reserve or DK OUT/IR exclude; restrictive current evidence wins
   over a less restrictive designation from another current source.
2. A projection below its floor or known insufficient usage excludes.
3. Otherwise conflicting roles, doubtful status, unavailable projection,
   unresolved identity/game or unknown usage requirement returns unknown.
4. Questionable is permitted. Blank DK status is not active. Unknown availability
   alone does not exclude an otherwise qualifying player and is disclosed.

Missing usage is never zero. RB numeric failure requires both carries and targets
known and below minima; either qualifying value passes. A qualifying sourced role
can satisfy usage even with low/missing numbers. Sufficient current published
usage can pass with inferred role certainty. Conflicts remain unknown unless an
independent hard exclusion applies. All unknown/non-eligible results have reasons.

Depth uses `computeDepthChartStaleness` and its 48-hour source-snapshot limit.
Usage and availability also expire after 48 hours; future-dated evidence is
unavailable. The page reevaluates every minute and on upload.

## Role Authorities

| Authority | Reuse / limitation |
| --- | --- |
| `currentWeekDepthChart.ts` | Reuses `parseDepthChartRows`, `buildDepthChartIndex`, `lookupDepthChartEntry`, `depthRankOneCandidates`, `computeDepthChartStaleness`. Raw depth includes backups absent from passing projections. WR rank is within formation slots, not a flattened WR1-WR6 list. |
| `qbStarterResolution.ts` | Audited depth-first hierarchy; historical/roster fallback is not promoted into proof of a start. |
| `currentWeekRosterUniverse.ts` | Audited exact season/week REG roster rules. Historical-volume admission is not weekly usage. |
| `currentWeekGenerator.ts`, `types/currentWeekProjection.ts` | Exact player/team/position/game/season/week joins; published `projectedCarries` and `projectedTargets` copied verbatim. |
| `teamOpportunityModel.ts`, `roleAllocation/receivingProduction.ts` | Production receiving targets use the finite team pool. Dropbacks are not player attempts. Equal-split receiving fallbacks are unavailable; per-player fallback remains labeled. |
| `rushingShadowAllocation.ts` | Audited, not consumed; diagnostic carries never replace production carries. |
| `receivingRoleConflictDiagnostic.ts`, `rushingRoleConflictDiagnosticV2.ts` | Audited research-only diagnostics, not newly fitted/promoted. V1 role conflicts mean ambiguous sourced QB starters; shadow share conflicts are not hard exclusions. |
| `weekly/availability.ts`, `nfl/injuryData.ts` | Reuses availability normalization and separate game/reserve fields. The 2025 Week 12 injury artifact is disregarded; exact-week roster status is separate, with date-only capture disclosed. |
| `nfl/identity/identity.ts` | Canonical GSIS IDs and team aliases. Duplicate/unresolved joins fail closed. |
| `fantasy/weekly/researchContext.ts` | Audited cumulative RB touches/receiving targets are historical, not weekly projections; not used for thresholds. |

## DST Matchup Score v1

Policy `nfl-dfs-dst-matchup-v1` lives in
`src/lib/nfl/dfs/policies/dstMatchupV1.ts`.

| Component | Weight | Favorable direction | Authority |
| --- | ---: | --- | --- |
| Opponent points | 35% | Lower | Fresh nflverse implied total via `deriveImpliedTeamTotals`; otherwise fresh JKB expected opponent points from `teamTotalFor`. |
| Opponent offensive strength | 25% | Lower | Canonical `buildCurrentRatingBoard(...).offenseRating`; existing preseason/live blend. |
| Defensive pass-rush matchup | 20% | Higher | `createTrenchResolver`, `resolveTrenchPeriods`; negate `matchupRankDifference(opponentPBWRRank, dstPRWRRank)`. Equals opponent OL rank minus DST pass-rush rank. |
| Historical DST fantasy PPG | 20% | Higher | Unavailable: no canonical DST scoring history. |

Normalize each factor over available, resolved, nonduplicate **uploaded DSTs
only**. Off-slate defenses never enter the population. Higher-better percentile:
`100 * (count_below + (count_equal - 1)/2) / (n - 1)`; invert for lower-better.
A singleton is 50; ties share a midpoint. This follows the site's small-pool
endpoint convention.

`score = sum(component_percentile * original_weight) / available_weight`.
At least 60% original weight and two factors are required; otherwise score,
percentile and rank are null. Missing components preserve source metadata,
null normalized score and zero effective weight. Fewer than four components
means partial. Week 1 has 80% coverage and effective weights 43.75% opponent
points, 31.25% OFF and 25% trenches.

Score percentile uses the same midrank formula among scored uploaded DSTs.
Competition ranks are 1, 1, 3 for ties; DK ID deterministically orders tied
scores. Unscored defenses stay visible with null ranks. Higher means a more
favorable defensive setup, not more expected fantasy points.

`dstMatchup` exposes score, percentile, rank, status, raw/normalized components,
effective weights, `componentCoverage` (0-1 original-weight fraction), policy
version, oldest participating `sourceAsOf`, and warnings. Per-component timing
clarifies when an older date belongs to an explicitly prior-season input.

Weekly points/live OFF expire after 48 hours. Preseason OFF and prior-season
trenches are fixed contextual priors. Current-season trenches allow eight days
for weekly publication. Invalid/future timestamps do not contribute. Market
freshness uses upstream commit time, with individual line timestamps unavailable;
no sportsbook/closing-line precision is invented.

`dkAvgPointsPerGame` is unchanged and labeled **DK Avg PPG**. The CSV window is
unspecified, so it neither substitutes for DST scoring history nor means consensus.

## Delivery and Operations

`scripts/generate-nfl-dfs-lineup-context.ts` reads committed local sources and
invokes existing rating/matchup helpers. It records input paths/SHA-256 hashes,
makes no network requests, and writes no prediction archives. Its only write is
the named output; `--dry-run` writes nothing.

```powershell
npx tsx scripts/generate-nfl-dfs-lineup-context.ts --season=2026 --week=1 --dry-run
npx tsx scripts/generate-nfl-dfs-lineup-context.ts --season=2026 --week=1 --output=public/data/nfl/dfs/2026/week-01.json
npx tsx scripts/audit-nfl-dfs-lineup-context.ts --csv='C:/Users/jbloo/Downloads/DKSalaries (7).csv' --output=docs/features/nfl-dfs-wu6c-week1-validation.md
```

Zod validates `nfl-dfs-lineup-context-v1` before output/browser consumption.
`useDfsLineupContext` loads only the selected week. Missing/malformed/wrong-week
or future-generated context fails closed. Only 2026 is supported because current
rating/trench authorities are season-specific. Regeneration after source refresh
is manual; no workflow changes. The audit defaults to September 7 23:55 UTC;
pass `--as-of` explicitly for a newer evaluation.

## Calibration and Limitations

No historical percentile-to-actual-DST-point calibration is asserted. Neither a
complete canonical DST outcome series nor past point-in-time OFF/trench/market
features exists here. Current mutable artifacts cannot reconstruct those facts.
The existing pregame fantasy projection archive is offensive only.

Future research requires archived weekly components/timestamps, uploaded DST
population, policy version, score/percentile, and separately attached canonical
DST outcomes under an explicit scoring version. Then form 0-20, 20-40, 40-60,
60-80 and 80-100 bins (lower-inclusive, upper-exclusive except 100), report
counts/means/uncertainty, and evaluate held-out weeks. Do not reconstruct bins
with today's ratings or interpret V1 scores as expected fantasy points.

The master specification retains older reconstruction-era text saying no NFL
total model exists. Its later total-model section and current
`totalsProjectionData.ts`/`nfl-team-totals-view-v1` establish the team-total
authority reused here. WU6C does not change that model or rewrite historical text.

---

# WU8 Generated Lineups

WU8 generates three deterministic preset lineups per uploaded slate:
**Highest Ceiling**, **Highest Floor** and **Balanced JKB**. It is a downstream
selection layer only. It does not change canonical JKB fantasy projections,
optimizer-eligibility policy, DFS rank math, or the DraftKings parser, and it
adds no stacking, correlation, ownership, uniqueness or external consensus.
Non-eligible players are never hidden from the board -- they are simply not
candidates for a generated lineup.

**No lineup here is a calibrated or EV-optimal lineup.** The weights are
transparent product heuristics chosen by hand, intended for manual review and
tuning.

## Verified salary cap

`nflClassicRules.ts` is versioned `nfl-classic-rules-v2` and now encodes
`NFL_CLASSIC_SALARY_CAP = 50000`, with `NFL_CLASSIC_SALARY_CAP_SOURCE` recording
the provenance: official DraftKings NFL rules for Classic salary-cap contests,
confirmed by the WU8 salary-cap audit on 2026-09-07. The v1 contract deliberately
refused to encode a cap because the original screenshots did not prove one; that
evidence gap is now closed. The DraftKings rules page rejects automated fetches
from this environment (HTTP 403), so the audit rests on the operator-run check
against the official rules plus corroborating third-party documentation of the
$50,000 Classic cap. The optimizer reads the cap, the roster shape and the
minimum-distinct-games rule from this contract and hardcodes none of them.

## Optimizer architecture

`src/lib/nfl/dfs/optimizer/solver.ts` is an exact integer optimizer: a
multi-group 0/1 knapsack solved by dynamic programming over the salary axis,
which searches the same feasible set a MILP would.

No solver dependency was installed. A MILP/WASM package was evaluated and
rejected: the roster has only five position groups and one linear budget, so
plain DP is exact here, costs no bundle weight, needs no WASM or worker
bootstrap, and is directly testable against a brute-force oracle. Generation is
synchronous on the main thread and completes in roughly 100 ms for all three
strategies on a full ~800-row slate, so no Web Worker is used; a previously
generated set is discarded whenever the slate or as-of timestamp changes.

Constraints enforced: exactly 9 slots (1 QB, 2 RB, 3 WR, 1 TE, 1 FLEX from
RB/WR/TE, 1 DST); total salary at or under the canonical cap; no duplicate
DraftKings ID; no duplicate canonical identity; players from at least the
canonical minimum number of distinct NFL games; every offensive selection with
`optimizerEligibility` equal to `eligible`; every DST selection carrying usable
WU6C matchup context. There is no arbitrary top-K pruning: the full eligible
pool enters the DP. When no legal roster exists the result is an explicit
infeasibility with reasons -- constraints are never silently loosened.

The minimum-games rule is solved exactly. The DP runs unconstrained first; if
that optimum already spans enough games the rule was not binding. Otherwise the
solver runs, for each game g, a two-class DP requiring at least one player
inside g and at least one outside it, and takes the best. Every multi-game
lineup qualifies for at least one such g, and every qualifying lineup spans at
least two games, so the maximum over g is exactly the best legal lineup.

## Normalization

Every component is a midrank percentile, (below + (ties-1)/2) / (n-1) * 100
with a singleton scoring 50 -- the same transform the WU6C DST score already
uses. Player features are normalized **within position** across the strategy
candidate pool; team features across the **distinct teams** in that pool, so a
team with many uploaded players cannot dominate its own percentile. Pools are
built only from uploaded candidates. Higher normalized always means better.

## V1 strategy weights

`src/lib/nfl/dfs/policies/lineupObjectivesV1.ts` (`nfl-dfs-lineup-objective-v1`)
is the single source of truth; the UI renders these numbers from code rather
than restating them in copy.

| Component | Ceiling | Floor | Balanced |
| --- | ---: | ---: | ---: |
| JKB projected fantasy points | 40% | 40% | 40% |
| Matchup context (EPA / success / trenches) | 20% | 10% | 10% |
| Team scoring environment (market implied team total) | 15% | -- | 10% |
| Upside proxy (explosive-play evidence) | 15% | -- | -- |
| Usage and role | -- | 30% | 15% |
| Prior workload evidence (per game) | -- | 15% | -- |
| DK Avg PPG benchmark | -- | -- | 20% |
| Salary efficiency (JKB points per $1K) | 10% | 5% | 5% |

Feature definitions:

- **JKB projection** -- canonical `projectedFantasyPoints`, never recomputed.
- **Matchup** -- mean of the available weekly-research matchup edges (offensive
  unit rank minus opposing unit rank for EPA, success rate and trenches).
  Opponent fantasy points allowed is deliberately excluded; see the
  double-counting audit below.
- **Scoring environment** -- `context.scoringEnvironment.teamImpliedTotal` from
  the production projection artifact, normalized across distinct teams.
- **Upside proxy** -- RB: yards per carry and touches per game. WR/TE: air yards
  per game and target share. QB: unpublished, so the component is absent. There
  is no red-zone or touchdown-probability data in this repository, so this is
  labelled an upside **proxy** and never TD equity.
- **Usage and role** -- 60% projected weekly opportunity (carries and targets
  from the WU6C lineup-context artifact), 40% a role-certainty ordinal from role
  class, role certainty and starter evidence. Missing opportunity is dropped and
  the sub-weights renormalized, never read as zero. QB has no published passing
  volume and rushing carries alone would misrank pocket passers, so QB
  opportunity is treated as absent and QB usage comes from role certainty.
- **Prior workload evidence** -- realized point-in-time-safe workload per game
  from the research companion's season sample: touches per game (RB), targets
  per game (WR/TE); sample-size gated at two games; unavailable for QB. **This is
  a workload level, not a variance or stability metric**: no calibrated
  workload-stability metric exists in this repository. At Week 1 the season
  sample falls back to the prior season.
- **DK Avg PPG** -- the DraftKings CSV benchmark over an unspecified window. It
  is never called consensus and is never blended into a JKB projection total.
- **Salary efficiency** -- JKB points per $1,000 of DraftKings salary.

## DST treatment

DST has no JKB fantasy projection and none is fabricated. For every strategy the
DST slot contributes the WU6C `dstMatchupPercentile` (0-100), on the same scale
as a normalized offensive strategy score, gated on a non-null `dstMatchupScore`
under the WU6C coverage policy. DK Avg PPG for DST is preserved as display-only
benchmark context. Lineup JKB subtotals are labelled and computed over the
**eight offensive slots only**; no nine-player JKB total is ever presented.

## Missing-data policy

Missing components are never zero-filled. They are dropped, the remaining policy
weights renormalized, and `componentCoverage`, `effectiveWeights` and
`missingComponents` are exposed per player. A player needs at least **70%** of a
strategy's original weight (`MINIMUM_OBJECTIVE_COVERAGE`) to receive a score.
Below that the player keeps its optimizer eligibility and stays on the board but
is not a candidate for that strategy. On the real Week 1 slate this affects QB
only: QB loses the 15% upside proxy under Ceiling and the 15% workload component
under Floor, leaving 85% coverage in both cases.

## Double-counting audit

`projectedFantasyPoints` already contains two bounded product-policy context
adjustments from `weekly-fantasy-production-context-v1`:
`scoringEnvironmentAdjustment` (market implied team total) and
`opponentFpaAdjustment` (opponent fantasy points allowed vs. position). Both are
therefore partially inside the 40% projection weight.

Handling:

- **Opponent FPA -- removed from the secondary term.** The matchup component
  uses EPA, success-rate and trench edges instead of opponent FPA, so the
  strongest overlap is not stacked.
- **Implied team total -- retained as deliberate extra emphasis.** The
  in-projection adjustment is small and bounded (about +1.0 point for a 27.25
  implied total in the Week 1 artifact), and a ceiling or balanced strategy is
  explicitly meant to lean further on scoring environment. This is documented
  emphasis, not a hidden stack.
- Within a single strategy no sub-feature is used twice. RB touches per game
  appears in the Ceiling upside proxy and in the Floor workload component, which
  are different strategies. Floor deliberately carries both projected usage
  (30%) and realized workload (15%) -- forward-looking and backward-looking
  sources of the same concept -- which is the point of a floor strategy.

## Determinism and tie-breaking

Objective and projection values are carried as integer micro-units, so partial
sums are exactly associative and no floating-point comparison can reorder equal
solutions. Candidates are pre-sorted by DraftKings ID. Ties break in a fixed
order: higher objective score; then higher JKB offense projected subtotal; then
lower salary remaining; then the lexicographically smallest sorted DraftKings ID
sequence. The same slate, policy and data always produce the same lineups, and
input ordering does not matter.

Two or three strategies may return the same lineup. That is valid; no artificial
diversity is imposed.

## Limitations and future calibration

- Not calibrated. There is no historical mapping from a v1 objective score to
  realized DraftKings points, win rate or ROI, and none is asserted.
- No stacking, correlation, ownership, uniqueness or multi-entry portfolio logic.
- No red-zone or touchdown-probability inputs exist; upside is a proxy.
- No workload-variance metric exists; the floor workload term is a level.
- DST is a matchup composite with no fantasy-point calibration (WU6C limitation,
  unchanged here).
- Future calibration requires archived per-week candidate pools, policy version,
  per-player component values and effective weights, the generated lineups, and
  separately attached realized DraftKings scores under an explicit scoring
  version. Only then can weights be fit rather than chosen. Do not reconstruct
  those inputs from today's mutable artifacts.

## Commands

```powershell
npx tsx scripts/audit-nfl-dfs-generated-lineups.ts --csv="C:/Users/jbloo/Downloads/DKSalaries (7).csv" --output=docs/features/nfl-dfs-wu8-week1-validation.md
```

The audit is read-only: it re-derives the enriched slate, asserts that no
pre-existing analyzer field or row changed, generates the three lineups twice to
prove determinism, and writes only the named report.

## WU8 tests

- [`solver.test.ts`](../../src/lib/nfl/dfs/optimizer/solver.test.ts): roster
  shape, salary cap, duplicate DK IDs and canonical identities, FLEX legality,
  the binding minimum-games case, infeasibility reasons, determinism, all four
  tie-break levels, and exhaustive brute-force oracle comparison on fixed and
  randomized small slates.
- [`objectives.test.ts`](../../src/lib/nfl/dfs/optimizer/objectives.test.ts):
  directionality, missing-component renormalization, the coverage threshold,
  QB usage from role certainty, absent DK Avg PPG, team-level normalization,
  role-certainty ordering, and DST scoring.
- [`generateLineups.test.ts`](../../src/lib/nfl/dfs/optimizer/generateLineups.test.ts):
  strategy divergence on a contested slot, offense-only JKB subtotals, DST
  selection and exclusion, eligibility gating, infeasibility, determinism,
  permitted convergence, and the real Week 1 fixture.
- [`NflDfsGeneratedLineups.test.tsx`](../../src/components/nfl/dfs/NflDfsGeneratedLineups.test.tsx)
  and [`nfl-dfs-contest-analyzer.spec.ts`](../../tests/nfl-dfs-contest-analyzer.spec.ts):
  gated rendering, three strategy tabs, nine slots, labelling, methodology
  disclosure, per-player reasoning, and desktop/mobile end-to-end behavior.

See [WU8 Week 1 validation](nfl-dfs-wu8-week1-validation.md) for the generated
lineups, comparison table and automated sanity checks on the real Week 1 slate.
