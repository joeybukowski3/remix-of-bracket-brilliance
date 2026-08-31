# NFL Matchup Analyzer Redesign — Implementation Specification

> **Status (2026-08-31 knowledge audit): HISTORICAL — implemented.** This is the
> original build specification. The redesign shipped across Phases 1–9 (the
> Phase 2–5 implementation notes appended below record what actually landed).
> It is **not** current authority for methodology or product behavior.
>
> - Distilled completed-plan record: [plans/completed/nfl-matchup-analyzer-redesign.md](plans/completed/nfl-matchup-analyzer-redesign.md)
> - Current product behavior (routes, tabs, artifacts, degradation): [features/nfl-matchup-analyzer.md](features/nfl-matchup-analyzer.md)
> - Current team-strength methodology: [models/nfl-power-rating.md](models/nfl-power-rating.md)
> - Current margin / projected-spread methodology: [models/nfl-projected-spread.md](models/nfl-projected-spread.md)
> - Source registry: [DATA_SOURCES.md](DATA_SOURCES.md)

## Repository / branch
- Repository: `joeybukowski3/remix-of-bracket-brilliance`
- Branch: `feat/nfl-matchup-analyzer-redesign`
- Route: `/nfl/matchups/:gameSlug`
- Existing page: `src/pages/NFLMatchupDetail.tsx`

## Objective
Replace the current single Team Comparison layout with a dense, responsive, multi-section NFL matchup analyzer based on the structure in `NFL new.xlsx`, while preserving the existing Joe Knows Ball power model, `Advantages`, and `Angles/Things to Watch` functionality.

The first implementation is a comparison product only. Do not create a projected spread, winner, win probability, or weighted matchup score yet. The page should be structured so those calculated metrics can be added later under `Model Analysis`.

## Non-negotiable rules
1. Do not modify the Joe Knows Ball power-rating formulas or existing guide/model calculations.
2. Preserve the existing Advantages functionality.
3. Preserve the existing Angles functionality, but label the user-facing section `Things to Watch`.
4. Do not invent missing statistics.
5. Do not create a synthetic offense-vs-defense score in this phase. Show straight-up offense/defense comparisons only.
6. `Game Trends` and `Model Analysis` are structural placeholders in this phase and remain empty except for restrained unavailable/coming-soon copy.
7. No special-teams injury exposure metrics.
8. Rank-normalize visual coloring across all comparable metrics.
9. Keep the Joe Knows Ball power rating prominent in the overview.
10. The mobile experience must use collapsible sections and a persistent/easy-to-reach `Jump to` control.

---

# 1. Global sample controls

Add controls near the top of the matchup analyzer.

## Data Window
- `Season`
- `Last 5`

## Historical Blend
- `Include 2025 Last 8: ON/OFF`
- Default: ON

### Blend behavior
When historical blend is ON, use a rolling eight-game sample in which each completed 2026 game replaces one late-2025 game.

Examples:
- Before 2026 Week 1: last 8 games of 2025
- After 1 completed 2026 game: last 7 of 2025 + first 1 of 2026
- After 2 completed 2026 games: last 6 of 2025 + first 2 of 2026
- After 4 completed 2026 games: last 4 of 2025 + first 4 of 2026
- After 8 completed 2026 games: 8 current-season games; 2025 contributes zero
- Week 9+: 2026 only for the rolling-eight blend

When historical blend is OFF, only 2026 games may contribute.

### Last 5 behavior
`Last 5` means the team's five most recent completed games allowed by the historical-blend setting.
- Blend ON: the five most recent completed games may cross the 2025/2026 boundary early in the season.
- Blend OFF: only completed 2026 games are eligible, even if fewer than five exist.

The UI must make the active sample obvious and should display a small explanatory sample label where useful.

---

# 2. Matchup overview / hero

Keep the current away-vs-home identity but redesign it for higher information density.

Desktop structure:
- Away team block
- Center game-information block
- Home team block

Show, when available:
- team logo
- team name
- overall record
- away record / home record
- Joe Knows Ball overall power rating
- power rank
- offense rating/rank
- defense rating/rank
- kickoff date/time
- venue
- current spread
- total
- rest advantage
- strength of schedule played
- previous result
- next game

Do not fabricate spread/total if not available. Existing `SpreadPlaceholder` behavior may be reused until sportsbook ingestion exists.

> **Resolved.** Phase 5 added the published nflverse market artifact, so the
> "until ingestion exists" condition no longer applies. Both the hero and the
> matchup-list card now read that artifact through the shared
> `formatMarketFavoriteSpread` helper, and `SpreadPlaceholder` — which could
> only ever render N/A — has been removed. A game the source has not priced
> still shows N/A; nothing is fabricated.

Joe Knows Ball proprietary power information should visually stand out from public-data context.

---

# 3. Advantages

Preserve existing logic and component behavior initially.

Location:
- near the top of the analyzer
- visible before the long statistical sections

Future logic can derive more detailed public-stat matchup advantages, but this phase must not break or replace existing deterministic logic.

---

# 4. Things to Watch

Preserve existing `MatchupAngles` behavior and source logic initially, but change the visible section title from `Angles to watch` to `Things to Watch`.

Keep it near Advantages.

---

# 5. Offense Comparison

Create three compact subgroups.

## Overall Offense
- Total EPA / Play
- Success Rate
- Yards Per Play
- 1st Down per Play
- 3rd Down Conversion
- Points per Game
- Turnovers / Game
- Average Time of Possession

## Passing
- EPA / Pass
- Pass Success Rate
- Passing Play Percentage
- Passing Attempts per Game
- Passing Yards per Attempt
- Passing Yards per Game
- Pass Block Win Rate
- Sacks Allowed per Game

## Rushing
- EPA / Rush
- Rush Success Rate
- Rushing Play Percentage
- Rushing Attempts per Game
- Rushing Yards per Attempt
- Rushing Yards per Game
- Run Block Win Rate

Desktop rows should read conceptually:
`Away value + rank | Metric | Home value + rank`

Mobile rows should remain comparison-oriented and avoid horizontal overflow.

---

# 6. Defense Comparison

Mirror the Offense Comparison component structure.

## Overall Defense
- Total EPA / Play Allowed
- Defensive Success Rate
- Yards Per Play Allowed
- Opponent 1st Down per Play
- Opponent 3rd Down Conversion
- Points per Game Allowed
- Takeaways / Game

## Pass Defense
- EPA / Pass Allowed
- Pass Success Rate Allowed
- Opponent Average Passer Rating
- Opponent Passing Yards per Attempt
- Opponent Passing Yards per Game
- Pass Rush Win Rate
- Sacks per Game

## Run Defense
- EPA / Rush Allowed
- Rush Success Rate Allowed
- Opponent Yards per Rush Attempt
- Opponent Rushing Attempts per Game
- Opponent Rushing Yards per Game
- Run Stop Win Rate

Important: the spreadsheet row labeled `Run Block Win Rate` in the defense section is interpreted as **Run Stop Win Rate**.

---

# 7. Offense vs Defense Matchups

This section is direct comparison only. Do not calculate an aggregate matchup score.

Build two possession views:

## Away offense vs Home defense
### Overall
- EPA / Play vs EPA / Play Allowed
- Success Rate vs Defensive Success Rate
- Yards / Play vs Yards / Play Allowed
- 1st Down rate vs Opponent 1st Down rate
- 3rd Down conversion vs Opponent 3rd Down conversion

### Passing
- EPA / Pass vs EPA / Pass Allowed
- Pass Success Rate vs Pass Success Rate Allowed
- Passing Yards / Attempt vs Opponent Passing Yards / Attempt
- Pass Block Win Rate vs Pass Rush Win Rate
- Sacks Allowed vs Sacks Generated

### Rushing
- EPA / Rush vs EPA / Rush Allowed
- Rush Success Rate vs Rush Success Rate Allowed
- Rush Yards / Attempt vs Opponent Rush Yards / Attempt
- Run Block Win Rate vs Run Stop Win Rate

## Home offense vs Away defense
Mirror the same structure.

No synthetic `+18 matchup advantage`, projected points, or other derived score yet.

---

# 8. Trenches

Create a compact visual section emphasizing four line-of-scrimmage battles:

When away has the ball:
- Away Pass Block Win Rate vs Home Pass Rush Win Rate
- Away Run Block Win Rate vs Home Run Stop Win Rate

When home has the ball:
- Home Pass Block Win Rate vs Away Pass Rush Win Rate
- Home Run Block Win Rate vs Away Run Stop Win Rate

Use compact visual comparison bars or another restrained visual aid. It must remain readable without relying on color alone.

---

# 9. Spread / Market Profile

This phase is descriptive only.

Show:
- Team Win/Loss Record
- ATS Record
- Point Differential
- ATS Differential
- ATS Differential Home/Away
- Over/Under Record

If the current market spread/total are available, show them for context.

Do not produce a model pick or projected spread yet.

---

# 10. Injury Impact

Display meaningful offensive and defensive injuries only. Exclude special-teams-only players.

## Status treatment
- OUT: unavailable exposure
- DOUBTFUL: unavailable exposure
- QUESTIONABLE: separate exposure bucket
- IR/PUP: include only when the player is relevant to the current depth-chart context and has meaningful recent NFL playing time

## Player rows
Show:
- player
- position
- designation/status
- last-game snap percentage
- season snap percentage

## Summary
Keep separate offense and defense exposure summaries for:
- unavailable (OUT + DOUBTFUL)
- questionable

Use language such as `Snap Exposure`; do not label summed percentages as total snaps.

Do not position-weight injury exposure in this phase.

---

# 11. Game Trends

Build the section and include it in navigation, but leave the analytical content empty for now.

Acceptable placeholder:
`Trend analysis coming soon.`

Do not fabricate trends.

---

# 12. Model Analysis

Build the section and include it in navigation, but leave calculated metrics empty for now.

Acceptable placeholder:
`Joe Knows Ball matchup model coming soon.`

Future scope includes:
- projected spread
- current spread comparison
- model edge
- picked winner
- possible component scores / win probability

Do not implement those calculations in this phase.

---

# 13. Rank-normalized visual system

All comparable team statistics should be visually normalized to league rank.

Recommended eight rank tiers:
- 1–4: Elite
- 5–8: Excellent
- 9–12: Good
- 13–16: Above Average
- 17–20: Below Average
- 21–24: Weak
- 25–28: Poor
- 29–32: Very Poor

Use restrained backgrounds/borders plus a stronger rank badge. Do not turn every cell into a saturated heatmap.

