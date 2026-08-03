# NFL Matchup Analyzer Redesign — Implementation Specification

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
