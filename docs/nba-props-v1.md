# NBA player props board: practical V1

Status: **real hoopR/ESPN statistics now flow through V1 into a populated board that works as a local, private preview. The public board stays empty: no source has publishable rights.** The owner approved hoopR/ESPN on 2026-10-23 for private analysis; that is the owner's decision, **not ESPN's permission**, and ESPN's commercial and public reuse terms remain unresolved. Only `private-research` is recorded for it (`licenses.ts`), the public board builder and its rights gates are unchanged, and the private board is written only under the gitignored `data/nba/`. No Odds API request was made, no scheduled job was added, the quota manager and odds capture are unchanged, and no other sport was touched.

## The blocker, precisely

A projection or DvP row may reach the public board only if the source of every input has effective rights for **both** `model-development` and `public-display` (`pipeline/boardBuild.ts`, unchanged). Today:

| Source | Why it cannot publish |
|---|---|
| `stats.nba.com`, `llimllib-nba-data` | NBA.com Terms section 9 and the 2026-10-12 owner decision: no development or evaluation use. |
| `espn`, `hoopr-espn` | Disney terms bar AI use, commercial use and automated extraction without written permission. hoopR's CC BY 4.0 license does not cover ESPN's rights. The licensing question (hoopR-nba-data issue 24, opened 2026-10-22) has **no reply** as of 2026-10-23. |
| `balldontlie` | Explicit rights (analytics, wagering products, ML training allowed; raw resale forbidden), but game player stats need the paid ALL-STAR tier, $9.99 per month. No subscription exists, and V1 forbids new subscriptions. |
| `api-sports-nba`, `thesportsdb`, `sportsdataio` | No publication license, or no per-game player stats. |

No source is `licensed`, so no real PTS/REB/AST can be shown. The V1 route below leaves every one of these gates closed.

## Real data: hoopR/ESPN, private preview only

**Rights, plainly.** hoopR-nba-data is CC BY 4.0 (credit hoopR, link the license, indicate changes), but its data is ESPN-derived and ESPN's terms bar commercial use and automated collection without written permission. The owner decided on 2026-10-23 to use it for private analysis. The registry now records `private-research` and nothing else for `hoopr-espn` and its origin `espn` (both records say it is an owner decision and not ESPN permission). `model-development`, `public-display` and `raw-redistribution` are still empty, so the public builder withholds everything from this source (a test proves it), and the private preview refuses any source that is already publishable (that goes through the public builder) or synthetic. Anything published needs a rights basis from ESPN, its counsel, or a different licensed source; see `docs/nba-espn-upstream-rights-review.md`.