The comparison data model must explicitly define metric direction rather than having UI code infer it.

Suggested metadata:
- `higher-is-better`
- `lower-is-better`
- `context-only`

For any metric that is already expressed as league rank, lower rank is better.

---

# 14. Responsive layout

## Desktop
Use available width efficiently. Target a dense but readable layout suitable for approximately 1400–1500px containers where the existing site shell allows it.

Suggested organization:
1. matchup overview
2. data controls
3. Advantages + Things to Watch
4. Offense + Defense comparison side by side where width permits
5. Offense vs Defense matchup section
6. Trenches + Spread/Market side by side where width permits
7. Injuries
8. Game Trends + Model Analysis placeholders

## Mobile / small screens
- vertically stacked sections
- major sections collapsible
- default to compact states where sensible
- no wide-table horizontal-scroll dependency for core information
- scale text down without making labels unreadable
- preserve obvious away/home alignment
- prioritize one-screen density where practical

## Jump To
Provide a visible `Jump to` control with anchors for:
- Overview
- Advantages
- Things to Watch
- Offense
- Defense
- Matchups
- Trenches
- Betting / Market
- Injuries
- Game Trends
- Model Analysis

On mobile, keep Jump To easy to reach (sticky is preferred if it does not interfere with the existing NFL shell/navigation).

---

# 15. Data-source plan

## TeamRankings
Primary conventional team-stat source for metrics such as:
- Yards / Play
- passing/rushing volume
- YPA
- yards/game
- third-down conversion
- first-down rates when available
- points/game
- turnovers
- time of possession
- opponent conventional stats
- ATS records / ATS differential
- over/under records

## RBSDM
Primary advanced efficiency source for:
- EPA / Play
- EPA / Pass
- EPA / Rush
- Success Rate
- defensive/opponent equivalents
- game-level data required for rolling samples

## ESPN Analytics / NFL Next Gen Stats-derived win rates
Primary line-of-scrimmage source for:
- Pass Block Win Rate
- Run Block Win Rate
- Pass Rush Win Rate
- Run Stop Win Rate

Do not substitute a different metric and label it as an ESPN win rate. If an equivalent independent source is not available, keep ESPN as the canonical win-rate source and use other pressure/run metrics only as validation/fallback context.

## Injury designations
Preferred hierarchy:
1. official NFL/team injury report
2. ESPN structured injury data
3. fallback source only when required

## Snap counts / snap percentages
Prefer a reliable game-level source that supports player matching. Candidate sources to validate before implementation:
- official NFL gamebooks
- Footballguys weekly snap data
- Pro Football Reference
- FantasyPros

Store raw snap counts when possible and calculate percentage internally from player snaps / team offensive-or-defensive snaps.

---

# 16. Data architecture

Do not scrape external sites directly from React rendering components.

Use a normalized pipeline:

`external sources -> collectors/importers -> normalized team-game metrics -> sample-window aggregation -> matchup view model -> React UI`

The public UI and future spread model should consume the same canonical normalized metrics.

Suggested concepts:
- metric key
- team
- season
- week/game
- raw value
- league rank
- direction
- source
- source timestamp
- sample window
- availability / freshness state

Keep public-data metrics separate from Joe Knows Ball proprietary power-rating fields, while allowing a single matchup view model to expose both.

---

# 17. Implementation phases

## Phase 1 — responsive UI architecture
- Build the new page structure from typed placeholder/normalized data.
- Preserve existing power model, Advantages, and Things to Watch.
- Add sample controls and Jump To navigation.
- Add responsive/collapsible section shells.
- Build reusable comparison row/table components and rank-tier styles.
- Game Trends and Model Analysis remain placeholders.

## Phase 2 — conventional stats pipeline
- TeamRankings ingestion/normalization.
- Current-season and game-level conventional stats.
- Season / Last 5 selection.

## Phase 3 — advanced efficiency pipeline
- RBSDM game-level EPA/success-rate data.
- rolling 2025-last-8 -> 2026 blend logic.
- verify sample membership explicitly.

## Phase 4 — trench metrics
- ESPN win-rate ingestion/normalization.
- PBWR/RBWR/PRWR/RSWR presentation.

## Phase 5 — injury engine
- injury designations
- last-game snap percentage
- season snap percentage
- unavailable/questionable exposure summaries

## Phase 6 — validation
Manually validate multiple matchups against source data, including:
- Week 1 / preseason baseline
- early-season blended samples
- Week 5-ish Last 5 behavior
- Week 8 transition
- Week 9+ no historical blend contribution
- bye-week/recent-game handling
- injury players with partial playing time

## Phase 7 — future weighted model
Only after all inputs are validated:
- assign metric weights
- calculate projected spread
- compare projected spread to sportsbook spread
- list model pick / winner

---

# 18. Testing expectations

Add unit tests for pure calculations and sample-selection logic.

At minimum cover:
- rank-tier mapping 1 through 32
- metric direction metadata
- rolling-eight blend membership
- historical-blend OFF behavior
- Last 5 cross-season behavior when ON
- Last 5 current-season-only behavior when OFF
- missing values
- defensive lower-is-better conventional metrics
- injury status bucket rules
- special-teams-only exclusion

Add focused component/UI tests where the repository test setup supports them.

Run the existing TypeScript/test/build gates used by the repository before opening a PR.

---

# 19. Current implementation note

The existing route currently resolves schedule games to `NflMatchup`, joins them with the normalized Joe Knows Ball guide model, builds the existing comparison rows, and derives deterministic Advantages and Angles. The redesign should extend this architecture rather than replacing the existing model layer.

The sportsbook spread field is currently structural and may remain unavailable until a later ingestion phase. Do not infer a spread from the Joe Knows Ball power ratings.

---

# 20. Phase 2 implementation note (conventional team stats)

This section records what Phase 2 actually shipped. It does not amend the
product requirements above.

## 20.1 Source change: TeamRankings → nflverse

Section 15 named TeamRankings as the primary conventional-stat source. Phase 2
does **not** use it. Two independent blockers:

1. **Automated retrieval is actively blocked.** Every `/nfl/stat/<metric>` page —
   the only pages carrying per-team values and ranks — returns `HTTP 202` with
   the header `x-amzn-waf-action: challenge` and a zero-byte body. The response
   is an AWS WAF JavaScript challenge (`awswaf.com/.../challenge.js` plus a
   `gokuProps` token). `robots.txt` is permissive (`Allow: /`, `Crawl-delay: 10`),
   so this is a technical control, not a policy question. Clearing it requires
   executing challenge JS in a browser to harvest an `aws-waf-token` cookie.
   That was rejected: it is browser automation as production ingestion, and it
   circumvents a deployed access control. The `/nfl/team-stats/` index is
   reachable but contains zero `<table>` elements — it is a link directory only.
2. **Insufficient granularity.** TeamRankings exposes season-to-date, "Last 3"
   and home/away splits. It has no game-level rows and no cross-season window,
   so the rolling 2025-last-8 to 2026 blend cannot be built from it at all.
   Approximating the blend from weighted season averages is explicitly forbidden.

nflverse `stats_team_week` was approved instead. It is game-level, already
cached in this repository, and already the source behind the v0.2 power model.

## 20.2 Metrics implemented (22)

Offense — overall: Yards / Play, Points / Game, Turnovers / Game.
Offense — passing: Pass Play %, Pass Attempts / Game, Passing Yards / Attempt,
Passing Yards / Game, Sacks Allowed / Game.
Offense — rushing: Rush Play %, Rush Attempts / Game, Rush Yards / Attempt,
Rush Yards / Game.
Defense — overall: Yards / Play Allowed, Points Allowed / Game, Takeaways / Game.
Defense — pass: Opponent Passer Rating, Opponent Passing Yards / Attempt,
Opponent Passing Yards / Game, Sacks / Game.
Defense — run: Opponent Yards / Rush Attempt, Opponent Rush Attempts / Game,
Opponent Rushing Yards / Game.

## 20.3 Metrics still unavailable

EPA (all variants) and success rate — deferred to the RBSDM/play-by-play phase.

First downs per play and opponent first downs — the source carries rushing and
passing first downs but **no penalty first downs**, so the total would not
reconcile; deferred rather than shipped subtly wrong.

Third-down conversion and time of possession — **no such columns exist** in
`stats_team_week`; these require play-by-play or another source.

PBWR / RBWR / PRWR / RSWR — ESPN phase. The Trenches card stays fully
unavailable; sacks are deliberately **not** substituted for win rates.

ATS, ATS differential, home/away ATS, over/under — nflverse carries no betting
columns and this pipeline reads none by design.

Injuries and snap share — later phase. Game Trends and Model Analysis remain
intentionally empty.

## 20.4 Artifact, generator, provenance

Artifact: `public/data/nfl/matchup-metrics.json` (~165 KB, fetched at runtime,
not bundled). All four control states are precomputed, so switching Season /
Last 5 / blend is a pure client-side lookup with no re-aggregation.

Command: `npm run nfl:matchup-metrics` (`--dry-run`, `--season=`, `--stats-dir=`,
`--data-dir=`, `--out=` supported).

Inputs: `data/nfl/nflverse/stats-team-week/stats_team_week_<season>.csv`,
`public/data/nfl/<season>/{games,results}.json`, `public/data/nfl/teams.json`.

Provenance stored: source label, per-season source file paths and row counts,
`generatedAt`, seasons used, current/prior season, metric keys, and — per team
per window — `gamesIncluded`, the **exact `gameIds`**, seasons represented and
the `through` game (season/week/date).

Failure behaviour: parsing and validation complete before anything is written;
the artifact is written to a temp file and renamed into place, so a failed run
can never leave a partial or empty file over known-good data. Any unknown team
code, duplicate stats row, incomplete prior season, or failed opponent join
throws and exits non-zero.

## 20.5 Aggregation rules

Ratios are recomputed from summed numerators and denominators over the selected
games — never as a mean of per-game rates.

    offensive plays = pass attempts + sacks taken + carries
    offensive yards = passing yards + rushing yards
    pass plays      = pass attempts + sacks taken
    Yards / Play    = offensive yards / offensive plays
    Pass Play %     = pass plays / offensive plays
    Yards / Attempt = passing yards / attempts

Passing yards are **gross** of sack yardage (nflverse keeps sack losses in a
separate, negative `sack_yards_lost` column). Sack cost surfaces through Sacks
Allowed / Game. This matches the existing v0.2 pipeline, so the analyzer and the
power model never disagree about the same quantity; it reads slightly higher
than sites publishing net passing yards.

