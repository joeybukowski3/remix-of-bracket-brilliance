# NBA player props board: practical V1

Status: **the pipeline from import to `/nba/props` is built and tested; the public board stays empty because no player-statistics source has publishable rights.** Nothing real is populated. No Odds API request was made, no provider was called, no source license record was changed, no scheduled job was added, and the NFL quota protections are untouched.

## The blocker, precisely

A projection or DvP row may reach the public board only if the source of every input has effective rights for **both** `model-development` and `public-display` (`pipeline/boardBuild.ts`, unchanged). Today:

| Source | Why it cannot publish |
|---|---|
| `stats.nba.com`, `llimllib-nba-data` | NBA.com Terms section 9 and the 2026-10-12 owner decision: no development or evaluation use. |
| `espn`, `hoopr-espn` | Disney terms bar AI use, commercial use and automated extraction without written permission. hoopR's CC BY 4.0 license does not cover ESPN's rights. The licensing question (hoopR-nba-data issue 24, opened 2026-10-22) has **no reply** as of 2026-10-23. |
| `balldontlie` | Explicit rights (analytics, wagering products, ML training allowed; raw resale forbidden), but game player stats need the paid ALL-STAR tier, $9.99 per month. No subscription exists, and V1 forbids new subscriptions. |
| `api-sports-nba`, `thesportsdb`, `sportsdataio` | No publication license, or no per-game player stats. |

No source is `licensed`, so no real PTS/REB/AST can be shown. The V1 route below leaves every one of these gates closed.

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