**Season mapping.** hoopR season 2026 = 2025-26 and 2027 = 2026-27 (a fixed table; any other season is an error, and a row whose season disagrees with its file or whose date falls outside its season's window rejects the import).

**Steps** (all from this branch, in this order; the two downloads are gated or capped and nothing moves between worktrees by hand):

```
python scripts/nba-hoopr-fetch.py --confirm-owner-decision            # 3 files, one pinned commit, sha256 manifest; needs pyarrow
npx tsx scripts/nba-wikidata-position-probe.ts                        # Wikidata position labels: read-only, 8 capped requests, ~2 minutes
npx tsx scripts/nba-hoopr-import.ts [--overrides-csv=data/nba/props-v1/position-review-list.csv] [--overrides=<json>]
npx tsx scripts/nba-props-v1-build.ts --private-preview               # writes data/nba/props-v1/private-preview-board.json
npm run dev    # then open /nba/props?private=1 and choose that file (dev only; read in the browser, never uploaded or served)
```

The import reads the probe's snapshot from its default path (`data/nba/wikidata-positions/snapshot.json`), so it needs no `--wikidata` flag; if the snapshot is missing it stops and names the probe command. It warns when the snapshot is more than 14 days old. The probe itself refuses to start within 10 minutes of the previous run (whatever `--out-dir` is) or during an abort cool-down, tracked in `data/nba/wikidata-positions/.probe-state.json`; delete that file only if you are sure. It refuses a snapshot limited to a sample of items and one whose live vocabulary check failed.

- **Wikidata probe** (`scripts/nba-wikidata-position-probe.ts`, `src/lib/nba/props/v1/wikidata/`): the capped, serial, read-only SPARQL probe from the position coverage audit, with its snapshot format and tests, and nothing else from that research branch (no classifier, roster mapping or audit report). 8 requests (cap 10) to `query.wikidata.org`, at least 5 s apart and at least as long as the previous request took, a descriptive User-Agent, no retry, redirects refused, it stops on 429, 5xx, a timeout, a malformed or oversized body or truncation, and a cool-down guard follows an abort. Output is confined to `data/nba/wikidata-positions/`. Wikidata data is CC0. It is the only code that reaches the network, through an injected `fetch`, and a test checks that.
- **Fetch:** `player_box_2026`, `player_box_2027` and `nba_schedule_2027` from `sportsdataverse/hoopR-nba-data`, 750 KB in total, at the commit recorded in `manifest.json`. No retry, size-capped, output confined to `data/nba/`.
- **Import:** excludes, and counts, did-not-play rows, rows with no or zero minutes, All-Star teams (STARS, STRIPES, WORLD), unknown season types and incomplete games. Identity is the ESPN athlete id as a string (the same id Wikidata property P3685 uses); names are display only and name changes or shared names are reported.
- **Positions.** No depth-chart source exists (ESPN's pages cannot be collected), so positions are estimated from Wikidata's CC0 career-level five-position labels joined by ESPN athlete id, narrowed by ESPN's coarse G/F/C listing when Wikidata lists several, with ESPN's own listing used directly when it names one position (a "C"). A Wikidata label that ESPN's listing contradicts is kept and flagged. A player ESPN lists only as "G" or "F" and Wikidata does not label stays **unclassified** (PG vs SG, SF vs PF would be a guess), is still projected, and shows "pos N/A" with no DvP context. Roles come from starts and minutes. Manual overrides need a reason and only apply to players that exist in the data. The same career-level label is applied to both seasons, and the file says so. A Wikidata statement counts as career-level when it has no season, team or end-date qualifier (a start date alone is not read). Weaker Wikidata evidence (a label that exists only on a season-, team- or end-date-scoped statement, or only a hybrid label such as "swingman") is shown to a reviewer and **never applied**.
- **Slate:** the next Eastern game date with games still to play, from hoopR's 2026-27 schedule.

**Results from the real run (2026-10-23, hoopR commit `13f2e6ac8a`, private):**

These are operational counts and coverage figures only. No player name, statistic, projection or position from the data is committed; everything derived from it stays under the gitignored `data/nba/`.

| | 2025-26 | 2026-27 |
|---|---|---|
| Player-game records imported | 28,588 (from 34,883 rows) | 367 (from 440 rows) |
| Games | 1,322 | 16 (Oct 20 to 22) |
| Players with a game | 582 | 345 |
| Players with an assigned position | 359 (70.0% of minutes) | 224 (71.5% of minutes) |
| Position source | 279 Wikidata single, 19 multi (ESPN tie-break), 36 Wikidata over ESPN, 25 ESPN "C" | 180, 13, 19, 12 |
| DvP rows | 450 (all ranked, 82 to 83 games per team) | 450 (all ranked, 1 to 2 games per team) |
| DvP regular-season minutes attributed to a position | 69.4% | 71.5% |

Projections: 828 props (PTS, REB and AST for 276 players) for 12 games and 24 teams, 100 of those players without a position. Lines: none (no Odds API request was made). 2026-27 DvP rests on 1 to 2 games per team, so the page labels it "mostly last season" and the blended view carries the 2025-26 baseline.

**What remains restricted.** Public publication. Nothing derived from hoopR/ESPN may be published, committed, deployed or shared (PR images included) until ESPN permission, counsel's written conclusion accepted as a dated decision, or a licensed source exists. The attribution to hoopR (CC BY 4.0) and ESPN is kept in the board's private notice.

### The position gap (about 30% of minutes) and how to close it

The breakdown below is generated on the owner's machine into `data/nba/props-v1/position-review-list.json` (`analysis`) and printed by the import as counts; it is not kept in Git because it is derived from hoopR/ESPN data. In short: about 30% of minutes in each season belong to players with no position; for almost all of them the Wikidata item exists but carries no position statement (mainly recent starters); a small share has only a season-, team- or end-dated label or only a hybrid label ("forward", "swingman"), which is shown to a reviewer as a hint and never applied; a handful have no Wikidata item at all. Wikidata is therefore not a source to widen, and the gap closes by review, not by guessing. Nothing is auto-filled.

**Review workflow.** `scripts/nba-hoopr-import.ts` writes `position-review-list.csv`, every unclassified player ordered by combined minutes across both seasons, each with `onSlate` (the player's team plays on the current slate), ESPN's listing and the positions it allows, and the weak Wikidata evidence as a hint. Fill `primary` (PG, SG, SF, PF or C), optionally `secondary`, and a `reason` of at least 5 characters, for the rows you can support, then re-run the import with `--overrides-csv=data/nba/props-v1/position-review-list.csv`. A row with no `primary` is skipped. The whole file is rejected on an invalid position, a missing reason, a player that is not in the hoopR data, or a player listed twice. An override applies to each season the player has and is flagged in the position file. Names beginning with `=`, `+`, `-` or `@` are written with a leading quote so a spreadsheet cannot run them.

The analysis projects the coverage that reviewing the top 25, 50 or 100 players would give (reviewing the top 100 closes most of the gap in both seasons). Whether a documented rule may split ESPN's "G" and "F" is a separate owner decision and is not made here.

## What was built

| Piece | File | Behaviour |
|---|---|---|
| Position estimates | `src/lib/nba/props/v1/positionEstimates.ts` | One mapping file per season. One estimated primary position (PG/SG/SF/PF/C) per player-season plus optional secondaries, from the projected depth chart (starters) or rotation role and minutes (bench). Manual overrides need a reason and are flagged. Every record is `status: "estimated"`. A season's positions are never applied to another season. |
| Player-game import | `.../v1/playerGameImport.ts` | JSON or CSV. Strict: any bad row, unknown team, duplicate, or inconsistent game fails the whole file. The file names a registered `sourceId` and gives provenance. **It cannot grant rights**: the existing registry decides. |
| Slate build | `.../v1/slateBuild.ts` | Calls the unchanged baseline v0 (`projection.ts`) for expected minutes and PTS/REB/AST; builds the roster and approximate DvP input. |
| Runner and CLI | `.../v1/run.ts`, `scripts/nba-props-v1-build.ts` | Reads `data/nba/props-v1/`, writes the board inputs, runs the existing board builder. Writes a private copy by default. |
| Page wording | `NbaPlayerProps.tsx`, `PropsBoardTable.tsx`, `DvpMatrix.tsx` | Positions are labelled "(est.)"; DvP is labelled estimated primary-position, not minutes at position; the empty state describes the real situation. |

Projection: expected minutes from recent minutes, season to date and the previous regular season, times a shrunken per-minute rate. Early in 2026-27 the 2025-26 baseline carries the estimate through the model's own priors. It conditions on the player appearing: no pregame availability feed exists, so a scratch is not modelled. A missing DvP input or sportsbook line never hides a projection.

Approximate DvP: each regular-season player-game counts toward the player's one estimated position for that season, aggregated by opposing team, season, position and stat. Rank 1 allows the most. The denominator is every opposing game. Coverage of minutes attributed to a position is reported per season and per row. It is display-only; nothing adjusts a projection.

## Running it

```
npx tsx scripts/nba-props-v1-build.ts                         # reads data/nba/props-v1/, writes data/nba/props-v1/nba-props-board.json
npx tsx scripts/nba-props-v1-build.ts --out=public/data/nba-props-board.json   # publish; the builder still withholds what rights do not permit
```

Files in `data/nba/props-v1/` (gitignored):

- `player-games.json`, or `player-games.csv` plus `player-games.source.json` (`{sourceId, retrievedAtUtc, provenance}`). CSV columns: `season,seasonType,gameId,gameDate,team,opponent,isHome,playerId,playerName,minutes,pts,reb,ast`; minutes may be `mm:ss`. JSON: `{schemaVersion: "jkb-player-games-import-v1", source: {sourceId, retrievedAtUtc, provenance}, rows: [...]}`.
- `positions-2026-27.json` (required) and `positions-2025-26.json` (optional): `{schemaVersion: "jkb-position-estimates-v1", season, asOfUtc, sourceNote, players: [{playerId, name, team, primary, secondary?, role: starter|rotation|bench|out}], overrides?: [{playerId, primary, secondary?, reason}]}`. Player ids are the import's own ids.
- `slate.json`: `{season: "2026-27", games: [{gameKey: "2026-10-24|BOS@NYK", tipoffUtc}]}`. Start with one or two games.

Nothing here was invented for real players: the position files and the import must be supplied. The tests use an invented league ("Demo Player ..."); none of it is shipped.

## Results

On an invented one-game slate through the real runner:

| | Real registry (today) | Test-only license for a fictional agreement |
|---|---|---|
| Projected props populated | **0** (48 built, all withheld: "built from balldontlie, whose rights do not permit model development and public display") | 48 (16 players, 3 markets) |
| DvP rows | **0** (withheld) | 900 (30 teams x 5 positions x 3 stats x 2 seasons), ranked, with games sampled and coverage |
| Sportsbook lines | 0 | 0 (no captures; lines are withheld by default) |
| Real players or statistics available for publication | **none** | not applicable |

## Season averages and manual minutes overrides on `/nba/props`

The board table shows season-long production beside each prop and lets a viewer try their own minutes. Neither changes the JKB projection model: `projection.ts`, the board builders and the rights gates are untouched.

**Columns.** Superseded by the compact table below; the figures and their arithmetic are unchanged.

**Two different estimates, never conflated.**
- *Adj proj* = JKB projection x your minutes / JKB projected minutes: the model's own per-minute rate at your minutes.
- *Season-rate est* = your minutes x this season's stat per minute: no model involved.
Both have their own difference from the line; *JKB - line* is kept as it was. They appear only while a minutes override is active (in the expanded row, or in their own columns), and they are `N/A` (with the reason on hover) rather than a number whenever an input is missing: no JKB projection, JKB minutes of zero or none, no line, or no games this season for a per-minute rate. Input outside 0-48 or not a number is refused with a message and applied to nothing. An override is keyed by player and game, so it follows the player across the points, rebounds and assists views; each row has a reset, and *Reset all minutes* clears everything.

**Safeguards in the table.** The error for a bad entry appears when the field is left (a half-typed "." never flashes one) and nothing is applied meanwhile. Under *Adj proj* a small note gives your minutes relative to the JKB minutes (× 1.06 JKB min) and turns amber beyond × 1.5 or below × 0.5, so a typo is visible. *Season-rate est* states its sample ("on 3 g · small sample" under 15 games). A value that rounds to zero prints "0.0", never a signed zero. After a per-player reset focus returns to the minutes field.

**Overrides stay in the page.** They live in React state only: nothing is written to storage, a cookie, the server, the board or any artifact, and a reload clears them (tests check that nothing is stored or requested).

**Season statistics** (`seasonStats.ts`, `v1/seasonStatsBuild.ts`). Totals over completed games dated strictly before the upcoming matchup (the same leakage gate the projection uses), with did-not-play and zero-minute appearances excluded; per-game figures divide by games and per-minute figures by minutes, and are null (shown as a dash or N/A, never zero) without a positive denominator. The current season is every competitive game so far; last season is its regular season. They are never added together: the *Season sample* column names the season and the number of games, and while the current sample is under 15 games (or empty) last season appears beside it in small type, labelled with its own games.

**Rights.** Season statistics are hoopR/ESPN-derived, so they exist only in the private preview board (`v1/privatePreview.ts`, which still refuses any source that is publishable or lacks a private-research right) and are loaded only through the dev-only local file picker. The public board builder never receives or sets them (a test builds a licensed public board and checks the field is absent), and a public board without them simply has no season columns. At run time the public page also refuses any published board that carries season statistics or a private-preview notice (`containsPrivateData`), so a private file copied into the published data folder cannot be shown. The invented demo board (`?demo=synthetic`, dev server only) carries made-up figures so the interface can be reviewed.

## Backtest and position proposals (private research)

Both tools read the private hoopR import under the gitignored `data/nba/` and write only there. Their reports are never committed or published; the figures are in the owner's private reports, not in this repository.

```
npx tsx scripts/nba-v1-backtest.ts                          # data/nba/props-v1/backtest/backtest-report.json
python -I scripts/nba-hoopr-player-features.py              # per-player-season totals from the local hoopR files (sha256-checked)
npx tsx scripts/nba-position-proposals.ts                   # data/nba/props-v1/position-proposals/position-proposals.csv and .json
```

**Backtest** (`v1/backtest/`). Walk-forward over the 2025-26 regular season, with 2026-27 shown separately as a tiny forward check. Every prediction uses only games dated strictly before it: features come from the board's own leakage gate (`computePregameFeatures`), league per-minute rates are an expanding window, and the model is the frozen public baseline v0. It is scored on PTS, REB and AST independently, plus minutes and the per-minute rate, against naive last-5, last-10 and season-to-date averages, all on the same player-games. Differences are paired with conservative 95% intervals: errors are clustered both by player and by calendar week, the wider standard error is used, and a Student-t critical value replaces 1.96. Tables: projected-minutes tier, prior-games band, returning from absence, team change, role change, team rest, home and away, expected margin and opponent defense (both from earlier games only), and month. Two further tables use the game's outcome (actual minutes band, final margin) and are diagnostics, never features. The split of PTS error into minutes and per-minute-rate parts uses two counterfactuals that no model can use.

*Measured, not adopted.* `opportunities.ts` re-runs v0 with a few alternative settings chosen in advance from the diagnosis, and learns segment error shifts on the first half of the season to apply to the second. Nothing changes `projection.ts` or the board.

*Limits.* The projection is conditional on appearing (the import has no did-not-play rows). There is no 2024-25 data, so every 2025-26 target runs on the new-player and league-rate priors, not the previous-season priors the board uses in 2026-27: results for the priors cannot be read off this sample. The 2026-27 sample is too small to conclude anything. Rates and minutes errors are correlated within a team and a week; the intervals account for that, but the what-if variants were chosen after looking at the same season and the segment corrections are not adjusted for multiple comparisons, so the "second half" figures are a stability check, not an out-of-sample test, and a change needs confirmation on later games before it is adopted. In 2026-27 the season-to-date baseline does not exist for a player's first game, so those rows are left out of every comparison (the report counts them).

**Position proposals** (`positionProposals.ts`, `positionModel.ts`). For the highest-minute players with no position, a small ridge logistic model compares their per-36 box-score rates with players whose position is known (a clean single Wikidata label). ESPN's coarse listing restricts the answer to two classes (a guard is PG or SG, a forward is SF or PF; a guard is never proposed as a small forward here). Held-out accuracy and precision at each confidence threshold come from 10-fold out-of-fold predictions. A position is **proposed** only at a threshold whose held-out precision is at least 85% (medium) or 90% (high) on at least 30 held-out players, and every proposal shows the 95% lower bound of that precision; below that, or for centers and players with no G or F listing, the player stays unassigned and only a best guess is shown. The held-out players are ones whose positions are already known, so the precision is probably an upper bound for the players Wikidata cannot place; the truth it is checked against is the Wikidata label, which is itself imperfect; and a wing ESPN lists as a guard can only be proposed as PG or SG, so reviewers must confirm hybrids.

Nothing is applied. The proposals CSV ends with the review list's blank `primary`, `secondary` and `reason` columns: copying a proposal into `primary` with a reason is the review, and `--overrides-csv` on the import then reads it. An unreviewed file changes no position (a test checks that). Potential minutes coverage is computed as if the proposals were accepted, for position coverage (every game except preseason) and for DvP (regular season only); the current coverage is reproduced first as a check.

## Validating the proposed improvements on independent history (private research)

The public V1 projection is unchanged. Two candidate changes from the backtest were frozen, in code and tests (`v1/validation/frozenPlan.ts`, committed before any 2024-25 data was imported or any candidate scored), and are re-validated with 2024-25 context (see the independence note below):

- **A**: no shrink toward the fixed 14-minute new-player prior once the player has an in-season game, for players with no qualifying previous season. Players with a previous season of at least 10 games are untouched.
- **B**: per-minute rates shrunk toward the previous-season (or league) rate with a 25-minute weight instead of 100, for PTS, REB and AST.
- **AB**: both.

```
python -I scripts/nba-hoopr-fetch-prior-season.py --confirm-owner-decision   # 2024-25 player box, at the commit already pinned in the manifest
npx tsx scripts/nba-v1-validation.ts                                          # data/nba/props-v1/validation/validation-report.json
```

2024-25 supplies the previous-season context, 2025-26 is the evaluation season (chronological, every prediction from games strictly before it), and 2026-27 gets an early-season sanity check (projection ranges, a few weeks of games; not decisive). The fetch script downloads one file at the same pinned commit, size-capped and redirect-refusing, and writes its own manifest; `v1/validation/researchGames.ts` is the research-only loader for three seasons, so 2024-25 never reaches the board, its positions or its DvP.

**Decision rule (frozen).** A candidate justifies a *targeted change* only if (1) each primary measure's paired MAE difference has a 95% upper bound below zero (A: minutes and PTS; B: PTS, REB and AST; AB: all four), (2) no measure is significantly worse, (3) every primary measure also improves in the later half of the season's dates, and (4) no pregame subgroup (projected-minutes tier, prior-games band, season segment, previous-season status, absence, team change, role change, rest, home or away) with at least 200 scored player-games is materially worse: significantly worse and at least 2% worse than its baseline MAE. Intervals cluster errors by player and by week, take the wider standard error and a Student-t critical value. Passing is a recommendation, never an automatic change; the position proposals stay review-only throughout.

**Independence note (2026-10-26, written after review; the frozen file is not edited).** The candidates, including the 25-minute weight, were chosen on the PR #441 backtest of 2025-26. Evaluating them on 2025-26 again is therefore **not independent**: only the previous-season context (2024-25) is new, and a pass is optimistic through selection. Treat a pass as "needs forward validation", and judge it on 2026-27 as games accumulate; the early-season check here is far too short to do that. The comment at the top of `frozenPlan.ts` says "data they were not chosen on"; read it with this note.

**Subgroups.** The implemented set was fixed in code before the first run and is a superset of the frozen list: it adds month, team rest, home or away, a "fixed prior applies" split and a third previous-season level (under 10 games), and the material-worsening rule is applied to all four measures, not only the primary ones. That can only block a recommendation more often than the frozen text, never less.

Limits: one evaluation season; many subgroups are checked, so a single flagged small subgroup is read in context; the data is ESPN-derived and private, so the report is never committed or published and this document carries no figures.

## Decisions that would open real data

Each needs an explicit owner decision, recorded with its basis in `licenses.ts`. None was made.

1. **BALLDONTLIE ALL-STAR, $9.99 per month.** The only source with explicit, reusable rights. Needs approval for a paid subscription, then a `commercial-licensed` record with `model-development` and `public-display` (never `raw-redistribution`). Export 2025-26 and 2026-27 player games to the import format. This is the fastest honest route.
2. **hoopR/ESPN data.** Only after a written statement from someone holding ESPN's permission, ESPN's own permission, or counsel's written conclusion accepted by you as a dated decision (`docs/nba-espn-upstream-rights-review.md`). Free, but not available today.
3. **Position estimates.** Someone has to compile 2026-27 depth charts and rotation roles (roughly 450 to 540 players, two seasons if wanted). They are facts, not a rights problem, but they cannot be generated here without inventing them.
4. **Sportsbook lines.** The Odds API record permits derived display, not a raw-line feed; lines stay withheld until you record that showing posted lines is permitted.

## Known limits

- **Estimates, not minutes at a position.** Positions come from a depth chart and rotation role; a player who plays two positions counts toward one. Multi-position nuance is kept only as optional secondary positions, which nothing uses yet.
- **Position estimates have no rights gate of their own.** They carry a required free-text `sourceNote` and an as-of time, and are attached to any entry that passes the existing gates. Compile them from sources you may use.
- **Availability is not modelled.** A projection is conditional on the player appearing; mark a known absence as role `out`.
- **Partial DvP coverage is reported, not hidden.** Per-row `minutesCoverage` and the build report show how many minutes had a position. A team-season with **no** attributed minutes is left out, so no rank is ever invented; ranks exist only when all 30 teams have data.
- **Strict import.** A game with rows from only one team, a date outside its season's window, a date after the retrieval time, or a bad CSV number rejects the whole file. Two players sharing a name in one game are skipped and listed, because a prop is matched by game, name and market.
- **Build-time guards.** The output path is checked before anything is written; two competing imports (JSON and CSV) are refused; a position file must declare the season in its filename.
- **Review.** An independent code review of the first version found one high and several medium issues (fabricated ranks for a season with no positions, season/date cross-checks, one-team games, same-name collisions, lenient CSV parsing, `__proto__`, slate duplicates, late output-path validation); all were fixed and have tests.

## Is another one-credit odds request worth it?

**No, not now.** A one-credit capture returns lines for one event, but a line cannot appear beside a projection until a statistics source is licensed, and showing raw lines is itself unresolved. It would add a line-only entry that the board withholds by default. It would become useful only after decision 1 or 2, to test the line join on a real game.

## Compact table, optional columns and last-five form on `/nba/props`

Presentation and one private-artifact addition. `projection.ts`, the board builders, the rights gates and the minutes arithmetic are untouched; no provider, request, subscription, job or other sport was added.

**Default columns** (player, then, in this order): *MPG* (current season), *PPG/RPG/APG* for the selected market, *PTS/AST/REB per minute*, *L5* (last-five average of the market stat), *Opp allows* (blended allowed per game to the player's estimated primary position, with its rank), *Matchup* (Favorable ranks 1-10, Neutral 11-20, Tough 21-30, from the same blended rank), *JKB proj*. The player cell carries team, opponent and the estimated position, and an arrow that expands the row.

**Optional columns** (Columns menu, desktop and tablet): *Sample*, *L10*, *last season's per-game*, *2025 DvP*, *2026 DvP*, *GP* (games sampled), *Line*, *O / U* prices, *JKB - line* (model edge), *JKB min*, *Your min* (inline editor), *Adj proj*, *Adj - line*, *Season-rate est*, *JKB PTS/REB/AST*, *Source*. Season-dependent ones are unavailable on a board without season statistics (any public board). The choice is kept in the browser's `localStorage` under `jkb-nba-props-columns-v1` as a list of column ids and nothing else; player names, statistics, projections, lines and minutes overrides are never stored (tests check this), and a blocked or corrupt store falls back to the defaults.

**Layout.** The default set fits 768px and wider without a sideways scroll (tested at 768, 1280 and 1440). Below 768px the table keeps *L5*, *Matchup* and *JKB proj* beside the frozen player cell, and the expanded row shows every other figure plus the manual-minutes field and its results. The minutes override is reached from that row (or from the *Your min* column); it is keyed by player and game as before, so it follows the player across markets. Default sort is the JKB projection (descending); hiding the column being sorted by falls back to it. Search, team, position and has-line/projection filters and all sorting are unchanged.

**Colors reinforce the number.** Favorable: green; Tough: red; Neutral: gray; JKB projection: navy; small player samples (fewer than 15 current-season games, or fewer games than the L5/L10 window): a small amber dot; missing position, DvP or statistic: gray N/A with the reason on hover. When every team's current-season DvP sample is under five games, one amber note says *Opp allows* and *Matchup* lean mostly on last season, instead of a dot on every row.

**DvP wording.** *Opp allows* is estimated primary-position DvP: each player counts toward one estimated position, not the minutes played there, and position coverage is incomplete. The page prints the per-season share of opponent minutes that could be attributed (about 70% in the real 2026-10-23 run).

**Last-five (and last-ten) form: a new private-artifact field.** `SeasonStatsView` gained optional `last5` and `last10` (`games, minutes, pts, reb, ast`), built in `v1/seasonStatsBuild.ts` from the same gated rows as the season totals: completed games dated strictly before the matchup (`selectPriorGames`), did-not-play, zero-minute and non-finite-minute games excluded, preseason excluded, newest first, **current season only** (a three-game player has a three-game window, marked with an amber dot, and never borrows last season). Nothing is inferred from season totals. The field lives only on the private preview board with the rest of `seasonStats`: the public builder still never sets it (the existing isolation tests cover it) and the board schema version is unchanged. A private board built before this change has no windows; the page then shows N/A with "rebuild the private preview board" rather than a number or a dash. To add them: `npx tsx scripts/nba-props-v1-build.ts --private-preview`, then pick the file again at `/nba/props?private=1`.


## Visual identity and last-ten performance (PR #444 follow-up)

Presentation and private-artifact additions only. No projection, DvP row, rank or model parameter changed, and no provider or Odds API request was made.

**Player column.** A 36px (phone) / 40px (tablet and up) team logo sits beside a bolder name; the cell has an opaque wash and a 5px left accent in the player's own team color (`teamBrand.ts`, all 30 teams, contrast-tested: accent >= 3:1 against the white row, dark ink on the wash >= 7:1, badge lettering >= 4.5:1). Team, opponent and the estimated position stay written out. Logos use ESPN's public image host with the same path convention the site already uses for MLB, NFL and college teams; **nothing is bundled or copied into the repository.** The page never depends on it: until an image loads, and permanently if it cannot, a badge in the team's colors stands in (`TeamLogo.tsx`). If the owner wants no third-party image request at all, bundle licensed logos and change `teamLogoUrl`.

**Hierarchy.** Dark header, visible row separators, a navy JKB projection pill, and a solid green (favorable) or red (tough) Matchup chip that always carries an arrow, the word and the rank (the word is screen-reader-only on a phone, where the arrow and rank remain). Amber is used only for small-sample warnings. The Opp L10 cell is deliberately not washed green or red: the tier is the season-long blended rank, which a ten-game figure can disagree with.

**Default columns** are now Player / MPG / season average (PPG, RPG or APG) / stat per minute / L10 / Opp L10 / Matchup / JKB projection. L5 and the season-long "Opp allows" moved to optional columns. On a phone the table keeps Player, L10, Opp L10, Matchup and JKB (headers read "L10", "Opp L10", "JKB"); everything else, and the minutes override, is in the expanded row.

**Player last ten (`SeasonStatsView.recentGames`).** The player's last ten completed games this season, oldest to newest, one result each (date, opponent, venue, minutes, PTS, REB, AST). Same gate as every other pregame figure: strictly before the upcoming game's Eastern date, current season only (playoffs and play-in count, preseason does not), did-not-play and zero-minute games dropped. Fewer than ten games is shown as the real N with a small-sample marker, never padded or filled from last season. The table's L10 figure is the average of these games; hover shows the ten results; the expanded row has the bar chart (hover, focus or tap a bar for date, opponent, exact result and minutes).

**Opponent last ten vs. position (`PropsBoardArtifact.opponentRecent`, keyed `gameKey|team|position`).** `v1/opponentRecentBuild.ts` aggregates the same player-game rows the DvP builder uses with the same classification (`dvpLabelFor` then `classifyRosterLabel`, regular season only). The unit is the **defense's game**: the window is the opponent's ten most recent distinct completed games before the upcoming game's date, and each game's figure is the sum over opposing players of position weight x stat (the DvP numerator for that game). It is never the last ten player-game records. A game with no attributed opposing minutes is `null` (a gap in the chart, left out of the average and counted in the note), not zero. The panel reports the games in the window against the opponent's completed games this season, the attributed share of opposing minutes (the rest are not counted, so each figure is a floor) and that positions are estimated primary positions. A defense game whose every opposing row has zero minutes is absent from the data, so the window reaches one game further back; this matches how the DvP builder treats zero-minute lines.

**Privacy.** Both new fields are hoopR/ESPN-derived: they exist only on the private preview board (gitignored `data/nba/`), `containsPrivateData` refuses a public board carrying either, and the public builder never receives them (tests check the serialized public artifact). A private board built before this change has neither field; the page then says to rebuild (`npx tsx scripts/nba-props-v1-build.ts --private-preview`, then pick the file again at `/nba/props?private=1`).

**Early-season note.** At the time of the real board's rebuild (2026-10-27) every team had played two or three games, so every window is a labelled small sample.
