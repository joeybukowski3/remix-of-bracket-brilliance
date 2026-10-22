# NBA player props board and Defense vs. Position (vertical slice)

Status: **interface and contracts only; no real data is connected.** No provider was called, no credential or secret was touched, no quota ledger or claim was changed, and no workflow was added. Everything below that shows numbers in tests or in the dev demo is invented.

Route: `/nba/props` (unlisted, `noindex`, not in navigation or the sitemap). Without a published board it shows an explicit empty state.

## What was built

| Piece | File | Notes |
|---|---|---|
| Position classifier | `src/lib/nba/props/dvpPositions.ts` | Deterministic; documented rules in the file header. |
| DvP aggregation | `src/lib/nba/props/dvp.ts` | PTS/REB/AST allowed to PG/SG/SF/PF/C, per season, with rank, sample size, provenance, blend, matrix columns. |
| Board view model | `src/lib/nba/props/propsBoard.ts` | Browser-safe join of lines, projections and DvP; sort and filter; explicit missing states. |
| Artifact builder | `src/lib/nba/props/pipeline/propsBoardArtifact.ts` | Node side. Applies license, freshness and synthetic gates to captured snapshots. |
| Page and components | `src/pages/NbaPlayerProps.tsx`, `src/components/nba/` | Props board tab and DvP matrix tab. |
| Dev-only demo | `src/lib/nba/props/__fixtures__/boardDemo.ts` | Reached only on the dev server with `?demo=synthetic`; eliminated from production builds and flagged synthetic with a banner. |

## DvP definition

For one opponent, season, position and stat: `allowedPerGame = sum over the opponent's games of (position weight x stat for each opposing player) / games the opponent played in the input`. The denominator counts every game, including those where nobody was attributed to the position, so a rarely used position is not inflated. (The interrupted draft divided by only the games where the position appeared; that biases the average upward and was not kept.)

- Rank 1 = most allowed (easiest matchup). Ties break by team code. A rank exists only when all 30 teams have a row.
- Seasons are independent: `2025` = 2025-26 and `2026` = 2026-27.
- **Blended indicator** (display only): `(n x current + 20 x prior) / (n + 20)`, where `n` is the current-season games sampled. With no current games it equals the prior season. The 20 pseudo-games is an untuned design default. The sample basis is shown as "mostly last season" (under 5 current games), "blending seasons" (5 to 19) or "mostly this season" (20 or more).
- Tier labels use the blended rank: 1 to 10 "allows a lot", 21 to 30 "allows little".
- Each row carries `minutesCoverage`, the share of the opponent's player minutes that could be attributed to a position. Unclassified players are excluded and reported, never guessed.

## Position classification

Weights per player-game sum to 1. Position minutes (from lineup or play-level data) win when supplied; otherwise a roster label is expanded:

| Label | Positions |
|---|---|
| PG, SG, SF, PF, C | that position |
| G | PG, SG (0.5 each) |
| F | SF, PF (0.5 each) |
| G-F, F-G | SG, SF |
| F-C, C-F | PF, C |
| several specific codes | equal weights |
| anything else | unclassified |

Tables that need one position use the heaviest weight, ties to the earliest of PG, SG, SF, PF, C. The board marks multi-position players (for example "G-F → SG").

## Findings that gate production use

1. **No real 2025-26 or 2026-27 position-level data exists in the repository.** `docs/nba-free-first-data-strategy.md` records that every real NBA stat source is rights-blocked or unlicensed; only synthetic data is usable. A local, gitignored NBA.com-derived set (private research only, marked restricted) covers 2023-24 to 2025-26 player-games, but its schema has no position field, so it cannot produce position splits, and it must not feed a published page. Position splits were not manufactured from team totals.
2. **The 150-line Cleveland at Philadelphia probe did not persist line-level records.** `scripts/nba-odds-one-credit-probe.ts` prints counts only. The ledger and claim files hold the approval, event id and one-credit charge (`data/nba/quota-probe/`), and no file contains a bookmaker line, price or the `Jaylen Brown 20.5` diagnostic. The 150 lines are not recoverable without a new request, which needs separate authorization. None was made.
3. **Projection evaluation was not run.** DvP cannot be evaluated against the minutes-times-rate baseline without licensed player-games that carry positions. The adjustment is therefore **not wired into any projection**; DvP is context only. The baseline v0 framework is untouched.
4. **Isolation exception.** `isolation.test.ts` previously barred any application file from importing NBA code. This slice adds one narrow exception (route, page, `src/components/nba/`) limited to the browser-safe modules `propsBoard`, `dvp`, `dvpPositions` and `canonical`, enforced by a new test. This is a deliberate decision for the reviewer to confirm.
5. **Line display rights.** The Odds API record permits public display of derived projections but prohibits raw-data resale and downloadable raw odds. The builder withholds a line unless its snapshot permits `public-display`, and withholds lines of unknown age or backfilled after tipoff. Whether showing a posted line beside a projection is within "derived" display is an owner decision; a board file is not committed.

## Publishing a board

The page reads `public/data/nba-props-board.json` (not under `data/nba/`, which is gitignored and excluded from deploys). Nothing writes that file today. When real inputs exist, a Node script would call `buildPropsBoardArtifact` with captured snapshots, DvP rows from a permitted source, and roster position labels, then write the file. That script is not included.

## Remaining blockers

- A box-score source with a position split (or lineup-level data) and a recorded license for `public-display` and `model-development`.
- A roster position source.
- Persisting line-level odds on any future approved capture (the probe script discards them).
- Holdout evaluation of a DvP adjustment on that data, per position and stat, before any projection change.
- Owner decisions on items 4 and 5 above.
