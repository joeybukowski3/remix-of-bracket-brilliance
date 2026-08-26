# Canonical NFL player-game projection universe (Phase 5.5)

## 1. Universe source audit

| Source | Seasons | Weeks | Relevant IDs | Roster/active info | Snap participation | Pregame-safe? |
| --- | --- | --- | --- | --- | --- | --- |
| `stats_player_week` | 2022-2025 | 1-18 | `player_id` (gsis) | none directly; presence = played | none | Outcome only, not a pregame predictor. Already unfiltered by stat value at the Phase 1 normalization layer (see below). |
| `weekly_rosters` | **2023-2025 only** (no 2022) | 1-18 | `gsis_id` | `status` per team-week: `ACT`, `INA`, `RES`, `CUT`, `RET`, `DEV`, `TRD`, `TRC`, `EXE` -- a genuine **per-week** signal, not a season-level tag | none | `status` at week W reflects that week's roster state; safe to use only for weeks strictly before the target week when building eligibility, and (for target-week diagnostics) usable as-is since it's not derived from target-game play. |
| `snap_counts` | 2023-2025 | 1-18 | `pfr_player_id` (needs crosswalk) | n/a | offense/defense snap % | Target-game snaps are explicitly NOT pregame-safe (brief's own instruction); not used for eligibility this phase. Available for a future diagnostic pass. |
| `injuries` | 2023-2025 | 1-18 | `gsis_id` | game/practice status | n/a | Not integrated this phase (scope: universe membership + eligibility, not injury-conditioned eligibility). |
| `players.csv` crosswalk | season-agnostic | n/a | gsis/pfr/espn | n/a | n/a | Already used by the shared identity layer (`src/lib/nfl/identity`); reused, not duplicated. |
| Fantasy `backtest/universe.ts` | n/a | n/a | n/a | n/a | n/a | Referenced only as an architectural pattern (week-effective active-roster universe), per the approved reuse boundary -- not imported, not depended on. |

**Key empirical finding that shaped the design**: Phase 1's `normalizeYardageOutcomeRow` was *never* filtering by stat value -- it only skips non-REG rows and unresolved identity. The Phase 5 rushing gap came entirely from a later filter (`if (carries <= 0) continue`) in `buildRushingOutcomes`. Verified directly against the source: 2025 alone has 297 RB rows with `carries == 0` already present in `stats_player_week` (78 with other recorded stats, 219 with zero everywhere). This meant most of the "missing zero-carry rows" problem could be fixed by **not re-filtering rows the source already provides**, before any new roster/snap engineering was needed.

## 2. Canonical player-game row identity

One row per `season | week | gameId | playerId`, for QB/RB/WR/TE, using the shared identity layer (`src/lib/nfl/identity`) for `playerId`/`playerName`/position resolution -- the same `resolveNflPropPlayerIdentity` Phase 1-5 already use. Team resolves per-week from the row's own source (never a season-level assumption), so a traded player's rows carry the correct team for each week independently. Zero duplicate `(season, week, gameId, playerId)` keys (verified by generator QA and test).

## 3. Universe membership vs. market eligibility

Two distinct concepts, two distinct fields:

- **`membershipSource`** (`"statsTable"` | `"activeRosterConfirmed"`): why the row exists at all -- broad, market-agnostic.
- **`eligibility: { rushingEligiblePregame, receivingEligiblePregame, passingEligiblePregame }`**: three independent, market-specific booleans. A player can be rushing-eligible without being receiving-eligible (e.g. a between-the-tackles-only back with no receiving role) and vice versa. `passingEligiblePregame` additionally requires `position === "QB"`.

## 4-7. Eligibility rules

All three markets use the same algorithm (`isMarketPregameEligible`), parameterized by which activity stat to check and by a fixed, non-tuned prior-season threshold:

```
eligible(player, season, beforeDate) =
  ANY prior game this season (strictly before `beforeDate`) with activity > 0
  OR prior-season TOTAL activity >= threshold
```

Thresholds: carries 20, targets 20, pass attempts 50 (rushing/receiving thresholds unchanged from Phase 5's original rushing rule; passing threshold newly set for this phase, not previously defined). Never reads the target row's own activity -- verified by an explicit adversarial test (mutating a row's own carries/targets/attempts to 999 does not change its own eligibility) and a future-isolation test (a huge future week's activity never changes an earlier week's eligibility).

**Passing (§7)**: Phase 3/4's own eligibility concept (an implicit "was the primary passer") is untouched -- no material defect was found that would justify overhauling it. The new `passingEligiblePregame` flag is additive shared infrastructure, not a replacement.

**Receiving groundwork (§6, no model built)**: `receivingEligiblePregame` computed and reported (population sizes in §5 of the final report) but no receiving outcome/feature/baseline pipeline exists yet.

## 8. Zero vs. missing semantics

| Case | Field value | Justification |
| --- | --- | --- |
| Player has a `statsTable` row, recorded 0 in some category | `0` (real) | The player definitely played that week (a real box-score row exists); a 0 in any one category is a genuine recorded fact. |
| Player has no `statsTable` row, but is `weekly_rosters` `ACT` for that exact team-week (2023-2025) | `0` across every offensive category | Distinct from the source's own explicit `INA` status. ACT-with-no-box-score-row is treated as "dressed, played some snaps, recorded zero in every offensive category" -- a defensible true zero, not a guess, though not 100% certain (see limitation below). |
| Player is `INA`, `RES`, `CUT`, etc. that week | **No row at all** | Not eligible/relevant that week; never coerced to zero. |
| 2022, player absent from `statsTable` | **No row at all** | No roster source exists for 2022; this is a real, stated coverage gap, not inferred as zero. |

## 9. Target-game diagnostics

`membershipSource` and the eligibility flags are visible on every row, including the target week itself -- but the eligibility flags are computed from PRIOR games only (never the row's own week), so using them as retrospective diagnostic slices does not leak. No snap/injury target-game diagnostic was added this phase (scope: membership + eligibility).

## 10-11. Artifact and QA

`data/nfl/props/player-game-universe-2022-2025.json` (`npm run nfl:player-game-universe`): **28,327 rows**, 0 duplicate keys, 0 unresolved game context. `activeRosterConfirmedRows`: 0 (2022, no roster source) / 1,712 (2023) / 1,647 (2024) / 1,490 (2025).

| Season | Total | QB | RB | WR | TE | Rushing-eligible | Receiving-eligible | Passing-eligible | Zero carries | Zero targets | Zero receptions | Zero rec. yards | Zero rush yards |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2022 | 5,776 | 633 | 1,545 | 2,378 | 1,220 | 2,886 | 4,389 | 544 | 3,547 | 1,512 | 1,980 | 2,006 | 3,608 |
| 2023 | 7,513 | 1,095 | 1,861 | 2,878 | 1,679 | 3,417 | 5,424 | 947 | 5,270 | 3,194 | 3,627 | 3,660 | 5,332 |
| 2024 | 7,511 | 1,098 | 1,850 | 2,833 | 1,730 | 3,387 | 5,289 | 976 | 5,286 | 3,318 | 3,723 | 3,757 | 5,341 |
| 2025 | 7,527 | 1,100 | 1,859 | 2,834 | 1,734 | 3,448 | 5,235 | 874 | 5,305 | 3,275 | 3,709 | 3,750 | 5,367 |

2022's smaller total (5,776, exactly matching `stats_player_week`'s own row count) versus 2023-2025's ~7,5xx confirms the `activeRosterConfirmed` tier's real contribution: roughly 1,500-1,700 additional legitimate rows per season that the stats table alone would have missed.

## Eligibility threshold sensitivity (population size)

A compact check of the rushing-eligible population size under three prior-season carry thresholds (population count only; a full model rerun per threshold was judged out of scope for this phase's remaining budget):

| Rule | Rushing-eligible rows |
| --- | --- |
| Looser (threshold=10) | 13,501 |
| **Current (threshold=20)** | **13,138** |
| More conservative (threshold=40) | 12,900 |

Population size varies only ~2-3% across a 4x range of the threshold (10 to 40) -- **the eligibility definition is not fragile to reasonable threshold choices**. The current threshold (20) is kept, both because it is unchanged from Phase 5's already-reviewed rule and because the sensitivity check found no material reason to move it.

## 12. Adversarial leakage tests

All four required categories implemented and passing (`playerGameUniverse.test.ts`, `rushingOutcomes.test.ts`):
- Eligibility isolation: mutating a row's own carries/targets/passAttempts to an extreme value never changes its own eligibility.
- Future isolation: a huge future week's activity never changes an earlier week's eligibility.
- Zero inference: an `INA` roster row never produces a universe row (never inferred as zero); an ACT row with no stats-table row does produce a documented true zero.
- Missing preservation: a row with `carries == null` is excluded from the rushing outcome conversion rather than coerced to zero (tested directly in `rushingOutcomes.test.ts`).