Defensive values come from the **opponent's row in the same games**, joined on
`game_id`. Sacks / Game is read from the opponent's sacks-taken column (the same
event from the other side) and is asserted in tests to equal the team's own
`def_sacks`. Points come from `results.json`.

Opponent Passer Rating uses the standard NFL formula over aggregate opponent
completions / attempts / yards / TDs / INTs, each component clamped to
[0, 2.375]. Weekly ratings are never averaged.

## 20.6 Sample windows

Selection is over **completed regular-season games**, ordered by kickoff date,
never by week number — so byes, flexed games and postponements are handled
naturally. A game counts only when the schedule row and the results row both
mark it final. Postseason is excluded.

    season + blend ON   rolling 8: each completed current game displaces one
                        late prior-season game (0 to 8 prior, 4 to 4+4,
                        8+ to current only)
    season + blend OFF  every completed current-season game, uncapped
    last5  + blend ON   five most recent completed games, may cross the boundary
    last5  + blend OFF  up to five completed current-season games

The generator's composition is asserted against the UI-side
`resolveSampleComposition()` for every game count 0-12 across all four states, so
the two can never drift.

## 20.7 Preseason behaviour (current)

`stats_team_week_2026.csv` does not exist yet and there are zero completed 2026
games. That is expected, not an error:

    blend ON  + Season   -> last 8 completed 2025 games   (populated)
    blend ON  + Last 5   -> last 5 completed 2025 games   (populated)
    blend OFF + Season   -> 0 games, all metrics N/A
    blend OFF + Last 5   -> 0 games, all metrics N/A

Blend-OFF states are **never** backfilled with 2025 values. The sample label
reads "No completed 2026 games yet". Once the 2026 source file appears, the same
code begins blending automatically under the rules above.

## 20.8 Ranking

Ranks are computed **per window**, over the teams that have a value for that
metric in that same window — static season ranks are never reused for a rolling
window. Direction comes from metric metadata, never from UI code.

Tie handling is **competition ranking** (1, 2, 2, 4), computed on unrounded
values so display rounding can never change an order. Teams without a value are
excluded from ranking rather than sorted last.

Play-mix and volume metrics (Pass Play %, Rush Play %, Pass Attempts / Game,
Rush Attempts / Game, Opponent Rush Attempts / Game) are `context-only`: they
still show a rank, but render with neutral styling and no quality tier, so
leading the league in pass attempts is never coloured as "Elite".

## 20.9 Unchanged by Phase 2

`deriveAdvantages` and `deriveAngles` are untouched and do not consume the new
metrics. The hero's Joe Knows Ball preseason ratings are a separate proprietary
baseline and deliberately do not respond to the sample controls. No projected
spread, win probability, model edge or picked winner exists anywhere.

---

# 21. Phase 3A implementation note (RBSDM success rate)

Records what Phase 3A shipped. Does not amend the product requirements above.

## 21.1 Source and API contract

Success rate comes from RBSDM (Ben Baldwin, https://rbsdm.com/stats), which is
built on nflfastR. RBSDM's published percentages are consumed verbatim — success
is never recomputed at the play level anywhere in this repository.

The site is a React SPA backed by a JSON API:

    POST https://rbsdm.com/api/team-tiers
    Content-Type: application/json

`GET` with query parameters returns **405 Method Not Allowed** — there are no
stable URL parameters, only this POST contract. A single `team-tiers` call
returns all 32 teams with offence and defence together.

Request body (regular season only):

    {
      "season_min": 2025, "season_max": 2025,
      "week_min": 10, "week_max": 18,
      "weeks_post_start": "None", "weeks_post_end": "None",
      "downs": [1,2,3,4], "quarters": [1,2,3,4,5],
      "wp_filter": 0, "exclude_turnovers": false
    }

Six fields are consumed, and nothing else:

| Analyzer metric | RBSDM field |
|---|---|
| Success Rate | `off_suc` |
| Pass Success Rate | `off_pass_suc` |
| Rush Success Rate | `off_rush_suc` |
| Success Rate Allowed | `def_suc` |
| Pass Success Rate Allowed | `def_pass_suc` |
| Rush Success Rate Allowed | `def_rush_suc` |

Values are decimal fractions (`0.505` = 50.5%). EPA and wEPA fields are present
in the response but deliberately **not** ingested.

## 21.2 Why periods are never blended

RBSDM publishes the finished success-rate percentage but **not** the
eligible-play denominator. Success rate is a ratio, so two season ranges cannot
be combined without weights, and nflfastR's success denominator (which excludes
kneels, spikes and other non-EPA plays) is not reproducible from the nflverse
team-week counts used in Phase 2. Any weighted merge would therefore be a
reconstruction, not RBSDM's published value.

Rather than approximate, success rate uses a **separate-period display policy**
and shows the relevant periods side by side. It deliberately does **not** follow
the Phase 2 Season / Last 5 / historical-blend controls, which remain unchanged.

## 21.3 Display policy and transition

Driven by each team's completed 2026 regular-season game count — never week
numbers, so a bye cannot trigger an early transition.

| State | Condition | Periods shown |
|---|---|---|
| A | both teams 0 completed 2026 games | 2025 Last 8 only |
| B | any 2026 game completed, either team < 6 | 2025 Last 8 + 2026 Season |
| C | both teams >= 6 completed 2026 games | 2026 Season + 2026 Last 5 (2025 hidden) |

The whole matchup transitions together: if one team has 6 and the other 5, both
stay in State B, because a comparison where one side showed Last 5 and the other
Last 8 would not be comparable. In State B a team with no 2026 game shows N/A in
the 2026 line — 2025 is never substituted into the 2026 column.

2025 values remain in the artifact after the transition for provenance; they are
simply no longer rendered.

## 21.4 Week-range grouping

RBSDM accepts one uniform week range per request, but byes shift each team's
window. A team is absent from weeks it did not play, so the range
[firstSelectedWeek, lastSelectedWeek] returns exactly that team's N games.

Teams are therefore grouped by the range reproducing their own final N completed
games, one request is issued per distinct range, and each team's value is read
**only** from the request whose range matches its own window. Ranges are derived
from the repository's completed-game records, never hardcoded.

For 2025 last-8 this produced two ranges covering all 32 teams: weeks 10-18
(10 teams with a late bye) and weeks 11-18 (22 teams). The implementation
supports any number of distinct ranges.

2026 season-to-date uses a single request, week 1 through the last week with any
completed game. 2026 last-5 is grouped the same way as last-8.

Teams without enough completed games are recorded as skipped, never shortened
into a smaller window.

## 21.5 Ranking

Ranks are computed **independently within each period** over all teams holding a
value for that same period definition; periods are never pooled. Direction comes
from metric metadata (offence higher-is-better, defence-allowed
lower-is-better). Ties use competition ranking (1, 2, 2, 4) on the unrounded
source fraction, so display rounding can never change an order. Null values are
excluded rather than ranked last.

For 2025 Last 8 and 2026 Last 5 every team's rank is based on its own most
recent eight/five completed games. For 2026 season-to-date, teams may legitimately
have unequal game counts; `gamesIncluded` is stored per team.

## 21.6 Artifact, command, provenance

Artifact: `public/data/nfl/matchup-success-rates.json`, generated independently
of the Phase 2 conventional artifact and loaded as optional enrichment. An RBSDM
outage cannot block `npm run nfl:matchup-metrics`, and a missing or malformed
success-rate artifact leaves only the six success-rate rows at N/A.

Command: `npm run nfl:success-rates` (`--dry-run`, `--season=`, `--offline=<dir>`).

Provenance stored: source, attribution, endpoint, method, current/prior season,
source field map, metric directions, completed game counts per season per team,
and a full request log — the exact POST payload, week range, teams selected and
teams returned for every request. Per team per period it stores `gamesIncluded`,
the exact selected `gameIds`, the unrounded source fraction (`raw`), the display
percentage (`pct`) and the rank.

## 21.7 Failure and cache safety

The API is undocumented and unversioned, so the generator is defensive: fetch,
validate every response, normalize, rank, then atomically replace the artifact
via temp-file + rename only after all checks pass. Validation rejects HTML error
pages, empty bodies, non-object responses, unknown or duplicate team codes,
missing required teams, non-finite values and fractions outside 0-1. Nothing is
dropped silently.

Request behaviour: POST with explicit `Content-Type`, a descriptive User-Agent,
~4s spacing between requests, a 60s timeout, and a bounded retry (3 attempts,
linear backoff) for transient 5xx/429 only — a 4xx fails immediately. No
concurrency, no browser automation, no cookie harvesting, no client-side calls.

On failure the command exits non-zero, reports the failing period and week
range, and leaves the previous known-good artifact untouched.

## 21.8 Attribution

Source metadata carries `attribution: "Ben Baldwin / RBSDM"`. The matchup page
shows a compact, non-dominant note: "Success rate data: RBSDM."

## 21.9 Known limitations

- No play-count/denominator field is exposed, which is the reason periods are
  displayed separately rather than blended.
- The API is undocumented, unversioned and currently served by a Vite dev server,
  so field names or payload shape could change without notice. The artifact is
  schema-validated on generation and soft-fails at runtime.
- `max_season` was 2025 at implementation time; 2026 periods populate
  automatically once RBSDM publishes 2026 and the repository has completed 2026
  games.

---

# 22. Phase 3B implementation note (ESPN trench win rates)

Records what Phase 3B shipped. Does not amend the product requirements above.

## 22.1 Source and API contract

PBWR / RBWR / PRWR / RSWR are ESPN Analytics metrics built on NFL Next Gen Stats
player-tracking data. ESPN's published team values and official ranks are used
verbatim. Nothing is approximated, reconstructed, or derived from sacks,
pressure rate, player leaderboards, PFF grades or play-by-play.

    GET https://now.core.api.espn.com/v1/sports/news/{articleId}?enable=inlines

`enable=inlines` is **required**: without it the response returns unresolved
`<inlineN-wide>` placeholders instead of the table modules (6 KB vs 38 KB).

The endpoint is public and unauthenticated — verified working with no
User-Agent, no cookies, no referer, and no `Set-Cookie` in the response.

**No WAF circumvention.** The rendered `www.espn.com` article path, and the
`secure.espn.com` / `cdn.espn.com` XHR routes, return HTTP 202 with
`x-amzn-waf-action: challenge`. Those paths are never requested. The data is
taken from a separate, genuinely public API host.

