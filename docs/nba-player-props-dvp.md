# NBA player props board and Defense vs. Position (vertical slice)

Status: **interface, contracts, a durable odds-capture ledger and an offline board builder; no real data is connected.** No provider was called, no credential or secret was touched, no quota ledger or claim was changed, and no workflow or recurring job was added. Everything below that shows numbers in tests or in the dev demo is invented.

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
2. **The 150-line Cleveland at Philadelphia probe did not persist line-level records.** The script printed counts only. The ledger and claim files hold the approval, event id and one-credit charge (`data/nba/quota-probe/`), and no file contains a bookmaker line, price or the `Jaylen Brown 20.5` diagnostic. Those 150 lines are not recoverable without a new request, which needs separate authorization; none was made. **Fixed going forward** by the capture ledger below.
3. **Projection evaluation was not run.** DvP cannot be evaluated against the minutes-times-rate baseline without licensed player-games that carry positions. The adjustment is therefore **not wired into any projection**; DvP is context only. The baseline v0 framework is untouched.
4. **Isolation exception.** `isolation.test.ts` previously barred any application file from importing NBA code. This slice adds one narrow exception (route, page, `src/components/nba/`) limited to the browser-safe modules `propsBoard`, `dvp`, `dvpPositions` and `canonical`, enforced by a new test. This is a deliberate decision for the reviewer to confirm.
5. **Line display rights: unresolved, so lines are not published.** The Odds API record permits public display of *derived* statistics and projections but prohibits raw-data resale and downloadable raw odds. A static JSON file with every posted line and price is in effect downloadable raw odds, and no affirmative evidence says a posted line beside a projection is "derived". The board builder therefore leaves sportsbook lines out of the public artifact unless `--publish-lines` is passed, and that flag must not be used until the owner records that permission. Even then a line is shown only if its snapshot permits `public-display`, and a stale, backfilled or age-unknown line is never shown.

## Capture ledger (future odds captures)

`pipeline/lineCapture.ts`. Every successful response from an approved odds request is written, before the quota is settled, as one **write-once capture file** under `data/nba/odds-captures/` (gitignored, vercelignored, excluded from the production bundle):

| Field | Content |
|---|---|
| Identity | `captureId` (content hash), `capturedAtUtc`, `contentSha256` |
| Game | provider event id, commence time, home/away names, canonical codes and `YYYY-MM-DD\|AWY@HOM` key (null if a team name is unrecognised; never guessed) |
| Lines | per line: player, bookmaker, market, line, Over price, Under price, provider last-update time, raw provider reference (outcome indexes) |
| Provenance | approval id, request reference, credits charged, source id and method |
| License | status, permitted uses, basis and review date **as recorded at capture time** |
| Diagnostics | every entry the normalizer refused (first 2000), refused count, line count, quota-header issue |

Behavior:

- **Immutable.** Exclusive create, fsync, then read-only. Re-writing identical content is a no-op; different content under an existing name is an error. Nothing in the module can edit, replace or delete. Reading re-validates the schema and content hash, so a tampered file fails the build instead of being skipped.
- **Secrets.** The request URL and API key are never part of the record.
- **One-use approval and quota protections are unchanged.** Claim, reservation and settlement code was not modified. Persisting happens inside the single permitted attempt: the capture is written, then the credit is settled. A failed write is reported on the result (`capture.status: "failed"`) and makes `scripts/nba-odds-one-credit-probe.ts` exit non-zero, but cannot trigger another request.
- **Required.** `oneCreditNbaProbe` now takes a mandatory `captureSink`, so a probe that discards its lines cannot be written by accident. `runPregameCapture` accepts an optional `captureSink`; when set, the full response is written before any line is validated or filtered, and a write failure fails the run and records an error attempt.
- **Snapshots.** `snapshotsFromCapture` re-validates each line as a pregame snapshot. A line outside the 45 to 240 minute window, or in a game whose teams could not be mapped, is reported with the reason and not adjusted. Rights are the narrower of the capture's recorded rights and the current record. The Odds API does not report a player's team, so a roster source is needed to learn an opponent.

## Building the board (offline)

`npx tsx scripts/nba-build-props-board.ts [--captures=...] [--store=...] [--projections=...] [--roster=...] [--dvp=...] [--out=public/data/nba-props-board.json] [--publish-lines]`

No network, provider, credential or quota code is imported. Inputs must be under `data/nba/`; the output must be under `public/data/` or `data/nba/`. The write is atomic, and the artifact is checked first (not synthetic, no lines without `--publish-lines`). Nothing runs it on a schedule.

| Input | Format |
|---|---|
| Captures / store | the ledger directory above and an optional `snapshots.jsonl` store |
| `projections.json` | `{ "records": [{ gameKey, tipoffUtc, playerName, team, market, value, minutes, modelVersion, inputCutoffUtc, inputSourceIds[] }] }` |
| `roster.json` | `{ "players": { "Full Name": { "team": "NYK", "position": "PG" } } }` |
| `dvp.json` | `{ "sourceId": "...", "lines": [ box-score lines as in dvp.ts ] }` |

