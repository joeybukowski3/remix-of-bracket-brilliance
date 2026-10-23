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

**Steps** (all local; the one download is gated and pinned):

```
python scripts/nba-hoopr-fetch.py --confirm-owner-decision            # 3 files, one pinned commit, sha256 manifest; needs pyarrow
npx tsx scripts/nba-hoopr-import.ts --wikidata=data/nba/wikidata-positions/snapshot.json [--overrides=data/nba/props-v1/position-overrides.json]
npx tsx scripts/nba-props-v1-build.ts --private-preview               # writes data/nba/props-v1/private-preview-board.json
npm run dev    # then open /nba/props?private=1 and choose that file (dev only; read in the browser, never uploaded or served)
```

- **Fetch:** `player_box_2026`, `player_box_2027` and `nba_schedule_2027` from `sportsdataverse/hoopR-nba-data`, 750 KB in total, at the commit recorded in `manifest.json`. No retry, size-capped, output confined to `data/nba/`.
- **Import:** excludes, and counts, did-not-play rows, rows with no or zero minutes, All-Star teams (STARS, STRIPES, WORLD), unknown season types and incomplete games. Identity is the ESPN athlete id as a string (the same id Wikidata property P3685 uses); names are display only and name changes or shared names are reported.
- **Positions.** No depth-chart source exists (ESPN's pages cannot be collected), so positions are estimated from Wikidata's CC0 career-level five-position labels joined by ESPN athlete id, narrowed by ESPN's coarse G/F/C listing when Wikidata lists several, with ESPN's own listing used directly when it names one position (a "C"). A Wikidata label that ESPN's listing contradicts is kept and flagged. A player ESPN lists only as "G" or "F" and Wikidata does not label stays **unclassified** (PG vs SG, SF vs PF would be a guess), is still projected, and shows "pos N/A" with no DvP context. Roles come from starts and minutes. Manual overrides need a reason and only apply to players that exist in the data. The same career-level label is applied to both seasons, and the file says so. Wikidata's snapshot comes from `scripts/nba-wikidata-position-probe.ts` on the `feat/nba-wikidata-position-audit` branch, which is not merged; any file in that snapshot format works.
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

**To close the position gap** (about 30% of minutes): add overrides for the highest-minute unclassified players (`position-map-report.json` lists them), or decide whether a documented rule may split ESPN's "G" and "F" (for example the repository's own equal split for generic labels).

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