## 22.2 Module location and fields

The team table is found by **normalized headline**, never by array position:
`"nfl team win rate rankings"`. Header order is normalized rather than assumed,
but every expected column must appear exactly once.

    header: ["team","PRWR","RSWR","PBWR","RBWR"]
    cell:   "31% (27)"   ->  valuePct 31, espnRank 27

| Analyzer metric | ESPN column |
|---|---|
| Pass Block Win Rate | PBWR |
| Run Block Win Rate | RBWR |
| Pass Rush Win Rate | PRWR |
| Run Stop Win Rate | RSWR |

## 22.3 Article discovery

The article ID changes every season, so IDs are discovered rather than
hardcoded as the permanent strategy:

1. explicit `--article=<season>:<id>` override (recovery / manual use),
2. otherwise the public ESPN search API, filtered to headlines matching
   `^<season> NFL ... win rate rankings` — noisy unrelated results are ignored,
   and two different IDs claiming the same season is **ambiguous and fatal**,
3. otherwise a known historical ID as a last-resort fallback
   (2025 `46138675`, 2024 `41040723`), also used as deterministic fixtures.

The resolved ID, discovery method and headline are recorded in provenance.

## 22.4 Ranking policy

**ESPN's official rank is authoritative and is the only rank stored or shown.**

ESPN publishes whole-number percentages but ranks on finer internal precision.
In the 2025 table RSWR has only 7 distinct published values across 32 teams
(largest tie group 11) and RBWR has 8 — yet ESPN's ranks are a complete distinct
1-32. A locally computed competition rank would therefore produce large ties and
disagree with ESPN, so **no local rank is computed or presented as
verification**. The generator asserts the distinct-1-32 invariant per metric and
fails if it breaks.

Rank-tier colouring is driven by ESPN's rank. Higher is better for all four
metrics.

## 22.5 Granularity limits

The source is **cumulative season-to-date only**. It has no weekly split, no
arbitrary window, no cross-season blend and no team-level numerators or
denominators, so the official team value cannot be recomputed.

Consequently these metrics **never** produce a Last 5 or Last 8 value and are
deliberately **not** wired to the Phase 2 Season/Last 5 rolling controls.
Percentages keep whole-number precision; no decimals are invented.

## 22.6 Display policy

Driven by completed 2026 regular-season game counts for the two teams, taken
from the repository's own results — never week numbers.

| State | Condition | Periods shown |
|---|---|---|
| A | both teams 0 completed 2026 games | 2025 Season |
| B | any 2026 game completed, either team < 6 | 2025 Season + 2026 Through Week X |
| C | both teams >= 6 completed 2026 games | 2026 Through Week X only |

The matchup transitions as one unit: 6 vs 5 keeps both teams in State B, so a
bye can never move one side ahead. Seasons are shown separately and never
blended, and trench pairings always compare the same period on both sides — a
2025 blocking value is never shown against a 2026 rush value.

If the 2026 article or value is not yet available, the 2026 line reads N/A and
the 2025 line is retained; no other metric is substituted.

## 22.7 Through-week label

ESPN's freshness marker is parsed from the article prose, e.g.
`"Last updated: Through all Week 18 games, Jan. 6, 10:30 a.m. ET"` -> week 18.

Stored: `throughWeek`, `sourceUpdatedText`, `sourceLastModified`, `retrievedAt`,
plus the article ID and module id/headline. When the week cannot be parsed
safely the label falls back to `"<season> Season to Date"` and the full source
text is retained — the week is never guessed.

## 22.8 Artifact, command, failure safety

Artifact: `public/data/nfl/matchup-trench-metrics.json` (~19 KB, fetched at
runtime, not bundled). Command: `npm run nfl:trench-metrics`
(`--dry-run`, `--seasons=`, `--article=<season>:<id>`, `--offline=<dir>`).

Independent of the Phase 2 conventional generator and the Phase 3A RBSDM
generator: an ESPN outage cannot block either, and a missing trench artifact
leaves the Trenches section visible with N/A values while every other metric
keeps working.

Validation rejects HTML/WAF responses, missing headlines or inlines, a missing
or renamed or duplicated team module, unexpected/missing/duplicated headers,
row counts other than 32, unknown or duplicate team slugs, malformed cells,
percentages outside 0-100, ranks outside 1-32, and non-distinct official ranks.
Nothing is dropped silently.

Requests: ordinary GET, descriptive User-Agent, 30s timeout, ~2.5s spacing, and
a bounded retry (3 attempts) for transient 5xx/429 only — a 4xx fails
immediately. No cookies, no browser automation, no concurrency.

Fetch -> validate -> normalize -> validate artifact -> temp file -> atomic
rename. On failure the command exits non-zero, reports the article ID, season
and endpoint, and leaves the previous known-good artifact untouched.

## 22.9 Team mapping

The ESPN team slug is parsed from each row's anchor
(`/nfl/team/_/name/buf/...`), never from the visible team name. ESPN's slugs are
the same codes `teams.json` already uses as `abbr` — including `wsh`, `lar`,
`lac` — so the repository's canonical identity is reused. Exactly 32 recognized
teams, no duplicates, no unknown slugs, every canonical team present once.

## 22.10 Attribution and known risks

Attribution: "Trench data: ESPN Analytics / NFL Next Gen Stats", shown once at
section level.

Risks: the API is undocumented and unversioned; `enable=inlines` is an
undocumented parameter; the article ID changes each season and depends on search
discovery; the module is located by a headline string ESPN could rename. All of
these fail loudly with the previous artifact preserved rather than degrading
silently.

Note: the Phase 1 placeholder bars were removed from the Trenches card. They
existed to make the unavailable state visually deliberate; with real values and
official ranks the rank chip carries the signal, and per-period bars would have
tripled the card height.

# 23. Phase 4 implementation note (injuries and snap participation)

## 23.1 Sources and API contract

Three nflverse releases plus one league-wide crosswalk, all public static
release assets fetched over ordinary unauthenticated HTTPS. No WAF, auth,
cookies, CAPTCHA or paywall is involved or circumvented, and no browser
automation is used.

| Source | Asset | Supplies |
|---|---|---|
| injuries | `.../releases/download/injuries/injuries_{season}.csv` | game status, practice status, injury text, `gsis_id`, team, position |
| weekly_rosters | `.../releases/download/weekly_rosters/roster_weekly_{season}.csv` | roster/reserve status, depth-chart position, secondary ID crosswalk |
| snap_counts | `.../releases/download/snap_counts/snap_counts_{season}.csv` | `pfr_player_id`, offense/defense snaps and published percentages, `game_id` |
| players | `.../releases/download/players/players.csv` | authoritative `gsis_id` to `pfr_id` crosswalk |

Seasons available: injuries 2009-2025, snap counts 2012-2025, weekly rosters and
players through 2026. The usable overlapping window is 2012-2025.

## 23.2 Exact ID join

```
injuries.gsis_id
  -> weekly_rosters.gsis_id -> weekly_rosters.pfr_id   (roster first)
  -> players.gsis_id        -> players.pfr_id          (authoritative fallback)
  -> snap_counts.pfr_player_id
```

Roster alone is not sufficient: `pfr_id` is blank on 11,189 of 44,697 2025
regular-season roster rows, including established starters, which resolves only
~81% of injury records. Adding `players.csv` lifts coverage to **99.74%**
(15 of 5,783 rows unresolved, all fringe players with no Pro-Football-Reference
page).

**Player-name matching is never used in production, in any direction, as any
fallback.** Names are carried for display only. An unresolved `gsis_id` keeps
its injury record in full and reports `null` snap shares. The generator refuses
to publish below 95% join coverage.

## 23.3 Status separation

Three independent fields, never merged into one designation:

| Field | Values | Source |
|---|---|---|
| `gameStatus` | `OUT`, `DOUBTFUL`, `QUESTIONABLE`, `null` | injuries `report_status` |
| `practiceStatus` | `DID_NOT_PARTICIPATE`, `LIMITED`, `FULL`, `null` | injuries `practice_status` |
| `reserveStatus` | `RESERVE`, `null` | weekly_rosters `status` |

Blank is a real state and is never forced into a designation. Unexpected
non-blank values fail schema validation rather than mapping silently. Raw source
strings are retained in per-entry provenance.

A player with only a practice note and no game or reserve status does not
appear: "Not injury related - resting player" against a blank `report_status` is
a rest day, not an injury, and is never rendered as one. Practice status appears
only as compact secondary context (DNP / Limited / Full) and never replaces the
game designation.

## 23.4 Reserve is deliberately generic

`RES/*` sub-codes (R01, R04, R05, R06, R48) demonstrably separate IR from
PUP/NFI in the data, but nflverse publishes no authoritative dictionary for
them. **IR, PUP, NFI and designated-for-return are therefore NOT distinguished**
- everything collapses to a single generic `RESERVE`. Do not add them until that
mapping is confirmed. The sub-code is kept in provenance for future work.

`ACT`, `INA` and `DEV` are never labelled Reserve, and practice squad is never
presented as an injury.

## 23.5 Snap percentages

**Last game** uses the source-published `offense_pct` / `defense_pct` verbatim
for the team's most recent completed regular-season game before the analyzed
week. Preseason and postseason are excluded. Offensive and defensive shares are
never combined, and special teams is never included.

Null vs zero is load-bearing:

- present in the snap table with 0 unit snaps -> **0%** (he dressed and took no
  snaps on that side of the ball, which is real information)
- absent from the snap table -> **null / N/A** (he did not dress; 0% would be a
  fabrication)

**Season** sums numerators and denominators exactly and divides once. Weekly
percentages are never averaged - an equal-weight mean over-weights low-snap
games and is a different number. Games included are the regular-season games the
player dressed for; games he missed are excluded from both numerator and
denominator, so the figure reads "when available, how much of the unit's work
did he take". Byes fall out naturally. `gamesIncluded` and the raw
snaps/team-snaps totals are in provenance.

## 23.6 Team snap denominator reconstruction

snap_counts publishes each player's raw snaps and his percentage, but never the
team play total behind the percentage. It is recovered **exactly, not
estimated**: every player row in a team-game is a simultaneous constraint
`round(snaps / N, 2) == published_pct`, and a team-game supplies roughly 25-45
of them. The system is heavily over-determined, so the satisfying integer is
unique. The 2025 regular season resolves **544/544 offensive and 544/544
defensive team-games uniquely, with zero ambiguity**.