Gates (each counted in the printed report):

- Synthetic snapshots never appear. A game that has started is dropped, along with any projection for it.
- **Projections** are accepted only if every source in `inputSourceIds` has effective rights (own record intersected with its origin's) for both `model-development` and `public-display`. A projection stored inside a snapshot is ignored because it names no sources. With the repository's current rights records, **no projection or DvP row can pass**, so the live artifact will be empty. That is the intended fail-closed state.
- **DvP** is built only from a source whose effective rights include `public-display`, and every line must name that source.
- **Lines**: withheld by default; stale, age-unknown and backfilled lines always withheld. Unpublished lines also drop the bookmaker from entry keys and the sources strip.
- **Three separate missing states**: no sportsbook line (`no sportsbook line captured...` or the withholding reason), no projection (`no projection supplied...`), and DvP (`no-position`, `no-opponent`, `no-dvp-data`, shown by the page). An entry with neither a publishable line nor a projection is dropped and counted.
- With nothing qualifying the output is a valid, empty board, and the page says so.

Tests: `lineCapture.test.ts` (ledger, probe ordering, failed write, adapter path, scheduled job) and `boardBuild.test.ts` (ledger file through the runner to the written file, read back by the page's own view model; every gate).

## DvP data source review (2025-26 and 2026-27, $0)

Training a model on data and showing outputs derived from it are different rights, judged separately (`docs/nba-free-first-data-strategy.md`). Position-specific PTS/REB/AST allowed needs player-game box scores **and** a per-player position.

| Source | Covers both seasons? | Position field | Internal model training | Public display of derived DvP |
|---|---|---|---|---|
| **hoopR-nba-data** (ESPN-derived release files; CC BY 4.0 repo license) | Yes: repo says 2002 to present, daily workflow during the season | The per-game `espn_nba_player_box` documents `athlete_position_abbreviation` and `athlete_position_name`; the release-file schema was **not** verified and nothing was downloaded | **Unresolved.** CC BY covers hoopR's own rights; ESPN's terms bar AI training and validation and automated extraction without written permission (`docs/nba-espn-upstream-rights-review.md`) | **Unresolved**, same reason; commercial use is separately barred by the ESPN terms |
| API-NBA free plan | No: free plan ends at 2024-25 | Not checked | Private evaluation unverified | No license for publication |
| Local NBA.com-derived player-games (2023-24 to 2025-26) | 2025-26 only, partial | **None in the schema** | Restricted: user decision 2026-10-12 forbids development or evaluation use | No |
| BALLDONTLIE | Yes | Yes | Explicitly allowed (terms s6), but game player stats need the paid ALL-STAR tier ($9.99/month) | Allowed under the same terms; raw resale forbidden |
| FantasyPros | n/a | n/a | No permission; **not used, not scraped, not reproduced** | No |
| Basketball-Reference / Kaggle copies | Varies | Varies | Sports Reference prohibits AI training use | No |

**Smallest realistic zero-cost path:** hoopR files plus a written rights answer. Concretely: (1) post the already-drafted licensing question to SportsDataverse (`docs/nba-espn-upstream-rights-review.md` section 5, not yet posted; it is outward-facing and needs the owner's go-ahead); (2) if they or ESPN confirm authority, or counsel's written conclusion is accepted as a dated decision, set `hoopr-espn` `permittedUses` for exactly the uses the evidence supports and nothing wider; (3) verify the release-file columns from a file header or a one-file sample before any bulk download; (4) write the `dvp.json` mapper. Until step 2, `effectivePermittedUses` blocks the data at every gate, including this builder. There is **no verified-rights source at $0**; the cheapest source with explicit rights is BALLDONTLIE ALL-STAR at $9.99/month, which is outside the zero-additional-cost constraint and needs an owner decision.

Both season columns, per-position ranks, sample counts and the display-only blended metric are unchanged by any of this: they are computed from whatever rows pass the gate.

## Remaining blockers

1. **Rights for box scores and positions** (section above): no source has verified rights for both model development and public display. Owner decision needed on posting the SportsDataverse question or paying for BALLDONTLIE ALL-STAR.
2. **Raw sportsbook line display.** Needs affirmative permission from The Odds API (or an owner-recorded counsel conclusion) before `--publish-lines` is ever used.
3. **A future approved odds capture.** The ledger is ready, but no capture exists; the first one needs its own approval and a roster source to resolve each player's team. The 150 lines from the first probe are gone.
4. **Projection inputs.** Projections must come from sources with `model-development` and `public-display` rights. None exist today.
5. **Holdout evaluation** of a DvP adjustment per position and stat before any projection change.
6. **Scheduling.** Running the builder on a schedule, and committing or deploying its output, is intentionally not set up.
