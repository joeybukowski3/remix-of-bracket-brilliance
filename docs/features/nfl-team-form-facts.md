# NFL team form facts (AI Picks v2, WU1)

Deterministic, descriptive current-season football facts for each team in an upcoming matchup. It is the structured
ingredient layer for the future AI handicap. It is data only: no prompt, model call, schema, UI, verdict, probability,
market or scheduling behavior depends on it yet.

- Builder (pure): `scripts/lib/nfl-team-form-facts.ts` (`buildTeamFormFacts`, type `TeamFormFacts`)
- Loader (file reads only): `scripts/lib/nfl-team-form-facts-loader.ts` (`loadMatchupFormFacts`)
- Tests: `scripts/lib/nfl-team-form-facts.test.ts`

## Sources (no new cache, no generated artifact)

| Facts | Source |
| --- | --- |
| Schedule, kickoff, home/away, neutral site | `public/data/nfl/<season>/games.json` |
| Final scores, W/L/T | `public/data/nfl/<season>/results.json` |
| EPA, pass/rush EPA, success rates, explosive plays, sacks | `data/nfl/nflverse/performance-team-game/performance_team_game_<season>.csv` (unfiltered `all_*` columns) |
| Yards, plays, interceptions, lost fumbles | `data/nfl/nflverse/stats-team-week-current/stats_team_week_<season>.csv` (falls back to `stats-team-week/`) |

## Scopes and point-in-time rules

`seasonToDate`, `recentGame` and `recentWindow` (last `RECENT_WINDOW_GAMES` = 3 completed games; `recentWindow.games` is
the actual sample). A game counts only if it is a regular-season game, has a final result, kicked off strictly before the
matchup, and is not the matchup itself. Eligibility comes from schedule + results, never from which cache rows exist.
Prior games with no final result are listed in `incompletePriorGameIds`.

Each block (`points`, `efficiency`, `yardage`, `turnovers`) is `null` unless every game in the scope has its source rows.
Nothing is defaulted to zero. `defense` blocks are the opponents' offense in the same games (exact `game_id` join).

## Definitions

- **EPA/play**: sum of nflfastR `epa` / eligible plays, where eligible = (pass or rush) with EPA present, excluding two-point
  attempts. Sacks and scrambles are pass plays. `epaPerPass` divides by dropbacks (including sacks); `epaPerRush` by rush
  attempts. Season and window values sum then divide once; per-game rates are never averaged. Garbage-time-filtered columns are
  not used.
- **Success rate**: nflfastR traditional `success`, per unit (overall / pass / rush).
- **Explosive**: pass gain >= 15 yards, rush gain >= 10 yards (`nfl-performance-metrics-core.mjs`). Rates are per dropback / per rush.
- **Yards per play**: `(passing_yards + rushing_yards) / (attempts + carries + sacks_suffered)`. Gross yards (sack yards not
  subtracted); each sack is a play. Same convention as `matchup-metrics.json` `off.yardsPerPlay`. Its play count differs slightly
  from the EPA play count (official stats drop penalty-nullified plays that PBP EPA keeps), so both counts are reported.
- **Turnovers committed**: `passing_interceptions + sack_fumbles_lost + rushing_fumbles_lost + receiving_fumbles_lost`. All
  interceptions (including pick-sixes); only fumbles lost. Offensive giveaways only: special-teams (punt/kick return) fumbles and
  turnovers on downs are excluded. This is deliberately not the official `fumbles_lost_total`, which includes special teams
  (2026 Week 1: CAR and TEN each have one such fumble). It matches `matchup-metrics.json` `off.turnoversPerGame`.
- **Takeaways** = the opponent's turnovers committed in the same game; **margin** = takeaways - committed.
- **Sacks**: offense = sacks taken, defense = sacks made (PBP; equals official `sacks_suffered` for every 2026 team-game).

## Independence

The output carries raw descriptive facts only: no JKB spread, total, winner, edge, power rating, Current OVR, Team Performance
Rating, advantage labels, matchup or TD scores, or coaching composites. A test walks every output key to enforce this.

## AI Picks v2 WU2: how the facts enter Stage A

- `loadFreshGameContextPacket` (`nfl-full-game-context-loader.ts`) calls `loadMatchupFormFacts` and stores the result on the
  packet as `teamForm` (`{ home, away, provenance_status }`); the form source files join `provenance.sources`.
- Both providers render the Stage A football-data block through ONE shared function,
  `buildBlindContextSummaryLines` (`nfl-ai-blind-context-lines.ts`), so Grok and ChatGPT receive byte-identical deterministic data.
  Current season, most recent game, recent window (with its ACTUAL sample size) and PRIOR-SEASON BACKGROUND are labeled separately.
- The AI-visible packet is an explicit allowlist (`nfl-ai-context-sanitizer.ts`). Withheld from Stage A: all of `jkbModels`
  (projected spread/total/edge and `powerRating`), all of `players` (yardage projections, `matchupScore`, TD scores),
  `matchup.offenseVsDefense`, the coaching rating/differential/advantage/version and coach ATS records, every
  `*_advantage_team` / `*_differential` label on EPA, YPP and trenches, and `teamMetrics.sos`. Raw home/away values and
  descriptive coach names/W-L records stay. `assertBlindPacketHasNoMarketLeakage` now scans every nesting depth for these keys.
- `footballContextHash` hashes exactly the blind packet Stage A sees (minus `provenance` and `generatedAt`), so no withheld field can
  trigger a Stage A rerun, while a new completed game (a `teamForm` change) does. Existing snapshots' stored context hashes were
  computed under the old identity, so the slate planner will treat them as football-context changes on the next run.
- The Stage A prompt gains only the labeled data block and a short reading guide (samples may be small; weigh recent evidence
  against broader prior information and account for sample uncertainty). The output schema is unchanged.