Rounding tolerance is **0.0051**, not 0.005. Percentages are published to two
decimals, so the true share sits within +/-0.005; the extra 0.0001 covers ties
exactly on that boundary (74/80 = 0.925 is equidistant and can publish either
way depending on rounding mode and float representation). The tolerance cannot
create ambiguity: moving N by one shifts a mid-range ratio by about 1/N
(0.012-0.02), an order of magnitude outside it. At a strict 0.005 the same data
leaves 46 team-games unsolved, all on that boundary.

`max(player snaps)` is **not** used and is not an acceptable fallback: it is
only a lower bound, correct when some player took every snap and silently short
otherwise. It was wrong in 3 of 544 2025 team-games - BAL wk4 (54 vs 55), MIA
wk6 (57 vs 59), SF wk11 (53 vs 55). All three are regression tests.

An ambiguous or unsolved denominator is a hard validation failure that aborts
generation and preserves the previous artifact. Nothing is estimated.

## 23.7 Positions, specialists and units

The injury feed's own `position` decides the unit: it is the label the official
report carries and is 100% populated. Offense covers QB/RB/FB/WR/TE/T/OT/G/OG/C/OL;
defense covers DE/DT/DL/NT/LB/OLB/ILB/MLB/CB/S/FS/SS/DB. The roster's
`depth_chart_position` (OLB vs LB) is finer and is preserved for presentation
but never decides the unit.

**EDGE is never synthesized.** The injury feed does not distinguish edge
rushers; `EDGE` is accepted only if a source emits it directly.

K, P and LS are excluded entirely at parse time. **Special-teams participation
is never used** - not for the displayed percentage, not for relevance, not for
ordering. `st_snaps` is retained in the source only for provenance.

## 23.8 Relevance policy

Any player with an `OUT`, `DOUBTFUL` or `QUESTIONABLE` designation is shown: the
team itself judged him worth reporting. `RESERVE` players require evidence of
real offensive/defensive participation - season share, last-game share, or a
depth-chart position when no snap data exists at all (a starter on reserve since
Week 1 has no snaps to measure and would otherwise vanish).

The threshold is the single constant `RESERVE_RELEVANCE_MIN_SNAP_PCT` in
`scripts/lib/nfl-injury-join.mjs`, set to **25%**. Chosen against five full 2025
weeks (4, 8, 12, 15, 18), not one team or one week:

| Threshold | Wk12 shown | Wk18 shown | Effect on reserve candidates |
|---|---|---|---|
| 20% | 138 | 195 | admits TE3/CB4 types (Jack Stoll 21.2%, Alex Austin 20.0%) |
| **25%** | **138** | **193** | **keeps every genuine starter, drops the sub-23% tail** |
| 30% | 138 | 193 | starts dropping rotational contributors (Otito Ogbonnia 27.6%) |
| 35% | 138 | 192 | drops real starters (Jaylon Johnson 33.9%, Robbie Ouzts 34.5%) |

Volume is stable and modest: 128-195 players league-wide, 4.1-6.2 per team, max
13 - and the overwhelming majority carry an active designation, so the threshold
only ever gates the small reserve tail (2-12 candidates per week). 35% was
rejected for excluding genuine starters; 20% for admitting fringe depth.

No injury impact score, points-lost estimate, spread adjustment or
win-probability effect is produced anywhere.

## 23.9 Sorting

Within a team: `OUT`, `DOUBTFUL`, `QUESTIONABLE`, then `RESERVE`; within a
status group by season unit exposure, then last-game exposure, then a stable
name order. Special-teams exposure is never an input.

## 23.10 Source cache

Committed under `data/nfl/nflverse/{injuries,weekly-rosters,snap-counts,players}/`,
following the `stats-team-week` conventions with a shared helper
(`scripts/lib/nfl-source-cache.mjs`) rather than duplicated validation logic.
Each manifest entry records `season`, `filename`, `sourceUrl`, `sourceType`,
`retrievedDateUtc`, `byteSize`, `sha256`, `rowCount` and `headerColumns`.

Two cache shapes exist. `verbatim` (injuries, snap counts) commits the exact
upstream bytes. `projection` (weekly rosters, players) commits a documented
column and row subset, because `roster_weekly_2025.csv` is 15.4 MB upstream and
`players.csv` is 7.0 MB while the join needs 12 of 36 and 7 of 39 columns
respectively. A projection additionally records the upstream `byteSize`,
`sha256`, `rowCount` and `headerColumns` plus `projectedColumns` and
`projectionFilter`, so the reduction stays auditable and re-derivable from the
recorded release. Committed total is ~7.3 MB.

`scripts/refresh-nfl-injury-source-cache.mjs` is the only script that touches
the network. The generator reads the cache and never fetches, so generation is
reproducible and offline.

## 23.11 Artifact, commands, failure safety

Artifact: `public/data/nfl/matchup-injuries.json` (~250 KB), keyed by canonical
site abbreviation like the other artifacts. React loads it as a static file;
nflverse is never called from the browser, and the artifact content is not
bundled into JS.

```
npm run nfl:injury-cache        # network: refresh the committed cache
npm run nfl:matchup-injuries    # offline: build the artifact from the cache
```

Pipeline: validate cache (sha256, byte size, row count, header) -> parse ->
exact-ID join -> denominator resolution -> aggregate -> validate artifact ->
temp file -> atomic rename. Generation aborts and leaves the previous artifact
byte-identical on cache corruption, empty source data, an unknown status value,
any unresolved denominator, join coverage below 95%, or zero entries. Verified
against all three failure classes; no temp file is left behind.

The injury pipeline is fully independent of the Phase 2 conventional generator,
the Phase 3A RBSDM generator and the Phase 3B ESPN generator. A failure in any
one cannot block the others, and a missing injury artifact leaves only the
Injuries section in an unavailable state.

## 23.12 Freshness limitations

nflverse rebuilds these assets on a daily schedule at roughly 07:15 UTC
(~3:15 AM ET). Consequences, stated plainly:

- Wednesday/Thursday/Friday practice reports: available the next morning
- Final Friday game-status report: available Saturday morning
- **Sunday-morning downgrades and the 90-minute pre-kickoff inactive list are
  NOT available before kickoff**

Game-day inactives are recoverable after the fact via weekly_rosters
`status == "INA"`, but that lands after the game, not before it. A daily refresh
after the upstream build is sufficient; intra-day polling would buy nothing
because the upstream file does not change intra-day.

ESPN's public injuries endpoint is fresher and carries IR, but every one of its
800 entries lacks an `athlete.id` - joining it would require exactly the name
matching this design prohibits. It is therefore not used.

## 23.13 2026 source-unavailable behaviour

`injuries_2026.csv` and `snap_counts_2026.csv` do not exist yet; nflverse does
not create them until the regular season begins. The refresh script reports a
404 as "not yet published" - an expected state, distinct from a source failure -
and never removes or rewrites an existing cache.

The generator falls back to the most recent complete season, marks the artifact
`isHistorical: true`, and records per-season availability. The consumer refuses
to present a historical season as the current week: `createInjuryResolver`
returns nothing and the section states plainly that current-season data has not
been published yet. **No 2026 rows are fabricated.** When nflverse publishes the
2026 files, the same pipeline ingests them with no code change.

## 23.14 Deterministic historical support

The committed cache with sha256 provenance makes 2012-2025 fully replayable
offline, so historical matchups and future injury logic can be tested
deterministically. One caveat: stored history is week-resolution final status,
not intra-week snapshots, so Wednesday-to-Friday practice progression cannot be
backtested.

## 23.15 Attribution

UI: "Injury and snap data: nflverse; snap counts via Pro-Football-Reference",
shown once at page level. Fuller provenance - source URLs, digests, retrieval
dates, join coverage, unresolved players, denominator resolution counts - lives
in the artifact's `provenance` block.

# 24. Phase 5 implementation note (spread and market profile)

## 24.1 Source

nflverse nfldata `games.csv`:
`https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv`

**Already an in-repo dependency.** The schedules/results pipeline
(`scripts/lib/nfl-schedules-results-core.mjs`) has fetched this exact file since
PR-2 and simply projected the market columns away. Phase 5 reads them instead of
adding a provider: the market generator imports `NFL_GAMES_SOURCE_URL`,
`parseCsv` and `buildNflverseTeamMap` from that module, so the URL, the CSV
parser and the team mapping are stated in exactly one place and no second copy
of the upstream file is cached.

Public, unauthenticated, no API key, no cookies, no WAF. **The Odds API is not
used** — the free-first NFL mandate in `docs/nfl-data-inventory.md` forbids paid
Odds API usage, and this design stays inside it. ESPN was evaluated in the audit
and is documented there as a cross-check only; it is not a production
dependency.

Coverage: spreads, totals and moneylines on 100% of 2015-2025 regular-season
games; 51 of 272 2026 games priced so far. `game_id` joins the repository's own
schedule at 100% for 2022-2026, and every team code resolves through
`teams.json` `nflverseAbbr`.

## 24.2 Source wording

The source publishes **one market line per game** and does not disclose which
sportsbooks compose it. Therefore:

- No book is ever named. The UI says **"Market Line · Source: nflverse"**.
- It is **not** described as a multi-book consensus.
- Completed-game values are the **settled historical market line**, never an
  "independently verified sportsbook closing line".
- Attribution: **"Market data: nflverse / nfldata"**.

The pre-existing `mkt.atsDifferential` help text said "closing spread". That
overstated what the source guarantees and now reads "historical market spread";
a test asserts no market metric help text contains "closing spread".

## 24.3 Spread sign convention

`spread_line` is home-relative and positive when the home team is favoured
(nfldata DATASETS.md: *"A positive number means the home team was favored by
that many points. This lines up with the result column."*). Conventional display
notation inverts it:

```
homeTeamSpread = -spread_line
awayTeamSpread = +spread_line

spread_line = +3.5  ->  home -3.5, away +3.5
spread_line = -3.5  ->  home +3.5, away -3.5
spread_line =  0    ->  pick'em
```

This is the single most error-prone fact in the phase and is covered by
dedicated orientation tests in both directions plus a mirror-property test.

## 24.4 Current market

For the exact matchup: the two conventional spreads, the two moneylines and one
game total, in the real away/home orientation.

Every field is independent. A missing spread is **never** derived from the
moneyline and a missing moneyline is **never** derived from the spread; each
absent field renders N/A on its own. A scheduled game with no line yet is normal
and is not a generation failure — all its market fields are simply null.

Pick'em renders as `PK`, not `+0`.

## 24.5 Provenance and freshness

`games.csv` has **no per-row timestamp**, so a line-specific update time cannot
be known and is never fabricated. The artifact records:

- source URL and label
- retrieval timestamp
- upstream commit SHA and commit time (best-effort via the GitHub commits API;
  a lookup failure is non-fatal and records null)
- `perRowTimestampAvailable: false`
- the raw `spread_line` alongside the converted values, so orientation stays
  auditable

Upstream rebuilds roughly every 10-30 minutes. Recommended refresh is hourly on
game days and daily otherwise; the artifact is static and regenerated by the
pipeline, not fetched live by the browser.

Known limitations: **no opening line**, **no closing line as a distinct labelled
field**, **no line-movement history**, **no per-book breakdown**. None of these
exist in the source and none are synthesized.

## 24.6 Historical grading

Completed **regular-season** games only (`game_type == "REG"`); preseason and
postseason are excluded from every profile.

ATS, from the team's own spread:

```
homeAtsMargin = (home_score - away_score) - spread_line
awayAtsMargin = (away_score - home_score) + spread_line

margin > 0 -> ATS win
margin < 0 -> ATS loss
margin = 0 -> push
```

Over/under:

```
actualTotal = home_score + away_score
actualTotal > total_line -> Over
actualTotal < total_line -> Under
actualTotal = total_line -> Push
```

**Pushes are preserved** as `W-L-P` and `O-U-P` and are never folded into wins
or losses. They are real: 2023 had 14 spread pushes and 2 total pushes; 2025 had
one spread push (`2025_12_PIT_CHI`, spread 3, result 3) and zero total pushes
because every 2025 total was a half-number. A whole-number line can push; a
half-point line cannot.

**ATS differential** is the arithmetic mean of game-level ATS margins. Positive
means the team beat its market line. It is a description of past results, not a
projection and not a recommendation.

## 24.7 Splits

**Home / away** use `location`, which is authoritative. The stadium name is
never used to infer neutrality: for 2025 international games nfldata reports the
*designated home team's* stadium, so inferring from it would be wrong.

Neutral-site games are excluded from both the home and away splits — a team
playing in London or a relocated venue had no home field — but **still count** in
the overall ATS record, the over/under record and every window record. Nothing
is silently dropped from the headline numbers. The visible effect: Kansas City's
2025 away ATS reads 1-6-0 rather than 1-7-0, because their Week 1 game was in
São Paulo, while their overall record stays 6-11-0 across all 17 games.

**Favourite / underdog** use the spread orientation exactly. Pick'em games
(`spread_line == 0`) are excluded from both splits and still count in the
overall record, so a pick'em is never forced into one category. The artifact
asserts `homeGames + awayGames + neutralGames == games` and
`favoriteGames + underdogGames + pickemGames == games`.

## 24.8 Windows and display transition

Last 5 and Last 8 are the five and eight most recent **completed** regular-season
games. Byes produce no game and are skipped naturally; postseason never counts;
neutral games do count. Ordering is by kickoff date, then week, then game id, so
a flexed game cannot silently reorder the log. "Last 5 calendar weeks" is never
used.

Display transition, matching Phase 3A and 3B:

```
both teams 0 completed 2026 games   -> 2025 Season + 2025 Last 8
any completed, either team < 6      -> 2025 Last 8 + 2026 Season
both teams >= 6 completed           -> 2026 Season + 2026 Last 5
```

The matchup transitions as one unit. 6 games against 5 stays in the developing
state, so a bye can never leave the two sides on different windows. Counts are
completed games, never calendar week numbers.

**Seasons are never blended.** Game-level historical lines are exact, so a
combined 2025+2026 ATS record would be computable — it is deliberately not
produced, because one number spanning two seasons hides which season it came
from. Periods are always shown side by side.

## 24.9 Metrics and ranking

Populated: W/L record, point differential, ATS record, ATS differential, ATS
differential home/away split, home ATS record, away ATS record, over/under
record. The last two were added to `MARKET_PROFILE_METRICS`; everything else
already existed in the scaffold.

Ranks are computed **only** for ATS differential and point differential, where
higher-is-better is meaningful. Raw ATS records, over/under records, home/away
records, spreads, moneylines and totals are context-only and draw no tier
colour — leading the league in overs is a play-style fact, not a good
performance, and must not be coloured as one.

## 24.10 Artifact, command, failure safety

Artifact: `public/data/nfl/matchup-market.json` (~128 KB), keyed by canonical
site abbreviation like every other artifact. React loads it as a static file;
nflverse is never called from the browser and the artifact content is not
bundled into JS.

```
npm run nfl:matchup-market
```

Pipeline: fetch/validated source -> parse -> normalize -> grade completed games
-> validate current markets -> validate artifact -> temp file -> atomic rename.

Generation aborts, leaving the previous artifact byte-identical, on: zero parsed
rows, no games for the target seasons, no current-season games, or fewer than 32
teams in the completed prior-season profile. Unexpected non-numeric market
values, unknown teams, unknown `game_type` and unknown `location` all fail
validation rather than being coerced to zero. **A future game with no line is
explicitly not a failure.**

The market pipeline is independent of the Phase 2 conventional generator and the
Phase 3A, 3B and 4 generators. A failure in any one cannot block the others, and
a missing market artifact leaves only the market rows at N/A.

## 24.11 Product boundary

Descriptive only. No projected spread, fair spread, model-vs-market edge, win
probability, picked winner, betting recommendation, confidence score, expected
value or Kelly sizing is calculated here or anywhere downstream, and the artifact
is asserted to contain no such field.

The Current Market and Team Market Profile blocks are visually and structurally
separate: ATS history did not produce the current line, and the current line is
never used to grade history.

# 25. Phase 6 implementation note (EPA efficiency)

## 25.1 Source

nflverse play-by-play:
`https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_{season}.csv.gz`

Public, unauthenticated, no API key, no WAF. 18.2 MB gzipped for 2025 (48,771
rows x 372 columns), downloading in about 1.3 s. Seasons 1999-2025 are
published; 2026 returns 404 until that regular season begins.

EPA is nflfastR's play-level `epa` column, consumed as authoritative. Expected
points are never recomputed, re-modelled or approximated anywhere in this
repository.

RBSDM is **not** a production EPA source. It publishes EPA on the same endpoint
the success-rate pipeline already calls, but its API takes a *week range* rather
than a game count — New England's weeks 11-18 contains seven games, not eight,
because of their Week 14 bye — and it exposes no denominators. Neither Last 5
nor Last 8 can be expressed exactly from it. It is used for validation only.

## 25.2 Eligible-play filter

```
(pass == 1 OR rush == 1)
  AND epa is present
  AND posteam is present
  AND two_point_attempt != 1
```

nflfastR's own `pass` / `rush` indicators are authoritative. **`play_type` is
never reinterpreted** — doing so is the single easiest way to get this wrong.
Measured on the 2025 season:

| Class | Plays | Indicators | Result |
|---|---|---|---|
| Sacks | 1,352 | all `pass=1` | counted as **PASS** |
| QB scrambles | 1,221 | all `pass=1` (`play_type` is `"run"`) | counted as **PASS** |
| Kneels | 453 | `pass=0, rush=0` | excluded by the indicators alone |
| Spikes | 82 | `pass=0, rush=0` | excluded by the indicators alone |
| Special teams | 7,424 | `pass=0, rush=0` | excluded by the indicators alone |
| Aborted rushes | 90 | `rush=1` | counted as **RUSH** |
| Penalty plays | 1,999 of 3,559 carry an indicator | | **INCLUDED** |
| Two-point tries | 130 | | **explicitly excluded** |

Two of these are counter-intuitive and both were settled empirically:

- **Penalties are included.** Accepted-penalty plays that were designed passes
  or runs keep their nflfastR indicator. Excluding them moved the league figures
  470x *further* from RBSDM's published values.
- **Two-point tries are the one explicit exclusion.** Adding that single filter
  moved max divergence from RBSDM from 0.0106 to 0.00019 — a 55x improvement —
  which is how the exclusion was identified in the first place.

Kneels and spikes need no special-casing: both indicators are already 0.

2025 yields 34,301 eligible regular-season plays across 544 team-games.

## 25.3 Aggregation

Per `(game_id, posteam)`: `off_epa` and `off_plays` over eligible plays,
`pass_epa` / `pass_plays` where `pass == 1`, `rush_epa` / `rush_plays` where
`rush == 1`. `off_plays == pass_plays + rush_plays` is asserted on every row.

Window values sum numerators and denominators across the selected games and
divide **once**:

```
EPA / Play      = sum(off_epa)  / sum(off_plays)
Pass EPA / Play = sum(pass_epa) / sum(pass_plays)
Rush EPA / Play = sum(rush_epa) / sum(rush_plays)
```

Per-game rates are never averaged. This is not pedantry: Kansas City's 2025
Last 5 comes out at -0.269 exactly and -0.259 as an equal-weight mean of game
rates, a difference that is plainly visible at the three decimals this metric
displays.

Regular season only. Postseason never enters a window; preseason does not exist
in this source.

## 25.4 Defensive metrics

Defence is the opponents' offensive production in the **same game ids**, joined
exactly:

```
Team A defensive EPA allowed = Team B offensive EPA in that game_id
```

Coverage is 544/544 team-games. Opponents are never inferred from team names or
schedule order, and a missing opponent row raises rather than producing partial
defensive numbers. The join is independently validated: opponent-derived
`def_epa` reproduces RBSDM's published `def_epa` to the same precision as
offence, confirming both sides use the same definition.

## 25.5 Sample-window integration

EPA does **not** get its own period system. The generator imports
`selectWindowGames`, `buildCompletedGameIndex`, `computeRanks` and `windowId`
from `scripts/lib/nfl-matchup-metrics.mjs` — the very module the Phase 2
conventional generator uses — so the four control states, chronological
ordering and ranking are shared code rather than a parallel copy.

The consequence is asserted by test: for every team and every control state, the
EPA artifact's `gameIds`, `gamesIncluded` and `seasons` are byte-identical to
the conventional artifact's. Season / Last 5 and the historical blend move EPA
exactly as they move yards per play.

Preseason behaviour therefore matches Phase 2 automatically:

- blend ON + Season -> 2025's final eight completed regular-season games
- blend ON + Last 5 -> 2025's final five
- blend OFF -> no completed 2026 games, so EPA is N/A

As 2026 games complete, each one displaces a late-2025 game in the rolling
eight; from the eighth completed 2026 game the sample is entirely 2026. Byes are
skipped because windows count games, never weeks.

## 25.6 Cache architecture

Two stages, mirroring Phase 4:

1. `npm run nfl:epa-cache` (network) streams the gzipped play-by-play through
   Node's built-in `zlib`, reads only the ten required columns out of 372,
   applies the filter, aggregates to team-game, validates, and writes the
   compact cache atomically.
2. `npm run nfl:matchup-epa` (offline) reads the byte-verified cache plus the
   repository's own schedule/results, builds the four windows, joins defence,
   ranks, and writes the artifact atomically.

**Raw play-by-play is never written to disk and never committed.**

| | |
|---|---|
| Upstream PBP (gzipped) | 18.2 MB |
| Compact cache `epa_team_game_2025.csv` | 51.4 KB (544 rows x 11 cols) |
| **Reduction** | **363x** |
| Client artifact `matchup-epa.json` | 53 KB |

Cache path: `data/nfl/nflverse/epa-team-game/`. The manifest records
schemaVersion, sourceUrl, season, retrievedDateUtc, upstream compressed byte
size, upstream source row count, eligible play count, compact row count and byte
size, sha256, required source columns, the filter string, attribution, and
`rawPlayByPlayCommitted: false`.

Team codes are resolved to the repository's canonical abbreviations during
aggregation. The compact cache is a derived aggregate rather than verbatim
upstream bytes, so it follows the repo-wide rule that generated NFL files
reference teams by canonical codes; `game_id` still ties every row back to the
source unambiguously.

## 25.7 Ranking and display

Competition ranking (1, 2, 2, 4) computed per metric per window on **unrounded**
values, so display rounding can never move a team. Offence higher-is-better,
defence lower-is-better. Null values are never ranked. Existing rank tiers and
colours apply unchanged.

Display is signed to three decimals — `+0.128`, `-0.043` — with zero rendered
unsigned as `0.000`, because `+0.000` reads as a rounded positive it may not be.

## 25.8 RBSDM cross-check

Independent validation against RBSDM's published 2025 season values, all 32
teams:

| Metric | Max abs diff | Bit-exact | Ranks 1-32 identical |
|---|---|---|---|
| EPA / Play | 0.00009611 | 26/32 | **yes** |
| Pass EPA / Play | 0.00019025 | 26/32 | **yes** |
| Rush EPA / Play | **0.00000000** | **32/32** | **yes** |
| EPA / Play Allowed | 0.00008143 | 27/32 | **yes** |
| Pass EPA Allowed | 0.00026652 | 27/32 | **yes** |
| Rush EPA Allowed | **0.00000000** | **32/32** | **yes** |

Rush EPA is bit-exact for every team on both sides. Six teams (MIN, IND, WAS,
PIT, BAL, CAR) carry a residual on *pass* EPA only, all <= 0.00027 — invisible at
three decimals and never large enough to move a rank. The cause was not isolated
beyond the two-point exclusion; it is most likely a handful of edge-case plays.
The approved filter was not bent to force bit-identical agreement.

## 25.9 Failure safety

Refresh: network -> decompress -> parse -> filter -> aggregate -> validate ->
temp file -> atomic rename. Generate: byte-verified cache -> window aggregation
-> opponent joins -> ranking -> artifact validation -> temp file -> atomic
rename.

Neither stage overwrites a known-good file on empty play-by-play, missing
required columns, a season mismatch, an unknown team code, duplicate team-game
rows, a game without exactly two reciprocal team rows, `pass + rush != off`,
non-finite EPA, a broken opponent join, or zero populated windows. If a selected
game has no EPA row, that team's window is omitted and recorded in provenance
rather than aggregated from a partial set.

A 404 for a season that has not started is reported as "not yet published" — an
expected state, distinct from a failure — and never removes or rewrites an
existing cache. When 2026 play-by-play appears, the same pipeline ingests it
with no architectural change.

Suggested future cadence (not automated in this phase): daily early morning ET,
plus Monday and Tuesday mornings during the season, following nflverse's own
build schedule (daily 09:00 UTC, Sunday 22:00 UTC after the early window,
Monday 00:05 UTC after the late window, and 05:30 UTC after SNF/MNF).

## 25.10 Existing power-rating EPA — deliberately unchanged

`scripts/lib/nfl-advanced-stats.mjs` derives EPA from `stats_team_week` for the
internal v0.2 power ratings. That definition differs materially from nflfastR
play-by-play EPA. Measured across all 544 2025 regular-season team-games:

- only **25** agreed exactly on total EPA
- pass EPA differed by a mean of -1.371 per team-game, rush EPA by +0.882
- pass play counts ran 4.16 short per game, rush counts 2.13 long
- **league EPA/play: +0.00747 (stats_team_week) vs +0.01496 (play-by-play)** —
  roughly a factor of two

The cause is classification: `stats_team_week` books QB scrambles as rushing
while nflfastR counts them as pass, and its play denominators
(`attempts + sacks_suffered`, `carries`) miss 1,102 plays, 3.20% of the true
base.

**Phase 6 does not change that pipeline, the power ratings, the model weights or
any historical model artifact.** The display pipeline is entirely separate.

> **Future consistency note.** The legacy/internal power-rating EPA pipeline uses
> `stats_team_week` semantics that differ from nflfastR play-by-play EPA.
> Reconciliation should happen only in a dedicated model recalibration phase,
> where the rating changes can be reviewed on their own terms — never silently
> during a display implementation.

## 25.11 Scope

Success Rate remains RBSDM-sourced and is untouched; the EPA resolver returns
null for every non-EPA key, so the success-rate, trench, injury and market
pipelines are unaffected. No EPA edge, matchup score, projected points,
projected spread, win probability, favourite or picked winner is produced. The
Offense vs Defense rows are direct descriptive comparisons only.

# 26. Phase 7B implementation note (EPA model migration + generated hero ratings)

## 26.1 What changed, and what deliberately did not

The active power model migrated its **EPA source only**. Everything else is
byte-for-byte identical:

| | Status |
|---|---|
| Weights 40/40/20 | **unchanged** |
| Point-differential component and its opponent adjustment | **unchanged** |
| One-pass opponent adjustment (`epa: opponent-mean one-pass`, `margin: game-level one-pass residual`) | **unchanged** — iterative adjustment deferred to the spread phase |
| Trajectory / recency (`lambda = 0`) | **unchanged** — recency stays off |
| Public scale (50 ± 15, pooled divisor 0.733, clamp [1, 99]) | **unchanged** |
| Home-field advantage | **still absent** — these remain neutral-field team-strength ratings |
| Market, Success Rate, trenches, injuries | **still excluded from the rating** |

Isolating the source change is what makes the before/after diff interpretable:
every rating movement below is attributable to the EPA definition alone.

## 26.2 Legacy vs migrated EPA

| | Legacy (retired from the model) | Migrated |
|---|---|---|
| Source | `stats_team_week` `passing_epa` + `rushing_epa` | nflverse play-by-play, nflfastR `epa` |
| Pass denominator | `attempts + sacks_suffered` | count of `pass == 1` |
| Rush denominator | `carries` | count of `rush == 1` |
| Scrambles | booked as **rushing** | counted as **passing** (nflfastR indicator) |
| Coverage | misses ~3.2% of eligible plays | full eligible set |
| League EPA/play (2025) | **+0.00747** | **+0.01496** |

Eligible plays are `(pass == 1 OR rush == 1) AND epa present AND posteam
present AND two_point_attempt != 1`, with nflfastR's own indicators
authoritative — the same definition the Phase 6 display pipeline uses, so the
model and the matchup page can no longer disagree about what EPA means.

Aggregation sums numerators and denominators across the window and divides
once; per-game rates are never averaged. Defence remains the opponents'
offensive production in the same `game_id`.

## 26.3 Implementation

`scripts/lib/nfl-epa-team-metrics.mjs` adapts the Phase 6 compact cache
(`data/nfl/nflverse/epa-team-game/`, now committed for 2022–2025) to the shape
the v0.3 pipeline already consumed, so the change inside
`nfl-v03-artifacts.mjs` is a provider swap rather than a rewrite. The
final-eight window still selects the same games through the same team-week
keys; only the EPA underneath differs.

`scripts/lib/nfl-advanced-stats.mjs` is **retained but no longer feeds the
active model**. It still backs the orphaned v0.2 `power-ratings.json` generator
and its own tests. It is legacy.

## 26.4 Before/after impact

Full 32-team tables per season live in
`docs/nfl-power-v0.3.1-epa-migration.md`. Summary:

| Preseason | From | Mean Δrating | Max Δrating | Spearman | Teams ≥3 places |
|---|---|---|---|---|---|
| 2023 | 2022 | 1.339 | 5.487 | 0.9824 | 3 |
| 2024 | 2023 | 1.382 | 4.150 | 0.9919 | 2 |
| 2025 | 2024 | 1.949 | 4.852 | 0.9879 | 1 |
| 2026 | 2025 | 1.302 | 5.038 | 0.9941 | 1 |

These match the Phase 7 audit forecast (~1.34 / ~1.38 / ~1.95 / ~1.30) to three
decimals. Notable: **DET overtakes BAL for the 2025 preseason #1**; LAR stays
#1 for 2026 but gains +5.04. Bottom five is unchanged in three of four seasons.

## 26.5 Model version

Bumped **`nfl-power-v0.3.0` → `nfl-power-v0.3.1`**. A patch bump is the right
size: the mathematics did not change, but the same team and season can now
publish a different rating, so the identifier must not be reused. The constant
is now declared once in `src/lib/nfl/v03Review.ts` as `NFL_V03_MODEL_VERSION`
and referenced by the artifact validator and the public board, rather than
being repeated as a literal in three places.

Artifact `_meta` now carries an `epaSource` block (source, definition
`matchup-epa-v1`, cache path, `migratedIn`), and the `source` label states the
play-by-play cache rather than the weekly cache.

**Movement fields are now version-aware.** `rankChange` and `ratingChange` are
computed only against a prior of the same model version, so all 32 teams read
as a first publication under v0.3.1. Reporting the migration delta as movement
would have implied teams improved or declined when only the definition changed.

## 26.6 Matchup hero

The hero previously read `src/data/nflPreseason2026.ts` — a hand-curated static
file whose ratings already disagreed with the generated model. It now reads the
active generated board through `createHeroModelRatingResolver`, the same
`buildPublicPowerBoard` output the `/nfl` landing page renders, so the two
surfaces cannot show contradictory ratings.

All three components migrate: overall, offense and defense. The artifact
publishes `publicRating`, `offenseRating` and `defenseRating` on the 1–99 scale
and `buildPublicPowerBoard` already derives `rank`, `offRank` and `defRank`, so
nothing is fabricated from the overall rating.

**Display semantics changed, and had to.** The retired static values were signed
percentages above average ("+7.69%"); a v0.3 rating is a 1–99 scale value
centred on 50. The hero now renders one decimal ("74.4") and never a percent
sign, because labelling the new number "%" would misstate it. The visual layout,
rank chips and tier colours are otherwise untouched. When the board is
unavailable the hero renders N/A rather than falling back to the retired static
system.

No projected spread, win probability, model edge or picked winner appears in the
hero; these remain neutral-field team-strength ratings.

## 26.7 Retained static preseason data

`src/data/nflPreseason2026.ts` is **not deleted**. It still supplies
`nflLogoUrl`, division tables, `record2025`, `winTotal`, schedule strength and
guide editorial content consumed by the guide pages and `guide2026.ts`. Only its
`ovrPct` / `offPct` / `defPct` values have stopped being the matchup hero's
authoritative team rating.

## 26.8 Boundaries preserved

The market forbidden-term guard in `nfl-v03-artifacts.mjs` is untouched and
still active. The rating uses football performance data only — no spread, odds,
moneyline, ATS, O/U, picks or model edge. Success Rate remains RBSDM
display-only, trench metrics remain display-only (no weekly walk-forward
history), and injury snap exposure remains display-only (no player-value
source). None of them entered the rating.

> **Still outstanding from the Phase 7 audit.** Iterative opponent adjustment,
> recency weighting, an early-season decaying prior, home-field advantage and a
> target variable all remain unimplemented by design. They belong to the
> projected-spread phase, where each can be calibrated and reviewed on its own
> terms.

# 27. Phase 9 — JKB projected spread (`nfl-spread-v0.1.0`)

Phase 9 replaces the Model Analysis placeholder with a real projected spread.
This is the first **predictive** model on the site; everything before it was
descriptive.

## 27.1 Two models, deliberately separate

| | `nfl-power-v0.3.1` | `nfl-spread-v0.1.0` |
|---|---|---|
| Job | Describe a season | Forecast a scoring margin |
| Weights | 40 / 40 / 20 | 45 / 35 / 20 |
| Scale | 1–99 rating | Points |
| Surface | Hero + `/nfl` board | Model Analysis section |

`nfl-power-v0.3.1` is **unchanged by this phase**. The 45/35 split exists only
because backtesting found offence modestly more predictive of future margin
than defence; the public rating stays balanced because it describes rather than
forecasts.

## 27.2 Features

Three, all from the Phase 6 nflfastR play-by-play EPA definition
(`matchup-epa-v1`) and the repository's own results:

- `offAdj` — opponent-adjusted offensive EPA per play
- `defAdj` — opponent-adjusted defensive EPA per play allowed
- `pdgAdj` — opponent-adjusted point differential per game

Opponent adjustment is the validated **one-pass** v0.3 method
(`offAdj = raw_off − (oppMeanDef − leagueDef)`). Phase 8 measured an iterative
solve at 0.005 MAE better with slightly worse winner accuracy and kept the
simpler method.

Composite strength is `0.45·z(offAdj) + 0.35·z(−defAdj) + 0.20·z(pdgAdj)` over
population z-scores (divisor N) across all 32 teams, unrounded and unclamped.
Defence is negated before weighting because a lower EPA allowed is better. A
zero-variance league is a hard failure, never a silent 0/0.

## 27.3 Sample

All completed regular-season games that had **finished** before the target
kickoff: `kickoff + 3.5h <= targetKickoff`. Week numbers are never used — a
Sunday 1pm result is not knowable to another Sunday 1pm game.

EPA aggregates weighted numerators over weighted denominators; rates are never
averaged. Point differential is a per-game observation, so it uses a weighted
mean over games with no play denominator.

**Recency weighting: none.** Every completed game carries equal weight. The
model therefore does **not** respond to the matchup page's Season / Last 5
control, which remains a display setting for the descriptive sections only.

## 27.4 Prior season

The full previous regular season, weighted `K / (K + nCurrent)` with `K = 2`.
So `nCurrent = 0 → 1`, `1 → 2/3`, `2 → 1/2`, `4 → 1/3`, `8 → 1/5`. The weight
never reaches zero.

Phase 8 originally chose `K = 4` on a dev set that was missing 2022 Week 1
entirely. With the 2021 EPA cache added, Phase 8B re-tested and `K = 2` wins on
all four seasons including both holdouts.

Entering 2026 there are no completed 2026 games, so every team sits on a full
2025 prior at weight 1. No 2026 statistics are fabricated.

## 27.5 Parameters

- **Home-field advantage: fixed 2.0 points**, exactly 0.0 at neutral sites, and
  **never fitted**. Phase 8B found that fixing it costs 0.0016 MAE pooled while
  being *better* on both held-out seasons — and it reduces the model to a single
  free parameter. A free-intercept parameterization was rejected as pathological:
  only 23 neutral games identify the intercept, which split it into −1.91 with a
  +4.47 home term.
- **Beta is the only fitted parameter**, by closed form with the known HFA
  removed from the target first: `β = Σ[d·(margin − HFA)] / Σ[d²]`. It is fitted
  on an expanding window of **complete prior seasons only**, so no result is ever
  in scope for the parameter that predicts it. Entering 2026, β ≈ 4.63 fitted on
  2021–2025 (1,359 games). The generator derives this deterministically and
  refuses to publish if it falls outside a 3.5–5.5 guard band.

## 27.6 Validated accuracy

Walk-forward, each season predicted with a beta fitted only on strictly earlier
seasons:

| Season | β | n | MAE | Winner |
|---|---|---|---|---|
| 2022 | 5.045 | 271 | 9.19 | 62.5% |
| 2023 | 4.189 | 272 | 10.36 | 61.0% |
| 2024 | 4.298 | 272 | 10.20 | 69.1% |
| 2025 | 4.553 | 272 | 10.31 | 62.7% |
| **Pooled** | — | 1,087 | **10.02** | **63.8%** |

Calibration slope 0.979, intercept 0.180 — well calibrated, close to unbiased.

`src/lib/nfl/spreadBacktest.test.ts` reproduces these through the same engine
the generator runs, so a silent change to the sample rule, weights, prior,
opponent adjustment or beta fit surfaces as a failing number.

## 27.7 The model does not beat the market

Measured on the 2025 holdout:

| | MAE | Winner |
|---|---|---|
| JKB | 10.31 | 62.7% |
| Market | 9.72 | 65.3% |

The ATS diagnostic sits near 48.7% against a ~52.4% break-even, with no
monotonic relationship between the size of the difference and the hit rate.

This finding drives the product framing directly. The UI labels the gap
**"Model vs Market"** — a description — and never "Model Edge". There is no best
bet, value bet, strong edge, confidence level, win probability, expected value
or stake size anywhere in the section, and `MatchupModelAnalysis.test.tsx`
asserts their absence.

## 27.8 Market independence

The market is not an input at any stage. `scripts/lib/nfl-spread-model.mjs` and
`scripts/lib/nfl-spread-dataset.mjs` contain no market identifier, and
`scripts/generate-nfl-matchup-projections.mjs` never opens the market artifact —
`spreadModel.test.ts` scans these sources and asserts this. The published
artifact records `model.marketInputUsed: false` and
`model.fittedParameters: ["beta"]`.

The market line is joined only in the consumer layer, in
`src/lib/nfl/projectionData.ts`, strictly after a projection already exists.
`compareToMarket` returns null without a projection, so the market can never
stand in for one.

`data/nfl/benchmark/market_lines_2025.csv` holds settled 2025 lines so the
benchmark test runs offline. It is read only by that test — never by the model
or the generator.

## 27.9 Artifact

`public/data/nfl/matchup-projections.json` (~348 KB raw, ~26 KB gzipped), one
record per 2026 regular-season game plus a `model` block recording every
configuration value above. Written via temp file and atomic rename.

Generation fails safely — leaving the previous known-good artifact untouched —
on a missing EPA cache, malformed rows, an opponent pair that disagrees between
the EPA and results sources, a thin league snapshot, a non-finite composite,
zero standard deviation, an invalid beta fit, a beta outside the guard band, or
a target game appearing inside its own feature sample.

`sampleGameIds` is deliberately **not** published: it is thousands of
identifiers the browser never reads. The leakage guard runs on the full list at
generation time, and `lastSampleGameId` still lets a reader confirm the sample
stops before kickoff.

Commands:

```
npm run nfl:matchup-projections     # regenerate the artifact
npm run nfl:spread-backtest         # walk-forward report
```

## 27.10 Data added

The EPA cache and schedules/results were extended back to 2020 and 2021, needed
for the expanding-window beta fit and for 2022 Week 1 to have a prior at all.
Both follow the established Phase 6 compact-cache pattern: raw play-by-play is
streamed and discarded, never written to disk and never committed
(`manifest.json` records `rawPlayByPlayCommitted: false`). 2020 and 2021 are
~48–51 KB each, a ~365x reduction from the 17–18 MB gzipped source.

`NFL_V03_SOURCE_SEASONS` and `NFL_V03_PERFORMANCE_SEASONS` remain explicit
lists, so `nfl-power-v0.3.1` does not pick up the new seasons.

## 27.11 UI

The Model Analysis section shows three headline figures — **JKB Projected
Spread**, **Market Spread**, **Model vs Market** — followed by the three terms
that actually produce the projection: Team Strength Difference, Home Field,
Projected Margin. Nothing else is claimed.

Validated at 375, 390, 430, 768, 1024, 1280, 1440 and 1720 px with no page-level
horizontal scroll and no console errors.

The projected spread is rendered from the artifact's parts rather than its
`display` string so its typographic minus matches the market line beside it.

Loading is independent of every other artifact: if the projection file is
missing or malformed, only this section reports itself unavailable and no figure
is estimated in its place.

## 27.12 Boundaries preserved

Unchanged by this phase: `nfl-power-v0.3.1` and its artifacts, Phase 2
conventional stats, Phase 3A success rates, Phase 3B trenches, Phase 4 injuries,
Phase 5 market profile, Phase 6 display EPA, Advantages, Things to Watch,
existing market grading and the ATS definitions. Game Trends remains a
placeholder.
